/**
 * Every rule about a graph that was once written out twice — once by the build
 * as it turned a source into a description, once by a backend as it drew the
 * frame that description became — held here in one pure function so the two can
 * no longer drift apart. Where a rule lived in two wordings the numbers could
 * disagree and only one of them be right; where it lives here it is one wording
 * a build refuses and a backend refuses by the same words.
 *
 * It reads the graph and nothing else: no device, no arena, no pipeline cache.
 * A frame that fails it is a frame that would draw the wrong picture or one the
 * card would refuse at a call with a message naming a size rather than the name
 * the description gave it, so it is stopped here first, before anything is built.
 *
 * This absorbs the whole of what `renderer/frame-rules.ts` was — the byte widths
 * a query resolves and the whole-words a storage buffer must be — per
 * [ROADMAP.md](../docs/ROADMAP.md) item 19. What is *not* here is a rule that only
 * ever had one home: the source-against-declaration checks the build alone can
 * make (a texture the source never samples, a binding no resource backs) stay in
 * the build, because a graph carries no source to check them against.
 */
import type { FrameGraph, ResourceSpec } from './types.js';
import { isRenderPass, perDrawBinding, resourceOf, drawsIndirectly, groupsIndirectly } from './types.js';
import type { BufferHandle, ModuleHandle, PipelineHandle, ResourceHandle } from './handles.js';
import { indexOf } from './handles.js';

/** A dynamic offset into a uniform buffer is taken at this alignment on both
 * backends — WebGPU's default `minUniformBufferOffsetAlignment` and WebGL 2's
 * `UNIFORM_BUFFER_OFFSET_ALIGNMENT` — so a per-draw offset that is not a whole
 * number of these is refused here rather than at a card call that names a byte
 * count and neither the draw nor the buffer. */
const PER_DRAW_ALIGNMENT = 256;

/** How many bytes one query answer takes in the buffer a pass resolves it into.
 * A timestamp and an occlusion count are each this wide. */
const QUERY_BYTES = 8;

/** A timed pass writes a time at each end of itself, so it resolves two of them. */
const TIMED_QUERY_BYTES = 2 * QUERY_BYTES;

/** A visible pass counts the samples of its draw that got through, which is one
 * answer. */
const VISIBLE_QUERY_BYTES = QUERY_BYTES;

/**
 * Refuse a graph the card would draw wrong or reject obscurely. Throws naming the
 * index the description gave the offending piece; returns nothing when the graph
 * is sound.
 */
