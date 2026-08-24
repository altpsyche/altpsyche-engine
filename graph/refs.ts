/**
 * `Ref` and its two arms: the distinction that serves both tiers with one type,
 * per [RoadToPureEngine.md](../docs/RoadToPureEngine.md) §8.
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

/** How big a transient is, relative to the frame or fixed. `{ scale: 1 }` is a
 * frame-sized target following every resize, `{ scale: 0.5 }` a half-resolution
 * one; a fixed pair is a size that does not follow the frame. This replaces the
 * old `Extent = number | 'frame'`, which could not say half-resolution. */
export type TransientSize = { scale: number } | { width: number; height: number };

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
