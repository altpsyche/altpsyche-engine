import type { GlslFrameGraph } from '@altpsyche/engine';
import { describe, expect, it } from 'vitest';
import { createWebGL2Backend } from '../gpu/webgl2';
import type { FrameGraph } from '@altpsyche/engine';
import { createFakeGL } from './support/fake-gl';

/**
 * The WebGL 2 backend's per-draw uniform slice (item 85): the half of item 49 that
 * is real work rather than an already-met criterion. A per-draw buffer holds one
 * record a draw, and each draw is pointed at its own record by a `bindBufferRange`
 * at the byte offset it names — a dynamic offset on WebGPU, this on WebGL 2, the
 * same slice either way (§8). The executor has issued that `bindBufferRange` since
 * item 27; what is new here is the backend reading `BindingSpec.perDraw` off the
 * pipeline, building the per-draw uniform buffer, and binding its block apart from
 * the frame's shared one.
 *
 * These read the recording double's calls, not pixels off a card: that the three
 * records draw the three quads they hold — each its own colour in its own place —
 * is the corpus gate's `core-perdraw-uniform` column to confirm on a real context
 * (item 79), which the unattended node session does not reach. What is held here is
 * where each part of the mechanism sits: the buffer built as a uniform, the two
 * blocks bound to their own points, and one range a draw at the offset it named.
 */

// The document text is arbitrary here — the fake context compiles nothing and the
// block layout is the driver's answer, set through `blocks` below — so these stand
// in for the baked GLSL a real link would report two uniform blocks from.
const VERTEX = '#version 300 es\nin vec3 position;\nvoid main(){gl_Position=vec4(position,1.0);}';
const FRAGMENT = '#version 300 es\nprecision highp float;\nout vec4 c;\nvoid main(){c=vec4(1.0);}';

const RECORD = 16;
const SLOT = 256;

/** A GLSL per-draw frame the way the corpus gate builds one for WebGL 2: a uniform
 * buffer of records, a pipeline binding that slices it per draw, and one draw per
 * record naming the byte offset of its slice. */
function perDrawFrame(over: Partial<GlslFrameGraph> = {}): FrameGraph {
  return {
    id: 'perdraw',
    authored: 'glsl',
    resources: [
      { kind: 'uniform', name: 'uniforms' },
      { kind: 'buffer', name: 'slice', bytes: 3 * SLOT, access: 'read', data: new Uint8Array(3 * SLOT) },
    ],
    modules: [
      { name: 'vertex', glsl: VERTEX },
      { name: 'fragment', glsl: FRAGMENT },
    ],
    pipelines: [
      {
        kind: 'render',
        name: 'draw',
        vertex: { module: 'vertex', entry: 'main' },
        fragment: { module: 'fragment', entry: 'main' },
        bindings: [{ group: 1, binding: 0, resource: 'slice', visibility: ['vertex'], perDraw: { size: RECORD } }],
      },
    ],
    passes: [
      {
        pipeline: 'draw',
        draws: [
          { vertices: 3, perDraw: 0 },
          { vertices: 3, perDraw: 256 },
          { vertices: 3, perDraw: 512 },
        ],
      },
    ],
    ...over,
  };
}

/** The linked program the driver reports for a per-draw frame: the frame's shared
 * uniform block, and the per-draw record's block beside it. Each member's name
 * carries the `_group_G_binding_B` the build's GLSL qualifies it with, which is how
 * the backend tells the per-draw block from the shared one. */
function twoBlocks(fake: ReturnType<typeof createFakeGL>) {
  fake.blocks = [
    {
      bytes: 16,
      members: [
        { name: '_group_0_binding_0_vs.u_time', offset: 0 },
        { name: '_group_0_binding_0_vs.u_resolution', offset: 4 },
      ],
    },
    {
      bytes: 16,
      members: [
        { name: '_group_1_binding_0_vs.tint', offset: 0 },
        { name: '_group_1_binding_0_vs.shift', offset: 12 },
      ],
    },
  ];
}

function backendOver(setup: (gl: ReturnType<typeof createFakeGL>) => void = twoBlocks) {
  const gl = createFakeGL();
  setup(gl);
  const backend = createWebGL2Backend(gl.canvas);
  if (!backend) throw new Error('the fake canvas gave no WebGL 2 context');
  return { gl, backend };
}

