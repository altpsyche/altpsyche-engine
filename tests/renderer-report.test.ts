import { describe, expect, it } from 'vitest';
import { createWebGL2Backend } from '../gpu/webgl2';
import { createWebGPUBackend } from '../gpu/webgpu';
import { createFakeGL } from './support/fake-gl';
import { createFakeGPU } from './support/fake-gpu';

/**
 * What each backend says about the device behind it.
 *
 * These hold the shape and never a value. A ceiling is the card's own answer, so
 * a test asserting that this machine reports 8192 anywhere would fail on the next
 * machine and would be measuring the driver rather than the code. What the shape
 * has to survive is the two APIs answering by different mechanisms: one keeps its
 * ceilings on a prototype and hands its features over as a set, the other has one
 * call per ceiling and a list of extension names. The numbers themselves are
 * printed by `backends.mjs` off a real device.
 */

function webgl2Over(setup: (gl: ReturnType<typeof createFakeGL>) => void = () => {}) {
  const gl = createFakeGL();
  setup(gl);
  const backend = createWebGL2Backend(gl.canvas);
  if (!backend) throw new Error('the fake canvas gave no WebGL 2 context');
  return { gl, backend };
}

function webgpuOver(setup: (gpu: ReturnType<typeof createFakeGPU>) => void = () => {}) {
  const gpu = createFakeGPU();
  setup(gpu);
  const backend = createWebGPUBackend(gpu.canvas, gpu.device);
  if (!backend) throw new Error('the fake canvas gave no WebGPU context');
  return { gpu, backend };
}

describe('both backends answer it', () => {
  it('reads every ceiling the WebGL 2 context carries, by the name the specification gives it', () => {
    const { gl, backend } = webgl2Over();
    const report = backend.report();
    expect(Object.keys(report.limits).sort()).toEqual([...gl.ceilings].sort());
    for (const value of Object.values(report.limits)) expect(Number.isFinite(value)).toBe(true);
  });

  it('reads every ceiling the device reports on WebGPU', () => {
    const { gpu, backend } = webgpuOver();
    const report = backend.report();
    expect(Object.keys(report.limits).sort()).toEqual(Object.keys(gpu.limits).sort());
    expect(report.limits.maxTextureDimension2D).toBe(gpu.limits.maxTextureDimension2D);
  });

  it('names the extensions a WebGL 2 context has, sorted', () => {
    const { backend } = webgl2Over((gl) => {
      gl.extensions = ['OES_texture_float_linear', 'EXT_color_buffer_float'];
    });
    expect(backend.report().features).toEqual(['EXT_color_buffer_float', 'OES_texture_float_linear']);
  });

  it('names the features a device has, sorted, out of the set the browser hands over', () => {
    const { backend } = webgpuOver((gpu) => {
      gpu.features = new Set(['timestamp-query', 'depth-clip-control']);
    });
    expect(backend.report().features).toEqual(['depth-clip-control', 'timestamp-query']);
  });
});

describe('a device with nothing optional', () => {
  // Neither of these is a refusal. A card that has none of the optional API is a
  // card a shader still draws on, so the report says so and the caller decides
  // what to leave out.
  it('reports no extensions rather than throwing on WebGL 2', () => {
    const { backend } = webgl2Over((gl) => {
      gl.extensions = [];
    });
    expect(backend.report().features).toEqual([]);
  });

  it('reports no features rather than throwing on WebGPU', () => {
    const { backend } = webgpuOver((gpu) => {
      gpu.features = new Set();
    });
    expect(backend.report().features).toEqual([]);
  });
});

describe('a ceiling the API does not answer', () => {
  it('is absent from the report rather than reported as a zero', () => {
    // A ceiling read as zero is a device that can hold no texture at all, which
    // is a picture nobody would try to draw, so an unanswered name is left out.
    const { backend } = webgl2Over((gl) => {
      gl.ceilings = gl.ceilings.filter((name) => name !== 'MAX_TEXTURE_SIZE');
    });
    const limits = backend.report().limits;
    expect('MAX_TEXTURE_SIZE' in limits).toBe(false);
    expect(limits.MAX_SAMPLES).toBeGreaterThan(0);
  });

  it('leaves a report with nothing in it where the device answers nothing at all', () => {
    const { backend } = webgl2Over((gl) => {
      gl.ceilings = [];
      gl.extensions = [];
    });
    expect(backend.report()).toEqual({ limits: {}, features: [] });
  });
});

describe('the report is asked of the device rather than of a frame', () => {
  it('answers before anything has been drawn on either backend', () => {
    expect(Object.keys(webgl2Over().backend.report().limits).length).toBeGreaterThan(0);
    expect(Object.keys(webgpuOver().backend.report().limits).length).toBeGreaterThan(0);
  });

  it('reaches the device through the recorder, which forwards a read it cannot write down', () => {
    // The recorder wraps every call the backend makes, and a ceiling is a read
    // rather than a call, so a wrapper that only carried methods would report a
    // device with no ceilings at all while every trace stayed green.
    const { gpu, backend } = webgpuOver();
    expect(backend.report().limits.maxBindGroups).toBe(gpu.limits.maxBindGroups);
    expect(gpu.calls('getParameter')).toEqual([]);
  });
});
