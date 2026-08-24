# The renderer's design

**The `Dnnn` numbers in this file are entries in the decision archive of the `altpsyche-dev` repository, which is private.** They are kept as the address of an entry for anyone who has that tree. Every one of them says here what the entry settled, so nothing in this document depends on following a link out of it.

**What this document is.** It describes the renderer this repo is building: the words it uses, the types it exposes, who owns what, and which gate proves each part. It is written once and then kept current as the work lands, so the last step of the renderer item is verifying every row of the capability table below against the tree rather than writing this file again.

**Two decisions put it here.** D83 says the renderer is built out to the WebGPU core specification first, with one preset shader proving each capability, and the lesson plan then chooses among capabilities that already exist. D84, which makes the renderer test-driven against a recording device double with the preset as acceptance, says how the work is done: tests first against a stand-in for a graphics card that records what the backend asked for, one browser gate holding that stand-in honest against a real card, and today's behaviour described by tests before it is reshaped.

**What it is not.** There is no curriculum here and none belongs here. The episodes live in the consuming site's notes and they are Siva's. This document says what the renderer can draw, and the series planning session reads the capability table to pick from it.

**Where the queue is.** The step list was item 39 in the `altpsyche-dev` repository's roadmap, and that entry closed on 2026-08-21. That entry is deleted when the work closes. This file outlives it, which is why the type surface is written down here rather than there.

**What sits beside it.** [ABSTRACTION.md](ABSTRACTION.md) is the layer map: what each layer owns, where new capability attaches, the five invariants any growth has to survive, and an audit of where the churn is. The two documents overlap on three subjects and each one has a single home. **This document owns the type surface, the vocabulary, the refusal path, what the build writes and the capability table.** **That one owns the layer boundaries, the growth path and the questions still open about the direction.** Ownership and lifetime is written here because it is a property of the types; a reader who wants to know which layer may grow reads the other file.

## Where it starts, measured on 2026-08-20

`renderer/webgpu.ts` is 271 lines. It makes one render pipeline with `layout: 'auto'`, one vertex module written into the backend as a triangle that covers the screen, one fragment module at the fixed entry point `fragMain`, one uniform buffer, and one bind group holding that buffer. A frame is one `draw(3)`, started once per animation frame by `renderer/surface.ts`. There is no compute pipeline, no dispatch, no storage buffer, no sampler, no vertex or index buffer and no depth attachment.

The test coverage of that stack was 13 tests, none of which reached a backend. The first step of the item added the recording stand-in and 27 tests over today's behaviour, so the suite is 609 passing and 1 skipped.

## The words this document uses

Every one of these is a WebGPU word and every one is used here in the specification's sense. They are written out because the rest of this file leans on them and because a term used before it is given its plain meaning is a defect under this repo's voice brief.

- **A device** is the open graphics card, the object every call below is made on. One is asked for per page and never twice, which is D79, the decision that one renderer grows to cover the series rather than one being written per episode.
- **A document** is one file a reader could open and edit. A shader written in GLSL is two documents today, a vertex and a fragment. A shader written in WGSL or Slang is one. A compute capability is the first thing here that owns more than one.
- **A resource** is something a shader reads or writes that is not code: a block of numbers, a picture, a list of vertices. It has a size, a lifetime and a way of being fed.
- **A pipeline** is a compiled shader plus the fixed settings it draws under, which is the output format, the depth test, the blend mode and the shape the vertices make. Building one is the expensive call, so a pipeline is built once and used every frame.
- **A bind group** is the set of resources a pipeline reads on one draw, gathered into one object so the driver binds them in one call. A **bind group layout** is the shape of that set, written down ahead of the resources that fill it.
- **A pass** is a run of work inside a frame. A render pass draws into attachments, which are the textures it writes to. A compute pass runs a program over a grid of work items with no attachments at all.
- **A dispatch** is what starts a compute pass. It names how many **workgroups** to run, a workgroup being the small block of work items that can share memory with each other.
- **A frame description** is the whole of the above for one shader: its documents, its resources, its pipelines and the ordered list of passes that make one picture.
- **An artefact** is what the build wrote for one shader at one rung and what the runtime fetches. Under this design an artefact is a frame description.
- **A rung** is one entry on the ladder of how much work a shader does, named in the site's build-tier list as `desktop`, `optimized` and `minimal`.
- **A preset** is a source in the corpus that no page publishes and no gallery lists, marked `preset` in the manifest. The three language bases are presets today and every capability below lands with one.
- **A trace** is the ordered list of calls the backend made on a device, which is what the stand-in in the engine's own `tests/support/fake-gpu.ts` records and what the fast tests assert.

## The four calls Siva made here, on 2026-08-20

They are written down together because every step from 5 onward inherits all four, and because the rest of this document reads as description rather than as a proposal once they are settled.

