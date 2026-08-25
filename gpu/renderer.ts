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
import type { BackendName, DeviceReport, FrameGraph, UniformValue } from '../graph/types.js';
import { frameKey } from '../pipeline/cache.js';

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
   * browser to keep finished frames around. RGBA, top row first.
   *
   * `into` lands the frame in a caller-supplied texture and reads that one back,
   * so a capture reads its own texture with the row-stride arithmetic owned in
   * the library rather than in the consumer (§17 decision 7, item 29). Absent,
   * it reads the backend's own target, exactly as before. */
  frame(shader: FrameGraph, uniforms: Record<string, UniformValue>, into?: GPUTexture): Promise<Uint8Array>;
  /** Draws and leaves the pixels on the canvas for the browser to composite.
   * Reading them back costs a stall the caller waits on: measured on one
   * full-screen shader at 1200x750, drawing is 1.9 to 2.5 ms a frame and
   * drawing then reading is 5.0. A loop that shows its frames rather than
   * collecting them wants this one.
   *
   * `into` lands the frame in a caller-supplied texture as well as the canvas —
   * an XR layer's target the compositor consumes, drawn without a read-back
   * stall (item 29). Absent, the frame lands only in the target and the canvas. */
  draw(shader: FrameGraph, uniforms: Record<string, UniformValue>, into?: GPUTexture): void;
  /** What the device behind this backend says about itself, which is every
   * ceiling it names and every optional part of its API it has. It is here
   * because a caller deciding whether a frame is drawable at all reads a ceiling
   * rather than a picture, and a caller that had to reach a backend to ask would
   * be reaching past the only path this library offers. */
  report(): DeviceReport;
  resize(width: number, height: number): void;
  dispose(): void;
}

export interface SubmitOptions {
  /** Where the frame lands, per §17 decision 7: the caller's target, not the
   * library's. Absent, the frame lands in the backend's own target — and, on the
   * live path, the canvas the browser composites — exactly as a bare draw does.
   * A caller that owns an XR layer's texture or a capture target names it here. */
  into?: GPUTexture;
}

/**
 * The top-level primitive §17 decision 7 names: land one frame on the card.
 *
 * The consumer owns the frame loop and calls this once per frame; `createSurface`
 * is a convenience built over it, not a rival to it. It is a free function rather
 * than a method because the primitive is the thing named on the door — a loop the
 * caller drives reaches the card through `submit(renderer, graph, uniforms)`,
 * where `renderer` is the engine that holds the chosen backend and the pipeline
 * cache. `{ into }` is where the frame lands; the loop is not the library's.
 *
 * It reaches the card through `FrameRenderer.draw`, the interface that already
 * owns the backend, so the primitive adds a name and a landing target and takes
 * nothing away: `ShaderProgram` is untouched and the readback door is elsewhere
 * (the arena's, per §9), because a frame that lands and a buffer that is read are
 * two lifetimes and this is only the first.
 */
export function submit(
  renderer: FrameRenderer,
  graph: FrameGraph,
  uniforms: Record<string, UniformValue>,
  options: SubmitOptions = {}
): void {
  renderer.draw(graph, uniforms, options.into);
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
    const { createWebGPUBackend } = await import('./webgpu.js');
    backend = createWebGPUBackend(canvas, options.device, options.onRefused);
  } else {
    const { createWebGL2Backend } = await import('./webgl2.js');
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
  const programs = new Map<string, ReturnType<typeof backend.program>>();
  // Keyed on everything the compiled program is built from, which is `frameKey`'s
  // to decide: a program bakes in the frame's pipelines, resources and passes —
  // the pipeline state it compiles, the uniform block it lays a buffer out for, the
  // geometry bytes it fills a vertex buffer with, the passes it records — so two
  // frames equal in id and module text but differing in any of those are two
  // distinct programs, and a key that stopped at id and text would hand the second
  // frame the first's program and draw the wrong picture in silence. That key lives
  // in `pipeline/`, the module that owns pipeline structure, rather than inline
  // here: it composes the structure key of each pipeline with the resident and
  // per-frame data the program also bakes in, superseding item 2's narrower inline
  // fix. A false miss only recompiles; a false *hit* — two different frames sharing
  // a key — is what `frameKey` exists to make impossible.
  //
  // Held against the frame object so the live loop, which redraws one unchanged
  // frame every tick, builds this string once rather than every frame: a frame is a
  // fresh object per edit and its fields never change after it is made, so its
  // identity is enough to key the string by.
  const keys = new WeakMap<FrameGraph, string>();
  const key = (shader: FrameGraph) => {
    const held = keys.get(shader);
    if (held !== undefined) return held;
    const built = frameKey(shader);
    keys.set(shader, built);
    return built;
  };

  const programFor = (shader: FrameGraph) => {
    const k = key(shader);
    const cached = programs.get(k);
    if (cached) {
      programs.delete(k);
      programs.set(k, cached);
      return cached;
    }
    const program = backend.program(shader);
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

  const drawOne = (shader: FrameGraph, uniforms: Record<string, UniformValue>, into?: GPUTexture) => {
    const program = programFor(shader);
    program.setUniforms(uniforms);
    program.draw(into);
  };

  return {
    backend: backend.name,

    async frame(shader, uniforms, into) {
      drawOne(shader, uniforms, into);
      return await backend.readPixels(into);
    },

    draw(shader, uniforms, into) {
      drawOne(shader, uniforms, into);
    },

    report() {
      return backend.report();
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
