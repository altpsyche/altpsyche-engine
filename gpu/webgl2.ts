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
  RenderPipelineSpec,
  SamplerResource,
  ShaderProgram,
  TextureResource,
  UniformValue,
} from '../graph/types.js';
import { componentsOf, drawsCorners, isRenderPass, moduleOf } from '../graph/types.js';
import { Arena } from '../resource/arena.js';
import type { Handle } from '../resource/arena.js';
import { drawGL2Frame } from '../submit/gl2.js';
import { PipelineCache, pipelineStructureOf } from '../pipeline/cache.js';
import { sizeAt, followsFrame } from '../graph/refs.js';
import { validate } from '../graph/validate.js';
import { reflect } from '../toy/reflect.js';

/** A single triangle covering the frame. Two triangles would draw the diagonal
 * twice, and there is no geometry here beyond filling the screen. */
const FULLSCREEN_TRIANGLE = new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]);

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

      // The two resource kinds this backend keeps: the frame's one uniform block,
      // and the samplers that say how a texture is read between its pixels. A
      // texture is kept where a pass draws it and a later pass samples it — the
      // multi-pass shape this backend now draws (item 46) — but the narrower
      // texture kinds are each a later item and refused here by name: a storage
      // texture is a compute output and this backend has no compute stage, a ladder
      // of levels is item 50, several samples a pixel is item 48, and a texture
      // arriving with contents of its own is a resident image a scene tier uploads
      // rather than a scratch target a pass draws between two others.
      const samplerSpecs = frame.resources.filter((resource): resource is SamplerResource => resource.kind === 'sampler');
      for (const resource of frame.resources) {
        if (resource.kind === 'uniform' || resource.kind === 'sampler') continue;
        if (resource.kind !== 'texture') {
          throw new Error(`the frame for "${frame.id}" declares a ${resource.kind} resource, and this backend has none`);
        }
        if (resource.use.includes('storage')) {
          throw new Error(
            `the frame for "${frame.id}" writes "${resource.name}" as a storage texture, and this backend has no compute to fill one`
          );
        }
        if (resource.mips) {
          throw new Error(`the frame for "${frame.id}" gives "${resource.name}" a ladder of levels, and this backend generates none`);
        }
        if (resource.samples) {
          throw new Error(`the frame for "${frame.id}" keeps several samples of "${resource.name}", and this backend keeps one`);
        }
        if (resource.data || resource.source) {
          throw new Error(
            `the frame for "${frame.id}" gives "${resource.name}" contents, and this backend fills a texture only by drawing it`
          );
        }
      }
      const textureSpecs = frame.resources.filter((resource): resource is TextureResource => resource.kind === 'texture');
      const shown = frame.present;
      if (shown !== undefined && !textureSpecs.some((resource) => resource.name === shown)) {
        throw new Error(`the frame for "${frame.id}" shows a resource "${shown}" it does not declare`);
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
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, across, down, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        const filter = sampler?.filter === 'linear' ? gl.LINEAR : gl.NEAREST;
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
        const wrap = sampler ? WRAPS[sampler.wrap] : gl.CLAMP_TO_EDGE;
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
        if (record.fboHandle !== null) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, framebufferArena.resolve(record.fboHandle));
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        }
      };
      for (const spec of textureSpecs) {
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
      // The size the textures were last built at, so a resize between build and
      // draw remakes the frame-following ones before a pass reads a target of the
      // wrong size.
      const built = { width, height };

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
        target: string | null;
        clear?: [number, number, number, number];
        sampled: Sampled[];
      }
      const plans: PassPlan[] = [];
      let blockLayoutMap: Map<string, number> | null = null;
      let blockSize = 0;
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
        // The corners are the positions this backend draws, so geometry out of a
        // buffer is refused by name. Every draw is asked, since one that walks a
        // buffer is refused however many corners-draws sit beside it (item 26).
        if (!pass.draws.every(drawsCorners)) {
          throw new Error(`the frame for "${frame.id}" draws geometry of its own, and this backend has no buffer for it`);
        }
        // One colour a pass writes is the attachment it draws into (item 47 lifts
        // this to several); a pipeline returning more than one is refused rather
        // than having all but the first thrown away, which draws and is wrong.
        if (spec.targets && spec.targets.length > 1) {
          throw new Error(`the frame for "${frame.id}" writes ${spec.targets.length} colours at once, and this backend writes one`);
        }
        // Depth and stencil are item 48; a pipeline testing depth is refused by
        // name until then, asked of the pipeline because the state and the
        // attachment are declared apart and the pipeline is the half that says
        // the picture depends on it.
        if (spec.depth) {
          throw new Error(`the frame for "${frame.id}" tests the depth of what it draws, and this backend keeps none`);
        }
        const compiled = compileSpec(spec);
        if (compiled.layout && !blockLayoutMap) {
          blockLayoutMap = compiled.layout;
          blockSize = compiled.size;
        }
        // Where this pass draws: the one texture its colour attaches, or the frame
        // the reader sees where it names none. A colour naming a texture the frame
        // never declared an attachment, or more than one, is refused by name.
        const colour = isRenderPass(pass) ? pass.colour : undefined;
        if (colour && colour.length > 1) {
          throw new Error(`the frame for "${frame.id}" writes ${colour.length} colours at once, and this backend writes one`);
        }
        const attachment = colour?.[0];
        if (attachment) {
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
        plans.push({
          program: compiled.program,
          attribute: compiled.attribute,
          // The corner count of each draw the pass carries, one draw apiece (item
          // 26), and the instance count aligned to it (item 28): a draw covering
          // many instances is one `drawArraysInstanced`, one covering a single
          // instance a plain `drawArrays`.
          vertices: pass.draws.map((draw) => (draw as { vertices: number }).vertices),
          instances: pass.draws.map((draw) => (draw as { instances?: number }).instances),
          target: attachment ? attachment.resource : null,
          clear: attachment?.clear,
          sampled,
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
            built.width = width;
            built.height = height;
          }
          // Each pass in turn draws into its target — a texture's framebuffer, or
          // the canvas where it names none — clearing it first where the pass says
          // so, and sampling any earlier pass's texture bound to a unit. This is
          // the multi-pass loop items 47 to 52 extend (item 46).
          for (const plan of plans) {
            const record = plan.target === null ? null : (textures.get(plan.target) as TextureRecord);
            gl.bindFramebuffer(
              gl.FRAMEBUFFER,
              record && record.fboHandle !== null ? framebufferArena.resolve(record.fboHandle) : null
            );
            const passWidth = record ? record.width : width;
            const passHeight = record ? record.height : height;
            if (plan.clear) {
              gl.clearColor(plan.clear[0], plan.clear[1], plan.clear[2], plan.clear[3]);
              gl.clear(gl.COLOR_BUFFER_BIT);
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
          for (const record of textures.values()) {
            textureArena.free(record.handle);
            if (record.fboHandle !== null) framebufferArena.free(record.fboHandle);
          }
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
