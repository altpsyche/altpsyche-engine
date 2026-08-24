/**
 * The executor for the WebGL 2 backend: the one pass it draws becomes the handful
 * of context calls that issue it.
 *
 * WebGL 2 has no command encoder to record onto — a call to the context is a
 * command the moment it is made — so this is `submit/`'s whole job here: bind the
 * program the pipeline compiled and the quad the arena allocated, and draw the
 * frame's own corners. It lived inside the backend's `createProgram` until
 * [ROADMAP.md](../docs/ROADMAP.md) item 13 gave the executor its own layer; the
 * calls are unchanged by the move.
 *
 * It names no DOM object, per [RoadToPureEngine.md](../docs/RoadToPureEngine.md)
 * §7 rule 3: the context and the resources it draws with are handed in, and the
 * canvas behind the context is the backend's.
 */

/** One buffer whose slices the draws of a pass read a record apiece from, and how
 * the slices are reached: the uniform buffer the records live in, the binding
 * point its block is bound to, one record's width, and the byte offset each draw
 * reads its record from, aligned to `vertices` (item 27). This is WebGL 2's arm
 * of `Draw.perDraw` — a `bindBufferRange` before each draw where WebGPU takes a
 * dynamic offset — so a thousand draws read a thousand records from one buffer. */
export interface GL2PerDraw {
  buffer: WebGLBuffer;
  binding: number;
  size: number;
  offsets: readonly number[];
}

/** Everything the one pass needs to become draw commands: the linked program the
 * pipeline produced, the quad buffer the arena allocated, the attribute the
 * positions arrive on, the corner count of each draw the pass carries, and the
 * size to draw at. `vertices` is a list because one pass carries many draws
 * (item 26); a fullscreen frame is the list of one. `perDraw` is present where the
 * pass reads a per-draw buffer, absent where its draws read the same records.
 *
 * `instances` is aligned to `vertices`: where a draw covers many instances it is
 * that count, drawn as one `drawArraysInstanced` (item 28), and where a draw
 * covers one it is `undefined` and drawn as a plain `drawArrays` — the call every
 * fullscreen shader on the site makes. It is the same one draw either way: a card
 * makes one draw call however many instances it reads, which is why `cost()`
 * counts it as one. */
export interface GL2FrameExecution {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  quad: WebGLBuffer;
  attribute: number;
  vertices: readonly number[];
  instances?: readonly (number | undefined)[];
  width: number;
  height: number;
  perDraw?: GL2PerDraw;
}

/** Draws the frame's one pass, exactly as the backend's `draw` did before this
 * was its own layer. The program, the quad and the viewport are set once, and one
 * draw follows for each draw the pass carries. A draw covering many instances is
 * one `drawArraysInstanced` (item 28) — one draw call reading its instance count —
 * and a draw covering one is a plain `drawArrays`. Where the pass reads a
 * per-draw buffer, a `bindBufferRange` before each draw points its uniform block
 * at that draw's record, which is WebGL 2's dynamic offset (item 27); where it
 * does not, the draws read whatever the block was last bound to. */
export function drawGL2Frame(exec: GL2FrameExecution): void {
  const { gl, program, quad, attribute, vertices, instances, width, height, perDraw } = exec;
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.enableVertexAttribArray(attribute);
  gl.vertexAttribPointer(attribute, 3, gl.FLOAT, false, 0, 0);
  gl.viewport(0, 0, width, height);
  vertices.forEach((count, at) => {
    if (perDraw) {
      gl.bindBufferRange(gl.UNIFORM_BUFFER, perDraw.binding, perDraw.buffer, perDraw.offsets[at] ?? 0, perDraw.size);
    }
    const copies = instances?.[at];
    if (copies === undefined) gl.drawArrays(gl.TRIANGLES, 0, count);
    else gl.drawArraysInstanced(gl.TRIANGLES, 0, count, copies);
  });
}
