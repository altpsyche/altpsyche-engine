/**
 * The pipeline cache: the static lifetime of [RoadToPureEngine.md](../docs/RoadToPureEngine.md) §5,
 * addressed by content rather than by name.
 *
 * A pipeline is what a compilation produces — the shader modules, the vertex
 * layout, the blend and depth state the card bakes into one object — and its one
 * fact is that it depends on nothing but its own structure. Two pipelines built
 * from the same source, the same entry points, the same formats, blend, depth and
 * vertex layout are the same pipeline, whatever the frame around them called them
 * or however many frames ask for one. So this cache is keyed on that structure and
 * on nothing else: a request carrying a structure a request already built returns
 * the handle that request got, and a request differing in any structural field
 * gets a handle of its own.
 *
 * This supersedes item 2's program cache key, which is why that narrower fix is
 * deleted rather than left beside this. Item 2 keyed a whole compiled *program* —
 * resources, pipelines and passes fused into one — on a `JSON.stringify` of all of
 * them, because the three lifetimes were fused in `createProgram` and the key had
 * to carry every fact any of them depended on or two frames sharing an id would
 * draw the wrong picture. The structure a *pipeline* depends on is the static
 * slice of that, held here; the resident and per-frame slices a program also bakes
 * in are what `frameKey` below still carries until [ROADMAP.md](../docs/ROADMAP.md)
 * items 13 and 15 take the program apart. One keyer, owned by the module that owns
 * pipeline structure, rather than two.
 *
 * Nothing is exported from the package door here: like the arena, the cache is a
 * mechanism the backend and the executor reach, not a type a consumer names.
 */
import type {
  PipelineSpec,
  FrameGraph,
  VertexResource,
  WgslRenderSource,
  GlslRenderSource,
} from '../graph/types.js';
import type { ModuleHandle } from '../graph/handles.js';
import { moduleOf, resourceOf } from '../graph/types.js';

/** The brand that stops a plain number being passed where a pipeline handle is
 * wanted. Erased at runtime — a handle is an index — and there only so the
 * compiler refuses a value this cache did not mint. */
declare const PIPELINE_HANDLE: unique symbol;

/** A branded integer naming one cached pipeline. */
export type PipelineHandle = number & { readonly [PIPELINE_HANDLE]: true };

/** The whole of what a pipeline depends on, resolved from the frame that named it
 * so the fact the card compiles is here rather than a name pointing at it. A
 * module is carried by its **text**, not by the name the frame gave it, so two
 * pipelines naming one document by different names key together and two naming one
 * name over different bodies key apart. The vertex layout is resolved from the
 * geometry the pipeline reads, because that layout is spent when the pipeline is
 * made. Everything else a card bakes in — entry points, formats and blend, depth
 * and stencil, sample count, the constants a rung lands — travels on `spec`. */
export interface PipelineStructure {
  kind: PipelineSpec['kind'];
  /** The source each stage runs and the entry point inside it, resolved to the
   * text the card compiles. A pipeline drawing the backend's own fullscreen
   * corners names no vertex document, so that stage is absent here. */
  stages: { code: string; entry: string }[];
  /** How one vertex is read out of the buffer this pipeline draws, absent where
   * it reads none. Stride and the attributes' locations, offsets and formats, the
   * three facts the card takes when the pipeline is made. */
  vertex?: { stride: number; attributes: VertexResource['attributes'] };
  /** What each binding points at, resolved to the facts the card bakes into the
   * bind-group layout: the resource's kind, and — for the kinds whose layout entry
   * turns on more than kind — the buffer's access and the texture's format and use.
   * Resolved here rather than left as the binding's resource *name* on `spec`
   * because a cache shared across programs keys two frames' pipelines together, and
   * two frames naming one binding over resources of different kinds build different
   * layouts from one otherwise-identical spec — the name alone would collapse them
   * and hand the second frame a layout built for the first's resource. A binding
   * whose resource the frame does not declare resolves to kind alone left absent,
   * the same leniency `stagesOf` keeps: the throw belongs where the layout is built
   * against the card, not where its key is taken. Optional so a structure built by
   * hand for a test — a string standing in for a compiled pipeline — need not carry
   * one; `pipelineStructureOf` always resolves it, empty where a pipeline binds
   * nothing, so every structure the backend keys through carries the field. */
  bindings?: { group: number; binding: number; kind?: string; access?: string; format?: string; use?: string }[];
  /** The pipeline specification itself, carrying every remaining structural fact:
   * formats and blend on `targets`, the depth and stencil state on `depth`, the
   * sample count on `samples`, the workgroup size on a compute pipeline, and the
   * bindings' own per-binding facts — `reads`, `perDraw`, visibility. Its module
   * *names* are here too, which is harmless: the codes above are what make two
   * identically-named but differently-bodied modules key apart, and `bindings`
   * above is what makes two identically-specced but differently-resourced layouts
   * key apart. */
  spec: PipelineSpec;
}

