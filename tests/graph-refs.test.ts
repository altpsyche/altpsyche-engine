import { describe, expect, it } from 'vitest';
import { Arena, type Handle } from '../resource/arena';
import { FrameResources } from '../submit/frame-resources';
import { isResident, isTransient, type BufferRef, type TextureRef, type Transient } from '../graph/refs';
import type { BufferHandle, TransientId } from '../graph/handles';

/**
 * `Ref`'s two arms, per [RoadToPureEngine.md](../docs/RoadToPureEngine.md) §8 and
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
    const resources = new FrameResources<string>(arena, transients, (descriptor) => {
      made.push(descriptor);
      return `${descriptor.kind}-${made.length}`;
    });

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
    const resources = new FrameResources<string>(arena, [], () => 'unused');
    expect(() => resources.resolve(stale)).toThrow(/no live resource/);
  });
});
