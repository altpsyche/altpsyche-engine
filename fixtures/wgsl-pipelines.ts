/**
 * What a WGSL source says about the pipelines built from it: which entry points
 * it declares, the block size a compute one runs in, and the textures it writes.
 *
 * It is read off the source for the same reason the uniform binding is: a number
 * written in two places can disagree, and the failure is silent, because the
 * pipeline is built against the written number and the shader still compiles. A
 * dispatch worked out from a workgroup size the source does not have covers part
 * of the picture and leaves the rest of it whatever the texture held.
 *
 * It sits apart from the binding reader because nothing that draws needs it. The
 * build reads a source and writes the answer into the manifest, so a page fetches
 * the answer instead of the parser.
 */

/** The three block dimensions of a compute entry point. WGSL lets a source give
 * one, two or three, and the ones it leaves out are 1. */
export type Workgroup = [number, number, number];

export interface ComputeEntry {
  entry: string;
  workgroup: Workgroup;
}

export interface StorageTexture {
  name: string;
  group: number;
  binding: number;
  format: GPUTextureFormat;
}

/** A texture a shader reads rather than writes, and the sampler it reads it
 * through. Neither declaration carries a format: a sampled texture says what kind
 * of number comes back and a sampler says nothing about the bytes at all, so the
 * format is the generator's and the filter and the wrap are the entry's. */
export interface BoundResource {
  name: string;
  group: number;
  binding: number;
}

/** A function with the run of attributes above it, which is what every stage is
 * declared as. Anchored on the function rather than on one attribute, so an
 * attribute sitting above some other declaration cannot be read as a stage's and
 * the order the attributes are written in means nothing. */
const DECLARED_FUNCTION = /((?:@\s*\w+\s*(?:\([^)]*\))?\s*)+)fn\s+([A-Za-z_]\w*)/g;

/** Both attribute orders are accepted throughout, since a hand-written source in
 * this corpus opens `@binding(0) @group(0)` and the WGSL Slang emits opens the
 * other way round, and neither order means anything different. */
const numberOf = (attributes: string, name: string): number | undefined => {
  const found = new RegExp(`@\\s*${name}\\s*\\(\\s*(\\d+)\\s*\\)`).exec(attributes)?.[1];
  return found === undefined ? undefined : Number(found);
};

/**
 * Every compute entry point the source declares, with the block size each runs
 * in. A source declaring no compute stage comes back empty rather than guessed
 * at.
 */
export function computeEntriesOf(source: string): ComputeEntry[] {
  const found: ComputeEntry[] = [];

  for (const match of source.matchAll(DECLARED_FUNCTION)) {
    const attributes = match[1] as string;
    const name = match[2] as string;
    if (!/@\s*compute\b/.test(attributes)) continue;

    const declared = /@\s*workgroup_size\s*\(([^)]*)\)/.exec(attributes)?.[1];
    const sizes = (declared ?? '')
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0);

    // A compute entry point with no block size is refused by the card, so a
    // source that declares none is a source that was never going to run and the
    // build says which function it was rather than dispatching a guess.
    if (sizes.length === 0) throw new Error(`the compute entry point "${name}" declares no workgroup_size`);

    const numbers = sizes.map((part) => Number(part));
    if (numbers.some((size) => !Number.isInteger(size) || size < 1)) {
      throw new Error(`the compute entry point "${name}" declares a workgroup_size this build cannot read`);
    }

    found.push({ entry: name, workgroup: [numbers[0] as number, numbers[1] ?? 1, numbers[2] ?? 1] });
  }

  return found;
}

/** Whether the source declares an entry point at this stage, which is what says
 * a pass naming it draws rather than dispatches. */
export function hasEntry(source: string, stage: 'vertex' | 'fragment', entry: string): boolean {
  for (const match of source.matchAll(DECLARED_FUNCTION)) {
    if (match[2] === entry && new RegExp(`@\\s*${stage}\\b`).test(match[1] as string)) return true;
  }
  return false;
}

