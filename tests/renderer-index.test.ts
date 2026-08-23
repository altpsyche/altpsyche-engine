import { describe, expect, it } from 'vitest';
import { createFrameRenderer, PROGRAM_CACHE_LIMIT } from '@altpsyche/engine';
import { wgslFrame } from '@altpsyche/engine';
import type { ShaderFrame } from '@altpsyche/engine';
import { createFakeGPU, paddedFrame } from './support/fake-gpu';

/**
 * What the one-shot renderer does today, written down before a frame stops being
 * one draw.
 *
 * It is measured through the WebGPU path because that is the one a stand-in can
 * answer for: jsdom hands back no WebGL 2 context at all, so the other backend
 * has nothing to be built over here and the browser gates are what hold it.
 *
 * The program cache is most of what this file is. Compiling is nearly the whole
 * cost of a frame that draws one triangle, so a build script rendering six frames
 * of one shader must compile it once, and a reader editing that shader must not
 * be handed back the program they have just replaced.
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
const artefact = (over: { id?: string; code?: string } = {}): ShaderFrame =>
  wgslFrame(over.id ?? 'fixture', over.code ?? CODE, BLOCK, UNIFORMS);

/** A renderer over a recording device, with the trace it writes to. */
async function rendererOver({ connected = false } = {}) {
  const gpu = createFakeGPU({ connected });
  const renderer = await createFrameRenderer(gpu.canvas, { backend: 'webgpu', device: gpu.device });
  if (!renderer) throw new Error('the fake canvas gave no renderer');
  return { gpu, renderer };
}

describe('which backend it builds', () => {
  it('names the one it built rather than the one that was asked for', async () => {
    const { renderer } = await rendererOver();
    expect(renderer.backend).toBe('webgpu');
  });

  it('gives nothing back for WebGPU with no device, rather than WebGL 2 without saying so', async () => {
    const gpu = createFakeGPU();
    expect(await createFrameRenderer(gpu.canvas, { backend: 'webgpu' })).toBeNull();
    // Naming WebGPU without a device is a caller that skipped the step where the
    // backend is chosen, so nothing is asked of the canvas at all. Reading the
    // null alone would not say that: jsdom gives no WebGL 2 context either, so a
    // quiet fallback would come back null as well.
    expect(gpu.calls('getContext')).toHaveLength(0);
  });

  it('gives nothing back when the canvas has no context to give', async () => {
    const canvas = { getContext: () => null } as unknown as HTMLCanvasElement;
    expect(await createFrameRenderer(canvas, { backend: 'webgpu', device: createFakeGPU().device })).toBeNull();
  });
});

describe('the programs it keeps', () => {
  it('compiles one shader once however many frames are drawn from it', async () => {
    const { gpu, renderer } = await rendererOver();
    const one = artefact();

    renderer.draw(one, { u_time: 1 });
    renderer.draw(one, { u_time: 2 });
    renderer.draw(one, { u_time: 3 });

    expect(gpu.calls('createRenderPipeline')).toHaveLength(1);
    // The draw is recorded into a bundle once, and each frame replays it, so what
    // grows with the frame count is the replay rather than the draw.
    expect(gpu.calls('draw')).toHaveLength(1);
    expect(gpu.calls('executeBundles')).toHaveLength(3);
  });

  it('compiles again for an edit of the same length, since the key is the whole source', async () => {
    const { gpu, renderer } = await rendererOver();
    const before = '@fragment fn fragMain() -> @location(0) vec4<f32> { return vec4<f32>(1.0); }';
    const after = '@fragment fn fragMain() -> @location(0) vec4<f32> { return vec4<f32>(0.5); }';
    expect(after).toHaveLength(before.length);

    renderer.draw(artefact({ code: before }), {});
    renderer.draw(artefact({ code: after }), {});

    expect(gpu.calls('createRenderPipeline')).toHaveLength(2);
  });

  it('keeps a program per shader rather than one at a time', async () => {
    const { gpu, renderer } = await rendererOver();
    const one = artefact({ id: 'one' });
    const other = artefact({ id: 'other' });

    renderer.draw(one, {});
    renderer.draw(other, {});
    renderer.draw(one, {});

    expect(gpu.calls('createRenderPipeline')).toHaveLength(2);
  });

  it('builds the program to answer what the shader declares and nothing reads', async () => {
    const { gpu, renderer } = await rendererOver();

    expect(renderer.unreached(artefact(), ['u_time', 'u_nowhere'])).toEqual(['u_nowhere']);
    expect(gpu.calls('createRenderPipeline')).toHaveLength(1);
  });
});

