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
import type { Backend, DeviceReport, ShaderFrame, ShaderProgram, UniformValue } from './types.js';
import { componentsOf, drawsCorners, isRenderPass, moduleOf } from './types.js';
import { Arena } from '../resource/arena.js';
import type { FrameTraffic } from '../resource/arena.js';
import { drawGL2Frame } from '../submit/gl2.js';
import { PipelineCache, pipelineStructureOf } from '../pipeline/cache.js';
import { validate } from './validate.js';

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

    program(frame: ShaderFrame): ShaderProgram {
      if (frame.target !== 'glsl') throw new Error(`WebGL 2 was handed a ${frame.target} frame to draw`);
      // Every rule about the graph is checked in one place; the WebGL 2 path does
      // not reach `submit/plan.ts`, so it reads the same function directly (item
      // 19). It is a no-op for the fullscreen GLSL frames this backend draws today
      // and refuses any graph carrying the faults it names.
      validate(frame);

      // The static lifetime of §5: the linked program a shader compiles to, keyed
      // on the structure of its two documents. Scoped to this program so the linked
      // program is freed when this one is disposed, the same bound the backend held
      // before the split. A cache shared across programs, for a frame that draws the
      // same GLSL as another, needs an eviction the cache does not yet have and
      // waits on [ROADMAP.md](../docs/ROADMAP.md) item 63. What it caches is the
      // compilation alone; the uniform buffer a program feeds is resident.
      const programCache = new PipelineCache<{
        program: WebGLProgram;
        layout: Map<string, number> | null;
        size: number;
        attribute: number;
      }>();

      // One pass drawing the frame's own colour target through one pipeline is
      // the whole of what this backend implements, and it is the description a
      // shader with a GLSL target is built as. Anything above that line is
      // WebGPU's, and a shader needing it has no GLSL target for `loadArtefact`
      // to fetch, so it is refused before a program is ever asked for.
      const pass = frame.passes[0];
      const spec = pass ? frame.pipelines.find((candidate) => candidate.name === pass.pipeline) : undefined;
      if (!pass || !spec) throw new Error(`the frame for "${frame.id}" describes no pass this backend can draw`);
      if (frame.passes.length > 1) throw new Error(`the frame for "${frame.id}" runs more than one pass`);
      // Compute is the reason WebGPU is here, so it is refused by name rather
      // than approximated. The pipeline is asked as well as the pass, because a
      // pass reading as a draw while naming a compute pipeline would otherwise
      // reach the compiler as a program with no vertex half.
      if (spec.kind === 'compute' || !isRenderPass(pass)) {
        throw new Error(`the frame for "${frame.id}" runs compute work, and WebGL 2 has no compute stage`);
      }
      // The frame's own corners are the positions this backend draws, so geometry
      // out of a buffer is refused by name rather than approximated by them. Every
      // draw the pass carries is asked, since one that walks a buffer is refused
      // however many corners-draws sit beside it (item 26).
      if (!pass.draws.every(drawsCorners)) {
        throw new Error(`the frame for "${frame.id}" draws geometry of its own, and this backend has no buffer for it`);
      }
      // The frame the reader sees is the one colour this backend writes, so a
      // pipeline returning several is refused rather than having all but the
      // first thrown away, which draws and is wrong.
      if (spec.targets) {
        throw new Error(
          `the frame for "${frame.id}" writes ${spec.targets.length} colours, and this backend writes the frame alone`
        );
      }
      // One surface covering the frame has nothing behind it, so a depth test is
      // refused by name. It is asked of the pipeline rather than only of the
      // texture the attachment would need, because the state and the attachment
      // are declared apart and a pipeline testing depth is the half that says
      // the picture depends on it.
      if (spec.depth) {
        throw new Error(`the frame for "${frame.id}" tests the depth of what it draws, and this backend keeps none`);
      }
      // The uniform block is the only resource this shape has. A texture the
      // description declares is a picture that would go unwritten, which draws
      // and is wrong, so it is refused instead.
      const above = frame.resources.find((resource) => resource.kind !== 'uniform');
      if (above)
        throw new Error(`the frame for "${frame.id}" declares a ${above.kind} resource, and this backend has none`);
      // A GLSL pair is two documents and the vertex half is the shader's own, so
      // the backend's three corners are the positions it reads rather than a
      // program it supplies.
      if (spec.vertex === 'fullscreen') throw new Error(`the frame for "${frame.id}" carries no vertex document`);
      const vertexSource = moduleOf(frame, spec.vertex.module);
      const fragmentSource = moduleOf(frame, spec.fragment.module);
      if (!vertexSource || !fragmentSource)
        throw new Error(`the frame for "${frame.id}" names a document it does not carry`);

      // The static lifetime: the linked program, the block layout the driver
      // reported and the attribute slot the corners are read from. Cached by the
      // structure of the two documents, so a second frame carrying the same GLSL
      // links no second program and reads no layout twice. The link is what throws
      // on a source the driver refuses; a repeat request over a structure that
      // linked once never runs it again.
      const { program, layout, size, attribute } = programCache.resolve(
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
        return {
          program: linked,
          layout: blocks > 0 ? blockLayout(gl, linked) : null,
          size: blocks > 0 ? (gl.getActiveUniformBlockParameter(linked, 0, gl.UNIFORM_BLOCK_DATA_SIZE) as number) : 0,
          attribute: gl.getAttribLocation(linked, 'position'),
        };
        })
      );

      // What the source declared each uniform as, by name. WebGL 2 takes a
      // scalar `int` through `gl.uniform1i` and a block's `int` member as raw
      // signed words, not through the float door either takes a `float` through:
      // feeding an `int` uniform with `gl.uniform1f` is `GL_INVALID_OPERATION`
      // and the uniform keeps its default of 0, so the shader animates off a
      // number nobody delivered (item 61). The value's JavaScript shape cannot
      // say this — 3 is 3 whether the source wants a float or an int — so the
      // declared type is captured here, off the field §14 retires from the graph;
      // when `ShaderFrame.uniforms` goes (item 38), this type moves to the
      // binding or the pipeline with it.
      const declaredType = new Map(frame.uniforms.map((uniform) => [uniform.name, uniform.type]));
      const isInt = (name: string) => declaredType.get(name) === 'int';

      // The resident lifetime: one uniform buffer this program writes its values
      // into, allocated through the arena and freed on this program's dispose. The
      // scratch it is filled from is the program's own too, so a frame drawing the
      // same shader as another shares that other's linked program and neither its
      // buffer nor its scratch.
      const bytes = layout ? new Float32Array(size / 4) : null;
      // The same block seen as signed 32-bit words, for a member declared `int`.
      // std140 lays an int in the four bytes a float takes, but writing 3 as a
      // float leaves a bit pattern the driver reads back as ~4e-45 rather than 3,
      // so an int member is written through this view of the same buffer instead.
      const words = bytes ? new Int32Array(bytes.buffer) : null;
      const uboHandle = layout ? arena.allocate(() => gl.createBuffer() as WebGLBuffer) : null;
      const ubo = uboHandle === null ? null : arena.resolve(uboHandle);

      const locations = new Map<string, WebGLUniformLocation | null>();
      // The corner count of each draw the pass carries, one drawArrays apiece
      // (item 26). Every draw is corners — refused above otherwise — so each has a
      // vertex count to read.
      const vertices = pass.draws.map((draw) => (draw as { vertices: number }).vertices);
      // The instance count of each draw, aligned to `vertices` (item 28): a draw
      // covering many instances is one `drawArraysInstanced` reading that count,
      // and a draw covering one leaves it `undefined` and is a plain `drawArrays`.
      const instances = pass.draws.map((draw) => (draw as { instances?: number }).instances);

      return {
        setUniforms(values: Record<string, UniformValue>) {
          gl.useProgram(program);
          if (layout && bytes && words && ubo) {
            for (const [name, value] of Object.entries(values)) {
              const at = layout.get(name);
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
            gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, ubo);
            gl.uniformBlockBinding(program, 0, 0);
            return;
          }
          for (const [name, value] of Object.entries(values)) {
            if (!locations.has(name)) locations.set(name, gl.getUniformLocation(program, name));
            const location = locations.get(name);
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
        },

        // A block member is named in the layout the linked program reported, and a
        // loose uniform has a location or has none. Both are the compiler's
        // answer rather than the source's: a uniform no line reads is removed
        // from the program while the declaration stays in the file.
        unreached(names: string[]) {
          return names.filter((name) => (layout ? !layout.has(name) : gl.getUniformLocation(program, name) === null));
        },

        draw(into?: GPUTexture) {
          // `into` is a WebGPU texture, and a caller holding one has chosen the
          // backend it came from. Handing it here is the same class of caller
          // mistake as a frame of the wrong target, so it is refused by name
          // rather than dropped into a picture nobody captured (item 29). A
          // first-class WebGL 2 capture target is its own item, not this one.
          if (into !== undefined) {
            throw new Error('WebGL 2 was handed a WebGPU texture to draw into, which it cannot land a frame in');
          }
          drawGL2Frame({ gl, program, quad, attribute, vertices, instances, width, height });
        },

        // A frame this backend takes declares nothing but its uniform block, since
        // every other resource is refused above, so there is never a buffer here
        // to write. A caller replacing a buffer's contents is one that also reads
        // them back, and both are empty here rather than a refusal, so the same
        // call over either backend does nothing wrong on the one with no buffers.
        writeBuffer() {},

        // A frame this backend takes declares nothing but its uniform block, since
        // every other resource is refused above, so there is never a buffer here
        // to read. No words is the true answer rather than a refusal: a caller
        // asking both backends the same question gets an empty reading from the
        // one that keeps no such numbers.
        async readBuffer() {
          return new Uint32Array(0);
        },

        // A frame this backend takes runs one pass, refused above if it declares
        // more, so there is never a second pass to turn off and never an unused
        // pipeline to turn on. Changing the pass list does nothing here rather
        // than refusing it, so the same call over either backend does nothing
        // wrong on the one that draws the frame's one pass whatever it is told.
        setPasses() {},

        dispose() {
          // Both the uniform buffer and the linked program are this program's own —
          // the cache that holds the program is this program's, scoped to it — so
          // both are freed here, the buffer through the arena and the program through
          // the context, exactly as before the compilation moved behind the cache.
          if (uboHandle !== null) arena.free(uboHandle);
          gl.deleteProgram(program);
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
