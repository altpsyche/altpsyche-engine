/**
 * `cost(graph, size)`: the third pure function beside `validate` and `refusal`,
 * per [RoadToPureEngine.md](../docs/RoadToPureEngine.md) §12 point 6 and §17
 * decision 9. It reads the graph and a `{ width, height }` record and nothing
 * else — no device, no arena, nothing carrying behaviour — and returns the same
 * numbers on any machine. That is the whole point of it: a frame's cost is a
 * fact about its structure, so it is asserted in CI on any machine (item 23)
 * rather than measured on a card, and hardware only ever *reports* a cost, never
 * gates one.
 *
 * What it counts is what decision 9 lists: passes, draws, dispatches, pipeline
 * switches, bind switches, attachment loads and stores, and transient bytes.
 * What it deliberately does not count is bytes *uploaded* — that is a
 * resident-lifetime fact the graph does not carry, so it belongs to
 * `arena.traffic()` (item 22) and the two readings are never summed.
 *
 * The load/store accounting mirrors what the executor issues, so a person can
 * check it against [submit/execute.ts](../submit/execute.ts): a colour or depth
 * attachment loads its prior contents exactly when it is given no clear value
 * (`loadOp: 'load'` there), and stores (`storeOp: 'store'` there) exactly where
 * something reads it afterwards — a later pass, the swap, or the present — and
 * discards otherwise, which is the read/write bandwidth item 1 exists to reduce
 * and `attachments.ts`'s `frameStores` decides for both this and the executor. A
 * multisample resolve is one extra store, because the resolve target is written
 * at the end of the pass whatever its source does. A depth attachment keeping
 * both halves takes a load op and a store op for each half.
 */
import type { PipelineSpec, ResourceSpec, RenderPipelineSpec, FrameGraph, TextureResource } from './types.js';
import { isRenderPass } from './types.js';
import type { PipelineHandle } from './handles.js';
import { indexOf } from './handles.js';
import { frameStores } from './attachments.js';
import { sizeAt } from './refs.js';

/** What one frame costs, by its structure alone. Every field is a count except
 * `transientBytes`, and none is ever summed with another: they measure different
 * things a budget (item 31) enforces separately. */
export interface FrameCost {
  /** How many passes the frame runs, render and compute alike. */
  passes: number;
  /** How many draw calls the render passes issue, summed over every pass's draw
   * list (item 26). An instanced or indirect draw counts as one (item 28), because
   * it is one call the card makes however many instances or counts it reads. */
  draws: number;
  /** How many dispatches the compute passes issue. */
  dispatches: number;
  /** How many times a pipeline has to be bound because the pass before it used a
   * different one. The first pass counts, since a pipeline is bound from nothing
   * before the first draw. */
  pipelineSwitches: number;
  /** How many times the bound resources change between one pass and the next.
   * The first pass counts, for the same reason a pipeline switch does. Two
   * consecutive passes binding the same resources — the same groups, bindings
   * and resource handles — are one bind, even across a pipeline switch. */
  bindSwitches: number;
  /** How many attachment loads read prior contents into a pass. A cleared
   * attachment does not — it is filled, not read — so it does not count, which is
   * the read-bandwidth figure a tiling GPU pays and item 1 exists to reduce. */
  attachmentLoads: number;
  /** How many attachment stores write a pass's result out. An attachment nothing
   * reads afterwards discards rather than stores (item 1), so this counts only
   * the attachments a later pass, the swap, or the present reads — plus each
   * multisample resolve, whose averaged target is written whatever its source
   * does. */
  attachmentStores: number;
  /** The bytes of every transient resource the frame allocates: a texture or
   * buffer it declares with no first contents of its own (no `source`, no
   * `data`), which is a scratch target, an attachment, a compute output or a
   * query buffer rather than something uploaded. Resolved at the given size, so
   * a frame-sized attachment's bytes follow the window. Uploaded bytes are not
   * here — those are `arena.traffic()`'s (item 22). */
  transientBytes: number;
}

