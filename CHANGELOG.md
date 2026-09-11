# Changelog

What changed in each released version, written as what you can now do and not as which
commits landed. It sits at the root of the repository, outside the `files` list in
`package.json`, so it is readable beside the source without riding along in every install.

The middle number carries feature improvements and additions, and the last one
carries fixes. A caret range on a `0.x` version tracks the last number alone, so
`^0.3.0` will not pick up a later `0.4.0`: a consumer moves to a feature release by
asking for it.

## 0.5.0

**A breaking release, and `0.x` means it does not announce itself with a major number.** Three names
arrive and none leaves or moves. What breaks is that **`StencilMode` gains two members**, so an
exhaustive `switch` over it stops compiling; that **`Capability` gains two members** for the same
reason; and that **several descriptions that used to draw are now refused by name**, each of them one
that was drawing the wrong picture on one backend or the other. If you are on `^0.4.0` nothing here
reaches you until you ask for it.

### Added: `openRenderer`, which carries a backend selection through to a renderer

`openRenderer(canvas, frame, options?)` gathers what the machine offers, asks `selectBackend` which
backend should draw, asks the browser for a card only where that answer wants one, translates the
frame where the chosen backend speaks another language, and builds the renderer — or answers with
one sentence saying why none of that could be done. It answers `{ renderer, frame }` or
`{ refusal }`, the two-armed shape `selectBackend` and `resolve` already use. `OpenedRenderer` and
`RendererOpening` are its types.

Those four steps were yours before, and the fourth was unannounced: a WGSL frame selected for WebGL 2
reached that backend untranslated and was thrown out of it. **The frame comes back beside the
renderer for that reason** — a WGSL frame drawn on WebGL 2 is drawn as its GLSL translation, so a
caller keeping its own copy and submitting that hits the very throw this exists to stop. Where no
translation was needed it is the same object.

`createFrameRenderer` is unchanged underneath, for a caller that already knows which backend it
wants. And `RendererOptions.backend` is a narrowing rather than an override: the backend you name is
the only one offered to the selection, so a frame it cannot draw comes back refused rather than
handed to a backend that will throw.

### Added: a stencil that counts, so a filled path can have a hole

`StencilMode` was `'mark' | 'inside'` — a boolean mask. It is now `'mark' | 'inside' | 'count' |
'nonzero'`, and the new pair is a counter: `count` adds one for every front-facing fragment and takes
one back for every back-facing one, both wrapping, and `nonzero` draws where that count did not come
back to zero.

That is the one thing a mask cannot do. A filled path with a hole, or one that crosses itself, has
its interior decided by a winding number, and a winding number is counted by letting the faces of the
path's triangles cancel — which is why `GPUDepthStencilState` carries `stencilFront` and
`stencilBack` separately. Until now both were given the same state on both backends, so this package
could not express a pipeline the core specification describes, and no device reported a capability
that was missing: the frame drew the wrong picture instead of being refused.

Both backends do it. On WebGL 2 it is `stencilOpSeparate` and `stencilFuncSeparate` with `INCR_WRAP`
and `DECR_WRAP`, all four core WebGL, so **there is no capability to ask for and nothing to declare
in `requires`** — every device that offers either backend has this.

The two backends were measured drawing the same counting picture, channel for channel, on an NVIDIA
Blackwell card: `0 of 1,440,000 channels differ`. And the counting picture was measured *against* the
mask's, so the difference is a number rather than a claim: `302,512 of 1,440,000 channels differ`,
which is the hole a mask fills in and a counter leaves alone.

**Which face is the front is not something you have to reason about.** The two backends disagree
about it — a framebuffer's rows run the other way on one of them — so the same shape counts `+1` on
one and `-1` on the other. `nonzero` asks whether the counter came back to zero rather than which way
it went, so both draw the same picture out of opposite counts.

### Fixed: WebGL 2 applies the blend a pipeline names, which it had never done

A pipeline naming `targets[].blend` drew blended on WebGPU and **unblended on WebGL 2**, with
`refusal()` returning `null` for both — a different picture on the two backends with nothing in the
data saying so. The word "blend" appeared nowhere in that backend, though `blendFuncSeparate`,
`blendEquationSeparate` and `blendColor` are core WebGL 2 throughout. It applies them now, with
WebGPU's own component defaults written out rather than left to GL's, which are not the same numbers.

**A frame whose pipelines name no blend touches no blend state at all**, so every frame that drew
before this has the call stream it had.

`Capability` gains `dual-source-blend` and `per-target-blend` for the two corners that genuinely do
not reach WebGL 2 — the `src1` family of factors, and a pass whose several colour targets name
*different* blends. Both are **read off your pipelines rather than declared**, so you do not have to
remember to put them in `requires`.