1. **A frame is a description rather than one draw**, and not capability objects on the backend.
2. **A pass is declared in the shader's entry**, and not in a header block in the source, and not inferred from the source's entry points.
3. **`public/shaders/fragment/` is renamed to `public/shaders/source/`** in the step that lands the first preset with a compute pass, rather than left wrong or renamed ahead of the capability work.
4. **A capability preset is called `core-<capability>`**, where the three language bases are `base-<language>`.

None of the four is a decision entry of its own. D83 is the decision they serve, which is that the renderer is built to the WebGPU core specification first with one preset proving each capability, this document is the record of the shape, and the reversal recipe is at the bottom of this file. The one call in this work that does get an entry is the playground's editing model, because it amends two live decisions.

## The shape: a frame is a description

**An artefact stops being one source and becomes a small description of a frame.** The caller passes what the shader is, and the backend builds it. Today's single full-screen fragment shader is that description with one resource and one pass in it, so nothing about the two art shaders changes.

**Why this rather than capability objects on the backend.** The rule at the top of `renderer/types.ts` is that a method one backend has to throw from is the wrong method. A backend that grew `createComputePipeline`, `createSampler` and `createVertexBuffer` would be a backend where WebGL 2 throws from most of its own interface, and a caller asking whether its backend has compute is a caller branching on which backend it holds, which is the thing that rule exists to stop. A description has no such method. What a backend cannot build, it never receives, because the manifest is the only thing deciding what a shader can be drawn by, exactly as it already refuses a GLSL target to a shader written in WGSL.

**The caller's calls do not change.** A caller still asks for a program, sets uniforms by name and draws. `renderer/index.ts`, `renderer/surface.ts`, the site's surface hook and every gate keep the shape they have. What changes is what sits inside the value they pass around.

## The type surface

**The authority for the text of these types is `renderer/types.ts`, and these blocks are the record of which idea owns which field.** They were written as sketches before the work and they are kept because the reason a field sits where it does is not readable off a declaration. Every place the tree came out differently from a sketch is written under the block it belongs to, so a reader comparing the two is reading a correction rather than finding a contradiction. Where a sketch and the file disagree about the text, the file is right.

### What an artefact becomes

```ts
/** One shader at one rung, as the build wrote it and the manifest named it. */
export interface ShaderFrame {
  id: string;
  target: ShaderTarget;
  /** The names and types a caller may feed, unchanged from today. A page draws
   * its controls from the manifest and hands the values back by name, and none
   * of that cares how many passes read them. */
  uniforms: { name: string; type: string }[];
  /** Everything the frame reads or writes that is not code. */
  resources: ResourceSpec[];
  /** The shader documents, already fetched, each with the entry points the
   * pipelines below name. */
  modules: ModuleSpec[];
  pipelines: PipelineSpec[];
  /** Run in this order on one command encoder, every frame. */
  passes: PassSpec[];
  /** Which resource holds the picture once every pass has run, absent where a
   * pass drew into the frame's own colour target. */
  present?: string;
}
```

**`present` arrived with the compute pass of step 7 and was not in this sketch.** A render pass names the textures it writes and a compute pass names none, because what it writes are its bindings, and a storage texture cannot be an attachment of the pass that writes it. So a frame whose last word is a compute pass has a picture sitting in a texture with nothing saying it is the picture. The alternative was reading it off the usage flags, which means the renderer guessing which of several textures the reader is meant to see. The frame says so instead, and the backend copies that texture into the target the read and the canvas both come out of.

`ShaderArtefact` stays as the name a caller uses, and it becomes `ShaderFrame`. The two present shapes, `GlslArtefact` and `WgslArtefact`, stop being a union a caller narrows: what differs between the languages moves into the module and the pipeline, where it belongs.

**`swap` arrived with step 10 and `modules` came out as `documents`.** A pair of textures that trade places every frame is two names the backend exchanges after every pass has run, and it is on the frame rather than on either texture because neither half can say on its own that it is half of a pair. **The description and the frame are two types rather than one, and they name the shader's files differently.** `FrameDescription` is what the build wrote and it carries `documents`, each one an address and which of a rung's file names that address is. `ShaderFrame` is the same thing with those documents fetched and it carries `modules`, each one the code itself. It is the split the texture note below describes: an address is what the manifest can hold and the bytes are not.

### The resources

