# API

Every name `@altpsyche/engine` exports, with its signature, grouped by what you are doing
rather than by which file it lives in. There is one import path and no second one, so nothing
you import moves when the files inside are rearranged:

```js
import { createSurface, submit, wgslFrame, resolve, vec3, mat4 } from '@altpsyche/engine';
```

Sixty-nine names leave the door at run time, and the types come with them. Every signature
below is printed from the compiler's own reading of the source and a gate fails if one drifts
from it, so what is written here is what you will get.

For a page that runs, see [EXAMPLES.md](EXAMPLES.md); for the reasoning under the shapes, see
[ARCHITECTURE.md](ARCHITECTURE.md); for what changes between releases and why `^0.3.0` will not
pick up `0.4.0`, see the [CHANGELOG](../CHANGELOG.md).

---

## Getting something on the screen

```ts
createSurface(canvas: HTMLCanvasElement, graph: FrameGraph, options: SurfaceOptions): Promise<Surface | null>
createFrameRenderer(canvas: HTMLCanvasElement | OffscreenCanvas, options?: RendererOptions): Promise<FrameRenderer | null>
submit(renderer: FrameRenderer, graph: FrameGraph, uniforms: Record<string, UniformValue>, options?: SubmitOptions): void
requestWebGPUDevice(): Promise<GPUDevice | null>
resolveDensity(dpr: [number, number] | undefined, offered: number): number
PROGRAM_CACHE_LIMIT: 16
```

`createSurface` is a running loop on a canvas: it draws, resizes, pauses and recovers a lost
card. `createFrameRenderer` is one renderer and no loop, for drawing on your own schedule;
`submit` draws one frame through it, and `SubmitOptions.into` says where the frame lands.
`resolveDensity` is the device-pixel-ratio arithmetic a surface does, exposed so a caller can
do the same sum. `PROGRAM_CACHE_LIMIT` is how many built programs a renderer keeps before
evicting the stalest.

