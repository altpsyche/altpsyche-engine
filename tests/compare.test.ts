/**
 * The three-number cross-backend comparison (ROADMAP.md item 44).
 *
 * RoadToPureEngine.md §17's amendment to decision 4 retired the per-channel
 * average as a primary reading: a mean cannot tell small error spread thin from a
 * picture cut into visible blocks on one backend. The comparison instead reports
 * hard jumps per frame (counted independently and compared as counts), the worst
 * single-channel delta, and the channels differing at all.
 *
 * `compareFrames` is the pure function the card gate calls (bundled into its page,
 * so the gate measures this and not a restatement); here it is exercised directly,
 * with no card, since the metric is arithmetic over two byte frames.
 */
import { describe, expect, it } from 'vitest';
import { HARD_JUMP, compareFrames, hardJumps } from '../gates/compare.mjs';

/** A `width × height` RGBA frame filled with one opaque colour. */
const flat = (width: number, height: number, r: number, g = r, b = r): Uint8Array => {
  const frame = new Uint8Array(width * height * 4);
  for (let i = 0; i < frame.length; i += 4) {
    frame[i] = r;
    frame[i + 1] = g;
    frame[i + 2] = b;
    frame[i + 3] = 255;
  }
  return frame;
};

describe('the comparison reports three numbers and no average', () => {
  it('reports all three on every comparison, and only differing can say identical', () => {
    const a = flat(4, 4, 100);
    const b = flat(4, 4, 100);
    const c = compareFrames(a, b, 4, 4);

    expect(c.hardJumps).toEqual({ a: 0, b: 0 });
    expect(c.maxDelta).toBe(0);
    expect(c.differing).toBe(0); // the clean-pass signal — nothing differs
    expect(c.channels).toBe(4 * 4 * 3); // alpha is not counted
  });

  it('a hard jump is a left-neighbour delta over 40 on any channel, so 40 is not one and 41 is', () => {
    // Row of three pixels: R goes 0, 40, 81. x=1 is exactly 40 apart (not a jump);
    // x=2 is 41 apart (a jump).
    const frame = new Uint8Array([0, 0, 0, 255, 40, 0, 0, 255, 81, 0, 0, 255]);
    expect(HARD_JUMP).toBe(40);
    expect(hardJumps(frame, 3, 1)).toBe(1);

    // The same counted on the green channel, to show it is any colour channel.
    const green = new Uint8Array([0, 0, 0, 255, 0, 40, 0, 255, 0, 81, 0, 255]);
    expect(hardJumps(green, 3, 1)).toBe(1);

    // The leftmost column has no left neighbour and is never a jump.
    expect(hardJumps(flat(1, 5, 0), 1, 5)).toBe(0);
  });

  it('catches a picture cut into blocks that an average buries — the 7,537-against-292 shape', () => {
    // Both frames are a flat field; the second carries a one-pixel +80 spike every
    // ten pixels — a seam every cell boundary, exactly the value-noise failure. The
    // second frame's hard-jump count is far above the first's while the mean stays
    // near-silent, which is why the average is retired and the count is not.
    const width = 1000;
    const a = flat(width, 1, 100);
    const b = flat(width, 1, 100);
    for (let x = 10; x < width; x += 10) b[x * 4] = 180; // +80 on R, one pixel wide

    const c = compareFrames(a, b, width, 1);

    // 99 spikes; each is a jump into it (vs its left, 100→180) and out of it (the
    // next pixel, 180→100) — counted independently in b, absent from the flat a.
    const spikes = 99;
    expect(c.hardJumps.a).toBe(0);
    expect(c.hardJumps.b).toBe(spikes * 2);

    // Only the spike pixels differ, by 80. The worst single channel is loud; the
    // fraction of channels touched is tiny, so a mean would read ~2.6 and stay quiet.
    expect(c.maxDelta).toBe(80);
    expect(c.differing).toBe(spikes);
    expect(c.channels).toBe(width * 3);
    const meanIfWeTookOne = (c.differing * 80) / c.channels;
    expect(meanIfWeTookOne).toBeLessThan(3); // the average the amendment forbids as primary
  });

  it('catches a shader a widened average bar would pass — the 822,426-of-1,440,000 shape', () => {
    // A picture where most channels differ but each by little: an average sits low
    // enough to slip under a tolerance bar somebody widened, while `differing` and
    // `maxDelta` name the disagreement the bar was meant to catch.
    const width = 800;
    const height = 600;
    const a = flat(width, height, 100);
    const b = flat(width, height, 100);
    // 60% of pixels differ by 19 on every colour channel — a small per-channel
    // distance, but well over half of all 1,440,000 channels are apart, which is
    // the 822,426-of-1,440,000 shape. An average sits low; `differing` does not.
    let apart = 0;
    for (let p = 0; p < width * height; p++) {
      if (p % 5 !== 0) {
        b[p * 4] = 119;
        b[p * 4 + 1] = 119;
        b[p * 4 + 2] = 119; // +19 on R, G, B
        apart += 3;
      }
    }
    const c = compareFrames(a, b, width, height);

    expect(c.maxDelta).toBe(19); // no single channel is dramatic
    expect(c.differing).toBe(apart); // the count an average cannot report
    expect(c.differing).toBeGreaterThan(800_000);
    expect(c.channels).toBe(1_440_000);
  });

  it('refuses two frames of different sizes rather than comparing them silently', () => {
    expect(() => compareFrames(flat(4, 4, 0), flat(2, 2, 0), 4, 4)).toThrow(/different sizes/);
    expect(() => compareFrames(flat(4, 4, 0), flat(4, 4, 0), 4, 3)).toThrow(/is 48 bytes, not 64/);
  });
});
