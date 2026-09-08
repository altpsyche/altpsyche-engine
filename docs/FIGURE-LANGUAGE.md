# The figure language, and what this package does about it

**A figure language is a declarative language for describing a picture over time**, carrying nodes, a
timeline, value types and expressions. It is being built so that a figure can be written by something
other than a person typing TypeScript and drawn by something other than `@altpsyche/maths`, which
becomes its reference implementation. The specification will live in its own repository with its own
version.

**This document is one of three**, and the change crosses three repositories.

- [`@altpsyche/maths`](https://github.com/altpsyche/altpsyche-maths/blob/master/docs/FIGURE-LANGUAGE.md)
  — the format itself, and most of the work.
- **This document** — what this package refactors, which is almost nothing, and why that is correct.
- [`altpsyche.dev`](https://github.com/altpsyche/altpsyche-dev/blob/master/docs/FIGURE-LANGUAGE.md) —
  what the website refactors.

**This document exists so a session here knows the change is happening and does not plan against it.**
It queues nothing. [`ROADMAP.md`](ROADMAP.md) is the queue.

## What this package refactors

**Nothing, for the format.** This package renders frame graphs. It has no idea what a figure is, it
never learns, and no part of the format reaches it.

One item is queued here and it is queued on this package's own merits rather than because a consumer
asked. It is **item 2, a stencil that counts**, in [`ROADMAP.md`](ROADMAP.md). The short version is
that `StencilMode` is `'mark' | 'inside'`, both of them set `stencilFront` and `stencilBack` to one
state, and a boolean mask cannot count a winding number. `GPUDepthStencilState` separates the two
faces because they differ, so collapsing them is the one place a pipeline built here cannot express a
pipeline the core specification describes. That item stands whatever happens to the format.

## What this package must not do

**It must never import `@altpsyche/maths`.** That is a standing refusal in [`CLAUDE.md`](../CLAUDE.md)
now. That package depends on this one, behind a dynamic import in its GPU painter, so a second import
in this direction is a cycle.

The case that looks like it needs one is a shader declaring a camera. The answer there is that
whatever holds both packages reads the camera from here and hands it to a figure as data.

**It must not grow figure-shaped features.** A path tessellator, a glyph atlas and a stroke expander
all belong above this package rather than in it. The rule in [`CLAUDE.md`](../CLAUDE.md) that an
argument amounting to "the consumer needs it" is thrown out is the rule that keeps this true, and it
already did its work once: the stencil item is filed on the specification's terms rather than on the
figure package's.

## What this package does not reach

**Native rendering with no browser.** This package targets browser WebGPU and WebGL 2. Its headless
path is Playwright driving Chromium, and `gates/card.mjs` records why a real card needs a window:
"Every headless launch reaches the software renderer whatever the flags say, so the card needs a
window, and a runner has no display."

So a renderer that runs with no browser at all is a different program in a different language. **It
reads the figure format and imports nothing from either TypeScript package**, which is exactly why
the format is being built. This package is not on the path to native and does not need to be.

## What a session here should know

**A figure drawn on a GPU will build a frame graph directly.** The scene layer here, its entities and
transforms and `sceneView`, is not what that painter will use. That is worth knowing before the scene
layer is extended for a consumer that will not arrive.

**The counting stencil is the one thing the figure work waits on here.** Nothing else in that
repository's plan reaches this one.
