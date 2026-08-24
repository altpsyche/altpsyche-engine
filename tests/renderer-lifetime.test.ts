import { describe, expect, it } from 'vitest';
import { createFakeGPU } from './support/fake-gpu';

/**
 * The recording double now models resource lifetimes, not only calls, which is
 * the gap [ABSTRACTION.md](../docs/ABSTRACTION.md)'s audit named: "the double
 * models calls rather than lifetimes, so usage and destruction mistakes are
 * invisible to the fast suite". Two of those mistakes are made here and each is
 * caught — a use-after-free is refused as it happens, and a leak is named at a
 * teardown — where before this the double drew them both without complaint.
 *
 * It is the arena's liveness (item 10) carried into the device double: the arena
 * refuses a stale handle, `Lifetimes` refuses a stale wrapper, so a resource used
 * after it was freed is a failure whichever side still holds it.
 */
describe('the recording double tracks resource liveness', () => {
  it('refuses a buffer used after it was destroyed', () => {
    const gpu = createFakeGPU();
    const buffer = gpu.device.createBuffer({
      label: 'vertices',
      size: 16,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    buffer.destroy();
    expect(() => gpu.device.queue.writeBuffer(buffer, 0, new Float32Array([1, 2, 3, 4]))).toThrow(
      /vertices was used after it was destroyed/
    );
  });

  it('refuses a buffer bound to a pass after it was destroyed', () => {
    const gpu = createFakeGPU();
    const buffer = gpu.device.createBuffer({ label: 'mesh', size: 16, usage: GPUBufferUsage.VERTEX });
    buffer.destroy();
    const pass = gpu.device.createCommandEncoder().beginRenderPass({ colorAttachments: [] });
    expect(() => pass.setVertexBuffer(0, buffer)).toThrow(/mesh was used after it was destroyed/);
  });

  it('refuses a texture viewed after it was destroyed', () => {
    const gpu = createFakeGPU();
    const texture = gpu.device.createTexture({
      label: 'depth',
      size: [4, 4],
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    texture.destroy();
    expect(() => texture.createView()).toThrow(/depth was used after it was destroyed/);
  });

  it('lets a live resource be used', () => {
    const gpu = createFakeGPU();
    const buffer = gpu.device.createBuffer({ label: 'live', size: 16, usage: GPUBufferUsage.VERTEX });
    expect(() => gpu.device.queue.writeBuffer(buffer, 0, new Float32Array([0]))).not.toThrow();
  });

  it('names a resource allocated and never freed as leaked', () => {
    const gpu = createFakeGPU();
    gpu.device.createBuffer({ label: 'orphan', size: 16, usage: GPUBufferUsage.VERTEX });
    gpu.device.createTexture({
      label: 'canvas-copy',
      size: [2, 2],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.COPY_SRC,
    });
    expect(gpu.lifetimes.leaked()).toEqual(expect.arrayContaining(['orphan', 'canvas-copy']));
  });

  it('reports nothing leaked once every resource is freed', () => {
    const gpu = createFakeGPU();
    const buffer = gpu.device.createBuffer({ label: 'kept', size: 16, usage: GPUBufferUsage.VERTEX });
    const query = gpu.device.createQuerySet({ label: 'times', type: 'timestamp', count: 2 });
    expect(gpu.lifetimes.leaked()).toEqual(expect.arrayContaining(['kept', 'times']));
    buffer.destroy();
    query.destroy();
    expect(gpu.lifetimes.leaked()).toEqual([]);
  });

  it('leaves a double free harmless, the way the arena does', () => {
    const gpu = createFakeGPU();
    const buffer = gpu.device.createBuffer({ label: 'twice', size: 16, usage: GPUBufferUsage.VERTEX });
    buffer.destroy();
    expect(() => buffer.destroy()).not.toThrow();
    expect(gpu.lifetimes.leaked()).toEqual([]);
  });
});