/** The stages a pipeline runs, resolved to the text the card compiles. A missing
 * module is left as empty text rather than thrown on: a structure with no code is
 * a distinct structure, and the throw belongs where the pipeline is actually built
 * against the card, not where its key is taken. */
function stagesOf(frame: FrameGraph, spec: PipelineSpec): { code: string; entry: string }[] {
  // A render pipeline carries its two stages' text on its own source (item 99), so
  // the text keying the pipeline is read straight off `spec.source` rather than
  // resolved through a shared `modules` pool. A compute pipeline still names its
  // module by `ModuleHandle`; its text is the WGSL field, GLSL ES 3.00 having no
  // compute stage. Each backend draws a frame already in its own language — a
  // WGSL-authored frame reaches WebGL 2 only after `glslFrameOf` turns it into a
  // GLSL one — so no bake map is read here.
  if (spec.kind === 'compute') {
    const module = moduleOf(frame, spec.compute.module);
    return [{ code: module ? (module as { wgsl: string }).wgsl : '', entry: spec.compute.entry }];
  }
  // A render pipeline's two stage texts live on its source pair (item 99/103), the
  // entry points and the fullscreen marker on the pipeline itself. The pair's arm
  // is the frame's `authored`, its single home (item 94): a WGSL frame compiles
  // `wgsl`, a GLSL frame `glsl` — a WGSL frame reaches WebGL 2 only after
  // `glslFrameOf` turns it into a GLSL one, so no bake map is read here. A pipeline
  // drawing the backend's own fullscreen corners names no vertex stage, so that
  // stage is absent from the key.
  const pair =
    frame.authored === 'wgsl'
      ? (spec.source as WgslRenderSource).wgsl
      : (spec.source as GlslRenderSource).glsl;
  const stages = [{ code: pair.fragment, entry: spec.fragment.entry }];
  if (spec.vertex) stages.unshift({ code: pair.vertex, entry: spec.vertex.entry });
  return stages;
}

/** The vertex layout a render pipeline's geometry imposes, resolved from the frame
 * so the layout rather than the name it points at is what keys the pipeline. */
function vertexOf(frame: FrameGraph, spec: PipelineSpec): PipelineStructure['vertex'] {
  if (spec.kind !== 'render' || spec.geometry === undefined) return undefined;
  const geometry = resourceOf(frame, spec.geometry);
  if (!geometry || geometry.kind !== 'vertices') return undefined;
  return { stride: geometry.stride, attributes: geometry.attributes };
}

/** What each binding's resource is, resolved to the facts a layout is built from
 * so the resolved kind rather than the name it points at keys the pipeline. A
 * binding pointing at a resource the frame does not declare carries its group and
 * binding alone, left for the layout build to throw on rather than thrown on here. */
function bindingsOf(frame: FrameGraph, spec: PipelineSpec): NonNullable<PipelineStructure['bindings']> {
  return spec.bindings.map((at) => {
    const fact: NonNullable<PipelineStructure['bindings']>[number] = { group: at.group, binding: at.binding };
    const resource = resourceOf(frame, at.resource);
    if (!resource) return fact;
    fact.kind = resource.kind;
    if (resource.kind === 'buffer') fact.access = resource.access;
    if (resource.kind === 'texture') {
      fact.format = resource.format;
      fact.use = resource.use.join(',');
    }
    return fact;
  });
}

/** The structure a frame's pipeline depends on, resolved from the frame. This is
 * where the module that owns pipeline structure decides what a pipeline is made
 * of, so a backend building one and this cache keying one agree by construction
 * rather than by two lists that could drift. */
export function pipelineStructureOf(frame: FrameGraph, spec: PipelineSpec): PipelineStructure {
  return {
    kind: spec.kind,
    stages: stagesOf(frame, spec),
    vertex: vertexOf(frame, spec),
    bindings: bindingsOf(frame, spec),
    spec,
  };
}

