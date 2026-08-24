#!/usr/bin/env bash
# One item, one session. An unattended run that never compacts.
#
# Each iteration starts a fresh `claude -p`, which reads CLAUDE.md, docs/ROADMAP.md and the
# decisions in docs/RoadToPureEngine.md, lands exactly one item, commits it, and exits. Nothing
# carries over in context: the handover is the repository, which is why every step has to commit.
#
# `/loop` and `CronCreate` both re-run a prompt inside one session, so context accumulates until
# it is summarised mid-thought and the run starts reading a summary of itself rather than the
# repository. A session per item is the only shape that keeps every iteration reading the tree.
# It is also the whole of the cost control: a session's context is one item's worth, every time,
# rather than growing until it is compacted.
#
# The browser gates cost minutes and the node tests cost about a second, so a step runs the cheap
# ones and one closing session runs the browser batch over everything the run landed. A red batch
# gate names the batch and not the commit inside it, which is the price of gating this way and is
# cheaper than paying four browser gates fifty-eight times. `gate:card` is never run here: every
# headless launch reaches the software renderer whatever the flags say, and that gate's own header
# says so.
#
# NOTHING COLLIDES WHEN SEVERAL RUNS GO AT ONCE.
#   - Every path this script writes is namespaced by the worktree it is running in, so two
#     worktrees never share a log, a lock, a stop file or a start marker.
#   - One run per worktree, enforced by a lock holding the live process id.
#   - `--worktree NAME` is the sanctioned way to run several at once: it makes an isolated
#     worktree on its own branch and re-runs itself there. Separate tree, separate branch,
#     separate everything.
#
# Usage:
#   bash scripts/run-loop.sh                       up to 8 items, then the batch gate
#   bash scripts/run-loop.sh 20                    up to 20 items
#   bash scripts/run-loop.sh 20 --force            start even with a dirty tree
#   bash scripts/run-loop.sh 20 --no-gate          land items, skip the closing batch gate
#   bash scripts/run-loop.sh 20 --cap 25           give one item at most 25 minutes
#   bash scripts/run-loop.sh 20 --items 26,27,28   work only these items
#   bash scripts/run-loop.sh gate                  the batch gate alone, over the last run
#   bash scripts/run-loop.sh 20 --worktree phase3  run in an isolated worktree on branch loop/phase3
#
# Stops when: an item lands no commit, the agent writes the stop file, claude exits non-zero or
# times out, the tree is dirty after a step, or the budget runs out.
#
# Watch it with the line this script prints when it starts. Every run also leaves
# `latest.log` pointing at itself, per worktree.

set -uo pipefail

REPO=$(git rev-parse --show-toplevel 2>/dev/null) || {
    echo "not inside a git repository"
    exit 2
}
cd "$REPO" || exit 2

command -v claude >/dev/null || {
    echo "no claude on PATH"
    exit 2
}

# ---------------------------------------------------------------------------
# Arguments
# ---------------------------------------------------------------------------

MAX=8
GATE_ONLY=""
RUN_GATE=1
FORCE=""
CAP=30
ITEMS=""
WORKTREE=""

if [ "${1:-}" = "gate" ]; then
    GATE_ONLY=1
    MAX=0
    shift
elif [[ "${1:-}" =~ ^[0-9]+$ ]]; then
    MAX="$1"
    shift
fi

while [ $# -gt 0 ]; do
    case "$1" in
    --force) FORCE=1 ;;
    --no-gate) RUN_GATE="" ;;
    --cap)
        CAP="${2:?--cap wants a number of minutes}"
        shift
        ;;
    --items)
        ITEMS="${2:?--items wants a comma separated list, such as 26,27,28}"
        shift
        ;;
    --worktree)
        WORKTREE="${2:?--worktree wants a name}"
        shift
        ;;
    *)
        echo "unknown argument: $1"
        exit 2
        ;;
    esac
    shift
done

# ---------------------------------------------------------------------------
# Isolated worktree mode, which is how several runs go at once
# ---------------------------------------------------------------------------

