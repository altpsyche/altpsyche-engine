import type { WgslFrameGraph } from '@altpsyche/engine';
import { describe, expect, it } from 'vitest';
import { createWebGPUBackend } from '../gpu/webgpu';
import { createFakeGPU } from './support/fake-gpu';
import { moduleHandle, pipelineHandle, sampler, texture, uniform } from '../graph/handles.js';
import type { FrameGraph } from '@altpsyche/engine';

/**
 * A pair of textures trading places every frame, which is what a field that grows
 * out of its own last state needs.
 *
 * A shader cannot read the texture it is writing, so the state lives in two of
 * them: one is read this frame and written the next. The trade is the backend's,
 * so what is asserted here is that the two bind groups are made once and then
 * alternate, rather than a group being rebuilt every frame or the same texture
 * being read and written at once.
 */

const STATE = `struct Uniforms { u_time: f32, u_resolution: vec2<f32> };
@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var previous: texture_2d<f32>;
@group(0) @binding(2) var next: texture_storage_2d<rgba16float, write>;
@group(0) @binding(3) var stateSampler: sampler;

@compute @workgroup_size(8, 8)
fn step(@builtin(global_invocation_id) cell: vec3<u32>) {
  textureStore(next, vec2<i32>(cell.xy), textureLoad(previous, vec2<i32>(cell.xy), 0));
}

@fragment
fn shade(@builtin(position) pixel: vec4<f32>) -> @location(0) vec4<f32> {
  return textureSample(previous, stateSampler, pixel.xy / uniforms.u_resolution);
}`;

const PAIR = () =>
  ({
    kind: 'texture' as const,
    size: { width: 256, height: 256 },
    format: 'rgba16float' as GPUTextureFormat,
    use: ['storage', 'sample'] as ('storage' | 'sample')[],
  }) as const;

const stateFrame = (over: Partial<WgslFrameGraph> = {}): FrameGraph => ({
  id: 'fixture-state',
  authored: 'wgsl',
  // uniforms=0, previous=1, next=2, stateSampler=3 — each named below by its index.
  resources: [
    { kind: 'uniform', block: [{ name: 'u_time', offset: 0, size: 4 }] },
    PAIR(),
    PAIR(),
    { kind: 'sampler', filter: 'linear', wrap: 'clamp' },
  ],
  modules: [{ name: 'wgsl', wgsl: STATE }],
  pipelines: [
    {
      kind: 'compute',
      compute: { module: moduleHandle(0), entry: 'step' },
      workgroup: [8, 8, 1],
      bindings: [
        { group: 0, binding: 1, resource: texture(1), visibility: ['compute'] },
        { group: 0, binding: 2, resource: texture(2), visibility: ['compute'] },
      ],
    },
    {
      kind: 'render',
      vertex: 'fullscreen',
      fragment: { module: moduleHandle(0), entry: 'shade' },
      bindings: [
        { group: 0, binding: 0, resource: uniform(0), visibility: ['fragment'] },
        { group: 0, binding: 1, resource: texture(1), visibility: ['fragment'] },
        { group: 0, binding: 3, resource: sampler(3), visibility: ['fragment'] },
      ],
    },
  ],
  passes: [
    // The producer's group count (item 72): [32, 32, 1] covers the 256×256 grid
    // the `next` texture holds in whole blocks of the pipeline's 8×8 workgroup,
    // worked out from that fixed size rather than the frame's own by the backend.
    { pipeline: pipelineHandle(0), groups: [32, 32, 1] },
    { pipeline: pipelineHandle(1), draws: [{ vertices: 3 }] },
  ],
  swap: [[texture(1), texture(2)]],
  ...over,
});

function backendOver() {
  const gpu = createFakeGPU({ connected: false });
  const backend = createWebGPUBackend(gpu.canvas, gpu.device);
  if (!backend) throw new Error('the fake canvas gave no WebGPU context');
  backend.resize(800, 600);
  return { gpu, backend };
}

describe('the textures a swapping frame owns', () => {
  it('makes both halves of the pair once and neither of them again on a later frame', () => {
    const { gpu, backend } = backendOver();
    const program = backend.program(stateFrame());
    program.draw();
    program.draw();
    program.draw();

    const pair = gpu.calls('createTexture').filter((call) => JSON.stringify(call.size) === '[256,256]');
    expect(pair).toHaveLength(2);
    expect(pair.map((call) => call.label)).toEqual(['texture1', 'texture2']);
  });

  it('gives both halves the flags for being written and read, since either may be either', () => {
    const { gpu, backend } = backendOver();
    backend.program(stateFrame());

    const pair = gpu.calls('createTexture').filter((call) => JSON.stringify(call.size) === '[256,256]');
    for (const call of pair) {
      expect(call.usage).toBe(GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING);
    }
  });

  it('refuses a pair whose halves are not the same texture, rather than copying out of range', () => {
    const { backend } = backendOver();
    const frame = stateFrame();

    expect(() =>
      backend.program({
        ...frame,
        resources: [frame.resources[0]!, PAIR(), { ...PAIR(), size: { width: 128, height: 128 } }, frame.resources[3]!],
      })
    ).toThrow(/swaps resource 1 and resource 2, which are not the same texture/);
  });

  it('refuses a pair naming a texture the frame never declares', () => {
    const { backend } = backendOver();

    expect(() => backend.program(stateFrame({ swap: [[texture(1), texture(4)]] }))).toThrow(
      /swaps resource 4, which is no texture it declares/
    );
  });
});

