# Roadmap

**This file is the plan and the handover for this repository.** Nothing else queues work here: if an item is not below, nobody is tracking it.

The library ships from `main` as `@altpsyche/engine`. The site that consumes it keeps its own roadmap, and the two are separate on purpose — a change is filed where the code it touches lives, which is [D106](https://github.com/altpsyche/altpsyche-dev/blob/master/docs/DECISIONS.md) in that repository's log. Design decisions about the renderer are recorded there as well, because that is where the log is; this file queues work and does not decide anything.

**Started on 2026-08-24** with one item, which arrived from the site's roadmap because the code it asks for is here and could never be worked from there.

**Direction for this repository is [RoadToPureEngine.md](RoadToPureEngine.md).** That document decides nothing this file queues, and this file queues nothing that document decides; where an item below names a stage, the stage is defined there.

**Filled out on 2026-08-24** with the whole of that document's road, as fifty-eight items in seven phases.

---

## How to read this

**A phase here is a stage there.** Phase N is Stage N of [RoadToPureEngine.md](RoadToPureEngine.md) §15, with the same number and the same exit criterion. There is deliberately no second numbering scheme: a plan with two sets of numbers for one thing is a plan whose two halves drift.

**An item number is an address, not an order.** Numbers are assigned once and never reused or renumbered, because they are cited from outside this repository — item 1 is cited as this repository's item 1 in the consuming log's D118. So item 1 sits in Phase 2, where its dependency puts it, rather than first.

**Done when is the only definition of done.** Every item below carries one, and it is written so a person who did not do the work can check it. An item with no observable finish is an item that is never finished.

**Needs names the items that must land first.** Where it says nothing, nothing blocks it.

**Ordering inside a phase is a suggestion; the dependency graph is not.** Two items in one phase with no dependency between them may land in either order or at once.

**Status is one of three words**, and whoever lands an item maintains it in the same commit:

| status | means |
| --- | --- |
| `open` | not landed |
| `done` | landed |
| `lifted <where>` | it cannot be finished on this machine, and this says where it went |

**An item is reachable when every item its `Needs` names is `done`.** That is the only rule for choosing what to work, and the lowest-numbered reachable item wins. `lifted` never satisfies a `Needs`: an item waiting on lifted work is not reachable, and saying otherwise is how a run builds on something that was never landed.

**A commit that lands an item begins `item N: `.** That is what makes the history the index — `git log --oneline --grep '^item 27'` finds what landed item 27 — so the status line stays three words instead of carrying a hash that a rebase would falsify.

---

## Phase 0 — stop the bleeding, and give the phase an outward face

Days, no architecture. Implements decisions 6, 8 and 11.

*Exit:* no known silent-wrong-output path; no document naming a file outside this repository; an unmodified Shadertoy fragment source in the uniform-only subset draws.

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

**Status.** open

**Asks for.** `ABSTRACTION.md` and `RENDERER-DESIGN.md` lose every path that does not exist here, each `Dnnn` reference gains a sentence saying what it settled, and the stale audit rows are marked solved.

**Done when.** A script walks every backtick-quoted and link-quoted path in `docs/` and finds no missing file, and it runs in the gate suite so the next stale path is caught rather than noticed.

**Needs.** Nothing.

### 6. The `shadertoy()` producer

**Status.** open

**Asks for.** A producer taking an unmodified Shadertoy fragment source and the uniform-only subset — `iTime`, `iTimeDelta`, `iFrame`, `iResolution`, `iMouse` — and returning something drawable.

**Done when.** An unmodified Shadertoy source using only those uniforms draws, and a source sampling `iChannel0` is refused by a message naming `iChannel0` and saying textures are not in this path yet.

**Needs.** Nothing. It sits on machinery that ships today: the WebGL 2 backend already takes GLSL and already draws one fullscreen pass.

**Note.** Phase 0 owns a producer deliberately, per [RoadToPureEngine.md](RoadToPureEngine.md) §15 Stage 0. Everything else in this phase benefits only the people who wrote it, and a phase with no outward face is a phase that slips.

### 7. `examples/` begins

**Status.** open

**Asks for.** The directory, a way to run one, and the first two: `fullscreen` and `shadertoy-paste`.

**Done when.** `npm run example <name>` opens either one, and each imports the package door and nothing else — no relative reach into a folder.

**Needs.** item 6 for the second one.

### 8. `selectBackend`

**Status.** open

**Asks for.** Backend choice moves inside the library: which backend draws a given frame is answered from what the frame is authored in and what it declares it needs, across whatever the device offers.

**Done when.** A GLSL-authored frame picks WebGL 2 **on a machine that has WebGPU**; a WGSL frame picks WebGPU where an adapter actually returns one; and a refusal appears only when no backend is left, naming what was missing. A test covers all three.

**Needs.** Nothing.

**Note.** Selection before refusal, per §10. A consumer arriving with a GLSL shader gets a picture, not a lecture.

### 9. `probe()`, and readings rather than a matrix

**Status.** open

**Asks for.** A public one-shot reading — which backend was selected, whether WebGPU was reported, whether an adapter was returned, **whether the device then survived a few frames of on-screen compositing**, the renderer string, an assertion that the adapter architecture is not `swiftshader`, features, limits, tier run. Plus `docs/DEVICES.md` and `npm run device-report`.

**Done when.** `probe()` returns all of those fields; `DEVICES.md` exists carrying the two readings already taken, dated, with the explicit line that absence is not a claim of non-support; and `device-report` prints a row a stranger can paste into a pull request.

**Needs.** Nothing. `report()` already gathers most of it and has never had a caller.

**Note.** Three states, not two: an adapter that came back and then died in under a second is a success by any two-state reading. See decision 11 and the measured case beside it.

---

## Phase 1 — the split

The one piece of real surgery. Implements the three lifetimes of §5. **Adds no features.**

*Exit:* `createProgram` is gone; the twelve trace presets still agree; not one gate edited.

### 10. The arena, and branded handles

**Status.** open

**Asks for.** `resource/` with allocation, upload, resize and free, addressing everything by branded integer handle, and a free list that bumps a generation so a stale handle is detectable rather than silently valid.

**Done when.** Every resource the current backend allocates is allocated through the arena, and a handle freed and reallocated does not compare equal to its predecessor.

**Needs.** Nothing.

### 11. Uploads are queued, not immediate

**Status.** open

**Asks for.** An upload path ordered against the frame that reads it, replacing the current unsequenced destroy-and-recreate on resize.

**Done when.** A test resizes and draws in the same tick and the double sees the writes land before the draw that reads them.

**Needs.** item 10.

### 12. The pipeline cache, keyed on structure

**Status.** open

**Asks for.** `pipeline/` owning module compilation and a cache keyed on the whole structure a pipeline depends on — source, entry points, formats, blend, depth, vertex layout.

**Done when.** Two requests with identical structure return one handle, two with any difference return two, and item 2's narrower fix is deleted as superseded rather than left beside it.

**Needs.** item 2, item 10.

### 13. `submit/`

**Status.** open

**Asks for.** The executor: a graph plus the arena plus the pipeline cache become commands on a device.

**Done when.** Every draw in the existing suite goes through it.

**Needs.** item 10, item 12.

### 14. The seam for today's descriptions

**Status.** open

**Asks for.** A `FrameDescription` translated to the new path at one place, so nothing above has to move in this phase.

**Done when.** Every existing test and gate passes **unedited**. An edited gate in this phase is the signal that the phase is doing two things.

**Needs.** item 13.

### 15. `createProgram` is deleted

**Status.** open

**Asks for.** The function that fused three lifetimes goes.

**Done when.** It is absent from the tree, and the twelve trace presets still agree.

**Needs.** item 14.

---

## Phase 2 — handles, transients, validation, and the cost metric

Implements decision 9 and unblocks item 1.

*Exit:* no resource resolved by string at draw time; one home per rule; a use-after-free fails a test; every preset asserts an exact `cost()`.

### 16. Strings become handles at every call site

**Status.** open

**Done when.** No resource is looked up by string in a map at draw time anywhere in the backend, and misuse is a type error rather than a map miss.

**Needs.** item 10, item 13.

### 17. `Ref` gains its two arms

**Status.** open

**Asks for.** Resident and transient, per §8: a resident resource is arena-allocated and lives across frames, a transient is declared in the graph by descriptor.

**Done when.** A graph can declare a transient depth target and a resident mesh buffer in one frame, and each resolves correctly.

**Needs.** item 16.

### 18. Transient pooling and aliasing

**Status.** open

**Done when.** Two graphs asking for the same transient shape reuse one allocation, and a test shows the second frame allocates nothing new.

**Needs.** item 17.

### 19. `validate(graph)`

**Status.** open

**Asks for.** One pure function holding every rule currently written in two wordings, [renderer/frame-rules.ts](../renderer/frame-rules.ts) included.

**Done when.** No rule about a graph is checked in two places; `frame-rules.ts` is absorbed and deleted; the function takes the graph alone and touches no device.

**Needs.** item 17.

### 20. The double tracks handle liveness

**Status.** open

**Asks for.** The recording double models lifetimes as well as calls, which ABSTRACTION.md's audit named as a gap.

**Done when.** A use-after-free and a leak each fail a test in the fast suite.

**Needs.** item 10.

### 21. `cost(graph, size)`

**Status.** open

**Asks for.** Passes, draws, dispatches, pipeline switches, bind switches, attachment loads and stores, transient bytes. Pure, deterministic, no GPU.

**Done when.** It takes the graph and a `{ width, height }` record and nothing else — no device, no arena, nothing carrying behaviour — and returns identical numbers on any machine.

**Needs.** item 17.

### 22. `arena.traffic()`

**Status.** open

**Asks for.** Bytes written and uploaded, read from the arena, because that is a resident-lifetime fact the graph does not carry.

**Done when.** It reports since-last-reset totals, and the benchmark reports it **beside** `cost()` and never summed with it.

**Needs.** item 10, item 21.

### 23. Every preset asserts an exact cost

**Status.** open

**Done when.** Each corpus preset carries an asserted `cost()`, and a change that adds a pass or a pipeline switch fails until the number is updated deliberately.

**Needs.** item 21.

### 1. Discarding an attachment nothing reads, and merging two passes over one

**Status.** open

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

### 24. `refusal(graph, device)` and the `Capability` type

**Status.** open

**Asks for.** The third of the pure functions, and the `Capability` enum it reads: `compute`, `storage-buffer`, `storage-texture`, `indirect`, `timestamp`, `occlusion`, `msaa`, `float-blend`, `depth-clamp`, `bgra-storage`. A graph declares `requires`; a device reports `capabilities`.

**Done when.** It takes the graph and a `{ backend, capabilities }` record and nothing else, returns a message naming every missing capability or null, and **no backend anywhere has a method it must throw from.** A test asserts the message names the capability rather than the backend.

**Needs.** item 17.

**Note.** It answers the second question, not the first. Selection (item 8) asks which backend should draw this and is answered across everything on offer; refusal is what a caller reads only when selection came back empty.

### 25. `examples/compute-field`

**Status.** open

**Asks for.** A compute shader writing a storage texture that a blit shows, which is the compute toy tier.

**Done when.** It draws on WebGPU, and on a WebGL 2 machine it prints the refusal `refusal()` returned rather than a black rectangle.

**Needs.** item 8, item 17.

---

## Phase 3 — per draw, and many draws

Implements decision 7's target argument. **Gated by an example.**

*Exit:* `instanced-cubes` draws a thousand objects on both backends in one pass and its `cost()` is inside budget.

### 26. `RenderPass.draws` becomes a list

**Status.** open

**Done when.** One pass carries many draws, and the one-draw-per-pass shape is gone from the types rather than merely unused.

**Needs.** item 17.

### 27. `Draw.perDraw`

**Status.** open

**Asks for.** One slice of a per-draw buffer per draw: a dynamic offset on WebGPU, `bindBufferRange` on WebGL 2, one field either way.

**Done when.** A thousand draws read a thousand distinct records from one buffer on both backends, with the 256-byte alignment respected and a refusal by name when an offset breaks it.

**Needs.** item 26.

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
