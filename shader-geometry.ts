/**
 * The vertices the build writes for a shader to draw.
 *
 * A buffer's contents are numbers and no source file holds them, so a shader
 * that draws its own geometry names a primitive here and the build generates it.
 * That keeps a capability preset free of a binary asset: nothing in the repo
 * carries the bytes, and two machines building the same tree write the same
 * files because every value below comes out of arithmetic on the vertex's own
 * place in the grid rather than out of a random number generator.
 *
 * The layout lives beside the generator rather than in a shader's entry, because
 * the bytes and their layout are one answer: a vertex written as four floats and
 * read as three is a pipeline reading each vertex out of the middle of the last
 * one. What the source gets to declare is which attribute it reads at which
 * location, and the build refuses a source whose declarations disagree with the
 * layout below.
 */

/** Which shape a drawn primitive is. A shader's entry names one of these and the
 * build turns it into vertices and the indices that address them. */
export type GeometryPrimitive = 'quad-grid';

/** How the card reads one vertex out of the buffer, and how it reads the indices
 * that put the vertices in order. Every field is what the pipeline is built with,
 * so a number here that disagrees with the bytes beside it is a picture drawn out
 * of the wrong part of memory. */
export interface GeometryLayout {
  /** Bytes from the start of one vertex to the start of the next. */
  stride: number;
  /** Each field of one vertex, by the location the source reads it at. */
  attributes: { location: number; offset: number; format: GPUVertexFormat }[];
  indexFormat: 'uint16' | 'uint32';
  topology: GPUPrimitiveTopology;
}

/** One primitive's bytes, with the counts a draw needs. The counts come out of
 * the generator rather than being worked out again where the draw is made, since
 * a count worked out twice can disagree and an index past the end of the buffer
 * is a vertex of whatever the memory held. */
export interface GeneratedGeometry {
  vertices: Uint8Array<ArrayBuffer>;
  indices: Uint8Array<ArrayBuffer>;
  vertexCount: number;
  indexCount: number;
}

/** Four bytes a float, which is the only vertex number this build writes. */
const FLOAT_BYTES = 4;

/** Two floats for where the vertex sits and two for where it sits in the grid,
 * which is what lets a fragment stage shade by the geometry rather than by the
 * screen. */
const QUAD_GRID_LAYOUT: GeometryLayout = {
  stride: 4 * FLOAT_BYTES,
  attributes: [
    { location: 0, offset: 0, format: 'float32x2' },
    { location: 1, offset: 2 * FLOAT_BYTES, format: 'float32x2' },
  ],
  indexFormat: 'uint16',
  topology: 'triangle-list',
};

/**
 * A grid of quads covering the square from corner to corner, as the corners the
 * quads share plus the indices that walk each quad as two triangles.
 *
 * The corners are shared rather than given to each quad of their own, which is
 * the whole reason a drawn primitive has an index buffer: a grid of sixteen by
 * sixteen is 289 corners against the 1,536 vertices the same picture would need
 * with every triangle carrying its own three.
 */
function quadGrid(across: number, down: number): GeneratedGeometry {
  const columns = across + 1;
  const rows = down + 1;
  const vertexCount = columns * rows;

  const vertices = new Float32Array(vertexCount * (QUAD_GRID_LAYOUT.stride / FLOAT_BYTES));
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const alongX = column / across;
      const alongY = row / down;
      const at = (row * columns + column) * 4;
      // The square from corner to corner is what a vertex stage is handed
      // before it moves anything, so a shader that passes its input through
      // unchanged covers the frame exactly.
      vertices[at] = alongX * 2 - 1;
      vertices[at + 1] = alongY * 2 - 1;
      vertices[at + 2] = alongX;
      vertices[at + 3] = alongY;
    }
  }

  const indexCount = across * down * 6;
  // A buffer is written in whole four byte words, and six two byte indices a quad
  // is twelve bytes, so a grid of any size fills whole words with nothing padded.
  const indices = new Uint16Array(indexCount);
  let wrote = 0;
  for (let row = 0; row < down; row++) {
    for (let column = 0; column < across; column++) {
      const topLeft = row * columns + column;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + columns;
      const bottomRight = bottomLeft + 1;
      // Both triangles are wound the same way round, so a pipeline that ever
      // starts dropping back faces drops the whole grid or none of it rather
      // than every other triangle.
      for (const corner of [topLeft, topRight, bottomLeft, topRight, bottomRight, bottomLeft]) {
        indices[wrote++] = corner;
      }
    }
  }

  return {
    vertices: new Uint8Array(vertices.buffer),
    indices: new Uint8Array(indices.buffer),
    vertexCount,
    indexCount,
  };
}

export const GEOMETRY_PRIMITIVE: Record<
  GeometryPrimitive,
  GeometryLayout & { bytes: (across: number, down: number) => GeneratedGeometry }
> = {
  'quad-grid': { ...QUAD_GRID_LAYOUT, bytes: quadGrid },
};
