/**
 * The two frame-attachment analyses of ROADMAP.md item 1,
 * kept pure and device-free so `cost()` reads one of them and the executor reads
 * both without either restating the rule (item 19's discipline).
 *
 * `frameStores` is the **discard** half: an attachment whose contents nothing
 * reads after the pass that wrote them need not be stored, so the card is asked
 * to discard it rather than write it back — the read bandwidth a tiling GPU pays
 * and item 1 exists to reduce. A discard is only ever correct where the analysis
 * can *prove* nothing reads the attachment afterwards, so this errs to keeping:
 * an attachment is stored unless it is provably dead, which is the safe
 * direction — storing what nothing reads wastes bandwidth, discarding what
 * something reads is a wrong picture.
 *
 * `mergeGroups` is the **merge** half: two passes over one attachment set, where
 * the second builds on the first (loads rather than clears) and neither depends
 * on the other through a sampled read, are one render pass with two draws rather
 * than two passes. That is fewer `beginRenderPass` calls, which the recording
 * double counts — the instrument item 1's pass-merge half moves. Merging is
 * pixel-identical by construction: two draws into one attachment inside one
 * render pass see each other's colour and depth writes exactly as two draws in
 * two passes do, because the card orders raster operations within a pass. The
 * one thing that shape cannot carry is the second pass *sampling* the first's
 * output, which needs a pass boundary; the hazard check below refuses to merge
 * across one.
 *
 * Both read the graph alone — no device, no arena — so they return the same
 * answer on any machine, and `cost()` can assert the store count and a trace can
 * assert the pass count with neither a card nor a browser.
 */
import type { RenderPassSpec, FrameGraph } from './types.js';
import { isRenderPass } from './types.js';
import { indexOf } from './handles.js';

/** Whether each attachment a render pass writes is kept — stored — or may be
 * discarded. `colour` is one flag per colour attachment in the pass's order; a
 * pass writing the frame target rather than textures of its own carries a single
 * `true`, since the frame the reader sees is always presented. `depth` and
 * `stencil` are the two halves of a depth attachment, each already false where
 * the format keeps no such half, so a caller reads the flag without re-deriving
 * which halves the format has. A compute pass keeps nothing here. */
export interface PassStore {
  colour: boolean[];
  depth: boolean;
  stencil: boolean;
}

const NONE: PassStore = { colour: [], depth: false, stencil: false };

/** Which halves a pass's depth attachment keeps, read off its pipeline's declared
 * format the same way `cost` and the executor read it: a depth op only over a
 * depth format, a mask only over a stencil one. A pass keeping depth with no
 * declared format defaults to keeping the depth half, mirroring `cost`. The
 * pipeline is resolved by the pass's `PipelineHandle` — its index in
 * `frame.pipelines` — rather than by a name. */
function halvesOf(pass: RenderPassSpec, frame: FrameGraph): { depth: boolean; stencil: boolean } {
  const spec = frame.pipelines[indexOf(pass.pipeline)];
  const format = spec?.kind === 'render' ? spec.depth?.format : undefined;
  return {
    depth: format ? format.startsWith('depth') : true,
    stencil: format ? format.includes('stencil') : false,
  };
}

/**
 * Per pass, which of its attachments the frame reads again afterwards and so must
 * store. Indexed to match `frame.passes`; a compute pass reads as `NONE`.
 *
 * An attachment at index `R` written at pass `i` is kept when any of these can be
 * shown: `R` is the frame's `present`ed picture, `R` is one of a `swap` pair (so
 * the next frame reads it), or some later pass reads it — by loading it as an
 * attachment of the same kind (colour, depth half, or stencil half), or by
 * binding it at all. The bind test is deliberately coarse: any binding of `R` in
 * a later pass keeps `R`, whether that binding samples it or overwrites it,
 * because over-keeping only costs bandwidth while under-keeping is a wrong
 * picture. Everything not shown to be read is discarded.
 *
 * The Sets below hold resource *indices* — `indexOf(handle)` — since a resource
 * has no name to key by; two references are the same resource exactly when their
 * handles carry the same index.
 */
