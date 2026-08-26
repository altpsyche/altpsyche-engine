# API

Every name `@altpsyche/engine` exports, grouped by what you are doing rather than by
which file it lives in. There is one import path and no second one:

```js
import { createSurface, submit, wgslFrame, probe, vec3, mat4 } from '@altpsyche/engine';
```

**69 runtime names**, which is the count `npm run gate:pack` asserts by installing the built
package and importing it with plain node. Type-only exports sit beside them and are erased at
runtime, so no gate counts those and this document deliberately does not claim a total: three
different parsers of `index.ts` gave three different answers, and a number no gate produced is
not one to publish.

**0.x is unstable.** Names and shapes change between releases without a major bump.
[RoadToPureEngine.md](RoadToPureEngine.md) §14 is the shape the surface is moving toward,
and where today's names differ from it, today's names are the ones that move.

---

## Getting something on the screen

| name | kind | what it does |
| --- | --- | --- |
| `createSurface` | value | a running loop on a canvas: draws, resizes, pauses, recovers a lost card |
| `Surface`, `SurfaceOptions` | type | what it returns and what it takes |
| `resolveDensity` | value | the device-pixel-ratio arithmetic a surface does, exposed so a caller can do it too |
| `createFrameRenderer` | value | one renderer, no loop — for drawing on your own schedule |
| `FrameRenderer`, `RendererOptions` | type | |
| `submit` | value | draw one frame through a renderer; `{ into }` says where it lands |
| `SubmitOptions` | type | |
| `requestWebGPUDevice` | value | ask for a WebGPU device directly, when you want the adapter yourself |
| `PROGRAM_CACHE_LIMIT` | value | how many built programs a renderer keeps before evicting |

Both factories are **asynchronous**, and that is the whole point: each backend is reached
by a dynamic import, so your bundler puts it in a file of its own and a browser downloads
only the one it can run.

## Describing a frame

A frame graph says what resources exist, what pipelines run, and in what order the passes
go. You hand that description to the renderer; you do not hand it a shader and hope.

**Shortcuts, for a single fragment shader over the whole canvas:**

| name | kind | what it does |
| --- | --- | --- |
| `wgslFrame` | value | one WGSL fragment shader, drawn fullscreen |
| `glslFrame` | value | the same for a GLSL vertex/fragment pair |
| `wgslDescription`, `glslDescription` | value | the long form: name the resources, pipelines and passes yourself |
| `assembleFrame`, `frameOf`, `glslFrameOf` | value | build a graph from a description plus fetched document texts |
| `documentNames`, `generatedResources` | value | what a description still needs before it can be drawn |
| `ONE_PASS`, `WGSL_DOCUMENT`, `WGSL_FRAGMENT_ENTRY` | value | the names the shortcuts use, exported so the long form can match them |

**The graph's own types**, from `graph/types`: `FrameGraph`, `WgslFrameGraph`,
`GlslFrameGraph`, `ModuleSpec`, `WgslModule`, `GlslModule`, `PipelineSpec`,
`RenderPipelineSpec`, `ComputePipelineSpec`, `PassSpec`, `RenderPassSpec`,
`ComputePassSpec`, `DrawSpec`, `BindingSpec`, `ResourceSpec`, `BufferResource`,
`TextureResource`, `SamplerResource`, `UniformResource`, `VertexResource`,
`IndexResource`, `UniformSlot`, `UniformValue`, `Groups`, `StencilMode`, `ShaderTarget`,
`Backend`, `BackendName`, `DeviceReport`, `TransientSize`.

**Reading a graph**, all pure: `isRenderPass`, `drawsCorners`, `drawsIndirectly`,
`groupsIndirectly`, `moduleOf`, `resourceOf`, `uniformResourceOf`, `perDrawBinding`,
`componentsOf`.

**Handles.** Every resource in a graph is addressed by a kind-branded integer rather than
a string, so passing a texture where a buffer belongs is a compile error rather than a map
miss. Mint them with `buffer`, `texture`, `sampler`, `uniform`, `vertices`, `indices`,
`moduleHandle`, `pipelineHandle`; the types are `BufferHandle`, `TextureHandle`,
`SamplerHandle`, `UniformHandle`, `VertexHandle`, `IndexHandle`, `ModuleHandle`,
`PipelineHandle` and the union `ResourceHandle`.

## Asking questions without touching a device

All four are pure functions over data, so they answer in a test, in a worker, or on a
machine with no card.

