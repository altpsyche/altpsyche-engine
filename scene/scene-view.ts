/**
 * `sceneView`, the scene tier's producer: a world and the cameras watching it
 * become a `FrameGraph` (the §14 name, landed by item 70; the build-time frame
 * folded into it at item 86). It is [RoadToPureEngine.md](../docs/RoadToPureEngine.md) Stage 4's
 * `sceneView(arena, options).graph(world, views)`.
 *
 * A producer, not a backend: it imports the graph authoring layer (`graph/`) and
 * is handed an arena, and it reaches no device — every matrix it needs it works
 * out on the CPU through the engine's own `viewProjection` and `batchScene`,
 * and everything it emits is plain data. That is what lets it be unit-tested with
 * no GPU present and snapshotted as JSON (item 34): the picture is a function of
 * the world and the views alone.
 *
 * **`views` is a list on purpose.** Nothing needs two cameras yet, and a single
 * view is the length-one case, but `views: Camera[]` is free to commit to now and
 * a breaking signature change after Stage 4 — so it is spelled as a list here so a
 * stereo or a cascaded-shadow consumer never has to reshape the call, per §17
 * decision 7.
 *
 * **Many pipelines, ordered by the producer (item 33).** The world is grouped by
 * pipeline with `batchScene`, one instanced render pass per pipeline, and the order
 * the passes run in is the order the producer lists its pipelines — the scheduling
 * choice `batchScene` deliberately has no knowledge to make. A single-pipeline
 * scene is the length-one case. Each pipeline reads its own per-object storage
 * buffer, so two pipelines whose per-object structs differ each pack their own way.
 *
 * Imports `graph/` (the `Ref`/handle authoring layer) and the engine modules
 * beside it. It does **not** import `submit/` or a backend: a producer that
 * reached the executor or a device would be the layer violation §7 rule 2 exists
 * to catch, checked in [tests/import-graph.test.ts](../tests/import-graph.test.ts)
 * and in [tests/scene-view.test.ts](../tests/scene-view.test.ts).
 */

import type { Arena, Handle } from '../resource/arena.js';
import { isResident } from '../graph/refs.js';
import type { BufferRef } from '../graph/refs.js';
import type { BufferHandle } from '../graph/handles.js';
import type { Capability } from '../graph/capability.js';
import { batchScene } from './material.js';
import type { Material, MaterialDraw } from './material.js';
import { viewProjection } from './scene.js';
import type { Camera, Scene } from './scene.js';
import { mat4 } from './maths.js';
import type {
  BufferResource,
  GlslModule,
  ModuleSpec,
  RenderPassSpec,
  RenderPipelineSpec,
  ResourceSpec,
  FrameGraph,
  ShaderTarget,
  TextureResource,
  WgslModule,
} from '../graph/types.js';

/**
 * Everything about the frame that does not change frame to frame: the shader, the
 * one pipeline the world draws through, the materials the pipeline is fed, and the
 * names of the two storage buffers `sceneView` fills from the scene. The world and
 * the views are the per-frame half and arrive at `graph()` instead.
 *
 * The pipeline and its modules are the caller's because a material here is a
 * pipeline name and its values and nothing more (`scene/material.ts`): the
 * program that draws the scene is authored once, and `sceneView` only feeds it the
 * numbers the scene works out. The uniform block, geometry and samplers a pipeline
 * also binds are `resources` — `sceneView` adds the two scene-derived buffers to
 * them rather than owning the whole resource list.
 */
/**
 * One pipeline the world draws through, with the storage buffer its objects pack
 * into. The scene is grouped by pipeline (`batchScene`), so a pipeline here is one
 * instanced render pass drawing the objects whose material names it. The buffer and
 * the pack are per pipeline because two pipelines read two per-object structs: a
 * shadow pass packs only a transform where a lit pass packs a transform and a
 * colour, and each pipeline's `pack` lays its record out the way its own source
 * reads it.
 */
