import { describe, expect, it } from 'vitest';
import { createWebGPUBackend } from '../gpu/webgpu';
import { createFakeGPU } from './support/fake-gpu';
import { moduleHandle, pipelineHandle, uniform, vertices } from '../graph/handles.js';
import type { FrameGraph, VertexResource } from '@altpsyche/engine';

/**
 * The backend's pipeline cache is shared across every program it builds (item 63),
 * so two programs whose frames differ only in resident data — one material's
 * pipeline drawn over two meshes — compile that pipeline once between them rather
 * than once each. Item 15 scoped the cache per program to keep an unbounded shared
 * cache from growing card memory without end; item 63 gives it a bound so it can be
 * shared. What is asserted is the compilation count off the recording double: a
 * `createRenderPipeline` per distinct structure, not per program.
 *
 * The two frames below carry one pipeline structure — one source, one vertex layout,
 * one binding — over two distinct meshes, differing only in the bytes of the vertex
 * buffer they draw. That difference is resident, not structural, so the pipeline is
 * one; the buffers, the bind groups and the programs are two.
 */

const SOURCE = `struct Uniforms { u_time: f32 };
@group(0) @binding(0) var<uniform> uniforms: Uniforms;

@vertex
fn warp(@location(0) corner: vec2<f32>) -> @builtin(position) vec4<f32> {
  return vec4<f32>(corner, 0.0, 1.0);
}

@fragment
fn shade() -> @location(0) vec4<f32> {
  return vec4<f32>(uniforms.u_time, 0.0, 0.0, 1.0);
}`;

const geometry = (data: Uint8Array<ArrayBuffer>): VertexResource => ({
  kind: 'vertices',
  stride: 8,
  attributes: [{ location: 0, offset: 0, format: 'float32x2' }],
  topology: 'triangle-list',
  count: 3,
  data,
});

const meshFrame = (data: Uint8Array<ArrayBuffer>): FrameGraph => ({
  id: `mesh-${data[0]}`,
  authored: 'wgsl',
  // uniforms=0, mesh=1 — named below by index.
  resources: [
    { kind: 'uniform', block: [{ name: 'u_time', offset: 0, size: 4 }] },
    geometry(data),
  ],
  modules: [{ name: 'wgsl', wgsl: SOURCE }],
  pipelines: [
    {
      kind: 'render',
      vertex: { module: moduleHandle(0), entry: 'warp' },
      fragment: { module: moduleHandle(0), entry: 'shade' },
      geometry: vertices(1),
      bindings: [{ group: 0, binding: 0, resource: uniform(0), visibility: ['fragment'] }],
    },
  ],
  passes: [{ pipeline: pipelineHandle(0), draws: [{ vertices: 3 }] }],
});

function backendOver() {
  const gpu = createFakeGPU({ connected: false });
  const backend = createWebGPUBackend(gpu.canvas, gpu.device);
  if (!backend) throw new Error('the fake canvas gave no WebGPU context');
  backend.resize(800, 600);
  return { gpu, backend };
}

describe('the pipeline cache shared across programs (item 63)', () => {
  it('compiles one pipeline for two programs that share a structure over different meshes', () => {
    const { gpu, backend } = backendOver();
    const first = new Uint8Array(3 * 8).fill(1);
    const second = new Uint8Array(3 * 8).fill(2);

    const a = backend.program(meshFrame(first));
    a.draw();
    // The first program compiled the one pipeline the structure keys to.
    expect(gpu.calls('createRenderPipeline')).toHaveLength(1);
    const afterFirst = gpu.calls('createRenderPipeline').length;

    const b = backend.program(meshFrame(second));
    b.draw();
    // The second program's frame differs only in the resident vertex bytes, so it
    // shares the first's pipeline and compiles none — the reuse item 63 adds. It is
    // a program of its own all the same: it made its own vertex buffer and bind
    // group, so nothing of the first's resident data draws under it.
    expect(gpu.calls('createRenderPipeline')).toHaveLength(afterFirst);
    // `mesh` sits at resource index 1, so its vertex buffer is labelled `buffer1`.
    // The uniform block carries its own `uniforms` label now (item 96), so `buffer1`
    // names the two programs' mesh vertex buffers alone.
    const meshBuffers = gpu.calls('createBuffer').filter((call) => call.label === 'buffer1');
    expect(meshBuffers).toHaveLength(2);
    expect(gpu.calls('createBindGroup')).toHaveLength(2);
  });

  it('shares the pipeline’s bind-group layout too, building it once for both', () => {
    const { gpu, backend } = backendOver();
    backend.program(meshFrame(new Uint8Array(3 * 8).fill(1))).draw();
    backend.program(meshFrame(new Uint8Array(3 * 8).fill(2))).draw();
    // The layout is static like the pipeline, cached beside it, so the second
    // program builds its bind group against the first's layout rather than a second.
    expect(gpu.calls('createBindGroupLayout')).toHaveLength(1);
  });
});
