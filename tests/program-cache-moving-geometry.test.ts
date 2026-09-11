import { describe, expect, it } from 'vitest';
import type { FrameGraph } from '@altpsyche/engine';
import { GEOMETRY_PRIMITIVE } from '@altpsyche/engine';
import { createFrameRenderer, submit } from '../gpu/renderer.js';
import { frameKey } from '../pipeline/cache.js';
import { indices, pipelineHandle, vertices } from '../graph/handles.js';
import { createFakeGL } from './support/fake-gl';

/**
 * What a picture whose geometry moves costs the program cache (item 18).
 *
 * **This file measured the defect at step 1 and holds the fix at step 4.** The
 * before-state is kept in the numbers below rather than deleted, because a
 * measurement with nothing to compare against says very little.
 *
 * ```
 *                                    before        after
 *   sixty ticks, geometry moving     60 links      1 link
 *   sixty ticks, bytes held still     1 link       1 link
 *   the key, over 7,696 bytes        31,335 ch     1,319 ch
 * ```
 *
 * **What is measured here and what is not.** These counts are what this machine
 * can take: how many programs the double was asked to link, and how long the key
 * is in characters. **What a recompile costs in milliseconds is not measured on
 * any machine** — it needs a real driver and `gate:card` never runs unattended —
 * so nothing here says the defect is slow, only that it recompiles.
 *
 * The double is WebGL 2 because `linkProgram` is one call per compiled program
 * and is therefore the count, and because the cache under test is
 * `gpu/renderer.ts`'s and is the same on both backends.
 */

const FRAMES = 60;

/** The figures the last test pins, written down so a change to any of them is a
 * red test rather than a silently different measurement. Taken on 2026-09-11 on
 * this tree, for one 16x16 quad grid: 4,624 bytes of vertices and 3,072 of
 * indices.
 *
 * **The key was 31,335 characters over those 7,696 bytes and is now 1,319** — it
 * went from four times the geometry to a sixth of it, because the bytes are gone
 * and only their lengths remain.
 *
 * **The key is four times the geometry, and the reason was counted rather than
 * guessed.** `canonical` writes each byte as a latin1 character inside a JSON
 * string, and `JSON.stringify` escapes a control character to `\uXXXX` — six
 * characters for one byte. Of these 7,696 bytes, 4,497 are below `0x20`, 9 are a
 * quote or a backslash and 3,190 pass through: 4,497x6 + 9x2 + 3,190 = 30,190
 * characters from the geometry alone, with the remaining 1,145 of the key being
 * the rest of the frame. Float32 geometry is mostly zero bytes, which is why the
 * expansion is this bad and why it is worst for exactly the data a figure
 * carries most of.
 *
 * That was the per-tick serialisation a moving figure paid **before** the compile
 * it then also paid. Both are gone: the compile because the geometry no longer
 * identifies a program, and the escaping because the bytes are no longer in the
 * string. */
const KEY_LENGTH = 1_319;
const CARRIED_BYTES = 7_696;
/** What the key was before the bytes came out of it, kept so the assertion below
 * is a comparison rather than a number on its own. */
const KEY_LENGTH_BEFORE = 31_335;

const GRID_VERTEX =
  '#version 300 es\nlayout(location=0) in vec2 position;\nlayout(location=1) in vec2 grid;\nvoid main(){gl_Position=vec4(position,0.0,1.0);}';
const FRAGMENT = '#version 300 es\nprecision highp float;\nout vec4 c;\nvoid main(){c=vec4(1.0);}';

/**
 * One figure's frame, built the way a live loop builds one: a fresh object every
 * call, because that is exactly what the defect turns on. `moved` shifts the
 * geometry bytes the way a figure whose shape animates would, and leaving it at
 * zero gives the control — a fresh object per tick carrying bytes that never
 * change.
 */
function figureFrame(moved: number, over: { grid?: number } = {}): FrameGraph {
  const grid = GEOMETRY_PRIMITIVE['quad-grid'];
  const side = over.grid ?? 16;
  const made = grid.bytes(side, side);
  // A fresh array per frame rather than a mutated one, because a live loop that
  // rebuilds geometry hands over new bytes and the key reads the bytes it is
  // given.
  const geometry = new Uint8Array(made.vertices);
  if (moved > 0) geometry[0] = moved % 256;
  return {
    id: 'figure',
    authored: 'glsl',
    resources: [
      { kind: 'uniform' },
      {
        kind: 'vertices',
        stride: grid.stride,
        attributes: grid.attributes,
        topology: grid.topology,
        count: made.vertexCount,
        indices: indices(2),
        data: geometry,
      },
      { kind: 'indices', format: grid.indexFormat, count: made.indexCount, data: made.indices },
    ],
    modules: [],
    pipelines: [
      {
        kind: 'render',
        source: { glsl: { vertex: GRID_VERTEX, fragment: FRAGMENT } },
        vertex: { document: 'warp', entry: 'main' },
        fragment: { document: 'shade', entry: 'main' },
        geometry: vertices(1),
        bindings: [],
      },
    ],
    passes: [{ pipeline: pipelineHandle(0), draws: [{ instances: 1 }] }],
  };
}

