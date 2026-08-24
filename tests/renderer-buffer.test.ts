import { describe, expect, it } from 'vitest';
import { createWebGPUBackend } from '../renderer/webgpu';
import { createFakeGPU } from './support/fake-gpu';
import type { BufferResource, ShaderFrame } from '@altpsyche/engine';

/**
 * A block of bytes a shader reads or writes.
 *
 * Every other resource here holds something a person can look at or something a
 * page fed in. This one holds a number the card worked out for itself, which is
 * what a later pass needs when how much work it does was decided by an earlier
 * one, and there is nowhere else to put such a number: a texture holds a picture
 * and a uniform block holds what the page sent.
 *
 * Whether the source may write into it is the declaration's own access, and it
 * decides the layout entry. A layout claiming a buffer is written where the source
 * declared the read-only kind is a pipeline the card refuses by binding number and
 * says nothing about the description that asked for it, so the two are kept in
 * step by reading the access off the source.
 */

const WRITES = `struct Uniforms { u_time: f32, u_resolution: vec2<f32> };
@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read_write> counts: array<u32>;

@compute @workgroup_size(1)
fn plan() {
  counts[0] = u32(uniforms.u_time);
}`;

const counts = (over: Partial<BufferResource> = {}): BufferResource => ({
  kind: 'buffer',
  name: 'counts',
  bytes: 16,
  access: 'read-write',
  ...over,
});

const holding = (over: Partial<ShaderFrame> = {}): ShaderFrame => ({
  id: 'fixture-buffer',
  target: 'wgsl',
  uniforms: [
    { name: 'u_time', type: 'float' },
    { name: 'u_resolution', type: 'vec2' },
  ],
  resources: [{ kind: 'uniform', name: 'uniforms', block: [{ name: 'u_time', offset: 0, size: 4 }] }, counts()],
  modules: [{ name: 'wgsl', code: WRITES }],
  pipelines: [
    {
      kind: 'compute',
      name: 'plan',
      compute: { module: 'wgsl', entry: 'plan' },
      bindings: [
        { group: 0, binding: 0, resource: 'uniforms', visibility: ['compute'] },
        { group: 0, binding: 1, resource: 'counts', visibility: ['compute'] },
      ],
      workgroup: [1, 1, 1],
    },
  ],
  passes: [{ pipeline: 'plan', dispatch: [1, 1, 1] }],
  ...over,
});

function backendOver() {
  const gpu = createFakeGPU({ connected: false });
  const backend = createWebGPUBackend(gpu.canvas, gpu.device);
  if (!backend) throw new Error('the fake canvas gave no WebGPU context');
  backend.resize(800, 600);
  return { gpu, backend };
}

const made = (gpu: ReturnType<typeof createFakeGPU>) =>
  gpu.calls('createBuffer').find((call) => call.label === 'counts');

describe('the buffer a description names', () => {
  it('is made at the size the description gives, and asks to be a storage binding a caller can copy out of', () => {
    const { gpu, backend } = backendOver();
    backend.program(holding());

    expect(made(gpu)?.size).toBe(16);
    expect(made(gpu)?.usage).toBe(GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);
  });

  it('is made at whatever size the description gives, since only the entry knows how many words a source needs', () => {
    const { gpu, backend } = backendOver();
    backend.program(holding({ resources: [holding().resources[0] as BufferResource, counts({ bytes: 32 })] }));

    expect(made(gpu)?.size).toBe(32);
  });

  it('is handed out empty rather than filled, since WebGPU zeroes a new buffer', () => {
    const { gpu, backend } = backendOver();
    backend.program(holding());

    expect(gpu.calls('writeBuffer')).toEqual([]);
  });

  it('is bound as itself rather than as the uniform block behind it', () => {
    const { gpu, backend } = backendOver();
    backend.program(holding());

    expect(gpu.calls('createBindGroup')[0]?.bindings).toEqual([
      { binding: 0, resource: 'buffer1' },
      { binding: 1, resource: 'counts' },
    ]);
  });

  it('reaches the layout as a written block where the source may write it', () => {
    const { gpu, backend } = backendOver();
    backend.program(holding());

    expect(gpu.calls('createBindGroupLayout')[0]?.entries).toEqual([
      { binding: 0, visibility: GPUShaderStage.COMPUTE, kind: 'buffer:uniform' },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, kind: 'buffer:storage' },
    ]);
  });

  it('reaches it as a read-only block where the source only reads it', () => {
    const { gpu, backend } = backendOver();
    backend.program(
      holding({ resources: [holding().resources[0] as BufferResource, counts({ access: 'read' })] })
    );

    expect(gpu.calls('createBindGroupLayout')[0]?.entries).toEqual([
      { binding: 0, visibility: GPUShaderStage.COMPUTE, kind: 'buffer:uniform' },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, kind: 'buffer:read-only-storage' },
    ]);
  });

  it('is given back when the program is disposed, along with everything else it owns', () => {
    const { gpu, backend } = backendOver();
    const program = backend.program(holding());
    program.dispose();

    expect(gpu.calls('buffer.destroy').map((call) => call.label)).toContain('counts');
  });

  it('is refused at a size that is no whole number of four-byte words', () => {
    const { backend } = backendOver();

    expect(() =>
      backend.program(holding({ resources: [holding().resources[0] as BufferResource, counts({ bytes: 6 })] }))
    ).toThrow('the frame for "fixture-buffer" gives "counts" 6 bytes, which is no whole number of four-byte words');
  });

  it('is refused at no size at all, which is a binding the card reports nothing about', () => {
    const { backend } = backendOver();

    expect(() =>
      backend.program(holding({ resources: [holding().resources[0] as BufferResource, counts({ bytes: 0 })] }))
    ).toThrow('the frame for "fixture-buffer" gives "counts" 0 bytes, which is no whole number of four-byte words');
  });
});

