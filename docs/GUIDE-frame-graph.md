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

**`draws: [{ instances: COUNT }]`, not `{ vertices }`, because the pipeline names `geometry`.**
The two forms are not interchangeable and the pipeline decides which one a pass may use. A
pipeline reading a vertex buffer is drawn by instances — the count of vertices is the
resource's, and repeating it in the draw is a number that could disagree with the buffer. A
pipeline reading none is drawn by `{ vertices }`, which is the backend's own corners. Pair them
the other way and the frame is refused by name before any backend is built: `{ vertices }` on
this pipeline would never bind the buffer, and `{ instances }` on a fullscreen one has no count
of vertices from anywhere. [API.md](API.md) has the table.

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

## Declaring a frame instead of building one

The graph above is written by hand, and two things about that are worth noticing. Every handle
is an index into a list you are also writing, so `texture(2)` means "the third resource" and
stays correct only as long as nobody inserts one above it. And every binding number is written
twice — once in your WGSL, once in `bindings` — with nothing checking that the two agree.

`declaredFrame` reads the source instead. You declare the handful of things a WGSL file cannot
say about itself — how big each resource is, how much of a pipeline to run, which resource is
the picture — and it works out the rest from the file: every compute entry point, storage
texture, storage buffer, uniform block, sampler and vertex input, and which stage each entry
point is at.

Here is a frame of two passes. A compute pass grows a field out of the field it left last
frame, and a render pass draws what that pass left behind:

```ts
import { declaredFrame, groupsToCover } from '@altpsyche/engine';
import type { DeclaredFrame } from '@altpsyche/engine';

const CODE = `
struct Uniforms { u_time: f32, u_resolution: vec2<f32> }
@group(0) @binding(0) var<uniform> uniforms: Uniforms;

@group(0) @binding(1) var previous: texture_2d<f32>;
@group(0) @binding(2) var next: texture_storage_2d<rgba16float, write>;
@group(0) @binding(3) var fieldSampler: sampler;

@compute @workgroup_size(8, 8)
fn step(@builtin(global_invocation_id) cell: vec3<u32>) {
  let size = vec2<i32>(textureDimensions(next));
  let at = vec2<i32>(i32(cell.x), i32(cell.y));
  if (at.x >= size.x || at.y >= size.y) { return; }
  let was = textureLoad(previous, at, 0).rg;
  textureStore(next, at, vec4<f32>(was.r, was.g + uniforms.u_time * 0.0, 0.0, 1.0));
}

@fragment
fn shade(@builtin(position) pixel: vec4<f32>) -> @location(0) vec4<f32> {
  let at = pixel.xy / uniforms.u_resolution;
  const level = textureSample(previous, fieldSampler, at).g;
  return vec4<f32>(level, level * 0.5, 1.0 - level, 1.0);
}
`;

const GRID = { width: 256, height: 256 };

const declared: DeclaredFrame = {
  pairs: [{ read: 'previous', write: 'next', size: GRID }],
  samplers: [{ name: 'fieldSampler', filter: 'linear', wrap: 'clamp' }],
  passes: [
    { pipeline: 'step', groups: groupsToCover(GRID, [8, 8, 1]) },
    { pipeline: 'shade' },
  ],
};

const declaredDescription = declaredFrame('field', CODE, declared);
```

That builds the same `FrameGraph` the long form does — four resources, a compute pipeline and a
render one, two passes — and everything downstream reads it identically. It is an authoring
path, not a second kind of graph.

**No handles and no binding numbers appear above.** Resources are named by the name the source
binds them under, and `declaredFrame` allocates the handles and reads the group and binding of
each one off the file. There is no index to keep in step and no number written twice.

**`pairs` is one declaration for two textures**, which is what a field growing out of its own
last state needs: a shader cannot read the texture it is writing. The source samples `previous`
and stores into `next`, and the backend hands it a different one of the two each frame. Both
halves are the same size and the same format and are used both ways, so declaring it twice
would be saying it twice.

**`groupsToCover` is the dispatch count**, the size being covered divided by the
`@workgroup_size` the entry point declares, rounded up. It is the one number in a frame that is
neither in the source nor a free choice, and getting it wrong leaves the edge of a picture
unwritten with nothing to say so. Note it covers the grid — 256 by 256 — and not the frame,
because that is the texture this pass writes.

**Which kind of work a pass is comes off the source.** `step` is declared `@compute` and
`shade` is declared `@fragment`, so the first pass is a dispatch and the second is a draw, and
neither says so in the declaration. A pass that names a group count for a fragment entry point
is refused for that reason rather than drawn as something else.

**Every disagreement stops the build with a sentence naming it**, which is the point of
declaring rather than constructing. Each one is otherwise silent on the card:

```ts
// continues the block above
try {
  declaredFrame('field', CODE, { ...declared, passes: [{ pipeline: 'absent' }] });
} catch (error) {
  // the frame for "field" runs "absent" and its source declares no such entry
  console.log((error as Error).message);
}
```

A dispatch of an entry point the file does not declare is a pipeline the driver refuses after
the fact. A texture nothing binds is a picture that stays whatever the memory held. A `present`
naming nothing copies out the wrong texture. None of those show up as an error at the point you
made the mistake; all of them show up here.

**A sampled texture and a pre-filled buffer name their own bytes.** A texture the source samples
declares `sampled: { format, source }` and a buffer filled before the frame runs declares
`source` — a format and an address you supply, not the name of a generator this package holds.
Generated geometry is the exception and names a `GeometryPrimitive`, because
`GEOMETRY_PRIMITIVE` is on the door: a generator you can already reach is one a declaration may
name. [API.md](API.md) lists the fields.

## Clipping a pass to a rectangle

A pass may name the rectangle it is allowed to write into, which is `RenderPassSpec.scissor` on a
graph you build and `scissor` on a pass you declare. It is in pixels from the **top-left** of the
attachment, which is WebGPU's origin; the WebGL 2 backend flips to that API's bottom-left one for
you, so you write it once and both backends draw the same picture.

```ts
import { pipelineHandle, texture } from '@altpsyche/engine';
import type { RenderPassSpec } from '@altpsyche/engine';

const clipped: RenderPassSpec = {
  pipeline: pipelineHandle(1),
  draws: [{ instances: 1 }],
  colour: [{ resource: texture(0) }],
  scissor: { x: 96, y: 120, width: 360, height: 210 },
};
```

**It clips, it does not transform, and it does not make the pass cheaper.** A fragment outside the
rectangle is discarded after it is shaded, which is both backends' specified behaviour, so
`@builtin(position)` is whatever it would have been and the shading is paid for either way. `cost`
reports the same figures for a scissored pass as for an unscissored one, on purpose. A caller
looking to pay less draws less.

**Two passes over one attachment with different scissors are two passes.** This package merges
consecutive passes over the same attachments into one `beginRenderPass` where it can prove that is
safe, and a merged group replays its members as bundles, which cannot carry a scissor. So a pass
naming one is never merged — the same reason a pass carrying a stencil reference or an occlusion
query is not.

**Whole numbers, a corner inside the attachment, and an extent above zero**, or the frame is
refused by name before a backend is built. Zero is refused rather than read as "draw nothing",
because a pass that may write nothing is a pass you leave out, and an accidental zero is otherwise
a frame that draws nothing and reports nothing.