/**
 * Every texture the source writes, with the format it writes in.
 *
 * The format is the source's because the declaration carries it, and a texture
 * built in another format is one the card refuses the pipeline over. The name is
 * the source's own variable name, which is what a binding points at, so a frame
 * declaring a size for a name the source never binds is caught where the sizes
 * are read.
 */
export function storageTexturesOf(source: string): StorageTexture[] {
  const found: StorageTexture[] = [];
  const declaration =
    /((?:@\s*(?:group|binding)\s*\(\s*\d+\s*\)\s*)+)var\s+([A-Za-z_]\w*)\s*:\s*texture_storage_2d\s*<\s*([A-Za-z0-9_]+)\s*,\s*write\s*>/g;

  for (const match of source.matchAll(declaration)) {
    const attributes = match[1] as string;
    const group = numberOf(attributes, 'group');
    const binding = numberOf(attributes, 'binding');
    if (group === undefined || binding === undefined) {
      throw new Error(`the storage texture "${match[2]}" declares one of @group and @binding without the other`);
    }
    found.push({
      name: match[2] as string,
      group,
      binding,
      format: match[3] as GPUTextureFormat,
    });
  }

  return found;
}

/** A block of bytes the source reads or writes, with whether it may write. The
 * access is the half of the declaration nothing else can answer: a layout naming
 * the writable kind over a source that declared the read-only one is a pipeline
 * the card refuses, and how big the block is is the entry's, since the type may be
 * an array the source gives no length. */
export interface StorageBuffer {
  name: string;
  group: number;
  binding: number;
  access: 'read' | 'read-write';
}

/**
 * Every block of bytes the source declares as storage, with where each is bound
 * and whether the source may write into it.
 *
 * WGSL writes the access inside the same angle brackets as the address space and
 * lets a source leave it out, in which case the block is read-only, so a
 * declaration with no access is read rather than unknown.
 */
export function storageBuffersOf(source: string): StorageBuffer[] {
  const found: StorageBuffer[] = [];
  const declaration =
    /((?:@\s*(?:group|binding)\s*\(\s*\d+\s*\)\s*)+)var\s*<\s*storage\s*(?:,\s*(read_write|read)\s*)?>\s*([A-Za-z_]\w*)/g;

  for (const match of source.matchAll(declaration)) {
    const attributes = match[1] as string;
    const group = numberOf(attributes, 'group');
    const binding = numberOf(attributes, 'binding');
    if (group === undefined || binding === undefined) {
      throw new Error(`the storage buffer "${match[3]}" declares one of @group and @binding without the other`);
    }
    found.push({
      name: match[3] as string,
      group,
      binding,
      access: match[2] === 'read_write' ? 'read-write' : 'read',
    });
  }

  return found;
}

/** Every uniform block the source declares, with where each is bound, read off the
 * same attributes the storage-buffer reader reads. A one-pass shader declares one,
 * bound at group 0, which is the frame's uniform block; a per-draw shader declares
 * a second, the slice one draw reads through a dynamic offset. The build reads both
 * from the source because a group or binding written into the entry as well could
 * disagree with the source while the shader still compiles. */
export function uniformBlocksOf(source: string): BoundResource[] {
  const found: BoundResource[] = [];
  const declaration = /((?:@\s*(?:group|binding)\s*\(\s*\d+\s*\)\s*)+)var\s*<\s*uniform\s*>\s*([A-Za-z_]\w*)/g;

  for (const match of source.matchAll(declaration)) {
    const attributes = match[1] as string;
    const group = numberOf(attributes, 'group');
    const binding = numberOf(attributes, 'binding');
    if (group === undefined || binding === undefined) {
      throw new Error(`the uniform block "${match[2]}" declares one of @group and @binding without the other`);
    }
    found.push({ name: match[2] as string, group, binding });
  }

  return found;
}

/** Every declaration of one shape the source makes, with where each is bound. It
 * is one function over both shapes because a sampled texture and a sampler are
 * declared the same way and differ only in the type after the colon. */
