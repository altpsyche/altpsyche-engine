# @altpsyche/engine

**A WebGPU and WebGL 2 renderer, and the engine above it, from one import path.**

A frame is a plain value you can question before you draw it, a device that cannot draw it
refuses *by name* rather than throwing halfway through, and a browser downloads only the
backend it can run. No runtime dependencies, ever.

[![npm](https://img.shields.io/npm/v/@altpsyche/engine)](https://www.npmjs.com/package/@altpsyche/engine)
[![gates](https://github.com/altpsyche/altpsyche-engine/actions/workflows/gates.yml/badge.svg)](https://github.com/altpsyche/altpsyche-engine/actions/workflows/gates.yml)
![dependencies: none](https://img.shields.io/badge/dependencies-none-brightgreen)
![types: included](https://img.shields.io/badge/types-included-blue)

```bash
npm install @altpsyche/engine
```

## Draw something

Complete. Paste it into a page, point a bundler at it, and it runs — no configuration, no
setup call, no renderer to construct.

```ts
import { createSurface, glslFrame } from '@altpsyche/engine';

const canvas = document.createElement('canvas');
canvas.style.cssText = 'display:block;width:100vw;height:100vh';
document.body.append(canvas);

// The backend fills a fullscreen triangle's three corners, so the vertex half only
// forwards the position it is handed. `position` is the attribute name it fills.
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

// Asynchronous, and that is the whole design: the backend behind it is a dynamic import.
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

A rolling three-colour gradient fills the window and follows a resize. WGSL is the same
shape through `wgslFrame`. [docs/EXAMPLES.md](docs/EXAMPLES.md) is that page as four files
you can copy, then six fuller pages that run in this repository.

## Why this one

**A frame is data, so you can ask about it instead of trying it.** You hand the renderer a
graph — what resources exist, what pipelines run, in what order the passes go — not a
shader and a hope. That graph is a plain value: serialisable, so a worker can build it;
comparable, so two frames can be diffed; and answerable, so `cost` gives you passes, draws
and transient bytes at a size before a pixel exists.

**A device says no by name.** A graph declares the capabilities it needs, a device reports
the ones it has, and `refusal` names the gap before anything reaches a driver. No backend
here has a method the other throws from — if WebGL 2 cannot do a thing, the graph is
refused rather than accepted and failed mid-frame.

**One import path, two backends, and you never name one.** `selectBackend` reads two facts:
the language the frame is authored in, and what the device offers. What it does draw, it
draws the same on both — on an RTX 5080 the two backends agree to within a single channel
on every scene preset in this repository's corpus.

**Your users download one backend.** Each is reached by `await import()`, so a bundler puts
each in a file of its own and a browser with no WebGPU never fetches the WebGPU one. That
is a gate, not a promise: `npm test` bundles the door and fails if either backend lands in
the first download.

## What a page downloads

Measured by the chunk gate, `gates/chunk.mjs`, minified with splitting on, on the commit
you are reading:

| chunk | raw | gzipped | fetched |
| --- | --- | --- | --- |
| the door and your page's calls | 3.7 kB | **1.8 kB** | always |
| the WebGL 2 backend | 21.6 kB | **7.1 kB** | where it draws |
| the WebGPU backend | 25.4 kB | **8.9 kB** | where it draws |
| shared chunks (four) | 15.0 kB | 5.9 kB | as the graph needs them |

So a browser on the WebGL 2 path never pays for the WebGPU backend, and neither path pays
for a translator: WGSL is translated to GLSL at build time, so nothing ships one.

## Five things worth knowing before you start

1. **The factories are asynchronous.** `createSurface` and `createFrameRenderer` are both
   `await`ed, because the backend is a dynamic import. That is the cost of the previous
   section and the only reason for it.
2. **A renderer draws through WebGL 2 unless you hand it a WebGPU device.** Asking for the
   card is your step — `requestWebGPUDevice()`, then `{ backend: 'webgpu', device }` — so a
   page that never wanted WebGPU never pulls that backend in.
3. **Never test for WebGL 2 on the canvas you mean to draw into.** A canvas keeps the first
   context type it is asked for and refuses every other one for life, so
   `canvas.getContext('webgl2')` as a capability check breaks the WebGPU path on the very
   machines that have WebGPU. Ask a throwaway canvas.
4. **A GLSL-authored frame selects WebGL 2 even where WebGPU exists.** The language you
   wrote in is the capability you forfeit, and every capability it gives up is one GLSL ES
   3.0 has no syntax for. You get a picture rather than a lecture.
5. **`wgslFrame` expects two conventions of its source:** the fragment entry point is called
   `fragMain`, and the uniforms are one struct at group 0, binding 0. `uniformBlockOf(code)`
   reads the block's offsets off the source so the layout is never written twice.

## Past a fullscreen shader

For real geometry, more than one pass, a depth buffer or a compute stage, you author the
graph yourself: resources, pipelines and passes, with every resource addressed by a
kind-branded handle — `uniform(0)`, `texture(2)` — rather than by a string, so passing a
texture where a buffer belongs is a compile error rather than an `undefined` at draw time.
[docs/GUIDE-frame-graph.md](docs/GUIDE-frame-graph.md) builds one line by line.

Above the renderer there is a scene: entities with transforms that may name a parent, and
`sceneView` turns a world and its cameras into a `FrameGraph`, packing each object's record
into a storage buffer the shader indexes by instance. A rotation is a `Mat4` and never
three angles, because Euler orders disagree between codebases and the disagreement is
silent. The maths is `vec3`, `mat3` and `mat4`, column major, depth zero to one — the
length of a vector is `vec3.magnitude`, since a function's own `length` in JavaScript
cannot be replaced. [docs/API.md](docs/API.md) has every signature.

## Ask before you draw

```ts
import {
  cost, requestWebGPUDevice, resolve, webgl2Capabilities, webgpuCapabilities,
  type DeviceProfile,
} from '@altpsyche/engine';

// Ask for the card first, because whether asking returns one is the fact selection reads.
const device = await requestWebGPUDevice();
const gl = document.createElement('canvas').getContext('webgl2'); // a throwaway canvas

const profile: DeviceProfile = {
  webgpu: device ? webgpuCapabilities(device.features) : null,
  webgl2: gl ? webgl2Capabilities(gl.getSupportedExtensions() ?? []) : null,
};

// One reading: the backend that will draw this frame, or a refusal naming what is missing.
const selection = resolve(frame, profile);
if ('refusal' in selection) console.error(selection.refusal);
else console.log('drawing on', selection.backend);

// What it costs, before a pixel exists.
const { passes, draws, transientBytes } = cost(frame, { width: 800, height: 600 });
```

`resolve` is selection and the capability check in one call; `selectBackend` and `refusal`
are those halves on their own. All of them are pure functions over data, so they answer in
a test, in a worker, or on a machine with no card at all.

`probe()` is a different thing worth not confusing with these: it draws a frame and returns
a dated `DeviceReading` — what was reported, what came back, whether the device survived
being composited — which is a diagnostic and a row for
[docs/DEVICES.md](docs/DEVICES.md), not the input to selection.

## Drawing one frame, on your own schedule

```ts
import { createFrameRenderer, requestWebGPUDevice, submit } from '@altpsyche/engine';

const device = await requestWebGPUDevice();
const renderer = await createFrameRenderer(canvas, device ? { backend: 'webgpu', device } : {});
if (!renderer) throw new Error('no backend would give this canvas a context');

submit(renderer, frame, { u_time: 0 });          // uniforms are an argument, not an option
```

`{ into }` as a fourth argument lands the frame in a texture you own as well as on the
canvas — a capture target, or an XR layer the compositor consumes. Where it lands is the
caller's choice rather than the library's.

## Checking what your shader asked the card

The recording double ships in the package rather than beside it. `wrapDevice` wraps a real
device and records every call made on it, `projectTrace` reduces a recording to the calls
worth comparing, and `compareTraces` says where two recordings differ — so you can prove a
shader edit did not quietly change what the card was asked to do. It is the same mechanism
this package holds its own two backends to;
[docs/API.md](docs/API.md#checking-what-your-shader-asked-the-card) shows the three in use.

## What it needs

Any browser with WebGL 2, which is every current one, and WebGPU where you want that path.
TypeScript declarations ship with the package, so nothing needs a `@types` install.

The two backends are not equal and the difference lives in data rather than in prose. WebGL
2 draws the whole toy tier and the scene tier's per-instance records; it has no compute
stage, no shader-written storage buffer, no storage texture, no indirect draw and no
timestamp or occlusion query, because GLSL ES 3.0 has none of them. Ask `probe` or
`webgl2Capabilities` rather than trusting this paragraph, and read
[docs/GUIDE-backends.md](docs/GUIDE-backends.md) for the rest.

## Status

**0.x, and 0.x is unstable**: names and shapes change between releases without a major
bump, and the [CHANGELOG](CHANGELOG.md) says what moved in each one. A caret range on a
`0.x` version tracks the last number alone, so `^0.3.0` will not pick up a later `0.4.0` —
you move to a feature release by asking for it.

## Where to read next

| document | what it answers |
| --- | --- |
| [docs/EXAMPLES.md](docs/EXAMPLES.md) | a complete page as four files, and the six that run in this repository |
| [docs/API.md](docs/API.md) | every exported name with the signature the compiler gives it |
| [docs/GUIDE-frame-graph.md](docs/GUIDE-frame-graph.md) | authoring a frame graph by hand |
| [docs/GUIDE-backends.md](docs/GUIDE-backends.md) | capabilities, selection, refusal, and what each backend reaches |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | how the library is put together, and why |
| [CHANGELOG.md](CHANGELOG.md) | what moved in each release |

For someone changing the package rather than using it:
[CONTRIBUTING.md](CONTRIBUTING.md) has the gates and the rules that are not negotiable, and
[docs/DEVICES.md](docs/DEVICES.md) is the hardware log — dated readings from real machines,
kept so a claim about a graphics card has a source.

## Licence

MIT.
