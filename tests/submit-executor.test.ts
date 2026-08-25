import { describe, expect, it } from 'vitest';
import { createWebGPUBackend } from '../gpu/webgpu';
import { createWebGL2Backend } from '../gpu/webgl2';
import { wgslFrame, glslFrame } from '@altpsyche/engine';
import type { FrameGraph, UniformSlot } from '@altpsyche/engine';
import { createFakeGPU } from './support/fake-gpu';
import { createFakeGL } from './support/fake-gl';
import { drawGL2Frame } from '../submit/gl2';

/**
 * The executor is one layer now, and every draw goes through it.
 *
 * [ROADMAP.md](../docs/ROADMAP.md) item 13 lifted the per-frame command recording
 * out of each backend's `createProgram` into `submit/`: the WebGPU frame loop is
 * [submit/execute.ts](../submit/execute.ts)'s `runFrame`, and the WebGL 2 frame is
 * [submit/gl2.ts](../submit/gl2.ts)'s `drawGL2Frame`. The behaviour is held
 * unchanged elsewhere — every `renderer-*` trace preset still agrees call for call
 * — so what this file asserts is the thing item 13 actually changed: that a draw
 * on either backend reaches the device through the executor rather than through a
 * loop the backend kept to itself.
 *
 * The evidence is what each executor is the sole issuer of. Nothing else in the
 * WebGPU backend submits a command buffer, so a `submit` on the device is
 * `runFrame` having run; nothing else in the WebGL 2 backend calls `drawArrays`,
 * so a `drawArrays` on the context is `drawGL2Frame` having run. And `drawGL2Frame`
 * is exercised on its own besides, since it is a pure function of what it is
 * handed and its calls can be read without a backend around it.
 */


const WGSL = `struct Uniforms { u_time: f32, u_resolution: vec2<f32> };
@binding(0) @group(0) var<uniform> uniforms: Uniforms;
@fragment fn fragMain() -> @location(0) vec4<f32> { return vec4<f32>(uniforms.u_time); }`;

const BLOCK: UniformSlot[] = [
  { name: 'u_time', offset: 0, size: 4 },
  { name: 'u_resolution', offset: 8, size: 8 },
];

const wgsl = (): FrameGraph => wgslFrame('fixture', WGSL, BLOCK);

const VERTEX = '#version 300 es\nin vec3 position;\nvoid main(){gl_Position=vec4(position,1.0);}';
const FRAGMENT = '#version 300 es\nprecision highp float;\nout vec4 c;\nvoid main(){c=vec4(1.0);}';
const glsl = (): FrameGraph => glslFrame('fixture', VERTEX, FRAGMENT);

describe('every WebGPU draw goes through submit/execute', () => {
  it('submits the frame the executor recorded, once', () => {
    const gpu = createFakeGPU();
    const backend = createWebGPUBackend(gpu.canvas, gpu.device);
    if (!backend) throw new Error('the fake canvas gave no WebGPU context');

    backend.program(wgsl()).draw();

    // One render pass recorded and one command buffer submitted is the executor
    // having run the whole frame on one encoder. Nothing else in the backend does
    // either, so this is the draw reaching the device through submit/.
    expect(gpu.calls('beginRenderPass')).toHaveLength(1);
    expect(gpu.calls('submit')).toHaveLength(1);
  });
});