```ts
export type ResourceSpec =
  | UniformResource
  | StorageBufferResource
  | TextureResource
  | SamplerResource
  | VertexResource
  | IndexResource;

/** The block of numbers a page feeds by name. Every shader has exactly one and
 * it is the only resource that exists today. */
export interface UniformResource {
  kind: 'uniform';
  name: string;
  /** Where each value sits, from the compiler for Slang and computed from the
   * struct for WGSL by `wgsl-layout.ts`. */
  block: UniformSlot[];
}

export interface StorageBufferResource {
  kind: 'storage';
  name: string;
  bytes: Extent;
  access: 'read' | 'read-write';
}

export interface TextureResource {
  kind: 'texture';
  name: string;
  size: [Extent, Extent];
  format: GPUTextureFormat;
  /** What the frame does with it, which is what the usage flags are built from.
   * A texture a pass writes and a later pass reads names both. */
  use: ('sample' | 'storage' | 'attachment')[];
  /** Where its first contents come from, absent for one that starts empty. The
   * address is the build's to write, the same as a document's. */
  source?: string;
  mips?: 'generate' | 'none';
  samples?: 1 | 4;
}

export interface SamplerResource {
  kind: 'sampler';
  name: string;
  filter: 'nearest' | 'linear';
  wrap: 'clamp' | 'repeat' | 'mirror';
}

/** Geometry the build generated, since a buffer's contents are numbers and no
 * source file holds them. The primitive is named in the entry and the numbers
 * are written by the build. */
export interface VertexResource {
  kind: 'vertices';
  name: string;
  /** Bytes per vertex and what each field in one is, which is what the pipeline
   * needs to read them. */
  stride: number;
  attributes: { name: string; offset: number; format: GPUVertexFormat }[];
  source: string;
  count: number;
}

export interface IndexResource {
  kind: 'indices';
  name: string;
  format: 'uint16' | 'uint32';
  source: string;
  count: number;
}

/** A size that is either a fixed number or the frame's own. `frame` is what
 * makes a resource follow a resize, and it is the difference between a
 * ping-pong pair that survives the reader dragging the window and one that
 * comes back empty. */
export type Extent = number | 'frame';
```

**A texture's contents came out as two fields rather than one.** The sketch has `source`, which is the address, and the tree has `data` beside it, which is the bytes that came back from that address. It is the same split `UniformResource` already carries: a description is what the manifest holds and it names an address, and a frame is that description filled in, so the bytes cannot be in the thing the build writes. `frameOf` refuses a description naming a picture nobody fetched, because the alternative is a texture of whatever the memory held and a shader sampling it without complaint. **A sampled texture may not be the frame's own size**, refused in `declaredFrame` and again in the backend, since a texture that follows the frame is remade on every resize while its bytes arrived once.

**`StorageBufferResource` came out as `BufferResource` and its size is a plain number.** It is not called storage because two of the things a description asks a buffer for are not storage at all: the words a draw or a dispatch reads its counts from, and the words the card writes a timestamp pair or a sample count into. Its size is bytes rather than an `Extent` because nothing about a buffer follows the frame, and the one buffer nothing in a source declares is the one a query resolves into, which is why the rule that every sized buffer is a source's own is loosened for exactly that case.

**`Extent` came out narrower than this sketch.** The third case named one axis of the frame for the other axis's size, and nothing needs it: a resource is sized to the frame on both axes or to numbers on both. It goes back in when a preset wants a strip rather than a picture.

**Geometry came out in three ways this sketch did not have, and each of the three is one number kept in one place.** A vertex's fields are keyed by the location the source reads them at rather than by a name, because a name is the source's own and a location is what the card is given. The topology sits on the vertex resource rather than on the pipeline, since which vertices make one triangle is a fact about the order the indices were written in. And the vertex resource names its index resource, because the entry declares one primitive and the build derives both buffers from it, so the two cannot be declared apart. The pipeline names the geometry it reads, which is where the layout is spent, and the pass carries the instance count alone: `draw` is a count of the backend's own corners or a count of instances, and the number of vertices stays with the bytes rather than being written beside them where it could disagree.

### The modules and the pipelines

```ts
export interface ModuleSpec {
  name: string;
  code: string;
  /** Which of the source's own overridable constants this rung asks a different
   * value for. Absent where the rung asks for the source's own numbers. The
   * module is the same text at every rung, so these numbers are the only thing
   * separating a phone's picture from a desktop's. */
  overrides?: Record<string, number>;
}

export type PipelineSpec = RenderPipelineSpec | ComputePipelineSpec;

export interface RenderPipelineSpec {
  kind: 'render';
  name: string;
  /** The vertex half. `fullscreen` is the backend's own triangle, which is what
   * every shader here draws on today and what a WGSL source has no second half
   * for. Naming a module instead is the first case where the vertex program is
   * the shader's own. */
  vertex: { module: string; entry: string } | 'fullscreen';
  fragment: { module: string; entry: string };
  /** The resources this pipeline reads, in the order the source binds them.
   * Written down rather than asked of the driver, which is what replaces
   * `layout: 'auto'` and what lets a compute pass and a render pass share one
   * layout. */
  bindings: BindingSpec[];
  /** More than one where the pass writes several pictures at once. */
  targets: { format: GPUTextureFormat; blend?: GPUBlendState }[];
  depth?: { format: GPUTextureFormat; compare: GPUCompareFunction; write: boolean };
  topology: GPUPrimitiveTopology;
  /** How many samples of each pixel the attachments of this pipeline's pass keep,
   * absent where they keep one. Four is the only count core WebGPU guarantees, so
   * the sketch's `1 | 4` came down to the one value: a count of one is the absence
   * of the field, and a description that cannot write any other number cannot
   * carry one the device would refuse.
   *
   * The count is declared on the attachment as well, and the entry is where it is
   * written by hand. This copy is derived from that one, the way a target's format
   * already is, because the card takes the count at both calls and reports a
   * disagreement between them against whichever arrived second. */
  samples?: 4;
}

export interface ComputePipelineSpec {
  kind: 'compute';
  name: string;
  compute: { module: string; entry: string };
  bindings: BindingSpec[];
  /** The block size the source declares, read off the source rather than
   * written twice, since the dispatch count is computed from it. */
  workgroup: [number, number, number];
}

export interface BindingSpec {
  group: number;
  binding: number;
  /** The resource by the name it carries above. */
  resource: string;
  /** Which stages read it, which is what the layout needs and what a driver
   * refuses a pipeline over when it is wrong. */
  visibility: ('vertex' | 'fragment' | 'compute')[];
}
```

