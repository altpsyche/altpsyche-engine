import { describe, expect, it } from 'vitest';
import { createFrameRenderer, PROGRAM_CACHE_LIMIT } from '@altpsyche/engine';
import { missing, wgslFrame } from '@altpsyche/engine';
import type { FrameGraph } from '@altpsyche/engine';
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

/** The one-pass description of the fixture, built the way the build builds one,
 * so what these assert is the renderer rather than a shape written here. */
const graph = (over: { id?: string; code?: string } = {}): FrameGraph =>
  wgslFrame(over.id ?? 'fixture', over.code ?? CODE, BLOCK);

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
    const one = graph();

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

    renderer.draw(graph({ code: before }), {});
    renderer.draw(graph({ code: after }), {});

    expect(gpu.calls('createRenderPipeline')).toHaveLength(2);
  });

  it('keeps a program per shader rather than one at a time', async () => {
    const { gpu, renderer } = await rendererOver();
    const one = graph({ id: 'one' });
    const other = graph({ id: 'other' });

    renderer.draw(one, {});
    renderer.draw(other, {});
    renderer.draw(one, {});

    // Two programs, kept apart — each builds its own bind group over its own
    // resources. Their one shared pipeline structure (they differ only in id)
    // compiles once in the backend's shared cache (item 63), so the compilation
    // count no longer stands in for the program count; the bind group does.
    expect(gpu.calls('createBindGroup')).toHaveLength(2);
    expect(gpu.calls('createRenderPipeline')).toHaveLength(1);
  });

  it('keeps a program per resource set, not just per id and source', async () => {
    const { gpu, renderer } = await rendererOver();
    // Same id, same module text; the resources differ — the two lay their uniform
    // block out at different offsets, so a program built for one draws the other
    // with the wrong buffer under it. A key stopping at id and text would hand the
    // second frame the first's program, which is a silent wrong picture.
    const otherBlock = [
      { name: 'u_time', offset: 0, size: 4 },
      { name: 'u_resolution', offset: 16, size: 8 },
    ];
    const one = wgslFrame('same', CODE, BLOCK);
    const other = wgslFrame('same', CODE, otherBlock);
    expect(one.id).toBe(other.id);
    expect(one.modules).toEqual(other.modules);
    expect(one.resources).not.toEqual(other.resources);

    renderer.draw(one, {});
    renderer.draw(other, {});

    // Two programs, one per resource set, rather than one shared across both
    // because their id and source happened to match — each builds its own bind
    // group over its own uniform buffer. The pipeline structure is one (the block
    // layout is resident, not structural), so it compiles once in the shared cache;
    // the two programs are what keep the second's buffer from drawing under the
    // first, and the bind group count is what shows there are two.
    expect(gpu.calls('createBindGroup')).toHaveLength(2);
    expect(gpu.calls('createRenderPipeline')).toHaveLength(1);
  });

  it('answers what the shader declares and nothing reads from the source, building no program', async () => {
    const { gpu } = await rendererOver();
    // `reflect` reads the declaration off the source (item 69), so the question
    // is answered without a program: the struct declares u_time, so u_nowhere is
    // the name it has no place for, and no pipeline is compiled to say so.
    const declaring = graph({
      code: 'struct U { u_time: f32 }\n@group(0) @binding(0) var<uniform> u: U;\n@fragment fn fragMain() -> @location(0) vec4<f32> { return vec4<f32>(u.u_time); }',
    });
    expect(missing(declaring, ['u_time', 'u_nowhere'])).toEqual(['u_nowhere']);
    expect(gpu.calls('createRenderPipeline')).toHaveLength(0);
  });
});

