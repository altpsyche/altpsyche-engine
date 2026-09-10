# Roadmap

**What is available to work on, what is blocked, and what is nothing but an idea.** One item per
piece of work, each carrying the measurement it will have to quote and a `Done when` a reader who
did not do the work can check.

**Why this file exists again.** It was deleted at 0.3.0 because the queue it tracked had emptied,
107 items with every one landed or superseded, and `git log` was left as the record. That was
correct then and it stopped being correct when the package took on the layer above the renderer,
because a piece of work with no place to be written down is a piece of work that gets forgotten or
done twice. A piece of work is filed where the thing it changes lives, which is the rule the
consuming site recorded as its D118 and which put this file here in the first place.

**What this file is not.** It does not track the website that consumes this package, and it does
not track anything about the article series that site publishes. Those live in that repository and
neither one queues work here. **A series wanting a capability is not a reason to build one**, which
is the same rule as the one at the top of `CLAUDE.md`: an argument amounting to "the consumer needs
it" is thrown out and replaced by a reason that stands on the package's own merits.

**Where the package stands, as the baseline any item below is measured against.** The renderer is
built to the whole WebGPU core specification, every capability has a fixture the gates draw, and the
gates are green: 4 of 4 browser gates, 17 of 17 on a real card, 15 of 15 on the recording contract,
and 864 node tests over 73 files, measured on 2026-08-29. That last pair read 514 over 34 here until
it was re-taken, so it had expired rather than moved.

---

## Item 1 — the frame declaration reader onto the door

**Opened on 2026-08-29.** A consumer describing a frame of more than one pass has to write a
`FrameGraph` by hand: allocate every handle in the order the arrays are built, repeat every binding
number its own WGSL already declares, and get no complaint from this package when the two disagree.
The reader that does that work and checks it exists, and it is not on the door. It is
`declaredFrame` in `fixtures/shader-describe.ts`, 787 lines, with its declaration type beside it in
`fixtures/declared-frame.ts`, 205 lines. **That file's own header names its trigger**, which is a
shader outside the corpus declaring a frame of its own, and one now does.

**What the reader does that hand-writing does not.** It reads the source for every compute entry
point, every storage texture, every storage buffer, every uniform block, every sampler and every
vertex input, and it checks what the entry declared against what the file declares. Every
disagreement stops the build with a sentence naming it. Each of those disagreements is silent on the
card: a dispatch of an entry point the file does not declare is a pipeline the driver refuses after
the fact, a texture nothing binds is a picture that stays whatever the memory held, and a `present`
naming nothing copies out the wrong texture.

**Why it stands on this package's own merits.** The distinguishing claim here is that a frame can be
described, costed and refused before a driver sees it. Today the refusal half of that claim reaches
only the frames in `fixtures/`. Everything a consumer builds by hand is described and costed and
never refused, so the claim is weaker outside this repository than inside it, and the code that
would close the gap is already written and already covered by the gates.

**Why the bound below does not block this one.** The bound decides what belongs in the layer above
the renderer, and this is not new capability in that layer. It is an authoring path for the frame
graph, which is the renderer's own centre, and it passes all three of the candidate bounds rather
than needing one of them chosen: a frame graph is named there as the example of what a reader cannot
reasonably write themselves, it is what the comparable packages expose in some form, and it is the
diagnostics claim itself. An item that passes every candidate bound cannot be the one that sets the
precedent by accident, which is what the bound exists to prevent.

### What is on the door already and what is not

The reader's dependencies are mostly published. `WGSL_DOCUMENT`, `uniformBindingOf`,
`namesReachedBy`, the handle constructors, `GEOMETRY_PRIMITIVE`, `GeometryPrimitive`,
`TransientSize` and `StencilMode` are all exported today.

Four things are not, and each one is a decision rather than a move.

- **The reader and its type**, `declaredFrame` and `DeclaredFrame`, which are what the item is for.
- **The source readers**, `fixtures/wgsl-pipelines.ts`, 305 lines, which is what turns a WGSL file
  into the entry points and bindings the check is run against. A consumer may want them and the item
  does not assume it, so they move into the package and stay unexported until something asks.
