import type { WgslFrameGraph } from '@altpsyche/engine';
import { describe, expect, it } from 'vitest';
import { createWebGPUBackend } from '../gpu/webgpu';
import { createFakeGPU } from './support/fake-gpu';
import { indices, moduleHandle, pipelineHandle, uniform, vertices } from '../graph/handles.js';
import type { FrameGraph, VertexResource } from '@altpsyche/engine';

/**
 * Geometry read out of a buffer, which is the first frame whose vertex stage is
 * the shader's own rather than the backend's three corners.
 *
 * What is asserted is where each number the card is given comes from. The stride
 * and the attributes belong to the bytes, so they reach the pipeline and not the
 * draw; the counts belong to the buffers, so the draw reads them off the
 * resources rather than off the pass. A count written down twice is a draw
 * reading past the end of a buffer, which the card answers with a vertex of
 * whatever the memory held rather than with an error.
 */

const GRID = `struct Uniforms { u_time: f32, u_resolution: vec2<f32> };
@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct Vertex { @builtin(position) at: vec4<f32>, @location(0) place: vec2<f32> };

@vertex
fn warp(@location(0) corner: vec2<f32>, @location(1) place: vec2<f32>) -> Vertex {
  return Vertex(vec4<f32>(corner, 0.0, 1.0), place);
}

@fragment
fn shade(shaded: Vertex) -> @location(0) vec4<f32> {
  return vec4<f32>(shaded.place, uniforms.u_time, 1.0);
}`;

const VERTICES = new Uint8Array(9 * 16);
const INDICES = new Uint8Array(24 * 2);

const geometry = (over: Partial<VertexResource> = {}): VertexResource => ({
  kind: 'vertices',
  stride: 16,
  attributes: [
    { location: 0, offset: 0, format: 'float32x2' },
    { location: 1, offset: 8, format: 'float32x2' },
  ],
  topology: 'triangle-list',
  count: 9,
  indices: indices(2),
  data: VERTICES,
  ...over,
});

const gridFrame = (over: Partial<WgslFrameGraph> = {}): FrameGraph => ({
  id: 'fixture-geometry',
  authored: 'wgsl',
  resources: [
    { kind: 'uniform', block: [{ name: 'u_time', offset: 0, size: 4 }] },
    geometry(),
    { kind: 'indices', format: 'uint16', count: 24, data: INDICES },
  ],
  modules: [{ name: 'wgsl', wgsl: GRID }],
  pipelines: [
    {
      kind: 'render',
      vertex: { module: moduleHandle(0), entry: 'warp' },
      fragment: { module: moduleHandle(0), entry: 'shade' },
      geometry: vertices(1),
      bindings: [{ group: 0, binding: 0, resource: uniform(0), visibility: ['fragment'] }],
    },
  ],
  passes: [{ pipeline: pipelineHandle(0), draws: [{ instances: 3 }] }],
  ...over,
});

function backendOver() {
  const gpu = createFakeGPU({ connected: false });
  const backend = createWebGPUBackend(gpu.canvas, gpu.device);
  if (!backend) throw new Error('the fake canvas gave no WebGPU context');
  backend.resize(800, 600);
  return { gpu, backend };
}