### Changed: descriptions that drew the wrong picture are refused by name

Each of these was drawing on one backend and refused on the other, or drawing wrong on both.

- **A draw naming its own vertex count on a pipeline that reads geometry.** WebGL 2 refused it;
  WebGPU built it and let the card refuse it afterwards with a message naming neither the draw nor
  the pipeline, while `resolve` and `cost` passed it either way.
- **A draw naming instances alone on a pipeline with no geometry to instance.** Refused twice before,
  in two different sentences.
- **A texture carrying a `source` and no `data` yet**, under several samples a pixel or under the
  frame's own size. A `TextureResource` carries `source`, the address its contents come from, and
  `data`, the bytes that came back, so that is the description you hold before your fetch returns.
  WebGPU read `data` alone and drew it; WebGL 2 refused it. Both refuse it now, in one sentence: a
  description is refused for what it says, not for how far its fetch has got.
- **A mip ladder over a texture with nothing in it to average.** WebGL 2 refused it; WebGPU built the
  levels of an empty texture and said nothing.

### Changed: one wording where two backends printed two

Where a frame shows a resource it does not declare, both backends printed their own sentence and a
third was already coming from the validator. There is one now, the validator's: `the frame for "…"
presents resource N, which it does not declare`. **If you match on the text of a refusal, this is the
one to re-read.** Matching on refusal text is not something this package asks you to do, and these
messages are written for a reader rather than for a parser.

### Under the hood, with nothing for you to do

Six rules about the shape of a declared texture were written once in each backend, two of them
already disagreeing; they are stated once in the validator now and both backends reach it, so a
description gets one answer whichever backend draws it. The stencil reference was declared three
times with two values — WebGPU wrote and compared `1` where WebGL 2 used `0xff` — and is one number
in one table. Neither changes a picture.

## 0.4.0

**One addition and nothing else.** No name on the main import path changed: 69 run-time names and
84 types, the same set as 0.3.0 with nothing added, removed or renamed, read off a regenerated diff
of the built door rather than from memory. No shipped code changed either — the only edit to a file
that ships was a paragraph of reasoning in the entry point's own header. If you are on `^0.3.0`
nothing here reaches you until you ask for it, and there is nothing here you need.

### Added: a second import path for the maths, and it is only worth taking without a bundler

`@altpsyche/engine/maths` gives you `vec3`, `mat3` and `mat4`, with the types `Vec3`, `Mat3` and
`Mat4`. All six stay on the main path as well, so **this is a shortcut and never a move**: every
import line you have already written is still correct, and importing both paths gives you one copy
of one module rather than two.

What it is for is the closure behind it, and the honest measurement is that most consumers should
ignore it. Installed from its own tarball and bundled with esbuild, minified:

| a consumer wanting only those three names | `@altpsyche/engine` | `@altpsyche/engine/maths` |
| --- | --- | --- |
| with a bundler | 2,116 B raw, **997 B gzipped** | 2,116 B raw, **995 B gzipped** |
| without one, counted by plain node | **27 files, 219,294 bytes** | **1 file, 7,520 bytes** |

So a bundler already reduces the main path to the arithmetic alone — the module imports nothing and
the package declares `sideEffects: false` — and the second path saves it two gzipped bytes. **Take
it only where there is no bundler**: a page on an import map, a CDN, Deno, plain node. There the
main path loads the renderer to reach the maths, and this one does not.

The module behind it imports nothing, and that is held by a gate rather than by intention: a
declared entry past the first is added only where the import walk can hold its closure to the one
module it points at. An import added to the maths module fails that gate instead of quietly putting
the renderer back behind the arithmetic.

**Subpaths other than these two do not resolve**, and that has not changed. `exports` refuses a path
nobody declared, which is what makes the public surface a decision rather than a consequence of
where a file sits.

## 0.3.0

**A breaking release, and 0.x means it does not announce itself with a major number.** Thirteen
names left the package and sixty-eight arrived. If you are on `^0.2.0` nothing here reaches you until
you ask for it.

### Added: WebGL 2 stopped being the toy backend

At 0.2.0 it drew one fullscreen pass. It now draws several passes, several colour attachments,
depth and stencil, vertex geometry of the shader's own, resident texture content, a mip ladder,
multisampled attachments resolved through a blit, per-draw uniform slices, and a scene's
read-only per-instance records as a uniform block indexed per instance.

So **the scene tier runs on WebGL 2** and not only on WebGPU. On a real graphics card the two
backends now draw the same scene to within a single channel of each other. A frame authored in
WGSL reaches WebGL 2 through a translation performed at build time, so nothing downloads a
translator and the package still has zero runtime dependencies.

### Added: asking questions before you draw

`probe` reads what the browser actually offers. `selectBackend` says which backend will draw a
graph, or refuses and names what was missing. `refusal` answers what a graph needs that a device
has not got: **by name, from data, before anything reaches a driver.** `cost` gives bytes, draws
and passes at a size before a pixel exists. All four are pure functions over data, so they answer
in a test, in a worker, or on a machine with no graphics card.

A GLSL-authored frame selects WebGL 2 **even where WebGPU exists**, and that is now confirmed
on hardware instead of asserted. The language you wrote in is the capability you give up, and
every capability it gives up is one GLSL ES 3.0 has no syntax for.

### Added: `submit`, and `reflect`

`submit(renderer, graph, { into })` draws one frame on your own schedule, and `into` is where
it lands, which is yours to choose. `reflect` reads what a shader source declares, meaning
uniforms, entry points and bindings, from the **source** and not from a compiled program. So it
works before a device exists and answers the same on both backends.

### Changed: resources are handles, not strings

Every resource in a graph is now a kind-branded integer minted by `buffer`, `texture`, `sampler`,
`uniform`, `vertices`, `indices`, `moduleHandle` or `pipelineHandle`. Passing a texture where a
buffer belongs is a **compile error** instead of a lookup that returns `undefined` mid-frame, and
nothing on the draw path looks a resource up by string any more.

A shader source is now discriminated on the language it was authored in, and no longer
inferred from which fields happen to be present. A render pipeline carries its own source.

### Removed

`ShaderProgram` is gone. It held three lifetimes in one object, and it is now an arena, a
pipeline cache and `submit`. With it went `readBuffer` (read a buffer through the arena
instead), `writeBuffer` and `setPasses` (re-submit a mutated graph).

`FrameDescription` folded into `FrameGraph`: one type in two fetch states, in place of two
shapes and a translation between them. `DocumentSpec` went with it.

Renamed, so the old names are gone: `ShaderFrame` is `FrameGraph`, `Extent` is a whole-size
descriptor `{ scale }` or `{ width, height }` that can finally say half-resolution, `Dispatch` is
`Groups`, `DocumentAddress` is a plain `string`, `documentAddresses` is `documentNames`, and
`dispatchesIndirectly` is `groupsIndirectly`. `QUERY_BYTES`, `TIMED_QUERY_BYTES` and
`VISIBLE_QUERY_BYTES` are no longer public; they still exist inside the graph validator.

### Fixed

**A scene drawn on WebGL 2 came back mirrored top-to-bottom** against the same scene on
WebGPU. The translator's clip-space adjustment negated Y while the backend's readback already
turned the frame over, so the frame turned twice. The adjustment now corrects depth only, which
is the half that was needed. On a graphics card the difference across the two backends fell
from 344,146 channels to 11.

**A deprecation mechanism**, so a name that is going to move can say so at the call site before it
does.

## 0.2.0

**Added: how much of a frame carries a picture.** `readFrameCoverage` takes the pixels a
frame came back as and reports which rows and columns hold something other than the frame's
commonest colour. `isFullyPainted` answers whether every row and every column does, and
`describeFrameCoverage` puts that in words. There is one reading of this and not one per
caller: a run refusing a capture and a gate passing a resized surface make the same claim
about the same kind of buffer, and two copies of the arithmetic would drift with nobody
reading the copy that drifted.

**Added: `FrameRenderer.report()`.** It forwards the device's own account of itself from the
backend the renderer built, so a caller deciding whether a frame is drawable at all can read a
ceiling instead of drawing a picture and looking at it. Until now the only way to ask was to
hold a backend, and holding a backend is the one thing the package withholds on purpose.

**Fixed: the package is importable without a bundler.** Every version before this
one compiled with a bundler's module resolution, so a relative import inside `dist`
left its extension off and node refused to load the package at all: `Directory
import '.../dist/renderer' is not supported`. Anything with a bundler in front of
it resolved that and could not see the defect. The output now writes node's own
specifiers, and a gate installs the package and asks plain node to import it before
anything looser gets a turn.

The two backends are still reached by a dynamic import, so a consumer's bundler
still keeps each one out of the first download.

## 0.1.1

No change to anything this package ships. The version exists because `0.1.0`'s
release needed the publish workflow changed before it would run, and the re-run
published under a new number.

## 0.1.0

First release. One entry point onto WebGL 2 and WebGPU: a renderer that draws one frame or
keeps a live surface running, the description a producer hands a backend and the
builders that make one, the uniform block a WGSL source lays out, the maths, a
scene, materials and a draw list, and a recording double for holding a backend to
the calls it makes.
