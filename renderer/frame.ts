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
 * The description and the frame are separate because the build writes one and the
 * runtime fetches the other. A description names its documents and the manifest
 * carries it; a frame is that description with every document's text in it, which
 * is what a backend takes.
 */
import { uniformBindingOf } from '../wgsl-binding';
import type {
  DocumentAddress,
  FrameDescription,
  ResourceSpec,
  ShaderFrame,
  UniformResource,
  UniformSlot,
} from './types';

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
export function wgslDescription(code: string): FrameDescription {
  // Only the fragment stage is named, because the vertex half is the backend's
  // own three corners and reads nothing: a visibility wider than the stages that
  // read the resource is accepted by the driver while claiming a stage reads
  // something it does not.
  const at = uniformBindingOf(code);
  return {
    target: 'wgsl',
    resources: [{ kind: 'uniform', name: UNIFORMS }],
    documents: [{ name: WGSL_DOCUMENT, address: 'wgsl' }],
    pipelines: [
      {
        kind: 'render',
        name: ONE_PASS,
        vertex: 'fullscreen',
        fragment: { module: WGSL_DOCUMENT, entry: WGSL_FRAGMENT_ENTRY },
        bindings: at ? [{ group: at.group, binding: at.binding, resource: UNIFORMS, visibility: ['fragment'] }] : [],
      },
    ],
    passes: [{ pipeline: ONE_PASS, draw: { vertices: FULLSCREEN_VERTICES } }],
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
export function glslDescription(): FrameDescription {
  return {
    target: 'glsl',
    resources: [{ kind: 'uniform', name: UNIFORMS }],
    documents: [
      { name: 'vertex', address: 'vertex' },
      { name: 'fragment', address: 'fragment' },
    ],
    pipelines: [
      {
        kind: 'render',
        name: ONE_PASS,
        vertex: { module: 'vertex', entry: 'main' },
        fragment: { module: 'fragment', entry: 'main' },
        bindings: [],
      },
    ],
    passes: [{ pipeline: ONE_PASS, draw: { vertices: FULLSCREEN_VERTICES } }],
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
 * A rung's numbers land on the WGSL document, which is the one language whose
 * value reaches the pipeline rather than the text. A description owning two such
 * documents needs them keyed per document, and it is the step that lands one that
 * has something to key them by.
 *
 * Whatever the build generated arrives the same way its documents do, by the name
 * the description gave it, and a description naming bytes nobody fetched is
 * refused here. Left through, the card would be handed a texture of whatever the
 * memory held, or a buffer of it, and the shader would read it without complaint.
 */
export function frameOf(
  id: string,
  description: FrameDescription,
  texts: Record<string, string>,
  uniforms: { name: string; type: string }[],
  block?: UniformSlot[],
  overrides?: Record<string, number>,
  generated?: Map<string, Uint8Array<ArrayBuffer>>
): ShaderFrame {
  const missing = description.documents.find((document) => texts[document.name] === undefined);
  if (missing) throw new Error(`the description for "${id}" names a document "${missing.name}" with no text`);

  const empty = description.resources.find(
    (resource) => 'source' in resource && resource.source !== undefined && !generated?.get(resource.name)
  );
  if (empty) throw new Error(`the description for "${id}" names a picture "${empty.name}" with no bytes`);

  const positions = description.target === 'wgsl' ? block : undefined;

  return {
    id,
    target: description.target,
    uniforms,
    resources: description.resources.map((resource) => {
      if (resource.kind === 'uniform' && positions) return { ...resource, block: positions } as UniformResource;
      const bytes = 'source' in resource ? generated?.get(resource.name) : undefined;
      return bytes ? { ...resource, data: bytes } : resource;
    }),
    modules: description.documents.map((document) => ({
      name: document.name,
      code: texts[document.name] as string,
      ...(overrides && document.address === 'wgsl' ? { overrides } : {}),
    })),
    pipelines: description.pipelines,
    passes: description.passes,
    ...(description.present !== undefined ? { present: description.present } : {}),
    ...(description.swap ? { swap: description.swap } : {}),
  };
}

/** The distinct addresses a description's documents name, which is what a loader
 * fetches text for. Two documents can share one file, so a set collapses the pair
 * to one request. A loader resolves each address to a file and fetches it; this
 * only reads the description, so it fetches nothing and knows no path. */
export const documentAddresses = (description: FrameDescription): DocumentAddress[] => [
  ...new Set(description.documents.map((document) => document.address)),
];

/** The resources the build generated bytes for, which is what a loader fetches
 * bytes for, keyed later by name because bytes are named rather than addressed.
 * Reads the description alone, so it fetches nothing and resolves no path. */
export const generatedResources = (
  description: FrameDescription
): (ResourceSpec & { name: string; source: string })[] =>
  description.resources.filter(
    (resource): resource is ResourceSpec & { name: string; source: string } =>
      'source' in resource && resource.source !== undefined
  );

/**
 * A description and everything a loader fetched for it become the frame a backend
 * draws.
 *
 * This is the half of loading an artefact that fetches nothing and resolves no
 * path: the caller has already turned each document's address into a file and
 * read its text, and each generated resource's source into its bytes. The one
 * thing this owns that `frameOf` does not is turning the address a loader fetched
 * by into the name a description names its documents by, which is the only place
 * the two keyings meet.
 */
export function assembleFrame(
  id: string,
  description: FrameDescription,
  texts: Map<string, string>,
  generated: Map<string, Uint8Array<ArrayBuffer>>,
  uniforms: { name: string; type: string }[],
  block?: UniformSlot[],
  overrides?: Record<string, number>
): ShaderFrame {
  return frameOf(
    id,
    description,
    Object.fromEntries(description.documents.map((document) => [document.name, texts.get(document.address) as string])),
    uniforms,
    block,
    overrides,
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
  uniforms: { name: string; type: string }[],
  overrides?: Record<string, number>
): ShaderFrame {
  return frameOf(id, wgslDescription(code), { [WGSL_DOCUMENT]: code }, uniforms, block, overrides);
}

/** One GLSL pair as a frame, for the same callers. */
export function glslFrame(
  id: string,
  vertex: string,
  fragment: string,
  uniforms: { name: string; type: string }[]
): ShaderFrame {
  return frameOf(id, glslDescription(), { vertex, fragment }, uniforms);
}
