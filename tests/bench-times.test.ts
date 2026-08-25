import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * `gates/times.mjs` (run as `npm run bench:times`) draws one frame whose passes
 * are each `timed`, reads the pair of timestamps each pass resolved into its own
 * buffer, and prints the elapsed time per pass — the one reading in this renderer
 * with no picture behind it, gathered by queries that until now were read by
 * nothing (ROADMAP.md item 54). It is Reported, never asserted: a wall-clock time
 * is the device's and the moment's, not the structure's.
 *
 * This is the gate that notices when the reading stops reaching the end. It runs
 * the script and asserts it exits zero and prints an elapsed row for every timed
 * pass in its list. It does not assert the times — those are what a person reads
 * off a real card (the recording double this runs against moves no bytes on
 * resolve, so each pair reads back zero) — only that the read path reaches the end
 * and prints one row per timed pass; a pass whose buffer read threw would print no
 * row and exit non-zero, which fails here by name.
 *
 * The pass labels are read out of `gates/times.mjs` itself rather than restated,
 * so a timed pass added to or removed from the script's list changes what this
 * test requires without a second edit — the list has one home.
 */
const root = path.join(import.meta.dirname, '..');
const script = path.join(root, 'gates', 'times.mjs');

/** The labels the script prints each timed pass under — `label: 'compute (plan)'`. */
function passLabels(): string[] {
  const source = readFileSync(script, 'utf-8');
  const labels: string[] = [];
  for (const match of source.matchAll(/\blabel:\s*'([^']+)'/g)) labels.push(match[1]);
  return labels;
}

describe('bench:times prints an elapsed row for every timed pass and exits zero', () => {
  it('runs to the end, one elapsed row per timed pass in its list', () => {
    const labels = passLabels();
    expect(labels.length).toBeGreaterThan(0);

    const output = execFileSync('node', [script], { cwd: root, encoding: 'utf-8' });
    const lines = output.split('\n');

    for (const label of labels) {
      // An elapsed row carries the pass label and its time in nanoseconds; the
      // header row carries the word "pass" and "elapsed" instead.
      const row = lines.find((line) => line.includes(label) && /\bns\b/.test(line));
      expect(row, `no elapsed row printed for pass "${label}"`).toBeTruthy();
    }
  }, 30000);
});
