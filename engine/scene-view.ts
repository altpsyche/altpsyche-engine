/**
 * `sceneView`, the scene tier's producer: a world and the cameras watching it
 * become a `FrameGraph` (today's `ShaderFrame`, per §14 and item 38's rename
 * horizon). It is [RoadToPureEngine.md](../docs/RoadToPureEngine.md) Stage 4's
 * `sceneView(arena, options).graph(world, views)`.
 *
 * A producer, not a backend: it imports the graph authoring layer (`graph/`) and
 * is handed an arena, and it reaches no device — every matrix it needs it works
 * out on the CPU through the engine's own `viewProjection` and `batchOnePipeline`,
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
 * **One pipeline for now.** The whole world is one `batchOnePipeline`, so every
 * drawn object shares one pipeline and reads its own record out of one storage
 * buffer. Item 33 lifts that restriction; until then a scene spanning two
 * pipelines is two `sceneView`s or is refused by the batch.
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
import { batchOnePipeline } from './material.js';
import type { Material, MaterialDraw } from './material.js';
import { viewProjection } from './scene.js';
import type { Camera, Scene } from './scene.js';
import { mat4 } from './maths.js';
import type {
  BufferResource,
  ModuleSpec,
  RenderPipelineSpec,
  ResourceSpec,
  ShaderFrame,
  ShaderTarget,
} from '../renderer/types.js';

/**
 * Everything about the frame that does not change frame to frame: the shader, the
 * one pipeline the world draws through, the materials the pipeline is fed, and the
 * names of the two storage buffers `sceneView` fills from the scene. The world and
 * the views are the per-frame half and arrive at `graph()` instead.
 *
 * The pipeline and its modules are the caller's because a material here is a
 * pipeline name and its values and nothing more (`engine/material.ts`): the
 * program that draws the scene is authored once, and `sceneView` only feeds it the
 * numbers the scene works out. The uniform block, geometry and samplers a pipeline
 * also binds are `resources` — `sceneView` adds the two scene-derived buffers to
 * them rather than owning the whole resource list.
 */
export interface SceneViewOptions<V> {
  id: string;
  target: ShaderTarget;
  /** The documents the pipeline links or compiles from, code already in hand — a
   * producer reaches no fetch. */
  modules: ModuleSpec[];
  /** The one pipeline every drawn object shares, until item 33 lets a scene span
   * two. It binds the two buffers named in `objects` and `views`. */
  pipeline: RenderPipelineSpec;
  /** The materials the scene's entities name, turning an entity's material name
   * into the values its copy reads. One pipeline, so every material here names
   * `pipeline.name` — an object naming another is refused by the batch. */
  materials: Record<string, Material<V>>;
  /** The resources the pipeline reads besides the two `sceneView` fills: the
   * uniform block a page feeds, the geometry the vertex stage reads, samplers,
   * static textures. Absent for a pipeline that binds only the scene buffers. */
  resources?: ResourceSpec[];
  /** The names and types a page feeds by name, carried onto the frame unchanged.
   * The per-view and per-object matrices are not here — they are baked into the
   * two buffers below as data, so the graph fully determines the picture and a
   * snapshot diff shows a scene change (item 34). */
  uniforms?: { name: string; type: string }[];
  /** The device capabilities the frame depends on, read by `refusal` (item 24).
   * Absent for a scene that needs only what every backend shares. */
  requires?: readonly Capability[];
  /** The read-only storage buffer each object's record goes in, and how one drawn
   * object packs to bytes. The layout is the shader's, so the pack is the caller's:
   * a record is typically the object's world matrix followed by its material's
   * values, laid out the way the source's per-object struct reads them. */
  objects: { buffer: string; pack: (draw: MaterialDraw<V>) => Uint8Array };
  /** The read-only storage buffer the view-projection matrices go in, one
   * column-major `mat4` of sixty-four bytes per view, in the order `views` is
   * given. A single-view scene is one matrix; the shader indexes by view where it
   * draws more than one. */
  views: { buffer: string };
  /** Which resource holds the picture once the pass has run, absent where the pass
   * drew into the frame's own colour target. */
  present?: string;
}

