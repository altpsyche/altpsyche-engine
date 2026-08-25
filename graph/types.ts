/**
 * What a backend is, stated so the two of them stay interchangeable.
 *
 * The test this interface has to pass is that a caller never has to know which
 * backend it holds. That is a live risk rather than a theoretical one, because
 * the two backends specialize a shader by different mechanisms: one hands the
 * tier numbers in when the pipeline is made, the other has a variant compiled
 * per tier. So a caller asks for a program for a shader at a tier and the
 * difference stays inside the backend. **A method one backend has to throw from
 * is the wrong method.**
 */

import type { Capability } from './capability.js';
import type { TransientSize } from './refs.js';
import type {
  BufferHandle,
  IndexHandle,
  ModuleHandle,
  PipelineHandle,
  ResourceHandle,
  TextureHandle,
  VertexHandle,
} from './handles.js';
import { indexOf } from './handles.js';

export type BackendName = 'webgl2' | 'webgpu';

/** Which language a backend takes its shaders in. It is not the same thing as
 * the backend's name, because it is the graph that has to be fetched for a
 * target and a reader is sent one of them rather than both. */
export type ShaderTarget = 'glsl' | 'wgsl';

export type UniformValue = number | number[];

/**
 * One shader document, carrying its source under the language it is authored in
 * rather than a bare `code` string whose language something else decides (item
 * 94). A document is named, carried and referenced by the one name it has, which a
 * role fixed to a three-value union — fragment, vertex, wgsl — could not, since two
 * WGSL documents share one role between them and carry two distinct texts.
 *
 * Which arm a module is comes off its frame's `authored` discriminant, not off
 * which fields the record happens to carry: a WGSL frame's modules are all
 * `WgslModule`, a GLSL frame's all `GlslModule`, so nothing reads a language off
 * the shape of a document (§17 decision 6). A WGSL shader written in one file is
 * one document and a GLSL shader is the pair a WebGL 2 program links from, which is
 * the whole of what the two languages differ by here: both are a list of documents
 * with a pipeline naming which one runs at which stage.
 */
export interface WgslModule {
  /** The document's name — the key a loader fetches its text under and a file
   * resolves to, since a document is read from a file and a file needs a name.
   * It is not a resource identity: a pipeline names its documents by
   * `ModuleHandle` (the index in `modules`), and a backend resolves them by that
   * handle, never by this name (item 87). So this stays where a resource's name
   * went, because a module is a document rather than a resource and its name is
   * the address a loader keeps, not a key a backend maps. */
  name: string;
  /** The WGSL text on a frame a backend draws, and an empty string on the
   * build-time shape a producer names but a loader has not filled yet. */
  wgsl: string;
  /** The baked GLSL translation of this document (§17 decision 2), keyed by the
   * entry point each stage baked exactly as
   * `fixtures/source/glsl/corpus.generated.json` stores it, so a device without
   * WebGPU can draw a WGSL frame on WebGL 2 through the source that carries it (item
   * 94). Absent where the build baked no translation. It is keyed by entry point
   * rather than folded into a §9 `GlslPair`, because one WGSL document may hold
   * several pipelines' entry points and a single vertex/fragment pair could not hold
   * a multi-pipeline preset's bake — the `GlslPair` shape waits for item 95, which
   * establishes a source per render pipeline first. Read only by the WGSL-to-GLSL
   * frame conversion (`glslFrameOf`); neither backend nor the pipeline cache reads
   * it, because each draws a frame already in its own language. */
  glsl?: Record<string, string>;
  /** What this rung asks of the source, by the names it declares as overridable.
   * The text is the same at every rung, so these numbers are the only thing
   * separating a phone's picture from a desktop's, and they are spent when the
   * pipeline is made rather than written into the code. */
  constants?: Record<string, number>;
}

/** One document of a GLSL-authored shader — the authored truth on this arm, one
 * stage's text, where the WGSL arm's `glsl` is a cached translation. That a single
 * optional field cannot mean both a translation and an authored source is why the
 * discriminant exists (§17 decision 6). */
export interface GlslModule {
  /** The document's name — the loader's fetch key, the same as a WGSL document's
   * and for the same reason: a document is read from a file, and a pipeline names
   * it by `ModuleHandle` rather than by this (item 87). */
  name: string;
  /** The authored GLSL text of one stage's document, empty at build time for the
   * reason a WGSL document's `wgsl` is. */
  glsl: string;
  constants?: Record<string, number>;
}

/** One shader document, discriminated by its frame's `authored` language, never by
 * which fields it carries. */
export type ModuleSpec = WgslModule | GlslModule;

/** Where one uniform sits in the block Slang gathers them all into. Read off the
 * reflection the compiler emits, because the layout is the compiler's to decide
 * and anything working it out from the source is a second answer that can
 * disagree with the first. */
