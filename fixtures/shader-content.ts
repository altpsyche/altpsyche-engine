/**
 * The pictures the build writes for a shader to sample.
 *
 * A texture's contents are numbers and no source file holds them, so a shader
 * that samples one names a picture here and the build generates it. That keeps a
 * capability preset free of a binary asset: nothing in the repo carries the
 * bytes, and two machines building the same tree write the same file because
 * every value below comes out of arithmetic on the pixel's own position rather
 * than out of a random number generator.
 *
 * The format lives beside the generator rather than in a shader's entry, because
 * the bytes and the format are one answer: a picture written as four bytes a
 * pixel and declared as anything else is a texture the card reads as garbage.
 */

import { mat4 } from '@altpsyche/engine';
import { drawList } from '@altpsyche/engine';
import { batchOnePipeline } from '@altpsyche/engine';
import { DRAW_LIST_SCENE, MATERIAL_SCENE, MATERIALS } from './capability-fixtures';

/** Which picture a texture's contents are. A shader's entry names one of these
 * and the build turns it into bytes. */
export type TextureContent = 'value-noise';

/** A number between 0 and 1 for a lattice corner, from that corner's coordinates
 * alone. Integer mixing rather than a sine, because a `sin` argument in the
 * thousands is held to about 1e-3 by an f32 and two machines can fold it
 * differently, where these three multiplies are exact in 32 bits everywhere. */
