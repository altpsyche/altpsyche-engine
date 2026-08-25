import { describe, expect, it } from 'vitest';
import { createWebGPUBackend } from '../gpu/webgpu';
import { frameOf } from '@altpsyche/engine';
import type { FrameGraph } from '@altpsyche/engine';
import { createFakeGPU } from './support/fake-gpu';
import { loadPictureFixture } from './support/fixture';

/**
 * The sampling preset as the build wrote it, drawn against the recording device.
 *
 * The description, the source and the picture come from a fixture this package
 * owns, so the test runs anywhere the library does. They are still not written
 * beside the assertions, which would only ever say the backend agrees with the
 * test: the fixture is what a build produced, and a check on the site side holds
 * that build against these files, so drift is caught by whoever owns the build.
 */
const { description, code, bytes } = loadPictureFixture('core-texture');

const WIDTH = 800;
const HEIGHT = 600;

function drawn(): ReturnType<typeof createFakeGPU> {
  const gpu = createFakeGPU();
  const backend = createWebGPUBackend(gpu.canvas, gpu.device);
  if (!backend) throw new Error('the fake canvas gave no WebGPU context');
  const frame: FrameGraph = frameOf(
    'core-texture',
    description,
    { wgsl: code },
    [
      { name: 'u_time', offset: 0, size: 4 },
      { name: 'u_resolution', offset: 8, size: 8 },
    ],
    undefined,
    new Map([['grain', bytes]])
  );
  backend.resize(WIDTH, HEIGHT);
  backend.program(frame).draw();
  return gpu;
}

describe('the sampling preset the build wrote', () => {
  it('is one render pass over three corners and no compute pass at all', () => {
    const gpu = drawn();
    expect(gpu.calls('beginRenderPass')).toHaveLength(1);
    expect(gpu.calls('beginComputePass')).toHaveLength(0);
    expect(gpu.calls('draw')[0]).toMatchObject({ count: 3 });
  });

  it('hands the card the picture the build wrote, whole, at four bytes a pixel', () => {
    const gpu = drawn();
    expect(bytes).toHaveLength(64 * 64 * 4);
    expect(gpu.calls('writeTexture')).toEqual([
      { call: 'writeTexture', label: 'grain', bytes: bytes.length, stride: 64 * 4, size: [64, 64] },
    ]);
  });

  it('makes the picture at its own size rather than the frame’s, so a resize leaves it alone', () => {
    const gpu = drawn();
    const made = gpu.calls('createTexture').find((call) => call.label === 'grain');
    expect(made).toMatchObject({ size: [64, 64], format: 'rgba8unorm' });
    expect(gpu.calls('createTexture').find((call) => call.label === 'frame')).toMatchObject({ size: [800, 600] });
  });

  it('makes the sampler the entry chose rather than the card’s default', () => {
    expect(drawn().calls('createSampler')[0]).toMatchObject({
      label: 'grainSampler',
      magFilter: 'linear',
      addressModeU: 'repeat',
      addressModeV: 'repeat',
    });
  });

  it('binds the block, the view and the sampler at the numbers the source declares', () => {
    expect(drawn().calls('createBindGroup')[0]!.bindings).toEqual([
      { binding: 0, resource: 'buffer1' },
      { binding: 1, resource: 'grain.view' },
      { binding: 2, resource: 'grainSampler' },
    ]);
  });

  it('declares all three to the fragment stage alone, since the vertex half reads nothing', () => {
    expect(drawn().calls('createBindGroupLayout')[0]!.entries).toEqual([
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, kind: 'buffer:uniform' },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, kind: 'texture' },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, kind: 'sampler' },
    ]);
  });

  it('draws into the frame’s own target rather than naming a picture to copy out', () => {
    expect(description.present).toBeUndefined();
    expect(drawn().calls('copyTextureToTexture')).toHaveLength(0);
  });
});