describe('the programs it lets go', () => {
  // A distinct source each time, which is what a reader compiling edits produces.
  const edit = (n: number) => artefact({ id: `edit-${n}` });

  it('keeps at most the limit alive, disposing the stalest as new edits arrive', async () => {
    const { gpu, renderer } = await rendererOver();
    const runLength = PROGRAM_CACHE_LIMIT + 4;

    for (let n = 0; n < runLength; n++) renderer.draw(edit(n), {});

    // Every distinct edit compiled once, so the run's card memory would be the
    // whole run's worth of programs if nothing were let go.
    expect(gpu.calls('createRenderPipeline')).toHaveLength(runLength);
    // Four edits pushed past the limit, so four programs were disposed while the
    // run was still going, each handing back its own uniform buffer. Before the
    // limit this count was 0 until the renderer itself was disposed.
    expect(gpu.calls('buffer.destroy')).toHaveLength(4);
  });

  it('recompiles a source that has been evicted, and does not for one still kept', async () => {
    const { gpu, renderer } = await rendererOver();
    for (let n = 0; n <= PROGRAM_CACHE_LIMIT; n++) renderer.draw(edit(n), {});
    const compiledDuringRun = gpu.calls('createRenderPipeline').length;

    // The most recent edit is still warm.
    renderer.draw(edit(PROGRAM_CACHE_LIMIT), {});
    expect(gpu.calls('createRenderPipeline')).toHaveLength(compiledDuringRun);

    // The first edit was the stalest when the last one pushed past the limit, so
    // it is gone and asking for it compiles again.
    renderer.draw(edit(0), {});
    expect(gpu.calls('createRenderPipeline')).toHaveLength(compiledDuringRun + 1);
  });

  it('keeps a re-drawn source fresh, so the next eviction takes an older one', async () => {
    const { gpu, renderer } = await rendererOver();
    // Fill exactly to the limit, which evicts nothing yet.
    for (let n = 0; n < PROGRAM_CACHE_LIMIT; n++) renderer.draw(edit(n), {});
    expect(gpu.calls('buffer.destroy')).toHaveLength(0);

    // Touch the oldest, which moves it to the back of the recency order.
    renderer.draw(edit(0), {});
    // One more distinct edit pushes past the limit and evicts the new stalest,
    // which is edit 1 rather than edit 0.
    renderer.draw(edit(PROGRAM_CACHE_LIMIT), {});
    const after = gpu.calls('createRenderPipeline').length;

    renderer.draw(edit(0), {});
    expect(gpu.calls('createRenderPipeline')).toHaveLength(after);
    renderer.draw(edit(1), {});
    expect(gpu.calls('createRenderPipeline')).toHaveLength(after + 1);
  });
});

describe('drawing against reading', () => {
  it('leaves the pixels on the canvas when it is only asked to draw', async () => {
    const { gpu, renderer } = await rendererOver();
    renderer.draw(artefact(), { u_time: 1 });

    expect(gpu.calls('draw')).toHaveLength(1);
    expect(gpu.calls('copyTextureToBuffer')).toHaveLength(0);
  });

  it('draws and reads in the same step when a frame is asked for', async () => {
    const { gpu, renderer } = await rendererOver();
    renderer.resize(4, 3);
    gpu.mapped = paddedFrame(4, 3);

    const pixels = await renderer.frame(artefact(), { u_time: 1 });

    expect(gpu.calls('draw')).toHaveLength(1);
    expect(gpu.calls('copyTextureToBuffer')).toHaveLength(1);
    expect(pixels).toHaveLength(4 * 3 * 4);
  });

  it('writes the values it was handed before it draws', async () => {
    const { gpu, renderer } = await rendererOver();
    renderer.draw(artefact(), { u_time: 3, u_resolution: [7, 9] });

    expect([...gpu.written()!]).toEqual([3, 0, 7, 9]);
  });
});

describe('what it gives back when it is done', () => {
  it('destroys every program it kept and takes the backend with it', async () => {
    const { gpu, renderer } = await rendererOver();
    renderer.draw(artefact({ id: 'one' }), {});
    renderer.draw(artefact({ id: 'other' }), {});

    renderer.dispose();

    expect(gpu.calls('buffer.destroy')).toHaveLength(2);
    expect(gpu.calls('texture.destroy')).toHaveLength(1);
  });

  it('compiles again after a dispose rather than handing back a dead program', async () => {
    const { gpu, renderer } = await rendererOver();
    const one = artefact();
    renderer.draw(one, {});
    renderer.dispose();
    renderer.draw(one, {});

    expect(gpu.calls('createRenderPipeline')).toHaveLength(2);
  });
});
