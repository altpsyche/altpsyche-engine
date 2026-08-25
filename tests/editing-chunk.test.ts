import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * Item 42, the on-demand translator chunk — the "bundle analysis shows the
 * translator absent from the first download" half of the Done-when.
 *
 * Only a bundler can say whether the translator lands in a page's first download,
 * so `gates/chunk.mjs` runs one (esbuild, a dev tool) and reads its metafile. This
 * drives that gate through a subprocess — the same shape `translate-build.test.ts`
 * drives `translate.mjs` — and asserts the three facts a clean split turns on: the
 * translator is its own output chunk, reached from the entry by a `dynamic-import`
 * edge, and absent from the entry chunk's own bytes.
 */
const root = path.join(import.meta.dirname, '..');
const gate = path.join(root, 'gates', 'chunk.mjs');

describe('the on-demand translator is absent from the first download', () => {
  it('splits the translator into its own dynamically-imported chunk', () => {
    // Exit 0 is the gate's own verdict that the split is clean; the JSON it prints
    // is read back here so the assertion names the fact rather than trusting a code.
    const out = execFileSync('node', [gate], { encoding: 'utf8' });
    const line = out.split('\n').find((l) => l.startsWith('JSON '));
    expect(line, 'the gate printed no JSON summary').toBeTruthy();
    const summary = JSON.parse(line!.slice('JSON '.length));

    expect(summary.translatorChunk, 'the translator did not become its own chunk').toBeTruthy();
    expect(summary.translatorIsOwnChunk).toBe(true);
    expect(summary.reachedByDynamicImport).toBe(true);
    expect(summary.absentFromEntryChunk).toBe(true);
    // The entry chunk and the translator chunk are two different downloads.
    expect(summary.translatorChunk).not.toBe(summary.entryChunk);
  });
});
