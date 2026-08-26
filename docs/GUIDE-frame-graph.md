# Authoring a frame graph

A **frame graph** is a plain object saying what resources exist, what pipelines run, and in
what order the passes go. You hand one to the renderer and it makes the calls.

Being an object is the point. A graph serialises, so a worker can build one and post it. Two
graphs can be compared. And `cost`, `refusal` and `selectBackend` all read a graph without
touching a device, which is why you can ask what a frame needs before you have one.

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

`wgslFrame` is the same call for WGSL. Both build a one-pass graph whose vertex stage is
the backend's own three corners, so you supply no geometry.

`createSurface` returns `null` where no backend would give the page a context, so a real page
checks before it starts. [EXAMPLES.md](EXAMPLES.md) is the complete version of this page.

The `uniforms` callback does not have to work out the resolution. That comes off the drawing
buffer the surface sizes, so a resize needs no code of yours.

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

Five fields in there are decisions, so they are worth explaining.

**`authored: 'wgsl'`** is the discriminant. Which language a graph was written in is a fact,
and it is what sends the graph to a backend. Nothing infers it from which other fields happen
to be filled in.

**Resources are addressed by handle, not by name.** `uniform(0)`, `vertices(1)` and
`texture(2)` mint kind-branded integers, the index of that resource in the list above. A
handle carries its kind, so passing a texture where a buffer belongs is a compile error
instead of a lookup that returns `undefined` at draw time.
[ARCHITECTURE.md](ARCHITECTURE.md#handles-not-names) has the reasoning.

**`size: { scale: 1 }`** means follow the frame. It is a whole-size descriptor, so
`{ scale: 0.5 }` is half resolution and `{ width, height }` is a fixed size. A resize
rebuilds a frame-following texture and its old contents are gone, so nothing may read one
across a resize.

**`use: ['attachment']`** is what the usage flags are built from. A texture that one pass
writes and a later pass reads names both. Drivers refuse a pipeline over a flag nothing asked
for, so a graph states what it intends to do with a texture and no more.

**`topology`** belongs to the geometry, not the pipeline. Which vertices make one triangle
depends on the order the indices were written in, so the generator that wrote them is what
answers for it.

## Filling in the text

The graph above has empty source text. A graph names its documents and a loader fills them
in:

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

`documentNames(description)` tells you which texts are still missing, and
`generatedResources(description)` which resources still need bytes from the build. The split
is deliberate. The build writes down an address; the runtime fills in whatever came back.

## Asking before drawing

```ts
import { cost, refusal, webgl2Capabilities } from '@altpsyche/engine';

cost(frame, { width: 800, height: 600 }); // passes, draws, transientBytes, and more

// What a device has not got, by name. The second argument says which backend it is and
// which capabilities it has. Both are data, so this answers with no device present.
const gl = document.createElement('canvas').getContext('webgl2');
const no = refusal(frame, {
  backend: 'webgl2',
  capabilities: webgl2Capabilities(gl?.getSupportedExtensions() ?? []),
});
if (no) console.error(no);
```

The renderer runs its own `validate` over every graph it draws, and that one is **not**
exported. A graph that contradicts itself is refused there, by name, and no producer can skip
the check.

`cost` is how you find out a frame is too expensive without drawing it. The package's own
budget gates use it: every corpus preset asserts an exact cost, so a change that doubles a
frame's memory shows up as a failing gate that names the preset.

## Compute

A pass either draws or dispatches. A dispatch is a compute pass, a shader that writes into
a buffer or a texture instead of painting pixels, and `groups` says how many workgroups run.
That is either a triple of numbers or `{ indirect }`, which reads the count out of a buffer.

Compute is WebGPU only. GLSL ES 3.0 has no compute stage, so WebGL 2 has none either, and a
graph with a compute pass is refused by name on that backend. See
[GUIDE-backends.md](GUIDE-backends.md).

`npm run example compute-field` is the whole of this as a page. It draws where WebGPU is
there and prints the refusal, naming `compute` and `storage-texture`, where it is not.
[EXAMPLES.md](EXAMPLES.md) has the other five, and [API.md](API.md) lists every name used
above.
