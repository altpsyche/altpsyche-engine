import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * `gates/traffic.mjs` (run as `npm run bench:traffic`) draws each frame in its
 * list once against the recording double and prints two readings for it —
 * `cost().transientBytes` and `arena.traffic()` — side by side, never summed
 * (RoadToPureEngine.md §12 point 6, §17 decision 9). Nothing in the repository
 * ran it, so it died on its first frame for 31 commits without anyone noticing:
 * a `draw` field item 26 had renamed to `draws` made `isRenderPass` take the
 * render pass for a compute pass, and the readings it exists to keep apart went
 * unprinted (ROADMAP.md item 73).
 *
 * This is the gate that notices when it stops. It runs the script and asserts it
 * exits zero and prints a data row for every frame in its list. It does not
 * assert the numbers — those are what a person reads off the run — only that the
 * script reaches the end and prints one line per frame; a frame that throws (as
 * the stale one did) prints no row and exits non-zero, which fails here by name.
 *
 * The frame ids are read out of `gates/traffic.mjs` itself rather than restated,
 * so a frame added to or removed from the script's list changes what this test
 * requires without a second edit — the list has one home.
 */
const root = path.join(import.meta.dirname, '..');
const script = path.join(root, 'gates', 'traffic.mjs');

/** The ids the script assigns each frame in its list — `id: 'grid'`, etc. */
function frameIds(): string[] {
  const source = execFileSync('node', ['-e', 'process.stdout.write(require("fs").readFileSync(process.argv[1],"utf-8"))', script], {
    encoding: 'utf-8',
  });
  const ids: string[] = [];
  for (const match of source.matchAll(/\bid:\s*'([^']+)'/g)) ids.push(match[1]);
  return ids;
}

describe('bench:traffic prints a row for every frame and exits zero', () => {
  it('runs to the end, one row per frame in its list', () => {
    const ids = frameIds();
    expect(ids.length).toBeGreaterThan(0);

    const output = execFileSync('node', [script], { cwd: root, encoding: 'utf-8' });
    const lines = output.split('\n');

    for (const id of ids) {
      // A data row begins with the frame id and carries the numeric columns
      // after it; the header row begins with the word "frame" instead.
      const row = lines.find((line) => new RegExp(`^${id}\\s+\\|`).test(line));
      expect(row, `no row printed for frame "${id}"`).toBeTruthy();
    }
  }, 30000);
});
