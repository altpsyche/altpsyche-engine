/**
 * A stand-in for a WebGL 2 context, so the fast suite can hold the other backend
 * to its calls.
 *
 * jsdom answers `getContext('webgl2')` with null, so without this the WebGL 2
 * backend has nothing to be built over at all and every one of its behaviours is
 * held by a browser gate that cannot say which call was wrong.
 *
 * It is not held by a trace contract the way the WebGPU double is. There is
 * nothing here a real driver has to agree with call for call, because the
 * interesting answers are the driver's own: which uniforms survived, where the
 * block put them, whether a program linked. What holds those is `backends.mjs`
 * drawing the corpus on a real context. So this describes what the backend does
 * with an answer rather than claiming what the answer will be.
 */

/** The enum values this backend reads. They are the specification's own numbers
 * so a test asserting one is asserting the same thing a driver would see. */
const CONSTANTS = {
  VERTEX_SHADER: 0x8b31,
  FRAGMENT_SHADER: 0x8b30,
  COMPILE_STATUS: 0x8b81,
  LINK_STATUS: 0x8b82,
  ACTIVE_UNIFORMS: 0x8b86,
  ACTIVE_UNIFORM_BLOCKS: 0x8a36,
  UNIFORM_OFFSET: 0x8a3b,
  UNIFORM_BLOCK_DATA_SIZE: 0x8a40,
  ARRAY_BUFFER: 0x8892,
  ELEMENT_ARRAY_BUFFER: 0x8893,
  UNIFORM_BUFFER: 0x8a11,
  STATIC_DRAW: 0x88e4,
  DYNAMIC_DRAW: 0x88e8,
  TRIANGLES: 0x0004,
  FLOAT: 0x1406,
  // The index widths a drawn primitive is ordered by (item 77): `quad-grid` writes
  // uint16, so `drawElements` reads its indices as `UNSIGNED_SHORT`.
  UNSIGNED_SHORT: 0x1403,
  UNSIGNED_INT: 0x1405,
  RGBA: 0x1908,
  RGBA8: 0x8058,
  UNSIGNED_BYTE: 0x1401,
  // The names a multi-pass frame draws through: a texture bound to a unit, a
  // framebuffer a pass draws into, and the blit that shows one on the canvas
  // (item 46). Each is the specification's own number, so a test reading one
  // reads the value a driver would see.
  TEXTURE_2D: 0x0de1,
  TEXTURE0: 0x84c0,
  TEXTURE_MIN_FILTER: 0x2801,
  TEXTURE_MAG_FILTER: 0x2800,
  TEXTURE_WRAP_S: 0x2802,
  TEXTURE_WRAP_T: 0x2803,
  NEAREST: 0x2600,
  LINEAR: 0x2601,
  CLAMP_TO_EDGE: 0x812f,
  REPEAT: 0x2901,
  MIRRORED_REPEAT: 0x8370,
  FRAMEBUFFER: 0x8d40,
  READ_FRAMEBUFFER: 0x8ca8,
  DRAW_FRAMEBUFFER: 0x8ca9,
  COLOR_ATTACHMENT0: 0x8ce0,
  FRAMEBUFFER_COMPLETE: 0x8cd5,
  COLOR_BUFFER_BIT: 0x4000,
  // The buffer kind `clearBufferfv` empties, for a multiple-target pass clearing
  // each attachment through its own colour point (item 47).
  COLOR: 0x1800,
  // Depth and stencil (item 48). A renderbuffer holds the depth or the mask, since
  // nothing here samples one; it is attached to the pass's framebuffer at the point
  // its format keeps, and the state a pipeline tests under is set per pass. The
  // buffer kinds are what `clearBufferfv`/`clearBufferiv`/`clearBufferfi` empty a
  // depth or a stencil through, apart from the colour point above.
  RENDERBUFFER: 0x8d41,
  DEPTH_COMPONENT24: 0x81a6,
  STENCIL_INDEX8: 0x8d48,
  DEPTH24_STENCIL8: 0x88f0,
  DEPTH_ATTACHMENT: 0x8d00,
  STENCIL_ATTACHMENT: 0x8d20,
  DEPTH_STENCIL_ATTACHMENT: 0x821a,
  DEPTH_TEST: 0x0b71,
  STENCIL_TEST: 0x0b90,
  DEPTH: 0x1801,
  STENCIL: 0x1802,
  DEPTH_STENCIL: 0x84f9,
  // The comparisons a depth test runs, the specification's own numbers so a test
  // asserting `depthFunc` reads what a driver would see.
  NEVER: 0x0200,
  LESS: 0x0201,
  EQUAL: 0x0202,
  LEQUAL: 0x0203,
  GREATER: 0x0204,
  NOTEQUAL: 0x0205,
  GEQUAL: 0x0206,
  ALWAYS: 0x0207,
  // The stencil operations `mark` and `inside` are built from: keep what is there,
  // or replace it with the reference.
  KEEP: 0x1e00,
  REPLACE: 0x1e01,
};

