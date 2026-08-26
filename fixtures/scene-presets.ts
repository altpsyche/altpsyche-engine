/**
 * The scene presets `sceneView` is snapshotted against (ROADMAP item 34).
 *
 * A producer's output is a graph — plain data worked out on the CPU with no device
 * present (item 32) — so a scene change is reviewable as a text diff over that graph
 * rather than as a picture someone has to squint at. This file holds the worlds,
 * cameras, materials and options each preset is built from; `tests/scene-snapshots.test.ts`
 * runs each through `sceneView` and writes the emitted graph to a golden JSON file.
 *
 * Fixture data, not shipped: this directory is outside the build config's compile,
 * so nothing under it reaches a consumer, and the presets exist only so a change to
 * `sceneView` has something to diff against. Each preset is deterministic — every
 * matrix is CPU arithmetic over fixed inputs — so its snapshot is the same on any
 * machine, which is what lets the diff be checked with no GPU and no browser.
 *
 * The three presets between them exercise the graph shapes `sceneView` emits: a
 * single-pipeline scene, the same scene watched by two cameras (proving the
 * `views: Camera[]` list bakes one view-projection per camera, item 32), and a scene
 * spanning two pipelines (one instanced pass each, in the producer's order, item 33).
 */
import { Arena } from '../resource/arena.js';
import { buffer } from '../graph/handles.js';
import { mat4, vec3 } from '@altpsyche/engine';
import type { Camera, Scene } from '@altpsyche/engine';
import type { Material, MaterialDraw } from '@altpsyche/engine';
import type { RenderPipelineSpec, FrameGraph } from '@altpsyche/engine';
import { sceneView } from '@altpsyche/engine';
import type { SceneViewOptions } from '@altpsyche/engine';

/** A panel's material feeds a colour and nothing else — the shape the shader's
 * per-object struct reads after the model matrix. */
type Panel = { tint: [number, number, number] };

const MODEL_BYTES = 64; // one mat4x4<f32>
const OBJECT_BYTES = 80; // model matrix, then a vec3 colour with a padding word

/** One object's record: its world matrix, then its colour and a padding word — the
 * layout the pipeline's per-object storage struct reads. */
const packPanel = (draw: MaterialDraw<Panel>): Uint8Array => {
  const out = new Uint8Array(OBJECT_BYTES);
  out.set(new Uint8Array(mat4.pack(draw.world).buffer), 0);
  out.set(new Uint8Array(new Float32Array([...draw.values.tint, 0]).buffer), MODEL_BYTES);
  return out;
};

// The one WGSL file the scene's pipelines compile from, authored once and fed by
// the producer. Each pipeline carries its own copy on its `source` (item 99), so no
// document is shared across the two.
const SCENE_WGSL = '// authored once, fed by the producer';

// The scene's resources lay out as `sceneView` builds them (item 87): the shared
// views buffer first (buffer(0)), then one object buffer per pipeline group in list
// order — objects at buffer(1) and, where a second group draws, glowObjects at
// buffer(2). `surface` is always the first group, so it names the same handles in
// both presets below. Each pipeline's `source` names the same file and its own two
// entry points; `surface` and `glow` share the `project` vertex entry but each
// carries its own source, so neither shares a document with the other.
const SURFACE: RenderPipelineSpec = {
  kind: 'render',
  source: {
    vertex: { document: 'scene', text: SCENE_WGSL, entry: 'project' },
    fragment: { document: 'scene', text: SCENE_WGSL, entry: 'shade' },
  },
  bindings: [
    { group: 0, binding: 0, resource: buffer(1), visibility: ['vertex'] },
    { group: 0, binding: 1, resource: buffer(0), visibility: ['vertex'] },
  ],
};

const GLOW: RenderPipelineSpec = {
  kind: 'render',
  source: {
    vertex: { document: 'scene', text: SCENE_WGSL, entry: 'project' },
    fragment: { document: 'scene', text: SCENE_WGSL, entry: 'bloom' },
  },
  bindings: [
    { group: 0, binding: 0, resource: buffer(2), visibility: ['vertex'] },
    { group: 0, binding: 1, resource: buffer(0), visibility: ['vertex'] },
  ],
};

