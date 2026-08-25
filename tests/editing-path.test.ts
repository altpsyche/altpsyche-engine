import { describe, expect, it } from 'vitest';
import { translateForEditing } from '../resource/editing.js';
import type { EntryPoint, TranslatorEngine } from '../resource/translator.js';

/**
 * Item 42, the on-demand translator chunk — the "editing path still works" half of
 * the Done-when. §9.1's second path: someone typing WGSL on a WebGL 2 device gets
 * translation while the page runs, fetched by `await import()`. The chunk that the
 * fetch lands on is proven a separate download by the bundle analysis
 * ([tests/editing-chunk.test.ts](./editing-chunk.test.ts)); this proves the path
 * that drives it.
 *
 * The wasm engine is item 40's, not landed, so — as everywhere card-adjacent in
 * this tree — the engine is handed in and the mechanism above it is what runs here:
 * that the editing path fetches the chunk, reads its engine, and translates each
 * entry point through it, in order. A fake engine stands in for the wasm one; when
 * the real one lands behind the same boundary, this path is unchanged.
 */

/** A stand-in engine: it does not translate WGSL, it records that it was reached
 * and returns a marker naming the entry, which is all the mechanism above it needs
 * to be exercised. The real engine (item 40) plugs into this same interface. */
function fakeEngine(): TranslatorEngine & { calls: { wgsl: string; entry: EntryPoint }[] } {
  const calls: { wgsl: string; entry: EntryPoint }[] = [];
  return {
    calls,
    translate(wgsl, entry) {
      calls.push({ wgsl, entry });
      return `#version 300 es\n// ${entry.stage}:${entry.name}`;
    },
  };
}

const VS: EntryPoint = { name: 'vs_main', stage: 'vertex' };
const FS: EntryPoint = { name: 'fs_main', stage: 'fragment' };

describe('the on-demand editing path drives the translator chunk', () => {
  it('translates every entry point through an engine handed in, in order', async () => {
    const engine = fakeEngine();
    const out = await translateForEditing('@vertex fn vs_main() {}', [VS, FS], { engine });

    // One GLSL result per entry point, in the order asked for.
    expect(out.glsl.map((g) => g.entry)).toEqual([VS, FS]);
    expect(out.glsl[0].glsl).toBe('#version 300 es\n// vertex:vs_main');
    expect(out.glsl[1].glsl).toBe('#version 300 es\n// fragment:fs_main');
    // The engine saw the source and each entry, once each.
    expect(engine.calls.map((c) => c.entry)).toEqual([VS, FS]);
    expect(engine.calls.every((c) => c.wgsl === '@vertex fn vs_main() {}')).toBe(true);
  });

  it('fetches the engine through a loader — the await import() the chunk is behind', async () => {
    const engine = fakeEngine();
    let fetched = 0;
    // The loader stands in for `() => import('./translator.js')`: the editing path
    // reaches its engine only by awaiting it, which is what makes the translator a
    // separate download rather than part of the first one.
    const load = async () => {
      fetched++;
      return { defaultEngine: engine };
    };
    const out = await translateForEditing('src', [FS], { load });

    expect(fetched).toBe(1);
    expect(out.glsl[0].glsl).toBe('#version 300 es\n// fragment:fs_main');
  });

  it('refuses by name when the chunk resolves but no engine fills it yet', async () => {
    // The shipped chunk's `defaultEngine` is null until item 40 wires the wasm
    // translator. Reaching the editing path then is a named refusal, not a crash —
    // and the name is the item that settles it.
    await expect(translateForEditing('src', [FS], { load: async () => ({ defaultEngine: null }) })).rejects.toThrow(
      /not wired.*item 40/,
    );
  });

  it('defaults its loader to the translator chunk, whose engine is not yet wired', async () => {
    // With no engine and no loader, the real `await import('./translator.js')` runs.
    // Today that chunk ships the seam and a null engine, so the default path is the
    // same named refusal — the proof the default reaches the real chunk, not a stub.
    await expect(translateForEditing('src', [FS])).rejects.toThrow(/not wired.*item 40/);
  });
});