if [ -n "$WORKTREE" ]; then
    DIR="$(dirname "$REPO")/$(basename "$REPO")-loops/$WORKTREE"
    BRANCH="loop/$WORKTREE"

    if [ ! -d "$DIR" ]; then
        mkdir -p "$(dirname "$DIR")"
        if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
            echo "attaching worktree $DIR to existing branch $BRANCH"
            git worktree add "$DIR" "$BRANCH" || exit 2
        else
            echo "making worktree $DIR on new branch $BRANCH from HEAD"
            git worktree add -b "$BRANCH" "$DIR" HEAD || exit 2
        fi
    fi

    [ -f "$DIR/scripts/run-loop.sh" ] || {
        echo "REFUSING  $DIR has no scripts/run-loop.sh, so this script is not committed yet."
        echo "Commit it on the branch the worktree came from, then try again. A worktree carries"
        echo "what is committed, not what is sitting in your tree."
        exit 2
    }

    ARGS=("$MAX")
    [ -n "$FORCE" ] && ARGS+=(--force)
    [ -z "$RUN_GATE" ] && ARGS+=(--no-gate)
    ARGS+=(--cap "$CAP")
    [ -n "$ITEMS" ] && ARGS+=(--items "$ITEMS")

    echo
    echo "NOTE  two runs on one queue can both take the same item, because nothing here reserves"
    echo "      one. Give each worktree a disjoint --items list, or run them one at a time. The"
    echo "      dependency graph in ROADMAP.md is what makes a bad split obvious: an item whose"
    echo "      Needs are being landed in another worktree is not reachable here."
    echo
    exec bash "$DIR/scripts/run-loop.sh" "${ARGS[@]}"
fi

# ---------------------------------------------------------------------------
# Everything this run writes, namespaced by the worktree it runs in
# ---------------------------------------------------------------------------

# The slug carries the directory name for a reader and a hash of the full path for uniqueness,
# because two worktrees can share a basename and a log they both append to is a log neither can
# be read from.
SLUG="$(basename "$REPO")-$(printf '%s' "$REPO" | cksum | cut -d' ' -f1)"
OUT="${TMPDIR:-/tmp}/altpsyche-loop/$SLUG"
mkdir -p "$OUT"

STATE="$REPO/.loop"
mkdir -p "$STATE"
STOP="$STATE/stop"
MARK="$STATE/start"
LOCK="$STATE/lock"

STAMP=$(date +%Y%m%d-%H%M%S)
LOG="$OUT/run-$STAMP-$$.log"
ln -sfn "$LOG" "$OUT/latest.log"

# ---------------------------------------------------------------------------
# One run per worktree
# ---------------------------------------------------------------------------

# The holder's own process id is written down rather than its command line being matched, because
# anything that merely mentions this script — a shell running it, an editor with it open — matches
# a command line and does not hold the lock.
if [ -f "$LOCK" ]; then
    HOLDER=$(cat "$LOCK" 2>/dev/null)
    if [ -n "$HOLDER" ] && kill -0 "$HOLDER" 2>/dev/null; then
        echo "REFUSING  a run is already going in this worktree, held by process $HOLDER:"
        ps -o pid,etime,args -p "$HOLDER" 2>/dev/null | tail -n +2 | sed 's/^/  /'
        echo
        echo "Two runs in one tree share a start marker and a working tree, so the second would"
        echo "commit beside the first and gate a range it did not land."
        echo "To run another one now, give it its own tree:"
        echo "    bash scripts/run-loop.sh $MAX --worktree second"
        exit 1
    fi
    echo "note: clearing a lock left by process $HOLDER, which is no longer running"
    rm -f "$LOCK"
fi
echo $$ >"$LOCK"
trap 'rm -f "$LOCK"' EXIT

# A dirty tree means the previous session did not finish. Committing on top of work nobody has
# described is how a loop turns one mistake into ten.
if [ -n "$(git status --porcelain)" ] && [ -z "$FORCE" ]; then
    echo "REFUSING  the tree is dirty, so the last run did not finish cleanly:"
    git status --short | sed 's/^/  /'
    echo "Look at it, then commit or discard, or pass --force if you know it is fine."
    exit 1
fi

