import { deprecate } from '../../deprecate.js';

/**
 * A deprecated export, so the mechanism has one to demonstrate on. Nothing
 * shipping is deprecated yet (0.x renames a name away rather than deprecating it —
 * §17 decision 8), so the proof that a deprecated export warns once and reads as
 * struck through rides this stand-in, which is the exact shape a real post-1.0
 * shim copies: a `@deprecated` tag for the editor, a `deprecate(...)` call for the
 * runtime, and a body that still does the old thing.
 *
 * @deprecated demonstration only — a real shim would name its replacement here,
 * e.g. `use submit(renderer, graph, uniforms)`.
 */
export function legacyEcho(value: number): number {
  deprecate('legacyEcho', 'demonstration only');
  return value;
}
