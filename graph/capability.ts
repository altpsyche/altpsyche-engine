/**
 * `Capability`: the optional pieces of a card's power a graph may depend on,
 * given a name so the dependency lives in data rather than in a method a backend
 * throws from, per [RoadToPureEngine.md](../docs/RoadToPureEngine.md) §10 and §17
 * decision 2 — "a method one backend has to throw from is the wrong method", the
 * best rule in the codebase, carried forward and given a type.
 *
 * A graph declares which of these it `requires`; a device reports which it has as
 * its `capabilities`; and `refusal(graph, device)` reads the two records and
 * names what is missing (item 24). Nothing here calls a card: a capability is a
 * fact about what a graph needs and what a device offers, so the whole of the
 * question is answerable from data on any machine.
 *
 * The names are the ones §10 lists, and the split behind them is the honest
 * WebGL 2 answer of §10: **WebGL 2 cannot do** `compute`, `storage-buffer`
 * as a read-write buffer, `storage-texture`, `indirect`, `timestamp` or
 * `occlusion`; **WebGPU adds** those to what both backends share. `msaa`,
 * `float-blend`, `depth-clamp` and `bgra-storage` are optional on either.
 *
 * `storage-buffer` splits into a read arm and a write arm because WebGL 2 has one
 * and not the other, and a single name could not tell selection which it was
 * (item 97). `storage-buffer` alone is the **read** arm: a read-only per-instance
 * record bound whole as a uniform block a shader indexes by `gl_InstanceID`, the
 * reduced scene tier of §17 decision 1, which WebGL 2 draws. `storage-buffer-readwrite`
 * is the **write** arm: a read-write buffer a compute or fragment stage fills,
 * which GLSL ES 3.00 has no syntax for and WebGL 2 does not have. The write arm
 * mirrors a buffer resource's own `access: 'read-write'`, so the capability a
 * graph needs is read from the data (the resource's access) rather than declared
 * by hand and left to drift — which is what moves the refusal for a read-write
 * buffer on WebGL 2 out of a backend throw and into `refusal()`, where §10 and §17
 * decision 2 say it belongs.
 *
 * Imports nothing, per §7 rule 1: `graph/` is types plus pure functions over
 * them, which is what keeps a graph serializable, comparable and sendable to a
 * worker.
 */

/** An optional piece of a device's power a graph may depend on. A graph names the
 * ones it needs and a device the ones it has; where a needed one is not had, the
 * graph is refused by that name rather than by a call that throws. */
export type Capability =
  | 'compute'
  | 'storage-buffer'
  | 'storage-buffer-readwrite'
  | 'storage-texture'
  | 'indirect'
  | 'timestamp'
  | 'occlusion'
  | 'msaa'
  | 'float-blend'
  | 'depth-clamp'
  | 'bgra-storage';
