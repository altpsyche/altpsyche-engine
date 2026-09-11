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
 * **There is no name here for a per-face stencil, and item 2's third step is why.**
 * The counting modes `count` and `nonzero` give the two faces of a triangle opposite
 * operations, which is the one thing the mask modes could not express, so the
 * question the step asked is the one this file exists to answer: is that a capability
 * some reachable device has not got? It is not, and the reason is categorical rather
 * than a survey. `GPUStencilFaceState` is a member of core `GPUDepthStencilState`,
 * gated behind no WebGPU feature, and `stencil8` is a core texture format — only
 * `depth32float-stencil8` is feature-gated. On the other side `stencilOpSeparate`,
 * `stencilFuncSeparate`, `INCR_WRAP` and `DECR_WRAP` are core WebGL, present since
 * WebGL 1 and not extensions, so they are on `WebGL2RenderingContext` itself: a
 * context either exists or it does not, and one that exists has them. There is
 * therefore no device that reports either backend and lacks per-face stencil, and a
 * `Capability` naming it would be a name nothing could ever be missing.
 *
 * That is a specification argument, and it was checked against a driver rather than
 * left as one: `core-count` counts a winding number on both backends and the card
 * gate reads them at 0 differing channels of 1,440,000 on nvidia / blackwell. **What
 * would change the answer** is a reachable device that offers a WebGL 2 context whose
 * separate stencil calls are absent or wrong — a driver bug rather than an optional
 * feature, which is the shape of thing `docs/DEVICES.md` collects rather than the
 * shape this type names. If one turns up, the name it takes is `per-face-stencil`
 * read off the data the way the blend pair is: a pipeline whose mode gives the two
 * faces different operations needs it, and `STENCIL_STATES` in `graph/types.ts` is
 * where that is already written down per mode.
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
