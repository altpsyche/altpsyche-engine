# @altpsyche/engine

A renderer for WebGPU and WebGL 2, with a small scene layer above it. One import path, no
runtime dependencies.

You describe a frame as data: which resources exist, which pipelines run, what order the
passes go in. Hand that to the renderer and it picks a backend and makes the calls. Because
the frame is data, you can also ask what it will cost and whether this device can draw it,
before anything reaches a driver.

[![npm](https://img.shields.io/npm/v/@altpsyche/engine)](https://www.npmjs.com/package/@altpsyche/engine)
[![gates](https://github.com/altpsyche/altpsyche-engine/actions/workflows/gates.yml/badge.svg)](https://github.com/altpsyche/altpsyche-engine/actions/workflows/gates.yml)
![dependencies: none](https://img.shields.io/badge/dependencies-none-brightgreen)
![types: included](https://img.shields.io/badge/types-included-blue)

```bash
npm install @altpsyche/engine
```

## Draw something

This is a whole page. Paste it into a project with a bundler in front of it and it runs.

```ts
import { createSurface, glslFrame } from '@altpsyche/engine';

const canvas = document.createElement('canvas');
canvas.style.cssText = 'display:block;width:100vw;height:100vh';
document.body.append(canvas);

// The backend supplies the three corners of a fullscreen triangle, so the vertex
// shader passes its position through. `position` is the attribute name it fills.
const VERTEX = `#version 300 es
in vec3 position;
void main() { gl_Position = vec4(position, 1.0); }`;

const FRAGMENT = `#version 300 es
precision highp float;
uniform float uTime;
uniform vec3 iResolution;
out vec4 fragColour;
void main() {
  vec2 uv = gl_FragCoord.xy / iResolution.xy;
  fragColour = vec4(0.5 + 0.5 * cos(uTime + uv.xyx * 6.283185 + vec3(0, 2, 4)), 1.0);
}`;

// One frame: one pass, one pipeline, drawn over the canvas.
const frame = glslFrame('first-frame', VERTEX, FRAGMENT);

// Both factories return promises, because the backend behind them is a dynamic import.
const surface = await createSurface(canvas, frame, {
  uniforms: (seconds) => ({ uTime: seconds, iResolution: [canvas.width, canvas.height, 1] }),
  onError: (message) => console.error(message),
});

if (!surface) throw new Error('no backend would give this canvas a context');

const fit = () => surface.resize(canvas.clientWidth, canvas.clientHeight);
addEventListener('resize', fit);
fit();
surface.start();
```

The window fills with a gradient that moves, and it follows a resize. `wgslFrame` is the
same call for WGSL, though a fullscreen WGSL frame draws on WebGPU only, since there is no
vertex document for WebGL 2 to link. [docs/EXAMPLES.md](docs/EXAMPLES.md) breaks this page
into the four files it really is, and lists six longer ones that run in this repository.

## How it works

**The frame is data.** A frame graph is a plain object: resources, pipelines, passes. It
serialises, so a worker can build one and post it. Two of them can be compared.
`cost(graph, size)` gives you passes, draws, dispatches and transient bytes with no device
present.

**Capabilities are data too.** A graph lists what it needs, a device reports what it has,
and `refusal` compares the two and gives you the name of what is missing, or `null`.
Neither backend owns a method the other has to throw from, so a graph WebGL 2 cannot draw
is refused before a driver sees it.

**You do not name a backend.** `selectBackend` reads two facts and answers with one: the
language the frame is authored in, and what the device offers. Where both backends can draw
a frame they draw the same picture. On an RTX 5080 they agree to within a single channel on
every scene preset in this repository's corpus.

**A browser downloads one backend.** Each sits behind `await import()`, so a bundler gives
each its own file and a browser without WebGPU never downloads the WebGPU one. `npm test`
bundles the entry point and fails if either backend turns up in the first download.

## What a page downloads

From the chunk gate, `gates/chunk.mjs`, minified with splitting on, measured on the commit
you are reading:

| chunk | raw | gzipped | downloaded |
| --- | --- | --- | --- |
| the entry point and your own calls | 3.7 kB | **1.8 kB** | always |
| the WebGL 2 backend | 21.6 kB | **7.1 kB** | where it draws |
| the WebGPU backend | 25.4 kB | **8.9 kB** | where it draws |
| four shared chunks | 15.0 kB | 5.9 kB | as a graph needs them |

A browser with no WebGPU downloads the first row, the second, and whichever shared chunks
its graph reaches. That is about 15 kB gzipped at most, and never the WebGPU backend. No
page downloads a WGSL translator either, because translation happens in the build.

## Five things to know before you start

1. **Both factories are asynchronous.** The backend behind them is a dynamic import, so
   `createSurface` and `createFrameRenderer` return promises.
2. **A renderer uses WebGL 2 unless you give it a WebGPU device.** You call
   `requestWebGPUDevice()` and pass `{ backend: 'webgpu', device }`, so a page that never
   wants WebGPU never downloads that backend.
3. **Do not call `getContext('webgl2')` on the canvas you are going to draw into.** A canvas
   keeps the first context type it is given and refuses every other one for as long as it
   lives, so that call as a capability check breaks WebGPU on the machines that have it. Ask
   a throwaway canvas instead.
4. **A GLSL frame goes to WebGL 2 even where WebGPU exists.** GLSL ES 3.0 has no syntax for
   the capabilities WebGPU adds, so the language you wrote in settles which backend draws.
5. **`wgslFrame` expects two conventions of its source:** the fragment entry point is called
   `fragMain`, and the uniforms are one struct at group 0, binding 0. `uniformBlockOf(code)`
   reads the offsets off the source, so you never write the layout down twice.

## Past a fullscreen shader

Real geometry, several passes, a depth buffer or a compute stage mean writing the graph
yourself: resources, pipelines and passes, with every resource addressed by a kind-branded
handle like `uniform(0)` or `texture(2)`, never by a string. Hand a texture handle to
something expecting a buffer and it is a compile error, not an `undefined` at draw time.
[docs/GUIDE-frame-graph.md](docs/GUIDE-frame-graph.md) builds one line by line.

There is a scene layer above the renderer: entities carry a transform and may name a
parent, and `sceneView` turns a world and its cameras into a frame graph, packing each
object's record into a storage buffer the shader indexes by instance. A rotation is a
`Mat4` and never three angles, because Euler orders disagree between codebases and nothing
tells you when they do. The maths is `vec3`, `mat3` and `mat4`, column major, depth from
zero to one. A vector's length is `vec3.magnitude`, since a function's own `length` in
JavaScript cannot be replaced. Every signature is in [docs/API.md](docs/API.md).

## Ask before you draw

```ts
import {
  cost, requestWebGPUDevice, resolve, webgl2Capabilities, webgpuCapabilities,
  type DeviceProfile,
} from '@altpsyche/engine';

// Ask for the device first: whether asking returns one is the fact selection reads.
const device = await requestWebGPUDevice();
const gl = document.createElement('canvas').getContext('webgl2'); // a throwaway canvas

const profile: DeviceProfile = {
  webgpu: device ? webgpuCapabilities(device.features) : null,
  webgl2: gl ? webgl2Capabilities(gl.getSupportedExtensions() ?? []) : null,
};

// One reading: the backend that will draw this frame, or a refusal saying what is missing.
const selection = resolve(frame, profile);
if ('refusal' in selection) console.error(selection.refusal);
else console.log('drawing on', selection.backend);

// What it costs, before a pixel exists.
const { passes, draws, transientBytes } = cost(frame, { width: 800, height: 600 });
```

`resolve` does selection and the capability check in one call. `selectBackend` and
`refusal` are the two halves on their own. All three are pure functions over data, so they
answer in a test or in a worker, on a machine with no graphics card in it.

`probe()` is a different thing, easy to mistake for these. It draws a frame and returns a
dated `DeviceReading`: what the browser reported, what came back when asked, whether the
device survived being composited. It is a diagnostic, and a row for
[docs/DEVICES.md](docs/DEVICES.md). Selection reads a `DeviceProfile`, not a reading.

## Drawing one frame, on your own schedule

```ts
import { createFrameRenderer, requestWebGPUDevice, submit } from '@altpsyche/engine';

const device = await requestWebGPUDevice();
const renderer = await createFrameRenderer(canvas, device ? { backend: 'webgpu', device } : {});
if (!renderer) throw new Error('no backend would give this canvas a context');

submit(renderer, frame, { u_time: 0 });          // uniforms are an argument, not an option
```

A fourth argument, `{ into }`, lands the frame in a texture you own as well as on the
canvas: a capture target, or an XR layer the compositor reads. Where a frame lands is yours
to decide.

## Checking what your shader asked the device

The recording double is part of the package. `wrapDevice` wraps a real device and records
every call made on it, `projectTrace` cuts a recording down to the calls worth comparing,
and `compareTraces` says where two recordings differ. So you can show that editing a shader
did not quietly change what the device was asked to do. The package uses the same three
calls on its own two backends, and
[docs/API.md](docs/API.md#checking-what-your-shader-asked-the-device) shows them in use.

## What it needs

Any browser with WebGL 2, which is every current one, and WebGPU where you want that
backend. TypeScript declarations ship with the package, so there is no `@types` install.

The two backends are not equal, and the difference is in the capability data. WebGL 2 draws
the whole toy tier and the scene tier's per-instance records. It has no compute stage, no
shader-written storage buffer, no storage texture, no indirect draw, no timestamp query and
no occlusion query, because GLSL ES 3.0 has none of them. Ask `probe` or
`webgl2Capabilities` instead of trusting this paragraph;
[docs/GUIDE-backends.md](docs/GUIDE-backends.md) has the rest.

## Status

**0.x, and 0.x is unstable.** Names and shapes change between releases without a major
bump, and the [CHANGELOG](CHANGELOG.md) says what moved in each one. A caret range on a
`0.x` version tracks the last number alone, so `^0.3.0` will not pick up a later `0.4.0`.
You move to a feature release by asking for it.

## Where to read next

| document | what it answers |
| --- | --- |
| [docs/EXAMPLES.md](docs/EXAMPLES.md) | a complete page as four files, and the six that run in this repository |
| [docs/API.md](docs/API.md) | every exported name with the signature the compiler gives it |
| [docs/GUIDE-frame-graph.md](docs/GUIDE-frame-graph.md) | writing a frame graph by hand |
| [docs/GUIDE-backends.md](docs/GUIDE-backends.md) | capabilities, selection, refusal, and what each backend reaches |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | how the library is put together, and why |
| [CHANGELOG.md](CHANGELOG.md) | what moved in each release |

If you are changing the package instead of using it,
[CONTRIBUTING.md](CONTRIBUTING.md) has the gates and the rules that are not negotiable, and
[docs/DEVICES.md](docs/DEVICES.md) is the hardware log: dated readings from real machines,
kept so a claim about a graphics card has a source.

## Licence

MIT.
