import type { WgslFrameGraph } from '@altpsyche/engine';
import { describe, expect, it } from 'vitest';
import { createWebGPUBackend } from '../gpu/webgpu';
import { createFakeGPU } from './support/fake-gpu';
import { buffer, uniform, moduleHandle, pipelineHandle } from '../graph/handles.js';
import type { BufferResource, RenderPassSpec, FrameGraph } from '@altpsyche/engine';

/**
 * What the card says about the work it just did.
 *
 * Both readings here are the one thing in this renderer with no picture behind
 * them. A time is written at each end of a pass and a count is taken around one
 * draw, so the two are asked for in different places and land in buffers of their
 * own, and a caller reads them back the way it reads any other buffer.
 *
 * The queries a pass needs are the backend's own, worked out from the passes,
 * because nothing about how many answers a pass takes or which kind is a choice a
 * source or an entry could make. A device without the optional feature for timing
 * draws the frame anyway and leaves the buffer as it found it.
 */

const SOURCE = `struct Uniforms { u_time: f32, u_resolution: vec2<f32> };
@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read_write> readings: array<u32>;

@compute @workgroup_size(1)
fn plan() {
  readings[0] = u32(uniforms.u_time);
}

@fragment
fn paint() -> @location(0) vec4f {
  return vec4f(uniforms.u_time, 0.0, 0.0, 1.0);
}`;

const held = (over: Partial<BufferResource> = {}): BufferResource => ({
  kind: 'buffer',
  bytes: 16,
  access: 'read-write',
  ...over,
});

const frameOf = (over: Partial<WgslFrameGraph> = {}): FrameGraph => ({
  id: 'fixture-queries',
  authored: 'wgsl',
  resources: [{ kind: 'uniform', block: [{ name: 'u_time', offset: 0, size: 4 }] }, held()],
  modules: [{ name: 'wgsl', wgsl: SOURCE }],
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
    {
      kind: 'render',
      source: {
        vertex: 'fullscreen',
        fragment: { document: 'wgsl', text: SOURCE, entry: 'paint' },
      },
      bindings: [
        { group: 0, binding: 0, resource: uniform(0), visibility: ['fragment'] },
        { group: 0, binding: 1, resource: buffer(1), visibility: ['fragment'] },
      ],
    },
  ],
  passes: [{ pipeline: pipelineHandle(1), draws: [{ vertices: 3 }] }],
  ...over,
});

/** The drawn pass on its own, which is what most of these vary. */
const drawing = (over: Partial<RenderPassSpec> = {}): RenderPassSpec => ({
  pipeline: pipelineHandle(1),
  draws: [{ vertices: 3 }],
  ...over,
});

function backendOver({ timing = true } = {}) {
  const gpu = createFakeGPU({ connected: false });
  if (!timing) gpu.features = new Set();
  const backend = createWebGPUBackend(gpu.canvas, gpu.device);
  if (!backend) throw new Error('the fake canvas gave no WebGPU context');
  backend.resize(800, 600);
  return { gpu, backend };
}

describe('a pass that is timed', () => {
  it('is opened with a set of two, one time written at each end of it', () => {
    const { gpu, backend } = backendOver();
    backend.program(frameOf({ passes: [drawing({ timed: buffer(1) })] })).draw();

    expect(gpu.calls('createQuerySet')[0]).toMatchObject({ label: 'buffer1-times', type: 'timestamp', count: 2 });
    expect(gpu.calls('beginRenderPass')[0]?.times).toBe('buffer1-times');
  });

  it('resolves the pair into the buffer the description named, after the pass has ended', () => {
    const { gpu, backend } = backendOver();
    backend.program(frameOf({ passes: [drawing({ timed: buffer(1) })] })).draw();

    const order = gpu.trace.map((entry) => entry.call);
    expect(order.indexOf('resolveQuerySet')).toBeGreaterThan(order.indexOf('endPass'));
    expect(gpu.calls('resolveQuerySet')[0]).toMatchObject({
      set: 'buffer1-times',
      first: 0,
      count: 2,
      into: 'buffer1',
      offset: 0,
    });
  });

  it('asks the buffer for the flag a resolve needs, on top of the ones it already had', () => {
    const { gpu, backend } = backendOver();
    backend.program(frameOf({ passes: [drawing({ timed: buffer(1) })] }));

    expect(gpu.calls('createBuffer').find((call) => call.label === 'buffer1')?.usage).toBe(
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.QUERY_RESOLVE
    );
  });

  it('times a compute pass the same way, since a dispatch has two ends as well', () => {
    const { gpu, backend } = backendOver();
    backend.program(frameOf({ passes: [{ pipeline: pipelineHandle(0), groups: [1, 1, 1], timed: buffer(1) }] })).draw();

    expect(gpu.calls('beginComputePass')[0]?.times).toBe('buffer1-times');
    expect(gpu.calls('resolveQuerySet')[0]?.count).toBe(2);
  });

  it('is refused where the buffer is shorter than the pair of answers', () => {
    const { backend } = backendOver();
    expect(() =>
      backend.program(
        frameOf({
          resources: [frameOf().resources[0] as BufferResource, held({ bytes: 8 })],
          passes: [drawing({ timed: buffer(1) })],
        })
      )
    ).toThrow(/resolves 16 bytes of query into buffer 1, which holds 8/);
  });
});

