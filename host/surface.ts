/**
 * The live case: a shader that runs until it is stopped.
 *
 * This is the second of the two interfaces, and it is built on the one-shot one
 * rather than beside it. What it adds is everything a page needs and a build
 * script cannot use: a loop, a clock, resizing, pixel density, pausing when
 * nobody is looking, and coming back when the graphics card is taken away.
 *
 * There is no React here. The hook that binds a surface to a component is the
 * only file in this stack that imports it.
 */
import type { BackendName, ShaderFrame, UniformValue } from '../graph/types.js';
import { createFrameRenderer, type FrameRenderer, type RendererOptions } from '../gpu/renderer.js';

export interface SurfaceOptions extends RendererOptions {
  /** Read once per frame rather than passed once, because the values a page
   * feeds a shader change while it runs: the clock, the pointer, the theme. */
  uniforms: (elapsedSeconds: number) => Record<string, UniformValue>;
  /** The floor and ceiling for pixel density, already resolved by the caller.
   * A tier decides this and a caller may only lower it. */
  dpr?: [number, number];
  /** Frames a second to aim for. Undefined draws as often as the browser
   * offers, which is what a device with room to spare should do. */
  targetFPS?: number;
  onError?: (message: string) => void;
  /** Called when the card is taken back and again when it returns, so a caller
   * can say something rather than showing a black rectangle. */
  onContextLost?: () => void;
  onContextRestored?: () => void;
  /** Called when the WebGPU device goes away for good. It is separate from a
   * lost WebGL context because the two recover differently: a WebGL context
   * comes back on the same canvas, and a device does not come back at all. The
   * caller has to build the shader again on the other backend, and it has to do
   * that on a fresh canvas, since one that has held a WebGPU context refuses a
   * WebGL 2 one afterwards. */
  onDeviceLost?: (reason: string) => void;
}

export interface Surface {
  start(): void;
  stop(): void;
  /**
   * Swaps the shader without taking the canvas with it.
   *
   * A canvas hands back the same graphics context for as long as it exists, and
   * disposing a surface loses that context on purpose, so building a second
   * surface over the first leaves it drawing into a dead one. Nothing reports
   * that: the draw calls are accepted and the picture stops moving. Anything
   * that changes a shader while the page stays put comes through here.
   *
   * A source that will not compile leaves the last one that did still drawing
   * and its message is returned, because a reader editing a shader wants the
   * error and the picture rather than a blank rectangle. Null means the swap
   * took.
   */
  setArtefact(next: ShaderFrame): string | null;
  /** Which of the names the artefact on screen declares the program has nowhere
   * to put, which is empty while there is nothing drawing. */
  unreached(names: string[]): string[];
  /** In CSS pixels. What the drawing buffer becomes is this times the resolved
   * density, which is the only place that multiplication happens. */
  resize(width: number, height: number): void;
  dispose(): void;
  readonly running: boolean;
  /** Which backend was actually built, as opposed to which one was asked for.
   * A caller says this on the page, and saying what was predicted rather than
   * what happened is how a fallback goes unnoticed. */
  readonly backend: BackendName;
}

/** The density to draw at: what the screen offers, held between the floor and
 * the ceiling the tier allows. */
export function resolveDensity(dpr: [number, number] | undefined, offered: number): number {
  if (!dpr) return offered;
  return Math.min(Math.max(offered, dpr[0]), dpr[1]);
}