export function validate(graph: FrameGraph): void {
  const id = graph.id;

  // The handle safety net: every handle a frame carries must be in range and name
  // a member of the right list, and where a field wants a particular kind of
  // resource the resource its handle points at must be of that kind. The branded
  // handle types already catch a texture handle handed to a field wanting a buffer
  // one at compile time; this catches the two mistakes a brand cannot see — an
  // index past the end of the list, and a same-brand resource of the wrong kind —
  // turning what would be an `undefined` read deep in a backend into a loud throw
  // that names the offending index. It runs first, so every lookup below can trust
  // its handles resolve.
  const wantsResource = (handle: ResourceHandle, kind: ResourceSpec['kind'] | undefined, verb: string): void => {
    const resource = graph.resources[indexOf(handle)];
    if (resource === undefined) {
      throw new Error(`the frame for "${id}" ${verb} resource ${indexOf(handle)}, which it does not declare`);
    }
    if (kind !== undefined && resource.kind !== kind) {
      throw new Error(
        `the frame for "${id}" ${verb} resource ${indexOf(handle)}, which is a ${resource.kind} where a ${kind} was wanted`
      );
    }
  };
  const wantsPipeline = (handle: PipelineHandle, verb: string): void => {
    if (graph.pipelines[indexOf(handle)] === undefined) {
      throw new Error(`the frame for "${id}" ${verb} pipeline ${indexOf(handle)}, which it does not declare`);
    }
  };
  const wantsModule = (handle: ModuleHandle, verb: string): void => {
    if (graph.modules[indexOf(handle)] === undefined) {
      throw new Error(`the frame for "${id}" ${verb} module ${indexOf(handle)}, which it does not declare`);
    }
  };

  for (const resource of graph.resources) {
    if (resource.kind === 'vertices' && resource.indices !== undefined) {
      wantsResource(resource.indices, 'indices', 'orders vertices with');
    }
  }
  for (const spec of graph.pipelines) {
    for (const binding of spec.bindings) {
      wantsResource(binding.resource, undefined, 'binds');
    }
    if (spec.kind === 'render') {
      // A render pipeline carries its own source (item 99) rather than a
      // `ModuleHandle` into a shared pool, so there is no dangling module index to
      // check — the source is the pipeline's own by construction.
      if (spec.geometry !== undefined) wantsResource(spec.geometry, 'vertices', 'draws geometry from');
    } else {
      wantsModule(spec.compute.module, 'runs a compute stage from');
    }
  }
  for (const pass of graph.passes) {
    wantsPipeline(pass.pipeline, 'runs');
    if (pass.timed !== undefined) wantsResource(pass.timed, 'buffer', 'times into');
    if (isRenderPass(pass)) {
      if (pass.visible !== undefined) wantsResource(pass.visible, 'buffer', 'counts samples into');
      if (pass.depth !== undefined) wantsResource(pass.depth.resource, 'texture', 'keeps depth in');
      for (const attachment of pass.colour ?? []) {
        wantsResource(attachment.resource, 'texture', 'writes colour into');
        if (attachment.resolve !== undefined) wantsResource(attachment.resolve, 'texture', 'resolves colour into');
      }
      for (const draw of pass.draws) {
        if (drawsIndirectly(draw)) wantsResource(draw.indirect, 'buffer', 'draws from');
      }
    } else if (groupsIndirectly(pass.groups)) {
      wantsResource(pass.groups.indirect, 'buffer', 'dispatches from');
    }
  }
  if (graph.present !== undefined) wantsResource(graph.present, 'texture', 'presents');
  for (const [one, other] of graph.swap ?? []) {
    wantsResource(one, 'texture', 'swaps');
    wantsResource(other, 'texture', 'swaps');
  }

  // The depth and stencil state a pipeline compiles in has to agree with the
  // format of the attachment its pass keeps it in: the card takes the state when
  // the pipeline is made and the format when the pass is opened, and it reports a
  // disagreement between the two against whichever call arrived second, naming
  // neither the pipeline nor the attachment. So both halves are checked here,
  // against the pipeline's own declared format, before either reaches the card.
  for (const [index, spec] of graph.pipelines.entries()) {
    if (spec.kind !== 'render' || !spec.depth) continue;
    const tested = spec.depth;
    const keepsStencil = tested.format.includes('stencil');
    if (keepsStencil && tested.stencil === undefined) {
      throw new Error(
        `the pass on pipeline ${index} keeps a stencil in ${tested.format} and its pipeline says nothing about the mask`
      );
    }
    if (!keepsStencil && tested.stencil !== undefined) {
      throw new Error(`the pass on pipeline ${index} masks with a stencil and keeps its depth as ${tested.format}`);
    }
    const keepsDepth = tested.format.startsWith('depth');
    if (!keepsDepth && tested.compare !== undefined) {
      throw new Error(`the pass on pipeline ${index} tests depth and keeps it as ${tested.format}, which keeps none`);
    }
    if (keepsDepth && tested.compare === undefined) {
      throw new Error(`the pass on pipeline ${index} keeps depth as ${tested.format} and tests none of it`);
    }
  }

  // Which buffers a query resolves into, and how many bytes each resolve writes:
  // two answers for the pair of times a pass is opened and closed at, and one for
  // the samples a draw got through. A buffer named by two queries is refused,
  // because a resolve writes from the start of the buffer and the second would
  // land on top of the first.
  const resolves = new Map<number, number>();
  for (const pass of graph.passes) {
    const answers: [BufferHandle | undefined, number][] = [
      [pass.timed, TIMED_QUERY_BYTES],
      [isRenderPass(pass) ? pass.visible : undefined, VISIBLE_QUERY_BYTES],
    ];
    for (const [handle, bytes] of answers) {
      if (handle === undefined) continue;
      const index = indexOf(handle);
      if (resolves.has(index)) {
        throw new Error(`the frame for "${id}" resolves more than one query into buffer ${index}`);
      }
      resolves.set(index, bytes);
    }
  }

  for (const [index, resource] of graph.resources.entries()) {
    if (resource.kind !== 'buffer') continue;
    // A storage buffer is read four bytes at a time, so its size is a positive
    // whole number of those words. The card refuses any other over a binding size
    // that names neither the buffer nor the description, so both a build and a
    // backend refuse it first and in the same words.
    if (resource.bytes <= 0 || resource.bytes % 4 !== 0) {
      throw new Error(
        `the frame for "${id}" gives buffer ${index} ${resource.bytes} bytes, which is no whole number of four-byte words`
      );
    }
    // A buffer a query resolves into is refused where it is shorter than the
    // answer, because the card writes from the start of it and reports a resolve
    // running past the end with a message about a size that names neither the
    // query nor the pass that asked for it.
    const resolved = resolves.get(index);
    if (resolved !== undefined && resource.bytes < resolved) {
      throw new Error(
        `the frame for "${id}" resolves ${resolved} bytes of query into buffer ${index}, which holds ${resource.bytes}`
      );
    }
  }

  // A draw reaching one slice of a per-draw buffer names the byte offset of its
  // record, and the card takes that offset only at a fixed alignment. So every
  // per-draw offset is checked here — a build and a backend refuse it in the same
  // words — rather than reaching a `setBindGroup` or `bindBufferRange` that names
  // the byte count alone. Which binding a pass's draws slice, and how wide one
  // record is, is the pipeline's; the offset is the draw's.
  for (const pass of graph.passes) {
    if (!isRenderPass(pass)) continue;
    const pipeline = indexOf(pass.pipeline);
    const spec = graph.pipelines[pipeline];
    if (!spec) continue; // A pass naming no pipeline is caught where the plan is read.
    const slice = perDrawBinding(spec);
    for (const draw of pass.draws) {
      if (draw.perDraw === undefined) continue;
      // An offset with no per-draw binding to land in is a draw slicing a buffer
      // the pipeline binds whole, which draws every record the same and is wrong.
      if (!slice) {
        throw new Error(
          `the pass on pipeline ${pipeline} gives a draw a per-draw offset of ${draw.perDraw} and its pipeline binds no per-draw slice`
        );
      }
      if (draw.perDraw % PER_DRAW_ALIGNMENT !== 0) {
        throw new Error(
          `the pass on pipeline ${pipeline} reads a per-draw slice at offset ${draw.perDraw}, which is no whole number of ${PER_DRAW_ALIGNMENT} bytes`
        );
      }
      const resource = resourceOf(graph, slice.resource);
      if (!resource || resource.kind !== 'buffer') {
        throw new Error(
          `the pass on pipeline ${pipeline} reads a per-draw slice from resource ${indexOf(slice.resource)}, which is no buffer it declares`
        );
      }
      if (draw.perDraw + slice.perDraw!.size > resource.bytes) {
        throw new Error(
          `the pass on pipeline ${pipeline} reads ${slice.perDraw!.size} bytes of per-draw slice at offset ${draw.perDraw} from resource ${indexOf(slice.resource)}, which holds ${resource.bytes}`
        );
      }
    }
  }
}
