import { describe, expect, it } from 'vitest';
import { createWebGPUBackend } from '../gpu/webgpu';
import { createFakeGPU } from './support/fake-gpu';
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

const PAIR = (name: string) =>
  ({
    kind: 'texture' as const,
    name,
    size: [256, 256] as [number, number],
    format: 'rgba16float' as GPUTextureFormat,
    use: ['storage', 'sample'] as ('storage' | 'sample')[],
  }) as const;

const stateFrame = (over: Partial<FrameGraph> = {}): FrameGraph => ({
  id: 'fixture-state',
  target: 'wgsl',
  uniforms: [
    { name: 'u_time', type: 'float' },
    { name: 'u_resolution', type: 'vec2' },
  ],
  resources: [
    { kind: 'uniform', name: 'uniforms', block: [{ name: 'u_time', offset: 0, size: 4 }] },
    PAIR('previous'),
    PAIR('next'),
    { kind: 'sampler', name: 'stateSampler', filter: 'linear', wrap: 'clamp' },
  ],
  modules: [{ name: 'wgsl', code: STATE }],
  pipelines: [
    {
      kind: 'compute',
      name: 'step',
      compute: { module: 'wgsl', entry: 'step' },
      workgroup: [8, 8, 1],
      bindings: [
        { group: 0, binding: 1, resource: 'previous', visibility: ['compute'] },
        { group: 0, binding: 2, resource: 'next', visibility: ['compute'] },
      ],
    },
    {
      kind: 'render',
      name: 'shade',
      vertex: 'fullscreen',
      fragment: { module: 'wgsl', entry: 'shade' },
      bindings: [
        { group: 0, binding: 0, resource: 'uniforms', visibility: ['fragment'] },
        { group: 0, binding: 1, resource: 'previous', visibility: ['fragment'] },
        { group: 0, binding: 3, resource: 'stateSampler', visibility: ['fragment'] },
      ],
    },
  ],
  passes: [
    { pipeline: 'step', dispatch: { over: 'next' } },
    { pipeline: 'shade', draws: [{ vertices: 3 }] },
  ],
  swap: [['previous', 'next']],
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
    expect(pair.map((call) => call.label)).toEqual(['previous', 'next']);
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
        resources: [frame.resources[0]!, PAIR('previous'), { ...PAIR('next'), size: [128, 128] }, frame.resources[3]!],
      })
    ).toThrow(/swaps "previous" and "next", which are not the same texture/);
  });

  it('refuses a pair naming a texture the frame never declares', () => {
    const { backend } = backendOver();

    expect(() => backend.program(stateFrame({ swap: [['previous', 'absent']] }))).toThrow(
      /swaps "absent", which is no texture it declares/
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
    expect(made[0]).toEqual(['previous.view', 'next.view']);
    expect(made[2]).toEqual(['next.view', 'previous.view']);
  });

  it('give the pass that draws the half the other pass is not writing', () => {
    const { gpu, backend } = backendOver();
    backend.program(stateFrame());

    const made = gpu
      .calls('createBindGroup')
      .map((call) => (call.bindings as { resource: string }[]).map((at) => at.resource));
    expect(made[1]).toEqual(['buffer1', 'previous.view', 'stateSampler']);
    expect(made[3]).toEqual(['buffer1', 'next.view', 'stateSampler']);
  });

  it('alternate across frames rather than one of them being read every time', () => {
    const { gpu, backend } = backendOver();
    // The picture is read out of whichever half the frame ended on, so the copy
    // out of it is what says which way round the pair was bound.
    const program = backend.program(stateFrame({ present: 'next' }));
    program.draw();
    program.draw();
    program.draw();
    program.draw();

    expect(gpu.calls('copyTextureToTexture').map((call) => call.from)).toEqual([
      'next',
      'previous',
      'next',
      'previous',
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
      'shade-group-0',
      'shade-group-1',
      'step-group-0',
      'step-group-1',
      'step-group-0',
    ]);
  });

  it('stay at one set for a frame with no pair, which is every shader that had none', () => {
    const { gpu, backend } = backendOver();
    const frame = stateFrame();
    const program = backend.program({
      ...frame,
      passes: [frame.passes[1]!],
      pipelines: [frame.pipelines[1]!],
      swap: undefined as unknown as [string, string][],
    });
    program.draw();
    program.draw();

    expect(gpu.calls('createBindGroup')).toHaveLength(1);
  });
});

describe('the dispatch a pass takes over a resource', () => {
  it('covers that texture in whole blocks of the pipeline’s own workgroup size', () => {
    const { gpu, backend } = backendOver();
    backend.program(stateFrame()).draw();

    // Two hundred and fifty-six over eight, on both axes, and not the frame's
    // own eight hundred by six hundred.
    const { x, y, z } = gpu.calls('dispatchWorkgroups')[0]!;
    expect([x, y, z]).toEqual([32, 32, 1]);
  });

  it('rounds a size the workgroup does not divide up rather than leaving an edge unwritten', () => {
    const { gpu, backend } = backendOver();
    const frame = stateFrame();
    backend
      .program({
        ...frame,
        resources: [
          frame.resources[0]!,
          { ...PAIR('previous'), size: [100, 60] },
          { ...PAIR('next'), size: [100, 60] },
          frame.resources[3]!,
        ],
      })
      .draw();

    const { x, y, z } = gpu.calls('dispatchWorkgroups')[0]!;
    expect([x, y, z]).toEqual([13, 8, 1]);
  });

  it('refuses a dispatch over a name that is no texture of the frame', () => {
    const { backend } = backendOver();
    const frame = stateFrame();

    expect(() =>
      backend
        .program({
          ...frame,
          passes: [{ pipeline: 'step', dispatch: { over: 'stateSampler' } }, frame.passes[1]!],
        })
        .draw()
    ).toThrow(/dispatches over "stateSampler", which is no texture/);
  });
});
