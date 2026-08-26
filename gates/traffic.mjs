// The resident traffic of a few representative frames, printed beside each
// frame's per-frame cost.
//
//   node gates/traffic.mjs
//
// This is not a gate. It asserts nothing and fails nothing; it draws each frame
// once against the recording double — no card, no browser — and prints two
// readings side by side for it:
//
//   cost(graph, size)  — passes, draws, dispatches, pipeline and bind switches,
//                        attachment loads and stores, transient bytes. Pure and
//                        deterministic, the same numbers on any machine (item 21).
//   arena.traffic()    — bytes written once into a resource's first contents, and
//                        bytes uploaded into one already made (item 22).
//
// The two are printed **apart and are never summed**, per RoadToPureEngine.md §12
// point 6 and §17 decision 9. A frame that uploads a great deal and draws three
// things has a resident problem, not a per-frame one, and one merged number would
// hide which. `cost().transientBytes` and `traffic()` also measure different
// resources — a transient scratch target the frame allocates versus the resident
// bytes a page fed in — so they are three columns rather than one total.
//
// It reaches the backend through the recording double the fast suite uses, so the
// traffic it prints is what the shipped backend tallies rather than a restatement
// of it: the arena counts the bytes at the writeBuffer calls the backend already
// makes, and this only reads `backend.traffic()` afterwards. The frames are built
// here as plain graphs rather than loaded from the corpus, because the node corpus
// loader is broken independently of this reading (ROADMAP.md item 64); a frame
// here is the smallest one that moves each traffic category.
import { loadFromRoot } from './lib.mjs';

const W = Number(process.env.W ?? 800);
const H = Number(process.env.H ?? 600);

const { cost } = await loadFromRoot('graph/cost.ts');
const { createWebGPUBackend } = await loadFromRoot('gpu/webgpu.ts');
const { createFakeGPU } = await loadFromRoot('tests/support/fake-gpu.ts');
const { buffer, uniform, vertices, indices, moduleHandle, pipelineHandle } = await loadFromRoot('graph/handles.ts');

// A frame drawing geometry through a uniform block: the geometry and its indices
// are written once at build, the uniform block is uploaded every frame.
const GRID_SOURCE = `struct Uniforms { u_time: f32, u_resolution: vec2<f32> };
@group(0) @binding(0) var<uniform> uniforms: Uniforms;
struct Vertex { @builtin(position) at: vec4<f32>, @location(0) place: vec2<f32> };
@vertex fn warp(@location(0) corner: vec2<f32>, @location(1) place: vec2<f32>) -> Vertex {
  return Vertex(vec4<f32>(corner, 0.0, 1.0), place);
}
@fragment fn shade(v: Vertex) -> @location(0) vec4<f32> {
  return vec4<f32>(v.place, uniforms.u_time, 1.0);
}`;

/** @type {import('../graph/types.js').FrameGraph} */
const gridFrame = {
  id: 'grid',
  authored: 'wgsl',
  // uniforms=0, grid=1, gridIndices=2; module wgsl=0; pipeline warp=0.
  resources: [
    { kind: 'uniform', block: [{ name: 'u_time', offset: 0, size: 4 }] },
    {
      kind: 'vertices',
      stride: 16,
      attributes: [
        { location: 0, offset: 0, format: 'float32x2' },
        { location: 1, offset: 8, format: 'float32x2' },
      ],
      topology: 'triangle-list',
      count: 9,
      indices: indices(2),
      data: new Uint8Array(9 * 16),
    },
    { kind: 'indices', format: 'uint16', count: 24, data: new Uint8Array(24 * 2) },
  ],
  modules: [],
  pipelines: [
    {
      kind: 'render',
      source: { wgsl: { vertex: GRID_SOURCE, fragment: GRID_SOURCE } },
      vertex: { document: 'wgsl', entry: 'warp' },
      fragment: { document: 'wgsl', entry: 'shade' },
      geometry: vertices(1),
      bindings: [{ group: 0, binding: 0, resource: uniform(0), visibility: ['fragment'] }],
    },
  ],
  passes: [{ pipeline: pipelineHandle(0), draws: [{ instances: 3 }] }],
};

// A compute frame writing a storage buffer whose first contents arrive with it:
// the buffer's data is written once, the uniform block is uploaded each frame,
// and the frame declares no transient of its own — so cost().transientBytes is
// zero while traffic() is not, which is the distinction this reading exists to
// keep.
const COMPUTE_SOURCE = `struct Uniforms { u_time: f32, u_resolution: vec2<f32> };
@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read_write> tally: array<u32>;
@compute @workgroup_size(1) fn plan() { tally[0] = u32(uniforms.u_time); }`;

/** @type {import('../graph/types.js').FrameGraph} */
const computeFrame = {
  id: 'compute',
  authored: 'wgsl',
  // uniforms=0, tally=1; module wgsl=0; pipeline plan=0.
  resources: [
    { kind: 'uniform', block: [{ name: 'u_time', offset: 0, size: 4 }] },
    { kind: 'buffer', bytes: 256, access: 'read-write', data: new Uint8Array(256) },
  ],
  modules: [{ name: 'wgsl', wgsl: COMPUTE_SOURCE }],
  pipelines: [
    {
      kind: 'compute',
      compute: { module: moduleHandle(0), entry: 'plan' },
      bindings: [
        { group: 0, binding: 0, resource: uniform(0), visibility: ['compute'] },
        { group: 0, binding: 1, resource: buffer(1), visibility: ['compute'] },
      ],
      workgroup: [1, 1, 1],
    },
  ],
  passes: [{ pipeline: pipelineHandle(0), groups: [1, 1, 1] }],
};

const frames = [
  { frame: gridFrame, values: { u_time: 1, u_resolution: [W, H] } },
  { frame: computeFrame, values: { u_time: 1, u_resolution: [W, H] } },
];

const idWidth = Math.max(...frames.map((f) => (f.frame.id ?? '').length), 'frame'.length);
/** @param {unknown} text @param {number} width */
const pad = (text, width) => String(text).padEnd(width);
/** @param {unknown} value @param {number} width */
const num = (value, width = 8) => String(value).padStart(width);

console.log(`\nresident traffic beside per-frame cost, at ${W}x${H} — two readings, never summed\n`);
console.log(
  `${pad('frame', idWidth)}  | ${pad('cost: passes draw disp pipe bind load store  transientB', 58)} | traffic: writtenB uploadedB`
);
console.log(`${'-'.repeat(idWidth)}  | ${'-'.repeat(58)} | ${'-'.repeat(28)}`);

for (const { frame, values } of frames) {
  const gpu = createFakeGPU({ connected: false });
  const backend = createWebGPUBackend(gpu.canvas, gpu.device);
  if (!backend) throw new Error('the fake canvas gave no WebGPU context');
  backend.resize(W, H);
  const program = backend.program(frame);
  program.setUniforms(values);
  program.draw();
  const traffic = backend.traffic();
  const c = cost(frame, { width: W, height: H });
  program.dispose();
  backend.dispose();

  console.log(
    `${pad(frame.id, idWidth)}  | ${num(c.passes, 6)}${num(c.draws)}${num(c.dispatches)}${num(c.pipelineSwitches)}${num(c.bindSwitches)}${num(c.attachmentLoads)}${num(c.attachmentStores)}${num(c.transientBytes, 12)} | ${num(traffic.written, 9)} ${num(traffic.uploaded, 9)}`
  );
}

console.log('');
