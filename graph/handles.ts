/**
 * The handles a graph is written in terms of: the authoring side of
 * [RoadToPureEngine.md](../docs/RoadToPureEngine.md) §8.
 *
 * A handle is a branded integer — the **index** of the thing it names in the
 * graph's own list. A resource handle indexes `FrameGraph.resources`, a module
 * handle `FrameGraph.modules`, a pipeline handle `FrameGraph.pipelines`. That is
 * what lets a graph stay a plain JSON value while misuse — a texture handle where
 * a buffer one was wanted — is a compile error rather than a map miss at draw
 * time. The brand carries the **kind** as well, so the two handle families cannot
 * be crossed: a `BufferHandle` and a `TextureHandle` are both numbers and neither
 * is the other, and a backend that once kept a `Map<string, …>` per kind now
 * indexes one list by the handle (item 87).
 *
 * These are the names a producer uses. They are not the arena's own `Handle`
 * (that one is minted at allocation and carries a generation), nor the pipeline
 * cache's `PipelineHandle`; the same integer travels under an authoring brand
 * here and a runtime brand there, and the two unify as the graph's resource
 * handles become the arena's in Stage 2 (see item 16's row in
 * [JOURNAL.md](../docs/JOURNAL.md)). The cast from an authoring handle to a
 * device resource lives in the backend (and, in Stage 2, in `FrameResources`),
 * never in `graph/`.
 *
 * Imports nothing, per §7 rule 1: `graph/` is types plus pure functions over
 * them, which is what makes a graph serializable, comparable and sendable to a
 * worker.
 */

/** The brand that carries a handle's kind. Erased at runtime — a handle is an
 * integer index — and there only so the compiler refuses a number the graph did
 * not mint and refuses one kind of handle where another was wanted. */
declare const KIND: unique symbol;

/** A branded integer naming one member of a graph list by its index. */
export type Handle<K extends string> = number & { readonly [KIND]: K };

/** One resource of `FrameGraph.resources`, by kind. Every one of these indexes
 * the same `resources` list; the brand is the only thing keeping a texture index
 * out of a field wanting a buffer one. */
export type BufferHandle = Handle<'buffer'>;
export type TextureHandle = Handle<'texture'>;
export type SamplerHandle = Handle<'sampler'>;
export type UniformHandle = Handle<'uniform'>;
export type VertexHandle = Handle<'vertices'>;
export type IndexHandle = Handle<'indices'>;

/** A reference to any resource, whatever its kind — the polymorphic arm a
 * binding takes, since one binding may name a uniform block, a texture, a sampler
 * or a storage buffer and the kind is the resource's own, checked where the
 * binding is resolved. It is the union of the specific handles so a
 * `TextureHandle` is assignable to a field wanting "any resource" while a raw
 * number still is not. */
export type ResourceHandle = BufferHandle | TextureHandle | SamplerHandle | UniformHandle | VertexHandle | IndexHandle;

/** One document of `FrameGraph.modules`, by its index in that list. */
export type ModuleHandle = Handle<'module'>;

/** One pipeline of `FrameGraph.pipelines`, by its index in that list. */
export type PipelineHandle = Handle<'pipeline'>;

/** Which transient a ref points at, as an index into the graph's own
 * `transients` list. A transient has no resident handle because it is not
 * arena-allocated: the graph declares it by descriptor and `submit/` allocates
 * it, so the id is how a ref names one of the descriptors the graph carries. */
export type TransientId = Handle<'transient'>;

/** Brand a plain index as a handle of a given kind. The one place a number
 * becomes a handle, so a producer writes `texture(1)` rather than `1 as
 * TextureHandle` at every reference and a reviewer greps one name. Erased at
 * runtime — each returns its argument. */
export const texture = (index: number): TextureHandle => index as TextureHandle;
export const buffer = (index: number): BufferHandle => index as BufferHandle;
export const sampler = (index: number): SamplerHandle => index as SamplerHandle;
export const uniform = (index: number): UniformHandle => index as UniformHandle;
export const vertices = (index: number): VertexHandle => index as VertexHandle;
export const indices = (index: number): IndexHandle => index as IndexHandle;
export const moduleHandle = (index: number): ModuleHandle => index as ModuleHandle;
export const pipelineHandle = (index: number): PipelineHandle => index as PipelineHandle;

/** Read a handle back as the plain index it is, for the one caller that needs the
 * number rather than the brand — an array lookup `list[indexOf(handle)]`. Erased
 * at runtime. */
export const indexOf = (handle: Handle<string>): number => handle as number;
