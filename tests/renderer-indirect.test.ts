import { describe, expect, it } from 'vitest';
import { createWebGPUBackend } from '../renderer/webgpu';
import { createFakeGPU } from './support/fake-gpu';
import type { BufferResource, ShaderFrame } from '@altpsyche/engine';

/**
 * A draw and a dispatch whose counts come out of a buffer rather than out of the
 * description.
 *
 * Every frame before this one says how much work it does when it is written. This
 * one says nothing: the words at the start of a buffer are what the card reads,
 * and an earlier pass of the same frame is what put them there, so how many copies
 * of a shape appear was decided on the card a moment before they were drawn.
 *
 * What a trace can say about such a call is which buffer was handed over and at
 * what offset. The counts are never read back on this side, so whether the right
 * numbers were in there is a picture rather than a trace, and that is the preset's
 * to answer.
 */

const PLANS = `struct Uniforms { u_time: f32, u_resolution: vec2<f32> };
@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read_write> counts: array<u32>;
@group(0) @binding(2) var picture: texture_storage_2d<rgba8unorm, write>;

@compute @workgroup_size(1)
fn plan() {
  counts[0] = u32(uniforms.u_time);
}

@compute @workgroup_size(8, 8)
fn paint(@builtin(global_invocation_id) at: vec3<u32>) {
  textureStore(picture, vec2<i32>(at.xy), vec4<f32>(1.0));
}

@fragment
fn shade(@builtin(position) at: vec4<f32>) -> @location(0) vec4<f32> {
  return vec4<f32>(at.xy / uniforms.u_resolution, 0.0, 1.0);
}`;

const counts = (over: Partial<BufferResource> = {}): BufferResource => ({
  kind: 'buffer',
  name: 'counts',
  bytes: 32,
  access: 'read-write',
  ...over,
});

const VERTICES = new Uint8Array(9 * 16);
const INDICES = new Uint8Array(24 * 2);

const planned = (over: Partial<ShaderFrame> = {}): ShaderFrame => ({
  id: 'fixture-indirect',
  target: 'wgsl',
  uniforms: [
    { name: 'u_time', type: 'float' },
    { name: 'u_resolution', type: 'vec2' },
  ],
  resources: [
    { kind: 'uniform', name: 'uniforms', block: [{ name: 'u_time', offset: 0, size: 4 }] },
    counts(),
    { kind: 'texture', name: 'picture', size: ['frame', 'frame'], format: 'rgba8unorm', use: ['storage'] },
  ],
  modules: [{ name: 'wgsl', code: PLANS }],
  pipelines: [
    {
      kind: 'compute',
      name: 'plan',
      compute: { module: 'wgsl', entry: 'plan' },
      bindings: [
        { group: 0, binding: 0, resource: 'uniforms', visibility: ['compute'] },
        { group: 0, binding: 1, resource: 'counts', visibility: ['compute'] },
      ],
      workgroup: [1, 1, 1],
    },
    {
      kind: 'compute',
      name: 'paint',
      compute: { module: 'wgsl', entry: 'paint' },
      bindings: [{ group: 0, binding: 2, resource: 'picture', visibility: ['compute'] }],
      workgroup: [8, 8, 1],
    },
    {
      kind: 'render',
      name: 'shade',
      vertex: 'fullscreen',
      fragment: { module: 'wgsl', entry: 'shade' },
      bindings: [{ group: 0, binding: 0, resource: 'uniforms', visibility: ['fragment'] }],
    },
  ],
  passes: [
    { pipeline: 'plan', dispatch: [1, 1, 1] },
    { pipeline: 'paint', dispatch: { indirect: 'counts' } },
    { pipeline: 'shade', draws: [{ indirect: 'counts' }] },
  ],
  ...over,
});

/** The same frame with geometry under the drawn pass, which is the one thing that
 * changes which of the two indirect draw calls the card is given. */
const ordered = (over: Partial<ShaderFrame> = {}): ShaderFrame => {
  const base = planned();
  return planned({
    resources: [
      ...base.resources,
      {
        kind: 'vertices',
        name: 'grid',
        stride: 16,
        attributes: [
          { location: 0, offset: 0, format: 'float32x2' },
          { location: 1, offset: 8, format: 'float32x2' },
        ],
        topology: 'triangle-list',
        count: 9,
        indices: 'gridIndices',
        data: VERTICES,
      },
      { kind: 'indices', name: 'gridIndices', format: 'uint16', count: 24, data: INDICES },
    ],
    pipelines: [
      ...base.pipelines.slice(0, 2),
      {
        kind: 'render',
        name: 'shade',
        vertex: 'fullscreen',
        fragment: { module: 'wgsl', entry: 'shade' },
        geometry: 'grid',
        bindings: [{ group: 0, binding: 0, resource: 'uniforms', visibility: ['fragment'] }],
      },
    ],
    ...over,
  });
};

