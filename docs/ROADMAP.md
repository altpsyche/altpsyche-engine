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
gates are green: 4 of 4 browser gates, 16 of 16 on the recording contract, 24 of 24 corpus draws
with 9 WebGL 2 skips, 21 of 21 surface checks, and **866 node tests over 73 files**, all re-taken on
2026-09-10 with the batch of that day landed. The node count read 864 until item 3's step 3 added
two checks over the declared doors; before that it read 514 over 34 files, and the recording
contract read 15 of 15 until it was re-taken at 16 of 16. Those last two had expired rather than
moved, because the sixteenth capability fixture arrived and neither number followed it.

**The one line of this baseline no unattended session can re-take is the card**, and it was re-taken
on 2026-09-11 with Siva present. **22 of 22 PASS and 0 FAIL**, run twice with the same result, on
`nvidia / blackwell` — 16 presets drawn through WebGPU, a GLSL frame selecting WebGL 2 where WebGPU
was offered, and the gradient control at 0 of 1,440,000 channels. **Every preset's pixel count is
identical to the 2026-08-26 reading**, which is what says items 9, 12 and 10 moved no pixel on real
hardware. The row is in [DEVICES.md](DEVICES.md).

**That number is 22 and not the 17 of 17 this file carried from 2026-08-29**, and the gate grew
rather than the reading improving: the sixteenth capability fixture and the three cross-backend
scene comparisons are checks the older total did not include. The old figure is not a number that
fell, and nothing here should read it as one.

**`gate:card` still needs a desktop session and a real graphics card**, every headless launch
reaches the software renderer whatever the flags say, and the gate's own header says so. So an
unattended session still re-takes none of it, and the four browser gates above belong to a software
renderer whoever ran them.

---

## The campaign of 2026-09-11, and why ten new items arrive as one plan

**Twelve readings arrived on 2026-09-11, taken against `0.4.0`.** They come from
`@altpsyche/maths`, whose GPU painter is live at its 2.8.0 — its paint/gpu.ts and
figure/gpu-frame.ts build a `FrameGraph` and call `resolve` and `cost` on it, and its manifest
declares this package at `^0.4.0` in its `devDependencies` and in its `peerDependencies`. **Every reading was
re-verified against this tree
before this plan was written**, and three came back different from how they were handed over, which
is recorded at the items rather than quietly fixed.

**A consumer's painter is not the reason any of them is here.** That rule is at the top of
`CLAUDE.md` and this file already states it twice, and it binds hardest where a reading arrives from
a consumer with a picture waiting. What the painter is good for is that it is a real caller holding
this package to its own published contract, so the readings are reproducible rather than imagined.
Each item below is argued on this package's own merits or it is not an item, and the argument is
written at the item rather than inherited from the group.

**The spine, which is what makes this one campaign rather than ten findings.** `resolve` and `cost`
are pure readings a caller has in hand before anything is submitted, and this package's
distinguishing claim is that a frame can be described, costed and refused before a driver sees it.
Three of the twelve readings show a frame passing both and then either failing on the device or
drawing a different picture. That is not three defects that happen to rhyme: it is one claim with
three holes in it, and the holes are in three different files — the executor, the selector and the
capability list. Group A closes them and is sequenced first for that reason.

**What each group is, which reading is in it, and which item carries it.**

| group | what it is about | readings | items |
| --- | --- | --- | --- |
| A | a frame `resolve` and `cost` both pass must draw | 1, 2, 3 | 10, 11, 12 |
| B | what a frame is allowed to ask for | 4, 5, 6 | 2 (already open), 16 |
| C | the door and the lifetimes | 7, 8, 9, 10 | 9, 12, 13, 14, 15 |
| D | reading back what was drawn | 11 | 17 |
| E | not recompiling every frame | 12 | 18 |

**The order, and what waits on what.** Item 9 lands first because two readings cannot be worked
until it answers: it is the open question already in this file about whether the library chooses the
backend, promoted to an item because a reading now depends on the answer rather than merely
disagreeing with it. **Item 12 is blocked on item 9** and says both branches. **Item 4, already
available, is preferred before item 10**, because item 10 adds a rule to the file item 4 makes the
single home of such rules; it is a preference and not a block. Everything else in the campaign —
items 11, 13, 14, 15, 16, 17, 18 and the standing item 2 — is unblocked and may land in any order.

**Three readings came back different, and each item says which.** Reading 11 said no readback is at
the door; `FrameRenderer.frame` reads a frame back and is exported, so item 17 is about the live path
alone. **Reading 3 said WebGL 2 cannot apply a blend; it can** — `gl.blendFuncSeparate` and
`gl.blendEquationSeparate` are core WebGL 2 and the backend simply never calls them, so item 11 is an
implementation and a much narrower refusal rather than a refusal. Reading 5's second half said the
word `viewport` appears nowhere; it appears on the WebGL 2 draw path, which this file already
recorded on 2026-09-10 and which finding D still contradicts.

**Reading 6 files no item, and here is why.** It asked that the frame vocabulary work be designed
knowing depth is coming. Depth is in the frame description today — `RenderPassSpec.depth`,
`RenderPipelineSpec.depth`, and four depth-and-stencil rules in `graph/validate.ts` — so nothing has
to be built for it. Read off that package's own roadmap rather than reported: a fourth
decision taken there on 2026-09-11 says a figure declares which painters can draw it, so a figure
asking for depth is refused by the SVG painter rather than drawn wrongly by it, and that file's 3.0.0
depth row is "to plan" rather than blocked, depending on this package and naming nothing beyond item
2. **So the constraint reading 6 asks for is stated once, here, and binds items 2 and 16**: whatever
either adds to the pass or pipeline vocabulary composes with the depth state already there rather
than sitting beside it. A scissor is per-pass state like the viewport; a stencil mode is per-pipeline
state like the depth compare; both already have a home in the types, and nothing in this campaign
needs the vocabulary designed twice.

**What no session in this campaign can measure, said once here rather than hedged at each item.**
Every card number the twelve readings carry was read in another repository's session on a
`blackwell` adapter on 2026-09-09, and is quoted below as that reading's rather than as this
package's. `gate:card` needs a desktop session and a real graphics card, so an unattended session
working any item below re-takes none of them, and its commit says so.

**The baseline this campaign is measured against, re-taken on 2026-09-11 by this session's own
gates.** `npm test` at **866 over 73 files**, `npm run type-check` clean, and `gate:pack` green
reporting **69 names on the door** and 3 behind the maths door, 4 declared targets across 2 doors,
every declared door's types resolving under `nodenext`, and 11 of 11 consumer checks. So the numbers
at the top of this file have not expired. `gate:browser` was not run by this session, which wrote a
plan and touched no code; its 4 of 4, 16 of 16, 24 of 24 with 9 WebGL 2 skips and 21 of 21 are
carried from 2026-09-10.

---

## What a session needs that is not in an item

**Three things live here because a session would otherwise carry them in its head**, which is the
failure the deleted handover document used to cause. `/next` (`.claude/skills/next/SKILL.md`) is the
entry point that reads this file; these are the facts it cannot derive from an item.

**`gate:card` runs on this machine, cleared by Siva on 2026-09-11.** `CLAUDE.md`'s table says never
in an unattended run and that stands — the gate needs a display and a person. What changed is that a
session here may ask for it rather than treating every card number as unre-takeable. It is the only
gate that reads a real driver, and on 2026-09-11 it re-took the three cross-backend channel numbers
that item 8 had been told could only come from the record. **Any item whose `Done when` names the
card gate can now close**, item 2 among them.

**`docs/DEVICES.md` has one machine.** Every card number in this tree is `nvidia / blackwell` on one
Linux box. That is enough to say a frame draws and enough to compare the two backends against each
other; it is not enough to say a driver-specific fold is general. A second machine's row would be
worth more here than another fixture, and nobody has taken one.

**Push, tag and publish are asked for in the session, every time.** Siva said on 2026-09-11 that
push, tag and publish happen for every version, and that is the *process* rather than a standing
authority to publish unasked — `CLAUDE.md` calls the asking "not a formality" because a published
version cannot be withdrawn. Pushing a commit is the light half and was done that day; a tag reaching
the remote and a release are not a session's to take alone.

---

## How the campaign is cut, and why it is more than one version

**Decided on 2026-09-11.** Ten new items is not one release, and a third of them need no release at
all. What follows is the cut order and the reasoning, so a session finishing an item knows whether
anything is owed to the outside world and a session proposing a release knows what it is carrying.

**What a minor costs here, read off the manifests rather than assumed.** This package is at `0.4.0`.
A caret on a `0.x` tracks the last number alone — `^0.4.0` resolves `>=0.4.0 <0.5.0` — so **every
minor cut here is a breaking release for anything that carets it.** `@altpsyche/maths` at 2.8.0
declares this package at `^0.4.0` twice: in its `devDependencies`, and — the one that costs — in its
`peerDependencies`. **A peer range is a promise to the host page**, so a minor here forces that
package to publish a version of its own for no reason but to widen a range, and until it does, a page
installing both gets an unmet peer. That is the price each cut below is weighed against.

**It is not an argument to bump to 1.0.0.** Two carets on a `1.x` intersect across minors and a
package manager dedupes them with no help, which is why this file already records that reaching 1.0.0
removes the problem rather than managing it — and records in the same breath that this is a
consequence worth knowing and not a reason to move a number. **The version moves when the work does.**
This campaign is roughly the surface work a 1.0.0 would sit on top of, and that is an observation
rather than a plan.

**This package's own precedent is that additive is still a minor.** `0.4.0` was cut for one purely
additive door that removed nothing and moved no name, so a new export here does not get to be a patch.

### What each item owes the outside world

| items | what changes for a consumer | cut as |
| --- | --- | --- |
| 5, 6, 7, 8 | nothing. Documents and tests, and `files` ships only `dist`, `LICENSE` and `README.md` | **no release**; they ride along with whatever is next |
| 13, 15, 18 | behaviour a caller cannot have been relying on: a `TypeError` becoming a `null` or a written throw, two canvases no longer left on the page, a cache that stops missing | patch, and only if something needs one before the next minor |
| 4 | **not a free rider.** Its own `Done when` says a texture with a `source` and no `data` gets one answer where today the two backends give two, so one backend's refusal changes | rides with the next minor, named in its notes |
| 2 | `StencilMode` gains two members, which breaks an exhaustive switch | minor |
| 9, 10, 11, 12 | new refusals for frames that drew before, a new `Capability` member, and either a new door name or a changed `selectBackend` answer | minor |
| 14, 16, 17 | `dispose` means something different, `RenderPassSpec` gains a field both backends read, and a new readback name | minor |
| 1 | new exports and nothing removed | minor, and it slots into any of them |

### The cut order

**The numbers below are the shape and not a promise.** An item that closes as refused — items 13 and
18 each say in their own text that they may — takes its row out, and a cut carrying nothing breaking
is a patch whatever this table says.

1. **`0.5.0` — item 2, the counting stencil**, carrying whichever of items 4, 5, 6, 7 and 8 have
   landed by then.
2. **`0.6.0` — the spine**: items 9, 10, 11 and 12, carrying items 13, 15 and 18 if they landed.
3. **`0.7.0` — the lifetimes and the vocabulary**: items 14, 16 and 17.

**Why item 2 goes first, and the reason is not the consumer.** Item 2 is argued on the specification —
`GPUDepthStencilState` carries `stencilFront` and `stencilBack` separately because the two differ, and
a renderer claiming the core specification either expresses per-face stencil state or does not claim
it. That argument stands whether or not anything above ever draws a filled path, and this file says so
at the item. **What the consumer decides is not whether item 2 is built but when what is already built
is published**, which is a different question and the only one a dependant is allowed to answer here:
its GPU painter's filled paths and its 2.9.0 glyph outlines both wait on this and nothing else, and
item 2 depends on none of the spine. Queueing it behind group A would be a cut order chosen by
accident.

**The alternative, written down so it is not re-argued.** Land all ten, cut one `0.5.0`, and make that
consumer widen its peer range once instead of three times. **Refused, on the length of the stretch:**
the spine alone is four items with a decision at the head of it, and a batch that size is a long time
with nothing published and a dependant blocked on an item that was finished early in it. Three cuts
pay three range widenings and keep the lead time short, and this file already names that lead time —
"a gap found there costs an item, a commit and a release here" — as the thing the arrangement between
the two packages is built around.

**What would change this.** If item 2 turns out to need something from the spine — most plausibly
item 4's move, since a per-face stencil state is pipeline shape and item 4 is where shape rules are
going — then the first two cuts merge and the order becomes the spine and then everything else. If
that consumer widens its peer range to span `0.x` ahead of time, the cost of a cut drops to nothing
and the three could be more. **What may not change it is a dependant asking for a capability**, which
is the rule at the top of `CLAUDE.md` and is why the paragraph above separates when a thing is
published from whether it is built.

**Nothing here authorises a release.** `CLAUDE.md` is unchanged: a tag reaching the remote and a
publish are not a session's to do, the release runs in CI from the tag, and a published version cannot
be withdrawn. This section says what a cut would carry, not that one may be taken.

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
   is the sixteen fixtures still drawing under the new shape.
2. **Move the reader, its declaration type and the source readers out of `fixtures/` into the
   package, without exporting any of them**, with the corpus importing them from their new home.
   Quote: `npm test` at its count on the day (866 over 73 files as of 2026-09-10), `npm run
   type-check` clean, and the door's export count unchanged at 69 run-time names, which is what says
   a move was a move.
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
- The sixteen fixtures draw through the exported reader rather than through a copy of it, so the
  gates cover the published path and there is one path. `gate:browser` at 4 of 4 and the recording
  contract at 16 of 16.
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

1. **Landed on 2026-09-11**, reading below. `StencilMode` grows the counting pair, as `'count'` and
   `'nonzero'` beside `'mark'` and `'inside'`, with `count` incrementing on front faces and
   decrementing on back faces, both wrapping, and `nonzero` covering where the counter is not zero.
   **Measures:** the two backends agreeing on a fixture that a mask cannot draw, to the single
   channel the corpus already holds them to.
2. **Landed on 2026-09-11**, reading below. A fixture that separates them: a path wound so that a
   mask fills a hole a counter leaves empty. `core-count` is that path already — step 1 landed it —
   so what is left is drawing it a second time under `mark` and `inside` and recording the
   difference. **Measures:** the two pictures differing by a named number of pixels under `mark`,
   and by none under `count`.
3. **Closed on 2026-09-11 with no capability**, reading below. `refusal` answers for a device that
   cannot do per-face stencil, if any reachable one cannot. **Measures:** the capability read off
   both backends on the machines the gates run.
4. **Landed on 2026-09-11**, reading below. `core-stencil` gets a vertex stage for its filling pass,
   so the mask modes can be compared across the two backends at all. Found by step 1 and not part of
   it. That pipeline names no
   vertex stage, so it bakes no GLSL vertex and `gates/corpus.mjs` skips the whole preset on WebGL 2
   — which is half of why the two backends could disagree about the stencil reference unseen: there
   was no comparison to see it in. `core-count` was written with a vertex stage on both pipelines for
   that reason, and the same change to `core-stencil` puts it on `gates/card.mjs`'s cross-backend
   list beside it. `core-texture`, `core-target` and `core-mips` are skipped there for the same cause
   and are not this item's, but the count is worth knowing: four of the ten WebGL 2 skips are this
   one shape. **Measures:** the WebGL 2 skip count falling by one, and `core-stencil`'s two backends
   compared channel for channel.

### Done when

- `StencilMode` names the counting modes, both backends implement them, and `docs/API.md` says what
  each does to the mask in the card's own fields the way the current pair are described.
- A fixture draws a self-crossing filled path correctly under the counting mode and visibly wrongly
  under the mask, with the pixel difference between them recorded.
- The two backends agree on that fixture to the single channel the corpus holds every preset to.
- `npm test`, `npm run type-check` and `gate:browser` are green, and the card gate is re-taken.

**Verified on 2026-09-11, line by line, with the number that satisfies each.**

| line | what satisfies it |
| --- | --- |
| `StencilMode` names the counting modes, both backends implement them, `docs/API.md` describes each | `'mark' \| 'inside' \| 'count' \| 'nonzero'` in `graph/types.ts`; `STENCIL_STATES` read by `gpu/webgpu.ts`, `gpu/webgl2.ts` and `submit/execute.ts`; `docs/API.md` describes all four and where the reference comes from |
| a fixture draws the path correctly under the counting mode and visibly wrongly under the mask, the pixel difference recorded | `core-count counted against masked  hard jumps 2,102 counted against 2,700 masked, worst 186, 302,512 of 1,440,000 channels differ`, in `gate:browser` every run, and proved to go red at `0` differing when the counter is collapsed |
| the two backends agree on that fixture to the single channel the corpus holds every preset to | `core-count on both backends  hard jumps 2102 against 2102, worst 0, 0 of 1,440,000 channels differ` on nvidia / blackwell. A literal zero, better than the three scene presets at 11, 36 and 18 |
| `npm test`, `type-check` and `gate:browser` green, card gate re-taken | 902 tests passing against 894 before the item; type-check and `gate:pack` green; `4 of 4 browser gates`, `28 of 28 draws`, `18 of 18 agree`, `21 of 21 checks`; the card drew the whole corpus and its cross-backend list grew from four presets to six |