/** The ceilings the report asks this context for, by the names the specification
 * gives them. The pname numbers below are this file's own rather than a driver's,
 * because the report reads a ceiling by name and nothing asserts a number: what
 * has to agree is that every name the backend asks for is a name this answers,
 * and a name missing from here comes back absent from the report.
 *
 * The values are the specification's floors for WebGL 2, so a test reading one is
 * reading the least a context may report. */
const CEILINGS: [string, number][] = [
  ['MAX_TEXTURE_SIZE', 2048],
  ['MAX_3D_TEXTURE_SIZE', 256],
  ['MAX_ARRAY_TEXTURE_LAYERS', 256],
  ['MAX_CUBE_MAP_TEXTURE_SIZE', 2048],
  ['MAX_RENDERBUFFER_SIZE', 2048],
  ['MAX_COLOR_ATTACHMENTS', 4],
  ['MAX_DRAW_BUFFERS', 4],
  ['MAX_SAMPLES', 4],
  ['MAX_VERTEX_ATTRIBS', 16],
  ['MAX_TEXTURE_IMAGE_UNITS', 16],
  ['MAX_VERTEX_TEXTURE_IMAGE_UNITS', 16],
  ['MAX_UNIFORM_BUFFER_BINDINGS', 24],
  ['MAX_UNIFORM_BLOCK_SIZE', 16384],
  ['MAX_VERTEX_UNIFORM_COMPONENTS', 1024],
  ['MAX_FRAGMENT_UNIFORM_COMPONENTS', 896],
  ['MAX_VARYING_COMPONENTS', 60],
  ['MAX_ELEMENTS_INDICES', 65536],
  ['MAX_ELEMENTS_VERTICES', 65536],
  ['UNIFORM_BUFFER_OFFSET_ALIGNMENT', 256],
];

export interface FakeGLCall {
  call: string;
  [field: string]: unknown;
}

export interface FakeGL {
  canvas: HTMLCanvasElement;
  calls: FakeGLCall[];
  of(name: string): FakeGLCall[];
  /** The attributes the backend asked the canvas for, which is where
   * `preserveDrawingBuffer` being off is decided. */
  attributes: Record<string, unknown> | undefined;
  /** What the next compile reports. A string is the log a refusal comes back
   * with. */
  compileLog: string | null;
  linkLog: string | null;
  /** The block the linked program reports, or null for a program whose uniforms
   * are loose. Offsets are in bytes, the way a driver gives them. */
  block: { name: string; offset: number }[] | null;
  blockBytes: number;
  /** Names the linked program has no location for, which is what a compiler
   * dropping an unread uniform looks like from outside. */
  missing: string[];
  /** What the next `readPixels` fills the buffer with, bottom row first, the way
   * the driver hands a frame over. */
  frame: Uint8Array | null;
  lostContext: number;
  /** The names of the ceilings this context answers, which is what the report is
   * held against: a name the backend asks for and this does not carry is absent
   * from the report rather than reported as a zero. */
  ceilings: string[];
  /** What the extension list comes back as. Empty stands for a context with
   * nothing optional, which is a real context rather than a broken one. */
  extensions: string[];
  /** Ceiling values a test overrides, by name. A device reporting a lower limit
   * than the specification's floor is what the multiple-target refusal reads
   * (item 47): set `MAX_DRAW_BUFFERS` here to make a given attachment count the
   * one that goes over. A name absent here answers with its floor above. */
  limits: Record<string, number>;
}

