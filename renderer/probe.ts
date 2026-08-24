/**
 * A one-shot reading of what this device is, taken once and handed back whole.
 *
 * It answers decision 11 of [RoadToPureEngine.md](../docs/RoadToPureEngine.md)
 * §17: readings are published, a support matrix is not. A matrix rots on hardware
 * nobody here owns and turns every stale row into a lie; a dated reading a device
 * took of itself does not, because it never claims to be anything but what one
 * machine saw on one day. The package's promise is the capability model of §10 —
 * correct refusal by name on any device, read or unread — and a reading is
 * evidence for that promise, never a dependency of it.
 *
 * The reading carries three states where a careless one carries two. Whether
 * WebGPU was **reported** — `navigator.gpu` is present — is not whether an adapter
 * was **returned** when asked, and neither is whether the device then **survived**
 * a few frames of on-screen compositing. Measured on a software renderer at
 * 200×100, an on-screen WebGPU canvas the browser composited drew three frames and
 * then lost the device with reason `destroyed`, while the same content off the
 * document drew fifty-four frames a second (§17, measured fact two). A reading that
 * stopped at "an adapter came back" would record that one-second death as a
 * success. And requesting the adapter with only `--enable-unsafe-webgpu` reports
 * SwiftShader while WebGL reports the real card, so a reading that trusted the
 * adapter's own name would record a software renderer as hardware — hence the
 * architecture is asserted not to be `swiftshader` rather than merely printed.
 *
 * The judgement here is pure: which backend the offering selects, whether the
 * architecture is software, which raw facts feed the row. What only a browser can
 * do — ask for an adapter, read a renderer string, run a canvas the browser
 * composites — is the host's, injected so the judgement is testable on a machine
 * that never returns a real adapter. That is the same seam `selectBackend`,
 * `validate`, `refusal` and `cost` take, and for the same reason.
 */
import { selectBackend, type DeviceOffer } from './select.js';
import type { BackendName, DeviceReport } from './types.js';

/** The tier that actually ran to produce a reading. Phase 0 draws the toy tier —
 * one fullscreen pass — so that is what a reading records today; the scene and
 * compute tiers name themselves here once a probe draws them. */
export type ProbeTier = 'toy' | 'scene' | 'compute';

/** What one backend said about itself while a reading was taken. Both backends
 * answer the same shape; only WebGPU carries an adapter architecture, because
 * WebGL 2 has no adapter to name one. */
export interface BackendFacts {
  /** The renderer string in the driver's own words — `UNMASKED_RENDERER_WEBGL` on
   * WebGL 2, the adapter's description or vendor on WebGPU. A stranger searches for
   * it, so it is carried verbatim rather than normalised. */
  renderer: string;
  /** The adapter architecture the browser reports, or `unknown` where the API
   * gives none. This is the field the `swiftshader` assertion reads. */
  architecture: string;
  /** Every ceiling and every optional API part this backend read off the device,
   * by the names its own API gives them — the same `report()` a caller reads. */
  report: DeviceReport;
  /** The device drew a few on-screen composited frames without being lost. False
   * is the one-second death decision 11 exists to catch, not an absence of the
   * trial. */
  survivedCompositing: boolean;
}

/**
 * The raw facts a host gathered from the live browser, before any judgement is
 * made about them. A host that cannot reach an adapter reports `webgpu: null`
 * rather than a fabricated one, the same way a card-less browser reports no
 * WebGL 2 context.
 */
export interface ProbeFacts {
  /** `navigator.gpu` was present, whatever asking it for an adapter then did. */
  webgpuReported: boolean;
  /** WebGPU as the device answered it, or null when no adapter came back. */
  webgpu: BackendFacts | null;
  /** WebGL 2 as the context answered it, or null when none could be had. */
  webgl2: BackendFacts | null;
  /** The tier the host drew to take these facts. */
  tier: ProbeTier;
}

/**
 * The browser half of a reading, injected so the pure judgement below is testable
 * without one. A default implementation lives in `browserProbeHost`.
 */
