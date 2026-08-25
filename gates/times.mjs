// The per-pass GPU times a frame's timestamp queries already gather, printed as
// the one reading in this renderer with no picture behind it (item 54).
//
//   node gates/times.mjs
//
// This is not a gate. It asserts nothing and fails nothing — a wall-clock number
// is the device's and the moment's, not the structure's, so pinning one would be
// a flake within a month (item 55's warning, and why this is Reported, never
// asserted). It draws one frame whose passes are each `timed`, reads the pair of
// timestamps each pass resolved into its own buffer, and prints the elapsed time
// per pass.
//
// A timed pass writes one timestamp as it opens and one as it closes into a
// two-answer query set, resolved into the buffer the pass names (gpu/webgpu.ts,
// and RoadToPureEngine.md's readings-not-a-matrix). The queries "already work and
// are read by nothing" — this is the nothing that now reads them. `readBuffer`
// hands back the pair as a Uint32Array; each timestamp is a little-endian u64
// (two words), and the elapsed nanoseconds is the second minus the first.
//
// **Only where the device supports them.** A device without the optional
// `timestamp-query` feature draws the frame untimed and leaves the buffers as it
// found them (the backend's own fallback), so this prints one honest line saying
// the reading was unavailable rather than a column of zeroes dressed as timings.
//
// It reaches the backend through the recording double the fast suite uses — no
// card, no browser — so what runs here exercises the read path end to end but
// cannot produce a real timing: the double's `resolveQuerySet` moves no bytes, so
// each pair reads back zero. A real card is what fills these in, which is the
// standing shape of every wall-clock reading here (§17 note 3).
import { loadFromRoot } from './lib.mjs';

const W = Number(process.env.W ?? 800);
const H = Number(process.env.H ?? 600);

const { createWebGPUBackend } = await loadFromRoot('gpu/webgpu.ts');
const { createFakeGPU } = await loadFromRoot('tests/support/fake-gpu.ts');

// One frame, two passes, each timed into a buffer of its own: a compute pass that
// writes a storage buffer and a render pass that shows a colour. The two timing
// buffers carry nothing but the pair of timestamps their pass resolves into them.
const SOURCE = `struct Uniforms { u_time: f32, u_resolution: vec2<f32> };
@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read_write> tally: array<u32>;
@compute @workgroup_size(1) fn plan() { tally[0] = u32(uniforms.u_time); }
@fragment fn paint() -> @location(0) vec4f { return vec4f(uniforms.u_time, 0.0, 0.0, 1.0); }`;

/** @type {import('../graph/types.js').FrameGraph} */
const frame = {
  id: 'timed',
  target: 'wgsl',
  resources: [
    { kind: 'uniform', name: 'uniforms', block: [{ name: 'u_time', offset: 0, size: 4 }] },
    { kind: 'buffer', name: 'tally', bytes: 16, access: 'read-write', data: new Uint8Array(16) },
    { kind: 'buffer', name: 'computeTime', bytes: 16, access: 'read-write' },
    { kind: 'buffer', name: 'renderTime', bytes: 16, access: 'read-write' },
  ],
  modules: [{ name: 'wgsl', code: SOURCE }],
  pipelines: [
    {
      kind: 'compute',
      name: 'plan',
      compute: { module: 'wgsl', entry: 'plan' },
      bindings: [
        { group: 0, binding: 0, resource: 'uniforms', visibility: ['compute'] },
        { group: 0, binding: 1, resource: 'tally', visibility: ['compute'] },
      ],
      workgroup: [1, 1, 1],
    },
    {
      kind: 'render',
      name: 'paint',
      vertex: 'fullscreen',
      fragment: { module: 'wgsl', entry: 'paint' },
      bindings: [{ group: 0, binding: 0, resource: 'uniforms', visibility: ['fragment'] }],
    },
  ],
  // Each pass names the buffer its timestamp pair resolves into: the label a
  // reader below prints against, and the buffer it reads back.
  passes: [
    { pipeline: 'plan', groups: [1, 1, 1], timed: 'computeTime' },
    { pipeline: 'paint', draws: [{ vertices: 3 }], timed: 'renderTime' },
  ],
};

const timedPasses = [
  { label: 'compute (plan)', buffer: 'computeTime' },
  { label: 'render (paint)', buffer: 'renderTime' },
];

/** The elapsed nanoseconds a resolved pair carries: two little-endian u64
 * timestamps, the close minus the open. BigInt because a timestamp does not fit
 * in a double without losing its low bits.
 * @param {Uint32Array} pair */
function elapsedNanos(pair) {
  const open = BigInt(pair[0] ?? 0) | (BigInt(pair[1] ?? 0) << 32n);
  const close = BigInt(pair[2] ?? 0) | (BigInt(pair[3] ?? 0) << 32n);
  return close - open;
}

// The recording double, detached: a run here reaches the fake device, not a card.
const CONNECTED = false;
const gpu = createFakeGPU({ connected: CONNECTED });
const backend = createWebGPUBackend(gpu.canvas, gpu.device);
if (!backend) throw new Error('the fake canvas gave no WebGPU context');
backend.resize(W, H);

const timed = gpu.device.features.has('timestamp-query');

console.log(`\nper-pass GPU times, at ${W}x${H} — reported, never asserted (item 54)\n`);

const program = backend.program(frame);
program.setUniforms({ u_time: 1, u_resolution: [W, H] });
program.draw();

if (!timed) {
  // The device drew the frame untimed and left the buffers alone, so there is no
  // pair to read. One honest line rather than a column of zeroes.
  console.log('timestamp-query is not offered by this device — per-pass times unavailable\n');
} else {
  const labelWidth = Math.max(...timedPasses.map((p) => p.label.length), 'pass'.length);
  console.log(`${'pass'.padEnd(labelWidth)}  |     elapsed`);
  console.log(`${'-'.repeat(labelWidth)}  | -----------`);
  for (const { label, buffer } of timedPasses) {
    const pair = await program.readBuffer(buffer);
    const nanos = elapsedNanos(pair);
    console.log(`${label.padEnd(labelWidth)}  | ${String(nanos)} ns`);
  }
  console.log('');
  if (!CONNECTED) {
    console.log(
      'note: drawn against the recording double, which moves no bytes on resolve — a real card fills these in.\n'
    );
  }
}

program.dispose();
backend.dispose();
