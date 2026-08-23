/**
 * The renderer. It owns neither backend and picks one.
 *
 * There are two interfaces here rather than one, and the reason is what the
 * callers want. A build script wants one frame at a given time, drawn and handed
 * back as pixels. A page wants something that runs until it is stopped and copes
 * with resizing, pixel density, going offscreen and the graphics card being
 * taken away. Handing a build script the live lifecycle gives it state it cannot
 * use and has to ignore, which is how a script ends up half driving a loop it
 * never wanted. This file is the one-shot interface, and the live one is built
 * on top of it.
 *
 * No React appears anywhere under here. Four files used to create their own
 * graphics context because the renderer lived inside a component and anything
 * outside React had to build its own, which is why one of them never injected
 * the values the others did: they were written separately and drifted.
 */
import type { BackendName, ShaderFrame, UniformValue } from './types';

/** How many compiled programs one renderer keeps warm at once. A program owns
 * a set of card resources, so a renderer that never lets one go grows its card
 * memory by one source's worth every time a reader edits and recompiles. The
 * live path draws one source at a time and never reaches this; it is the editing
 * path that accumulates, and this is the window of recent edits a reader can
 * step back to without waiting for a recompile. */
export const PROGRAM_CACHE_LIMIT = 16;

export interface FrameRenderer {
  readonly backend: BackendName;
  /** Draws and reads in the same step, which is why nothing here asks the
   * browser to keep finished frames around. RGBA, top row first. */
  frame(shader: ShaderFrame, uniforms: Record<string, UniformValue>): Promise<Uint8Array>;
  /** Draws and leaves the pixels on the canvas for the browser to composite.
   * Reading them back costs a stall the caller waits on: measured on one
   * full-screen shader at 1200x750, drawing is 1.9 to 2.5 ms a frame and
   * drawing then reading is 5.0. A loop that shows its frames rather than
   * collecting them wants this one. */
  draw(shader: ShaderFrame, uniforms: Record<string, UniformValue>): void;
  /** Which of the names this frame declares the compiled program has nowhere to
   * put. The program is built if it has not been drawn yet, since compiling is
   * the only thing that can answer it and the result is kept either way. */
  unreached(shader: ShaderFrame, names: string[]): string[];
  resize(width: number, height: number): void;
  dispose(): void;
}

export interface RendererOptions {
  /** Names the backend to use instead of the one that would be picked. It exists
   * so a measurement can compare the two, and so a problem found after release
   * can be switched off in one commit. */
  backend?: BackendName;
  /** The card, already opened. It is a parameter rather than something asked for
   * here because asking is two awaits and every caller of this builds a renderer
   * in one call. Naming `webgpu` without one is a caller that skipped the step
   * where the backend is chosen, so it gets nothing rather than WebGL 2 without
   * being told. */
  device?: GPUDevice;
  /** Told when a module that was accepted turns out not to compile. WebGPU
   * answers that question after the fact, through the module rather than by
   * throwing where it was made, so the call that built the program cannot
   * return it and a caller that only checks the return value learns nothing. A
   * WebGL 2 program reports its log from the call itself and never uses this. */
  onRefused?: (message: string) => void;
}

/**
 * One backend, named by the caller rather than worked out here.
 *
 * Which one a reader gets is answered before this, because the answer decides
 * which target gets fetched and a reader is sent one of the two. The questions
 * that answer it are whether the browser has WebGPU, whether asking it for a
 * graphics card actually returns one, and whether this shader has a WGSL
 * version. Asking for the card is part of that rather than a detail: a browser
 * was measured reporting WebGPU and then handing back nothing when asked.
 *
 * Async only because the backend is loaded on demand: each backend is a dynamic
 * import so the bundler splits the two into separate chunks and a browser fetches
 * only the one it can run, rather than shipping WebGPU code to a card-less
 * browser. Every caller already awaits the device before reaching here, so the
 * extra await costs a caller nothing.
 */
export async function createFrameRenderer(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  options: RendererOptions = {}
): Promise<FrameRenderer | null> {
  let backend;
  if (options.backend === 'webgpu') {
    if (!options.device) return null;
    const { createWebGPUBackend } = await import('./webgpu');
    backend = createWebGPUBackend(canvas, options.device, options.onRefused);
  } else {
    const { createWebGL2Backend } = await import('./webgl2');
    backend = createWebGL2Backend(canvas);
  }
  if (!backend) return null;

  // Programs are kept per frame, because a build script drawing six frames of
  // one shader would otherwise compile it six times, and compiling is most of
  // what a frame costs when the frame is one triangle.
  //
  // Insertion order stands in for recency: a program touched on a cache hit is
  // deleted and re-inserted so it moves to the back, which leaves the stalest
  // key at the front where eviction takes it. So the current shader, drawn every
  // frame, can never be the one thrown out.
  const programs = new Map<string, ReturnType<typeof backend.createProgram>>();
  // Keyed on the whole text of every document rather than on its length: two
  // edits of one shader are very often the same length, and a key that cannot
  // tell them apart hands back the program the reader has just replaced, so the
  // edit appears to do nothing.
  //
  // Held against the frame object so the live loop, which redraws one unchanged
  // frame every tick, joins that text once rather than every frame: a frame is a
  // fresh object per edit and its documents never change after it is made, so its
  // identity is enough to key the string by.
  const keys = new WeakMap<ShaderFrame, string>();
  const key = (shader: ShaderFrame) => {
    const held = keys.get(shader);
    if (held !== undefined) return held;
    const built = [shader.id, ...shader.modules.map((document) => `${document.name}\0${document.code}`)].join('\0');
    keys.set(shader, built);
    return built;
  };

  const programFor = (shader: ShaderFrame) => {
    const k = key(shader);
    const cached = programs.get(k);
    if (cached) {
      programs.delete(k);
      programs.set(k, cached);
      return cached;
    }
    const program = backend.createProgram(shader);
    programs.set(k, program);
    // Over the limit means the one just added pushed past it, so the front of
    // the map is the least recently used and its card resources are handed back
    // rather than kept alive behind a key nothing will ask for again.
    if (programs.size > PROGRAM_CACHE_LIMIT) {
      const stalest = programs.keys().next().value;
      if (stalest !== undefined) {
        programs.get(stalest)?.dispose();
        programs.delete(stalest);
      }
    }
    return program;
  };

  const drawOne = (shader: ShaderFrame, uniforms: Record<string, UniformValue>) => {
    const program = programFor(shader);
    program.setUniforms(uniforms);
    program.draw();
  };

  return {
    backend: backend.name,

    async frame(shader, uniforms) {
      drawOne(shader, uniforms);
      return await backend.readPixels();
    },

    draw(shader, uniforms) {
      drawOne(shader, uniforms);
    },

    unreached(shader, names) {
      return programFor(shader).unreached(names);
    },

    resize(width, height) {
      backend.resize(width, height);
    },

    dispose() {
      for (const program of programs.values()) program.dispose();
      programs.clear();
      backend.dispose();
    },
  };
}