export interface ProbeHost {
  /** The date this reading is stamped with, as an ISO string. A reading with no
   * date is a row that cannot be told from a fresher one, so it is not optional. */
  now(): string;
  /** Everything only a browser can find out, gathered in one pass. */
  gather(): Promise<ProbeFacts>;
}

/**
 * A dated reading of one device: what was reported, what was returned, what
 * survived, and what it says it is. Every field decision 11 names is here, and
 * `docs/DEVICES.md` carries rows shaped exactly like this.
 */
export interface DeviceReading {
  /** When the reading was taken, ISO. */
  date: string;
  /** The backend the offering selected for the tier that ran, or null when
   * nothing this device offers could draw it. */
  backend: BackendName | null;
  /** `navigator.gpu` was present. */
  webgpuReported: boolean;
  /** Asking for an adapter actually returned one. */
  adapterReturned: boolean;
  /** The selected backend's device survived a few frames of on-screen compositing.
   * False where an adapter came back and then died under a second. */
  survivedCompositing: boolean;
  /** The renderer string of the selected backend, verbatim. */
  renderer: string;
  /** The adapter architecture, or `unknown` where the API names none. */
  architecture: string;
  /** The architecture — and the renderer string — is not a software renderer named
   * as hardware. This is the assertion decision 11 requires, carried as data so a
   * row can be read for it rather than a reader trusting the name. */
  notSwiftShader: boolean;
  /** Every optional API part the selected backend has, sorted. */
  features: string[];
  /** Every ceiling the selected backend reports, by its API's own name. */
  limits: Record<string, number>;
  /** The tier that ran. */
  tier: ProbeTier;
}

/** Whether a name a device gives itself is the software renderer. The architecture
 * is the field decision 11 names, and the renderer string is checked too because
 * `--enable-unsafe-webgpu` reports SwiftShader through the WebGL renderer string
 * while the WebGPU adapter architecture is where it shows on that path — either one
 * naming it is enough to fail the assertion. */
function isSwiftShader(architecture: string, renderer: string): boolean {
  return architecture === 'swiftshader' || /swiftshader/i.test(renderer);
}

/**
 * Assemble a reading from gathered facts. Pure: the same facts return the same
 * reading on any machine, which is what lets the judgement be tested without a
 * browser present.
 *
 * The backend is chosen by the same `selectBackend` a frame is routed through, fed
 * the offering these facts describe: a device that returned an adapter offers
 * WebGPU, a device with a WebGL 2 context offers WebGL 2, and a WGSL frame selects
 * the first while a GLSL frame selects the second even where both are offered
 * (§17 decision 6). So a reading records which backend a shader would actually be
 * drawn by, not merely which the device could build.
 */
export function readingOf(facts: ProbeFacts, date: string): DeviceReading {
  const offer: DeviceOffer = { webgpu: facts.webgpu !== null, webgl2: facts.webgl2 !== null };
  // WGSL selects WebGPU where it is offered; a GLSL frame would fall to WebGL 2.
  // Reading the richer backend first is what a toy-tier WGSL probe would select,
  // and the GLSL arm is what is left on a WebGPU-less machine.
  const wgsl = selectBackend({ target: 'wgsl' }, offer);
  const glsl = selectBackend({ target: 'glsl' }, offer);
  const backend: BackendName | null = 'backend' in wgsl ? wgsl.backend : 'backend' in glsl ? glsl.backend : null;

  const source = backend === 'webgpu' ? facts.webgpu : backend === 'webgl2' ? facts.webgl2 : null;
  const renderer = source?.renderer ?? 'none';
  const architecture = source?.architecture ?? 'unknown';

  return {
    date,
    backend,
    webgpuReported: facts.webgpuReported,
    adapterReturned: facts.webgpu !== null,
    survivedCompositing: source?.survivedCompositing ?? false,
    renderer,
    architecture,
    notSwiftShader: !isSwiftShader(architecture, renderer),
    features: source?.report.features ?? [],
    limits: source?.report.limits ?? {},
    tier: facts.tier,
  };
}