**Four things about a pipeline came out differently, and each is a number moved to the one place that can hold it.** `topology` left for the vertex resource, since which vertices make one triangle is a fact about the order the indices were written in. `geometry` arrived in its place, naming the vertex resource this pipeline reads, because that is where the vertex layout is spent. `targets` became optional, since a pipeline that names none writes the frame the reader sees and the frame's own format is the backend's answer alone. And the depth settings grew a `stencil` mode beside the comparison, so one field says both what a pass tests and what it leaves behind, where a mode plus a number written next to it could disagree about which value the mark is.

### The passes

```ts
export type PassSpec = RenderPassSpec | ComputePassSpec;

export interface RenderPassSpec {
  pipeline: string;
  /** The textures this pass writes. Empty means the frame's own target, which
   * is the case every shader on the site is today. */
  /** `resolve` is where an attachment keeping several samples of each pixel is
   * averaged into a picture keeping one. It sits on the attachment rather than on
   * the pass, which is where this document had it: a pass may write several
   * colours and each of them is averaged into a picture of its own, and one name
   * on the pass can only ever describe the first. */
  colour: { resource: string; clear?: [number, number, number, number]; resolve?: string }[];
  depth?: { resource: string; clear?: number };
  draw:
    | { vertices: number; instances?: number }
    | { indices: string; count: number; instances?: number }
    | { indirect: string };
}

export interface ComputePassSpec {
  pipeline: string;
  /** No `kind` on either pass, and that is the one thing settled here that the
   * sketch above got wrong. Which kind of pass this is comes off the pipeline it
   * names, since a pass claiming one kind while naming a pipeline of the other is
   * a disagreement nothing could resolve, and the renderer compares the two where
   * it looks the pipeline up rather than trusting either. */
  /** How many workgroups to run. `frame` covers the frame in blocks of the
   * pipeline's workgroup size, which is what a shader writing a picture wants
   * and what saves every such preset from doing that arithmetic itself. */
  dispatch: [number, number, number] | 'frame' | { indirect: string };
}
```

**A pass came out with three fields this sketch has none of, and its draw lost one case.** `timed` and `visible` name the buffers the card writes a timestamp pair and a count of surviving samples into, and they sit on the pass because a pass is what is timed and what is counted. `colour` became optional for the same reason a pipeline's targets did. And the draw's indexed case is gone: a pipeline names the geometry it reads, so how many vertices there are stays with the bytes and the pass carries only how many copies to draw. **A dispatch gained a fourth form, `{ over: <resource> }`**, which works the count out from that texture's size and the pipeline's own workgroup size. It exists so a pass writing a grid of its own size does not have that grid divided by a block size and written down anywhere: a grid of 256 at a workgroup of 8 is never the number 32 in any file.

### What a program becomes

`ShaderProgram` kept every method it had and gained one:

```ts
export interface ShaderProgram {
  setUniforms(values: Record<string, UniformValue>): void;
  unreached(names: string[]): string[];
  draw(): void;
  writeBuffer(name: string, data: Uint8Array<ArrayBuffer>): void;
  readBuffer(name: string): Promise<Uint32Array>;
  dispose(): void;
}
```

**`readBuffer` arrived with the queries of step 17, and `Backend` gained `report()` in the same step.** Both are on both backends, which is the rule at the top of `renderer/types.ts` holding rather than bending.
`report()` answers a flat record of ceilings by name and a sorted list of the optional parts, and WebGL 2 answers its own: 19 ceilings and 30 extensions on this machine against WebGPU's 36 ceilings and 19 optional parts.
`readBuffer` answers the words of a buffer the frame declares, and a backend with no buffers to declare answers with no words, which is the true answer for it rather than a refusal.
That is the difference between a method a backend has nothing to say through and one it has to throw from: a shader the manifest gives WebGL 2 declares no buffer, so an empty answer is never a shader's question going unanswered.

