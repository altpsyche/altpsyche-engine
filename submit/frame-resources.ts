/**
 * The resolution of a graph's refs, which is where `Ref`'s two arms
 * ([RoadToPureEngine.md](../docs/RoadToPureEngine.md) §8, item 17) meet the
 * lifetimes that own them.
 *
 * A resident ref resolves through the arena that allocated it — the resident
 * lifetime of §5, owned by `resource/`. A transient ref resolves through the
 * descriptor the graph declared it by, allocated here — the transient lifetime,
 * owned by `submit/`. That split is the whole reason resolution lives in
 * `submit/` and not in `graph/`: `graph/` carries the descriptors and imports
 * nothing (§7 rule 1), and turning a descriptor into a device resource is a
 * thing only a module holding the arena and the device can do.
 *
 * A transient is acquired once per `FrameResources` and cached against its id,
 * so two passes attaching one depth target resolve to one texture rather than
 * two. That is within-frame identity. Across frames, a transient is acquired
 * from and released back to a `TransientPool` (item 18) that outlives the frame:
 * the pool is where an allocation survives from one frame to the next, so a
 * depth target the toy tier asks for every frame is made once and reused, not
 * remade sixty times a second. The pool touches no device — its `make` is
 * injected — so this still resolves without a card: a backend hands the pool a
 * maker that calls `device.createTexture`/`createBuffer`, and a test hands one
 * that returns a stand-in.
 */
import type { Arena, Handle } from '../resource/arena.js';
import type { Ref, Transient } from '../graph/refs.js';
import type { TransientId } from '../graph/handles.js';
import { isResident } from '../graph/refs.js';
import type { TransientPool } from './transient-pool.js';

export class FrameResources<T> {
  /** What each transient id has already been acquired to this frame, so a
   * second ref to one transient resolves to the first acquisition rather than a
   * fresh one, and so `recycle` knows what to hand back. Keyed by the id's
   * integer. */
  private readonly allocated = new Map<number, T>();

  constructor(
    /** The resident lifetime: a resident ref's handle names a resource here. */
    private readonly arena: Arena<T>,
    /** The descriptors the graph declared its transients by, indexed by id. */
    private readonly transients: readonly Transient[],
    /** The pool a transient is acquired from and released back to, so an
     * allocation survives between frames. It, not this, holds the injected
     * `make`, because reuse is a fact that spans frames and this object is one
     * frame's. */
    private readonly pool: TransientPool<T>
  ) {}

  /** The resource a ref names: the arena's for a resident ref, the transient's
   * descriptor allocated for a transient one. */
  resolve(ref: Ref<number>): T {
    if (isResident(ref)) {
      // A resident ref carries an authoring handle (`graph/handles`), which is
      // the same integer the arena minted the resource under; the authoring
      // brand and the arena's runtime brand unify in Stage 2 (item 16's row),
      // so this is the one seam between them until then.
      return this.arena.resolve(ref.resident as Handle);
    }
    return this.transient(ref.transient);
  }

  /** The resource a transient id names, acquired from the pool the first time it
   * is asked for and cached after. A ref to a transient the graph does not
   * declare is refused by its id rather than acquired from nothing. */
  private transient(id: TransientId): T {
    const index = id as number;
    const held = this.allocated.get(index);
    if (held !== undefined) return held;
    const descriptor = this.transients[index];
    if (descriptor === undefined) {
      throw new Error(`the frame was asked for transient ${index}, which it does not declare`);
    }
    const made = this.pool.acquire(descriptor);
    this.allocated.set(index, made);
    return made;
  }

  /** Hands every transient this frame acquired back to the pool, so the next
   * frame reuses them rather than making new ones. A backend calls this once the
   * frame's work is submitted and its transients are no longer read; the frame
   * holds nothing after, and asking it to resolve again would acquire afresh.
   * Each resource is released under the descriptor it was acquired from, so the
   * pool bins it by the right shape. Resident resources are untouched — they are
   * the arena's, and live across frames without passing through here. */
  recycle(): void {
    for (const [index, resource] of this.allocated) {
      this.pool.release(this.transients[index], resource);
    }
    this.allocated.clear();
  }
}
