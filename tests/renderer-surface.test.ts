// @vitest-environment jsdom
//
// The one test here that needs a document. A surface adds and removes listeners on
// its canvas and reads the size the page gave it, so the double hands this file a
// real element and swaps only the context: an element the document made has real
// event and sizing behaviour, where a hand-rolled stand-in would be a double of a
// double and would agree with whatever it was written to agree with.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSurface, resolveDensity } from '@altpsyche/engine';
import { wgslFrame } from '@altpsyche/engine';
import type { FrameGraph } from '@altpsyche/engine';
import { createFakeGPU } from './support/fake-gpu';

/**
 * The live case, written down before a frame stops being one draw.
 *
 * This is the half a build script cannot use: a loop, a clock that only runs
 * while the picture does, resizing, pixel density, and coming back when the
 * graphics card is taken away. Every one of those has cost this repo a defect
 * that no picture showed, which is why they are held by calls rather than by
 * frames.
 *
 * The canvas is a real element with the recording context installed on it,
 * because a surface adds listeners to its canvas and a plain object has nowhere
 * to put them. Frames are driven by hand rather than by waiting, so a test says
 * how many frames happened instead of hoping.
 */

const BLOCK = [
  { name: 'u_time', offset: 0, size: 4 },
  { name: 'u_resolution', offset: 8, size: 8 },
];

const CODE = '@fragment fn fragMain() -> @location(0) vec4<f32> { return vec4<f32>(1.0); }';

const UNIFORMS = [
  { name: 'u_time', type: 'float' },
  { name: 'u_resolution', type: 'vec2' },
];

/** The one-pass description of the fixture, built the way the build builds one,
 * so what these assert is the renderer rather than a shape written here. */
const graph = (over: { id?: string; code?: string } = {}): FrameGraph =>
  wgslFrame(over.id ?? 'fixture', over.code ?? CODE, BLOCK, UNIFORMS);

/** The animation frame, driven by hand. The browser's own would make every test
 * below a wait, and what these measure is which frames were drawn rather than
 * how long they took. */
let pending: ((now: number) => void)[] = [];
let cancelled = 0;

function frame(at: number) {
  const due = pending;
  pending = [];
  for (const callback of due) callback(at);
}

async function surfaceOver(options: Record<string, unknown> = {}) {
  const canvas = document.createElement('canvas');
  const gpu = createFakeGPU({ over: canvas });
  const surface = await createSurface(canvas, graph(), {
    backend: 'webgpu',
    device: gpu.device,
    uniforms: (elapsed) => ({ u_time: elapsed }),
    ...options,
  });
  if (!surface) throw new Error('the canvas gave no surface');
  return { canvas, gpu, surface };
}

beforeEach(() => {
  pending = [];
  cancelled = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: (now: number) => void) => {
    pending.push(callback);
    return pending.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {
    cancelled += 1;
  });
  vi.stubGlobal('window', { devicePixelRatio: 1 });
});

afterEach(() => vi.unstubAllGlobals());

describe('the density it draws at', () => {
  it('takes what the screen offers where the tier names no bounds', async () => {
    expect(resolveDensity(undefined, 3)).toBe(3);
  });

  it('holds what the screen offers between the floor and the ceiling', async () => {
    expect(resolveDensity([1, 2], 3)).toBe(2);
    expect(resolveDensity([1.5, 2], 1)).toBe(1.5);
    expect(resolveDensity([1, 2], 1.75)).toBe(1.75);
  });
});

describe('the loop', () => {
  it('draws nothing until it is started', async () => {
    const { gpu } = await surfaceOver();
    expect(gpu.calls('draw')).toHaveLength(0);
  });

  it('draws one frame per animation frame once it is running', async () => {
    const { gpu, surface } = await surfaceOver();
    surface.start();
    frame(16);
    frame(32);

    // The draw is recorded once into a bundle and replayed each frame, so the
    // per-frame signal is the replay rather than the draw.
    expect(gpu.calls('executeBundles')).toHaveLength(2);
    expect(surface.running).toBe(true);
  });

  it('skips a frame rather than delaying it when a rate is asked for', async () => {
    const { gpu, surface } = await surfaceOver({ targetFPS: 30 });
    surface.start();
    // The first frame sets the clock, then 16ms steps against a 33ms interval:
    // one in two is due. Sleeping until the next one was due would hold the
    // thread, and a skipped frame costs nothing.
    for (const at of [0, 16, 32, 48, 64, 80]) frame(at);

    expect(gpu.calls('executeBundles').length).toBeLessThan(5);
    expect(gpu.calls('executeBundles').length).toBeGreaterThan(0);
  });

  it('stops asking for frames when it is stopped', async () => {
    const { gpu, surface } = await surfaceOver();
    surface.start();
    frame(16);
    surface.stop();
    frame(32);

    expect(gpu.calls('draw')).toHaveLength(1);
    expect(surface.running).toBe(false);
    expect(cancelled).toBe(1);
  });

  it('starts once, so a second start does not run a second loop', async () => {
    const { gpu, surface } = await surfaceOver();
    surface.start();
    surface.start();
    frame(16);

    expect(gpu.calls('draw')).toHaveLength(1);
  });
});