/** What `sceneView` returns: a `graph` that turns a world and its cameras into a
 * frame. It is stateful only in the arena sense — it holds the resident buffers it
 * allocated so a world of the same shape reuses them rather than leaking a fresh
 * pair every frame — and it touches no device to do so. */
export interface SceneView {
  graph(world: Scene, views: readonly Camera[]): ShaderFrame;
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
  // The resident buffers, held as graph refs so the producer names them the way
  // the authoring layer does — a resident ref carrying the arena handle the buffer
  // was allocated under. The authoring `BufferHandle` and the arena's runtime
  // `Handle` are the same integer under two brands and meet at the one cast below,
  // which is item 17's documented seam; they unify as resource names become handles
  // in a later stage.
  const slots: Record<'objects' | 'views', { ref: BufferRef; bytes: number } | undefined> = {
    objects: undefined,
    views: undefined,
  };

  // The one seam item 17 documents: the authoring `BufferHandle` and the arena's
  // runtime `Handle` are the same integer under two brands, so a resident ref is
  // read back to the arena handle it carries — through `isResident`, the way
  // `FrameResources` narrows one — at this single cast rather than anywhere else.
  const handleOf = (ref: BufferRef): Handle => {
    if (!isResident(ref)) throw new Error(`sceneView "${options.id}" holds a non-resident buffer ref`);
    return ref.resident as unknown as Handle;
  };

  // Allocate the named slot's buffer where its size changed and reuse it where it
  // did not, then fill it with this frame's bytes. A first fill or a resize is
  // `written` (first contents of a resource); refilling a reused buffer is
  // `uploaded` (new numbers into one already made) — the two categories decision 9
  // keeps apart, recorded where the write is made.
  const resident = (which: 'objects' | 'views', name: string, bytes: Uint8Array): BufferResource => {
    const held = slots[which];
    if (held === undefined || held.bytes !== bytes.byteLength) {
      const make = (): Uint8Array => new Uint8Array(bytes.byteLength);
      const handle = held === undefined ? arena.allocate(make) : arena.resize(handleOf(held.ref), make);
      slots[which] = { ref: { resident: handle as unknown as BufferHandle }, bytes: bytes.byteLength };
      arena.wrote(bytes.byteLength);
    } else {
      arena.sent(bytes.byteLength);
    }
    // Resolve through the ref the way `FrameResources` does — a resident ref reaches
    // the arena — so the emitted resource points at the arena's own live buffer
    // rather than a copy of it.
    const store = arena.resolve(handleOf(slots[which]!.ref));
    store.set(bytes);
    return { kind: 'buffer', name, bytes: bytes.byteLength, access: 'read', data: store as Uint8Array<ArrayBuffer> };
  };

  return {
    graph(world: Scene, views: readonly Camera[]): ShaderFrame {
      if (views.length === 0) {
        throw new Error(`sceneView "${options.id}" needs at least one view to draw, but was given none`);
      }
      // One pipeline for the whole world (item 33 lifts this). The batch refuses an
      // object with no material, one naming a material the table does not carry, and
      // one on a second pipeline — so a scene that cannot be one batch stops here by
      // name rather than drawing wrong.
      const batch = batchOnePipeline(world, options.materials);
      const objectBytes = concatBytes(batch.draws.map(options.objects.pack));
      const viewBytes = concatBytes(views.map((camera) => mat4Bytes(viewProjection(camera) as unknown as number[])));

      const objects = resident('objects', options.objects.buffer, objectBytes);
      const viewsBuffer = resident('views', options.views.buffer, viewBytes);

      const frame: ShaderFrame = {
        id: options.id,
        target: options.target,
        uniforms: options.uniforms ?? [],
        resources: [...(options.resources ?? []), objects, viewsBuffer],
        modules: options.modules,
        pipelines: [options.pipeline],
        // One instanced draw: the pipeline's geometry drawn once per object, each
        // copy reading its own record out of the objects buffer by which copy it is.
        passes: [{ pipeline: options.pipeline.name, draws: [{ instances: batch.draws.length }] }],
      };
      if (options.requires !== undefined) frame.requires = options.requires;
      if (options.present !== undefined) frame.present = options.present;
      return frame;
    },
  };
}
