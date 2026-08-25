import { describe, expect, it } from 'vitest';
import { createWebGPUBackend } from '../gpu/webgpu';
import { createFakeGPU } from './support/fake-gpu';
import type { PassSpec, FrameGraph } from '@altpsyche/engine';

/**
 * A description whose pass list changes while the program runs.
 *
 * A frame is not fixed for the life of a program: a page may draw one pass this
 * second and two the next, so `setPasses` turns a pass on or off the way
 * `setUniforms` feeds the block later numbers. What it may not do is grow a
 * resource or a pipeline, because a texture's usage and a pipeline's layout are
 * spent when the program is made. So both pipelines are declared up front and a
 * pass turning one on names one the program was already built with, and a pass
 * naming a pipeline the frame does not carry is refused here by name.
 *
 * Nothing here draws a picture, so a trace is what says which passes ran. A
 * bundled pass records its draws into a bundle labelled for its pipeline and the
 * draw replays it, so the labels an `executeBundles` names are which passes the
 * frame ran on that draw.
 */

const SHADER = `struct Uniforms { u_time: f32, u_resolution: vec2<f32> };
@group(0) @binding(0) var<uniform> uniforms: Uniforms;

@fragment
fn under(@builtin(position) at: vec4<f32>) -> @location(0) vec4<f32> {
  return vec4<f32>(uniforms.u_time, 0.0, 0.0, 1.0);
}

@fragment
fn over(@builtin(position) at: vec4<f32>) -> @location(0) vec4<f32> {
  return vec4<f32>(0.0, uniforms.u_time, 0.0, 1.0);
}`;

const both: PassSpec[] = [
  { pipeline: 'under', draws: [{ vertices: 3 }] },
  { pipeline: 'over', draws: [{ vertices: 3 }] },
];

const holding = (over: Partial<FrameGraph> = {}): FrameGraph => ({
  id: 'fixture-passes',
  target: 'wgsl',
  resources: [{ kind: 'uniform', name: 'uniforms', block: [{ name: 'u_time', offset: 0, size: 4 }] }],
  modules: [{ name: 'wgsl', code: SHADER }],
  pipelines: [
    {
      kind: 'render',
      name: 'under',
      vertex: 'fullscreen',
      fragment: { module: 'wgsl', entry: 'under' },
      bindings: [{ group: 0, binding: 0, resource: 'uniforms', visibility: ['fragment'] }],
    },
    {
      kind: 'render',
      name: 'over',
      vertex: 'fullscreen',
      fragment: { module: 'wgsl', entry: 'over' },
      bindings: [{ group: 0, binding: 0, resource: 'uniforms', visibility: ['fragment'] }],
    },
  ],
  passes: both,
  ...over,
});

function backendOver() {
  const gpu = createFakeGPU({ connected: false });
  const backend = createWebGPUBackend(gpu.canvas, gpu.device);
  if (!backend) throw new Error('the fake canvas gave no WebGPU context');
  backend.resize(800, 600);
  return { gpu, backend };
}

/** The bundles each draw replayed, one array of labels per `executeBundles`. */
const played = (gpu: ReturnType<typeof createFakeGPU>) => gpu.calls('executeBundles').map((call) => call.bundles);

describe('a description whose pass list changes between frames', () => {
  it('runs every pass the frame declares before anything changes it', () => {
    const { gpu, backend } = backendOver();
    backend.program(holding()).draw();

    expect(gpu.calls('beginRenderPass')).toHaveLength(2);
    expect(played(gpu)).toEqual([['under-bundle-0'], ['over-bundle-0']]);
  });

  it('turns a pass off, and the draw after runs one fewer without the program being remade', () => {
    const { gpu, backend } = backendOver();
    const program = backend.program(holding());
    const built = gpu.calls('createShaderModule').length;

    program.setPasses([{ pipeline: 'over', draws: [{ vertices: 3 }] }]);
    program.draw();

    expect(gpu.calls('beginRenderPass')).toHaveLength(1);
    expect(played(gpu)).toEqual([['over-bundle-0']]);
    // Nothing was compiled or made again: the modules, the pipelines and the
    // resources are the ones createProgram built.
    expect(gpu.calls('createShaderModule')).toHaveLength(built);
    expect(gpu.calls('createRenderPipeline')).toHaveLength(2);
  });

  it('turns a pass on for a pipeline the program built but no pass had used', () => {
    const { gpu, backend } = backendOver();
    // Both pipelines are built, only one is drawn to start with.
    const program = backend.program(holding({ passes: [{ pipeline: 'under', draws: [{ vertices: 3 }] }] }));
    program.draw();
    expect(gpu.calls('beginRenderPass')).toHaveLength(1);

    program.setPasses(both);
    program.draw();

    // The second draw adds the pass that was off, so two more passes ran and the
    // over pipeline drew for the first time without being made again.
    expect(gpu.calls('beginRenderPass')).toHaveLength(3);
    expect(played(gpu)).toEqual([['under-bundle-0'], ['under-bundle-0'], ['over-bundle-0']]);
    expect(gpu.calls('createRenderPipeline')).toHaveLength(2);
  });

  it('records the trace either side of a change, off one program', () => {
    const { gpu, backend } = backendOver();
    const program = backend.program(holding());

    program.draw();
    program.setPasses([{ pipeline: 'over', draws: [{ vertices: 3 }] }]);
    program.draw();
    program.setPasses(both);
    program.draw();

    // Two passes, then one, then two again, all on the resources built once.
    expect(played(gpu)).toEqual([
      ['under-bundle-0'],
      ['over-bundle-0'],
      ['over-bundle-0'],
      ['under-bundle-0'],
      ['over-bundle-0'],
    ]);
  });

  it('refuses a pass naming a pipeline the frame does not carry, by that name', () => {
    const { backend } = backendOver();
    const program = backend.program(holding());

    expect(() => program.setPasses([{ pipeline: 'ghost', draws: [{ vertices: 3 }] }])).toThrow(
      'the frame names a pipeline "ghost" it does not carry'
    );
  });
});