export interface ScenePipeline<V> {
  /** The pipeline the objects in this group draw through. It binds this group's
   * `objects` buffer and the shared `views` buffer. */
  pipeline: RenderPipelineSpec;
  /** The read-only storage buffer this group's per-object records go in, and how
   * one drawn object packs to bytes for this pipeline's per-object struct — a
   * record is typically the object's world matrix followed by its material's
   * values. Two pipelines must name distinct buffers, so one group's records do not
   * land in another's. */
  objects: { buffer: string; pack: (draw: MaterialDraw<V>) => Uint8Array };
}

export interface SceneViewOptions<V> {
  id: string;
  /** The language the scene's documents are authored in, the one value the frame's
   * authoring language is read off (item 94). `modules` carry their source on the
   * field this names — `wgsl` for a WGSL scene, `glsl` for one authored in GLSL. */
  authored: ShaderTarget;
  /** The documents the pipelines link or compile from, code already in hand — a
   * producer reaches no fetch. Each carries its source on the field `authored`
   * names. */
  modules: ModuleSpec[];
  /** The pipelines the world draws through, one instanced render pass each, in the
   * order their passes run — the producer's scheduling decision (item 33). A
   * single-pipeline scene is a length-one list. A pipeline no object draws through
   * this frame emits no pass; a material naming a pipeline not listed here is
   * refused by name. */
  pipelines: ScenePipeline<V>[];
  /** The materials the scene's entities name, turning an entity's material name
   * into the values its copy reads and the pipeline it draws through. */
  materials: Record<string, Material<V>>;
  /** The resources the pipelines read besides the buffers `sceneView` fills: the
   * uniform block a page feeds, the geometry the vertex stage reads, samplers,
   * static textures. Absent for pipelines that bind only the scene buffers. */
  resources?: ResourceSpec[];
  /** The device capabilities the frame depends on, read by `refusal` (item 24).
   * Absent for a scene that needs only what every backend shares. */
  requires?: readonly Capability[];
  /** The read-only storage buffer the view-projection matrices go in, one
   * column-major `mat4` of sixty-four bytes per view, in the order `views` is
   * given, shared across every pass. A single-view scene is one matrix; the shader
   * indexes by view where it draws more than one. */
  views: { buffer: string };
  /** The transient depth target the scene's passes share, absent for a flat scene
   * that needs no depth test. When present, `sceneView` declares one frame-sized
   * depth texture, has the first pass clear it and every later pass load it, and
   * attaches it to every pass — so a scene of solid objects draws the near one over
   * the far one whatever order the passes run, the depth test resolving what
   * painter order cannot. It is one shared attachment cleared once rather than per
   * pass, because a per-pass clear would throw away the depth an earlier pass wrote
   * and the passes would order by draw order again.
   *
   * Each pipeline declares its own `depth` compare and write (a shadow pass may
   * test without writing): this is the attachment those declarations test into,
   * and `format` must be the format the pipelines name — a pipeline testing a
   * format the attachment does not keep is refused by name at `submit/plan.ts`.
   * `clear` is what the first pass empties the depth to, defaulting to 1, the far
   * end of the range the card normalises depth into, so a first surface at any
   * distance passes against an empty attachment. */
  depth?: { texture: string; format: GPUTextureFormat; clear?: number };
  /** Which resource holds the picture once the passes have run, absent where the
   * last pass drew into the frame's own colour target. */
  present?: string;
}

/** What `sceneView` returns: a `graph` that turns a world and its cameras into a
 * frame. It is stateful only in the arena sense — it holds the resident buffers it
 * allocated so a world of the same shape reuses them rather than leaking a fresh
 * pair every frame — and it touches no device to do so. */
export interface SceneView {
  graph(world: Scene, views: readonly Camera[]): FrameGraph;
}

/** Sixteen little-endian floats, which is what a `mat4x4<f32>` reads out of a
 * storage buffer, as the bytes a resident buffer holds. */
function mat4Bytes(m: readonly number[]): Uint8Array {
  const floats = mat4.pack(m as never);
  return new Uint8Array(floats.buffer, floats.byteOffset, floats.byteLength);
}

/** One buffer's records end to end, in order, which is what an `array<T>` in a
 * storage buffer is: the nth object's record starts at n times the record size. */
