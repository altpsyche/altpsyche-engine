# @altpsyche/engine

A renderer for the web that draws through WebGPU where the browser has it and WebGL 2
where it does not, and an engine above that renderer for placing objects in a scene.

One import path reaches all of it:

```js
import { createSurface, wgslFrame, vec3, mat4 } from '@altpsyche/engine';
```

There is no second path. Everything public comes from the package name, so nothing
you import can move when the files inside are rearranged.

**[docs/EXAMPLES.md](docs/EXAMPLES.md) is a whole working page** — four files, nothing elided —
if you would rather start from something that runs than from a tour.

This is 0.x, and 0.x is unstable: names and shapes change between releases without a
major bump, and the [CHANGELOG](CHANGELOG.md) says what moved in each one. A caret
range on a `0.x` version tracks the last number alone, so `^0.3.0` will not pick up a
later `0.4.0` — you move to a feature release by asking for it.

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
backends would have to be in your first download, and the WebGPU one is over 1,600
lines that such a browser can never execute.

## What a frame is

You do not hand the renderer a shader and hope. You hand it a description of a frame,
which says what resources exist, what pipelines run and in what order the passes go.
The renderer reads that description and makes the calls.

For a single fragment shader drawing over the whole canvas, there is a shortcut:

```ts
import { createSurface, uniformBlockOf, wgslFrame } from '@altpsyche/engine';

// Two things the shortcut expects: the fragment entry is called `fragMain`, and
// the uniforms are one struct at group 0, binding 0.
const code = `
struct Uniforms {
  u_time: f32,
  u_resolution: vec2<f32>,
};
@group(0) @binding(0) var<uniform> uniforms: Uniforms;

@fragment
fn fragMain(@builtin(position) at: vec4<f32>) -> @location(0) vec4<f32> {
  let uv = at.xy / uniforms.u_resolution;
  return vec4<f32>(uv, 0.5 + 0.5 * sin(uniforms.u_time), 1.0);
}
`;

// `uniformBlockOf` reads the offsets out of the source, so the layout is never
// written down twice and never disagrees with the shader.
const frame = wgslFrame('my-shader', code, uniformBlockOf(code));

const surface = await createSurface(canvas, frame, {
  uniforms: (elapsedSeconds) => ({
    u_time: elapsedSeconds,
    u_resolution: [canvas.width, canvas.height],
  }),
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

`sceneView` is the tier above this one: a world and its cameras in, a `FrameGraph` out,
with each object's record packed into a storage buffer the shader indexes by instance.
[docs/API.md](docs/API.md#the-scene-tier) shows that call in full, and
`npm run example orbit-shadow` is a scene of fifty objects across two pipelines.

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
check a change to a shader did not quietly change what the device was asked to do —
[docs/API.md](docs/API.md#checking-what-your-shader-asked-the-card) shows the three in
use, and it is the same mechanism this package holds its own backends to.

## Asking before you draw

These are pure functions over data, so they answer in a test, in a worker, or on a
machine with no card at all. What they answer against is a **profile**: what each backend
turned out to offer on this machine.

```ts
import {
  cost, requestWebGPUDevice, resolve, webgl2Capabilities, webgpuCapabilities,
  type DeviceProfile,
} from '@altpsyche/engine';

// Ask for the card first, because whether asking returns one is the fact selection
// reads. Read the WebGL 2 half from a throwaway canvas: a canvas keeps the first
// context type it is asked for, so never spend the one you mean to draw into.
const device = await requestWebGPUDevice();
const gl = document.createElement('canvas').getContext('webgl2');

const profile: DeviceProfile = {
  webgpu: device ? webgpuCapabilities(device.features) : null,
  webgl2: gl ? webgl2Capabilities(gl.getSupportedExtensions() ?? []) : null,
};

// One reading: the backend that will draw this frame, or a refusal naming what is
// missing. `resolve` is selection first and the capability check second.
const selection = resolve(frame, profile);
if ('refusal' in selection) console.error(selection.refusal);
else console.log('drawing on', selection.backend);

