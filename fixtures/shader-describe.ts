/**
 * The frame a shader's entry declares, turned into the description the build
 * writes.
 *
 * Almost nothing here comes from the entry. The source declares its own
 * bindings, the format of every texture it writes, the block size a compute
 * entry point runs in and which stage each entry point is, and all of that is
 * read off the file. What an entry declares is the handful of things a source
 * cannot say: how big each resource is, which pipeline runs at what dispatch,
 * which resource is the picture, which picture a sampled texture starts with,
 * and how the card reads that texture between its own pixels and past its last.
 *
 * A shader that declares no frame is one pass over the whole frame, and that
 * description is built without any of this.
 */
import { WGSL_DOCUMENT } from '@altpsyche/engine';
import { uniformBindingOf } from '@altpsyche/engine';
import { dispatchesIndirectly } from '@altpsyche/engine';
import { namesReachedBy } from '@altpsyche/engine';
import {
  computeEntriesOf,
  hasEntry,
  sampledTexturesOf,
  samplersOf,
  storageBuffersOf,
  storageTexturesOf,
  vertexInputsOf,
} from './wgsl-pipelines';
import { BUFFER_CONTENT, TEXTURE_CONTENT } from './shader-content';
import { GEOMETRY_PRIMITIVE } from '@altpsyche/engine';
import { BLEND_MODE } from './shader-blend';
import type {
  BindingSpec,
  FrameDescription,
  PassSpec,
  PipelineSpec,
  RenderPassSpec,
  RenderPipelineSpec,
  ResourceSpec,
} from '@altpsyche/engine';
import type { DeclaredFrame } from './declared-frame';

/** What one pipeline draws its colours into and how each one is mixed, which is
 * read off the attachments its pass writes rather than declared beside it. */
type RenderPipelineTargets = NonNullable<RenderPipelineSpec['targets']>;

/** The depth test one pipeline runs, which is the entry's two answers plus the
 * format of the attachment its pass keeps the depth in. */
type RenderPipelineDepth = NonNullable<RenderPipelineSpec['depth']>;

/** The name the one uniform resource of a frame carries, which is the name the
 * one-pass descriptions use, so a binding points at a resource by the same name
 * whichever description built it. */
const UNIFORMS = 'uniforms';

/** The three corners the backend supplies, which is what a render pass declared
 * with no geometry of its own covers the frame with. */
const FULLSCREEN_VERTICES = 3;

/** How many copies of its geometry a pass draws when it asks for no number. */
const ONE_INSTANCE = 1;

/** Where a texture the build wrote is fetched from. It is one address per shader
 * and texture rather than one per rung, because the bytes do not change with the
 * depth a phone marches to. */
export const textureFileName = (id: string, name: string): string => `${id}-${name}.bin`;

/** Where one buffer of a generated primitive is fetched from. The role is in the
 * name because a primitive is two files and both are the same shader's, and it is
 * one address per shader and primitive for the reason a picture's is: the numbers
 * do not change with the depth a phone marches to. */
export const geometryFileName = (id: string, name: string, role: 'vertices' | 'indices'): string =>
  `${id}-${name}.${role}.bin`;

/** Where the contents of one build-filled buffer are fetched from. One address
 * per shader and buffer, for the reason a texture's is: the numbers a copy is
 * handed do not change with the depth a phone marches to. */
export const bufferFileName = (id: string, name: string): string => `${id}-${name}.buffer.bin`;

/**
 * Every picture and every run of numbers a frame's declaration asks for, keyed by
 * the address the description sends a reader to.
 *
 * It is here rather than beside the loader so one module owns both the name and
 * the bytes. The size is the declaration's and the layout and the format are the
 * generator's, which is the split `declaredFrame` reads them under, so a file and
 * the description it is fetched by cannot disagree about either.
 */
