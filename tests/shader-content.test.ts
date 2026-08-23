import { describe, expect, it } from 'vitest';
import { BUFFER_CONTENT } from '../fixtures/shader-content';

/**
 * The numbers the build writes into a buffer for a shader to read.
 *
 * A buffer of per-copy data is the one thing here whose bytes have to match a
 * layout no compiler on this side ever checks: the shader reads `array<Copy>`
 * where `Copy` is a `vec3<f32>` followed by an `f32`, and the card reads it by
 * WGSL's own rules whatever the file that wrote it did. So the layout is held the
 * way the uniform block is: the arithmetic is written down and tested, and the
 * card drawing the real thing in `backends.mjs` is what proves the two agree.
 */
describe('the per-copy numbers the build writes', () => {
  it('lays out a colour and a height as std430 does a vec3 followed by a float', () => {
    // Four copies, sixteen bytes each, which is the size a Copy takes: the vec3
    // aligns to sixteen and holds twelve, and the float sits in the four it leaves
    // free, so one copy is four floats with no tail padding.
    const bytes = BUFFER_CONTENT['copy-tints'].bytes(64);
    expect(bytes.byteLength).toBe(64);

    const floats = new Float32Array(bytes.buffer);
    // Copy zero: the first palette colour in the first three floats, its height in
    // the fourth.
    expect([floats[0], floats[1], floats[2]]).toEqual([Math.fround(0.85), Math.fround(0.35), Math.fround(0.3)]);
    expect(floats[3]).toBe(Math.fround(0.1));
    // Copy one sits sixteen bytes on, which is four floats on, and its height has
    // climbed by a step so a reader can tell the copies apart.
    expect([floats[4], floats[5], floats[6]]).toEqual([Math.fround(0.35), Math.fround(0.75), Math.fround(0.4)]);
    expect(floats[7]).toBe(Math.fround(0.1 + 0.05));
  });

  it('refuses a size that is not a whole number of copies, rather than dropping the last one', () => {
    // Twenty bytes is a whole number of four-byte words, so the words check accepts
    // it, but it is a copy and a quarter: the quarter writes past the end of the
    // Float32Array and vanishes, so it is refused here by name instead.
    expect(() => BUFFER_CONTENT['copy-tints'].bytes(20)).toThrow(/no whole number of 16-byte copies/);
    expect(() => BUFFER_CONTENT['copy-tints'].bytes(0)).toThrow(/no whole number of 16-byte copies/);
    expect(() => BUFFER_CONTENT['copy-tints'].bytes(64)).not.toThrow();
  });

  it('writes the same bytes every time, so two machines building one tree agree', () => {
    // No sine or cosine anywhere in it, which is what lets the file be
    // byte-identical across machines: a transcendental is folded a hair
    // differently and the buffer would stop matching itself.
    expect(BUFFER_CONTENT['copy-tints'].bytes(64)).toEqual(BUFFER_CONTENT['copy-tints'].bytes(64));
  });
});