const dial = (over: Partial<BufferResource> = {}): BufferResource => ({
  kind: 'buffer',
  name: 'dial',
  bytes: 16,
  access: 'read',
  data: new Uint8Array(new Uint32Array([1, 2, 3, 4]).buffer),
  source: 'fixture-dial.buffer.bin',
  ...over,
});

const withDial = (over: Partial<BufferResource> = {}): ShaderFrame =>
  holding({ resources: [holding().resources[0] as BufferResource, counts(), dial(over)] });

describe('the contents a caller writes in', () => {
  it('hands the bytes to the buffer the build filled, over the top of the ones it started with', () => {
    const { gpu, backend } = backendOver();
    const program = backend.program(withDial());
    const next = new Uint8Array(new Uint32Array([10, 20, 30, 40]).buffer);

    program.writeBuffer('dial', next);

    const writes = gpu.calls('writeBuffer').filter((call) => call.label === 'dial');
    // Two writes to it: the build's first contents on creation, then the caller's.
    // The recorder keeps each byte as a float, so the words are read back off the
    // bytes rather than off the recorded array directly.
    expect(writes).toHaveLength(2);
    const bytes = Uint8Array.from(writes[1]?.data as Float32Array);
    expect([...new Uint32Array(bytes.buffer)]).toEqual([10, 20, 30, 40]);
  });

  it('refuses a buffer the card fills for itself, since the page put no contents there', () => {
    const { backend } = backendOver();
    const program = backend.program(withDial());

    expect(() => program.writeBuffer('counts', new Uint8Array(16))).toThrow(
      'the frame for "fixture-buffer" fills "counts" on the card, so the page has no contents there to replace'
    );
  });

  it('refuses a name the frame declares no buffer for, by that name', () => {
    const { backend } = backendOver();
    const program = backend.program(withDial());

    expect(() => program.writeBuffer('totals', new Uint8Array(16))).toThrow(
      'the frame for "fixture-buffer" declares no buffer called "totals"'
    );
  });

  it('refuses more bytes than the buffer holds', () => {
    const { backend } = backendOver();
    const program = backend.program(withDial());

    expect(() => program.writeBuffer('dial', new Uint8Array(32))).toThrow(
      'the frame for "fixture-buffer" writes 32 bytes into "dial", which holds 16'
    );
  });

  it('refuses a byte count that is no whole number of four-byte words', () => {
    const { backend } = backendOver();
    const program = backend.program(withDial());

    expect(() => program.writeBuffer('dial', new Uint8Array(6))).toThrow(
      'the frame for "fixture-buffer" writes 6 bytes into "dial", which is no whole number of four-byte words'
    );
  });
});

describe('the words a caller reads back', () => {
  it('copies the buffer out to one of its own rather than mapping the one the frame writes', async () => {
    const { gpu, backend } = backendOver();
    const program = backend.program(holding());
    gpu.mapped = new Uint8Array(new Uint32Array([7, 0, 0, 0]).buffer);

    await program.readBuffer('counts');

    // A buffer a shader writes cannot be mapped, and mapping the frame's own
    // would take it away from the next frame, so the copy is the whole mechanism.
    const copy = gpu.calls('copyBufferToBuffer')[0];
    expect(copy?.from).toBe('counts');
    expect(copy?.to).toBe('counts-read');
    expect(copy?.size).toBe(16);
    expect(gpu.calls('mapAsync')[0]?.label).toBe('counts-read');
  });

  it('hands back the words that were in it, as words rather than bytes', async () => {
    const { gpu, backend } = backendOver();
    const program = backend.program(holding());
    gpu.mapped = new Uint8Array(new Uint32Array([1, 256, 65_536, 4_294_967_295]).buffer);

    expect([...(await program.readBuffer('counts'))]).toEqual([1, 256, 65_536, 4_294_967_295]);
  });

  it('keeps the words after the mapping is given up, since the memory behind one is gone', async () => {
    const { gpu, backend } = backendOver();
    const program = backend.program(holding());
    gpu.mapped = new Uint8Array(new Uint32Array([42, 0, 0, 0]).buffer);

    const words = await program.readBuffer('counts');
    expect(gpu.calls('unmap')[0]?.label).toBe('counts-read');
    expect(words[0]).toBe(42);
  });

  it('gives the buffer it read from back to the frame rather than holding it', async () => {
    const { gpu, backend } = backendOver();
    const program = backend.program(holding());
    gpu.mapped = new Uint8Array(16);

    await program.readBuffer('counts');
    await program.readBuffer('counts');

    // One buffer of its own per read, each destroyed, so a caller reading every
    // frame does not leave a buffer behind on every one of them.
    expect(gpu.calls('createBuffer').filter((call) => call.label === 'counts-read')).toHaveLength(2);
    expect(gpu.calls('buffer.destroy').filter((call) => call.label === 'counts-read')).toHaveLength(2);
  });

  it('refuses a name the frame declares no buffer for, by that name', async () => {
    const { backend } = backendOver();
    const program = backend.program(holding());

    await expect(program.readBuffer('totals')).rejects.toThrow(/declares no buffer called "totals"/);
  });
});
