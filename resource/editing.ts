/**
 * The editing path (item 42): translate WGSL to GLSL ES 3.00 while the page runs,
 * fetching the translator chunk on demand.
 *
 * This is the one thing above the chunk boundary, and it holds no engine of its
 * own — it reaches `resource/translator.ts` by `await import()`, which is what
 * makes the translator its own bundle chunk (§9.1, §11). A shipped scene never
 * enters here: its materials were translated at build time (item 41), so the
 * translator stays out of its first download. The toy-tier editor enters here the
 * moment someone edits WGSL on a WebGL 2 device, and pays the one fetch then.
 *
 * `translateForEditing` is not re-exported through the door — the translator is
 * never named by a consumer (§11) — so the export surface does not move.
 */
import type { EntryPoint, TranslatorEngine } from './translator.js';

/** GLSL ES 3.00 for each entry point of a source, in the order asked for. */
export interface EditingTranslation {
  glsl: { entry: EntryPoint; glsl: string }[];
}

/** How the chunk is fetched: the module namespace `resource/translator.ts` exports.
 * Injectable so the mechanism is testable with an engine handed in, on a machine
 * with no wasm build. */
export type LoadTranslator = () => Promise<{ defaultEngine: TranslatorEngine | null }>;

/**
 * Translate WGSL to GLSL ES 3.00 on the editing path, fetching the translator
 * chunk on demand.
 *
 * `load` defaults to `() => import('./translator.js')` — the dynamic import that
 * gives the translator its own chunk, so its weight is absent from the first
 * download. A caller with an engine already in hand (or a test) passes `engine`,
 * which drives the same path with the fetch skipped. When neither is present — the
 * chunk resolved but its `defaultEngine` is still null (item 40 not landed) — the
 * refusal names why, so a page reads "not wired yet" rather than a null-call crash.
 */
export async function translateForEditing(
  wgsl: string,
  entries: readonly EntryPoint[],
  opts: { engine?: TranslatorEngine; load?: LoadTranslator } = {},
): Promise<EditingTranslation> {
  const load = opts.load ?? (() => import('./translator.js'));
  const engine = opts.engine ?? (await load()).defaultEngine;
  if (!engine) {
    throw new Error(
      'on-demand WGSL to GLSL translation is not wired: the editing-path chunk ' +
        'exists but no engine fills it yet (item 40 selects the wasm translator)',
    );
  }
  return { glsl: entries.map((entry) => ({ entry, glsl: engine.translate(wgsl, entry) })) };
}
