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

/** Everything the one pass needs to become draw commands: the linked program the
 * pipeline produced, the quad buffer the arena allocated, the attribute the
 * positions arrive on, and the size to draw at. */
export interface GL2FrameExecution {
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  quad: WebGLBuffer;
  attribute: number;
  vertices: number;
  width: number;
  height: number;
}

/** Draws the frame's one pass, exactly as the backend's `draw` did before this
 * was its own layer. */
export function drawGL2Frame(exec: GL2FrameExecution): void {
  const { gl, program, quad, attribute, vertices, width, height } = exec;
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.enableVertexAttribArray(attribute);
  gl.vertexAttribPointer(attribute, 3, gl.FLOAT, false, 0, 0);
  gl.viewport(0, 0, width, height);
  gl.drawArrays(gl.TRIANGLES, 0, vertices);
}
