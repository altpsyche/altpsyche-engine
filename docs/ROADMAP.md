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
through `pipeline/`'s `PipelineCache` — `gpu/webgpu.ts`'s `buildPipelines` and
`gpu/webgl2.ts`'s link both request their pipeline through it, keyed by
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

**How it landed.** [graph/validate.ts](../graph/validate.ts) holds `validate(graph: ShaderFrame): void`,
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
the description seam), and `gpu/webgl2.ts`'s `program` calls it directly, since the
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

**How it landed.** [trace/trace.ts](../trace/trace.ts) gains `Lifetimes`, a
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

**How it landed.** [graph/cost.ts](../graph/cost.ts) holds `cost(graph, size): FrameCost`,
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
other refuses. `FrameTraffic` is imported by `graph/types.ts` for the interface but **not
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

- **The recorder already records exactly the right thing.** [trace/trace.ts:63](../trace/trace.ts#L63) compares `beginRenderPass` on `['colour','depth','times','counts']`, and lines 408 and 409 build `colour` as an array of objects carrying `loadOp` and `storeOp`. So `gpu.calls('beginRenderPass')[0].colour[0].storeOp` is **assertable today, with no new infrastructure**, exactly as [tests/renderer-queries.test.ts:98](../tests/renderer-queries.test.ts#L98) already asserts a recorded descriptor field.
- **Nobody is asserting on it.** That is the whole blocker: not a recorder that needs extending, but the absence of a metric that reads descriptor fields.

**So the two halves are not equally blocked, and they were treated as one item.**

- **The pass-merge half moves call counts today.** Merging two passes over one attachment means fewer `beginRenderPass` calls, and the recording double counts calls. Assertable on a desktop, now.
- **The discard half is a recorded field today.** Assertable on a desktop, now, by reading `storeOp` off the recorded descriptor.
- **The phone validates the premise once.** That the bandwidth saving is real on a tiler is a one-time confirmation, not a per-change gate. A phone reading taken in August does not stop someone reintroducing `storeOp: 'store'` in December; a counter assertion does.

**What actually unblocks it.** `cost(graph, size)` — the metric of [RoadToPureEngine.md](RoadToPureEngine.md) §17 decision 9, which counts passes, draws, pipeline and bind switches, and **attachment loads and stores**. It lands in that document's **Stage 2**, and this item becomes workable in the same stage.

**Still true, and still worth keeping.** An artefact gate shows identical pixels by construction, since a discard is only correct where nothing reads the attachment afterwards, so pixels cannot be the signal here. And quoting a desktop reading as evidence that the *bandwidth* saving happened remains illegitimate — a desktop can now show the graph asks for fewer stores and fewer passes, which is a different claim and the one worth gating forever.

**Not blocked. Waiting on Stage 2's `cost()` metric, which is in this repository's hands.** The phone reading remains a row of the site repository's `docs/TESTING.md`, wanted once, for the premise rather than for the change.

**Needs.** item 21. Stated as a `Needs` line like every other item's, because an unattended run reads dependencies from that line and would otherwise take this item first on the strength of its number.

**How it landed.** Both halves, in one pure home and two consumers. [graph/attachments.ts](../graph/attachments.ts)
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
`gpu/webgpu.ts`'s `resolveTurns` resolves those flags off `frameStores` and folds the passes
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
needs only what every backend shares. [graph/refusal.ts](../graph/refusal.ts) holds
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
[graph/types.ts](../graph/types.ts), and `isRenderPass` now keys on `'draws' in pass` — the
one-draw-per-pass shape is gone from the types rather than merely unused. The draws share the
pass's one `pipeline` (item 33 is what lifts that restriction; §8's per-draw pipeline is item 38's
rename horizon), so the executor sets the pipeline and bind groups once and issues each draw
against them: `issueDraw` became `issueDraws` in [submit/execute.ts](../submit/execute.ts),
looping the list, and `ResolvedRun` carries `draws` plus an `indirects` buffer list aligned to it
(was one `draw`/one `indirect`). The WebGPU backend's bundle recorder and `resolveTurns`
([gpu/webgpu.ts](../gpu/webgpu.ts)) record and resolve the list, and its indirect-buffer
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
uniform with a dynamic offset ([graph/types.ts](../graph/types.ts)); the size
is the binding's and the offset is the draw's, which is the "one field either way"
of §8. `perDrawBinding(spec)` reads the sliced binding in the one shape both
backends and `validate` resolve it from. The 256-byte alignment is
[graph/validate.ts](../graph/validate.ts)'s: every per-draw offset is a whole
number of `PER_DRAW_ALIGNMENT` (256) — WebGPU's default
`minUniformBufferOffsetAlignment` and WebGL 2's `UNIFORM_BUFFER_OFFSET_ALIGNMENT` —
refused by name where it is not (`the pass on "cube" reads a per-draw slice at
offset 128, which is no whole number of 256 bytes`), along with an offset that
runs past the buffer and an offset whose pipeline binds no slice.

**WebGPU, end to end.** A per-draw buffer is built with `UNIFORM | COPY_DST`
rather than the storage flags ([gpu/webgpu.ts](../gpu/webgpu.ts)), its
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

**Status.** done

**Done when.** One draw covers many instances and `cost()` counts it as one draw rather than many.

**Needs.** item 26.

**How it landed.** The WebGPU arm already existed — item 26 made `DrawSpec` carry
`instances?`, the executor issue `into.draw(count, instances)` / `into.drawIndexed(count,
instances)`, and `cost().draws` sum `pass.draws.length` (one per draw call, not per
instance) — so item 28's work was the WebGL 2 arm, where the count was **silently
dropped**. [submit/gl2.ts](../submit/gl2.ts)'s `drawGL2Frame` gains an
`instances?: readonly (number | undefined)[]` list aligned to `vertices`: a draw with a
count is one `gl.drawArraysInstanced`, a draw without one a plain `gl.drawArrays` — the call
every fullscreen shader on the site makes. [gpu/webgl2.ts](../gpu/webgl2.ts) fills
it from `pass.draws.map(draw => draw.instances)`. `cost()` is unchanged and pinned by
[tests/cost.test.ts](../tests/cost.test.ts): one instanced draw counts one, two count two —
the instances of a call are free, a second call is not. **One draw covers many instances**
is proven on both backends: WebGPU end to end (`tests/renderer-geometry.test.ts`, item 26),
WebGL 2 end to end for a corners-with-instances frame
([tests/renderer-webgl2.test.ts](../tests/renderer-webgl2.test.ts)) and at the `submit/`
layer ([tests/submit-executor.test.ts](../tests/submit-executor.test.ts)). Instancing
*geometry of the shader's own* on WebGL 2 (a vertex buffer rather than the backend's
corners) stays refused and is item 49's. **What the gates could not see:** that a
`drawArraysInstanced` paints many copies needs a card or a browser, and `gate:browser` was
not run; the node suite reads calls off the doubles, and no corpus preset carries an
instanced draw until `examples/instanced-cubes` (item 30) emits one. 646 node tests green,
`type-check` green; the export surface did not move (a field on the already-hidden
`GL2FrameExecution` and a fake recorder, no door name added or removed), so `gate:pack` was
not required. See [JOURNAL.md](JOURNAL.md).

### 29. `submit(graph, { into })`

**Status.** done

**Asks for.** A frame lands where the caller says — the canvas, a texture, or an XR layer's target.

**Done when.** A frame is captured into a caller-supplied texture with no prototype patching and no row-stride arithmetic anywhere in the consumer, and a test reads it back.

**Needs.** item 13, item 17.

**Note.** The stronger half of the argument is not XR. A live canvas on this renderer cannot be sampled after the fact at all — one embed measured 0 of 402,300 pixels lit by three separate methods while drawing sixty times a second. This item deletes two instrumentation hacks and makes capture ordinary API use.

**How it landed.** One optional argument on the draw-and-read primitive, threaded to the
one place a finished frame meets a texture. `into?: GPUTexture` on
[`ShaderProgram.draw`](../graph/types.ts), [`FrameRenderer.frame`/`draw`](../gpu/renderer.ts)
and a matching `from?: GPUTexture` on `Backend.readPixels` — the pre-rename home of the
capability §14 will spell `submit(graph, { into })` (that rename is item 38's, so no top-level
`submit` export was added for item 38 to then rename; the door stayed at 51 names, `gate:pack`
green). [submit/execute.ts](../submit/execute.ts)'s `runFrame` copies the finished target into
the caller's `into` off the target the picture is already in, on the frame's **own** encoder,
after the `picture` copy and before the canvas `composite` — so a capture and a canvas present
coexist and the frame is still submitted once. `readPixels(from)` reads `from ?? target`
through the same 256-byte repack `readPixels()` always owned, so **a consumer reading its own
texture does no row-stride arithmetic** — the second of the two instrumentation hacks the note
names, now ordinary API use. WebGL 2 has no `GPUTexture` target, so it **refuses** a given
`into`/`from` by name — the same caller-mistake doctrine as `webgpu.ts`'s
`frame.target !== 'wgsl'` throw, not the forbidden asymmetric method (a `GPUTexture` co-occurs
with the WebGPU backend it came from); a first-class WebGL 2 external target is a later item.
**Tests read it back:** [tests/renderer-webgpu.test.ts](../tests/renderer-webgpu.test.ts) draws
into a caller-supplied `GPUTexture` and reads that texture back (the copy into it, the read out
of it, the repacked bytes, one submit), [tests/renderer-index.test.ts](../tests/renderer-index.test.ts)
does the same through the public one-shot `frame(shader, uniforms, into)`, and
[tests/renderer-webgl2.test.ts](../tests/renderer-webgl2.test.ts) pins the two refusals.
**What the gates could not see:** every assertion reads calls off the fake device; that a real
card lands the pixels in the caller texture and reads the true picture back needs `gate:browser`
(not run in the unattended session) or a card, and the XR half — submitting into a live layer's
target — needs a headset. The two consuming-site hacks this enables deleting live in that
repository and are a `carry`. 653 node tests green (+7), type-check green. See [JOURNAL.md](JOURNAL.md).

### 30. `examples/instanced-cubes`

**Status.** done

**Asks for.** A thousand objects, one pipeline, each with its own transform.

**Done when.** It draws on both backends and its `cost()` is inside the budget of item 31. **This item is Phase 3's exit criterion, not an illustration of it:** if writing it is painful, the API is wrong, and this is the cheap moment to find out.

**Needs.** item 27, item 28.

**How it landed.** [examples/instanced-cubes/main.ts](../examples/instanced-cubes/main.ts) is the
fourth example: a thousand objects, one pipeline, each with its own transform, drawn in one pass by
one instanced draw. Each object's transform is derived in the vertex shader from
`@builtin(instance_index)` (WGSL) / `gl_InstanceID` (GLSL) — a grid cell plus a per-instance spin —
so no per-instance buffer is needed and the same one instanced draw runs on both backends (item 28).
`cost()` counts that one call as one draw however many instances it reads, so the frame is
`passes: 1, draws: 1`, pinned in [tests/instanced-cubes-cost.test.ts](../tests/instanced-cubes-cost.test.ts)
at the corpus size (WebGPU `attachmentStores: 1`, `transientBytes: 800×600×4` for the frame-sized
depth target; WebGL 2 the same with `transientBytes: 0`) — the number a budget (item 31) is set
against, logged from the example too. **"Both backends" is two authorings of one idea:** a frame is
one language and each backend speaks one, so the example ships a WGSL frame (`selectBackend` routes
it to WebGPU) and a GLSL frame (routed to WebGL 2), drawing whichever the device offers. The two
pictures differ, and that asymmetry is the WebGL 2 backend's today rather than the example's: on
WebGPU each object is a real depth-tested 3-D cube read from a vertex buffer, and on WebGL 2 each is
one instance of the backend's own fullscreen corners, because that backend has no vertex buffer or
depth of its own until item 49. Both are a thousand objects, one pipeline, one instanced draw, one
pass. It reaches the library through the one door and nothing under it (`tests/examples-door.test.ts`
green), type-checks against the real door, and bundles through the door alias. **What the gates
could not see:** that either arm paints a thousand moving objects needs a card or a browser —
`gate:browser` was not run in the unattended session and this machine reaches only SwiftShader
(§17 note 3) — and the "inside the budget of item 31" clause was read forward, since item 31 is open
and cannot publish a budget before the frame it measures exists. See [JOURNAL.md](JOURNAL.md).

### 31. A published budget for a thousand objects

**Status.** lifted to a machine with a real graphics card (the standing job of items 55, 57, 62)

**Asks for.** The first row of the frame budget: counters that are enforced, milliseconds that are tracked.

**Done when.** The counters are asserted in CI and the milliseconds are recorded from real hardware with the device named, and neither is confused for the other.

**Needs.** item 21, item 30.

**Why it is lifted, and how that was established.** The `Done when` is a conjunction, and its
second half — *the milliseconds are recorded from real hardware with the device named* — cannot be
produced on the machine an unattended run has. §17's three harness notes and decision 11's measured
case say why: every headless launch on this Linux machine reaches SwiftShader whatever the flags say,
so any millisecond it printed would be a software renderer's, not a card's, and [CLAUDE.md](../CLAUDE.md)'s
first rule is that a number a gate did not produce may not be quoted. Decision 9 settles this shape
deliberately — *hardware only reports* the milliseconds and *wall-clock p50/p95/p99 is measured on
real hardware and never gated in CI* — so the millisecond half is by design a reading, not an
assertion, and belongs to whoever has the hardware. This is the same standing job as item 55's
wall-clock harness, item 57's device rows, and item 62's GLSL-selects-WebGL-2 reading.
**Unlike item 1** — whose phone-only premise sat in the *consuming* repository's `docs/TESTING.md`
rather than in item 1's own `Done when`, leaving a desktop-checkable clause this repository could
land — item 31 puts the hardware clause **inside** its own `Done when`, so no honest reading marks it
done here. The enforceable-counter half is real, landable CI work and stays tracked under this item:
whoever works it on a card lands both halves in one commit — the counter ceiling for `instanced-cubes`
(item 30's `cost()` is `passes: 1, draws: 1`, already asserted exactly by
`tests/instanced-cubes-cost.test.ts`, so the budget is a ceiling published beside it) and the measured
milliseconds — so that the two are published together and *neither is confused for the other*, which
is the clause a split into two commits would put at risk. **What would change the answer:** a session
on a machine whose `probe()` reports WebGPU returned and survived (item 9), where `instanced-cubes`
(item 30) draws and its per-frame milliseconds can be read with the device named.

---

## Phase 4 — the scene becomes a producer, and the folders move

Closes §3 row 8. Implements the §14 renames while they are still free.

*Exit:* `orbit-shadow` runs on both backends and a scene change is reviewable as a graph diff.

### 32. `sceneView`

**Status.** done

**Asks for.** `sceneView(arena, options).graph(world, views) → FrameGraph`. A producer, importing `graph/` and receiving an arena, reaching no device.

**Done when.** It takes **`views: Camera[]`** rather than one camera; it is unit-tested with no GPU present at all; and a test asserts it imports nothing from `gpu/` or `submit/`.

**Needs.** item 26, item 27.

**Note.** `views` as a list is free now and a breaking signature change after this phase. That is the whole reason it is specified here even though nothing needs two views yet.

**How it landed.** [scene/scene-view.ts](../scene/scene-view.ts) holds
`sceneView<V>(arena, options): SceneView`, exported through the door beside the
engine's other producers. `options` carries the frame-invariant half — the shader
`modules`, the one `pipeline` the world draws through, the `materials` it is fed,
the caller's other `resources` and `uniforms`, and the names of the two buffers the
scene fills — and `.graph(world, views)` is the per-frame half: it batches the world
with `batchOnePipeline` (one pipeline until item 33 lifts it), bakes each drawn
object's record and every view's `viewProjection` into two read-only storage
buffers, and emits a `ShaderFrame` of one instanced render pass. The camera and the
transforms are baked into buffer `data` rather than fed as uniforms, so the graph
alone determines the picture — which is what lets item 34 snapshot it as a text
diff. **`views: Camera[]`** is honoured as a list: one matrix per camera, in order,
a single view being the length-one case, and an empty list refused by name.
**Imports `graph/` and no device:** it names its resident buffers as
`graph/`'s `BufferRef` and reads them back through `isResident`, and every matrix is
worked out on the CPU — no backend, no `submit/`, no `gpu/`. The arena is the
resident lifetime: the two buffers are allocated once and reused while the world
keeps its shape, reallocated only when the object or view count changes, with
`written`/`uploaded` traffic recorded either way.

**Tests, all with no GPU** ([tests/scene-view.test.ts](../tests/scene-view.test.ts)):
the emitted pass, pipeline and modules; each object's baked world matrix and colour
in draw order; one view-projection per camera for one and for two cameras; the
carried-through resources, uniforms, `requires` and `present`; the empty-views and
non-batchable-scene refusals; the arena reuse-and-reallocate behaviour read off its
traffic and dispose count; and a static-analysis assertion that the source imports
nothing from `submit/` or `gpu/`. `scene/scene-view.ts` is added to
[tests/import-graph.test.ts](../tests/import-graph.test.ts)'s shipping closure. 669
node tests green (+11), type-check green, `gate:pack` green at the moved export
surface. **What the gates could not see:** that a frame `sceneView` emits *draws*
needs a card or `gate:browser` (neither run here) — but nothing it emits is new to
either backend (it is the geometry-with-storage-buffer shape the corpus already
draws), and its whole output is data the node suite reads directly. See
[JOURNAL.md](JOURNAL.md).

### 33. `batchOnePipeline` loses its restriction

**Status.** done

**Asks for.** The one-pipeline rule goes, because the reason for it — no per-draw data — is gone.

**Done when.** A scene spanning two pipelines produces one graph, and the ordering is the producer's to decide rather than a thrown error.

**Needs.** item 32.

