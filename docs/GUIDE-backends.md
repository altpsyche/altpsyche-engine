# The two backends, and how to ask which one you get

This package draws through **WebGPU** where a browser returns an adapter and **WebGL 2**
where it does not. You never name a backend. You hand in a graph, and two facts decide:
the language the graph is authored in, and what the device offers.

## Selection comes before refusal

```ts
import { requestWebGPUDevice, selectBackend } from '@altpsyche/engine';

// The offering: two booleans, gathered once by whoever asked the browser for a card.
// The WebGL 2 half is read from a throwaway canvas, never from the one you draw into.
const device = await requestWebGPUDevice();
const offer = {
  webgpu: device !== null,
  webgl2: document.createElement('canvas').getContext('webgl2') !== null,
};

const chosen = selectBackend(frame, offer);
// { backend: 'webgpu' } | { backend: 'webgl2' } | { refusal: 'no backend can draw a …' }
```

`selectBackend` touches no device — the offering is handed in as data. So the whole
decision is testable on any machine, including the ones that never return a WebGPU
adapter.

**A GLSL-authored frame selects WebGL 2 even where WebGPU exists.** That is deliberate,
and it is the one selection rule worth memorising: the language a consumer wrote in is the
capability it forfeits, and every capability it gives up is one GLSL ES 3.0 has no syntax for —
there is no compute stage in ES 3.0 to lose. So the frame is drawn where it runs, and you get a
picture rather than a lecture about the backend you did not ask for.

Only once selection comes back empty does a refusal appear, and it names the backend that
was missing rather than lecturing a caller who arrived with a perfectly drawable shader.

## Capability lives in the data, never in a method that throws

A graph declares what it needs. A device reports what it has. `refusal` reads the two
records and names what is missing.

```ts
// continues the block above
import { refusal, webgpuCapabilities } from '@altpsyche/engine';

const no = device
  ? refusal(frame, { backend: 'webgpu', capabilities: webgpuCapabilities(device.features) })
  : null;
// null, or a string naming the capability the device has not got
```

`resolve` is those two readings in one call — selection first, then the capability check
— over a **profile**, which is each backend's capability set or `null` where that backend
is not on offer:

```ts
// continues the block above
import { resolve, webgl2Capabilities } from '@altpsyche/engine';

const gl = document.createElement('canvas').getContext('webgl2');
const selection = resolve(frame, {
  webgpu: device ? webgpuCapabilities(device.features) : null,
  webgl2: gl ? webgl2Capabilities(gl.getSupportedExtensions() ?? []) : null,
});

if ('refusal' in selection) console.error(selection.refusal);
else console.log('drawing on', selection.backend);
```

This is the rule the whole design rests on: **no backend grows a method the other has to
throw from.** If WebGL 2 cannot do a thing, a graph needing that thing is refused by name
before a driver is ever reached — not accepted and then failed halfway through a frame.

The eleven capabilities:

| capability | WebGPU | WebGL 2 | why |
| --- | --- | --- | --- |
| `compute` | core | **no** | ES 3.0 has no compute stage; compute arrived in ES 3.1 |
| `storage-buffer` | core | **yes** | read-only, drawn as a uniform block indexed per instance |
| `storage-buffer-readwrite` | core | **no** | a shader-written buffer needs a stage WebGL 2 has not got |
| `storage-texture` | core | **no** | |
| `indirect` | core | **no** | draw counts read out of a buffer |
| `timestamp` | optional | **no** | |
| `occlusion` | core | **no** | |
| `msaa` | optional | **yes** | multisample renderbuffer, resolved with a blit |
| `float-blend` | optional | via `EXT_float_blend` | |
| `depth-clamp` | optional | **no** | |
| `bgra-storage` | optional | **no** | |

Read this from `webgpuCapabilities` and `webgl2Capabilities` rather than from the table —
the code is the authority and the table is a summary of it.

## What WebGL 2 reaches today

Everything in the toy tier: a fullscreen shader, several passes, several colour attachments,
depth and stencil, resident textures, a mip ladder, multisampling, vertex geometry of the
shader's own, and per-draw uniform slices.

The scene tier draws too — a scene's read-only per-instance records reach WebGL 2 as a uniform
block indexed per instance — and it draws **the same picture WebGPU draws**. On a real card the
two backends agree to within a single channel on every scene preset, which is two hardware
compilers folding the same arithmetic apart rather than a difference you could see. The reading
is in [DEVICES.md](DEVICES.md), taken by `npm run gate:card`.

What it will never reach is what GLSL ES 3.0 has no syntax for: compute, a shader-written storage
buffer, storage textures, indirect draws, and timestamp or occlusion queries. Those are refused by
name rather than half-drawn.

## Why a frame might not draw on WebGL 2

Three different mechanisms, worth telling apart because they fail at different times:

1. **A capability the device has not got** — refused by `refusal`, from data, before a driver
   is reached.
2. **No translated GLSL** — WGSL is translated to GLSL ES 3.00 ahead of time, and a shader the
   translator refuses is refused at *build* time with the construct named.
3. **A fullscreen WGSL frame with no vertex stage to translate.** The shortcut frames draw with
   the backend's own corners on WebGPU; on WebGL 2 there is no vertex document to link.

Only the first is a runtime answer. The other two are build-time facts, which is the right place
to find out — a shader that will not reach WebGL 2 says so while you are still at your editor.

## Translation, and why nothing ships a translator

A producer authors WGSL. WebGL 2 receives a translation of it. That translation happens in
one of two places, and the split is what keeps the shipped cost at zero:

- **Ahead of time**, for anything a build can see. The translation travels with the shipped
  material, so a consumer on WebGL 2 downloads **no translator** and pays no translation cost.
  The package has zero runtime dependencies.
- **On demand**, and only for the editing path — someone typing WGSL into a toy-tier editor
  on a WebGL 2 device. That case fetches the translator by `await import()`, in its own
  chunk, exactly the way a backend is fetched.

A shader that will not translate fails the build rather than the page.
