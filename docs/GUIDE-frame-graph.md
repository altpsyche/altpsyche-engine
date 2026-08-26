# Authoring a frame graph

You do not hand this library a shader and hope. You hand it a **frame graph**: a plain
value saying what resources exist, what pipelines run, and in what order the passes go.
The renderer reads it and makes the calls.

That indirection buys three things. The graph is serialisable, so it can be built in a
worker and sent. It is comparable, so two frames can be diffed. And it can be *asked
questions* — `cost`, `refusal`, `selectBackend` all read it without touching a device.

## The shortcut, for one fragment shader over the canvas

```js
import { createSurface, glslFrame } from '@altpsyche/engine';

const frame = glslFrame('fullscreen', VERTEX, FRAGMENT);

const surface = await createSurface(canvas, frame, {
  uniforms: (elapsedSeconds) => ({
    uTime: elapsedSeconds,
    iResolution: [canvas.width, canvas.height, 1],
  }),
  onError: (message) => console.error(message),
});

surface.start();
```

`wgslFrame` is the same for WGSL. Both build a one-pass graph whose vertex half is the
backend's own three corners, so there is no geometry to supply.

Note what the `uniforms` callback does **not** have to do: the resolution is read off the
drawing buffer the surface sizes, so a resize needs no code of yours.

## The long form

For anything with real geometry, more than one pass, or a depth buffer, you author the
graph directly. This is `examples/instanced-cubes`, trimmed:

```js
import { frameOf, pipelineHandle, texture, uniform, vertices, WGSL_DOCUMENT } from '@altpsyche/engine';
import type { FrameGraph } from '@altpsyche/engine';

const description: FrameGraph = {
  authored: 'wgsl',
  resources: [
    { kind: 'uniform' },
    {
      kind: 'vertices',
      stride: VERTEX_STRIDE,
      attributes: [
        { location: 0, offset: 0, format: 'float32x3' },
        { location: 1, offset: 12, format: 'float32x3' },
      ],
      topology: 'triangle-list',
      count: VERTICES.byteLength / VERTEX_STRIDE,
      source: 'cube',
    },
    { kind: 'texture', size: { scale: 1 }, format: 'depth24plus', use: ['attachment'] },
  ],
  modules: [],
  pipelines: [
    {
      kind: 'render',
      source: {
        vertex: { document: WGSL_DOCUMENT, text: '', entry: 'cube' },
        fragment: { document: WGSL_DOCUMENT, text: '', entry: 'shade' },
      },
      geometry: vertices(1),
      bindings: [{ group: 0, binding: 0, resource: uniform(0), visibility: ['vertex'] }],
      depth: { format: 'depth24plus', compare: 'less', write: true },
    },
  ],
  passes: [{ pipeline: pipelineHandle(0), draws: [{ instances: COUNT }], depth: { resource: texture(2), clear: 1 } }],
};
```

Five things in there are worth explaining, because each is a decision rather than a
convention.

**`authored: 'wgsl'`** is the discriminant. Which language was written is a fact, not
something to infer from which fields happen to be present, and it is what routes the graph
to a backend.

**Resources are addressed by handle, not by name.** `uniform(0)`, `vertices(1)`,
`texture(2)` mint kind-branded integers — the index of that resource in the list above.
Passing a texture handle where a buffer belongs is a compile error rather than a lookup
that returns `undefined` at draw time. The handle carries its kind, so the compiler refuses
the mistake before the driver can.

**`size: { scale: 1 }`** means *follow the frame*. It is a whole-size descriptor, so you can
also say `{ scale: 0.5 }` for half resolution or `{ width, height }` for a fixed size —
which the old per-axis pair could not express. What was in a frame-following texture is gone
when a resize rebuilds it, so nothing may read it across a resize.

**`use: ['attachment']`** is what the usage flags are built from. A texture a pass writes
and a later pass reads names both. A flag nothing asked for is a texture the driver refuses
the pipeline over, so the graph states its intent rather than guessing generously.

**`topology`** belongs to the geometry, not the pipeline: which vertices make one triangle
is a fact about the order the indices were written in, so the generator that wrote them is
what answers it.

## Filling in the text

The description above has `text: ''`. A graph names its documents; a loader fills them:

```js
const frame = frameOf('instanced-cubes', description, { [WGSL_DOCUMENT]: WGSL_SOURCE }, block, undefined, generated);
```

`documentNames(description)` tells you which texts are still wanted, and
`generatedResources(description)` which resources need bytes the build produced. That split
is deliberate: the build writes an address, the runtime fills in what came back from it.

## Asking before drawing

```js
import { cost, refusal } from '@altpsyche/engine';

cost(description, { width: 800, height: 600 });  // bytes, draws, passes — before a pixel
refusal(description, capabilities);              // what this device has not got, by name
```

The renderer runs its own `validate` over every graph it draws, and that one is **not**
exported: a graph that contradicts itself is refused there by name, and the check is not a
producer's to skip.

`cost` is how you find out a frame is too expensive without drawing it, and it is what the
package's own budget gates assert against. Every corpus preset asserts an exact cost, so a
change that quietly doubles a frame's memory shows up as a red gate naming the preset.

## Compute

A pass either draws or dispatches. A dispatch is a compute pass — a shader that writes into
a buffer or a texture rather than painting pixels — and `groups` says how many workgroups
run, either a triple or `{ indirect }` reading the count out of a buffer.

Compute is WebGPU only. WebGL 2 has no compute stage, because GLSL ES 3.0 has none, so a
graph with a compute pass is refused by name on that backend rather than half-drawn. See
[GUIDE-backends.md](GUIDE-backends.md).
