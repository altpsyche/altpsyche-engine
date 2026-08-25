/**
 * The first half of the executor: a graph read into the plan the command loop
 * replays. Nothing here touches a device, which is the whole reason it is its own
 * file — a graph becomes a plan by arithmetic and lookup alone, and the plan is
 * what [execute.ts](execute.ts) turns into commands on the card.
 *
 * This is `submit/`'s share of [RoadToPureEngine.md](../docs/RoadToPureEngine.md)
 * §5's per-frame lifetime: which passes run, which draws, which attachments each
 * opens with. It reads from the graph (`frame`) and from the resident lifetime
 * only through `geometryOf`, which the backend hands in already resolved, so this
 * file allocates nothing and compiles nothing. It lived inside the WebGPU
 * backend's `createProgram` until [ROADMAP.md](../docs/ROADMAP.md) item 13 split
 * the executor out; the code is unchanged by the move, which is why the twelve
 * trace presets still agree call for call.
 */
import type {
  FrameDescription,
  IndexResource,
  RenderPassSpec,
  RenderPipelineSpec,
  FrameGraph,
  TextureResource,
  UniformSlot,
  VertexResource,
} from '../graph/types.js';
import { drawsCorners, drawsIndirectly, isRenderPass, resourceOf } from '../graph/types.js';
import { frameOf } from '../toy/frame.js';
import { validate } from '../graph/validate.js';
import { sizeKey } from '../graph/refs.js';

/** The geometry one pipeline reads and the indices that order it, looked up where
 * a pipeline is made and where a pass is planned so the two agree on which
 * vertices a draw walks. */
export type DrawnGeometry = { vertices: VertexResource; ordered: IndexResource | undefined };

/** One frame's passes read into the shape the draw loop replays: the pass, the
 * pipeline it names, the geometry it binds and the attachments it opens with.
 * Held as its own name because a program keeps it in a variable a runtime pass
 * change reassigns rather than in a const built once. */
export type FramePlan = ReturnType<typeof planFramePasses>;

/** One entry of the plan: everything the command loop needs about a single pass
 * without a lookup of its own. */
export type PlannedPass = FramePlan[number];

/** The passes the frame draws, read once here into the shape the draw loop
 * replays every frame. Nothing here touches the card: each pass is checked
 * against its pipeline and against what earlier passes of the same frame have
 * written, so the loop that submits the frame does no lookups of its own. */