describe('the buffers a drawn frame owns', () => {
  it('makes one buffer per set of bytes, each as long as the bytes and filled once', () => {
    const { gpu, backend } = backendOver();
    const program = backend.program(gridFrame());
    program.draw();
    program.draw();

    // The geometry buffers are labelled by their resource index now (item 87):
    // the vertices at index 1 are `buffer1`, the indices at index 2 `buffer2`.
    // The unlabelled uniform block also falls back to `buffer1` on the recorder's
    // own counter, so the two byte-sets are picked out by their usage — vertex or
    // index — rather than by a label that no longer tells them apart.
    const made = gpu
      .calls('createBuffer')
      .filter(
        (call) =>
          call.usage === (GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST) ||
          call.usage === (GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST)
      );
    expect(made.map((call) => [call.label, call.size])).toEqual([
      ['buffer1', VERTICES.byteLength],
      ['buffer2', INDICES.byteLength],
    ]);
    // The uniform block is never written here (no `setUniforms`), so the only
    // `buffer1` write is the vertices' one fill.
    expect(gpu.calls('writeBuffer').filter((call) => call.label === 'buffer1')).toHaveLength(1);
  });

  it('asks for the usage each buffer is read through and for being written into once', () => {
    const { gpu, backend } = backendOver();
    backend.program(gridFrame());

    // The last match, because the unlabelled uniform block shares the `buffer1`
    // label (the recorder's counter) with the vertices at index 1, and the
    // vertices are created after it.
    const usage = (label: string) =>
      gpu
        .calls('createBuffer')
        .filter((call) => call.label === label)
        .at(-1)?.usage;
    expect(usage('buffer1')).toBe(GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST);
    expect(usage('buffer2')).toBe(GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST);
  });

  it('destroys both of them when the program goes', () => {
    const { gpu, backend } = backendOver();
    const program = backend.program(gridFrame());
    program.dispose();

    const gone = gpu.calls('buffer.destroy').map((call) => call.label);
    expect(gone).toContain('buffer1');
    expect(gone).toContain('buffer2');
  });
});

describe('the pipeline that reads one vertex at a time', () => {
  it('is given the stride and the attributes the bytes were written under', () => {
    const { gpu, backend } = backendOver();
    backend.program(gridFrame());

    const descriptor = gpu.calls('createRenderPipeline')[0]?.descriptor as GPURenderPipelineDescriptor;
    expect(descriptor.vertex.buffers).toEqual([
      {
        arrayStride: 16,
        attributes: [
          { shaderLocation: 0, offset: 0, format: 'float32x2' },
          { shaderLocation: 1, offset: 8, format: 'float32x2' },
        ],
      },
    ]);
  });

  it('takes its topology off the geometry rather than assuming a list of triangles', () => {
    const { gpu, backend } = backendOver();
    const frame = gridFrame();
    backend.program({
      ...frame,
      resources: [frame.resources[0]!, geometry({ topology: 'triangle-strip' }), frame.resources[2]!],
    });

    expect(gpu.calls('createRenderPipeline')[0]?.topology).toBe('triangle-strip');
  });

  it('reads no buffer at all for a pipeline drawing the frame’s own corners', () => {
    const { gpu, backend } = backendOver();
    const frame = gridFrame();
    backend.program({
      ...frame,
      resources: [frame.resources[0]!],
      pipelines: [
        {
          kind: 'render',
          vertex: 'fullscreen',
          fragment: { module: moduleHandle(0), entry: 'shade' },
          bindings: [],
        },
      ],
      passes: [{ pipeline: pipelineHandle(0), draws: [{ vertices: 3 }] }],
    });

    const descriptor = gpu.calls('createRenderPipeline')[0]?.descriptor as GPURenderPipelineDescriptor;
    expect(descriptor.vertex.buffers).toBeUndefined();
  });
});