- **`BlendMode`**, `fixtures/shader-blend.ts`, 21 lines and one value, `'over'`. A declaration that
  names a blend publishes the name.
- **The two content unions**, `fixtures/shader-content.ts`, 256 lines. `TextureContent` is
  `'value-noise'` and `BufferContent` is `'copy-tints' | 'draw-list-models' | 'material-objects' |
  'perdraw-slices'`. **These must not be exported.** They name this repository's fixture data, and
  putting `'draw-list-models'` on a published surface hands that corpus to every consumer.

**The content unions are the only part of the reader that is hard**, and the shape of the difficulty
is known: inside `declaredFrame` the `content` field is read in one place for a sampled texture's
format and everywhere else as a yes or no saying whether the source samples the name or stores into
it. The half that needs the generators in full is `generatedBytes`, which is a separate exported
function turning those names into bytes.

### Steps

1. **Settle what a published declaration says about generated contents, and write the reason where
   the field is.** The choice is between dropping `content` from the door's declaration, so a
   consumer names a format and supplies its own bytes, and keeping the field with the generator
   passed in by the caller. Whichever lands, the fixtures keep their own names for their own data.
   Quote: the count of names the door exports before and after, and `gate:browser` at 4 of 4, which
   is the fifteen fixtures still drawing under the new shape.
2. **Move the reader, its declaration type and the source readers out of `fixtures/` into the
   package, without exporting any of them**, with the corpus importing them from their new home.
   Quote: `npm test` at 864 tests over 73 files, `npm run type-check` clean, and the door's export
   count unchanged, which is what says a move was a move.
3. **Settle `BlendMode`.** Either it goes on the door beside the declaration, or the declaration
   takes a `GPUBlendState` and the fixtures keep their own one-value name for the blend they use.
   Quote: `gate:pack`, and the export count against step 2's.
4. **Export the reader and its declaration type**, with `docs/API.md` gaining both in the group a
   reader building a frame is already reading, and `docs/GUIDE-frame-graph.md` gaining a worked
   example of a frame of more than one pass declared rather than constructed. Quote: `gate:pack`,
   which is what says a consumer outside this repository can import them, and `gate:browser` at
   4 of 4.
5. **Close it**, with what it leaves behind written into the documents rather than left here, and
   the entry deleted.

### Done when

- A consumer outside this repository builds a `FrameGraph` from a WGSL source and a declaration,
  shown by `gate:pack` rather than by an import from inside the tree.
- None of `'value-noise'`, `'copy-tints'`, `'draw-list-models'`, `'material-objects'` or
  `'perdraw-slices'` reaches the door, read off the declarations a build writes rather than off
  `index.ts`.
- The fifteen fixtures draw through the exported reader rather than through a copy of it, so the
  gates cover the published path and there is one path. `gate:browser` at 4 of 4 and the recording
  contract at 15 of 15.
- `docs/API.md` names both and `docs/GUIDE-frame-graph.md` shows a declared frame of more than one
  pass.
- `npm test` and `npm run type-check` are green at every step, and `gate:pack` is green on every
  step that moves the door.

**What would change the answer.** If step 1 finds that a useful declaration cannot be written
without shipping content generators, the reader stays behind the corpus and this item closes as
refused with that reading recorded, because the alternative is publishing fixture data.

---

## Item 2 — a stencil that counts, since one face and the other are not the same face

**[`FIGURE-FORMAT.md`](FIGURE-FORMAT.md) is the figure language, the change in flight above this package**, and this item
is the only part of it that reaches here. That document says what this package refactors for it,
which is nothing, and what it must not do.

**Opened on 2026-09-08.** `StencilMode` is `'mark' | 'inside'`, and both of them set `stencilFront`
and `stencilBack` to one state. `gpu/webgpu.ts` assigns the same `face` object to each, and
`gpu/webgl2.ts` says why in its own comment: "a mask has no front and back a picture could tell
apart, so one `stencilOp` and one `stencilFunc` — which set both faces — is the whole of it." What
that gives is a boolean mask. `mark` replaces every bit where it draws and `inside` keeps what
compares equal.

