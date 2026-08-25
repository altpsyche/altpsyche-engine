import { describe, expect, it } from 'vitest';
import { createWebGPUBackend } from '../gpu/webgpu';
import { createFakeGPU } from './support/fake-gpu';
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
  ...over,
});

const gridFrame = (over: Partial<FrameGraph> = {}): FrameGraph => ({
  id: 'fixture-geometry',
  target: 'wgsl',
  resources: [
    { kind: 'uniform', name: 'uniforms', block: [{ name: 'u_time', offset: 0, size: 4 }] },
    geometry(),
    { kind: 'indices', name: 'gridIndices', format: 'uint16', count: 24, data: INDICES },
  ],
  modules: [{ name: 'wgsl', code: GRID }],
  pipelines: [
    {
      kind: 'render',
      name: 'warp',
      vertex: { module: 'wgsl', entry: 'warp' },
      fragment: { module: 'wgsl', entry: 'shade' },
      geometry: 'grid',
      bindings: [{ group: 0, binding: 0, resource: 'uniforms', visibility: ['fragment'] }],
    },
  ],
  passes: [{ pipeline: 'warp', draws: [{ instances: 3 }] }],
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

    const made = gpu.calls('createBuffer').filter((call) => call.label === 'grid' || call.label === 'gridIndices');
    expect(made.map((call) => [call.label, call.size])).toEqual([
      ['grid', VERTICES.byteLength],
      ['gridIndices', INDICES.byteLength],
    ]);
    expect(gpu.calls('writeBuffer').filter((call) => call.label === 'grid')).toHaveLength(1);
  });

  it('asks for the usage each buffer is read through and for being written into once', () => {
    const { gpu, backend } = backendOver();
    backend.program(gridFrame());

    const usage = (label: string) => gpu.calls('createBuffer').find((call) => call.label === label)?.usage;
    expect(usage('grid')).toBe(GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST);
    expect(usage('gridIndices')).toBe(GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST);
  });

  it('destroys both of them when the program goes', () => {
    const { gpu, backend } = backendOver();
    const program = backend.program(gridFrame());
    program.dispose();

    const gone = gpu.calls('buffer.destroy').map((call) => call.label);
    expect(gone).toContain('grid');
    expect(gone).toContain('gridIndices');
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
          name: 'warp',
          vertex: 'fullscreen',
          fragment: { module: 'wgsl', entry: 'shade' },
          bindings: [],
        },
      ],
      passes: [{ pipeline: 'warp', draws: [{ vertices: 3 }] }],
    });

    const descriptor = gpu.calls('createRenderPipeline')[0]?.descriptor as GPURenderPipelineDescriptor;
    expect(descriptor.vertex.buffers).toBeUndefined();
  });
});

describe('the draw itself', () => {
  it('binds both buffers and walks every index, as many instances over as the pass says', () => {
    const { gpu, backend } = backendOver();
    backend.program(gridFrame()).draw();

    expect(gpu.calls('setVertexBuffer')[0]).toMatchObject({ slot: 0, buffer: 'grid' });
    expect(gpu.calls('setIndexBuffer')[0]).toMatchObject({ buffer: 'gridIndices', format: 'uint16' });
    expect(gpu.calls('drawIndexed')[0]).toMatchObject({ count: 24, instances: 3 });
    expect(gpu.calls('draw')).toHaveLength(0);
  });

  it('issues every draw the pass carries, in order, against the one pipeline (item 26)', () => {
    const { gpu, backend } = backendOver();
    backend.program(gridFrame({ passes: [{ pipeline: 'warp', draws: [{ instances: 3 }, { instances: 2 }] }] })).draw();

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
            name: 'warp',
            vertex: 'fullscreen',
            fragment: { module: 'wgsl', entry: 'shade' },
            bindings: [],
          },
        ],
        passes: [{ pipeline: 'warp', draws: [{ vertices: 3 }] }],
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
    ).toThrow(/draws "grid" and carries no bytes for it/);
  });

  it('refuses a pipeline reading geometry the frame declares as something else', () => {
    const { backend } = backendOver();
    const frame = gridFrame();

    expect(() =>
      backend.program({
        ...frame,
        pipelines: [{ ...(frame.pipelines[0] as { kind: 'render' } & object), geometry: 'uniforms' }],
      } as FrameGraph)
    ).toThrow(/draws "uniforms", which is no geometry it declares/);
  });

  it('refuses geometry ordered by indices the frame does not declare', () => {
    const { backend } = backendOver();
    const frame = gridFrame();

    expect(() =>
      backend.program({
        ...frame,
        resources: [frame.resources[0]!, geometry({ indices: 'absent' }), frame.resources[2]!],
      })
    ).toThrow(/orders itself by "absent", which it does not declare/);
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
            name: 'warp',
            vertex: { module: 'wgsl', entry: 'warp' },
            fragment: { module: 'wgsl', entry: 'shade' },
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
            bindings: [{ group: 0, binding: 1, resource: 'grid', visibility: ['vertex'] }],
          },
        ],
      } as FrameGraph)
    ).toThrow(/binds "grid", which is geometry rather than a binding/);
  });
});