/** How many bytes one pixel of a format takes, as the format's own logical size.
 * These are nominal accounting figures for a deterministic cost, not a claim
 * about what a driver allocates: a depth format's real width is the card's, and
 * `depth24plus` is "at least 24 bit" by the spec, so it is counted at its packed
 * width of four. A format not listed is counted at four bytes and wants a row
 * here before its cost is trusted. */
const BYTES_PER_PIXEL: Record<string, number> = {
  r8unorm: 1,
  r8snorm: 1,
  r8uint: 1,
  r8sint: 1,
  stencil8: 1,
  r16uint: 2,
  r16sint: 2,
  r16float: 2,
  rg8unorm: 2,
  rg8snorm: 2,
  rg8uint: 2,
  rg8sint: 2,
  depth16unorm: 2,
  r32uint: 4,
  r32sint: 4,
  r32float: 4,
  rg16uint: 4,
  rg16sint: 4,
  rg16float: 4,
  rgba8unorm: 4,
  'rgba8unorm-srgb': 4,
  rgba8snorm: 4,
  rgba8uint: 4,
  rgba8sint: 4,
  bgra8unorm: 4,
  'bgra8unorm-srgb': 4,
  rgb10a2unorm: 4,
  rgb10a2uint: 4,
  rg11b10ufloat: 4,
  depth24plus: 4,
  'depth24plus-stencil8': 4,
  depth32float: 4,
  'depth32float-stencil8': 5,
  rg32uint: 8,
  rg32sint: 8,
  rg32float: 8,
  rgba16uint: 8,
  rgba16sint: 8,
  rgba16float: 8,
  rgba32uint: 16,
  rgba32sint: 16,
  rgba32float: 16,
};

/** The default byte width for a format not in the table, named so the choice is
 * one place rather than a magic number in the arithmetic. */
const DEFAULT_BYTES_PER_PIXEL = 4;

/** The bytes one texture takes at a given frame size, base level plus every mip
 * level where it carries a ladder. A mip level is half the size of the one above
 * it, floored, down to one pixel, which is exactly the ladder both backends
 * build, so the sum is deterministic rather than the ~4/3 approximation. */
function textureBytes(resource: TextureResource, size: { width: number; height: number }): number {
  const { width, height } = sizeAt(resource.size, size);
  const perPixel = BYTES_PER_PIXEL[resource.format] ?? DEFAULT_BYTES_PER_PIXEL;
  const samples = resource.samples ?? 1;
  if (resource.mips !== 'generate') return width * height * perPixel * samples;
  // A texture carrying a ladder keeps one sample a pixel, so samples does not
  // enter here: a multisampled texture has no mips by construction.
  let bytes = 0;
  let levelWidth = width;
  let levelHeight = height;
  for (;;) {
    bytes += levelWidth * levelHeight * perPixel;
    if (levelWidth === 1 && levelHeight === 1) break;
    levelWidth = Math.max(1, Math.floor(levelWidth / 2));
    levelHeight = Math.max(1, Math.floor(levelHeight / 2));
  }
  return bytes;
}

/** Whether a resource is transient: a texture or buffer the frame allocates with
 * no first contents of its own. A resource carrying `source` or `data` was
 * uploaded, so it is resident and its bytes are `arena.traffic()`'s; a uniform
 * block, a sampler, and geometry are not transient targets and are never counted
 * here. */
function transientBytesOf(resource: ResourceSpec, size: { width: number; height: number }): number {
  if (resource.kind === 'texture' && resource.source === undefined && resource.data === undefined) {
    return textureBytes(resource, size);
  }
  if (resource.kind === 'buffer' && resource.source === undefined && resource.data === undefined) {
    return resource.bytes;
  }
  return 0;
}

/** A stable string naming the resources a pipeline binds, so two passes binding
 * the same set hash together and are not counted as a bind switch. Sorted by
 * group then binding so the order a description lists them in does not matter. */
function bindKeyOf(spec: PipelineSpec): string {
  return spec.bindings
    .map((binding) => `${binding.group}:${binding.binding}:${binding.resource}:${binding.reads ?? ''}`)
    .sort()
    .join('|');
}