export interface UniformSlot {
  name: string;
  offset: number;
  size: number;
}

/**
 * The block of numbers a page feeds by name. Every shader has exactly one.
 *
 * The positions are absent for a GLSL pair, and that absence is the instruction
 * to ask the linked program where its members sit. The driver decides them there
 * and it has been measured not to use the source's declaration order, while a
 * WebGPU pipeline has nothing to ask, so the build computes them and sends them.
 */
export interface UniformResource {
  kind: 'uniform';
  block?: UniformSlot[];
}

/** A texture the frame writes, reads or shows. `use` is what the usage flags are
 * built from, so a texture a pass writes and a later pass reads names both, and a
 * flag nothing asked for is a texture the driver refuses the pipeline over.
 *
 * `size` is a whole-size descriptor (`{ scale }` or `{ width, height }`), not a
 * per-axis pair: `{ scale: 1 }` follows the frame, and what was in a
 * frame-following texture is gone when it is rebuilt, because carrying the old
 * contents over means scaling them and that is a decision about a picture the
 * renderer has no business making. `{ scale: 0.5 }` is a half-resolution target
 * the old `[Extent, Extent]` pair could not say. */
export interface TextureResource {
  kind: 'texture';
  size: TransientSize;
  format: GPUTextureFormat;
  use: ('storage' | 'sample' | 'attachment')[];
  /** Where its first contents come from, absent for a texture that starts empty.
   * The whole address is written rather than the name of one of a rung's files,
   * which is how a document says where it lives, because the bytes are the same
   * at every rung and there is nothing for a rung name to choose between. */
  source?: string;
  /** Whether this texture carries a ladder of smaller copies of itself, each half
   * the size of the one above it down to a single pixel, which is what lets it be
   * read at any size without the picture sparkling as it shrinks. Nothing in
   * WebGPU makes them, so the backend draws each level from the one above it.
   *
   * Absent for a texture read at its own size only. It is a fact about the
   * texture rather than about a read, because the levels have to exist before any
   * read can name one, and which level a read lands on is in the source. */
  mips?: 'generate';
  /** How many samples of each pixel this texture keeps, absent for the one every
   * other texture keeps. Four is the only count core WebGPU guarantees, so it is
   * the only one a description may carry, and the absence of the field is one.
   *
   * A texture holding several samples of a pixel is the narrowest kind there is:
   * nothing can copy out of it, nothing can write into it from outside, it can
   * carry no ladder, and a shader reads it only through a binding declared as
   * multisampled. So it is written by a pass and averaged into a single-sampled
   * texture of the same size and format at the end of that pass, which is what
   * the resolve name on the pass's colour says.
   */
  samples?: 4;
  /** Those contents, once fetched, which is four bytes a pixel in the texture's
   * own format laid out row by row. It is absent from a description for the same
   * reason a uniform block's positions are: the build writes an address and the
   * runtime fills in what came back from it. */
  data?: Uint8Array<ArrayBuffer>;
}

/** How a texture is read when a shader samples between its pixels rather than at
 * one of them. It is a resource of its own rather than a field on the texture
 * because a sampler is bound separately in WGSL and two shaders may read one
 * texture through different ones. */
export interface SamplerResource {
  kind: 'sampler';
  filter: 'nearest' | 'linear';
  wrap: 'clamp' | 'repeat' | 'mirror';
}

/** Geometry the build generated, because a buffer's contents are numbers and no
 * source file holds them. The layout travels with the bytes rather than being
 * declared beside the pipeline, since a vertex written as four floats and read as
 * three is every vertex after the first read out of the middle of the last one.
 *
 * The topology is here for the same reason: which vertices make one triangle is a
 * fact about the order the indices were written in, so the generator that wrote
 * them is what answers it. */
export interface VertexResource {
  kind: 'vertices';
  /** Bytes from the start of one vertex to the start of the next. */
  stride: number;
  /** Each field of one vertex, at the location the source reads it at. */
  attributes: { location: number; offset: number; format: GPUVertexFormat }[];
  topology: GPUPrimitiveTopology;
  count: number;
  /** The indices that put these vertices in order, absent for geometry drawn
   * straight through in the order it was written. One handle rather than a copy of
   * the index resource, so the two cannot come apart. */
  indices?: IndexHandle;
  /** Where the bytes come from, and those bytes once fetched, which is the split
   * every generated resource carries: the build writes an address and the runtime
   * fills in what came back from it. */
  source?: string;
  data?: Uint8Array<ArrayBuffer>;
}

/** Which vertex each corner of each triangle is, as the numbers the card reads
 * them out of the vertex buffer by. It is a resource of its own rather than a
 * field on the geometry because it is a buffer of its own on the card, and the
 * vertex resource names it so the pair cannot be declared apart. */
