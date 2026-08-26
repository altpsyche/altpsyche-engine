/**
 * The WebGL 2 backend.
 *
 * WebGL 2 rather than WebGL 1, and that is forced rather than preferred: a
 * compiler gathers every uniform into one block and WebGL 1 has no uniform
 * blocks at all. Nothing that runs today needs WebGL 1 either, since the
 * capability probe has always asked for `webgl2` first and recorded the answer
 * without anything reading it.
 *
 * `preserveDrawingBuffer` is deliberately off. It makes the browser keep every
 * finished frame in case something reads it back later, which costs a copy per
 * frame on every reader's device so that a build script can screenshot after the
 * fact. A caller that wants pixels draws and reads in the same step instead.
 */
import type {
  Backend,
  BindingSpec,
  DeviceReport,
  FrameTraffic,
  FrameGraph,
  GlslRenderSource,
  RenderPipelineSpec,
  SamplerResource,
  StencilMode,
  TextureResource,
  UniformValue,
} from '../graph/types.js';
import { componentsOf, drawsCorners, drawsIndirectly, isRenderPass, perDrawBinding, resourceOf } from '../graph/types.js';
import type { ResourceHandle, TextureHandle, VertexHandle } from '../graph/handles.js';
import { indexOf } from '../graph/handles.js';
import { Arena } from '../resource/arena.js';
import type { Handle, Range } from '../resource/arena.js';
import type { GL2Geometry, GL2PerDraw } from '../submit/gl2.js';
import { drawGL2Frame } from '../submit/gl2.js';
import { PipelineCache, pipelineStructureOf } from '../pipeline/cache.js';
import { sizeAt, followsFrame } from '../graph/refs.js';
import { validate } from '../graph/validate.js';
import { reflect } from '../toy/reflect.js';

/** A single triangle covering the frame. Two triangles would draw the diagonal
 * twice, and there is no geometry here beyond filling the screen. */
const FULLSCREEN_TRIANGLE = new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]);

/**
 * The GL draw mode a declared `topology` steps the vertices through (item 83),
 * so the WebGL 2 backend draws the shape the geometry declares rather than a
 * triangle list of whatever it was handed. WebGPU passes `topology` straight to
 * the pipeline (`primitive.topology`, [gpu/webgpu.ts](./webgpu.ts)); this is
 * WebGL 2's side of the same fact, and every member of `GPUPrimitiveTopology`
 * maps to one GL constant, so there is nothing this backend refuses here. The
 * `default` throws by name rather than silently drawing triangles, which is the
 * refusal the item allows for a topology this backend could not draw — a guard
 * that only fires if the union grows a member with no GL mode.
 */
function modeOfTopology(gl: WebGL2RenderingContext, topology: GPUPrimitiveTopology, frameId: string | undefined, geometryIndex: number): number {
  switch (topology) {
    case 'point-list':
      return gl.POINTS;
    case 'line-list':
      return gl.LINES;
    case 'line-strip':
      return gl.LINE_STRIP;
    case 'triangle-list':
      return gl.TRIANGLES;
    case 'triangle-strip':
      return gl.TRIANGLE_STRIP;
    default:
      throw new Error(`the geometry ${geometryIndex} on "${frameId}" declares topology "${topology as string}", which this backend does not draw`);
  }
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('the context refused to make a shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(log ?? 'the shader failed to compile and the driver said nothing');
  }
  return shader;
}

/** The block binding point the frame's one shared uniform block is bound to, where
 * `setUniforms` writes its buffer; the point a per-draw slice's block is bound to,
 * where each draw binds one record's range (item 27); and the first point a
 * read-only storage buffer's block is bound to (item 92), where a whole buffer is
 * bound once per pass. GLSL ES 3.00 declares no binding number for a block — the
 * linked program answers with a block index — so the points are assigned here
 * rather than read off the source. Storage points run upward from their base, one
 * per read-only buffer a pipeline binds; they start above the per-draw point so a
 * pipeline that somehow bound both would not collide, though no frame does. */
const SHARED_POINT = 0;
const PER_DRAW_POINT = 1;
const STORAGE_POINT_BASE = 2;

/** One uniform block a pipeline binds that is not the shared block: the member-name
 * tag the build's GLSL qualifies it with (`_group_G_binding_B`, the binding's own
 * group and binding), and the point this backend binds it to. A per-draw slice
 * (item 27) and each read-only storage buffer (item 92) arrive as one of these, so
 * `resolveBlocks` can tell every non-shared block from the shared one and from
 * each other by the tag its members carry. */
interface TaggedBlock {
  tag: string;
  point: number;
}

/**
 * The frame's shared uniform block resolved off the linked program, and every
 * tagged block — a per-draw slice (item 27), a read-only storage buffer (item 92) —
 * bound beside it to the point it was assigned.
 *
 * The driver decides where each block's members sit and which block index each is,
 * so guessing from the declaration order produces a frame that renders and is
 * wrong. A pipeline binding tagged blocks links them beside the frame's shared
 * uniforms, and they are told apart by the member name the build's GLSL carries: a
 * block whose member is qualified with a binding's `_group_G_binding_B` is that
 * binding's block. Each block is bound to its own point, and the shared block's
 * members alone become the layout `setUniforms` writes, so a tagged member cannot
 * land in the buffer the frame's values fill.
 */
function resolveBlocks(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  tagged: readonly TaggedBlock[]
): { layout: Map<string, number> | null; size: number } {
  const blocks = gl.getProgramParameter(program, gl.ACTIVE_UNIFORM_BLOCKS) as number;
  if (blocks === 0) return { layout: null, size: 0 };
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
  const indices = Array.from({ length: count }, (_, i) => i);
  const names = indices.map((i) => gl.getActiveUniform(program, i)?.name ?? '');
  const offsets = (gl.getActiveUniforms(program, indices, gl.UNIFORM_OFFSET) as number[]) ?? [];
  const blockOf = (gl.getActiveUniforms(program, indices, gl.UNIFORM_BLOCK_INDEX) as number[]) ?? [];
  // Each tagged block is the one holding a member whose name carries that binding's
  // tag, bound to the point the binding was assigned. GLSL ES 3.00 has no binding
  // qualifier, so each block is told its point here.
  const taggedBlocks = new Set<number>();
  for (const { tag, point } of tagged) {
    for (let i = 0; i < count; i++) {
      if ((blockOf[i] ?? -1) >= 0 && names[i]?.includes(tag)) {
        const block = blockOf[i] as number;
        gl.uniformBlockBinding(program, block, point);
        taggedBlocks.add(block);
        break;
      }
    }
  }
  // The shared block is any block none of the tags claimed. A frame with no tagged
  // block — a plain fullscreen toy — has only this one.
  let sharedBlock = -1;
  for (let i = 0; i < count; i++) {
    const block = blockOf[i] ?? -1;
    if (block >= 0 && !taggedBlocks.has(block)) {
      sharedBlock = block;
      break;
    }
  }
  if (sharedBlock >= 0) gl.uniformBlockBinding(program, sharedBlock, SHARED_POINT);
  let layout: Map<string, number> | null = null;
  let size = 0;
  if (sharedBlock >= 0) {
    layout = new Map<string, number>();
    for (let i = 0; i < count; i++) {
      // A member not in the shared block, or one the driver did not place (-1), is
      // not a value `setUniforms` writes into the shared buffer.
      if (blockOf[i] !== sharedBlock) continue;
      const offset = offsets[i];
      if (offset !== undefined && offset >= 0) {
        layout.set((names[i] as string).replace(/^.*\./, '').replace(/_\d+$/, ''), offset / 4);
      }
    }
    size = gl.getActiveUniformBlockParameter(program, sharedBlock, gl.UNIFORM_BLOCK_DATA_SIZE) as number;
  }
  return { layout, size };
}

/** The read-only storage buffers a render pipeline binds (item 92): each binding
 * that names a `buffer` resource and is not a per-draw slice, paired with the
 * `_group_G_binding_B` tag its block carries and the point this backend binds it
 * to. A scene pipeline binds two — its per-object records and the shared views —
 * so the points run from `STORAGE_POINT_BASE` in binding order. Pure over the
 * frame, so the compile step and the draw step derive the same points from it. */
function storageBindings(
  spec: RenderPipelineSpec,
  frame: FrameGraph
): { resource: number; tag: TaggedBlock }[] {
  const out: { resource: number; tag: TaggedBlock }[] = [];
  for (const binding of spec.bindings) {
    if (binding.perDraw !== undefined) continue;
    const index = indexOf(binding.resource);
    const resource = frame.resources[index];
    if (resource?.kind !== 'buffer') continue;
    out.push({
      resource: index,
      tag: { tag: `_group_${binding.group}_binding_${binding.binding}`, point: STORAGE_POINT_BASE + out.length },
    });
  }
  return out;
}

/** The ceilings this report reads, by the names the specification gives them.
 * WebGL has nothing to enumerate the way WebGPU does: every ceiling is a name a
 * caller has to ask for, so the list is the question and what the gate prints
 * beside it is the answer. A name this context does not carry is left out rather
 * than reported as a zero, which would read as a device that can do nothing.
 *
 * They are read through the context by name rather than by number, so nothing
 * here depends on a hexadecimal value being transcribed correctly. */
