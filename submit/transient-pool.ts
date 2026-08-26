/**
 * The pool a transient is drawn from and returned to, which is what lets one
 * allocation serve many frames rather than one — RoadToPureEngine.md
 * §8's pooling and aliasing, ROADMAP item 18.
 *
 * A transient's whole life is `submit/`'s (item 17): the graph declares it by
 * descriptor, `FrameResources` allocates it, and at the end of the frame it is
 * done with. Item 17 threw that allocation away when the frame ended, so a
 * depth target the toy tier asks for on every frame was made and disposed sixty
 * times a second. This is where that stops: a resource `FrameResources`
 * finishes with is **released** back to the pool rather than disposed, and the
 * next frame asking for the same shape **acquires** it rather than making a new
 * one.
 *
 * The pool holds only the resources no frame currently holds, keyed by shape.
 * A frame acquires a resource — which takes it out of the pool — uses it, and
 * releases it back when it recycles. So two transients of one shape that are
 * live in the same frame acquire two distinct resources (the second finds the
 * pool empty of that shape and makes one), and never collide; a resource is
 * only ever reused once its previous holder has released it. That is the safe
 * form of aliasing: reuse across the time a shape is free, never across two
 * refs that need it at once.
 *
 * The reuse it gives is across frames — frame N's depth target becomes frame
 * N+1's, the same physical resource aliased along the time axis. Aliasing two
 * *distinct* transients of one shape *within* one frame, where their passes
 * never overlap, needs per-pass lifetimes that `FrameResources` does not yet
 * carry (the backends do not consume `Ref` until they resolve passes, item 17's
 * scope note); it is a strict refinement of this and changes no caller when it
 * lands, because a within-frame release is the same `release` this already
 * exposes.
 *
 * `make` and `disposeOf` are injected, so the pool touches no device: a backend
 * hands in the real create and destroy calls, a test hands in stand-ins. It is
 * generic over what it holds for the same reason the arena is (`resource/`): the
 * two backends allocate different things by different calls.
 *
 * No bound is asserted on how many free resources of one shape the pool keeps,
 * because a graph's transient shapes are few and fixed by its structure — a
 * depth target, a ping-pong pair — not grown per keystroke the way the pipeline
 * cache's structures are (item 63). A pool whose shapes could grow without end
 * would want the eviction item 63 gives that cache; this one's do not.
 */
import type { Transient } from '../graph/refs.js';
import { sizeKey } from '../graph/refs.js';

/** A stable string naming a transient's shape, so two descriptors that ask for
 * the same resource — same size, format, use, samples, mips for a texture;
 * same bytes and access for a buffer — hash together and share the pool's bin.
 * `use` is sorted so two graphs listing the same uses in a different order are
 * one shape, and the optional fields are given their defaults so an omitted
 * `samples` and an explicit `samples: 1` are not two shapes. */
export function shapeKey(descriptor: Transient): string {
  if (descriptor.kind === 'buffer') {
    return `buffer:${descriptor.bytes}:${descriptor.access}`;
  }
  const size = sizeKey(descriptor.size);
  const use = [...descriptor.use].sort().join('+');
  const samples = descriptor.samples ?? 1;
  const mips = descriptor.mips ?? 1;
  return `texture:${size}:${descriptor.format}:${use}:${samples}:${mips}`;
}

export class TransientPool<T> {
  /** The resources no frame holds, grouped by shape, each waiting to be acquired
   * again by the next frame asking for its shape. A shape absent here has no free
   * resource, so acquiring it makes one. */
  private readonly free = new Map<string, T[]>();

  constructor(
    /** How to turn a transient's descriptor into a device resource, run only
     * when no free resource of its shape is waiting. Injected so this touches no
     * device. The key is passed alongside so a maker can label what it built. */
    private readonly make: (descriptor: Transient, key: string) => T,
    /** How to dispose a resource the pool drops. Injected for the same reason
     * `make` is; unused until a bound is added (see the header), so a pool with
     * no disposer keeps everything it is handed. */
    private readonly disposeOf: (resource: T) => void = () => {}
  ) {}

  /** A resource of the descriptor's shape: a free one taken out of the pool if
   * one waits, or a freshly made one otherwise. What comes back is no longer the
   * pool's — the caller holds it until it releases it, so a second acquire of the
   * same shape in the same frame cannot resolve to it. */
  acquire(descriptor: Transient): T {
    const bin = this.free.get(shapeKey(descriptor));
    if (bin && bin.length > 0) return bin.pop() as T;
    return this.make(descriptor, shapeKey(descriptor));
  }

  /** Returns a resource to the pool under its descriptor's shape, so the next
   * frame asking for that shape acquires it rather than making a new one. The
   * descriptor is the same one the resource was acquired under: a caller that
   * released a resource under a shape it was not made for would hand a later
   * frame a resource of the wrong shape, which is why `FrameResources` releases
   * each resource under the descriptor it resolved it from. */
  release(descriptor: Transient, resource: T): void {
    const key = shapeKey(descriptor);
    const bin = this.free.get(key);
    if (bin) bin.push(resource);
    else this.free.set(key, [resource]);
  }

  /** Disposes every free resource and empties the pool, the one place the
   * injected `disposeOf` runs. A backend calls this when it tears its device
   * down, so the pool's held resources are released to the driver rather than
   * leaked. Resources a frame still holds are not here to dispose — they are the
   * frame's until it recycles them. */
  dispose(): void {
    for (const bin of this.free.values()) {
      for (const resource of bin) this.disposeOf(resource);
    }
    this.free.clear();
  }
}
