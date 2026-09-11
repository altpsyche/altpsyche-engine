import { describe, expect, it } from 'vitest';
import type { FrameGraph, VertexResource, WgslFrameGraph } from '@altpsyche/engine';
import { GEOMETRY_PRIMITIVE } from '@altpsyche/engine';
import { createWebGPUBackend } from '../gpu/webgpu';
import { createWebGL2Backend } from '../gpu/webgl2';
import { createFakeGPU } from './support/fake-gpu';
import { createFakeGL } from './support/fake-gl';
import { indices, pipelineHandle, uniform, vertices } from '../graph/handles.js';

/**
 * A compiled program handed a frame other than the one it was built from
 * (item 18, step 3).
 *
 * **Nothing calls `refill` yet.** It lands additive and inert so that the commit
 * that takes the geometry bytes out of the program key — the one commit in this
 * item where the picture can move — arrives with the mechanism already tested
 * rather than with both halves at once.
 *
 * **What a double can show and what it cannot.** These assert that the second
 * set of bytes reached the card's buffer, which is a recorded call. They cannot
 * show that the draw then *read* that buffer: a refill that writes a buffer
 * nothing samples looks identical here. That check is item 18's last step and
 * needs a real driver.
 */

const WGSL = `struct Uniforms { u_time: f32 };
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

const GL_VERTEX =
  '#version 300 es\nlayout(location=0) in vec2 position;\nlayout(location=1) in vec2 grid;\nvoid main(){gl_Position=vec4(position,0.0,1.0);}';
const GL_FRAGMENT = '#version 300 es\nprecision highp float;\nout vec4 c;\nvoid main(){c=vec4(1.0);}';

const grid = GEOMETRY_PRIMITIVE['quad-grid'];

/** One figure, fresh every call the way a live loop builds one. `mark` moves the
 * first geometry byte, which is the smallest change that is still a change, and
 * `bytes` lets a test hand over geometry of the wrong length on purpose. */
function figure(mark: number, over: { bytes?: number } = {}): { frame: FrameGraph; geometry: Uint8Array } {
  const made = grid.bytes(8, 8);
  const geometry = new Uint8Array(over.bytes ?? made.vertices.byteLength);
  geometry.set(made.vertices.subarray(0, geometry.length));
  geometry[0] = mark;
  const geometrySpec: VertexResource = {
    kind: 'vertices',
    stride: grid.stride,
    attributes: grid.attributes,
    topology: grid.topology,
    count: made.vertexCount,
    indices: indices(2),
    data: geometry,
  };
  return {
    geometry,
    frame: {
      id: 'figure',
      authored: 'wgsl',
      resources: [
        { kind: 'uniform', block: [{ name: 'u_time', offset: 0, size: 4 }] },
        geometrySpec,
        { kind: 'indices', format: grid.indexFormat, count: made.indexCount, data: made.indices },
      ],
      modules: [],
      pipelines: [
        {
          kind: 'render',
          source: { wgsl: { vertex: WGSL, fragment: WGSL } },
          vertex: { document: 'wgsl', entry: 'warp' },
          fragment: { document: 'wgsl', entry: 'shade' },
          geometry: vertices(1),
          bindings: [{ group: 0, binding: 0, resource: uniform(0), visibility: ['fragment'] }],
        },
      ],
      passes: [{ pipeline: pipelineHandle(0), draws: [{ instances: 1 }] }],
    } as WgslFrameGraph,
  };
}

/** The same figure in GLSL, for the other backend. Only the pipeline's source
 * and the frame's language differ; the resources are the ones above. */
function glFigure(mark: number, over: { bytes?: number } = {}): { frame: FrameGraph; geometry: Uint8Array } {
  const built = figure(mark, over);
  const frame = built.frame as WgslFrameGraph;
  return {
    geometry: built.geometry,
    frame: {
      ...frame,
      authored: 'glsl',
      pipelines: [{ ...frame.pipelines[0], source: { glsl: { vertex: GL_VERTEX, fragment: GL_FRAGMENT } } }],
    } as unknown as FrameGraph,
  };
}

describe('refilling a WebGPU program from a later frame', () => {
  it('writes the new bytes into the buffer the program already built', () => {
    const gpu = createFakeGPU({ connected: false });
    const backend = createWebGPUBackend(gpu.canvas, gpu.device);
    if (!backend) throw new Error('the fake canvas gave no WebGPU context');
    backend.resize(200, 100);
    const program = backend.program(figure(1).frame);
    const atBuild = gpu.calls('writeBuffer').length;

    const written = program.refill(figure(2).frame);

    // Two buffers carry bytes: the geometry at resource 1 and the indices at 2.
    // The uniform block is not one of them — it has no `data` and is fed by
    // `setUniforms`.
    expect(written).toBe(2);
    expect(gpu.calls('writeBuffer').length).toBe(atBuild + 2);
    // The bytes themselves, not just that a call happened: the geometry buffer's
    // last write carries the mark the second frame set and the first frame did
    // not. Without this the test would pass on a refill that wrote the *old*
    // bytes back, which is the failure it exists to catch.
    const geometryWrites = gpu.calls('writeBuffer').filter((call) => call.label === 'buffer1');
    const last = geometryWrites[geometryWrites.length - 1]?.data as Float32Array;
    expect(last[0]).toBe(2);
    expect((geometryWrites[0]?.data as Float32Array)[0]).toBe(1);
  });

  it('refuses geometry whose length moved, rather than writing part of it', () => {
    const gpu = createFakeGPU({ connected: false });
    const backend = createWebGPUBackend(gpu.canvas, gpu.device);
    if (!backend) throw new Error('the fake canvas gave no WebGPU context');
    backend.resize(200, 100);
    const program = backend.program(figure(1).frame);

    // A buffer is allocated for a size, so this is a different program and not a
    // refill of this one. The refusal names the resource and both lengths.
    expect(() => program.refill(figure(2, { bytes: 64 }).frame)).toThrow(
      /resource 1 on "figure" came back with 64 bytes where the program was built for/
    );
  });
});

describe('refilling a WebGL 2 program from a later frame', () => {
  it('respecifies nothing and writes into the buffer it already has', () => {
    const gl = createFakeGL();
    const backend = createWebGL2Backend(gl.canvas);
    if (!backend) throw new Error('the fake canvas gave no WebGL 2 context');
    backend.resize(200, 100);
    const program = backend.program(glFigure(1).frame);
    const dataAtBuild = gl.of('bufferData').length;

    const written = program.refill(glFigure(2).frame);

    expect(written).toBe(2);
    // `bufferSubData`, not a second `bufferData`: respecifying would drop the
    // store the driver placed and ask for another, which is the allocation this
    // item exists to avoid.
    expect(gl.of('bufferSubData')).toHaveLength(2);
    expect(gl.of('bufferData').length).toBe(dataAtBuild);
    // The geometry's refill carries the second frame's mark. A refill writing the
    // bytes it was built with would pass every other assertion here.
    expect(gl.of('bufferSubData')[0]?.first).toBe(2);
    expect(gl.of('bufferSubData')[0]?.offset).toBe(0);
  });

  it('refuses geometry whose length moved', () => {
    const gl = createFakeGL();
    const backend = createWebGL2Backend(gl.canvas);
    if (!backend) throw new Error('the fake canvas gave no WebGL 2 context');
    backend.resize(200, 100);
    const program = backend.program(glFigure(1).frame);

    expect(() => program.refill(glFigure(2, { bytes: 64 }).frame)).toThrow(/came back with 64 bytes/);
  });
});