/** A canonical string for a structure. Deterministic for the plain data a
 * structure is: two structures equal field for field serialise identically, and a
 * difference in any field — a blend mode, a depth comparison, an attribute offset,
 * a byte of source — is a different string. There are no bulk byte arrays in a
 * pipeline structure (source is text and a vertex *layout* is not its data), so a
 * plain `JSON.stringify` carries no weight `frameKey` has to serialise compactly. */
export function structureKey(structure: PipelineStructure): string {
  return JSON.stringify(structure);
}

/** How many distinct pipeline structures one backend's shared cache keeps compiled
 * at once. A pipeline is card memory the backend does not free until it lets it go,
 * so a cache shared across every program the backend builds — the scene tier's many
 * programs sharing one material's pipeline over different meshes — would grow that
 * memory by one structure every time a new structure is seen were it never bounded.
 * The editing path is where new structures accumulate (a source recompiled on every
 * keystroke is a new structure each time); this is the window of recent structures
 * their reuse can still reach before eviction frees the stalest. It sits above the
 * renderer's `PROGRAM_CACHE_LIMIT` so a program cache full of distinct programs, each
 * carrying a pipeline of its own, does not evict a pipeline a still-warm program
 * holds. A card holds the pipeline as long as any live program references it whatever
 * this evicts; the bound governs reuse, not liveness. */
export const PIPELINE_CACHE_LIMIT = 64;

/**
 * The cache. Content-addressed: a structure keys to a handle, and a request
 * carrying a structure already seen returns that handle without building a second
 * pipeline. A handle is an integer the brand keeps a plain number from standing in
 * for, resolved through a map rather than an index so an eviction can drop a slot
 * without shifting the handles around it.
 *
 * Bounded (item 63). One cache is shared across every program a backend builds, so
 * two programs whose frames differ only in resident data share the one pipeline
 * their structures key to — but sharing across an unbounded lifetime is unbounded
 * card memory, so a cache built with a `bound` frees the least-recently-requested
 * structure when a new one would push it past that bound. A request that hits an
 * existing structure counts as touching it, so the pipeline drawn every frame is
 * never the one evicted. `onEvict` is where a backend whose pipeline needs an
 * explicit free (a `WebGLProgram`) hands it back; a backend whose pipeline the GC
 * reclaims (a `GPURenderPipeline`) passes none and eviction is a dropped reference.
 *
 * Generic over what a build returns, because the two backends compile different
 * objects — a `GPURenderPipeline` or a `GPUComputePipeline` on one, a linked
 * `WebGLProgram` on the other — and the cache holds whichever without knowing it,
 * the way the arena holds whichever resource without knowing it.
 */
export class PipelineCache<T> {
  /** What each handle resolves to. A map rather than an array so eviction can
   * remove one without renumbering the handles that outlive it. */
  private readonly held = new Map<PipelineHandle, T>();
  /** Which handle a structure already built, so a repeat request returns it rather
   * than building a second. Its insertion order is recency: a touched key is
   * re-inserted to the back, so the front is always the stalest and eviction takes
   * it from there. */
  private readonly byKey = new Map<string, PipelineHandle>();
  /** The next handle to mint, bumped once per build and never reused, so a handle
   * an eviction dropped never resolves to a later structure that took its place. */
  private minted = 0;
  private readonly bound: number;
  private readonly onEvict?: (value: T) => void;

  /** `bound` caps how many distinct structures stay compiled at once, defaulting to
   * no bound — a program-scoped cache lives and dies with its one program and needs
   * none. `onEvict` frees a pipeline the cache is dropping, for a backend whose
   * pipeline the GC does not reclaim on its own. */
  constructor(options: { bound?: number; onEvict?: (value: T) => void } = {}) {
    this.bound = options.bound ?? Infinity;
    this.onEvict = options.onEvict;
  }

