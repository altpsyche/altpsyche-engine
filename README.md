# @altpsyche/engine

A renderer for the web that draws through WebGPU where the browser has it and WebGL 2
where it does not, and an engine above that renderer for placing objects in a scene.

One import path reaches all of it:

```js
import { createSurface, wgslFrame, vec3, mat4 } from '@altpsyche/engine';
```

There is no second path. Everything public comes from the package name, so nothing
you import can move when the files inside are rearranged.

This is 0.x, and 0.x is unstable: names and shapes change between releases without a
major bump. §14 of [docs/RoadToPureEngine.md](docs/RoadToPureEngine.md) is the shape
the surface is moving toward, and where today's names differ from it, today's names
are the ones that move.

## The one thing that will surprise you

`createFrameRenderer` is asynchronous, and so is `createSurface`, which is built on
it. You have to await them:

```js
const surface = await createSurface(canvas, frame, options);
```

The reason is worth knowing, because it is the whole point. The two backends are
loaded with a dynamic import, which means your bundler puts each one in a file of its
own and the browser downloads only the one it can actually run. A browser with no
WebGPU never fetches the WebGPU backend at all. If the factory were synchronous, both
backends would have to be in your first download, and the WebGPU one is about 1,700
lines that such a browser can never execute.

## What a frame is

You do not hand the renderer a shader and hope. You hand it a description of a frame,
which says what resources exist, what pipelines run and in what order the passes go.
The renderer reads that description and makes the calls.

For a single fragment shader drawing over the whole canvas, there is a shortcut:

```js
import { wgslFrame, createSurface } from '@altpsyche/engine';

const code = `
@fragment
fn fragMain(@builtin(position) at: vec4<f32>) -> @location(0) vec4<f32> {
  return vec4<f32>(at.x / 800.0, at.y / 600.0, 1.0, 1.0);
}
`;

const frame = wgslFrame(
  'my-shader',
  code,
  [{ name: 'u_time', offset: 0, size: 4 }],
  [{ name: 'u_time', type: 'float' }]
);

const surface = await createSurface(canvas, frame, {
  uniforms: () => ({ u_time: performance.now() / 1000 }),
});
```

`glslFrame` is the same shortcut for a GLSL pair, which is a vertex document and a
fragment document together, because WebGL 2 needs both.

`wgslDescription` and `glslDescription` build that same one-pass shape from source alone,
when you want the description rather than a finished frame.

For anything with real geometry, more than one pass, or a depth buffer, you author the
graph directly — resources, pipelines and passes, with every resource addressed by a
kind-branded handle rather than by a string. A pass either draws or dispatches: a dispatch
is a compute pass, which is a shader that writes into a buffer or a texture rather than
painting pixels. [docs/GUIDE-frame-graph.md](docs/GUIDE-frame-graph.md) walks through a
real one.

## The maths

Three families, each named for what it operates on:

```js
import { vec3, mat4, mat3 } from '@altpsyche/engine';

const eye = vec3(0, 2, 5);
const view = mat4.lookAt(eye, vec3(0, 0, 0), vec3(0, 1, 0));
const projection = mat4.perspective(Math.PI / 4, 16 / 9, 0.1, 100);
const packed = mat4.pack(mat4.multiply(projection, view));
```

`vec3` both builds a vector and carries the operations on vectors, so `vec3(1, 2, 3)`
and `vec3.add(a, b)` are both there. The length of a vector is `vec3.magnitude`, not
`vec3.length`, because a function's `length` in JavaScript is how many arguments it
takes and that property cannot be replaced.

Matrices are column major and depth runs from zero to one, which is what WebGPU
expects. `mat4.pack` turns a matrix into the `Float32Array` a uniform buffer wants.

## A scene

Above the renderer there is a small model for placing things. An entity has a
transform and may name a parent, so moving a parent moves its children:

