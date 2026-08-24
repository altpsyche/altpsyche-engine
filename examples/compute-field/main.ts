/**
 * The third example: a compute shader that writes a storage texture a blit shows.
 *
 * This is the compute toy tier of §17. There is no triangle and no fragment
 * stage: a compute pass runs over the frame in blocks, writes a colour into every
 * pixel of a storage texture, and the frame names that texture as its picture so
 * the backend copies it onto the canvas. WGSL selects WebGPU (§17 decision 6), and
 * a compute pass over a storage texture is the two capabilities `compute` and
 * `storage-texture`, declared on the frame's `requires`.
 *
 * On a WebGL 2 machine those capabilities are absent, so the frame cannot draw.
 * The example does what §10 lays out — selection first, then refusal — by hand,
 * because the end-to-end wiring of `graph.requires` against `device.capabilities`
 * is item 51 and is not in the library yet: `selectBackend` answers which backend
 * draws this across what the device offers, and only when that comes back empty is
 * `refusal` read for the message a page prints instead of showing a black
 * rectangle. It names the capability rather than the backend, so a reader learns
 * what is missing rather than only that something is.
 *
 * Like every example it reaches the library through the one door and nothing under
 * it. It authors the frame from the raw description surface — `frameOf`, the types,
 * `uniformBlockOf` — because the door ships no compute-frame builder today; a
 * fullscreen fragment has `wgslFrame` and a compute field does not.
 */
import {
  frameOf,
  uniformBlockOf,
  refusal,
  selectBackend,
  requestWebGPUDevice,
  createSurface,
  WGSL_DOCUMENT,
} from '@altpsyche/engine';
import type { Capability, FrameDescription } from '@altpsyche/engine';

// The compute source: a plasma written one pixel at a time. The uniform block is
// the clock and the picture's size, gathered into one struct behind the uniform
// binding the way WGSL requires; `uniformBlockOf` lays it out from this text so a
// field added here is never a written-down offset that drifts from the struct.
const SOURCE = `
struct Uniforms {
    u_time: f32,
    u_resolution: vec2<f32>,
};

@binding(0) @group(0) var<uniform> uniforms: Uniforms;
@binding(1) @group(0) var picture: texture_storage_2d<rgba8unorm, write>;

@compute @workgroup_size(8, 8, 1)
fn paint(@builtin(global_invocation_id) cell: vec3<u32>) {
    // The last block of a row runs past the picture when the width does not
    // divide by the block size, and a write outside the texture is thrown away
    // rather than reported, so the pixels that are not there return first.
    let size = textureDimensions(picture);
    if (cell.x >= size.x || cell.y >= size.y) {
        return;
    }

    let uv = vec2<f32>(f32(cell.x), f32(cell.y)) / uniforms.u_resolution;
    let t = uniforms.u_time;

    // Three travelling sine waves summed, then split across the colour channels a
    // third of a turn apart, which is what turns one height into a moving plasma
    // rather than a grey band.
    let wave = sin(uv.x * 10.0 + t)
             + sin((uv.y * 10.0 - t) * 0.8)
             + sin((uv.x + uv.y) * 10.0 + t);
    let shade = 0.5 + 0.5 * sin(wave + vec3<f32>(0.0, 2.094, 4.188));

    textureStore(picture, vec2<i32>(i32(cell.x), i32(cell.y)), vec4<f32>(shade, 1.0));
}`;

// The uniforms a page feeds by name, which is what a control panel is drawn from.
const UNIFORMS = [
  { name: 'u_time', type: 'float' },
  { name: 'u_resolution', type: 'vec2' },
];

