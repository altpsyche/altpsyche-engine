# Roadmap

**This file is the plan and the handover for this repository.** Nothing else queues work here: if an item is not below, nobody is tracking it.

The library ships from `main` as `@altpsyche/engine`. The site that consumes it keeps its own roadmap, and the two are separate on purpose — a change is filed where the code it touches lives, which is [D106](https://github.com/altpsyche/altpsyche-dev/blob/master/docs/DECISIONS.md) in that repository's log. Design decisions about the renderer are recorded there as well, because that is where the log is; this file queues work and does not decide anything.

**Started on 2026-08-24** with one item, which arrived from the site's roadmap because the code it asks for is here and could never be worked from there.

**Direction for this repository is [RoadToPureEngine.md](RoadToPureEngine.md).** That document decides nothing this file queues, and this file queues nothing that document decides; where an item below names a stage, the stage is defined there.

**Filled out on 2026-08-24** with the whole of that document's road, as fifty-eight items in seven phases. **Items 59 to 62 were added on 2026-08-24** by the reviews of the first two unattended runs, which is where an item found by reading landed work belongs.

---

## How to read this

**A phase here is a stage there.** Phase N is Stage N of [RoadToPureEngine.md](RoadToPureEngine.md) §15, with the same number and the same exit criterion. There is deliberately no second numbering scheme: a plan with two sets of numbers for one thing is a plan whose two halves drift.

**An item number is an address, and the queue reads in ascending numeric order.** Numbers are assigned once and never reused or renumbered, because they are cited from outside this repository — item 1 is cited as this repository's item 1 in the consuming log's D118.

**Item 1 is the one place those two disagree**, and it is worth knowing why the exception is safe: it sits in Phase 2 because that is where its dependency puts it, so a reader going top to bottom meets item 2 first. It is unreachable until item 21 lands, so the disagreement can never change which item is chosen. **No new item may be filed out of numeric order** — see "Found by review" at the end, which is where an item added later goes.

**Done when is the only definition of done.** Every item below carries one, and it is written so a person who did not do the work can check it. An item with no observable finish is an item that is never finished.

**Needs names the items that must land first.** Where it says nothing, nothing blocks it.

**Ordering inside a phase is a suggestion; the dependency graph is not.** Two items in one phase with no dependency between them may land in either order or at once.

**Status is one of three words**, and whoever lands an item maintains it in the same commit:

| status | means |
| --- | --- |
| `open` | not landed |
| `done` | landed |
| `lifted <where>` | it cannot be finished on this machine, and this says where it went |
| `reverted` | it landed and was then taken back out, and the item says why. Kept rather than deleted, because an item that was a mistake is worth more as a record than as a gap in the numbering |

**An item is reachable when every item its `Needs` names is `done`.** That is the only rule for choosing what to work, and the lowest-numbered reachable item wins. `lifted` never satisfies a `Needs`: an item waiting on lifted work is not reachable, and saying otherwise is how a run builds on something that was never landed.

**A commit that lands an item begins `item N: `.** That is what makes the history the index — `git log --oneline --grep '^item 27'` finds what landed item 27 — so the status line stays three words instead of carrying a hash that a rebase would falsify.

---

## Phase 0 — stop the bleeding, and give the phase an outward face

Days, no architecture. Implements decisions 6, 8 and 11.

*Exit:* no known silent-wrong-output path; no document naming a file outside this repository; a consumer's own GLSL fragment document draws, and it reaches WebGL 2 by selection rather than by being named.

### 2. The program cache key

**Status.** done

**Asks for.** A key that contains everything the cached program depends on — resources, pipelines and passes as well as id and module text — or a key the caller supplies outright.

**Done when.** A test builds two frames carrying equal `id` and equal module text but different resources, asks for a program for each, and gets two distinct programs. The commit contains this and nothing else.

**Needs.** Nothing. **This is the first commit of the whole road and it goes alone.** It is a silent wrong picture, per [RoadToPureEngine.md](RoadToPureEngine.md) §3 row 2, and bundling it with anything makes it unreviewable and delays it behind whatever it was bundled with.

### 3. `DocumentAddress` becomes a string

**Status.** done

**Asks for.** The three-value union goes; fetched text is keyed by the name a description gives a document rather than by its address.

**Done when.** A description naming two distinct WGSL documents assembles into a frame and draws, and a test asserts both documents' text arrives intact.

**Needs.** Nothing.

### 4. The README says what is true

**Status.** done

**Asks for.** Three corrections. WebGL 2 covers one fullscreen pass today, not the scene tier. 0.x is unstable. §14 of the road document is the shape the surface is moving toward.

**Done when.** All three sentences are in the README, and `tests/readme-names.test.ts` is still green.

**Needs.** Nothing.

### 5. The design documents stop naming files that left

**Status.** done

**Asks for.** `ABSTRACTION.md` and `RENDERER-DESIGN.md` lose every path that does not exist here, each `Dnnn` reference gains a sentence saying what it settled, and the stale audit rows are marked solved.

**Done when.** A script walks every backtick-quoted and link-quoted path in `docs/` and finds no missing file, and it runs in the gate suite so the next stale path is caught rather than noticed.

**Needs.** Nothing.

### 6. A Shadertoy producer, which was a mistake

**Status.** reverted

**What it asked for, and what landed.** A producer that took an unmodified Shadertoy fragment source, wrapped it in that site's own uniform declarations — `iTime`, `iTimeDelta`, `iFrame`, `iResolution`, `iMouse` — and the `main` that calls `mainImage`. It landed, drew, and was removed the same day.

**Why it was removed.** It froze another product's naming conventions into this package's public door. That is the same defect as being shaped around the website this library was extracted from, with a different owner, and it is the defect the goal in [CLAUDE.md](../CLAUDE.md) exists to prevent: *where an argument for a design amounts to "some consumer needs it", throw the argument out and look for a reason that stands on the package's own merits.* There is no such reason here. A general engine takes a GLSL fragment document; a consumer who wants a particular set of uniform names writes eight lines to supply them, which is what `examples/glsl-fragment` now shows.

**How it got in, recorded because the mechanism matters more than the item.** It was volunteered rather than asked for — the question on the table was whether a consumer may hand the library GLSL, which is decision 6 and is a real capability that stands on its own. The producer was added on top of that answer as an adoption argument, then justified a second time on the grounds that Phase 0 otherwise had no outward-facing deliverable. That second reason is demo-driven design, which is exactly what decision 10's guardrail forbids, and it was written two items after that guardrail.

**What stays.** GLSL-in stays, and so does item 8's `selectBackend`, which routes a GLSL-authored frame to WebGL 2 even where WebGPU exists. That is the general mechanism and it is untouched by this removal. Item 61 also stays: it was found through this producer but it is a real limitation of the WebGL 2 backend that any consumer's GLSL can hit.

**Reverse it, if it should come back.** `git show 1d04410` carries the producer, its test, and its door export whole; `git show 2f791a9` carries the example that used it. Bringing it back means answering the question above, which is why it stands on the package's merits rather than on any consumer's.

### 7. `examples/` begins

**Status.** done

**Asks for.** The directory, a way to run one, and the first two: `fullscreen` and a consumer-authored GLSL fragment.

**Done when.** `npm run example <name>` opens either one, and each imports the package door and nothing else — no relative reach into a folder.

**Needs.** item 6 for the second one.

### 8. `selectBackend`

**Status.** done

**Asks for.** Backend choice moves inside the library: which backend draws a given frame is answered from what the frame is authored in and what it declares it needs, across whatever the device offers.

**Done when.** A GLSL-authored frame picks WebGL 2 **on a machine that has WebGPU**; a WGSL frame picks WebGPU where an adapter actually returns one; and a refusal appears only when no backend is left, naming what was missing. A test covers all three.

**Needs.** Nothing.

**Note.** Selection before refusal, per §10. A consumer arriving with a GLSL shader gets a picture, not a lecture.

### 9. `probe()`, and readings rather than a matrix

**Status.** done

**Asks for.** A public one-shot reading — which backend was selected, whether WebGPU was reported, whether an adapter was returned, **whether the device then survived a few frames of on-screen compositing**, the renderer string, an assertion that the adapter architecture is not `swiftshader`, features, limits, tier run. Plus `docs/DEVICES.md` and `npm run device-report`.

**Done when.** `probe()` returns all of those fields; `DEVICES.md` exists carrying the two readings already taken, dated, with the explicit line that absence is not a claim of non-support; and `device-report` prints a row a stranger can paste into a pull request.

**Needs.** Nothing. `report()` already gathers most of it and has never had a caller.

**Note.** Three states, not two: an adapter that came back and then died in under a second is a success by any two-state reading. See decision 11 and the measured case beside it.

---

## Phase 1 — the split

The one piece of real surgery. Implements the three lifetimes of §5. **Adds no features.**

*Exit:* `createProgram` is gone; the twelve trace presets still agree; not one gate edited.

### 10. The arena, and branded handles

**Status.** done

**Asks for.** `resource/` with allocation, upload, resize and free, addressing everything by branded integer handle, and a free list that bumps a generation so a stale handle is detectable rather than silently valid.

**Done when.** Every resource the current backend allocates is allocated through the arena, and a handle freed and reallocated does not compare equal to its predecessor.

**Needs.** Nothing.

### 11. Uploads are queued, not immediate

**Status.** done

**Asks for.** An upload path ordered against the frame that reads it, replacing the current unsequenced destroy-and-recreate on resize.

**Done when.** A test resizes and draws in the same tick and the double sees the writes land before the draw that reads them.

**Needs.** item 10.

### 12. The pipeline cache, keyed on structure

**Status.** done

**Asks for.** `pipeline/` owning module compilation and a cache keyed on the whole structure a pipeline depends on — source, entry points, formats, blend, depth, vertex layout.

**Done when.** Two requests with identical structure return one handle, two with any difference return two, and item 2's narrower fix is deleted as superseded rather than left beside it.

**Needs.** item 2, item 10.

### 13. `submit/`

**Status.** done

**Asks for.** The executor: a graph plus the arena plus the pipeline cache become commands on a device.

**Done when.** Every draw in the existing suite goes through it.

**Needs.** item 10, item 12.

### 14. The seam for today's descriptions

**Status.** done

**Asks for.** A `FrameDescription` translated to the new path at one place, so nothing above has to move in this phase.

**Done when.** Every existing test and gate passes **unedited**. An edited gate in this phase is the signal that the phase is doing two things.

**Needs.** item 13.

### 15. `createProgram` is deleted

**Status.** done

**Asks for.** The function that fused three lifetimes goes.

**Done when.** It is absent from the tree, and the twelve trace presets still agree.

**Needs.** item 14.

**How it landed.** The backend method `createProgram(frame)` is gone; both backends
expose `program(frame)` instead, a composer that reaches each lifetime through its
own module rather than building all three inline. The static lifetime now flows
through `pipeline/`'s `PipelineCache` — `renderer/webgpu.ts`'s `buildPipelines` and
`renderer/webgl2.ts`'s link both request their pipeline through it, keyed by
`pipelineStructureOf`, so no method both compiles a pipeline and allocates a buffer.
Resident stays the arena's (item 10) and per-frame the executor's (item 13). The
cache is scoped to one program so its pipelines are released when the renderer's LRU
lets the program go, which keeps the editing path from growing card memory without
bound; cross-program pipeline reuse waits on item 63. The only tokens named
`createProgram` left in the tree are the WebGL API's own `gl.createProgram` and its
fake. The twelve trace presets are `gate:browser`'s to confirm and were not run in
the unattended session; behaviour is preserved by construction (the cache is a
per-program pass-through, every device call unchanged), see [JOURNAL.md](JOURNAL.md).

---

## Phase 2 — handles, transients, validation, and the cost metric

Implements decision 9 and unblocks item 1.

*Exit:* no resource resolved by string at draw time; one home per rule; a use-after-free fails a test; every preset asserts an exact `cost()`.

### 16. Strings become handles at every call site

**Status.** done

**Done when.** No resource is looked up by string in a map at draw time anywhere in the backend, and misuse is a type error rather than a map miss.

**Needs.** item 10, item 13.

**How it landed.** The WebGPU executor `submit/execute.ts` no longer holds the
name-keyed maps it looked a resource up in every frame — `pipelines`, `bound`,
`buffers`, `textures`, `times`, `counting` are gone from `FrameExecution`. It now
reads a `ResolvedRun[]`, one entry per pass, carrying the pipeline, the bind
groups, the attachment textures and the query sets **as the typed objects
themselves**; the frame loop does zero `Map.get`. The backend resolves each name
once — in `resolveTurns()`, run at build, at a resize, and at a pass change,
exactly where the render bundles were already rebuilt — and hands the resolved,
already-turned list to the executor, so the swap is resolved out too. `issueDraw`
moved into `submit/execute.ts` as a pure function taking the geometry buffers
resolved rather than looked up, and the WebGL 2 executor already took concrete
objects, so both backends' draw paths are name-free. Misuse is a type error at the
executor seam rather than a map miss: passing the wrong object is a compile error,
where a name miss was `Map.get(...) === undefined`. The compute-dispatch block
counts, which used to be worked out every frame from the frame size, are worked
out in `resolveTurns()` and re-resolved on any size change, so a resize between two
draws still lands the counts the new size implies (a new `renderer-compute` case,
"recounts its blocks against the new size after a resize between draws"). The twelve trace presets are
`gate:browser`'s to confirm and were not run in the unattended session; the device
calls are unchanged by construction (the resolution moves *where* an object is
found, not *which* object or *what call* is made), see [JOURNAL.md](JOURNAL.md).

### 17. `Ref` gains its two arms

**Status.** done

**Asks for.** Resident and transient, per §8: a resident resource is arena-allocated and lives across frames, a transient is declared in the graph by descriptor.

**Done when.** A graph can declare a transient depth target and a resident mesh buffer in one frame, and each resolves correctly.

**Needs.** item 16.

**How it landed.** `graph/` begins, holding the pure authoring contract of §8:
`graph/handles.ts` mints the kind-branded `Handle<K>` and the arms `Ref` needs
(`BufferHandle`, `TextureHandle`, `TransientId`), and `graph/refs.ts` holds
`Ref<H> = { resident: H } | { transient: TransientId }`, the `Transient`
descriptor (a texture or buffer the graph declares by descriptor rather than by
arena handle), and the `isResident`/`isTransient` guards. Both import nothing but
each other (§7 rule 1) and neither is re-exported through the door, so the export
surface did not move. Resolution lives in `submit/frame-resources.ts`'s
`FrameResources`, because a resident ref resolves through the arena (`resource/`)
and a transient ref is allocated by the executor (`submit/`): a resident ref
reaches `arena.resolve`, a transient ref allocates from the descriptor the graph
declared it under, once per frame and cached against its id. `make` is injected
rather than reaching a device, so a graph declaring a transient depth target and
a resident mesh buffer resolves each with no card present, which
`tests/graph-refs.test.ts` exercises. **Scope:** the backends do not yet consume
`Ref` — they still resolve names, per item 16's seam — and cross-frame transient
pooling is item 18; this item is the two arms and their resolution, nothing above
adopting them. The authoring handle and the arena's runtime handle are the same
integer under two brands and meet at one documented cast in `FrameResources`,
which unifies in Stage 2 (item 16's [JOURNAL.md](JOURNAL.md) row); see that file.

### 18. Transient pooling and aliasing

**Status.** done

**Done when.** Two graphs asking for the same transient shape reuse one allocation, and a test shows the second frame allocates nothing new.

**Needs.** item 17.

**How it landed.** `submit/transient-pool.ts` holds `TransientPool`, an object
that outlives the frame — item 17 threw a transient's allocation away when the
frame ended, and this is where a resource survives from one frame to the next.
`FrameResources` no longer holds the injected `make`; it borrows from the pool
(`acquire`) and, at a new `recycle()`, hands its transients back (`release`).
The pool holds only the resources no frame currently holds, binned by a
`shapeKey(descriptor)` that keys two descriptors together exactly when they name
one resource — sorted `use`, defaulted optionals, size/format/samples/mips for a
texture, bytes/access for a buffer. So a second frame asking for a shape a first
frame released acquires that resource rather than making one, which
`tests/graph-refs.test.ts` shows by a counting maker whose call count does not
move on the second frame. **Aliasing is the safe form:** two shape-identical
transients live in one frame acquire two distinct resources (the second finds
the pool empty of that shape), so reuse only ever happens across the time a
shape is free — frame N's depth target becomes frame N+1's, aliased along the
time axis. Aliasing two *distinct* transients of one shape *within* a frame,
where their passes never overlap, needs per-pass lifetimes `FrameResources` does
not yet carry (the backends do not consume `Ref` until they resolve passes,
item 17's scope), and is a strict refinement that changes no caller — a
within-frame release is the same `release` this exposes. The pool is not
re-exported through the door, so the export surface did not move; the backends do
not consume it yet (same seam as item 17), so no `gate:browser` preset draws a
transient through it. See [JOURNAL.md](JOURNAL.md).

### 19. `validate(graph)`

**Status.** done

**Asks for.** One pure function holding every rule currently written in two wordings, the since-deleted renderer/frame-rules.ts included.

**Done when.** No rule about a graph is checked in two places; frame-rules.ts is absorbed and deleted; the function takes the graph alone and touches no device.

**Needs.** item 17.

**How it landed.** [renderer/validate.ts](../renderer/validate.ts) holds `validate(graph: ShaderFrame): void`,
device-free, taking the graph alone. It owns the three rules that were written in two
wordings each — a build wording in `fixtures/shader-describe.ts` and a runtime wording
in the backend: the storage-buffer whole-words rule (which was frame-rules.ts's
`assertWholeWords`), the query-buffer rules (a resolve that overruns its buffer, and
two queries sharing one buffer — frame-rules.ts's `TIMED_QUERY_BYTES`/
`VISIBLE_QUERY_BYTES` moved in as private constants), and the depth/stencil
format-consistency rules (each half a pipeline names must be a half its format keeps).
The renderer/frame-rules.ts file is absorbed and deleted, and its `export *` line is gone from
`index.ts` — the byte widths and the whole-words check are no longer a producer's to
call. The single home is reached on every path: `submit/plan.ts`'s `planFramePasses`
calls `validate` first (covering the WebGPU program build, a runtime pass change, and
the description seam), and `renderer/webgl2.ts`'s `program` calls it directly, since the
WebGL 2 path does not reach `planFramePasses` — a no-op for its fullscreen GLSL frames.
The duplicate copies are gone: `plan.ts`'s `depthOf` no longer restates the four
format-kind throws, `webgpu.ts` no longer re-checks whole-words or query size (it keeps
only which buffers are query targets, a usage fact rather than a rule), and the build
fixture keeps its source-against-declaration checks and the one-home "no depth format at
all" refusal while dropping the four format-kind, whole-words and query-size checks.
Coverage for the moved rules now lives at the runtime home — the whole-words and query
rules in [tests/renderer-buffer.test.ts](../tests/renderer-buffer.test.ts) and
[tests/renderer-queries.test.ts](../tests/renderer-queries.test.ts), the depth rules in
[tests/renderer-stencil.test.ts](../tests/renderer-stencil.test.ts) and
[tests/renderer-depth.test.ts](../tests/renderer-depth.test.ts); the six obsolete build
tests in `tests/shader-describe.test.ts` were removed, each with a pointer to where its
rule is now checked. See [JOURNAL.md](JOURNAL.md).

### 20. The double tracks handle liveness

**Status.** done

**Asks for.** The recording double models lifetimes as well as calls, which ABSTRACTION.md's audit named as a gap.

**Done when.** A use-after-free and a leak each fail a test in the fast suite.

**Needs.** item 10.

**How it landed.** [renderer/trace.ts](../renderer/trace.ts) gains `Lifetimes`, a
ledger `wrapDevice` writes resource births and deaths into. Every buffer, texture
and query set the recorder hands back is registered (`born`) at creation and marked
freed (`died`) when its `destroy` wrapper runs. The liveness check sits in the one
funnel every wrapper passes through on its way back to the device — `unwrap` — plus
`createView`, the one path a texture is reached by that skips `unwrap`; so a freed
resource bound to a pass, written to, copied from or viewed is refused by name as it
happens, which is the use-after-free the fast suite was blind to. `leaked()` names
every resource born and not yet freed, so a resource allocated and never given back
is a leak read at a teardown. It is the arena's liveness (item 10) carried into the
device double: the arena refuses a stale handle, this refuses a stale wrapper. The
ledger is **opt-in** — `wrapDevice`'s third argument — so `lifeOf` stays empty and
`assertLive` is one `WeakMap` miss for any caller that passes none; the fast suite's
`tests/support/fake-gpu.ts` passes one (exposed as `gpu.lifetimes`), the browser
gate's `wrapDevice` does not, so it neither gains the checks nor changes a recorded
trace. No `record()` call moved, so the trace contract compares the same calls it
did. Coverage is [tests/renderer-lifetime.test.ts](../tests/renderer-lifetime.test.ts):
a buffer used and bound after destroy, a texture viewed after destroy, a leak named,
a drained ledger empty, a double free harmless. The export surface moved (`Lifetimes`
is exported through the door, 48 names now where there were 47); `gate:pack` green.
`gate:browser` was not run in the unattended session — but the ledger it would
exercise is off on that path by construction, see [JOURNAL.md](JOURNAL.md).

### 21. `cost(graph, size)`

**Status.** done

**Asks for.** Passes, draws, dispatches, pipeline switches, bind switches, attachment loads and stores, transient bytes. Pure, deterministic, no GPU.

**Done when.** It takes the graph and a `{ width, height }` record and nothing else — no device, no arena, nothing carrying behaviour — and returns identical numbers on any machine.

**Needs.** item 17.

**How it landed.** [renderer/cost.ts](../renderer/cost.ts) holds `cost(graph, size): FrameCost`,
the third pure function beside `validate` and (still-open) `refusal`, taking the
graph and a `{ width, height }` record and touching no device, arena or cache. The
eight fields decision 9 lists: `passes` (every pass), `draws` (one per render pass,
an instanced or indirect draw counted as one per item 28), `dispatches` (one per
compute pass), `pipelineSwitches` (a pass whose pipeline differs from the one
before, the first counting as a bind from nothing), `bindSwitches` (a pass whose
bound resources — group, binding, resource name, read kind — differ from the pass
before, so two pipelines binding one set are one bind even across a pipeline
switch), `attachmentLoads`/`attachmentStores`, and `transientBytes`. The load/store
accounting mirrors `submit/execute.ts` call for call: a colour or depth attachment
loads only where it is given no clear (`loadOp: 'load'` there), every attachment
stores (`storeOp: 'store'` there — item 1 is what makes a store discardable), a
multisample resolve is one more store, and a depth-stencil attachment keeping both
halves is two loads-or-clears and two stores because the card takes an op per half.
`transientBytes` sums every texture or buffer the frame declares with no first
contents of its own (no `source`, no `data`) — a scratch target, an attachment, a
compute output, a query buffer — resolved at the given size, so a frame-sized
attachment follows the window; uploaded bytes stay out of it, being
`arena.traffic()`'s (item 22). The export surface moved (`cost`, `FrameCost` through
the door; `gate:pack` green) and [tests/cost.test.ts](../tests/cost.test.ts)
asserts each field on hand-built frames. **Two calls nobody's gate can see** — the
nominal byte widths for depth formats and the four-byte default for a format not in
the table — are in [JOURNAL.md](JOURNAL.md); the corpus's exact per-preset costs are
item 23's, not asserted here.

### 22. `arena.traffic()`

**Status.** done

**Asks for.** Bytes written and uploaded, read from the arena, because that is a resident-lifetime fact the graph does not carry.

**Done when.** It reports since-last-reset totals, and the benchmark reports it **beside** `cost()` and never summed with it.

**Needs.** item 10, item 21.

**How it landed.** [resource/arena.ts](../resource/arena.ts) gains a two-part ledger —
`FrameTraffic { written, uploaded }` — with `traffic()` reading it and `resetTraffic()`
zeroing it, so a caller reads the window it reset rather than everything since the arena was
made. The two categories decision 9 keeps apart accrue at the arena's own funnels: the queued
`upload(handle, bytes, run)` path (item 11) now carries a byte count and adds it to `uploaded`
**at `flush`**, after `resolve` succeeds — so an upload against a handle a resize freed is
refused and never counted; `wrote(bytes)` records the one-time first contents; `sent(bytes)`
records an upload that does not pass through the queue. The backends record at the writeBuffer
and bufferData calls they already make: WebGPU's geometry and storage-buffer initial data →
`wrote`, its per-frame uniform block → the funnel; WebGL 2's fullscreen quad → `wrote`, its
per-frame uniform block (respecified with `bufferData` rather than queued) → `sent`. Both
backends expose `traffic()`/`resetTraffic()` on the shared `Backend` interface, answered from
each backend's own arena — symmetric, neither throws, so it is not a method one has and the
other refuses. `FrameTraffic` is imported by `renderer/types.ts` for the interface but **not
re-exported through the door**, so the export surface did not move (`gate:pack` green at 49
names). The benchmark is `npm run bench:traffic` ([gates/traffic.mjs](../gates/traffic.mjs)):
it draws a geometry frame and a compute frame through the recording double — no card — and
prints `cost()` and `traffic()` as separate column groups, never summed, with
`cost().transientBytes` a third figure apart from both (a transient scratch target the frame
allocates versus the resident bytes a page fed in). Measured this run at 800×600: `grid`
written 192 B / uploaded 16 B, `compute` written 256 B / uploaded 16 B, both transientBytes 0.

**What the gates could not see.** The recording double is what the benchmark and the fast suite
drive, so the byte counts are the ones the shipped backend tallies — but on the fake device,
not a card, and `gate:browser` was not run. The counting is arithmetic the node suite reads
directly ([tests/resource-arena.test.ts](../tests/resource-arena.test.ts),
[tests/renderer-traffic.test.ts](../tests/renderer-traffic.test.ts) assert each category, the
freed-before-flush no-count, and reset), so a card would confirm the *picture* is unchanged
rather than the *numbers*, which are device-independent by construction. The benchmark draws
two hand-built frames rather than the corpus because the node corpus loader is broken
independently of this work — see item 64. See [JOURNAL.md](JOURNAL.md).

### 23. Every preset asserts an exact cost

**Status.** done

**Done when.** Each corpus preset carries an asserted `cost()`, and a change that adds a pass or a pipeline switch fails until the number is updated deliberately.

**Needs.** item 21.

**How it landed.** [tests/cost-corpus.test.ts](../tests/cost-corpus.test.ts) asserts an
exact `FrameCost` for every one of the fifteen `CAPABILITY_FIXTURES` presets at the corpus
size (800×600), each field spelled out with the arithmetic behind it in a comment, so a diff
that adds a pass, a pipeline switch, an attachment store or a transient byte to any preset
fails `toEqual` until the number is updated deliberately. A coverage test asserts the
expected-cost table's keys equal the fixture ids, so a new capability fixture cannot land
uncounted and a removed one cannot leave a stale entry. The frame each preset is measured
through is assembled the way a loader assembles one — `loadFixture` derives the description off
the source, the generated bytes are rekeyed from the address they are fetched by to the
resource that reads them, and `assembleFrame` builds the graph — reached through the node fast
suite rather than through `gate:browser`'s `loadCorpus()`, which is dead at load (item 64).
That is the correct home by construction: decision 9 says `cost()` is asserted in CI on any
machine because a frame's cost is a fact about its structure, so no card and no browser enter.
Where [tests/cost.test.ts](../tests/cost.test.ts) pins the arithmetic one field at a time on
hand-built frames, this pins the whole metric on the frames the package measures itself
against. See [JOURNAL.md](JOURNAL.md).

### 1. Discarding an attachment nothing reads, and merging two passes over one

**Status.** done

**Where it came from.** It was item 40's step 1.4 in the site's roadmap, lifted out of that item on 2026-08-22 because a blocked step in the middle of an ordered list halts every reachable step behind it, and it did: an unattended run stopped on it with seven reachable steps still in front of it. It became item 42 there and moved here on 2026-08-24, as D118 in that repository's log, because the renderer left that tree and an item filed where nobody can work it reads as available.

**What it asks for.** An attachment nothing reads later is discarded instead of written out, and two passes over one attachment merge where their work allows.

**Corrected on 2026-08-24. This item was never blocked on a phone, and the wording below replaces the analysis that said it was.** That analysis was written on the site's side before the item moved here, and its faulty inference held the work for days. What follows is the correction, kept beside the original claim rather than in place of it, because the mistake is instructive and is the sort this repository should be able to recognise again.

**What the original analysis got right.** The saving is bandwidth a tiling mobile GPU pays and an immediate-mode desktop card does not, so **no desktop reading can show the saving is real.** That part stands, and it is why a phone still has a job here.

**What it got right for the wrong reason.** It said "the trace agrees either way at unmoved call counts", and that sentence is **true**. But not because the field is invisible. The trace contract draws one graph twice — once against the fake device, once against a real one — and compares those two runs *to each other*. Both runs carry the same `storeOp` whatever its value is, so the contract agrees either way. **That is the contract working correctly, and it is not blindness.**

**What it got wrong.** It slid from "the contract agrees" to "nothing can see it". Only the first is true. Those are two different instruments and the original treated them as one:

- **The recorder already records exactly the right thing.** [renderer/trace.ts:63](../renderer/trace.ts#L63) compares `beginRenderPass` on `['colour','depth','times','counts']`, and lines 408 and 409 build `colour` as an array of objects carrying `loadOp` and `storeOp`. So `gpu.calls('beginRenderPass')[0].colour[0].storeOp` is **assertable today, with no new infrastructure**, exactly as [tests/renderer-queries.test.ts:98](../tests/renderer-queries.test.ts#L98) already asserts a recorded descriptor field.
- **Nobody is asserting on it.** That is the whole blocker: not a recorder that needs extending, but the absence of a metric that reads descriptor fields.

**So the two halves are not equally blocked, and they were treated as one item.**

- **The pass-merge half moves call counts today.** Merging two passes over one attachment means fewer `beginRenderPass` calls, and the recording double counts calls. Assertable on a desktop, now.
- **The discard half is a recorded field today.** Assertable on a desktop, now, by reading `storeOp` off the recorded descriptor.
- **The phone validates the premise once.** That the bandwidth saving is real on a tiler is a one-time confirmation, not a per-change gate. A phone reading taken in August does not stop someone reintroducing `storeOp: 'store'` in December; a counter assertion does.

**What actually unblocks it.** `cost(graph, size)` — the metric of [RoadToPureEngine.md](RoadToPureEngine.md) §17 decision 9, which counts passes, draws, pipeline and bind switches, and **attachment loads and stores**. It lands in that document's **Stage 2**, and this item becomes workable in the same stage.

**Still true, and still worth keeping.** An artefact gate shows identical pixels by construction, since a discard is only correct where nothing reads the attachment afterwards, so pixels cannot be the signal here. And quoting a desktop reading as evidence that the *bandwidth* saving happened remains illegitimate — a desktop can now show the graph asks for fewer stores and fewer passes, which is a different claim and the one worth gating forever.

**Not blocked. Waiting on Stage 2's `cost()` metric, which is in this repository's hands.** The phone reading remains a row of the site repository's `docs/TESTING.md`, wanted once, for the premise rather than for the change.

**Needs.** item 21. Stated as a `Needs` line like every other item's, because an unattended run reads dependencies from that line and would otherwise take this item first on the strength of its number.

**How it landed.** Both halves, in one pure home and two consumers. [renderer/attachments.ts](../renderer/attachments.ts)
holds `frameStores(frame)` — the **discard** half — and `mergeGroups(frame)` — the **merge**
half — reading the graph alone so `cost()` reads one and the executor reads both without either
restating the rule (item 19's discipline). `frameStores` marks an attachment stored only where the
graph *proves* it is read again — a later pass loads it as an attachment of the same kind, a later
pass binds it, it is the `present`ed picture, or it is one of a `swap` pair — and discarded
otherwise; it errs to keeping, since storing what nothing reads only wastes bandwidth while
discarding what something reads is a wrong picture. `cost()`'s `attachmentStores` now counts a
store exactly where `frameStores` keeps one (plus each resolve, whose average is written whatever
its source does), so the number falls where an attachment discards. The executor
([submit/execute.ts](../submit/execute.ts)) carries the decision as `store`/`storeDepth`/
`storeStencil` on its resolved attachments and emits `storeOp: 'discard'` where they are false;
`renderer/webgpu.ts`'s `resolveTurns` resolves those flags off `frameStores` and folds the passes
`mergeGroups` names into one render pass, replaying every group member's bundle into it — so
`ResolvedRun.bundle` became a list. `mergeGroups` merges two passes over one **named** attachment
set only where the second loads rather than clears, neither carries a per-pass query or a stencil,
neither is multisampled, and the second samples nothing an earlier member wrote (nor its swap
partner) — the one dependency that needs a pass boundary raster ordering cannot supply.

**What the desktop showed and what it could not.** The discard half is asserted on the recorded
descriptor — a single-pass depth attachment and a multisample source now read `storeOp: 'discard'`
([tests/renderer-depth.test.ts](../tests/renderer-depth.test.ts),
[tests/renderer-multisample.test.ts](../tests/renderer-multisample.test.ts)) — and in `cost()`'s
store count ([tests/cost.test.ts](../tests/cost.test.ts)); the merge half moves `beginRenderPass`
counts — two passes over one attachment set become one
([tests/renderer-targets.test.ts](../tests/renderer-targets.test.ts)) — and both pure functions
are pinned directly ([tests/attachments.test.ts](../tests/attachments.test.ts)). What no gate that
runs here can see is that the resulting picture is byte-identical on a card: the node suite reads
calls, `gate:browser` was not run in the unattended session, and the item's own premise — that the
saved store is bandwidth a *tiling* GPU pays — needs a phone, which is item 62's standing job. The
pixel-identity of both halves is by construction, not by measurement: a discard is only issued
where `frameStores` proves nothing reads the attachment, and a merge only where the draws it joins
see each other exactly as two passes would under the card's raster ordering. One browser corpus
preset, `core-depth`, now merges its two passes; the trace contract stays green because both the
double and a real device compute the same descriptor. See [JOURNAL.md](JOURNAL.md).

### 24. `refusal(graph, device)` and the `Capability` type

**Status.** done

**Asks for.** The third of the pure functions, and the `Capability` enum it reads: `compute`, `storage-buffer`, `storage-texture`, `indirect`, `timestamp`, `occlusion`, `msaa`, `float-blend`, `depth-clamp`, `bgra-storage`. A graph declares `requires`; a device reports `capabilities`.

**Done when.** It takes the graph and a `{ backend, capabilities }` record and nothing else, returns a message naming every missing capability or null, and **no backend anywhere has a method it must throw from.** A test asserts the message names the capability rather than the backend.

**Needs.** item 17.

**Note.** It answers the second question, not the first. Selection (item 8) asks which backend should draw this and is answered across everything on offer; refusal is what a caller reads only when selection came back empty.

**How it landed.** [graph/capability.ts](../graph/capability.ts) holds the `Capability`
type — the ten names §10 lists — importing nothing, per §7 rule 1. `ShaderFrame` gains
`requires?: readonly Capability[]`, the graph's declaration, absent for a frame that
needs only what every backend shares. [renderer/refusal.ts](../renderer/refusal.ts) holds
`refusal(graph, device): string | null`, the third pure function beside `validate` and
`cost`: it takes `Pick<ShaderFrame, 'id' | 'requires'>` and a `{ backend, capabilities }`
record — `capabilities` a `ReadonlySet<Capability>` — and nothing else, touches no device,
and returns a message naming every capability the graph requires and the device lacks, or
null where the device has them all. The message names the capabilities before the backend —
`the graph "particles" needs compute and storage-buffer; webgl2 has neither` — because the
capability is the fact a caller can act on; the number-agreeing tail is "does not have it"
/ "has neither" / "has none of them" for one/two/more.
**No backend grew a method it throws from:** capability lives in `graph.requires` and the
device record as data (§10, §17 decision 2), so `refusal` reads two records and the
`Backend` interface is untouched. Selection before refusal is preserved — this is item 8's
sibling, read only when `selectBackend` came back empty. [tests/refusal.test.ts](../tests/refusal.test.ts)
asserts the message names the capability rather than the backend (only missing ones named,
present ones not), the null cases (nothing required, all had), and each grammar arm. The
export surface moved — `refusal`, `Capability`, `DeviceCapabilities` through the door, 50
runtime names now where there were 49; `gate:pack` green. Wiring `device.capabilities` from
a live backend end to end is item 51's, not this item's; `gate:browser` was not run and is
irrelevant, since `refusal` touches no device. See [JOURNAL.md](JOURNAL.md).

### 25. `examples/compute-field`

**Status.** done

**Asks for.** A compute shader writing a storage texture that a blit shows, which is the compute toy tier.

**Done when.** It draws on WebGPU, and on a WebGL 2 machine it prints the refusal `refusal()` returned rather than a black rectangle.

**Needs.** item 8, item 17.

**How it landed.** [examples/compute-field/main.ts](../examples/compute-field/main.ts) is the
third example and the first to reach a card by WebGPU. It authors a WGSL compute frame — a
`texture_storage_2d<rgba8unorm, write>` a `@compute` pass paints one pixel at a time, dispatched
over the whole frame, named as the frame's `present` so the backend copies it onto the canvas
(the blit) — from the raw description surface the door already exports: a `FrameDescription`
literal, `frameOf`, and `uniformBlockOf` to lay the uniform block out from the source. The door
ships no compute-frame builder (there is `wgslFrame` for a fullscreen fragment and no
equivalent for a compute field), so the example writes the description by hand, which is the
honest test of what a consumer authoring a compute toy does today. The frame declares
`requires: ['compute', 'storage-texture']`, the two capabilities `refusal` reads. Selection and
refusal are wired **in the example**, per §10 order, because the end-to-end wiring of
`device.capabilities` is item 51 and not landed: it asks for a WebGPU adapter
(`requestWebGPUDevice`), builds a `DeviceOffer`, and `selectBackend` routes the WGSL frame to
WebGPU where an adapter returned. There it draws through `createSurface({ backend: 'webgpu',
device })`. Where selection comes back empty — a WGSL frame on a machine with no WebGPU adapter,
which is the WebGL 2 machine — it reads `refusal(frame, { backend: 'webgl2', capabilities })`
and prints the message over the canvas rather than leaving a black rectangle. It imports only
the door (`tests/examples-door.test.ts` green), bundles through the door alias, and
type-checks. **What the gates could not see:** that it *draws on WebGPU* needs a card, which
this machine has not got (SwiftShader on every headless launch, §17 note 3), and `gate:browser`
was not run in the unattended session; the WebGL 2 refusal half is exercised only in a browser
too. What ran here is the pure path: the frame builds, `uniformBlockOf` lays `u_time` at 0 and
`u_resolution` at 8, `selectBackend` picks `webgpu` given an adapter and refuses without one, and
`refusal` returns `the graph "compute-field" needs compute and storage-texture; webgl2 has
neither` — the message the example prints. See [JOURNAL.md](JOURNAL.md).

---

## Phase 3 — per draw, and many draws

Implements decision 7's target argument. **Gated by an example.**

*Exit:* `instanced-cubes` draws a thousand objects on both backends in one pass and its `cost()` is inside budget.

### 26. `RenderPass.draws` becomes a list

**Status.** done

**Done when.** One pass carries many draws, and the one-draw-per-pass shape is gone from the types rather than merely unused.

**Needs.** item 17.

**How it landed.** `RenderPassSpec.draw: DrawSpec` became `draws: DrawSpec[]` in
[renderer/types.ts](../renderer/types.ts), and `isRenderPass` now keys on `'draws' in pass` — the
one-draw-per-pass shape is gone from the types rather than merely unused. The draws share the
pass's one `pipeline` (item 33 is what lifts that restriction; §8's per-draw pipeline is item 38's
rename horizon), so the executor sets the pipeline and bind groups once and issues each draw
against them: `issueDraw` became `issueDraws` in [submit/execute.ts](../submit/execute.ts),
looping the list, and `ResolvedRun` carries `draws` plus an `indirects` buffer list aligned to it
(was one `draw`/one `indirect`). The WebGPU backend's bundle recorder and `resolveTurns`
([renderer/webgpu.ts](../renderer/webgpu.ts)) record and resolve the list, and its indirect-buffer
sizing loops every indirect draw a pass names rather than the first. The WebGL 2 backend refuses a
pass unless **every** draw covers corners and issues one `drawArrays` per draw
([submit/gl2.ts](../submit/gl2.ts) takes a vertex-count list). `submit/plan.ts` resolves the
pass's geometry off the pipeline once and requires it where any draw counts instances alone.
`cost().draws` sums `pass.draws.length` across passes (item 28 still counts an instanced or
indirect draw as one), so every corpus preset — each a list of one today — costs exactly what it
did and `cost-corpus.test.ts` is unchanged. Two new tests prove a pass carrying many draws issues
each: two `drawIndexed` with distinct instance counts on WebGPU
([tests/renderer-geometry.test.ts](../tests/renderer-geometry.test.ts)) and two `drawArrays` on
WebGL 2 ([tests/renderer-webgl2.test.ts](../tests/renderer-webgl2.test.ts)). Both read calls off
the recording double, not pixels off a card; that a bundle of several draws paints the right
picture needs `gate:browser` or a card, not run here, and no corpus preset carries a multi-draw
pass until a producer (items 30/32) emits one. See [JOURNAL.md](JOURNAL.md). 635 node tests green,
`type-check` green; export surface unmoved (a field rename on an already-hidden type, no door name
added or removed), so `gate:pack` was not required.

### 27. `Draw.perDraw`

**Status.** done

**Asks for.** One slice of a per-draw buffer per draw: a dynamic offset on WebGPU, `bindBufferRange` on WebGL 2, one field either way.

**Done when.** A thousand draws read a thousand distinct records from one buffer on both backends, with the 256-byte alignment respected and a refusal by name when an offset breaks it.

**Needs.** item 26.

**How it landed.** One field on the draw, one on the binding, and one home for the
rule. `DrawSpec` gains `perDraw?: number` — the byte offset the draw reads its
record from — and `BindingSpec` gains `perDraw?: { size: number }` — that this
binding reads one `size`-byte slice per draw, the buffer it names bound as a
uniform with a dynamic offset ([renderer/types.ts](../renderer/types.ts)); the size
is the binding's and the offset is the draw's, which is the "one field either way"
of §8. `perDrawBinding(spec)` reads the sliced binding in the one shape both
backends and `validate` resolve it from. The 256-byte alignment is
[renderer/validate.ts](../renderer/validate.ts)'s: every per-draw offset is a whole
number of `PER_DRAW_ALIGNMENT` (256) — WebGPU's default
`minUniformBufferOffsetAlignment` and WebGL 2's `UNIFORM_BUFFER_OFFSET_ALIGNMENT` —
refused by name where it is not (`the pass on "cube" reads a per-draw slice at
offset 128, which is no whole number of 256 bytes`), along with an offset that
runs past the buffer and an offset whose pipeline binds no slice.

**WebGPU, end to end.** A per-draw buffer is built with `UNIFORM | COPY_DST`
rather than the storage flags ([renderer/webgpu.ts](../renderer/webgpu.ts)), its
layout entry is `buffer: { type: 'uniform', hasDynamicOffset: true }`, and its
bind group entry is one record wide (`offset: 0, size`). The group carrying the
dynamic offset is set once **per draw** with `[draw.perDraw]` rather than once for
the pass — [submit/execute.ts](../submit/execute.ts)'s `issueDraws` takes a
`perDrawBand`, sets every other group once and that group per draw — so a bundled
pass and an inline one slice the buffer the same way. `resolveTurns` reads the band
off the pipeline once. [tests/renderer-perdraw.test.ts](../tests/renderer-perdraw.test.ts)
draws a thousand fullscreen corner draws, each naming its own 256-byte slot, and
asserts a thousand distinct dynamic offsets reach the recording double, plus the
uniform usage, the `buffer:uniform` layout, and each refusal by name.

**WebGL 2, the executor arm.** [submit/gl2.ts](../submit/gl2.ts)'s `drawGL2Frame`
takes an optional `perDraw` and issues a `bindBufferRange(UNIFORM_BUFFER, binding,
buffer, offset, size)` before each draw — the same slice a dynamic offset reaches
on WebGPU — proven at the `submit/` layer by
[tests/submit-executor.test.ts](../tests/submit-executor.test.ts): a thousand
corner draws, a thousand distinct ranges, one record wide. **What is not here:**
the WebGL 2 *backend* assembling such a frame from a description end to end — letting
the per-draw buffer through its uniform-only wall and reflecting a second uniform
block — is item 49's declared scope (`WebGL 2: instancing and per-draw UBO ranges`,
which needs item 46's multiple passes as well), so it is tracked there rather than
parked. **What the gates could not see:** that the thousand records draw the
thousand transforms they hold needs a browser gate or a card, and `gate:browser`
was not run in the unattended session; the node suite reads calls off the doubles.
See [JOURNAL.md](JOURNAL.md).

### 28. Instancing

**Status.** open

**Done when.** One draw covers many instances and `cost()` counts it as one draw rather than many.

**Needs.** item 26.

### 29. `submit(graph, { into })`

**Status.** open

**Asks for.** A frame lands where the caller says — the canvas, a texture, or an XR layer's target.

**Done when.** A frame is captured into a caller-supplied texture with no prototype patching and no row-stride arithmetic anywhere in the consumer, and a test reads it back.

**Needs.** item 13, item 17.

**Note.** The stronger half of the argument is not XR. A live canvas on this renderer cannot be sampled after the fact at all — one embed measured 0 of 402,300 pixels lit by three separate methods while drawing sixty times a second. This item deletes two instrumentation hacks and makes capture ordinary API use.

### 30. `examples/instanced-cubes`

**Status.** open

**Asks for.** A thousand objects, one pipeline, each with its own transform.

**Done when.** It draws on both backends and its `cost()` is inside the budget of item 31. **This item is Phase 3's exit criterion, not an illustration of it:** if writing it is painful, the API is wrong, and this is the cheap moment to find out.

**Needs.** item 27, item 28.

### 31. A published budget for a thousand objects

**Status.** open

**Asks for.** The first row of the frame budget: counters that are enforced, milliseconds that are tracked.

**Done when.** The counters are asserted in CI and the milliseconds are recorded from real hardware with the device named, and neither is confused for the other.

**Needs.** item 21, item 30.

---

## Phase 4 — the scene becomes a producer, and the folders move

Closes §3 row 8. Implements the §14 renames while they are still free.

*Exit:* `orbit-shadow` runs on both backends and a scene change is reviewable as a graph diff.

### 32. `sceneView`

**Status.** open

**Asks for.** `sceneView(arena, options).graph(world, views) → FrameGraph`. A producer, importing `graph/` and receiving an arena, reaching no device.

**Done when.** It takes **`views: Camera[]`** rather than one camera; it is unit-tested with no GPU present at all; and a test asserts it imports nothing from `gpu/` or `submit/`.

**Needs.** item 26, item 27.

**Note.** `views` as a list is free now and a breaking signature change after this phase. That is the whole reason it is specified here even though nothing needs two views yet.

### 33. `batchOnePipeline` loses its restriction

**Status.** open

**Asks for.** The one-pipeline rule goes, because the reason for it — no per-draw data — is gone.

**Done when.** A scene spanning two pipelines produces one graph, and the ordering is the producer's to decide rather than a thrown error.

**Needs.** item 32.

### 34. Golden graph snapshots

**Status.** open

**Asks for.** A producer's output graph, snapshotted as JSON.

**Done when.** Every scene preset carries a snapshot, and a change to `sceneView` shows as a text diff with no GPU, no browser and no picture to squint at.

**Needs.** item 32.

### 35. `examples/orbit-shadow`

**Status.** open

**Asks for.** An orbit camera, one shadow-casting light, around fifty objects.

**Done when.** It runs on both backends. **This is Phase 4's exit criterion.**

**Needs.** item 32, item 34.

### 36. `examples/gltf-cube`

**Status.** open

**Asks for.** An asset arriving after the page opened, loaded by the example rather than by the library, which is where decision 5 puts it.

**Done when.** The mesh appears mid-session and the library contributed no parser.

**Needs.** item 11, item 32.

### 37. The folders move

**Status.** open

**Asks for.** The layout of §7: `graph/`, `gpu/`, `resource/`, `pipeline/`, `submit/`, `toy/`, `scene/`, `host/`, `trace/`.

**Done when.** No file sits in `renderer/` or `engine/`, and the move commit changes no logic.

**Needs.** item 32. **Not earlier:** Phase 4 is when what each folder owns is known, and renaming before it is guessing.

### 38. The §14 renames

**Status.** open

**Asks for.** `ShaderFrame` becomes `FrameGraph`, `setArtefact` becomes `setFrame`, `ShaderProgram` is gone, `report()` becomes `probe()` and the capability accessors, and the rest of the table.

**Done when.** No name in the table survives, and the README and both design documents use the new ones.

**Needs.** item 37. **Deadline:** before 1.0, per decision 8, after which renames are forbidden.

### 39. The layer rules become tests

**Status.** open

**Asks for.** [tests/import-graph.test.ts](../tests/import-graph.test.ts) enforces §7: `graph/` imports nothing, no producer imports `gpu/` or `submit/`, nothing below `host/` requires a DOM object, and **`host/loop.ts` imports only the package's own public exports.**

**Done when.** Each rule fails the test when deliberately broken, verified once per rule.

**Needs.** item 37.

**Note.** That last rule is what makes decision 7's promise mechanical: a written commitment that `loop` holds no logic `submit` lacks decays, and an import rule does not.

---

## Phase 5 — WebGL 2 becomes a real backend

Two halves, and 5a comes first because the backend is worth nothing without shaders to feed it. Implements decisions 1 and 2.

*Exit:* every corpus preset either draws byte-identically from one WGSL source or is named on the widened list with a cause and its readings; the same scene graph draws on both backends; a compute graph is refused by name.

### 40. Choose the translator

**Status.** open

**Asks for.** Naga against Tint, evaluated on this corpus rather than on reputation.

**Done when.** Every corpus preset is run through both, the failures of each are listed, and the choice is recorded with the readings behind it.

**Needs.** Nothing.

**Note.** This is where decision 2's risk is discovered or dismissed. The whole WebGL 2 story rests on one translator; if it cannot carry the scene tier, decision 1 degrades to toy-tier-only by construction rather than by choice. Hit that wall here, while turning back is cheap.

### 41. The build-time translation path

**Status.** open

**Asks for.** Every shipped material and every corpus preset translated once by a build step, the result carried in `ShaderSource.glsl`.

**Done when.** A scene-tier consumer on WebGL 2 downloads no translator, and a shader that will not translate **fails the build** rather than the page.

**Needs.** item 40.

### 42. The on-demand translator chunk

**Status.** open

**Asks for.** The editing path: someone typing WGSL on a WebGL 2 device gets translation while the page runs, fetched by `await import()` in its own chunk.

**Done when.** A bundle analysis shows the translator absent from the first download, and the editing path still works.

**Needs.** item 40.

### 43. Refusal by named construct

**Status.** open

**Done when.** A WGSL source using something the translator cannot carry is refused with the construct named, at build time where a build can see it.

**Needs.** item 41.

### 44. The three-number cross-backend comparison

**Status.** open

**Asks for.** Hard jumps per frame, counted independently per frame and compared as counts rather than as a diff of the two frames; maximum per-channel delta; channels differing at all.

**Done when.** All three are reported on every comparison, and **a per-channel average is no longer a primary reading** — it cannot tell small error spread thin from a picture cut into visible blocks, which is exactly the 7,537-against-292 case recorded in decision 4's amendment.

**Needs.** item 41.

### 45. The widened list

**Status.** open

**Asks for.** One file naming any preset that cannot be byte-exact, with its cause, its date and its readings. Four rules: absence means exact; it is not settable at the preset; **its length is asserted and is currently zero**; the gate prints it every run.

**Done when.** A preset can only be exempted by a diff to that file, an exemption naming a symptom rather than a cause is rejected in review, and the gate output shows the list whether it is empty or not.

**Needs.** item 44.

**Note.** A bar widened by the person it was blocking is relief, not evidence. There is a measured case: a gate once passed a shader at an average channel distance of 19.0 against a bar of 24 while 822,426 of 1,440,000 channels sat over the per-channel tolerance of 8.

### 46. WebGL 2: multiple passes

**Status.** open

**Done when.** A two-pass graph draws, and the pass count in `cost()` matches what the backend issued.

**Needs.** item 41.

### 47. WebGL 2: multiple render targets

**Status.** open

**Done when.** A graph writing three attachments draws, and a fourth beyond the device's limit is refused by name.

**Needs.** item 46.

### 48. WebGL 2: depth and stencil

**Status.** open

**Done when.** The depth and stencil presets that WebGPU passes today pass here, and the pixels agree per item 44.

**Needs.** item 46.

### 49. WebGL 2: instancing and per-draw UBO ranges

**Status.** open

**Done when.** `instanced-cubes` draws here, at the same object count, with alignment respected.

**Needs.** item 27, item 46.

### 50. WebGL 2: mip generation

**Status.** open

**Done when.** The mips preset passes and the sampled result agrees per item 44.

**Needs.** item 46.

### 51. Capability declaration wired end to end

**Status.** open

**Asks for.** `graph.requires` against `device.capabilities`, feeding selection first and refusal second, per §10.

**Done when.** A compute graph on a WebGL 2 machine produces a message a page can print, naming compute; and every backend method that would have thrown is absent rather than throwing.

**Needs.** item 8, item 46.

### 52. The same scene graph on both backends

**Status.** open

**Done when.** `orbit-shadow` draws on WebGL 2 as well as WebGPU, and the difference between the two is reported by item 44's three numbers.

**Needs.** item 35, item 48, item 49, item 50.

---

## Phase 6 — the engine, as producers

**Contents deliberately withheld.** Shadows beyond `orbit-shadow`, a post chain, culling, GPU particles, asset helpers: each is one producer, one preset, one gate, and none is queued here.

*Exit:* whatever the first outside consumer needs, and nothing beyond it.

### 53. Wait for a consumer who did not write this

**Status.** open

**Asks for.** Nothing yet, on purpose.

**Done when.** Someone outside this org has shipped something with the package and said what was missing. **Until then this phase has no items and must be given none** — the examples suite cannot supply them, because decision 10 makes it a deliberately captive consumer that may validate the plan and may not extend it.

**Needs.** Phases 0 to 5.

**Note.** This is the same trap that produced 479 lines in `engine/` that nothing imported and nothing could have imported. A better substrate fixes the hole those lines were built against; it does not supply the feedback they never had.

---

## Runs alongside

Not phase-bound. Each can land whenever its dependency has.

### 54. GPU timestamps get a consumer

**Status.** open

**Asks for.** The timestamp queries that already work and are read by nothing become per-pass times in the benchmark output.

**Done when.** A run prints per-pass times where the device supports them. **Reported, never asserted.**

**Needs.** item 21.

### 55. The wall-clock harness

**Status.** open

**Asks for.** p50, p95 and p99 over N frames on real hardware, with the device named.

**Done when.** It runs outside CI and its numbers are recorded against a device row. **Never a CI gate:** a flaky perf gate is disabled within a month and takes the real signal with it.

**Needs.** item 30.

### 56. The deprecation mechanism

**Status.** open

**Asks for.** `@deprecated` JSDoc, which surfaces at the call site where it works, plus a one-shot dev-mode warning per symbol.

**Done when.** A deprecated export warns once per session and appears struck through in an editor.

**Needs.** item 38. Required by 1.0, not before.

### 57. Device readings accumulate

**Status.** open

**Asks for.** Rows added to `docs/DEVICES.md` as hardware is read, including one iPhone, which nobody has read.

**Done when.** Never; it is a log rather than a task. **It is not a support promise:** the package's promise is the capability model, which answers correctly on devices nobody has read.

**Needs.** item 9.

**Note for whoever runs the harness.** On the Linux machine these were taken on: every headless launch reaches SwiftShader whatever the flags say, `--headless=new` included. A WebGPU adapter on the real card needs a visible window plus `--enable-features=Vulkan` **and** `--ozone-platform=x11` together — without the second the window renders as a flickering transparent tile on that driver. Do not reach for `--use-angle=vulkan`, `DefaultANGLEVulkan` or `VulkanFromANGLE`: they move the whole browser onto Vulkan and produce the same tile.

---

## 1.0

### 58. Declare 1.0

**Status.** open

**Done when.** All five, and it is a checklist rather than a judgement:

| gate | produced by |
| --- | --- |
| §14 complete | item 38 |
| examples covering both tiers on both backends | items 7, 25, 30, 35, 36, 52 |
| `cost()` budget published and green | items 21, 23, 31 |
| device readings published | items 9, 57 |
| **one consumer outside this org shipping something** | item 53 |

**Needs.** Every item above.

**The consequence, said out loud because otherwise it gets dropped.** That last gate cannot be graded from inside this repository, so **1.0 depends on something outside this repository's control.** The package can be finished by every other measure and still be 0.x. The useful effect is that the examples suite and the README's first screen stop being documentation chores and become the mechanism that produces the last checkbox.

---

## Found by review

Items that came out of reading landed work rather than from the plan. They are numbered after 58 because a number is an address that is never reused, and they sit here, last, because **the queue reads in ascending numeric order and a reader must be able to trust that.**

An earlier draft put these four inside Phase 0, where their subject is. An unattended run then read the queue top to bottom, met item 59 before item 10, and worked it — correctly, by the only reading the document supported, and not the one the selection rule intended. The rule was never ambiguous; the document was.

### 59. A duplicate document name is refused

**Status.** done

**Asks for.** `frameOf` refuses a description whose documents do not carry distinct names, by name, the way it already refuses a document with no text and a picture with no bytes.

**Done when.** A description with two documents sharing one name is refused with both the id and the repeated name in the message, and a test asserts it. A description with two distinctly-named documents still assembles.

**Needs.** item 3.

**Why it exists.** Found reviewing item 3, which is otherwise correct. Item 3 moved document keying from `address` to `name`, which is what lets two WGSL documents coexist — but nothing checks that the names differ, and the old failure mode survives one step to the left:

- `documentNames` collapses the pair through a `Set`, so a loader fetches one text for two documents.
- `assembleFrame`'s `Object.fromEntries` maps both to one key, so the second text wins.
- `frameOf`'s missing-text check passes, because the name does have text.
- The frame carries two modules with one name and one body, and `moduleOf` hands a pipeline whichever it finds first.

So two documents meant to differ still silently become one. Before item 3 that happened whenever two WGSL documents met, because the address was fixed at `'wgsl'`; after it, only when an author repeats a name. That is a real improvement and not a closed hole. **The refusal site already exists**, which is the argument for one line rather than waiting for item 19's `validate(graph)`: `frameOf` is already where a malformed description is stopped, and a rule enforced in two places later is the thing item 19 exists to prevent.

### 60. The diagram loses the files that left with the website

**Status.** open

**Asks for.** `ABSTRACTION.md`'s Mermaid diagram stops naming files that do not exist here, and the path gate stops being blind to fenced blocks.

**Done when.** No node label in that diagram names a path absent from this tree, and `tests/docs-paths.test.ts` reads Mermaid node labels as well as backtick and link spans — negative-tested on an injected stale path inside a fence, the way item 5 negative-tested the two shapes it already covers.

**Needs.** item 5.

**Why it exists.** Item 5 met its own wording exactly: it checks backtick-quoted and link-quoted paths, and its own blind-gate row in [JOURNAL.md](JOURNAL.md) says the diagram sits in a stripped fenced block, neither checked nor changed. That row is honest and it was not tracked, and JOURNAL.md's own rule is that a row needing work nobody is tracking needs a roadmap item in the same commit. This is that item.

Seven website paths are still in that fence today, named here without backticks so that item 5's own gate does not read this item as a claim that they exist: content/shaders, hooks/useShaderSurface.ts, lib/renderer/artefacts.ts, lib/renderer/choose.ts, lib/shader-base.ts, public/shaders/build/manifest.json, public/shaders/source/*.wgsl. Writing them plainly is deliberate rather than a workaround — the alternative was seven more entries on `ALLOWED_ABSENT`, and that list is a widened bar whose value comes from being short. **This item's first draft did quote them, and the gate failed the commit**, which is the gate doing exactly what item 5 built it for. The diagram is the most-read part of that document, so this is where §3 row 12 of [RoadToPureEngine.md](RoadToPureEngine.md) is least closed rather than most.

### 61. The WebGL 2 backend feeds an integer uniform as an integer

**Status.** open

**Asks for.** A loose scalar uniform declared `int` in the source is fed with `gl.uniform1i` rather than `gl.uniform1f`.

**Done when.** A source declaring `uniform int` receives the value it was handed, asserted against the fake WebGL 2 context by the call made rather than by the picture, and a source declaring one alongside floats gets both.

**Needs.** Nothing.

**Why it exists.** [renderer/webgl2.ts](../renderer/webgl2.ts) sends every non-array scalar through `gl.uniform1f`. Feeding an `int` uniform that way is `GL_INVALID_OPERATION` in WebGL 2, so the uniform keeps its default of 0 and the shader animates off a number nobody delivered.

**It is a general defect, not a leftover.** It was found through item 6's producer, which has since been reverted, and it survives that removal untouched: decision 6 says a consumer may hand this library a GLSL document, and `uniform int` is ordinary GLSL. Any consumer writing one hits this today, silently, and no gate here can see it — the node suite reads calls rather than values, and the browser corpus has no GLSL source declaring an integer.

**It is not a one-line fix, and that is the useful part of this entry.** `setUniforms` receives only `values: Record<string, UniformValue>` and infers the call from the JavaScript shape of each value — non-array becomes `uniform1f`, and an array's length picks `uniform2fv`, `uniform3fv` or `uniform4fv`. There is no declared type in scope. The type does exist on the frame, as `ShaderFrame.uniforms`, and `createProgram` receives the whole frame, so a name-to-type map captured when the program is built is the obvious route.

**One thing to decide while landing it.** [RoadToPureEngine.md](RoadToPureEngine.md) §14 retires `ShaderFrame.uniforms` from the graph, because what a control panel shows is not a render fact. So the obvious route leans on a field that is scheduled to leave. If it is taken anyway, the type has to move to the binding or the pipeline when that field goes, and this entry is where that follow-on is recorded.

**Also worth checking when landing it.** The uniform-block path above the loose path writes members into a byte buffer as floats too, so an `int` member of a block has the same problem by a different route. No corpus source has one today, so both paths want a test rather than only the loose one.

### 62. Decision 6's promise is confirmed on a machine that has WebGPU

**Status.** open

**Asks for.** One reading, on a device that actually returns a WebGPU adapter, showing that a GLSL-authored frame is drawn by WebGL 2 there and that the picture comes out.

**Done when.** A dated row in [DEVICES.md](DEVICES.md) records a machine whose `probe()` reports WebGPU returned and survived, on which `examples/glsl-fragment` selected `webgl2` and drew. Not a node assertion: the point is the machine.

**Needs.** item 9.

**Why it exists.** §17 decision 6's whole promise is that a consumer arriving with a GLSL shader **gets a picture rather than a lecture**, because GLSL selects WebGL 2 even where WebGPU exists. Items 6, 8 and 9 each built a piece of that and each disclosed, accurately, the half it could not prove:

- item 8's row: the offering in its tests is a written fixture rather than a probe, because this machine never returns a real WebGPU adapter, and nothing feeds the chosen backend name to a renderer on a real card.
- item 9's row: only the pure `readingOf` is exercised; the browser half never ran, so `device-report` has not been run here at all.

Each row is honest and neither is wrong. What nobody owned is the join: **on a machine that has WebGPU, nothing has yet shown a GLSL paste drawing through WebGL 2.** Three green halves are not a verified whole, and this is the item that says so.

**It cannot be settled on the machine the loop runs on**, per §17's three harness notes: every headless launch there reaches SwiftShader whatever the flags say, and a real adapter needs a visible window with `--enable-features=Vulkan` and `--ozone-platform=x11` together. So an unattended run should **lift this item rather than work it**, and the reading belongs to whoever has the hardware — the same standing job as item 57.

### 63. The pipeline cache dedupes across programs

**Status.** open

**Asks for.** A pipeline compiled once and shared by every program whose frame carries its structure, bounded so the sharing cannot grow card memory without end.

**Done when.** Two programs on one backend whose frames differ in resident data but share a pipeline structure compile one pipeline between them, a test asserts the second builds none, and a bound is asserted so a backend that compiles more distinct structures than the bound frees the stalest rather than keeping every one alive.

**Needs.** item 15, item 21.

**Why it exists.** Item 12 built `PipelineCache` content-addressed for exactly this reuse, and item 15 wired the backends to compile through it — but **per program**, not per backend, so the cache never dedupes across two programs. That scope was deliberate and is recorded in item 15's [JOURNAL.md](JOURNAL.md) row: a per-backend `PipelineCache` has no eviction, so the editing path — a source recompiled on every keystroke, each a new structure — would accumulate pipelines the renderer's LRU can no longer reach, which is the unbounded card-memory growth that LRU exists to prevent. The renderer's LRU already reuses a whole **program** when a frame repeats exactly (via `frameKey`), so the reuse still missing is the scene-tier one: many programs sharing one material's pipeline over different meshes, each compiling that pipeline again today. That is why this `Needs` item 21 as well as item 15 — the `cost()` metric is where a "compiled nothing new" claim becomes assertable without a browser, and the scene tier is where the reuse pays. **Reverse:** none needed until it lands; item 15's per-program scope stands on its own.

### 64. The node corpus loader assembles a frame again

**Status.** open

**Asks for.** `gates/lib.mjs`'s `loadCorpus()` loads every capability fixture into a frame again, rather than throwing on the first.

**Done when.** `node -e "import('./gates/lib.mjs').then(m => m.loadCorpus())"` returns a frame per `CAPABILITY_FIXTURES` entry, and the two browser gates that consume it — `gates/corpus.mjs` and `gates/trace-contract.mjs` — reach a page rather than dying at load.

**Needs.** Nothing.

**Why it exists.** Found working item 22, which wanted to print `arena.traffic()` beside `cost()` for every corpus preset and could not: `loadCorpus()` throws on the first capability fixture, `core-compute`, with *"the description for core-compute names a document undefined with no text"*. Reproduced on a clean tree (`git stash` then the one-liner above), so it predates item 22 and is not that work's doing. The cause is a `WGSL_DOCUMENT` that resolves to `undefined` inside the esbuild bundle `loadFromRoot` builds — a document named `undefined` reaches `frameOf`, whose missing-text check refuses it correctly. Because `loadCorpus` is what `gate:browser`'s corpus and trace-contract gates call at their first step, **both are currently dead at load**, which the repeated "gate:browser not run in the unattended session" JOURNAL rows have been hiding: a gate nobody runs is a gate whose own loader can rot unnoticed. Item 22's benchmark works around it by building two frames by hand; this item is the fix, and until it lands `gate:browser` cannot confirm anything, including the twelve trace presets several recent items defer to it.
