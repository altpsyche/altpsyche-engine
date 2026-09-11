/**
 * The door that joins a backend selection to a renderer, which is the step this
 * package computed and never carried out.
 *
 * **Why it exists, and where the decision it rests on is written.** `gpu/select.ts`
 * records the decision of 2026-09-11: the library answers the questions and the
 * caller owns the things. Which backend draws a frame is a reading over data, so
 * it is this package's to answer; a `GPUDevice` is a resource with a lifetime, so
 * it is the caller's to own. `createFrameRenderer` is the primitive underneath
 * this and stays exactly as it was — it builds the backend it is told to build,
 * because building one needs the answer already in hand. This is the function
 * that works the answer out, and a caller that already has one still reaches the
 * primitive directly.
 *
 * **What a caller had to do before this, and the step that made it a defect.**
 * Gather the offering, call `selectBackend`, call `requestWebGPUDevice`, and
 * translate the frame where the chosen backend needs it. The fourth is the one
 * that mattered: it goes through `glslFrameOf`, nothing at the door said it
 * existed, and it can come back null. So `selectBackend` would answer `webgl2`
 * for a WGSL frame carrying a translation, the caller would hand that frame
 * straight to the renderer, and `gpu/webgl2.ts` would throw `WebGL 2 was handed a
 * wgsl frame to draw` — a refusal naming a step the caller was never told to
 * take. Worse was the silent case: a caller naming neither backend nor device got
 * WebGL 2 on a machine whose adapter would have come back, which is the worse
 * backend chosen by silence rather than by a reading.
 *
 * **Why it is here and not in `gpu/`.** It asks a browser for a card and for a
 * throwaway context, so it needs a DOM and `host/` is the layer that has one.
 * `gpu/select.ts` stays pure and device-free, which is the property every test
 * over selection rests on, and this file is the impure shell around it. Nothing
 * here re-decides anything: every judgement is `selectBackend`'s, and this
 * assembles.
 *
 * **What it does not do, deliberately.** It holds no device, no adapter and no
 * cache, so two calls on two canvases make two renderers and — where the caller
 * hands the same `device` to both — one card between them. A module-level device
 * would make the second call cheaper and is refused: capability lives in the data
 * and no module here holds a card. It also reaches a backend only through
 * `createFrameRenderer`, whose two `await import()`s are what keep the WebGPU
 * backend out of a card-less browser's first download, so importing this name
 * pulls neither backend in with it.
 */
import type { FrameGraph, WgslFrameGraph } from '../graph/types.js';
import type { DeviceOffer } from '../gpu/select.js';
import { selectBackend } from '../gpu/select.js';
import type { FrameRenderer, RendererOptions } from '../gpu/renderer.js';
import { createFrameRenderer } from '../gpu/renderer.js';
import { requestWebGPUDevice } from '../gpu/webgpu-device.js';
import { glslFrameOf } from '../toy/frame.js';

/**
 * A renderer that was opened, and the frame it draws.
 *
 * **The frame is here because it is not always the one that was handed in.** A
 * WGSL frame drawn on WebGL 2 is drawn as its GLSL translation, and a caller that
 * kept its own copy and submitted that would hand a WGSL frame to a WebGL 2
 * renderer — which is the exact throw this function exists to stop. So the frame
 * to submit comes back beside the renderer that draws it, and a caller passes
 * this one to `submit`. Where no translation was needed it is the same object
 * that went in.
 */
export interface OpenedRenderer {
  renderer: FrameRenderer;
  frame: FrameGraph;
}

/** What `openRenderer` answers: the renderer and its frame, or one sentence
 * naming why no renderer could be opened. The same two-armed shape
 * `selectBackend` and `resolve` answer in, for the same reason — a refusal is a
 * fact a caller acts on rather than an exception it catches. */
export type RendererOpening = OpenedRenderer | { refusal: string };

/**
 * Open a renderer for this frame on this machine.
 *
 * Gathers what the machine offers, asks `selectBackend` which backend should
 * draw, asks the browser for a card only where the answer needs one, translates
 * the frame where the chosen backend speaks another language, and builds the
 * renderer — or answers with one sentence saying why none of that could be done.
 *
 * `options.device` is the caller's card. Hand one in and it is used; leave it out
 * and one is asked for, but only where the selection actually wants WebGPU. **A
 * page with more than one canvas should ask once and hand the same device to
 * each**: `requestWebGPUDevice` spends a fresh adapter every time it is called,
 * so a page that lets this function ask on its behalf six times gets six cards.
 *
 * `options.backend` still names a backend to use instead of the one that would be
 * chosen, and it is a narrowing rather than an override: the named backend is the
 * only one offered to the selection, so a frame it cannot draw is refused by name
 * here instead of throwing inside it later. That is what the option is for — a
 * measurement comparing the two, and a fault switched off in one commit — and it
 * keeps working through the door that chooses.
 */