/**
 * Take a reading of this device.
 *
 * The host gathers what only a browser can, and the reading is assembled from it
 * here. A caller that hands in a host reads a device it describes; a caller that
 * does not gets the browser host, which asks the machine it is running on.
 */
export async function probe(host: ProbeHost = browserProbeHost()): Promise<DeviceReading> {
  const facts = await host.gather();
  return readingOf(facts, host.now());
}

/**
 * One line a stranger can paste into a pull request. Every field on its own row so
 * a reader skims it, and the two assertions — survived, not SwiftShader — read as
 * words rather than as booleans a reader has to invert.
 */
export function readingRow(reading: DeviceReading): string {
  return [
    `date            ${reading.date}`,
    `backend         ${reading.backend ?? 'none selected'}`,
    `tier            ${reading.tier}`,
    `webgpu          ${reading.webgpuReported ? 'reported' : 'not reported'}, adapter ${reading.adapterReturned ? 'returned' : 'not returned'}`,
    `compositing     ${reading.survivedCompositing ? 'survived a few on-screen frames' : 'DID NOT survive on-screen compositing'}`,
    `renderer        ${reading.renderer}`,
    `architecture    ${reading.architecture} (${reading.notSwiftShader ? 'not swiftshader' : 'SWIFTSHADER — a software renderer named as hardware'})`,
    `features        ${reading.features.length ? reading.features.join(', ') : 'none'}`,
    `limits          ${Object.keys(reading.limits).length} reported`,
  ].join('\n');
}

/**
 * The browser host: everything a reading needs that a machine has to be a browser
 * to answer. It reaches the backends through `await import()`, the same split the
 * renderer keeps, so importing `probe` into a card-less browser's first download
 * pulls neither backend in with it.
 *
 * What it does can only be checked where there is a browser and a card to check it
 * on. The pure `readingOf` above is what the node suite holds; this is held by
 * `npm run device-report` on a desktop session and by whoever pastes a row.
 */
export function browserProbeHost(): ProbeHost {
  return {
    now: () => new Date().toISOString().slice(0, 10),
    gather: gatherFromBrowser,
  };
}

/** Draw a few on-screen frames and say whether the device survived them. On a
 * software renderer an on-screen WebGPU canvas has been measured losing the device
 * after three frames, so the canvas is in the document and the frames are spaced
 * across compositing ticks rather than drawn back to back off-screen where the
 * loss does not happen. */
async function survivesCompositing(draw: () => void, lost: Promise<unknown>): Promise<boolean> {
  let alive = true;
  lost.then(() => {
    alive = false;
  });
  for (let frame = 0; frame < 5 && alive; frame++) {
    try {
      draw();
    } catch {
      return false;
    }
    await new Promise((next) => requestAnimationFrame(() => next(undefined)));
  }
  return alive;
}

/** The ceilings a WebGL 2 report reads, by the names the specification gives them.
 * Kept here rather than reaching the WebGL 2 backend for them, so this host stays
 * out of the eager import graph the way the backend does. */
const WEBGL2_CEILINGS = [
  'MAX_TEXTURE_SIZE',
  'MAX_3D_TEXTURE_SIZE',
  'MAX_ARRAY_TEXTURE_LAYERS',
  'MAX_CUBE_MAP_TEXTURE_SIZE',
  'MAX_RENDERBUFFER_SIZE',
  'MAX_COLOR_ATTACHMENTS',
  'MAX_DRAW_BUFFERS',
  'MAX_SAMPLES',
  'MAX_VERTEX_ATTRIBS',
  'MAX_TEXTURE_IMAGE_UNITS',
  'MAX_VERTEX_TEXTURE_IMAGE_UNITS',
  'MAX_UNIFORM_BUFFER_BINDINGS',
  'MAX_UNIFORM_BLOCK_SIZE',
  'MAX_VERTEX_UNIFORM_COMPONENTS',
  'MAX_FRAGMENT_UNIFORM_COMPONENTS',
  'MAX_VARYING_COMPONENTS',
  'MAX_ELEMENTS_INDICES',
  'MAX_ELEMENTS_VERTICES',
  'UNIFORM_BUFFER_OFFSET_ALIGNMENT',
];