**How it landed.** The restriction is lifted where it lived — in `sceneView`, not in
`batchOnePipeline`, which stays as the single-pipeline building block a dozen fixtures
and tests still call and whose "one pipeline" name is honest about what it is.
[scene/material.ts](../scene/material.ts) gains `batchScene(scene, materials): Batch[]`,
one batch per pipeline in the order each is first drawn, and both it and
`batchOnePipeline` now share one `withMaterial` helper so the two authoring refusals — an
object with no material, one naming a material the table does not carry — are written once
rather than in two places (item 19's discipline). The one-pipeline refusal is what
`batchScene` drops: a second pipeline is a further batch, and a scene with nothing to draw
is an empty list rather than a throw (the throw is `batchOnePipeline`'s, where exactly one
pipeline is wanted).

[scene/scene-view.ts](../scene/scene-view.ts) consumes it: `SceneViewOptions` now carries
`pipelines: ScenePipeline[]` — each a pipeline and its own per-object storage buffer and
`pack` — in place of the single `pipeline`/`objects`, and `.graph` emits **one instanced
render pass per pipeline, in the order the producer lists them**. That list order is the
scheduling decision `batchScene` deliberately has no knowledge to make (item 32's note),
so **the ordering is the producer's**: the two-pipeline test draws the same scene twice
with the pipelines listed in each order and the passes flip. A pipeline no object draws
through this frame emits no pass; a material naming a pipeline the producer did not list is
a drawn group with no pass to run in, refused by name before any buffer is filled; two
groups (or a group and the views buffer) naming one buffer would clobber each other within
a frame, so that is refused at construction by name — a silent-wrong-picture path (§3 row
2) closed rather than left. This is a **breaking change to `SceneViewOptions`**, which §17
decision 8 allows before 1.0 and item 38's rename horizon expects.

The export surface moved — `batchScene` and `ScenePipeline` through the door, 53 names now
where there were 51; `gate:pack` green at 53, its own "a two-pipeline scene is refused by
name" check still passing (that is `batchOnePipeline`, unchanged). **What the gates could
not see:** that a two-pipeline frame *draws* two pipelines' pictures needs a card or
`gate:browser` (not run in the unattended session), and no corpus preset carries a
multi-pipeline scene until `orbit-shadow` (item 35) emits one; the node suite reads the
emitted graph as data — passes, pipelines, per-group buffer sizes, draw counts — which is
where a scene's structure is a fact by construction. 678 node tests green (+12),
type-check green. See [JOURNAL.md](JOURNAL.md).

### 34. Golden graph snapshots

**Status.** done

**Asks for.** A producer's output graph, snapshotted as JSON.

**Done when.** Every scene preset carries a snapshot, and a change to `sceneView` shows as a text diff with no GPU, no browser and no picture to squint at.

**Needs.** item 32.

**How it landed.** [fixtures/scene-presets.ts](../fixtures/scene-presets.ts) holds the
scene presets `sceneView` is snapshotted against — `panels` (one pipeline, one view),
`stereo-panels` (the same world under two cameras, so the `views: Camera[]` list bakes
two view-projection matrices, item 32), and `spanning` (two pipelines, one instanced
pass each in the producer's listed order, item 33) — each a deterministic world, camera
set and `SceneViewOptions`, built on a fresh arena so no preset's snapshot depends on a
buffer a previous one left resident. [tests/scene-snapshots.test.ts](../tests/scene-snapshots.test.ts)
runs each preset's graph through a JSON serializer and writes it to a golden file with
vitest's `toMatchFileSnapshot` (one golden per preset under `tests/snapshots/scene/`, e.g.
[tests/snapshots/scene/panels.json](../tests/snapshots/scene/panels.json)), so a change to
`sceneView` that moves any preset's emitted graph fails the run until the golden is
regenerated deliberately (`vitest run -u`) — decision 8's "golden snapshots are
regenerable fixtures", literal JSON a reviewer reads as a text diff. A resource's baked
`data` (a `Uint8Array` of the bytes a backend would upload) is rendered as the `f32`
values it stands for — every scene buffer holds world matrices and colours — so a moved
object or a changed colour shows as a changed number rather than a wall of bytes. A
coverage test asserts the golden files on disk are exactly the presets, so a new preset
cannot land unsnapshotted and a removed one cannot leave a stale golden (the rule
`tests/cost-corpus.test.ts` holds over the cost table). No GPU, no browser: the graph is
CPU-only data, identical on any machine, which is the producer/backend split item 32
established. The export surface did not move (fixtures and tests only), so `gate:pack`
was not required; 682 node tests green (+4), type-check green. See [JOURNAL.md](JOURNAL.md).

### 35. `examples/orbit-shadow`

**Status.** done

**Asks for.** An orbit camera, one shadow-casting light, around fifty objects.

**Done when.** It runs on both backends. **This is Phase 4's exit criterion.**

**Needs.** item 32, item 34.

**How it landed.** [examples/orbit-shadow/main.ts](../examples/orbit-shadow/main.ts) is the
fifth example and the first to draw a scene through the tier's producer rather than a
hand-written description: `sceneView(arena, options).graph(world, [camera])` (item 32) turns a
forty-nine-cell grid into a frame of **two instanced passes** (item 33) — a shadow pass and a
lit pass, in the order the producer lists them, shadows first and lit objects over them. **The
shadow-casting light** is a directional light whose planar projection onto the ground plane
`y = 0` (`groundShadow`) is baked into the shadow pipeline's per-object buffer, so the light is
data the graph carries rather than a second render target — expressible through `sceneView`'s
output today and snapshot-diffable the way item 34's presets are. **The orbit** is the camera
rebuilt each animation frame with `surface.setArtefact(build(theta))`, off one arena whose
resident buffers are reused while the world keeps its shape — the honest cost of a producer
whose output is data (item 32), and what this exit criterion exists to exercise. **Both
backends** are two authorings of one idea: a WGSL scene (`selectBackend` routes it to WebGPU)
and a GLSL fullscreen approximation (routed to WebGL 2, which has no scene tier of its own until
Phase 5), drawn whichever the device offers.

**What the door was missing, now fixed.** `sceneView` takes an `Arena`, but `Arena` was not
exported through the door, so a door-only consumer could not build one to call the producer —
the exit criterion surfaced an incomplete public surface. `Arena` (and its `Handle` type) are
now exported; `gate:pack` green at 54 door names where there were 53. See item 65 for the
depth-attachment gap the same example surfaced.

**What the gates could not see.** "Runs on both backends" needs a card or `gate:browser`,
neither run in the unattended session (this machine reaches only SwiftShader, §17 note 3): the
node suite reads calls off the doubles and does not execute the example, which is exercised only
by `npm run example orbit-shadow` in a browser. What is verified here is that it bundles through
the door alias (esbuild, door-only imports, `tests/examples-door.test.ts` green), type-checks,
and that the frames it builds are well-formed data — `cost(build(0))` and `cost(glslFrame)`
compute, `selectBackend` routes the WGSL frame to WebGPU given an adapter and the GLSL frame to
WebGL 2. Three things are card-gated beyond drawing at all: that the shadow pass's output
survives under the lit pass (the colour load-versus-clear between two passes over one target,
item 1's territory); that `setArtefact` re-uploads the changed storage buffers each frame so the
camera visibly orbits; and that overlapping objects order correctly — which they cannot without
depth, item 65. See [JOURNAL.md](JOURNAL.md).

### 36. `examples/gltf-cube`

**Status.** done

**Asks for.** An asset arriving after the page opened, loaded by the example rather than by the library, which is where decision 5 puts it.

**Done when.** The mesh appears mid-session and the library contributed no parser.

**Needs.** item 11, item 32.

**How it landed.** [examples/gltf-cube/main.ts](../examples/gltf-cube/main.ts) is the sixth
example and the first to draw a mesh that is not in the page when it opens. **The asset arrives
after the page opened:** the surface is built and `start()`ed on a WGSL "loading" fullscreen frame
first, so the page is live and drawing before any mesh exists; then `loadCubeMesh()` `fetch`es a
standards-valid glTF 2.0 document — a unit cube with per-face normals, embedded whole as a
`data:model/gltf+json` URI whose binary buffer is a nested base64 `data:` URI, the way glTF allows —
parses it, and `surface.setArtefact` swaps in the scene that draws it. A `data:` URI is a genuine
asynchronous `fetch` resolving on a later task, so the mesh is absent at first paint exactly as a
networked `.gltf` would be, and it **appears mid-session** as a visible swap on the running surface.
The swap uploads the new vertex and index bytes into the already-live surface, which is item 11's
queued-upload path ordering them before the draw. **The library contributed no parser:** the door
ships none (`grep` finds no gltf/glb/parser in the shipping tree), so the example writes the small
one its own asset needs — one mesh, one primitive, `POSITION`/`NORMAL` as `float` `VEC3`, indices as
`unsigned short`, each read through its buffer view into the fetched buffer bytes, everything else
refused by name — which is the honest test of decision 5: drawing a loaded mesh needed no `gltf()`
door. The mesh is drawn through `sceneView` (item 32): the loaded cube is one entity in a one-object
world, its model matrix and the camera's view-projection baked into storage buffers, emitted as one
instanced indexed pass (`passes: 1, draws: 1`), the cube spun by rebuilding the graph each frame over
the arena's reused buffer. **"Both backends" is two authorings of one idea:** the scene tier's
storage buffers are WebGPU's until Phase 5, so the WGSL scene draws the loaded mesh on WebGPU and the
WebGL 2 arm fetches the asset too (proving the load is cross-backend) then draws a raymarched-cube
stand-in — that asymmetry is the backend's, not the example's. It reaches the library through the one
door and nothing under it (`tests/examples-door.test.ts` green), type-checks against the real door,
and bundles through the door alias (esbuild, 128 KB).

**What the gates could not see.** "The mesh appears mid-session" and that either arm *draws* need a
card or `gate:browser`, neither run in the unattended session (this machine reaches only SwiftShader,
§17 note 3): the node suite reads calls off the doubles and does not execute the example. What is
verified here is that the library ships no parser (grep), that the example's parse logic reads this
asset's accessors correctly (24 positions, 24 normals, 36 indices, max index 23 — checked with node's
own `fetch` over the same `data:` URIs), that the frame `sceneView` emits for the parsed mesh is
well-formed data the door accepts (`cost` computes `passes: 1, draws: 1`, indexed geometry preserved),
that it bundles and type-checks. Three things are card-gated beyond drawing at all: that the loading
frame is live before the mesh arrives, that `setArtefact` re-uploads the geometry so the mesh appears
mid-session, and that the toy-frame-to-scene-frame swap builds a fresh program on the live WebGPU
surface. See [JOURNAL.md](JOURNAL.md).

### 37. The folders move

**Status.** done

**Asks for.** The layout of §7: `graph/`, `gpu/`, `resource/`, `pipeline/`, `submit/`, `toy/`, `scene/`, `host/`, `trace/`.

**Done when.** No file sits in `renderer/` or `engine/`, and the move commit changes no logic.

**Needs.** item 32. **Not earlier:** Phase 4 is when what each folder owns is known, and renaming before it is guessing.

**How it landed.** `renderer/` and `engine/` are gone; their twenty files sit in the §7
folders, each placed by what it owns rather than by when it was written (§7 rule 5). The
graph contract and the three pure functions over it are `graph/`: `types.ts`, `validate.ts`,
`cost.ts`, `refusal.ts`, and item 1's `attachments.ts` join `handles.ts`, `refs.ts`,
`capability.ts` already there. The card is `gpu/`: `webgpu.ts`, `webgl2.ts`,
`webgpu-device.ts`, `select.ts` (§11 names it `gpu/select.ts` outright), and the backend
coordinator renderer/index.ts becomes `gpu/renderer.ts` — the one rename, because a
gpu/index.ts would read as a barrel it is not. The only DOM is `host/`: `surface.ts` and
`probe.ts` (its `browserProbeHost` reaches `document`). The recording double and the
painted-frame reading are `trace/`: `trace.ts` and `frame-coverage.ts`. The toy-tier frame
builders are `toy/frame.ts`. The scene producers are `scene/`: `scene-view.ts`, `material.ts`,
`draw-list.ts`, `scene.ts`, `maths.ts`. `resource/`, `pipeline/`, `submit/` were already in
place.

**No logic moved, and the diff proves it.** Every moved file's only change is its import
specifiers — `git diff -M --numstat` shows each rename at 0–3 lines added-and-deleted, and
each of those lines is a `from '…'` or `import('…')` path (the one exception is a stale
`scene/material.ts` comment in `scene-view.ts`, and a two-line `scene-view.ts` counts one
import plus that comment). The rewrite was mechanical: a script recomputed a relative
specifier only where the importing file **or** its target moved, leaving every other
specifier byte-for-byte — so an extensionless test import like `'./support/fake-gpu'` kept
its exact text and `gates/pack.sh`'s `sed` still matched it. The door
([index.ts](../index.ts)) re-exports the same fifty-four names from the new paths, so the
export surface did not move (`gate:pack` green at 54, all 11 checks). The path-carrying
gates and configs moved with the files: `tsconfig.build.json`/`tsconfig.json` `include`
globs, [tests/import-graph.test.ts](../tests/import-graph.test.ts)'s `SHIPPING` list and
its eager-graph roots, every gates/\*.mjs `loadFromRoot` string, and the two tests that
statically read a file by path ([tests/scene-view.test.ts](../tests/scene-view.test.ts)'s
producer-import assertion, [tests/docs-paths.test.ts](../tests/docs-paths.test.ts)'s
live-label fixture). The docs the path gate reads — this file, `RoadToPureEngine.md`,
`ABSTRACTION.md`, `RENDERER-DESIGN.md` — had their linked and backticked paths rewritten;
`JOURNAL.md` was left untouched, because it is a dated record and the path gate skips it by
design.

**What the gates could not see.** The move is exercised entirely by the cheap gates —
682 node tests green, `type-check` green, `gate:pack` green — because a file's location and
its import paths are exactly what a compiler and a resolver check. `gate:browser` was not
run in the unattended session; it is unaffected by construction, since no device call, no
frame and no exported name changed, only where the files sit. **One thing left inexact on
purpose:** the `file.ts:line` suffixes in `RoadToPureEngine.md`'s §2/§3 debt tables now
carry the new path with the *old* line number, which is close (only near-top import lines
shifted) but not re-measured; the path gate strips the suffix before resolving, so it does
not read them, and re-pinning every line number is not this move's job. See
[JOURNAL.md](JOURNAL.md).

### 38. The mechanical §14 renames

**Status.** lifted needs decomposition

**Asks for.** The rows of [RoadToPureEngine.md](RoadToPureEngine.md) §14 that are renames and nothing else: `ShaderFrame` to `FrameGraph`, `setArtefact` to `setGraph`, `artefact` to `graph` or `variant`, `Extent` to `{ scale } | { width, height }`, `Dispatch` to `groups`, and `ModuleSpec.overrides` to `constants`. The README and both design documents follow.

**Done when.** None of those six names survives, and no behaviour changed with them — the browser batch still reports 15 of 15 traces agreeing, which is what a rename must not move.

**Needs.** item 37.

**Five rows of §14 are not renames, and each has its own item.** This entry has been cut back twice, and the second cut is the instructive one. It first asked for the whole table; a run stopped and named two rows blocked on Phase 5, which became item 66. It then asked for everything else; a second run stopped and showed that three of the remaining rows are architectural refactors wearing a rename's clothes — verified against the tree rather than taken from §14's "mechanical" label:

| row | why it is not a rename | item |
| --- | --- | --- |
| `FrameDescription` folded into `FrameGraph` | `graph/types.ts` still keys every resource by `name: string`; the fold needs the graph-to-handle migration item 17 deferred | 67 |
| `ShaderProgram` deleted | there is no `submit(graph)` primitive to become; deleting the interface means building one and rerouting the surface and host through it | 68 |
| `unreached()` and `ShaderFrame.uniforms` to `reflect()` | swaps a runtime query on a compiled program for static source reflection, and removes methods from the backend interface | 69 |

**The lesson is about the queue rather than the renames.** §14 is a *design* table: it says where names are going, and it is right about that. It is not a work breakdown, and treating a table row as an item is what produced two stops. A row earns an item when someone has read the tree and knows what it costs.

**Lifted 2026-08-25, the third cut, because two of the six it kept are not renames either.** The second cut removed three architectural rows; it left `Extent` and `Dispatch` in, and both are refactors wearing a rename's clothes by the same test the second cut used — read against the tree, not taken from §14's "mechanical" label:

| row | why it is not a rename | item |
| --- | --- | --- |
| `Extent = number \| 'frame'` to `{ scale } \| { width, height }` | `TextureResource.size` is a per-axis pair `[Extent, Extent]`; the target is a whole-size object, so the field's shape changes, not its name. Every use in the tree does map 1:1 (`['frame','frame']` → `{ scale: 1 }`, `[64,64]` → `{ width: 64, height: 64 }` — no mixed `[n,'frame']` anywhere), so it is behaviour-preservable, but it rewrites the shape `item 67` migrates and belongs beside it | 71 |
| `Dispatch = … \| 'frame'` to `groups: [n,n,n] \| { indirect }` | the target **drops** `'frame'` and `{ over }`, whose group counts `gpu/webgpu.ts` computes from the runtime frame size; making the name not survive means moving that computation to producers — a capability change, which contradicts this item's own "no behaviour changed". Used today by `core-compute`, `core-storage-pingpong`, `compute-field` and many tests | 72 |

**The four rows that are genuine renames** — `ShaderFrame` to `FrameGraph`, `setArtefact` to `setGraph`, `artefact` to `graph`/`variant`, and `ModuleSpec.overrides` to `constants` — are separable and doable now against the tree. They carry across to **item 70**, which is what items 66, 67, 68 and 69 now name in place of this one: what they needed from this item was those four names landed, and a `lifted` item never satisfies a `Needs`. The number 38 is not reused, per the address rule.

### 39. The layer rules become tests

**Status.** done

**Asks for.** [tests/import-graph.test.ts](../tests/import-graph.test.ts) enforces §7: `graph/` imports nothing, no producer imports `gpu/` or `submit/`, nothing below `host/` requires a DOM object, and **`host/loop.ts` imports only the package's own public exports.**

**Done when.** Each rule fails the test when deliberately broken, verified once per rule.

**Needs.** item 37.

**Note.** That last rule is what makes decision 7's promise mechanical: a written commitment that `loop` holds no logic `submit` lacks decays, and an import rule does not.

**How it landed.** [tests/import-graph.test.ts](../tests/import-graph.test.ts) gains four
describe blocks, one per rule, each walking the parse tree rather than matching text.
**Rule 1** (`graph/` imports nothing outside itself) was **violated** before this item:
`graph/types.ts` imported `FrameTraffic` from `resource/arena.ts`, the one cross-layer edge
in all of `graph/`, flagged in item 37's [JOURNAL.md](JOURNAL.md) row as this item's to
sever. `FrameTraffic` is a pure data interface and part of the `Backend` contract, which
already lives in `graph/types.ts`, so it moved there and the arena now imports it from
`graph/` — the allowed direction, since `resource/` is below `graph/`. It is not a door
export, so the surface did not move. **Rule 2** (no producer imports `gpu/` or `submit/`)
and **rule 3** (nothing below `host/` requires a DOM object) held already: producers reach
only `graph/` and `resource/` (an `Arena` parameter), and every backend canvas signature is
`HTMLCanvasElement | OffscreenCanvas`, which accepts a worker surface rather than requiring
the DOM one. Rule 3 checks DOM types in **signature position**, because §7 rule 3's own
example of the violation is "a signature that demands an `HTMLCanvasElement`" and because the
word `document` is a shader document all over these files in value position — a value scan
could not tell the two apart. **Rule 4** (`host/loop.ts` imports only the package door) guards
a file that does not exist yet — the loop arrives with `submit(graph)`, item 68 — so its live
check passes vacuously and stands ready for when the file lands, which is decision 7's "a test
rather than a discipline". **Each rule was verified to fail when broken, once:** a stray
`resource/` import in `graph/validate.ts` (rule 1), a `gpu/webgpu.ts` import in `toy/frame.ts`
(rule 2), stripping `OffscreenCanvas` off a `gpu/webgl2.ts` canvas param (rule 3), and a
`host/loop.ts` importing `gpu/renderer.ts` (rule 4) each turned the suite red, and each was
reverted. **What the cheap gates could not see:** nothing here — these are node tests reading
the tree's own import edges and AST, which is exactly what runs. 686 node tests green (was
682), `type-check` green; the door did not move (`FrameTraffic` was never on it), so
`gate:pack` was not required. See [JOURNAL.md](JOURNAL.md).

---

## Phase 5 — WebGL 2 becomes a real backend

Two halves, and 5a comes first because the backend is worth nothing without shaders to feed it. Implements decisions 1 and 2.

*Exit:* every corpus preset either draws byte-identically from one WGSL source or is named on the widened list with a cause and its readings; the same scene graph draws on both backends; a compute graph is refused by name.

### 40. Choose the translator

**Status.** lifted to a machine (or attended run) with a Tint build

**Asks for.** Naga against Tint, evaluated on this corpus rather than on reputation.

**Done when.** Every corpus preset is run through both, the failures of each are listed, and the choice is recorded with the readings behind it.

**Needs.** Nothing.

**Note.** This is where decision 2's risk is discovered or dismissed. The whole WebGL 2 story rests on one translator; if it cannot carry the scene tier, decision 1 degrades to toy-tier-only by construction rather than by choice. Hit that wall here, while turning back is cheap.

**Why it was lifted, 2026-08-25.** The `Done when` is a conjunction — *both* translators run over the whole corpus — and only one of the two is obtainable on the machine the loop runs on. This is a comparison; it cannot be done half, and running Naga alone and calling it a choice would be quoting a number no gate produced for the losing side. **How established nothing here can:**

- **Naga is here for the asking.** `cargo`/`rustc` are on this machine and `cargo search naga-cli` returns `naga-cli = "30.0.1"` on crates.io, so `cargo install naga-cli` (its `--target glsl` writer is the WGSL→GLSL path this item needs) is a few minutes of compile away.
- **Tint is not, and not by a route an unattended run may take.** Tint ships only inside Google's Dawn tree; it is published to neither npm (`@webgpu/tint` 404s; the `tint` npm package is an unrelated image-tinting library) nor crates.io. Building it needs `depot_tools` (`gclient`/`gn` both absent here) plus a `gclient sync` pulling gigabytes of Dawn's dependencies and an hours-long C++ build whose success is not guaranteed on this box — not reproducible work for a headless session, and heavier than the item's own "while turning back is cheap" contemplates.

**Rescoped 2026-08-25: this item no longer blocks Phase 5.** It asked two questions at once — *is there a translator that carries this corpus* and *which of two is better* — and only the first blocks anything. The first is now item 75, runnable here today. This item keeps the comparison, stays lifted, and is no longer in any other item's `Needs`.

**What would settle it.** An attended session (or a machine) carrying a working Tint binary — from a Dawn build or a trusted prebuilt — so both translators run the fifteen corpus WGSL presets to GLSL, each translator's failures are listed, and the choice is recorded with the three-number readings (item 44's shape) behind it. Naga's half is landable there in minutes; Tint's build is the whole of the cost, and it is a person's call to pay it, not an unattended run's. The corpus inputs already exist under `fixtures/source/` (`fixtures/capability-fixtures.ts` names all fifteen and `tests/support/fixture.ts`'s `sourcePath` resolves them), so nothing but the Tint binary blocks the reading.

### 41. The build-time translation path

**Status.** done

**Asks for.** Every shipped material and every corpus preset translated once by a build step, the result carried in `ShaderSource.glsl`.

**Done when.** A scene-tier consumer on WebGL 2 downloads no translator, and a shader that will not translate **fails the build** rather than the page.

**Needs.** item 75. **Not** item 40: what these need is a translator known to carry the corpus, which is item 75. Item 40 chooses between two and is a separate, heavier question — see item 75 for why the two were split.

**How it landed.** [gates/translate.mjs](../gates/translate.mjs) is the build step (`npm run
translate`): it reads the fifteen corpus WGSL presets, finds every entry point, and translates each
to **GLSL ES 3.00** — WebGL 2's profile — with naga, a dev-time tool that never ships (§17 decision
5 keeps `dependencies` at `{}`). Of the 34 entry points, **25 translate and are baked**; the other
9 are refused before translation because WebGL 2 lacks the capability — 4 compute stages, 3 vertex
stages reading a storage buffer, 2 fragment stages reading a storage texture — the exact es300
breakdown item 75 recorded, mapped to the `compute`/`storage-buffer`/`storage-texture` names §10 and
`refusal()` use. **A shader that will not translate for any other reason fails the build**, the step
exiting non-zero with naga's message so the construct is named (demonstrated against a real naga
refusal; the fail/skip/bake classifier is pinned in the node suite without naga). The bake travels
in [fixtures/source/glsl/corpus.generated.json](../fixtures/source/glsl/corpus.generated.json) — the
concrete "result carried" — so a running page reads GLSL, not the translator, which is the "downloads
no translator" half: the translator is a build-time tool and nothing shipped names it
([tests/translate-build.test.ts](../tests/translate-build.test.ts) asserts no shipped source or
`dependencies` entry does). **Scope, and what the gates could not see:** the corpus is fixtures (not
shipped) and this library ships no producer material with embedded WGSL yet, so the bake lives beside
the corpus rather than in `dist`; §9's `ShaderSource`/`GlslPair` type is not in the code and the
Done-when does not need it; the runtime WebGL 2 backend does not yet consume the bake (items 46–52),
and that the baked GLSL draws the same picture on a card is item 44's, unrun here. See
[JOURNAL.md](JOURNAL.md).

