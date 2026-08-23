import { describe, expect, it } from 'vitest';
import { GEOMETRY_PRIMITIVE } from '@altpsyche/engine';

/**
 * The vertices and indices the build generates for a shader to draw.
 *
 * Every number here reaches the card as bytes, so a wrong one is a picture drawn
 * out of the wrong part of memory rather than an exception: a stride that does
 * not match the floats written per vertex reads each vertex out of the middle of
 * the last one, and an index past the last vertex is a corner of whatever the
 * memory held. So the counts, the layout and the bytes are each read back and
 * checked against each other.
 */

const grid = GEOMETRY_PRIMITIVE['quad-grid'];

/** The floats of one vertex, read back out of the bytes the generator wrote. */
const vertexAt = (bytes: Uint8Array, at: number): number[] => {
  const floats = new Float32Array(bytes.buffer, at * grid.stride, grid.stride / 4);
  return [...floats];
};

const indicesOf = (bytes: Uint8Array): number[] => [...new Uint16Array(bytes.buffer)];

describe('a grid of quads', () => {
  it('shares the corners between the quads that meet at them', () => {
    const made = grid.bytes(16, 16);

    expect(made.vertexCount).toBe(17 * 17);
    expect(made.indexCount).toBe(16 * 16 * 6);
    expect(made.vertices.byteLength).toBe(made.vertexCount * grid.stride);
  });

  it('spans the square from corner to corner, with the grid place beside each position', () => {
    const made = grid.bytes(2, 2);

    expect(vertexAt(made.vertices, 0)).toEqual([-1, -1, 0, 0]);
    expect(vertexAt(made.vertices, 4)).toEqual([0, 0, 0.5, 0.5]);
    expect(vertexAt(made.vertices, made.vertexCount - 1)).toEqual([1, 1, 1, 1]);
  });

  it('walks each quad as two triangles wound the same way round', () => {
    const made = grid.bytes(1, 1);

    expect(indicesOf(made.indices).slice(0, 6)).toEqual([0, 1, 2, 1, 3, 2]);
  });

  it('addresses no vertex the buffer does not hold', () => {
    const made = grid.bytes(7, 5);
    const drawn = indicesOf(made.indices).slice(0, made.indexCount);

    expect(Math.max(...drawn)).toBe(made.vertexCount - 1);
    expect(Math.min(...drawn)).toBe(0);
  });

  it('fills whole four byte words, which is what a buffer is written in', () => {
    for (const [across, down] of [
      [1, 1],
      [3, 2],
      [16, 16],
    ]) {
      const made = grid.bytes(across as number, down as number);

      expect(made.indices.byteLength).toBe(made.indexCount * 2);
      expect(made.indices.byteLength % 4).toBe(0);
    }
  });

  it('writes the same bytes every time it is asked', () => {
    const [first, second] = [grid.bytes(9, 4), grid.bytes(9, 4)];

    expect([...first.vertices]).toEqual([...second.vertices]);
    expect([...first.indices]).toEqual([...second.indices]);
  });

  it('lays one vertex out as the two pairs of floats the stride measures', () => {
    expect(grid.stride).toBe(16);
    expect(grid.attributes).toEqual([
      { location: 0, offset: 0, format: 'float32x2' },
      { location: 1, offset: 8, format: 'float32x2' },
    ]);
    expect(grid.indexFormat).toBe('uint16');
    expect(grid.topology).toBe('triangle-list');
  });
});