# Repeated at the command line even though CLAUDE.md carries them, because a run nobody is
# watching is the wrong place to trust one layer. The card gate needs a desktop session and dies
# without one, and `npm publish` is never an unattended run's to call.
REFUSE=(
    --disallowedTools
    "Bash(git push:*)"
    "Bash(npm publish:*)"
    "Bash(npm run gate:card:*)"
    "Bash(node gates/card.mjs:*)"
)

SCOPE=""
if [ -n "$ITEMS" ]; then
    SCOPE="

SCOPE FOR THIS RUN: work only items $ITEMS. Another run may be working the rest in its own
worktree. If none of those items is reachable, write that into the stop file and stop rather
than taking one outside the list."
fi

read -r -d '' STEP_PROMPT <<PROMPT_EOF
Work exactly one item from docs/ROADMAP.md, land it, commit it, then stop. Do not start a second
item and do not ask questions: nobody is at the keyboard.$SCOPE

- Read CLAUDE.md first, then the whole of docs/ROADMAP.md's queue, then §17 of
  docs/RoadToPureEngine.md. Reading the whole queue is not optional: the lowest-numbered
  reachable item is often in a phase you were not in.
- CHOOSE BY NUMBER, NOT BY WHERE IT SITS. Scan the whole queue and take the lowest number that
  qualifies; do not take the first qualifying item you read. The two came apart once — four
  review items numbered 59 to 62 were filed inside Phase 0, a run met 59 before 10 and worked
  it, and the document rather than the rule was at fault. It is ascending order now, with item 1
  in Phase 2 as the only exception, and it is unreachable anyway. If you ever meet a queue that
  is out of order again, the number decides and the deviation is worth a JOURNAL row.