export interface IndexResource {
  kind: 'indices';
  format: 'uint16' | 'uint32';
  count: number;
  source?: string;
  data?: Uint8Array<ArrayBuffer>;
}

/** A block of bytes a shader reads or writes, which is where a number the card
 * worked out for itself has to live. A texture holds a picture and a uniform
 * block holds what a page fed in, so neither can hold a count a compute pass
 * arrived at and a later pass has to act on.
 *
 * How big it is comes from the entry, because the type a source declares may be
 * an array with no length at all, and bytes is the number the card takes.
 *
 * Whether the shader may write into it is the declaration's own access, and it
 * decides which kind of layout entry the binding is: a card refuses a pipeline
 * whose layout says a buffer is written where the source only reads it. */
export interface BufferResource {
  kind: 'buffer';
  bytes: number;
  access: 'read' | 'read-write';
  /** Where its first contents come from, absent for a buffer that starts empty.
   * A buffer a pass fills or a query resolves into needs none, and one the shader
   * only reads carries the numbers a copy of a pipeline is handed, which no source
   * file holds. The whole address is written rather than a rung's file name for
   * the reason a texture's is: the bytes are the same at every rung. */
  source?: string;
  /** Those contents once fetched, laid out the way the shader reads them, which is
   * the same split every generated resource carries: the build writes an address
   * and the runtime fills in what came back from it. */
  data?: Uint8Array<ArrayBuffer>;
}

export type ResourceSpec =
  | UniformResource
  | TextureResource
  | SamplerResource
  | BufferResource
  | VertexResource
  | IndexResource;

/** Where a pipeline finds one of the resources it reads, written down rather than
 * asked of the driver. The numbers come off the source's own attributes, and the
 * stages are what a layout needs: a visibility narrower than the stage that reads
 * the resource is a pipeline the driver refuses, and a wider one is accepted
 * while claiming a stage reads something it does not. */
export interface BindingSpec {
  group: number;
  binding: number;
  /** The resource by its handle — the index of the resource on the frame,
   * whatever its kind, so one binding may name a uniform block, a texture, a
   * sampler or a storage buffer and the kind is the resource's own. */
  resource: ResourceHandle;
  visibility: ('vertex' | 'fragment' | 'compute')[];
  /** How this binding reads its texture, where the resource alone cannot say.
   * Both halves of a swapping pair are written by one pass and sampled by
   * another, so the resource is used both ways and the layout kind is the
   * binding's rather than the resource's. Absent for a texture used one way and
   * for everything that is not a texture. */
  reads?: 'storage' | 'sample';
  /** That this binding reads one `size`-byte slice of its buffer chosen per
   * draw rather than the whole buffer, absent for a binding every draw reads the
   * same. The buffer it names is bound as a uniform with a dynamic offset the
   * draw supplies (`DrawSpec.perDraw`): a `hasDynamicOffset` uniform binding on
   * WebGPU, a `bindBufferRange` on WebGL 2 — the same slice either way, per
   * §8. `size` is the width of one record, fixed for the binding, so the draw
   * carries the offset alone (one field either way). A thousand draws reading a
   * thousand transforms out of one buffer is what this is for. */
  perDraw?: { size: number };
}

/** Which document runs at which stage, the entry point inside it, and where its
 * resources are. `fullscreen` is the backend's own three corners covering the
 * frame, which is what a WGSL source has no second document for. Naming a module
 * instead is the vertex program being the shader's own. */
