# The two backends, and how to ask which one you get

This package draws through **WebGPU** where a browser returns an adapter and **WebGL 2**
where it does not. You never name a backend. You hand in a graph, and two facts decide:
the language the graph is authored in, and what the device offers.

## Selection comes before refusal

```js
import { probe, selectBackend, refusal } from '@altpsyche/engine';

const reading = await probe();
const chosen = selectBackend(frame, reading.offer);
// { backend: 'webgpu' } | { backend: 'webgl2' } | { refusal: 'no backend can draw a …' }
```

`selectBackend` touches no device — the offering is gathered once, by whoever asked the
browser for a card, and handed in as data. So the whole decision is testable on any
machine, including the ones that never return a WebGPU adapter.

**A GLSL-authored frame selects WebGL 2 even where WebGPU exists.** That is deliberate
(§17 decision 6): the language a consumer wrote in is the capability it forfeits, and every
capability it gives up is one GLSL ES 3.0 has no syntax for — there is no compute stage in
ES 3.0 to lose. You get a picture rather than a lecture.

Only once selection comes back empty does a refusal appear, and it names the backend that
was missing rather than lecturing a caller who arrived with a perfectly drawable shader.

## Capability lives in the data, never in a method that throws

A graph declares what it needs. A device reports what it has. `refusal` reads the two
records and names what is missing.

```js
const no = refusal(frame, reading.capabilities);
// null, or a string naming the capability the device has not got
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

## What each backend actually drew, measured

The corpus gate builds every preset through both backends in a real browser and reports
the lit pixel count. The most recent run:

| preset | WebGPU | WebGL 2 |
| --- | --- | --- |
| `webgl2-fullscreen-probe` | — | 480,000 of 480,000 (100.0%) |
| `core-geometry` | 129,600 (27.0%) | 129,600 (27.0%) |
| `core-perdraw-uniform` | 112,896 (23.5%) | 112,896 (23.5%) |
| `core-depth` | 245,512 (51.1%) | 245,512 (51.1%) |
| `core-multisample` | 87,479 (18.2%) | 87,479 (18.2%) |
| `core-scene` | 91,579 (19.1%) | 91,579 (19.1%) |
| `core-compute`, `core-state`, `core-indirect` | 100.0% | skipped — a compute stage |
| `core-material` | 84,929 (17.7%) | 84,929 (17.7%) |
| `core-draw-list` | 78,214 (16.3%) | 78,214 (16.3%) |
| `core-perdraw` | drew | skipped — its storage buffer has no bake |
| `core-texture`, `core-target`, `core-mips`, `core-stencil` | drew | skipped — a fullscreen WGSL frame bakes no vertex to link |
| `core-report` | 270,400 (56.3%) | skipped — declares a buffer no pipeline reads |

**24 of 24 draws lit their buffer, 0 failed, 9 WebGL 2 skips.**

`core-material` and `core-draw-list` are the scene tier's own presets, and they draw on WebGL 2
through a hand-authored GLSL vertex stage plus the uniform-block route for their read-only
per-instance records. Their WebGL 2 counts equal their WebGPU counts — and **no gate asserts
that equality**: the corpus bar is "lit > 0" per backend, so the match is observed rather than
held. Holding it is what the cross-backend three-number reading is for, and that reading is
hardware-gated and has not been taken.

**Two honest caveats, because a number without them is worse than no number.** First,
every figure above is **SwiftShader**, the software renderer: each headless browser launch
here reaches it whatever the flags say. That the two columns agree is a real result about
the translation and the draw path, and it is *not* a result about a graphics card. Second,
the WebGL 2 column's matching counts come from the same corpus drawn twice, not from a
per-pixel comparison — the three-number cross-backend reading is a separate, hardware-gated
measurement (ROADMAP items 44 and 106) and it has not been taken.

## Where the WebGL 2 skips come from

Three different mechanisms, worth telling apart because they fail at different times:

1. **A capability the device has not got** — refused by `refusal`, from data, before a
   driver is reached. `core-perdraw` needs a read-only storage buffer whose GLSL the
   translator will not emit.
2. **No baked GLSL** — the build translates every corpus preset to GLSL ES 3.00 with naga
   ahead of time, and a shader naga refuses is refused at *build* time with the construct
   named. Today the bake carries **29 entry points across 13 presets**, with 7 refused for
   capabilities WebGL 2 genuinely lacks. Two vertex stages naga will not emit —
   `core-material`'s and `core-draw-list`'s, both reading a storage buffer — are supplied as
   hand-authored GLSL in `fixtures/source/glsl/handwritten/` instead, which is how the scene
   tier reaches WebGL 2 at all.
3. **A fullscreen WGSL frame with no vertex stage to bake.** The shortcut frames draw with
   the backend's own corners on WebGPU; on WebGL 2 there is no vertex document to link.

Only the first is a runtime answer. The other two are build-time facts, which is the right
place to find out.

## Translation, and why nothing ships a translator

A producer authors WGSL. WebGL 2 receives a translation of it. That translation happens in
one of two places, and the split is what keeps the shipped cost at zero:

- **Ahead of time**, for anything a build can see. Every corpus preset is translated once
  by `npm run translate` and the result travels with the bake. A consumer on WebGL 2
  downloads **no translator** and pays no translation cost. `dependencies` is `{}`.
- **On demand**, and only for the editing path — someone typing WGSL into a toy-tier editor
  on a WebGL 2 device. That case fetches the translator by `await import()`, in its own
  chunk, exactly the way a backend is fetched.

A shader that will not translate fails the build rather than the page.