function corner(x: number, y: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smoothstep: the ramp whose slope is zero at both ends, so two cells meeting at
 * a corner have no visible seam between them. A straight ramp leaves the lattice
 * showing as a grid of creases. */
const ease = (t: number): number => t * t * (3 - 2 * t);

/** One octave of value noise: a grid of random corners with the pixels between
 * them faded across. The lattice wraps at `cells`, so the picture tiles and a
 * sampler set to repeat shows no seam at the edge. */
function octave(x: number, y: number, across: number, down: number, cells: number): number {
  const u = (x / across) * cells;
  const v = (y / down) * cells;
  const left = Math.floor(u);
  const top = Math.floor(v);
  const fx = ease(u - left);
  const fy = ease(v - top);

  const at = (i: number, j: number) => corner(((i % cells) + cells) % cells, ((j % cells) + cells) % cells);
  const top_ = at(left, top) * (1 - fx) + at(left + 1, top) * fx;
  const bottom = at(left, top + 1) * (1 - fx) + at(left + 1, top + 1) * fx;
  return top_ * (1 - fy) + bottom * fy;
}

/** Three octaves at four, eight and sixteen cells, each half the weight of the
 * one before it, which is what gives a picture both large shapes and fine grain
 * rather than one size of blob. */
function valueNoise(across: number, down: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(across * down * 4);
  for (let y = 0; y < down; y++) {
    for (let x = 0; x < across; x++) {
      const value =
        (octave(x, y, across, down, 4) * 4 + octave(x, y, across, down, 8) * 2 + octave(x, y, across, down, 16)) / 7;
      const level = Math.round(value * 255);
      const at = (y * across + x) * 4;
      bytes[at] = level;
      bytes[at + 1] = level;
      bytes[at + 2] = level;
      bytes[at + 3] = 255;
    }
  }
  return bytes;
}

export const TEXTURE_CONTENT: Record<
  TextureContent,
  { format: GPUTextureFormat; bytes: (across: number, down: number) => Uint8Array<ArrayBuffer> }
> = {
  'value-noise': { format: 'rgba8unorm', bytes: valueNoise },
};

/** Which numbers the build writes into a buffer for the shader to read. A shader
 * whose drawn copies each carry their own numbers names one of these, and the
 * build turns it into bytes, so nothing in the repo carries a binary asset and
 * two machines building the same tree write the same file. */
export type BufferContent = 'copy-tints' | 'draw-list-models' | 'material-objects';

/** A colour and a height for each drawn copy, one Copy struct after another, laid
 * out the way WGSL reads `array<Copy>` where `Copy` is a `vec3<f32>` followed by
 * an `f32`. The three-vector aligns to sixteen and takes twelve, so the height
 * sits in the four bytes it leaves free and one copy is a clean sixteen with no
 * tail padding, which is why four consecutive floats a copy is the whole layout.
 *
 * The colours are a fixed table rather than a hue worked round the wheel with a
 * cosine, for the reason the value noise uses integer mixing: a transcendental is
 * folded a hair differently on two machines and the file would stop being
 * byte-identical across them. `Float32Array` rounds each of these to the nearest
 * f32 the same way everywhere. */
const COPY_PALETTE: [number, number, number][] = [
  [0.85, 0.35, 0.3],
  [0.35, 0.75, 0.4],
  [0.35, 0.55, 0.9],
  [0.9, 0.72, 0.35],
  [0.7, 0.4, 0.85],
  [0.4, 0.8, 0.78],
];

/** Bytes for however many copies the buffer holds, which is its size in whole
 * sixteen-byte Copy structs. The colour cycles the palette and the height climbs
 * a little per copy, so a reader can tell the copies apart by both. */
function copyTints(byteCount: number): Uint8Array<ArrayBuffer> {
  const FLOATS_PER_COPY = 4;
  const COPY_BYTES = FLOATS_PER_COPY * 4;
  // Whole copies only: a size that leaves a partial Copy writes that copy's tail
  // past the end of the Float32Array, where a typed array drops the write with no
  // error, so a buffer sized 20 would ship a copy holding one of its four numbers.
  if (byteCount <= 0 || byteCount % COPY_BYTES !== 0) {
    throw new Error(
      `copy-tints was asked for ${byteCount} bytes, which is no whole number of ${COPY_BYTES}-byte copies`
    );
  }
  const copies = byteCount / COPY_BYTES;
  const values = new Float32Array(copies * FLOATS_PER_COPY);
  for (let copy = 0; copy < copies; copy++) {
    const tint = COPY_PALETTE[copy % COPY_PALETTE.length] as [number, number, number];
    const at = copy * FLOATS_PER_COPY;
    values[at] = tint[0];
    values[at + 1] = tint[1];
    values[at + 2] = tint[2];
    values[at + 3] = 0.1 + copy * 0.05;
  }
  return new Uint8Array(values.buffer);
}

/** One model matrix per object the engine's draw list draws, in draw order, each
 * the world matrix `worldMatrix` computes for that object with every parent's
 * transform applied over the top. It reads the same `DRAW_LIST_SCENE` the preset
 * entry aims its camera at rather than a copy of it, so the matrices the buffer
 * carries and the instance count the pass asks for come off one scene, and the
 * ordering rule that decides which object is which copy lives in `drawList` rather
 * than here.
 *
 * A mat4x4 is sixteen column-major floats laid out contiguously, which is both
 * what a WGSL `array<mat4x4<f32>>` element is and what `packMat4` returns, so the
 * bytes need no reshaping between the engine and the card. `Float32Array` rounds
 * each number to the nearest f32 the same way everywhere, which is what keeps the
 * file byte-identical across machines. */
function drawListModels(byteCount: number): Uint8Array<ArrayBuffer> {
  const MAT4_BYTES = 64;
  const draws = drawList(DRAW_LIST_SCENE);
  // Whole matrices and the scene's own count: a size that is not the draw list's
  // is a buffer that would hand some copy a matrix past the end of the array or
  // leave a matrix the scene wanted undrawn, so it is refused rather than shipped.
  const wanted = draws.length * MAT4_BYTES;
  if (byteCount !== wanted) {
    throw new Error(
      `draw-list-models was asked for ${byteCount} bytes, but the scene's draw list is ${draws.length} objects of ${MAT4_BYTES} bytes, ${wanted}`
    );
  }
  const values = new Float32Array(draws.length * 16);
  draws.forEach((draw, index) => values.set(mat4.pack(draw.world), index * 16));
  return new Uint8Array(values.buffer);
}

/** One Object per drawn object in the material scene's batch, in draw order: the
 * object's world matrix followed by the colour its material feeds it. It reads the
 * same `MATERIAL_SCENE` and `MATERIALS` the preset aims its camera at, through the
 * engine's `batch`, so the matrices and colours the buffer carries and the instance
 * count the pass asks for come off one scene, and the rule that pairs an object
 * with its material lives in `batch` rather than here.
 *
 * An Object is eighty bytes: a mat4x4 of sixteen contiguous column-major floats,
 * then a vec3 of three, then one padding word the shader never reads, which is
 * std430 for a matrix followed by a vector of three. `packMat4` lays the matrix out
 * the way the card reads it and `Float32Array` rounds every number to the nearest
 * f32 the same way everywhere, so the file is byte-identical across machines. */
function materialObjects(byteCount: number): Uint8Array<ArrayBuffer> {
  const OBJECT_BYTES = 80;
  const FLOATS_PER_OBJECT = 20;
  const { draws } = batchOnePipeline(MATERIAL_SCENE, MATERIALS);
  // Whole objects and the batch's own count: a size that is not the batch's is a
  // buffer that would hand a copy an Object past the end of the array or leave one
  // the scene wanted undrawn, so it is refused rather than shipped.
  const wanted = draws.length * OBJECT_BYTES;
  if (byteCount !== wanted) {
    throw new Error(
      `material-objects was asked for ${byteCount} bytes, but the batch is ${draws.length} objects of ${OBJECT_BYTES} bytes, ${wanted}`
    );
  }
  const values = new Float32Array(draws.length * FLOATS_PER_OBJECT);
  draws.forEach((draw, index) => {
    const at = index * FLOATS_PER_OBJECT;
    values.set(mat4.pack(draw.world), at);
    values[at + 16] = draw.values.tint[0];
    values[at + 17] = draw.values.tint[1];
    values[at + 18] = draw.values.tint[2];
  });
  return new Uint8Array(values.buffer);
}

export const BUFFER_CONTENT: Record<BufferContent, { bytes: (byteCount: number) => Uint8Array<ArrayBuffer> }> = {
  'copy-tints': { bytes: copyTints },
  'draw-list-models': { bytes: drawListModels },
  'material-objects': { bytes: materialObjects },
};