export interface RenderPipelineSpec {
  kind: 'render';
  vertex: { module: ModuleHandle; entry: string } | 'fullscreen';
  fragment: { module: ModuleHandle; entry: string };
  /** The geometry this pipeline reads one vertex at a time, absent where the
   * vertex stage reads no buffer at all. The pipeline names it rather than the
   * pass, because what a pipeline needs from it is the layout it was written
   * under and a layout is spent when the pipeline is made. */
  geometry?: VertexHandle;
  /** Empty where the compiled program reports its own, which is every GLSL pair:
   * GLSL ES 3.0 declares no binding number for a uniform block and the linked
   * program answers with a block index instead. */
  bindings: BindingSpec[];
  /** How this pipeline treats the depth of what it draws, absent where nothing it
   * draws can be behind anything else. `compare` is the test a fragment has to
   * pass against what is already there, and `write` is whether passing it leaves
   * the new depth behind: a surface drawn in front of another with the write off
   * lets the far one show through it rather than hiding it.
   *
   * It is the pipeline's rather than the pass's because the card takes it when
   * the pipeline is made, so two surfaces tested differently are two pipelines
   * over one attachment. */
  /** The depth and stencil state, which is one thing on the card however many
   * halves the format has. `compare` and `write` are the depth half and are
   * absent for a format that keeps no depth, and `stencil` is what this pipeline
   * does to the mask.
   *
   * It is spent here rather than on the pass for the same reason the vertex
   * layout is: the card compiles the comparison into the pipeline, so two
   * surfaces tested differently over one attachment are two pipelines rather than
   * one pipeline told twice. */
  depth?: {
    format: GPUTextureFormat;
    compare?: GPUCompareFunction;
    write?: boolean;
    stencil?: StencilMode;
  };
  /** What each colour the fragment stage returns is written into, absent where it
   * returns one and that one is the frame the reader sees.
   *
   * `blend` is how a colour is mixed with what the attachment already holds, so a
   * surface with an alpha below one lets what was drawn before it show through
   * rather than replacing it. Absent, a colour replaces.
   *
   * Naming these is all or nothing: a pipeline naming them writes only the
   * textures its pass attaches, and the frame's own attachment is not among
   * them, so the format of the frame is the backend's answer alone and is never
   * written into a description that could disagree with it. Which of the
   * textures the reader ends up seeing is what the frame's `present` says. */
  targets?: { format: GPUTextureFormat; blend?: GPUBlendState }[];
  /** How many samples of each pixel the attachments of this pipeline's pass keep,
   * absent where they keep one. It is the pipeline's as well as the texture's for
   * the same reason a format is both: the card takes the count when the pipeline
   * is made and again when the pass is opened, and it reports a disagreement
   * against whichever of the two arrived second. Written in both places and
   * compared where the pass is read, so the description is refused by name.
   *
   * A pipeline drawing the frame the reader sees never carries one, because the
   * frame's own target keeps a single sample. */
  samples?: 4;
}

/** How much compute work one pass runs: a whole count of workgroups, or a buffer
 * to read that count out of.
 *
 * `[n, n, n]` is the count itself. A producer works it out from the size it has —
 * `groupsToCover` in `graph/refs.ts` covers a pixel size in whole blocks of the
 * pipeline's workgroup size — so no size and no block count is written down a
 * second time where the backend could disagree with it. The runtime `'frame'` and
 * `{ over }` variants that had the backend derive the count at draw time are gone
 * (item 72): that computation lived below the §7 layer boundary and the size it
 * needs is the producer's, not the device's.
 *
 * Naming a buffer runs however much the three words at the start of it say, which
 * is the same arrangement a drawn pass has: the count arrives from a pass rather
 * than from the description. */
export type Groups = [number, number, number] | { indirect: BufferHandle };

/** A program run over a grid of work items rather than over the frame's corners.
 * The block size is read off the source's own `@workgroup_size`, because the
 * dispatch count is computed from it and a number written down twice can disagree
 * with the source while everything still compiles. */
export interface ComputePipelineSpec {
  kind: 'compute';
  compute: { module: ModuleHandle; entry: string };
  bindings: BindingSpec[];
  workgroup: [number, number, number];
}

export type PipelineSpec = RenderPipelineSpec | ComputePipelineSpec;

/** How much drawing one pass does. Counting vertices is the backend's own corners
 * covering the frame, and counting instances alone is the geometry its pipeline
 * names, as many times over as it says: the count of vertices is the resource's
 * and repeating it here is a number that could disagree with the buffer.
 *
 * Naming a buffer draws whatever the words at the start of that buffer say, which
 * is a count nothing on this side ever sees: it is what an earlier pass of the
 * same frame worked out and wrote there.
 *
 * `perDraw` is the byte offset this draw reads its slice of the pass's per-draw
 * binding from — the one field the draw carries, the size being the binding's
 * (`BindingSpec.perDraw`). Absent for a pass whose draws read the same records,
 * and meaningless where the pipeline binds no per-draw slice. The offset is a
 * whole number of 256-byte alignments, which `validate` refuses by name where it
 * is not, because the card takes a dynamic offset only at that alignment. */
export type DrawSpec =
  | { vertices: number; instances?: number; perDraw?: number }
  | { instances: number; perDraw?: number }
  | { indirect: BufferHandle; perDraw?: number };

/**
 * What a pipeline does to the mask a stencil keeps.
 *
 * Named rather than written out as the card's own fields, which are a comparison,
 * three operations and two masks for each face of a triangle. Nothing on the card
 * checks that a combination of those means anything, so a name is what can be
 * held to meaning something: `mark` leaves the reference behind everywhere it
 * draws, and `inside` draws only where the reference is already there and leaves
 * the mask as it found it.
 *
 * The reference value belongs to the modes rather than being declared beside
 * them, so nothing can carry a number that disagrees with the mode it sits next
 * to, and a mask has no front and back a picture could tell apart, so both faces
 * are given the same operations.
 */
export type StencilMode = 'mark' | 'inside';

