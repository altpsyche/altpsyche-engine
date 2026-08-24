/**
 * The arena: the resident lifetime of [RoadToPureEngine.md](../docs/RoadToPureEngine.md) §5,
 * addressed by branded integer handle.
 *
 * Buffers, textures, samplers and query sets are what a backend allocates that
 * outlives neither a compilation (that is the static lifetime, and it is the
 * pipeline cache's) nor a single frame (that is the transient lifetime, and it
 * is `submit/`'s). Everything in between is allocated here and freed here, so a
 * backend never holds a raw create-and-destroy pair of its own: the create runs
 * inside `allocate`, the destroy runs inside `free`, and what a backend keeps is
 * the handle in between.
 *
 * A handle is a branded integer rather than the resource itself, which is what
 * lets a freed slot be reused without a handle to the old occupant resolving to
 * the new one. The slot's generation is multiplied into the handle above its
 * index, so the handle a slot is handed out under after a free never equals the
 * one it was handed out under before it, and a stale handle is detectable rather
 * than silently valid — the mistake [RoadToPureEngine.md](../docs/RoadToPureEngine.md)
 * §5 names as fusing the three lifetimes.
 *
 * It is generic over what it holds, and told how to dispose of one, because the
 * two backends allocate different things by different calls: WebGPU destroys a
 * buffer through the object, WebGL 2 deletes one through the context. One arena
 * per backend, each instantiated with its own disposer, is what keeps that
 * difference out of here.
 */

/** The brand that stops a plain number being passed where a handle is wanted and
 * a handle's arithmetic being done by anyone but the arena. It is erased at
 * runtime — a handle is a number — and exists only so the compiler refuses a
 * value the arena did not mint. */
declare const HANDLE: unique symbol;

/** A branded integer naming one live resource in an arena. */
export type Handle = number & { readonly [HANDLE]: true };

/** How many slots a handle's index addresses, which is also the multiplier the
 * generation sits above. Index below, generation above, packed by multiplication
 * rather than by bit-shifting so both halves stay inside a safe integer: a
 * bitwise pack is capped at the 31 bits that stay positive, where this carries an
 * index up to 2^24 and a generation up to 2^29 before the product leaves the
 * safe-integer range. One slot reused every frame at sixty frames a second would
 * take about a hundred days to reach that, so the generation is treated as not
 * wrapping in any session that ends. */
const SLOTS = 0x100_0000;

export class Arena<T> {
  /** What each slot holds, or `undefined` for a slot that is free. */
  private readonly resources: (T | undefined)[] = [];
  /** How many times each slot has been handed out, which is what a handle carries
   * above its index and what tells a live handle from a stale one. */
  private readonly generations: number[] = [];
  /** The slots a free returned, reused before a fresh one is grown so the table
   * stays as small as the live set rather than as large as every allocation. */
  private readonly freeList: number[] = [];
  /** Uploads queued against a live handle, waiting for the frame that reads them
   * to be flushed. Ordered: the frame plays them back in the order they were
   * queued, so an upload a later pass reads cannot land after the pass. */
  private readonly pending: { handle: Handle; run: (resource: T) => void }[] = [];

  constructor(private readonly disposeOf: (resource: T) => void) {}

  /** Runs `make`, stores what it returns in a slot, and hands back the handle that
   * slot is live under. A slot a free returned is reused where there is one and a
   * fresh slot is grown otherwise, and the generation multiplied into the handle
   * is what makes a reused slot's handle differ from the one it carried before.
   *
   * `make` runs before a slot is taken, so a create that throws leaves no slot
   * half-allocated behind it. */
  allocate(make: () => T): Handle {
    const resource = make();
    let index: number;
    if (this.freeList.length > 0) {
      index = this.freeList.pop() as number;
    } else {
      index = this.resources.length;
      this.resources.push(undefined);
      this.generations.push(0);
    }
    this.resources[index] = resource;
    return (this.generations[index] * SLOTS + index) as Handle;
  }

  /** The resource a live handle names. A handle whose slot has been freed, or
   * handed out again under a later generation, is refused here rather than
   * resolving to whatever now sits in the slot. */
  resolve(handle: Handle): T {
    const index = handle % SLOTS;
    const generation = (handle - index) / SLOTS;
    const held = this.resources[index];
    if (held === undefined || this.generations[index] !== generation) {
      throw new Error(`the arena was asked for handle ${handle}, which names no live resource`);
    }
    return held;
  }

  /** Whether a handle still names the resource it was handed out for, which is the
   * question `resolve` answers by throwing. Read rather than caught where a caller
   * would otherwise reach for a resource it is unsure is still there. */
  live(handle: Handle): boolean {
    const index = handle % SLOTS;
    const generation = (handle - index) / SLOTS;
    return this.resources[index] !== undefined && this.generations[index] === generation;
  }

  /** Queues an upload against a handle rather than running it at once, so the
   * write is ordered against the frame that reads it instead of landing whenever
   * a caller happened to reach the device. The handle is resolved at `flush`, not
   * here, so an upload queued against a resource a resize then frees is refused
   * when the frame plays it back rather than run against the slot's new occupant.
   * `flush` is what turns the queue into device work, in order. */
  upload(handle: Handle, run: (resource: T) => void): void {
    this.pending.push({ handle, run });
  }

  /** Plays every queued upload against the resource its handle names now, in the
   * order they were queued, then empties the queue. This is the point the frame
   * puts its writes in against the draw that reads them: a backend flushes before
   * it records the passes, so every queued write has landed before the first read
   * of it. A handle freed since it was queued is refused here — `resolve` throws —
   * rather than resolving to whatever now sits in the slot. */
  flush(): void {
    const queued = this.pending.splice(0);
    for (const { handle, run } of queued) run(this.resolve(handle));
  }

  /** Frees a handle and allocates its replacement in one call, which is what a
   * resource following the frame's size does on every resize: the old slot's
   * contents are gone with it and the new handle is what everything reads from
   * now. The two halves are the same `free` and `allocate` a caller could run
   * itself, named together because a resize is one act. */
  resize(handle: Handle, make: () => T): Handle {
    this.free(handle);
    return this.allocate(make);
  }

  /** Disposes the resource a handle names and returns its slot to the free list,
   * bumping the slot's generation so the freed handle never resolves again and
   * never equals the handle the slot is reused under. Freeing a handle that is
   * already stale does nothing rather than disposing whatever now sits in the
   * slot, so a double free is harmless. */
  free(handle: Handle): void {
    const index = handle % SLOTS;
    const generation = (handle - index) / SLOTS;
    if (this.generations[index] !== generation) return;
    const held = this.resources[index];
    if (held !== undefined) this.disposeOf(held);
    this.resources[index] = undefined;
    this.generations[index] += 1;
    this.freeList.push(index);
  }
}