```js
import { vec3, mat4, worldMatrix, drawList, batchOnePipeline } from '@altpsyche/engine';

const scene = {
  entities: [
    { id: 'ground', transform: { position: vec3(0, 0, 0), rotation: mat4.IDENTITY, scale: vec3(10, 1, 10) } },
    {
      id: 'box',
      parent: 'ground',
      transform: { position: vec3(0, 1, 0), rotation: mat4.rotationY(0.4), scale: vec3(1, 1, 1) },
      material: 'red',
    },
  ],
  camera: {
    eye: vec3(0, 4, 8),
    target: vec3(0, 0, 0),
    up: vec3(0, 1, 0),
    fovY: Math.PI / 4,
    aspect: 16 / 9,
    near: 0.1,
    far: 100,
  },
};

const draws = drawList(scene);
```

A rotation is a `Mat4` rather than three angles. Euler angles disagree between
codebases about which order the three turns are applied in, and the disagreement is
silent, so the library never guesses: you compose the rotation you meant.

`batchOnePipeline` turns a scene into one pipeline's worth of draws, with each
object's material values beside it. It is called that because it refuses a scene whose
objects do not all share a pipeline. Grouping across pipelines decides which pipeline
runs first, and that is a scheduling choice you make with knowledge the library does
not have, so a scene on two pipelines is two calls and you put them in the order you
want.

## Testing what your shader asks the card

The recording double is part of the package. `wrapDevice` wraps a real device and
records every call made on it, `projectTrace` reduces a recording to the calls worth
comparing, and `compareTraces` reports where two recordings differ. That is how you
check a change to a shader did not quietly change what the device was asked to do.

## Asking before you draw

Three pure functions answer questions about a graph without touching a device, so you
can ask them in a test, in a worker, or on a machine with no card at all:

```js
import { cost, refusal, selectBackend, probe } from '@altpsyche/engine';

const reading = await probe();                    // what this browser actually offers
const which = selectBackend(frame, reading.offer); // which backend will draw it, or why not
const no = refusal(frame, reading.capabilities);   // what the frame needs and the device lacks
const size = cost(frame, { width: 800, height: 600 }); // bytes, draws, passes before a pixel
```

`selectBackend` reads two facts and nothing else: the language the frame is authored in
and what the device offers. A GLSL-authored frame selects WebGL 2 **even where WebGPU
exists**, because the language it is written in is the capability it forfeits, and every
capability it gives up is one GLSL ES 3.0 has no syntax for.

`refusal` answers from data rather than from a call that throws. A graph names the
capabilities it needs, a device reports the ones it has, and where a needed one is
missing the graph is refused *by that name* before anything reaches a driver.

## Drawing a frame yourself

`createSurface` runs a loop. When you want one frame, on your own schedule, use
`submit`:

```js
import { createFrameRenderer, submit } from '@altpsyche/engine';

const renderer = await createFrameRenderer(canvas);
await submit(renderer, frame, { uniforms: { u_time: 0 }, into: myTexture });
```

`into` is where the frame lands, and it is the caller's to choose rather than the
library's.

## What it needs

A browser with WebGL 2, which is everything current, and WebGPU where you want the
WebGPU path. It has no runtime dependencies at all — `dependencies` is `{}` and stays
that way.

**The two backends are not equal, and the difference is in the data rather than in the
prose.** WebGL 2 draws several passes, several colour attachments, depth and stencil,
vertex geometry, resident textures, a mip ladder, multisampling, per-draw uniform
slices, and a scene's read-only per-instance records as a uniform block. It has no
compute stage, no read-write storage buffer, no storage texture, no indirect draw and
no timestamp or occlusion query, because GLSL ES 3.0 has none of them. Ask
`webgl2Capabilities` or `probe` rather than trusting this paragraph — the capability
set is the authority and this sentence is a summary of it.

[docs/GUIDE-backends.md](docs/GUIDE-backends.md) has the measured picture, preset by
preset, including what the corpus draws on each backend today and what it skips.

## Where to read next

| document | what it answers |
| --- | --- |
| [docs/API.md](docs/API.md) | every name the package exports, grouped by what you are doing |
| [docs/GUIDE-frame-graph.md](docs/GUIDE-frame-graph.md) | authoring a frame graph by hand |
| [docs/GUIDE-backends.md](docs/GUIDE-backends.md) | capabilities, selection, refusal, and what each backend measured |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | how the library is put together, as built |
| [docs/RoadToPureEngine.md](docs/RoadToPureEngine.md) | where the shape is going, and the decisions behind it |

## Licence

MIT.