**`writeBuffer` arrived with step 1.2 and it is the runtime write for a buffer that is not the uniform block.** Feeding the block through `setUniforms` replaces its numbers every draw, and this replaces a storage buffer's numbers between one frame and the next in the same way: the description says the buffer exists, and the running page hands it later bytes. Only a buffer the build gave first contents may be replaced, because that is the one a program was made able to take bytes into; a buffer the card fills for itself, a scratch buffer a compute pass writes or the words a query resolves into, is refused here by name. WebGL 2 declares no such buffer, so its `writeBuffer` does nothing, which is the same shape `readBuffer` has on it.

`draw()` runs every pass of the description in order on one command encoder and submits once. A frame with one pass in it makes exactly the calls the backend makes today, which is what lets the characterization tests from step 1 stand through the reshape.

`Backend` also keeps every method it has. `createProgram` takes a `ShaderFrame` instead of a `ShaderArtefact`, `resize`, `readPixels` and `dispose` are untouched, and neither backend gains a method the other has to throw from.

**One thing about the renderer's own type checking.** The site's renderer tsconfig held this stack to `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`, so every array read above is a value that may be undefined and every optional field is absent rather than set to undefined. That is why the optional fields are written as `field?: T` and never as `field: T | undefined`, and why a description is walked with `for (const pass of passes)` rather than by index.

## Where each number comes from

**A binding number is read off the source, never written down twice.** A WGSL document declares `@group(0) @binding(0)` on the thing it reads, and the build parses that the same way `wgsl-layout.ts` already computes the uniform block from the struct rather than trusting a written layout. The reason is the one that file's header gives: a number written in two places can disagree, and the failure is silent, because the buffer fills from the old positions and the shader still compiles and still draws. The same rule covers a workgroup size, which the source declares as `@workgroup_size(8, 8)` and no entry restates.

**A pass is declared in the shader's entry, not in the source.** D55 says a source under a site's `public/shaders/source` is the whole shader and the build adds nothing to it, so a pass list written as a comment header in the source would be a build putting its own vocabulary back into a file it promised to leave alone. The entry is where `language`, `uniforms`, `complexity` and `mobileOverrides` already sit. It is also the split D57 already made for controls: the document declares what exists and the entry says what it looks like. Here the document declares its bindings, its entry points and its workgroup size, and the entry says which pipeline runs when, at what size, and into what.

**A size is a number or the frame.** A resource sized `frame` is rebuilt when the surface resizes and a resource sized in numbers is not. That single word is what makes a ping-pong pair follow a window being dragged, and it is why the build writes a size rather than the backend guessing one.

**A source lives under `public/shaders/source/`, which it has since the compute step of 2026-08-21.** `shaderSourcePath` in the site's source-path module is the one rule that turns an id into a path, and a compute shader is not a fragment, so the directory was renamed as the compute capability landed. What moved with it is `shaderSourcePath`, every address in the manifest, `check:comment-labels`'s reading of the tree, and the paths written out in the site's shader-base module. It is done then rather than later because the same work costs more with more files in it, and rather than earlier because a rename with no capability beside it is a step the plan does not have.

**A capability preset is called `core-<capability>`.** So `core-compute`, `core-texture`, `core-state`, `core-geometry`, `core-perdraw`, `core-depth`, `core-target`, `core-mips`, `core-multisample`, `core-indirect`, `core-report`, `core-stencil` and `core-scene`, which is thirteen of the fifteen the engine's own fixture corpus holds, `core-draw-list` and `core-material` being the two added since. That corpus is the engine repository's and no preset is a source here any more. The last of them is the engine's rather than a new device capability: it draws one object whose matrix the engine worked out from a scene, using the mat4 uniforms and the buffer geometry the device layer already had. The three language bases keep `base-<language>`, since they are named for the language they open the playground in and a capability preset is named for what it proves.

**A rung's numbers still ride beside the file names.** Nothing about the ladder changes. A WGSL document is the same text at every rung and its rung values are spent when the pipeline is created, which is D77, where a WGSL shader reduces per rung through pipeline overridable constants. A description with several modules carries the overrides per module, since two documents of one shader may each declare their own constants.

## Ownership and lifetime

