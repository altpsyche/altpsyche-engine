import type { WgslFrameGraph } from '@altpsyche/engine';
import { describe, expect, it } from 'vitest';
import { createWebGPUBackend } from '../gpu/webgpu';
import { createFakeGPU } from './support/fake-gpu';
import type { FrameGraph, VertexResource } from '@altpsyche/engine';

/**
 * The resident traffic a backend reports — bytes written once into a resource's
 * first contents, bytes uploaded per frame into one already made — read from the
 * arena and reported apart (item 22). It is asserted against the fake device by
 * the byte counts the arena tallies rather than by any picture: the reading is a
 * resident-lifetime fact §17 decision 9 keeps out of `cost()` because the graph
 * does not carry it, and this is where a regression in the wiring is caught
 * without a card.
 *
 * The frame carries geometry (written once at build) and a uniform block (queued
 * every `setUniforms` and landed at the draw's flush), so both categories move
 * and neither is summed into the other.
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

const gridFrame = (over: Partial<WgslFrameGraph> = {}): FrameGraph => ({
  id: 'fixture-traffic',
  authored: 'wgsl',
  resources: [
    { kind: 'uniform', name: 'uniforms', block: [{ name: 'u_time', offset: 0, size: 4 }] },
    geometry(),
    { kind: 'indices', name: 'gridIndices', format: 'uint16', count: 24, data: INDICES },
  ],
  modules: [{ name: 'wgsl', wgsl: GRID }],
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

describe('a backend reports the resident traffic its arena has seen', () => {
  it('is zero before anything is built', () => {
    const { backend } = backendOver();
    expect(backend.traffic()).toEqual({ written: 0, uploaded: 0 });
  });

  it('counts a frame’s first contents as written, once at build, and nothing uploaded until a frame lands', () => {
    const { backend } = backendOver();
    backend.program(gridFrame());
    // The geometry and its indices are the frame's first contents, written once.
    // Nothing has been uploaded because no draw has flushed a uniform block.
    expect(backend.traffic()).toEqual({ written: VERTICES.byteLength + INDICES.byteLength, uploaded: 0 });
  });

  it('counts each frame’s uniform upload apart from the write, and it accrues per frame', () => {
    const { backend } = backendOver();
    const program = backend.program(gridFrame());

    program.setUniforms({ u_time: 1, u_resolution: [800, 600] });
    program.draw();
    const afterOne = backend.traffic();
    expect(afterOne.written).toBe(VERTICES.byteLength + INDICES.byteLength);
    expect(afterOne.uploaded).toBeGreaterThan(0);

    program.setUniforms({ u_time: 2, u_resolution: [800, 600] });
    program.draw();
    const afterTwo = backend.traffic();
    // The block is re-uploaded every frame, so a second frame doubles the uploaded
    // bytes while the written bytes do not move: the two readings measure
    // different things and are never summed.
    expect(afterTwo.uploaded).toBe(afterOne.uploaded * 2);
    expect(afterTwo.written).toBe(afterOne.written);
  });

  it('reports since-last-reset totals: resetTraffic zeroes both', () => {
    const { backend } = backendOver();
    const program = backend.program(gridFrame());
    program.setUniforms({ u_time: 1, u_resolution: [800, 600] });
    program.draw();
    expect(backend.traffic().written).toBeGreaterThan(0);

    backend.resetTraffic();
    expect(backend.traffic()).toEqual({ written: 0, uploaded: 0 });

    // A frame after the reset accrues from zero, so the reading is the window the
    // caller reset rather than everything since the backend was made.
    program.setUniforms({ u_time: 2, u_resolution: [800, 600] });
    program.draw();
    expect(backend.traffic().uploaded).toBeGreaterThan(0);
    expect(backend.traffic().written).toBe(0);
  });
});
