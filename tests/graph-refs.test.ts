import { describe, expect, it } from 'vitest';
import { Arena, type Handle } from '../resource/arena';
import { FrameResources } from '../submit/frame-resources';
import { TransientPool, shapeKey } from '../submit/transient-pool';
import {
  groupsToCover,
  isResident,
  isTransient,
  sizeAt,
  type BufferRef,
  type TextureRef,
  type Transient,
} from '../graph/refs';
import type { BufferHandle, TransientId } from '../graph/handles';

/**
 * `Ref`'s two arms, per RoadToPureEngine.md §8 and
 * ROADMAP item 17: a graph declares a transient depth target and a resident mesh
 * buffer in one frame, and each resolves — the resident one through the arena
 * that allocated it, the transient one through the descriptor the graph carries.
 *
 * A string stands in for a device resource, the way the arena's own test uses
 * one: nothing here needs a real texture to show that a resident ref reaches the
 * arena and a transient ref reaches its descriptor.
 */

describe("Ref's two arms name a resident resource and a transient descriptor", () => {
  it('reads a resident ref as an arena handle and a transient ref as a declared descriptor', () => {
    const arena = new Arena<string>(() => undefined);
    // A resident ref carries the arena handle the resource was allocated under.
    // The producer mints the ref from that handle, which is why the authoring
    // brand meets the arena's here — the one seam item 16's row names.
    const mesh = arena.allocate(() => 'mesh-buffer');
    const meshRef: BufferRef = { resident: mesh as unknown as BufferHandle };

    // A transient ref carries the id of one of the graph's own descriptors.
    const depthRef: TextureRef = { transient: 0 as TransientId };

    expect(isResident(meshRef)).toBe(true);
    expect(isTransient(meshRef)).toBe(false);
    expect(isTransient(depthRef)).toBe(true);
    expect(isResident(depthRef)).toBe(false);
  });
});

describe('a graph declaring a transient depth target and a resident mesh buffer resolves each', () => {
  /** The graph fragment item 17 asks for: one transient — a frame-sized depth
   * target the graph declares by descriptor — and one resident mesh buffer,
   * allocated through the arena and named by handle. */
  function oneFrame() {
    const arena = new Arena<string>(() => undefined);
    const mesh = arena.allocate(() => 'mesh-buffer');
    const meshRef: BufferRef = { resident: mesh as unknown as BufferHandle };

    const transients: Transient[] = [
      { kind: 'texture', size: { scale: 1 }, format: 'depth24plus', use: ['attachment'] },
    ];
    const depthRef: TextureRef = { transient: 0 as TransientId };

    const made: Transient[] = [];
    const pool = new TransientPool<string>((descriptor) => {
      made.push(descriptor);
      return `${descriptor.kind}-${made.length}`;
    });
    const resources = new FrameResources<string>(arena, transients, pool);

    return { resources, meshRef, depthRef, transients, made };
  }

  it('resolves the resident mesh buffer through the arena', () => {
    const { resources, meshRef, made } = oneFrame();
    expect(resources.resolve(meshRef)).toBe('mesh-buffer');
    // The arena's resource, not an allocation from a descriptor: `make` never ran.
    expect(made).toEqual([]);
  });

  it('resolves the transient depth target by allocating from its descriptor', () => {
    const { resources, depthRef, transients, made } = oneFrame();
    expect(resources.resolve(depthRef)).toBe('texture-1');
    expect(made).toEqual([transients[0]]);
  });

  it('resolves both in one frame, each by its own arm', () => {
    const { resources, meshRef, depthRef } = oneFrame();
    expect(resources.resolve(meshRef)).toBe('mesh-buffer');
    expect(resources.resolve(depthRef)).toBe('texture-1');
  });

  it('resolves one transient to one allocation, however many refs read it', () => {
    const { resources, depthRef, made } = oneFrame();
    const first = resources.resolve(depthRef);
    const second = resources.resolve(depthRef);
    expect(second).toBe(first);
    // Allocated once, not per read — the within-frame identity two passes over
    // one depth target need. Cross-frame pooling is item 18.
    expect(made).toHaveLength(1);
  });

  it('refuses a transient ref the graph does not declare, by its id', () => {
    const { resources } = oneFrame();
    const missing: TextureRef = { transient: 3 as TransientId };
    expect(() => resources.resolve(missing)).toThrow(/transient 3, which it does not declare/);
  });

  it('refuses a resident ref whose handle the arena has freed', () => {
    const arena = new Arena<string>(() => undefined);
    const handle = arena.allocate(() => 'gone');
    arena.free(handle);
    const stale: BufferRef = { resident: handle as unknown as BufferHandle };
    const resources = new FrameResources<string>(arena, [], new TransientPool<string>(() => 'unused'));
    expect(() => resources.resolve(stale)).toThrow(/no live resource/);
  });
});

