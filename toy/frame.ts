/**
 * The one-pass full-screen description, which is what every shader on this site
 * is, and the join between a description and the documents it names.
 *
 * They are functions rather than a literal each caller writes because there are
 * six callers and a restated shape cannot disagree with itself: the carousel
 * export declared the renderer's frame as pixels while the renderer returned a
 * promise of them, and it died on its first slide for a whole run of commits. A
 * gate that hand-writes a description is a gate measuring its own idea of one.
 *
 * A build-time frame and a drawn frame are one `FrameGraph` type in two states of
 * a fetch: the build writes it with its modules named but their `code` an empty
 * placeholder and no `id`, and the runtime fills that same shape with every
 * module's text and the id it is drawn under. `frameOf` is that filling, not a
 * translation between two types.
 */
import { uniformBindingOf } from '../wgsl-binding.js';
import type {
  ResourceSpec,
  FrameGraph,
  UniformResource,
  UniformSlot,
} from '../graph/types.js';

/** The name every one-pass shader's pipeline carries. Nothing reads it but the
 * pass that names it, and a description with two pipelines needs two names. */
export const ONE_PASS = 'frame';

/** What the build asks Slang to compile its fragment entry point as, and what a
 * hand-written WGSL source in this corpus is expected to call one. */
export const WGSL_FRAGMENT_ENTRY = 'fragMain';

/** The three corners of the triangle that covers the frame. Both backends supply
 * the positions and the count is here because the pass declares it. */
const FULLSCREEN_VERTICES = 3;

/** The name the one uniform resource of a frame carries. A binding names its
 * resource by this rather than by the variable name the source used, which is
 * `uniforms` in the hand-written base and `globalParams_0` in what Slang emits. */
const UNIFORMS = 'uniforms';

/** What a pipeline calls a WGSL document. It is one name for the file rather than
 * one per stage, because a WGSL shader is one file whatever it holds and a file
 * carrying both a compute entry point and a fragment one has no stage to be named
 * after. A GLSL shader is a pair, so each half keeps the stage's own name. */
export const WGSL_DOCUMENT = 'wgsl';

/**
 * A WGSL shader is one document with no vertex half, so its pipeline asks for the
 * backend's own three corners.
 *
 * The binding comes off the source's own attributes, because a number written in
 * two places can disagree and the failure is silent: the pipeline is built
 * against the written layout and the shader still compiles and still draws while
 * reading a binding nothing filled.
 */
export function wgslDescription(code: string): FrameGraph {
  // Only the fragment stage is named, because the vertex half is the backend's
  // own three corners and reads nothing: a visibility wider than the stages that
  // read the resource is accepted by the driver while claiming a stage reads
  // something it does not.
  const at = uniformBindingOf(code);
  return {
    target: 'wgsl',
    resources: [{ kind: 'uniform', name: UNIFORMS }],
    modules: [{ name: WGSL_DOCUMENT, code: '' }],
    pipelines: [
      {
        kind: 'render',
        name: ONE_PASS,
        vertex: 'fullscreen',
        fragment: { module: WGSL_DOCUMENT, entry: WGSL_FRAGMENT_ENTRY },
        bindings: at ? [{ group: at.group, binding: at.binding, resource: UNIFORMS, visibility: ['fragment'] }] : [],
      },
    ],
    passes: [{ pipeline: ONE_PASS, draws: [{ vertices: FULLSCREEN_VERTICES }] }],
  };
}

/**
 * A GLSL shader is the pair a WebGL 2 program links from, so both halves are
 * documents and the pipeline names each one.
 *
 * No binding is written down. The driver decides where a block's members sit and
 * GLSL ES 3.0 declares no binding number for one, so the linked program answers
 * with a block index instead.
 */
export function glslDescription(): FrameGraph {
  return {
    target: 'glsl',
    resources: [{ kind: 'uniform', name: UNIFORMS }],
    modules: [{ name: 'vertex', code: '' }, { name: 'fragment', code: '' }],
    pipelines: [
      {
        kind: 'render',
        name: ONE_PASS,
        vertex: { module: 'vertex', entry: 'main' },
        fragment: { module: 'fragment', entry: 'main' },
        bindings: [],
      },
    ],
    passes: [{ pipeline: ONE_PASS, draws: [{ vertices: FULLSCREEN_VERTICES }] }],
  };
}