export function frameStores(frame: FrameGraph): PassStore[] {
  const present = frame.present === undefined ? undefined : indexOf(frame.present);
  const swapped = new Set<number>();
  for (const [one, other] of frame.swap ?? []) {
    swapped.add(indexOf(one));
    swapped.add(indexOf(other));
  }

  const halves = (pass: RenderPassSpec) => halvesOf(pass, frame);

  /** Whether any pass after `after` binds resource index `resource` — samples it
   * or writes it as a storage resource — which reads what an earlier pass left in
   * it. */
  const boundAfter = (resource: number, after: number): boolean => {
    for (let j = after + 1; j < frame.passes.length; j++) {
      const spec = frame.pipelines[indexOf(frame.passes[j]!.pipeline)];
      if (spec?.bindings.some((binding) => indexOf(binding.resource) === resource)) return true;
    }
    return false;
  };

  /** Whether any later pass loads resource index `resource` as a colour attachment
   * — keeps and reads what an earlier pass wrote rather than clearing over it. */
  const colourLoadedAfter = (resource: number, after: number): boolean => {
    for (let j = after + 1; j < frame.passes.length; j++) {
      const pass = frame.passes[j]!;
      if (isRenderPass(pass) && pass.colour?.some((a) => indexOf(a.resource) === resource && a.clear === undefined))
        return true;
    }
    return false;
  };

  /** Whether any later pass loads the depth or stencil half of resource index
   * `resource`. Which half is asked separately, since a pass may load one and
   * clear the other. */
  const depthLoadedAfter = (resource: number, after: number, half: 'depth' | 'stencil'): boolean => {
    for (let j = after + 1; j < frame.passes.length; j++) {
      const pass = frame.passes[j]!;
      if (!isRenderPass(pass) || pass.depth === undefined || indexOf(pass.depth.resource) !== resource) continue;
      const keeps = halves(pass);
      if (half === 'depth' && keeps.depth && pass.depth.clear === undefined) return true;
      if (half === 'stencil' && keeps.stencil && pass.depth.stencilClear === undefined) return true;
    }
    return false;
  };

  const keptColour = (resource: number, i: number) =>
    present === resource || swapped.has(resource) || colourLoadedAfter(resource, i) || boundAfter(resource, i);
  const keptDepth = (resource: number, i: number) =>
    present === resource || swapped.has(resource) || depthLoadedAfter(resource, i, 'depth') || boundAfter(resource, i);
  const keptStencil = (resource: number, i: number) =>
    present === resource ||
    swapped.has(resource) ||
    depthLoadedAfter(resource, i, 'stencil') ||
    boundAfter(resource, i);

  return frame.passes.map((pass, i): PassStore => {
    if (!isRenderPass(pass)) return NONE;
    const keeps = pass.depth ? halves(pass) : { depth: false, stencil: false };
    return {
      // A pass naming its own textures keeps each only where it is read again; a
      // pass writing the frame target keeps that one, since the frame is shown.
      colour: pass.colour ? pass.colour.map((a) => keptColour(indexOf(a.resource), i)) : [true],
      depth: pass.depth ? keeps.depth && keptDepth(indexOf(pass.depth.resource), i) : false,
      stencil: pass.depth ? keeps.stencil && keptStencil(indexOf(pass.depth.resource), i) : false,
    };
  });
}

/**
 * Consecutive passes grouped into the render passes they can share, as lists of
 * indices into `frame.passes`. A group of one is a pass drawn on its own; a group
 * of several is one `beginRenderPass` replaying every group member's draws in
 * order. Passes that cannot merge are groups of one, so the grouping always
 * covers every pass exactly once and in order.
 *
 * A pass `q` joins the group ending at pass `p` only where merging is provably
 * safe and pixel-identical to drawing them apart:
 *
 * - both draw named colour attachments (never the frame target, whose backend
 *   clear would wipe an earlier pass's work), the same textures in the same
 *   order, with no multisample resolve;
 * - `q` loads every attachment it shares — clears none — so it builds on `p`'s
 *   result rather than starting the attachment over;
 * - neither carries a per-pass query (a timestamp or an occlusion count), which
 *   is taken over one pass and cannot span two draws, nor a stencil reference,
 *   which is pass state a bundle cannot replay;
 * - and `q` binds none of the attachments any earlier group member wrote, nor
 *   their swap partners — the one dependency that needs a pass boundary rather
 *   than raster ordering, and so the one that forbids the merge.
 */