export function planFramePasses(frame: FrameGraph, geometryOf: (name: string) => DrawnGeometry) {
  // Every rule about the graph itself lives in one place now, and this is where
  // the plan reads it before turning the graph into passes: a frame that would
  // draw wrong is refused here, in the words a build would use for the same
  // fault, rather than each backend restating the check (item 19).
  validate(frame);

  /** Where one pass keeps the depth of what it draws, looked up once here
   * rather than every frame. The state and the attachment are given to the
   * card in two separate calls, so it reports a disagreement between them
   * against whichever of the two arrived second and names neither the
   * description nor the pass. */
  const depthOf = (pass: RenderPassSpec, spec: RenderPipelineSpec, filled: Set<string>) => {
    const tested = spec.depth;
    if (!pass.depth) {
      if (tested) throw new Error(`the pass on "${spec.name}" tests depth and attaches nothing to keep it in`);
      return undefined;
    }
    const named = pass.depth.resource;
    if (!tested) {
      throw new Error(`the pass on "${spec.name}" keeps depth in "${named}" and its pipeline tests none`);
    }
    // Which halves the format keeps, read here for the clear-vs-filled rules
    // below. That each half the pipeline names is a half the format keeps —
    // depth operations only over a depth format, a mask only over a stencil one —
    // is a rule the graph carries on its own, so it is checked once in
    // `validate` (item 19) rather than restated over the plan.
    const keepsStencil = tested.format.includes('stencil');
    const keepsDepth = tested.format.startsWith('depth');
    const resource = resourceOf(frame, named);
    if (!resource || resource.kind !== 'texture') {
      throw new Error(`the frame for "${frame.id}" keeps depth in "${named}", which is no texture it declares`);
    }
    if (resource.format !== tested.format) {
      throw new Error(
        `the pass on "${spec.name}" tests depth as ${tested.format} and keeps it in "${named}", which is ${resource.format}`
      );
    }
    // A texture that never asked to be an attachment has no flag for it, and
    // the card refuses the pass over a usage rather than over the name of the
    // texture the description gave it.
    if (!resource.use.includes('attachment')) {
      throw new Error(`the frame for "${frame.id}" keeps depth in "${named}", which is no attachment it declares`);
    }
    // Every attachment of one pass keeps the same number of samples a pixel,
    // the depth among them, and the card refuses the pass over the count
    // without saying which attachment disagreed with which pipeline.
    if ((resource.samples ?? 1) !== (spec.samples ?? 1)) {
      throw new Error(
        `the pass on "${spec.name}" draws ${spec.samples ?? 1} samples a pixel and keeps depth in "${named}", which keeps ${resource.samples ?? 1}`
      );
    }
    // An attachment with no clear value keeps what is in it, which is what a
    // second surface tested against the first needs. Keeping what no earlier
    // pass wrote is a frame reading its own last one, which is a capability a
    // pair of textures exists for rather than something to arrive at by
    // leaving a value out.
    if (keepsDepth && pass.depth.clear === undefined && !filled.has(named)) {
      throw new Error(`the pass on "${spec.name}" keeps the depth in "${named}", which no earlier pass wrote`);
    }
    // The mask follows the same rule, so the pass that marks empties it and
    // the pass drawn inside the mark keeps what the marking pass left. A pass
    // keeping a mask nothing has written would be drawn wherever the memory
    // happened to hold the reference.
    if (keepsStencil && pass.depth.stencilClear === undefined && !filled.has(named)) {
      throw new Error(`the pass on "${spec.name}" keeps the mask in "${named}", which no earlier pass wrote`);
    }
    return {
      name: named,
      clear: pass.depth.clear,
      stencilClear: pass.depth.stencilClear,
      depthHalf: keepsDepth,
      stencilHalf: keepsStencil,
    };
  };

  /** Where the samples of one attachment are averaged, which is a texture of
   * the same size and format keeping one sample of each pixel. An attachment
   * keeping several has to name one, since nothing can read the attachment
   * itself: it cannot be copied out of and no binding here declares a
   * multisampled read. */
  const resolved = (
    spec: RenderPipelineSpec,
    attachment: { resource: string; resolve?: string },
    into: TextureResource
  ) => {
    if (into.samples === undefined) {
      if (attachment.resolve === undefined) return undefined;
      throw new Error(
        `the pass on "${spec.name}" averages "${attachment.resource}" into "${attachment.resolve}" and it keeps one sample a pixel`
      );
    }
    const name = attachment.resolve;
    if (name === undefined) {
      throw new Error(
        `the pass on "${spec.name}" keeps several samples a pixel in "${attachment.resource}" and averages them nowhere`
      );
    }
    const resource = resourceOf(frame, name);
    if (!resource || resource.kind !== 'texture') {
      throw new Error(
        `the frame for "${frame.id}" averages "${attachment.resource}" into "${name}", which is no texture it declares`
      );
    }
    if (!resource.use.includes('attachment')) {
      throw new Error(
        `the frame for "${frame.id}" averages "${attachment.resource}" into "${name}", which is no attachment it declares`
      );
    }
    // Same shape and same format, because averaging is a per-pixel read of the
    // samples of the pixel underneath it, and same single sample, because a
    // texture keeping several is what is being averaged rather than what an
    // average lands in.
    const shape = (resource: TextureResource) => `${sizeKey(resource.size)} ${resource.format}`;
    if (resource.samples !== undefined || shape(resource) !== shape(into)) {
      throw new Error(
        `the pass on "${spec.name}" averages "${attachment.resource}" into "${name}", which is not the same picture keeping one sample`
      );
    }
    return name;
  };

  /** Which textures one pass writes its colours into, looked up once here.
   * The count, the order and every format have to agree with what the
   * pipeline says it returns, and a card refuses the pass over the first
   * attachment that does not match without saying which description named
   * it. */
  const coloursOf = (pass: RenderPassSpec, spec: RenderPipelineSpec, filled: Set<string>) => {
    const written = spec.targets;
    if (!pass.colour) {
      if (written) throw new Error(`the pass on "${spec.name}" writes ${written.length} colours and attaches none`);
      // The frame the reader sees keeps one sample of each pixel, so there is
      // nothing for a pass drawing into it to average and no texture to
      // average it into.
      if (spec.samples) {
        throw new Error(`the pass on "${spec.name}" draws ${spec.samples} samples a pixel into the frame`);
      }
      return undefined;
    }
    if (!written) {
      throw new Error(
        `the pass on "${spec.name}" attaches ${pass.colour.length} textures and its pipeline writes the frame`
      );
    }
    if (written.length !== pass.colour.length) {
      throw new Error(
        `the pass on "${spec.name}" writes ${written.length} colours and attaches ${pass.colour.length} textures`
      );
    }
    return pass.colour.map((attachment, index) => {
      const target = written[index] as { format: GPUTextureFormat };
      const resource = resourceOf(frame, attachment.resource);
      if (!resource || resource.kind !== 'texture') {
        throw new Error(
          `the frame for "${frame.id}" writes colour into "${attachment.resource}", which is no texture it declares`
        );
      }
      if (resource.format !== target.format) {
        throw new Error(
          `the pass on "${spec.name}" writes colour ${index} as ${target.format} into "${attachment.resource}", which is ${resource.format}`
        );
      }
      if (!resource.use.includes('attachment')) {
        throw new Error(
          `the frame for "${frame.id}" writes colour into "${attachment.resource}", which is no attachment it declares`
        );
      }
      if (attachment.clear === undefined && !filled.has(attachment.resource)) {
        throw new Error(
          `the pass on "${spec.name}" keeps the colour in "${attachment.resource}", which no earlier pass wrote`
        );
      }
      if ((resource.samples ?? 1) !== (spec.samples ?? 1)) {
        throw new Error(
          `the pass on "${spec.name}" draws ${spec.samples ?? 1} samples a pixel into "${attachment.resource}", which keeps ${resource.samples ?? 1}`
        );
      }
      return { name: attachment.resource, clear: attachment.clear, resolve: resolved(spec, attachment, resource) };
    });
  };

  // What an earlier pass of this frame has already written, which is what
  // separates a pass keeping the picture so far from one keeping whatever was
  // left in a texture by the frame before it.
  const filled = new Set<string>();
  const read = (pass: RenderPassSpec, spec: RenderPipelineSpec, drawn: DrawnGeometry | undefined) => {
    const depth = depthOf(pass, spec, filled);
    const colour = coloursOf(pass, spec, filled);
    if (depth) filled.add(depth.name);
    for (const attachment of colour ?? []) filled.add(attachment.name);
    return { pass, spec, drawn, depth, colour };
  };

  return frame.passes.map((pass) => {
    const spec = frame.pipelines.find((candidate) => candidate.name === pass.pipeline);
    if (!spec) throw new Error(`the frame names a pipeline "${pass.pipeline}" it does not carry`);
    // The kind of pass is the pipeline's, and a pass carrying the other
    // kind's instruction is a description nothing could resolve: a draw
    // count means nothing to a compute pipeline and a dispatch means nothing
    // to a render one.
    if (isRenderPass(pass) !== (spec.kind === 'render')) {
      throw new Error(`the pass on "${spec.name}" asks for the other kind of work than the pipeline does`);
    }
    if (!isRenderPass(pass) || spec.kind !== 'render') {
      return { pass, spec, drawn: undefined, depth: undefined, colour: undefined };
    }
    // The draws of one pass all read the pass's one pipeline (item 33 lifts that),
    // so whether there is geometry to bind is the pipeline's answer, not any one
    // draw's. A draw that counts instances alone draws whatever its pipeline reads,
    // so a pipeline reading no buffer has nothing for such a draw to walk and says
    // so here rather than drawing nothing on the card. A draw reading its counts
    // out of a buffer, or one covering the frame's corners, needs no such buffer.
    const instancesAlone = pass.draws.some((draw) => !drawsCorners(draw) && !drawsIndirectly(draw));
    if (instancesAlone && spec.geometry === undefined) {
      throw new Error(`the pass on "${spec.name}" draws its pipeline's geometry and that pipeline reads none`);
    }
    // The pipeline's geometry is resolved once for the pass where it names any: an
    // instances-only or indexed-indirect draw walks it, and a corners draw ignores
    // it. A fullscreen pipeline names none and the pass carries no geometry.
    return read(pass, spec, spec.geometry === undefined ? undefined : geometryOf(spec.geometry));
  });
}