function boundResourcesOf(source: string, type: RegExp): BoundResource[] {
  const found: BoundResource[] = [];
  const declaration = new RegExp(
    `((?:@\\s*(?:group|binding)\\s*\\(\\s*\\d+\\s*\\)\\s*)+)var\\s+([A-Za-z_]\\w*)\\s*:\\s*${type.source}`,
    'g'
  );

  for (const match of source.matchAll(declaration)) {
    const attributes = match[1] as string;
    const group = numberOf(attributes, 'group');
    const binding = numberOf(attributes, 'binding');
    if (group === undefined || binding === undefined) {
      throw new Error(`the binding "${match[2]}" declares one of @group and @binding without the other`);
    }
    found.push({ name: match[2] as string, group, binding });
  }

  return found;
}

/** One field of a vertex as the source reads it, which is the location it is read
 * at and the format that location expects. It carries no offset, because where a
 * field sits inside a vertex is a fact about the bytes rather than about the
 * source that reads them. */
export interface VertexInput {
  location: number;
  format: GPUVertexFormat;
}

/** What each shape a vertex stage may take a field in expects out of the buffer.
 * The two spellings of each are the same type, since WGSL took the short forms on
 * later and both are written in this corpus. */
const VERTEX_FORMATS: Record<string, GPUVertexFormat> = {
  f32: 'float32',
  'vec2<f32>': 'float32x2',
  vec2f: 'float32x2',
  'vec3<f32>': 'float32x3',
  vec3f: 'float32x3',
  'vec4<f32>': 'float32x4',
  vec4f: 'float32x4',
};

/**
 * Every field one vertex entry point reads out of the buffer, in the order the
 * locations are declared.
 *
 * It is read so the build can hold a source to the bytes the generator wrote: a
 * stage reading three floats where the buffer holds two is every vertex after the
 * first read out of the middle of the last one, and the card reports nothing at
 * all. Only the parameter list is read, so a stage taking its fields in a struct
 * is refused by name rather than read wrong.
 */
export function vertexInputsOf(source: string, entry: string): VertexInput[] {
  const declared = new RegExp(`@\\s*vertex\\s+fn\\s+${entry}\\s*\\(`).exec(source);
  if (!declared) throw new Error(`the source declares no vertex entry point "${entry}"`);

  // The parameter list is read by counting brackets from the opening one, because
  // every parameter of a vertex stage carries an attribute with brackets of its
  // own and a list read up to the first closing bracket ends inside the first
  // attribute.
  const opens = declared.index + declared[0].length - 1;
  let depth = 0;
  let closes = opens;
  for (let at = opens; at < source.length; at++) {
    if (source[at] === '(') depth++;
    else if (source[at] === ')') {
      depth--;
      if (depth === 0) {
        closes = at;
        break;
      }
    }
  }

  const found: VertexInput[] = [];
  for (const parameter of source.slice(opens + 1, closes).split(',')) {
    const at = /@\s*location\s*\(\s*(\d+)\s*\)\s*[A-Za-z_]\w*\s*:\s*([A-Za-z0-9_<>\s]+)/.exec(parameter);
    if (!at) continue;
    const written = (at[2] as string).replace(/\s+/g, '');
    const format = VERTEX_FORMATS[written];
    if (!format) {
      throw new Error(`the vertex entry point "${entry}" reads a "${written}", which this build writes no vertices in`);
    }
    found.push({ location: Number(at[1]), format });
  }

  if (found.length === 0) {
    throw new Error(`the vertex entry point "${entry}" reads no field of a vertex at a location of its own`);
  }
  return found;
}

/** Every texture the source samples. The sample type inside the angle brackets is
 * read only far enough to tell a sampled texture from a storage one, because the
 * card is told `float` for every format this corpus writes and a format that
 * needed another one would need a sampler the layout refuses. */
export function sampledTexturesOf(source: string): BoundResource[] {
  return boundResourcesOf(source, /texture_2d\s*<\s*[A-Za-z0-9_]+\s*>/);
}

/** Every sampler the source declares. A comparison sampler is a different type
 * and is not matched, since the semicolon after the name is what ends this one. */
export function samplersOf(source: string): BoundResource[] {
  return boundResourcesOf(source, /sampler\s*;/);
}
