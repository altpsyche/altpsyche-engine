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
 * A transient is allocated once per `FrameResources` and cached against its id,
 * so two passes attaching one depth target resolve to one texture rather than
 * two. That is within-frame identity and nothing more; **pooling and aliasing a
 * transient across frames is item 18**, which is why the second frame's
 * allocation is not yet elided here. `make` is injected rather than reaching a
 * device, so this resolves without a card: a backend hands in a maker that
 * calls `device.createTexture`/`createBuffer`, and a test hands in one that
 * returns a stand-in.
 */
import type { Arena, Handle } from '../resource/arena.js';
import type { Ref, Transient } from '../graph/refs.js';
import type { TransientId } from '../graph/handles.js';
import { isResident } from '../graph/refs.js';

export class FrameResources<T> {
  /** What each transient id has already been allocated to this frame, so a
   * second ref to one transient resolves to the first allocation rather than a
   * fresh one. Keyed by the id's integer. */
  private readonly allocated = new Map<number, T>();

  constructor(
    /** The resident lifetime: a resident ref's handle names a resource here. */
    private readonly arena: Arena<T>,
    /** The descriptors the graph declared its transients by, indexed by id. */
    private readonly transients: readonly Transient[],
    /** How to turn a transient's descriptor into a device resource. Injected so
     * this touches no device: the backend passes the real create call and a
     * test passes a stand-in. */
    private readonly make: (descriptor: Transient, id: number) => T
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

  /** The resource a transient id names, allocated from its descriptor the first
   * time it is asked for and cached after. A ref to a transient the graph does
   * not declare is refused by its id rather than allocated from nothing. */
  private transient(id: TransientId): T {
    const index = id as number;
    const held = this.allocated.get(index);
    if (held !== undefined) return held;
    const descriptor = this.transients[index];
    if (descriptor === undefined) {
      throw new Error(`the frame was asked for transient ${index}, which it does not declare`);
    }
    const made = this.make(descriptor, index);
    this.allocated.set(index, made);
    return made;
  }
}
