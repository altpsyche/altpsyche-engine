import { describe, expect, it } from 'vitest';
import { createWebGPUBackend } from '../gpu/webgpu';
import { frameOf } from '@altpsyche/engine';
import type { FrameGraph } from '@altpsyche/engine';
import { createFakeGPU } from './support/fake-gpu';
import { loadFixture } from './support/fixture';
import { texture } from '../graph/handles.js';

/**
 * The compute preset as the build wrote it, drawn against the recording device.
 *
 * The description and the source come from a fixture this package owns, so the
 * test runs anywhere the library does. They are still not written beside the
 * assertions, which would only ever say the backend agrees with the test: the
 * fixture is what a build produced, and a check on the site side holds that build
 * against these files, so drift is caught by whoever owns the build.
 */
const { description, code } = loadFixture('core-compute');

const WIDTH = 800;
const HEIGHT = 600;

/** The block size the source declares, which is what the dispatch count is
 * worked out from. Read off the description so a source that changes it moves the
 * expected count with it. */
const workgroup = () => {
  const pipeline = description.pipelines[0];
  if (pipeline?.kind !== 'compute') throw new Error('the preset is drawn by a compute pipeline');
  return pipeline.workgroup;
};

function drawn(): { gpu: ReturnType<typeof createFakeGPU>; frame: FrameGraph } {
  const gpu = createFakeGPU();
  const backend = createWebGPUBackend(gpu.canvas, gpu.device);
  if (!backend) throw new Error('the fake canvas gave no WebGPU context');
  const frame = frameOf(
    'core-compute',
    description,
    { wgsl: code },
    [
      { name: 'u_time', offset: 0, size: 4 },
      { name: 'u_resolution', offset: 8, size: 8 },
    ]
  );
  backend.resize(WIDTH, HEIGHT);
  const program = backend.program(frame);
  program.draw();
  return { gpu, frame };
}

describe('the compute preset the build wrote', () => {
  it('is one compute pass over the frame and no render pass at all', () => {
    const { gpu } = drawn();
    expect(gpu.calls('beginComputePass')).toHaveLength(1);
    expect(gpu.calls('beginRenderPass')).toHaveLength(0);
    expect(gpu.calls('draw')).toHaveLength(0);
  });

  it('dispatches the blocks the workgroup size implies rather than one per pixel', () => {
    const { gpu } = drawn();
    const [x, y] = workgroup();
    expect(gpu.calls('dispatchWorkgroups')[0]).toMatchObject({
      x: Math.ceil(WIDTH / x),
      y: Math.ceil(HEIGHT / y),
      z: 1,
    });
  });

  it('keeps the producer’s block count across a resize rather than recounting it', () => {
    // The count used to be worked out every frame from the current size. Item 72
    // moved it to the producer that had the size, so the backend dispatches the
    // count the build wrote and a resize between two draws does not change it —
    // covering a new size is a fresh frame the page hands over, not the backend's
    // to derive. The property that would break is a backend that recounted here.
    const gpu = createFakeGPU();
    const backend = createWebGPUBackend(gpu.canvas, gpu.device);
    if (!backend) throw new Error('the fake canvas gave no WebGPU context');
    const frame = frameOf('core-compute', description, { wgsl: code }, [
      { name: 'u_time', offset: 0, size: 4 },
      { name: 'u_resolution', offset: 8, size: 8 },
    ]);
    backend.resize(WIDTH, HEIGHT);
    const program = backend.program(frame);
    program.draw();
    backend.resize(WIDTH / 2, HEIGHT / 2);
    program.draw();
    const [x, y] = workgroup();
    const covered = { x: Math.ceil(WIDTH / x), y: Math.ceil(HEIGHT / y), z: 1 };
    expect(gpu.calls('dispatchWorkgroups').at(-1)).toMatchObject(covered);
  });

  it('builds a compute pipeline at the layout the description carries, not one the driver inferred', () => {
    const { gpu } = drawn();
    expect(gpu.calls('createComputePipeline')).toHaveLength(1);
    expect(gpu.calls('createRenderPipeline')).toHaveLength(0);
    expect(gpu.calls('getBindGroupLayout')).toHaveLength(0);
    expect(gpu.calls('createBindGroupLayout')).toHaveLength(1);
  });

  it('owns a texture the size of the picture in the format its source writes', () => {
    const { gpu } = drawn();
    const picture = gpu.calls('createTexture').find((call) => call.label === 'texture1');
    expect(picture?.size).toEqual([WIDTH, HEIGHT]);
    expect(picture?.format).toBe('rgba8unorm');
    // Written by the program, and readable because the frame says it is the
    // picture. Both are numbers rather than names, since a flag going missing is
    // a copy the driver refuses at the copy rather than where it was made.
    expect(picture?.usage).toBe(GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC);
  });

  it('copies the picture into the frame target, which is the only way a storage texture is seen', () => {
    const { gpu } = drawn();
    const copies = gpu.calls('copyTextureToTexture');
    expect(copies).toHaveLength(1);
    expect(copies[0]).toMatchObject({ from: 'texture1', to: 'frame' });
  });

  it('makes a frame target that may be copied into as well as out of', () => {
    const { gpu } = drawn();
    const target = gpu.calls('createTexture').find((call) => call.label === 'frame');
    expect(Number(target?.usage) & GPUTextureUsage.COPY_DST).toBe(GPUTextureUsage.COPY_DST);
  });

  it('has a description in the manifest at all, or every case here measures nothing', () => {
    expect(description.passes).toHaveLength(1);
    expect(description.present).toBe(texture(1));
  });
});
