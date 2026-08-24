import { describe, expect, it } from 'vitest';
import { createWebGPUBackend } from '../renderer/webgpu';
import { createWebGL2Backend } from '../renderer/webgl2';
import { wgslFrame, glslFrame } from '@altpsyche/engine';
import type { ShaderFrame, UniformSlot } from '@altpsyche/engine';
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

const UNIFORMS = [
  { name: 'u_time', type: 'float' },
  { name: 'u_resolution', type: 'vec2' },
];

const WGSL = `struct Uniforms { u_time: f32, u_resolution: vec2<f32> };
@binding(0) @group(0) var<uniform> uniforms: Uniforms;
@fragment fn fragMain() -> @location(0) vec4<f32> { return vec4<f32>(uniforms.u_time); }`;

const BLOCK: UniformSlot[] = [
  { name: 'u_time', offset: 0, size: 4 },
  { name: 'u_resolution', offset: 8, size: 8 },
];

const wgsl = (): ShaderFrame => wgslFrame('fixture', WGSL, BLOCK, UNIFORMS);

const VERTEX = '#version 300 es\nin vec3 position;\nvoid main(){gl_Position=vec4(position,1.0);}';
const FRAGMENT = '#version 300 es\nprecision highp float;\nout vec4 c;\nvoid main(){c=vec4(1.0);}';
const glsl = (): ShaderFrame => glslFrame('fixture', VERTEX, FRAGMENT, UNIFORMS);

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

    drawGL2Frame({ gl: context, program, quad, attribute: 0, vertices: 3, width: 320, height: 180 });

    // Bind the program and the quad, point the attribute at it, set the viewport
    // to the size handed in, and draw the corners: the whole of the executor, in
    // order, with no backend around it. `getContext` is the one call before it,
    // which is how the context was reached.
    expect(gl.calls.map((call) => call.call)).toEqual([
      'getContext',
      'useProgram',
      'bindBuffer',
      'enableVertexAttribArray',
      'vertexAttribPointer',
      'viewport',
      'drawArrays',
    ]);
    expect(gl.of('viewport').at(-1)).toMatchObject({ x: 0, y: 0, width: 320, height: 180 });
  });
});