| name | kind | what it answers |
| --- | --- | --- |
| `probe` | value | what this browser actually offers, read once |
| `browserProbeHost`, `readingOf`, `readingRow` | value | the probe's host, its reading, and that reading as a table row |
| `ProbeFacts`, `ProbeTier`, `ProbeHost`, `BackendFacts`, `DeviceReading` | type | |
| `selectBackend` | value | which backend will draw this frame, or a refusal naming what was missing |
| `DeviceOffer`, `BackendSelection` | type | |
| `resolve`, `webgpuCapabilities`, `webgl2Capabilities` | value | the capability set each backend has on this device |
| `DeviceProfile`, `DeviceCapabilities`, `Capability` | type | |
| `refusal` | value | what the graph needs that the device has not got, by name |
| `cost` | value | bytes, draws and passes a graph costs at a given size, before a pixel is drawn |
| `FrameCost` | type | |

`Capability` is eleven names: `compute`, `storage-buffer`, `storage-buffer-readwrite`,
`storage-texture`, `indirect`, `timestamp`, `occlusion`, `msaa`, `float-blend`,
`depth-clamp`, `bgra-storage`. A graph declares which it needs; a device reports which it
has. See [GUIDE-backends.md](GUIDE-backends.md).

## Reflection, over the source rather than the built program

| name | kind | what it does |
| --- | --- | --- |
| `reflect` | value | what a shader source declares — uniforms, entry points, bindings |
| `missing` | value | which declared uniforms nothing in the source reads |
| `Uniform` | type | |
| `uniformBlockOf` | value | the uniform block layout a WGSL source implies |
| `uniformBindingOf` | value | where a uniform block binds |
| `namesReachedBy` | value | which declarations an entry point actually reaches |

These read the **source**, not a compiled program, so they work before a device exists and
give the same answer on both backends.

## The scene tier

| name | kind | what it does |
| --- | --- | --- |
| `sceneView` | value | a producer: a world and a list of cameras in, a `FrameGraph` out |
| `SceneView`, `SceneViewOptions`, `ScenePipeline` | type | |
| `worldMatrix`, `localMatrix`, `viewProjection` | value | the transform arithmetic, exposed |
| `Scene`, `Entity`, `Transform`, `Camera` | type | |
| `batchScene`, `batchOnePipeline` | value | group a world by pipeline into draws |
| `Batch`, `Material`, `MaterialDraw` | type | |
| `drawList`, `Draw` | value, type | a flat list of what to draw |

A rotation is a `Mat4`, never three angles: Euler orders disagree between codebases and
the disagreement is silent, so the library never guesses.

## Maths

`vec3`, `mat3`, `mat4` and the types `Vec3`, `Mat3`, `Mat4`. Each is both a constructor and
the namespace of operations on that shape, so `vec3(1, 2, 3)` and `vec3.add(a, b)` both
work.

- `vec3`: `add`, `sub`, `scale`, `dot`, `cross`, `normalize`, `magnitude`
- `mat4`: `multiply`, `translation`, `scaling`, `rotationX`, `rotationY`, `rotationZ`,
  `transformPoint`, `lookAt`, `perspective`, `pack`, `IDENTITY`
- `mat3`: `IDENTITY` and the shared operations

Column major, depth zero to one, which is what WebGPU expects. `pack` gives the
`Float32Array` a uniform buffer wants. The magnitude is **not** called `length`: a
function's `length` in JavaScript is its argument count and cannot be replaced.

## Geometry the build generates

`GEOMETRY_PRIMITIVE` and the types `GeometryPrimitive`, `GeometryLayout`,
`GeneratedGeometry`. A buffer's contents are numbers and no source file holds them, so the
build generates them and the layout travels with the bytes.

## Resources, by hand

`Arena` and the types `Handle`, `Range`. The resident lifetime: buffers, textures, samplers
and query sets are allocated and freed here, addressed by branded integer handle, with a
generation packed above the index so a stale handle is detectable rather than silently
valid. `Arena.read` is how a buffer's words come back to the CPU.

## Checking what your shader asked the card

| name | kind | what it does |
| --- | --- | --- |
| `wrapDevice` | value | wrap a real device and record every call made on it |
| `projectTrace` | value | reduce a recording to the calls worth comparing |
| `compareTraces` | value | report where two recordings differ |
| `TraceEntry`, `Lifetimes` | type, value | |
| `readFrameCoverage`, `isFullyPainted`, `describeFrameCoverage` | value | which rows and columns of a frame hold something |
| `FrameCoverage`, `FrameCoverageInput` | type | |

This is how you check that a change to a shader did not quietly change what the device was
asked to do — and it is the mechanism the package's own browser gates use, not a separate
toy.