| thing                                        | owned by                 | survives a resize                           | survives a device loss                |
| -------------------------------------------- | ------------------------ | ------------------------------------------- | ------------------------------------- |
| the device                                   | the page, asked for once | yes                                         | no, and nothing does                  |
| the canvas context                           | the backend              | yes                                         | no, and the canvas has to be replaced |
| the frame's own colour target                | the backend              | no, it is rebuilt at the new size           | no                                    |
| a shader module                              | the program              | yes                                         | no                                    |
| a pipeline and its bind group layout         | the program              | yes                                         | no                                    |
| a uniform buffer                             | the program              | yes                                         | no                                    |
| a storage buffer or texture sized in numbers | the program              | yes, and its contents survive               | no                                    |
| a texture sized `frame`                      | the program              | no, it is rebuilt and its contents are gone | no                                    |
| a bind group                                 | the program              | rebuilt wherever a resource under it was    | no                                    |
| a vertex or index buffer                     | the program              | yes                                         | no                                    |

**The one rule behind the whole table.** A program owns everything its description names, and the backend owns only the target the frame is drawn into and the context it is shown through. That is what makes a program disposable on its own, which is what the program cache in `renderer/index.ts` needs, and it is what keeps state alive across frames without the backend knowing which shader is running.

**A device loss takes all of it.** A device does not come back, so the caller fetches the other target and draws it on a fresh canvas, which is what `onDeviceLost` already asks of a caller and why a canvas that has held a WebGPU context cannot be handed a WebGL 2 one. None of that changes.

**A contents-preserving resize is not offered.** A texture sized to the frame loses what was in it. Making that survive means drawing the old contents into the new texture, which is a scaling decision the renderer has no business making for a shader. A preset that needs its state across a resize declares a fixed size and samples it.

## The WebGL 2 subset

**WebGL 2 implements one shape and refuses everything above it:** one render pass, one uniform block, the backend's own full-screen triangle, and one colour target which is the frame. It has no compute pipeline, no storage buffer, no second pass, no depth attachment and no instancing, and it never grows one, because every capability above that line is the reason WebGPU is here.

**Nothing branches on the backend to make that true.** The manifest is what decides. A preset above the subset has no GLSL target, so `hasWgslTarget` is true for it, `chooseBackend` asks for a card, and a browser that gives none falls back to WebGL 2 where `loadArtefact` refuses with `shader "<id>" has no GLSL target`. That refusal is the case D63 already built a surface for, WGSL being publishable and a reader with no WebGPU getting the captured frame: the reader is shown the captured frame and the reason, in the words the site's refusal module holds and the treatment its `WgslRefusal` component gives. So a compute preset on a browser with no WebGPU is a case the site already handles, and no new refusal surface is written for it.

**What the two art shaders are held to across the whole arc.** `deep-field` and `gyroid-dreams` are hand-written GLSL, they are one pass, and they stay byte-identical in `out/` from the first step of this work to the last.

## Refusal, per capability

**A refused shader is not a failed surface.** A caller reading a refusal as a failure swaps its canvas for a message, which takes the graphics context with it, so the loop stops and the last good frame goes. That was measured at 0 draws in the second after, against 60 once the refusal went to the caller's error handler instead. Every capability below inherits that rule.

**Three ways a description can be refused, and they arrive differently.**

1. **A document that does not compile.** WebGPU answers through the module rather than by throwing where it was made, so the message arrives a moment later on `getCompilationInfo`. With several documents the message has to say which one, so the refusal text is prefixed with the module's name. A reader typing in the playground is exactly the case that needs it.
2. **A pipeline the driver will not accept, for a reason that is not the code.** A workgroup size over the device limit, a binding whose visibility does not match the stage that reads it, a colour format the device does not allow as a target. WebGPU reports these as validation errors rather than compilation ones, so pipeline creation is wrapped in an error scope and what comes back goes to the same `onRefused` callback with the same words. Without that they arrive as uncaptured device errors, which is a run's worth of noise and no message for the reader: it was 366 uncaptured errors in one run before the rollback below existed.
3. **A description the renderer itself will not build**, which is a resource named by a binding and never declared, or a pass naming a pipeline that is not there. That is caught before any device call, thrown from `createProgram`, and it is a defect in the build rather than in a reader's source.

**What a refusal rolls back to.** The last description that drew, held whole rather than per document. A WebGPU draw of a module that did not compile throws nothing, so the last artefact that drew without throwing names the refused one and keeps drawing it, which is the reason `renderer/surface.ts` holds `before` rather than reading the current value. With several documents the same rule applies to the whole description, because one document changing is a new description, and going back a document at a time would leave a pipeline built from two halves that were never compiled together.

## A shader of several documents

**Today every surface assumes one.** `loadShaderSource` returns one text, the playground's editor holds one document, `setArtefact` swaps one artefact, and `check:code-parity` and `check:complete-blocks` hold an article against one source. The first preset with a compute pass owns two, and that is the point at which those assumptions cost something.

**What this document settles about it, which is the mechanism.** A description carries its documents as a list, and a reader's edit rebuilds the description with one document replaced and hands the whole thing to `setArtefact`. That call compares by identity and a rebuilt description is a new object, so nothing about the swap changes. A refusal rolls back the whole description, per the rule above.