function reportOfGL(gl: WebGL2RenderingContext): DeviceReport {
  const named = gl as unknown as Record<string, unknown>;
  const limits: Record<string, number> = {};
  for (const name of WEBGL2_CEILINGS) {
    const pname = named[name];
    if (typeof pname !== 'number') continue;
    const value = gl.getParameter(pname);
    if (typeof value === 'number') limits[name] = value;
  }
  return { limits, features: [...(gl.getSupportedExtensions() ?? [])].sort() };
}

function reportOfDevice(device: GPUDevice): DeviceReport {
  const limits: Record<string, number> = {};
  const reported = device.limits as unknown as Record<string, unknown>;
  for (const name in reported) {
    const value = reported[name];
    if (typeof value === 'number') limits[name] = value;
  }
  return { limits, features: [...device.features].sort() };
}

/**
 * Gather every fact a reading needs from the live browser. Toy tier: one fullscreen
 * canvas, on-screen, so the compositing trial is a trial of what the browser
 * actually composites rather than of an off-document surface that never dies.
 */
async function gatherFromBrowser(): Promise<ProbeFacts> {
  const webgpuReported = typeof navigator !== 'undefined' && !!navigator.gpu;

  let webgpu: BackendFacts | null = null;
  if (webgpuReported) {
    try {
      const adapter = await navigator.gpu!.requestAdapter();
      if (adapter) {
        const device = await adapter.requestDevice({
          requiredFeatures: [...adapter.features] as GPUFeatureName[],
        });
        const canvas = onScreenCanvas();
        const context = canvas.getContext('webgpu');
        const info = adapter.info ?? ({} as GPUAdapterInfo);
        let survived = false;
        if (context) {
          const format = navigator.gpu!.getPreferredCanvasFormat();
          context.configure({ device, format, alphaMode: 'opaque' });
          survived = await survivesCompositing(() => compositeWebGPU(device, context, format), device.lost);
        }
        webgpu = {
          renderer: info.description || info.vendor || 'unknown',
          architecture: info.architecture || 'unknown',
          report: reportOfDevice(device),
          survivedCompositing: survived,
        };
      }
    } catch {
      webgpu = null;
    }
  }

  let webgl2: BackendFacts | null = null;
  const canvas = onScreenCanvas();
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false }) as WebGL2RenderingContext | null;
  if (gl) {
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = debug ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)) : 'not reported';
    const survived = await survivesCompositing(() => compositeGL(gl), never());
    webgl2 = { renderer, architecture: 'unknown', report: reportOfGL(gl), survivedCompositing: survived };
  }

  return { webgpuReported, webgpu, webgl2, tier: 'toy' };
}

/** A promise that never settles, for the WebGL 2 trial: WebGL 2 has no device-lost
 * event to race the frames against, so survival there is whether the draws throw. */
function never(): Promise<never> {
  return new Promise<never>(() => {});
}

function onScreenCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 200;
  canvas.height = 100;
  // On-screen and composited, because the device loss the trial exists to catch
  // only happens for a canvas the browser is compositing, not one off the document.
  canvas.style.position = 'fixed';
  canvas.style.left = '0';
  canvas.style.top = '0';
  document.body.appendChild(canvas);
  return canvas;
}

function compositeGL(gl: WebGL2RenderingContext): void {
  gl.clearColor(0.1, 0.2, 0.3, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.finish();
}

function compositeWebGPU(device: GPUDevice, context: GPUCanvasContext, _format: GPUTextureFormat): void {
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: context.getCurrentTexture().createView(),
        clearValue: { r: 0.1, g: 0.2, b: 0.3, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  });
  pass.end();
  device.queue.submit([encoder.finish()]);
}