**Why it stands on this package's own merits.** The distinguishing claim is that this renderer is
built to the whole WebGPU core specification. `GPUDepthStencilState` carries `stencilFront` and
`stencilBack` as separate members, and it carries them separately because the two differ: that is the
only way the specification offers to tell a front-facing fragment from a back-facing one in the
stencil stage. Collapsing them to one state is the one place a pipeline this package builds cannot
express a pipeline the specification describes. A device reports no capability that is missing here,
so `refusal` returns `null` and the frame draws the wrong picture rather than being refused, which is
the failure mode this package exists to prevent.

**What a counting stencil is for**, stated so a reader can judge the merit rather than take it on
trust. A filled path with a hole, or one that crosses itself, has its interior decided by a winding
number, and a winding number is counted by drawing the path's triangles and letting front and back
faces cancel. That is Loop and Blinn's technique and it is how every GPU vector renderer draws a
fill. It is also what `@altpsyche/maths` will need, and that is not the reason: **the reason is that a
renderer claiming the core specification either expresses per-face stencil state or does not claim
it.**

### Steps

1. `StencilMode` grows the counting pair, as `'count'` and `'nonzero'` beside `'mark'` and
   `'inside'`, with `count` incrementing on front faces and decrementing on back faces, both
   wrapping, and `nonzero` covering where the counter is not zero. **Measures:** the two backends
   agreeing on a fixture that a mask cannot draw, to the single channel the corpus already holds them
   to.
2. A fixture that separates them: a path wound so that a mask fills a hole a counter leaves empty.
   **Measures:** the two pictures differing by a named number of pixels under `mark`, and by none
   under `count`.
3. `refusal` answers for a device that cannot do per-face stencil, if any reachable one cannot.
   **Measures:** the capability read off both backends on the machines the gates run.

### Done when

- `StencilMode` names the counting modes, both backends implement them, and `docs/API.md` says what
  each does to the mask in the card's own fields the way the current pair are described.
- A fixture draws a self-crossing filled path correctly under the counting mode and visibly wrongly
  under the mask, with the pixel difference between them recorded.
- The two backends agree on that fixture to the single channel the corpus holds every preset to.
- `npm test`, `npm run type-check` and `gate:browser` are green, and the card gate is re-taken.

**What would change the answer.** If WebGL 2 cannot reach `glStencilOpSeparate` through the path this
package builds pipelines on, the counting modes are a WebGPU capability and `refusal` names them,
which is the arrangement this package already uses everywhere the two backends differ.

---

## Item 3 — the maths behind a door of its own, since 7,520 bytes of arithmetic cost 207,090 to reach

**Opened on 2026-09-10.** `vec3`, `mat4` and `mat3` are published names on the one door, and the only
way to reach them is that door. `index.ts` re-exports the renderer, the frame graph, the scene, the
host probe and the toy reflectors alongside them, so a consumer wanting the arithmetic downloads all
of it.

**The measurement.** Walking static imports from `index.ts` and `host/surface.ts`, which are the two
eager roots `tests/import-graph.test.ts` already uses, reaches 27 source files whose built JavaScript
is 207,090 bytes. The built JavaScript of `scene/maths.ts` is 7,520 bytes of that. So the arithmetic is 3.6 per cent of
what reaching it costs, and the walk confirms `gpu/webgpu.ts` is not among the 27, which is the gate
that already stands.

**Why it stands on this package's own merits.** The header of `index.ts` states the reason the
backends are not re-exported: "re-exporting a backend here would pull both into every consumer's
first download whatever card the browser has." That is the same argument one level up. A published
name whose cost to import is twenty-seven times its own size is a defect of the surface, and the cost
falls on anyone who wants the vectors and matrices this package publishes, not on any one consumer.
The package describes itself as the renderer and the engine above it; the arithmetic is the top of
that stack and the only part with no device in it.

