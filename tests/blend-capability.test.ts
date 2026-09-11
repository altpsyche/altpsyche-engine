import { describe, expect, it } from 'vitest';
import { refusal, webgl2Capabilities, webgpuCapabilities } from '@altpsyche/engine';
import type { Capability, PipelineSpec } from '@altpsyche/engine';
import { uniform } from '../graph/handles';

/**
 * The two blend capabilities, and where each one comes from (item 11).
 *
 * **The defect these close was a silence.** `blendFuncSeparate`,
 * `blendEquationSeparate` and `blendColor` are core WebGL 2 and this package's
 * WebGL 2 backend called none of them — the word `blend` appeared nowhere in that
 * file — so a pipeline naming `targets[].blend` drew blended on WebGPU, unblended
 * on WebGL 2, and `refusal` returned null for both. Applying the blend closes
 * almost all of it. These two name what is left, and both are read off the
 * pipeline rather than declared, so a caller cannot forget to ask for them.
 */

const OVER: GPUBlendState = {
  color: { operation: 'add', srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
  alpha: { operation: 'add', srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
};
const DUAL: GPUBlendState = {
  color: { operation: 'add', srcFactor: 'src1', dstFactor: 'one-minus-src1' },
  alpha: { operation: 'add', srcFactor: 'one', dstFactor: 'zero' },
};

/** One render pipeline whose targets are whatever the test hands in. */
const pipeline = (targets: { format: GPUTextureFormat; blend?: GPUBlendState }[]): PipelineSpec =>
  ({
    kind: 'render',
    source: { wgsl: { vertex: '', fragment: '' } },
    fragment: { document: 'wgsl', entry: 'shade' },
    bindings: [{ group: 0, binding: 0, resource: uniform(0), visibility: ['fragment'] }],
    targets,
  }) as unknown as PipelineSpec;

const graph = (targets: { format: GPUTextureFormat; blend?: GPUBlendState }[]) => ({
  id: 'blend',
  pipelines: [pipeline(targets)],
});

const webgl2 = { backend: 'webgl2' as const, capabilities: webgl2Capabilities([]) };
const webgpuWithout = { backend: 'webgpu' as const, capabilities: webgpuCapabilities([]) };
const webgpuWith = { backend: 'webgpu' as const, capabilities: webgpuCapabilities(['dual-source-blending']) };

describe('an ordinary blend needs no capability and draws on both backends', () => {
  it('refuses nothing for one target naming a blend', () => {
    // The common case and the one the silence was worst for: a stroke at half
    // opacity. WebGL 2 applies this now, so nothing is refused for it.
    expect(refusal(graph([{ format: 'rgba8unorm', blend: OVER }]), webgl2)).toBeNull();
  });

  it('refuses nothing where several targets name the same blend', () => {
    // One blend state covers every draw buffer, which is exactly what WebGL 2 has.
    const same = [
      { format: 'rgba8unorm' as GPUTextureFormat, blend: OVER },
      { format: 'rgba8unorm' as GPUTextureFormat, blend: OVER },
    ];
    expect(refusal(graph(same), webgl2)).toBeNull();
  });
});

describe('targets that draw under different blends need per-target-blend', () => {
  it('refuses on WebGL 2, which has one blend state for every draw buffer', () => {
    const mixed = [
      { format: 'rgba8unorm' as GPUTextureFormat, blend: OVER },
      { format: 'rgba8unorm' as GPUTextureFormat },
    ];
    expect(refusal(graph(mixed), webgl2)).toContain('per-target-blend');
  });

  it('counts a target naming no blend as a state of its own', () => {
    // The reading that found core-depth. A colour written straight in is not the
    // absence of a blend state, it is a different one, and a check that filtered
    // the undefined ones out would have called that preset drawable here.
    const mixed = [
      { format: 'rgba8unorm' as GPUTextureFormat, blend: OVER },
      { format: 'rgba8unorm' as GPUTextureFormat },
    ];
    expect(refusal(graph(mixed), webgl2)).not.toBeNull();
  });

  it('draws on any WebGPU device, which carries one blend state per target', () => {
    const mixed = [
      { format: 'rgba8unorm' as GPUTextureFormat, blend: OVER },
      { format: 'rgba8unorm' as GPUTextureFormat },
    ];
    expect(refusal(graph(mixed), webgpuWithout)).toBeNull();
  });
});

describe('the src1 factors need dual-source-blend, which is optional even on WebGPU', () => {
  it('refuses on a WebGPU device that does not report the feature', () => {
    expect(refusal(graph([{ format: 'rgba8unorm', blend: DUAL }]), webgpuWithout)).toContain('dual-source-blend');
  });

  it('draws on a WebGPU device that does report it', () => {
    expect(refusal(graph([{ format: 'rgba8unorm', blend: DUAL }]), webgpuWith)).toBeNull();
  });

  it('refuses on WebGL 2, which has no second fragment output to blend against', () => {
    expect(refusal(graph([{ format: 'rgba8unorm', blend: DUAL }]), webgl2)).toContain('dual-source-blend');
  });

  it('is read off the factors and not off the operation or a constant colour', () => {
    // A blend naming a constant colour is not a dual-source blend, and a check
    // reading every field rather than the four factor fields would say it was.
    const constant: GPUBlendState = {
      color: { operation: 'add', srcFactor: 'constant', dstFactor: 'one-minus-constant' },
      alpha: { operation: 'max', srcFactor: 'one', dstFactor: 'zero' },
    };
    expect(refusal(graph([{ format: 'rgba8unorm', blend: constant }]), webgl2)).toBeNull();
  });
});

describe('neither capability is on WebGL 2 and per-target-blend is core on WebGPU', () => {
  it('reads them off the two capability sets rather than off a refusal', () => {
    const gl = webgl2Capabilities(['EXT_float_blend']);
    expect(gl.has('per-target-blend' as Capability)).toBe(false);
    expect(gl.has('dual-source-blend' as Capability)).toBe(false);
    // Core on WebGPU: every device has it, reported or not.
    expect(webgpuCapabilities([]).has('per-target-blend' as Capability)).toBe(true);
    // Optional on WebGPU: only where the feature is reported.
    expect(webgpuCapabilities([]).has('dual-source-blend' as Capability)).toBe(false);
    expect(webgpuCapabilities(['dual-source-blending']).has('dual-source-blend' as Capability)).toBe(true);
  });
});
