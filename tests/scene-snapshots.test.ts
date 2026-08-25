import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ShaderFrame } from '@altpsyche/engine';
import { SCENE_PRESETS } from '../fixtures/scene-presets';

/**
 * Golden graph snapshots (ROADMAP item 34). `sceneView` is a producer: its output is
 * a graph worked out on the CPU with no device present (item 32), so a change to it is
 * reviewable as a text diff over that graph rather than as a picture someone squints
 * at. Every scene preset carries a snapshot here, written as JSON to
 * `tests/snapshots/scene/<id>.json`, and a change to `sceneView` that moves any
 * preset's emitted graph fails the run until the golden is regenerated deliberately
 * (`vitest run -u`) — decision 8's "golden snapshots are regenerable fixtures".
 *
 * No GPU, no browser, no picture: the graph is data, and the whole point of the
 * producer/backend split is that this data is a function of the world and the views
 * alone. The determinism that lets a golden be committed is the same one item 32
 * relies on — every matrix is CPU arithmetic over fixed inputs, so the bytes are
 * identical on any machine.
 */

/**
 * The emitted graph as JSON text. A resource's baked `data` is a `Uint8Array` of the
 * bytes a backend would upload; every buffer `sceneView` fills holds `f32` (world
 * matrices and colours), so the snapshot renders it as the float values it stands for
 * rather than as raw bytes — a scene change (a moved object, a different colour) then
 * shows as a changed number in the diff rather than as a wall of bytes nobody reads.
 */
const snapshotOf = (frame: ShaderFrame): string =>
  JSON.stringify(
    frame,
    (_key, value) =>
      value instanceof Uint8Array
        ? { f32: Array.from(new Float32Array(value.buffer, value.byteOffset, value.byteLength / 4)) }
        : value,
    2
  ) + '\n';

const SNAP_DIR = resolve(__dirname, 'snapshots/scene');

describe('every scene preset carries a golden graph snapshot', () => {
  for (const preset of SCENE_PRESETS) {
    it(`${preset.id} matches its snapshot`, async () => {
      await expect(snapshotOf(preset.frame())).toMatchFileSnapshot(resolve(SNAP_DIR, `${preset.id}.json`));
    });
  }

  // A new preset cannot land unsnapshotted and a removed one cannot leave a stale
  // golden: the files on disk must be exactly the presets, the same coverage rule
  // tests/cost-corpus.test.ts holds over the cost table.
  it('has a golden file for exactly the presets, no more and no fewer', () => {
    const onDisk = readdirSync(SNAP_DIR)
      .filter((name) => name.endsWith('.json'))
      .map((name) => name.replace(/\.json$/, ''))
      .sort();
    expect(onDisk).toEqual(SCENE_PRESETS.map((preset) => preset.id).sort());
  });
});
