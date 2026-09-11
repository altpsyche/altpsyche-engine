# The two backends, and how to ask which one you get

This package draws through **WebGPU** where a browser returns an adapter and **WebGL 2**
where it does not, and which one is a reading over two facts: the language the graph is
authored in, and what the device offers. `selectBackend` is that reading, and it is the
next section.

**You do not name a backend.** `openRenderer` runs that reading and acts on it:

```ts
import { openRenderer, submit } from '@altpsyche/engine';

const opened = await openRenderer(canvas, frame);
if ('refusal' in opened) {
  // One sentence saying why no renderer could be opened. Nothing threw.
  console.warn(opened.refusal);
} else {
  // Submit the frame it handed back, not the one you passed in.
  submit(opened.renderer, opened.frame, { u_time: 0 });
}
```

It gathers what the machine offers, asks `selectBackend` which backend should draw, asks the
browser for a card only where that answer wants one, translates the frame where the chosen
backend speaks another language, and builds the renderer.

**Two things about that call are worth knowing before you write it.**

**Submit the frame it hands back.** A WGSL frame drawn on WebGL 2 is drawn as its GLSL
translation, so `opened.frame` is what the renderer actually draws. Where no translation was
needed it is the same object you passed in. Keeping your own copy and submitting that hands a
WGSL frame to a WebGL 2 renderer, which is refused by name.

**The card is yours to own.** Leave `device` out and one is asked for; hand one in and it is
used. A page with more than one canvas should ask once with `requestWebGPUDevice()` and hand
the same device to each, because that function spends a fresh adapter every time it is called
— six canvases letting the door ask on their behalf get six cards.

`createFrameRenderer` is the primitive underneath and it still takes a backend by name, for a
caller that already knows which one it wants. That is what [the README](../README.md) describes.

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

`selectBackend` touches no device. The offering is handed in as data, so the whole decision
is testable on any machine, including one that never returns a WebGPU adapter.

**A GLSL-authored frame selects WebGL 2 even where WebGPU exists.** This is the one selection
rule worth memorising. The language you wrote in is the capability you give up, and every
capability it gives up is one GLSL ES 3.0 has no syntax for. There is no compute stage in ES
3.0 to lose. So a GLSL frame draws where it runs, and the WebGPU backend never comes into it.

A refusal appears only when selection comes back empty, and it names the backend that was
missing. A caller who arrived with a drawable shader gets a picture.

## Capabilities are data, never a method that throws

A graph declares what it needs. A device reports what it has. `refusal` reads both and names
what is missing.

```ts
// continues the block above
import { refusal, webgpuCapabilities } from '@altpsyche/engine';

const no = device
  ? refusal(frame, { backend: 'webgpu', capabilities: webgpuCapabilities(device.features) })
  : null;
// null, or a string naming the capability the device has not got
```

`resolve` does both readings in one call, selection first and the capability check second.
It takes a **profile**: each backend's capability set, or `null` where that backend is not on
offer.

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

One rule holds the design together: **no backend grows a method the other has to throw
from.** If WebGL 2 cannot do a thing, a graph that needs it is refused by name before a driver
is reached. Nothing is accepted and then failed halfway through a frame.

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
| `dual-source-blend` | optional | **no** | the `src1` factors blend against a second fragment output, which ES 3.00 has none of |
| `per-target-blend` | core | **no** | WebGL 2 has one blend state for every draw buffer at once |

**An ordinary blend is on neither row and needs no capability.** A pipeline whose `targets` name
a blend draws it on both backends — WebGL 2 applies it through `blendFuncSeparate`,
`blendEquationSeparate` and `blendColor`. The two rows above are the corners that do not reach:
a factor reading a second fragment output, and a pass whose targets draw under *different*
blends. **A target naming no blend counts as a state of its own** there, because a colour written
straight in is not the same as one mixed with what was there.

**Both are read off the pipeline rather than declared**, like the write arm of `storage-buffer`,
so a caller never has to remember to put them in `requires`. Forgetting would have meant a wrong
picture rather than a refusal, which is what the capability model exists to prevent.

The table is a summary. `webgpuCapabilities` and `webgl2Capabilities` are the authority, so
read them in code when it matters.

## What WebGL 2 reaches today

Everything in the toy tier: a fullscreen shader, several passes, several colour attachments,
depth and stencil, resident textures, a mip ladder, multisampling, vertex geometry of the
shader's own, and per-draw uniform slices.

The scene tier draws too. A scene's read-only per-instance records reach WebGL 2 as a
uniform block indexed per instance, and the picture is **the same picture WebGPU draws**. On a
real graphics card the two backends agree to within a single channel on every scene preset,
which is two hardware compilers folding the same arithmetic differently and not a difference
you could see. [DEVICES.md](DEVICES.md) has that reading, taken by `npm run gate:card`.

WebGL 2 will never reach what GLSL ES 3.0 has no syntax for: compute, a shader-written storage
buffer, storage textures, indirect draws, timestamp queries and occlusion queries. A graph that
needs one of those is refused by name.

## Why a frame might not draw on WebGL 2

Three separate mechanisms, and they are worth telling apart because they fail at different
times.

1. **A capability the device has not got.** `refusal` catches this from data, before a driver
   is reached.
2. **No translated GLSL.** WGSL is translated to GLSL ES 3.00 ahead of time, and a shader the
   translator will not take is refused at *build* time, with the construct named.
3. **A fullscreen WGSL frame with no vertex stage to translate.** The shortcut frames draw
   with the backend's own corners on WebGPU. On WebGL 2 there is no vertex document to link.

Only the first is a runtime answer. The other two are build-time facts, which is where you
want to hear about them: a shader that cannot reach WebGL 2 says so while you are still at
your editor.

## Translation, and why nothing ships a translator

You write WGSL. WebGL 2 gets a translation of it. The translation happens in one of two
places, and that split is what keeps the shipped cost at zero.

- **Ahead of time**, for anything a build can see. The translation travels with the shipped
  material, so a browser on WebGL 2 downloads **no translator** and does no translating. This
  is why the package has zero runtime dependencies.
- **On demand**, and only when someone is typing WGSL into a toy-tier editor on a WebGL 2
  device. That case loads the translator with `await import()`, in its own chunk, the same way
  a backend loads.

A shader that will not translate fails the build. It does not fail the page.