// The frame's structure: one storage texture the size of the frame, one compute
// pipeline over it, one pass dispatched over the whole frame, and the texture
// named as the picture so the backend copies it onto the canvas. The bindings are
// the source's own — the uniform block at 0 and the storage texture at 1, both
// reached only by the compute stage.
const DESCRIPTION: FrameDescription = {
  target: 'wgsl',
  resources: [
    { kind: 'uniform', name: 'uniforms' },
    {
      kind: 'texture',
      name: 'picture',
      // Frame-sized, so the picture still covers the canvas after a resize; what
      // it held is gone when it is rebuilt, which is what a shader writing every
      // pixel of it every frame wants.
      size: ['frame', 'frame'],
      format: 'rgba8unorm',
      use: ['storage'],
    },
  ],
  documents: [{ name: WGSL_DOCUMENT }],
  pipelines: [
    {
      kind: 'compute',
      name: 'paint',
      compute: { module: WGSL_DOCUMENT, entry: 'paint' },
      bindings: [
        { group: 0, binding: 0, resource: 'uniforms', visibility: ['compute'] },
        { group: 0, binding: 1, resource: 'picture', visibility: ['compute'], reads: 'storage' },
      ],
      // The block one run of the program covers, which is what the dispatch count
      // is worked out against; it matches the source's own `@workgroup_size`.
      workgroup: [8, 8, 1],
    },
  ],
  // The whole frame in blocks of the workgroup size, so an edge that does not
  // divide by the block size is covered by a block running past it.
  passes: [{ pipeline: 'paint', dispatch: 'frame' }],
  present: 'picture',
};

// The frame the backend draws, with the block laid out from the source and the
// two capabilities it depends on declared. `requires` is what `refusal` reads a
// graph against a device, and where selection comes back empty it is what names
// what was missing rather than showing nothing.
const frame = {
  ...frameOf('compute-field', DESCRIPTION, { [WGSL_DOCUMENT]: SOURCE }, UNIFORMS, uniformBlockOf(SOURCE)),
  requires: ['compute', 'storage-texture'] as readonly Capability[],
};

// What core WebGL 2 has of the ten capabilities §10 names. It guarantees
// multisampled renderbuffers and nothing else on this list — no compute and no
// storage textures. This set is hand-wired here only because item 51, which feeds
// a live backend's own `device.capabilities` to selection and refusal, is not
// landed yet; when it is, this example reads the real report rather than this.
const WEBGL2_CAPABILITIES: ReadonlySet<Capability> = new Set<Capability>(['msaa']);

const canvas = document.querySelector('canvas') as HTMLCanvasElement;

// Ask for a WebGPU card first, because whether asking returns one is the fact
// selection reads — a browser can report the API and then hand back nothing. A
// WebGL 2 context is offered wherever the canvas gives one; this example never
// draws through it, but its presence is what makes selection a choice rather than
// a foregone refusal.
const device = await requestWebGPUDevice();
const offer = {
  webgpu: device !== null,
  webgl2: canvas.getContext('webgl2') !== null,
};

const selection = selectBackend(frame, offer);

if ('backend' in selection && selection.backend === 'webgpu' && device) {
  // WebGPU drew the frame: the compute pass writes the storage texture and the
  // backend copies it onto the canvas every frame.
  const surface = await createSurface(canvas, frame, {
    backend: 'webgpu',
    device,
    uniforms: () => ({
      u_time: performance.now() / 1000,
      u_resolution: [canvas.width, canvas.height],
    }),
    onError: (message) => showMessage(message),
  });

  if (!surface) {
    showMessage('WebGPU was selected and then would not give this page a device');
  } else {
    const fit = () => surface.resize(canvas.clientWidth, canvas.clientHeight);
    addEventListener('resize', fit);
    fit();
    surface.start();
  }
} else {
  // Selection came back empty, which on a WebGL 2 machine is a WGSL frame with no
  // WebGPU adapter. Now — and only now, per §10 — read `refusal` for the message
  // that names the capabilities the device lacks, and print it rather than leaving
  // a black rectangle. Its null answer (a device that had them all) cannot arise
  // on this arm, so the selection refusal is the fallback that keeps the message
  // non-empty whatever the device.
  const message =
    refusal(frame, { backend: 'webgl2', capabilities: WEBGL2_CAPABILITIES }) ??
    ('refusal' in selection ? selection.refusal : 'this frame cannot be drawn here');
  showMessage(message);
}

/** Show a line of text over the canvas, which is what a refusal reads as: the
 * page said why rather than showing a black rectangle. It is the example's own
 * DOM to write, the way `onError` is the example's own console to print to. */
function showMessage(message: string): void {
  console.error(message);
  const banner = document.createElement('pre');
  banner.textContent = message;
  banner.style.cssText =
    'position:fixed;inset:0;margin:auto;max-width:40rem;height:max-content;' +
    'padding:1.5rem;color:#eee;font:16px/1.5 ui-monospace,monospace;white-space:pre-wrap;';
  document.body.appendChild(banner);
}