describe('the programs it lets go', () => {
  // A distinct frame each time — a distinct id, so a distinct program — but one
  // shared pipeline structure, since the source and its layout do not change. That
  // is why building a program is counted through its own bind group below and not
  // through a pipeline compilation the shared cache now runs once for the whole run.
  const edit = (n: number) => graph({ id: `edit-${n}` });

  it('keeps at most the limit alive, disposing the stalest as new edits arrive', async () => {
    const { gpu, renderer } = await rendererOver();
    const runLength = PROGRAM_CACHE_LIMIT + 4;

    for (let n = 0; n < runLength; n++) renderer.draw(edit(n), {});

    // Each edit built its own program — its own bind group over its own buffer — so
    // the run's resident memory would be the whole run's worth if nothing were let
    // go. The one pipeline structure they share compiled once in the shared cache
    // (item 63), where a per-program cache compiled it once per edit.
    expect(gpu.calls('createBindGroup')).toHaveLength(runLength);
    expect(gpu.calls('createRenderPipeline')).toHaveLength(1);
    // Four edits pushed past the limit, so four programs were disposed while the
    // run was still going, each handing back its own uniform buffer. Before the
    // limit this count was 0 until the renderer itself was disposed.
    expect(gpu.calls('buffer.destroy')).toHaveLength(4);
  });

  it('rebuilds an evicted source’s program but reuses its warm shared pipeline', async () => {
    const { gpu, renderer } = await rendererOver();
    for (let n = 0; n <= PROGRAM_CACHE_LIMIT; n++) renderer.draw(edit(n), {});
    const builtDuringRun = gpu.calls('createBindGroup').length;
    // One structure across every edit, compiled once and held warm in the shared
    // cache whatever the program cache evicts (item 63).
    expect(gpu.calls('createRenderPipeline')).toHaveLength(1);

    // The most recent edit's program is still warm, so re-drawing it rebuilds
    // nothing.
    renderer.draw(edit(PROGRAM_CACHE_LIMIT), {});
    expect(gpu.calls('createBindGroup')).toHaveLength(builtDuringRun);

    // The first edit was the stalest when the last one pushed past the limit, so its
    // program was disposed; re-drawing it builds a new program — a fresh bind group
    // over a fresh buffer — but its pipeline is still in the shared cache, so nothing
    // recompiles. This is item 63's gain over a per-program cache, which recompiled.
    renderer.draw(edit(0), {});
    expect(gpu.calls('createBindGroup')).toHaveLength(builtDuringRun + 1);
    expect(gpu.calls('createRenderPipeline')).toHaveLength(1);
  });

  it('keeps a re-drawn source fresh, so the next eviction takes an older one', async () => {
    const { gpu, renderer } = await rendererOver();
    // Fill exactly to the limit, which evicts nothing yet.
    for (let n = 0; n < PROGRAM_CACHE_LIMIT; n++) renderer.draw(edit(n), {});
    expect(gpu.calls('buffer.destroy')).toHaveLength(0);

    // Touch the oldest, which moves its program to the back of the recency order.
    renderer.draw(edit(0), {});
    // One more distinct edit pushes past the limit and evicts the new stalest,
    // which is edit 1 rather than edit 0.
    renderer.draw(edit(PROGRAM_CACHE_LIMIT), {});
    const built = gpu.calls('createBindGroup').length;

    // edit 0 was touched, so its program is still warm and re-drawing it rebuilds
    // nothing; edit 1 was the one evicted, so re-drawing it builds a fresh program.
    // Read through the bind group, one per program, since the pipeline they share
    // compiles once and cannot tell an evicted program from a kept one (item 63).
    renderer.draw(edit(0), {});
    expect(gpu.calls('createBindGroup')).toHaveLength(built);
    renderer.draw(edit(1), {});
    expect(gpu.calls('createBindGroup')).toHaveLength(built + 1);
  });
});

