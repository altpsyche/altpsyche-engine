import type { WgslFrameGraph } from '@altpsyche/engine';
import { describe, expect, it } from 'vitest';
import { createWebGPUBackend } from '../gpu/webgpu';
import { createFakeGPU } from './support/fake-gpu';
import { uniform, moduleHandle, pipelineHandle } from '../graph/handles.js';
import type { PassSpec, FrameGraph } from '@altpsyche/engine';

/**
 * A description whose pass list changes between draws.
 *
 * A frame is not fixed: a page may draw one pass this second and two the next. It
 * does that by building the next graph and re-submitting it — item 98 dissolved
 * `setPasses` into re-submit — not by mutating a held program. Re-submitting a
 * changed pass list is cheap on the lifetimes it does not touch: the shared
 * pipeline cache (item 63) compiles no pipeline a re-submit already carries, so
 * both pipelines are built once across every graph that names them and a pass
 * turning one on names one already compiled. A graph naming a pipeline it does not
 * declare is refused at build by name.
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
  { pipeline: pipelineHandle(0), draws: [{ vertices: 3 }] },
  { pipeline: pipelineHandle(1), draws: [{ vertices: 3 }] },
];

const holding = (over: Partial<WgslFrameGraph> = {}): FrameGraph => ({
  id: 'fixture-passes',
  authored: 'wgsl',
  resources: [{ kind: 'uniform', block: [{ name: 'u_time', offset: 0, size: 4 }] }],
  modules: [],
  pipelines: [
    {
      kind: 'render',
      source: {
        vertex: 'fullscreen',
        fragment: { document: 'wgsl', text: SHADER, entry: 'under' },
      },
      bindings: [{ group: 0, binding: 0, resource: uniform(0), visibility: ['fragment'] }],
    },
    {
      kind: 'render',
      source: {
        vertex: 'fullscreen',
        fragment: { document: 'wgsl', text: SHADER, entry: 'over' },
      },
      bindings: [{ group: 0, binding: 0, resource: uniform(0), visibility: ['fragment'] }],
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

describe('a description whose pass list changes between draws', () => {
  it('runs every pass the frame declares', () => {
    const { gpu, backend } = backendOver();
    backend.program(holding()).draw();

    expect(gpu.calls('beginRenderPass')).toHaveLength(2);
    expect(played(gpu)).toEqual([['pipeline0-bundle-0'], ['pipeline1-bundle-0']]);
  });

  it('re-submitted with one pass fewer draws one fewer, on the pipelines already compiled', () => {
    const { gpu, backend } = backendOver();
    backend.program(holding()).draw(); // both

    backend.program(holding({ passes: [{ pipeline: pipelineHandle(1), draws: [{ vertices: 3 }] }] })).draw();

    // Two passes, then one: the second draw is the re-submitted graph.
    expect(played(gpu)).toEqual([
      ['pipeline0-bundle-0'],
      ['pipeline1-bundle-0'],
      ['pipeline1-bundle-0'],
    ]);
    // The shared pipeline cache compiled nothing again: both render pipelines were
    // built by the first graph and the re-submit reused them.
    expect(gpu.calls('createRenderPipeline')).toHaveLength(2);
  });

  it('re-submitted with a pass turned on draws a pipeline built but no pass had used', () => {
    const { gpu, backend } = backendOver();
    // Both pipelines are compiled from the first graph, only one is drawn.
    backend.program(holding({ passes: [{ pipeline: pipelineHandle(0), draws: [{ vertices: 3 }] }] })).draw();
    expect(gpu.calls('beginRenderPass')).toHaveLength(1);

    backend.program(holding()).draw();

    // The re-submit adds the pass that was off, so two more passes ran and the over
    // pipeline drew for the first time without being compiled again.
    expect(gpu.calls('beginRenderPass')).toHaveLength(3);
    expect(played(gpu)).toEqual([['pipeline0-bundle-0'], ['pipeline0-bundle-0'], ['pipeline1-bundle-0']]);
    expect(gpu.calls('createRenderPipeline')).toHaveLength(2);
  });

  it('records the trace either side of a re-submit', () => {
    const { gpu, backend } = backendOver();

    backend.program(holding()).draw();
    backend.program(holding({ passes: [{ pipeline: pipelineHandle(1), draws: [{ vertices: 3 }] }] })).draw();
    backend.program(holding()).draw();

    // Two passes, then one, then two again.
    expect(played(gpu)).toEqual([
      ['pipeline0-bundle-0'],
      ['pipeline1-bundle-0'],
      ['pipeline1-bundle-0'],
      ['pipeline0-bundle-0'],
      ['pipeline1-bundle-0'],
    ]);
  });

  it('refuses a graph naming a pipeline it does not declare, at build by that name', () => {
    const { backend } = backendOver();

    expect(() =>
      backend.program(holding({ passes: [{ pipeline: pipelineHandle(2), draws: [{ vertices: 3 }] }] }))
    ).toThrow('the frame for "fixture-passes" runs pipeline 2, which it does not declare');
  });
});