### 42. The on-demand translator chunk

**Status.** done

**Asks for.** The editing path: someone typing WGSL on a WebGL 2 device gets translation while the page runs, fetched by `await import()` in its own chunk.

**Done when.** A bundle analysis shows the translator absent from the first download, and the editing path still works.

**Needs.** item 75. **Not** item 40: what these need is a translator known to carry the corpus, which is item 75. Item 40 chooses between two and is a separate, heavier question — see item 75 for why the two were split.

**How it landed.** Two files and one boundary. [resource/translator.ts](../resource/translator.ts)
is the chunk — the `TranslatorEngine` interface (`translate(wgsl, entry) → GLSL ES 3.00`),
the `EntryPoint` type (`vertex`/`fragment`, never `compute` — GLSL ES 3.00 has no compute
stage, §17 decision 6), and `defaultEngine`, which is **null** until item 40 wires the wasm
engine behind this same boundary. [resource/editing.ts](../resource/editing.ts)'s
`translateForEditing(wgsl, entries, opts)` is the editing path: it reaches the chunk only by
`await import('./translator.js')` — the same dynamic import `gpu/renderer.ts` fetches a backend
through — so a bundler splits it off, and it translates each entry point through the engine the
fetch returns. A shipped scene never enters here (its materials were translated at build time,
item 41); the toy-tier editor enters on the first WGSL edit and pays the one fetch. Neither is
re-exported through the door (§11: the translator is never named by a consumer), so the export
surface did not move.

**The bundle analysis, clause one.** [gates/chunk.mjs](../gates/chunk.mjs) bundles a first-download
entry that imports the editing path, with esbuild's code splitting on, and reads the metafile:
the translator is its own output chunk, reached from the entry by a **`dynamic-import`** edge,
and its source is **absent from the entry chunk's own bytes**. All three hold, so the translator
is not in the first download. [tests/editing-chunk.test.ts](../tests/editing-chunk.test.ts) drives
the gate through a subprocess (the shape `translate-build.test.ts` drives `translate.mjs`) and
reads its verdict back. esbuild is a dev tool and never ships.

**The editing path, clause two.** Driven the way every card-adjacent path in this tree is proven
on a machine with no card — the engine is handed in, and the mechanism above it is what runs.
[tests/editing-path.test.ts](../tests/editing-path.test.ts) shows the path fetches the chunk
through a loader (standing in for `await import()`), reads its engine, and translates each entry
point in order; and that reaching it with the chunk's real null `defaultEngine` is a refusal
**naming item 40** rather than a null-call crash.

**What the gates could not see.** The concrete WGSL→GLSL engine is item 40's (naga or tint, the
Stage 5a choice §17 lists as open), so the shipped `defaultEngine` is null: runtime translation
of *novel* WGSL does not function until that engine lands behind this boundary — what this item
delivers is the on-demand chunk boundary, its bundle split, and the path that drives whatever
engine fills it. That the translated GLSL then *draws* on a WebGL 2 card is unrun here (no card,
`gate:browser` not run) and waits on the WebGL 2 backend consuming a translation (items 46–52),
exactly as item 41's build-time bake waits on the same. See [JOURNAL.md](JOURNAL.md).

### 43. Refusal by named construct

**Status.** done

**Done when.** A WGSL source using something the translator cannot carry is refused with the construct named, at build time where a build can see it.

**Needs.** item 41.