/** One run of work inside a frame, drawing into the frame's own colour target. */
export interface RenderPassSpec {
  pipeline: PipelineHandle;
  /** The draws this pass issues, in order, all against the pass's one pipeline
   * until item 33 lifts that restriction. It is a list because one pass carries
   * many draws (item 26) — the one-draw-per-pass shape is gone rather than merely
   * unused — and a fullscreen frame is the degenerate case of a list of one. */
  draws: DrawSpec[];
  /** The buffer the two times this pass took land in, absent for a pass nobody
   * timed. The card writes one time as the pass opens and one as it closes, so
   * what a caller reads is a period rather than a clock reading, and the two
   * words of each are what a difference is worked out from.
   *
   * A device without the optional feature for it draws this pass anyway and
   * leaves the buffer as it found it, since a picture that arrives untimed is
   * still the picture. */
  timed?: BufferHandle;
  /** The buffer the count of samples this pass's draw got through lands in,
   * absent for a pass nobody counted. It is the answer to how much of what was
   * drawn came out in front of everything else, so it falls as a nearer surface
   * covers it and it is the one reading here that no picture shows.
   *
   * It sits on the drawn pass rather than beside the times, because the card
   * counts what one draw got through and takes the times over a whole pass. */
  visible?: BufferHandle;
  /** The texture this pass keeps the depth of what it drew in, and tests what it
   * draws against. `clear` is what that texture is emptied to first, and 1 is the
   * far end of the range the card normalises depth into, so a first surface at
   * any distance is nearer than an empty attachment and passes. Naming no value
   * keeps what is in it, which is what a second pass tested against the surface
   * the first one drew needs.
   *
   * It is the pass's rather than the pipeline's because a pass is where a texture
   * is attached, which is what lets one surface be tested against a surface a
   * different pipeline drew. */
  depth?: { resource: TextureHandle; clear?: number; stencilClear?: number };
  /** The textures this pass writes its colours into, in the order the fragment
   * stage returns them, absent where it writes the frame the reader sees.
   *
   * They are the pass's rather than the pipeline's because an attachment is what
   * a pass is opened with, so two passes writing one set of textures is how a
   * surface comes to be drawn over another one. `clear` is what an attachment is
   * emptied to first, and naming no value keeps what the pass before it drew. */
  colour?: { resource: TextureHandle; clear?: [number, number, number, number]; resolve?: TextureHandle }[];
}

/** One run of compute work, over as many workgroups as `groups` asks for. */
export interface ComputePassSpec {
  pipeline: PipelineHandle;
  groups: Groups;
  /** The buffer the two times this pass took land in, the same as a drawn pass.
   * There is no count of samples here, since nothing in a compute pass is drawn
   * for something else to cover. */
  timed?: BufferHandle;
}

/** A pass says which pipeline runs and how much of it. Which kind of pass it is
 * comes off that pipeline rather than being said again here, since a pass
 * claiming one kind while naming a pipeline of the other is a disagreement
 * nothing could resolve. */
export type PassSpec = RenderPassSpec | ComputePassSpec;

/**
 * One shader at one rung, as the build wrote it and the manifest named it.
 *
 * It is a description of a frame rather than a source, so a capability arrives as
 * another resource, another pipeline or another pass rather than as a method one
 * backend would have to throw from. Today every shader on the site is this
 * description with one resource, one pipeline and one pass in it, which is why
 * the reshape adds nothing to what either backend does.
 *
 * One type covers a frame in either state of a fetch. The build writes it with
 * its modules named rather than filled — an empty-string placeholder the loader
 * overwrites — and with no `id`, because the identity is the manifest key a
 * loader stamps on when it hands the frame across (`frameOf`). A frame a backend
 * draws is the same shape with every module's text in it and its `id` set: there
 * is no second graph type it has to be translated into, only fields that were
 * empty becoming full. A uniform resource carries no positions until then either,
 * for the same reason — the block is the shader's, the same on every target that
 * has one, and asked of the linked program on the one target that has none.
 *
 * The frame is discriminated on `authored`, the one value everything reads a
 * shader's authoring language off (item 94, §17 decision 6): a WGSL frame's
 * modules are all `WgslModule`, a GLSL frame's all `GlslModule`, so `select`, both
 * backends and `reflect` narrow on `frame.authored` and never on which fields a
 * module carries. It replaces the old `frame.target` field, which said the same
 * thing beside a `module.code` string whose language nothing on the module named.
 */
