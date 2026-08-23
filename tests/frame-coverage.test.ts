import { describe, expect, it } from 'vitest';
import { describeFrameCoverage, isFullyPainted, readFrameCoverage } from '@altpsyche/engine';

/**
 * The frames here are built the way the controls that established this reading
 * were built: a picture with something in every row and column, and copies of it
 * with a band replaced by one flat colour.
 */

const WIDTH = 40;
const HEIGHT = 24;
const CHANNELS = 4;

/** A gradient with a per-pixel wobble, so no two rows and no two columns share a colour. */
function paintedFrame(): Uint8Array {
  const pixels = new Uint8Array(WIDTH * HEIGHT * CHANNELS);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const at = (y * WIDTH + x) * CHANNELS;
      pixels[at] = (x * 5 + y) % 256;
      pixels[at + 1] = (y * 9 + x * 2) % 256;
      pixels[at + 2] = (x * y) % 256;
      pixels[at + 3] = 255;
    }
  }
  return pixels;
}

function fillRows(pixels: Uint8Array, from: number, to: number, colour: number[]): Uint8Array {
  const out = Uint8Array.from(pixels);
  for (let y = from; y <= to; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const at = (y * WIDTH + x) * CHANNELS;
      for (let c = 0; c < CHANNELS; c++) out[at + c] = colour[c] ?? 0;
    }
  }
  return out;
}

function fillColumns(pixels: Uint8Array, from: number, to: number, colour: number[]): Uint8Array {
  const out = Uint8Array.from(pixels);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = from; x <= to; x++) {
      const at = (y * WIDTH + x) * CHANNELS;
      for (let c = 0; c < CHANNELS; c++) out[at + c] = colour[c] ?? 0;
    }
  }
  return out;
}

const size = { width: WIDTH, height: HEIGHT, channels: CHANNELS };
const GROUND = [12, 14, 20, 255];

describe('frame coverage', () => {
  it('reads every row and every column of a painted frame as painted', () => {
    const coverage = readFrameCoverage(paintedFrame(), size);
    expect(coverage.paintedRows).toBe(HEIGHT);
    expect(coverage.paintedColumns).toBe(WIDTH);
    expect(isFullyPainted(coverage)).toBe(true);
  });

  it('names the rows a frame left flat', () => {
    const coverage = readFrameCoverage(fillRows(paintedFrame(), 14, HEIGHT - 1, GROUND), size);
    expect(coverage.paintedRows).toBe(14);
    expect(coverage.paintedColumns).toBe(WIDTH);
    expect(coverage.blankRows[0]).toBe(14);
    expect(coverage.ground).toEqual(GROUND);
    expect(isFullyPainted(coverage)).toBe(false);
  });

  it('names a strip of columns down one edge', () => {
    const coverage = readFrameCoverage(fillColumns(paintedFrame(), WIDTH - 3, WIDTH - 1, GROUND), size);
    expect(coverage.paintedColumns).toBe(WIDTH - 3);
    expect(coverage.paintedRows).toBe(HEIGHT);
    expect(coverage.blankColumns).toEqual([WIDTH - 3, WIDTH - 2, WIDTH - 1]);
    expect(isFullyPainted(coverage)).toBe(false);
  });

  /**
   * The flat colour is whatever covers most of the frame rather than a colour
   * chosen here, because a shader picks its own and a capture of one dark enough
   * to sit near black is the same reading as a capture of one that is not.
   */
  it('takes the commonest colour as the ground whatever colour that is', () => {
    const coverage = readFrameCoverage(fillRows(paintedFrame(), 2, HEIGHT - 1, [200, 30, 90, 255]), size);
    expect(coverage.ground).toEqual([200, 30, 90, 255]);
    expect(coverage.paintedRows).toBe(2);
  });

  it('reads a frame with no alpha channel', () => {
    const rgb = new Uint8Array(WIDTH * HEIGHT * 3);
    for (let i = 0; i < rgb.length; i += 3) rgb[i] = (i / 3) % 256;
    const coverage = readFrameCoverage(rgb, { width: WIDTH, height: HEIGHT, channels: 3 });
    expect(coverage.ground).toHaveLength(3);
    expect(coverage.paintedRows).toBeGreaterThan(0);
  });

  it('refuses a buffer shorter than the size it was given', () => {
    expect(() => readFrameCoverage(new Uint8Array(10), size)).toThrow(/short of/);
  });

  it('prints a blank band as its two ends', () => {
    const text = describeFrameCoverage(readFrameCoverage(fillRows(paintedFrame(), 14, HEIGHT - 1, GROUND), size));
    expect(text).toContain('14 of 24 rows and 40 of 40 columns painted');
    expect(text).toContain('blank rows 14 to 23');
  });

  /** A frame of one colour has nothing to compare against, so every row and column is blank. */
  it('reads a frame of one colour as painted nowhere', () => {
    const flat = new Uint8Array(WIDTH * HEIGHT * CHANNELS).fill(7);
    const coverage = readFrameCoverage(flat, size);
    expect(coverage.paintedRows).toBe(0);
    expect(coverage.paintedColumns).toBe(0);
    expect(coverage.groundShare).toBe(1);
  });
});