**What it changes, and it is the thing to settle before any step runs.** The standing refusal in
`CLAUDE.md` is that no export moves out from behind the one door in `index.ts`. Its stated reason is
that the shape of what is public is decided there rather than by which file a caller happened to
find. **A second entry declared in `exports` keeps that reason and an undeclared subpath breaks it**:
a declared door is a decided surface with a gate over it, where a subpath is whatever a caller
guessed. That reading is this item's and the call is not a session's to make silently.

**Steps.**

- [ ] **1. The refusal is settled in the words it will keep.** `CLAUDE.md` and
  `docs/ARCHITECTURE.md` say whether a declared entry point is a decided surface or a break in the
  one-door rule. **The measurement**: the refusal as it reads before and after, and the number of
  declared entries in `package.json`, one today.
- [ ] **2. `./maths` is declared and nothing moves.** `package.json` gains the entry with its own
  types and default. `scene/maths.ts` keeps every export it has and `index.ts` keeps re-exporting all
  of them, so no name leaves the first door and no consumer's import line changes. **The
  measurement**: `gate:pack` green; the built JavaScript reached through `./maths` against the
  207,090 bytes reached through `.`; and the eager closure of `.` unchanged at 27 files.
- [ ] **3. The import graph gate walks the new door.** The new entry becomes a third eager root and
  its closure is held to `scene/maths.ts` alone, so an import added to that module fails a gate rather
  than quietly putting the renderer back behind the arithmetic. **The measurement**: the closure's
  file count, and the gate red when an import of `graph/types.ts` is added to that module and green
  when it is taken out.
- [ ] **4. `docs/API.md` says which names are behind which door.** **The measurement**: the count of
  names under each heading, against the two entries the manifest declares.

**Done when.**

- `package.json` declares two entry points and `npm run gate:pack` is green.
- The closure of the second entry is one file, held by `tests/import-graph.test.ts` rather than by
  intention.
- Every name the one door exported before still comes out of it, which `tests/api-signatures.test.ts`
  checks by member.
- `npm test` and `npm run type-check` are green, and `gate:browser` is run once over the batch.
- `CLAUDE.md` reads the refusal in whichever form step 1 settled, and no document disagrees with it.

**What would change the answer.** If the refusal stands as it is, this item is refused rather than
deferred, and the arithmetic stays behind the one door. A consumer wanting it then imports the whole
eager chunk or keeps its own copy of the arithmetic, and holding two copies equal by a gate is that
consumer's answer instead of this item.

---

## What is still to be settled, and it does not block item 1

### The bound the layer above the renderer is built to

**The renderer had one and it is why that work went well.** The WebGPU core specification was the
bound, every capability landed with a fixture of its own, and nothing was built because a lesson
wanted it. There is no specification for the layer above, so the same question needs a different
answer: what decides whether a scene system, an input abstraction, an asset path or an animation
model belongs in this package.

**Three candidate bounds, and none of them is chosen.**

- **What a reader doing graphics in a browser cannot reasonably write themselves.** A frame graph
  qualifies. A key handler does not.
- **What the comparable packages expose**, treated as a survey rather than a target, since matching
  a feature list is not a design.
- **What the diagnostics can still say something true about.** This package's distinguishing claim
  is that a frame can be described, costed and refused before a driver sees it. A capability that
  cannot be described that way weakens the claim rather than extending it.

**Done when** the bound is written down, with what it admits and what it refuses, and with a
worked example of each.

**Why it blocks every candidate.** Every candidate below is new capability in that layer, and
without a bound the first one that arrives sets the precedent by accident. It does not block item 1,
which is an authoring path for the frame graph rather than a candidate, and which passes all three
of the candidate bounds as they stand.

---

## Candidates, which are ideas and not items

**None of these is planned and none may be started before the bound above exists.** They are
written down so the thinking is not lost.