interface FrameGraphCommon {
  /** The manifest key a loader stamps on when it fills the frame, absent on the
   * build-time shape a producer hands over — the identity is not the producer's
   * to invent, since one description is filled under whatever id a caller draws it
   * by. Every frame a backend draws has it, because `frameOf` sets it. */
  id?: string;
  /** Whether a WGSL frame carries a GLSL translation, so a device without WebGPU
   * can still draw it on WebGL 2 by that translation rather than being refused
   * (§17 decision 2). It is the one fact selection reads beyond the authoring
   * language and the device: a WGSL frame with a translation gains WebGL 2 as a
   * fallback candidate, one without it does not, and on a WebGPU-less device the
   * refusal names which of the two was missing. Absent, and meaningless, on a GLSL
   * frame — WebGL 2 speaks that language with no translation. The translation text
   * itself now travels with the source, on each `WgslModule.glsl` (item 94); this
   * is the fact that it exists, which is the whole of what `selectBackend` routes
   * by without reading the modules. */
  translated?: boolean;
  /** The names and types a caller may feed are no longer written down here: they
   * are read from the source by `reflect(frame)` (item 69), because a source and
   * a list beside it can drift, and a page draws its controls from the reading
   * rather than from a field a producer maintained by hand. */
  /** The optional device capabilities this frame depends on, absent for a frame
   * that needs only what every backend shares. It is what `refusal(graph, device)`
   * reads a graph against a device's `capabilities` for (item 24), and where it
   * names none it can be refused for none. A capability lives here as data rather
   * than as a method a backend would throw from, per §17 decision 2. */
  requires?: readonly Capability[];
  resources: ResourceSpec[];
  pipelines: PipelineSpec[];
  /** Run in this order on one command encoder, every frame. */
  passes: PassSpec[];
  /** Which resource holds the picture once every pass has run, absent where a
   * pass drew into the frame's own colour target. A compute pass writes a
   * texture rather than an attachment, so the frame names the one that is the
   * picture and the backend copies it out. Saying so is what keeps the copy off
   * a guess about usage flags. */
  present?: TextureHandle;
  /** Pairs of resources that trade places every frame. A shader cannot read the
   * texture it is writing, so a field that grows out of its own last state needs
   * two of them: one is read this frame and written the next. The trade is the
   * backend's rather than the shader's, so the source binds one name to read and
   * one to write and never learns which of the two textures it was handed. */
  swap?: [TextureHandle, TextureHandle][];
}

/** A WGSL-authored frame: its documents are WGSL, each carrying an optional baked
 * GLSL translation so a WebGPU-less device can draw it on WebGL 2 (§17 decision 2). */
export interface WgslFrameGraph extends FrameGraphCommon {
  authored: 'wgsl';
  modules: WgslModule[];
}

/** A GLSL-authored frame: its documents are the GLSL a WebGL 2 program links from,
 * the authored truth with no translation, because GLSL selects WebGL 2 wherever it
 * runs and GLSL-to-WGSL is deferred (§17 decision 6). */
export interface GlslFrameGraph extends FrameGraphCommon {
  authored: 'glsl';
  modules: GlslModule[];
}

export type FrameGraph = WgslFrameGraph | GlslFrameGraph;

/** The one uniform block of a frame, or undefined where it describes none. */
export function uniformResourceOf(frame: FrameGraph): UniformResource | undefined {
  return frame.resources.find((resource): resource is UniformResource => resource.kind === 'uniform');
}

/** One resource of a frame by its handle — the index the binding, pass or
 * pipeline named it by — or undefined where the handle points past the list,
 * which is a description the renderer refuses before it reaches the device. */
export function resourceOf(frame: FrameGraph, handle: ResourceHandle): ResourceSpec | undefined {
  return frame.resources[indexOf(handle)];
}

/** Whether a pass is the drawing kind, read off the pass rather than off the
 * pipeline it names, so the two are compared where the pipeline is looked up. */
export function isRenderPass(pass: PassSpec): pass is RenderPassSpec {
  return 'draws' in pass;
}

/** Whether a draw covers the frame with the backend's own corners rather than
 * with geometry of the shader's own. */
export function drawsCorners(draw: DrawSpec): draw is { vertices: number; instances?: number; perDraw?: number } {
  return 'vertices' in draw;
}

/** Whether a draw reads its own counts out of a buffer. Every number a card needs
 * is in there rather than in the description, so a frame drawing this way says how
 * much work it does only after the pass that decided it has run. */
export function drawsIndirectly(draw: DrawSpec): draw is { indirect: BufferHandle; perDraw?: number } {
  return 'indirect' in draw;
}

/** The per-draw uniform slice a pipeline binds, or undefined where it binds none.
 * One binding at most may carry it — the buffer a draw reaches a `size`-byte
 * record of by the offset it names — so this reads the first, and where two
 * carried it the card would take one dynamic offset per binding rather than the
 * one field a draw carries. Read here in the one shape both backends and
 * `validate` resolve it from, so which group takes the draw's offset is not
 * worked out three times over. */
