/**
 * The one door into the engine. A consumer reaches everything the library draws
 * with through this file and never through a subpath, so the shape of what is
 * public is decided here rather than by which file a caller happened to find.
 *
 * The modules live under this package now. This entry re-exports them across the
 * package line, so a consumer names the package once and never a file inside it,
 * and the only thing left to change at publish time is the repository the files
 * sit in, with no consumer editing a single import.
 *
 * The backends are not re-exported. Loading one is `await import()` inside the
 * renderer so the bundler splits them into their own chunks, and re-exporting a
 * backend here would pull both into every consumer's first download whatever
 * card the browser has.
 */

// The renderer: choosing a backend, drawing one frame, and the live surface a
// page keeps running.
export {
  PROGRAM_CACHE_LIMIT,
  createFrameRenderer,
} from './renderer/index.js';
export type {
  FrameRenderer,
  RendererOptions,
} from './renderer/index.js';
export {
  createSurface,
  resolveDensity,
} from './renderer/surface.js';
export type {
  Surface,
  SurfaceOptions,
} from './renderer/surface.js';
export { requestWebGPUDevice } from './renderer/webgpu-device.js';

// Which backend draws a frame, chosen inside the library from what the frame is
// authored in and what the device offers, rather than named by the caller. Pure
// and device-free: the offering is gathered elsewhere and handed in as data.
export { selectBackend } from './renderer/select.js';
export type { BackendSelection, DeviceOffer } from './renderer/select.js';

// A one-shot reading of what this device is — which backend was selected, whether
// WebGPU was reported, whether an adapter was returned, whether it then survived a
// few frames of on-screen compositing, the renderer string, an assertion the
// architecture is not SwiftShader, features, limits and the tier that ran. Readings
// are published (in `docs/DEVICES.md`); a support matrix is not.
export { browserProbeHost, probe, readingOf, readingRow } from './renderer/probe.js';
export type { BackendFacts, DeviceReading, ProbeFacts, ProbeHost, ProbeTier } from './renderer/probe.js';

// The description a producer hands a backend, and the builders that make one.
// The type surface carries unions a caller has to discriminate, a pass being a
// render or a compute one and a draw being counted, instanced or indirect, so the
// guards that narrow them are exported beside them: without those a caller writes
// the same rule again as a property test and drifts from what the backends do.
export {
  ONE_PASS,
  WGSL_DOCUMENT,
  WGSL_FRAGMENT_ENTRY,
  assembleFrame,
  documentNames,
  frameOf,
  generatedResources,
  glslDescription,
  glslFrame,
  wgslDescription,
  wgslFrame,
} from './renderer/frame.js';
export {
  componentsOf,
  dispatchesIndirectly,
  drawsCorners,
  drawsIndirectly,
  isRenderPass,
  moduleOf,
  perDrawBinding,
  resourceOf,
  uniformResourceOf,
} from './renderer/types.js';
export type {
  Backend,
  BackendName,
  BindingSpec,
  BufferResource,
  ComputePassSpec,
  ComputePipelineSpec,
  DeviceReport,
  Dispatch,
  DocumentSpec,
  DrawSpec,
  Extent,
  FrameDescription,
  IndexResource,
  ModuleSpec,
  PassSpec,
  PipelineSpec,
  RenderPassSpec,
  RenderPipelineSpec,
  ResourceSpec,
  SamplerResource,
  ShaderFrame,
  ShaderProgram,
  ShaderTarget,
  StencilMode,
  TextureResource,
  UniformResource,
  UniformSlot,
  UniformValue,
  VertexResource,
} from './renderer/types.js';

// The uniform block a WGSL source lays out, computed off its struct because
// nothing here compiles WGSL.
export { uniformBlockOf } from './wgsl-layout.js';

// The pure-computation helpers a description builder leans on: the vertex layout
// a primitive generates, the bindings an entry point reaches, and the uniform
// binding a source declares. A producer that builds its own descriptions reaches
// these through the door like everything else. The query-buffer sizes and
// word-alignment a graph is held to are no longer among them: they moved into the
// renderer's own `validate`, which every draw runs, and are not a producer's to
// call (item 19).
export {
  GEOMETRY_PRIMITIVE,
} from './shader-geometry.js';
export type {
  GeneratedGeometry,
  GeometryLayout,
  GeometryPrimitive,
} from './shader-geometry.js';
export {
  namesReachedBy,
} from './wgsl-references.js';
export {
  uniformBindingOf,
} from './wgsl-binding.js';

// The engine above the renderer: the maths, the scene, and a scene becoming a
// list of draws with the values each object feeds its material.
export {
  mat3,
  mat4,
  vec3,
} from './engine/maths.js';
export type {
  Mat3,
  Mat4,
  Vec3,
} from './engine/maths.js';
export {
  localMatrix,
  viewProjection,
  worldMatrix,
} from './engine/scene.js';
export type {
  Camera,
  Entity,
  Scene,
  Transform,
} from './engine/scene.js';
export {
  batchOnePipeline,
  batchScene,
} from './engine/material.js';
export type {
  Batch,
  Material,
  MaterialDraw,
} from './engine/material.js';
export {
  drawList,
} from './engine/draw-list.js';
export type {
  Draw,
} from './engine/draw-list.js';

// The scene tier's producer: a world and the cameras watching it become a frame,
// per §17 decision 7 and Stage 4. Handed an arena for the resident buffers it
// fills from the scene, taking `views: Camera[]` rather than one camera, and
// reaching no device — the picture is a function of the world and the views alone.
export {
  sceneView,
} from './engine/scene-view.js';
export type {
  ScenePipeline,
  SceneView,
  SceneViewOptions,
} from './engine/scene-view.js';

// What one frame costs by its structure alone — passes, draws, dispatches,
// pipeline and bind switches, attachment loads and stores, transient bytes.
// Pure and device-free, asserted per preset in CI and only ever reported by
// hardware, per §17 decision 9 (item 21).
export { cost } from './renderer/cost.js';
export type { FrameCost } from './renderer/cost.js';

// Whether a graph may run on a device, answered by naming every capability it
// needs and the device lacks, or null where the device has them all. The third
// pure function beside `cost` and the renderer's `validate`, read after selection
// came back empty rather than as a gate every graph passes, per §10 (item 24). A
// capability lives in `graph.requires` and `device.capabilities` as data, never
// as a method a backend throws from.
export { refusal } from './renderer/refusal.js';
export type { DeviceCapabilities } from './renderer/refusal.js';
export type { Capability } from './graph/capability.js';

// How much of a frame carries a picture, which is one reading rather than one per
// caller: a run refusing a capture and a gate passing a resized surface are the
// same claim about the same kind of buffer, and two versions of the arithmetic
// would drift with nobody reading the one that drifted.
export {
  describeFrameCoverage,
  isFullyPainted,
  readFrameCoverage,
} from './renderer/frame-coverage.js';
export type {
  FrameCoverage,
  FrameCoverageInput,
} from './renderer/frame-coverage.js';

// The recording double: a caller wraps a device to collect what it was asked,
// projects a trace down to the calls worth comparing, and compares two of them.
// The tables the comparison reads, which calls touch a canvas and which fields
// each call is compared on, are how it decides rather than anything to call, so
// they are named out here instead of starred in.
// `Lifetimes` is the ledger `wrapDevice` writes resource births and deaths into:
// a use of a freed resource is refused and a resource never freed is named, so a
// use-after-free and a leak are visible to the fast suite rather than only to a
// driver (item 20).
export { compareTraces, Lifetimes, projectTrace, wrapDevice } from './renderer/trace.js';
export type { TraceEntry } from './renderer/trace.js';
