/**
 * `Ref` and its two arms: the distinction that serves both tiers with one type,
 * per RoadToPureEngine.md §8.
 *
 * A resource a graph points at lives one of two lives, and which one is a fact
 * the ref carries rather than one a reader infers:
 *
 * - **Resident** is arena-allocated and lives across frames. A mesh uploaded
 *   once and drawn for a thousand frames. The scene tier is almost entirely
 *   resident, and a resident ref carries the arena handle the resource was
 *   allocated under.
 * - **Transient** is declared inside the graph itself, by descriptor, and
 *   pooled and aliased by `submit/`. A depth buffer. A ping-pong pair for
 *   bloom. The toy tier is almost entirely transient, and a transient ref
 *   carries a `TransientId` naming which of the graph's declared descriptors it
 *   is.
 *
 * The pooling and aliasing of transients across frames is item 18; item 17 is
 * the two arms and their resolution — a resident ref resolves through the
 * arena, a transient ref resolves through the descriptor the graph declared it
 * by. `submit/`'s `FrameResources` is where that resolution lives, because
 * resident resolution is the arena's and transient allocation is the executor's,
 * and neither is the graph's to perform.
 *
 * Imports only the handles, per §7 rule 1.
 */
import type { BufferHandle, TextureHandle, TransientId } from './handles.js';

/** A reference to a resource: either a resident one by its arena handle, or a
 * transient one by the id of the descriptor the graph declares it under. `H` is
 * the kind of resident handle, so a `BufferRef`'s resident arm cannot carry a
 * texture handle. */
export type Ref<H> = { resident: H } | { transient: TransientId };
export type BufferRef = Ref<BufferHandle>;
export type TextureRef = Ref<TextureHandle>;

/** How big a texture is, relative to the frame or fixed. `{ scale: 1 }` is a
 * frame-sized target following every resize, `{ scale: 0.5 }` a half-resolution
 * one; a fixed pair is a size that does not follow the frame. This replaces the
 * old `Extent = number | 'frame'`, which could not say half-resolution.
 *
 * It types a transient's size and, since item 71, a resident `TextureResource`'s
 * too: one whole-size descriptor rather than a per-axis pair, so the rule for how
 * a size resolves against a frame lives in one place — `sizeAt` below. */
export type TransientSize = { scale: number } | { width: number; height: number };

/** A size resolved to concrete pixels at a given frame. A `{ scale }` size
 * follows the frame — `{ scale: 1 }` is the frame's own size, `{ scale: 0.5 }`
 * half of it, rounded — and a `{ width, height }` size is those numbers whatever
 * the frame does. This is the one place a size becomes pixels, so a resident
 * texture and a transient resolve identically. Rounding, rather than floor or
 * ceil, so a half-resolution target of an odd dimension lands on the nearer
 * pixel; every size the tree carries today is either the frame's own or an even
 * fixed pair, so the choice is unobservable until a non-integer scale is authored. */
export function sizeAt(
  size: TransientSize,
  frame: { width: number; height: number }
): { width: number; height: number } {
  if ('scale' in size) {
    return { width: Math.round(frame.width * size.scale), height: Math.round(frame.height * size.scale) };
  }
  return { width: size.width, height: size.height };
}

/** Whether a size follows the frame, which is what makes a texture carrying
 * contents a contradiction: the contents arrive once and a frame-following
 * texture is thrown away and remade on every resize. */
export function followsFrame(size: TransientSize): boolean {
  return 'scale' in size;
}

/** A stable string naming a size, so two sizes hash together exactly when they
 * name one shape. `scale`-based and fixed sizes never collide because one carries
 * the word `scale` and the other an `x`. */
export function sizeKey(size: TransientSize): string {
  return 'scale' in size ? `scale${size.scale}` : `${size.width}x${size.height}`;
}

/** How many workgroups cover a pixel size in whole blocks of a compute pipeline's
 * own `@workgroup_size`. This is the producer's half of item 72: the count a
 * compute pass runs is worked out here, from a size a producer has, rather than
 * by the backend at draw time from the frame size. An edge that does not divide
 * by the block size is covered by a block running past it (`ceil`) rather than
 * left unwritten, and the third axis is one, since a picture is covered in two.
 *
 * It is the compute sibling of `sizeAt`: `sizeAt` resolves a size to pixels, this
 * turns those pixels into the `[n, n, n]` a `ComputePassSpec.groups` carries. A
 * producer covering the whole frame passes `sizeAt({ scale: 1 }, frame)`; one
 * covering a texture of its own passes that texture's resolved size. */
export function groupsToCover(
  pixels: { width: number; height: number },
  workgroup: readonly [number, number, number]
): [number, number, number] {
  return [Math.ceil(pixels.width / workgroup[0]), Math.ceil(pixels.height / workgroup[1]), 1];
}

/** A resource declared inside the graph by descriptor rather than allocated
 * through the arena, so `submit/` owns its whole life — one frame, or pooled
 * across frames once item 18 lands. A depth target is a texture transient with
 * `use: ['attachment']`; a scratch storage buffer is a buffer transient.
 *
 * The vocabulary — `use` on a texture, `access` on a buffer — is the same the
 * resident `TextureResource`/`BufferResource` carry, so a transient and a
 * resident describe the same facts about a resource and differ only in who owns
 * its allocation. */
export type Transient =
  | {
      kind: 'texture';
      size: TransientSize;
      format: GPUTextureFormat;
      use: ('storage' | 'sample' | 'attachment')[];
      samples?: 1 | 4;
      mips?: number | 'full';
    }
  | { kind: 'buffer'; bytes: number; access: 'read' | 'read-write' };

/** Whether a ref names a resident resource, which is the question `FrameResources`
 * answers by reaching the arena rather than the transient descriptors. */
export function isResident<H>(ref: Ref<H>): ref is { resident: H } {
  return 'resident' in ref;
}

/** Whether a ref names a transient the graph declares, resolved by descriptor
 * rather than by handle. */
export function isTransient<H>(ref: Ref<H>): ref is { transient: TransientId } {
  return 'transient' in ref;
}
