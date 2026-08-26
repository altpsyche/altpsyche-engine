# Architecture, as built

**Why read this.** You can feel every design in here from outside the package. It is why the
factories are asynchronous, why a resource is an integer and not a name, and why a frame that
cannot be drawn says so before anything starts. If you only want to use the package,
[README.md](../README.md) and [API.md](API.md) are enough. This is the layer under them.

It describes the library as it stands, checked against the tree. It is not a plan.

---

## One entry point

Everything public comes from the package name. `index.ts` is the only export surface and
nothing reaches around it, so the files inside can be rearranged without moving anything you
import.

The two backends load by **dynamic import**, which is why `createFrameRenderer` and
`createSurface` are asynchronous. A browser with no WebGPU never downloads the WebGPU backend.
That is worth an await: `gpu/webgpu.ts` is over 1,600 lines such a browser could never
execute.

## The layers

| folder | owns | may import |
| --- | --- | --- |
| `graph/` | the frame graph: types, handles, and the pure functions over them (`validate`, `cost`, `refusal`, `capability`) | **nothing** |
| `resource/` | the resident lifetime: `Arena`, and the on-demand translator chunk | `graph/` |
| `pipeline/` | the static lifetime: the pipeline cache, keyed on structure | `graph/` |
| `submit/` | the transient lifetime: planning and executing one frame | `graph/`, `resource/`, `pipeline/` |
| `gpu/` | the two backends, the renderer, and backend selection | everything below |
| `toy/` | the toy tier: frame shortcuts, source reflection | `graph/` |
| `scene/` | the scene tier: maths, scenes, materials, `sceneView` | `graph/` |
| `host/` | the browser-facing edges: `createSurface`, `probe` | `gpu/` |
| `trace/` | the recording double and frame coverage | `graph/` |

**`graph/` importing nothing is the rule everything else rests on.** It is what keeps a
graph serialisable, comparable, and safe to post to a worker, and it is what lets `cost`,
`refusal` and `selectBackend` answer on a machine with no graphics card in it.
`tests/import-graph.test.ts` enforces the rule, so it is a gate and not an intention.

## Three lifetimes, kept apart

The mistake this design avoids is fusing them, which is what the old `ShaderProgram` did. It
held three lifetimes in one object, so recompiling a shader meant reallocating its buffers.
0.3.0 took it apart into the three below.

- **Resident.** Buffers, textures, samplers and query sets. `Arena` allocates and frees them,
  addressed by a branded integer handle with a generation packed above the index. A handle
  handed out after a free never equals the one before it, so a stale handle is detectable
  instead of silently valid.
- **Static.** Shader modules, pipelines, layouts and bind groups. The pipeline cache owns
  them, keyed on structure, so two graphs describing the same pipeline share one.
- **Transient.** What lives for one frame: staging buffers and the frame target. `submit/`
  pools and aliases them.

`resource/` never compiles a pipeline. That is why the boundary holds.

## Handles, not names

Every resource in a graph is a kind-branded integer, its index in the graph's own resource
list. `uniform(0)`, `texture(2)` and `vertices(1)` mint them.

Two consequences are worth stating. Passing a texture where a buffer belongs is a **compile
error** and not a map lookup that returns `undefined` at draw time. And nothing on the draw
path does a string lookup at all: both backends resolve by index, with no `Map<string, …>`
left on either build path.

A graph's handle is an **authoring** handle and not the arena's runtime one. A graph is built
before any device exists, while an arena handle is minted at allocation and carries a
generation. One place casts between them.

## Capabilities are data

**A method one backend has to throw from is the wrong method.** That sentence sits at the top
of `graph/types.ts` and it is the best rule in the codebase.

So a graph *declares* the capabilities it needs, a device *reports* the ones it has, and
`refusal(graph, device)` reads both and names what is missing, before anything reaches a
driver. There are eleven capability names and both backends answer honestly about all of them.
Neither has a method the other throws from.

Selection happens first. `selectBackend` reads the language a graph is authored in and what
the device offers, and a refusal appears only when nothing is left. See
[GUIDE-backends.md](GUIDE-backends.md).

## The four invariants

1. **A method one backend has to throw from is the wrong method.** Capabilities are data.
   This is the invariant broken by accident most often, and it goes the moment a backend is
   handed a job it has to decline at call time, when the graph could have been refused by name.
2. **A description is data, and the build is one producer of it.** As soon as something can
   only come from the build, or only from a running page, the seam is gone.
3. **One fact, one home.** A disagreement stops the build before it reaches a graphics card.
4. **Every capability has a preset some gate draws and a trace nothing else asserts.** A
   capability whose only proof is that the picture still looks right is one nobody can
   maintain.

## How it is verified

Four things hold the package. A node suite covers the pure layers. A packaging check
installs the built artefact and imports it with plain node. A set of browser gates draws the
whole preset corpus through **both** backends and compares the calls each one makes. And a
hardware gate reads a real graphics card.

What each of those can and cannot see is written up for contributors in
[CONTRIBUTING.md](../CONTRIBUTING.md), and the difference matters: a software renderer's pixel
count is not a graphics card's.
