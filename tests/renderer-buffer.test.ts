import type { WgslFrameGraph } from '@altpsyche/engine';
import { describe, expect, it } from 'vitest';
import { createWebGPUBackend } from '../gpu/webgpu';
import { createFakeGPU } from './support/fake-gpu';
import { buffer, moduleHandle, pipelineHandle, uniform } from '../graph/handles.js';
import type { BufferHandle, BufferResource, FrameGraph } from '@altpsyche/engine';

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
  bytes: 16,
  access: 'read-write',
  ...over,
});

const holding = (over: Partial<WgslFrameGraph> = {}): FrameGraph => ({
  id: 'fixture-buffer',
  authored: 'wgsl',
  resources: [{ kind: 'uniform', block: [{ name: 'u_time', offset: 0, size: 4 }] }, counts()],
  modules: [{ name: 'wgsl', wgsl: WRITES }],
  pipelines: [
    {
      kind: 'compute',
      compute: { module: moduleHandle(0), entry: 'plan' },
      bindings: [
        { group: 0, binding: 0, resource: uniform(0), visibility: ['compute'] },
        { group: 0, binding: 1, resource: buffer(1), visibility: ['compute'] },
      ],
      workgroup: [1, 1, 1],
    },
  ],
  passes: [{ pipeline: pipelineHandle(0), groups: [1, 1, 1] }],
  ...over,
});

function backendOver() {
  const gpu = createFakeGPU({ connected: false });
  const backend = createWebGPUBackend(gpu.canvas, gpu.device);
  if (!backend) throw new Error('the fake canvas gave no WebGPU context');
  backend.resize(800, 600);
  return { gpu, backend };
}

// `counts` sits at resource index 1, so the backend labels it `buffer1`. The
// uniform block's own backing buffer now carries the distinct label `uniforms`
// (item 96), so `buffer1` names the counts buffer alone and no `.at(-1)` is needed.
const made = (gpu: ReturnType<typeof createFakeGPU>) =>
  gpu.calls('createBuffer').find((call) => call.label === 'buffer1');

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
      { binding: 0, resource: 'uniforms' },
      { binding: 1, resource: 'buffer1' },
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

    expect(gpu.calls('buffer.destroy').map((call) => call.label)).toContain('buffer1');
  });

  it('is refused at a size that is no whole number of four-byte words', () => {
    const { backend } = backendOver();

    expect(() =>
      backend.program(holding({ resources: [holding().resources[0] as BufferResource, counts({ bytes: 6 })] }))
    ).toThrow('the frame for "fixture-buffer" gives buffer 1 6 bytes, which is no whole number of four-byte words');
  });

  it('is refused at no size at all, which is a binding the card reports nothing about', () => {
    const { backend } = backendOver();

    expect(() =>
      backend.program(holding({ resources: [holding().resources[0] as BufferResource, counts({ bytes: 0 })] }))
    ).toThrow('the frame for "fixture-buffer" gives buffer 1 0 bytes, which is no whole number of four-byte words');
  });
});

const dial = (over: Partial<BufferResource> = {}): BufferResource => ({
  kind: 'buffer',
  bytes: 16,
  access: 'read',
  data: new Uint8Array(new Uint32Array([1, 2, 3, 4]).buffer),
  source: 'fixture-dial.buffer.bin',
  ...over,
});

const withDial = (over: Partial<BufferResource> = {}): FrameGraph =>
  holding({ resources: [holding().resources[0] as BufferResource, counts(), dial(over)] });

describe('the contents a caller writes in', () => {
  it('hands the bytes to the buffer the build filled, over the top of the ones it started with', () => {
    const { gpu, backend } = backendOver();
    const program = backend.program(withDial());
    const next = new Uint8Array(new Uint32Array([10, 20, 30, 40]).buffer);

    program.writeBuffer(buffer(2), next);

    const writes = gpu.calls('writeBuffer').filter((call) => call.label === 'buffer2');
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

    expect(() => program.writeBuffer(buffer(1), new Uint8Array(16))).toThrow(
      'the frame for "fixture-buffer" fills resource 1 on the card, so the page has no contents there to replace'
    );
  });

  it('refuses a handle the frame declares no buffer for, by its index', () => {
    const { backend } = backendOver();
    const program = backend.program(withDial());

    expect(() => program.writeBuffer(buffer(5), new Uint8Array(16))).toThrow(
      'the frame for "fixture-buffer" declares no buffer 5'
    );
  });

  it('refuses more bytes than the buffer holds', () => {
    const { backend } = backendOver();
    const program = backend.program(withDial());

    expect(() => program.writeBuffer(buffer(2), new Uint8Array(32))).toThrow(
      'the frame for "fixture-buffer" writes 32 bytes into resource 2, which holds 16'
    );
  });

  it('refuses a byte count that is no whole number of four-byte words', () => {
    const { backend } = backendOver();
    const program = backend.program(withDial());

    expect(() => program.writeBuffer(buffer(2), new Uint8Array(6))).toThrow(
      'the frame for "fixture-buffer" writes 6 bytes into resource 2, which is no whole number of four-byte words'
    );
  });
});