Both factories return `null` rather than throwing where no backend would give the canvas a
context, and both are **asynchronous** because each backend is reached by a dynamic import —
see [ARCHITECTURE.md](ARCHITECTURE.md#one-door) for what that buys.

**A renderer draws through WebGL 2 unless you hand it a WebGPU device**, which is
`RendererOptions.backend` and `RendererOptions.device` together. Asking for the card is the
caller's step; the README shows the call.

Types: `Surface`, `SurfaceOptions`, `FrameRenderer`, `RendererOptions`, `SubmitOptions`,
`DeviceReport`.

## Describing a frame

A frame graph says what resources exist, what pipelines run, and in what order the passes go.
[GUIDE-frame-graph.md](GUIDE-frame-graph.md) authors one; this is the list of names.

**The shortcuts**, for a single fragment shader over the whole canvas:

```ts
wgslFrame(id: string, code: string, block: UniformSlot[], constants?: Record<string, number>): FrameGraph
glslFrame(id: string, vertex: string, fragment: string): FrameGraph
wgslDescription(code: string): FrameGraph
glslDescription(): FrameGraph
ONE_PASS: "frame"
WGSL_DOCUMENT: "wgsl"
WGSL_FRAGMENT_ENTRY: "fragMain"
```

`wgslFrame` expects two things of its source: the fragment entry point is called `fragMain` —
that is `WGSL_FRAGMENT_ENTRY` — and the uniforms are one struct at group 0, binding 0.
`uniformBlockOf(code)` is how you get the `block` argument without writing the layout out a
second time. `glslFrame` takes a pair, because WebGL 2 links two documents. The two
`…Description` functions build the same one-pass shape without the text, when you want the
description rather than a finished frame.

**Filling a description in**, which is what a loader does:

```ts
frameOf(id: string, description: FrameGraph, texts: Record<string, string>, block?: UniformSlot[], constants?: Record<string, number>, generated?: Map<number, Uint8Array<ArrayBuffer>>): FrameGraph
assembleFrame(id: string, description: FrameGraph, texts: Map<string, string>, generated: Map<number, Uint8Array<ArrayBuffer>>, block?: UniformSlot[], constants?: Record<string, number>): FrameGraph
glslFrameOf(frame: WgslFrameGraph): GlslFrameGraph | null
documentNames(description: FrameGraph): string[]
generatedResources(description: FrameGraph): { index: number; source: string; }[]
```

`documentNames` says which document texts a description still wants; `generatedResources`
says which resources still want bytes. `glslFrameOf` turns a WGSL frame into the GLSL frame
WebGL 2 draws, reading the translation a build baked into the source, and returns `null`
where no bake is there.

**Handles.** Every resource in a graph is addressed by a kind-branded integer — its index in
the graph's resource list — rather than a string:

```ts
buffer(index: number): BufferHandle
texture(index: number): TextureHandle
sampler(index: number): SamplerHandle
uniform(index: number): UniformHandle
vertices(index: number): VertexHandle
indices(index: number): IndexHandle
moduleHandle(index: number): ModuleHandle
pipelineHandle(index: number): PipelineHandle
```

Passing a texture where a buffer belongs is a compile error rather than a lookup that returns
`undefined` at draw time. Why an integer and not a name is in
[ARCHITECTURE.md](ARCHITECTURE.md#handles-not-names). Types: `BufferHandle`, `TextureHandle`,
`SamplerHandle`, `UniformHandle`, `VertexHandle`, `IndexHandle`, `ModuleHandle`,
`PipelineHandle`, and the union `ResourceHandle`.

**Reading a graph**, all pure:

```ts
isRenderPass(pass: PassSpec): pass is RenderPassSpec
drawsCorners(draw: DrawSpec): draw is { vertices: number; instances?: number; perDraw?: number; }
drawsIndirectly(draw: DrawSpec): draw is { indirect: BufferHandle; perDraw?: number; }
groupsIndirectly(groups: Groups): groups is { indirect: BufferHandle; }
moduleOf(frame: FrameGraph, handle: ModuleHandle): ModuleSpec | undefined
resourceOf(frame: FrameGraph, handle: ResourceHandle): ResourceSpec | undefined
uniformResourceOf(frame: FrameGraph): UniformResource | undefined
perDrawBinding(spec: PipelineSpec): BindingSpec | undefined
componentsOf(type: string): number
```

The first four are type guards, so reading a graph narrows rather than casts.

**The graph's own types**: `FrameGraph`, `WgslFrameGraph`, `GlslFrameGraph`, `ModuleSpec`,
`WgslModule`, `GlslModule`, `WgslPair`, `GlslPair`, `RenderSource`, `WgslRenderSource`,
`GlslRenderSource`, `RenderStage`, `PipelineSpec`, `RenderPipelineSpec`,
`ComputePipelineSpec`, `PassSpec`, `RenderPassSpec`, `ComputePassSpec`, `DrawSpec`,
`BindingSpec`, `ResourceSpec`, `BufferResource`, `TextureResource`, `SamplerResource`,
`UniformResource`, `VertexResource`, `IndexResource`, `UniformSlot`, `UniformValue`, `Groups`,
`StencilMode`, `ShaderTarget`, `Backend`, `BackendName`, `TransientSize`.

## Asking questions without touching a device

```ts
resolve(frame: Pick<FrameGraph, "id" | "authored" | "requires" | "translated"> & { resources?: readonly ResourceSpec[]; }, device: DeviceProfile): BackendSelection
selectBackend(frame: Pick<FrameGraph, "authored" | "translated">, offer: DeviceOffer): BackendSelection
refusal(graph: Pick<FrameGraph, "id" | "requires"> & { resources?: readonly ResourceSpec[]; }, device: DeviceCapabilities): string | null
cost(graph: FrameGraph, size: { width: number; height: number; }): FrameCost
webgpuCapabilities(features: Iterable<string>): ReadonlySet<Capability>
webgl2Capabilities(extensions: Iterable<string>): ReadonlySet<Capability>
```

All six are pure functions over data, so they answer in a test, in a worker, or on a machine
with no card. **`resolve` is the one to reach for**: selection first, then the capability
check, in one reading. `selectBackend` is the first half alone — which backend will draw a
frame, from the language it is authored in and what the device offers — and `refusal` is the
second, naming what a device has not got. The two `…Capabilities` functions turn what a device
reported into the capability set those readings take.

`cost` gives `passes`, `draws`, `dispatches`, `pipelineSwitches`, `bindSwitches`,
`attachmentLoads`, `attachmentStores` and `transientBytes` at a size, before a pixel is drawn.
`transientBytes` is what the frame's own scratch targets allocate; uploaded bytes are
`Arena.traffic()`'s to report.

`Capability` is eleven names: `compute`, `storage-buffer`, `storage-buffer-readwrite`,
`storage-texture`, `indirect`, `timestamp`, `occlusion`, `msaa`, `float-blend`, `depth-clamp`,
`bgra-storage`. A graph declares which it needs; a device reports which it has. See
[GUIDE-backends.md](GUIDE-backends.md), which shows all of this in use.

**Reading a device, for a row rather than for a decision:**

```ts
probe(host?: ProbeHost): Promise<DeviceReading>
browserProbeHost(): ProbeHost
readingOf(facts: ProbeFacts, date: string): DeviceReading
readingRow(reading: DeviceReading): string
```

`probe` draws a frame and returns a dated `DeviceReading`: what was reported, whether an
adapter came back, whether the device survived being composited, what the adapter says it is.
It is a diagnostic and a row for [DEVICES.md](DEVICES.md) — **not** the input to selection,
which is a `DeviceProfile`. `browserProbeHost` is the browser half, injected so `readingOf`
can be tested without one, and `readingRow` prints a reading as a table row.

Types: `BackendSelection`, `DeviceOffer`, `DeviceProfile`, `DeviceCapabilities`, `Capability`,
`FrameCost`, `DeviceReading`, `ProbeFacts`, `ProbeHost`, `ProbeTier`, `BackendFacts`.

## Reflection, over the source rather than the built program

```ts
reflect(frame: FrameGraph): Uniform[]
missing(frame: FrameGraph, names: string[]): string[]
uniformBlockOf(source: string): UniformSlot[]
uniformBindingOf(source: string): { group: number; binding: number; name: string; } | undefined
namesReachedBy(source: string, entry: string): Set<string>
```

These read the **source**, not a compiled program, so they work before a device exists and
give the same answer on both backends.

```ts
import { missing, reflect, uniformBlockOf, wgslFrame } from '@altpsyche/engine';

const code = `
struct Uniforms {
  u_time: f32,
  u_resolution: vec2<f32>,
};
@group(0) @binding(0) var<uniform> uniforms: Uniforms;

@fragment
fn fragMain() -> @location(0) vec4<f32> {
  return vec4<f32>(sin(uniforms.u_time), 0.0, 0.0, 1.0);
}
`;

// The block this source lays out: name, offset and size, in declaration order.
const block = uniformBlockOf(code); // [{ name: 'u_time', offset: 0, size: 4 }, …]

const frame = wgslFrame('reflected', code, block);
const uniforms = reflect(frame); // what the frame declares
const unread = missing(frame, uniforms.map((one) => one.name));
if (unread.length) console.warn('declared and never read:', unread);
```

`missing` is how you catch a uniform you are still feeding that the shader stopped reading —
silent waste otherwise, because nothing fails. `namesReachedBy` answers which declarations one
entry point actually reaches. Type: `Uniform`.

## The scene tier

```ts
sceneView<V>(arena: Arena<Uint8Array>, options: SceneViewOptions<V>): SceneView
batchScene<V>(scene: Scene, materials: Record<string, Material<V>>): Batch<V>[]
batchOnePipeline<V>(scene: Scene, materials: Record<string, Material<V>>): Batch<V>
drawList(scene: Scene): Draw[]
worldMatrix(scene: Scene, id: string): Mat4
localMatrix(t: Transform): Mat4
viewProjection(camera: Camera): Mat4
```

`sceneView` is the producer: a world and the cameras watching it in, a `FrameGraph` out. It
packs each drawn object's record into a read-only storage buffer and the view-projection
matrices into another, so the shader indexes by instance rather than the page re-uploading a
uniform per object.

```ts
import {
  Arena, buffer, mat4, sceneView, vec3, vertices,
  type Camera, type Material, type MaterialDraw, type RenderPipelineSpec, type Scene,
} from '@altpsyche/engine';

// What one object feeds the shader beside its transform. Yours to choose.
type Panel = { tint: [number, number, number] };

const SCENE_WGSL = '…your scene shader, with a `project` and a `shade` entry…';

// `sceneView` lays the buffers out after `options.resources`: the shared views buffer
// first, then one object buffer per pipeline in list order. With one geometry resource
// at index 0, views is 1 and this pipeline's objects are 2.
const lit: RenderPipelineSpec = {
  kind: 'render',
  source: { wgsl: { vertex: SCENE_WGSL, fragment: SCENE_WGSL } },
  vertex: { document: 'scene', entry: 'project' },
  fragment: { document: 'scene', entry: 'shade' },
  geometry: vertices(0),
  bindings: [
    { group: 0, binding: 0, resource: buffer(1), visibility: ['vertex'] },
    { group: 0, binding: 1, resource: buffer(2), visibility: ['vertex'] },
  ],
};

// One object's record: its world matrix, then its material's values.
const pack = (draw: MaterialDraw<Panel>): Uint8Array => {
  const record = new Uint8Array(80);
  record.set(new Uint8Array(mat4.pack(draw.world).buffer), 0);
  record.set(new Uint8Array(Float32Array.from([...draw.values.tint, 0]).buffer), 64);
  return record;
};

const materials: Record<string, Material<Panel>> = {
  red: { pipeline: 'lit', values: { tint: [1, 0.2, 0.2] } },
};

// The arena owns the resident buffers. `disposeOf` is how one is handed back; plain
// bytes need no freeing, so this one does nothing.
const arena = new Arena<Uint8Array>(() => {});

const view = sceneView(arena, {
  id: 'my-scene',
  authored: 'wgsl',
  pipelines: [{ name: 'lit', pipeline: lit, objects: { buffer: 'objects', pack } }],
  materials,
  views: { buffer: 'views' },
  requires: ['storage-buffer'],
  resources: [
    {
      kind: 'vertices',
      stride: 24,
      attributes: [
        { location: 0, offset: 0, format: 'float32x3' },
        { location: 1, offset: 12, format: 'float32x3' },
      ],
      topology: 'triangle-list',
      count: 36,
      data: new Uint8Array(24 * 36),
    },
  ],
});

const scene: Scene = {
  entities: [
    {
      id: 'box',
      transform: { position: vec3(0, 0, 0), rotation: mat4.IDENTITY, scale: vec3(1, 1, 1) },
      material: 'red',
    },
  ],
};

const camera: Camera = {
  eye: vec3(0, 2, 5),
  target: vec3(0, 0, 0),
  up: vec3(0, 1, 0),
  fovY: Math.PI / 4,
  aspect: 16 / 9,
  near: 0.1,
  far: 100,
};

// One frame's graph. Build it again next frame; the arena reuses its buffers.
const graph = view.graph(scene, [camera]);
```

`batchScene` groups a world by pipeline into draws, and `batchOnePipeline` refuses a scene
whose objects do not all share one — grouping across pipelines decides which pipeline runs
first, and that is a scheduling choice a caller makes with knowledge the library has not got.
`drawList` is the flat list of what to draw, in draw order, each entity's world matrix already
worked out. `worldMatrix`, `localMatrix` and `viewProjection` are that arithmetic exposed.

A rotation is a `Mat4`, never three angles: Euler orders disagree between codebases and the
disagreement is silent, so the library never guesses — you compose the rotation you meant.

Types: `SceneView`, `SceneViewOptions`, `ScenePipeline`, `Scene`, `Entity`, `Transform`,
`Camera`, `Material`, `MaterialDraw`, `Batch`, `Draw`.

## Maths

```ts
vec3(x: number, y: number, z: number): Vec3
```

`vec3` is both a constructor and the namespace of operations on a vector:

```ts
vec3.add(a: Vec3, b: Vec3): Vec3
vec3.sub(a: Vec3, b: Vec3): Vec3
vec3.scale(v: Vec3, s: number): Vec3
vec3.dot(a: Vec3, b: Vec3): number
vec3.cross(a: Vec3, b: Vec3): Vec3
vec3.magnitude(v: Vec3): number
vec3.normalize(v: Vec3): Vec3
```

`mat4` and `mat3` are namespaces alone — a matrix comes from one of their functions rather
than from calling the namespace:

```ts
mat4.IDENTITY: Mat4
mat4.multiply(a: Mat4, b: Mat4): Mat4
mat4.translation(v: Vec3): Mat4
mat4.scaling(v: Vec3): Mat4
mat4.rotationX(radians: number): Mat4
mat4.rotationY(radians: number): Mat4
mat4.rotationZ(radians: number): Mat4
mat4.transformPoint(m: Mat4, v: Vec3): Vec3
mat4.lookAt(eye: Vec3, target: Vec3, up: Vec3): Mat4
mat4.perspective(fovY: number, aspect: number, near: number, far: number): Mat4
mat4.pack(m: Mat4): Float32Array
mat3.IDENTITY: Mat3
mat3.fromMat4(m: Mat4): Mat3
mat3.pack(m: Mat3): Float32Array
```

Column major, depth zero to one, which is what WebGPU expects. `pack` gives the
`Float32Array` a uniform buffer wants. The magnitude is **not** called `length`: a function's
`length` in JavaScript is its argument count and cannot be replaced. Types: `Vec3`, `Mat3`,
`Mat4`.

## Geometry the build generates

```ts
GEOMETRY_PRIMITIVE: Record<"quad-grid", GeometryLayout & { bytes: (across: number, down: number) => GeneratedGeometry; }>
```

A buffer's contents are numbers and no source file holds them, so the build generates them and
the layout travels with the bytes. Types: `GeometryPrimitive`, `GeometryLayout`,
`GeneratedGeometry`.

## Resources, by hand

`Arena` owns the resident lifetime: buffers, textures, samplers and query sets, addressed by a
branded integer handle with a generation packed above the index, so a handle handed out after a
free never equals the one before it and a stale handle is detectable rather than silently
valid.

```ts
new Arena<T>(disposeOf: (resource: T) => void, readBack?: (resource: T, range: Range | undefined) => Promise<ArrayBuffer>)
allocate(make: () => T): Handle
resolve(handle: Handle): T
live(handle: Handle): boolean
read(handle: Handle, range?: Range): Promise<ArrayBuffer>
upload(handle: Handle, bytes: number, run: (resource: T) => void): void
flush(): void
resize(handle: Handle, make: () => T): Handle
free(handle: Handle): void
traffic(): FrameTraffic
resetTraffic(): void
wrote(bytes: number): void
sent(bytes: number): void
```

```ts
import { Arena } from '@altpsyche/engine';

// The arena calls no graphics API itself: what a resource is, how it is thrown away and
// how its bytes come back are handed in here. This one holds plain byte arrays, which is
// what the scene tier's arena holds.
const arena = new Arena<Uint8Array>((bytes) => bytes.fill(0));

const handle = arena.allocate(() => new Uint8Array(1024));
arena.upload(handle, 1024, (bytes) => bytes.set(new Uint8Array(1024), 0));
arena.flush(); // one pass over everything queued

if (arena.live(handle)) {
  const bytes = arena.resolve(handle);
  console.log(bytes.byteLength, arena.traffic());
}

arena.free(handle); // the next allocate may reuse the slot
console.log(arena.live(handle)); // false: the generation moved on
```

`read` is the one door onto a readback, and an arena built without a `readBack` says so rather
than answering with empty bytes. `traffic()` reports what was written and sent; its
`FrameTraffic` type is not on the door yet, so read it inline for now. Types: `Handle`,
`Range`.

## Checking what your shader asked the card

```ts
wrapDevice(device: GPUDevice, trace: TraceEntry[], lifetimes?: Lifetimes): GPUDevice
projectTrace(trace: TraceEntry[]): TraceEntry[]
compareTraces(expected: TraceEntry[], actual: TraceEntry[]): string[]
new Lifetimes()
readFrameCoverage(pixels: Uint8Array | Uint8ClampedArray, { width, height, channels }: FrameCoverageInput): FrameCoverage
isFullyPainted(coverage: FrameCoverage): boolean
describeFrameCoverage(coverage: FrameCoverage): string
```

The recording double is part of the package rather than a separate toy: it is the mechanism
this repository holds its own two backends to.

```ts
import { compareTraces, projectTrace, requestWebGPUDevice, wrapDevice, type TraceEntry } from '@altpsyche/engine';

function drawWith(device: GPUDevice): void {
  // …make buffers, build pipelines, submit a frame…
  void device;
}

const device = await requestWebGPUDevice();
if (device) {
  // Every call made on the wrapper lands in the array, in order.
  const before: TraceEntry[] = [];
  drawWith(wrapDevice(device, before));

  // Change the shader, draw again, and compare what the card was asked to do. The
  // projection drops the calls that carry no meaning for a comparison.
  const after: TraceEntry[] = [];
  drawWith(wrapDevice(device, after));

  const differences = compareTraces(projectTrace(before), projectTrace(after));
  if (differences.length) console.warn('the device was asked something new:', differences);
}
```

`Lifetimes` is the optional ledger: pass one to `wrapDevice`, and `leaked()` names every
resource created and never destroyed, with `born` and `died` recording each. The three
`…FrameCoverage` functions read a frame's pixels and answer which rows and columns hold
something other than the frame's commonest colour — one reading of "is there a picture here"
rather than one per caller. Types: `TraceEntry`, `FrameCoverage`, `FrameCoverageInput`.