/**
 * ROADMAP item 18: a transient survives the frame it was made in. Two frames
 * asking for one shape share one allocation, and the second frame makes nothing
 * new — the pooling of RoadToPureEngine.md §8. A
 * fresh count-only maker stands in for the device, the way the arena's own test
 * uses a string: the fact under test is that `make` runs once, not twice.
 */
describe('a transient shape pooled across frames is allocated once, not once per frame', () => {
  const depth: Transient = { kind: 'texture', size: { scale: 1 }, format: 'depth24plus', use: ['attachment'] };
  const depthRef: TextureRef = { transient: 0 as TransientId };

  /** A pool whose maker labels each resource by the order it was made, so the
   * name says how many allocations have happened and a reuse is visible as a
   * repeated name. */
  function countingPool() {
    let made = 0;
    const pool = new TransientPool<string>((descriptor) => `${descriptor.kind}-${++made}`);
    return { pool, count: () => made };
  }

  it('reuses one allocation for the same shape a second frame asks for', () => {
    const arena = new Arena<string>(() => undefined);
    const { pool, count } = countingPool();

    const frameOne = new FrameResources<string>(arena, [depth], pool);
    const first = frameOne.resolve(depthRef);
    expect(count()).toBe(1);
    // The frame is done with its transients: it hands them back to the pool.
    frameOne.recycle();

    const frameTwo = new FrameResources<string>(arena, [depth], pool);
    const second = frameTwo.resolve(depthRef);

    // The second frame allocated nothing new — the count did not move — and it
    // got the very resource the first frame released.
    expect(count()).toBe(1);
    expect(second).toBe(first);
  });

  it('gives two distinct resources to two shape-identical transients live in one frame', () => {
    const arena = new Arena<string>(() => undefined);
    const { pool, count } = countingPool();

    // One graph declaring the same shape twice: two depth targets read in the
    // same frame cannot be the same physical resource, so aliasing must not
    // collapse them.
    const resources = new FrameResources<string>(arena, [depth, depth], pool);
    const a = resources.resolve({ transient: 0 as TransientId });
    const b = resources.resolve({ transient: 1 as TransientId });

    expect(a).not.toBe(b);
    expect(count()).toBe(2);
  });

  it('does not reuse across shapes: a differing descriptor makes its own', () => {
    const arena = new Arena<string>(() => undefined);
    const { pool, count } = countingPool();
    const halfDepth: Transient = { kind: 'texture', size: { scale: 0.5 }, format: 'depth24plus', use: ['attachment'] };

    const frameOne = new FrameResources<string>(arena, [depth], pool);
    frameOne.resolve(depthRef);
    frameOne.recycle();

    // A half-resolution target is a different shape; the freed full-size one is
    // no use to it, so it makes its own.
    const frameTwo = new FrameResources<string>(arena, [halfDepth], pool);
    frameTwo.resolve({ transient: 0 as TransientId });
    expect(count()).toBe(2);
  });
});

/**
 * `shapeKey` decides what "the same shape" means, and the pooling above rests on
 * it: two descriptors that name one resource must key together, two that name
 * different resources must not.
 */