export function perDrawBinding(spec: PipelineSpec): BindingSpec | undefined {
  return spec.bindings.find((binding) => binding.perDraw !== undefined);
}

/** Whether a group count reads out of a buffer, which is the same question asked
 * of the other kind of pass. */
export function groupsIndirectly(groups: Groups): groups is { indirect: BufferHandle } {
  return !Array.isArray(groups) && 'indirect' in groups;
}

/** One document of a frame by the handle a pipeline gave it — the index of the
 * document in the frame's `modules`, or undefined where the handle points past
 * the list. */
export function moduleOf(frame: FrameGraph, handle: ModuleHandle): ModuleSpec | undefined {
  return frame.modules[indexOf(handle)];
}

export interface ShaderProgram {
  /** Values by the names the shader declares. Where they land is the backend's
   * business: loose uniforms in one dialect, one block of bytes in the other,
   * and the caller writes the same call either way. */
  setUniforms(values: Record<string, UniformValue>): void;
  /**
   * Draws the frame, and where `into` is given lands the finished picture in
   * that caller-supplied texture as well.
   *
   * `into` is where a frame lands when the caller owns the texture it goes in —
   * an XR layer's target, or a texture a capture reads back afterwards — copied
   * on the frame's own encoder so the whole frame is still submitted once.
   * Absent, the frame lands in the backend's own target and the canvas, exactly
   * as before. It is a `GPUTexture`, which is a WebGPU thing: a backend whose
   * target is not one refuses a given `into` by name, the same class of caller
   * mistake as a frame of the wrong target, since a caller holding a `GPUTexture`
   * has already chosen the backend it came from (§17 decision 7, item 29). */
  draw(into?: GPUTexture): void;
  /**
   * Replaces the contents of one buffer this frame declares, between one frame
   * and the next.
   *
   * The uniform block is fed this way every draw, and this is the same thing for
   * a buffer that is not the block: the description says the buffer exists and the
   * running page hands it later numbers, the way `setUniforms` hands the block
   * later numbers. Bytes rather than words, because a buffer the page fills holds
   * whatever the shader reads out of it, floats as often as counts, and the build
   * writes its first contents as bytes for the same reason.
   *
   * Only a buffer the build gave first contents can be replaced. A buffer the card
   * fills for itself, one a compute pass writes or a query resolves into, is the
   * card's own and is refused here by name, because it was never made able to take
   * bytes from this side.
   */
  writeBuffer(handle: BufferHandle, data: Uint8Array<ArrayBuffer>): void;
  /**
   * The words of one buffer this frame declares, as they stand after the last
   * frame that was drawn.
   *
   * Words rather than bytes because everything a card writes into a buffer of its
   * own accord is a count: how many blocks to run, how many vertices to draw, how
   * long a pass took. A caller that wants the bytes reads the words' own memory.
   *
   * It is a promise for the reason reading pixels is: the words have to be copied
   * out to a buffer nothing else is using and that buffer has to be mapped before
   * anything can look at it, so a caller waits either way. The copy is why the
   * buffer a frame writes is never the buffer a caller maps: a buffer a shader
   * writes into cannot also be one the CPU has mapped.
   *
   * A backend with no buffers to declare answers with no words, which is the true
   * answer rather than a refusal.
   */
  readBuffer(handle: BufferHandle): Promise<Uint32Array>;
  /**
   * Replaces which passes this program runs, between one frame and the next,
   * without remaking anything the program owns.
   *
   * A description changes over time by its passes changing: a frame runs one pass
   * this second and two the next, so a page turns a pass on or off the way it
   * feeds the block later numbers with `setUniforms` or a buffer later bytes with
   * `writeBuffer`. The modules, the pipelines and the resources are the frame's
   * for its whole life and are not touched here, so a pass may only name a
   * pipeline the program was built with. Naming one it was not is refused here by
   * name, the same as writing a buffer the card fills for itself.
   *
   * This changes which passes run, not what a pass is made of and not which
   * resources exist. Adding a resource is a rebuild, since a texture's usage and a
   * buffer's layout are decided when the program is made, so a description that
   * grows a resource is a new program rather than a call here.
   */
  setPasses(passes: PassSpec[]): void;
  dispose(): void;
}

/**
 * What a device says about itself: the ceilings it will not go past, and the
 * optional pieces of its API it has.
 *
 * The names are each API's own rather than translated into one vocabulary, and
 * the numbers are the card's. Nothing here is written down against a list of
 * expected values, because a ceiling that differs between two machines is the
 * machine rather than a defect, and a report compared against a written table
 * would fail on every card but the one the table was taken off.
 */
export interface DeviceReport {
  /** Every ceiling this device reports, by the name its own API gives it. */
  limits: Record<string, number>;
  /** The optional parts of the API this device has, sorted so two runs of one
   * machine print the same order. */
  features: string[];
}