**How it landed.** §9.1's second consequence: some WGSL will not translate and must be
*refused by name at build time with the construct named, in the same vocabulary as §10*.
Item 41 landed the build ([gates/translate.mjs](../gates/translate.mjs)) that **fails** on an
untranslatable shader, but proved it only against an ad-hoc naga refusal in its landing session —
no untranslatable source was committed, so the fail-by-named-construct path had no standing gate.
This is that gate, in three parts. **The naming:** `namedConstruct(message)` turns a naga refusal
into the construct it is about — `Features(CUBE_TEXTURES_ARRAY)` → `cube-array texture`, `GLSL has
no 16-bit float type` → `16-bit float (f16)` — and the build's `classify` fail path now carries
that name rather than naga's raw diagnostic. A message no row recognises still **names** the
construct: a `Features(X)` message surfaces its flag `X`, anything else falls back to naga's own
wording (which names what it refused), so a new untranslatable construct is a build failure that
names something rather than a silent pass. **The fixtures:** two committed WGSL sources under
`fixtures/source/untranslatable/` — [cube-array.wgsl](../fixtures/source/untranslatable/cube-array.wgsl),
a cube-array texture, and [f16.wgsl](../fixtures/source/untranslatable/f16.wgsl), an f16 value — each
parsing as valid WGSL and refused by naga's GLSL ES 3.00 writer for a reason that
is **not** one of the three §10 capabilities (`compute` / `storage-buffer` / `storage-texture`)
item 41 maps to a *skip*; they live outside the 15-preset corpus so `npm run translate` never picks
them up. **The gate:** [tests/untranslatable.test.ts](../tests/untranslatable.test.ts) drives the
build's own `classify` over the messages naga really produced and asserts each is refused (`action:
'fail'`) with the construct named — no naga needed, so it runs on a clean CI machine — plus a
naga-guarded reading that re-runs the fixtures through **live naga** (`decideEntry`) and asserts the
same, so the recorded messages cannot silently drift from what naga refuses today.

**What the gates could not see.** Nothing this run reached is card- or browser-only: `namedConstruct`
and `classify` are pure, and the live-naga arm actually ran here (naga-cli 30.0.1 on PATH), refusing
both fixtures with the recorded messages. What a clean CI machine cannot see is that live-naga arm
— it skips where naga is absent, falling back to the recorded messages, which is why the record is
re-checked against live naga wherever a dev machine runs the suite. A future naga whose es300 writer
carries `f16` or cube-array textures would make a fixture translate instead of refuse and redden the
live arm — the right signal, since the fixture would no longer be untranslatable. 734 node tests
green (was 730), `type-check` green (the `.mjs` gate harness is type-checked, item 76, so the new
JSDoc in `translate.mjs` is covered); the export surface did not move (a gate, fixtures and a test;
no door name added), so `gate:pack` was not required. See [JOURNAL.md](JOURNAL.md).

### 44. The three-number cross-backend comparison

**Status.** done

**Asks for.** Hard jumps per frame, counted independently per frame and compared as counts rather than as a diff of the two frames; maximum per-channel delta; channels differing at all.

**Done when.** All three are reported on every comparison, and **a per-channel average is no longer a primary reading** — it cannot tell small error spread thin from a picture cut into visible blocks, which is exactly the 7,537-against-292 case recorded in decision 4's amendment.

**Needs.** item 41.

**How it landed.** [gates/compare.mjs](../gates/compare.mjs) holds `compareFrames(a, b, width,
height)`, a pure function over two RGBA byte frames returning exactly the three numbers §17's
amendment prescribes and **no average**: `hardJumps: { a, b }` (a pixel more than `HARD_JUMP`
= 40 from its left neighbour on any colour channel, counted **independently per frame** and
returned as two counts rather than a diff of the two frames), `maxDelta` (the worst single
per-channel delta between the frames, which an average buries), and `differing` (colour
channels apart at all — the only one of the three that can say "identical", at zero), beside
`channels` so `differing` reads as a fraction. Alpha is not compared. The card gate's control
comparison ([gates/card.mjs](../gates/card.mjs)) now calls this function — bundled into its
page through `bundleForPage`, so the gate measures the same function the node suite tests
rather than a restatement of it — and prints all three numbers every run whether it passes or
not. The gate's pass bar is unchanged (`maxDelta <= TOLERANCE`, the prior `over === 0` on
tolerance 8, preserved rather than tightened since a card cannot be re-measured here); the
retired reading was `over`, a channels-over-tolerance count, and there was no per-channel
average in the code to retire — the amendment's average is the *primary reading* the metric
must not become, which `compareFrames` now guarantees by construction (it computes no mean).

**What the gates could not see.** `compareFrames` is pure arithmetic over two byte frames and
runs entirely in the node suite ([tests/compare.test.ts](../tests/compare.test.ts), 739 node
tests green, was 738; `type-check` green, `gates/compare.mjs` covered by `checkJs` and its
`window` type added to [gates/globals.d.ts](../gates/globals.d.ts)). The test reproduces both
measured cases of the amendment: a one-pixel spike every tenth pixel gives 0 hard jumps against
198 while a mean stays under 3 (the 7,537-against-292 shape), and 60% of channels apart by 19
gives `differing` over 800,000 of 1,440,000 while `maxDelta` is only 19 (the 822,426 shape a
widened average bar would pass). What no gate here can see is the card gate actually calling it
on two real backends' pixels — `gate:card` never runs unattended (SwiftShader on every headless
launch, §17 note 3) and `gate:browser` was not run this session. The export surface did not move
(a gate helper, a test, and a gate edit; no door name added), so `gate:pack` was not required.
See [JOURNAL.md](JOURNAL.md).

### 45. The widened list

**Status.** done

**Asks for.** One file naming any preset that cannot be byte-exact, with its cause, its date and its readings. Four rules: absence means exact; it is not settable at the preset; **its length is asserted and is currently zero**; the gate prints it every run.

**Done when.** A preset can only be exempted by a diff to that file, an exemption naming a symptom rather than a cause is rejected in review, and the gate output shows the list whether it is empty or not.

**Needs.** item 44.

**Note.** A bar widened by the person it was blocking is relief, not evidence. There is a measured case: a gate once passed a shader at an average channel distance of 19.0 against a bar of 24 while 822,426 of 1,440,000 channels sat over the per-channel tolerance of 8.

**How it landed.** [gates/widened.mjs](../gates/widened.mjs) holds `WIDENED`, the one
file the list lives in, empty and expected to stay so, beside the four rules the
amendment prescribes. **Rule 1 (not settable at the preset)** is a fact about
`CapabilityFixture`: it carries no `exact`/`diverges`/`tolerance`/`skip` field, so a
preset author hitting a divergence has no line to relieve their own pain in — the
only way to exempt a preset is a diff to this shared list;
[tests/widened.test.ts](../tests/widened.test.ts) asserts every fixture is free of
those fields. **Rule 2 (length asserted, currently zero)** is the load-bearing one:
`expect(WIDENED.length).toBe(0)` in the node suite, so growing the list reddens that
line and must update it in the same reviewed diff. **Rule 3 (the gate prints it every
run)** is `printWidened`, which [gates/card.mjs](../gates/card.mjs) calls after the
corpus loop whether the list is empty or not — the correct home, since cross-backend
byte-exactness is only measurable where two backends' pixels meet, which is the card
gate. **Rule 4 (a cause, not a symptom)** is `checkWidened`/`symptomShaped`: a cause
that names only a divergence verb and a backend with no mechanism — the amendment's
own `differs on WebGL 2` — is refused by name, at the gate rather than only at a
reviewer's eye, and the card gate runs `checkWidened` over every entry against the
loaded corpus so a symptom-shaped cause or an id naming no preset reddens it. The
symptom detector is an honest first-line filter for the canonical shapes, not a
decider of every borderline case; rule 2's reviewed diff remains the real guard, as
the module and the JOURNAL row both say. The export surface did not move (a gate file,
a test, and a card-gate edit; no door name added), so `gate:pack` was not required.

**What the gates could not see.** `printWidened` and `checkWidened` are pure, and the
node suite pins their output and every refusal — but the card gate actually printing
the list on two real backends' pixels was not exercised: `gate:card` never runs
unattended (SwiftShader on every headless launch, §17 note 3) and `gate:browser` was
not run this session. The list is empty, so there is no per-preset comparison to run
against it yet regardless; wiring `WIDENED` into a per-preset cross-backend comparison
waits on a WebGL 2 backend drawing the corpus (items 46–52). See [JOURNAL.md](JOURNAL.md).

### 46. WebGL 2: multiple passes

**Status.** done

**Done when.** A two-pass graph draws, and the pass count in `cost()` matches what the backend issued.

**Needs.** item 41.

**How it landed.** The WebGL 2 backend ([gpu/webgl2.ts](../gpu/webgl2.ts)) stopped being a
single fullscreen pass. `program(frame)` now builds a plan per pass — its linked program (still
keyed by `pipelineStructureOf`, so two passes drawing one pipeline link it once), the corners
and instances of its draws, the texture it draws into or the canvas where it names none, the
colour it clears to, and the textures it samples bound to units — and `draw()` walks that plan:
for each pass it binds the target framebuffer (a texture's, or the default), clears it where the
pass says so, binds each earlier pass's texture to a unit and points the sampler uniform at it,
and draws. A frame that names a `present` texture is shown by blitting its framebuffer onto the
canvas; a frame whose last pass drew the canvas directly names none and needs no blit. Textures
and their framebuffers are allocated through two arenas of their own (`Arena<WebGLTexture>`,
`Arena<WebGLFramebuffer>`) beside the existing buffer arena — one per resource kind because
WebGL 2 frees a texture, a framebuffer and a buffer through three different context calls where
WebGPU frees one union through the object — so item 10's stale-handle safety covers them, and a
frame-following target is remade at the new size on a resize. The frame's one uniform block is
bound to point 0 once per linked program at build, so every pass shares the one buffer
`setUniforms` writes (the WGSL model of one uniform buffer read by each pipeline). The refusals
narrowed rather than vanished: a storage texture (no compute stage), a ladder (item 50), several
samples a pixel (item 48), a texture arriving with contents, more than one colour at once (item
47), and depth (item 48) are each still refused by name; a texture used only as an attachment and
a sample is now kept.

**What the gates could see, and what they could not.** The pass count is asserted against
`cost()`: [tests/renderer-webgl2.test.ts](../tests/renderer-webgl2.test.ts)'s two-pass fixture
issues exactly `cost(frame, size).passes` framebuffer binds in `draw()`, so a change adding or
dropping a pass moves both together. The node fake ([tests/support/fake-gl.ts](../tests/support/fake-gl.ts),
now carrying texture/framebuffer/blit calls) proves the first pass draws into a texture the
second samples, the clear, the present blit, the resize-remakes-the-target path, and that every
texture and framebuffer is given back on dispose. **What no gate here could see is that the
resulting two-pass picture is correct on a card:** the fake records calls, not pixels;
`gate:browser` was not run in the unattended session and `gate:card` never runs here (SwiftShader
on every headless launch, §17 note 3). So *that a two-pass graph draws* is by construction plus
`gate:browser`/`gate:card` later, as every prior WebGL 2 item here has been. See [JOURNAL.md](JOURNAL.md).

### 47. WebGL 2: multiple render targets

**Status.** done

**Done when.** A graph writing three attachments draws, and a fourth beyond the device's limit is refused by name.

**Needs.** item 46.

**How it landed.** The WebGL 2 backend ([gpu/webgl2.ts](../gpu/webgl2.ts)) draws a pass
writing several colours at once where item 46 drew one. A pass with more than one colour
attachment allocates a framebuffer of its own through the existing framebuffer arena and
attaches each colour texture at a successive point (`COLOR_ATTACHMENT0 + i`); `draw()` binds
that framebuffer, names the fragment stage's output `i` to point `i` with `gl.drawBuffers`,
and clears each attachment through its own point with `gl.clearBufferfv(gl.COLOR, i, value)`
so two targets can clear to different colours where one `clearColor` could not. A canvas or
single-attachment pass is untouched — it keeps the framebuffer item 46 gave it (its own
per-texture one, or none), so no existing trace moved and only a multiple-target pass builds
one of these; the pass framebuffer is re-attached on a resize beside the textures it holds,
and freed to the arena on dispose. The two item-46 refusals that rejected "more than one
colour" — one on the pipeline's `targets`, one on the pass's `colour` — are replaced by one
device-bounded refusal: the count is checked against `min(MAX_DRAW_BUFFERS,
MAX_COLOR_ATTACHMENTS)` read off the context, and a pass writing more is refused by name with
the ceiling it broke (`the frame for "gbuffer" writes 4 colours at once, and this device draws
to 3`).

**What the gates could see, and what they could not.** The node fake
([tests/support/fake-gl.ts](../tests/support/fake-gl.ts), now carrying `drawBuffers`,
`clearBufferfv` and a per-test ceiling override) proves a three-attachment graph attaches
three textures to the pass framebuffer at three successive points, names them with
`drawBuffers`, clears each through its own point, draws once, and frees the pass framebuffer on
dispose; and that a pass writing one more colour than the device reports is refused by name
with the ceiling ([tests/renderer-webgl2.test.ts](../tests/renderer-webgl2.test.ts)). **What no
gate here could see is that the resulting several-target picture is correct on a card:** the
fake records calls, not pixels; `gate:browser` was not run in the unattended session and
`gate:card` never runs here (SwiftShader on every headless launch, §17 note 3). So *that a
multiple-target graph draws the right pixels* is by construction plus `gate:browser`/`gate:card`
later, as every prior WebGL 2 item here has been. See [JOURNAL.md](JOURNAL.md).

### 48. WebGL 2: depth and stencil

**Status.** done

**Done when.** The depth and stencil presets that WebGPU passes today pass here, and the pixels agree per item 44.

**Needs.** item 46, item 77.

**Re-opened 2026-08-25, unchanged in substance.** The lift was right and it already named its own remedy: item 77, which is now in its `Needs`. It is `open` rather than `lifted` because **`lifted` never satisfies a `Needs`**, so leaving it lifted would have made item 52 permanently unreachable — the whole scene-tier-on-both-backends question hanging on a status word. Nothing about the work changed; only that the queue can now reach it once item 77 lands.

**Lifted 2026-08-25: this asks for work its `Needs` never named — the WebGL 2 backend
cannot draw the vertex geometry these presets are built on.** The two presets WebGPU
passes are `core-depth` and `core-stencil` ([fixtures/capability-fixtures.ts](../fixtures/capability-fixtures.ts)),
and **both draw a `quad-grid` `sheet` of the shader's own geometry** — `core-depth`'s two
leaning sheets, `core-stencil`'s turned sheet for its `marking` pass. The WebGL 2 backend
draws only its own fullscreen corners and **refuses any pass whose draw walks a buffer**
(`gpu/webgl2.ts`, the `drawsCorners` refusal: *"draws geometry of its own, and this backend
has no buffer for it"*). So neither preset can be reached, let alone depth-tested, until the
backend draws vertex geometry — and that path is delivered by **no item**: item 49's own
`Done when` draws `instanced-cubes` through the backend's fullscreen corners plus
`gl_InstanceID` (item 28), *not* a vertex buffer, as `examples/instanced-cubes/main.ts` states
in as many words (*"item 49 is where it gains one"*, but its exit criterion never forces it).
That geometry path is separable and is now **item 77**, which this item's `Needs` gains.

**What is separable, and what remains item 48's once item 77 lands.** The depth-attachment
and depth-test state (a depth renderbuffer, `gl.enable(DEPTH_TEST)`, `depthFunc`, `depthMask`)
and the stencil-attachment and stencil ops (`stencil8`, `stencilFunc`/`stencilOp` for `mark`
and `inside`) are the coherent capability this item keeps — two halves of one depth/stencil
attachment, the shape items 46/47 each added for their own capability. They can only be
exercised on a preset that draws geometry, so they wait on item 77. The `pixels agree per
item 44` half is a card's or a browser's, as every WebGL 2 item's pixel-agreement is (§17
note 3; items 46/47 landed their call-level behaviour and deferred pixels the same way).

**Reverse.** Set `Status` back to `open`, drop `item 77` from `Needs`, and delete this note.
The item is workable once item 77 has drawn a geometry preset on WebGL 2.

**How it landed.** The WebGL 2 backend ([gpu/webgl2.ts](../gpu/webgl2.ts)) tests depth and masks
with a stencil where it refused both before. A texture declared in a depth or stencil format
(`depth24plus`, `stencil8`, the combined `depth24plus-stencil8` kept for shape) is built as a
**renderbuffer** through a fourth arena of its own — beside the buffer, texture and framebuffer
arenas, since WebGL 2 frees a renderbuffer through its own context call — rather than the RGBA8
sampled texture a colour attachment becomes; nothing here samples a depth, so a renderbuffer is
its home. It follows the frame like the colour targets, so it is respecified at the new size on a
resize and re-attached beside them, and one renderbuffer stands for the resource however many
passes attach it, so the second pass tests against the depth the first left. Each depth-carrying
pass attaches the renderbuffer to the framebuffer it draws through — a single target's own or the
multiple-target one (item 47) — at the point its format keeps (`DEPTH_ATTACHMENT`,
`STENCIL_ATTACHMENT`, `DEPTH_STENCIL_ATTACHMENT`); a depth pass drawing the frame directly is
refused by name, since a depth buffer cannot attach to the canvas. The state a pipeline tests
under is set every pass of a depth frame, because a real context leaks it between passes: the
depth test on with the pipeline's `compare` mapped to the card's enum and `write` to `depthMask`,
the stencil test on with the mode's `stencilFunc`/`stencilOp`/`stencilMask` — `mark` replacing the
reference everywhere it draws, `inside` drawing only where the reference is and keeping the mask,
the same `STENCIL_MODES` the WebGPU backend uses so the two agree on what a mark leaves — and each
turned off where a pass tests neither. The pass empties its depth or stencil first through the
buffer kind its format keeps (`clearBufferfv`/`clearBufferiv`/`clearBufferfi`) where it clears,
and keeps what an earlier pass left where it does not. **A frame that tests nothing sets none of
this**, so every fullscreen toy the backend drew before is byte-identical in its call stream.

**What the gates could see, and what they could not.** The node fake
([tests/support/fake-gl.ts](../tests/support/fake-gl.ts), now carrying the renderbuffer,
depth/stencil-state and typed-clear calls) drives two hand-authored frames built the way the build
assembles `core-depth` and `core-stencil` — the real `quad-grid` sheet, two passes sharing one
depth/stencil renderbuffer ([tests/renderer-webgl2.test.ts](../tests/renderer-webgl2.test.ts),
reached through the node fast suite rather than the dead corpus loader, item 64, as items 46/47/77
were). It asserts the renderbuffer stores the format at the frame size and attaches at the depth or
stencil point, the depth test enables with `less` and both a write-on and a write-off `depthMask`,
the far-plane clear, the resize respecify, the renderbuffer freed once; and for the mask the two
modes' func/op/mask in the card's own fields, the stencil enable, and the zero clear. **What no
gate here can see is that the resulting depth-tested and masked picture is byte-correct on a
card** — the fake records calls, not pixels; no browser gate reaches this backend until item 79
lands the harness, and `gate:browser`/`gate:card` were not run in the unattended session. So *that
the pixels agree per item 44* is a card's or a browser's, per §17 note 3, exactly as every prior
WebGL 2 item here; the presets draw at call level and their depth/stencil behaviour is pinned, and
pixel-agreement waits on the same gate the whole WebGL 2 column waits on (item 79, then a card for
item 44 proper). Blend on a colour target (`core-depth`'s second pass mixes with `over`) and MSAA
(`samples`) are separate capabilities this backend still refuses — MSAA is now item 80, filed
below, since resolving item 48 as depth/stencil left the `samples` refusal without a tracking item.
See [JOURNAL.md](JOURNAL.md).

### 49. WebGL 2: instancing and per-draw UBO ranges

**Status.** open

**Done when.** `instanced-cubes` draws here, at the same object count, with alignment respected.

**Needs.** item 27, item 46, item 77.

**Gained `item 77` on 2026-08-25, recorded while item 48 was lifted.** This item's title is
instancing and per-draw UBO ranges of *the shader's own vertex geometry* on WebGL 2 — the arm
item 28's journal row homes here (*"Instancing geometry of the shader's own on WebGL 2 … is
item 49's"*). But its `Done when` names only `instanced-cubes`, whose WebGL 2 arm draws the
backend's fullscreen **corners** with `gl_InstanceID` and no per-draw buffer (item 28), so as
written the exit criterion is already met by items 27+28 and lands nothing new. The real work
— instanced *geometry*, and per-draw UBO ranges wired through the backend and exercised by a
corpus preset (`core-perdraw` draws a `quad-grid` and binds a storage buffer, both refused
today) — needs the vertex-geometry path of **item 77**. Whoever takes this should also tighten
the `Done when` past `instanced-cubes` to a preset that actually reads a vertex buffer.

### 50. WebGL 2: mip generation

**Status.** open

**Done when.** The mips preset passes and the sampled result agrees per item 44.

**Needs.** item 46, item 78.

**Gained `item 78` on 2026-08-25, recorded while item 48 was lifted.** The mips preset
`core-mips` gives its `grain` texture `content: 'value-noise'` and `mips: 'generate'` — a
resident image uploaded, then a ladder generated off it. The WebGL 2 backend generates no
mips (item 50's own scope) **and refuses a texture arriving with contents** (`gpu/webgl2.ts`:
*"gives … contents, and this backend fills a texture only by drawing it"*), homing that upload
in the scene tier without itemising it. So `core-mips` cannot draw here until the backend
uploads a resident texture's content, which is now **item 78**. Once it lands, item 50 is the
mip generation on top of it (`gl.generateMipmap`, a trilinear min filter); the `agrees per
item 44` half is a card's or a browser's, as every WebGL 2 item's pixel-agreement is.

### 51. Capability declaration wired end to end

**Status.** done

**Asks for.** `graph.requires` against `device.capabilities`, feeding selection first and refusal second, per §10.

**Done when.** A compute graph on a WebGL 2 machine produces a message a page can print, naming compute; and every backend method that would have thrown is absent rather than throwing.

**Needs.** item 8, item 46.

**How it landed.** [gpu/select.ts](../gpu/select.ts) gains `resolve(frame, device)`, the
one reading §10 lays out — selection first, refusal second — beside `selectBackend`, which
it composes with `refusal` (item 24). It takes a `DeviceProfile` (`{ webgpu, webgl2 }`, each
a `ReadonlySet<Capability>` where the backend is on offer or `null` where it is not — a
`DeviceOffer` carrying *why* an offered backend might still not draw a graph it could
build): the graph's language routes it to a backend across what is offered, and the graph's
`requires` are read against that backend's capabilities. A graph a backend speaks and has
the capabilities for returns that backend; one whose backend lacks a needed capability
returns the refusal naming the capability. **Where selection comes back empty** — no offered
backend speaks the graph's language — the answer is still a capability refusal wherever the
graph declares a requirement an offered backend lacks, so **a WGSL compute graph on a WebGL 2
machine is told it needs `compute`**, not merely that no adapter came back. The capabilities
are the device's own: `webgpuCapabilities(features)` maps a WebGPU device's reported features
to §10's names (compute, storage, indirect, occlusion, msaa always; timestamp, float-blend,
depth-clamp, bgra-storage from their features), and `webgl2Capabilities(extensions)` gives
WebGL 2 its `msaa` and none of the WebGPU-only set (float-blend from `EXT_float_blend`). Both
are pure, pinned in [tests/capability-wiring.test.ts](../tests/capability-wiring.test.ts)
from the feature/extension names rather than a device. **No backend method that would have
thrown was needed or added:** capability is data in `graph.requires` and the derived device
set, so `resolve` reads two records and returns a message, and the test asserts the
compute-on-WebGL-2 case returns rather than throws. The four names go on the door (`resolve`,
`webgpuCapabilities`, `webgl2Capabilities`, `DeviceProfile`); `gate:pack` green. The
`compute-field` example now builds its `DeviceProfile` from the live adapter's features and
the context's extensions and calls `resolve`, replacing the hand-wired `new Set(['msaa'])`
and by-hand selection-then-refusal it carried while this item was open.

**What the gates could not see.** `resolve` and the two derivations are pure and run entirely
in the node suite (773 green). What no gate here exercises is the derivation reading a *real*
device — `webgpuCapabilities(device.features)` on an actual adapter, `webgl2Capabilities` on a
real context's extension list — and the example drawing on a card or printing its refusal in a
browser: `gate:card`/`gate:browser` were not run (SwiftShader on every headless launch, §17
note 3). The mapping from feature names to capabilities is by the WebGPU/WebGL specifications,
not measured here; a device reporting a feature name this list does not carry would leave that
optional capability out of the set (the safe direction — a graph needing it is refused rather
than wrongly drawn). See [JOURNAL.md](JOURNAL.md).

### 52. The same scene graph on both backends

**Status.** open

**Done when.** `orbit-shadow` draws on WebGL 2 as well as WebGPU, and the difference between the two is reported by item 44's three numbers.

**Needs.** item 35, item 48, item 49, item 50, item 77, item 78.

**Gained `item 77` and `item 78` on 2026-08-25.** The scene draws vertex geometry (item 77)
and uploads material textures (item 78) directly, so it names both prerequisites its
predecessors 48/49/50 do — recorded here rather than reached transitively, since the graph a
`sceneView` producer emits reaches those paths on its own.

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

**Status.** done

**Asks for.** The timestamp queries that already work and are read by nothing become per-pass times in the benchmark output.

**Done when.** A run prints per-pass times where the device supports them. **Reported, never asserted.**

**Needs.** item 21.

**How it landed.** [gates/times.mjs](../gates/times.mjs) (`npm run bench:times`) is the
consumer the timestamp queries never had — a sibling benchmark to item 22's
[gates/traffic.mjs](../gates/traffic.mjs), not an extension of it, because a time is one
row per **pass** where traffic is one row per **frame**. It draws one frame whose passes
are each `timed:` into a 16-byte buffer of its own — a compute pass and a render pass —
reads each buffer back with `readBuffer`, and prints the elapsed nanoseconds a pass took
as the second of its two u64 timestamps minus the first (the pair a timed pass resolves
into its buffer, gpu/webgpu.ts, RoadToPureEngine.md's readings-not-a-matrix). **Where the
device supports them:** the harness guards on `device.features.has('timestamp-query')` and
prints one honest "unavailable" line where the feature is absent, rather than a column of
zeroes dressed as timings. **Reported, never asserted:** a wall-clock time is the device's
and the moment's, so nothing pins one — [tests/bench-times.test.ts](../tests/bench-times.test.ts)
(the same shape as `bench-traffic.test.ts`, and what keeps the script from being an orphan
under item 74) asserts only that an elapsed row is printed per timed pass and the script
exits zero, never the number.

**What the gates could not see.** The read path runs end to end in the node suite (774
green, was 773; `type-check` green, `times.mjs` under `checkJs`), but produces no *real*
timing: the recording double's `resolveQuerySet` moves no bytes and its mapped range is
empty, so both pairs read back zero, which the harness prints with a note saying so. A real
card behind the same code path is the only place a non-zero elapsed count lands; `gate:card`
and `gate:browser` were not run (SwiftShader on every headless launch, §17 note 3). See
[JOURNAL.md](JOURNAL.md).

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

**Status.** done

**Asks for.** `ABSTRACTION.md`'s Mermaid diagram stops naming files that do not exist here, and the path gate stops being blind to fenced blocks.

**Done when.** No node label in that diagram names a path absent from this tree, and `tests/docs-paths.test.ts` reads Mermaid node labels as well as backtick and link spans — negative-tested on an injected stale path inside a fence, the way item 5 negative-tested the two shapes it already covers.

**Needs.** item 5.

**How it landed.** The seven website paths named in this item's earlier draft — content/shaders,
hooks/useShaderSurface.ts, lib/renderer/artefacts.ts, lib/renderer/choose.ts, lib/shader-base.ts,
public/shaders/build/manifest.json and public/shaders/source/*.wgsl — are out of
[ABSTRACTION.md](ABSTRACTION.md)'s Mermaid node labels, each replaced by what its layer *is* to a
reader who no longer has the website's tree (`a source file — WGSL, or GLSL a consumer authors`, `a
consumer's adapter`, `a consumer's React hook`, and so on) rather than by a path that resolves to
nothing here. The seven in-tree paths the diagram legitimately names — `toy/frame.ts`,
`gpu/renderer.ts`, `host/surface.ts`, `gpu/webgpu.ts`, `gpu/webgl2.ts`,
`trace/trace.ts`, `tests/support/fake-gpu.ts` — stay and still resolve. **The gate now reads the
fence** rather than stripping it: [tests/docs-paths.test.ts](../tests/docs-paths.test.ts) gains a
third ref kind, `mermaid`, reading the text inside each `["..."]` node label of every ```mermaid
fence, dropping the `<b>`/`<br/>` tags a label carries and splitting on its separators, and flagging
each token that looks like a path — a file by the existing `looksLikePath`, or a two-segment
lowercase directory path like `content/shaders` that has no extension for `looksLikePath` to catch.
A bare folder label such as `graph/` (the §7-folder diagram in [RoadToPureEngine.md](RoadToPureEngine.md),
trailing slash, nothing after) is deliberately **not** read as a file, so that second diagram — read
by the same gate now — does not light up as a wall of missing files. **Negative-tested** two ways, as
this item requires: a fence with an injected stale path (`lib/gone/vanished.ts`) is caught, and a
fence with a live file label plus a folder label reads the file and skips the folder. Confirmed once
by hand that the *integrated* gate fails on a stale diagram path, not only the isolated helper —
temporarily rewriting one live `renderer/*.ts` node label to a dead lib/renderer path reddened the
resolve test naming that path under a `mermaid` kind, then restored (the dead path is named without
backticks here, as this item's draft named its seven, so the gate does not read this line as a claim
the file exists). `public/shaders/build/manifest.json`
stays on `ALLOWED_ABSENT` because §3 row 12 of `RoadToPureEngine.md` still cites it in backticks
outside any fence; the other six were never on the allowlist and are not added, keeping that widened
bar short. 658 node tests green (docs-paths 3 → 5), type-check clean; docs and one test touched, so
the export surface did not move and `gate:pack` was not required. See [JOURNAL.md](JOURNAL.md).

