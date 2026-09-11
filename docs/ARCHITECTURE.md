# Architecture

**Why read this.** You can feel every design in here from outside the package. It is why the
factories are asynchronous, why a resource is an integer and not a name, and why a frame that
cannot be drawn says so before anything starts. If you only want to use the package,
[README.md](../README.md) and [API.md](API.md) are enough. This is the layer under them.

---

## Declared entry points

Everything public comes from the package name through a door the manifest declares.
`package.json`'s `exports` is the list of them and `index.ts` is the first, so the files inside can
be rearranged without moving anything you import. **Nothing reaches around the list**: a subpath
that is not declared does not resolve, which is what makes the public shape a decision rather than
a consequence of where a file happens to sit.

A second door is declared only where `tests/import-graph.test.ts` can hold its closure to a module
that imports nothing, and **every name behind it is also exported by `index.ts`**. So a door is
never the only way to reach a name, and adding one changes no import line you already wrote. What a
second door buys is the closure: reaching `mat4` through the package name means loading the
renderer with it, which a bundler shakes back off and a browser loading the built files directly
does not.

The two backends load by **dynamic import**, which is why `createFrameRenderer` and
`createSurface` are asynchronous. A browser with no WebGPU never downloads the WebGPU backend.
That is worth an await: `gpu/webgpu.ts` is over 1,600 lines such a browser could never
execute.

## The layers

**The `imports` column is read off the tree rather than written** (item 7). Every edge below was
taken by walking the relative `import` and `export … from` specifiers of every `.ts` file in these
folders on 2026-09-11 and recording which folder each one crosses into. It is what the tree *does*,
not what it may: this column said "may import" until item 7 and three of its rows understated the
edges while two overstated them, so a reader checking a row against the tree found it false either
way. **A type-only edge is marked**, because it disappears at run time — nothing is emitted for it —
so it costs no download and cannot make a cycle at run time, but it is still a compile-time
dependency and a reader tracing one needs to know it is there.

| folder | owns | imports, as of 2026-09-11 |
| --- | --- | --- |
| `graph/` | the frame graph: types, handles, and the pure functions over them (`validate`, `cost`, `refusal`, `capability`) | **nothing** |
| `resource/` | the resident lifetime: `Arena`, and the on-demand translator chunk | `graph/` (types only) |
| `pipeline/` | the static lifetime: the pipeline cache, keyed on structure | `graph/` |
| `submit/` | the transient lifetime: planning and executing one frame | `graph/`, `resource/` (types only), `toy/` |
| `gpu/` | the two backends, the renderer, and backend selection | `graph/`, `pipeline/`, `resource/`, `submit/`, `toy/` |
| `declare/` | the frame declaration reader: `declaredFrame`, which turns a WGSL source and a `DeclaredFrame` into a graph and refuses the two where they disagree | `graph/`, `toy/`, the root modules |
| `toy/` | the toy tier: frame shortcuts, source reflection | `graph/`, the root modules |
| `scene/` | the scene tier: maths, scenes, materials, `sceneView` | `graph/`, `resource/` (types only) |
| `host/` | the browser-facing edges: `createSurface`, `probe` | `gpu/`, `graph/` (types only), `toy/` |
| `trace/` | the recording double and frame coverage | **nothing** |
| the root modules | `wgsl-layout.ts`, `wgsl-binding.ts`, `wgsl-references.ts`, `wgsl-pipelines.ts`, `shader-geometry.ts`, `deprecate.ts` — the WGSL reading a shader needs and the vertices a generated primitive is | `graph/` (types only) |
| `index.ts` | the door, which is a list of re-exports and no logic | every folder above but `pipeline/` and `submit/`, and the root modules |

**`declare/` is an authoring path and not a second kind of graph.** It returns the `FrameGraph` the
builders return, so `cost`, `validate`, `refusal` and both backends read one type however a frame was
written. It is its own folder rather than part of `graph/` for the reason the first row gives: it
reads WGSL, so it imports `wgsl-pipelines.ts`, `wgsl-binding.ts`, `wgsl-references.ts`,
`shader-geometry.ts` and `toy/frame.ts`, and `graph/` imports nothing. That rule decided the layout
here rather than a preference — the move was attempted into `graph/` first and the import-graph gate
refused it by name.

**Five rows of that table were wrong before item 7, four of them understating an edge.** `submit/`
was given `pipeline/` and imports none of it, while importing `toy/`, which was not listed — wrong in
both directions at once. `trace/` was given `graph/` and imports nothing at all. `scene/` reaches
`resource/` and `host/` reaches `graph/` and `toy/`, none of which the table allowed, and `toy/`
reaches two of the root modules the table had no row for. **The understated rows are the dangerous
kind**: a reader trusting one to say a folder is reachable from fewer places than it is will move
something and find out afterwards.

**`gpu/` read "everything below" and that was a description of the diagram rather than of the
tree.** It is spelled out now, and what it does *not* import is worth as much: it reaches no `scene/`
and no `host/`, which is what keeps a renderer usable without either.

**`graph/` importing nothing is the rule everything else rests on.** It is what keeps a
graph serialisable, comparable, and safe to post to a worker, and it is what lets `cost`,
`refusal` and `selectBackend` answer on a machine with no graphics card in it.
`tests/import-graph.test.ts` enforces the rule, so it is a gate and not an intention.

## Three lifetimes, kept apart

Three kinds of thing live for three different lengths of time. Fusing any two of them is
what makes a renderer painful to change: a shader you cannot recompile without reallocating
its buffers, or a buffer you cannot resize without rebuilding a pipeline. So each kind has
one owner.

- **Resident.** Buffers, textures, samplers and query sets. `Arena` allocates and frees them,
  addressed by a branded integer handle with a generation packed above the index. A handle
  handed out after a free never equals the one before it, so a stale handle is detectable
  instead of silently valid.
- **Static.** Shader modules, pipelines, layouts and bind groups. The pipeline cache owns
  them, keyed on structure, so two graphs describing the same pipeline share one.
- **Transient.** What lives for one frame: staging buffers and the frame target. `submit/`
  pools and aliases them.

`resource/` never compiles a pipeline. That is why the boundary holds.

**A fourth kind of thing is on this page and is not one of the three: the canvas.** It is the
caller's, handed in as a parameter to `createSurface` and `createFrameRenderer`, and it outlives
every renderer built over it. **So `dispose` frees the three above and does not touch it**, on
both backends, and a caller may build a second renderer or surface over a canvas it disposed one
on. [API.md](API.md) says it where a caller reads.

That is a rule this codebase learned by breaking it. WebGL 2's `dispose` called
`WEBGL_lose_context.loseContext()` until 2026-09-11, which destroyed the caller's context
unrecoverably — a canvas hands back the same context for as long as it exists, so the next
`getContext('webgl2')` returned the dead one and accepted draw calls while the picture stopped
moving — where the WebGPU backend called the reversible `context.unconfigure()`. One name on one
interface meant two different things, and the one a caller could not recover from was the
unannounced one. **The test for it is written as one pair of questions asked of both backends**
rather than as two backends' tests, because the property is the symmetry and a test per backend
is what let them drift.

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
