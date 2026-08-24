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
  UNIFORM_BUFFER: 0x8a11,
  STATIC_DRAW: 0x88e4,
  DYNAMIC_DRAW: 0x88e8,
  TRIANGLES: 0x0004,
  FLOAT: 0x1406,
  RGBA: 0x1908,
  UNSIGNED_BYTE: 0x1401,
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
      return answer && state.ceilings.includes(answer[0]) ? answer[1] : null;
    },
    getSupportedExtensions: () => state.extensions,

    createBuffer: () => ({ buffer: true }),
    deleteBuffer: () => record('deleteBuffer'),
    bindBuffer: (target: number) => record('bindBuffer', { target }),
    bufferData: (target: number, data: unknown, usage: number) =>
      record('bufferData', { target, usage, floats: data instanceof Float32Array ? [...data] : undefined }),
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
    uniform2fv: (location: { name: string }, value: number[]) =>
      record('uniform2fv', { name: location.name, value: [...value] }),
    uniform3fv: (location: { name: string }, value: number[]) =>
      record('uniform3fv', { name: location.name, value: [...value] }),
    uniform4fv: (location: { name: string }, value: number[]) =>
      record('uniform4fv', { name: location.name, value: [...value] }),

    enableVertexAttribArray: () => record('enableVertexAttribArray'),
    vertexAttribPointer: (index: number, size: number) => record('vertexAttribPointer', { index, size }),
    viewport: (x: number, y: number, width: number, height: number) => record('viewport', { x, y, width, height }),
    drawArrays: (mode: number, first: number, count: number) => record('drawArrays', { mode, first, count }),
    drawArraysInstanced: (mode: number, first: number, count: number, instances: number) =>
      record('drawArraysInstanced', { mode, first, count, instances }),

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