describe('the two sets of bind groups', () => {
  it('are made once each, so nothing is rebuilt per frame however long the shader runs', () => {
    const { gpu, backend } = backendOver();
    const program = backend.program(stateFrame());
    program.draw();
    program.draw();
    program.draw();
    program.draw();

    // Two pipelines and two turns, which is four groups for as many frames as
    // the shader draws.
    expect(gpu.calls('createBindGroup')).toHaveLength(4);
  });

  it('bind the pair one way round and then the other, never the same texture twice', () => {
    const { gpu, backend } = backendOver();
    backend.program(stateFrame());

    // A turn's groups are made together, so the four are the compute pass and
    // the render pass on the first turn and then the same two on the second.
    const made = gpu
      .calls('createBindGroup')
      .map((call) => (call.bindings as { resource: string }[]).map((at) => at.resource));
    expect(made[0]).toEqual(['texture1.view', 'texture2.view']);
    expect(made[2]).toEqual(['texture2.view', 'texture1.view']);
  });

  it('give the pass that draws the half the other pass is not writing', () => {
    const { gpu, backend } = backendOver();
    backend.program(stateFrame());

    const made = gpu
      .calls('createBindGroup')
      .map((call) => (call.bindings as { resource: string }[]).map((at) => at.resource));
    expect(made[1]).toEqual(['buffer1', 'texture1.view', 'sampler3']);
    expect(made[3]).toEqual(['buffer1', 'texture2.view', 'sampler3']);
  });

  it('alternate across frames rather than one of them being read every time', () => {
    const { gpu, backend } = backendOver();
    // The picture is read out of whichever half the frame ended on, so the copy
    // out of it is what says which way round the pair was bound.
    const program = backend.program(stateFrame({ present: texture(2) }));
    program.draw();
    program.draw();
    program.draw();
    program.draw();

    // previous is resource 1 (label texture1), next is resource 2 (texture2); the
    // frame presents `next` first, then the swap turns the pair each frame.
    expect(gpu.calls('copyTextureToTexture').map((call) => call.from)).toEqual([
      'texture2',
      'texture1',
      'texture2',
      'texture1',
    ]);
  });

  it('are named for the pipeline and the turn, so a trace says which way round the pair was bound', () => {
    const { gpu, backend } = backendOver();
    const program = backend.program(stateFrame());
    program.draw();
    program.draw();
    program.draw();

    // Two passes a frame, and the turn in the name is what a trace off a real
    // device can be compared on: without it every group reads the same and a
    // frame binding the pair the wrong way round is a trace that agrees. The
    // render pass `shade` is recorded into a bundle once per turn, so both of its
    // groups appear at program creation and never again; the compute pass `step`
    // binds inline every frame, so its group follows the turn each of the three
    // draws runs on.
    expect(gpu.calls('setBindGroup').map((call) => call.group)).toEqual([
      'pipeline1-group-0',
      'pipeline1-group-1',
      'pipeline0-group-0',
      'pipeline0-group-1',
      'pipeline0-group-0',
    ]);
  });

  it('stay at one set for a frame with no pair, which is every shader that had none', () => {
    const { gpu, backend } = backendOver();
    const frame = stateFrame();
    const program = backend.program({
      ...frame,
      // Keeping only the render pipeline moves it to pipeline index 0, so the pass
      // that ran it is re-pointed at `pipelineHandle(0)` to match its new position.
      passes: [{ pipeline: pipelineHandle(0), draws: [{ vertices: 3 }] }],
      pipelines: [frame.pipelines[1]!],
      swap: undefined,
    });
    program.draw();
    program.draw();

    expect(gpu.calls('createBindGroup')).toHaveLength(1);
  });
});

describe('the group count a compute pass over a resource carries', () => {
  it('dispatches the count the producer set over its own texture, not the frame', () => {
    const { gpu, backend } = backendOver();
    backend.program(stateFrame()).draw();

    // Thirty-two over both axes — the 256×256 grid the producer counted, and not
    // the frame's own eight hundred by six hundred. The count is worked out above
    // the backend now (item 72), which dispatches it as given.
    const { x, y, z } = gpu.calls('dispatchWorkgroups')[0]!;
    expect([x, y, z]).toEqual([32, 32, 1]);
  });
});