- CHOOSE: the lowest-numbered item whose \`Status\` is \`open\` and every item named in its
  \`Needs\` is \`done\`. \`lifted\` never satisfies a \`Needs\`. If an item's own text says it
  goes alone, it is the whole of this step.
- Follow the decisions of docs/RoadToPureEngine.md §17. They are settled. If the item you are on
  genuinely cannot be done without contradicting one, that is a stop, not a call to take.
- Its \`Done when\` is the definition of done. Satisfy it literally, and if it cannot be
  satisfied, that is a stop rather than a looser reading of it.
- Run \`npm test\` and \`npm run type-check\`, plus \`npm run gate:pack\` if the export surface
  moved. Do NOT run \`npm run gate:browser\`: it costs minutes and runs once over the whole batch
  in a closing session after this run. Never run \`npm run gate:card\`, which needs a desktop
  session and a real graphics card.
- Never quote a number a gate did not produce.
- Set the item's \`Status\` to \`done\` in the same commit as the work.
- Commit it yourself. The message begins \`item N: \` so the history is the index, and it carries
  the measurement the step earned. Never push.
- NAME WHAT THE GATES COULD NOT SEE, one honest line, in the commit message. A green node suite
  over a change only a browser or a card can exercise proves less than it looks like.
- Any call you take on your own goes into docs/JOURNAL.md in the same commit, with how to
  reverse it and what would change the answer. An entry with no reversal recipe has not been
  written. Mark it \`carry\` if the consuming repository's decision log needs it too.
- A JOURNAL.md ROW IS NOT A PLACE TO PARK WORK. If a row names something that still needs doing
  and no item tracks it, add the roadmap item in the same commit and have the row name it. This
  is JOURNAL.md's own rule and it has been missed twice in eight items: item 5's row said the
  Mermaid fence is unchecked, item 6's row said integer uniforms are "unqueued", and both were
  true, well written, and tracked by nothing until a reviewer queued them afterwards. A recorded
  doubt nobody queued is a doubt nobody will act on, which is the failure the register exists to
  prevent rather than a smaller version of it.
- Also write a JOURNAL.md row whenever: something could not be verified on this machine; you
  accepted a risk, widened a bar, or left a number nobody has looked at; a gate passed for a
  reason that does not prove what the item claims; you changed something the cheap gates are
  blind to; or you were unsure and proceeded anyway. Say what would settle it.
- IF THE ITEM NEEDS WHAT THIS MACHINE HAS NOT GOT — a real graphics card, a phone, a deployed
  address, an answer nobody has given — LIFT IT OUT AND CARRY ON. Set its \`Status\` to
  \`lifted <where it went>\`, say in the item what would settle it and how you established that
  nothing here can, add a JOURNAL.md row, commit that, and then take the next reachable item. A
  blocked item left in the middle of a queue halts everything behind it, which cost this project
  seven steps of a run on 2026-08-22. What you must not do is write a desktop reading into an
  item only other hardware can settle, or pick an item out of order to look busy.
- IF THE ITEM SAYS IT IS NOT AN UNATTENDED RUN'S — item 53 says exactly that — do not lift it
  out and do not work it. Write which item and why into the stop file and stop, committing
  nothing. Work waiting on a person by design is correctly sequenced, not misplaced.
- If no item in the queue is reachable, write that into the stop file and stop.
- The stop file is \`.loop/stop\`. One line naming the blocker.
PROMPT_EOF

read -r -d '' GATE_PROMPT <<'PROMPT_EOF'
Run the browser batch gate over every commit this run landed, which is the range in .loop/start
to HEAD, and report what it found. Do not start new work and do not fix anything beyond a
baseline that legitimately moved.

- Run it as `npm run gate:browser 2>&1 | tee .loop/gate-raw.log`, which is browser-pin, corpus,
  trace-contract and surface, in that order. The pin comes first because every gate under it
  compares against a reading taken earlier, and a browser that moved without a commit makes those
  comparisons mean something else.
- THE `tee` IS NOT OPTIONAL. Your summary of a gate is not evidence: a reviewer who cannot read
  the gate's own output has only your word for the numbers in it, and the rule here is that
  nobody quotes a number a gate did not produce. The raw file is what the run keeps. If you run
  a gate individually as well, append rather than overwrite: `2>&1 | tee -a .loop/gate-raw.log`.
- Run them ONE AT A TIME if you run them individually. Several browser gates at once starve each
  other under the software renderer and time out, which reads as a red gate and is not one.
- Do NOT run `npm run gate:card`. It needs a desktop session and a real graphics card, every
  headless launch reaches the software renderer whatever the flags say, and a run nobody is
  watching cannot give it either.
- A red gate names the batch rather than the commit inside it. If one goes red, re-run that one
  gate to see whether it repeats, then write what it read and which commits are in the batch into
  `.loop/stop`. Do not guess which commit made it red and do not revert on a guess.
- Add a docs/JOURNAL.md row for anything the batch could not settle, and commit that alone.
  Otherwise commit nothing.
PROMPT_EOF

# ---------------------------------------------------------------------------
# The run
# ---------------------------------------------------------------------------

if [ -z "$GATE_ONLY" ]; then
    git rev-parse HEAD >"$MARK"
    rm -f "$STOP"
    echo "loop starting in $REPO"
    echo "  up to $MAX items, $CAP minutes each at most"
    [ -n "$ITEMS" ] && echo "  scoped to items $ITEMS"
    echo "  watch it with: tail -f $OUT/latest.log"
    date >>"$LOG"

    for ((step = 1; step <= MAX; step++)); do
        BEFORE=$(git rev-parse HEAD)
        printf '\n===== step %d/%d, HEAD %s =====\n' "$step" "$MAX" "${BEFORE:0:8}" | tee -a "$LOG"

        # A cap rather than no cap, because one item that never finishes costs a whole night of
        # budget and lands nothing. A killed step is reported as one rather than read as a step
        # that chose not to commit.
        timeout --foreground "${CAP}m" \
            claude -p "$STEP_PROMPT" --permission-mode auto "${REFUSE[@]}" >>"$LOG" 2>&1
        CLAUDE_EXIT=$?

        AFTER=$(git rev-parse HEAD)

        if [ -f "$STOP" ]; then
            echo "stopped by the agent: $(cat "$STOP")" | tee -a "$LOG"
            break
        fi

        if [ "$CLAUDE_EXIT" -eq 124 ]; then
            echo "the step ran past its $CAP minute cap and was killed, so nothing here is trusted." | tee -a "$LOG"
            echo "Look at the tail of $LOG before starting another run." | tee -a "$LOG"
            break
        fi

        if [ "$CLAUDE_EXIT" -ne 0 ]; then
            echo "claude exited $CLAUDE_EXIT, stopping. Tail of the log:" | tee -a "$LOG"
            tail -20 "$LOG"
            break
        fi

        if [ "$BEFORE" = "$AFTER" ]; then
            echo "no commit landed, so the step did not finish. Stopping rather than spinning." | tee -a "$LOG"
            tail -30 "$LOG"
            break
        fi

        echo "landed: $(git log --oneline -1)" | tee -a "$LOG"

        if [ -n "$(git status --porcelain)" ]; then
            echo "note: the tree is dirty after this step, so the next run will refuse until you look" | tee -a "$LOG"
            git status --short | sed 's/^/  /' | tee -a "$LOG"
            break
        fi
    done
fi

# ---------------------------------------------------------------------------
# The closing batch gate
# ---------------------------------------------------------------------------

START_HEAD=$(cat "$MARK" 2>/dev/null)

if [ -z "$START_HEAD" ]; then
    echo "no start mark, so there is no batch to gate"
    exit 0
fi

if [ "$START_HEAD" = "$(git rev-parse HEAD)" ]; then
    echo
    echo "nothing landed, so there is no batch to gate"
    exit 0
fi

echo
echo "items landed:"
git log --oneline "$START_HEAD"..HEAD | sed 's/^/  /'

# A step that stopped the run leaves its reason in the stop file, and the gate still has to run
# over what did land. Clearing it first is what makes the file mean the gate's own verdict
# afterwards rather than the step's. The reason survives in the roadmap item the step committed.
STEP_STOP=""
if [ -f "$STOP" ]; then
    STEP_STOP=$(cat "$STOP")
    rm -f "$STOP"
fi

GATE_EXIT=0
if [ -n "$RUN_GATE" ]; then
    echo
    printf '===== batch gate over %s..HEAD =====\n' "${START_HEAD:0:8}" | tee -a "$LOG"
    rm -f "$STATE/gate-raw.log"
    timeout --foreground 60m \
        claude -p "$GATE_PROMPT" --permission-mode auto "${REFUSE[@]}" >>"$LOG" 2>&1
    GATE_EXIT=$?

    # The gate's own output, not the session's account of it. Without this the log carries only
    # prose about the numbers and a reviewer has to take the session's word for them, which is
    # the one thing this project does not do with a measurement.
    if [ -s "$STATE/gate-raw.log" ]; then
        printf '\n----- what the gates themselves printed -----\n' >>"$LOG"
        cat "$STATE/gate-raw.log" >>"$LOG"
    else
        printf '\n----- NO RAW GATE OUTPUT WAS KEPT -----\n' >>"$LOG"
        echo "The gate session left no .loop/gate-raw.log, so every number it reported is" >>"$LOG"
        echo "unverifiable from this log. Treat the batch as unread rather than as green." >>"$LOG"
        echo
        echo "WARNING  the gate session kept no raw output, so its report cannot be checked."
        echo "         Treat this batch as unread. Re-run: bash scripts/run-loop.sh gate"
    fi
else
    echo
    echo "batch gate skipped, so nothing here has been through a browser. Run it with:"
    echo "    bash scripts/run-loop.sh gate"
fi

echo
if [ -n "$STEP_STOP" ]; then
    echo "a step stopped the run: $STEP_STOP"
fi
if [ -n "$RUN_GATE" ]; then
    if [ -f "$STOP" ]; then
        echo "the gate stopped on: $(cat "$STOP")"
    elif [ "$GATE_EXIT" -eq 124 ]; then
        echo "the gate ran past an hour and was killed, so the batch is not green, it is unread"
    elif [ "$GATE_EXIT" -ne 0 ]; then
        echo "the gate session exited $GATE_EXIT, so read the log before believing the batch is green"
    else
        echo "batch gate finished"
    fi
fi
echo "run finished at $(git log --oneline -1)"
echo "log: $LOG"
