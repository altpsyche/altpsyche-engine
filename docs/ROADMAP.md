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

**[`FIGURE-LANGUAGE.md`](FIGURE-LANGUAGE.md) is the figure language, the change in flight above this package**, and this item
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