describe('shapeKey keys two descriptors together exactly when they name one resource', () => {
  it('keys use-lists that differ only in order together', () => {
    const a: Transient = { kind: 'texture', size: { scale: 1 }, format: 'rgba8unorm', use: ['sample', 'attachment'] };
    const b: Transient = { kind: 'texture', size: { scale: 1 }, format: 'rgba8unorm', use: ['attachment', 'sample'] };
    expect(shapeKey(a)).toBe(shapeKey(b));
  });

  it('keys an omitted optional and its default together', () => {
    const omitted: Transient = { kind: 'texture', size: { scale: 1 }, format: 'rgba8unorm', use: ['attachment'] };
    const explicit: Transient = { kind: 'texture', size: { scale: 1 }, format: 'rgba8unorm', use: ['attachment'], samples: 1 };
    expect(shapeKey(omitted)).toBe(shapeKey(explicit));
  });

  it('keys differing size, format, samples and buffer access apart', () => {
    const base: Transient = { kind: 'texture', size: { scale: 1 }, format: 'rgba8unorm', use: ['attachment'] };
    const half: Transient = { ...base, size: { scale: 0.5 } };
    const other: Transient = { ...base, format: 'depth24plus' };
    const multisampled: Transient = { ...base, samples: 4 };
    const read: Transient = { kind: 'buffer', bytes: 256, access: 'read' };
    const write: Transient = { kind: 'buffer', bytes: 256, access: 'read-write' };

    const keys = [base, half, other, multisampled, read, write].map(shapeKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

/**
 * `sizeAt` is the one place a `TransientSize` becomes pixels, so a resident
 * `TextureResource` and a transient resolve identically (ROADMAP item 71). This
 * pins the expressiveness the old `Extent = number | 'frame'` pair could not
 * reach: a `{ scale: 0.5 }` size is half the frame on each axis.
 */
describe('a size resolves to pixels against the frame', () => {
  const FRAME = { width: 800, height: 600 };

  it('resolves a half-resolution transient to half the frame on each axis', () => {
    expect(sizeAt({ scale: 0.5 }, FRAME)).toEqual({ width: 400, height: 300 });
  });

  it('resolves a frame-sized transient to the frame itself', () => {
    expect(sizeAt({ scale: 1 }, FRAME)).toEqual({ width: 800, height: 600 });
  });

  it('leaves a fixed size untouched whatever the frame is', () => {
    expect(sizeAt({ width: 64, height: 64 }, FRAME)).toEqual({ width: 64, height: 64 });
  });

  it('rounds a scale that does not divide the frame evenly to the nearer pixel', () => {
    expect(sizeAt({ scale: 0.5 }, { width: 101, height: 99 })).toEqual({ width: 51, height: 50 });
  });
});

/**
 * `groupsToCover`, the producer's half of item 72: the group count a compute pass
 * runs is worked out here from a pixel size, in whole blocks of a pipeline's
 * `@workgroup_size`, rather than by the backend at draw time from the frame size.
 * An edge that does not divide by the block is covered by a block running past it.
 */
describe('a group count covers a pixel size in whole workgroups', () => {
  it('divides a size the workgroup fits exactly into that many blocks', () => {
    expect(groupsToCover({ width: 256, height: 256 }, [8, 8, 1])).toEqual([32, 32, 1]);
  });

  it('covers the corpus frame in the blocks the corpus fixtures carry', () => {
    expect(groupsToCover({ width: 800, height: 600 }, [8, 8, 1])).toEqual([100, 75, 1]);
  });

  it('rounds an edge the workgroup does not divide up rather than leaving it unwritten', () => {
    // 801 over 8 is 100.125, so a hundred-and-first block runs past the edge; 60
    // over 8 is 7.5, rounded up to eight — the case the backend used to compute.
    expect(groupsToCover({ width: 801, height: 600 }, [8, 8, 1])).toEqual([101, 75, 1]);
    expect(groupsToCover({ width: 100, height: 60 }, [8, 8, 1])).toEqual([13, 8, 1]);
  });

  it('reads each axis against its own workgroup extent, and the third is one', () => {
    expect(groupsToCover({ width: 64, height: 64 }, [16, 8, 1])).toEqual([4, 8, 1]);
  });
});