export function createFakeGL({ context = true } = {}): FakeGL {
  const calls: FakeGLCall[] = [];
  const state = {
    calls,
    attributes: undefined,
    compileLog: null,
    linkLog: null,
    block: null,
    blockBytes: 0,
    missing: [],
    frame: null,
    lostContext: 0,
    ceilings: CEILINGS.map(([name]) => name),
    extensions: ['EXT_color_buffer_float', 'OES_texture_float_linear'],
    limits: {},
  } as unknown as FakeGL;

  /** Each ceiling by the number the context answers it under, so a report reading
   * a name through the context and then asking for that number gets an answer
   * the same way it would off a driver. A name a test has taken out of `ceilings`
   * answers with nothing, which is what a driver does for a ceiling it does not
   * have. */
  const answers = new Map<number, [string, number]>(CEILINGS.map(([name, value], at) => [0x9000 + at, [name, value]]));
  const pnames = Object.fromEntries(CEILINGS.map(([name], at) => [name, 0x9000 + at]));

  const record = (call: string, fields: Record<string, unknown> = {}) => calls.push({ call, ...fields });

  const gl = {
    ...CONSTANTS,
    ...pnames,

    getParameter: (pname: number) => {
      const answer = answers.get(pname);
      if (!answer || !state.ceilings.includes(answer[0])) return null;
      return state.limits[answer[0]] ?? answer[1];
    },
    getSupportedExtensions: () => state.extensions,

    createBuffer: () => ({ buffer: true }),
    deleteBuffer: () => record('deleteBuffer'),
    bindBuffer: (target: number) => record('bindBuffer', { target }),
    bufferData: (target: number, data: unknown, usage: number) =>
      record('bufferData', {
        target,
        usage,
        floats: data instanceof Float32Array ? [...data] : undefined,
        // The same bytes read as signed 32-bit words, so a test can see an `int`
        // block member land as its integer value rather than the float bit
        // pattern the `floats` view reads it back as (item 61).
        words: data instanceof Float32Array ? [...new Int32Array(data.buffer)] : undefined,
        // How many bytes a geometry buffer carries, so a test can see the vertex or
        // index bytes reach the card (item 77); the block path hands a Float32Array
        // and reads it through `floats` instead.
        byteLength: (data as ArrayBufferView | undefined)?.byteLength,
      }),
    bindBufferBase: (target: number, index: number) => record('bindBufferBase', { target, index }),
    bindBufferRange: (target: number, index: number, _buffer: unknown, offset: number, size: number) =>
      record('bindBufferRange', { target, index, offset, size }),
    uniformBlockBinding: (_program: unknown, block: number, binding: number) =>
      record('uniformBlockBinding', { block, binding }),

    createShader: (type: number) => ({ type }),
    shaderSource: (shader: { type: number }, source: string) => record('shaderSource', { type: shader.type, source }),
    compileShader: () => record('compileShader'),
    deleteShader: () => record('deleteShader'),
    getShaderParameter: () => state.compileLog === null,
    getShaderInfoLog: () => state.compileLog,

    createProgram: () => ({ program: true }),
    attachShader: () => record('attachShader'),
    linkProgram: () => record('linkProgram'),
    deleteProgram: () => record('deleteProgram'),
    useProgram: () => record('useProgram'),
    getProgramInfoLog: () => state.linkLog,
    getProgramParameter: (_program: unknown, name: number) => {
      if (name === CONSTANTS.LINK_STATUS) return state.linkLog === null;
      if (name === CONSTANTS.ACTIVE_UNIFORM_BLOCKS) return state.block ? 1 : 0;
      return state.block?.length ?? 0;
    },

    getActiveUniform: (_program: unknown, at: number) => {
      const slot = state.block?.[at];
      return slot ? { name: slot.name } : null;
    },
    getUniformIndices: (_program: unknown, names: string[]) => names.map((_name, at) => at),
    getActiveUniforms: (_program: unknown, indices: number[]) => indices.map((at) => state.block?.[at]?.offset ?? -1),
    getActiveUniformBlockParameter: () => state.blockBytes,

    getAttribLocation: () => 0,
    getUniformLocation: (_program: unknown, name: string) => (state.missing.includes(name) ? null : { name }),
    uniform1f: (location: { name: string }, value: number) => record('uniform1f', { name: location.name, value }),
    uniform1i: (location: { name: string }, value: number) => record('uniform1i', { name: location.name, value }),
    uniform2fv: (location: { name: string }, value: number[]) =>
      record('uniform2fv', { name: location.name, value: [...value] }),
    uniform3fv: (location: { name: string }, value: number[]) =>
      record('uniform3fv', { name: location.name, value: [...value] }),
    uniform4fv: (location: { name: string }, value: number[]) =>
      record('uniform4fv', { name: location.name, value: [...value] }),

    enableVertexAttribArray: (index: number) => record('enableVertexAttribArray', { index }),
    vertexAttribPointer: (index: number, size: number, type: number, normalized: boolean, stride: number, offset: number) =>
      record('vertexAttribPointer', { index, size, type, normalized, stride, offset }),
    viewport: (x: number, y: number, width: number, height: number) => record('viewport', { x, y, width, height }),
    drawArrays: (mode: number, first: number, count: number) => record('drawArrays', { mode, first, count }),
    drawArraysInstanced: (mode: number, first: number, count: number, instances: number) =>
      record('drawArraysInstanced', { mode, first, count, instances }),
    // The shader's own geometry, drawn by the indices that order it (item 77): one
    // `drawElements` per draw, or one `drawElementsInstanced` reading its instance
    // count. `offset` is the byte into the index buffer the draw starts at.
    drawElements: (mode: number, count: number, type: number, offset: number) =>
      record('drawElements', { mode, count, type, offset }),
    drawElementsInstanced: (mode: number, count: number, type: number, offset: number, instances: number) =>
      record('drawElementsInstanced', { mode, count, type, offset, instances }),

    readPixels: (
      _x: number,
      _y: number,
      _width: number,
      _height: number,
      _format: number,
      _type: number,
      into: Uint8Array
    ) => {
      record('readPixels');
      if (state.frame) into.set(state.frame.subarray(0, into.length));
    },

    // Textures a pass writes and a later pass samples (item 46). The fake keeps no
    // pixels — a real driver's are `backends.mjs`'s to hold — so these record what
    // the backend asked for and hand back an object the backend can bind again.
    createTexture: () => ({ texture: true }),
    deleteTexture: () => record('deleteTexture'),
    bindTexture: (target: number) => record('bindTexture', { target }),
    activeTexture: (unit: number) => record('activeTexture', { unit }),
    texImage2D: (
      target: number,
      level: number,
      internal: number,
      width: number,
      height: number,
      border: number,
      format: number,
      type: number
    ) => record('texImage2D', { target, level, internal, width, height, format, type }),
    texParameteri: (target: number, pname: number, param: number) =>
      record('texParameteri', { target, pname, param }),

    // Framebuffers, one per texture a pass draws into, and the blit that shows a
    // texture on the canvas (item 46). `checkFramebufferStatus` answers complete,
    // since the fake attaches a texture of the right shape by construction.
    createFramebuffer: () => ({ framebuffer: true }),
    deleteFramebuffer: () => record('deleteFramebuffer'),
    bindFramebuffer: (target: number, framebuffer: unknown) =>
      record('bindFramebuffer', { target, bound: framebuffer ? 'texture' : 'canvas' }),
    framebufferTexture2D: (target: number, attachment: number) =>
      record('framebufferTexture2D', { target, attachment }),
    checkFramebufferStatus: () => CONSTANTS.FRAMEBUFFER_COMPLETE,
    blitFramebuffer: (
      sx0: number,
      sy0: number,
      sx1: number,
      sy1: number,
      dx0: number,
      dy0: number,
      dx1: number,
      dy1: number,
      mask: number,
      filter: number
    ) => record('blitFramebuffer', { sx1, sy1, dx1, dy1, mask, filter }),
    clearColor: (r: number, g: number, b: number, a: number) => record('clearColor', { r, g, b, a }),
    clear: (mask: number) => record('clear', { mask }),
    // A multiple-target pass names the fragment stage's output i to colour point i
    // and clears each attachment through its own point (item 47). The fake keeps no
    // pixels, so these record what the backend asked for.
    drawBuffers: (buffers: number[]) => record('drawBuffers', { buffers: [...buffers] }),
    clearBufferfv: (buffer: number, drawbuffer: number, values: number[]) =>
      record('clearBufferfv', { buffer, drawbuffer, values: [...values] }),
    // A depth is emptied through `clearBufferfv`'s DEPTH point, a stencil through
    // `clearBufferiv`'s STENCIL, and a combined depth-stencil through the one
    // `clearBufferfi` that takes both at once (item 48).
    clearBufferiv: (buffer: number, drawbuffer: number, values: number[]) =>
      record('clearBufferiv', { buffer, drawbuffer, values: [...values] }),
    clearBufferfi: (buffer: number, drawbuffer: number, depth: number, stencil: number) =>
      record('clearBufferfi', { buffer, drawbuffer, depth, stencil }),

    // The renderbuffer a depth or a stencil is kept in (item 48), attached to a
    // pass's framebuffer at the point its format keeps. The fake keeps no pixels —
    // a real driver's are `backends.mjs`'s to hold — so these record what the
    // backend asked for and hand back an object it can bind and attach again.
    createRenderbuffer: () => ({ renderbuffer: true }),
    deleteRenderbuffer: () => record('deleteRenderbuffer'),
    bindRenderbuffer: (target: number) => record('bindRenderbuffer', { target }),
    renderbufferStorage: (target: number, internal: number, width: number, height: number) =>
      record('renderbufferStorage', { target, internal, width, height }),
    framebufferRenderbuffer: (target: number, attachment: number) =>
      record('framebufferRenderbuffer', { target, attachment }),

    // The depth and stencil test state a pass draws under (item 48). `enable`/
    // `disable` turn each test on or off, and the funcs, masks and ops are what a
    // pipeline's `compare`/`write`/`stencil` compile to. State leaks between passes
    // on a real context, so the backend sets all of it every pass a depth frame
    // draws, which is what these record.
    enable: (cap: number) => record('enable', { cap }),
    disable: (cap: number) => record('disable', { cap }),
    depthFunc: (func: number) => record('depthFunc', { func }),
    depthMask: (flag: boolean) => record('depthMask', { flag }),
    stencilFunc: (func: number, ref: number, mask: number) => record('stencilFunc', { func, ref, mask }),
    stencilOp: (fail: number, zfail: number, zpass: number) => record('stencilOp', { fail, zfail, zpass }),
    stencilMask: (mask: number) => record('stencilMask', { mask }),

    getExtension: (name: string) =>
      name === 'WEBGL_lose_context'
        ? {
            loseContext: () => {
              state.lostContext += 1;
            },
          }
        : null,
  };

  state.canvas = {
    width: 800,
    height: 600,
    getContext(kind: string, attributes: Record<string, unknown>) {
      record('getContext', { kind });
      if (kind !== 'webgl2' || !context) return null;
      state.attributes = attributes;
      return gl;
    },
  } as unknown as HTMLCanvasElement;

  state.of = (name: string) => calls.filter((entry) => entry.call === name);

  return state;
}

/** A frame the driver hands over bottom row first, each pixel carrying the row it
 * came from, so a flip that is skipped or done twice is visible in the result. */
export function bottomUpFrame(width: number, height: number): Uint8Array {
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width * 4; x++) pixels[y * width * 4 + x] = height - y;
  }
  return pixels;
}