/**
 * The seam: today's `FrameDescription` translated onto the new path in one place.
 *
 * A `FrameDescription` is the build-time shape a producer hands over — it names
 * its documents rather than carrying their text, and says nothing about a device.
 * The new path of Stage 1 ([RoadToPureEngine.md](../docs/RoadToPureEngine.md) §15)
 * is `submit/`: a graph becomes a plan here and then commands in
 * [execute.ts](execute.ts). Between the two sits exactly one translation —
 * `frameOf`, which fills a description's documents with the text a loader fetched
 * and its generated resources with their bytes, producing the `FrameGraph` graph
 * `planFramePasses` reads. This function is that translation named as the seam, so
 * a caller holding a description reaches the new path with one call and nothing
 * above the seam has to know how a graph is shaped or how a plan is built.
 *
 * It composes the two existing pure steps rather than restating either: `frameOf`
 * owns the description-to-graph refusals (a document with no text, a repeated
 * name, a generated picture with no bytes) and `planFramePasses` owns the
 * graph-to-plan ones. Keeping it a composition is the whole point of a seam — the
 * translation lives once, and the passes are planned once, and this only says
 * where a description enters.
 *
 * `geometryOf` stays the caller's, resolved against the resident lifetime the
 * backend owns, because a plan reads which vertices a draw walks and the arena is
 * what holds them. A fullscreen frame draws its backend's own corners and never
 * asks for it, so the corpus reaches the new path through here touching no device.
 *
 * [ROADMAP.md](../docs/ROADMAP.md) item 15 has since removed the fused
 * `createProgram` — each lifetime now reaches its own module and no method both
 * allocates resources and compiles pipelines — but it did so without routing a
 * runtime draw through this seam: a backend receives an already-assembled
 * `FrameGraph` and plans it with `planFramePasses` directly, never holding a
 * `FrameDescription` to feed here. This composition waits for the caller that does
 * hold one, the `submit(graph)` model of items 26 to 29; see item 15's
 * [JOURNAL.md](../docs/JOURNAL.md) row.
 */
export function planFromDescription(
  id: string,
  description: FrameDescription,
  texts: Record<string, string>,
  uniforms: { name: string; type: string }[],
  geometryOf: (name: string) => DrawnGeometry,
  extras: {
    block?: UniformSlot[];
    constants?: Record<string, number>;
    generated?: Map<string, Uint8Array<ArrayBuffer>>;
  } = {}
): FramePlan {
  const frame = frameOf(id, description, texts, uniforms, extras.block, extras.constants, extras.generated);
  return planFramePasses(frame, geometryOf);
}
