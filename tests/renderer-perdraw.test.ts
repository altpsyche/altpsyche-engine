import { describe, expect, it } from 'vitest';
import { createWebGPUBackend } from '../gpu/webgpu';
import { createFakeGPU } from './support/fake-gpu';
import type { DrawSpec, ShaderFrame } from '@altpsyche/engine';

/**
 * One slice of a per-draw buffer per draw (item 27): a `hasDynamicOffset` uniform
 * binding on WebGPU, whose offset the draw names, so a thousand draws read a
 * thousand records out of one buffer.
 *
 * What is asserted is where each part of the mechanism sits. The buffer is a
 * uniform bound with a dynamic offset — usage UNIFORM, layout `buffer:uniform`,
 * a bind group entry as wide as one record — and the offset is the draw's, so the
 * group that carries it is set once per draw with that draw's offset rather than
 * once for the pass. The offset is a whole number of 256-byte alignments, which
 * `validate` refuses by name where it is not, because the card takes a dynamic
 * offset only at that alignment.
 *
 * These read the recording double's calls, not pixels off a card: that the thousand
 * records draw the thousand transforms they hold is a browser gate's or a card's to
 * confirm, and neither ran in the unattended session.
 */

const WGSL = `struct Cube { transform: mat4x4<f32> };
@group(0) @binding(0) var<uniform> cube: Cube;
@fragment fn shade() -> @location(0) vec4<f32> { return cube.transform[0]; }`;

/** One record is a 4x4 matrix — 64 bytes — and the buffer holds `count` of them,
 * each aligned to 256 so a dynamic offset can reach it. */
const RECORD = 64;
const SLOT = 256;

const perDrawFrame = (draws: DrawSpec[], count: number, over: Partial<ShaderFrame> = {}): ShaderFrame => ({
  id: 'fixture-perdraw',
  target: 'wgsl',
  uniforms: [],
  resources: [
    // The per-draw buffer: one record per draw, laid out at 256-byte slots. It
    // arrives with its first contents, which is what a producer of transforms
    // fills once.
    { kind: 'buffer', name: 'cubes', bytes: count * SLOT, access: 'read', data: new Uint8Array(count * SLOT) },
  ],
  modules: [{ name: 'wgsl', code: WGSL }],
  pipelines: [
    {
      kind: 'render',
      name: 'cube',
      vertex: 'fullscreen',
      fragment: { module: 'wgsl', entry: 'shade' },
      bindings: [{ group: 0, binding: 0, resource: 'cubes', visibility: ['fragment'], perDraw: { size: RECORD } }],
    },
  ],
  passes: [{ pipeline: 'cube', draws }],
  ...over,
});

function backendOver() {
  const gpu = createFakeGPU({ connected: false });
  const backend = createWebGPUBackend(gpu.canvas, gpu.device);
  if (!backend) throw new Error('the fake canvas gave no WebGPU context');
  backend.resize(800, 600);
  return { gpu, backend };
}

/** The draws' dynamic offsets, in the order the recorder saw them. A per-draw
 * band is set once per draw with `[offset]`, so this is one entry per draw. */
const offsetsOf = (gpu: ReturnType<typeof createFakeGPU>): number[] =>
  gpu
    .calls('setBindGroup')
    .filter((call) => Array.isArray(call.dynamicOffsets))
    .map((call) => (call.dynamicOffsets as number[])[0] as number);

describe('a per-draw slice on WebGPU', () => {
  it('builds the buffer as a uniform bound with a dynamic offset, not a storage buffer', () => {
    const { gpu, backend } = backendOver();
    backend.program(perDrawFrame([{ vertices: 3, perDraw: 0 }], 1));

    const made = gpu.calls('createBuffer').find((call) => call.label === 'cubes');
    expect(made?.usage).toBe(GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);

    const entries = gpu.calls('createBindGroupLayout')[0]?.entries as { kind: string }[];
    expect(entries.map((entry) => entry.kind)).toEqual(['buffer:uniform']);
  });

  it('sets the per-draw group once per draw, each with that draw’s offset', () => {
    const { gpu, backend } = backendOver();
    backend.program(perDrawFrame(
      [
        { vertices: 3, perDraw: 0 },
        { vertices: 3, perDraw: 256 },
        { vertices: 3, perDraw: 512 },
      ],
      3
    ));

    // Three draws, three offsets, in order — the group carrying the dynamic
    // offset is re-set before each draw rather than once for the pass.
    expect(offsetsOf(gpu)).toEqual([0, 256, 512]);
  });

  it('reads a thousand distinct records from one buffer', () => {
    const { gpu, backend } = backendOver();
    const draws = Array.from({ length: 1000 }, (_, at): DrawSpec => ({ vertices: 3, perDraw: at * SLOT }));
    backend.program(perDrawFrame(draws, 1000));

    const offsets = offsetsOf(gpu);
    expect(offsets).toHaveLength(1000);
    // A thousand offsets, every one distinct, each a whole number of slots — the
    // thousand records a thousand draws read.
    expect(new Set(offsets).size).toBe(1000);
    expect(offsets).toEqual(draws.map((draw) => (draw as { perDraw: number }).perDraw));
  });

  it('refuses an offset that is no whole number of 256 bytes, by name', () => {
    const { backend } = backendOver();
    expect(() => backend.program(perDrawFrame([{ vertices: 3, perDraw: 128 }], 1))).toThrow(
      'the pass on "cube" reads a per-draw slice at offset 128, which is no whole number of 256 bytes'
    );
  });

  it('refuses a per-draw offset whose pipeline binds no slice, by name', () => {
    const { backend } = backendOver();
    const frame = perDrawFrame([{ vertices: 3, perDraw: 0 }], 1, {
      pipelines: [
        {
          kind: 'render',
          name: 'cube',
          vertex: 'fullscreen',
          fragment: { module: 'wgsl', entry: 'shade' },
          bindings: [{ group: 0, binding: 0, resource: 'cubes', visibility: ['fragment'] }],
        },
      ],
    });
    expect(() => backend.program(frame)).toThrow(
      'the pass on "cube" gives a draw a per-draw offset of 0 and its pipeline binds no per-draw slice'
    );
  });

  it('refuses a slice that runs past the end of its buffer, by name', () => {
    const { backend } = backendOver();
    // One record fits at offset 0, but a slice at the next slot overruns a buffer
    // of a single slot.
    expect(() => backend.program(perDrawFrame([{ vertices: 3, perDraw: 256 }], 1))).toThrow(
      'the pass on "cube" reads 64 bytes of per-draw slice at offset 256 from "cubes", which holds 256'
    );
  });
});
