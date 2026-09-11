/**
 * `Capability`: the optional pieces of a card's power a graph may depend on,
 * given a name so the dependency lives in data rather than in a method a backend
 * throws from, per RoadToPureEngine.md §10 and §17
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
 * **The two blend names arrived with item 11**, when the WebGL 2 backend learned to
 * apply the blend a pipeline's `targets` name. It could always have done so —
 * `blendFuncSeparate`, `blendEquationSeparate` and `blendColor` are core WebGL 2 —
 * and it simply never called them, so a pipeline naming a blend drew one picture on
 * one backend and another on the other, with no refusal anywhere. Applying the blend
 * closes almost all of that; these two name what is left, because two corners of
 * `GPUBlendState` have no WebGL 2 form at all.
 *
 * **`dual-source-blend`** is the `src1` family of factors — `src1`,
 * `one-minus-src1`, `src1-alpha`, `one-minus-src1-alpha` — which blend against a
 * fragment stage's *second* output. WebGPU gates them behind its own optional
 * `dual-source-blending` feature and GLSL ES 3.00 has no second output to blend
 * against, so this is optional on WebGPU and absent from WebGL 2.
 *
 * **`per-target-blend`** is a pass whose several colour targets name *different*
 * blends. WebGPU carries one `GPUBlendState` per entry of `targets`; WebGL 2 has one
 * blend state for every draw buffer at once, and `blendFunci` is a GL 4.0 call ES 3.0
 * does not have. So it is core on WebGPU and absent from WebGL 2. A pass whose
 * targets all name the *same* blend needs none of this and draws on both.
 *
 * **Both are read from the data rather than declared**, the way the write arm of
 * `storage-buffer` is: a pipeline naming a `src1` factor needs the first whatever it
 * wrote in `requires`, and one naming two different blends needs the second. A caller
 * who has to remember to declare a capability is one who will forget, and what comes
 * back then is a wrong picture rather than a refusal.
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
  | 'bgra-storage'
  | 'dual-source-blend'
  | 'per-target-blend';