**The surface was settled on 2026-08-21 as D85**, where every hand-written document of a shader is editable and every generated one is read only. It amends D51, which opens the playground on a language the reader picks, and D57, which is the control split above, because both of those rested on a shader being one editable document. That entry is what says how the playground shows a shader of several documents, which is one tab per document with every hand-written one editable and every generated one read only, and it is the home for that question rather than this file. **What it leaves open is the article rather than the editor**: no post quotes a shader of several documents yet, so what `check:code-parity` holds such a post to is a question the first one asks and nothing has answered.

## The capability table

**This is the table the series planning session reads.** One row per capability, with the step that landed it, the preset that exercises it, the tests that assert its calls and the gate that reads it. **Every row through step 18 was verified against the tree on 2026-08-21**, and the readings that verified it are under the table; the per-copy row landed on 2026-08-22 as item 40's step 1.1 and its readings are in that step's commit.

| capability                                                  | step                                              | preset                                                                              | tests                                                  | gate                                                                                      |
| ----------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| a fragment shader fed by a uniform block                    | shipped                                           | `base-glsl`, `base-slang`, `base-wgsl`                                              | `renderer-webgpu`, `renderer-webgl2`                   | `backends`, `preview`, `hardware`, the trace                                              |
| overridable constants per rung                              | shipped, D77                                      | `base-wgsl`                                                                         | `shader-build`, `renderer-webgpu`                      | `backends`                                                                                |
| a frame is a description of passes                          | 5                                                 | the three bases, unchanged                                                          | `frame-description`, `shader-frame`                    | every gate, all unmoved                                                                   |
| an explicit bind group layout                               | 6                                                 | the three bases, unchanged                                                          | `renderer-webgpu`                                      | the trace, `preview`                                                                      |
| compute pipeline, dispatch, storage texture                 | 7                                                 | `core-compute`, two ripples crossing, written by compute                            | `renderer-compute`                                     | `backends`, the fast suite                                                                |
| sampled textures and samplers                               | 9                                                 | `core-texture`, value noise the build wrote, read twice                             | `renderer-texture`                                     | the trace, `backends`                                                                     |
| resources that survive a frame, and several passes          | 10                                                | `core-state`, two substances spreading through a grid                               | `renderer-state`                                       | the trace, `surface`, `backends`                                                          |
| vertex and index buffers, instancing, inter-stage variables | 11                                                | `core-geometry`, a grid of quads lifted into a ridge, drawn three times             | `renderer-geometry`                                    | the trace, `backends`                                                                     |
| per-copy data fed to a second bind group                    | 1.1                                               | `core-perdraw`, a grid drawn four times, each copy handed its own colour and height | `shader-content`, `shader-describe`, `renderer-webgpu` | the trace, `backends`                                                                     |
| a buffer's contents replaced while the page runs            | 1.2                                               | `core-perdraw`, whose copy colours the page writes over between frames              | `renderer-buffer`                                      | `surface`                                                                                 |
| depth, several colour targets, blending                     | 12                                                | `core-depth`, two flat sheets leaning opposite ways and crossing                    | `renderer-depth`                                       | the trace, `backends`                                                                     |
| render to texture, and a pass that samples it               | 13                                                | `core-target`, a ridge drawn into a texture, then graded and darkened               | `renderer-targets`                                     | the trace, `backends`                                                                     |
| mipmaps and the formats the device exposes                  | 14                                                | `core-mips`, one picture read at a level of detail climbing across the frame        | `renderer-mips`                                        | the trace, `backends` and its format table                                                |
| multisampling                                               | 15                                                | `core-multisample`, a leaning sheet whose outline is part-covered pixels            | `renderer-multisample`                                 | the trace, `backends`                                                                     |
| a buffer the source reads and writes                        | 16                                                | `core-indirect`, which declares two of them                                         | `renderer-buffer`                                      | the fast suite, `backends`                                                                |
| indirect draw and indirect dispatch                         | 16                                                | `core-indirect`, one pass writing how much the two after it do                      | `renderer-indirect`                                    | the trace, `backends`                                                                     |
| timestamp and occlusion queries, adapter limits, features   | 17                                                | `core-report`, two sheets where the far one's surviving samples are counted         | `renderer-queries`, `renderer-report`                  | `backends` prints the limits, the features and the formats; the fast suite holds the rest |
| a stencil masking one surface with another                  | 18                                                | `core-stencil`, a field cut to the shape a first pass marked                        | `renderer-stencil`                                     | the trace, `backends`                                                                     |
| a scene of transforms placing one object                    | 3.1.3                                             | `core-scene`, one sheet placed by the engine's world and camera matrices            | `engine-preset`, `engine-scene`, `engine-maths`        | the trace, `backends`                                                                     |