export async function openRenderer(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  frame: FrameGraph,
  options: RendererOptions = {}
): Promise<RendererOpening> {
  // What the caller will allow, before the machine is asked anything. A named
  // backend narrows this to one; naming none allows both.
  const allowed: DeviceOffer = options.backend
    ? { webgpu: options.backend === 'webgpu', webgl2: options.backend === 'webgl2' }
    : { webgpu: true, webgl2: true };

  // Would this frame reach WebGPU at all, if the machine offered everything the
  // caller allows? Asked of the pure reading rather than re-derived from the
  // candidate table, because a second copy of that table is a thing that can
  // disagree with the first. Two things fall out of the answer: a frame no
  // allowed backend can draw is refused here without a browser being touched at
  // all, and a card is asked for only where one could actually be used — a GLSL
  // frame never selects WebGPU, so asking for an adapter to draw one spends a
  // card the frame cannot use.
  const reachable = selectBackend(frame, allowed);
  if ('refusal' in reachable) return reachable;

  const device = options.device ?? (reachable.backend === 'webgpu' ? await requestWebGPUDevice() : null);

  // What the machine actually offers, narrowed by what the caller allows. WebGPU
  // is offered only where a card is in hand, which is the rule `DeviceOffer` states
  // about itself: a browser was measured reporting `navigator.gpu` and then handing
  // back nothing when asked, so the presence of the API is not the offer.
  const offer: DeviceOffer = {
    webgpu: allowed.webgpu && device !== null,
    webgl2: allowed.webgl2 && offersWebGL2(),
  };
  const selection = selectBackend(frame, offer);
  if ('refusal' in selection) return selection;
  const backend = selection.backend;

  // The step nothing at the door named. A WGSL frame selects WebGL 2 where no
  // adapter came back and the build baked a translation, and it is that
  // translation the backend draws rather than the frame as written.
  let toDraw: FrameGraph = frame;
  if (backend === 'webgl2' && frame.authored === 'wgsl') {
    const translated = glslFrameOf(frame);
    if (!translated) return { refusal: noTranslation(frame) };
    toDraw = translated;
  }

  const renderer = await createFrameRenderer(canvas, {
    ...options,
    backend,
    // A WebGL 2 renderer is given no device: the primitive reads `device` only
    // where `backend` is `webgpu`, and passing the caller's card through to the
    // other backend would be a value nothing reads.
    ...(backend === 'webgpu' && device ? { device } : {}),
  });
  if (!renderer) {
    return {
      refusal: `the frame for "${frame.id}" selected ${backend} and that backend gave the canvas no context`,
    };
  }

  return { renderer, frame: toDraw };
}

/**
 * Whether this machine gives a WebGL 2 context at all, read from a canvas that is
 * thrown away.
 *
 * **It must be a throwaway and never the canvas being drawn into.** A canvas keeps
 * the first context type it is given and refuses every other one for as long as it
 * lives, so asking the real canvas for `webgl2` as a capability check breaks
 * WebGPU on exactly the machines that have it.
 *
 * **The canvas never reaches the document**, which is the difference between this
 * and `probe()`, whose on-screen trial canvases are a defect filed as item 15: a
 * canvas that is never appended has nothing to clean up and cannot cover a
 * caller's page. Nothing here needs compositing, because the question is whether a
 * context can be had and not whether it survives being shown.
 */
function offersWebGL2(): boolean {
  try {
    if (typeof document !== 'undefined') {
      return document.createElement('canvas').getContext('webgl2') !== null;
    }
    if (typeof OffscreenCanvas !== 'undefined') {
      return new OffscreenCanvas(1, 1).getContext('webgl2') !== null;
    }
  } catch {
    // A browser that refuses a context for its own reasons is a browser that does
    // not offer one, which is the answer rather than an error to propagate.
  }
  return false;
}

/**
 * Why `glslFrameOf` had no translation to give, as a sentence naming the cause.
 *
 * `glslFrameOf` answers only that a needed document is absent — its own header
 * says the reason is the caller's to name — so this reads the frame for the three
 * shapes that make it absent, in the order that function tests them. **The two are
 * held together by a test rather than by care**: every corpus frame `glslFrameOf`
 * refuses must get a reason here, and a frame it translates must get none, so a
 * condition added there and not here fails rather than printing the wrong cause.
 */
function noTranslation(frame: WgslFrameGraph): string {
  const named = `the frame for "${frame.id}" selected webgl2`;
  for (const spec of frame.pipelines) {
    if (spec.kind !== 'render') {
      return `${named} and runs a compute stage, which WebGL 2 has none of`;
    }
    if (spec.vertex === undefined) {
      return `${named} and supplies its corners from the backend, so the build baked no vertex stage for WebGL 2 to link`;
    }
    const bake = spec.source.glsl;
    if (bake?.vertex === undefined || bake?.fragment === undefined) {
      return `${named} and the build baked no GLSL for one of its stages, which is a capability WebGL 2 withholds`;
    }
  }
  return `${named} and no GLSL translation could be built for it`;
}