const CEILINGS = [
  'MAX_TEXTURE_SIZE',
  'MAX_3D_TEXTURE_SIZE',
  'MAX_ARRAY_TEXTURE_LAYERS',
  'MAX_CUBE_MAP_TEXTURE_SIZE',
  'MAX_RENDERBUFFER_SIZE',
  'MAX_COLOR_ATTACHMENTS',
  'MAX_DRAW_BUFFERS',
  'MAX_SAMPLES',
  'MAX_VERTEX_ATTRIBS',
  'MAX_TEXTURE_IMAGE_UNITS',
  'MAX_VERTEX_TEXTURE_IMAGE_UNITS',
  'MAX_UNIFORM_BUFFER_BINDINGS',
  'MAX_UNIFORM_BLOCK_SIZE',
  'MAX_VERTEX_UNIFORM_COMPONENTS',
  'MAX_FRAGMENT_UNIFORM_COMPONENTS',
  'MAX_VARYING_COMPONENTS',
  'MAX_ELEMENTS_INDICES',
  'MAX_ELEMENTS_VERTICES',
  'UNIFORM_BUFFER_OFFSET_ALIGNMENT',
];

export function createWebGL2Backend(canvas: HTMLCanvasElement | OffscreenCanvas): Backend | null {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false }) as WebGL2RenderingContext | null;
  if (!gl) return null;

  // One arena for the backend's whole life. Every buffer this backend allocates —
  // the quad it shares across programs, the uniform block each program owns, the
  // per-draw slices (item 27) and the read-only storage buffers (item 92) — is
  // allocated and freed through here, so a handle to a deleted buffer is caught
  // rather than naming whatever the context hands back next.
  // The buffers this backend keeps are all inputs it uploads once and reads: a
  // read-write storage buffer is refused by name, and this backend has no compute
  // stage or query to write one, so nothing here ever fills a buffer the page then
  // reads back. A readback through the arena's §9 door (item 89) therefore has
  // nothing to hand back and answers with no bytes, the true answer rather than a
  // refusal. When a WebGL 2 path does want a real buffer read back, this is where a
  // `gl.getBufferSubData` copy would go.
  const readNoBuffer = async (_buffer: WebGLBuffer, _range: Range | undefined): Promise<ArrayBuffer> => new ArrayBuffer(0);
  const arena = new Arena<WebGLBuffer>((buffer) => gl.deleteBuffer(buffer), readNoBuffer);

  const quadHandle = arena.allocate(() => gl.createBuffer() as WebGLBuffer);
  const quad = arena.resolve(quadHandle);
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, FULLSCREEN_TRIANGLE, gl.STATIC_DRAW);
  arena.wrote(FULLSCREEN_TRIANGLE.byteLength);

  // A depth or a stencil is kept in a renderbuffer rather than a sampled texture,
  // since nothing here reads one between its pixels (item 48). Each depth/stencil
  // format the corpus keeps names the renderbuffer's own storage, the framebuffer
  // point it attaches at, and which halves it holds: a colour format answers null
  // and is a sampled texture as before. `depth24plus-stencil8` is the one format
  // holding both, kept for the shape rather than for a preset that names it.
  const depthStencilOf = (format: string) => {
    if (format === 'depth24plus') return { internal: gl.DEPTH_COMPONENT24, point: gl.DEPTH_ATTACHMENT, depth: true, stencil: false };
    if (format === 'stencil8') return { internal: gl.STENCIL_INDEX8, point: gl.STENCIL_ATTACHMENT, depth: false, stencil: true };
    if (format === 'depth24plus-stencil8')
      return { internal: gl.DEPTH24_STENCIL8, point: gl.DEPTH_STENCIL_ATTACHMENT, depth: true, stencil: true };
    return null;
  };

  // The comparison a depth test runs, by the name §8's `compare` gives it: a
  // fragment nearer than what is already there passes `less`, and so on. WebGPU
  // reads these names straight through; WebGL 2 wants the card's own enum.
  const COMPARE: Record<string, number> = {
    never: gl.NEVER,
    less: gl.LESS,
    equal: gl.EQUAL,
    'less-equal': gl.LEQUAL,
    greater: gl.GREATER,
    'not-equal': gl.NOTEQUAL,
    'greater-equal': gl.GEQUAL,
    always: gl.ALWAYS,
  };

  // Every bit of the mask, the reference both modes read and marking writes — the
  // same `STENCIL_BITS` the WebGPU backend uses, so the two agree on what a mark
  // leaves behind. What each mode does to the mask, in the card's own fields: `mark`
  // replaces the reference everywhere it draws (compare always, write every bit),
  // and `inside` draws only where the reference already is and keeps the mask as it
  // found it (compare equal, write nothing). Both faces get the same operations,
  // since a mask has no front and back a picture could tell apart, so one `stencilOp`
  // and one `stencilFunc` — which set both faces — is the whole of it.
  const STENCIL_REF = 0xff;
  const STENCIL_GL = {
    mark: { func: gl.ALWAYS, fail: gl.KEEP, zfail: gl.KEEP, zpass: gl.REPLACE, writeMask: 0xff },
    inside: { func: gl.EQUAL, fail: gl.KEEP, zfail: gl.KEEP, zpass: gl.KEEP, writeMask: 0 },
  } as const;

  let width = canvas.width;
  let height = canvas.height;

  // Held in a variable, not returned as a literal, so it can carry `arena` beyond
  // the `Backend` interface — the §9 readback door a caller reaches directly
  // (item 89) — without growing the public surface. The same shape as the WebGPU
  // backend, though this backend's arena answers a readback vacuously; see above.
  const backend = {
    name: 'webgl2' as const,
    target: 'glsl' as const,
    // The backend's buffer arena, exposed for a readback by handle (item 89). Not
    // on the `Backend` interface; matches the WebGPU backend's own `arena` field.
    arena,

    report(): DeviceReport {
      const named = gl as unknown as Record<string, unknown>;
      const limits: Record<string, number> = {};
      for (const name of CEILINGS) {
        const pname = named[name];
        if (typeof pname !== 'number') continue;
        const value = gl.getParameter(pname);
        if (typeof value === 'number') limits[name] = value;
      }
      // An extension is what WebGL calls an optional part of its API, so the
      // extension list is what stands where WebGPU's features are. A context
      // that supports none answers with nothing rather than throwing.
      return { limits, features: [...(gl.getSupportedExtensions() ?? [])].sort() };
    },

    // The resident traffic this backend's arena has seen since the last reset,
    // bytes written and uploaded reported apart (item 22). Answered from the
    // arena on this backend exactly as on WebGPU, so a caller reads it without
    // knowing which backend it holds.
    traffic(): FrameTraffic {
      return arena.traffic();
    },
    resetTraffic(): void {
      arena.resetTraffic();
    },

    program(frame: FrameGraph) {
      if (frame.authored !== 'glsl') throw new Error(`WebGL 2 was handed a ${frame.authored} frame to draw`);
      // Every rule about the graph is checked in one place; the WebGL 2 path does
      // not reach `submit/plan.ts`, so it reads the same function directly (item
      // 19). It is a no-op for the fullscreen GLSL frames this backend draws today
      // and refuses any graph carrying the faults it names.
      validate(frame);

      // The per-draw uniform buffers this frame's pipelines slice, one record a
      // draw reached by the byte offset it names (item 27). A per-draw slice is a
      // uniform bound with a dynamic offset, which GLSL ES 3.00 has where it has no
      // storage buffer, so it is the one buffer kind this backend keeps: every
      // other buffer is a storage buffer refused below. The size is one record's,
      // fixed for the binding; the group and binding are what tell the linked
      // program's per-draw block apart from the shared one.
      const perDrawResources = new Map<number, { size: number; group: number; binding: number }>();
      for (const spec of frame.pipelines) {
        const slice = perDrawBinding(spec);
        if (slice?.perDraw) {
          perDrawResources.set(indexOf(slice.resource), { size: slice.perDraw.size, group: slice.group, binding: slice.binding });
        }
      }
      // The alignment this device takes a dynamic offset at, read rather than
      // assumed: `bindBufferRange` fails on an offset that is not a whole number of
      // it, so an offset the graph carries that this device cannot honour is refused
      // by name below rather than dropped silently.
      const perDrawAlignment = gl.getParameter(gl.UNIFORM_BUFFER_OFFSET_ALIGNMENT) as number;

      // The read-only storage buffers this frame's render pipelines bind — the scene
      // tier's per-object records and its shared views, each authored as a
      // `{ kind: 'buffer', access: 'read' }` a WGSL shader indexes by
      // `instance_index` (item 92). GLSL ES 3.00 has no storage buffer, so each one
      // takes the raster path of a uniform block indexed by `gl_InstanceID`: the
      // whole buffer is bound once per pass, and the shader reads its own record out
      // of the array. It is a second buffer kind this backend keeps beside the
      // per-draw slice; a *read-write* storage buffer stays refused by name below,
      // since only a compute or fragment stage this backend has not got fills one.
      const storageResources = new Set<number>();
      for (const spec of frame.pipelines) {
        if (spec.kind !== 'render') continue;
        for (const { resource } of storageBindings(spec, frame)) storageResources.add(resource);
      }

      // The resource kinds this backend keeps: the frame's one uniform block, the
      // samplers that say how a texture is read between its pixels, a colour texture
      // a pass draws and a later pass samples (the multi-pass shape of item 46), and
      // a depth or stencil attachment a pass tests against (item 48), a resident
      // texture arriving with contents of its own, uploaded once (item 78), a
      // ladder generated off those contents (item 50), and a colour attachment
      // keeping several samples a pixel, averaged into a single-sample target
      // (item 80). The one narrower texture kind still refused here is a storage
      // texture, a compute output this backend has no compute stage to fill. A
      // multisampled *depth* stays refused too — item 80 is colour-attachment MSAA
      // alone — which is the safe direction until a later item lands it.
      const samplerSpecs = frame.resources.filter((resource): resource is SamplerResource => resource.kind === 'sampler');
      for (const [index, resource] of frame.resources.entries()) {
        // The uniform block, the samplers, and the vertex/index buffers of the
        // shader's own geometry (item 77) are the resource kinds this backend keeps.
        if (resource.kind === 'uniform' || resource.kind === 'sampler') continue;
        if (resource.kind === 'vertices' || resource.kind === 'indices') continue;
        // A buffer is kept where it is one a raster path can read: a per-draw slice
        // bound by a dynamic offset (item 27), or a read-only storage buffer bound
        // whole as a uniform block a shader indexes by `gl_InstanceID` (item 92). A
        // read-write storage buffer is a compute or fragment-stage output this
        // backend has no stage to fill: it needs the write arm `storage-buffer-readwrite`,
        // which WebGL 2 does not have, so `refusal()` refuses such a graph before a
        // program is ever asked for (item 97). The capability model is the refusal
        // now; this throw is the unreachable backstop that guards a caller who built
        // without consulting it, rather than the load-bearing refusal item 92 left it
        // as. A buffer no pipeline reads is refused too: this backend keeps only the
        // buffers its draws read.
        if (resource.kind === 'buffer') {
          if (perDrawResources.has(index)) continue;
          if (resource.access === 'read-write') {
            throw new Error(
              `the frame for "${frame.id}" writes resource ${index} as a storage buffer, and this backend has no compute to fill one`
            );
          }
          if (storageResources.has(index)) continue;
          throw new Error(
            `the frame for "${frame.id}" declares a buffer resource ${index} no pipeline reads, and this backend keeps only the buffers its draws read`
          );
        }
        // Everything but a texture has been kept or refused by name above, so what
        // remains here is a texture the frame draws, samples or tests against — the
        // narrower texture refusals follow.
        if (resource.use.includes('storage')) {
          throw new Error(
            `the frame for "${frame.id}" writes resource ${index} as a storage texture, and this backend has no compute to fill one`
          );
        }
        // A ladder is generated off resident contents (item 50): the card averages
        // every level below the first through `generateMipmap`. A ladder over a
        // texture a pass writes would be the levels of whatever was in it when it was
        // built, and every frame after the first would read a ladder of a picture that
        // is gone — so a ladder over an attachment is refused, the same reason and the
        // same words the WebGPU backend refuses it. A ladder over a texture with no
        // contents at all has nothing to average, and is refused too.
        if (resource.mips && resource.use.includes('attachment')) {
          throw new Error(`the frame for "${frame.id}" gives resource ${index} a ladder and writes it every frame`);
        }
        if (resource.mips && !resource.data && !resource.source) {
          throw new Error(`the frame for "${frame.id}" gives resource ${index} a ladder and no contents to build it from`);
        }
        // A texture keeping several samples of a pixel is a multisample colour
        // attachment (item 80): built as a multisample renderbuffer below, drawn
        // into, and averaged into a single-sample resolve target through a blit.
        // It is the narrowest kind there is, so everything else is closed to it,
        // the same reasons and words the WebGPU backend uses: nothing uploads
        // into one, nothing samples one, and a multisampled *depth* is a later
        // refinement this backend still refuses (colour attachments alone).
        if (resource.samples) {
          if (depthStencilOf(resource.format) !== null) {
            throw new Error(`the frame for "${frame.id}" keeps several samples of the depth in resource ${index}, and this backend keeps one`);
          }
          if (resource.data || resource.source) {
            throw new Error(`the frame for "${frame.id}" gives resource ${index} contents and several samples a pixel`);
          }
          if (resource.use.includes('sample')) {
            throw new Error(`the frame for "${frame.id}" binds resource ${index}, which keeps several samples a pixel`);
          }
        }
        // A texture arriving with contents is uploaded now (item 78) — but the
        // contents are a fixed-size image, so a content texture the frame's own
        // size would be thrown away and re-uploaded on every resize. That is
        // refused by name rather than silently re-run, the same refusal the WebGPU
        // backend makes for the same reason.
        if ((resource.data || resource.source) && followsFrame(resource.size)) {
          throw new Error(
            `the frame for "${frame.id}" gives resource ${index} contents and the frame's own size, which is thrown away on a resize`
          );
        }
      }
      const shown = frame.present;
      const shownSpec = shown === undefined ? undefined : resourceOf(frame, shown);
      if (shown !== undefined && (!shownSpec || shownSpec.kind !== 'texture')) {
        throw new Error(`the frame for "${frame.id}" shows a resource ${indexOf(shown)} it does not declare`);
      }
      // The picture the reader sees is a single-sample texture the backend blits
      // onto the canvas; a multisample attachment is a renderbuffer nothing copies
      // out of, so showing one is refused by name, the same words the WebGPU
      // backend uses. Its samples reach the canvas through the single-sample
      // resolve target instead.
      const shownMultisample = shownSpec?.kind === 'texture' && shownSpec.samples;
      if (shownMultisample) {
        throw new Error(`the frame for "${frame.id}" shows resource ${indexOf(shown as TextureHandle)}, which keeps several samples a pixel`);
      }
      // A texture declared in a depth or stencil format is a renderbuffer this
      // backend tests against rather than a colour texture it draws into or samples
      // (item 48), so the two are built through different arenas. A colour texture
      // keeping several samples a pixel is a third: a multisample renderbuffer
      // averaged into a single-sample resolve target (item 80). A frame the reader
      // sees is never a depth format and never multisampled, so the present above
      // is a single-sample colour texture. Each kind carries the index it sits at in
      // `frame.resources`, so a handle a pass or a present names resolves to the
      // record built for it (item 87).
      const colourSpecs: { index: number; spec: TextureResource }[] = [];
      const multisampleSpecs: { index: number; spec: TextureResource }[] = [];
      const depthSpecs: { index: number; spec: TextureResource }[] = [];
      for (const [index, resource] of frame.resources.entries()) {
        if (resource.kind !== 'texture') continue;
        if (depthStencilOf(resource.format) !== null) depthSpecs.push({ index, spec: resource });
        else if (resource.samples) multisampleSpecs.push({ index, spec: resource });
        else colourSpecs.push({ index, spec: resource });
      }

      // The static lifetime of §5: the linked program a shader compiles to, keyed
      // on the structure of its documents, so two passes drawing one pipeline link
      // it once and this program disposes it once. Scoped to this program — an
      // unbounded `PipelineCache`, living and dying with it — the same bound the
      // backend held before multi-pass. Item 63 shares WebGPU's cache across
      // programs for the scene tier's many pipelines; this stays program-scoped,
      // since a shared WebGLProgram would need a reference count before an eviction
      // could `deleteProgram` it out from under a live program that still draws
      // with it. What it caches is the compilation alone; the uniform buffer the
      // passes feed is resident.
      const programCache = new PipelineCache<{
        program: WebGLProgram;
        layout: Map<string, number> | null;
        size: number;
        attribute: number;
      }>();

      // The linked program, the block layout the driver reported and the attribute
      // slot the corners are read from, for one render pipeline. Cached by the
      // structure of its documents, so two passes drawing one pipeline link no
      // second program. The frame's one uniform block is bound to point 0 here,
      // once per linked program rather than every frame, so every pass reading it
      // shares the one buffer `setUniforms` writes — the WGSL model of one uniform
      // buffer read by each pipeline.
      const compileSpec = (spec: RenderPipelineSpec) => {
        if (spec.vertex === undefined) throw new Error(`the frame for "${frame.id}" carries no vertex document`);
        // A render pipeline carries its two stage texts on its own source pair (item
        // 99/103), so the GLSL the program links from is read straight off the source
        // rather than resolved through a shared module pool. The backend guarded a
        // non-GLSL frame above, so this arm's pair is the authored GLSL of each stage.
        const pair = (spec.source as GlslRenderSource).glsl;
        const vertexGlsl = pair.vertex;
        const fragmentGlsl = pair.fragment;
        return programCache.resolve(
          programCache.request(pipelineStructureOf(frame, spec), () => {
            const linked = gl.createProgram();
            if (!linked) throw new Error('the context refused to make a program');
            const vertex = compile(gl, gl.VERTEX_SHADER, vertexGlsl);
            const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentGlsl);
            gl.attachShader(linked, vertex);
            gl.attachShader(linked, fragment);
            gl.linkProgram(linked);
            gl.deleteShader(vertex);
            gl.deleteShader(fragment);
            if (!gl.getProgramParameter(linked, gl.LINK_STATUS)) {
              const log = gl.getProgramInfoLog(linked);
              gl.deleteProgram(linked);
              throw new Error(log ?? 'the program failed to link and the driver said nothing');
            }
            // Which door the values go through is decided by what the program has,
            // not by what the frame claims, so a compiler that changes its mind
            // about emitting a block cannot leave a shader silently unfed. A
            // pipeline slicing a per-draw buffer (item 27) or binding a read-only
            // storage buffer (item 92) links a block beside the shared one, told
            // apart by the `_group_G_binding_B` its member name carries for that
            // binding's group and binding.
            const slice = perDrawBinding(spec);
            const tagged: TaggedBlock[] = [];
            if (slice) tagged.push({ tag: `_group_${slice.group}_binding_${slice.binding}`, point: PER_DRAW_POINT });
            for (const storage of storageBindings(spec, frame)) tagged.push(storage.tag);
            const resolved = resolveBlocks(gl, linked, tagged);
            return {
              program: linked,
              layout: resolved.layout,
              size: resolved.size,
              attribute: gl.getAttribLocation(linked, 'position'),
            };
          })
        );
      };

      // Every texture the frame declares, allocated through an arena of its own so
      // a freed slot cannot resolve to its successor (item 10's stale-handle
      // safety, kept per resource kind because WebGL 2 frees a texture, a
      // framebuffer and a buffer through three different context calls where WebGPU
      // frees one union through the object). A texture a pass draws into carries a
      // framebuffer; one only sampled needs none. A frame-following texture is
      // remade at the new size on a resize.
      const textureArena = new Arena<WebGLTexture>((texture) => gl.deleteTexture(texture));
      const framebufferArena = new Arena<WebGLFramebuffer>((framebuffer) => gl.deleteFramebuffer(framebuffer));
      interface TextureRecord {
        spec: TextureResource;
        handle: Handle;
        fboHandle: Handle | null;
        follows: boolean;
        width: number;
        height: number;
      }
      const textures = new Map<number, TextureRecord>();
      const WRAPS: Record<SamplerResource['wrap'], number> = {
        clamp: gl.CLAMP_TO_EDGE,
        repeat: gl.REPEAT,
        mirror: gl.MIRRORED_REPEAT,
      };
      // One sampler stands for how every sampled texture is read between its
      // pixels. A per-binding sampler, where a scene binds two textures through two
      // samplers, is item 52's; a toy chain reads its one scratch target one way.
      const sampler = samplerSpecs[0];
      const buildTexture = (record: TextureRecord) => {
        const { width: across, height: down } = sizeAt(record.spec.size, { width, height });
        record.width = across;
        record.height = down;
        const texture = textureArena.resolve(record.handle);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        // A texture arriving with contents is uploaded at level 0 as the frame's one
        // resident image (item 78); a scratch attachment starts empty (null pixels)
        // and is filled by the pass that draws it. The bytes are the first contents
        // of a resident resource, so they are counted through `arena.wrote` the way
        // the geometry (item 77) and the WebGPU backend count theirs (item 22). A
        // content texture does not follow the frame — refused above where it would —
        // so `buildTexture` runs once for it and the bytes are counted once.
        const contents = record.spec.data ?? null;
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, across, down, 0, gl.RGBA, gl.UNSIGNED_BYTE, contents);
        if (contents) arena.wrote(contents.byteLength);
        // A ladder is generated off the level-0 contents (item 50): the card averages
        // every level below the first down to a single pixel, the steps the WebGPU
        // backend draws by hand, and how many there are it works out from the size. It
        // runs when the contents arrive rather than every frame, since a content
        // texture does not follow the frame — refused above where it would — so
        // `buildTexture` runs once for it. A texture with no ladder keeps its one level.
        const laddered = record.spec.mips === 'generate';
        if (laddered && contents) gl.generateMipmap(gl.TEXTURE_2D);
        // How the texture is read between its pixels; and between levels too where a
        // ladder exists, which is the trilinear min filter a smooth read of a
        // shrinking picture wants — the two levels either side of the wanted size
        // mixed, so the climb across the frame shows no hard step where one level
        // gives way to the next. The mag filter has no levels to mix, so it stays the
        // plain one.
        const linear = sampler?.filter === 'linear';
        const magFilter = linear ? gl.LINEAR : gl.NEAREST;
        const minFilter = laddered ? (linear ? gl.LINEAR_MIPMAP_LINEAR : gl.NEAREST_MIPMAP_NEAREST) : magFilter;
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, magFilter);
        const wrap = sampler ? WRAPS[sampler.wrap] : gl.CLAMP_TO_EDGE;
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
        if (record.fboHandle !== null) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, framebufferArena.resolve(record.fboHandle));
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        }
      };
      for (const { index, spec } of colourSpecs) {
        const record: TextureRecord = {
          spec,
          handle: textureArena.allocate(() => gl.createTexture() as WebGLTexture),
          fboHandle: spec.use.includes('attachment')
            ? framebufferArena.allocate(() => gl.createFramebuffer() as WebGLFramebuffer)
            : null,
          follows: followsFrame(spec.size),
          width: 0,
          height: 0,
        };
        textures.set(index, record);
        buildTexture(record);
      }

      // The depth and stencil attachments the frame declares (item 48), each a
      // renderbuffer through an arena of its own — a fourth resource kind beside the
      // buffers, textures and framebuffers, freed through its own context call — so
      // item 10's stale-handle safety covers it too. A depth or stencil follows the
      // frame like the colour targets beside it, so it is remade at the new size on a
      // resize; a distance kept at one size and tested at another would decide which
      // surface is in front out of the wrong pixels. One renderbuffer stands for the
      // resource however many passes attach it, so the second pass tests against the
      // depth the first pass left behind.
      const renderbufferArena = new Arena<WebGLRenderbuffer>((buffer) => gl.deleteRenderbuffer(buffer));
      interface DepthRecord {
        spec: TextureResource;
        handle: Handle;
        internal: number;
        point: number;
        depth: boolean;
        stencil: boolean;
        follows: boolean;
        width: number;
        height: number;
      }
      const depthTargets = new Map<number, DepthRecord>();
      const buildDepth = (record: DepthRecord) => {
        const { width: across, height: down } = sizeAt(record.spec.size, { width, height });
        record.width = across;
        record.height = down;
        gl.bindRenderbuffer(gl.RENDERBUFFER, renderbufferArena.resolve(record.handle));
        gl.renderbufferStorage(gl.RENDERBUFFER, record.internal, across, down);
      };
      for (const { index, spec } of depthSpecs) {
        const kind = depthStencilOf(spec.format) as NonNullable<ReturnType<typeof depthStencilOf>>;
        const record: DepthRecord = {
          spec,
          handle: renderbufferArena.allocate(() => gl.createRenderbuffer() as WebGLRenderbuffer),
          internal: kind.internal,
          point: kind.point,
          depth: kind.depth,
          stencil: kind.stencil,
          follows: followsFrame(spec.size),
          width: 0,
          height: 0,
        };
        depthTargets.set(index, record);
        buildDepth(record);
      }

      // The multisample colour attachments the frame declares (item 80): each a
      // multisample renderbuffer through the same arena the depth targets use — a
      // renderbuffer is a renderbuffer whatever it holds — carrying a framebuffer
      // of its own so a pass draws into it and the resolve blit reads out of it.
      // The card keeps several samples of every pixel here and averages them into
      // the single-sample resolve target the pass names, which is the
      // `resolveTarget` the WebGPU backend hands its colour attachment. A
      // multisampled attachment follows the frame like the colour and depth
      // targets beside it, remade at the new size on a resize, since an average
      // and the samples it came from have to be the same picture. `MAX_SAMPLES`
      // bounds how many a device keeps; more than it reports is refused by name.
      const maxSamples = gl.getParameter(gl.MAX_SAMPLES) as number;
      interface MultisampleRecord {
        spec: TextureResource;
        handle: Handle;
        fboHandle: Handle;
        samples: number;
        follows: boolean;
        width: number;
        height: number;
      }
      const multisampleColours = new Map<number, MultisampleRecord>();
      const buildMultisample = (record: MultisampleRecord) => {
        const { width: across, height: down } = sizeAt(record.spec.size, { width, height });
        record.width = across;
        record.height = down;
        gl.bindRenderbuffer(gl.RENDERBUFFER, renderbufferArena.resolve(record.handle));
        gl.renderbufferStorageMultisample(gl.RENDERBUFFER, record.samples, gl.RGBA8, across, down);
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebufferArena.resolve(record.fboHandle));
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, renderbufferArena.resolve(record.handle));
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      };
      for (const { index, spec } of multisampleSpecs) {
        const samples = spec.samples as number;
        if (samples > maxSamples) {
          throw new Error(`the frame for "${frame.id}" keeps ${samples} samples of resource ${index}, and this device keeps ${maxSamples}`);
        }
        const record: MultisampleRecord = {
          spec,
          handle: renderbufferArena.allocate(() => gl.createRenderbuffer() as WebGLRenderbuffer),
          fboHandle: framebufferArena.allocate(() => gl.createFramebuffer() as WebGLFramebuffer),
          samples,
          follows: followsFrame(spec.size),
          width: 0,
          height: 0,
        };
        multisampleColours.set(index, record);
        buildMultisample(record);
      }
      // Whether any pass tests depth or masks with a stencil, so a frame with none —
      // every fullscreen toy the backend drew before item 48 — sets no depth/stencil
      // state at all and its call stream is exactly what it was.
      const hasDepthStencil = depthTargets.size > 0;

      // The size the textures were last built at, so a resize between build and
      // draw remakes the frame-following ones before a pass reads a target of the
      // wrong size.
      const built = { width, height };

      // The vertex and index buffers of the shader's own geometry (item 77), each
      // allocated through the backend's buffer arena so a freed handle is caught
      // rather than naming whatever the context hands back next (item 10), and
      // freed on dispose. Its bytes are the first contents of a resident resource,
      // so they are counted through `arena.wrote` the way WebGPU counts geometry
      // (item 22). Cached by the geometry's index (item 87), so two passes drawing
      // one primitive upload it once. A geometry the frame does not declare, or one
      // whose index buffer it names but does not carry, is refused by name.
      const geometryHandles: Handle[] = [];
      const geometryPlans = new Map<number, GL2Geometry>();
      // How many float components one vertex attribute carries, read off the
      // format the generator wrote the bytes under. WebGL 2 reads them as floats,
      // which is every attribute the `quad-grid` primitive carries; a byte or
      // integer attribute is a later primitive's and wants a row here first.
      const componentsOfFormat = (format: string) => Number(/x(\d)/.exec(format)?.[1] ?? '1');
      const buildGeometry = (handle: VertexHandle): GL2Geometry => {
        const key = indexOf(handle);
        const cached = geometryPlans.get(key);
        if (cached) return cached;
        const vertices = resourceOf(frame, handle);
        if (!vertices || vertices.kind !== 'vertices') throw new Error(`the frame for "${frame.id}" draws resource ${key}, which is no geometry it declares`);
        if (!vertices.data) throw new Error(`the geometry ${key} on "${frame.id}" arrived with no vertices to draw`);
        const vertexHandle = arena.allocate(() => gl.createBuffer() as WebGLBuffer);
        geometryHandles.push(vertexHandle);
        const vertexBuffer = arena.resolve(vertexHandle);
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices.data, gl.STATIC_DRAW);
        arena.wrote(vertices.data.byteLength);
        let index: GL2Geometry['index'];
        if (vertices.indices !== undefined) {
          const indices = resourceOf(frame, vertices.indices);
          if (!indices || indices.kind !== 'indices') {
            throw new Error(`the geometry ${key} on "${frame.id}" orders itself by resource ${indexOf(vertices.indices)}, which it does not declare`);
          }
          if (!indices.data) throw new Error(`the geometry ${key} on "${frame.id}" arrived with no indices to order it`);
          const indexHandle = arena.allocate(() => gl.createBuffer() as WebGLBuffer);
          geometryHandles.push(indexHandle);
          const indexBuffer = arena.resolve(indexHandle);
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
          gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices.data, gl.STATIC_DRAW);
          arena.wrote(indices.data.byteLength);
          index = {
            buffer: indexBuffer,
            type: indices.format === 'uint32' ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
            count: indices.count,
          };
        }
        const plan: GL2Geometry = {
          buffer: vertexBuffer,
          stride: vertices.stride,
          attributes: vertices.attributes.map((attribute) => ({
            location: attribute.location,
            components: componentsOfFormat(attribute.format),
            offset: attribute.offset,
          })),
          vertexCount: vertices.count,
          index,
          mode: modeOfTopology(gl, vertices.topology, frame.id, key),
        };
        geometryPlans.set(key, plan);
        return plan;
      };

      // Each pass resolved to what it draws with: its linked program, the corners
      // and instances of its draws, the texture it draws into (or the canvas), the
      // colour it clears to, and the textures it samples bound to units. The frame
      // loop reads these rather than the description (item 16's discipline). The
      // frame's one uniform block layout is the first block a pipeline reports;
      // every pipeline shares the frame's one block, so its members sit alike.
      if (frame.passes.length === 0) {
        throw new Error(`the frame for "${frame.id}" describes no pass this backend can draw`);
      }
      interface Sampled {
        unit: number;
        /** The texture this binding samples, by its handle: the record it binds is
         * `textures.get(indexOf(texture))` (item 87). */
        texture: ResourceHandle;
        /** The GLSL sampler variable this binding feeds, which `getUniformLocation`
         * looks up by name. It is a shader fact rather than resource identity — the
         * `_group_G_binding_B` a translated shader declares its combined sampler
         * under — so it is named from the binding's own group and binding, not from
         * the resource the handle points at, which no longer carries a name (item 87). */
        sampler: string;
      }
      interface PassPlan {
        program: WebGLProgram;
        attribute: number;
        vertices: number[];
        instances: (number | undefined)[];
        // The colours this pass writes, in the fragment stage's output order:
        // empty for a pass drawing the canvas, one for a single attachment, several
        // for multiple render targets (item 47). `clear` is what each is emptied
        // to. `resolve` names the single-sample target a multisample attachment's
        // samples are averaged into at the end of the pass (item 80), absent for a
        // single-sample attachment.
        targets: { resource: TextureHandle; clear?: [number, number, number, number]; resolve?: TextureHandle }[];
        // The framebuffer a multiple-target pass draws through, carrying every
        // colour at a successive attachment point; null for a canvas or
        // single-attachment pass, which keeps the framebuffer item 46 gave it.
        mrtFbo: Handle | null;
        sampled: Sampled[];
        // The vertex buffer of the shader's own geometry this pass draws, resolved
        // off the pipeline's `geometry` (item 77); null for a pass covering the
        // frame with the backend's own corners, which reads the shared quad.
        geometry: GL2Geometry | null;
        // The depth/stencil state this pass draws under (item 48); null for a pass
        // that tests neither. `compare` and `write` are the depth half — the card's
        // own compare enum and the write flag — absent for a stencil-only mask.
        // `stencil` is the mode a mask is marked or read under. `clearDepth`/
        // `clearStencil` are what the attachment is emptied to first, absent where
        // the pass keeps what an earlier pass left. `fbo` is the framebuffer the
        // renderbuffer is attached to, re-attached beside the colour targets on a
        // resize.
        depth: {
          compare?: number;
          write: boolean;
          stencil?: StencilMode;
          clearDepth?: number;
          clearStencil?: number;
          record: DepthRecord;
          fbo: Handle;
        } | null;
        // The per-draw uniform buffer this pass slices, one record a draw bound by
        // `bindBufferRange` at the offset the draw names (item 27); null for a pass
        // whose draws read the same records. It carries the resolved GL buffer, the
        // point its block is bound to, one record's width, and the offset each draw
        // reads its slice from.
        perDraw: GL2PerDraw | null;
        // The read-only storage buffers this pass binds whole before its draw
        // (item 92): each the resolved GL buffer and the point its uniform-block
        // form is bound to with `bindBufferBase`, so the shader reads its record out
        // of the array by `gl_InstanceID`. Empty for a pass reading no storage
        // buffer, which is every fullscreen toy.
        storage: { buffer: WebGLBuffer; point: number }[];
      }

      // The per-draw uniform buffers, each allocated through the backend's buffer
      // arena so a freed handle is caught rather than naming whatever the context
      // hands back next (item 10), uploaded once with the records the build wrote,
      // and freed on dispose. Its bytes are the first contents of a resident
      // resource, so they are counted through `arena.wrote` the way the geometry
      // (item 77) and the WebGPU backend count theirs (item 22).
      const perDrawHandles: Handle[] = [];
      const perDrawGLBuffers = new Map<number, WebGLBuffer>();
      for (const index of perDrawResources.keys()) {
        const spec = frame.resources[index];
        if (!spec || spec.kind !== 'buffer') continue;
        const handle = arena.allocate(() => gl.createBuffer() as WebGLBuffer);
        perDrawHandles.push(handle);
        const buffer = arena.resolve(handle);
        gl.bindBuffer(gl.UNIFORM_BUFFER, buffer);
        if (spec.data) {
          gl.bufferData(gl.UNIFORM_BUFFER, spec.data, gl.STATIC_DRAW);
          arena.wrote(spec.data.byteLength);
        }
        perDrawGLBuffers.set(index, buffer);
      }

      // The read-only storage buffers (item 92), allocated and uploaded exactly the
      // way the per-draw buffers above are — through the backend's buffer arena
      // (item 10), once with the records the producer packed, their bytes counted
      // through `arena.wrote` as the first contents of a resident resource (item 22).
      // A scene's per-object buffer carries a record per copy the shader reads by
      // `gl_InstanceID`, the shared views buffer one matrix per view; both reach the
      // card as bytes here, bound whole per pass below.
      const storageHandles: Handle[] = [];
      const storageGLBuffers = new Map<number, WebGLBuffer>();
      for (const index of storageResources) {
        const spec = frame.resources[index];
        if (!spec || spec.kind !== 'buffer') continue;
        const handle = arena.allocate(() => gl.createBuffer() as WebGLBuffer);
        storageHandles.push(handle);
        const buffer = arena.resolve(handle);
        gl.bindBuffer(gl.UNIFORM_BUFFER, buffer);
        if (spec.data) {
          gl.bufferData(gl.UNIFORM_BUFFER, spec.data, gl.STATIC_DRAW);
          arena.wrote(spec.data.byteLength);
        }
        storageGLBuffers.set(index, buffer);
      }

      const plans: PassPlan[] = [];
      let blockLayoutMap: Map<string, number> | null = null;
      let blockSize = 0;
      // The most colour attachments this device draws to at once — the smaller of
      // the two ceilings that bound it, since drawing to N attachments needs both N
      // draw buffers and N colour attachment points. A pass writing more than this
      // is refused by name with the ceiling it broke (item 47); a single-attachment
      // or canvas pass never approaches it. Read here rather than cached so a device
      // reporting a lower ceiling than the specification's floor is honoured.
      const targetLimit = Math.min(
        gl.getParameter(gl.MAX_DRAW_BUFFERS) as number,
        gl.getParameter(gl.MAX_COLOR_ATTACHMENTS) as number
      );
      // A multiple-target pass draws through a framebuffer carrying all its
      // colours, each texture attached at a successive colour point so the fragment
      // stage's output i lands in attachment i. Its textures are respecified at the
      // new size on a resize, so this is called again beside them there.
      const attachTargets = (fbo: Handle, targets: { resource: TextureHandle }[]) => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebufferArena.resolve(fbo));
        targets.forEach((target, at) => {
          const record = textures.get(indexOf(target.resource)) as TextureRecord;
          gl.framebufferTexture2D(
            gl.FRAMEBUFFER,
            gl.COLOR_ATTACHMENT0 + at,
            gl.TEXTURE_2D,
            textureArena.resolve(record.handle),
            0
          );
        });
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      };
      // A depth or stencil renderbuffer attached to the framebuffer a pass draws
      // through, at the point its format keeps (item 48). Called again on a resize
      // beside the colour re-attach, since the renderbuffer is respecified at the
      // new size there. One renderbuffer serves every pass that names the resource,
      // so a second pass tests against the depth the first pass left.
      const attachDepth = (fbo: Handle, record: DepthRecord) => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebufferArena.resolve(fbo));
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, record.point, gl.RENDERBUFFER, renderbufferArena.resolve(record.handle));
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      };
      for (const pass of frame.passes) {
        const spec = frame.pipelines[indexOf(pass.pipeline)];
        if (!spec) throw new Error(`the frame for "${frame.id}" describes no pass this backend can draw`);
        // Compute is the reason WebGPU is here, so it is refused by name rather
        // than approximated. The pipeline is asked as well as the pass, because a
        // pass reading as a draw while naming a compute pipeline would otherwise
        // reach the compiler as a program with no vertex half.
        if (spec.kind === 'compute' || !isRenderPass(pass)) {
          throw new Error(`the frame for "${frame.id}" runs compute work, and WebGL 2 has no compute stage`);
        }
        // Which positions this pass draws: the shader's own geometry where its
        // pipeline names a `geometry` (item 77), or the backend's fullscreen corners
        // where it names none. A pipeline reading geometry draws its vertex buffer,
        // one `drawArrays`/`drawElements` per draw counting instances alone; one
        // reading none covers the frame with the shared quad, and a draw walking a
        // buffer beside it is refused for want of geometry to walk.
        const geometryHandle = spec.kind === 'render' ? spec.geometry : undefined;
        if (geometryHandle === undefined) {
          // Every draw is asked, since one that walks a buffer is refused however
          // many corners-draws sit beside it (item 26).
          if (!pass.draws.every(drawsCorners)) {
            throw new Error(`the frame for "${frame.id}" draws geometry of its own, and this backend has no buffer for it`);
          }
        } else {
          // A geometry pass reads its counts off the vertex buffer, so a draw
          // carrying its own corner count, or one reading its counts out of a
          // buffer (item 28's indirect), has no place in it.
          if (pass.draws.some(drawsCorners)) {
            throw new Error(`the frame for "${frame.id}" mixes its own corners into the geometry ${indexOf(geometryHandle)}, which it draws from one buffer`);
          }
          if (pass.draws.some(drawsIndirectly)) {
            throw new Error(`the frame for "${frame.id}" reads resource ${indexOf(geometryHandle)}'s draw counts out of a buffer, which this backend does not`);
          }
        }
        const compiled = compileSpec(spec);
        if (compiled.layout && !blockLayoutMap) {
          blockLayoutMap = compiled.layout;
          blockSize = compiled.size;
        }
        // The colours this pass writes, in the fragment stage's output order: the
        // textures it draws into, or the frame the reader sees where it names none
        // (item 46). More than the device draws to at once is refused by name with
        // the ceiling it broke, rather than every colour past the first being
        // thrown away, which draws and is wrong (item 47).
        const colour = (isRenderPass(pass) ? pass.colour : undefined) ?? [];
        const wanted = Math.max(colour.length, spec.targets?.length ?? 0);
        if (wanted > targetLimit) {
          throw new Error(
            `the frame for "${frame.id}" writes ${wanted} colours at once, and this device draws to ${targetLimit}`
          );
        }
        for (const attachment of colour) {
          // An attachment a pass draws into is a single-sample colour texture or a
          // multisample renderbuffer (item 80); either is an attachment the frame
          // declared, and one it did not is refused by name.
          const record = textures.get(indexOf(attachment.resource)) ?? multisampleColours.get(indexOf(attachment.resource));
          if (!record || !record.spec.use.includes('attachment')) {
            throw new Error(`the frame for "${frame.id}" draws into resource ${indexOf(attachment.resource)}, which is no attachment it declares`);
          }
        }
        const sampled: Sampled[] = spec.bindings
          .filter((binding: BindingSpec) => binding.reads === 'sample')
          .map((binding, unit) => {
            const record = textures.get(indexOf(binding.resource));
            if (!record || !record.spec.use.includes('sample')) {
              throw new Error(`the frame for "${frame.id}" samples resource ${indexOf(binding.resource)}, which is no texture it reads`);
            }
            // The texture is resolved by handle; the GL sampler uniform is bound by
            // the GLSL variable name the shader declares it under, which is the
            // binding's own `_group_G_binding_B` rather than the resource's identity
            // (item 87).
            return { unit, texture: binding.resource, sampler: `_group_${binding.group}_binding_${binding.binding}` };
          });
        // A pass writing several colours draws through a framebuffer of its own
        // carrying all of them; one or none keeps the single-texture framebuffer or
        // the canvas it had (item 46), so only a multiple-target pass allocates one.
        const targets = colour.map((attachment) => ({ resource: attachment.resource, clear: attachment.clear, resolve: attachment.resolve }));
        // A multisample attachment averages its samples into the single-sample
        // resolve target the pass names (item 80). One that names none averages
        // them nowhere and nothing can read a multisample renderbuffer, so it is
        // refused; a single-sample attachment naming a resolve has nothing to
        // average and is refused too — the same words `submit/plan.ts` refuses the
        // WebGPU side with. The resolve target is a single-sample colour
        // attachment the frame declares. Averaging several samples across the many
        // targets of one pass is not in item 80's scope and is refused by name.
        if (targets.length > 1 && targets.some((target) => multisampleColours.has(indexOf(target.resource)))) {
          throw new Error(`the frame for "${frame.id}" keeps several samples in one of a pass's several targets, which this backend does not average`);
        }
        for (const target of targets) {
          const multisample = multisampleColours.get(indexOf(target.resource));
          if (multisample) {
            if (target.resolve === undefined) {
              throw new Error(`the frame for "${frame.id}" keeps several samples a pixel in resource ${indexOf(target.resource)} and averages them nowhere`);
            }
            const into = textures.get(indexOf(target.resolve));
            if (!into || !into.spec.use.includes('attachment')) {
              throw new Error(`the frame for "${frame.id}" averages resource ${indexOf(target.resource)} into resource ${indexOf(target.resolve)}, which is no attachment it declares`);
            }
          } else if (target.resolve !== undefined) {
            throw new Error(`the frame for "${frame.id}" averages resource ${indexOf(target.resource)} into resource ${indexOf(target.resolve)} and it keeps one sample a pixel`);
          }
        }
        let mrtFbo: Handle | null = null;
        if (targets.length > 1) {
          mrtFbo = framebufferArena.allocate(() => gl.createFramebuffer() as WebGLFramebuffer);
          attachTargets(mrtFbo, targets);
        }
        // The depth or stencil this pass tests against (item 48). The pass names the
        // attachment and what to clear it to; the pipeline says how to test — the
        // compare and write of the depth half, the mode of the mask — because the
        // card compiles the test into the pipeline (§8, the reason `spec.depth`
        // holds it). The renderbuffer attaches to the framebuffer the pass draws
        // through: a single target's own, or the multiple-target framebuffer above.
        // A depth pass drawing the frame directly is refused by name, since a depth
        // buffer cannot attach to the canvas.
        let depthPlan: PassPlan['depth'] = null;
        if (isRenderPass(pass) && pass.depth) {
          const record = depthTargets.get(indexOf(pass.depth.resource));
          if (!record) {
            throw new Error(`the frame for "${frame.id}" tests against resource ${indexOf(pass.depth.resource)}, which is no depth or stencil it declares`);
          }
          if (targets.length === 0) {
            throw new Error(`the frame for "${frame.id}" tests depth while drawing the frame directly, and a depth buffer cannot attach to the canvas`);
          }
          // A single-sample depth renderbuffer cannot share a framebuffer with a
          // multisample colour target, and a multisample depth is out of item 80's
          // scope, so a depth pass drawing a multisample attachment is refused by
          // name rather than reaching the single-sample framebuffer lookup below.
          if (multisampleColours.has(indexOf(targets[0].resource))) {
            throw new Error(`the frame for "${frame.id}" tests depth against the multisample target resource ${indexOf(targets[0].resource)}, which this backend does not`);
          }
          const fbo = targets.length === 1 ? ((textures.get(indexOf(targets[0].resource)) as TextureRecord).fboHandle as Handle) : (mrtFbo as Handle);
          attachDepth(fbo, record);
          const tested = spec.kind === 'render' ? spec.depth : undefined;
          depthPlan = {
            ...(tested?.compare !== undefined ? { compare: COMPARE[tested.compare] } : {}),
            write: tested?.write ?? false,
            ...(tested?.stencil !== undefined ? { stencil: tested.stencil } : {}),
            ...(record.depth && pass.depth.clear !== undefined ? { clearDepth: pass.depth.clear } : {}),
            ...(record.stencil && pass.depth.stencilClear !== undefined ? { clearStencil: pass.depth.stencilClear } : {}),
            record,
            fbo,
          };
        }
        // The per-draw slice this pass binds a range of before each draw (item 27):
        // the resolved GL buffer, the point its block was bound to, one record's
        // width, and the byte offset each draw reads its record from. Each offset is
        // a whole number of the device's alignment or `bindBufferRange` would refuse
        // it, so an offset this device cannot honour is refused by name here rather
        // than dropped silently. `validate` has already checked the offsets against
        // core WebGPU's 256, which every device's alignment divides, so this fires
        // only where a device reports a coarser one.
        const slice = perDrawBinding(spec);
        let perDrawPlan: GL2PerDraw | null = null;
        if (slice?.perDraw) {
          const buffer = perDrawGLBuffers.get(indexOf(slice.resource)) as WebGLBuffer;
          const offsets = pass.draws.map((draw) => (draw as { perDraw?: number }).perDraw ?? 0);
          for (const offset of offsets) {
            if (offset % perDrawAlignment !== 0) {
              throw new Error(
                `the frame for "${frame.id}" reads a per-draw slice at offset ${offset}, which this device's ${perDrawAlignment}-byte alignment does not allow`
              );
            }
          }
          perDrawPlan = { buffer, binding: PER_DRAW_POINT, size: slice.perDraw.size, offsets };
        }
        // The read-only storage buffers this pass binds whole before its draw
        // (item 92), each resolved to its GL buffer and the point `resolveBlocks`
        // bound its uniform-block form to at compile — the same points
        // `storageBindings` derives here, so the two steps agree. A pass reading
        // none (every fullscreen toy) carries an empty list and binds nothing.
        const storagePlan =
          spec.kind === 'render'
            ? storageBindings(spec, frame).map((storage) => ({
                buffer: storageGLBuffers.get(storage.resource) as WebGLBuffer,
                point: storage.tag.point,
              }))
            : [];
        plans.push({
          program: compiled.program,
          attribute: compiled.attribute,
          // The corner count of each draw the pass carries, one draw apiece (item
          // 26), and the instance count aligned to it (item 28): a draw covering
          // many instances is one `drawArraysInstanced`, one covering a single
          // instance a plain `drawArrays`.
          vertices: pass.draws.map((draw) => (draw as { vertices?: number }).vertices ?? 0),
          instances: pass.draws.map((draw) => (draw as { instances?: number }).instances),
          targets,
          mrtFbo,
          sampled,
          // The vertex buffer of the shader's own geometry, built once and shared by
          // two passes drawing one primitive; null for a fullscreen corners pass.
          geometry: geometryHandle === undefined ? null : buildGeometry(geometryHandle),
          depth: depthPlan,
          perDraw: perDrawPlan,
          storage: storagePlan,
        });
      }

      // What the source declared each uniform as, by name. WebGL 2 takes a scalar
      // `int` through `gl.uniform1i` and a block's `int` member as raw signed
      // words, not through the float door either takes a `float` through: feeding
      // an `int` uniform with `gl.uniform1f` is `GL_INVALID_OPERATION`, so the
      // uniform keeps its default of 0 and the shader animates off a number nobody
      // delivered (item 61). The value's JavaScript shape cannot say this — 3 is 3
      // whether the source wants a float or an int — so the declared type is read
      // from the source by `reflect` (item 69).
      const declaredType = new Map(reflect(frame).map((uniform) => [uniform.name, uniform.type]));
      const isInt = (name: string) => declaredType.get(name) === 'int';

      // The resident lifetime: one uniform buffer the passes write their values
      // into, allocated through the backend's buffer arena and freed on dispose.
      // The scratch it is filled from is this program's too, and the layout is the
      // first block a pipeline reported, shared because every pipeline of a frame
      // reads the frame's one block.
      const bytes = blockLayoutMap ? new Float32Array(blockSize / 4) : null;
      // The same block seen as signed 32-bit words, for a member declared `int`.
      // std140 lays an int in the four bytes a float takes, but writing 3 as a
      // float leaves a bit pattern the driver reads back as ~4e-45 rather than 3,
      // so an int member is written through this view of the same buffer instead.
      const words = bytes ? new Int32Array(bytes.buffer) : null;
      const uboHandle = blockLayoutMap ? arena.allocate(() => gl.createBuffer() as WebGLBuffer) : null;
      const ubo = uboHandle === null ? null : arena.resolve(uboHandle);

      // Loose uniform locations, one map per linked program, for a frame whose
      // program reports no block. Only a single-pass fullscreen frame reaches here,
      // and its one program is the only key.
      const looseLocations = new Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>();
      const locationOf = (program: WebGLProgram, name: string) => {
        let held = looseLocations.get(program);
        if (!held) {
          held = new Map();
          looseLocations.set(program, held);
        }
        if (!held.has(name)) held.set(name, gl.getUniformLocation(program, name));
        return held.get(name) ?? null;
      };

      return {
        setUniforms(values: Record<string, UniformValue>) {
          if (blockLayoutMap && bytes && words && ubo) {
            for (const [name, value] of Object.entries(values)) {
              const at = blockLayoutMap.get(name);
              if (at === undefined) continue;
              if (Array.isArray(value)) value.forEach((v, i) => (bytes[at + i] = v));
              else if (isInt(name)) words[at] = value;
              else bytes[at] = value;
            }
            gl.bindBuffer(gl.UNIFORM_BUFFER, ubo);
            gl.bufferData(gl.UNIFORM_BUFFER, bytes, gl.DYNAMIC_DRAW);
            // Respecified every frame rather than queued, so it is counted here
            // where it lands rather than through `upload`/`flush`: this backend's
            // uniform block is uploaded, not written once (item 22).
            arena.sent(bytes.byteLength);
            // Bound to point 0, which every pipeline's block was bound to at build.
            gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, ubo);
            return;
          }
          for (const plan of plans) {
            gl.useProgram(plan.program);
            for (const [name, value] of Object.entries(values)) {
              const location = locationOf(plan.program, name);
              if (!location) continue;
              if (!Array.isArray(value)) {
                if (isInt(name)) gl.uniform1i(location, value);
                else gl.uniform1f(location, value);
                continue;
              }
              if (componentsOf('vec2') === value.length) gl.uniform2fv(location, value);
              else if (componentsOf('vec3') === value.length) gl.uniform3fv(location, value);
              else gl.uniform4fv(location, value);
            }
          }
        },

        draw(into?: GPUTexture) {
          // `into` is a WebGPU texture, and a caller holding one has chosen the
          // backend it came from. Handing it here is the same class of caller
          // mistake as a frame of the wrong target, so it is refused by name
          // rather than dropped into a picture nobody captured (item 29).
          if (into !== undefined) {
            throw new Error('WebGL 2 was handed a WebGPU texture to draw into, which it cannot land a frame in');
          }
          // A size change since the last build remakes every frame-following
          // texture and its framebuffer at the new size, since what was in one is
          // gone when it is rebuilt and a later pass would otherwise sample a
          // target of the wrong size.
          if (built.width !== width || built.height !== height) {
            for (const record of textures.values()) if (record.follows) buildTexture(record);
            // A texture respecified at the new size is re-attached to its own
            // framebuffer inside `buildTexture`; a multiple-target pass's framebuffer
            // holds the same textures at several points, so it is re-attached here
            // beside them (item 47).
            for (const plan of plans) if (plan.mrtFbo !== null) attachTargets(plan.mrtFbo, plan.targets);
            // A depth or stencil follows the frame the same way, so it is respecified
            // at the new size and re-attached to the framebuffer it tests against
            // beside the colour targets (item 48).
            for (const record of depthTargets.values()) if (record.follows) buildDepth(record);
            for (const plan of plans) if (plan.depth) attachDepth(plan.depth.fbo, plan.depth.record);
            // A multisample attachment follows the frame the same way, so its
            // renderbuffer is respecified at the new size and re-attached to its
            // framebuffer beside the colour targets (item 80); `buildMultisample`
            // does both. An average and the samples it came from stay the same
            // picture across a resize this way.
            for (const record of multisampleColours.values()) if (record.follows) buildMultisample(record);
            built.width = width;
            built.height = height;
          }
          // Each pass in turn draws into its target — a texture's framebuffer, the
          // canvas where it names none, or its own framebuffer carrying several
          // colours (item 47) — clearing it first where the pass says so, and
          // sampling any earlier pass's texture bound to a unit. This is the
          // multi-pass loop items 48 to 52 extend (item 46).
          for (const plan of plans) {
            // The pass's first target is a single-sample colour texture or a
            // multisample renderbuffer (item 80); both carry a framebuffer and a
            // size, so the draw reads either through the one `primary`.
            const primaryHandle = plan.targets[0]?.resource;
            const primaryMultisample = primaryHandle === undefined ? undefined : multisampleColours.get(indexOf(primaryHandle));
            const primary =
              primaryHandle === undefined ? null : primaryMultisample ?? (textures.get(indexOf(primaryHandle)) as TextureRecord);
            const framebuffer =
              plan.targets.length === 0
                ? null
                : plan.targets.length === 1
                  ? framebufferArena.resolve((primary as { fboHandle: Handle }).fboHandle)
                  : framebufferArena.resolve(plan.mrtFbo as Handle);
            gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
            const passWidth = primary ? primary.width : width;
            const passHeight = primary ? primary.height : height;
            if (plan.targets.length > 1) {
              // The fragment stage's output i is written to colour point i, and each
              // attachment is cleared through its own point so two targets can clear
              // to different colours where one `clearColor` could not.
              gl.drawBuffers(plan.targets.map((_target, at) => gl.COLOR_ATTACHMENT0 + at));
              plan.targets.forEach((target, at) => {
                if (target.clear) gl.clearBufferfv(gl.COLOR, at, target.clear);
              });
            } else if (plan.targets[0]?.clear) {
              const clear = plan.targets[0].clear;
              gl.clearColor(clear[0], clear[1], clear[2], clear[3]);
              gl.clear(gl.COLOR_BUFFER_BIT);
            }
            // The depth or stencil this pass empties first, through the buffer kind
            // its format keeps (item 48). A clear writes past whatever mask a later
            // pipeline sets, so the write masks are opened here and the per-pass state
            // below sets them to what the pipeline tests under.
            if (plan.depth) {
              const d = plan.depth;
              if (d.clearDepth !== undefined && d.clearStencil !== undefined) {
                gl.depthMask(true);
                gl.stencilMask(0xff);
                gl.clearBufferfi(gl.DEPTH_STENCIL, 0, d.clearDepth, d.clearStencil);
              } else if (d.clearDepth !== undefined) {
                gl.depthMask(true);
                gl.clearBufferfv(gl.DEPTH, 0, [d.clearDepth]);
              } else if (d.clearStencil !== undefined) {
                gl.stencilMask(0xff);
                gl.clearBufferiv(gl.STENCIL, 0, [d.clearStencil]);
              }
            }
            // The depth and stencil test state this pass draws under (item 48), set
            // every pass of a depth frame because a real context leaks it between
            // them: the depth test on with its compare and write where the pipeline
            // tests distances, the stencil test on with the mode's func, ops and
            // write mask where it masks, and each turned off where the pass tests
            // neither. A frame that tests nothing at all sets none of this, so its
            // call stream is what it was before item 48.
            if (hasDepthStencil) {
              if (plan.depth?.compare !== undefined) {
                gl.enable(gl.DEPTH_TEST);
                gl.depthFunc(plan.depth.compare);
                gl.depthMask(plan.depth.write);
              } else {
                gl.disable(gl.DEPTH_TEST);
                gl.depthMask(false);
              }
              if (plan.depth?.stencil !== undefined) {
                const mode = STENCIL_GL[plan.depth.stencil];
                gl.enable(gl.STENCIL_TEST);
                gl.stencilFunc(mode.func, STENCIL_REF, 0xff);
                gl.stencilOp(mode.fail, mode.zfail, mode.zpass);
                gl.stencilMask(mode.writeMask);
              } else {
                gl.disable(gl.STENCIL_TEST);
              }
            }
            gl.useProgram(plan.program);
            for (const read of plan.sampled) {
              const source = textures.get(indexOf(read.texture)) as TextureRecord;
              gl.activeTexture(gl.TEXTURE0 + read.unit);
              gl.bindTexture(gl.TEXTURE_2D, textureArena.resolve(source.handle));
              const location = gl.getUniformLocation(plan.program, read.sampler);
              if (location) gl.uniform1i(location, read.unit);
            }
            // The read-only storage buffers this pass reads (item 92), each bound
            // whole to the point its uniform-block form was linked at, so the shader
            // reads its per-instance record out of the array by `gl_InstanceID`. The
            // whole buffer is bound once here, unlike the per-draw slice the executor
            // binds a range of before each draw (item 27).
            for (const store of plan.storage) gl.bindBufferBase(gl.UNIFORM_BUFFER, store.point, store.buffer);
            drawGL2Frame({
              gl,
              program: plan.program,
              quad,
              attribute: plan.attribute,
              vertices: plan.vertices,
              instances: plan.instances,
              width: passWidth,
              height: passHeight,
              ...(plan.geometry ? { geometry: plan.geometry } : {}),
              ...(plan.perDraw ? { perDraw: plan.perDraw } : {}),
            });
            // A pass drawing a multisample attachment averages its samples into the
            // single-sample resolve target by blitting the multisample framebuffer
            // onto the resolve target's, the same average WebGPU takes through a
            // `resolveTarget` on its colour attachment (item 80). Same size and
            // format either side, so the blit resolves rather than scales, and the
            // resolve target — a single-sample colour texture — is what the frame
            // then shows.
            const resolveOut = plan.targets[0]?.resolve;
            if (primaryMultisample && resolveOut !== undefined) {
              const into = textures.get(indexOf(resolveOut)) as TextureRecord;
              gl.bindFramebuffer(gl.READ_FRAMEBUFFER, framebufferArena.resolve(primaryMultisample.fboHandle));
              gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, framebufferArena.resolve(into.fboHandle as Handle));
              gl.blitFramebuffer(0, 0, primaryMultisample.width, primaryMultisample.height, 0, 0, into.width, into.height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
              gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            }
          }
          // The picture the frame names is shown by blitting its texture onto the
          // canvas, where the passes drew into textures rather than the canvas
          // itself. A frame whose last pass drew the canvas directly names no
          // present and needs no blit.
          if (shown !== undefined) {
            const record = textures.get(indexOf(shown)) as TextureRecord;
            if (record.fboHandle !== null) {
              gl.bindFramebuffer(gl.READ_FRAMEBUFFER, framebufferArena.resolve(record.fboHandle));
              gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
              gl.blitFramebuffer(0, 0, record.width, record.height, 0, 0, width, height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
            }
          }
        },

        dispose() {
          // The uniform buffer, every texture and its framebuffer, and each linked
          // program are this program's own. The buffers and textures go back to
          // their arenas; a program two passes shared is deleted once.
          if (uboHandle !== null) arena.free(uboHandle);
          // The vertex and index buffers of the shader's own geometry go back to the
          // buffer arena beside the uniform block (item 77).
          for (const handle of geometryHandles) arena.free(handle);
          // The per-draw uniform buffers go back to the buffer arena beside them
          // (item 27).
          for (const handle of perDrawHandles) arena.free(handle);
          // The read-only storage buffers go back to the buffer arena beside the
          // per-draw ones (item 92).
          for (const handle of storageHandles) arena.free(handle);
          for (const record of textures.values()) {
            textureArena.free(record.handle);
            if (record.fboHandle !== null) framebufferArena.free(record.fboHandle);
          }
          // The depth and stencil renderbuffers go back to their own arena (item 48).
          for (const record of depthTargets.values()) renderbufferArena.free(record.handle);
          // A multisample colour attachment is a renderbuffer and a framebuffer of
          // its own (item 80); both go back to the arenas beside the depth and
          // per-texture ones.
          for (const record of multisampleColours.values()) {
            renderbufferArena.free(record.handle);
            framebufferArena.free(record.fboHandle);
          }
          // A multiple-target pass allocated a framebuffer of its own (item 47); it
          // goes back to the arena beside the per-texture ones.
          for (const plan of plans) if (plan.mrtFbo !== null) framebufferArena.free(plan.mrtFbo);
          for (const program of new Set(plans.map((plan) => plan.program))) gl.deleteProgram(program);
        },
      };
    },

    resize(w: number, h: number) {
      width = w;
      height = h;
      canvas.width = w;
      canvas.height = h;
    },

    async readPixels(from?: GPUTexture) {
      // The same caller mistake as `draw`'s `into`: a WebGPU texture read back
      // through the WebGL 2 backend is refused by name rather than silently
      // read as this backend's own framebuffer (item 29).
      if (from !== undefined) {
        throw new Error('WebGL 2 was handed a WebGPU texture to read back, which it cannot read a frame from');
      }
      const raw = new Uint8Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, raw);
      const rows = new Uint8Array(raw.length);
      const stride = width * 4;
      for (let y = 0; y < height; y++) {
        rows.set(raw.subarray((height - 1 - y) * stride, (height - y) * stride), y * stride);
      }
      return rows;
    },

    dispose() {
      arena.free(quadHandle);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
  return backend;
}
