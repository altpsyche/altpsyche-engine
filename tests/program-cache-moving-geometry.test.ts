import { describe, expect, it } from 'vitest';
import type { FrameGraph } from '@altpsyche/engine';
import { GEOMETRY_PRIMITIVE } from '@altpsyche/engine';
import { createFrameRenderer, submit } from '../gpu/renderer.js';
import { frameKey } from '../pipeline/cache.js';
import { indices, pipelineHandle, vertices } from '../graph/handles.js';
import { createFakeGL } from './support/fake-gl';

/**
 * What a picture whose geometry moves costs the program cache (item 18, step 1).
 *
 * **This file measures a defect rather than asserting a fix.** The reading is
 * that `frameKey` serialises `VertexResource.data` byte for byte, and that the
 * `WeakMap` in front of it is keyed on the frame *object* — so a frame rebuilt
 * once per animation tick misses both caches and recompiles. Nothing here
 * changes that. The numbers below are the before-state the fix is measured
 * against, and they are written as assertions so the fix cannot land without
 * moving them.
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

/** The two figures the last test pins, written down so a change to either is a
 * red test rather than a silently different measurement. Taken on 2026-09-11 on
 * this tree, for one 16x16 quad grid: 4,624 bytes of vertices and 3,072 of
 * indices, and a key of 31,335 characters built over them.
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
 * That is the per-tick serialisation a moving figure pays **before** the compile
 * it then also pays. */
const KEY_LENGTH = 31_335;
const CARRIED_BYTES = 7_696;

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
function figureFrame(moved: number): FrameGraph {
  const grid = GEOMETRY_PRIMITIVE['quad-grid'];
  const made = grid.bytes(16, 16);
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

describe('a picture whose geometry moves, against the program cache (item 18, before-state)', () => {
  it('compiles a program every frame, where the cache exists to compile once', async () => {
    const { linked } = await ticks(true);

    // One link per tick. This is the defect: the cache is keyed on a string that
    // contains the geometry bytes, so the one field a moving figure changes every
    // frame is the field that decides the key.
    expect(linked).toBe(FRAMES);
  });

  it('compiles once where the bytes hold still, so it is the bytes and not the fresh object', async () => {
    const { linked } = await ticks(false);

    // The control separates the two caches. The frame object is fresh every tick
    // here too, so the `WeakMap` misses all sixty times and `frameKey` runs all
    // sixty times — but the string it builds is identical, the `programs` map
    // hits, and one program is linked. So the recompile above is caused by the
    // bytes being in the key and not by the frame being a new object.
    expect(linked).toBe(1);
  });

  it('serialises the whole geometry into the key, once per tick', () => {
    const grid = GEOMETRY_PRIMITIVE['quad-grid'];
    const made = grid.bytes(16, 16);
    const key = frameKey(figureFrame(1));

    // The key is longer than the geometry it carries, because every byte of both
    // buffers is in it and the rest of the frame is on top of that. This is the
    // string rebuilt on every tick of the loop above — the `WeakMap` in front of
    // `frameKey` is keyed on the frame object, and a live loop's frame is a fresh
    // object every tick, so it never hits.
    const carried = made.vertices.byteLength + made.indices.byteLength;
    expect(key.length).toBeGreaterThan(carried);
    expect(key.length).toBe(KEY_LENGTH);
    expect(carried).toBe(CARRIED_BYTES);
  });
});

