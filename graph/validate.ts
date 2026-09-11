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
 * ROADMAP.md item 19. What is *not* here is a rule that only
 * ever had one home: the source-against-declaration checks the build alone can
 * make (a texture the source never samples, a binding no resource backs) stay in
 * the build, because a graph carries no source to check them against.
 */
import type { FrameGraph, ResourceSpec, TextureResource } from './types.js';
import { isRenderPass, perDrawBinding, resourceOf, drawsCorners, drawsIndirectly, groupsIndirectly } from './types.js';
import type { BufferHandle, ModuleHandle, PipelineHandle, ResourceHandle } from './handles.js';
import { indexOf } from './handles.js';
import { followsFrame } from './refs.js';

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

  // Which draw form a pass may use, decided by whether its pipeline names geometry.
  //
  // `DrawSpec` reads as three interchangeable shapes and they are not: `{ vertices }`
  // is the backend's own corners, `{ instances }` is the geometry the pipeline names
  // drawn that many times over, and the count of vertices in that second case is the
  // resource's. So each form belongs to one kind of pipeline, and the pairing the
  // type allows but nothing meant is a frame that draws nothing or draws wrong.
  //
  // **Neither rule is new and that is the finding** (item 10). The first was refused
  // by WebGL 2 alone — "mixes its own corners into the geometry" — and WebGPU refused
  // it not at all, so a description that drew on one backend was thrown out of the
  // other and `resolve` and `cost` passed it either way. The second was refused
  // twice, by `submit/plan.ts` for WebGPU and by `gpu/webgl2.ts` for WebGL 2, in two
  // different sentences for one rule. Both are stated here once, in words that name
  // neither backend, and what is left in the two backends are unreachable backstops.
  //
  // **What did not move with them.** WebGL 2's second throw covers an indirect draw
  // on a geometry-less pipeline as well, and that half is a capability refusal rather
  // than a shape rule: `drawIndirect` reads its vertex count out of the buffer, so it
  // is a description WebGPU draws correctly and WebGL 2 has no call for. It stays in
  // that backend with the capability it names.
  for (const pass of graph.passes) {
    if (!isRenderPass(pass)) continue;
    const pipeline = indexOf(pass.pipeline);
    const spec = graph.pipelines[pipeline];
    if (!spec || spec.kind !== 'render') continue;
    const namesGeometry = spec.geometry !== undefined;
    for (const draw of pass.draws) {
      // A pipeline reading a vertex buffer, drawn by the one form that never binds
      // one. The card refuses this after the fact and names neither the draw nor the
      // pipeline — "Vertex buffer slot 0 required by [RenderPipeline (unlabeled)] was
      // not set" — and `cost` costs it as a draw that happens, so a caller holding
      // both pure readings has no way to know the frame cannot draw.
      if (namesGeometry && drawsCorners(draw)) {
        throw new Error(
          `the pass on pipeline ${pipeline} draws ${draw.vertices} corners of its own and its pipeline reads geometry from resource ${indexOf(spec.geometry!)}`
        );
      }
      // The other way round: a draw naming instances alone, on a pipeline with no
      // geometry to instance. There is no count of vertices anywhere — the form
      // leaves it to the resource and the pipeline names no resource — so the
      // executor reaches none of its three arms and the draw is silently skipped.
      //
      // **The wording is `submit/plan.ts`'s own**, kept rather than replaced. That
      // rule was already written twice — there for WebGPU and in `gpu/webgl2.ts` in
      // different words for WebGL 2 — so this is a move of the better-worded of the
      // two rather than a third sentence for one rule, and the test that held it
      // still holds it here.
      if (!namesGeometry && !drawsCorners(draw) && !drawsIndirectly(draw)) {
        throw new Error(`the pass on pipeline ${pipeline} draws its pipeline's geometry and that pipeline reads none`);
      }
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

  shapes(graph);
}

/**
 * What a declared texture may and may not be, in one wording (item 4).
 *
 * **These six were written once in each backend and two of them had already
 * drifted.** Five appeared in both, in near enough the same sentence that the drift
 * was unreadable rather than obvious; the sixth — a ladder over a texture with no
 * contents to build it from — was in WebGL 2 alone, so a WebGPU frame asking for one
 * was built rather than refused. A seventh, that the shown resource is a texture the
 * frame declares, turned out to be here already and is discussed below. The two that had drifted both
 * turned on what *contents* means, settled at this item's step 1: `data` or
 * `source`, because a description is refused for what it says and not for how far
 * its fetch has got. `graph/types.ts` says the build writes `source`, the address
 * the first contents come from, and the runtime fills `data`, the bytes that came
 * back, so a description in hand before its fetch carries the first alone — and
 * reading `data` alone made the same description refused after its fetch and drawn
 * before it.
 *
 * **Where a predicate differed, the broader one is here**, because each of the two
 * was a narrowing of the same rule rather than a different rule. A ladder is refused
 * over a texture a pass writes, and WebGPU counted a storage texture among those
 * where WebGL 2 counted only an attachment: a storage texture is written every
 * frame, so a ladder over one is as stale as a ladder over an attachment, and WebGL
 * 2's narrower form was unreachable there rather than deliberate — that backend
 * refuses a storage texture outright for want of compute. A multisample texture is
 * refused to a shader, and the same pair applies for the same reason.
 *
 * **What did not move, and why each stayed.** WebGL 2's refusal of a *multisampled
 * depth* says "this backend keeps one" in its own words and means it: WebGPU draws a
 * multisampled depth attachment, so that is a capability answer belonging to the
 * backend that lacks it rather than a rule about a description. A texture declared
 * in a depth format being a renderbuffer rather than a colour texture is the same
 * shape of thing. Neither is a rule two backends could disagree about, which is what
 * this file is for.
 *
 * A rule here fires before either backend builds anything: the WebGL 2 path calls
 * `validate` directly and the WebGPU path reaches it through `submit/plan.ts`, so
 * one wording refuses one description on both cards.
 */
function shapes(graph: FrameGraph): void {
  const id = graph.id;
  const textures: { index: number; texture: TextureResource }[] = [];
  graph.resources.forEach((resource, index) => {
    if (resource.kind === 'texture') textures.push({ index, texture: resource });
  });

  // **That the shown resource is a texture the frame declares is not checked here**,
  // and finding out why changed what this item moved. Both backends refused it in
  // their own words — "shows a resource N it does not declare" in one and "shows
  // resource N it does not declare" in the other — and the handle safety net at the
  // top of `validate` had been refusing it all along as `presents resource N, which
  // it does not declare`, covering the undeclared index and the declared-but-not-a-
  // texture case in one sentence. So that rule had three homes and one of them was
  // already the right one: the two backend copies are deleted rather than moved, and
  // this item moves six rules and not seven.
  const shownIndex = graph.present === undefined ? undefined : indexOf(graph.present);

  for (const { index, texture } of textures) {
    // A ladder is generated off resident contents (item 50): the card averages every
    // level below the first through `generateMipmap` or its WebGPU equivalent. A
    // ladder over a texture a pass writes would be the levels of whatever was in it
    // when it was built, so every frame after the first would read a ladder of a
    // picture that is gone — right for one frame and wrong thereafter, which is
    // worse than refused.
    if (texture.mips && (texture.use.includes('storage') || texture.use.includes('attachment'))) {
      throw new Error(`the frame for "${id}" gives resource ${index} a ladder and writes it every frame`);
    }
    // And a ladder over a texture with no contents at all has nothing to average.
    // This was WebGL 2's alone until item 4 moved it, so WebGPU built the levels of
    // an empty texture and reported nothing.
    if (texture.mips && !texture.data && !texture.source) {
      throw new Error(`the frame for "${id}" gives resource ${index} a ladder and no contents to build it from`);
    }

    // A texture keeping several samples of a pixel is a multisample colour
    // attachment (item 80) and the narrowest kind there is, so everything else is
    // closed to it: nothing writes bytes into one from outside, nothing copies out of
    // one, and a shader reads one only through a binding declared as multisampled,
    // which no source here has. Each of these is a call a card refuses over a usage
    // flag or a copy size rather than over the name the description gave it.
    if (texture.samples !== undefined) {
      if (texture.data || texture.source) {
        throw new Error(`the frame for "${id}" gives resource ${index} contents and several samples a pixel`);
      }
      if (texture.use.includes('sample') || texture.use.includes('storage')) {
        throw new Error(`the frame for "${id}" binds resource ${index}, which keeps several samples a pixel`);
      }
      if (index === shownIndex) {
        throw new Error(`the frame for "${id}" shows resource ${index}, which keeps several samples a pixel`);
      }
    }

    // Contents and the frame's own size are a contradiction: the contents are a
    // fixed-size image that arrives once, and a texture following the frame is thrown
    // away and remade on every resize. Left alone it uploads bytes of one size into a
    // texture of another, which a card reports as a copy out of range and no reader
    // would trace back to the description.
    if ((texture.data || texture.source) && followsFrame(texture.size)) {
      throw new Error(
        `the frame for "${id}" gives resource ${index} contents and the frame's own size, which is thrown away on a resize`
      );
    }
  }
}