describe('a device that cannot time anything', () => {
  it('draws the pass with no set at all rather than refusing the frame', () => {
    const { gpu, backend } = backendOver({ timing: false });
    backend.program(frameOf({ passes: [drawing({ timed: buffer(1) })] })).draw();

    expect(gpu.calls('createQuerySet')).toEqual([]);
    expect(gpu.calls('beginRenderPass')[0]?.times).toBeUndefined();
    expect(gpu.calls('draw')).toHaveLength(1);
  });

  it('leaves the buffer as it found it, so a caller reads what was there', () => {
    const { gpu, backend } = backendOver({ timing: false });
    backend.program(frameOf({ passes: [drawing({ timed: buffer(1) })] })).draw();

    expect(gpu.calls('resolveQuerySet')).toEqual([]);
  });

  it('still counts samples, which is a reading that needs nothing optional', () => {
    const { gpu, backend } = backendOver({ timing: false });
    backend.program(frameOf({ passes: [drawing({ visible: buffer(1) })] })).draw();

    expect(gpu.calls('createQuerySet')[0]).toMatchObject({ type: 'occlusion', count: 1 });
    expect(gpu.calls('resolveQuerySet')[0]?.count).toBe(1);
  });
});

describe('a pass whose samples are counted', () => {
  it('names the set when the pass is opened, since the card is told before anything is drawn', () => {
    const { gpu, backend } = backendOver();
    backend.program(frameOf({ passes: [drawing({ visible: buffer(1) })] })).draw();

    expect(gpu.calls('beginRenderPass')[0]?.counts).toBe('buffer1-samples');
  });

  it('takes the count around the draw rather than around the pass', () => {
    const { gpu, backend } = backendOver();
    backend.program(frameOf({ passes: [drawing({ visible: buffer(1) })] })).draw();

    const order = gpu.trace.map((entry) => entry.call);
    expect(order.indexOf('beginOcclusionQuery')).toBeLessThan(order.indexOf('draw'));
    expect(order.indexOf('endOcclusionQuery')).toBeGreaterThan(order.indexOf('draw'));
    expect(order.indexOf('endOcclusionQuery')).toBeLessThan(order.indexOf('endPass'));
  });

  it('resolves one answer rather than two', () => {
    const { gpu, backend } = backendOver();
    backend.program(frameOf({ passes: [drawing({ visible: buffer(1) })] })).draw();

    expect(gpu.calls('resolveQuerySet')[0]).toMatchObject({ set: 'buffer1-samples', count: 1, into: 'buffer1' });
  });

  it('leaves a pass nobody counted without a set, so nothing is counted by accident', () => {
    const { gpu, backend } = backendOver();
    backend.program(frameOf()).draw();

    expect(gpu.calls('createQuerySet')).toEqual([]);
    expect(gpu.calls('beginOcclusionQuery')).toEqual([]);
    expect(gpu.calls('resolveQuerySet')).toEqual([]);
  });
});

describe('two answers in one buffer', () => {
  it('are refused, because a resolve writes from the start of it', () => {
    // Both would land at the same place and the second would be read as the
    // first, which is a number that looks like an answer and is not one.
    const { backend } = backendOver();
    expect(() =>
      backend.program(frameOf({ passes: [drawing({ timed: buffer(1), visible: buffer(1) })] }))
    ).toThrow(/resolves more than one query into buffer 1/);
  });
});

describe('what the sets belong to', () => {
  it('are given back when the program is, since a program is what worked out how many it needed', () => {
    const { gpu, backend } = backendOver();
    const program = backend.program(frameOf({ passes: [drawing({ timed: buffer(1) })] }));
    program.draw();
    program.dispose();

    expect(gpu.calls('querySet.destroy')).toHaveLength(1);
  });
});