export function generatedBytes(id: string, declared: DeclaredFrame | undefined): Map<string, Uint8Array<ArrayBuffer>> {
  const made = new Map<string, Uint8Array<ArrayBuffer>>();

  for (const texture of declared?.textures ?? []) {
    if (!texture.content) continue;
    // A texture carrying contents is fixed, never frame-following — the describe
    // path refuses `{ scale }` beside contents — so its size is a `{ width, height }`
    // pair. A `{ scale }` here is that refused case; generate nothing and let the
    // describe throw name it.
    if (!('width' in texture.size)) continue;
    made.set(
      textureFileName(id, texture.name),
      TEXTURE_CONTENT[texture.content].bytes(texture.size.width, texture.size.height)
    );
  }

  for (const one of declared?.geometry ?? []) {
    const bytes = GEOMETRY_PRIMITIVE[one.primitive].bytes(one.size[0], one.size[1]);
    made.set(geometryFileName(id, one.name, 'vertices'), bytes.vertices);
    made.set(geometryFileName(id, one.name, 'indices'), bytes.indices);
  }

  for (const buffer of declared?.buffers ?? []) {
    if (!buffer.content) continue;
    made.set(bufferFileName(id, buffer.name), BUFFER_CONTENT[buffer.content].bytes(buffer.bytes));
  }

  return made;
}

/** The name the index buffer of one primitive carries on the description. It
 * comes off the primitive's own name rather than being declared, because the
 * indices address exactly those vertices and nothing else may point at them. */
export const indexResourceName = (name: string): string => `${name}-indices`;

/**
 * What the entry declared, checked against what the source declares, as a
 * description.
 *
 * Every disagreement between the two stops the build rather than reaching the
 * card, because each of them is silent there: a dispatch of an entry point that
 * is not in the file is a pipeline the driver refuses after the fact, a texture
 * nothing binds is a picture that stays whatever the memory held, and a present
 * naming nothing is a frame that copies out the wrong texture.
 */