**What the rows point at from this repository, checked row by row when the table arrived here on 2026-08-24.** Every `core-*` name in this document is a file in `fixtures/source/`, **15 of 15**, and the table itself carries **13** of them: `core-draw-list` and `core-material` are fixtures with no row, named only where the naming convention is given. **Four rows name `base-glsl`, `base-slang` and `base-wgsl`**, which are the `altpsyche-dev` site's own shaders rather than fixtures here, because the capability they prove shipped before this repository had a corpus of its own, and a Slang base cannot travel. In the last column, `the trace`, `the fast suite` and `surface` are this repository's gates, and `backends`, `preview` and `hardware` are that site's.

**The readings the table was verified against, all taken on 2026-08-21 against one build of the `altpsyche-dev` site, when the eleven capability presets and the renderer both still lived in that tree.** They are what the table was accepted on and they are not re-taken here, so read them as a record rather than as this repository's numbers: the corpus is fifteen fixtures here now and the counts below cannot be reproduced against it. `backends` draws **21 artefacts with 19 skips, each skip naming its reason**, and the eleven capability presets are all among the 21. The trace contract is **12 of 12 agreeing**. The fast suite is **1,016 tests over 62 files, 1,015 passing and 1 skipped**, of which the renderer's own files are 21 holding 337 tests, every one of them passing: the eighteen under `tests/renderer-*`, plus the description, the frame and the artefact loader. `out/` is **257 files and 32,099,816 bytes**.

**Three of those capabilities have no picture, and what they report is a number.** The pass a query times and the samples a draw has counted are read back through `readBuffer`, and the count moves exactly as the near sheet covers the far one: **0 samples with it centred, 82,240 with it half aside and 102,400 with it clear**, at 269,880, 239,497 and 102,400 of 480,000 pixels lit. The pass took 178,313, 190,093 and 188,904 ns on the software renderer, and on the card the counts and the lit totals are identical while the times are 512, 1,536 and 1,792 ns, which climbs with how much was drawn where the software renderer's does not. **Those numbers were read by a probe inside the step that landed them rather than by a standing gate**, which is worth saying plainly: the site's `backends` gate draws `core-report` and prints its lit count, and nothing in the harness prints the count or the times on every run. What is held every run is the behaviour, by `renderer-queries`: a pass whose device has no timing draws with no query set at all rather than refusing the frame, leaves the buffer as it found it, and still counts samples, since a sample count needs nothing optional.

**What the device says about itself, measured through `report()` on this machine.** WebGL 2 answers **19 ceilings and 30 extensions**, WebGPU **36 ceilings and 19 optional parts**. The nineteen include `timestamp-query`, because the device request asks for everything the adapter offers, and an earlier reading of one optional part was taken before that change.

**The format table moved with the same change and the earlier reading is superseded.** The site's `backends` gate makes a texture of every format for every use inside an error scope, since WebGPU has nothing to enumerate. It now reports **16 formats, every one of them both sampled and attachable, and 5 of those also taking a storage write**, which are `rgba8unorm`, `bgra8unorm`, `rgba16float`, `r32float` and `rgba32float`. The reading taken when that table landed was fifteen formats with `rg11b10ufloat` sampled and nothing else; asking for every optional part the adapter offers brought in `rg11b10ufloat-renderable`, so that row is attachable now and nothing in the list is sampled alone. The corpus is checked against the answer in the same run and nothing in it is refused.

## What this document does not settle

**Two of the three things this section used to hold are settled now**, and they are recorded where their answers live rather than restated here. The playground's editing model is D85: one tab per document, every hand-written one editable and every generated one read only. Matrices landed with the depth step: `wgsl-layout.ts` has a shape for a three by three and a four by four, both held to the block Slang emits for the same fields, at 48 bytes on a sixteen and 64 on a sixteen. **A two by two is refused by name**, because Slang pads every column to four components and emits 32 bytes where the language asks for 16, so the two rules differ and nothing here can say which a hand-written source meant.

**What is left is whether the uniform block stays one resource.** A frame with a compute pass and a render pass may want two blocks with different contents. Eleven capability presets later, none does: every one of them feeds one block by name and the passes inside it read the same values. The recommendation is unchanged, which is that it stays one until a preset needs two, because one block is what every surface on the site feeds and splitting it is a change to how a page hands values over rather than a change to the renderer.

**Where the questions about the direction live.** [ABSTRACTION.md](ABSTRACTION.md) carries four of them, each one Siva's to answer, and an audit of where this stack resists growth. They are not repeated here because a question with two homes is a question that gets answered in one of them and stays open in the other.

## Reversing this design

**Revert the commits carrying `Decision: D83`, newest first, and delete the presets that go with them**, which is what D83's own reversal recipe says. This document goes with the last of them.

**Reversing the description alone**, without giving up the capabilities, means putting the capabilities back on the backend as methods, and that is the shape the rule in `renderer/types.ts` refuses. So the description is not a step that can be undone on its own: what would undo it is deciding that rule wrong, which is a decision of its own.