| candidate | what it would be | what makes it doubtful |
| --- | --- | --- |
| input | a device-agnostic reading of pointer, key and touch state per frame | the smallest thing here and the least in need of a library |
| assets | fetching, decoding and residency for images, geometry and text | the `gltf-cube` example parses a document itself in 458 lines on purpose, and its header says a `gltf()` door would be the wrong decision |
| animation | a clock, curves, and a way to drive scene values from them | needs a scene model settled first |
| a scene system | nodes with lifetimes, above the submission path in `scene/` | this is where an abstraction usually starts assuming one backend, which the whole stack is built not to do |
| lights | a light as scene data rather than as uniforms a caller packs | a shadow pass is caller-side today and the `orbit-shadow` example is 464 lines showing it |

**One standing obligation rather than a candidate.** Whatever the layer gains, a consumer that
draws one fullscreen shader must not download it. `chunk-split` in the consuming repository counts
that from the outside, and the two backends already load by dynamic import for the same reason.

---

## What depends on this package, and which version of it needs what

**This is a record and not a queue.** No row below is a reason to build anything here, which is the
rule at the top of `CLAUDE.md` and the rule item 2 states about itself: a consumer wanting a
capability is thrown out and replaced by a reason that stands on this package's own merits. What the
table is for is the other half of that rule. A dependency nobody wrote down is one a session
rediscovers by reading another repository's roadmap, and the direction between these two packages is
a standing refusal here, so the direction is worth stating where it binds.

**The direction.** `@altpsyche/maths` depends on this package, behind a dynamic import in a GPU
painter it has not built yet. This package never imports that one. The case that looks like it needs
the second is a shader declaring a camera, and the answer is that whatever holds both reads the
camera from here and hands it to a figure as data.

**That package was at 1.0.0 with its door frozen when this was written and is at 2.5.1 now**, and
this one is at 0.3.0. A frozen door promising a consumer that a name does not change cannot be
honoured through a dependency below 1.0.0, where a minor may break anything. Its answer was to take a
clean break of its own: it went to 2.0.0 for a figure format, and until this package reaches 1.0.0
that consumer either pins an exact version or takes the churn by hand. **Nothing here is asked to
move for that**, and the choice is recorded so neither side rediscovers it.

**Its ladder moved on 2026-09-08 and again on 2026-09-10**, so the rows below are re-read from that
file rather than kept as they were written. A recorder went in front of the painter and every version
behind it shifted by one, and its 2.1.0 through 2.5.1 are cut with none of them touching this package.

| version of `@altpsyche/maths` | what it draws through this package | what it needs from here |
| --- | --- | --- |
| 1.1.0 through 1.6.0 | nothing | nothing |
| 2.0.0, the figure format | nothing | nothing. That document is [`FIGURE-FORMAT.md`](FIGURE-FORMAT.md), and what this package refactors for it is nothing |
| 2.1.0 through 2.5.1, cut and unpublished | nothing | nothing |
| 2.6.0, a recorder writing a video file | nothing. It encodes what a painter already drew, and the painter it drives today is a 2D canvas | nothing |
| 2.7.0, a GPU painter | every mark a figure draws, as filled and stroked paths | a stencil that counts, which is item 2. A filled path with a hole has its interior decided by a winding number, and the mask both `StencilMode` values give cannot count one |
| 2.8.0, dashes and quadratics | a dashed stroke and a quadratic segment | nothing beyond item 2 |
| 2.9.0, text on a GPU and a recorder with no page | glyph outlines as filled paths | nothing beyond item 2 |
| 3.0.0, depth | a figure in space that keeps its depth order | nothing beyond item 2. What gates it is a decision in that repository about whether a figure may be undrawable in SVG |
| 3.1.0, a clip that is a path | a clip region that is not a rectangle | item 2 again, since a path clip is a stencil where a rectangle is a scissor |
| 4.0.0, a figure a reader can act on | nothing decided yet | possibly nothing. Pointer and key state is a candidate above and is doubtful on its own merits |

