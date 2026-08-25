// The cross-backend comparison, as three numbers rather than an average.
//
// RoadToPureEngine.md §17's amendment to decision 4 retired the per-channel
// average as a primary reading. A mean per-channel distance cannot tell **small
// error spread thin** from **a picture cut into visible blocks on one backend**:
// the measured case was 7,537 hard jumps on WebGPU against 292 on WebGL 2 while an
// average stayed quiet, and a second case where a gate *passed* a shader at an
// average channel distance of 19.0 against a bar of 24 while 822,426 of 1,440,000
// channels sat over the per-channel tolerance. A number a gate accepts because its
// bar was widened is a number nobody has looked at.
//
// So a comparison reports the three numbers below and no average, and the only one
// of the three that can say "identical" is `differing`, at zero.
//
// This is pure: two RGBA byte frames of one size in, three numbers out, no browser
// and no device. It is bundled into the card gate's page (so the gate measures
// exactly this, not a restatement of it) and exercised directly by the node suite.

// A pixel counts as a hard jump when it sits more than this far from its left
// neighbour on any colour channel — the discontinuity a cell seam introduces, and
// the definition §17's amendment gives (a pixel more than 40 from its left
// neighbour on any colour channel).
export const HARD_JUMP = 40;

/**
 * Hard jumps in one frame, counted **independently** of any other frame: a pixel
 * whose R, G or B is more than `HARD_JUMP` from its left neighbour's. The leftmost
 * column has no left neighbour and is not counted. Alpha is not a colour channel.
 *
 * Counted per frame and compared as counts (220 against 220) rather than as a diff
 * of the two frames, so a uniform shift a human would not care about does not read
 * as structural change while a block seam one backend introduced does.
 *
 * @param {Uint8Array} frame RGBA bytes, `width * height * 4` long
 * @param {number} width
 * @param {number} height
 * @returns {number}
 */
export function hardJumps(frame, width, height) {
  let jumps = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 1; x < width; x++) {
      const here = (y * width + x) * 4;
      const left = here - 4;
      if (
        Math.abs(frame[here] - frame[left]) > HARD_JUMP ||
        Math.abs(frame[here + 1] - frame[left + 1]) > HARD_JUMP ||
        Math.abs(frame[here + 2] - frame[left + 2]) > HARD_JUMP
      )
        jumps++;
    }
  }
  return jumps;
}

/**
 * @typedef {object} FrameComparison
 * @property {{ a: number, b: number }} hardJumps hard jumps in each frame, counted
 *   independently — structural change, whether one backend introduced discontinuity
 *   the other did not.
 * @property {number} maxDelta the largest per-channel difference between the two
 *   frames — the worst single pixel, which an average buries.
 * @property {number} differing colour channels that differ at all — the clean-pass
 *   signal, and the only one of the three that can say "identical" (0 means so).
 * @property {number} channels colour channels compared (`width * height * 3`; alpha
 *   is not compared), so `differing` can be read as a fraction.
 */

/**
 * The three numbers §17's amendment prescribes for a cross-backend comparison, and
 * no average. Alpha is not compared, matching the channels a picture is judged on.
 *
 * @param {Uint8Array} a one backend's frame, RGBA bytes
 * @param {Uint8Array} b the other backend's frame, RGBA bytes, same size
 * @param {number} width
 * @param {number} height
 * @returns {FrameComparison}
 */
export function compareFrames(a, b, width, height) {
  if (a.length !== b.length)
    throw new Error(`two frames of different sizes: ${a.length} against ${b.length} bytes`);
  if (a.length !== width * height * 4)
    throw new Error(`a ${width}×${height} frame is ${width * height * 4} bytes, not ${a.length}`);

  let maxDelta = 0;
  let differing = 0;
  for (let i = 0; i < a.length; i++) {
    if (i % 4 === 3) continue; // alpha is not a colour channel here
    const apart = Math.abs(a[i] - b[i]);
    if (apart > maxDelta) maxDelta = apart;
    if (apart > 0) differing++;
  }

  return {
    hardJumps: { a: hardJumps(a, width, height), b: hardJumps(b, width, height) },
    maxDelta,
    differing,
    channels: (a.length / 4) * 3,
  };
}