function backendOver() {
  const gpu = createFakeGPU({ connected: false });
  const backend = createWebGPUBackend(gpu.canvas, gpu.device);
  if (!backend) throw new Error('the fake canvas gave no WebGPU context');
  backend.resize(800, 600);
  return { gpu, backend };
}

describe('a pass whose count comes out of a buffer', () => {
  it('hands the card the buffer and nothing else for a dispatch', () => {
    const { gpu, backend } = backendOver();
    const program = backend.program(planned());
    program.draw();

    expect(gpu.calls('dispatchWorkgroupsIndirect').map((call) => [call.buffer, call.offset])).toEqual([['counts', 0]]);
    // The first pass still counts its own blocks, so a frame with one of each has
    // one call of each kind rather than both being read from a buffer.
    expect(gpu.calls('dispatchWorkgroups').map((call) => [call.x, call.y, call.z])).toEqual([[1, 1, 1]]);
  });

  it('hands it the buffer for a draw covering the frame with the backend’s own corners', () => {
    const { gpu, backend } = backendOver();
    const program = backend.program(planned());
    program.draw();

    expect(gpu.calls('drawIndirect').map((call) => [call.buffer, call.offset])).toEqual([['counts', 0]]);
    expect(gpu.calls('draw')).toEqual([]);
  });

  it('reads five words instead of four where the geometry carries indices, and binds it first', () => {
    const { gpu, backend } = backendOver();
    const program = backend.program(ordered());
    program.draw();

    expect(gpu.calls('drawIndexedIndirect').map((call) => [call.buffer, call.offset])).toEqual([['counts', 0]]);
    expect(gpu.calls('drawIndirect')).toEqual([]);
    // Which vertices the card reads and how many of them it reads are two
    // questions, and only the second is in the buffer.
    expect(gpu.calls('setVertexBuffer').map((call) => call.buffer)).toEqual(['grid']);
    expect(gpu.calls('setIndexBuffer').map((call) => [call.buffer, call.format])).toEqual([['gridIndices', 'uint16']]);
  });

  it('asks for the buffer to be readable as counts as well as writable by the shader', () => {
    const { gpu, backend } = backendOver();
    backend.program(planned());

    expect(gpu.calls('createBuffer').find((call) => call.label === 'counts')?.usage).toBe(
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.INDIRECT
    );
  });

  it('leaves a buffer no pass reads counts from without that flag', () => {
    const { gpu, backend } = backendOver();
    backend.program(
      planned({
        passes: [
          { pipeline: 'plan', dispatch: [1, 1, 1] },
          { pipeline: 'paint', dispatch: 'frame' },
          { pipeline: 'shade', draws: [{ vertices: 3 }] },
        ],
      })
    );

    expect(gpu.calls('createBuffer').find((call) => call.label === 'counts')?.usage).toBe(
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
    );
  });
});

describe('what a count read out of a buffer is refused for', () => {
  const refused = (frame: ShaderFrame, message: string) => {
    const { backend } = backendOver();
    expect(() => backend.program(frame)).toThrow(message);
  };

  it('naming something that is not a buffer at all', () => {
    refused(
      planned({
        passes: [
          { pipeline: 'plan', dispatch: [1, 1, 1] },
          { pipeline: 'paint', dispatch: { indirect: 'picture' } },
          { pipeline: 'shade', draws: [{ vertices: 3 }] },
        ],
      }),
      'the frame for "fixture-indirect" reads its counts from "picture", which is no buffer it declares'
    );
  });

  it('naming a buffer shorter than the three words a dispatch reads', () => {
    refused(
      planned({
        resources: [planned().resources[0] as BufferResource, counts({ bytes: 8 }), planned().resources[2]!],
        passes: [
          { pipeline: 'plan', dispatch: [1, 1, 1] },
          { pipeline: 'paint', dispatch: { indirect: 'counts' } },
          { pipeline: 'shade', draws: [{ vertices: 3 }] },
        ],
      }),
      'the frame for "fixture-indirect" reads 12 bytes of counts from "counts", which is 8 bytes'
    );
  });

  it('naming a buffer shorter than the four words a draw reads', () => {
    refused(
      planned({
        resources: [planned().resources[0] as BufferResource, counts({ bytes: 12 }), planned().resources[2]!],
        passes: [
          { pipeline: 'plan', dispatch: [1, 1, 1] },
          { pipeline: 'paint', dispatch: 'frame' },
          { pipeline: 'shade', draws: [{ indirect: 'counts' }] },
        ],
      }),
      'the frame for "fixture-indirect" reads 16 bytes of counts from "counts", which is 12 bytes'
    );
  });

  it('naming a buffer shorter than the five words an indexed draw reads', () => {
    refused(
      ordered({
        resources: [
          planned().resources[0] as BufferResource,
          counts({ bytes: 16 }),
          planned().resources[2]!,
          ...ordered().resources.slice(3),
        ],
      }),
      'the frame for "fixture-indirect" reads 20 bytes of counts from "counts", which is 16 bytes'
    );
  });
});