**What the four green gates could not see, carried out of the steps so it is not lost.**
`gate:browser` is a software renderer throughout. `gate:card` is one machine, one driver, one vendor.
No gate here reads geometry, so nothing says `core-count`'s hole is in the right *place* — only that
there is one, that it is the size a mask fills in, and that both backends agree about it. And the
counting modes' absence from `Capability` rests on two specifications offering no feature string to
enumerate, which is an absence rather than a reading.

**What would change the answer.** If WebGL 2 cannot reach `glStencilOpSeparate` through the path this
package builds pipelines on, the counting modes are a WebGPU capability and `refusal` names them,
which is the arrangement this package already uses everywhere the two backends differ. **It can, and
step 1 measured it**: `stencilOpSeparate`, `stencilFuncSeparate`, `INCR_WRAP` and `DECR_WRAP` are core
WebGL 2, the backend now spends all four, and the two backends agree on `core-count` to zero channels
of 1,440,000 on a real card. So the counting modes are not a capability and step 3 has nothing to
refuse unless a reachable device turns one up.

**Two things landed on this item on 2026-09-11 without changing what it is for.** **First, reading 6
of the campaign above puts a constraint on step 1**: depth is in the frame description already, so a
stencil mode is per-pipeline state beside the depth compare and composes with it rather than sitting
beside it — there is no second vocabulary to design and the campaign section says why. **Second, the
question below about whether the stencil table becomes data or stays two tables is step 1's to
answer**, which that section already says and which is repeated here because step 1 is where it
binds. Neither changes the argument, which is the specification's: `GPUDepthStencilState` carries
`stencilFront` and `stencilBack` separately because the two differ.

### Landed on 2026-09-11, step 1, with the reading and the blind spot it could not close

**`StencilMode` is `'mark' | 'inside' | 'count' | 'nonzero'`**, the counting pair moves the two faces
in opposite directions, and both backends read one table for what a mode means.

**The card gate on nvidia / blackwell, the only gate that reads a real driver:**

```
core-count on both backends  hard jumps 2102 against 2102, worst 0,
                             0 of 1,440,000 channels differ
```

A literal zero, channel for channel, which is better than the three scene presets at 11, 36 and 18 —
they differ because two hardware compilers fold a projection apart and `core-count` has no
projection, deliberately, for the reason `core-blend` has none. The card drew the whole corpus, 20 of
20 presets, and the four browser gates are green with 18 of 18 presets agreeing call for call in the
trace contract.

**What the reading was, before the work.** The reading in the question below said the *width* was
shared between two tables by assertion. The tree was worse than that: the reference was declared
three times with two values — `STENCIL_BITS = 0xff` in `gpu/webgpu.ts`, `STENCIL_REF = 0xff` in
`gpu/webgl2.ts` and `STENCIL_REFERENCE = 1` in `submit/execute.ts` — so **WebGPU wrote and compared
`1` where WebGL 2 wrote and compared `0xff`**. Each backend was self-consistent, so both drew the
same picture and there was nothing wrong to look at. What let it live is that no stencil preset was
on `gates/card.mjs`'s cross-backend list, and `core-stencil` cannot be: it is skipped on WebGL 2. It
is now one number in the one table, read by both backends and by the executor.

**The blind spot, measured rather than asserted.** A cross-backend comparison proves agreement and
not correctness: two backends collapsing the two faces the same way agree perfectly and are both
wrong. With `count`'s back face changed to increment — the collapse the mask modes are — the card
gate stays **green** and the channel difference stays at **0 of 1,440,000**, and only the preset's own
edge count moves, from 2102 to **2700**, as the hole fills in. What does catch it is `npm test`, by
name and in both backends: *counts by moving the two faces in opposite directions* and *counts with
the front face adding and the back face taking away* both go red. So the description is gated and the
**picture is not**, until step 2 draws the same path under `mark` and records the difference. That is
what step 2 is for and it is the reason it is a step rather than a nicety.

**What the gates could not see, beyond that.** `gate:browser` is a software renderer throughout.
`gate:card` is one machine, one driver, one vendor. And `core-count` is drawn at one moment of its own
clock, so a backend applying a counting mode to the first frame alone would pass every gate here —
which is why the hole breathes rather than sitting still, and why that is written at the constant.

**Found on the way and not part of this step**, now step 4: `core-stencil`'s filling pipeline names no
vertex stage, so it bakes no GLSL vertex and the whole preset is skipped on WebGL 2. `core-count` was
written with a vertex stage on both pipelines for exactly that reason — a preset skipped on one
backend compares nothing, which is the trap `core-blend` was written to avoid.

**Also moved:** `trace/trace.ts` recorded `stencilFront` alone and called it `stencil`, which was the
whole story while every mode gave both faces one object. It now records both faces and the read mask,
because a recorder reading one face cannot see a backend that collapsed them.

### Landed on 2026-09-11, step 2, which closes the blind spot step 1 could only name

**`gates/corpus.mjs` now draws `core-count` twice** — once under `count`/`nonzero` and once under
`mark`/`inside`, one backend, one page, two names swapped on the lowered description and nothing else
changed — and the two pictures must differ. The reading, on the software renderer that
`gate:browser` runs:

```
PASS core-count counted against masked  hard jumps 2,102 counted against 2,700 masked,
                                        worst 186, 302,512 of 1,440,000 channels differ
```

**302,512 channels of 1,440,000**, which is the hole: about a fifth of the frame drawn by a mask and
left alone by a counter. The worst single channel is 186 of 255, so it is a visible difference and
not a rounding one.

**It was proved to catch a skipped counter rather than asserted to.** With `count`'s back face
changed to increment — the collapse the mask modes are — the gate goes red and says why:

```
FAIL core-count counted against masked  the two are identical, so the counter is a mask
                                        hard jumps 2,700 counted against 2,700 masked,
                                        worst 0, 0 of 1,440,000 channels differ
```

and the run's total falls from `27 of 27 draws` to `26 of 27 ... with 1 failed`. **Identical is the
failure**, because identical is exactly what a collapsed counter gives.

**The two probes agree, which is the part worth keeping.** Step 1's card-gate probe put the collapsed
counter's edge count at **2,700** against the correct **2,102**. This gate puts the *mask's* edge
count at **2,700** as well. A collapsed counter and a mask are the same picture, measured twice by
different gates on different renderers, which is what makes the number a reading rather than a
coincidence.

**Why one backend is enough here, stated so the chain is checkable.** This says WebGPU's counter is
not a mask. The card gate's `core-count` row says WebGL 2 draws what WebGPU draws to 0 channels of
1,440,000 on a real card. Together those say WebGL 2's counter is not a mask either.

**What this still cannot see.** No gate here reads geometry, so nothing says the hole is in the
*right* place — only that there is one, that it is the size a mask fills in, and that both backends
agree about it. And `gate:browser` is a software renderer throughout: the separation was re-read on
the card with the counting picture, not with the masked one.

### Closed on 2026-09-11, step 3: there is no capability to name

**`refusal` names nothing new, and the reason is categorical rather than a survey.** The argument and
what would overturn it are written at the point of the decision, in `graph/capability.ts`'s own
header beside the names that do exist. In short: `GPUStencilFaceState` is a member of core
`GPUDepthStencilState` behind no WebGPU feature, `stencil8` is a core texture format — only
`depth32float-stencil8` is feature-gated — and `stencilOpSeparate`, `stencilFuncSeparate`,
`INCR_WRAP` and `DECR_WRAP` are core WebGL rather than extensions, so they sit on
`WebGL2RenderingContext` itself. A context either exists or it does not, and one that exists has
them. **A `Capability` naming per-face stencil would be a name nothing could ever be missing**, which
is the opposite of what that type is for.

Checked against a driver rather than left as an argument: `core-count` counts a winding number on
both backends and the card gate reads them at 0 differing channels of 1,440,000 on nvidia /
blackwell.

**What would change the answer** is a reachable device offering a WebGL 2 context whose separate
stencil calls are absent or wrong — a driver bug, which is what [`DEVICES.md`](DEVICES.md) collects,
rather than an optional feature, which is what `Capability` names. If one turns up, the name is
`per-face-stencil`, read off the data the way the blend pair is: a pipeline whose mode gives the two
faces different operations needs it, and `STENCIL_STATES` already says which modes those are.

**What this step could not measure.** No gate here enumerates a device's stencil support by name,
because neither API offers a name to enumerate — the absence of a feature string is the evidence, and
an absence is weaker than a reading. `gate:card` is one machine, one driver, one vendor, so "no
reachable device" is a claim about the specifications and about one card, not about a fleet.

### Landed on 2026-09-11, step 4: the mask modes are compared across the two backends at last

**`core-stencil`'s filling pipeline has a vertex stage**, so it bakes a GLSL vertex, is no longer
skipped on WebGL 2, and is on `gates/card.mjs`'s cross-backend list beside `core-count`.

```
core-stencil on both backends  hard jumps 2712 against 2712, worst 0,
                               0 of 1,440,000 channels differ
```

**The two mask modes agree channel for channel on a real card** — the first time they have been
compared at all, and the reading that would have caught step 1's defect had it existed: WebGPU wrote
and compared a reference of `1` where WebGL 2 used `0xff`, unseen for as long as this preset drew on
one backend only.

**The corpus gate's own counts moved with it**, which is the check that the skip is really gone:
`28 of 28 draws lit their buffer, with 0 failed and 9 WebGL 2 skips`, up from 27 of 27 with 10 skips.
And **WebGPU's reading did not move**: `core-stencil` lit 187,489 of 480,000 pixels before the change
and 187,489 after, on both backends now, so the sheet's grid laid flat draws the frame the backend's
own three corners drew.

**Three presets are still skipped for this cause** — `core-texture`, `core-target` and `core-mips` —
and they are not item 2's. Each is a fullscreen WGSL frame whose pipeline names no vertex stage, so
each draws on one backend and compares nothing. That is three of the nine WebGL 2 skips, and it is
**item 19** rather than something carried here.

---

## Item 3 — the maths behind a door of its own, for the consumer that has no bundler to shake it off

**Opened on 2026-09-10.** `vec3`, `mat4` and `mat3` are published names on the one door, and the only
way to reach them is that door. `index.ts` re-exports the renderer, the frame graph, the scene, the
host probe and the toy reflectors alongside them, so a consumer wanting the arithmetic downloads all
of it.

**The measurement that decides this item, and it is not the one it was filed on.** The package was
packed with `npm pack`, installed from its own tarball into an empty consumer, and bundled with
esbuild, so `sideEffects: false` and `exports` are read the way a bundler reads them. A second
entry was then added to the installed manifest and the same import measured again. Two consumer
shapes, two answers:

| a consumer wanting only `vec3`, `mat4` and `mat3` | through `.` | through `./maths` |
| --- | --- | --- |
| **with a bundler**, minified | 2,116 B raw, **997 B gzipped**, 2 files kept | 2,116 B raw, **995 B gzipped** |
| **without one**, counted by a load hook in plain node | **27 files, 218,459 bytes** | **1 file, 7,520 bytes** |

**So a bundler already answers this and the second door saves it two bytes.** `scene/maths.ts`
imports nothing and the manifest declares `sideEffects: false`, so tree-shaking reduces the one door
to the module alone — the eager closure never enters a bundle at all. **The item's original framing
was wrong about who pays.** It read as though every consumer downloads the renderer to get the
arithmetic, and only a consumer with no bundler does.

**That consumer is the whole of the argument, and this package has already spent work on it.**
`gate:pack` exists to prove the built package installs and plain node can import it. 0.2.0's
headline fix was that the package is importable without a bundler at all, and
`tsconfig.build.json` carries a paragraph on emitting node's own specifiers for exactly that reason:
"a published package only a bundler could load" is named there as the defect it was fixing. For a
page on an import map, a CDN, Deno, or plain node, `import { vec3 } from '@altpsyche/engine'` is 27
files and 218,459 bytes to reach 7,520, and that is measured above rather than reasoned about.

**The walk and the load differ by one file and it is worth saying why.** A static walk of the
sources from `index.ts` and `host/surface.ts`, the two eager roots `tests/import-graph.test.ts`
already uses, reaches 28 files at 220,709 bytes. Node loads 27 at 218,459. The difference is
`graph/capability.ts`, 2,250 bytes, which exports only a type, so its import is elided at compile
time and no runtime ever fetches it. The walk is the right measurement for a gate, since a type-only
edge is still an edge a careless change could make real; the load is the right measurement for a
claim about a download. Both confirm `gpu/webgpu.ts` is absent, which is the gate that already
stands.

**This item was also filed reading 27 files at 207,090 bytes, and that pair did not reproduce
either.** The gap was exactly 13,619 bytes, the built form of `pipeline/cache.ts`, eager through
`import { frameKey } from '../pipeline/cache.js'` at `gpu/renderer.ts:19`. No code changed between
the filing and the re-take, so the original walk had missed a module.

**Why it stands on this package's own merits.** The header of `index.ts` states the reason the
backends are not re-exported: "re-exporting a backend here would pull both into every consumer's
first download whatever card the browser has." This is that argument one level up, for the consumer
whose bundler is not there to undo it. The package describes itself as the renderer and the engine
above it, and the arithmetic is the top of that stack and the only part with no device in it — so it
is also the only part a consumer might reasonably want without the rest.

**What it changed, settled on 2026-09-10 before any other step ran.** The standing refusal read "no
export moves out from behind the one door in `index.ts`", and its reason is that the shape of what is
public is decided there rather than by which file a caller happened to find. **A declared entry keeps
that reason and an undeclared subpath breaks it**: `exports` refuses a subpath nobody listed, which
was confirmed by measurement: a deep import naming the built file under `dist` does not resolve from
the installed package today. So the refusal is now written as *every entry point is declared*, with two
conditions that carry the old rule's whole intent: every name behind a second door is still exported
by the first, and a second door is declared only where `tests/import-graph.test.ts` can hold its
closure to a module that imports nothing. **That bound is what makes this a decision rather than a
precedent** — the next door has to arrive with a measurement, not an argument.

**What the audit checked so the decision was not taken on faith.** Bundling one app that imports
`mat4` through both specifiers keeps one copy of the built `scene/maths.ts` and folds the comparison to
`mat4 === mat4`, so there is no dual-package hazard: both doors name the same built file, where the
hazard needs two. And nothing is duplicated in either direction, since `scene/maths.ts` stays the one
home and `index.ts` re-exports it. The costs that are real are a second published contract that
cannot be withdrawn without a breaking change, and subpath types needing a `moduleResolution` of
`node16`, `nodenext` or `bundler` — which narrows who may use the new door and not who may use the
old one, because a classic-resolution consumer cannot reach a subpath at all.

**Steps.**

- [x] **1. The refusal is settled in the words it will keep.** Settled on 2026-09-10 in the item's
  favour, and written into `CLAUDE.md`, `CONTRIBUTING.md`, `docs/ARCHITECTURE.md` and `index.ts`'s
  own header, which is the point of the decision. **The measurement**: the refusal read "No export
  moves out from behind the one door in `index.ts`" before and "No export moves out from behind a
  door this package declares" after, with the two conditions above; and `package.json` declares one
  entry, which step 2 takes to two.
- [x] **2. `./maths` is declared and nothing moves.** Landed on 2026-09-10. `package.json` gained
  the entry with its own types and default; `scene/maths.ts` kept every export it has and `index.ts`
  keeps re-exporting all of them, so no name left the first door and no consumer's import line
  changed. `gates/pack.sh` gained a reading over the new door, because a declared entry `exports`
  resolves but no gate exercises would be an entry with no gate over it, which is the one thing the
  refusal it was added under does not allow. **The measurement**: `gate:pack` green at 11 of 11 with
  69 names on the first door and the new one reporting "3 names, 1 file loaded, same objects as the
  first door"; node loads 1 file and 7,520 bytes through `./maths` against 27 files and 219,294
  bytes through `.`; the eager closure of `.` unchanged at 28 files by the walk. Those two byte
  figures are 835 higher than step 1 quoted, and the 835 is the doc comment step 1 added to
  `index.ts`, which `tsc` emits.
- [x] **3. The import graph gate walks the new door.** Landed on 2026-09-10. Every declared entry is
  now an eager root of the backend walk, and every entry past `.` has its closure held to the one
  module it points at. The doors are read out of `package.json` rather than listed in the test, so
  the next one declared is bound by this without a line being added — which is what makes step 1's
  bound a gate instead of a note. A second check holds every declared door to a file
  `tsconfig.build.json` actually emits, since an entry pointing at an unemitted file resolves on this
  disk and 404s for a consumer. **The measurement**: `tests/import-graph.test.ts` at 9 tests, up from
  7; the closure of `./maths` at 1 file; and the gate **red** with `import type { FrameGraph } from
  '../graph/types.js'` added to that module — "the door "./maths" reaches 5 files: scene/maths.ts,
  graph/types.ts, graph/capability.ts, graph/refs.ts, graph/handles.ts" — and green with it taken out
  again. Worth noting that a *type-only* import was enough to trip it, which is the strict reading and
  the right one: a type edge is one keystroke from a value edge.
