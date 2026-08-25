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
  IndexResource,
  RenderPipelineSpec,
  SamplerResource,
  ShaderProgram,
  StencilMode,
  TextureResource,
  UniformValue,
  VertexResource,
} from '../graph/types.js';
import { componentsOf, drawsCorners, drawsIndirectly, isRenderPass, moduleOf } from '../graph/types.js';
import { Arena } from '../resource/arena.js';
import type { Handle } from '../resource/arena.js';
import type { GL2Geometry } from '../submit/gl2.js';
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
function modeOfTopology(gl: WebGL2RenderingContext, topology: GPUPrimitiveTopology, frameId: string, geometryName: string): number {
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
      throw new Error(`the geometry "${geometryName}" on "${frameId}" declares topology "${topology as string}", which this backend does not draw`);
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

/**
 * Where each value sits inside the uniform block, read back off the linked
 * program rather than worked out from the source. The driver decides the
 * positions, and guessing them from the declaration order produces a frame that
 * renders and is wrong.
 */
function blockLayout(gl: WebGL2RenderingContext, program: WebGLProgram) {
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(program, i);
    if (info) names.push(info.name);
  }
  const indices = gl.getUniformIndices(program, names) ?? [];
  const offsets = (gl.getActiveUniforms(program, indices, gl.UNIFORM_OFFSET) as number[]) ?? [];
  const layout = new Map<string, number>();
  names.forEach((name, i) => {
    // A name the driver did not place in the block comes back as -1, and asking
    // for more names than the block has comes back as nothing at all.
    const offset = offsets[i];
    if (offset !== undefined && offset >= 0) layout.set(name.replace(/^.*\./, '').replace(/_\d+$/, ''), offset / 4);
  });
  return layout;
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
  // the quad it shares across programs and the uniform block each program owns —
  // is allocated and freed through here, so a handle to a deleted buffer is caught
  // rather than naming whatever the context hands back next.
  const arena = new Arena<WebGLBuffer>((buffer) => gl.deleteBuffer(buffer));

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

  return {
    name: 'webgl2',
    target: 'glsl',

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

    program(frame: FrameGraph): ShaderProgram {
      if (frame.target !== 'glsl') throw new Error(`WebGL 2 was handed a ${frame.target} frame to draw`);
      // Every rule about the graph is checked in one place; the WebGL 2 path does
      // not reach `submit/plan.ts`, so it reads the same function directly (item
      // 19). It is a no-op for the fullscreen GLSL frames this backend draws today
      // and refuses any graph carrying the faults it names.
      validate(frame);

      // The resource kinds this backend keeps: the frame's one uniform block, the
      // samplers that say how a texture is read between its pixels, a colour texture
      // a pass draws and a later pass samples (the multi-pass shape of item 46), and
      // a depth or stencil attachment a pass tests against (item 48), a resident
      // texture arriving with contents of its own, uploaded once (item 78), and a
      // ladder generated off those contents (item 50). The narrower texture kinds are
      // each a later item and refused here by name: a storage texture is a compute
      // output and this backend has no compute stage, and several samples a pixel is
      // the `msaa` capability item 80 tracks. A depth or stencil attachment reaching one of
      // those refusals — a multisampled depth, say — is refused the same, which is
      // the safe direction until that item lands.
      const samplerSpecs = frame.resources.filter((resource): resource is SamplerResource => resource.kind === 'sampler');
      for (const resource of frame.resources) {
        // The uniform block, the samplers, and the vertex/index buffers of the
        // shader's own geometry (item 77) are the resource kinds this backend keeps;
        // a storage buffer is a compute output and stays refused below.
        if (resource.kind === 'uniform' || resource.kind === 'sampler') continue;
        if (resource.kind === 'vertices' || resource.kind === 'indices') continue;
        if (resource.kind !== 'texture') {
          throw new Error(`the frame for "${frame.id}" declares a ${resource.kind} resource, and this backend has none`);
        }
        if (resource.use.includes('storage')) {
          throw new Error(
            `the frame for "${frame.id}" writes "${resource.name}" as a storage texture, and this backend has no compute to fill one`
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
          throw new Error(`the frame for "${frame.id}" gives "${resource.name}" a ladder and writes it every frame`);
        }
        if (resource.mips && !resource.data && !resource.source) {
          throw new Error(`the frame for "${frame.id}" gives "${resource.name}" a ladder and no contents to build it from`);
        }
        if (resource.samples) {
          throw new Error(`the frame for "${frame.id}" keeps several samples of "${resource.name}", and this backend keeps one`);
        }
        // A texture arriving with contents is uploaded now (item 78) — but the
        // contents are a fixed-size image, so a content texture the frame's own
        // size would be thrown away and re-uploaded on every resize. That is
        // refused by name rather than silently re-run, the same refusal the WebGPU
        // backend makes for the same reason.
        if ((resource.data || resource.source) && followsFrame(resource.size)) {
          throw new Error(
            `the frame for "${frame.id}" gives "${resource.name}" contents and the frame's own size, which is thrown away on a resize`
          );
        }
      }
      const textureSpecs = frame.resources.filter((resource): resource is TextureResource => resource.kind === 'texture');
      const shown = frame.present;
      if (shown !== undefined && !textureSpecs.some((resource) => resource.name === shown)) {
        throw new Error(`the frame for "${frame.id}" shows a resource "${shown}" it does not declare`);
      }
      // A texture declared in a depth or stencil format is a renderbuffer this
      // backend tests against rather than a colour texture it draws into or samples
      // (item 48), so the two are built through different arenas. A frame the reader
      // sees is never a depth format, so the present above is a colour texture.
      const colourSpecs = textureSpecs.filter((resource) => depthStencilOf(resource.format) === null);
      const depthSpecs = textureSpecs.filter((resource) => depthStencilOf(resource.format) !== null);

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
        if (spec.vertex === 'fullscreen') throw new Error(`the frame for "${frame.id}" carries no vertex document`);
        const vertexSource = moduleOf(frame, spec.vertex.module);
        const fragmentSource = moduleOf(frame, spec.fragment.module);
        if (!vertexSource || !fragmentSource) {
          throw new Error(`the frame for "${frame.id}" names a document it does not carry`);
        }
        return programCache.resolve(
          programCache.request(pipelineStructureOf(frame, spec), () => {
            const linked = gl.createProgram();
            if (!linked) throw new Error('the context refused to make a program');
            const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource.code);
            const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource.code);
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
            // about emitting a block cannot leave a shader silently unfed.
            const blocks = gl.getProgramParameter(linked, gl.ACTIVE_UNIFORM_BLOCKS) as number;
            if (blocks > 0) gl.uniformBlockBinding(linked, 0, 0);
            return {
              program: linked,
              layout: blocks > 0 ? blockLayout(gl, linked) : null,
              size: blocks > 0 ? (gl.getActiveUniformBlockParameter(linked, 0, gl.UNIFORM_BLOCK_DATA_SIZE) as number) : 0,
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
      const textures = new Map<string, TextureRecord>();
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
      for (const spec of colourSpecs) {
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
        textures.set(spec.name, record);
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
      const depthTargets = new Map<string, DepthRecord>();
      const buildDepth = (record: DepthRecord) => {
        const { width: across, height: down } = sizeAt(record.spec.size, { width, height });
        record.width = across;
        record.height = down;
        gl.bindRenderbuffer(gl.RENDERBUFFER, renderbufferArena.resolve(record.handle));
        gl.renderbufferStorage(gl.RENDERBUFFER, record.internal, across, down);
      };
      for (const spec of depthSpecs) {
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
        depthTargets.set(spec.name, record);
        buildDepth(record);
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
      // (item 22). Cached by the geometry's name, so two passes drawing one
      // primitive upload it once. A geometry the frame does not declare, or one
      // whose index buffer it names but does not carry, is refused by name.
      const geometryHandles: Handle[] = [];
      const geometryPlans = new Map<string, GL2Geometry>();
      // How many float components one vertex attribute carries, read off the
      // format the generator wrote the bytes under. WebGL 2 reads them as floats,
      // which is every attribute the `quad-grid` primitive carries; a byte or
      // integer attribute is a later primitive's and wants a row here first.
      const componentsOfFormat = (format: string) => Number(/x(\d)/.exec(format)?.[1] ?? '1');
      const buildGeometry = (name: string): GL2Geometry => {
        const cached = geometryPlans.get(name);
        if (cached) return cached;
        const vertices = frame.resources.find(
          (resource): resource is VertexResource => resource.kind === 'vertices' && resource.name === name
        );
        if (!vertices) throw new Error(`the frame for "${frame.id}" draws "${name}", which is no geometry it declares`);
        if (!vertices.data) throw new Error(`the geometry "${name}" on "${frame.id}" arrived with no vertices to draw`);
        const vertexHandle = arena.allocate(() => gl.createBuffer() as WebGLBuffer);
        geometryHandles.push(vertexHandle);
        const vertexBuffer = arena.resolve(vertexHandle);
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertices.data, gl.STATIC_DRAW);
        arena.wrote(vertices.data.byteLength);
        let index: GL2Geometry['index'];
        if (vertices.indices !== undefined) {
          const indices = frame.resources.find(
            (resource): resource is IndexResource => resource.kind === 'indices' && resource.name === vertices.indices
          );
          if (!indices) {
            throw new Error(`the geometry "${name}" on "${frame.id}" orders itself by "${vertices.indices}", which it does not declare`);
          }
          if (!indices.data) throw new Error(`the geometry "${name}" on "${frame.id}" arrived with no indices to order it`);
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
          mode: modeOfTopology(gl, vertices.topology, frame.id, name),
        };
        geometryPlans.set(name, plan);
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
        texture: string;
      }
      interface PassPlan {
        program: WebGLProgram;
        attribute: number;
        vertices: number[];
        instances: (number | undefined)[];
        // The colours this pass writes, in the fragment stage's output order:
        // empty for a pass drawing the canvas, one for a single attachment, several
        // for multiple render targets (item 47). `clear` is what each is emptied to.
        targets: { resource: string; clear?: [number, number, number, number] }[];
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
      const attachTargets = (fbo: Handle, targets: { resource: string }[]) => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebufferArena.resolve(fbo));
        targets.forEach((target, at) => {
          const record = textures.get(target.resource) as TextureRecord;
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
        const spec = frame.pipelines.find((candidate) => candidate.name === pass.pipeline);
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
        const geometryName = spec.kind === 'render' ? spec.geometry : undefined;
        if (geometryName === undefined) {
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
            throw new Error(`the frame for "${frame.id}" mixes its own corners into the geometry "${geometryName}", which it draws from one buffer`);
          }
          if (pass.draws.some(drawsIndirectly)) {
            throw new Error(`the frame for "${frame.id}" reads "${geometryName}"'s draw counts out of a buffer, which this backend does not`);
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
          const record = textures.get(attachment.resource);
          if (!record || !record.spec.use.includes('attachment')) {
            throw new Error(`the frame for "${frame.id}" draws into "${attachment.resource}", which is no attachment it declares`);
          }
        }
        const sampled: Sampled[] = spec.bindings
          .filter((binding: BindingSpec) => binding.reads === 'sample')
          .map((binding, unit) => {
            const record = textures.get(binding.resource);
            if (!record || !record.spec.use.includes('sample')) {
              throw new Error(`the frame for "${frame.id}" samples "${binding.resource}", which is no texture it reads`);
            }
            return { unit, texture: binding.resource };
          });
        // A pass writing several colours draws through a framebuffer of its own
        // carrying all of them; one or none keeps the single-texture framebuffer or
        // the canvas it had (item 46), so only a multiple-target pass allocates one.
        const targets = colour.map((attachment) => ({ resource: attachment.resource, clear: attachment.clear }));
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
          const record = depthTargets.get(pass.depth.resource);
          if (!record) {
            throw new Error(`the frame for "${frame.id}" tests against "${pass.depth.resource}", which is no depth or stencil it declares`);
          }
          if (targets.length === 0) {
            throw new Error(`the frame for "${frame.id}" tests depth while drawing the frame directly, and a depth buffer cannot attach to the canvas`);
          }
          const fbo = targets.length === 1 ? ((textures.get(targets[0].resource) as TextureRecord).fboHandle as Handle) : (mrtFbo as Handle);
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
          geometry: geometryName === undefined ? null : buildGeometry(geometryName),
          depth: depthPlan,
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
            built.width = width;
            built.height = height;
          }
          // Each pass in turn draws into its target — a texture's framebuffer, the
          // canvas where it names none, or its own framebuffer carrying several
          // colours (item 47) — clearing it first where the pass says so, and
          // sampling any earlier pass's texture bound to a unit. This is the
          // multi-pass loop items 48 to 52 extend (item 46).
          for (const plan of plans) {
            const primary = plan.targets[0] ? (textures.get(plan.targets[0].resource) as TextureRecord) : null;
            const framebuffer =
              plan.targets.length === 0
                ? null
                : plan.targets.length === 1
                  ? framebufferArena.resolve((primary as TextureRecord).fboHandle as Handle)
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
              const source = textures.get(read.texture) as TextureRecord;
              gl.activeTexture(gl.TEXTURE0 + read.unit);
              gl.bindTexture(gl.TEXTURE_2D, textureArena.resolve(source.handle));
              const location = gl.getUniformLocation(plan.program, read.texture);
              if (location) gl.uniform1i(location, read.unit);
            }
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
            });
          }
          // The picture the frame names is shown by blitting its texture onto the
          // canvas, where the passes drew into textures rather than the canvas
          // itself. A frame whose last pass drew the canvas directly names no
          // present and needs no blit.
          if (shown !== undefined) {
            const record = textures.get(shown) as TextureRecord;
            if (record.fboHandle !== null) {
              gl.bindFramebuffer(gl.READ_FRAMEBUFFER, framebufferArena.resolve(record.fboHandle));
              gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
              gl.blitFramebuffer(0, 0, record.width, record.height, 0, 0, width, height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
            }
          }
        },

        // A frame this backend takes declares no buffer the page fills, since a
        // storage buffer is refused above, so there is never a buffer here to write
        // or read. A caller asking either does nothing and reads nothing rather
        // than being refused, so the same call over either backend does nothing
        // wrong on the one with no such buffers.
        writeBuffer() {},

        async readBuffer() {
          return new Uint32Array(0);
        },

        // Changing the pass list without rebuilding the resources under it is
        // WebGPU's `setPasses`; this backend's toy frames do not re-plan their
        // passes at runtime yet, so it does nothing rather than refusing, the same
        // as before multi-pass. A scene tier that re-plans on WebGL 2 is item 52's.
        setPasses() {},

        dispose() {
          // The uniform buffer, every texture and its framebuffer, and each linked
          // program are this program's own. The buffers and textures go back to
          // their arenas; a program two passes shared is deleted once.
          if (uboHandle !== null) arena.free(uboHandle);
          // The vertex and index buffers of the shader's own geometry go back to the
          // buffer arena beside the uniform block (item 77).
          for (const handle of geometryHandles) arena.free(handle);
          for (const record of textures.values()) {
            textureArena.free(record.handle);
            if (record.fboHandle !== null) framebufferArena.free(record.fboHandle);
          }
          // The depth and stencil renderbuffers go back to their own arena (item 48).
          for (const record of depthTargets.values()) renderbufferArena.free(record.handle);
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
}