// `readBuffer` is gone (item 82); a caller reads a buffer's words back through the
// arena's own `read` door (§9, item 89), naming the buffer by the arena handle the
// program hands out for its index. `arena` and `bufferHandle` are the readback
// bridge, kept off the public `Backend` type and off the drawable shape `program`
// returns (item 90 deleted the `ShaderProgram` interface that named it), so a
// caller reaches them through a cast the way the timestamp gate does. This
// exercises the same WebGPU staging copy `readBuffer` routed through.
const readWords = async (
  backend: unknown,
  program: unknown,
  handle: BufferHandle
): Promise<Uint32Array> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  new Uint32Array(await (backend as any).arena.read((program as any).bufferHandle(handle)));

describe('the words a caller reads back', () => {
  it('copies the buffer out to one of its own rather than mapping the one the frame writes', async () => {
    const { gpu, backend } = backendOver();
    const program = backend.program(holding());
    gpu.mapped = new Uint8Array(new Uint32Array([7, 0, 0, 0]).buffer);

    await readWords(backend, program, buffer(1));

    // A buffer a shader writes cannot be mapped, and mapping the frame's own
    // would take it away from the next frame, so the copy is the whole mechanism.
    const copy = gpu.calls('copyBufferToBuffer')[0];
    expect(copy?.from).toBe('buffer1');
    expect(copy?.to).toBe('buffer1-read');
    expect(copy?.size).toBe(16);
    expect(gpu.calls('mapAsync')[0]?.label).toBe('buffer1-read');
  });

  it('hands back the words that were in it, as words rather than bytes', async () => {
    const { gpu, backend } = backendOver();
    const program = backend.program(holding());
    gpu.mapped = new Uint8Array(new Uint32Array([1, 256, 65_536, 4_294_967_295]).buffer);

    expect([...(await readWords(backend, program, buffer(1)))]).toEqual([1, 256, 65_536, 4_294_967_295]);
  });

  it('keeps the words after the mapping is given up, since the memory behind one is gone', async () => {
    const { gpu, backend } = backendOver();
    const program = backend.program(holding());
    gpu.mapped = new Uint8Array(new Uint32Array([42, 0, 0, 0]).buffer);

    const words = await readWords(backend, program, buffer(1));
    expect(gpu.calls('unmap')[0]?.label).toBe('buffer1-read');
    expect(words[0]).toBe(42);
  });

  it('gives the buffer it read from back to the frame rather than holding it', async () => {
    const { gpu, backend } = backendOver();
    const program = backend.program(holding());
    gpu.mapped = new Uint8Array(16);

    await readWords(backend, program, buffer(1));
    await readWords(backend, program, buffer(1));

    // One buffer of its own per read, each destroyed, so a caller reading every
    // frame does not leave a buffer behind on every one of them.
    expect(gpu.calls('createBuffer').filter((call) => call.label === 'buffer1-read')).toHaveLength(2);
    expect(gpu.calls('buffer.destroy').filter((call) => call.label === 'buffer1-read')).toHaveLength(2);
  });

  it('refuses a handle the frame declares no buffer for, by its index', () => {
    const { backend } = backendOver();
    const program = backend.program(holding());

    // The refusal is `bufferHandle`'s now: it maps a resource index to its arena
    // handle and throws before `arena.read` is ever reached, so a handle no buffer
    // of this frame answers to is named rather than read as an empty buffer.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => (program as any).bufferHandle(buffer(5))).toThrow(/declares no buffer 5/);
  });
});