- [x] **4. `docs/API.md` says which names are behind which door.** Landed on 2026-09-10. The
  opening names both paths and says plainly that the second adds nothing and that a reader with a
  bundler should keep using the first; the Maths section says it is the one group behind two doors
  and that the module behind the second imports nothing, held by step 3's gate. **The measurement**,
  printed from the compiler rather than counted by hand: the first door carries **69 run-time names
  and 84 types, 153 in all**, unchanged; `./maths` carries **3 run-time names and 3 types**, which
  are `vec3`, `mat3`, `mat4` and `Vec3`, `Mat3`, `Mat4`, all six of them also on the first door.
  Two entries in the manifest, two paths in the document. **And the second door's block is gated**:
  `tests/docs-code.test.ts` compiles it and resolves the subpath through the manifest's own
  self-reference, verified by putting a name that does not exist into it and watching the gate name
  it — "TS2305: Module '@altpsyche/engine/maths' has no exported member 'notARealName'". So the
  document's claim about what is behind the new door is checked by a gate rather than by prose.

**Done when.**

- `package.json` declares two entry points and `npm run gate:pack` is green.
- The closure of the second entry is one file, held by `tests/import-graph.test.ts` rather than by
  intention.
- Every name the one door exported before still comes out of it, which `tests/api-signatures.test.ts`
  checks by member.
- `npm test` and `npm run type-check` are green, and `gate:browser` is run once over the batch.
- `CLAUDE.md` reads the refusal in the form step 1 settled, and no document disagrees with it —
  which means `CONTRIBUTING.md`'s non-negotiable list and `index.ts`'s own header too, since both
  stated the old rule in their own words.

**What would change the answer.** The refusal was settled in this item's favour on 2026-09-10, so
what is left to change the answer is the bound rather than the door. If a later change makes
`scene/maths.ts` import anything, step 3's gate goes red and the choice is to sever that import or
withdraw the door — and withdrawing a published entry is a breaking change, which is the cost of
this decision and the reason the bound is a gate and not a note.

**Where this leaves the item, as of 2026-09-10.** All four steps have landed and every line of the
`Done when` above is met and checkable: two declared entries with `gate:pack` green at 11 of 11, the
second entry's closure held to one file by `tests/import-graph.test.ts` and shown red on a type-only
edge, 69 run-time names still on the first door by `tests/api-signatures.test.ts`, `npm test` at 866
over 73 with `type-check` clean, `gate:browser` run once over the batch at 4 of 4, and the refusal
reading the same in `CLAUDE.md`, `CONTRIBUTING.md`, `docs/ARCHITECTURE.md`, `docs/API.md`,
`README.md` and `index.ts`'s own header.

**It is released, and the item is closed.** `0.4.0` published on 2026-09-10 from `refs/tags/v0.4.0`
through `.github/workflows/publish.yml`, with the run's own gates green — `npm test`, `gate:browser`
and `gate:pack` all ran on the published commit before the publish step, which is the reading that
matters more than this session's. Read back off the registry rather than off the run: `latest` is
`0.4.0`, the published `exports` carries both entries, `npm audit signatures` reports a verified
attestation, and the provenance names repository, workflow, `refs/tags/v0.4.0` and commit
`e80f3e8` — the same shape `0.3.0` carries. Installed from the registry, the first door loads 27
files and 219,294 bytes and the maths door loads 1 file and 7,520.

**The first attempt failed and that is worth keeping.** The publish went red at `npm test` on the
runner and published nothing, because step 4's example block reached the maths door by its published
specifier, which resolved through the manifest into `dist/` and made `npm test` require a build. It
passed locally only because a `dist/` was lying about from packing a tarball. The tag was moved to
the fix and the publish re-run. **The lesson is the one `CONTRIBUTING.md` already states twice**: a
gate that runs where the build output lives cannot see a dependency on the build, and the runner was
the only reading that could.

**The entry stays standing rather than deleted**, because the four steps' reasoning is what a reader
will want when the next door is proposed, and the bound in step 3 is the thing that will be argued
against. `git log` is the record either way.

---

## Item 4 — the resource-shape refusals are written once in each backend, and two of them already differ

**Opened on 2026-09-10, out of an audit of this tree for the defect that prompted item 3.** That
defect was one rule written twice with nothing holding the copies equal. `graph/validate.ts` opens by
saying it is where such a rule belongs — "every rule about a graph that was once written out twice
— once by the build as it turned a source into a description, once by a backend as it drew the frame
that description became — held here in one pure function so the two can no longer drift apart." A
group of rules about the shape of a declared resource never made it in, and each backend states them
itself.

**The reading, as file and line pairs.** Six refusals appear in both backends, four of them in
identical words:

| refusal | WebGL 2 | WebGPU | the two predicates |
| --- | --- | --- | --- |
| a ladder over a texture a pass writes | `gpu/webgl2.ts:438` | `gpu/webgpu.ts:747` | `mips && use('attachment')` against `mips && (use('storage') \|\| use('attachment'))` |
| contents and several samples a pixel | `gpu/webgl2.ts:455` | `gpu/webgpu.ts:765` | **`data \|\| source` against `data`** |
| a bound texture keeping several samples | `gpu/webgl2.ts:458` | `gpu/webgpu.ts:771` | `use('sample')` against `use('sample') \|\| use('storage')` |
| a shown texture keeping several samples | `gpu/webgl2.ts:484` | `gpu/webgpu.ts:775` | one reads `frame.present`, the other an index |
| a shown resource the frame does not declare | `gpu/webgl2.ts:475` | `gpu/webgpu.ts:727` | same |
| contents and the frame's own size | `gpu/webgl2.ts:467` | `gpu/webgpu.ts:752` | **`(data \|\| source) && followsFrame` against `data && spansFrame`**, and the two messages are not the same sentence |

The doubled span is about 47 lines in `gpu/webgl2.ts` (424 to 470) against about 48 in
`gpu/webgpu.ts` (730 to 777).

**Two of those rows are a live divergence and not merely a repetition.** A `TextureResource` carries
`source`, the address its first contents come from, and `data`, the bytes that came back from it, and
`graph/types.ts` says the build writes the first and the runtime fills the second. So a description
in hand before its fetch has `source` and no `data`. WebGL 2 refuses such a texture by name where it
also keeps several samples a pixel or follows the frame's own size; WebGPU reads only `data` and
lets it through. Whichever reading is right, they cannot both be, and the words the two backends
print are the same sentence in four of the six rows — which is the state that makes a drift
unreadable rather than obvious.

**Why it stands on this package's own merits.** The distinguishing claim is that a frame can be
described, costed and refused before a driver sees it, and a refusal a caller gets on one backend and
not on the other is that claim holding for one card and not the other. It is also the third
invariant in `docs/ARCHITECTURE.md` — "one fact, one home" — and `graph/validate.ts` is the home the
codebase already named.

**What is not a finding here, checked and cleared.** The *capability* refusals are single-homed
already. `gpu/webgl2.ts:412` and `gpu/webgl2.ts:997` refuse a read-write storage buffer and a compute
pass, and `gpu/select.ts`'s own comment says the load-bearing refusal for both moved into
`refusal()` and left "the throw an unreachable backstop rather than the load-bearing refusal". A
documented backstop is not a second home. `spansFrame` in `gpu/webgpu.ts:731` is a local alias of
`graph/refs.ts`'s `followsFrame` rather than a second copy of it.

### Steps

1. **Landed on 2026-09-11**, reading below. Settle the two divergences before moving anything, by
   deciding whether a texture carrying a `source` and no `data` yet is refused for its samples and
   its size. Write the answer where the rule lands. **The measurement**: the refusal each backend
   gives that description today, read off a test rather than off the source, and one wording after.
2. **Landed on 2026-09-11**, reading below. Move the six into `graph/validate.ts` — five, plus the
   ladder-with-no-contents rule step 1 found single-homed in WebGL 2 and absent from WebGPU — with
   both backends losing their copies and the frame refused before either is built. A seventh turned
   out to be in `validate` already and its two backend copies were deleted rather than moved. **The measurement**: `npm test` and `npm run type-check` green,
   the count of `throw` sites in each backend before and after, and `gate:browser` at 4 of 4 with the
   recording contract at 16 of 16, which is what says the calls did not move.
3. **Landed on 2026-09-11**, reading below. A test per moved rule that fails for the rule and not for
   the wording, since a rule moved with its own tests is a rule nothing independent reads — which
   `CONTRIBUTING.md` names as the mistake that survives. **The measurement**: each of the six red on
   a graph that breaks it and green otherwise, and the two backends' remaining throws named as
   unreachable backstops.

### Done when

- None of the seven rules appears in either backend, and `graph/validate.ts` states each once. It
  read "six" until step 1 found the seventh: a ladder over a texture with no contents, refused by
  WebGL 2 and by nothing on WebGPU.
- A texture with a `source` and no `data` gets one answer, and the same answer on both backends.
- `npm test`, `npm run type-check` and `gate:browser` are green, with the recording contract at
  **18 of 18** — it read 16 of 16 when this item was written and two presets have arrived since,
  `core-blend` at item 11 and `core-count` at item 2 — and the commit says the card gate was not
  re-taken.

### Landed on 2026-09-11, step 1: a description is refused for what it says, not for how far its fetch has got

**The divergence, measured off a test rather than read off the source, which is what the step asked
for.** A texture carrying `source` and no `data` — the description a build hands over before its
fetch comes back — was **refused by WebGL 2 and drawn by WebGPU**, at both rows the table marks. Two
new tests against the WebGPU backend went red on the tree as it stood, by name:

