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
 *
 * The second case asserts the same three facts about **the two backends**, which is the
 * claim the door's asynchrony exists to buy and which nothing checked until now: a
 * browser with no WebGPU must not download the WebGPU backend. The gate prints each
 * chunk's size beside those facts, and the README quotes those figures — so the
 * assertion here is what keeps the README's central claim from becoming a story. The
 * sizes themselves are reported and not gated: a gate that failed over a kilobyte is one
 * nobody could keep green.
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

  it('splits each backend into its own chunk, so a card-less browser downloads neither', () => {
    const out = execFileSync('node', [gate], { encoding: 'utf8' });
    const line = out.split('\n').find((l) => l.startsWith('DOWNLOAD '));
    expect(line, 'the gate printed no download summary').toBeTruthy();
    const download = JSON.parse(line!.slice('DOWNLOAD '.length));

    expect(download.webgpu, 'the WebGPU backend did not become its own chunk').toBeTruthy();
    expect(download.webgl2, 'the WebGL 2 backend did not become its own chunk').toBeTruthy();
    expect(download.backendsAreOwnChunks).toBe(true);
    expect(download.backendsAbsentFromEntry).toBe(true);
    expect(download.reachedByDynamicImport).toBe(true);
    // Each is a real download rather than an empty file, so a size the README quotes
    // cannot quietly become nothing.
    expect(download.webgpu.gzip).toBeGreaterThan(1000);
    expect(download.webgl2.gzip).toBeGreaterThan(1000);
  });
});
