# Architecture, as built

**What this document is.** How the library is actually put together, today, verified against
the tree rather than remembered. It replaces [ABSTRACTION.md](ABSTRACTION.md) and
[RENDERER-DESIGN.md](RENDERER-DESIGN.md) as the description of what exists — both of those
predate the split from the website and are now wrong about the code as well as about the
direction. They are kept, not deleted, because [RoadToPureEngine.md](RoadToPureEngine.md)
§1 quotes ABSTRACTION.md's first invariant to build its central argument, and a document
whose source has been deleted argues from nothing.

**What this document is not.** It is not direction — [RoadToPureEngine.md](RoadToPureEngine.md)
owns that. It is not the queue — [ROADMAP.md](ROADMAP.md) is the only thing that queues work.
It is not the register — [JOURNAL.md](JOURNAL.md) holds every call taken with nobody watching.
Nothing here queues anything.

---

## One door

Everything public comes from the package name. `index.ts` is the only export surface: **69
runtime names**, which is what `npm run gate:pack` asserts by installing the built package and
importing it with plain node, plus the type-only exports beside them, which are erased at
runtime and which no gate counts. Nothing reaches around it, so the files inside can be rearranged
without moving anything a consumer imports.

The two backends are reached by **dynamic import**, which is why `createFrameRenderer` and
`createSurface` are asynchronous. A browser with no WebGPU never downloads the WebGPU
backend. That is not a micro-optimisation: it is about 1,700 lines such a browser could
never execute.

## The layers

| folder | owns | may import |
| --- | --- | --- |
| `graph/` | the frame graph: types, handles, and pure functions over them — `validate`, `cost`, `refusal`, `capability` | **nothing** |
| `resource/` | the resident lifetime: `Arena`, and the on-demand translator chunk | `graph/` |
| `pipeline/` | the static lifetime: the pipeline cache, keyed on structure | `graph/` |
| `submit/` | the transient lifetime: planning and executing one frame | `graph/`, `resource/`, `pipeline/` |
| `gpu/` | the two backends, the renderer, and backend selection | everything below |
| `toy/` | the toy tier: frame shortcuts, source reflection | `graph/` |
| `scene/` | the scene tier: maths, scenes, materials, `sceneView` | `graph/` |
| `host/` | the browser-facing edges: `createSurface`, `probe` | `gpu/` |
| `trace/` | the recording double and frame coverage | `graph/` |

**`graph/` importing nothing is the load-bearing rule.** It is what keeps a graph
serialisable, comparable, and sendable to a worker — and what lets `cost`, `refusal` and
`selectBackend` answer on a machine with no card at all. `tests/import-graph.test.ts`
enforces it, so the rule is a gate rather than an intention.

## Three lifetimes, kept apart

The mistake this design exists to avoid is fusing them, which is what the old
`ShaderProgram` did — "three lifetimes in a trench coat", deleted at item 90.

- **Resident** — buffers, textures, samplers, query sets. Allocated and freed by `Arena`,
  addressed by a branded integer handle with a generation packed above the index, so a
  handle handed out after a free never equals the one before it and a stale handle is
  *detectable* rather than silently valid.
- **Static** — shader modules, pipelines, layouts, bind groups. Owned by the pipeline cache
  and keyed on structure, so two graphs describing the same pipeline share one.
- **Transient** — what lives for one frame: staging buffers, the frame target. Pooled and
  aliased by `submit/`.

`resource/` never compiles a pipeline, and that is why the boundary holds.

## Handles, not names

Every resource in a graph is a kind-branded integer — its index in the graph's own resource
list — rather than a string. `uniform(0)`, `texture(2)`, `vertices(1)` mint them.

Two consequences worth stating. Passing a texture where a buffer belongs is a **compile
error**, not a map lookup returning `undefined` at draw time. And nothing on the draw path
does a string lookup at all: the backends resolve by index, with no `Map<string, …>` left on
either build path.

The graph's handle is an **authoring** handle, not the arena's runtime one. A graph is a
pure value built before any device exists; an arena handle is minted at allocation and
carries a generation. The cast between them happens in one place.

## Capability lives in the data

**A method one backend has to throw from is the wrong method.** That sentence is written at
the top of `graph/types.ts` and it is the best rule in the codebase.

So a graph *declares* the capabilities it needs, a device *reports* the ones it has, and
`refusal(graph, device)` reads the two records and names what is missing — before anything
reaches a driver. Eleven capability names, and both backends answer honestly about all of
them. Neither grows a method the other throws from.

Selection comes before refusal: `selectBackend` reads the language a graph is authored in
and what the device offers, and only when nothing is left does a refusal appear. See
[GUIDE-backends.md](GUIDE-backends.md).

## What the invariants are now

`ABSTRACTION.md` stated five. Four are still the design and one left with the website:

1. ~~Code is 1:1 with the shader page~~ — **a website rule, not a library one.** It welded
   together a scope call, a content rule about article text, and a size cap derived on top
   of both. `RoadToPureEngine.md` §1 tells the three apart; the cap lost its premise when
   the library and the article corpus stopped being one artifact. An engine's entire value
   is code you do not read.
2. **A method one backend has to throw from is the wrong method.** Capability lives in the
   data. Still the rule, and still the one most likely to be broken by accident — it was
   broken and repaired twice in one day at items 92 and 97.
3. **A description is data and the build is one producer of it.** The moment something can
   only be produced by the build, or only at run time, the seam is gone.
4. **One fact, one home**, and a disagreement stops the build rather than reaching the card.
5. **Every capability has a preset a gate draws and a trace nothing else asserts.** A
   capability whose only proof is that the picture still looks right is one nobody can
   maintain.

## What proves any of it

| gate | cost | what it holds |
| --- | --- | --- |
| `npm test` | ~1s | 856 node tests over the pure layers, both backends against recording doubles |
| `npm run type-check` | seconds | |
| `npm run gate:pack` | seconds | the built package installs, plain node imports it, the door's name count is exact |
| `npm run gate:browser` | minutes | four gates in a real browser: the corpus on both backends, the trace contract, a live surface |
| `npm run gate:card` | a desktop session | the only gate that reads a real graphics card |

**What the cheap gates cannot see, stated plainly because it matters more than the green.**
Every headless browser launch on the development machine reaches SwiftShader, the software
renderer, whatever the flags say. So every pixel count this repository records is a software
renderer's. That the two backends agree is a real result about the translation and the draw
path; it is **not** a result about a card. The cross-backend three-number comparison on real
hardware has not been taken — it is queued, hardware-gated, and named as outstanding rather
than quietly assumed.

The node suite has a matching blind spot: for a change that rewrites resolution logic, the
tests are rewritten alongside the code they check, so only the browser batch's trace
agreement can catch an index-for-name mistake. That is not hypothetical — it is exactly how
item 87's defect was caught, by the one browser gate that fails loudly.
