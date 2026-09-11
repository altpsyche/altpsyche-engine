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
import type { BackendName, FrameGraph, UniformValue } from '../graph/types.js';
import { createFrameRenderer, submit, type FrameRenderer, type RendererOptions } from '../gpu/renderer.js';

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

/**
 * **A live surface has `read(): Promise<Uint8Array | null>`** (decided item 17
 * step 1, built step 2, both 2026-09-11). RGBA, top row first, the same bytes
 * and the same order `FrameRenderer.frame` hands back, because that is what it
 * calls.
 *
 * **Step 1 wrote this signature as `Promise<Uint8Array>` and step 2 narrowed
 * it.** A surface whose card has been taken back has no pixels to give, and the
 * two answers available were a throw and a null. Null, on this file's own
 * precedent: `createSurface` answers null when there is no renderer and
 * `setGraph` answers null rather than throwing, and a buffer of zeroes would be
 * the third answer and the only dishonest one. `null` means the card is gone,
 * not that the frame was black.
 *
 * **The alternative was to add no name at all**: expose the `FrameRenderer` this
 * surface holds and let a caller reach `frame` on it, which is a readback that
 * already exists and costs one accessor. **Refused, and not on the general
 * ground that it hands out a lifetime.** It hands out a reference this file
 * invalidates on its own schedule. The renderer is a `let`, and three paths
 * below move it: `onLost` disposes it and sets it to null, `onRestored` builds a
 * second one and assigns that, and `dispose` nulls it. A caller that took the
 * renderer and held it across a `webglcontextlost` is holding a disposed object,
 * and one that held it across the restore is holding the renderer that is no
 * longer drawing this canvas — with nothing on either to say so, since neither
 * knows it was handed out. The accessor's saving is one name on the door; its
 * cost is a silently wrong object in the one case this file exists to survive.
 * A method that reads the renderer at call time cannot be stale, because there
 * is no window between reading it and using it.
 *
 * **It writes no readback of its own.** The row-stride arithmetic has one home
 * and keeps it: `Backend.readPixels`, declared at `graph/types.ts` and
 * implemented once per backend, which `FrameRenderer.frame` at
 * [gpu/renderer.ts](../gpu/renderer.ts) is already the only caller of. `read()`
 * is a fourth caller of that same path and not a second copy of it.
 *
 * **How to reverse it.** Delete the member and its implementation. A caller
 * wanting pixels goes back to what it does today, which is to build a second
 * renderer over a second canvas and draw the frame twice — and on WebGL 2 it
 * cannot reuse the first canvas to do it, for the reason item 14 is about.
 * Nothing else in this package reads it.
 *
 * **What would change the answer.** If reading back ever requires stopping the
 * loop and re-entering it, `read()` is a control operation wearing a reading's
 * name and the readback belongs on the renderer after all. It does not today:
 * `frame` draws and reads against the backend's own target in one step, so
 * `read()` draws one extra frame at the current clock and the next tick redraws
 * over it. A backend that could only read the composited drawable would change
 * that, and the WebGPU path is the one to watch — its canvas context is
 * configured `RENDER_ATTACHMENT | COPY_DST` and only the backend's own target
 * carries `COPY_SRC`.
 *
 * **What it costs, and the number is quoted rather than re-taken.** Drawing then
 * reading measured 5.0 ms a frame against 1.9 to 2.5 drawing, on one fullscreen
 * shader at 1200x750. That reading is carried on `FrameRenderer.frame` and is
 * dated; no unattended session can take it again.
 */
export interface Surface {
  start(): void;
  stop(): void;
  /**
   * Swaps the shader without rebuilding the renderer under it.
   *
   * **This paragraph used to say that disposing a surface loses the canvas's
   * graphics context on purpose, so a second surface over the first drew into a
   * dead one. That stopped being true on 2026-09-11** (item 14): the WebGL 2
   * backend's `dispose` no longer calls `loseContext`, and the reason is written
   * where that call was. So this is no longer the only way to change a shader
   * without ruining the canvas.
   *
   * It is still the way to prefer, and now for a plainer reason: tearing a surface
   * down and building another rebuilds the backend, recompiles every program and
   * drops the frame loop, where this swaps the graph and keeps all three. What it
   * is not any more is a workaround for a destroyed context.
   *
   * **What `dispose` does to a canvas is not written here any more.** It is in
   * `docs/ARCHITECTURE.md`'s three lifetimes, which is where the rule belongs —
   * the canvas is the caller's and is not one of the three — and in
   * `docs/API.md` where a caller reads. A fact about every renderer stated only on
   * one method's workaround is a fact nobody finds.
   *
   * A source that will not compile leaves the last one that did still drawing
   * and its message is returned, because a reader editing a shader wants the
   * error and the picture rather than a blank rectangle. Null means the swap
   * took.
   */
  setGraph(next: FrameGraph): string | null;
  /** The pixels this surface is showing, RGBA with the top row first. Draws one
   * frame at the clock's current value and reads that one back, so what comes
   * back is the picture as of the call rather than whatever the last tick left.
   *
   * **It costs a stall the caller waits on** — measured on one full-screen
   * shader at 1200x750, drawing is 1.9 to 2.5 ms a frame and drawing then
   * reading is 5.0. A loop is not the place to call this from.
   *
   * Null means the graphics card has been taken back or the surface has been
   * disposed, so there is nothing to read. See the decision above for why this
   * is a method and not an accessor onto the renderer underneath. */
  read(): Promise<Uint8Array | null>;
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
  graph: FrameGraph,
  options: SurfaceOptions
): Promise<Surface | null> {
  let current = graph;
  // What was drawing before the last swap, kept because a refusal can arrive
  // after the swap has been accepted. One backend answers whether a source
  // compiles from the call that compiles it and the other answers a moment
  // later, so the only way to leave a reader the picture they had is to be able
  // to go back to it. It cannot be the graph that was last drawn without
  // throwing: a WebGPU draw of a module that did not compile throws nothing, so
  // that reading would call the refused one good and keep drawing it.
  let before = graph;

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
      submit(renderer, current, options.uniforms(elapsed));
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
    setGraph(next) {
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
        submit(renderer, next, options.uniforms(elapsed));
        return null;
      } catch (e) {
        current = previous;
        return String((e as Error).message ?? e);
      }
    },
    async read() {
      // Read off the `let` at call time rather than closed over, which is the
      // whole reason this is a method: between a context loss and the restore
      // that follows it, the renderer this surface holds is a different object
      // or none at all, and a caller that had been handed one would not know.
      if (!renderer || lost) return null;
      // `frame` draws and reads in one step, so this does not stop the loop or
      // re-enter it — it puts one extra frame through at the current clock and
      // the next tick draws over it. The row-stride arithmetic that makes the
      // top row first is `Backend.readPixels`'s and is not repeated here.
      return await renderer.frame(current, options.uniforms(elapsed));
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
