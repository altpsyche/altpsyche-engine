# Authoring a frame graph

You do not hand this library a shader and hope. You hand it a **frame graph**: a plain
value saying what resources exist, what pipelines run, and in what order the passes go.
The renderer reads it and makes the calls.

That indirection buys three things. The graph is serialisable, so it can be built in a
worker and sent. It is comparable, so two frames can be diffed. And it can be *asked
questions* — `cost`, `refusal`, `selectBackend` all read it without touching a device.

## The shortcut, for one fragment shader over the canvas

```ts
import { createSurface, glslFrame } from '@altpsyche/engine';

const VERTEX = `#version 300 es
in vec3 position;
void main() { gl_Position = vec4(position, 1.0); }`;

const FRAGMENT = `#version 300 es
precision highp float;
uniform float uTime;
uniform vec3 iResolution;
out vec4 fragColour;
void main() {
  fragColour = vec4(gl_FragCoord.xy / iResolution.xy, 0.5 + 0.5 * sin(uTime), 1.0);
}`;

const frame = glslFrame('fullscreen', VERTEX, FRAGMENT);

const surface = await createSurface(canvas, frame, {
  uniforms: (elapsedSeconds) => ({
    uTime: elapsedSeconds,
    iResolution: [canvas.width, canvas.height, 1],
  }),
  onError: (message) => console.error(message),
});

if (surface) surface.start();
```

`wgslFrame` is the same for WGSL. Both build a one-pass graph whose vertex half is the
backend's own three corners, so there is no geometry to supply.

`createSurface` returns `null` where no backend would give the page a context, so a real page
checks before it starts — [EXAMPLES.md](EXAMPLES.md) is the complete version of this one.

Note what the `uniforms` callback does **not** have to do: the resolution is read off the
drawing buffer the surface sizes, so a resize needs no code of yours.

## The long form

For anything with real geometry, more than one pass, or a depth buffer, you author the
graph directly. This is `examples/instanced-cubes`, trimmed:

```ts
import { pipelineHandle, texture, uniform, vertices, WGSL_DOCUMENT } from '@altpsyche/engine';
import type { FrameGraph } from '@altpsyche/engine';

/** Position (three floats) then normal (three floats): twenty-four bytes a vertex. */
const VERTEX_STRIDE = 24;
const VERTICES = new Uint8Array(VERTEX_STRIDE * 36); // the cube's bytes, from wherever you make them
const COUNT = 1000;

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
      // The source is the *text* pair, empty until a loader fills it. Which document
      // and entry point each stage runs is a sibling field, not part of the source.
      source: { wgsl: { vertex: '', fragment: '' } },
      vertex: { document: WGSL_DOCUMENT, entry: 'cube' },
      fragment: { document: WGSL_DOCUMENT, entry: 'shade' },
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
`texture(2)` mint kind-branded integers — the index of that resource in the list above. The
handle carries its kind, so passing a texture where a buffer belongs is a compile error rather
than a lookup returning `undefined` at draw time
([why, in full](ARCHITECTURE.md#handles-not-names)).

**`size: { scale: 1 }`** means *follow the frame*. It is a whole-size descriptor, so
`{ scale: 0.5 }` is half resolution and `{ width, height }` is a fixed size. What was in a
frame-following texture is gone when a resize rebuilds it, so nothing may read it across a
resize.

**`use: ['attachment']`** is what the usage flags are built from. A texture a pass writes
and a later pass reads names both. A flag nothing asked for is a texture the driver refuses
the pipeline over, so the graph states its intent rather than guessing generously.

**`topology`** belongs to the geometry, not the pipeline: which vertices make one triangle
is a fact about the order the indices were written in, so the generator that wrote them is
what answers it.

## Filling in the text

The description above has `text: ''`. A graph names its documents; a loader fills them:

```ts
// continues the block above
import { frameOf, uniformBlockOf } from '@altpsyche/engine';

const WGSL_SOURCE = '…the WGSL your build fetched or bundled…';

const frame = frameOf(
  'instanced-cubes',
  description,                              // the graph above
  { [WGSL_DOCUMENT]: WGSL_SOURCE },         // the document texts it named
  uniformBlockOf(WGSL_SOURCE),              // the uniform block the source implies
  undefined,                                // pipeline constants, where a source takes them
  new Map([[1, VERTICES]])                  // bytes for resource 1, the vertex buffer
);
```

`documentNames(description)` tells you which texts are still wanted, and
`generatedResources(description)` which resources need bytes the build produced. That split
is deliberate: the build writes an address, the runtime fills in what came back from it.

## Asking before drawing

```ts
import { cost, refusal, webgl2Capabilities } from '@altpsyche/engine';

cost(frame, { width: 800, height: 600 }); // passes, draws, transientBytes, and more

// What a device has not got, by name. The second argument is which backend it is and
// which capabilities it has — data, so this answers with no device present.
const gl = document.createElement('canvas').getContext('webgl2');
const no = refusal(frame, {
  backend: 'webgl2',
  capabilities: webgl2Capabilities(gl?.getSupportedExtensions() ?? []),
});
if (no) console.error(no);
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

`npm run example compute-field` is that whole story as a page: it draws where WebGPU is and
prints the refusal, naming `compute` and `storage-texture`, where it is not.
[EXAMPLES.md](EXAMPLES.md) has the rest of them, and [API.md](API.md) is the index of every
name used above.
