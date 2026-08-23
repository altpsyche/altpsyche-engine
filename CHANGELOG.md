# Changelog

What changed in each released version, in the words of what a consumer can now do
rather than which commits landed. It sits at the root of the repository and outside
the `files` list in `package.json`, so it is readable beside the source without
riding in every install.

The middle number carries feature improvements and additions, and the last one
carries fixes. A caret range on a `0.x` version tracks the last number alone, so
`^0.2.0` will not pick up a later `0.3.0`: a consumer moves to a feature release by
asking for it.

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