/** The two categories of resident-lifetime traffic a `Backend` reports, kept side
 * by side and never summed — a frame uploading 40 MB and drawing three things has
 * a resident problem, not a per-frame one, and one merged number would hide which.
 * This is the resident-lifetime reading the graph does not carry, but its shape is
 * part of the `Backend` contract, so it lives here in `graph/` (which imports
 * nothing, per §7 rule 1) rather than in `resource/`, and the arena imports it
 * from here. Per [RoadToPureEngine.md](../docs/RoadToPureEngine.md) §12 point 6
 * and §17 decision 9 (item 22). */
export interface FrameTraffic {
  /** Bytes written once into a resident resource's first contents: geometry a
   * frame carries, a buffer's initial data, the fullscreen quad. Counted where
   * the write is made, once per resource rather than per frame. */
  written: number;
  /** Bytes uploaded into a resident resource already made: a uniform block a page
   * feeds every frame, replacing what was there. Counted where the upload lands,
   * so a queued upload against a handle a resize then frees is refused and never
   * counted. */
  uploaded: number;
}

export interface Backend {
  readonly name: BackendName;
  /** The language this backend's documents are written in. A caller reads it to
   * know which target to fetch, which is the one thing about a backend a caller
   * does have to know: sending a reader both targets is a third more bytes than
   * the site sends today. */
  readonly target: ShaderTarget;
  /** The frame has to be the one this backend's target names. That is a mistake
   * in the caller rather than a difference between the backends, so it is not
   * the forbidden method that throws on one and works on the other: the renderer
   * fetches by the target it asked for, so the pairing cannot come apart without
   * something else having gone wrong first.
   *
   * What a backend cannot build it never receives, because the manifest is the
   * only thing deciding which backend a shader can be drawn by. That is what
   * keeps a capability out of this interface instead of putting it here as a
   * method one of the two would answer by throwing. */
  /** What this device will and will not do, read out of whichever API this
   * backend speaks. Both answer it, which is what keeps a caller from having to
   * know which backend it holds, and neither throws: a device with nothing
   * optional reports no features rather than refusing the question. */
  report(): DeviceReport;
  /** The bytes that have crossed into this backend's resident resources since the
   * last reset — written once into first contents, uploaded per frame into one
   * already made — read from the arena and reported apart, per §17 decision 9
   * (item 22). Both backends answer it from their own arena and neither throws:
   * the resident lifetime is the arena's on either, so this is not a capability
   * one has and the other lacks. A benchmark prints it beside `cost()` and never
   * summed with it, because a resident traffic problem and a per-frame structural
   * one are different problems one merged number would hide. */
  traffic(): FrameTraffic;
  /** Zeroes both traffic totals, so a caller measures the window it cares about.
   * `traffic()` reports since-last-reset for this reason. */
  resetTraffic(): void;
  /**
   * A frame's three lifetimes composed into one drawable: the resident resources
   * it names allocated through the arena, the pipelines it draws with taken from
   * the pipeline cache, and the passes it runs planned for the executor. It
   * replaces `createProgram`, which built all three inside one method; each
   * lifetime now lives in its own module (`resource/`, `pipeline/`, `submit/`) and
   * this only composes them, per [RoadToPureEngine.md](../docs/RoadToPureEngine.md)
   * §5 and [ROADMAP.md](../docs/ROADMAP.md) item 15.
   */
  program(frame: FrameGraph): ShaderProgram;
  resize(width: number, height: number): void;
  /** Reads the frame back as RGBA, top row first on both backends. WebGL hands
   * it back bottom row first and that is corrected here, because a caller
   * comparing two backends would otherwise be comparing a mirror.
   *
   * It is a promise because one of the two cannot answer any sooner: WebGPU
   * copies the frame into a buffer and waits for that buffer to be mapped,
   * where WebGL blocks the thread until the card is done. Both waits are the
   * same wait, so nothing has to be synchronised afterwards on either.
   *
   * `from` reads back a caller-supplied texture rather than the backend's own
   * target — the same texture a `draw(into)` landed the frame in — so a capture
   * reads its own texture with the row-stride arithmetic owned here rather than
   * in the consumer (§17 decision 7, item 29). Absent, it reads the backend's
   * own target, exactly as before. It is a `GPUTexture` for the same reason
   * `draw`'s `into` is: a backend whose target is not one refuses a given `from`
   * by name. */
  readPixels(from?: GPUTexture): Promise<Uint8Array>;
  dispose(): void;
}

/** How many floats a uniform of this type occupies, which is what a caller needs
 * to know to hand one over and all it needs to know. */
export function componentsOf(type: string): number {
  if (type === 'vec2') return 2;
  if (type === 'vec3') return 3;
  if (type === 'vec4') return 4;
  return 1;
}
