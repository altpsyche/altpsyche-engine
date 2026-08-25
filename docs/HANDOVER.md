# Handover

Paste this into a fresh session. It is deliberately short; everything it points at is in the repository.

---

You are continuing work on `@altpsyche/engine`, a browser graphics package being rebuilt from a
website-coupled renderer into a general one. **Read `CLAUDE.md` first**, then `docs/ROADMAP.md`'s
queue, then §17 of `docs/RoadToPureEngine.md` (the eleven settled decisions).

**Where it stands.** 79 items: about 60 done, 13 open, 6 lifted, 1 reverted. Phases 0–4 are
complete and Phase 5 is most of the way. The library's folders are the §7 layout (`graph/`,
`gpu/`, `resource/`, `pipeline/`, `submit/`, `toy/`, `scene/`, `host/`, `trace/`) — `renderer/`
and `engine/` are gone. Naga carries the whole corpus to GLSL (item 75), so decision 2 holds.
The open front is the WebGL 2 backend growing past fullscreen-only: items 77, 78, 79, then 48,
49, 50, and **52, which is where decision 1 gets its answer**.

**Start a loop like this.** There is no `/next` in this repository; the loop reads the roadmap.

    bash scripts/run-loop.sh 10 --worktree <name> --cap 45 --items <comma,list>

**Four rules for running it.**

1. **Always `--worktree`.** `main` stays parked and you review a branch, then rebase and
   fast-forward. Verify isolation once per run with
   `readlink /proc/$(pgrep -f run-loop.sh | tail -1)/cwd` — it must be the worktree.
2. **Never put item 53 in `--items`.** It is "wait for a consumer who did not write this" and
   the prompt stops the whole run on it.
3. **A high-numbered urgent item runs last**, because selection is lowest-number-first. Give it
   its own single-item run.
4. **Read the gate's raw output, not its summary.** Every run log has a
   `----- what the gates themselves printed -----` section. `4 of 4` in prose is not a reading.

**Review every commit before merging.** The loop's work has been solid; the failures have been
in the queue rather than the code, and most were mine. Six items of mine asked for more than one
thing under a single `Done when` and were correctly stopped or lifted. When a step or a gate
names a cause, verify it against the tree — one gate diagnosis was confidently wrong and the
defect it waved through shipped. Findings from reading go in `docs/JOURNAL.md`, and a row that
names untracked work needs a roadmap item in the same commit.

**Two things only a person can do:** items 31 and 62 need a real graphics card, and item 40
needs a Tint build. None of them blocks the queue.