describe('a per-draw uniform slice on WebGL 2', () => {
  it('builds the per-draw buffer as a uniform, uploaded once with its records', () => {
    const { gl, backend } = backendOver();
    // The quad the backend allocates for itself is written at creation; reset so
    // what is counted next is the per-draw buffer's own first contents alone.
    backend.resetTraffic();
    backend.program(perDrawFrame());

    // The whole buffer of records reaches the card as one upload of that many
    // bytes, its bytes counted as resident: 3 records at 256-byte slots.
    const upload = gl.of('bufferData').find((call) => call.byteLength === 3 * SLOT);
    expect(upload).toBeDefined();
    expect(backend.traffic().written).toBe(3 * SLOT);
  });

  it('binds the shared block and the per-draw block to their own points', () => {
    const { gl, backend } = backendOver();
    backend.program(perDrawFrame());

    // The shared block (index 0) to point 0, where setUniforms binds its buffer;
    // the per-draw block (index 1) to point 1, where each draw binds a range.
    const bindings = gl.of('uniformBlockBinding').map((call) => ({ block: call.block, binding: call.binding }));
    expect(bindings).toContainEqual({ block: 0, binding: 0 });
    expect(bindings).toContainEqual({ block: 1, binding: 1 });
  });

  it('sets the per-draw range once per draw, each at that draw’s offset', () => {
    const { gl, backend } = backendOver();
    const program = backend.program(perDrawFrame());
    program.setUniforms({ u_time: 0, u_resolution: [800, 600] });
    program.draw();

    // Three draws, three ranges, in order — the block carrying the record is bound
    // at each draw's own offset rather than once for the pass, and one record wide.
    const ranges = gl.of('bindBufferRange').map((call) => ({ index: call.index, offset: call.offset, size: call.size }));
    expect(ranges).toEqual([
      { index: 1, offset: 0, size: RECORD },
      { index: 1, offset: 256, size: RECORD },
      { index: 1, offset: 512, size: RECORD },
    ]);
  });

  it('fills the shared block from its own members alone, not the per-draw record’s', () => {
    const { gl, backend } = backendOver();
    backend.program(perDrawFrame()).setUniforms({ u_time: 3, u_resolution: [7, 9] });

    // The shared block is 16 bytes — u_time then u_resolution — and the per-draw
    // record's tint and shift are in the other block, so they never land in the
    // buffer setUniforms writes. The last float upload is the shared block's own
    // (the first is the backend's fullscreen quad, written at creation).
    const upload = gl.of('bufferData').filter((call) => call.floats !== undefined).at(-1);
    expect(upload?.floats).toEqual([3, 7, 9, 0]);
    expect(gl.of('bindBufferBase').at(-1)!.index).toBe(0);
  });

  it('refuses an offset this device’s alignment does not allow, by name', () => {
    // A device reporting a coarser alignment than the 256 the graph aligns to: a
    // 256-byte offset is no whole number of 512, so bindBufferRange would fail, and
    // it is refused by name with the alignment the device reported instead.
    const { backend } = backendOver((fake) => {
      twoBlocks(fake);
      fake.limits.UNIFORM_BUFFER_OFFSET_ALIGNMENT = 512;
    });
    expect(() => backend.program(perDrawFrame())).toThrow(
      "reads a per-draw slice at offset 256, which this device's 512-byte alignment does not allow"
    );
  });

  it('still refuses a buffer no pipeline slices per draw, by name', () => {
    // A buffer with no per-draw binding is a storage buffer this backend has no
    // compute to fill, refused as before — the per-draw path widened what a buffer
    // may be, not opened the door to every buffer.
    const { backend } = backendOver();
    const frame: FrameGraph = {
      id: 'storage',
      authored: 'glsl',
      resources: [
        { kind: 'uniform', name: 'uniforms' },
        { kind: 'buffer', name: 'blob', bytes: 64, access: 'read' },
      ],
      modules: [
        { name: 'vertex', glsl: VERTEX },
        { name: 'fragment', glsl: FRAGMENT },
      ],
      pipelines: [
        {
          kind: 'render',
          name: 'draw',
          vertex: { module: 'vertex', entry: 'main' },
          fragment: { module: 'fragment', entry: 'main' },
          bindings: [],
        },
      ],
      passes: [{ pipeline: 'draw', draws: [{ vertices: 3 }] }],
    };
    expect(() => backend.program(frame)).toThrow('declares a buffer resource, and this backend has none');
  });
});
