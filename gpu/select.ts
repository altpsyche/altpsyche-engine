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
import type { BackendName, FrameGraph, ShaderTarget } from '../graph/types.js';
import type { Capability } from '../graph/capability.js';
import { refusal } from '../graph/refusal.js';

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
export function selectBackend(frame: Pick<FrameGraph, 'target'>, offer: DeviceOffer): BackendSelection {
  const backend = SPEAKS[frame.target];
  const offered = backend === 'webgpu' ? offer.webgpu : offer.webgl2;
  if (offered) return { backend };
  return { refusal: `no backend can draw a ${frame.target} frame: ${MISSING[backend]}` };
}

/**
 * What each backend can do, as the capability set §10 reads a graph's `requires`
 * against — `null` where the backend is not on offer, a set where it is. This is
 * `DeviceOffer` with the reason a backend might still not draw a graph it could
 * build: the language routes the graph to a backend (selection), and the
 * capabilities say whether that backend has what the graph declared it needs
 * (refusal). Both facts come from the live browser and are gathered once, the way
 * `DeviceOffer` is, so `resolve` below is a pure reading testable on any machine.
 */
export interface DeviceProfile {
  /** WebGPU's capabilities where an adapter returned one, `null` where none did. */
  webgpu: ReadonlySet<Capability> | null;
  /** WebGL 2's capabilities where a context could be had, `null` where none could. */
  webgl2: ReadonlySet<Capability> | null;
}

/** The capabilities every WebGPU device has, whatever optional features it adds:
 * compute, storage buffers and textures, indirect draw and dispatch, occlusion
 * queries and 4× multisampling are core to the API, so a graph needing only these
 * is never refused by a WebGPU device. */
const WEBGPU_CORE: readonly Capability[] = [
  'compute',
  'storage-buffer',
  'storage-texture',
  'indirect',
  'occlusion',
  'msaa',
];

/** The optional WebGPU capabilities and the `GPUFeatureName` that grants each, so
 * the mapping from a device's reported features to §10's names lives in one place
 * rather than being read off a feature string at a call site. */
const WEBGPU_OPTIONAL: readonly [Capability, string][] = [
  ['timestamp', 'timestamp-query'],
  ['float-blend', 'float32-blendable'],
  ['depth-clamp', 'depth-clip-control'],
  ['bgra-storage', 'bgra8unorm-storage'],
];

/**
 * The §10 capabilities a WebGPU device has, read from the features it reports.
 * Pure: it takes the feature names — `device.features`, an iterable of strings —
 * and returns the capability set, so the mapping is testable without a device.
 */
export function webgpuCapabilities(features: Iterable<string>): ReadonlySet<Capability> {
  const has = new Set(features);
  const capabilities = new Set<Capability>(WEBGPU_CORE);
  for (const [capability, feature] of WEBGPU_OPTIONAL) if (has.has(feature)) capabilities.add(capability);
  return capabilities;
}

/** The optional WebGL 2 capabilities and the extension name that grants each. The
 * list is short because WebGL 2 has none of §10's headline capabilities — no
 * compute, storage, indirect, timestamp or occlusion — and `float-blend` is the
 * one on this list an extension can turn on. */
const WEBGL2_OPTIONAL: readonly [Capability, string][] = [['float-blend', 'EXT_float_blend']];

/**
 * The §10 capabilities a WebGL 2 context has, read from the extensions it lists.
 * `msaa` is always present — WebGL 2 guarantees multisampled renderbuffers — and
 * the rest of §10's list is the WebGPU-only set the honest answer of §10 names, so
 * a graph requiring `compute` (or storage, indirect, timestamp, occlusion) is
 * refused here by that name. Pure: it takes the extension names, not the context.
 */
export function webgl2Capabilities(extensions: Iterable<string>): ReadonlySet<Capability> {
  const has = new Set(extensions);
  const capabilities = new Set<Capability>(['msaa']);
  for (const [capability, extension] of WEBGL2_OPTIONAL) if (has.has(extension)) capabilities.add(capability);
  return capabilities;
}

/**
 * Selection first, refusal second (§10), as one reading over a graph and a device.
 *
 * The graph's language routes it to a backend across what the device offers
 * (`selectBackend`); the graph's `requires` are then read against that backend's
 * capabilities (`refusal`). A graph a backend both speaks and has the capabilities
 * for returns that backend; a graph whose backend lacks a capability it needs
 * returns the refusal naming the capability rather than the backend it could have
 * drawn on.
 *
 * Where selection comes back empty — no offered backend speaks the graph's
 * language — the answer is still a capability refusal wherever the graph declares
 * a requirement an offered backend lacks, because the capability is the fact a
 * caller can act on (§10): a WGSL compute graph on a WebGL 2 machine is told it
 * needs `compute`, not merely that no WebGPU adapter came back. Only where no
 * offered backend is missing a required capability does the bare language refusal
 * stand. **No backend method is consulted and none throws:** capability lives in
 * the graph's `requires` and the device's reported features as data, so this is a
 * reading over two records, which is the whole of §17 decision 2.
 */
export function resolve(
  frame: Pick<FrameGraph, 'id' | 'target' | 'requires'>,
  device: DeviceProfile
): BackendSelection {
  const offer: DeviceOffer = { webgpu: device.webgpu !== null, webgl2: device.webgl2 !== null };
  const selection = selectBackend(frame, offer);
  if ('backend' in selection) {
    // The selected backend is on offer, so its entry is a set rather than null.
    const capabilities = selection.backend === 'webgpu' ? device.webgpu! : device.webgl2!;
    const named = refusal(frame, { backend: selection.backend, capabilities });
    return named ? { refusal: named } : selection;
  }
  // Selection empty. Name the missing capability of an offered backend where the
  // graph requires one it lacks, preferring the richer backend so the message
  // names what the graph needs rather than which adapter did not come back.
  for (const backend of ['webgpu', 'webgl2'] as const) {
    const capabilities = device[backend];
    if (!capabilities) continue;
    const named = refusal(frame, { backend, capabilities });
    if (named) return { refusal: named };
  }
  return selection;
}
