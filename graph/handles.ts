/**
 * The handles a graph is written in terms of: the authoring side of
 * [RoadToPureEngine.md](../docs/RoadToPureEngine.md) §8.
 *
 * A handle is a branded integer, which is what lets a graph stay a plain JSON
 * value while misuse — a texture handle where a buffer one was wanted — is a
 * compile error rather than a map miss at draw time. The brand carries the
 * **kind** as well, so the two handle families cannot be crossed: a
 * `BufferHandle` and a `TextureHandle` are both numbers and neither is the
 * other.
 *
 * These are the names a producer uses. They are not the arena's own `Handle`
 * (that one is minted at allocation and carries a generation), nor the pipeline
 * cache's `PipelineHandle`; the same integer travels under an authoring brand
 * here and a runtime brand there, and the two unify as the graph's resource
 * names become handles in Stage 2 (see item 16's row in
 * [JOURNAL.md](../docs/JOURNAL.md)). This file only introduces the arms `Ref`
 * needs — a resident buffer, a resident texture, and a transient — because
 * those are what item 17 gives `Ref`; the remaining §8 handles land with the
 * call sites that name them.
 *
 * Imports nothing, per §7 rule 1: `graph/` is types plus pure functions over
 * them, which is what makes a graph serializable, comparable and sendable to a
 * worker.
 */

/** The brand that carries a handle's kind. Erased at runtime — a handle is an
 * integer — and there only so the compiler refuses a number the graph did not
 * mint and refuses one kind of handle where another was wanted. */
declare const KIND: unique symbol;

/** A branded integer naming one resource of a given kind. */
export type Handle<K extends string> = number & { readonly [KIND]: K };

export type BufferHandle = Handle<'buffer'>;
export type TextureHandle = Handle<'texture'>;

/** Which transient a ref points at, as an index into the graph's own
 * `transients` list. A transient has no resident handle because it is not
 * arena-allocated: the graph declares it by descriptor and `submit/` allocates
 * it, so the id is how a ref names one of the descriptors the graph carries. */
export type TransientId = Handle<'transient'>;
