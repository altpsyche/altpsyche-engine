/**
 * Which outcome a WebGL 2 corpus draw is — a FAIL the gate reports, a SKIP it sets
 * aside, or a PASS — told apart so a build that *throws* fails the gate where a
 * capability the device *withholds* skips it (item 101).
 *
 * The distinction the old arm could not make: every error in the WebGL 2 column
 * became a skip, so a broken frame build and a capability refusal read identically
 * and the gate whose job is the WebGL 2 draw path could not fail for it. Item 87
 * made `frameOf` throw *"names a generated resource 1 with no bytes"* for six presets
 * that had been drawing, and the gate printed **"17 of 17 … 16 WebGL 2 skips"** and
 * **exited 0** — green having run none of the path it exists to check.
 *
 * The split is by *where* the throw was caught, which the page tags: the library
 * building the frame (`frameOf`/`glslFrameOf`) is the gate's own path, so a throw
 * there is a broken build and the gate's to fail; the backend linking and drawing the
 * GLSL is the device's path, so a throw there is a capability it withholds and a skip
 * by outcome (item 79). This function only maps the tag the page returned to the
 * outcome, so it is pure and a node test tells the two apart without a browser.
 *
 * The page returns exactly one of:
 * - `{ noContext: true }` — the device gave no WebGL 2 context at all (a SKIP: nothing
 *   about the preset, the device has no path).
 * - `{ threw }` — the library threw while building the frame (a FAIL: a broken build).
 * - `{ skip }` — `glslFrameOf` returned null, the bake carried no GLSL for this frame
 *   (a SKIP: a fullscreen frame that baked no vertex, or a stage refused for a
 *   capability WebGL 2 withholds).
 * - `{ refused }` — the backend threw linking or drawing the GLSL (a SKIP: the device's
 *   own refusal, in its own words).
 * - `{ lit, total }` — the draw ran; `lit === 0` is a FAIL (a frame of nothing is
 *   indistinguishable from one that never drew), otherwise a PASS.
 *
 * @param {{ noContext?: boolean, threw?: string, skip?: string, refused?: string, lit?: number, total?: number }} result
 * @returns {{ outcome: 'FAIL' | 'SKIP' | 'PASS', message: string }}
 */
export function classifyWebgl2(result) {
  if (result.noContext) return { outcome: 'SKIP', message: 'no webgl2 context' };
  if (result.threw !== undefined) return { outcome: 'FAIL', message: `the frame threw while building: ${result.threw}` };
  if (result.skip !== undefined) return { outcome: 'SKIP', message: result.skip };
  if (result.refused !== undefined) return { outcome: 'SKIP', message: `refused: ${result.refused}` };
  if (result.lit === 0) return { outcome: 'FAIL', message: `drew nothing, 0 of ${result.total} pixels lit` };
  const lit = /** @type {number} */ (result.lit);
  const total = /** @type {number} */ (result.total);
  const share = ((lit / total) * 100).toFixed(1);
  return {
    outcome: 'PASS',
    message: `${lit.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} pixels lit, ${share}%`,
  };
}