export async function createSurface(
  canvas: HTMLCanvasElement,
  artefact: ShaderFrame,
  options: SurfaceOptions
): Promise<Surface | null> {
  let current = artefact;
  // What was drawing before the last swap, kept because a refusal can arrive
  // after the swap has been accepted. One backend answers whether a source
  // compiles from the call that compiles it and the other answers a moment
  // later, so the only way to leave a reader the picture they had is to be able
  // to go back to it. It cannot be the artefact that was last drawn without
  // throwing: a WebGPU draw of a module that did not compile throws nothing, so
  // that reading would call the refused one good and keep drawing it.
  let before = artefact;

  // A refusal is not a surface that failed. The context is fine and the picture
  // is still there, so it goes to the caller's refusal handler where there is
  // one: a caller that treats it as a failure takes its own canvas off the page,
  // and a canvas that leaves takes the graphics context with it.
  const onRefusedLate = (message: string) => {
    current = before;
    (options.onRefused ?? options.onError)?.(message);
  };

  let renderer: FrameRenderer | null = await createFrameRenderer(canvas, { ...options, onRefused: onRefusedLate });
  if (!renderer) return null;

  let width = canvas.clientWidth || canvas.width;
  let height = canvas.clientHeight || canvas.height;
  let handle = 0;
  let running = false;
  let lost = false;

  // The clock only advances while the surface is running, so a shader that was
  // paused comes back where it stopped rather than jumping forward by however
  // long the reader was on another tab.
  let elapsed = 0;
  let last = 0;
  const interval = options.targetFPS ? 1000 / options.targetFPS : 0;
  let due = 0;

  const applySize = () => {
    const density = resolveDensity(options.dpr, typeof window === 'undefined' ? 1 : window.devicePixelRatio);
    renderer?.resize(Math.round(width * density), Math.round(height * density));
  };
  applySize();

  const drawOne = () => {
    if (!renderer || lost) return;
    try {
      renderer.draw(current, options.uniforms(elapsed));
    } catch (e) {
      options.onError?.(String((e as Error).message ?? e));
      stop();
    }
  };

  const tick = (now: number) => {
    if (!running) return;
    handle = requestAnimationFrame(tick);
    if (last === 0) last = now;
    const delta = now - last;
    last = now;
    elapsed += delta / 1000;

    // A frame is skipped rather than delayed, because sleeping until the next
    // one due would hold the thread and a skipped frame costs nothing.
    if (interval) {
      due += delta;
      if (due < interval) return;
      due = due % interval;
    }
    drawOne();
  };

  function start() {
    if (running || lost) return;
    running = true;
    last = 0;
    handle = requestAnimationFrame(tick);
  }

  function stop() {
    running = false;
    if (handle) cancelAnimationFrame(handle);
    handle = 0;
  }

  // A lost context is not an error state to report and leave: the card can be
  // taken back on sleep or a driver update, and the alternative is a black
  // rectangle where the page should be.
  const onLost = (event: Event) => {
    event.preventDefault();
    lost = true;
    stop();
    renderer?.dispose();
    renderer = null;
    options.onContextLost?.();
  };

  const onRestored = () => {
    lost = false;
    void createFrameRenderer(canvas, { ...options, onRefused: onRefusedLate }).then((rebuilt) => {
      // The dispose in onLost may have run again while the backend was loading,
      // so a restore that is no longer wanted throws its renderer away rather
      // than starting a loop the surface has already been told to stop.
      if (lost) {
        rebuilt?.dispose();
        return;
      }
      renderer = rebuilt;
      if (!renderer) {
        options.onError?.('the graphics card came back and would not give a context');
        return;
      }
      applySize();
      options.onContextRestored?.();
      start();
    });
  };

  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);

  // A device can be taken back on sleep, on a driver update, or under pressure
  // from other tabs, and nothing on the canvas fires when it happens. The
  // promise resolving is the only report there is.
  let gone = false;
  void options.device?.lost.then((info) => {
    if (gone) return;
    gone = true;
    lost = true;
    stop();
    renderer?.dispose();
    renderer = null;
    options.onDeviceLost?.(info.reason);
  });

  return {
    backend: renderer.backend,
    get running() {
      return running;
    },
    start,
    stop,
    setArtefact(next) {
      if (next === current) return null;
      const previous = current;
      current = next;
      before = previous;
      if (!renderer || lost) return null;
      // Compiling happens on the first draw rather than here, so the new source
      // is drawn straight away: it is the only way to find out whether it
      // compiled, and a paused surface would otherwise keep the old picture with
      // no error to show for it.
      try {
        renderer.draw(next, options.uniforms(elapsed));
        return null;
      } catch (e) {
        current = previous;
        return String((e as Error).message ?? e);
      }
    },
    unreached(names) {
      if (!renderer || lost) return [];
      try {
        return renderer.unreached(current, names);
      } catch {
        // A source that will not compile has no program to ask, and the caller
        // already has the refusal from the draw that failed.
        return [];
      }
    },

    resize(w, h) {
      width = w;
      height = h;
      applySize();
      // Redrawn straight away, because a canvas resized while paused would
      // otherwise show the old frame stretched until something starts it.
      if (!running) drawOne();
    },
    dispose() {
      stop();
      gone = true;
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      renderer?.dispose();
      renderer = null;
    },
  };
}