export function declaredFrame(id: string, code: string, declared: DeclaredFrame): FrameDescription {
  const entries = new Map(computeEntriesOf(code).map((found) => [found.entry, found]));

  // One pipeline per entry point a pass names, in the order the passes name them,
  // and a pipeline named by two passes is built once and run twice.
  const named = [...new Set(declared.passes.map((pass) => pass.pipeline))];

  // Which kind of pipeline a pass runs is the source's answer rather than the
  // entry's, for the reason every other number here is: a pass claiming one kind
  // while the file declares the other is a pipeline the driver refuses after the
  // fact, with a message about a stage rather than about the description.
  const stages = new Map(
    named.map((name) => {
      const compute = entries.get(name);
      if (!compute && !hasEntry(code, 'fragment', name)) {
        throw new Error(`the frame for "${id}" runs "${name}" and its source declares no such entry`);
      }
      return [name, compute];
    })
  );
  for (const pass of declared.passes) {
    const compute = stages.get(pass.pipeline);
    if (compute && pass.dispatch === undefined) {
      throw new Error(`the frame for "${id}" runs the compute entry "${pass.pipeline}" with no dispatch`);
    }
    if (!compute && pass.dispatch !== undefined) {
      throw new Error(
        `the frame for "${id}" dispatches "${pass.pipeline}", which its source declares as a fragment stage`
      );
    }
  }

  // Which primitive each pass draws and which vertex stage reads it. A pass
  // naming one without the other has nowhere for its vertices to come from or
  // nothing to read them, and both are a pipeline the driver refuses after the
  // fact rather than a picture that comes out wrong.
  const primitives = new Map((declared.geometry ?? []).map((one) => [one.name, one]));
  const drawn = new Map<string, { geometry: string; vertex: string }>();
  for (const pass of declared.passes) {
    if (pass.geometry === undefined && pass.vertex === undefined) continue;
    if (pass.geometry === undefined || pass.vertex === undefined) {
      const half = pass.geometry === undefined ? 'geometry' : 'vertex stage';
      throw new Error(`the pass on "${pass.pipeline}" of "${id}" draws through a ${half} it does not name`);
    }
    if (stages.get(pass.pipeline)) {
      throw new Error(`the frame for "${id}" draws geometry through "${pass.pipeline}", which is a compute stage`);
    }
    const primitive = primitives.get(pass.geometry);
    if (!primitive) {
      throw new Error(
        `the pass on "${pass.pipeline}" of "${id}" draws "${pass.geometry}", which the frame never declares`
      );
    }
    // What the source reads out of one vertex against what the generator wrote
    // into it. A stage reading a field the bytes do not carry reads every vertex
    // after the first out of the middle of the last one, and the card says nothing.
    const reads = vertexInputsOf(code, pass.vertex);
    const holds = GEOMETRY_PRIMITIVE[primitive.primitive].attributes;
    const written_ = holds.map((field) => `${field.location}:${field.format}`).join(', ');
    const read = reads.map((field) => `${field.location}:${field.format}`).join(', ');
    if (written_ !== read) {
      throw new Error(
        `the vertex stage "${pass.vertex}" of "${id}" reads ${read} and "${pass.geometry}" holds ${written_}`
      );
    }
    const already = drawn.get(pass.pipeline);
    if (already && (already.geometry !== pass.geometry || already.vertex !== pass.vertex)) {
      throw new Error(`the frame for "${id}" runs "${pass.pipeline}" over two different geometries`);
    }
    drawn.set(pass.pipeline, { geometry: pass.geometry, vertex: pass.vertex });
  }
  const unused = (declared.geometry ?? []).find((one) => ![...drawn.values()].some((run) => run.geometry === one.name));
  if (unused) throw new Error(`the frame for "${id}" declares geometry "${unused.name}" no pass of it draws`);

  // Every attachment the entry declares, and what each pass writes into. An
  // attachment is not a binding, so nothing in the source names one and the entry
  // is the only thing that can say how big it is and what format it holds.
  const attachments = new Map((declared.attachments ?? []).map((one) => [one.name, one]));
  const attached = (pass: DeclaredFrame['passes'][number], name: string, role: string) => {
    const found = attachments.get(name);
    if (!found) {
      throw new Error(`the pass on "${pass.pipeline}" of "${id}" ${role} "${name}", which the frame never declares`);
    }
    return found;
  };
  /** What a pipeline draws under, which is the formats and the blending of its
   * colours and the depth test it runs, all read off the attachments its pass
   * writes so no format is declared twice. */
  const under = new Map<
    string,
    { targets: RenderPipelineTargets; samples?: RenderPipelineSpec['samples']; depth?: RenderPipelineDepth }
  >();
  for (const pass of declared.passes) {
    if (pass.colour === undefined && pass.depth === undefined) continue;
    if (stages.get(pass.pipeline)) {
      throw new Error(`the frame for "${id}" draws attachments through "${pass.pipeline}", which is a compute stage`);
    }
    const targets = (pass.colour ?? []).map((one) => ({
      format: attached(pass, one.resource, 'writes colour into').format,
      ...(one.blend ? { blend: BLEND_MODE[one.blend] } : {}),
    }));
    // Every attachment a pass opens keeps the same number of readings of each
    // pixel, so the number the pipeline is built under is theirs. Only the entry
    // can see a pass whose attachments disagree, because the pipeline is given
    // this one answer and a card comparing it against an attachment would be
    // comparing it against the answer it came from.
    const counts = new Set(
      [...(pass.colour ?? []).map((one) => one.resource), ...(pass.depth ? [pass.depth.resource] : [])].map(
        (name) => attached(pass, name, 'draws into').samples ?? 1
      )
    );
    if (counts.size > 1) {
      throw new Error(
        `the frame for "${id}" draws "${pass.pipeline}" into attachments keeping ${[...counts].sort().join(' and ')} samples a pixel`
      );
    }
    // Where the readings are averaged has to be an attachment the entry declared,
    // and the rest of what it has to be is the renderer's to refuse against the
    // description: the same picture keeping one reading of every pixel.
    for (const one of pass.colour ?? []) {
      if (one.resolve !== undefined) attached(pass, one.resolve, 'averages its samples into');
    }
    const kept = pass.depth;
    const keptFormat = kept ? attached(pass, kept.resource, 'keeps depth in').format : undefined;
    // A depth attachment in a colour format is a pipeline the card refuses over a
    // format rather than over the name the entry gave it, and a colour attachment
    // in a depth format is the same mistake the other way round. A format keeping
    // a mask alone is the third shape, since a pass may cut with one and test no
    // distances at all.
    if (keptFormat && !keptFormat.startsWith('depth') && !keptFormat.startsWith('stencil')) {
      throw new Error(`the frame for "${id}" keeps depth in "${kept?.resource}", which is no depth format`);
    }
    // That each half a pass names is a half the format keeps — depth operations
    // only over a depth format, a mask only over a stencil one — is a rule the
    // graph carries on its own, so it is checked once in the renderer's `validate`
    // rather than restated here against the declared shape (item 19).
    const draws = {
      targets,
      ...(counts.has(4) ? { samples: 4 as const } : {}),
      ...(kept && keptFormat
        ? {
            depth: {
              format: keptFormat,
              ...(kept.compare !== undefined ? { compare: kept.compare, write: kept.write ?? false } : {}),
              ...(kept.stencil !== undefined ? { stencil: kept.stencil } : {}),
            },
          }
        : {}),
    };
    const already = under.get(pass.pipeline);
    // A pipeline is built once and run by every pass naming it, so two passes
    // asking it to draw under different rules is a description with two answers
    // and only the first would be built.
    if (already && JSON.stringify(already) !== JSON.stringify(draws)) {
      throw new Error(`the frame for "${id}" runs "${pass.pipeline}" under two different sets of attachments`);
    }
    under.set(pass.pipeline, draws);
  }
  // A source sampling a name the entry never declares is caught where every other
  // binding is, since the resource would be absent from the description. What is
  // caught here is the other way round: an attachment nothing writes.
  const unwritten = (declared.attachments ?? []).find(
    (one) =>
      !declared.passes.some(
        (pass) =>
          pass.depth?.resource === one.name ||
          // An attachment averaged into is written by the pass that averages into
          // it, which is the one way an attachment is filled without being named
          // as a colour the fragment stage returns.
          (pass.colour ?? []).some((at) => at.resource === one.name || at.resolve === one.name)
      )
  );
  if (unwritten) {
    throw new Error(`the frame for "${id}" declares an attachment "${unwritten.name}" no pass of it writes`);
  }

  const written = new Map(storageTexturesOf(code).map((found) => [found.name, found]));
  const sampled = new Map(sampledTexturesOf(code).map((found) => [found.name, found]));
  const declaredSamplers = new Map(samplersOf(code).map((found) => [found.name, found]));
  const stored = new Map(storageBuffersOf(code).map((found) => [found.name, found]));

  // A texture with contents is one the source samples and a texture without them
  // is one the source stores into, so the entry saying which it is has to agree
  // with the file. Either way round the picture is silently wrong: a sampled name
  // sized as a storage one is a binding the layout declares as the other kind,
  // and a stored name given contents is bytes written into a texture the shader
  // overwrites before anything reads it.
  for (const texture of declared.textures ?? []) {
    const holds = texture.content ? sampled : written;
    if (!holds.has(texture.name)) {
      const verb = texture.content ? 'samples' : 'writes';
      throw new Error(`the frame for "${id}" sizes a texture "${texture.name}" its source never ${verb}`);
    }
    if (texture.content && 'scale' in texture.size) {
      throw new Error(`the frame for "${id}" gives "${texture.name}" contents and the frame's own size`);
    }
  }
  // Which buffer each pass writes what the card says about it into, refused here
  // where the frame declares no such buffer because a source names none. Whether
  // that buffer is long enough for its answers, and whether two queries land in
  // one buffer, are rules the graph carries on its own and are checked once in the
  // renderer's `validate` rather than restated here (item 19).
  const answers = new Map<string, string>();
  for (const pass of declared.passes) {
    const takes: [string | undefined, string][] = [
      [pass.timed, 'the two times it took'],
      [pass.visible, 'the samples its draw got through'],
    ];
    for (const [named, what] of takes) {
      if (named === undefined) continue;
      const buffer = (declared.buffers ?? []).find((one) => one.name === named);
      if (!buffer) {
        throw new Error(
          `the pass on "${pass.pipeline}" of "${id}" writes ${what} into "${named}", which the frame never declares`
        );
      }
      answers.set(named, what);
    }
    if (pass.visible !== undefined && stages.get(pass.pipeline)) {
      throw new Error(`the frame for "${id}" counts the samples of "${pass.pipeline}", which is a compute stage`);
    }
  }

  // A buffer the entry sizes and the source never declares is bytes nothing reads,
  // and one the source declares and the entry never sizes is a binding with no
  // buffer behind it, which the card refuses over a group rather than over a name.
  // A buffer a query resolves into is the one kind nothing in the source touches,
  // since the card writes it and a caller reads it back.
  for (const buffer of declared.buffers ?? []) {
    if (!stored.has(buffer.name) && !answers.has(buffer.name)) {
      throw new Error(`the frame for "${id}" sizes a buffer "${buffer.name}" its source never declares`);
    }
  }
  const unsized = [...stored.keys()].find((name) => !(declared.buffers ?? []).some((one) => one.name === name));
  if (unsized !== undefined) {
    throw new Error(`the frame for "${id}" declares a buffer "${unsized}" in its source and no size for it`);
  }
  // Where each pass reads its own counts, if it does. A name here is a buffer the
  // entry sized, and a count beside it is two answers to one question: the words
  // in the buffer are what the card reads and nothing on this side can see them.
  for (const pass of declared.passes) {
    const named =
      pass.indirect ??
      (pass.dispatch !== undefined && dispatchesIndirectly(pass.dispatch) ? pass.dispatch.indirect : undefined);
    if (named === undefined) continue;
    if (!(declared.buffers ?? []).some((one) => one.name === named)) {
      throw new Error(
        `the pass on "${pass.pipeline}" of "${id}" reads its counts from "${named}", which the frame never declares`
      );
    }
    if (pass.indirect !== undefined && pass.instances !== undefined) {
      throw new Error(
        `the pass on "${pass.pipeline}" of "${id}" reads its counts from "${named}" and names an instance count`
      );
    }
    if (pass.indirect !== undefined && stages.get(pass.pipeline)) {
      throw new Error(`the frame for "${id}" draws "${pass.pipeline}" indirectly, which is a compute stage`);
    }
  }

  for (const sampler of declared.samplers ?? []) {
    if (!declaredSamplers.has(sampler.name)) {
      throw new Error(`the frame for "${id}" describes a sampler "${sampler.name}" its source never declares`);
    }
  }

  // A pair is read through one name and written through the other, so the source
  // has to sample the first and store into the second. The two the wrong way
  // round is a layout declaring each binding as the other kind of thing, which the
  // card refuses with a message about a binding rather than about the pair.
  for (const pair of declared.pairs ?? []) {
    if (!sampled.has(pair.read)) {
      throw new Error(`the frame for "${id}" reads a pair through "${pair.read}", which its source never samples`);
    }
    if (!written.has(pair.write)) {
      throw new Error(
        `the frame for "${id}" writes a pair through "${pair.write}", which its source never stores into`
      );
    }
  }
  if (
    declared.present !== undefined &&
    !(declared.textures ?? []).some((one) => one.name === declared.present) &&
    !attachments.has(declared.present)
  ) {
    throw new Error(`the frame for "${id}" shows "${declared.present}" and declares no texture by that name`);
  }

  const boundAt = (name: string) =>
    written.get(name) ??
    sampled.get(name) ??
    stored.get(name) ??
    (declaredSamplers.get(name) as { group: number; binding: number });

  /** What the entry says the frame is made of, which is every texture, every half
   * of every pair and every sampler. */

  // What each entry point reaches, following the functions it calls, which is
  // what its layout may name. One binding short of that and the driver refuses
  // the pipeline; one over and it is accepted while claiming the stage reads
  // something it never touches, which is the half nothing on the card reports.
  const reaches = new Map(
    [...named, ...[...drawn.values()].map((run) => run.vertex)].map((name) => [name, namesReachedBy(code, name)])
  );

  const at = uniformBindingOf(code);
  const paired = (declared.pairs ?? []).flatMap((pair) => [pair.read, pair.write].map((name) => ({ name })));
  // An attachment a later pass samples is bound like any other picture, so it is
  // among what a layout may name. One a pass only writes is not: nothing binds an
  // attachment, and putting it here would have every pipeline claim to read it.
  const read = (declared.attachments ?? []).filter((one) => sampled.has(one.name));
  // A shader reads an attachment keeping several readings of a pixel only through
  // a binding declared as multisampled, which nothing here writes, so a source
  // sampling one is refused where the source is in hand rather than as a layout
  // the card reports the kind of.
  const bound = read.find((one) => one.samples !== undefined);
  if (bound) {
    throw new Error(`the frame for "${id}" samples "${bound.name}", which keeps several samples a pixel`);
  }
  const described = [
    ...(declared.textures ?? []),
    ...paired,
    ...read,
    // A buffer only the card writes is left out, because no stage reads it and the
    // check below is about a resource the frame described for a stage that never
    // asks for it.
    ...(declared.buffers ?? []).filter((buffer) => stored.has(buffer.name)),
    ...(declared.samplers ?? []),
  ];

  // A resource no entry point reaches is a resource this frame has no stage for.
  // It is refused rather than dropped, because the entry sized it or chose how it
  // is read, and both of those are answers to a question the picture never asks.
  // The vertex stages are among the readers, since a resource a copy of a pipeline
  // reads to place itself is reached by the vertex entry point alone.
  const everyReader = [...named, ...[...drawn.values()].map((run) => run.vertex)];
  const unread = described.find((resource) => !everyReader.some((name) => reaches.get(name)?.has(resource.name)));
  if (unread) {
    throw new Error(`the frame for "${id}" describes "${unread.name}", which no pass of it reads`);
  }

  /** What one pipeline's layout names, which is every resource its own entry
   * point reaches and nothing the other pipelines read. The visibility is the
   * stage that pipeline runs at, since a layout is built per pipeline and each of
   * them sees the same resource from its own stage. */
  const bindingsOf = (name: string): BindingSpec[] => {
    // Which stages of this pipeline reach one resource, which is the visibility a
    // layout entry carries: a drawn pipeline runs two stages out of the same file
    // and each of them reaches its own half of what the file binds.
    const running: { stage: BindingSpec['visibility'][number]; entry: string }[] = stages.get(name)
      ? [{ stage: 'compute', entry: name }]
      : [
          { stage: 'fragment', entry: name },
          ...(drawn.has(name)
            ? [{ stage: 'vertex' as const, entry: (drawn.get(name) as { vertex: string }).vertex }]
            : []),
        ];
    const readers = (resource: string): BindingSpec['visibility'] =>
      running.filter((run) => reaches.get(run.entry)?.has(resource)).map((run) => run.stage);
    const reached = new Set(running.flatMap((run) => [...(reaches.get(run.entry) ?? [])]));
    return [
      ...(at && reached.has(at.name)
        ? [{ group: at.group, binding: at.binding, resource: UNIFORMS, visibility: readers(at.name) }]
        : []),
      ...described
        .filter((resource) => reached.has(resource.name))
        .map((resource) => {
          const source = boundAt(resource.name);
          return {
            group: source.group,
            binding: source.binding,
            resource: resource.name,
            visibility: readers(resource.name),
            // Which kind of thing the source declared this name as, which is the
            // only answer for a name the frame uses both ways.
            ...(written.has(resource.name) ? { reads: 'storage' as const } : {}),
            ...(sampled.has(resource.name) ? { reads: 'sample' as const } : {}),
          };
        }),
    ];
  };

  const resources: ResourceSpec[] = [
    { kind: 'uniform', name: UNIFORMS },
    ...(declared.textures ?? []).map((texture): ResourceSpec => {
      // A stored texture's format is the source's, because the declaration
      // carries it. A sampled one's is the generator's, because the bytes and
      // the format are one answer and a sampled declaration names neither.
      const content = texture.content ? TEXTURE_CONTENT[texture.content] : undefined;
      return {
        kind: 'texture',
        name: texture.name,
        size: texture.size,
        format: content ? content.format : (written.get(texture.name) as { format: GPUTextureFormat }).format,
        use: content ? ['sample'] : ['storage'],
        ...(texture.mips ? { mips: texture.mips } : {}),
        ...(content ? { source: textureFileName(id, texture.name) } : {}),
      };
    }),
    ...(declared.pairs ?? []).flatMap((pair): ResourceSpec[] =>
      // Both halves are written by one pass and read by the next frame's, so each
      // of them carries the flags for both and the format is the one the source
      // declares on the half it stores into: a sampled declaration names none.
      [pair.read, pair.write].map((name) => ({
        kind: 'texture',
        name,
        size: pair.size,
        format: (written.get(pair.write) as { format: GPUTextureFormat }).format,
        use: ['storage', 'sample'],
      }))
    ),
    // A buffer's size is the entry's and its access is the source's, since a
    // declaration says whether the shader may write and no entry could.
    ...(declared.buffers ?? []).map(
      (buffer): ResourceSpec => ({
        kind: 'buffer',
        name: buffer.name,
        bytes: buffer.bytes,
        // A buffer the source binds says whether the shader may write it. One only
        // a query resolves into is read by nobody on this side of the card, so it
        // takes the access that names no writing.
        access: stored.get(buffer.name)?.access ?? 'read',
        // A buffer the build fills carries the address its bytes were written to,
        // the same split a picture and a run of vertices carry: the description
        // names where they live and the runtime fetches them.
        ...(buffer.content ? { source: bufferFileName(id, buffer.name) } : {}),
      })
    ),
    ...(declared.samplers ?? []).map((sampler): ResourceSpec => ({ kind: 'sampler', ...sampler })),
    // An attachment is written by a pass rather than bound by a stage, so it
    // carries the one flag that says so and its format is the entry's. A later
    // pass may also read what an earlier one drew, and the source saying so is
    // what adds the second flag: the entry never repeats a fact the file already
    // carries, and a texture short of the flag for how it is used is a pipeline
    // the driver refuses over a usage rather than over a name.
    ...(declared.attachments ?? []).map(
      (one): ResourceSpec => ({
        kind: 'texture',
        name: one.name,
        size: one.size,
        format: one.format,
        use: sampled.has(one.name) ? ['attachment', 'sample'] : ['attachment'],
        ...(one.samples ? { samples: one.samples } : {}),
      })
    ),
    // The layout and both counts are the generator's, so the entry's numbers are
    // spent here and never written into the description beside the bytes they
    // would have to agree with.
    ...(declared.geometry ?? []).flatMap((one): ResourceSpec[] => {
      const primitive = GEOMETRY_PRIMITIVE[one.primitive];
      const made = primitive.bytes(one.size[0], one.size[1]);
      return [
        {
          kind: 'vertices',
          name: one.name,
          stride: primitive.stride,
          attributes: primitive.attributes,
          topology: primitive.topology,
          count: made.vertexCount,
          indices: indexResourceName(one.name),
          source: geometryFileName(id, one.name, 'vertices'),
        },
        {
          kind: 'indices',
          name: indexResourceName(one.name),
          format: primitive.indexFormat,
          count: made.indexCount,
          source: geometryFileName(id, one.name, 'indices'),
        },
      ];
    }),
  ];

  const pipelines: PipelineSpec[] = named.map((name) => {
    const compute = stages.get(name);
    const draws = under.get(name);
    return compute
      ? {
          kind: 'compute',
          name,
          compute: { module: WGSL_DOCUMENT, entry: compute.entry },
          bindings: bindingsOf(name),
          workgroup: compute.workgroup,
        }
      : {
          kind: 'render',
          name,
          vertex: drawn.has(name)
            ? { module: WGSL_DOCUMENT, entry: (drawn.get(name) as { vertex: string }).vertex }
            : 'fullscreen',
          fragment: { module: WGSL_DOCUMENT, entry: name },
          ...(drawn.has(name) ? { geometry: (drawn.get(name) as { geometry: string }).geometry } : {}),
          bindings: bindingsOf(name),
          ...(draws && draws.targets.length > 0 ? { targets: draws.targets } : {}),
          ...(draws?.samples ? { samples: draws.samples } : {}),
          ...(draws?.depth ? { depth: draws.depth } : {}),
        };
  });

  const passes: PassSpec[] = declared.passes.map((pass) => {
    // What the card is asked to say about this pass, carried through as the names
    // the entry gave, since where an answer lands is the entry's and how many
    // answers there are is the backend's.
    const said = {
      ...(pass.timed !== undefined ? { timed: pass.timed } : {}),
      ...(pass.visible !== undefined ? { visible: pass.visible } : {}),
    };
    if (pass.dispatch !== undefined) return { pipeline: pass.pipeline, dispatch: pass.dispatch, ...said };
    // What a pass attaches, carrying only what the entry said: a clear value where
    // it named one, and nothing where it means the attachment is kept.
    const attaches: Pick<RenderPassSpec, 'colour' | 'depth'> = {
      ...(pass.colour
        ? {
            colour: pass.colour.map((one) => ({
              resource: one.resource,
              ...(one.clear ? { clear: one.clear } : {}),
              ...(one.resolve ? { resolve: one.resolve } : {}),
            })),
          }
        : {}),
      ...(pass.depth
        ? {
            depth: {
              resource: pass.depth.resource,
              ...(pass.depth.clear !== undefined ? { clear: pass.depth.clear } : {}),
              ...(pass.depth.stencilClear !== undefined ? { stencilClear: pass.depth.stencilClear } : {}),
            },
          }
        : {}),
    };
    // A pass reading its counts out of a buffer carries the buffer alone, since
    // every number the card needs is in there and an instance count beside it
    // would be a second answer to the same question.
    if (pass.indirect !== undefined) {
      return { pipeline: pass.pipeline, draws: [{ indirect: pass.indirect }], ...attaches, ...said };
    }
    // How many vertices a drawn pass covers is the buffer's, so the pass carries
    // the instance count alone and the count of vertices stays where the bytes are.
    if (pass.geometry !== undefined) {
      return { pipeline: pass.pipeline, draws: [{ instances: pass.instances ?? ONE_INSTANCE }], ...attaches, ...said };
    }
    return { pipeline: pass.pipeline, draws: [{ vertices: FULLSCREEN_VERTICES }], ...attaches, ...said };
  });

  return {
    target: 'wgsl',
    resources,
    documents: [{ name: WGSL_DOCUMENT }],
    pipelines,
    passes,
    ...(declared.present !== undefined ? { present: declared.present } : {}),
    ...((declared.pairs ?? []).length > 0
      ? { swap: (declared.pairs ?? []).map((pair): [string, string] => [pair.read, pair.write]) }
      : {}),
  };
}
