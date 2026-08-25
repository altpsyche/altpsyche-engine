/**
 * The deprecation mechanism (§17 decision 8, ROADMAP.md item 56).
 *
 * A name that is leaving the door leaves in two halves, and this is the runtime
 * half. The other half is a `@deprecated` JSDoc tag on the export, which a
 * language server renders struck through at the call site — the place a reader
 * actually sees it, before running anything. That half needs no code: it is a tag
 * on the declaration, and every editor that speaks TypeScript already draws it.
 *
 * This is the half a build cannot see and an editor cannot draw: a one-shot
 * warning the first time a deprecated symbol is reached at runtime, so a consumer
 * who never opens the source still learns the name is going. It fires **once per
 * symbol per session** — a loop calling a deprecated function every frame must not
 * print a warning every frame — and it is silent in a production build, because a
 * shipped page is not where a developer reads warnings and the noise there is pure
 * cost.
 *
 * How a real deprecation uses both halves, which is the shape to copy when a name
 * on the door is first retired after 1.0:
 *
 * ```ts
 * import { deprecate } from '../deprecate.js';
 *
 * / **
 *  * @deprecated since 1.1 — use `submit(renderer, graph, uniforms)`, which lands
 *  * the same frame and takes an `{ into }` target.
 *  * /
 * export function drawFrame(...args) {
 *   deprecate('drawFrame', 'use submit() instead');
 *   return submit(...args);
 * }
 * ```
 *
 * There is no such shim in the tree today, and that is on purpose: 0.x renames a
 * name away rather than deprecating it (decision 8 — deprecation runs a minimum of
 * one minor cycle and only forbids renames *after* 1.0), so nothing shipping is
 * deprecated yet. The mechanism stands ready for the first one, the way item 39's
 * loop rule stood ready for a file that did not exist. It is not re-exported
 * through the door: a consumer does not deprecate this package's names, the
 * package does, so `deprecate` is internal and the door stays the size §17
 * decision 5 keeps it.
 */

// Production is read off `process.env.NODE_ENV`, the one token every bundler
// replaces statically, so a production build folds this to `'production' ===
// 'production'` and drops the whole warning branch as dead code. `typeof` guards
// the read because an unbundled browser has no `process` at all — there the guard
// is false, the symbol reads as development, and it warns rather than throwing a
// ReferenceError. `process` is declared here because the published build carries
// no node types (tsconfig.build.json), and it is declared as possibly `undefined`
// so the `typeof` narrowing is the only path to `.env`.
declare const process: { readonly env: { readonly NODE_ENV?: string } } | undefined;

function warningsAreOff(): boolean {
  return typeof process !== 'undefined' && process.env.NODE_ENV === 'production';
}

/** The symbols already warned about this session. A `Set` rather than a flag per
 * symbol because the symbols are not known here — a deprecated shim names itself
 * when it calls, and the first call for each distinct name is the one that
 * warns. */
const warned = new Set<string>();

/**
 * Warn once, this session, that `name` is deprecated. Silent in a production
 * build and silent on every call after the first for a given `name`.
 *
 * Call it from the body of a deprecated export, passing the export's own name and
 * — where there is a replacement — a short line naming it. The `@deprecated` JSDoc
 * tag on the same export is what carries the strikethrough; this carries the
 * runtime notice for a consumer who never reads the source.
 *
 * @param name the deprecated symbol's own name, which keys the one-shot.
 * @param detail an optional line appended to the warning, e.g. `use submit()`.
 */
export function deprecate(name: string, detail?: string): void {
  if (warningsAreOff()) return;
  if (warned.has(name)) return;
  warned.add(name);
  const tail = detail ? ` ${detail}` : '';
  console.warn(`[@altpsyche/engine] ${name} is deprecated.${tail}`);
}
