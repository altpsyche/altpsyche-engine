# Roadmap

**This file is the plan and the handover for this repository.** Nothing else queues work here: if an item is not below, nobody is tracking it.

The library ships from `main` as `@altpsyche/engine`. The site that consumes it keeps its own roadmap, and the two are separate on purpose — a change is filed where the code it touches lives, which is [D106](https://github.com/altpsyche/altpsyche-dev/blob/master/docs/DECISIONS.md) in that repository's log. Design decisions about the renderer are recorded there as well, because that is where the log is; this file queues work and does not decide anything.

**Started on 2026-08-24** with one item, which arrived from the site's roadmap because the code it asks for is here and could never be worked from there.

---

## 1. Discarding an attachment nothing reads, and merging two passes over one

**Where it came from.** It was item 40's step 1.4 in the site's roadmap, lifted out of that item on 2026-08-22 because a blocked step in the middle of an ordered list halts every reachable step behind it, and it did: an unattended run stopped on it with seven reachable steps still in front of it. It became item 42 there and moved here on 2026-08-24, as D118 in that repository's log, because the renderer left that tree and an item filed where nobody can work it reads as available.

**What it asks for.** An attachment nothing reads later is discarded instead of written out, and two passes over one attachment merge where their work allows.

**The block is the measurement rather than the code, and that was established by reading what the step touches.** The saving is bandwidth a tiling mobile GPU pays and an immediate-mode desktop card does not, so no reading taken on a desktop can see it. `storeOp` is a field on an attachment rather than a call, so `store` to `discard` moves no count the recording device counts, and the trace agrees either way at unmoved call counts. An artefact gate shows identical pixels by construction, since a discard is only correct where nothing reads the attachment afterwards. A phone-shaped WebGPU surface loses its device under the software renderer, and the real card is immediate-mode and hides the cost by the step's own words.

**So the code is writable and provably inert, and that is not the finding.** An inertness proof says the change broke nothing; the step exists to show the change saves something. The pass-merge half is surgery whose only payoff and only regression signal both live on a tiler.

**What would settle it.** The site's three shader routes on a real phone, before and after, on a deployed address. That reading belongs to whoever has the phone, and it is a row of the site repository's `docs/TESTING.md`.

**Not a reason to skip the code.** Writing it and proving it inert is a legitimate commit if the payoff is measured later. What is not legitimate is quoting a desktop reading as evidence the step did what it is for.

**Blocked on a phone, and it is the only thing blocking it.**