/** Sixty ticks of the live loop, each handing over a frame the way a page would.
 * `moving` is the figure whose shape animates; the other is the control. */
async function ticks(moving: boolean) {
  const gl = createFakeGL();
  const renderer = await createFrameRenderer(gl.canvas, { backend: 'webgl2' });
  if (!renderer) throw new Error('the fake canvas gave no WebGL 2 renderer');
  for (let tick = 1; tick <= FRAMES; tick++) submit(renderer, figureFrame(moving ? tick : 0), {});
  return { gl, linked: gl.of('linkProgram').length };
}

describe('a picture whose geometry moves, against the program cache (item 18)', () => {
  it('compiles once over sixty frames, where it used to compile sixty times', async () => {
    const { gl, linked } = await ticks(true);

    // One link. Before the bytes came out of the key this was sixty — one per
    // tick, because the one field a moving figure changes every frame was the
    // field that decided the key.
    expect(linked).toBe(1);

    // And the geometry still reached the card on every tick after the first: two
    // buffers refilled on each of the fifty-nine cache hits. Without this
    // assertion the test above would pass on a cache that hit and drew the first
    // frame's geometry for the rest of the run, which is the failure the whole
    // step is written around.
    expect(gl.of('bufferSubData')).toHaveLength((FRAMES - 1) * 2);
    expect(gl.of('bufferSubData')[0]?.offset).toBe(0);
  });

  it('compiles once where the bytes hold still, as it always did', async () => {
    const { linked } = await ticks(false);

    expect(linked).toBe(1);
  });

  it('refills nothing at all for a page that re-submits one frame', async () => {
    const gl = createFakeGL();
    const renderer = await createFrameRenderer(gl.canvas, { backend: 'webgl2' });
    if (!renderer) throw new Error('the fake canvas gave no WebGL 2 renderer');
    // One frame object, submitted sixty times, which is the shape of a page whose
    // picture does not move.
    const held = figureFrame(0);
    for (let tick = 0; tick < FRAMES; tick++) submit(renderer, held, {});

    // The refill is an identity test on the arrays, not a comparison of contents,
    // so a page handing back the same bytes writes no buffer. The cost item 18
    // removed is not replaced by a smaller one charged to everybody.
    expect(gl.of('linkProgram')).toHaveLength(1);
    expect(gl.of('bufferSubData')).toHaveLength(0);
  });

  it('still separates two figures whose geometry is a different length', async () => {
    const gl = createFakeGL();
    const renderer = await createFrameRenderer(gl.canvas, { backend: 'webgl2' });
    if (!renderer) throw new Error('the fake canvas gave no WebGL 2 renderer');

    submit(renderer, figureFrame(0), {});
    submit(renderer, figureFrame(0, { grid: 8 }), {});

    // A buffer is allocated for a size, so a figure that grew is a different
    // program and has to *miss* rather than hit and be refused: a miss
    // recompiles, which is correct, where a throw would turn resizing a figure
    // into an error the page never asked for. The lengths stay in the key for
    // exactly this.
    expect(gl.of('linkProgram')).toHaveLength(2);
  });

  it('carries the geometry as a length rather than as bytes', () => {
    const grid = GEOMETRY_PRIMITIVE['quad-grid'];
    const made = grid.bytes(16, 16);
    const key = frameKey(figureFrame(1));

    const carried = made.vertices.byteLength + made.indices.byteLength;
    expect(carried).toBe(CARRIED_BYTES);
    expect(key.length).toBe(KEY_LENGTH);
    // The key is now a fraction of the geometry rather than four times it, which
    // is the per-tick serialisation this step removed.
    expect(key.length).toBeLessThan(carried);
    expect(key.length).toBeLessThan(KEY_LENGTH_BEFORE / 20);
    // The lengths themselves are still in it, which is what keeps a figure that
    // grew from hitting a buffer built for the smaller one.
    expect(key).toContain(String(made.vertices.byteLength));
  });
});
