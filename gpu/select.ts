/**
 * Which backend draws a given frame, answered inside the library rather than by
 * the caller naming one.
 *
 * The choice is a pure reading over two facts and nothing else: what the frame is
 * authored in, and what this device actually offers. It touches no device — the
 * offering is gathered elsewhere, by whoever asked the browser for a card, and
 * handed here as data — so the whole of the decision is testable on any machine,
 * including the ones that never return a real WebGPU adapter. That is the same
 * shape `validate`, `refusal` and `cost` take, and for the same reason: a rule a
 * device has to be present to check is a rule no test can pin down.
 *
 * Selection comes before refusal, per §10. A frame is refused only once selection
 * has come back empty — when nothing this device offers can draw what the frame
 * is written in — and the refusal then names what was missing rather than lecturing
 * a caller who arrived with a perfectly drawable shader. A consumer handing in a
 * GLSL paste on a WebGPU machine gets a picture, because GLSL selects WebGL 2 even
 * where WebGPU exists (§17 decision 6): the language it is written in is the
 * capability it forfeits, and every one it forfeits is one GLSL ES 3.0 has no
 * syntax for.
 */
import type { BackendName, ShaderFrame, ShaderTarget } from '../graph/types.js';

/**
 * What this device offers, gathered once before any backend is chosen.
 *
 * `webgpu` is true only when asking for an adapter actually returned one, not when
 * the browser merely reported `navigator.gpu`: a browser was measured reporting
 * the API and then handing back nothing when asked for a card, so a selection that
 * trusted the API's presence would route a frame to a backend that cannot be
 * built. `webgl2` is true when a WebGL 2 context can be had. Both are facts about
 * this browser and this card at this moment, which is why they are read rather
 * than assumed.
 */
export interface DeviceOffer {
  webgpu: boolean;
  webgl2: boolean;
}

/**
 * The outcome of a selection: the backend that will draw the frame, or a refusal
 * naming what was missing. The two arms are discriminated so a caller cannot read
 * a backend off a refusal, and the refusal carries a message a page can print
 * rather than a code it has to translate.
 */
export type BackendSelection = { backend: BackendName } | { refusal: string };

/** Which backend speaks a given authoring language today. It is one-to-one
 * because a WGSL-to-GLSL translator is not on this path yet (it arrives in
 * Stage 5), so a WGSL frame has one backend that can build it and a GLSL frame
 * has the other. When translation lands, a WGSL frame gains WebGL 2 as a second
 * candidate and this stops being a lookup — which is exactly why the offering is
 * passed whole rather than the single backend this maps to. */
const SPEAKS: Record<ShaderTarget, BackendName> = { glsl: 'webgl2', wgsl: 'webgpu' };

/** What a missing backend is called in a refusal, in the browser's own words so a
 * reader can search for it. A WebGPU refusal names the adapter rather than the API,
 * because the API being present is not the thing that failed. */
const MISSING: Record<BackendName, string> = {
  webgl2: 'WebGL 2 is not available on this device',
  webgpu: 'WebGPU returned no adapter on this device',
};

/**
 * Choose the backend for a frame across what this device offers, or refuse.
 *
 * The frame is read for the one thing that decides which backends could draw it —
 * the language it is authored in — and the offering is read for which of those the
 * device can actually build. A GLSL frame selects WebGL 2 wherever WebGL 2 is
 * offered, whatever else the device has; a WGSL frame selects WebGPU wherever an
 * adapter was returned. A refusal appears only when no backend is left that both
 * speaks the frame's language and is offered here, and it names the backend that
 * was missing.
 */
export function selectBackend(frame: Pick<ShaderFrame, 'target'>, offer: DeviceOffer): BackendSelection {
  const backend = SPEAKS[frame.target];
  const offered = backend === 'webgpu' ? offer.webgpu : offer.webgl2;
  if (offered) return { backend };
  return { refusal: `no backend can draw a ${frame.target} frame: ${MISSING[backend]}` };
}
