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
import type { PipelineSpec, ShaderFrame, VertexResource } from '../graph/types.js';
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
 * and stencil, sample count, the overrides a rung lands — travels on `spec`. */
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
  /** The pipeline specification itself, carrying every remaining structural fact:
   * formats and blend on `targets`, the depth and stencil state on `depth`, the
   * sample count on `samples`, the workgroup size on a compute pipeline, and the
   * binding layout the groups are built against. Its module *names* are here too,
   * which is harmless: the codes above are what make two identically-named but
   * differently-bodied modules key apart. */
  spec: PipelineSpec;
}

/** The stages a pipeline runs, resolved to the text the card compiles. A missing
 * module is left as empty text rather than thrown on: a structure with no code is
 * a distinct structure, and the throw belongs where the pipeline is actually built
 * against the card, not where its key is taken. */
function stagesOf(frame: ShaderFrame, spec: PipelineSpec): { code: string; entry: string }[] {
  const resolve = (named: { module: string; entry: string }) => ({
    code: moduleOf(frame, named.module)?.code ?? '',
    entry: named.entry,
  });
  if (spec.kind === 'compute') return [resolve(spec.compute)];
  const stages = [resolve(spec.fragment)];
  if (spec.vertex !== 'fullscreen') stages.unshift(resolve(spec.vertex));
  return stages;
}

/** The vertex layout a render pipeline's geometry imposes, resolved from the frame
 * so the layout rather than the name it points at is what keys the pipeline. */
function vertexOf(frame: ShaderFrame, spec: PipelineSpec): PipelineStructure['vertex'] {
  if (spec.kind !== 'render' || spec.geometry === undefined) return undefined;
  const geometry = resourceOf(frame, spec.geometry);
  if (!geometry || geometry.kind !== 'vertices') return undefined;
  return { stride: geometry.stride, attributes: geometry.attributes };
}

/** The structure a frame's pipeline depends on, resolved from the frame. This is
 * where the module that owns pipeline structure decides what a pipeline is made
 * of, so a backend building one and this cache keying one agree by construction
 * rather than by two lists that could drift. */
export function pipelineStructureOf(frame: ShaderFrame, spec: PipelineSpec): PipelineStructure {
  return { kind: spec.kind, stages: stagesOf(frame, spec), vertex: vertexOf(frame, spec), spec };
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

/**
 * The cache. Content-addressed: a structure keys to a handle, and a request
 * carrying a structure already seen returns that handle without building a second
 * pipeline. A handle is an index into the slots the builds landed in, so resolving
 * one is an array read and the brand is what keeps a plain number out.
 *
 * Generic over what a build returns, because the two backends compile different
 * objects — a `GPURenderPipeline` or a `GPUComputePipeline` on one, a linked
 * `WebGLProgram` on the other — and the cache holds whichever without knowing it,
 * the way the arena holds whichever resource without knowing it.
 */
export class PipelineCache<T> {
  /** What each handle resolves to, in the order the builds landed. */
  private readonly slots: T[] = [];
  /** Which handle a structure already built, so a repeat request returns it rather
   * than building a second. */
  private readonly byKey = new Map<string, PipelineHandle>();

  /** Returns the handle the structure is cached under, building it through `make`
   * the first time a structure is seen and returning the same handle every time
   * after. `make` runs once per distinct structure, so a caller may put the whole
   * cost of compilation inside it and trust a repeat request pays none of it. */
  request(structure: PipelineStructure, make: () => T): PipelineHandle {
    const key = structureKey(structure);
    const held = this.byKey.get(key);
    if (held !== undefined) return held;
    const handle = this.slots.length as PipelineHandle;
    this.slots.push(make());
    this.byKey.set(key, handle);
    return handle;
  }

  /** The pipeline a handle names. A handle this cache never minted is refused here
   * rather than resolving to whatever sits at that index, the way the arena refuses
   * a handle it never handed out. */
  resolve(handle: PipelineHandle): T {
    if (handle < 0 || handle >= this.slots.length) {
      throw new Error(`the pipeline cache was asked for handle ${handle}, which it never minted`);
    }
    return this.slots[handle] as T;
  }

  /** How many distinct structures the cache has built, which is one per handle it
   * has minted. Read by a caller that wants to know a repeat request built nothing
   * new without reaching into the slots. */
  get size(): number {
    return this.slots.length;
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
export function frameKey(frame: ShaderFrame): string {
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
