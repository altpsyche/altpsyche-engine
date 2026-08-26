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
import { pipelineHandle, uniform } from '../graph/handles.js';
import type {
  FrameGraph,
  GlslFrameGraph,
  RenderPipelineSpec,
  RenderStageSource,
  UniformResource,
  UniformSlot,
  WgslFrameGraph,
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
  // The uniform block is resource 0, the one pipeline pipeline 0. The pipeline
  // carries its own source (item 99): a fullscreen vertex and a fragment stage
  // reading the one WGSL document, whose text a loader fills.
  return {
    authored: 'wgsl',
    resources: [{ kind: 'uniform' }],
    modules: [],
    pipelines: [
      {
        kind: 'render',
        source: {
          vertex: 'fullscreen',
          fragment: { document: WGSL_DOCUMENT, text: '', entry: WGSL_FRAGMENT_ENTRY },
        },
        bindings: at ? [{ group: at.group, binding: at.binding, resource: uniform(0), visibility: ['fragment'] }] : [],
      },
    ],
    passes: [{ pipeline: pipelineHandle(0), draws: [{ vertices: FULLSCREEN_VERTICES }] }],
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
  // The uniform block is resource 0; the one pipeline is pipeline 0, carrying its
  // own source (item 99): a vertex half and a fragment half, each a GLSL document
  // whose text a loader fills.
  return {
    authored: 'glsl',
    resources: [{ kind: 'uniform' }],
    modules: [],
    pipelines: [
      {
        kind: 'render',
        source: {
          vertex: { document: 'vertex', text: '', entry: 'main' },
          fragment: { document: 'fragment', text: '', entry: 'main' },
        },
        bindings: [],
      },
    ],
    passes: [{ pipeline: pipelineHandle(0), draws: [{ vertices: FULLSCREEN_VERTICES }] }],
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
  generated?: Map<number, Uint8Array<ArrayBuffer>>
): FrameGraph {
  const seen = new Set<string>();
  const repeated = description.modules.find((module) => {
    if (seen.has(module.name)) return true;
    seen.add(module.name);
    return false;
  });
  if (repeated)
    throw new Error(`the description for "${id}" names two documents "${repeated.name}"`);

  // Every document a compute module or a render pipeline's source names must have
  // text; a name with none is a description of a file nobody fetched, which left
  // through would hand the card whatever the memory held.
  const missing = documentNames(description).find((name) => texts[name] === undefined);
  if (missing) throw new Error(`the description for "${id}" names a document "${missing}" with no text`);

  // A generated resource carries an address rather than a name, so its bytes are
  // keyed by the index it sits at in `resources` (item 87): the description names
  // no picture, it names a resource at a position, and that position is the key a
  // loader fills the bytes back under.
  const emptyAt = description.resources.findIndex(
    (resource, index) => 'source' in resource && resource.source !== undefined && !generated?.get(index)
  );
  if (emptyAt >= 0) throw new Error(`the description for "${id}" names a generated resource ${emptyAt} with no bytes`);

  const positions = description.authored === 'wgsl' ? block : undefined;

  const resources = description.resources.map((resource, index) => {
    if (resource.kind === 'uniform' && positions) return { ...resource, block: positions } as UniformResource;
    const bytes = 'source' in resource ? generated?.get(index) : undefined;
    return bytes ? { ...resource, data: bytes } : resource;
  });
  // Each render pipeline's source takes its two stages' text from the fetched
  // texts, keyed by the document each stage names (item 99). A WGSL rung's numbers
  // land on the source too — the one language whose value reaches the pipeline
  // rather than the text — so a phone's source carries constants a desktop's does
  // not. A compute pipeline keeps its `ModuleHandle` and is filled below.
  const wgslConstants = description.authored === 'wgsl' ? constants : undefined;
  const fillStage = (stage: RenderStageSource | 'fullscreen'): RenderStageSource | 'fullscreen' =>
    stage === 'fullscreen' ? 'fullscreen' : { ...stage, text: texts[stage.document] as string };
  const pipelines = description.pipelines.map((spec) =>
    spec.kind !== 'render'
      ? spec
      : {
          ...spec,
          source: {
            ...spec.source,
            vertex: fillStage(spec.source.vertex),
            fragment: fillStage(spec.source.fragment) as RenderStageSource,
            ...(wgslConstants ? { constants: wgslConstants } : {}),
          },
        }
  );

  const common = {
    id,
    resources,
    pipelines,
    passes: description.passes,
    ...(description.translated !== undefined ? { translated: description.translated } : {}),
    ...(description.present !== undefined ? { present: description.present } : {}),
    ...(description.swap ? { swap: description.swap } : {}),
  };

  // A frame's remaining documents are its compute modules, filled the same way: the
  // WGSL text a loader fetched, and a rung's constants where the language takes them.
  // A render frame carries none, so the list is empty and this maps nothing.
  if (description.authored === 'wgsl') {
    return {
      ...common,
      authored: 'wgsl',
      modules: description.modules.map((module) => ({
        name: module.name,
        wgsl: texts[module.name] as string,
        ...(constants ? { constants } : {}),
      })),
    };
  }
  return {
    ...common,
    authored: 'glsl',
    modules: description.modules.map((module) => ({
      name: module.name,
      glsl: texts[module.name] as string,
    })),
  };
}

/** The documents one render pipeline's source names — the fetch key of each stage
 * that has one, a fullscreen vertex naming none. Two pipelines drawing one file name
 * it by the same key, which a set upstream collapses to one request. */
const renderStageDocuments = (spec: RenderPipelineSpec): string[] => [
  ...(spec.source.vertex === 'fullscreen' ? [] : [spec.source.vertex.document]),
  spec.source.fragment.document,
];

/** The names a description's documents carry, which is what a loader fetches text
 * for and keys it under — a render pipeline's two stage documents and any compute
 * module's name. A name appears once whatever the pipelines do with it, so a set
 * collapses a document two pipelines reference to one request. A loader resolves
 * each name to a file and fetches it; this only reads the description, so it fetches
 * nothing and knows no path. */
export const documentNames = (description: FrameGraph): string[] => [
  ...new Set([
    ...description.modules.map((module) => module.name),
    ...description.pipelines.flatMap((spec) => (spec.kind === 'render' ? renderStageDocuments(spec) : [])),
  ]),
];

/** The resources the build generated bytes for, each as its index in the frame's
 * `resources` and the address its bytes come from — what a loader fetches, keyed
 * back by that index because a generated resource carries an address rather than a
 * name (item 87). Reads the description alone, so it fetches nothing and resolves
 * no path. */
export const generatedResources = (description: FrameGraph): { index: number; source: string }[] =>
  description.resources.flatMap((resource, index) =>
    'source' in resource && resource.source !== undefined ? [{ index, source: resource.source }] : []
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
  generated: Map<number, Uint8Array<ArrayBuffer>>,
  block?: UniformSlot[],
  constants?: Record<string, number>
): FrameGraph {
  return frameOf(
    id,
    description,
    Object.fromEntries(documentNames(description).map((name) => [name, texts.get(name) as string])),
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

/**
 * A WGSL frame turned into the GLSL frame a WebGL 2 device draws, reading the baked
 * GLSL translation off the source that carries it (`WgslModule.glsl`, keyed by
 * entry point) rather than off a gate-local stitch of the build artifact (item 94).
 * A WebGPU-less device selects WebGL 2 for a WGSL frame that carries a translation
 * (§17 decisions 2 and 6), and this is what hands that backend a frame in its own
 * language.
 *
 * Each pipeline's vertex and fragment entry points become GLSL documents of their
 * own, entered at `main`, exactly as the build baked them. The uniform block's binding
 * numbers and positions drop away — a linked GLSL program answers where its block
 * sits — except a per-draw slice's binding, which the backend reads to bind one
 * record's range a draw (item 27/85). The geometry and every other resource carry
 * through unchanged.
 *
 * Returns `null` where the bake carries no GLSL for an entry the pipelines need — a
 * fullscreen WGSL frame that baked no vertex, a compute stage with no place on
 * WebGL 2, or a stage the build refused to translate for a capability WebGL 2 withholds — so a caller
 * skips it by outcome rather than drawing a frame with a hole in it. The reason is
 * the caller's to name from the build artifact's `refused` list; this reports only
 * that a needed document is absent.
 */
export function glslFrameOf(frame: WgslFrameGraph): GlslFrameGraph | null {
  // Each render pipeline's own baked GLSL, read off its source's entry-keyed bake
  // (item 99): the pipeline that owns the source owns its translation, so no GLSL
  // document is shared even where two pipelines drew one WGSL entry point. A stage's
  // baked text becomes that pipeline's GLSL stage, entered at `main`.
  const pipelines: RenderPipelineSpec[] = [];
  for (const spec of frame.pipelines) {
    // A compute pipeline has no place on WebGL 2; a fullscreen WGSL frame supplies
    // its corners from the backend, so the build bakes no vertex for WebGL 2 to
    // link. Either leaves a hole a caller skips by outcome.
    if (spec.kind !== 'render' || spec.source.vertex === 'fullscreen') return null;
    const vertexGlsl = spec.source.glsl?.[spec.source.vertex.entry];
    const fragmentGlsl = spec.source.glsl?.[spec.source.fragment.entry];
    // A stage the build refused to translate — a capability WebGL 2 withholds —
    // leaves its entry out of the bake, so a needed document is absent and the whole
    // frame is skipped rather than drawn with a hole in it.
    if (vertexGlsl === undefined || fragmentGlsl === undefined) return null;
    pipelines.push({
      ...spec,
      source: {
        vertex: { document: 'vertex', text: vertexGlsl, entry: 'main' },
        fragment: { document: 'fragment', text: fragmentGlsl, entry: 'main' },
      },
      // A GLSL program answers where each uniform block sits, so the block bindings
      // drop — except a per-draw slice's, whose group and binding tell the per-draw
      // block apart from the shared one and whose `perDraw` size is one record's.
      bindings: spec.bindings.filter((binding) => binding.perDraw !== undefined),
    });
  }

  return {
    ...(frame.id !== undefined ? { id: frame.id } : {}),
    authored: 'glsl',
    // A GLSL frame's uniform resource carries no block positions: the linked program
    // is asked where its members sit, so the WebGPU-computed layout drops here. The
    // resources carry through at the same indices, so every handle a binding or pass
    // holds still names the same resource.
    resources: frame.resources.map((resource) =>
      resource.kind === 'uniform' && resource.block ? { kind: 'uniform' } : resource
    ),
    // A GLSL frame names no module: each render pipeline carries its own GLSL source
    // (item 99), so the shared document pool is empty.
    modules: [],
    pipelines,
    passes: frame.passes,
    ...(frame.requires !== undefined ? { requires: frame.requires } : {}),
    ...(frame.present !== undefined ? { present: frame.present } : {}),
    ...(frame.swap ? { swap: frame.swap } : {}),
  };
}