describe('the clock', () => {
  it('advances only while the surface is running, so a pause comes back where it stopped', async () => {
    const { gpu, surface } = await surfaceOver();
    // Never a timestamp of 0: the loop reads a zero `last` as having no previous
    // frame, so a first frame stamped 0 leaves the sentinel set and the frame
    // after it is the one that starts the clock. The browser's own stamps are
    // milliseconds since the page opened and are never 0 by the time a canvas is
    // mounted, so this is what a real loop sees.
    surface.start();
    frame(100);
    frame(1100);
    surface.stop();

    // A reader spends ten seconds on another tab, and the clock does not spend
    // them: the next frame after a restart carries the delta from the restart.
    surface.start();
    frame(11000);

    const times = gpu.calls('writeBuffer').map((entry) => (entry.data as Float32Array)[0]!);
    expect(times[1]).toBeCloseTo(1, 5);
    expect(times[2]).toBeCloseTo(1, 5);
  });
});

describe('swapping the shader without taking the canvas with it', () => {
  it('draws the new source straight away, since compiling is what says it took', async () => {
    const { gpu, surface } = await surfaceOver();
    const next = graph({
      id: 'next',
      code: '@fragment fn fragMain() -> @location(0) vec4<f32> { return vec4<f32>(0.5); }',
    });

    expect(surface.setGraph(next)).toBeNull();
    expect(gpu.calls('createRenderPipeline')).toHaveLength(1);
    expect(gpu.calls('draw')).toHaveLength(1);
  });

  it('does nothing for a swap to the graph already on screen', async () => {
    const { gpu, surface } = await surfaceOver();
    const same = graph();
    surface.setGraph(same);
    const drawn = gpu.calls('draw').length;

    expect(surface.setGraph(same)).toBeNull();
    expect(gpu.calls('draw')).toHaveLength(drawn);
  });

  it('reports which declared names the program has nowhere to put', async () => {
    const { surface } = await surfaceOver();
    expect(surface.unreached(['u_time', 'u_nowhere'])).toEqual(['u_nowhere']);
  });
});

describe('resizing', () => {
  it('multiplies the CSS size by the density in one place', async () => {
    vi.stubGlobal('window', { devicePixelRatio: 3 });
    const { gpu, surface } = await surfaceOver({ dpr: [1, 2] as [number, number] });
    surface.resize(100, 50);

    // The ceiling holds it at 2, so the drawing buffer is 200 by 100 whatever
    // the screen offers above that.
    const texture = gpu.calls('createTexture').at(-1)!;
    expect(texture.size).toEqual([200, 100]);
  });

  it('redraws while paused, since the old frame would otherwise sit there stretched', async () => {
    const { gpu, surface } = await surfaceOver();
    surface.resize(64, 32);

    expect(gpu.calls('draw')).toHaveLength(1);
    expect(surface.running).toBe(false);
  });
});

describe('when the graphics card goes away', () => {
  it('stops and says so on a lost context rather than reporting an error and leaving', async () => {
    const lost = vi.fn();
    const { canvas, surface } = await surfaceOver({ onContextLost: lost });
    surface.start();
    frame(16);

    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));

    expect(lost).toHaveBeenCalled();
    expect(surface.running).toBe(false);
  });

  it('will not start again while the context is gone', async () => {
    const { canvas, gpu, surface } = await surfaceOver();
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    surface.start();
    frame(16);

    expect(surface.running).toBe(false);
    expect(gpu.calls('draw')).toHaveLength(0);
  });

  it('tells the caller a device is gone for good, because a device does not come back', async () => {
    const canvas = document.createElement('canvas');
    const gpu = createFakeGPU({ over: canvas });
    let dropped: (info: { reason: string }) => void = () => {};
    Object.defineProperty(gpu.device, 'lost', {
      value: new Promise<{ reason: string }>((resolve) => {
        dropped = resolve;
      }),
    });

    const gone = vi.fn();
    const surface = (await createSurface(canvas, graph(), {
      backend: 'webgpu',
      device: gpu.device,
      uniforms: () => ({}),
      onDeviceLost: gone,
    }))!;
    surface.start();
    dropped({ reason: 'destroyed' });
    await Promise.resolve();
    await Promise.resolve();

    expect(gone).toHaveBeenCalledWith('destroyed');
    expect(surface.running).toBe(false);
  });
});

describe('what it gives back when it is done', () => {
  it('stops the loop and takes the renderer with it', async () => {
    const { gpu, surface } = await surfaceOver();
    surface.start();
    frame(16);
    surface.dispose();
    frame(32);

    expect(surface.running).toBe(false);
    expect(gpu.calls('draw')).toHaveLength(1);
    expect(gpu.calls('texture.destroy')).toHaveLength(1);
  });

  it('leaves nothing listening on the canvas', async () => {
    const lost = vi.fn();
    const { canvas, surface } = await surfaceOver({ onContextLost: lost });
    surface.dispose();
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));

    expect(lost).not.toHaveBeenCalled();
  });
});