**Why it exists.** Item 5 met its own wording exactly: it checks backtick-quoted and link-quoted paths, and its own blind-gate row in [JOURNAL.md](JOURNAL.md) says the diagram sits in a stripped fenced block, neither checked nor changed. That row is honest and it was not tracked, and JOURNAL.md's own rule is that a row needing work nobody is tracking needs a roadmap item in the same commit. This is that item.

Seven website paths are still in that fence today, named here without backticks so that item 5's own gate does not read this item as a claim that they exist: content/shaders, hooks/useShaderSurface.ts, lib/renderer/artefacts.ts, lib/renderer/choose.ts, lib/shader-base.ts, public/shaders/build/manifest.json, public/shaders/source/*.wgsl. Writing them plainly is deliberate rather than a workaround — the alternative was seven more entries on `ALLOWED_ABSENT`, and that list is a widened bar whose value comes from being short. **This item's first draft did quote them, and the gate failed the commit**, which is the gate doing exactly what item 5 built it for. The diagram is the most-read part of that document, so this is where §3 row 12 of [RoadToPureEngine.md](RoadToPureEngine.md) is least closed rather than most.

### 61. The WebGL 2 backend feeds an integer uniform as an integer

**Status.** done

**Asks for.** A loose scalar uniform declared `int` in the source is fed with `gl.uniform1i` rather than `gl.uniform1f`.

**Done when.** A source declaring `uniform int` receives the value it was handed, asserted against the fake WebGL 2 context by the call made rather than by the picture, and a source declaring one alongside floats gets both.

**Needs.** Nothing.

**Why it exists.** [gpu/webgl2.ts](../gpu/webgl2.ts) sends every non-array scalar through `gl.uniform1f`. Feeding an `int` uniform that way is `GL_INVALID_OPERATION` in WebGL 2, so the uniform keeps its default of 0 and the shader animates off a number nobody delivered.

**It is a general defect, not a leftover.** It was found through item 6's producer, which has since been reverted, and it survives that removal untouched: decision 6 says a consumer may hand this library a GLSL document, and `uniform int` is ordinary GLSL. Any consumer writing one hits this today, silently, and no gate here can see it — the node suite reads calls rather than values, and the browser corpus has no GLSL source declaring an integer.

**It is not a one-line fix, and that is the useful part of this entry.** `setUniforms` receives only `values: Record<string, UniformValue>` and infers the call from the JavaScript shape of each value — non-array becomes `uniform1f`, and an array's length picks `uniform2fv`, `uniform3fv` or `uniform4fv`. There is no declared type in scope. The type does exist on the frame, as `ShaderFrame.uniforms`, and `createProgram` receives the whole frame, so a name-to-type map captured when the program is built is the obvious route.

**One thing to decide while landing it.** [RoadToPureEngine.md](RoadToPureEngine.md) §14 retires `ShaderFrame.uniforms` from the graph, because what a control panel shows is not a render fact. So the obvious route leans on a field that is scheduled to leave. If it is taken anyway, the type has to move to the binding or the pipeline when that field goes, and this entry is where that follow-on is recorded.

**Also worth checking when landing it.** The uniform-block path above the loose path writes members into a byte buffer as floats too, so an `int` member of a block has the same problem by a different route. No corpus source has one today, so both paths want a test rather than only the loose one.

**How it landed.** [gpu/webgl2.ts](../gpu/webgl2.ts)'s `program` captures a
name-to-type map off `frame.uniforms` when the program is built — `declaredType`, with an
`isInt(name)` guard reading it — the obvious route the entry named, off the field §14 retires
from the graph. **Both paths** the entry names now route an `int` away from the float door:
the loose path calls `gl.uniform1i` rather than `gl.uniform1f` for a scalar declared `int`, and
the block path writes an `int` member through an `Int32Array` view of the same buffer the float
members go into by `Float32Array` (`words` beside `bytes`), because std140 lays an int in the
four bytes a float takes but the bit pattern of `3` written as a float reads back as ~4e-45,
not `3`. **The follow-on the entry flags is tracked at item 38**, where `ShaderFrame.uniforms`
retires: a note there carries the requirement that this declared type move to the binding or
the pipeline when the field it reads goes, so the fix does not silently regress. Coverage is
three new cases in [tests/renderer-webgl2.test.ts](../tests/renderer-webgl2.test.ts): a loose
`int` fed through `uniform1i` with no `uniform1f`, an `int` alongside a `float` each through its
own loose call, and a block `int` member landing as the integer `4` through the word view while
a `float` beside it reads `3` through the float view. The fake WebGL 2 context gained `uniform1i`
and a `words` capture on `bufferData` so a test asserts the integer landed rather than the
picture. **What the gates could not see:** that the delivered `int` produces the right picture
on a real driver needs a browser or a card, and `gate:browser` has no GLSL corpus source
declaring an integer (item 61's own "no gate here can see it" — the node suite reads the call
made, not the value the shader receives). The export surface did not move — no door name added
or removed, the type map is internal to the backend — so `gate:pack` was not required. 661 node
tests green (+3), `type-check` green. See [JOURNAL.md](JOURNAL.md).

### 62. Decision 6's promise is confirmed on a machine that has WebGPU

**Status.** lifted to a machine with a real graphics card (the standing job of items 55, 57)

**Asks for.** One reading, on a device that actually returns a WebGPU adapter, showing that a GLSL-authored frame is drawn by WebGL 2 there and that the picture comes out.

**Done when.** A dated row in [DEVICES.md](DEVICES.md) records a machine whose `probe()` reports WebGPU returned and survived, on which `examples/glsl-fragment` selected `webgl2` and drew. Not a node assertion: the point is the machine.

**Needs.** item 9.

**Why it exists.** §17 decision 6's whole promise is that a consumer arriving with a GLSL shader **gets a picture rather than a lecture**, because GLSL selects WebGL 2 even where WebGPU exists. Items 6, 8 and 9 each built a piece of that and each disclosed, accurately, the half it could not prove:

- item 8's row: the offering in its tests is a written fixture rather than a probe, because this machine never returns a real WebGPU adapter, and nothing feeds the chosen backend name to a renderer on a real card.
- item 9's row: only the pure `readingOf` is exercised; the browser half never ran, so `device-report` has not been run here at all.

Each row is honest and neither is wrong. What nobody owned is the join: **on a machine that has WebGPU, nothing has yet shown a GLSL paste drawing through WebGL 2.** Three green halves are not a verified whole, and this is the item that says so.

**It cannot be settled on the machine the loop runs on**, per §17's three harness notes: every headless launch there reaches SwiftShader whatever the flags say, and a real adapter needs a visible window with `--enable-features=Vulkan` and `--ozone-platform=x11` together. So an unattended run should **lift this item rather than work it**, and the reading belongs to whoever has the hardware — the same standing job as item 57.

### 63. The pipeline cache dedupes across programs

**Status.** done

**Asks for.** A pipeline compiled once and shared by every program whose frame carries its structure, bounded so the sharing cannot grow card memory without end.

**Done when.** Two programs on one backend whose frames differ in resident data but share a pipeline structure compile one pipeline between them, a test asserts the second builds none, and a bound is asserted so a backend that compiles more distinct structures than the bound frees the stalest rather than keeping every one alive.

**Needs.** item 15, item 21.

**Why it exists.** Item 12 built `PipelineCache` content-addressed for exactly this reuse, and item 15 wired the backends to compile through it — but **per program**, not per backend, so the cache never dedupes across two programs. That scope was deliberate and is recorded in item 15's [JOURNAL.md](JOURNAL.md) row: a per-backend `PipelineCache` has no eviction, so the editing path — a source recompiled on every keystroke, each a new structure — would accumulate pipelines the renderer's LRU can no longer reach, which is the unbounded card-memory growth that LRU exists to prevent. The renderer's LRU already reuses a whole **program** when a frame repeats exactly (via `frameKey`), so the reuse still missing is the scene-tier one: many programs sharing one material's pipeline over different meshes, each compiling that pipeline again today. That is why this `Needs` item 21 as well as item 15 — the `cost()` metric is where a "compiled nothing new" claim becomes assertable without a browser, and the scene tier is where the reuse pays. **Reverse:** none needed until it lands; item 15's per-program scope stands on its own.

**How it landed.** [pipeline/cache.ts](../pipeline/cache.ts)'s `PipelineCache` gained a bound
and an eviction, and the WebGPU backend now builds every program's pipelines through **one**
cache for its whole life rather than a fresh cache per program. The cache is a map from handle to
pipeline plus a recency-ordered `byKey` map: a request that hits an existing structure re-inserts
its key to the back (touched), and a build that pushes the size past the `bound` frees the front —
the least-recently-requested — through an optional `onEvict`. `PIPELINE_CACHE_LIMIT` is **64**,
above the renderer's `PROGRAM_CACHE_LIMIT` of 16 so a program cache full of distinct programs does
not evict a pipeline a still-warm program holds. **The bound governs reuse, not liveness:** a
WebGPU pipeline the GC reclaims once nothing references it, so the WebGPU cache passes no `onEvict`
and an eviction is a dropped reference — a live program that resolved a pipeline keeps its own
reference whatever the cache evicts, so nothing draws through a freed pipeline. `two programs …
compile one pipeline between them` is asserted at the backend
([tests/renderer-pipeline-cache.test.ts](../tests/renderer-pipeline-cache.test.ts)): two frames
sharing one structure over meshes that differ only in resident vertex bytes issue one
`createRenderPipeline` and one `createBindGroupLayout` between them, while each builds its own
vertex buffer and bind group — two programs, one pipeline. `a bound … frees the stalest` is
asserted on the cache directly ([tests/pipeline-cache.test.ts](../tests/pipeline-cache.test.ts)): a
cache bounded at two, given a third distinct structure, frees the first, its handle stops
resolving, and re-requesting it builds afresh; a touched structure stays warm while the next
stalest goes.

**Two calls taken while landing it, both in [JOURNAL.md](JOURNAL.md).** (1) The structure key was
**incomplete for cross-program keying** and I closed it: `pipelineStructureOf` keyed a binding by
its resource *name*, so two frames with one spec over resources of different kinds (a read-only
storage buffer versus a writable one) keyed alike and the second would have been handed a layout
built for the first — a silent wrong picture the per-program cache never exposed because it only
ever saw one frame. The key now resolves each binding's kind, buffer access and texture
format/use, asserted in `pipeline-cache.test.ts`. (2) **WebGL 2 stays program-scoped.** Its cached
`WebGLProgram` needs an explicit `gl.deleteProgram`, so a shared cache would need a reference count
before an eviction could free one out from under a live program that still draws with it; that
backend draws one fullscreen pass today and its cross-program reuse is Phase 5 work, so its cache
keeps the unbounded per-program default and frees on the program's own dispose, unchanged.

**What the gates could not see.** Every assertion reads calls off the recording double; that the
shared, evicting cache draws a byte-identical picture on a card is `gate:browser`'s to confirm (the
"15 of 15 traces agreeing" the `Done when` for renames names, and the standing card-gated gap
these rows keep) and was not run in this unattended session. It is pixel-identical by construction:
a shared pipeline is the same compiled object a per-program cache built, and eviction only drops a
reference the GC would have dropped when the program did. See [JOURNAL.md](JOURNAL.md).

### 64. The node corpus loader assembles a frame again

**Status.** done

**Asks for.** `gates/lib.mjs`'s `loadCorpus()` loads every capability fixture into a frame again, rather than throwing on the first.

**Done when.** `node -e "import('./gates/lib.mjs').then(m => m.loadCorpus())"` returns a frame per `CAPABILITY_FIXTURES` entry, and the two browser gates that consume it — `gates/corpus.mjs` and `gates/trace-contract.mjs` — reach a page rather than dying at load.

**Needs.** Nothing.

**Closed without its own commit, 2026-08-25.** It was the symptom rather than the defect: `loadCorpus` threw because the door's `export *` lines left a bundler an uninitialised namespace, which is the shipped bug fixed in `b644520`. Verified after that fix — `loadCorpus()` awaited returns 15 frames, and `corpus.mjs` and `trace-contract.mjs` both reach a page and report 15 of 15. Recorded here rather than worked, because an item whose cause was fixed elsewhere is closed by evidence and not by a second repair.

**Why it exists.** Found working item 22, which wanted to print `arena.traffic()` beside `cost()` for every corpus preset and could not: `loadCorpus()` throws on the first capability fixture, `core-compute`, with *"the description for core-compute names a document undefined with no text"*. Reproduced on a clean tree (`git stash` then the one-liner above), so it predates item 22 and is not that work's doing. The cause is a `WGSL_DOCUMENT` that resolves to `undefined` inside the esbuild bundle `loadFromRoot` builds — a document named `undefined` reaches `frameOf`, whose missing-text check refuses it correctly. Because `loadCorpus` is what `gate:browser`'s corpus and trace-contract gates call at their first step, **both are currently dead at load**, which the repeated "gate:browser not run in the unattended session" JOURNAL rows have been hiding: a gate nobody runs is a gate whose own loader can rot unnoticed. Item 22's benchmark works around it by building two frames by hand; this item is the fix, and until it lands `gate:browser` cannot confirm anything, including the twelve trace presets several recent items defer to it.