const MATERIALS: Record<string, Material<Panel>> = {
  warm: { pipeline: 'surface', values: { tint: [0.9, 0.45, 0.3] } },
  cool: { pipeline: 'surface', values: { tint: [0.3, 0.55, 0.9] } },
  bright: { pipeline: 'glow', values: { tint: [1, 1, 0.6] } },
};

const CAMERA: Camera = {
  eye: vec3(0, 0, 0),
  target: vec3(0, 0, -1),
  up: vec3(0, 1, 0),
  fovY: Math.PI / 3,
  aspect: 1,
  near: 0.5,
  far: 6,
};

// The same camera nudged along x for each eye — a stereo pair, so the views buffer
// carries two distinct view-projection matrices in order.
const LEFT_EYE: Camera = { ...CAMERA, eye: vec3(-0.03, 0, 0) };
const RIGHT_EYE: Camera = { ...CAMERA, eye: vec3(0.03, 0, 0) };

const TWO_PANELS: Scene = {
  entities: [
    { id: 'left', material: 'warm', transform: { position: vec3(-0.8, 0, -3), rotation: mat4.rotationX(-0.2), scale: vec3(0.6, 0.6, 0.6) } },
    { id: 'right', material: 'cool', transform: { position: vec3(0.8, 0, -3), rotation: mat4.rotationX(0.2), scale: vec3(0.6, 0.6, 0.6) } },
  ],
};

const SPANNING: Scene = {
  entities: [
    { id: 'lit', material: 'warm', transform: { position: vec3(-0.5, 0, -3), rotation: mat4.rotationX(0), scale: vec3(0.6, 0.6, 0.6) } },
    { id: 'glowA', material: 'bright', transform: { position: vec3(0.5, 0, -3), rotation: mat4.rotationX(0), scale: vec3(0.6, 0.6, 0.6) } },
    { id: 'glowB', material: 'bright', transform: { position: vec3(0, 0.5, -3), rotation: mat4.rotationX(0), scale: vec3(0.4, 0.4, 0.4) } },
  ],
};

const SURFACE_ONLY: SceneViewOptions<Panel> = {
  id: 'panels',
  authored: 'wgsl',
  pipelines: [{ name: 'surface', pipeline: SURFACE, objects: { buffer: 'objects', pack: packPanel } }],
  materials: MATERIALS,
  views: { buffer: 'views' },
};

const SURFACE_AND_GLOW: SceneViewOptions<Panel> = {
  id: 'spanning',
  authored: 'wgsl',
  pipelines: [
    { name: 'surface', pipeline: SURFACE, objects: { buffer: 'objects', pack: packPanel } },
    { name: 'glow', pipeline: GLOW, objects: { buffer: 'glowObjects', pack: packPanel } },
  ],
  materials: MATERIALS,
  views: { buffer: 'views' },
};

/** A named scene preset: its id names the golden file, and `frame()` builds the graph
 * `sceneView` emits for it, on a fresh arena so the snapshot never depends on a buffer
 * a previous preset left resident. */
export interface ScenePreset {
  id: string;
  frame(): FrameGraph;
}

const build = (options: SceneViewOptions<Panel>, world: Scene, views: readonly Camera[]): (() => FrameGraph) => {
  return () => sceneView(new Arena<Uint8Array>(() => undefined as never), options).graph(world, views);
};

export const SCENE_PRESETS: ScenePreset[] = [
  // A single-pipeline scene watched by one camera — the length-one case of both the
  // pipeline list and the view list.
  { id: 'panels', frame: build(SURFACE_ONLY, TWO_PANELS, [CAMERA]) },
  // The same scene watched by two cameras — one view-projection per camera in the
  // views buffer, so a stereo consumer's graph is snapshotted before one exists.
  { id: 'stereo-panels', frame: build(SURFACE_ONLY, TWO_PANELS, [LEFT_EYE, RIGHT_EYE]) },
  // A scene spanning two pipelines — one instanced render pass each, in the order the
  // producer lists the pipelines (item 33), each pipeline reading its own objects buffer.
  { id: 'spanning', frame: build(SURFACE_AND_GLOW, SPANNING, [CAMERA]) },
];
