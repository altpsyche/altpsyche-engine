/**
 * The on-demand editing-path translator chunk (item 42).
 *
 * §9.1's second path: someone typing WGSL into the toy tier on a WebGL 2 device
 * needs WGSL→GLSL translation *while the page runs*. That is the one case that
 * fetches the translator by `await import()`, in its own chunk, exactly the way a
 * backend is fetched today — `gpu/renderer.ts` reaches `webgpu.js` the same way, so
 * the bundler splits it into a chunk a card-less browser never downloads.
 *
 * This module IS that chunk. `resource/editing.ts` reaches it only through a
 * dynamic import, so a bundler gives it its own output and its weight is absent
 * from the first download — a scene-tier consumer, whose materials were translated
 * at build time (item 41), fetches it never; the toy-tier editor fetches it once,
 * the moment someone edits WGSL on a WebGL 2 device.
 *
 * The engine that turns WGSL into GLSL is a wasm tool, and which one — the Stage 5a
 * evaluation §17 lists as still open, tracked as item 40 — is not settled here.
 * This item is the chunk boundary and the seam the chosen engine plugs into, which
 * is why it lands without waiting on that choice (its `Needs` is item 75, not 40).
 * Until an engine is wired, `defaultEngine` is null and the editing path is driven
 * with an engine handed in — the same way every card-dependent path in this tree is
 * proven on a machine with no card (the injected `make` of `submit/`, the device
 * double of `trace/`). Wiring the real engine, and refusal by named construct, are
 * item 40 and item 43.
 */

/** One entry point of a WGSL source, named and staged. */
export interface EntryPoint {
  /** The entry function's name, e.g. `vs_main`. */
  name: string;
  /** The stage it runs at. Never `compute`: GLSL ES 3.00 has no compute stage, so
   * a compute frame is refused before translation is ever reached (§17 decision 6),
   * which is why the type has no third arm. */
  stage: 'vertex' | 'fragment';
}

/** One WGSL source turned into the GLSL ES 3.00 a WebGL 2 program links from. */
export interface TranslatorEngine {
  /** Translate one entry point to GLSL ES 3.00, WebGL 2's profile. Throws, naming
   * the construct, on WGSL it cannot carry — the runtime face of item 43's refusal
   * by named construct. */
  translate(wgsl: string, entry: EntryPoint): string;
}

/**
 * The wasm engine, wired by item 40. Null until then: this chunk ships the seam,
 * not the engine, so the "no shipped source is a translator" invariant item 41
 * asserts stays true of it — the editing path is driven with an engine handed in
 * until the real one lands behind this same boundary.
 */
export const defaultEngine: TranslatorEngine | null = null;