### 65. `sceneView` declares a depth attachment

**Status.** done

**Asks for.** The scene producer emits a frame that depth-tests: a transient depth target the passes share and clear, and each render pipeline declaring its depth compare and write, so a scene of solid objects draws correctly from any camera angle.

**Done when.** A `sceneView` scene of two objects, one in front of the other from the camera's view, draws the near one over the far one whatever order the objects sit in the graph — asserted through the emitted graph carrying a depth attachment and each pipeline a `depth`, and its `cost()` counting the depth loads and stores. A scene with the depth removed regresses the near-over-far ordering in the same test.

**Needs.** item 32.

**Why it exists.** Found writing item 35's `examples/orbit-shadow`, the first example to draw a
scene through `sceneView`. `sceneView` emits passes carrying only a pipeline and its draws — no
depth attachment — and `submit/plan.ts` requires a pass's depth attachment for a pipeline that
declares `depth`, so a `sceneView` pipeline cannot declare depth today and the scene has no
depth test. Objects therefore order by draw order alone (§8's painter order), which is correct
for a fixed layering — item 35 relies on it to sit shadows under lit objects, listing the shadow
pipeline first — but wrong for solid objects an **orbit** camera sees from changing angles: a
cube behind another draws over it whenever draw order and view order disagree. Item 35 draws
anyway because its objects are a low grid an elevated orbit rarely stacks and the exit criterion
is "runs", not "occludes correctly" (its [JOURNAL.md](JOURNAL.md) row names this as the card-gated
gap). The machinery exists — item 17 lets a graph declare a transient depth target and
`instanced-cubes` (item 30) hand-writes exactly this attachment — so this is teaching the
producer to emit what a hand-written frame already can, not new backend work. It is the scene
tier's `Done when`-visible correctness rather than a demo polish, which is why it is queued
rather than left in the row.

**How it landed.** `sceneView` gains one option — `depth?: { texture, format, clear? }`
([scene/scene-view.ts](../scene/scene-view.ts)) — and emits from it exactly what a
hand-written frame already can (item 30's `instanced-cubes`): one frame-sized transient
depth `TextureResource` (`size: ['frame','frame']`, `use: ['attachment']`, no first
contents of its own), attached to **every** pass. The passes **share and clear** it the
way `submit/plan.ts` and `graph/attachments.ts` read a shared attachment — the first pass
carries `{ resource, clear }` (clear defaulting to 1, the far end of the depth range), every
later pass carries `{ resource }` (load) so each surface tests against what the passes
before it left, rather than each pass emptying the depth the last one wrote. The producer
does not touch the pipelines: each pipeline declares its own `depth` compare and write (the
caller's, since the pipeline is `ScenePipeline.pipeline`), and the emitted attachment is
what those declarations test into — a pipeline testing a format the attachment does not keep
is refused by name at `plan.ts`, and a pipeline testing depth with the option absent is
refused there too, so the two are used together by construction. The depth texture's name
joins the construction-time buffer-name clash check, since it is a resource keyed by name
like the scene buffers.

**What the gates showed and could not.** [tests/scene-view.test.ts](../tests/scene-view.test.ts)
asserts the `Done when` as written: the emitted graph carries the shared depth attachment
(cleared once, loaded after), each emitted pipeline keeps its `{ compare: 'less', write:
true }`, and `cost()` counts one depth load and one depth store (`attachmentLoads` 1,
`attachmentStores` 3, `transientBytes` the frame-sized `depth24plus` target) against a
depth-removed scene that counts neither (`0`/`2`/`0`) — the regression the same test names.
The near-over-far picture is asserted structurally, order-independent (near-first and
far-first list the passes oppositely yet both emit the depth-tested graph), because that a
card draws the near solid over the far one is pixel-identical to correct depth testing by
construction — the same attachment `instanced-cubes` draws from — and only a browser or card
can show the pixels. `gate:browser` was not run in this unattended session and no corpus
preset carries a `sceneView` depth attachment yet; see [JOURNAL.md](JOURNAL.md). 698 node
tests green (was 693 before the five added here), `type-check` green; the export surface did
not move (an optional field on the already-exported `SceneViewOptions`, no door name added),
so `gate:pack` was not required.

### 66. The last two §14 renames, once the capability wiring exists

**Status.** open

**Asks for.** The two rows item 38 could not reach: `readBuffer` removed, and `ShaderSource` becoming a union discriminated on `authored`.

**Done when.** Neither name survives anywhere, and §14's table is fully spent.

**Needs.** item 70, item 51.

**Why it exists.** Item 38 asked for every row of §14 at once, in Phase 4. Two of those rows depend on Phase 5 work that item 38's `Needs` never named — `readBuffer`'s removal on item 51's capability wiring, and the `ShaderSource` union on the arena shape that arrives with translation. A run stopped on the contradiction instead of satisfying the criterion loosely, which is the behaviour the queue is meant to produce.

**It is a 1.0 blocker.** Decision 8 says all of §14 lands before 1.0 and that renames are forbidden afterwards, so this item is what keeps that promise true once item 38 has taken everything reachable.

### 67. `FrameDescription` folds into the graph, on handles

**Status.** lifted needs decomposition

**Asks for.** The two shapes become one: a graph carrying resident handles and transient descriptors, per §8, with `FrameDescription` gone.

**Done when.** No resource is keyed by a string name in `graph/types.ts`, `FrameDescription` is absent, and the browser batch still agrees 15 of 15.

**Needs.** item 17, item 70. Folding `TextureResource` off `name`-keying is where `Extent`'s shape change (item 71) naturally lands; take item 71 with this item or leave it to it, but do not restate its rule in two places.

**Why it is its own item.** §14 lists this as a rename and it is a migration. `graph/types.ts` keys every resource by `name: string` today, and item 17's own journal row defers the move to `Ref` and `Handle`. Likely also a change to the manifest contract the consuming repository writes, so it is a `carry`.

**Lifted 2026-08-25: two separable migrations under one `Done when`, and the second is not covered by this item's `Needs`.** Read as written, the criterion is the conjunction of two changes that neither requires the other and each of which is checkable on its own:

- **(a) The fold — `FrameDescription` absent.** `FrameDescription` (`graph/types.ts`) is the pre-fetch build shape: it carries `documents: DocumentSpec[]` (names only) where `FrameGraph` carries `modules: ModuleSpec[]` (name + fetched code), and it lacks `id`/`uniforms`/`requires`. `frameOf` in [toy/frame.ts](../toy/frame.ts) is the one translation between them. Unifying the two into a single graph type is a self-contained change that can be done *keeping string names*, verified by `FrameDescription` surviving nowhere and the browser batch agreeing.
- **(b) The handle migration — no resource string-keyed in `graph/types.ts`, "on handles, per §8".** The graph identifies every resource by `name: string` and references them by string (`BindingSpec.resource`, `RenderPassSpec.depth.resource`/`colour[].resource`/`.resolve`/`.timed`/`.visible`, `FrameGraph.present`/`swap`, `VertexResource.indices`, `RenderPipelineSpec.geometry`, every `.source`, indirect `.indirect`, pipeline `.module`s and `pass.pipeline`). The WebGPU backend alone builds 15+ name-keyed maps (`textureHandles = new Map<string, Handle>()`, `buffers`, `textures`, `samplers`, `times`, `counting`, `bound`, …) and resolves ~88 sites by `.get(name)` / `.find(r => r.name === …)`. This is done *keeping the two shapes separate* — it is orthogonal to (a).

**Part (b) is work this item's `Needs` never named.** Its `Needs` are item 17 and item 70. Item 17 delivered only the `Ref`/`Handle` **types** and **transient** resolution (`submit/frame-resources.ts`), and its own journal row states "the backends do not consume `Ref`" and defers "the authoring handle and the arena's runtime handle … unify in Stage 2." Item 16 landed with "the backends still resolve names, per item 16's seam"; item 18 with "the backends do not consume it yet (same seam as item 17)." So the backend adoption of `Ref`/`Handle` — the graph carrying handles and the backends resolving by handle rather than by name — is a migration the project **deliberately sliced across items 16, 17 and 18 and left unqueued as a discrete step.** Making it a precondition of item 67 without a `Needs` line for it, and folding it together with (a), is the same defect item 38 carried (six §14 rows, two of which were not renames), lifted and decomposed into items 70/71/72.

**A further wrinkle inside (b), recorded so the decomposition is honest.** "On handles, per §8" cannot mean the arena's runtime `Handle` (minted at allocation on a device, carrying a generation): the graph is a pure JSON value built before any device exists (`graph/` imports nothing, is serializable and worker-sendable). So a graph handle must be an **authoring** handle — an index into the graph's own resource list, branded per `graph/handles.ts` — cast to the arena handle in `FrameResources`. Resident resources already reach the arena inside the backends (`arena.allocate`/`resolve`), but keyed there by the graph's string `name`; the migration replaces that name key with the authoring handle end to end. Unifying the two brands is exactly the problem item 17's journal parked for "Stage 2."

**How this was established, and what would change the answer.** Read the whole resolution path (`graph/types.ts`, `gpu/webgpu.ts`, `gpu/webgl2.ts`, `submit/{plan,execute,gl2,frame-resources}.ts`, `toy/frame.ts`) and the three prior items' journal rows. Nothing here is a machine limit — the work is doable; it is two items' worth under one criterion, and the second is un-`Needs`-ed. What would change the answer: a decomposition into a fold item (a) and one or more handle-migration items (b), each with its own `Done when` and the `Needs` chain that actually feeds it, filed under "Found by review". Note also that (b) is **not** behaviour-preserving by construction the way the renames (items 70/71/72) were — it rewrites resolution logic rather than swapping symbols, so an index-vs-name bug is invisible to the node suite (which is itself rewritten alongside) and only the browser batch could catch it; whoever queues (b) should say so. Still a `carry`: the manifest contract the consuming repository writes changes with either half. See [JOURNAL.md](JOURNAL.md).

### 68. `submit(graph)` exists, and `ShaderProgram` goes

**Status.** lifted needs decomposition

**Asks for.** The top-level primitive §17 decision 7 names — `submit(graph, { into })` — with the surface and the host reaching the card through it, and the `ShaderProgram` interface deleted behind it.

**Done when.** `submit` is exported from the door, nothing constructs a `ShaderProgram`, and the browser batch agrees 15 of 15.

**Needs.** item 70.

**Why it is its own item.** §14 says `ShaderProgram` "becomes `Arena` + pipeline cache + `submit`". The first two exist; the third does not — there is no `submit(graph)` export anywhere. Deleting the interface without building the primitive leaves the library with no path to the card.

**Lifted 2026-08-25: `Done when` collides with item 66, whose dependency this item's `Needs` never names — an objective queue inconsistency.** "Nothing constructs a `ShaderProgram`" deletes the whole interface, and `ShaderProgram` carries `readBuffer(name): Promise<Uint32Array>` ([graph/types.ts](../graph/types.ts) ~L620). But **`readBuffer`'s removal is item 66's deliverable** ("`readBuffer` removed"), and item 66 `Needs` item 51 (open) — its text states plainly that "`readBuffer`'s removal [depends] on item 51's capability wiring." So item 68 (with `Needs` = item 70 only) would remove `readBuffer` as a side effect of deleting `ShaderProgram`, doing item 66's `readBuffer`-removal work ahead of the item 51 dependency the queue puts on it. Two items cannot both own `readBuffer`'s removal under different dependency sets; that is the malformation, the same class item 38 carried and was decomposed for.

**A second, softer entanglement, recorded so a decomposer sees it.** The stateful methods `ShaderProgram` carries with no production consumer — `writeBuffer`, `readBuffer`, `setPasses` (grep: exercised only by tests; the sole production consumer is [gpu/renderer.ts](../gpu/renderer.ts), which uses `setUniforms`/`draw`/`unreached`/`dispose`) — dissolve into "re-submit a mutated graph" only if a graph is a cheap, self-contained, re-submittable value on stable resource identity. That is item 67's fold-and-handles work, now itself lifted; a one-shot `submit(graph)` that rebuilds resources by string name every call is what exists today (`gpu/renderer.ts`'s `programFor`/`programs` cache), and turning it into the door primitive without item 67 keeps the string-keyed rebuild rather than the `Arena` + pipeline-cache model §14 promises.

**How this was established, and what would settle it.** Confirmed `readBuffer`/`writeBuffer`/`setPasses` have no non-test caller; confirmed the surface already sits at `renderer.draw(graph, uniforms)` (close to `submit`), so the primitive itself is a modest addition — it is the *deletion* half that collides. Nothing here needs hardware. **What would change the answer:** the queue deciding which item owns `readBuffer`'s removal — either item 66 keeps it and item 68 gains `Needs: item 66` (hence item 51), or item 68 takes it and item 66 sheds that row — plus a decision on whether `submit(graph)` as the door primitive precedes or follows item 67. Filed for "Found by review". `carry`: `submit(graph, { into })` and the loss of `ShaderProgram` change the surface a consumer builds against. See [JOURNAL.md](JOURNAL.md).

### 69. `reflect()` replaces the compiled-program queries

**Status.** done

**Asks for.** `unreached()` and `ShaderFrame.uniforms` replaced by a source-level `reflect()` in `toy/`, and the methods removed from the backend interface.

**Done when.** Neither name survives, no backend carries a reflection method, and a toy-tier caller gets the same answer from `reflect()` that `unreached()` gave.

**Needs.** item 70.

**Why it is its own item.** It swaps a runtime query on a compiled program for static analysis of a source, which is a different answer arrived at a different way — a compiler removing an unread uniform is exactly what `unreached()` was for, and `reflect()` cannot see it. Whether that difference matters is the work.

**How it landed.** [toy/reflect.ts](../toy/reflect.ts) holds `reflect(frame): Uniform[]` and the
one-line derivation `missing(frame, names)` over it, both exported through the door (`reflect`,
`missing`, the `Uniform` type; **56 door names** where there were 54, `gate:pack` green). `reflect`
reads the uniforms off the frame's module source: a WGSL frame through the existing
`wgslUniformFields` (exported from [wgsl-layout.ts](../wgsl-layout.ts) for this), a GLSL frame
through a loose-and-block reader; the WGSL spellings are mapped to the common vocabulary GLSL
already writes (`f32`→`float`, `vec2<f32>`→`vec2`, `i32`→`int`), so a WGSL frame and a GLSL frame
answer alike, and both halves of a GLSL pair are read with the first spelling of a name winning.
**Neither name survives as code:** `ShaderProgram.unreached` is gone from the interface
([graph/types.ts](../graph/types.ts)) and from both backends' implementations, `FrameRenderer.unreached`
and `Surface.unreached` are gone, and `FrameGraph.uniforms` is deleted from the type — the only
`unreached`/`uniforms`-field tokens left are prose in the reflect docstrings and this item, naming
what was replaced. The one production reader of the old field, WebGL 2's `declaredType`
(int-through-`uniform1i`, item 61), now reads `reflect(frame)`, which for a GLSL frame reports each
uniform's own GLSL type. **The migration touched ~35 files:** the `uniforms` argument came off
`frameOf`/`assembleFrame`/`wgslFrame`/`glslFrame`/`planFromDescription` and its ~57 call sites, the
field came off every `FrameGraph` literal in the tests and off the three scene golden snapshots
(regenerated, a 30-line deletion confined to the `uniforms` block — decision 8's regenerable
fixtures), and the now-dead `SceneViewOptions.uniforms` (which fed the removed field) went with it.
`tests/reflect.test.ts` pins the WGSL and GLSL readings, the merge/dedupe, the vocabulary mapping,
and the divergence; the WebGL 2 fixtures now declare their uniforms in the GLSL they hand over
rather than in a list beside it. `npm test` 713 green, `type-check` clean, `gate:pack` green.

**What the difference is, since the item asked.** `reflect` reads the declaration, so a
declared-but-unread uniform is **present** where `unreached` — reading a linked program a GLSL
compiler had stripped it from — counted it absent. For the toy tier the two agree: a WGSL compiler
strips no block member (which is why the WebGPU backend already answered `unreached` off the
computed layout, not off the program), and the corpus is WGSL. The divergence is only a
hand-authored GLSL source declaring a uniform it never reads, and `reflect`'s answer is the one a
page drawing controls wants — it feeds a control whether or not this frame's code path reads it.
**What the cheap gates could not see:** the browser batch's "15 of 15 traces agreeing" was not run
(held for the closing session). It is behaviour-preserving for that batch by construction — the
corpus is WGSL drawn on WebGPU, whose draw path never called `unreached` (a query, now removed) and
whose types came from the computed block, not from the deleted field; `reflect` enters only the
WebGL 2 `declaredType` path, and WebGL 2 draws no WGSL corpus preset until translation (items
41/42). See [JOURNAL.md](JOURNAL.md).

### 70. The four genuine §14 renames

**Status.** done

**Asks for.** The four rows of [RoadToPureEngine.md](RoadToPureEngine.md) §14 that are renames and nothing else, verified against the tree: `ShaderFrame` to `FrameGraph`, `setArtefact` to `setGraph`, `artefact` to `graph` (or `variant` where a quality level is meant), and `ModuleSpec.overrides` to `constants`. The README and both design documents follow.

**Done when.** None of those four names survives, and no behaviour changed with them — the browser batch still reports 15 of 15 traces agreeing, which is what a rename must not move.

**Needs.** item 37.

**Why it exists.** It is item 38 minus the two rows that turned out not to be renames. Item 38 asked for six; `Extent` (item 71) is a structural shape change on `TextureResource.size` and `Dispatch` (item 72) drops runtime variants whose logic lives in the backend, so neither can be a name-only change. This carries the four that are, and items 66, 67, 68 and 69 name it in place of item 38, since a `lifted` item never satisfies a `Needs`. See item 38's lift note and [JOURNAL.md](JOURNAL.md).

**How it landed.** A token-boundary rename across the tree, no logic touched. `ShaderFrame` → `FrameGraph` (the exported graph type, its interface in `graph/types.ts` and every `Partial<…>`/`Pick<…>` use, the door export in `index.ts`), `setArtefact` → `setGraph` (the `Surface` method in `host/surface.ts` and its callers), `artefact` → `graph` (the `Surface` frame parameter, and every test/gate helper named `artefact`, plus the compound ghosts `loadArtefact` → `loadGraph` in two comments and `ARTEFACT` → `GRAPH` in `gates/surface.mjs`), and `ModuleSpec.overrides` → `constants` (the field in `graph/types.ts`, the threading params in `toy/frame.ts`/`submit/plan.ts`, and the `?.overrides` reads in `gpu/webgpu.ts`, which already assigned into a local `constants`). **`variant` was needed nowhere:** every `artefact` in the tree named the frame, not a quality level — the quality/rung concept is the `overrides` → `constants` field, renamed separately. 48 code/gate files changed, 269 lines each side of the diff (a pure symbol swap). The README carries none of the four; both design documents (`ABSTRACTION.md`, `RENDERER-DESIGN.md`) follow. **Deliberately untouched:** `RoadToPureEngine.md` §14 keeps both columns of the rename map — it *is* the specification of this rename, so wiping the "today" names would delete the map; item 70's text names README + the two design docs, not the road. The dead pre-split type names `ShaderArtefact`/`GlslArtefact`/`WgslArtefact` (already absent from code, cited only in `RENDERER-DESIGN.md`'s history) are not among the four and were left. **Gates:** `npm test` 698 green, `type-check` clean, `gate:pack` green (54 door names, the count unmoved by a 1:1 rename; the esbuild re-export check passes). **What the cheap gates could not see:** that the picture is unchanged — the browser batch's "15 of 15 traces agreeing" this item names as the thing a rename must not move was **not** run in the unattended session, per the run brief. It is behaviour-preserving by construction (a symbol swap changes no device call, and `gates/surface.mjs` now calls the renamed `setGraph`), see [JOURNAL.md](JOURNAL.md).

### 71. `Extent` becomes a whole-size descriptor

**Status.** done

**Asks for.** The §14 row `Extent = number | 'frame'` to `{ scale } | { width, height }`: a texture's size stops being a per-axis pair and becomes one descriptor that can say half-resolution, which the old type could not. `graph/refs.ts` already carries the target shape as `TransientSize`; this brings the resident `TextureResource.size` to it and deletes `Extent`.

**Done when.** `Extent` survives nowhere, `TextureResource.size` is a `{ scale } | { width, height }`, every current use maps with no picture change (the browser batch still agrees 15 of 15), and a test shows a `{ scale: 0.5 }` transient resolves to half the frame — the expressiveness the old type lacked.

**Needs.** item 37.

**Why it exists.** Split out of item 38 on 2026-08-25: §14 lists it under renames but it changes a field's shape, not its name. Verified behaviour-preservable — no use in the tree mixes a fixed axis with `'frame'`, so `['frame','frame']` maps to `{ scale: 1 }` and `[w,h]` to `{ width, height }` — but it rewrites the shape item 67 migrates off string keys, so it lands with item 67 or immediately beside it; whichever takes it, the rule for a transient's size lives in one place.

**How it landed.** `TextureResource.size` is now `TransientSize` (`{ scale } | { width, height }`,
[graph/refs.ts](../graph/refs.ts)), the same whole-size descriptor a transient carries, and
`Extent` is deleted from [graph/types.ts](../graph/types.ts) and the door — replaced there by
`TransientSize`, so the door still names the type of a public field (`gate:pack` green, **54 door
names**, unmoved: `Extent` out, `TransientSize` in). The rule for how a size becomes pixels lives
in one place, `graph/refs.ts`'s new `sizeAt(size, frame)`: `{ scale: 1 }` resolves to the frame's
own dimensions, `{ width, height }` to those numbers, and `{ scale: 0.5 }` to half the frame,
rounded — the expressiveness the old pair lacked. Every reader moved to it — the WebGPU backend's
texture build and compute-dispatch sizing ([gpu/webgpu.ts](../gpu/webgpu.ts)), `cost()`'s texture
bytes ([graph/cost.ts](../graph/cost.ts)) — and the two `size.join('x')` shape keys (swap-pair in
`gpu/webgpu.ts`, resolve-target in [submit/plan.ts](../submit/plan.ts)) plus the transient pool's
bin key ([submit/transient-pool.ts](../submit/transient-pool.ts)) share one `sizeKey(size)`, and
`followsFrame(size)` replaces the per-axis `=== 'frame'` test. **Behaviour-preserving by
construction:** `sizeAt({ scale: 1 }, f)` is `{ width: round(f.width·1), height: round(f.height·1) }`
= the old `['frame','frame']` result exactly, and `{ width, height }` returns its own numbers, so
no device call changed. Every authoring site mapped 1:1 (`['frame','frame']` → `{ scale: 1 }`,
`[w,h]` → `{ width, height }`) across the corpus fixtures, the examples, `scene/`, and the tests;
`tests/graph-refs.test.ts` adds four `sizeAt` cases pinning the `{ scale: 0.5 }` → half-frame
expressiveness the item names.

**What the cheap gates could not see.** That the picture is unchanged — the item's "the browser
batch still agrees 15 of 15" — needs `gate:browser`, which the run brief holds for the closing
session and which was not run here. It is behaviour-preserving by construction (the mapping is
1:1 and `sizeAt` reproduces the old per-axis resolution exactly); a card would confirm the pixels,
not the numbers. 702 node tests green (4 new), `type-check` clean, `gate:pack` green. One decision
nobody's gate pins: `sizeAt` **rounds** a non-integer scaled dimension (`Math.round`), unobservable
until a fractional scale of an odd dimension is authored, which nothing in the tree does today —
see [JOURNAL.md](JOURNAL.md).

### 72. `Dispatch` loses its runtime variants for `groups`

**Status.** done

**Asks for.** The §14 row `Dispatch = … | 'frame'` to `groups: [n,n,n] | { indirect }`: the `'frame'` and `{ over: <texture> }` variants go, and a producer computes the group count from the size it knows rather than the backend computing it at draw time.

**Done when.** `Dispatch`'s `'frame'` and `{ over }` variants survive nowhere, the compute field is `groups`, the backend no longer derives a group count from the frame size (that logic having moved to the producer that had the size), and the compute corpus presets draw the same picture — the browser batch still agrees 15 of 15.

**Needs.** item 37.

**Why it exists.** Split out of item 38 on 2026-08-25: it is the one row of the six that cannot be a rename even in principle. `gpu/webgpu.ts`'s `blocks()` turns `'frame'` into `[width, height]` and `{ over }` into a named texture's size at draw time; removing those variants relocates that computation across the §7 layer boundary into producers, which is a behaviour change, not a name change. `core-compute`, `core-storage-pingpong`, `compute-field` and several tests author the dropped variants today, so the work includes teaching each to emit concrete `groups`.

**How it landed.** The graph type `Dispatch = [n,n,n] | 'frame' | { over } | { indirect }`
became `Groups = [n,n,n] | { indirect }` ([graph/types.ts](../graph/types.ts)) — the two runtime
variants gone — and `ComputePassSpec.dispatch` became `groups`; the guard `dispatchesIndirectly`
became `groupsIndirectly`. The backend's `blocks()` in [gpu/webgpu.ts](../gpu/webgpu.ts), which
turned `'frame'` into `[width, height]` and `{ over }` into a named texture's size **at draw
time**, is deleted: `resolveTurns` now resolves a compute pass to `{ blocks: pass.groups }`
directly, so no group count is derived from the frame size below the §7 boundary. That computation
moved up to a pure producer helper, `groupsToCover(pixels, workgroup)` in
[graph/refs.ts](../graph/refs.ts) — the compute sibling of item 71's `sizeAt` — which covers a
pixel size in whole blocks of a pipeline's `@workgroup_size`, an edge that does not divide covered
by a block running past it. Every producer that authored a dropped variant now emits concrete
`groups`: the corpus fixtures `core-compute` (`groupsToCover({800,600},[8,8,1])` = `[100,75,1]`)
and `core-state` (over the 256×256 `next` grid, `[32,32,1]`) in
[fixtures/capability-fixtures.ts](../fixtures/capability-fixtures.ts); `examples/compute-field`,
which computes its count from the device-pixel size it is about to draw at and, on a resize, hands
the surface a fresh frame via `setGraph` rather than the backend tracking the frame size — the §7
relocation seen from a consumer. The `describe`/`declaredFrame` producer
([fixtures/shader-describe.ts](../fixtures/shader-describe.ts)) passes `groups` straight through
(it no longer converts a variant), and its "compute entry with no dispatch" refusal reads "with no
groups". The `core-storage-pingpong` fixture the item names does not exist in the tree; the
existing compute presets are what was taught. `Groups` is exported through the door in place of
`Dispatch`, and `groupsIndirectly` in place of `dispatchesIndirectly` — a 1:1 swap, so `gate:pack`
stays at **54 door names**; `groupsToCover` is a producer helper kept off the door. `npm test` 704
green (4 new `groupsToCover` cases in [tests/graph-refs.test.ts](../tests/graph-refs.test.ts)),
`type-check` clean, `gate:pack` 54/11.

**What the cheap gates could not see.** That the compute corpus presets draw the same picture —
the item's "the browser batch still agrees 15 of 15" — needs `gate:browser`, held for the closing
session and not run here. It is behaviour-preserving by construction at the corpus size (800×600):
`groupsToCover({800,600},[8,8,1])` is `[100,75,1]`, the exact count the old `'frame'` branch
computed at that size, so the recorded `dispatchWorkgroups` calls are byte-identical and the trace
contract (which draws the corpus at 800×600) agrees either way. **The one genuine behaviour change
is deliberate and sanctioned by the item:** a compute pass's group count no longer follows a
resize — the backend dispatches the producer's count as given. A consumer wanting a resize to
re-cover the frame rebuilds the graph with a fresh count, which is what `compute-field` now does;
the old auto-tracking is gone by design (§7, §14). See [JOURNAL.md](JOURNAL.md).

### 73. `bench:traffic` runs again, and something runs it

**Status.** done

**Asks for.** `npm run bench:traffic` to print its two readings, and for a gate to notice when it stops. It has printed nothing since item 26.

**Done when.** `npm run bench:traffic` prints a row for every frame in its list and exits zero, **and** a gate fails when it does not — `npm test` is the cheap place, since the script needs no browser and no card. A reader who did not do the work can check both by running the two commands.

**Needs.** nothing.

**Why it exists.** Found on 2026-08-25 by the closing browser batch over `b3241fc..f734de7`, while checking what that batch's renames touched that a browser gate cannot see. `gates/traffic.mjs`'s `gridFrame` declares `passes: [{ pipeline: 'warp', draw: { instances: 3 } }]` — the singular field item 26 renamed to `draws` — so `isRenderPass`, which tests `'draws' in pass`, takes that render pass for a compute pass. At `b3241fc` that reached a clean refusal (`the pass on "warp" asks for the other kind of work than the pipeline does`); at `f734de7` it is a `TypeError` from `groupsIndirectly` reading `'indirect' in undefined`, because item 72's guard dropped the `typeof === 'object'` arm that had been absorbing the `undefined`. Either way the script dies on its first frame and has since item 26 (`db1f6b3`, 31 commits back): only items 22, 37 and 72 have ever touched the file, and none of them is item 26. **Two things are wrong and the second is the item.** The fixture is one word stale, which is a one-line fix. The reason nobody noticed for 31 commits is that `gates/traffic.mjs` is a `.mjs` outside `tsconfig`, so `type-check` cannot see it, and it is not in `gates/all.mjs`'s list — deliberately, since it asserts nothing and is not a gate — so no command in the repository runs it. That leaves the two readings it exists to keep apart, `cost().transientBytes` against `arena.traffic()` (§12 point 6, §17 decision 9), unprinted and unlooked-at for 31 commits. A node test that runs the script and asserts it exits zero with a row per frame is enough; it need not assert the numbers, which are what a person reads. See [JOURNAL.md](JOURNAL.md).

**How it landed.** The one-word fix and the runner. The stale `passes: [{ pipeline: 'warp', draw:
{ instances: 3 } }]` in [gates/traffic.mjs](../gates/traffic.mjs) became `draws: [{ instances: 3
}]` — the field item 26 renamed — so `isRenderPass` (`'draws' in pass`) takes the render pass for
what it is rather than treating it as a compute pass and dying in `groupsIndirectly`. The script
now runs to the end and prints both rows: at 800×600, `grid` written 192 B / uploaded 16 B and
`compute` written 256 B / uploaded 16 B, both `transientBytes` 0 — the same figures item 22
recorded, `cost().transientBytes` and `arena.traffic()` kept in separate column groups and never
summed. The runner is [tests/bench-traffic.test.ts](../tests/bench-traffic.test.ts), a node test in
the fast suite (the item's "cheap place", no browser and no card): it runs `gates/traffic.mjs` as a
subprocess and fails if it exits non-zero (`execFileSync` throws) or prints no row for a frame in
its list — the frame ids are read out of the script's own source rather than restated, so the
script's list stays the one home. It asserts the script reaches the end and prints one line per
frame, not the byte counts, which are what a person reads — per the item. This closes the specific
hole (`bench:traffic` broken and unrun for 31 commits); the *class* — scripts nothing points at —
is item 74's, which `Needs` this. `npm test` 714 green (+1), `type-check` clean; the export surface
did not move, so `gate:pack` was not required.

### 74. Every script is run by something, or is named as needing hardware

**Status.** done

**Asks for.** A test that reads `package.json`'s `scripts` and fails on one that nothing runs, unless it is on a short list of scripts that need hardware this machine has not got.

**Done when.** Adding a script that no test, no gate and no other script invokes fails `npm test` by name; and `gate:card` and `device-report` pass by being on the list, each with its reason beside it.

**Needs.** item 73.

**Why it exists.** Item 73 fixes `bench:traffic` and gives it a runner, which closes that hole. It does not close the class: `gates/all.mjs` runs four of the nine files in `gates/`, and the reason `bench:traffic` went unread for 31 commits is that nothing pointed at it — not that it was broken. The next script added is in exactly the same position, and a list of what deliberately needs hardware is worth having written down rather than inferred from which files a gate happens to name.

**How it landed.** [tests/scripts-reachable.test.ts](../tests/scripts-reachable.test.ts) reads
`package.json`'s `scripts` and, for each, asks whether something here runs it: another script's
command carries `npm run <name>` (`npm test` for `test`), or a test or gate loads the file the
script executes — the file's basename appearing on a **non-comment** line of a `tests/**` or
`gates/*` source, comments stripped first so a docstring mentioning `npm run device-report` is not
mistaken for a caller. A script neither invoked nor on the accounted `ACCOUNTED` list fails
`npm test` **by name** — proven on a synthetic manifest (a fabricated orphan script whose target
file name is assembled at runtime so the test's own source is not a caller for it) so the
"fails by name" behaviour is checked without breaking the real manifest. The list carries the
scripts nothing invokes on purpose, each with its reason: `gate:card` and `device-report` (need a
real card, the two the item names), `gate:browser` (Playwright's pinned browser), `example` (a
display), and the top-level entries `test`/`type-check`/`gate:pack`/`prepack` (run by a person or
CI, or an npm lifecycle triggered by `npm pack`). Two guards keep the list honest: an entry naming
a script gone from `package.json` fails, and `gate:card`/`device-report` are asserted present with
a reason. Of the eleven scripts today, three are invoked by something (`build` by `prepack`,
`translate` by `translate-build.test.ts`, `bench:traffic` by `bench-traffic.test.ts`) and eight
are on the list. `npm test` 729 green (+4), `type-check` clean; the export surface did not move, so
`gate:pack` was not required. **What the cheap gates could not see: nothing** — this test reads
`package.json` and file text, needs no browser and no card, and its verdict is complete on this
machine. See [JOURNAL.md](JOURNAL.md).

### 75. Naga alone, against the corpus

**Status.** done

**Asks for.** The fifteen corpus WGSL presets translated to GLSL by Naga, with every failure named. Not a comparison — one question: **can WGSL→GLSL carry this corpus at all?**

**Done when.** Every one of the fifteen is run through `naga` to GLSL and the outcome recorded per preset — translated, or failed with the construct named. A findings document carries the readings. Naga arrives as a **dev-time tool**, never a runtime dependency: §17 decision 5 keeps runtime dependencies at zero and §9.1 puts the translator in the build or in a lazily-imported chunk, so a `dependencies` entry fails this item.

**Needs.** Nothing. `cargo` and `rustc` are on this machine and `naga-cli 30.0.1` is on crates.io, both established by item 40's own lift note.

**Why it is split from item 40.** Item 40 asked whether Naga or Tint is better, and that needs a Tint build — which means Dawn, `depot_tools`, and hours of C++, none of it reproducible in a headless session. But **Phase 5 does not need the better translator, it needs a working one.** Decision 2 puts the whole WebGL 2 story on translation; what falsifies it is *no translator carrying the corpus*, and Naga alone answers that. If Naga carries it, Phase 5 proceeds and the comparison becomes an optimisation nobody is blocked on. If Naga does not, that is decision 1 degrading to toy-tier-only by construction — the wall §15 wanted hit early, and Tint would be a long shot against a corpus Naga could not manage.

**What its result must not be read as saying.** The corpus is fifteen fullscreen and compute presets. **"Naga carries the corpus" is not "Naga carries the scene tier."** Scene materials have vertex stages, per-draw buffer slices and depth state that the corpus barely exercises, and the presets that do exercise them are hand-written rather than producer-emitted. A green result here licenses items 41 and 42; it does not close item 44's cross-backend question or item 52's, and it says nothing about `orbit-shadow` translating. Record that limit beside the readings, or the next reader will take a viability check for a guarantee.

**How it landed. Answer: yes — Naga carries the corpus whole.** `naga` (naga-cli
**30.0.1**) installed with `cargo install naga-cli --version 30.0.1` into
`~/.cargo/bin` — a **dev-time tool**, not a `dependencies` entry (`dependencies`
stays `{}`, per §17 decision 5) and not a `devDependency` (a Rust binary, not an
npm one). [gates/naga-corpus.mjs](../gates/naga-corpus.mjs) reads the fifteen
`fixtures/source/*.wgsl` presets, finds every `@vertex`/`@fragment`/`@compute`
entry point (the match reaches across a compute entry's `@workgroup_size` to the
`fn` name), and runs each through naga to the matching GLSL stage. **All fifteen
presets, all thirty-four entry points, translate at GLSL ES 3.10 — none refused.**
The per-preset readings, dated, are [docs/NAGA-CORPUS.md](NAGA-CORPUS.md); the
script reproduces them and exits 0 while every preset still translates, 1 if one
stops (naming the construct), 2 with no naga on PATH. It is not wired into
`package.json` or `gates/all.mjs`, since it needs a dev tool a clean CI machine has
not got — the same reason `gate:card` is not run unattended, and a script item 74's
hardware/tooling list should carry.

**The one caveat worth the row, recorded per this item's own instruction.** es310
is the profile that can express every stage. **WebGL 2 authors GLSL ES 3.00**, and
at that profile five entry points across four presets are refused — three vertex
stages for a storage buffer (`core-draw-list`, `core-material`, `core-perdraw`),
two fragment stages for a storage texture (`core-indirect`, `core-state`) — plus
compute, which WebGL 2 has no stage for. **These are not naga failing to translate:**
they are the WebGL 2 target lacking `storage-buffer`/`storage-texture`/`compute`,
the exact capabilities `refusal()` already names, so such a frame is refused before
translation is reached. The presets a WebGL 2 consumer can actually author
translate to es300 whole. **What the gates could not see:** this is translation, not
execution — no card compiled or drew any of the GLSL. That the translated GLSL
draws the same picture is item 44's question, a browser's or a card's to answer, and
was not run here. The scene-tier limit (per-draw slices, depth state, vertex stages
the corpus barely exercises, `orbit-shadow`) stands unmeasured by this item. See
[JOURNAL.md](JOURNAL.md).

### 76. The `.mjs` gate harness is type-checked

**Status.** done

**Asks for.** The files under `gates/` become visible to `tsc`, so a change to a function they call fails `npm run type-check` rather than a browser gate an hour later — by `allowJs` plus `checkJs` over `gates/`, by JSDoc types, or by making them `.ts`.

**Done when.** Deleting a parameter from a function a gate calls fails `type-check` by naming the gate and the line. Verified by doing it once and reverting.

**Needs.** Nothing.

**Why it exists.** Four times now, and the fourth cost a whole batch. `gates/` is `.mjs` outside `tsconfig`, so `type-check` is blind to it:

- item 26 renamed `draw` to `draws`; `gates/traffic.mjs` went dead for 31 commits (item 73).
- item 69 removed `frameOf`'s `uniforms` parameter; `gates/lib.mjs`'s call shifted every argument after it and `loadCorpus` threw, which killed `corpus`, `trace-contract` and `surface` together and left a whole batch **unread**.
- item 69 removed `ShaderProgram.unreached`; `gates/corpus.mjs` and `gates/card.mjs` still called it.
- item 69 removed `FrameGraph.uniforms`; `gates/surface.mjs` passed it to `frameOf` and its generated bytes landed in the constants slot.

Every one was caught by running a browser gate, which is the most expensive place to find it and the one that reports nothing else when it dies. `type-check` costs seconds and would have named all four at the commit that caused them. Item 73's node test and item 74's script list each close a neighbouring hole; neither closes this one, because both ask whether something *runs* rather than whether it still *type-checks*.

**How it landed.** `allowJs` and `checkJs` are on in `tsconfig.json` and its `include`
gained `gates/**/*.mjs` and `gates/**/*.d.ts`, so `npm run type-check` now reads and
checks the whole harness — the config `tsc --noEmit` uses, not `tsconfig.build.json`,
which is untouched, so the published `dist` is exactly what it was (`files` ships only
`dist`; the gates and the two new `.d.ts` never leave the repo). Two things make the
library calls a gate makes actually *checked* rather than merely *read*:
[gates/load-map.d.ts](../gates/load-map.d.ts)'s `ModuleOf<M>` maps each module string
`loadFromRoot(module)` (lib.mjs) is called with to that module's real exported shape, so
a destructured `const { frameOf } = await loadFromRoot('toy/frame.ts')` is typed against
the source; and [gates/globals.d.ts](../gates/globals.d.ts) augments `Window` with the
real types of every export a gate hangs off `window` (`frameOf`, `missing`, `probe`,
`createWebGPUBackend`, …), so a `window.frameOf(...)` inside a `page.evaluate` callback is
checked too. Everything else was made green with erasable annotations only — JSDoc
`@param`/`@type`, and `/** @type {T} */ (expr)` casts — so no gate's run-time behaviour
moved. Two vestigial fields that the checker exposed as genuine item-69 drift were
removed rather than annotated: the top-level `uniforms` array on `traffic.mjs`'s two
hand-built frames (`FrameGraph` has had no such field since item 69), and the trailing
`[]` argument on `surface.mjs`'s six `glslFrame`/`wgslFrame` builders (the removed
uniforms/constants argument). Both are inert — no typed code read them — so dropping them
changed nothing a gate draws.

**Done-when, verified.** Deleting `frameOf`'s `generated` parameter in `toy/frame.ts` and
running `npm run type-check` failed with `gates/lib.mjs(155,79): error TS2554: Expected
3-5 arguments, but got 6.` and `gates/surface.mjs(537,114): ... but got 6.` — the two
call sites item 69's `frameOf` change went dead at, now named at the commit that would
cause it rather than an hour later in a browser gate. Reverted; `type-check` green, 730
node tests green.

**What the gates could not see.** This item's whole point is a check the cheap gates were
blind to, and it is now one of them; `type-check` and `npm test` both pass. What no gate
that runs here proves is that the eleven gates still *draw* what they did — the edits are
type-only (or removals of provably-inert fields), so behaviour is preserved by
construction, but `gate:browser` and `gate:card` were not run in the unattended session.
The node `tests/gate-harness.test.ts` and `tests/bench-traffic.test.ts`, which drive
`loadCorpus` and `traffic.mjs`'s frames, stayed green, so the two gate helpers whose
run-time forms changed still behave. See [JOURNAL.md](JOURNAL.md).

### 77. WebGL 2 draws vertex geometry

**Status.** done

**Asks for.** The WebGL 2 backend draws a pass whose pipeline reads a vertex buffer of the
shader's own geometry — positions and per-vertex attributes off a `vertices` resource — where
today it draws only its own fullscreen corners and refuses any pass whose draw walks a buffer
(`gpu/webgl2.ts`, the `drawsCorners` refusal *"draws geometry of its own, and this backend has
no buffer for it"*). The vertex data reaches the backend as bytes the way the WGSL frames'
does (`frameOf`'s generated-bytes map, keyed by the resource that reads it); the backend
allocates a vertex buffer through an arena of its own, binds the pipeline's attribute layout,
and draws `drawArrays`/`drawElements` — instanced where a draw counts instances (item 28's
arm already issues `drawArraysInstanced` over corners; this extends it to a real buffer).

**Done when.** A corpus preset that draws `quad-grid` geometry — `core-geometry` is the
simplest, with no depth, stencil, MRT or per-draw slice to entangle it — draws on WebGL 2:
its vertex buffer allocated and freed through an arena, its attribute layout bound off the
pipeline, and the vertex/draw counts `cost()` reports issued. That the picture agrees is a
card's or a browser's per item 44, as every WebGL 2 item's pixel-agreement is (§17 note 3).

**Needs.** item 46.

**Found by review 2026-08-25, filed by the run that lifted item 48.** Vertex-geometry drawing
on WebGL 2 is the prerequisite items 48 (its depth/stencil presets draw a `sheet`), 49 (its
title's real-geometry instancing), and 52 (the scene tier's meshes) each require, but it was
delivered by no item and named in none of their `Needs`. Item 49's own `Done when` draws
`instanced-cubes` through the backend's fullscreen corners plus `gl_InstanceID` (item 28), not
a vertex buffer — `examples/instanced-cubes/main.ts` says so outright (*"item 49 is where it
gains one"*) while its exit criterion never forces it. This item is that path, named once so
the three that need it can depend on it. **Reverse:** delete this item; the three items revert
to naming a prerequisite nothing tracks, which is the state this filing corrects.

**Its `Done when` needs a gate that does not exist, recorded 2026-08-25 by the batch run over
items 43–54.** "Draws on WebGL 2" reads as a `gate:browser` claim, and no browser gate
constructs `createWebGL2Backend` — that harness gap is **item 79**, filed with this note.
Item 79 `Needs` this item for a preset worth drawing; this item needs item 79 for anywhere to
check it. Landing either alone leaves the pair unread, so whichever goes second closes both.

**How it landed.** The WebGL 2 backend ([gpu/webgl2.ts](../gpu/webgl2.ts)) draws a pass whose
pipeline names a `geometry`, where it drew only its own fullscreen corners before. A geometry
pass resolves the pipeline's `geometry` to the `vertices` resource, allocates a vertex buffer —
and, where the primitive carries indices, an index buffer — through the backend's own buffer
arena (item 10's stale-handle safety), uploads the generated bytes with `bufferData`, counts
them through `arena.wrote` as resident geometry (item 22, the way WebGPU counts geometry initial
data), and binds each attribute off the vertices resource's layout (`vertexAttribPointer` at the
location the source reads it, `stride`/`offset`/component-count the generator wrote). The
executor ([submit/gl2.ts](../submit/gl2.ts)) gains a `geometry` arm on `GL2FrameExecution`:
where present it binds the geometry's buffers and layout rather than the shared quad and issues
`drawElements`/`drawElementsInstanced` (indexed) or `drawArrays`/`drawArraysInstanced` (straight
through), one call per draw reading its instance count (item 28) — so a geometry draw of many
copies is one `drawElementsInstanced`. The two buffers go back to the arena on dispose. The
corners path is untouched: a pipeline naming no geometry still refuses a buffer-walking draw with
the same message, and a pass mixing corners into a geometry pipeline, or reading its counts
indirectly, is refused by name.

**What the gates could see, and what they could not.** [tests/renderer-webgl2.test.ts](../tests/renderer-webgl2.test.ts)
draws a hand-authored GLSL geometry frame built from the real `quad-grid` primitive
(`GEOMETRY_PRIMITIVE`, 16×16 → 289 vertices, 1,536 uint16 indices, two `float32x2` attributes at
offsets 0 and 8) — the same structure the build assembles `core-geometry` from, reached through
the node fast suite rather than the dead corpus loader (item 64), which is how items 46/47 landed
their WebGL 2 work. It asserts the vertex and index bytes reach the card, the attribute layout is
bound off the pipeline (stride 16, two `float32x2`) rather than the three-float corner pointer,
one `drawElementsInstanced` issues the index and instance counts, the draw count equals `cost()`'s
`draws`, both buffers are freed on dispose, and a corners/geometry mix is refused. What no gate
here can see is that the resulting picture is byte-correct on a card: the fake records calls, not
pixels; `gate:browser` was not run and no browser gate reaches this backend at all until **item 79**
lands the harness. So *that the geometry draws the right picture* is a card's or a browser's, per
§17 note 3, exactly as every prior WebGL 2 item here. See [JOURNAL.md](JOURNAL.md).

### 78. WebGL 2 uploads resident texture content

**Status.** open

**Asks for.** The WebGL 2 backend uploads a resident texture's initial content — a generated
image handed in as bytes — where today it fills a texture only by drawing it and refuses any
texture arriving with contents (`gpu/webgl2.ts`: *"gives … contents, and this backend fills a
texture only by drawing it"*). A `content`-bearing texture reaches the backend as bytes (the
same generated-bytes seam item 77 reads geometry through); the backend uploads them with
`texImage2D` at level 0 and binds the texture for sampling, where a scratch attachment stays
drawn-into rather than uploaded.

**Done when.** A corpus preset that samples an uploaded texture — `core-texture` is the
simplest, one `value-noise` image sampled fullscreen with no mips — draws on WebGL 2, its
content uploaded through `texImage2D` and its bytes counted through `arena.traffic()` as
resident (item 22). That the sampled picture agrees is a card's or a browser's per item 44.

**Needs.** item 46.

**Found by review 2026-08-25, filed by the run that lifted item 48.** The refusal comment
homes this upload in *"a resident image a scene tier uploads"* — the scene tier is item 52,
which `Needs` item 50 — so item 50 (`core-mips` uploads `value-noise`, then generates its
mips) needs an upload path itemised nowhere, and so does item 52's own materials. This item is
that path. It is deliberately texture content only; a resident *buffer* upload (a per-draw or
storage buffer the page fills) is a distinct capability the corpus's `core-perdraw`/`core-*`
storage presets exercise, refused on other grounds too (storage) and not filed here.
**Reverse:** delete this item; items 50 and 52 revert to naming a prerequisite nothing tracks.

---

### 79. A browser gate draws through the WebGL 2 backend

**Status.** open

**Asks for.** A gate under `npm run gate:browser` that draws **the capability corpus** through the WebGL 2 backend on a real `webgl2` context, one preset at a time, the way `gates/corpus.mjs` already does for WebGPU. The corpus
gate bundles `createWebGL2Backend` into its page ([gates/corpus.mjs](../gates/corpus.mjs) line
30) and never calls it: the loop throws on any fixture whose `language` is not `wgsl` and then
records `"<id> WebGL 2  written in WGSL, which has no GLSL to draw"` unconditionally, so the
WebGL 2 column is fifteen skips by construction rather than by outcome. The card gate does
reach a real `webgl2` context, but hand-builds one program from the translator's GLSL and
issues a single `drawArrays(TRIANGLES, 0, 3)` ([gates/card.mjs](../gates/card.mjs) lines
167–193) — it compares the *translation's* pixels, never the backend's, and constructs only
`createWebGPUBackend`.

**Done when.** A `gate:browser` gate builds a frame through `createWebGL2Backend` on a real
`webgl2` context and asserts something about the pixels it produced — at minimum that a
one-pass fullscreen frame lights the buffer — and the corpus gate's WebGL 2 column reports a
draw rather than a skip for at least one preset. A software renderer is enough: this item asks
that the backend's own draw path *execute* in a browser, not that its picture agree with
WebGPU's, which is item 44's reading on a card (§17 note 3).

**Needs.** item 77.

**Found 2026-08-25 by the batch gate run over items 43–54.** Every WebGL 2 item in the queue
(46, 47, 48, 49, 50, 52, 77, 78) defers its pixel claim to "`gate:browser`/`gate:card` later",
and the batch showed that neither gate can take it as built: the backend's draw path has never
run outside `tests/support/fake-gl.ts`, which records calls and no pixels. Item 77 is the
`Needs` because the corpus presets those items name draw `quad-grid` geometry, which the
backend still refuses — but the gap this item closes is the harness's, not the backend's, and
it outlives item 77: without it, item 77's own `Done when` ("draws on WebGL 2") has no gate to
be checked by either. **Reverse:** delete this item; the WebGL 2 items revert to naming a
gate that cannot run them.

**Corrected on 2026-08-25, before any work started.** The finding that filed this item said the WebGL 2 backend's draw path "has never executed outside `tests/support/fake-gl.ts`". That is true of the two gates it read — `corpus.mjs` and `card.mjs` — and **false of the suite**. `gates/surface.mjs` bundles `host/surface: ['createSurface']` and drives `glslFrame` graphs, and `createSurface` reaches `createWebGL2Backend` through the dynamic import inside `createFrameRenderer`. Its own readings prove a real driver rather than a double:

- `a source that will not compile is refused and the last one keeps drawing` — `said: ERROR: 0:1: 'notAFunction' : no matching overloaded function`, a GLSL ES compiler diagnostic no fake context produces.
- `a resized surface paints every row and column of its buffer` — 180 of 180 rows and 320 of 320 columns, pixels read back off the GLSL path.

So what is missing is narrower and more useful to name exactly: **no gate draws the capability corpus through that backend.** Live compile, draw, resize, refuse and read-back are covered; per-capability presets are not, and those are what items 46, 47, 48, 77 and 78 each defer to. An item built against the overstatement would rebuild coverage that exists.

### 80. WebGL 2: multisample attachments

**Status.** open

**Asks for.** The WebGL 2 backend keeps several samples of an attachment and averages them into a
single-sample target, where today it refuses any texture carrying `samples` by name
(`gpu/webgl2.ts`: *"keeps several samples of … and this backend keeps one"*). A multisampled
colour target is a multisample renderbuffer (`renderbufferStorageMultisample`), its resolve a
`blitFramebuffer` from the multisample framebuffer to the `resolve` target's, the same average
the WebGPU backend takes with a `resolveTarget` on its colour attachment. This is the `msaa`
capability §10 lists and `webgl2Capabilities` already reports for WebGL 2 (item 51).

**Done when.** The `core-multisample` preset — one four-sample `edges` attachment resolved into a
`flat` single-sample target — draws on WebGL 2: its samples kept in a multisample renderbuffer and
averaged into the resolve target through a blit, and the store counts `cost()` reports issued.
That the resolved picture agrees is a card's or a browser's per item 44, as every WebGL 2 item's
pixel-agreement is (§17 note 3).

**Needs.** item 46.

**Found by review 2026-08-25, filed by the run that landed item 48.** The `samples` refusal in
`gpu/webgl2.ts` was labelled "item 48" by item 46's landing — a guess that item 48 ("depth and
stencil") would lift it. It will not: item 48's re-opened scope is depth and stencil alone (a
depth or stencil renderbuffer and the test state), and MSAA is an orthogonal capability the corpus
exercises through `core-multisample`, which item 48 does not touch. So resolving item 48 left the
`samples` refusal — and `core-multisample`'s WebGL 2 arm — tracked by nothing. This item is that
path, named once. It is deliberately colour-attachment MSAA only; a multisampled *depth* target is
a refinement on top of both this and item 48 and is not filed here. **Reverse:** delete this item;
the `samples` refusal reverts to naming a gap nothing tracks. `carry`: no — this is a backend
capability the consuming repository's decision log does not turn on.