**One row in that ladder needs this package before any painter does, and it is not on the table
above.** That file decided on 2026-09-10 that the duplication between the two packages closes inside
its 2.x band rather than being gated inside it: the vector and matrix maths here and there are the
same arithmetic written twice, six `vec3` functions identical character for character and nine `mat4`
functions overlapping, and until its 2.5.1 the two projections wrote clip depth into different
ranges with nothing catching it. So it declares this package and imports these names at whatever
version does that refactor, which is earlier than its painter. **What it needs from here is item 3**,
and that item stands on this package's own merits or not at all.

**When that consumer's spike arrives, and why it matters here.** A throwaway painter over this
package, drawing a figure's marks as they stand, is a session in that repository scheduled after its
1.6.0 and before its format work. The reason it is early is this package's release time: a gap found
there costs an item, a commit and a release here before that painter can use it, and the roughly
fifty-five commits of its 1.x and 2.0.0 work are the only slack that lead time has. **What that means
for this file is that items may arrive from it in one batch**, each still argued on this package's
own merits or thrown out, and the first of them is already here as item 2.

**That spike has run, and its batch is below.** Read on 2026-09-09 on a `blackwell` adapter through
`gate:card`'s own launch arguments, drawing a figure's marks as filled and stroked paths. **Eight gaps
came out of it and three of them are not for this package**: a plain text mark carries a font family
and no outline, which is that package's own 2.3.0; a mark's colour is a CSS colour string, which is
that package's own format work; and the counted stencil is item 2 here already, re-measured rather
than re-found. **One more is documented behaviour of this package rather than a defect** and is
recorded under the batch instead of in it. **The four left are argued below on this package's own
merits**, and each names the reading that found it so a session can reproduce it rather than trust it.

### The spike's batch, four findings

**Finding A: `createFrameRenderer` contradicts what `gpu/select.ts` says the library does.** That
module opens by stating which backend draws a frame is "answered inside the library rather than by the
caller naming one", and `createFrameRenderer` builds WebGL 2 for every caller that passes neither
`backend` nor `device`. Nothing on the door runs a selection for a caller and nothing gathers a
`DeviceOffer`, so the four steps a caller must take are its own: gather the offering, call
`selectBackend`, call `requestWebGPUDevice`, pass both back in. **The reading.** A WGSL frame handed
to `createSurface` on a machine whose adapter came back was refused with `WebGL 2 was handed a wgsl
frame to draw`, while `selectBackend` on that same page answered `{ backend: 'webgpu' }`. **Why it
stands here.** A stated intent that the code does not carry out is this package's own inconsistency,
and it is the shape of it rather than a missing convenience: the pure selection exists and the join to
the renderer does not.

**Finding B: `resolve` and `cost` both accept a description that cannot draw.** The two draw forms are
`{ vertices }` and `{ instances }`, and `issueDraws` reads the first through `drawsCorners`, calling
`draw` without ever reaching `setVertexBuffer`, whatever the pipeline's `geometry` names. **The
reading.** A geometry pipeline drawn with `{ vertices: count }` drew nothing, and the card is what
said so: `Vertex buffer slot 0 required by [RenderPipeline (unlabeled)] was not set`, followed by an
invalid render bundle and an invalid command buffer every frame. `resolve` answered
`{ backend: 'webgpu' }` for that frame and `cost` costed it at 1 pass and 1 draw. **Why it stands
here.** This package's own comments say a description is refused by name rather than left to fail on
the card, and both of its pure readings pass this one. A pipeline naming `geometry` drawn by a form
that binds none is a description no card can draw, which is decidable without a device.

**Finding C: `probe()` leaves a canvas on the page for every backend it trials.** `onScreenCanvas`
creates a 200 by 100 canvas at `position: fixed; left: 0; top: 0`, appends it to the document and
removes it from nothing, and the trial is why it is on-screen at all. **The reading.** After one
`probe()` on a machine offering both backends, two of those canvases stand over the top-left corner of
the document, and the first picture drawn afterwards had that corner covered by the clear colour
(0.1, 0.2, 0.3) they hold, read back as (25, 51, 76). **Why it stands here.** A door export that
changes a caller's document permanently is a defect in this package whatever the caller is. The trial
needs the canvas composited while it runs and needs nothing of it afterwards.