- *is refused where its contents are only an address yet* (`tests/renderer-webgpu.test.ts`, the
  frame's own size)
- *giving it contents that are only an address yet* (`tests/renderer-multisample.test.ts`, several
  samples a pixel)

and the two matching tests against WebGL 2 were green the moment they were written, because that
backend had always read both fields.

**The answer is `data || source`, and the reason is the package's own claim.** The contradiction in
both rules — contents that arrive once against a texture remade on every resize, and contents against
a texture nothing may write into from outside — is in the words of the description and not in the
bytes. Reading `data` alone made the answer depend on *when* it was asked: the same description
refused after its fetch and drawn before it. A frame that can be refused before a driver sees it
cannot have a refusal that waits for a fetch. The reasoning is written at `gpu/webgpu.ts`'s size
refusal, which is the site that changed, with a pointer at the WebGL 2 site; both move into
`graph/validate.ts` at step 2 and the reasoning moves with them.

**The wording is one sentence now**, and it is WebGL 2's fuller one: *contents and the frame's own
size, which is thrown away on a resize*. WebGPU's stopped at *the frame's own size* and said nothing
about why.

**The measurement after.** `npm test` 906 passing, up from 902 before this step and 894 before
item 2; `npm run type-check` green. No gate that draws was run and none was needed: this step moves a
predicate and a message, and `gate:browser` at 4 of 4 belongs to step 2, which is where calls could
move. **The card gate was not re-taken.**

**The reading has moved and two things came with it.**

- **The line numbers are all wrong now.** The six refusals are `gpu/webgl2.ts:555-594` against the
  table's 424-470, and `gpu/webgpu.ts:700-757` against its 730-777. The predicates are as the table
  says.
- **There is a seventh rule and the table does not list it.** `gpu/webgl2.ts:565` refuses
  `mips && !data && !source` — *a ladder and no contents to build it from* — and **WebGPU has no
  such refusal at all**, so a WebGPU frame asking for a ladder over a texture with nothing in it is
  built rather than refused. That is the same class of defect as the two settled here and it is not
  step 1's, so step 2 moves seven rules rather than six, and its own text now says so.

**What would change the answer** for the pair settled here is a `source` that could resolve to
nothing, which would make it a request rather than a declaration. Today a resource carrying one
declares that its contents exist.

### Landed on 2026-09-11, step 2: six rules have one home, and a seventh already had it

**`graph/validate.ts` states each once**, in a `shapes(graph)` pass at the end of `validate`, and both
backends lost their copies. A rule there fires before either builds anything: the WebGL 2 path calls
`validate` directly and the WebGPU path reaches the same function through `submit/plan.ts:56`.

**The throw-site count, which is the measurement the step named:**

| backend | before | after |
| --- | --- | --- |
| `gpu/webgpu.ts` | 22 | **16** |
| `gpu/webgl2.ts` | 43 | **36** |

Six gone from WebGPU and seven from WebGL 2 — the difference being the shown-resource duplicate,
which that backend held and WebGPU held in different words.

**`gate:browser` at 4 of 4, with the recording contract at 18 of 18 and the corpus at 28 of 28
draws**, which is what says the calls did not move: every preset's call stream is the one it had, the
double against the device, after seven refusals left each backend. `npm test` 906 passing,
`type-check` green. **The card gate was not re-taken**, and the item's `Done when` says it need not
be.

**It moved six and not seven, and finding out why is the finding.** *A shown resource the frame does
not declare* is in the item's table as appearing in both backends, "same". It does — and it was also
already in `validate`, in the handle safety net at the top: `wantsResource(graph.present, 'texture',
'presents')` has been refusing it as *presents resource N, which it does not declare*, covering both
the undeclared index and the declared-but-not-a-texture case. **So that rule had three homes in three
wordings**, and the right one was already there. The two backend copies are deleted rather than
moved, and one test that asserted a backend's wording now asserts the surviving one.

**Where two predicates differed, the broader one moved, because each was a narrowing of one rule.** A
ladder is refused over a texture a pass writes: WebGPU counted a storage texture among those and
WebGL 2 counted only an attachment. A storage texture is written every frame, so a ladder over one is
as stale as a ladder over an attachment — and WebGL 2's narrower form was unreachable there rather
than deliberate, since that backend refuses a storage texture outright for want of compute. The
multisample-bound rule is the same pair for the same reason.

**Two refusals stayed in WebGL 2 deliberately**, which is the item's own escape clause used. A
**multisampled depth** says "this backend keeps one" and means it: WebGPU draws one, so that is a
capability answer belonging to the backend that lacks the power. A texture in a depth format being a
renderbuffer rather than a colour texture is the same shape of thing. Neither is a rule two backends
could disagree about.

**What this could not check.** No gate reads whether a refusal is *reachable* from both backends —
`gate:browser` draws frames that pass, so a rule that now fires on neither path would look exactly
like a rule that fires on both. Step 3's independent tests are what close that, and they are the
reason step 3 exists.

### Landed on 2026-09-11, step 3: each of the six is red for its own rule, proved one rule at a time

**`tests/graph-resource-shapes.test.ts`, seventeen tests, importing no backend and no device.** Each
holds a graph sound but for the one field it bends, and each is paired with the same graph minus the
fault, which must pass — a test that only ever sees a throw cannot tell a rule from a function that
throws at everything.

**Measured by disabling one rule at a time** rather than asserted. With each rule's condition
replaced by `false` in `graph/validate.ts`, one rule per run:

| rule disabled | independent tests red | red in all | the per-backend files that also fell |
| --- | --- | --- | --- |
| a ladder over a texture a pass writes | 2 | 5 | `renderer-mips`, `renderer-multisample`, `renderer-webgl2` |
| a ladder with no contents | 1 | 2 | `renderer-webgl2` |
| contents and several samples | 2 | 5 | `renderer-multisample`, `renderer-webgl2` |
| several samples bound to a shader | 2 | 4 | `renderer-multisample`, `renderer-webgl2` |
| several samples shown | 1 | 4 | `renderer-multisample`, `renderer-webgl2` |
| contents and the frame's own size | 2 | 6 | `renderer-webgl2`, `renderer-webgpu` |

**Never fewer than one**, so no rule in `validate` is now enforced only by a test that came with it,
and the right-hand column says each rule is still reached through a backend as well as directly.
`npm test` 923 passing, up from 906; `type-check` green. **The card gate was not re-taken** and no
gate that draws was run: this step adds a test file and changes no library code.

**The step asked for something that turned out not to exist.** Its measurement named "the two
backends' remaining throws named as unreachable backstops", expecting the copies to stay as guards
the way `gpu/select.ts` describes for the read-write storage buffer. Step 2 deleted all seven
instead, so there are none to name — and what guards a caller who skips `validate` is that there is
no way to skip it: the WebGL 2 path calls it and the WebGPU path reaches it through `submit/plan.ts`.

**A mutation probe is only as good as its mutation**, which is worth recording because the first one
here was wrong. Falsifying a guard by turning `if (a || b)` into `if (false && a || b)` leaves
`(false && a) || b`, so the rule still fired and the probe read zero red across all six — a green
that looked like insensitive tests and was a broken probe. Replacing the whole condition with
`false` is what the numbers above come from.

**What would change the answer.** If one of the six turns out to be genuinely backend-specific — a
rule about what a renderbuffer can do rather than about what a description says — it stays in that
backend with its own reason written above it, and the item closes having moved five.

---

## Item 5 — the stale-path allowlist can only grow, and all five of its rows are now dead

**Opened on 2026-09-10, out of the same audit.** `tests/docs-paths.test.ts` walks every path the
documents name and fails on one that does not resolve. It carries `ALLOWED_ABSENT`, five paths that
do not resolve on purpose, and it already guards one half of that list: "Each entry is asserted still
absent, so an allowlist row that a real file grows under is flagged for removal rather than left
hiding a fresh stale path behind it."

**The other half is unguarded, and every row has now fallen through it.** A row is asserted absent
and never asserted *cited*, so a row survives after the sentence that named it is deleted. Of the
five rows at `tests/docs-paths.test.ts:56-60`, **no scanned document cites any of them**, checked by
grepping every markdown file the gate reads:

- `main.js` — the row says it is "a file the reader creates in `docs/EXAMPLES.md`'s walkthrough".
  That walkthrough now writes `main.ts`, at `docs/EXAMPLES.md:14`, `:58` and `:63`.
- `docs/TESTING.md` — the row says it is "cited by ROADMAP item 1's phone row". This file's item 1 is
  the frame declaration reader and has no phone row; the words "phone" and "mobile" do not appear in
  it.
- `host/loop.ts` — the row credits "RoadToPureEngine §7 and ROADMAP item 39". Neither reference
  resolves: the first document was deleted at 0.3.0, and the item number belongs to the queue that
  was deleted with it rather than to this file, whose items run 1 to 18.
- `components/ui/WgslRefusal.tsx` and `public/shaders/build/manifest.json` — both rows say they are
  website paths "RoadToPureEngine §3 row 12 names", and that document was deleted at 0.3.0.

**Why it stands on this package's own merits.** A gate that cannot fail for the thing it exists to
check is the defect `CONTRIBUTING.md` names as worse than no gate, and this is that defect's quiet
half: the list is the gate's only escape hatch, it grows by one whenever a document is edited, and
nothing shrinks it. Five dead rows is five paths that could go stale for real without the gate ever
saying so.

### Steps

1. **Assert every allowlist row is still cited by a document the gate reads**, beside the assertion
   that it is still absent, so a row outlives its sentence by one commit rather than indefinitely.
   **The measurement**: the new assertion red on all five rows as they stand, and the count of rows
   after.

   **One wrinkle, and it is this entry's own doing.** The five paths are named above in backticks, so
   this file now cites all five and a naive citation check would go green on the strength of the
   finding that filed it. The assertion has to exclude this file — a queue recording that a path is
   dead is not a document teaching a reader where it lives, which is the same reason
   `tests/docs-paths.test.ts:46` already excludes the deleted register — or the rows have to be named
   here without backticks. Whichever, the step's first act is to make the check red.
2. **Delete the five rows and whatever of them the assertion still wants**, with `main.js` either
   removed or corrected to `main.ts` on the reading that `docs/EXAMPLES.md` no longer names it.
   **The measurement**: `npm test` at its new count with `tests/docs-paths.test.ts` green, and the
   allowlist's length before and after.

### Done when

- `tests/docs-paths.test.ts` fails for an allowlist row nothing cites, shown by adding one and
  watching it go red.
- `ALLOWED_ABSENT` holds only rows a scanned document still names.
- `npm test` and `npm run type-check` are green.

---

## Item 6 — one projection, written four times as literals, held by nothing

**Opened on 2026-09-10, out of the same audit, and it is the closest thing in this tree to the defect
that prompted item 3.** That defect was two perspective projections in two packages writing clip
depth into different ranges with nothing catching it. Inside this tree the projection is written in
three forms, and they agree today:

- `scene/maths.ts:174`, `mat4.perspective`, whose header says the depth output "runs zero at the near
  plane to one at the far plane".
- `fixtures/capability-fixtures.ts:385`, `:505`, `:585` and `:649`, four identical sixteen-number
  literals: `[1.7320508, 0, 0, 0, 0, 1.7320508, 0, 0, 0, 0, -1.1111111, -1, 0, 0, -0.5555556, 0]`.
- `examples/instanced-cubes/main.ts:96-107`, the same projection written inline in WGSL as
  `far / (near - far) * view.z + far * near / (near - far)` over `-view.z`.

**The reading.** Evaluating `mat4.perspective(Math.PI / 3, 1, 0.5, 5)` and rounding each entry to
seven decimals prints those sixteen numbers character for character. So the four fixture literals
are that call's output, copied. Nothing asserts it: no test names both, and the fixtures import
`mat4` already for their rotations.

**Why the literal is not simply wrong.** `CONTRIBUTING.md` says a test suite rewritten alongside the
code it checks cannot catch a mistake in that code, and a fixture that calls
`mat4.perspective` moves whenever `mat4.perspective` moves, which is the weaker check. The defect is
not the literal. **The defect is that the agreement is unasserted in either direction**: if
`mat4.perspective` were changed to write depth from minus one to one, the module's own tests would be
rewritten with it, these four fixtures would keep the zero-to-one numbers, and the two would disagree
silently — which is precisely what happened across the two packages.

**Why it stands on this package's own merits.** Every capability here has a fixture some gate draws,
and the fourth invariant in `docs/ARCHITECTURE.md` is that no capability's only proof is that the
picture still looks right. Four presets are aimed by a matrix that no gate ties to the arithmetic
this package publishes.

### Steps

1. **One test asserting the fixture literal equals `mat4.pack(mat4.perspective(Math.PI / 3, 1, 0.5,
   5))`**, keeping the literal so the check stays independent and naming the projection's arguments
   where it is stated. **The measurement**: the test red when either side is changed alone, green on
   the tree as it stands, and `npm test` at its new count.
2. **The same for the inline WGSL in `examples/instanced-cubes`**, or the reason it is exempt written
   above it — its `fov`, `near` and `far` are its own and only the convention is shared. **The
   measurement**: whichever lands, the depth convention stated once in that file with a pointer to
   `scene/maths.ts` rather than restated.

### Done when

- A test names both the fixture literal and `mat4.perspective` and fails when either moves alone.
- The four literals are one constant or four with one assertion over them, rather than four
  unrelated arrays.
- `npm test` and `npm run type-check` are green, and `gate:browser` is green at 4 of 4 with the
  recording contract at 16 of 16, which is what says the four presets still draw the same picture.

**What the audit found about depth, and it is the good news.** Every place in this tree that states
or assumes a clip depth range agrees with `scene/maths.ts`. The four fixture literals carry
`-1.1111111` and `-0.5555556`, which is zero-to-one. `examples/instanced-cubes` writes the
zero-to-one form and its comment says so. `docs/API.md:377` and `README.md:136` both say zero to one.
`gates/translate.mjs:198` remaps out of it deliberately — "WebGPU's depth range is [0, 1] and GL's is
[-1, 1]" — and the baked artifact carries that remap 12 times with no `gl_Position.yz` negation left
in it, while the two hand-authored vertex stages under `fixtures/source/glsl/handwritten/` carry the
z-only line and `tests/translate-build.test.ts:98` holds them to the artifact. **Nothing in this tree
assumes a range this package does not write.**

---

## Item 7 — three documents state something this tree does not do

**Opened on 2026-09-10, out of the same audit.** `tests/api-signatures.test.ts` holds `docs/API.md`
to the door by member and `tests/docs-code.test.ts` compiles every fenced block, so what a document
*calls* is gated. Neither reads prose. These three are prose, each checked against the tree and each
wrong in a way a reader would act on.

**One: `CONTRIBUTING.md` says this repository has no queue.** Under "How work is tracked" it reads
"**In the issue tracker and in commit messages.** There is no queue in this repository," and it links
no roadmap. `CLAUDE.md` says the opposite — "A queue exists again and it is `docs/ROADMAP.md`",
restarted on 2026-08-27 — and this file's own opening says why it came back. `CONTRIBUTING.md` was
last touched on 2026-08-27, the same day, so the sentence was true when written and the edit that
restarted the queue did not reach it. A contributor who reads the file `CLAUDE.md` points at for
"the rules that are not negotiable" is told this file does not exist.

**Two: `docs/ARCHITECTURE.md`'s layer table understates what three layers import.** Its "may import"
column is prose and `tests/import-graph.test.ts` does not enforce it — that test enforces `graph/`
importing nothing, a producer reaching no backend, the DOM rule and the loop rule, and none of them
is this table. Three rows disagree with the tree:

- `scene/` is given `graph/`, and `scene/scene-view.ts:34` imports `Arena` and `Handle` from
  `resource/arena.ts`.
- `host/` is given `gpu/`, and `host/surface.ts:12` imports `BackendName`, `FrameGraph` and
  `UniformValue` from `graph/types.ts`.
- `toy/` is given `graph/`, and `toy/frame.ts:17` imports `uniformBindingOf` from
  `wgsl-binding.ts` while `toy/reflect.ts:31` imports `wgslUniformFields` from
  `wgsl-layout.ts` — a value import in the first case.

**The table also has no row for the four root-level modules at all**, which are `wgsl-layout.ts`,
`wgsl-binding.ts`, `wgsl-references.ts` and `shader-geometry.ts`, plus `deprecate.ts`. They ship,
`toy/` imports two of them, and a reader looking up which layer they belong to finds nothing.

**Three: `docs/FIGURE-FORMAT.md` says one item here is waited on and there are two.** It reads "One
item is queued here" and "**The counting stencil is the one thing the figure work waits on here.**
Nothing else in that repository's plan reaches this one." This file's own ladder, re-read on
2026-09-10, says otherwise: the row that closes the duplication between the two packages "needs from
here is item 3". That document was last touched on 2026-09-08 and the ladder moved twice after it.

### Steps

1. **`CONTRIBUTING.md`'s "How work is tracked" says what is true**, which is that `docs/ROADMAP.md`
   is the queue and `git log` is the record of what landed. **The measurement**: the section before
   and after, and `tests/docs-paths.test.ts` green over the new link.
2. **`docs/ARCHITECTURE.md`'s table names every edge the tree has**, with a row for the root-level
   modules. **The measurement**: the table's "may import" column read off a walk rather than written,
   and every row of it true on the tree the day it lands.
3. **`docs/FIGURE-FORMAT.md` names both items or defers to this file for the count.** **The
   measurement**: the two documents naming the same set of items, read side by side.

### Done when

- No sentence in `CONTRIBUTING.md`, `docs/ARCHITECTURE.md` or `docs/FIGURE-FORMAT.md` states
  something a reader can check against the tree and find false.
- `npm test` and `npm run type-check` are green.

**What would make step 2 stick rather than rot again.** The table is prose about import edges and a
walk already exists in `tests/import-graph.test.ts`. Holding the table to that walk is a separate
piece of work and is filed below as a candidate rather than folded in here, because it is a gate and
not a correction.

---

## Item 8 — a number in `gates/translate.mjs` belongs to the change that was rejected

**Opened on 2026-09-10, out of the same audit, and it is the one finding that is a wrong measurement
rather than a stale one.** `gates/translate.mjs:192-215` explains why naga's Y negation is stripped
and licenses the decision on a reading: "**Measured on an RTX 5080 before and after.** With the
negation: `core-scene` differed from its WebGPU frame on 344,146 of 1,440,000 channels, worst channel
244 [...]. Without it: **0 of 1,440,000 channels differ**, on all three scene presets. That
convergence is what licenses this."

**The commit that landed the strip records different numbers.** `git show 3324f56` — "item 107: the
scene tier agrees on a card" — carries:

```
  before   core-scene      worst 244, 344,146 of 1,440,000 channels differ
  after    core-scene      worst 1,      11 of 1,440,000 channels differ
  after    core-draw-list  worst 1,      36 of 1,440,000 channels differ
  after    core-material   worst 1,      18 of 1,440,000 channels differ
```

and it says where the zero came from: "Removing the readback flip instead was tried and rejected,
though it converged to a literal 0 of 1,440,000." **So the 0 of 1,440,000 belongs to the alternative
that was rejected, and the comment attributes it to the change that landed** — over all three scene
presets, where the commit records 11, 36 and 18 on those three. `CHANGELOG.md:79-80` has it right:
"the difference across the two backends fell from 344,146 channels to 11."

**Why it stands on this package's own merits.** "Never quote a number a gate did not produce" is the
first rule about numbers in both `CLAUDE.md` and `CONTRIBUTING.md`, and this is its exact failure:
a real reading, from the right machine, attached to the wrong change, and then used as the licence
for a decision. A session reading that comment believes the two backends converge to zero on a card
and would read the 11 a re-take gives it as a regression.

### Steps

1. **The comment quotes the commit's own after-numbers**, 11, 36 and 18 of 1,440,000 at worst
   channel 1, and says separately that the rejected alternative is what converged to zero and why it
   was rejected anyway. **The measurement**: the comment before and after against
   `git show 3324f56`, which is the reading it should have carried.

### Done when

- `gates/translate.mjs`'s licence paragraph names the numbers the landed change earned.
- No other file attributes the literal zero to the strip. `docs/DEVICES.md`'s 2026-08-26 row is
  clear already: its `0 of 1,440,000` is on the *gradient*, not on a scene preset.
- `npm test` and `npm run type-check` are green.

**What this cannot do without a card.** It is a correction from the record and not a re-measurement.
`gate:card` needs a desktop session and a real graphics card, so nothing in an unattended run can
re-take 11, 36 or 18 — the commit and `docs/DEVICES.md` are the only sources, and the step says so
rather than implying a fresh reading.

### Landed on 2026-09-11, with the re-measurement the entry above said it could not have

**The sentence above was true when written and stopped being true the same day.** `gate:card` was
re-taken with Siva present, and it reproduced the three numbers exactly: `core-scene` 11,
`core-draw-list` 36, `core-material` 18 of 1,440,000, all at worst channel 1, over two runs. So the
correction rests on a fresh measurement as well as on `git show 3324f56`, and the comment says so
and points at [DEVICES.md](DEVICES.md) for the reading.

**`gates/translate.mjs`'s licence paragraph now quotes the three numbers the landed change earned**,
and says separately that removing the *readback flip* is the alternative that converged to a literal
0 of 1,440,000, and that it was rejected anyway — handing rows back top-first is correct for every
source language, `tests/renderer-webgl2.test.ts` pins it against a bottom-up driver frame, and
removing it would have fixed translated shaders by breaking hand-authored GLSL.

**Two things were added beyond the step's text, both because the re-take made them worth saying.**
That worst channel 1 is two hardware compilers folding the same arithmetic apart rather than a
residual mirror, so a reader does not go looking for one. And that a session seeing 11, 36 and 18 on
a re-take has found nothing wrong — which is the exact harm the wrong number did, since it would
have had an honest re-take read as a regression.

**No other file attributed the zero to the strip**, checked by grepping every `.md`, `.mjs` and
`.ts` in the tree for `0 of 1,440,000`. The other occurrences are this entry's own text,
`docs/DEVICES.md`'s two *gradient* readings, and the new baseline line at the top of this file,
which is also the gradient. `CHANGELOG.md:117` was already right: "the difference across the two
backends fell from 344,146 channels to 11."

**Measurements.** `npm test` at 880 over 75 files and `npm run type-check` clean, both unchanged —
this edits one comment in a gate script and no test reads it. **The number that matters is the card's
and it is above**, taken twice on `nvidia / blackwell` on 2026-09-11.

---

## Item 9 — does the library choose the backend, or does the caller? Three files state two answers and a reading now depends on which

**Opened on 2026-09-11, out of reading 7 of the campaign above, and it is the open question already
in this file promoted to an item.** It was a question while nothing waited on it. Item 12 now does,
so the question has to close before that item can be written, which is what makes it an item rather
than a section.

**The reading, re-verified on 2026-09-11.** `gpu/select.ts` opens by saying which backend draws a
frame is "answered inside the library rather than by the caller naming one".
`gpu/renderer.ts:114` opens the other way — "One backend, named by the caller rather than worked out
here" — and `createFrameRenderer` carries that out: its only branch, at
`gpu/renderer.ts:134`, tests `options.backend === 'webgpu'`, so a caller passing neither `backend`
nor `device` falls to the
`else` arm and gets `createWebGL2Backend`. **Nothing on the door runs a selection for a caller and
nothing builds the record a selection is read against.** `resolve` takes a `DeviceProfile`, and the
only two `DeviceProfile` values in this tree are hand-built — `tests/capability-wiring.test.ts:38`
and `examples/compute-field/main.ts:177`. `probe()` returns `ProbeFacts`, which carries a
`DeviceReport` per backend and not a `ReadonlySet<Capability>`, so it is not that record either. The
four steps a caller must take are its own: gather the offering, call `selectBackend`, call
`requestWebGPUDevice`, pass both back in.

**The two published documents still disagree**, which this file recorded on 2026-09-10 and which
nothing has changed. `docs/GUIDE-backends.md:3-4` says "You never name a backend."
`README.md:110-112` says "**A renderer uses WebGL 2 unless you give it a WebGPU device.**" The README
describes what the code does.

**Why it stands on this package's own merits.** A stated intent the code does not carry out is this
package's own inconsistency, and here it is stated in four places with two answers, one of them in
the module header that exists to record the decision. `CLAUDE.md` says a decision goes into the code
at the point of the decision; this decision is at the point of the decision twice, in opposite
directions. **It is also not a missing convenience**: the pure selection exists, is exported, and is
tested. What is absent is the join, and whether the join should exist at all is the question.

### Steps

1. **Answer it, in `gpu/select.ts` and `gpu/renderer.ts` at the point of each decision**, with what
   was decided, how to reverse it, and what would change it. **The measurement**: the two headers
   before and after, and the answering sentence quoted in the commit — a decision step, whose
   measurement is the reading and not a number.
2. **`docs/GUIDE-backends.md` and `README.md` say the same thing as each other and as the code.**
   **The measurement**: `npm test` at its count (866 over 73 files on 2026-09-11), `npm run
   type-check` clean, `tests/docs-paths.test.ts` green, and the two passages read side by side.
3. **Write into item 12 which branch it is building**, since that item's shape is this item's
   output. **The measurement**: item 12's text edited to the branch taken, and the other branch
   struck rather than left standing.

**All three landed on 2026-09-11**, in the commit this paragraph is part of. `npm test` at 866 over
73 files and `npm run type-check` clean; `gate:browser` was not run, and the reason is that this
change adds no export, alters no call and draws no picture — it is four doc comments and two
document passages, and the gates that read documents are inside `npm test`. `gate:pack` was not run
for the same reason: the export surface did not move, which the unchanged count of 69 names in the
previous commit's reading is the baseline for.

### Done when

- `gpu/select.ts` and `gpu/renderer.ts` state one answer, each with its reversal and its trigger at
  the point of the decision.
- No sentence in `docs/GUIDE-backends.md`, `README.md`, `gpu/select.ts` or `gpu/renderer.ts`
  contradicts another on who names a backend, read side by side by someone who did not do the work.
- Item 12 names the branch it is building and carries only that one.
- `npm test` and `npm run type-check` are green.

**What would change the answer.** If the answer is that the caller chooses, then `gpu/select.ts`'s
header is the wrong one, item 12 shrinks to one refusal and two corrections, and this file gains a
line saying the library offers a selection a caller may run rather than running one. If the answer
is that the library chooses, item 12 is a door addition and `gpu/renderer.ts`'s header is the wrong
one. **Correcting the guide alone would settle it by default**, which is why this is an item and not
a line in item 7.

### Answered on 2026-09-11, and the item landed with the answer

**The library answers the questions and the caller owns the things.** Which backend draws a frame is
a reading over data, so it is this package's to answer, the same way `cost`, `refusal` and `validate`
are. A `GPUDevice` is a resource with a lifetime, so it is the caller's to own, the same way the
canvas, the frame and the loop already are. The decision is written in `gpu/select.ts`'s header with
its reversal and its trigger, and `gpu/renderer.ts`'s is scoped to say what it actually governs.

**Neither header was wrong, which is why both were written.** They describe two layers and each was
phrased as though it were the whole door. `createFrameRenderer` is the primitive: it builds a
backend, and building one needs the answer already in hand, so naming it there is correct *there*.
`gpu/select.ts` describes the package's posture, which is that readings are the library's. Scoping
the two is the whole of the correction, and it means the missing door is **added over** the primitive
rather than replacing it — which is what keeps a caller that already knows which backend it wants
able to build that one without a round trip.

**What decided it was the default, not the ergonomics.** A caller passing neither `backend` nor
`device` falls to `gpu/renderer.ts:134`'s `else` arm and gets WebGL 2 on every machine, including one
whose adapter would have come back. **That is the worse backend chosen by silence rather than by a
reading**, and no one would choose it as a default; it is what falls out of a primitive being the
only door.

**The device is the half that nearly went the other way, and the tree decided it.**
`requestWebGPUDevice`'s own header refuses to cache — "an adapter is spent by the device it makes, so
this asks for a fresh one every time rather than holding one" — so a door that requested a device
internally would hand a page with six shader canvases six devices, and the alternative is a
module-level device, which this file already records as a property this package does not have: "No
module holds a device or an adapter, since capability lives in the data." **So the door takes a
`GPUDevice` as an optional parameter and requests one only where it is not given.** One canvas is one
call; six canvases ask once and pass the same device to each.

**Two placement constraints fall out of it and belong to item 12.** The door reaches `navigator`, so
it belongs in `host/` and not in `gpu/` — `graph/` imports nothing and `gpu/select.ts` stays pure. And
it must reach a backend through `createFrameRenderer` rather than importing one, so the dynamic-import
split survives and the standing obligation holds: a consumer drawing one fullscreen shader still does
not download the WebGPU backend.

**What the gathering half already is.** `readingOf` at `host/probe.ts:145-151` builds a `DeviceOffer`
from gathered facts and calls `selectBackend` on it, for the device report. So the join exists inside
this package and hands back a backend *name*, having dropped the `GPUDevice` it made getting there.
**Item 12 is assembly rather than new judgement**, which is the reading that makes it a small item.

---

## Item 10 — a draw naming a vertex count binds no geometry, and `resolve` and `cost` both pass it

**Opened on 2026-09-11, out of reading 1 of the campaign above. This is finding B of the spike batch,
re-measured and promoted.**

**The reading, re-verified on 2026-09-11 against this tree.** `graph/types.ts:476-479` gives three
draw forms and `drawsCorners` at `:671` is `'vertices' in draw`. `issueDraws` at
`submit/execute.ts:351` has three arms in its draw loop, and **the middle one is the only arm that
never reaches
`setVertexBuffer`**: `else if (drawsCorners(draw)) into.draw(draw.vertices, draw.instances)` at
`:375`, taken whatever `spec.geometry` names, where the indirect arm above it and the instances arm
below it both bind it. **`graph/validate.ts` has no rule over the pair**, read in full across its 234
lines: it checks that `spec.geometry` names a `vertices` resource that the frame declares, and never
that a draw in a pass on that pipeline is a form that binds it.

**What the card said, and it is another repository's reading rather than this one's.** On
2026-09-09, on a `blackwell` adapter: `Vertex buffer slot 0 required by [RenderPipeline (unlabeled)]
was not set`, then an invalid render bundle and an invalid command buffer every frame. `resolve`
answered `{ backend: 'webgpu' }` for that frame and `cost` costed it at 1 pass and 1 draw. The form
that draws is `{ instances: 1 }`, which is what that consumer's figure/gpu-frame.ts now
writes, at its line 300 — with a comment beside it saying the backend refuses the other form, and
**it does not; the
card does**, which is the whole of this item.

**Why it stands on this package's own merits.** The distinguishing claim is that a frame can be
described, costed and refused before a driver sees it, and both pure readings pass this one. This
package's comments say a description is refused by name rather than left to fail on the card —
`graph/validate.ts`'s own header says a frame that would "draw the wrong picture or one the card
would refuse at a call with a message naming a size rather than the name the description gave it" is
"stopped here first, before anything is built". **A pipeline naming `geometry` drawn by a form that
binds none is decidable from the graph alone, with no device**, which is exactly the class that file
exists for.

### Steps

1. **`validate` refuses a `{ vertices }` draw in a pass whose pipeline names `geometry`**, in words
   naming the pass's pipeline index and both halves, the way the per-draw rules beneath it already
   do. It belongs in `graph/validate.ts` because it reads the graph and nothing else, and the reason
   goes above the rule. **The measurement**: the new refusal red on a graph pairing the two and green
   on every fixture in the corpus, `npm test` at its new count against 866 over 73 files, and the
   corpus still at 24 of 24 draws with 9 WebGL 2 skips, which is what says no fixture was pairing
   them.
2. **Settle the reverse and write the answer where the rule is**: a pipeline naming no `geometry`
   drawn with `{ instances }` alone falls through `submit/execute.ts:376`'s `else if (geometry)` and
   **draws nothing at all, silently** — no call is made and no error is raised on either backend.
   **The measurement**: that arm's behaviour read off a test before anything changes, the decision
   (refuse it, or draw the backend's own corners) written at the rule, and the test green after.
3. **`docs/API.md`'s `DrawSpec` entry and `docs/GUIDE-frame-graph.md` say which form draws which
   pipeline**, since the type alone reads as three interchangeable shapes. **The measurement**:
   `tests/api-signatures.test.ts` and `tests/docs-code.test.ts` green, and `gate:browser` at 4 of 4
   with the recording contract at 16 of 16.

### Done when

- A `FrameGraph` pairing a `{ vertices }` draw with a geometry-naming pipeline is refused by name
  before any backend is built, shown by a test that names neither backend.
- The reverse pairing has one written answer and a test holding it to that answer, rather than
  drawing nothing in silence.
- `docs/API.md` and `docs/GUIDE-frame-graph.md` say which form binds geometry.
- `npm test` and `npm run type-check` are green; `gate:browser` at 4 of 4 with the recording contract
  at 16 of 16 and the corpus at 24 of 24.
- The commit says the card gate was not re-taken, and that the card message above belongs to another
  repository's session on another machine.

**What would change the answer.** If the intended reading is that `{ vertices }` on a geometry
pipeline should *bind* the geometry rather than be refused — the middle arm of `issueDraws` growing a
`setVertexBuffer` like the two either side of it — then this is a backend fix rather than a refusal,
the measurement moves to a corpus fixture drawing that pair, and `validate` gains nothing. **That
branch has to be settled in step 1 and not discovered in step 3**, because the two answers put the
change in different files.

### Landed on 2026-09-11, and neither rule turned out to be new

**The item was written as though it were adding a refusal, and it was moving two.** That is the
finding, and it makes this item item 4's shape rather than its own.

- **A corners draw on a geometry pipeline was refused by `gpu/webgl2.ts` alone**, at what was then
  `:1026`, in that backend's words — "mixes its own corners into the geometry N, which it draws from
  one buffer". WebGPU refused it not at all, built the frame, and let the card refuse it after the
  fact with a message naming neither the draw nor the pipeline, while `resolve` and `cost` passed it
  on both. **One backend already knew, and the other drew the wrong thing.**
- **An instances-alone draw on a geometry-less pipeline was refused twice**, by `submit/plan.ts` for
  WebGPU and by `gpu/webgl2.ts` for WebGL 2, in **two different sentences for one rule** — exactly
  the state item 4 opens by describing.

**Both are in `graph/validate.ts` now, stated once each.** The second kept `submit/plan.ts`'s
wording rather than gaining a third sentence, so the test that held it still holds it. The first
took a new wording that names the pipeline and the resource, in the house style of the rules beside
it, because the wording it replaced named a backend.

**What did not move, and the reason it did not.** `gpu/webgl2.ts` also refuses an *indirect* draw on
a geometry-less pipeline, and that half stayed. `drawIndirect` reads its vertex count out of the
buffer, so it is a description WebGPU draws correctly and WebGL 2 has no call for — a capability
that backend lacks rather than a shape the graph got wrong. **This is the branch item 4's own "What
would change the answer" names**, arriving here first: a rule that is genuinely backend-specific
stays in its backend. A test asserts the graph rule does not take it over.

**Step 2's reverse pairing was answered by finding it already answered.** The item said an
instances-alone draw on a geometry-less pipeline "draws nothing at all, silently". That is what
`submit/execute.ts` does with one, and it is not what a caller saw, because the rule was already
refusing it in both backends. The step landed as a move rather than a decision.

**One thing was found rather than planned, and it is the best argument the item has.**
`tests/renderer-pipeline-cache.test.ts` built its own fixture with `geometry: vertices(1)` on the
pipeline and `draws: [{ vertices: 3 }]` on the pass — **the exact invalid pairing, inside the suite
meant to catch it.** Two checks about pipeline-cache sharing had been running over a frame no card
could have drawn. The new rule turned them red and the fixture now draws `{ instances: 1 }`. A rule
that catches a mistake in this repository's own tests on the day it lands is a rule worth having.

**Measurements.** `npm test` at **880 over 75 files**, against 874 over 74 — six checks in
`tests/graph-draw-forms.test.ts`, which imports no backend and no device. `npm run type-check` clean.
`gate:pack` green, with the door unchanged at **70 run-time names** and 13 of 13 consumer checks,
which is what says this moved a rule and added no surface. **`gate:browser` at 4 of 4**, with the
corpus at **24 of 24 draws, 0 failed and 9 WebGL 2 skips**, the recording contract at **16 of 16**
and the surface gate at **21 of 21** — the numbers that say no fixture was relying on either pairing.

**The three refusal checks were shown red before they were trusted**, by disabling both rules in
`graph/validate.ts` and re-running: the three that refuse went red and the three that assert a form
is *taken* stayed green, so they fail for the rule rather than for the wording.

**The card gate was not re-taken** and cannot be in an unattended run, so the card message quoted in
the reading above is still another repository's, from another machine, on 2026-09-09.

---

## Item 11 — the WebGL 2 backend applies no blend a pipeline names, and it is able to

**Opened on 2026-09-11, out of reading 3 of the campaign above. The reading as handed over said
WebGL 2 cannot blend, and that is wrong**, which changes this item from a refusal into an
implementation. `gl.blendFuncSeparate`, `gl.blendEquationSeparate` and `gl.blendColor` are core
WebGL 2, and the backend never calls any of them.

**The reading, re-verified on 2026-09-11.** The string `blend` appears **zero times** in
`gpu/webgl2.ts`'s 1,497 lines, and zero times in `tests/support/fake-gl.ts`, so no test could catch
it either. `gpu/webgpu.ts:1576` carries a target's blend through to the pipeline descriptor as
`...(target.blend ? { blend: target.blend } : {})`. `graph/types.ts:419` declares the field —
`targets?: { format: GPUTextureFormat; blend?: GPUBlendState }[]` — and `glslFrameOf` at
`toy/frame.ts:361` spreads `...spec`, so `targets` and the blend on it survive translation intact
and reach a backend that ignores them.

**Nothing in the data names the difference.** `graph/capability.ts:41-52` lists eleven capabilities
and none is a blend. `float-blend` is not it: `gpu/select.ts:171` maps it to WebGPU's
`float32-blendable` and `:209` to WebGL 2's `EXT_float_blend`, and both are about blending a float
target rather than about whether blending happens. So `refusal` returns `null`, `resolve` answers a
backend, and the frame draws a different picture. The consumer's reading, on a card on 2026-09-09 and
not re-takeable here: an interior pixel of a stroke at opacity 0.5 read `0,0,255,128` on the card
against `127,127,255,255` on the page.

**Why it stands on this package's own merits.** §10's rule is that capability lives in the data,
never as a method one backend answers by throwing — and a silence is worse than a throw, because a
throw is at least a word. This is the one place a pipeline this package *accepts* draws a different
picture on the two backends with no refusal and no name for the difference, which is the failure mode
the package exists to prevent. It is also the fourth invariant in `docs/ARCHITECTURE.md`: no
capability's only proof is that the picture still looks right, and a blend has no proof at all here.
**And the specification argument is item 2's, which this file already accepted**: a renderer built to
the whole WebGPU core specification either expresses `GPUBlendState` on both backends it claims or
does not claim them.

### Steps

1. **Map `GPUBlendState` onto WebGL 2 and name the corner that does not reach**, written where the
   mapping lands. Most of it is a direct translation — the operations onto `blendEquationSeparate`,
   the factors onto `blendFuncSeparate`, `constant` and `one-minus-constant` onto `blendColor`. **The
   family that has no WebGL 2 form is the dual-source one** — `src1`, `one-minus-src1`, `src1-alpha`,
   `one-minus-src1-alpha` — which WebGPU itself gates behind the `dual-source-blending` feature. So
   that family is a capability in `graph/capability.ts` which `refusal` names, exactly as
   `storage-buffer-readwrite` is, and everything else is implemented. **One more corner is known now
   rather than
   found in step 2, because it changes where the refusal goes**: WebGL 2 has one blend state for all
   draw buffers, where WebGPU carries one per entry of `targets`. So a pass whose targets name
   *different* blends is the second thing this backend cannot express, and it is refused by name
   rather than drawn with whichever one was set last. **The measurement**: the count of
   `GPUBlendFactor` values mapped against the count refused, the capability added to
   `graph/capability.ts` with `WEBGPU_OPTIONAL` gaining its feature name, and the differing-targets
   refusal red on a graph that names two blends.
2. **The WebGL 2 backend applies the blend a pipeline's `targets` name**, enabled per target and
   reset with the pass, with `tests/support/fake-gl.ts` recording the calls so a test can read them.
   **The measurement**: the blend calls the double records for a pipeline naming `over`, and
   `npm test` at its new count.
3. **A fixture the two backends agree on that a missing blend would separate.** **The
   measurement**: the two pictures differing by a named number of channels before the change and
   agreeing to the single channel the corpus already holds every preset to after, `gate:browser` at
   4 of 4, and the recording contract at its new count.
4. **`refusal` answers for the dual-source family, and `docs/API.md` says what `targets[].blend`
   does on each backend.** **The measurement**: `gate:pack` and the door's export count against 69
   run-time names, since a new `Capability` member widens a published union.

### Done when

- A pipeline naming `targets[].blend` draws the same picture on both backends, to the single channel
  the corpus holds every preset to, shown by a fixture some gate draws.
- A pipeline naming a dual-source factor is refused by `refusal` by the capability's name, on any
  device without it, before either backend is built.
- `graph/capability.ts` names the dual-source capability and `gpu/select.ts` maps it on both sides.
- `docs/API.md` says what a blend does on each backend and which factors do not reach WebGL 2.
- `npm test`, `npm run type-check` and `gate:pack` are green; `gate:browser` at 4 of 4 with the
  recording contract at its new count.
- The commit says the card gate was not re-taken, and that the `0,0,255,128` reading belongs to
  another repository's session.

### Landed on 2026-09-11, and it found a corpus preset drawing the wrong picture

**The WebGL 2 backend applies the blend a pipeline's `targets` name.** The mapping is direct —
`blendEquationSeparate` for the operations, `blendFuncSeparate` for the factors, `blendColor` for a
constant — with WebGPU's own component defaults (`add`, `one`, `zero`) written out rather than left
to GL's, which are not the same numbers. A frame whose pipelines name no blend touches no blend
state at all, so every fixture that drew before this has the call stream it had, and a test asserts
that.

**Two capabilities name what does not reach**, both read off the pipeline rather than declared, the
way the write arm of `storage-buffer` is: `dual-source-blend` for the `src1` factors, optional on
WebGPU and absent from WebGL 2; and `per-target-blend` for a pass whose targets draw under different
blends, core on WebGPU and absent from WebGL 2.

**The finding, and it is worth more than the feature.** `core-depth`'s second pass writes two
colours and blends only the first — `{ resource: 'picture', blend: 'over' }` beside
`{ resource: 'distance' }`. WebGL 2 has one blend state for every draw buffer at once, so there is
no call stream that blends one and not the other. **That preset has been drawing the wrong picture
on WebGL 2 for as long as it has been in the corpus**, and it drew rather than being refused because
this backend applied no blend at all. **Nothing caught it**, and the reason is exactly the gap the
gates have: the cross-backend comparison covers the three scene presets, so `core-depth`'s two
pictures were never compared to each other. It is refused by name now, on both the capability path
and the backend's own backstop, and the corpus skips it in the WebGL 2 column with the reason
printed.

**The reading that found it was nearly missed.** A first pass at `impliedCapabilities` filtered the
targets naming no blend out before comparing, which would have called `core-depth` drawable. A
target written straight in is a *different* blend state, not the absence of one. A test holds that
reading specifically, because it is the one an obvious simplification would undo.

**Measurements.** `npm test` at **892 over 76 files**, against 880 over 75 — ten checks in
`tests/blend-capability.test.ts` and two in `tests/renderer-webgl2.test.ts`. `npm run type-check`
clean. `gate:pack` green with the door at **70 run-time names**, unchanged: two `Capability` members
widen a published union without adding a name. **`gate:browser` at 4 of 4**, with the corpus now at
**23 of 23 draws, 0 failed and 10 WebGL 2 skips**, against 24 of 24 with 9 — the moved preset is
`core-depth` and that difference is the finding, not a regression. Recording contract 16 of 16,
surface 21 of 21.

**`gate:card` re-taken after the change: 22 of 22 PASS, 0 FAIL.** `core-depth` still lights 245,496
pixels through WebGPU and the three cross-backend readings are unchanged at 11, 36 and 18 of
1,440,000, which is what says this moved nothing on the backend that was already right.

**Step 3 landed the same day and the item is closed.** `core-blend` is the seventeenth capability
fixture: two sheets offset sideways so they overlap down the middle, the second drawn at half alpha
over the first, **one colour target and no depth** so nothing but the blend is being read. It is on
`gates/card.mjs`'s cross-backend list beside the three scene presets, which is the only comparison
this package takes between the two backends and the list `core-depth` was never on.

**The reading, on `nvidia / blackwell`:**

```
core-blend on both backends   hard jumps 4006 against 4006, worst 0, 0 of 1,440,000 channels differ
```

**A literal zero, channel for channel** — better than the three scene presets, which sit at 11, 36
and 18 because two hardware compilers fold a projection apart. This preset has no projection, which
is deliberate: item 6 is about four copied projection literals and a fifth would have made it worse.

**And it was proved to catch the defect rather than asserted to.** With the blend application
disabled — the state this backend was in before item 11 — the card gate goes red:

```
FAIL core-blend on both backends   hard jumps 4006 against 3947, worst 124, 326,612 of 1,440,000 channels differ
```

So the fixture fails for the thing it exists to check. **Had it existed earlier, `core-depth`'s
unblended WebGL 2 column would not have survived a single run.**

**Three hardcoded fixture counts were found on the way, all the same defect.**
`gates/translate.mjs` refused to run with "expected 16 corpus WGSL presets, found 17", and
`tests/translate-build.test.ts` asserted `files.length` was 16. Both now compare the sources on disk
against the ones `CAPABILITY_FIXTURES` names, which is a **stronger** check than the literal was —
it says which source is missing or unclaimed rather than only that a number moved — and it cannot
expire. The third, `tests/consumer-check.ts`'s `11 of 11`, was fixed under item 12. A fourth
literal in `tests/translate-build.test.ts` counts entry points and **stays a literal on purpose**:
it is a hand-kept ledger recording each change, and a total recomputed the way it is checked would
assert nothing.

**Measurements for step 3.** `npm test` at **894 over 76 files**, against 892. `npm run type-check`
clean, `gate:pack` green at 70 names and 13 of 13. **`gate:browser` at 4 of 4** with the corpus at
**25 of 25 draws, 0 failed, 10 WebGL 2 skips** and the recording contract at **17 of 17**, which is
`core-blend` agreeing call for call between the double and the device. **`gate:card` at 24 of 24
PASS, 0 FAIL.**

**What would change the answer.** If step 2 finds that a blend cannot be reset per pass without
re-reading state the backend does not keep — this backend records its plans once and replays them,
and a blend left enabled leaks into the next pass — then the blend is set and cleared around every
pass whatever it costs, and the cost is measured and recorded rather than traded away silently. **If
instead the mapping turns out to need more of `GPUBlendState` than WebGL 2 has**, beyond the two
corners step 1 already names, the extra becomes capability and the item lands having implemented
less; what it may not do is land having implemented a blend that is silently approximate, which is
the state it is fixing.
## Item 12 — a selected backend refuses the frame object it was selected for, and nothing on the door joins the two

**Opened on 2026-09-11, out of readings 2 and 7 of the campaign above. Unblocked on 2026-09-11**,
when item 9 answered that the library chooses. **This is therefore a door addition**, and the
caller-chooses branch that stood here has been struck rather than left standing. The door goes in
`host/`, takes an optional `GPUDevice` and requests one only where it is not given, and reaches a
backend through `createFrameRenderer` — the three constraints item 9's answer carries, with the
reasons recorded there.

**The reading, re-verified on 2026-09-11.** `gpu/select.ts:60-61` lists the candidates —
`glsl: ['webgl2']`, `wgsl: ['webgpu', 'webgl2']` — and `:126` returns a backend where
`NATIVE[backend] === frame.authored || frame.translated`. So on a machine whose adapter did not come
back, **a WGSL frame carrying `translated: true` selects `webgl2`**, and `gpu/webgl2.ts:340` then
throws ``WebGL 2 was handed a wgsl frame to draw``. The step between the two is `glslFrameOf` at
`toy/frame.ts:338`, which returns a frame whose `authored` is `'glsl'` — and which **returns `null`**
for a fullscreen WGSL frame that baked no vertex, a compute stage, or a stage the build refused to
translate. **Nothing in `selectBackend`'s answer, in `resolve`'s answer, or in
`docs/GUIDE-backends.md` says that step exists or that it may come back empty.** The consumer's
reading, on 2026-09-09: a WGSL frame handed to `createSurface` on a machine whose adapter *did* come
back was refused with that same sentence while `selectBackend` on the same page answered
`{ backend: 'webgpu' }` — which is the join half of the same defect and is reading 7.

**Why it stands on this package's own merits.** `selectBackend` answers a question about a frame and
its answer is true of a frame the caller does not have. That is not a missing convenience: it is an
answer whose subject is a different object from the one it was asked about, and the caller cannot
tell from the answer. And `resolve` is this package's headline pure reading — `gpu/select.ts` calls
it "selection and refusal as one reading" — so a `resolve` a caller cannot act on without a step
nobody named is the claim holding halfway.

### Steps

1. **One door function gathers the offering, selects, requests the device where the selection wants
   one, translates where the selected backend needs it, and returns the renderer or a refusal naming
   why.** It is built over `selectBackend`, `requestWebGPUDevice`, `glslFrameOf` and
   `createFrameRenderer` and replaces none of them, because each is a pure or single-purpose name
   this package already publishes and a caller doing the four steps by hand stays able to.
   **The measurement**: the door's export count before and after against 69 run-time names,
   `gate:pack` green, and a consumer outside this repository reaching a drawing renderer from a
   canvas and a frame in one call, shown by `gate:pack` rather than by an import from inside the
   tree.
2. **A WGSL frame on a WebGL 2 machine draws through that function or is refused by name for the
   reason `glslFrameOf` returned null**, rather than throwing from inside a backend. **The
   measurement**: the refusal's own words for each of `glslFrameOf`'s three null cases, read off a
   test, and `gpu/webgl2.ts:340`'s throw named as an unreachable backstop the way
   `gpu/select.ts` already names the read-write-storage-buffer one.
3. **`docs/GUIDE-backends.md` shows the one call and `docs/API.md` names it.** **The measurement**:
   `tests/api-signatures.test.ts` and `tests/docs-code.test.ts` green, `gate:pack`, and
   `gate:browser` at 4 of 4.

### Done when

- A caller that has a canvas, a frame and a browser reaches either a drawing renderer or a refusal
  naming the reason, without reading this package's source to learn that a translation step exists.
- No `FrameGraph` that `selectBackend` or `resolve` answers a backend for reaches that backend and
  throws; where one cannot be drawn, the refusal names why before a backend is built.
- `docs/GUIDE-backends.md` and `docs/API.md` agree with the code and with each other, and
  `docs/GUIDE-backends.md`'s note that it describes a four-step tree pending this item is gone,
  replaced by the call.
- `npm test`, `npm run type-check` and `gate:pack` are green; `gate:browser` at 4 of 4.

**What would change the answer.** If the join cannot be written without this package deciding for the
caller what to do when `glslFrameOf` returns null — draw nothing, or fall back to a frame the caller
did not describe — then **the join returns the refusal and never the fallback**, because a fallback
this package chose is a picture the caller did not describe, which is the thing every refusal in this
tree exists to prevent.

### Landed on 2026-09-11

**`openRenderer(canvas, frame, options?)` is on the door**, in `host/open.ts`, answering
`{ renderer, frame }` or `{ refusal }`. It never came to the fallback question above: a frame with no
translation is refused by name, and the refusal says which of `glslFrameOf`'s three causes it was.

**The returned `frame` is the part that was not in the item's own text and had to be.** A WGSL frame
drawn on WebGL 2 is drawn as its GLSL translation, so a caller keeping its own copy and submitting
that would hand a WGSL frame to a WebGL 2 renderer — which is the throw the item exists to stop,
re-arriving one line later. So the frame the renderer draws comes back beside it, and where no
translation was needed it is the same object.

**`RendererOptions.backend` became a narrowing rather than an override**, which is better than the
item asked for: the named backend is the only one offered to the selection, so a frame it cannot draw
is refused by name here instead of throwing inside it. The escape hatch item 9 promised to keep is
kept, and it got safer on the way through.

**Measurements.** `npm test` at **874 over 74 files**, against 866 over 73 — eight checks in
`tests/open-renderer.test.ts`. `npm run type-check` clean. `gate:pack` green with the door at **70
run-time names** against 69, which is the one name this item adds, and **13 of 13** consumer checks
against 11 — two of them the item's own measurement, a consumer outside this repository reaching a
drawing renderer from a canvas and a frame in one call.

**The four translation checks were shown red before they were trusted**, by removing the translation
step from `host/open.ts` and re-running: four red and the other four green, so they fail for the rule
and not for the wording.

**`gpu/webgl2.ts:340`'s throw is named as an unreachable backstop**, in the words `gpu/select.ts`
already uses for the read-write storage buffer.

**One thing was found rather than planned, and it is fixed in the same commit because this item broke
it.** `tests/consumer-check.ts` printed `all ${11 - failures.length} of 11 checks passed` with `11`
written in twice. Adding two checks made it print "all 11 of 11" while running thirteen — a gate
reporting a number that was not the number it took. It counts itself now rather than being bumped to
13, because bumping moves the expiry rather than removing it. **This is the shape this file already
warned about**: "A count of fixtures is the shape most likely to expire here, because it is written
in prose in this file and in a comment in `gates/corpus.mjs`."

**What no gate here could see.** `gate:browser` was not run: the four browser gates draw the corpus
through the backends, and this item adds a door over them without changing what either draws — the
fixtures reach `createFrameRenderer` as they did. `gate:card` was not run and cannot be unattended.
**And the WebGL 2 offering is read through a double**: `offersWebGL2` asks a throwaway canvas for a
context, and in the node suite that canvas answers through `tests/support/fake-gl.ts`. Whether a real
browser answers the same is what `gate:browser` and a card would say, and neither was asked.

**What this leaves for someone else.** `createSurface` has the same default this item fixed for
`createFrameRenderer` — a caller naming neither backend nor device gets WebGL 2 — and it is out of
this item's scope, whose `Done when` names a renderer. It is worth a line here rather than a
rediscovery: **a surface that chooses is the same join over a different constructor**, and it is not
filed as an item until someone argues it on this package's merits.

---

## Item 13 — `createFrameRenderer` can throw where its own signature promises a null

**Opened on 2026-09-11, out of reading 8 of the campaign above. It is the smallest item of the
twelve and may reasonably close as refused**, which is said here so that a session working it does
not inflate it to justify the commit.

**The reading, re-verified on 2026-09-11.** `createFrameRenderer` returns
`Promise<FrameRenderer | null>`. `gpu/webgl2.ts:233` is
`canvas.getContext('webgl2', { antialias: false, alpha: false }) as WebGL2RenderingContext | null`
followed by `if (!gl) return null`, and `gpu/webgpu.ts:164` is the same shape. **Each guards the
value and neither guards the method**, so a canvas with no `getContext` throws a `TypeError` out of
an async function whose whole reason to return `null` is that a context may not come back.

**What is honest about how narrow this is.** The declared parameter is
`HTMLCanvasElement | OffscreenCanvas`, so a TypeScript caller cannot reach it through the types. The
reading is about the published *run-time* contract, which is what a JavaScript consumer has — and
this package spends a gate on exactly that consumer: `gate:pack` exists to prove the built package
installs and plain node can import it, and 0.2.0's headline fix was for a consumer with no bundler.

**Why it stands on this package's own merits.** A `| null` return is a promise about a class of
failure, and this one covers half the class. `gpu/renderer.ts`'s own header gives the reason the null
exists — "a browser was measured reporting WebGPU and then handing back nothing when asked" — which
is a run-time surprise from a host object, and an absent method is the same kind of surprise from the
same kind of object.

### Steps

1. **Decide whether the run-time contract is narrowed or honoured, and write it where the return
   type is.** Narrowing means the header says a caller must pass a real canvas and the throw is
   correct; honouring means each backend's entry tests the method before calling it. **The
   measurement**: the decision at `gpu/renderer.ts:129`'s doc comment with its reversal and trigger,
   and — whichever lands — a test passing an object with no `getContext` and asserting the written
   outcome. `npm test` at its new count.

### Done when

- `createFrameRenderer` handed an object with no `getContext` does the one written thing, shown by a
  test, on both backend branches.
- The doc comment on the return type says which, with how to reverse it.
- `npm test` and `npm run type-check` are green.

**What would change the answer.** If the decision is that the type is the contract and a JavaScript
caller is out of scope, **this item closes as refused with that sentence written at the signature**,
which is a better outcome than a guard nobody can reach. What it may not do is close silently.

---

## Item 14 — disposing a WebGL 2 renderer takes the caller's canvas with it, and disposing a WebGPU one does not

**Opened on 2026-09-11, out of reading 9 of the campaign above. It is the strongest of group C**,
because the defect is not the call: it is that one name on one interface means two different things,
and the one a caller cannot recover from is the unannounced one.

**The reading, re-verified on 2026-09-11.** `gpu/webgl2.ts:1492-1494` is the whole of that backend's
`dispose`: `arena.free(quadHandle)` and then
`gl.getExtension('WEBGL_lose_context')?.loseContext()`. `gpu/webgpu.ts:1315-1323` frees its target,
clears the shared pipeline cache, and calls `context.unconfigure()` — **which is reversible, and
losing a context is not**. A canvas hands back the same graphics context for as long as it exists, so
the next `getContext('webgl2')` on that canvas returns the lost one, where every `getParameter`
answers null.

**This tree already knows.** `host/surface.ts:42-55`'s doc comment on `setGraph` says it outright:
"A canvas hands back the same graphics context for as long as it exists, and disposing a surface
loses that context on purpose, so building a second surface over the first leaves it drawing into a
dead one. Nothing reports that: the draw calls are accepted and the picture stops moving." **So
`setGraph` exists because of this**, and the fact is written on the workaround rather than on the
thing that causes it.

**Why it stands on this package's own merits.** `docs/ARCHITECTURE.md`'s three lifetimes say what a
renderer owns, and the canvas is not among them — it is the caller's, handed in as a parameter. **A
`dispose` that destroys a caller-owned object it did not create is reaching past what it owns**, and
it does so on one backend and not the other, so a caller that wrote its cleanup against WebGPU and
shipped to a machine without an adapter loses its canvas and is told nothing. `docs/API.md`'s
`dispose` entries say neither thing.

### Steps

1. **Settle what `dispose` does to the context, and write it where the call is**, with how to
   reverse it and what would change it. Three answers, and the cost of each has to be named rather
   than assumed: never lose it, which gives up the one prompt way a backend with no explicit free
   hands card memory back; keep losing it and say so at the door on both `FrameRenderer.dispose` and
   `Surface.dispose`; or lose it only where the caller asks. **The measurement**:
   `gates/surface.mjs:293-315` already loses a context deliberately to check that a lost card is
   noticed — that check read against the change, and the surface gate at 21 of 21.
2. **Whichever lands, the two backends' `dispose` mean the same thing to a caller, or the difference
   is on the door and in the type.** **The measurement**: a test building a renderer on a canvas a
   previous renderer disposed, on both backends through their doubles, asserting the written outcome;
   `npm test` at its new count; `gate:browser` at 4 of 4 with the surface gate at 21 of 21.
3. **`docs/ARCHITECTURE.md`'s lifetimes and `docs/API.md`'s `dispose` entries say what a caller may
   do with its canvas afterwards**, and `host/surface.ts:42-55`'s paragraph points at that statement
   rather than being its only home. **The measurement**: `tests/api-signatures.test.ts` green and the
   two passages read side by side.

### Done when

- A test builds a renderer on a canvas a previous renderer disposed, and the outcome is the written
  one on both backends.
- `FrameRenderer.dispose` and `Surface.dispose` say in `docs/API.md` what happens to the canvas, and
  say the same thing for both backends or name the difference.
- `gates/surface.mjs`'s lost-card check still fails for a real loss, which is what says the change
  did not blind the gate that covers it.
- `npm test` and `npm run type-check` are green; `gate:browser` at 4 of 4 with the surface gate at
  21 of 21.
- The commit says the card gate was not re-taken.

**What would change the answer.** If losing the context turns out to be the only way this backend
returns card memory promptly — which is the reason it is there — then it stays, **and the item lands
as a door statement and a symmetry rather than a behaviour change**: `Surface.dispose` and
`FrameRenderer.dispose` both say it, and the WebGPU side says what it does instead. That is a smaller
landing and it is still the whole of the defect, which was that a caller could not find this out.
## Item 15 — `probe()` leaves a canvas on the caller's page for every backend it trials

**Opened on 2026-09-11, out of reading 10 of the campaign above. This is finding C of the spike
batch, re-verified and promoted.**

**The reading, re-verified on 2026-09-11.** `onScreenCanvas` at `host/probe.ts:344-355` creates a 200
by 100 canvas, sets `position: fixed; left: 0; top: 0`, appends it to `document.body`, and returns
it. It is called twice — `:304` for the WebGPU trial and `:326` for the WebGL 2 one — and **no line
in the file removes either.** The clear colour the trials leave behind is `(0.1, 0.2, 0.3)`, at
`:358` and `:369`. The consumer's reading, on 2026-09-09: after one `probe()` on a machine
offering both backends, two of those canvases stand over the top-left corner of the document and the
first picture drawn afterwards had that corner covered, read back as `(25, 51, 76)`.

**The canvas is on-screen on purpose** and the file says why: "the device loss the trial exists to
catch only happens for a canvas the browser is compositing, not one off the document." So the fix is
not to take it off the document — it is that the trial needs the canvas while it runs and needs
nothing of it afterwards.

**Why it stands on this package's own merits.** A door export that changes a caller's document
permanently is a defect in this package whatever the caller is, and `probe()` is a *reading*: its
whole shape is that of a pure question about the machine, answered as data. A reading that leaves
two composited rectangles over the top-left corner of the page is not a reading.

### Steps

1. **Each trial removes its own canvas once it has settled, in a `finally` rather than after the
   last statement.** `:320`'s `catch` swallows everything the WebGPU trial throws, so a removal that
   is not in a `finally` leaks on exactly the failure that `catch` exists for. **The measurement**:
   the count of `document.body` children before and after `probe()` in a jsdom test, taken for the
   success path and for a trial made to throw; `npm test` at its new count.
2. **Settle whether the WebGL 2 trial needs the canvas composited at all**, since `never()` at
   `:340-342` means WebGL 2 survival is "whether the draws throw" and a throw needs no compositor.
   If it does not, that trial's canvas never reaches the document and the whole class of leak is
   gone for half the function. **The measurement**: the WebGL 2 trial's answer with its canvas off
   the document against its answer on it, **named as a software-renderer reading**, since
   `gate:browser` is the only gate that can take it unattended and a software renderer cannot settle
   it for a real card. If it cannot be settled, step 1 stands alone and the step says so.
3. **`probe()`'s answers are unchanged**, which is what says the removal did not break the trial it
   exists for. **The measurement**: `gate:browser`'s device report naming both backends and carrying
   the same `survivedCompositing` for each, at 4 of 4.

### Done when

- `probe()` adds nothing to `document.body` that it does not remove, including where a trial throws,
  shown by a test counting children before and after.
- `probe()` answers the same for both backends as it did, read off `gate:browser`'s device report.
- `npm test` and `npm run type-check` are green; `gate:browser` at 4 of 4.
- The commit says whether step 2 was settled or left standing, and that a software renderer cannot
  settle it for a card.

---

## Item 16 — a pass may name no scissor, and the plan that assumed one is corrected before anything is built

**Opened on 2026-09-11, out of readings 5 and 6 of the campaign above. This is finding D of the spike
batch, and step 1 corrects that finding before step 2 decides whether to build anything** — because
the finding is the only place in this tree the word appears, and a plan resting on its own only
mention is the inconsistency rather than the missing capability.

**The reading, re-verified on 2026-09-11.** `scissor` appears **nowhere in this tree outside
`docs/ROADMAP.md`**, re-grepped over every `.ts`, `.mjs` and `.md`. `FrameGraph`, `PassSpec` and
`DrawSpec` name it nowhere. `viewport` is a different matter and this file recorded so on 2026-09-10:
it is set per pass on the WebGL 2 draw path, asserted against the frame size by
`tests/renderer-webgl2.test.ts:540` and `tests/submit-executor.test.ts:98`, and recorded by the
double at `tests/support/fake-gl.ts:314`. **Finding D still says the word appears nowhere**, so the
correction this file already wrote a `Done when` for has not landed.

**And the consumer needs no scissor, read off its own file rather than reported.**
That package's own roadmap gives its 3.1.0, in its ladder table — a clip that is a path — as depending on
"`@altpsyche/engine`'s counting stencil, its item 2", and names no scissor at all. **So the one
argument for a scissor that was not this package's own is gone**, which is the right time to decide
the question rather than the wrong one.

**Why it stands on this package's own merits, and the merit is weaker than item 2's.**
`GPURenderPassEncoder.setScissorRect` is core WebGPU and `gl.scissor` is core WebGL 2, and a pass in
this package can reach neither — which is item 2's argument in the same shape: a renderer built to
the whole core specification either expresses a scissor or does not claim it. **It is weaker than
item 2's for a reason worth writing down**: a per-face stencil state is the only way the
specification offers to express a counted winding, so a frame that wants one cannot be written at
all; a scissor changes which pixels a pass writes and not what a pipeline computes, so a caller can
reach the same picture by drawing into a texture of its own and presenting it. That weakness is this
item's own risk and is why step 2 is a decision and not a build.

**The constraint reading 6 puts on this item and on item 2**, stated once in the campaign section
above and repeated here because it binds at the type: depth is in the frame description already, so a
scissor is per-pass state beside the depth attachment and a stencil mode is per-pipeline state beside
the depth compare. Both have a home in the types today and neither needs the vocabulary redesigned.

### Steps

1. **Correct finding D first, so the plan stops resting on its own only mention.** Finding D names
   `scissor` alone; says a viewport is set from the frame size on the WebGL 2 draw path and declared
   nowhere in a graph; and the 3.1.0 row in the dependants table stops claiming that consumer needs a
   scissor, re-read against its own ladder. **The measurement**: the three passages before and after,
   and `npm test` green — a documentation step whose measurement is the reading and not a number.
2. **Decide whether a scissor is built, on the specification argument alone, with the weakness in
   the paragraph above answered rather than skipped.** **The measurement**: the decision written in
   `graph/types.ts` above the pass type, with how to reverse it and what would change it. **If the
   answer is no, the item closes here**, having corrected the plan and recorded that a rectangle clip
   is not a capability in this package.
3. **If built: `RenderPassSpec` names an optional scissor rectangle**, `validate` refuses one outside
   the frame's own size the way it refuses a per-draw slice past the end of its buffer, `cost` says
   whether a scissor changes a cost, and both backends apply it — `setScissorRect` and `gl.scissor`
   with `gl.enable(gl.SCISSOR_TEST)`, with the flip between the two origins in one place, beside the
   one the viewport already uses. **The measurement**: a fixture whose scissor leaves a named number
   of pixels at the frame's clear colour, the two backends agreeing on it to the single channel the
   corpus already holds every preset to, `gate:browser` at 4 of 4 and the recording contract at its
   new count.
4. **If built: `docs/API.md` and `docs/GUIDE-frame-graph.md` name it.** **The measurement**:
   `gate:pack`, and the door's export count against 69 run-time names.

### Done when

- Finding D names `scissor` alone, says a viewport exists on the draw path and is declared in no
  graph, and no longer claims that consumer's 3.1.0 needs a scissor.
- A written decision in `graph/types.ts` says whether a pass may name a scissor, with its reversal
  and its trigger, whichever way it went.
- If built: a fixture draws a scissored pass, the two backends agree on it to the single channel,
  `validate` refuses a rectangle outside the frame by name, and `docs/API.md` names the field.
- `npm test` and `npm run type-check` are green; `gate:browser` at 4 of 4 with the recording contract
  at its count, and `gate:pack` green on step 4.
- The commit says the card gate was not re-taken.

**What would change the answer.** If step 2 decides a rectangle clip is caller-side — drawn into a
texture the caller owns and presented — the item closes at step 2 with that written where the pass
type is, and this file gains one line saying so, so the question is not re-opened by the next reader
who notices `setScissorRect` is unreachable.
## Item 17 — the live path cannot read back the frame it is showing

**Opened on 2026-09-11, out of reading 11 of the campaign above. Reading 11 was wrong in half and the
half that is right is this item**, which is recorded here rather than quietly narrowed.

**What the reading got wrong.** It said no readback is at the door.
`FrameRenderer.frame(shader, uniforms, into?)` returns `Promise<Uint8Array>` — RGBA, top row first,
with the row-stride repack owned in the library (§17 decision 7, item 29) — and `createFrameRenderer`
is exported, so **a one-shot caller reads a frame back through the published door today**.
`gpu/webgpu.ts:1283-1313` and `gpu/webgl2.ts:1474-1492` are the two implementations.

**What is right, re-verified on 2026-09-11, is that the live path has none.** `Surface` at
`host/surface.ts:39-66` carries `start`, `stop`, `setGraph`, `resize`, `dispose`, `running` and
`backend`. No member gives back pixels. **And the canvas cannot substitute.**
`gpu/webgpu.ts:363-368` configures the canvas context
`RENDER_ATTACHMENT | COPY_DST` and copies the frame onto the current drawable; the texture that
carries `COPY_SRC` is the backend's own target at `:344`, and that is the one `readPixels` reads. The
consumer's reading, on a card on 2026-09-09 and not re-takeable here: `drawImage` of the drawn canvas
into a 2D context gave `(0,0,0,0)` at every one of 120,000 pixels, while a screenshot of that same
canvas read `(240, 92, 51)` inside the triangle.

**Why it stands on this package's own merits.** `gpu/renderer.ts`'s own header says there are two
interfaces because a build script and a page want different things, and that the one-shot interface
is the primitive with the live one built on top of it. **A page wanting one frame of what it is
already showing has to build a second renderer over a second canvas and draw the frame twice** — and
on WebGL 2 it cannot reuse the first canvas at all, for the reason item 14 is about. The readback
arithmetic is already owned here and has one home; the live path is the one path that cannot reach
it.

### Steps

1. **Decide where the readback goes and write it where the decision is.** Two shapes: `Surface`
   grows a `read()` that draws and reads on the next tick, or `Surface` exposes the `FrameRenderer`
   it holds and the readback stays the one that already exists. **The second adds no name and hands
   out the renderer's whole lifetime**, which is the cost to weigh against the first's one new name.
   **The measurement**: the door's export count before and after against 69 run-time names, and
   `gate:pack`.
2. **Whichever lands, one path reads pixels back and the row-stride repack is not written a second
   time.** **The measurement**: a test reading a known frame back through the live path on the
   WebGL 2 double, `npm test` at its new count, and the surface gate at 21 of 21.
3. **`docs/API.md` and `docs/GUIDE-backends.md` say a live surface can be read and what it costs.**
   `FrameRenderer.frame`'s own comment already carries a reading — 1.9 to 2.5 ms a frame drawing
   against 5.0 drawing and reading, on one fullscreen shader at 1200x750 — and **that number is
   quoted as the dated reading it is rather than re-asserted**, since no unattended session can
   re-take it. **The measurement**: `tests/api-signatures.test.ts` and `tests/docs-code.test.ts`
   green.

### Done when

- A caller holding a `Surface` reads back the pixels it is showing, through one published path,
  shown by a test.
- Neither a second canvas nor a second renderer is needed to do it.
- The row-stride repack has one home, read off the tree rather than asserted.
- `docs/API.md` names the path; `npm test`, `npm run type-check` and `gate:pack` are green;
  `gate:browser` at 4 of 4 with the surface gate at 21 of 21.
- The commit says the card gate was not re-taken and that the `(0,0,0,0)` reading belongs to another
  repository's session.

**What would change the answer.** If step 1 finds that reading the live path back requires the
surface to stop its own loop and re-enter it — which would make `read()` a control operation wearing
a reading's name — then the readback is the `FrameRenderer`'s and `Surface` exposes it, and the
reason goes on `Surface` rather than on the new name that was not added.

---

## Item 18 — the program cache is keyed on the geometry bytes, so a picture whose shape moves recompiles every frame

**Opened on 2026-09-11, out of reading 12 of the campaign above. Its first step is a measurement this
repository can take**, because what the defect *costs* is unmeasured and measuring it properly needs
a card.

**The reading of the code, re-verified on 2026-09-11.** `frameKey` at `pipeline/cache.ts:337-351`
serialises `frame.resources` through `canonical` at `:312-316`, whose replacer turns a `Uint8Array`
into `{ $bytes: <a latin1 string of every byte> }`. **So a `VertexResource.data` is in the key byte
for byte.** `gpu/renderer.ts:170-177` holds a `WeakMap<FrameGraph, string>` in front of it, keyed on
the frame *object*, and its own comment gives the reason that is enough: "a frame is a fresh object
per edit and its fields never change after it is made". **A frame rebuilt once per animation tick is
a fresh object every tick**, so that WeakMap misses every tick, `frameKey` runs, the string differs
because the geometry differs, `programs` misses too, and `backend.program(shader)` compiles.

**What is already there to fix it.** `VertexResource.source` at `graph/types.ts:269` is the field
that would let a frame name geometry rather than carry it, and `graph/types.ts:266-268` already
states the split: "the build writes an address and the runtime fills in what came back from it."

**What is measured and what is not.** The paragraphs above are a reading of this tree's source. The
figure of 106,632 bytes serialised per frame for one real figure was counted in the consumer's
session and is theirs. **What a recompile costs in milliseconds is unmeasured on any machine**,
because it needs a card and `gate:card` never runs unattended. So step 1 takes the measurement this
repository *can* take and the item is not worked past it on a guess.

**Why it stands on this package's own merits.** `gpu/renderer.ts:21-27` says why the cache exists —
"compiling is most of what a frame costs when the frame is one triangle" — and why
`PROGRAM_CACHE_LIMIT` is 16: "a program owns a set of card resources, so a renderer that never lets
one go grows its card memory by one source's worth every time a reader edits and recompiles."
**A cache whose key contains the one field that changes every frame cannot hit for a moving picture,
and it evicts sixteen programs' worth of card resources while missing.** The comment above the key
says "a false miss only recompiles"; the reading is that a false miss is the *normal* case for a
picture whose geometry moves, which is a different claim from the one that comment is making.

### Steps

1. **Measure it here, before changing anything.** A node test building sixty frames of one figure's
   geometry as fresh objects and counting, through the WebGL 2 double: `frameKey` calls, the key's
   length in characters, and `backend.program` calls. **The measurement**: those three counts over
   sixty frames, taken by `npm test` on this machine, **with the wall-clock cost of a recompile named
   as unmeasured and needing a card.** If the compile count is already one, the item closes here as
   refused with that count recorded.
2. **Decide what the key carries for a resource whose bytes change per frame, and write the decision,
   its reversal and its trigger at `frameKey`.** The candidates: a resource's `source` where it has
   one and its bytes only where it does not; a content identity the frame carries rather than the
   bytes; or the resident slice leaving the key entirely, which is what `frameKey`'s own comment
   already says items 13 and 15 would have done. **Whatever lands has to answer the header's own
   claim** — that a false *hit* is what `frameKey` exists to make impossible — by saying why two
   frames sharing a key are the same program. **The measurement**: step 1's three counts re-taken
   after.
3. **A test per field `frameKey` reads, so two frames differing in any one of them still get two
   programs.** This is the check that the fix did not buy its hits by losing the distinction the key
   exists for, and `CONTRIBUTING.md`'s rule applies: a test rewritten alongside the code it checks
   catches nothing, so these are written against the fields rather than against the new key. **The
   measurement**: each red on a pair differing only in that field, and `gate:browser` at 4 of 4 with
   the recording contract at its count.

### Done when

- A frame whose `VertexResource.data` changes every tick compiles its program once over sixty
  frames, shown by a count through the WebGL 2 double, against the count step 1 recorded.
- Two frames differing in anything a program bakes in still get two programs, shown by a test per
  field `frameKey` reads.
- The decision, its reversal and its trigger are written at `frameKey`.
- `npm test` and `npm run type-check` are green; `gate:browser` at 4 of 4 with the recording contract
  at its count.
- The commit says what a card would have measured and this did not: the milliseconds one recompile
  costs, and therefore what the fix is worth in time rather than in compiles.

**What would change the answer.** If step 1 finds the compile count is already one — the WeakMap
hitting because a caller reuses its frame object — **the item closes as refused with that count
recorded**, and this file gains a line saying `frameKey` serialises geometry bytes and that it costs a
serialisation per new frame object rather than a compile. That line is worth having either way,
because the next reader will find the same replacer and file the same item.

---

## Item 19 — three presets draw on one backend and compare nothing, for one reason each time

**Opened on 2026-09-11 by item 2's step 4**, which fixed a fourth instance of it and measured the
cost. `gates/corpus.mjs` skips a preset on WebGL 2 where its pipeline names no vertex stage — "a
fullscreen WGSL frame, which bakes no vertex for WebGL 2 to link" — because the backend's own three
corners are its program rather than the shader's, so there is nothing for naga to bake and nothing
for WebGL 2 to link. A preset skipped on one backend is drawn on one backend, and a preset drawn on
one backend compares nothing.

**That is not hypothetical and this file has two instances of the damage.** `core-depth` blended and
drew unblended on WebGL 2 for as long as it was in the corpus, found by item 11, and nothing saw it
because the cross-backend comparison covered three scene presets. `core-stencil` had the two backends
using different stencil references, found by item 2's step 1, and nothing saw it because that preset
was skipped here. Both were silent for the same reason: no comparison existed to be red.

**The three that remain**, each a fullscreen WGSL frame whose pipeline names no vertex stage:
`core-texture`, `core-target` and `core-mips`. They are three of the nine WebGL 2 skips the corpus
gate reports; the other six are real capability answers — a compute stage, a storage buffer, a
per-target blend, a buffer no pipeline reads — and are not this item's.

**The fix is the one step 4 took** and it is small: a vertex entry point that spends the frame's own
grid straight into clip space, the pass naming it and the geometry it reads, and the preset stops
being skipped. `core-count` was written that way from the start and `core-stencil` was changed to it,
both on 2026-09-11, so there are two worked examples in the tree.

**What it is not.** It is not an argument for removing the backend's own corners: a caller writing a
one-pass fullscreen WGSL frame should still be able to draw one without authoring a vertex stage, and
`toy/frame.ts` is where that convenience lives. What this item says is that a *corpus preset* — a
thing whose whole purpose is to be drawn by both backends and compared — may not use it.

### Steps

1. `core-texture` gains a vertex stage for its fullscreen pass. **Measures:** the corpus gate's WebGL
   2 skip count falling by one, and the preset's WebGPU pixel reading unchanged across the change,
   which is what says the new stage draws the same picture.
2. The same for `core-target`. **Measures:** the same two numbers.
3. The same for `core-mips`. **Measures:** the same two numbers.
4. Whichever of the three are worth comparing channel for channel go on `gates/card.mjs`'s
   cross-backend list. **Measures:** each one's two backends compared on a real card, with the
   channels differing recorded per preset.

### Done when

- No preset is skipped on WebGL 2 for want of a baked vertex, and the corpus gate's own skip count
  says so.
- Each changed preset's WebGPU reading is the one it had before the change, so the convenience was
  replaced and not the picture.
- `npm test`, `npm run type-check` and `gate:browser` are green, and the card gate is re-taken.

**What would change the answer.** If a preset's fullscreen pass cannot be expressed as a vertex stage
over the geometry it already has — a preset with no geometry at all would need one generated — then
that preset needs a resource rather than an entry point, and the step for it says so rather than
quietly adding a primitive to `shader-geometry.ts`.

**What this item does not carry.** Nothing about `core-depth`'s skip, which is a genuine
per-target-blend capability answer and correct as it stands.

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

### Does the library choose the backend, or does the caller? — **answered on 2026-09-11 by item 9**

**The answer is that the library chooses, and the caller owns the device.** It is written in
`gpu/select.ts`'s header with its reversal and its trigger, and item 9 above records how it was
reached and what fell out of it. This section is kept as the reading that raised the question.

**This stopped being a question that could wait on 2026-09-11**, when reading 2 of the campaign above
found a second consequence of the same ambiguity — a backend `selectBackend` answers for a frame the
caller does not have — and item 12 was written needing the answer before it could name its own steps.
**So it is item 9 now**, with the reasoning below kept where it was written rather than moved, because
it is what item 9 has to answer. The paragraph beginning "Two published documents" is the reading;
item 9 is the work.

**Two published documents give opposite answers and the audit of 2026-09-10 could not decide which
one the package means.** `docs/GUIDE-backends.md:3-4` opens "This package draws through **WebGPU**
where a browser returns an adapter and **WebGL 2** where it does not. You never name a backend."
`README.md:110-112` says "**A renderer uses WebGL 2 unless you give it a WebGPU device.** You call
`requestWebGPUDevice()` and pass `{ backend: 'webgpu', device }`." The README describes what
`createFrameRenderer` does. `gpu/select.ts` opens on the guide's side, saying which backend draws is
"answered inside the library rather than by the caller naming one".

**This is finding A above, seen from the documents rather than from the code**, and it is filed here
as a question because the answer decides what finding A is. If the library chooses, finding A is a
defect and the guide is right. If the caller chooses, finding A is not a defect and the guide and
`gpu/select.ts`'s header are both wrong. Correcting the guide to match the code would settle it by
default, which is why the correction is not in item 7.

**Done when** one answer is written in `gpu/select.ts` at the point of the decision, and the two
documents say the same thing as each other and as the code.

### Finding D's reading is half right, and the half that is wrong changes what it costs

**Re-taken on 2026-09-10.** Finding D says "`FrameGraph`, `PassSpec` and `DrawSpec` name neither a
scissor nor a viewport" and then that "The word appears nowhere in this tree outside this file". The
first half holds for both words at the graph level. The second holds for `scissor` — zero
occurrences anywhere outside this file — and **fails for `viewport`**, which the WebGL 2 path sets
per pass at `gates/card.mjs:201` and which `tests/renderer-webgl2.test.ts:540` and
`tests/submit-executor.test.ts:98` both assert against the frame size, with the double recording it
at `tests/support/fake-gl.ts:314`.

**Why it matters rather than being a wording nit.** A viewport exists on the draw path and is derived
from the frame's size; a scissor does not exist at all. So the 3.1.0 row's "a rectangle is a scissor"
needs one capability built and not two, and finding D's own question — whether 3.1.0 is one item or
two — is answered by that difference.

**Done when** finding D names `scissor` alone, and says a viewport is set from the frame size on the
draw path but declared nowhere in a graph. **That correction is item 16's step 1 as of 2026-09-11**,
which also re-read the consumer's own 3.1.0 row and found it names item 2's counting stencil and no
scissor at all — so the correction and the decision whether to build one land together.

### Settled on 2026-09-10: `gate:pack` now reads the declared types, and the claim that prompted it was wrong

**This was a question here and it is answered, so it is recorded rather than left open.** The
question was whether `gate:pack` should read the `types` half of a declared entry, since nothing did:
it asked plain node, `tsx` and a bundler, none of which reads declarations the way a consumer's
compiler resolves them. Two checks landed, and the interesting part is what the first one taught.

**A `types` path pointing at nothing does not fail a compile, which is what this entry claimed it
would.** TypeScript falls back to the `default` condition and picks up the `.d.ts` beside the `.js`,
and `tsc` emits one beside every file — so the fallback always succeeds in this package and no
amount of compiling sees the typo. Verified by pointing the maths door's `types` at a
declaration file name that is not there, and watching the new probe stay green; it reddens only once
the sibling declaration is deleted too, as TS7016. **So the gap was narrower than this entry said**, and a wrong
`types` key here is harmless to a consumer.

What each check is therefore worth: the compile probe catches declarations that are absent or do not
compile, which is a build that stopped emitting them or a `files` list that stopped shipping them.
The path check — every condition of every declared entry asserted to be a file the install carries —
catches the manifest typo the compiler forgives, and it is the half that fails by name. Both are
generated from the installed manifest, so a door added to `exports` is read without a line being
added.

**What is left of the question.** Only `nodenext` is read, not `node16` or `bundler`. Those differ in
ways that have bitten this package before — 0.2.0's headline fix was a `dist` only a bundler could
load — and nothing yet reads a declared entry under the looser two. That is a smaller question than
the one this section opened with and it is left standing as a candidate below rather than as an open
question here.

### When item 2 grows the counting modes, does the stencil table become data or stay two tables?

**The audit found `StencilMode`'s meaning written once per backend.** `gpu/webgpu.ts:130-139` holds
`STENCIL_MODES`, a `Record<StencilMode, …>` of `GPUStencilFaceState` plus a write mask;
`gpu/webgl2.ts:294-297` holds `STENCIL_GL`, the same two modes in the card's own fields. Each
carries a comment saying the other agrees with it, and `gpu/webgl2.ts:285-286` claims to use "the
same `STENCIL_BITS` the WebGPU backend uses" while in fact writing `0xff` itself at `:293`, `:295`,
`:1340`, `:1346` and `:1369` against `STENCIL_BITS = 0xff` at `gpu/webgpu.ts:124`.

**Two tables for two APIs is defensible** — a `GPUStencilFaceState` and a `stencilOp` triple are not
the same values — **and a mask width shared by assertion is not.** Item 2 doubles the rows of both
tables, so the question is worth settling before it runs rather than after: does the mode's *meaning*
(what compares, what writes, what each face does) move into `graph/` as data that each backend
translates, or do the two tables stay and gain a gate that holds them to one another?

**Done when** item 2's step 1 names which, with the reason at the point of the decision, and the
reference width has one home.

### Answered on 2026-09-11 by item 2's step 1: the meaning is data in `graph/`

**One table, `STENCIL_STATES` in `graph/types.ts`**, carrying each mode's two face states, its
reference and its masks in the fields `GPUDepthStencilState` names. The WebGPU backend spends them as
they stand and the WebGL 2 backend translates each name to the card's own enum, which is the direction
every other name in that file already travels — `depth.compare` is a `GPUCompareFunction` and
`depth.format` a `GPUTextureFormat`, so the neutral vocabulary here *is* the specification's.

**Why not two tables and a gate.** Two tables was the defensible reading while a mode's meaning was
only a comparison and an operation. The counting pair ends it on two counts. The reference is now part
of what a mode *means* — `nonzero` compares against zero and `inside` against every bit — so a number
shared by assertion cannot hold; and the two faces differ, which doubles what each table would have to
keep in step. A gate holding two tables to one another proves only what it thought to check, and one
table cannot disagree with itself.

**The reading was worse than the question said.** It named the width; the tree had the reference
declared three times with two values and the two backends disagreeing about it unseen. The landed
entry above carries that. **To reverse it**, move each mode's row back into the backend that spends it
and give the reference a gate. **What would change the answer** is a third backend whose stencil stage
is not shaped like this pair's, at which point the neutral row is a translation layer rather than the
thing itself.

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

### Four candidates left on 2026-09-10, each an idea and none an item

**A declared entry read under the looser two resolution modes.** `gate:pack` now type-checks every
declared door under `moduleResolution: nodenext`, which is the strict reading of `exports`. Nothing
reads them under `node16` or `bundler`. **What makes it doubtful** is that the looser modes forgive
what the strict one refuses, so a door passing `nodenext` almost certainly passes both — the failure
would have to be a condition only the looser resolvers consult, which this manifest does not use. It
is written down because 0.2.0's headline fix was a `dist` only a bundler could load, so this package
has been wrong about resolution before, and because the cost is one more `tsc` invocation over a
fixture that already exists.


**The layer table held to the walk that already exists.** `docs/ARCHITECTURE.md`'s "may import"
column is prose and item 7 corrects it once. `tests/import-graph.test.ts` already walks every import
edge in the tree for four other rules, so the column could be an assertion instead of a sentence:
each layer's permitted set written down once, and the walk failing on an edge outside it. **What makes
it doubtful** is that the four rules that test holds are each a design promise with a stated reason,
and a table of every edge is closer to a snapshot of the tree — it would go red for a refactor that
broke nothing, which is the kind of gate that gets deleted.

**The tree cites four documents that were deleted at 0.3.0.** Twenty-eight files under `graph/`,
`submit/`, `gpu/`, `host/`, `scene/`, `pipeline/`, `resource/`, `gates/`, `tests/` and
`examples/` name `RoadToPureEngine.md` by section, `JOURNAL.md`, or the old queue's item numbers.
`git show` recovers all four, and `CLAUDE.md` says as much, so a reader is not stranded. **One of
them is worse than stale, though**, and it is the reason this is written down: `graph/validate.ts:17`
says a rule landed "per ROADMAP.md item 19", and `docs/ROADMAP.md` exists again with items 1 to 18, so
that reference now points at a live document and a dead item number. `tests/import-graph.test.ts`
carries the same shape — it says `host/loop.ts` "arrives with submit(graph), item 68" while `submit`
has been on the door since 0.3.0. **What makes it doubtful** is that these are the *why* at the point
of the decision, which `CLAUDE.md` says is where a decision goes and which survives a file move; the
citation is a footnote on reasoning that is still readable without it, and a sweep of twenty-eight
files touching no behaviour is a large diff whose measurement is only that the tests still pass.

**`scene/`'s headers still describe a package that lives inside a website.** `scene/maths.ts` opens
saying the arithmetic is written here "so that every line an episode explains is a line a reader can
open, and it imports nothing from the site so that it can be lifted out into a library later". It
*is* the library now, and there is no site in this repository. `scene/draw-list.ts` and
`scene/material.ts` each cite "D88's rule that nothing shipping in the library reaches the site",
a decision recorded in another repository. **What makes it doubtful** is the same as above, with one
difference worth noting: `scene/maths.ts`'s header is the file item 3 would put behind a second door,
and a door of its own is the moment that paragraph is read by someone new — so this one may arrive as
step 4 of item 3 rather than as a candidate of its own.

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

**Re-read on 2026-09-11, and the rows below had gone stale by four versions.** That package is at
**2.8.0** with its GPU painter built — its paint/gpu.ts and figure/gpu-frame.ts exist, the second
builds a `FrameGraph` and calls `resolve` and `cost` — so the "2.7.0, a GPU painter" row below is
landed rather than pending, and so is "2.8.0, dashes and quadratics". **The peer-dependency question
below is answered too, and answered the way that section recommended**: its manifest declares
`@altpsyche/engine` at `^0.4.0` in `peerDependencies`, with a `devDependencies` entry at the same
range for its own gates — a peer rather than a plain dependency, which is what keeps two copies of
this package out of one page. **And what its 2.x needed from here has landed** — two of its
value modules import their spatial arithmetic from `@altpsyche/engine/maths`, which is item 3 and
0.4.0. Its ladder now runs 2.9.0, 3.0.0, 3.1.0 and 4.0.0, and **its 3.1.0 names item 2's counting
stencil and no scissor**, which is the reading item 16 turns on. The table below is left as written
with this paragraph in front of it rather than rewritten row by row, because the rows are a record of
what was expected and this is what happened; **the next session to touch this table re-reads it from
that file rather than from here.**

**That package was at 1.0.0 with its door frozen when this was written and is at 2.5.1 now**, and
this one is at 0.4.0, published on 2026-09-10 for the second declared entry, which is the version
that carries `@altpsyche/engine/maths`. A frozen door promising a consumer that a name does not change cannot be
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

### The spike's batch, four findings — **all four now carry items, as of 2026-09-11**

**Read this section as the record of how each was found, not as the queue.** Each finding was
re-verified against this tree on 2026-09-11 and promoted: **finding A is item 9 and item 12**, split
because the contradiction and the join are two commits; **finding B is item 10**; **finding C is item
15**; **finding D is item 16, whose step 1 corrects the finding's own wording first**. The readings
below stand as written, except where an item says the reading came back different, which two of them
do.


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

**The baseline expires while this file waits, and it has now done so twice.** The numbers at the top
of it were measured on 2026-08-29. A pair of them read 514 tests over 34 files until they were
re-taken at 864 over 73, and the recording contract read 15 of 15 until it was re-taken at 16 of 16
on 2026-09-10. Both were the same defect: a sixteenth capability fixture landed and every count
written down beside the fifteen stayed as it was. A stretch with no session here ends with the
baseline re-taken before an item can be measured against it, which is a session of its own and is
worth expecting rather than discovering.

**A count of fixtures is the shape most likely to expire here**, because it is written in prose in
this file and in a comment in `gates/corpus.mjs`, and `loadCorpus` reads `CAPABILITY_FIXTURES`
rather than a number. So the gate reports the true count and every sentence about it has to be
edited by hand. `gates/corpus.mjs:334` still reads "fifteen presets plus the one fullscreen probe"
while the gate it comments prints 24 of 24 draws over sixteen.

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
