# Handover

Paste this into a fresh session. It is deliberately short; everything it points at is in the repository.

---

You are continuing work on `@altpsyche/engine`, a browser graphics package being rebuilt from a
website-coupled renderer into a general one. **Read `CLAUDE.md` first**, then `docs/ROADMAP.md`'s
queue, then §17 of `docs/RoadToPureEngine.md` (the eleven settled decisions).

**Where it stands.** 85 items: 64 done, 12 open, 8 lifted, 1 reverted. Phases 0–4 are complete
and Phase 5's WebGL 2 work has landed — items 46, 47, 48, 50, 77, 78 and 79 are `done`, so the
backend draws several passes, several colour attachments, depth and stencil, vertex geometry of
the shader's own, resident texture content and a mip ladder, and the corpus gate draws through
`createWebGL2Backend` by outcome rather than by construction. The library's folders are the §7
layout (`graph/`, `gpu/`, `resource/`, `pipeline/`, `submit/`, `toy/`, `scene/`, `host/`,
`trace/`) — `renderer/` and `engine/` are gone. Naga carries the whole corpus to GLSL (item 75),
so decision 2 holds.

**The next item is 52, and it is the one that matters: where decision 1 gets its answer.** Its
`Needs` are all `done` as of 2026-08-25, when `item 49` was shed from them — item 49 was lifted
and `lifted` never satisfies a `Needs`, so it had stranded 52 until the shed. Behind it: item 80
(multisample), 81 (the `ShaderSource` union), 83 (WebGL 2 draws the declared topology, a silent
wrong picture today), 84 (attribute arrays leak between passes), 85 (per-draw UBO ranges). Item
82 (`readBuffer` removed) is **not reachable** — its `Needs` are items 67 and 68, both lifted —
and §14's table cannot be fully spent until those are decomposed, which is a real constraint on
1.0 recorded in item 66.

**Start a loop like this.** There is no `/next` in this repository; the loop reads the roadmap.

    bash scripts/run-loop.sh 10 --worktree <name> --cap 45 --items <comma,list>

**Six rules for running it.**

1. **Always `--worktree`.** `main` stays parked and you review a branch, then rebase and
   fast-forward. Verify isolation once per run with
   `readlink /proc/$(pgrep -f run-loop.sh | tail -1)/cwd` — it must be the worktree.
2. **Do not remove a worktree the moment a run reports done.** A session can outlive the
   process that reported completion, and a removed worktree leaves its git commands resolving to
   the main repository — which is how one commit landed on `main` on 2026-08-25 while its branch
   never saw it. Check both: no `.loop/lock` in the worktree, and no `claude -p` process left.
3. **Never put item 53 in `--items`.** It is "wait for a consumer who did not write this" and
   the prompt stops the whole run on it.
4. **A high-numbered urgent item runs last**, because selection is lowest-number-first. Give it
   its own single-item run.
5. **Read the gate's raw output, not its summary.** Every run log has a
   `----- what the gates themselves printed -----` section. `4 of 4` in prose is not a reading.
6. **Do not file a roadmap item while a loop is running.** Item numbers are addresses and are
   never reused, and a loop files its own from the end of *its* copy of the queue, which does not
   contain yours. Two different item 80s were filed 87 seconds apart on 2026-08-25 — the loop's
   multisample item and a reviewer's — and the later claim is the one that had to move. Either
   wait for the run, or file above anything it could reach and say in the item why.

**Review every commit before merging.** The loop's work has been solid; the failures have been
in the queue rather than the code, and most were mine. Six items of mine asked for more than one
thing under a single `Done when` and were correctly stopped or lifted. When a step or a gate
names a cause, verify it against the tree — one gate diagnosis was confidently wrong and the
defect it waved through shipped. Findings from reading go in `docs/JOURNAL.md`, and a row that
names untracked work needs a roadmap item in the same commit.

**Two things only a person can do:** items 31 and 62 need a real graphics card, and item 40
needs a Tint build. None of them blocks the queue.