export function mergeGroups(frame: FrameGraph): number[][] {
  const partner = new Map<number, number>();
  for (const [one, other] of frame.swap ?? []) {
    partner.set(indexOf(one), indexOf(other));
    partner.set(indexOf(other), indexOf(one));
  }

  /** Whether a pass can be a group member at all: a render pass drawing its own
   * colour attachments, with no resolve, query, or stencil, whose every mergeable
   * neighbour joins it by the pairwise test below. The pipeline is resolved by the
   * pass's `PipelineHandle`. */
  const mergeable = (index: number): boolean => {
    const pass = frame.passes[index]!;
    const spec = frame.pipelines[indexOf(pass.pipeline)];
    if (!isRenderPass(pass) || spec?.kind !== 'render') return false;
    return (
      pass.colour !== undefined &&
      pass.colour.every((a) => a.resolve === undefined) &&
      pass.visible === undefined &&
      pass.timed === undefined &&
      spec.samples === undefined &&
      spec.depth?.stencil === undefined
    );
  };

  /** Whether `q` may join a group that has already written the attachment indices
   * in `written`, given the group's head pass `p` for the attachment-set match. */
  const joins = (p: RenderPassSpec, q: RenderPassSpec, written: Set<number>): boolean => {
    // The same colour attachments in the same order — a bundle recorded for one
    // set replays into the other, and the merged pass opens them once.
    const pc = p.colour ?? [];
    const qc = q.colour ?? [];
    if (pc.length !== qc.length) return false;
    if (!qc.every((a, k) => indexOf(a.resource) === indexOf(pc[k]!.resource))) return false;
    // q builds on what is there rather than clearing it, or the merge would lose
    // the earlier draws it clears over.
    if (!qc.every((a) => a.clear === undefined)) return false;
    // The depth attachment matches and q loads it too, or neither keeps depth.
    if ((p.depth === undefined) !== (q.depth === undefined)) return false;
    if (p.depth && q.depth) {
      if (indexOf(q.depth.resource) !== indexOf(p.depth.resource)) return false;
      if (q.depth.clear !== undefined || q.depth.stencilClear !== undefined) return false;
    }
    // q must not sample or otherwise bind anything an earlier group member wrote,
    // nor its swap partner: that read needs a pass boundary the merge removes.
    const qSpec = frame.pipelines[indexOf(q.pipeline)];
    for (const binding of qSpec?.bindings ?? []) {
      const resource = indexOf(binding.resource);
      if (written.has(resource)) return false;
      const twin = partner.get(resource);
      if (twin !== undefined && written.has(twin)) return false;
    }
    return true;
  };

  const writesOf = (pass: RenderPassSpec): number[] => [
    ...(pass.colour?.map((a) => indexOf(a.resource)) ?? []),
    ...(pass.depth ? [indexOf(pass.depth.resource)] : []),
  ];

  const groups: number[][] = [];
  let current: number[] | null = null;
  let written = new Set<number>();

  for (let i = 0; i < frame.passes.length; i++) {
    const pass = frame.passes[i]!;
    if (!mergeable(i)) {
      if (current) groups.push(current);
      groups.push([i]);
      current = null;
      written = new Set();
      continue;
    }
    const render = pass as RenderPassSpec;
    if (current && joins(frame.passes[current[0]!] as RenderPassSpec, render, written)) {
      current.push(i);
    } else {
      if (current) groups.push(current);
      current = [i];
      written = new Set();
    }
    for (const resource of writesOf(render)) written.add(resource);
  }
  if (current) groups.push(current);
  return groups;
}