/**
 * A description plus the text of every document it names, which is the frame a
 * backend draws.
 *
 * The positions of the uniform block arrive here rather than in the description,
 * for the reason the description says: they are the shader's and every target
 * that has them has the same ones. They are left off a GLSL frame whatever is
 * passed, because their absence is what tells that backend to ask the linked
 * program where its members sit.
 *
 * A rung's numbers land on the WGSL documents, which is the one language whose
 * value reaches the pipeline rather than the text. A WGSL target's documents are
 * all WGSL, so the target answers which documents take them without a per-document
 * role to read.
 *
 * Whatever the build generated arrives the same way its documents do, by the name
 * the description gave it, and a description naming bytes nobody fetched is
 * refused here. Left through, the card would be handed a texture of whatever the
 * memory held, or a buffer of it, and the shader would read it without complaint.
 *
 * A document's name is its key, so two documents sharing one name are two
 * descriptions of one text, not two texts: the loader fetches one, and the second
 * silently wins. That is refused here too, by name, before the text check the name
 * would otherwise pass.
 */
export function frameOf(
  id: string,
  description: FrameGraph,
  texts: Record<string, string>,
  block?: UniformSlot[],
  constants?: Record<string, number>,
  generated?: Map<string, Uint8Array<ArrayBuffer>>
): FrameGraph {
  const seen = new Set<string>();
  const repeated = description.modules.find((module) => {
    if (seen.has(module.name)) return true;
    seen.add(module.name);
    return false;
  });
  if (repeated)
    throw new Error(`the description for "${id}" names two documents "${repeated.name}"`);

  const missing = description.modules.find((module) => texts[module.name] === undefined);
  if (missing) throw new Error(`the description for "${id}" names a document "${missing.name}" with no text`);

  const empty = description.resources.find(
    (resource) => 'source' in resource && resource.source !== undefined && !generated?.get(resource.name)
  );
  if (empty) throw new Error(`the description for "${id}" names a picture "${empty.name}" with no bytes`);

  const positions = description.target === 'wgsl' ? block : undefined;

  return {
    id,
    target: description.target,
    resources: description.resources.map((resource) => {
      if (resource.kind === 'uniform' && positions) return { ...resource, block: positions } as UniformResource;
      const bytes = 'source' in resource ? generated?.get(resource.name) : undefined;
      return bytes ? { ...resource, data: bytes } : resource;
    }),
    modules: description.modules.map((module) => ({
      name: module.name,
      code: texts[module.name] as string,
      ...(constants && description.target === 'wgsl' ? { constants } : {}),
    })),
    pipelines: description.pipelines,
    passes: description.passes,
    ...(description.present !== undefined ? { present: description.present } : {}),
    ...(description.swap ? { swap: description.swap } : {}),
  };
}

/** The names a description's documents carry, which is what a loader fetches text
 * for and keys it under. A name appears once whatever the pipelines do with it, so
 * a set collapses a document two pipelines reference to one request. A loader
 * resolves each name to a file and fetches it; this only reads the description, so
 * it fetches nothing and knows no path. */
export const documentNames = (description: FrameGraph): string[] => [
  ...new Set(description.modules.map((module) => module.name)),
];

/** The resources the build generated bytes for, which is what a loader fetches
 * bytes for, keyed later by name because bytes are named rather than addressed.
 * Reads the description alone, so it fetches nothing and resolves no path. */
export const generatedResources = (
  description: FrameGraph
): (ResourceSpec & { name: string; source: string })[] =>
  description.resources.filter(
    (resource): resource is ResourceSpec & { name: string; source: string } =>
      'source' in resource && resource.source !== undefined
  );

/**
 * A description and everything a loader fetched for it become the frame a backend
 * draws.
 *
 * This is the half of loading an graph that fetches nothing and resolves no
 * path: the caller has already turned each document's name into a file and read
 * its text, and each generated resource's source into its bytes. It carries the
 * fetched texts, keyed by the one name a document has, straight through to the
 * frame — there is no second keying to reconcile, which is the whole of what
 * dropping the address bought.
 */
export function assembleFrame(
  id: string,
  description: FrameGraph,
  texts: Map<string, string>,
  generated: Map<string, Uint8Array<ArrayBuffer>>,
  block?: UniformSlot[],
  constants?: Record<string, number>
): FrameGraph {
  return frameOf(
    id,
    description,
    Object.fromEntries(description.modules.map((module) => [module.name, texts.get(module.name) as string])),
    block,
    constants,
    generated
  );
}

/** One WGSL document as a frame, for a caller holding the text rather than a
 * manifest, which is a gate that draws a source file. The editor holds a manifest
 * frame instead and swaps a reader's text into it, so it does not reach here. */
export function wgslFrame(
  id: string,
  code: string,
  block: UniformSlot[],
  constants?: Record<string, number>
): FrameGraph {
  return frameOf(id, wgslDescription(code), { [WGSL_DOCUMENT]: code }, block, constants);
}

/** One GLSL pair as a frame, for the same callers. */
export function glslFrame(id: string, vertex: string, fragment: string): FrameGraph {
  return frameOf(id, glslDescription(), { vertex, fragment });
}
