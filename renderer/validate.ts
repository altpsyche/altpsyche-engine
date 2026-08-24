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
import type { ShaderFrame } from './types.js';
import { isRenderPass } from './types.js';

/** How many bytes one query answer takes in the buffer a pass resolves it into.
 * A timestamp and an occlusion count are each this wide. */
const QUERY_BYTES = 8;

/** A timed pass writes a time at each end of itself, so it resolves two of them. */
const TIMED_QUERY_BYTES = 2 * QUERY_BYTES;

/** A visible pass counts the samples of its draw that got through, which is one
 * answer. */
const VISIBLE_QUERY_BYTES = QUERY_BYTES;

/**
 * Refuse a graph the card would draw wrong or reject obscurely. Throws with the
 * name the description gave the offending piece; returns nothing when the graph
 * is sound.
 */
export function validate(graph: ShaderFrame): void {
  const id = graph.id;

  // The depth and stencil state a pipeline compiles in has to agree with the
  // format of the attachment its pass keeps it in: the card takes the state when
  // the pipeline is made and the format when the pass is opened, and it reports a
  // disagreement between the two against whichever call arrived second, naming
  // neither the pipeline nor the attachment. So both halves are checked here,
  // against the pipeline's own declared format, before either reaches the card.
  for (const spec of graph.pipelines) {
    if (spec.kind !== 'render' || !spec.depth) continue;
    const tested = spec.depth;
    const keepsStencil = tested.format.includes('stencil');
    if (keepsStencil && tested.stencil === undefined) {
      throw new Error(
        `the pass on "${spec.name}" keeps a stencil in ${tested.format} and its pipeline says nothing about the mask`
      );
    }
    if (!keepsStencil && tested.stencil !== undefined) {
      throw new Error(`the pass on "${spec.name}" masks with a stencil and keeps its depth as ${tested.format}`);
    }
    const keepsDepth = tested.format.startsWith('depth');
    if (!keepsDepth && tested.compare !== undefined) {
      throw new Error(`the pass on "${spec.name}" tests depth and keeps it as ${tested.format}, which keeps none`);
    }
    if (keepsDepth && tested.compare === undefined) {
      throw new Error(`the pass on "${spec.name}" keeps depth as ${tested.format} and tests none of it`);
    }
  }

  // Which buffers a query resolves into, and how many bytes each resolve writes:
  // two answers for the pair of times a pass is opened and closed at, and one for
  // the samples a draw got through. A buffer named by two queries is refused,
  // because a resolve writes from the start of the buffer and the second would
  // land on top of the first.
  const resolves = new Map<string, number>();
  for (const pass of graph.passes) {
    const answers: [string | undefined, number][] = [
      [pass.timed, TIMED_QUERY_BYTES],
      [isRenderPass(pass) ? pass.visible : undefined, VISIBLE_QUERY_BYTES],
    ];
    for (const [name, bytes] of answers) {
      if (name === undefined) continue;
      if (resolves.has(name)) {
        throw new Error(`the frame for "${id}" resolves more than one query into "${name}"`);
      }
      resolves.set(name, bytes);
    }
  }

  for (const resource of graph.resources) {
    if (resource.kind !== 'buffer') continue;
    // A storage buffer is read four bytes at a time, so its size is a positive
    // whole number of those words. The card refuses any other over a binding size
    // that names neither the buffer nor the description, so both a build and a
    // backend refuse it first and in the same words.
    if (resource.bytes <= 0 || resource.bytes % 4 !== 0) {
      throw new Error(
        `the frame for "${id}" gives "${resource.name}" ${resource.bytes} bytes, which is no whole number of four-byte words`
      );
    }
    // A buffer a query resolves into is refused where it is shorter than the
    // answer, because the card writes from the start of it and reports a resolve
    // running past the end with a message about a size that names neither the
    // query nor the pass that asked for it.
    const resolved = resolves.get(resource.name);
    if (resolved !== undefined && resource.bytes < resolved) {
      throw new Error(
        `the frame for "${id}" resolves ${resolved} bytes of query into "${resource.name}", which holds ${resource.bytes}`
      );
    }
  }
}