describe('drawing against reading', () => {
  it('leaves the pixels on the canvas when it is only asked to draw', async () => {
    const { gpu, renderer } = await rendererOver();
    renderer.draw(graph(), { u_time: 1 });

    expect(gpu.calls('draw')).toHaveLength(1);
    expect(gpu.calls('copyTextureToBuffer')).toHaveLength(0);
  });

  it('draws and reads in the same step when a frame is asked for', async () => {
    const { gpu, renderer } = await rendererOver();
    renderer.resize(4, 3);
    gpu.mapped = paddedFrame(4, 3);

    const pixels = await renderer.frame(graph(), { u_time: 1 });

    expect(gpu.calls('draw')).toHaveLength(1);
    expect(gpu.calls('copyTextureToBuffer')).toHaveLength(1);
    expect(pixels).toHaveLength(4 * 3 * 4);
  });

  it('lands the frame in a caller-supplied texture and reads that one back', async () => {
    const { gpu, renderer } = await rendererOver();
    renderer.resize(4, 3);
    gpu.mapped = paddedFrame(4, 3);
    // The texture a consumer owns and wants the frame in — an XR layer's target,
    // or one a capture reads back — passed to the one-shot primitive rather than
    // reached for through the canvas (§17 decision 7, item 29).
    const into = gpu.device.createTexture({
      label: 'capture',
      size: [4, 3],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC,
    });

    const pixels = await renderer.frame(graph(), { u_time: 1 }, into);

    // The frame landed in the caller's texture, and the read came back out of it
    // rather than the backend's own target — with the row-stride repack owned in
    // the library, so the consumer does none.
    expect(gpu.calls('copyTextureToTexture')).toContainEqual(
      expect.objectContaining({ from: 'frame', to: 'capture' })
    );
    expect(gpu.calls('copyTextureToBuffer')[0]!.from).toBe('capture');
    expect(pixels).toHaveLength(4 * 3 * 4);
    expect([...pixels.slice(0, 16)]).toEqual(Array(16).fill(1));
  });

  it('writes the values it was handed before it draws', async () => {
    const { gpu, renderer } = await rendererOver();
    renderer.draw(graph(), { u_time: 3, u_resolution: [7, 9] });

    expect([...gpu.written()!]).toEqual([3, 0, 7, 9]);
  });

  it('lands the resize’s write before the draw that reads it, in the one tick', async () => {
    const { gpu, renderer } = await rendererOver();
    // Resize and draw with nothing between them, handing the frame the new size as
    // the resolution it reads. The write is queued against the frame and the draw
    // is what flushes it, so the double sees it land before the draw — the order
    // the executor guarantees rather than one setUniforms happened to leave.
    renderer.resize(320, 180);
    renderer.draw(graph(), { u_time: 1, u_resolution: [320, 180] });

    // u_resolution sits at byte 8, which is float 2 in the block, so the write
    // carrying the resized width is the one whose third float is 320. The read is
    // `beginRenderPass`: the recorded bundle that samples the block executes inside
    // it, so a write landing after the pass opened would be the frame reading the
    // old size. (The `draw` in the trace is the bundle being *recorded* once at
    // build time, not the frame's read of it.)
    const write = gpu.trace.findIndex(
      (entry) => entry.call === 'writeBuffer' && (entry.data as Float32Array | undefined)?.[2] === 320
    );
    const read = gpu.trace.findIndex((entry) => entry.call === 'beginRenderPass');
    expect(write).toBeGreaterThanOrEqual(0);
    expect(read).toBeGreaterThanOrEqual(0);
    expect(write).toBeLessThan(read);
  });
});

describe('what it gives back when it is done', () => {
  it('destroys every program it kept and takes the backend with it', async () => {
    const { gpu, renderer } = await rendererOver();
    renderer.draw(graph({ id: 'one' }), {});
    renderer.draw(graph({ id: 'other' }), {});

    renderer.dispose();

    expect(gpu.calls('buffer.destroy')).toHaveLength(2);
    expect(gpu.calls('texture.destroy')).toHaveLength(1);
  });

  it('compiles again after a dispose rather than handing back a dead program', async () => {
    const { gpu, renderer } = await rendererOver();
    const one = graph();
    renderer.draw(one, {});
    renderer.dispose();
    renderer.draw(one, {});

    expect(gpu.calls('createRenderPipeline')).toHaveLength(2);
  });
});

describe('what the device says about itself', () => {
  it('answers through the door rather than making a caller hold a backend', async () => {
    const { renderer } = await rendererOver();

    const said = renderer.report();

    // The ceilings and the optional parts are the device's own answers, so what
    // is held here is that they arrive at all and that they arrive shaped: a
    // caller deciding whether a frame is drawable reads a number, and a number
    // that came back undefined reads as a device with no limit.
    expect(Object.keys(said.limits).length).toBeGreaterThan(0);
    for (const value of Object.values(said.limits)) expect(typeof value).toBe('number');
    expect(Array.isArray(said.features)).toBe(true);
  });
});
