# Changelog

What changed in each released version, in the words of what a consumer can now do
rather than which commits landed. It sits at the root of the repository and outside
the `files` list in `package.json`, so it is readable beside the source without
riding in every install.

The middle number carries feature improvements and additions, and the last one
carries fixes. A caret range on a `0.x` version tracks the last number alone, so
`^0.2.0` will not pick up a later `0.3.0`: a consumer moves to a feature release by
asking for it.

## 0.3.0

**A breaking release, and 0.x means it does not announce itself with a major number.** Thirteen
names left the door and sixty-eight arrived. If you are on `^0.2.0` nothing here reaches you until
you ask for it.

### Added: WebGL 2 stopped being the toy backend

At 0.2.0 it drew one fullscreen pass. It now draws several passes, several colour attachments,
depth and stencil, vertex geometry of the shader's own, resident texture content, a mip ladder,
multisampled attachments resolved through a blit, per-draw uniform slices, and a scene's
read-only per-instance records as a uniform block indexed per instance.

That means **the scene tier runs on WebGL 2**, not only on WebGPU — and on a real graphics card
the two backends now draw the same scene to within a single channel of each other. A frame
authored in WGSL reaches WebGL 2 by a translation performed at build time, so nothing downloads a
translator and the package still has zero runtime dependencies.

### Added: asking questions before you draw

`probe` reads what the browser actually offers. `selectBackend` says which backend will draw a
graph, or refuses naming what was missing. `refusal` answers what a graph needs that a device has
not got — **by name, from data, before anything reaches a driver.** `cost` gives bytes, draws and
passes at a size before a pixel exists. All four are pure over data, so they answer in a test, in
a worker, or on a machine with no card.

A GLSL-authored frame selects WebGL 2 **even where WebGPU exists**, which is now confirmed on
hardware rather than asserted: the language you wrote in is the capability you forfeit, and every
capability it gives up is one GLSL ES 3.0 has no syntax for.

### Added: `submit`, and `reflect`

`submit(renderer, graph, { into })` draws one frame on your own schedule; `into` is where it
lands and it is yours to choose. `reflect` reads what a shader source declares — uniforms, entry
points, bindings — from the **source** rather than from a compiled program, so it works before a
device exists and answers the same on both backends.

### Changed: resources are handles, not strings

Every resource in a graph is now a kind-branded integer minted by `buffer`, `texture`, `sampler`,
`uniform`, `vertices`, `indices`, `moduleHandle` or `pipelineHandle`. Passing a texture where a
buffer belongs is a **compile error** instead of a lookup that returns `undefined` mid-frame, and
nothing on the draw path looks a resource up by string any more.

A shader source is now discriminated on the language it was authored in rather than inferred from
which fields happen to be present, and a render pipeline carries its own source.

### Removed

`ShaderProgram` is gone — it was three lifetimes in one object, and it is now an arena, a pipeline
cache and `submit`. With it went `readBuffer` (read a buffer through the arena instead),
`writeBuffer` and `setPasses` (re-submit a mutated graph).

`FrameDescription` folded into `FrameGraph`: one type in two fetch states rather than two shapes
and a translation between them. `DocumentSpec` went with it.

Renamed, so the old names are gone: `ShaderFrame` is `FrameGraph`, `Extent` is a whole-size
descriptor `{ scale }` or `{ width, height }` that can finally say half-resolution, `Dispatch` is
`Groups`, `DocumentAddress` is a plain `string`, `documentAddresses` is `documentNames`, and
`dispatchesIndirectly` is `groupsIndirectly`. `QUERY_BYTES`, `TIMED_QUERY_BYTES` and
`VISIBLE_QUERY_BYTES` are no longer public; they still exist inside the graph validator.

### Fixed

**A scene drawn on WebGL 2 came back mirrored top-to-bottom** against the same scene on WebGPU.
The translator's clip-space adjustment negated Y while the backend's readback already turned the
frame over — two turns. The adjustment now corrects depth only, which is the half that was
needed. On a card the difference across the two backends fell from 344,146 channels to 11.

**A deprecation mechanism**, so a name that is going to move can say so at the call site before it
does.

## 0.2.0

**Added: how much of a frame carries a picture.** `readFrameCoverage` takes the
pixels a frame came back as and reports which rows and columns hold something other
than the frame's commonest colour, `isFullyPainted` answers whether every row and
every column does, and `describeFrameCoverage` puts that in words. One reading
rather than one per caller: a run refusing a capture and a gate passing a resized
surface are the same claim about the same kind of buffer, and two versions of the
arithmetic would drift with nobody reading the one that drifted.

**Added: `FrameRenderer.report()`.** It forwards the device's own account of itself
from the backend the renderer built, so a caller deciding whether a frame is
drawable at all reads a ceiling rather than drawing a picture and looking at it.
Until now the only way to ask was to hold a backend, which is the one thing the
door withholds on purpose.

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

First release. One door onto WebGL 2 and WebGPU: a renderer that draws one frame or
keeps a live surface running, the description a producer hands a backend and the
builders that make one, the uniform block a WGSL source lays out, the maths, a
scene, materials and a draw list, and a recording double for holding a backend to
the calls it makes.