function concatBytes(records: readonly Uint8Array[]): Uint8Array {
  const total = records.reduce((sum, one) => sum + one.byteLength, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const record of records) {
    out.set(record, at);
    at += record.byteLength;
  }
  return out;
}

/**
 * A producer that turns a world and its cameras into a frame, holding the resident
 * buffers it fills from the scene between frames.
 *
 * The arena is the resident lifetime of §5: the per-object and per-view buffers
 * live across frames, allocated once and reused while the world keeps its shape,
 * reallocated only when the object or view count changes. It holds byte buffers
 * rather than device resources because a producer reaches no device — a backend
 * uploads these bytes to the card off the emitted frame's `data`, and the arena
 * here is the CPU-side resident store, its `written`/`uploaded` traffic the
 * resident-lifetime reading `cost()` deliberately does not carry (item 22).
 */
export function sceneView<V>(arena: Arena<Uint8Array>, options: SceneViewOptions<V>): SceneView {
  // Every scene buffer must carry a distinct name — one resident slot per name — so
  // two pipeline groups naming one buffer, or a group naming the views buffer, would
  // have the second fill clobber the first's records within a frame: a silent wrong
  // picture, refused here by name where the options are fixed rather than left to
  // surprise a frame. (§3 row 2's class of defect, caught at construction.)
  const names = [
    ...options.pipelines.map((group) => group.objects.buffer),
    options.views.buffer,
    // The shared depth target is a resource keyed by name like the buffers, so it
    // must not share a name with one of them either — a resource-name collision is
    // the same silent wrong picture, caught at construction.
    ...(options.depth ? [options.depth.texture] : []),
  ];
  const clash = names.find((name, at) => names.indexOf(name) !== at);
  if (clash !== undefined) {
    throw new Error(`sceneView "${options.id}" names the buffer "${clash}" twice; each scene buffer needs its own name`);
  }

  // The resident buffers, keyed by the name they carry on the frame — one per
  // pipeline group's objects, plus the shared views buffer — held as graph refs so
  // the producer names them the way the authoring layer does: a resident ref
  // carrying the arena handle the buffer was allocated under. The authoring
  // `BufferHandle` and the arena's runtime `Handle` are the same integer under two
  // brands and meet at the one cast below, which is item 17's documented seam; they
  // unify as resource names become handles in a later stage.
  const slots = new Map<string, { ref: BufferRef; bytes: number }>();

  // The one seam item 17 documents: the authoring `BufferHandle` and the arena's
  // runtime `Handle` are the same integer under two brands, so a resident ref is
  // read back to the arena handle it carries — through `isResident`, the way
  // `FrameResources` narrows one — at this single cast rather than anywhere else.
  const handleOf = (ref: BufferRef): Handle => {
    if (!isResident(ref)) throw new Error(`sceneView "${options.id}" holds a non-resident buffer ref`);
    return ref.resident as unknown as Handle;
  };

  // Allocate the named buffer where its size changed and reuse it where it did not,
  // then fill it with this frame's bytes. A first fill or a resize is `written`
  // (first contents of a resource); refilling a reused buffer is `uploaded` (new
  // numbers into one already made) — the two categories decision 9 keeps apart,
  // recorded where the write is made.
  const resident = (name: string, bytes: Uint8Array): BufferResource => {
    const held = slots.get(name);
    if (held === undefined || held.bytes !== bytes.byteLength) {
      const make = (): Uint8Array => new Uint8Array(bytes.byteLength);
      const handle = held === undefined ? arena.allocate(make) : arena.resize(handleOf(held.ref), make);
      slots.set(name, { ref: { resident: handle as unknown as BufferHandle }, bytes: bytes.byteLength });
      arena.wrote(bytes.byteLength);
    } else {
      arena.sent(bytes.byteLength);
    }
    // Resolve through the ref the way `FrameResources` does — a resident ref reaches
    // the arena — so the emitted resource points at the arena's own live buffer
    // rather than a copy of it.
    const store = arena.resolve(handleOf(slots.get(name)!.ref));
    store.set(bytes);
    return { kind: 'buffer', name, bytes: bytes.byteLength, access: 'read', data: store as Uint8Array<ArrayBuffer> };
  };

  return {
    graph(world: Scene, views: readonly Camera[]): FrameGraph {
      if (views.length === 0) {
        throw new Error(`sceneView "${options.id}" needs at least one view to draw, but was given none`);
      }
      // Group the world by pipeline (item 33). The batch refuses an object with no
      // material and one naming a material the table does not carry — so a scene
      // that cannot be grouped stops here by name rather than drawing wrong — but a
      // second pipeline is a further batch rather than a throw.
      const batches = new Map(batchScene(world, options.materials).map((batch) => [batch.pipeline, batch.draws]));

      // Plan the passes before touching the arena: one instanced draw per pipeline
      // the producer lists, in that order — the scheduling choice `batchScene` has
      // no knowledge to make. A pipeline no object draws through this frame is
      // skipped. A material naming a pipeline the producer did not list is a drawn
      // group with no pass to run in — refused by name, before any buffer is filled.
      const groups = options.pipelines.filter((group) => (batches.get(group.pipeline.name)?.length ?? 0) > 0);
      const stray = [...batches.keys()].find(
        (pipeline) => !groups.some((group) => group.pipeline.name === pipeline)
      );
      if (stray !== undefined) {
        throw new Error(`sceneView "${options.id}" draws a pipeline "${stray}" it was not given`);
      }
      if (groups.length === 0) throw new Error(`sceneView "${options.id}" has no object to draw`);

      // The shared views buffer, one view-projection per camera, filled once for
      // every pass to read.
      const viewBytes = concatBytes(views.map((camera) => mat4Bytes(viewProjection(camera) as unknown as number[])));
      const viewsBuffer = resident(options.views.buffer, viewBytes);

      // Each group's own per-object storage buffer, filled with its records in draw
      // order, and its render pass drawing the pipeline's geometry once per object —
      // each copy reading its own record out of this group's buffer by which copy it
      // is.
      const objectResources = groups.map((group) =>
        resident(group.objects.buffer, concatBytes(batches.get(group.pipeline.name)!.map(group.objects.pack)))
      );
      // The shared depth target, one frame-sized transient the passes test against.
      // The first pass clears it and every later one loads it, so the whole scene
      // depth-tests against one buffer cleared once — which is what lets a near
      // surface a later pass draws win over a far one an earlier pass drew, whatever
      // order the passes run. A texture with no first contents of its own, so
      // `cost()` counts it as transient and item 1 discards the store no pass reads.
      const depthTarget: TextureResource | undefined = options.depth && {
        kind: 'texture',
        name: options.depth.texture,
        size: { scale: 1 },
        format: options.depth.format,
        use: ['attachment'],
      };
      const passes: FrameGraph['passes'] = groups.map((group, at): RenderPassSpec => {
        const pass: RenderPassSpec = {
          pipeline: group.pipeline.name,
          draws: [{ instances: batches.get(group.pipeline.name)!.length }],
        };
        if (options.depth) {
          // The first pass clears the shared depth; every later pass loads it (names
          // no clear), so each surface tests against what the passes before it left.
          pass.depth =
            at === 0
              ? { resource: options.depth.texture, clear: options.depth.clear ?? 1 }
              : { resource: options.depth.texture };
        }
        return pass;
      });

      const resources = [
        ...(options.resources ?? []),
        ...objectResources,
        viewsBuffer,
        ...(depthTarget ? [depthTarget] : []),
      ];
      const pipelines = groups.map((group) => group.pipeline);
      // The frame is built on the arm its `authored` names (item 94); the caller
      // declared the discriminant and passed documents of the matching kind, so the
      // modules narrow to that arm's type here.
      const frame: FrameGraph =
        options.authored === 'wgsl'
          ? { id: options.id, authored: 'wgsl', resources, modules: options.modules as WgslModule[], pipelines, passes }
          : { id: options.id, authored: 'glsl', resources, modules: options.modules as GlslModule[], pipelines, passes };
      if (options.requires !== undefined) frame.requires = options.requires;
      if (options.present !== undefined) frame.present = options.present;
      return frame;
    },
  };
}