// What it costs, before a pixel exists. `transientBytes` is what the frame's own
// scratch targets allocate at that size; uploads are the arena's to report.
const { passes, draws, transientBytes } = cost(frame, { width: 800, height: 600 });
```

`resolve` is the two halves in one call, and either half can be had on its own:
`selectBackend(frame, { webgpu, webgl2 })` reads two facts and nothing else — the language
the frame is authored in, and what the device offers — and `refusal(frame, { backend,
capabilities })` names what a device has not got. A GLSL-authored frame selects WebGL 2
**even where WebGPU exists**, because the language it is written in is the capability it
forfeits, and every capability it gives up is one GLSL ES 3.0 has no syntax for.

`refusal` answers from data rather than from a call that throws. A graph names the
capabilities it needs, a device reports the ones it has, and where a needed one is
missing the graph is refused *by that name* before anything reaches a driver.

`probe()` is a different thing and worth not confusing with these: it draws a frame and
returns a dated `DeviceReading` — what was reported, what came back, whether the device
survived being composited, what the adapter says it is. It is a diagnostic and a row for
[docs/DEVICES.md](docs/DEVICES.md), not the input to selection.

## Drawing a frame yourself

`createSurface` runs a loop. When you want one frame, on your own schedule, use
`submit`:

```ts
import { createFrameRenderer, requestWebGPUDevice, submit } from '@altpsyche/engine';

// A renderer draws through WebGL 2 unless it is handed a WebGPU device. Asking for
// the card is the caller's step: whether asking returns one is the fact selection
// reads, and a renderer that quietly asked would pull the WebGPU backend into the
// first download of a page that never needed it.
const device = await requestWebGPUDevice();
const renderer = await createFrameRenderer(canvas, device ? { backend: 'webgpu', device } : {});
if (!renderer) throw new Error('no backend would give this canvas a context');

// The uniforms are an argument, not an option.
submit(renderer, frame, { u_time: 0 });

// `{ into }` lands the frame in a texture you own as well as on the canvas — a
// capture target, or an XR layer the compositor consumes.
if (device) {
  const target = device.createTexture({
    size: [800, 600],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });
  submit(renderer, frame, { u_time: 0 }, { into: target });
}
```

`createSurface` takes those same two options. One warning, learnt the hard way in this
repository's own examples: **do not test for WebGL 2 by calling `getContext('webgl2')` on
the canvas you are about to draw into.** A canvas keeps the first context type it is asked
for and refuses every other one for the rest of its life, so that check makes the WebGPU
path fail on the machines that have WebGPU. Ask a throwaway canvas, as the block above does.

## What it needs

A browser with WebGL 2, which is everything current, and WebGPU where you want the WebGPU
path. **No runtime dependencies at all** — `dependencies` is `{}` and stays that way.

The two backends are not equal, and the difference lives in data rather than in prose. WebGL 2
draws the whole toy tier and the scene tier's per-instance records; it has no compute stage, no
shader-written storage buffer, no storage texture, no indirect draw and no timestamp or occlusion
query, because GLSL ES 3.0 has none of them. What it does draw, it draws as WebGPU does: on a
real card the two agree to within a single channel on every scene preset. Ask `probe` or
`webgl2Capabilities` rather than trusting this paragraph, and read
[docs/GUIDE-backends.md](docs/GUIDE-backends.md) for the detail.

## Where to read next

| document | what it answers |
| --- | --- |
| [docs/EXAMPLES.md](docs/EXAMPLES.md) | a complete page, start to finish, and the six that run in this repository |
| [docs/API.md](docs/API.md) | every name the package exports, grouped by what you are doing |
| [docs/GUIDE-frame-graph.md](docs/GUIDE-frame-graph.md) | authoring a frame graph by hand |
| [docs/GUIDE-backends.md](docs/GUIDE-backends.md) | capabilities, selection, refusal, and what each backend reaches |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | how the library is put together, and why |
| [CHANGELOG.md](CHANGELOG.md) | what moved in each release |

For someone changing the package rather than using it:
[CONTRIBUTING.md](CONTRIBUTING.md) has the gates and the rules that are not negotiable, and
[docs/DEVICES.md](docs/DEVICES.md) is the hardware log — dated readings from real machines, kept
so that a claim about a graphics card has a source.

## Licence

MIT.