  /** Returns the handle the structure is cached under, building it through `make`
   * the first time a structure is seen and returning the same handle every time
   * after. `make` runs once per distinct structure, so a caller may put the whole
   * cost of compilation inside it and trust a repeat request pays none of it. */
  request(structure: PipelineStructure, make: () => T): PipelineHandle {
    const key = structureKey(structure);
    const held = this.byKey.get(key);
    if (held !== undefined) {
      // Touched, so it moves to the back of the recency order and the stalest
      // stays at the front where eviction takes it.
      this.byKey.delete(key);
      this.byKey.set(key, held);
      return held;
    }
    const handle = this.minted++ as PipelineHandle;
    this.held.set(handle, make());
    this.byKey.set(key, handle);
    // The build just landed at the back, so a size over the bound evicts from the
    // front, which is the least recently requested and never the one just made.
    while (this.byKey.size > this.bound) {
      const stalest = this.byKey.entries().next().value;
      if (stalest === undefined) break;
      const [staleKey, staleHandle] = stalest;
      const value = this.held.get(staleHandle) as T;
      this.byKey.delete(staleKey);
      this.held.delete(staleHandle);
      this.onEvict?.(value);
    }
    return handle;
  }

  /** The pipeline a handle names. A handle this cache never minted — or one an
   * eviction has since dropped — is refused here rather than resolving to some
   * later structure, the way the arena refuses a handle it never handed out. */
  resolve(handle: PipelineHandle): T {
    if (!this.held.has(handle)) {
      throw new Error(`the pipeline cache was asked for handle ${handle}, which it never minted`);
    }
    return this.held.get(handle) as T;
  }

  /** How many distinct structures the cache currently holds. Read by a caller that
   * wants to know a repeat request built nothing new, and never above the bound. */
  get size(): number {
    return this.held.size;
  }

  /** Hand every held pipeline back and empty the cache, which a backend does when
   * it is disposed so the structures it shared do not outlive it. */
  clear(): void {
    for (const value of this.held.values()) this.onEvict?.(value);
    this.held.clear();
    this.byKey.clear();
  }
}

/** How a byte array is written into a program key: its bytes as a Latin-1 string,
 * one character per byte, rather than the `{"0":1,"1":2,…}` a plain
 * `JSON.stringify` turns a `Uint8Array` into. Both are exact and neither collides,
 * but the object form measured 10.7 times the byte count on a thousand-cube buffer
 * and this measures about one, which is the cost item 2's key carried and this
 * does not. Written in chunks because spreading a whole large array into
 * `fromCharCode` overflows the call stack. */
function bytesToLatin1(bytes: Uint8Array): string {
  let out = '';
  const CHUNK = 0x8000;
  for (let index = 0; index < bytes.length; index += CHUNK) {
    out += String.fromCharCode(...bytes.subarray(index, index + CHUNK));
  }
  return out;
}

/** A canonical, exact string for the resident and per-frame data a program bakes
 * in beside its pipelines. `JSON.stringify` with a replacer that catches the one
 * kind of bulk bytes a frame carries — a resource's `data` — and writes it
 * compactly rather than as a per-index object. Exact: two values equal field for
 * field, bytes included, serialise identically. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, held) =>
    held instanceof Uint8Array ? { $bytes: bytesToLatin1(held) } : held
  );
}

/**
 * The key a compiled program is cached under, which is what replaces item 2's
 * inline key in the renderer. A program fuses three lifetimes, so its key carries
 * all three: the static one as the structure key of each pipeline the frame names,
 * the resident one as the resources it allocates, and the per-frame one as the
 * passes it records, plus what it presents and what it swaps. Two frames equal in
 * every one of those are one program; a difference in any is two, which is what
 * keeps a frame from being handed a program built for another with the wrong
 * resources under it.
 *
 * The pipeline structures are keyed through the cache's own `structureKey`, so the
 * static slice of a program's key is decided by the module that owns pipeline
 * structure rather than by a second serialisation the two could disagree on. The
 * modules are carried whole as well, so a document the frame declares but no
 * pipeline names still separates two frames. When items 13 and 15 move resource
 * and pipeline ownership out of `createProgram`, the resident and per-frame slices
 * here move to the arena's and the executor's handles and this composite key goes
 * with them.
 */
export function frameKey(frame: FrameGraph): string {
  const pipelines = frame.pipelines.map((spec) => structureKey(pipelineStructureOf(frame, spec)));
  // One canonical serialisation over an array, rather than joined field strings,
  // so the boundary between two fields is the array's own structure and no id or
  // byte carrying a separator character can make two frames' fields run together
  // into one matching key.
  return canonical([
    frame.id,
    frame.modules,
    pipelines,
    frame.resources,
    frame.passes,
    frame.present ?? null,
    frame.swap ?? null,
  ]);
}