describe('the draw itself', () => {
  it('binds both buffers and walks every index, as many instances over as the pass says', () => {
    const { gpu, backend } = backendOver();
    backend.program(gridFrame()).draw();

    expect(gpu.calls('setVertexBuffer')[0]).toMatchObject({ slot: 0, buffer: 'buffer1' });
    expect(gpu.calls('setIndexBuffer')[0]).toMatchObject({ buffer: 'buffer2', format: 'uint16' });
    expect(gpu.calls('drawIndexed')[0]).toMatchObject({ count: 24, instances: 3 });
    expect(gpu.calls('draw')).toHaveLength(0);
  });

  it('issues every draw the pass carries, in order, against the one pipeline (item 26)', () => {
    const { gpu, backend } = backendOver();
    backend.program(gridFrame({ passes: [{ pipeline: pipelineHandle(0), draws: [{ instances: 3 }, { instances: 2 }] }] })).draw();

    // One pass, three draws: the two the list names, each its own drawIndexed
    // with its own instance count, against the pipeline bound once for the pass.
    // The one-draw-per-pass shape counted one call here and now counts the list.
    const drawn = gpu.calls('drawIndexed').map((call) => call.instances);
    expect(drawn).toEqual([3, 2]);
    expect(gpu.calls('draw')).toHaveLength(0);
  });

  it('walks the vertices in the order they were written where the geometry names no indices', () => {
    const { gpu, backend } = backendOver();
    const frame = gridFrame();
    backend
      .program({
        ...frame,
        resources: [frame.resources[0]!, geometry({ indices: undefined }), frame.resources[2]!],
      })
      .draw();

    expect(gpu.calls('drawIndexed')).toHaveLength(0);
    expect(gpu.calls('draw')[0]).toMatchObject({ count: 9, instances: 3 });
    expect(gpu.calls('setIndexBuffer')).toHaveLength(0);
  });

  it('leaves the corners drawn with no instance count, which is the call every shader on the site makes', () => {
    const { gpu, backend } = backendOver();
    const frame = gridFrame();
    backend
      .program({
        ...frame,
        resources: [frame.resources[0]!],
        pipelines: [
          {
            kind: 'render',
            vertex: 'fullscreen',
            fragment: { module: moduleHandle(0), entry: 'shade' },
            bindings: [],
          },
        ],
        passes: [{ pipeline: pipelineHandle(0), draws: [{ vertices: 3 }] }],
      })
      .draw();

    expect(gpu.calls('draw')[0]).toMatchObject({ count: 3, instances: undefined });
  });
});

describe('what a drawn frame is refused for', () => {
  it('refuses geometry whose bytes never arrived, rather than drawing whatever the memory held', () => {
    const { backend } = backendOver();
    const frame = gridFrame();

    expect(() =>
      backend.program({
        ...frame,
        resources: [frame.resources[0]!, geometry({ data: undefined }), frame.resources[2]!],
      })
    ).toThrow(/draws resource 1 and carries no bytes for it/);
  });

  it('refuses a pipeline reading geometry the frame declares as something else', () => {
    const { backend } = backendOver();
    const frame = gridFrame();

    expect(() =>
      backend.program({
        ...frame,
        pipelines: [{ ...(frame.pipelines[0] as { kind: 'render' } & object), geometry: vertices(0) }],
      } as FrameGraph)
    ).toThrow(/draws resource 0, which is no geometry it declares/);
  });

  it('refuses geometry ordered by indices the frame does not declare', () => {
    const { backend } = backendOver();
    const frame = gridFrame();

    expect(() =>
      backend.program({
        ...frame,
        resources: [frame.resources[0]!, geometry({ indices: indices(3) }), frame.resources[2]!],
      })
    ).toThrow(/orders itself by resource 3, which it does not declare/);
  });

  it('refuses a pass counting instances through a pipeline that reads no buffer', () => {
    const { backend } = backendOver();
    const frame = gridFrame();

    expect(() =>
      backend.program({
        ...frame,
        pipelines: [
          {
            kind: 'render',
            vertex: { module: moduleHandle(0), entry: 'warp' },
            fragment: { module: moduleHandle(0), entry: 'shade' },
            bindings: [],
          },
        ],
      })
    ).toThrow(/draws its pipeline's geometry and that pipeline reads none/);
  });

  it('refuses a binding pointing at geometry, which reaches a stage through the pipeline instead', () => {
    const { backend } = backendOver();
    const frame = gridFrame();

    expect(() =>
      backend.program({
        ...frame,
        pipelines: [
          {
            ...(frame.pipelines[0] as { kind: 'render' } & object),
            bindings: [{ group: 0, binding: 1, resource: vertices(1), visibility: ['vertex'] }],
          },
        ],
      } as FrameGraph)
    ).toThrow(/binds resource 1, which is geometry rather than a binding/);
  });
});