**Finding D: this package's own plan for 3.1.0 assumes a scissor that does not exist.** The row above
reads "a path clip is a stencil where a rectangle is a scissor", and `FrameGraph`, `PassSpec` and
`DrawSpec` name neither a scissor nor a viewport. **The reading.** The word appears nowhere in this
tree outside this file. **Why it stands here.** A plan in this file resting on a capability this file
is the only mention of is this package's own inconsistency, and it decides whether 3.1.0 is one item
or two.

### What the spike found that needs nothing here

**A pass drawing the frame the reader sees keeps one sample of each pixel and can name no blend, and
both are written down already.** `PipelineSpec.samples` says a pipeline drawing that frame never
carries one because the frame's own target keeps a single sample, and `targets` says naming it is all
or nothing and the frame's attachment is not among them. **The reading.** A stroke 2.857 pixels wide
drew as exactly 2, and a pipeline naming a blend was refused by name with `the pass on pipeline 0
writes 1 colours and attaches none`. **So this is a consumer learning the rule rather than a gap**: a
painter wanting either draws into a texture of its own and names it in `present`. It is recorded so
the next session reading that batch does not file it.

**How that consumer will declare this package, and why it matters here.** As a peer dependency
rather than a plain one, which is the recommendation in its own roadmap and is a decision it takes
when it first imports a name from here, now earlier than its painter. The reason belongs in this file because the alternative puts two copies of this package in
one page. That site depends on this one directly in nineteen files, none of which draws a figure, so
it keeps the dependency after the painter lands there and then holds it twice, once directly and once
through that package. Both ranges read `^0.3.0` today and a caret on a `0.x` tracks the last number
alone, so they are identical now and split the moment either side moves a minor.

**What two copies of this package cost, read from it rather than assumed.** Three pieces of
module-level state exist here: the `Set` in `deprecate.ts` that dedupes a warning, and the two
`WeakMap`s in `trace/trace.ts` that carry what is behind a handle and how long it lives. No module
holds a device or an adapter, since capability lives in the data, so two copies do not make two
devices and a page can hand one `GPUDevice` to both. What they do cost is this renderer twice in a
consumer's bundle, which `chunk-split` there counts from the outside, and a tracer blind to every
resource made through the other copy. **That second cost is the one to weigh here**, because being
able to describe, cost and refuse a frame is this package's distinguishing claim, and half a trace is
half that claim.

**Reaching 1.0.0 removes the problem rather than managing it.** Two caret ranges on a `1.x`
intersect across minors and a package manager dedupes them with no help, where two on a `0.x` split
at every feature release. That is a consequence worth knowing and it is not an argument to bump a
number: the version moves when the work does.

**What this changes about item 2: nothing.** It is argued there on the specification, which carries
`stencilFront` and `stencilBack` as separate members because the two differ, and a renderer claiming
the core specification either expresses per-face stencil state or does not claim it. That reason
stands whether or not anything above ever draws a filled path.

**What it changes about the candidates: nothing.** Every candidate is still blocked on the bound, and
a row above is not an argument for one.

**The baseline expires while this file waits.** The numbers at the top of it were measured on
2026-08-29, and a pair of them read 514 tests over 34 files until they were re-taken at 864 over 73,
so they had expired rather than moved. A stretch with no session here ends with the baseline re-taken
before an item can be measured against it, which is a session of its own and is worth expecting
rather than discovering.

---

## How an item is written here

**An item names its steps**, each one commit-sized, each naming the measurement it will quote.
**Each item carries a `Done when`** that someone who did not do the work can check.
**A step that is blocked is said to be blocked**, with what it waits on, rather than left in place
to stop everything behind it.

**Gates are run per the table in `CLAUDE.md`**, which is `npm test` and `npm run type-check` at
every step, `gate:pack` on anything touching the export surface, `gate:browser` once over a batch
and one gate at a time, and `gate:card` never in an unattended run.

**A number is quoted only if a gate produced it**, and what a gate could not see is named in the
commit.
