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
with 9 WebGL 2 skips, 21 of 21 surface checks, and 864 node tests over 73 files, **re-taken on
2026-09-10** on a clean tree. The node pair read 514 over 34 here until it was re-taken at 864 over
73, and the recording contract read 15 of 15 until it was re-taken at 16 of 16: both had expired
rather than moved, because the sixteenth capability fixture arrived and neither number followed it.

**The one line of this baseline no unattended session can re-take is the card**, which read 17 of 17
on 2026-08-29. `gate:card` needs a desktop session and a real graphics card, every headless launch
reaches the software renderer whatever the flags say, and the gate's own header says so. So that
number is carried here as dated and unverified rather than re-asserted, and the four browser gates
above it belong to a software renderer.

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
- [ ] **2. `./maths` is declared and nothing moves.** `package.json` gains the entry with its own
  types and default. `scene/maths.ts` keeps every export it has and `index.ts` keeps re-exporting all
  of them, so no name leaves the first door and no consumer's import line changes. **The
  measurement**: `gate:pack` green; the files and bytes node loads through `./maths` against the 27
  files and 218,459 bytes it loads through `.`; and the eager closure of `.` unchanged at 28 files by
  the walk.
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
- `CLAUDE.md` reads the refusal in the form step 1 settled, and no document disagrees with it —
  which means `CONTRIBUTING.md`'s non-negotiable list and `index.ts`'s own header too, since both
  stated the old rule in their own words.

**What would change the answer.** The refusal was settled in this item's favour on 2026-09-10, so
what is left to change the answer is the bound rather than the door. If a later change makes
`scene/maths.ts` import anything, step 3's gate goes red and the choice is to sever that import or
withdraw the door — and withdrawing a published entry is a breaking change, which is the cost of
this decision and the reason the bound is a gate and not a note.

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

1. **Settle the two divergences before moving anything**, by deciding whether a texture carrying a
   `source` and no `data` yet is refused for its samples and its size. Write the answer where the
   rule lands. **The measurement**: the refusal each backend gives that description today, read off a
   test rather than off the source, and one wording after.
2. **Move the six into `graph/validate.ts`**, with both backends losing their copies and the frame
   refused before either is built. **The measurement**: `npm test` and `npm run type-check` green,
   the count of `throw` sites in each backend before and after, and `gate:browser` at 4 of 4 with the
   recording contract at 16 of 16, which is what says the calls did not move.
3. **A test per moved rule that fails for the rule and not for the wording**, since a rule moved with
   its own tests is a rule nothing independent reads — which `CONTRIBUTING.md` names as the mistake
   that survives. **The measurement**: each of the six red on a graph that breaks it and green
   otherwise, and the two backends' remaining throws named as unreachable backstops.

### Done when

- None of the six rules appears in either backend, and `graph/validate.ts` states each once.
- A texture with a `source` and no `data` gets one answer, and the same answer on both backends.
- `npm test`, `npm run type-check` and `gate:browser` are green, with the recording contract at
  16 of 16, and the commit says the card gate was not re-taken.

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
- `host/loop.ts` — the row credits "RoadToPureEngine §7 and ROADMAP item 39". Neither document
  exists: the first was deleted at 0.3.0 and this file's items run 1 to 5.
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

### Does the library choose the backend, or does the caller?

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
draw path but declared nowhere in a graph.

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

### Three candidates the audit of 2026-09-10 left, each an idea and none an item

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
says a rule landed "per ROADMAP.md item 19", and `docs/ROADMAP.md` exists again with items 1 to 8, so
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