describe('every WebGL 2 draw goes through submit/gl2', () => {
  it('issues the one pass the executor draws', () => {
    const gl = createFakeGL();
    const backend = createWebGL2Backend(gl.canvas);
    if (!backend) throw new Error('the fake canvas gave no WebGL 2 context');

    backend.program(glsl()).draw();

    // The frame's three corners, drawn by the executor and by nothing else in the
    // backend.
    expect(gl.of('drawArrays').at(-1)).toMatchObject({ mode: 0x0004, first: 0, count: 3 });
  });

  it('is a pure function of what it is handed', () => {
    const gl = createFakeGL();
    const context = gl.canvas.getContext('webgl2', {}) as unknown as WebGL2RenderingContext;
    const program = {} as WebGLProgram;
    const quad = {} as WebGLBuffer;

    drawGL2Frame({ gl: context, program, quad, attribute: 0, vertices: [3], width: 320, height: 180 });

    // Bind the program and the quad, point the attribute at it, set the viewport
    // to the size handed in, draw the corners, and disable the array it enabled so
    // the pass leaves the attribute state as it found it (item 84): the whole of
    // the executor, in order, with no backend around it. `getContext` is the one
    // call before it, which is how the context was reached.
    expect(gl.calls.map((call) => call.call)).toEqual([
      'getContext',
      'useProgram',
      'bindBuffer',
      'enableVertexAttribArray',
      'vertexAttribPointer',
      'viewport',
      'drawArrays',
      'disableVertexAttribArray',
    ]);
    expect(gl.of('viewport').at(-1)).toMatchObject({ x: 0, y: 0, width: 320, height: 180 });
  });

  it('reads a thousand distinct records from one buffer, a bindBufferRange before each draw', () => {
    const gl = createFakeGL();
    const context = gl.canvas.getContext('webgl2', {}) as unknown as WebGL2RenderingContext;
    const program = {} as WebGLProgram;
    const quad = {} as WebGLBuffer;
    const buffer = {} as WebGLBuffer;

    // WebGL 2's arm of `Draw.perDraw` (item 27): one uniform buffer, a thousand
    // records at 256-byte slots, and a `bindBufferRange` pointing the block at each
    // draw's record before the draw — the same slice a dynamic offset reaches on
    // WebGPU. A thousand fullscreen corner draws, each reading its own transform.
    const offsets = Array.from({ length: 1000 }, (_, at) => at * 256);
    drawGL2Frame({
      gl: context,
      program,
      quad,
      attribute: 0,
      vertices: offsets.map(() => 3),
      width: 320,
      height: 180,
      perDraw: { buffer, binding: 0, size: 64, offsets },
    });

    // A thousand draws, a thousand ranges, and every offset distinct — the
    // thousand records a thousand draws read.
    const ranges = gl.of('bindBufferRange');
    expect(gl.of('drawArrays')).toHaveLength(1000);
    expect(ranges).toHaveLength(1000);
    expect(ranges.map((call) => call.offset)).toEqual(offsets);
    expect(new Set(ranges.map((call) => call.offset)).size).toBe(1000);
    // Each range is one record wide, at the uniform target, on the binding the
    // block was bound to — the offset alone is the draw's.
    expect(ranges.every((call) => call.size === 64 && call.target === 0x8a11 && call.index === 0)).toBe(true);
  });

  it('covers many instances with one drawArraysInstanced, and leaves a lone draw plain (item 28)', () => {
    const gl = createFakeGL();
    const context = gl.canvas.getContext('webgl2', {}) as unknown as WebGL2RenderingContext;
    const program = {} as WebGLProgram;
    const quad = {} as WebGLBuffer;

    // Two corners-draws: the first covers a thousand instances, the second one.
    // The instanced draw is one `drawArraysInstanced` reading the count, and the
    // lone one is a plain `drawArrays` — one draw call either way, which is why
    // `cost()` counts each as one.
    drawGL2Frame({
      gl: context,
      program,
      quad,
      attribute: 0,
      vertices: [3, 3],
      instances: [1000, undefined],
      width: 320,
      height: 180,
    });

    expect(gl.of('drawArraysInstanced')).toHaveLength(1);
    expect(gl.of('drawArraysInstanced').at(-1)).toMatchObject({ mode: 0x0004, first: 0, count: 3, instances: 1000 });
    expect(gl.of('drawArrays')).toHaveLength(1);
    expect(gl.of('drawArrays').at(-1)).toMatchObject({ mode: 0x0004, first: 0, count: 3 });
  });
});
