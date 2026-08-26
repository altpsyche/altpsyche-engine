# Architecture, as built

**What this document is.** How the library is actually put together, verified against the tree
rather than remembered. It is the only description of what exists: the two design documents this
codebase was built against were deleted on 2026-08-26, having gone stale about the code as well
as about direction.

**What this document is not.** It is not a plan and it queues nothing. It describes the library
as it stands; what it should become is decided in the open, not written down here in advance.

---

## One door

Everything public comes from the package name. `index.ts` is the only export surface, and nothing
reaches around it — so the files inside can be rearranged without moving anything a consumer
imports.

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

The original design document stated five. Four are still the design; one left with the website:

1. ~~Code is 1:1 with the shader page~~ — **a website rule, not a library one.** It welded
   together three separate things: a scope call, a content rule about article text, and a size
   cap derived on top of both. The cap lost its premise when the library and the article corpus
   stopped being one artifact. An engine's entire value is code you do not read.
2. **A method one backend has to throw from is the wrong method.** Capability lives in the
   data. Still the rule, and still the one most likely to be broken by accident — it was
   broken and repaired twice in one day at items 92 and 97.
3. **A description is data, and the build is one producer of it.** The moment something can
   only be produced by the build, or only at run time, the seam is gone.
4. **One fact, one home**, and a disagreement stops the build rather than reaching the card.
5. **Every capability has a preset a gate draws and a trace nothing else asserts.** A
   capability whose only proof is that the picture still looks right is one nobody can
   maintain.

## How it is verified

The package is held by a node suite over its pure layers, a packaging check that installs the
built artefact and imports it with plain node, a set of browser gates that draw the whole preset
corpus through **both** backends and compare the calls each makes, and a hardware gate that reads
a real graphics card.

What each of those can and cannot see — and it matters, because a software renderer's pixel count
is not a card's — is written up for contributors in [CONTRIBUTING.md](../CONTRIBUTING.md).