/**
 * The cost of one frame at one size, by structure alone. Pure and deterministic:
 * it touches no device and reads nothing but the graph and the size.
 */
export function cost(graph: FrameGraph, size: { width: number; height: number }): FrameCost {
  let draws = 0;
  let dispatches = 0;
  let pipelineSwitches = 0;
  let bindSwitches = 0;
  let attachmentLoads = 0;
  let attachmentStores = 0;

  let lastPipeline: PipelineHandle | undefined;
  let lastBindKey: string | undefined;
  // A key no pipeline can produce, so the first pass always reads as a switch.
  const NONE = '\0none';

  // Which of each pass's attachments the frame reads again and so must store,
  // read from the one home the executor reads it from (item 1). A store counts
  // here exactly where the card is asked for one there: an attachment nothing
  // reads afterwards is discarded rather than written back, and this is the
  // number that falls when it is.
  const stores = frameStores(graph);

  for (const [index, pass] of graph.passes.entries()) {
    const kept = stores[index]!;
    if (pass.pipeline !== lastPipeline) {
      pipelineSwitches += 1;
      lastPipeline = pass.pipeline;
    }
    const spec = graph.pipelines[indexOf(pass.pipeline)];
    const bindKey = spec ? bindKeyOf(spec) : NONE;
    if (bindKey !== lastBindKey) {
      bindSwitches += 1;
      lastBindKey = bindKey;
    }

    if (!isRenderPass(pass)) {
      dispatches += 1;
      continue;
    }

    // One draw per entry in the pass's list, an instanced or indirect draw
    // counted as one apiece (item 28), so a pass carrying many draws counts many
    // (item 26) where the one-draw-per-pass shape counted one.
    draws += pass.draws.length;

    // The colours this pass writes: the textures it names, or the frame's own
    // single target when it names none. The frame target is cleared each frame
    // and stored to be presented, so it loads nothing and stores once. A named
    // attachment stores only where a later pass, the swap, or the present reads
    // it — `kept.colour` — and discards otherwise.
    if (pass.colour) {
      pass.colour.forEach((attachment, at) => {
        if (attachment.clear === undefined) attachmentLoads += 1;
        if (kept.colour[at]) attachmentStores += 1;
        // The resolve target is written at the end of the pass whatever the
        // multisampled source does, so the average is one store even where the
        // samples it came from are discarded.
        if (attachment.resolve !== undefined) attachmentStores += 1;
      });
    } else {
      attachmentStores += 1;
    }

    // The depth attachment, if any. Which halves it keeps is the pipeline's
    // declared format, read the way `validate` and the executor read it, so each
    // half is counted only where the format has it — a half the format lacks
    // gets no op on the card and none here.
    if (pass.depth) {
      const depth = spec && spec.kind === 'render' ? (spec as RenderPipelineSpec).depth : undefined;
      const format = depth?.format;
      const keepsDepth = format ? format.startsWith('depth') : true;
      const keepsStencil = format ? format.includes('stencil') : false;
      // Each half stores only where a later pass tests against it, the swap
      // keeps it, or it is shown — `kept.depth`/`kept.stencil`, already false
      // where the format lacks the half — and discards otherwise, which is the
      // depth-buffer bandwidth a frame that never reads its depth again saves.
      if (keepsDepth) {
        if (pass.depth.clear === undefined) attachmentLoads += 1;
        if (kept.depth) attachmentStores += 1;
      }
      if (keepsStencil) {
        if (pass.depth.stencilClear === undefined) attachmentLoads += 1;
        if (kept.stencil) attachmentStores += 1;
      }
    }
  }

  let transientBytes = 0;
  for (const resource of graph.resources) transientBytes += transientBytesOf(resource, size);

  return {
    passes: graph.passes.length,
    draws,
    dispatches,
    pipelineSwitches,
    bindSwitches,
    attachmentLoads,
    attachmentStores,
    transientBytes,
  };
}
