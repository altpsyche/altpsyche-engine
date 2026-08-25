import { describe, expect, it, vi } from 'vitest';
import { createWebGPUBackend } from '../gpu/webgpu';
import { ONE_PASS, wgslFrame } from '@altpsyche/engine';
import type { FrameGraph, TextureResource } from '@altpsyche/engine';
import type { UniformSlot } from '@altpsyche/engine';
import { createFakeGPU, paddedFrame } from './support/fake-gpu';

/**
 * What the WebGPU backend does today, written down before it is reshaped.
 *
 * The device is a stand-in that records calls, because node has no WebGPU and a
 * browser gate cannot say which call was wrong: a bind group offset four bytes
 * out is a wrong picture with no line number. So these hold the calls and the
 * order, and the preset a browser gate draws holds the picture.
 *
 * Each group below is a behaviour the reshape has to keep, which is why the
 * assertions are on what reaches the device rather than on how the module is
 * written.
 */

const BLOCK = [
  { name: 'u_time', offset: 0, size: 4 },
  { name: 'u_resolution', offset: 8, size: 8 },
];

/** The fixture declares the block it claims. It has to: the binding a pipeline is
 * built at is read off the source, so a source declaring none while the frame
 * carries positions would be a shader the layout has no place for. */
const CODE = `struct Uniforms { u_time: f32, u_resolution: vec2<f32> };
@binding(0) @group(0) var<uniform> uniforms: Uniforms;

@fragment fn fragMain() -> @location(0) vec4<f32> { return vec4<f32>(uniforms.u_time); }`;

/** The same shader with nothing to bind, which is a fragment reading only its
 * pixel position. */
const NO_BLOCK = '@fragment fn fragMain() -> @location(0) vec4<f32> { return vec4<f32>(1.0); }';

const UNIFORMS = [
  { name: 'u_time', type: 'float' },
  { name: 'u_resolution', type: 'vec2' },
];

/** The one-pass description of the fixture, built the way the build builds one,
 * so what these assert is the backend rather than a shape written here. */
const graph = (
  over: { code?: string; uniformBlock?: UniformSlot[]; constants?: Record<string, number> } = {}
): FrameGraph => wgslFrame('fixture', over.code ?? CODE, over.uniformBlock ?? BLOCK, UNIFORMS, over.constants);

/** A backend over a recording device, with the trace it writes to. */
function backendOver({ connected = false } = {}) {
  const gpu = createFakeGPU({ connected });
  const backend = createWebGPUBackend(gpu.canvas, gpu.device);
  if (!backend) throw new Error('the fake canvas gave no WebGPU context');
  return { gpu, backend };
}

describe('the backend it is handed', () => {
  it('gives nothing back when the canvas has no WebGPU context', () => {
    const canvas = { getContext: () => null } as unknown as HTMLCanvasElement;
    expect(createWebGPUBackend(canvas, createFakeGPU().device)).toBeNull();
  });

  it('names itself and the language its documents are written in', () => {
    const { backend } = backendOver();
    expect(backend.name).toBe('webgpu');
    expect(backend.target).toBe('wgsl');
  });

  it('refuses a frame for the other backend by naming the target it got', () => {
    const { backend } = backendOver();
    const glsl = { id: 'x', target: 'glsl' } as FrameGraph;
    expect(() => backend.program(glsl)).toThrow('WebGPU was handed a glsl frame to draw');
  });
});

describe('the pipeline it builds', () => {
  it('writes the vertex program itself and takes the fragment from the frame', () => {
    const { gpu, backend } = backendOver();
    backend.program(graph());

    const modules = gpu.calls('createShaderModule');
    expect(modules).toHaveLength(2);
    expect(modules[0]!.code).toContain('@vertex');
    expect(modules[1]!.code).toBe(CODE);
  });

  it('starts the fragment at the entry point the build compiles, and the vertex at its own', () => {
    const { gpu, backend } = backendOver();
    backend.program(graph());

    const descriptor = gpu.calls('createRenderPipeline')[0]!.descriptor as GPURenderPipelineDescriptor;
    expect(descriptor.vertex.entryPoint).toBe('main');
    expect(descriptor.fragment?.entryPoint).toBe('fragMain');
    expect([...(descriptor.fragment?.targets ?? [])]).toEqual([{ format: 'rgba8unorm' }]);
    expect(descriptor.primitive?.topology).toBe('triangle-list');
  });

  it('hands a rung its overridable constants, and only to the stage that declares them', () => {
    const { gpu, backend } = backendOver();
    backend.program(graph({ constants: { STEPS: 32 } }));

    const descriptor = gpu.calls('createRenderPipeline')[0]!.descriptor as GPURenderPipelineDescriptor;
    expect(descriptor.fragment?.constants).toEqual({ STEPS: 32 });
    expect('constants' in descriptor.vertex).toBe(false);
  });

  it('passes no constants at all where the rung asks for the source numbers', () => {
    const { gpu, backend } = backendOver();
    backend.program(graph());

    const descriptor = gpu.calls('createRenderPipeline')[0]!.descriptor as GPURenderPipelineDescriptor;
    expect('constants' in (descriptor.fragment ?? {})).toBe(false);
  });

  it('reports a module that would not compile through the callback, with its line', async () => {
    const gpu = createFakeGPU();
    const refused = vi.fn();
    gpu.compilation = [
      { type: 'error', message: 'unresolved identifier', lineNum: 3, linePos: 7 },
      { type: 'warning', message: 'unused', lineNum: 9, linePos: 1 },
    ] as unknown as GPUCompilationMessage[];

    const backend = createWebGPUBackend(gpu.canvas, gpu.device, refused);
    backend!.program(graph());
    await Promise.resolve();
    await Promise.resolve();

    expect(refused).toHaveBeenCalledWith('line 3:7: unresolved identifier');
  });

  it('says nothing where the module only warns', async () => {
    const gpu = createFakeGPU();
    const refused = vi.fn();
    gpu.compilation = [
      { type: 'warning', message: 'unused', lineNum: 9, linePos: 1 },
    ] as unknown as GPUCompilationMessage[];

    createWebGPUBackend(gpu.canvas, gpu.device, refused)!.program(graph());
    await Promise.resolve();
    await Promise.resolve();

    expect(refused).not.toHaveBeenCalled();
  });
});

/**
 * Where the pipeline says its bindings are, which used to be a question for the
 * driver.
 *
 * `layout: 'auto'` asks the driver to infer a layout from the module it was given.
 * What comes back belongs to the pipeline it was inferred from, so two pipelines
 * cannot share one, and a compute pass and a render pass reading the same buffer
 * would each need a group of their own over it. An explicit layout is what lets
 * one be shared, which is why it comes before every capability below it.
 */
describe('the layout it builds rather than infers', () => {
  it('never asks the driver where its bindings are', () => {
    const { gpu, backend } = backendOver();
    backend.program(graph());

    expect(gpu.calls('getBindGroupLayout')).toHaveLength(0);
    const descriptor = gpu.calls('createRenderPipeline')[0]!.descriptor as GPURenderPipelineDescriptor;
    expect(descriptor.layout).not.toBe('auto');
  });

  it('builds the layout from what the description says, at the number the source declares', () => {
    const { gpu, backend } = backendOver();
    backend.program(graph());

    const layouts = gpu.calls('createBindGroupLayout');
    expect(layouts).toHaveLength(1);
    const entries = layouts[0]!.entries as { binding: number; visibility: number; kind: string }[];
    expect(entries).toEqual([{ binding: 0, visibility: GPUShaderStage.FRAGMENT, kind: 'buffer:uniform' }]);
  });

  it('names the fragment stage alone, since the vertex half is the backend’s own triangle', () => {
    const { gpu, backend } = backendOver();
    backend.program(graph());

    const entries = gpu.calls('createBindGroupLayout')[0]!.entries as { visibility: number }[];
    // A visibility wider than the stages that read the resource is accepted by
    // the driver while claiming a stage reads something it does not, and a
    // narrower one is a pipeline the driver refuses.
    expect(entries[0]!.visibility).toBe(GPUShaderStage.FRAGMENT);
    expect(entries[0]!.visibility & GPUShaderStage.VERTEX).toBe(0);
  });

  it('passes that layout to the pipeline rather than a second one', () => {
    const { gpu, backend } = backendOver();
    backend.program(graph());

    const passed = gpu.calls('createPipelineLayout');
    expect(passed).toHaveLength(1);
    // Named by the label the recorder gave the layout above rather than compared
    // as an object, since a pipeline layout is a thing the driver made.
    expect(passed[0]!.bindGroupLayouts).toEqual([`${ONE_PASS}-bindings`]);
  });

  it('builds no binding at all for a source that declares no block', () => {
    const { gpu, backend } = backendOver();
    // A fragment shader reading only its pixel position is this case, and a
    // layout invented for it would claim a binding nothing fills.
    backend.program(graph({ code: NO_BLOCK }));

    expect(gpu.calls('createBindGroupLayout')[0]!.entries).toEqual([]);
    expect(gpu.calls('createBindGroup')[0]).toBeDefined();
  });

  it('refuses a group past the first with no group below it, since a layout is read by position', () => {
    const { backend } = backendOver();
    const frame = graph();
    // A binding at group one with nothing at group zero is a pipeline layout with
    // a hole in it, which the card reads by position and cannot be handed.
    const pipelines = frame.pipelines.map((pipeline) => ({
      ...pipeline,
      bindings: pipeline.bindings.map((at) => ({ ...at, group: 1 })),
    }));
    expect(() => backend.program({ ...frame, pipelines })).toThrow(
      'the frame for "fixture" binds "frame" past group 0 with no group 0'
    );
  });
});

describe('the uniform block it fills', () => {
  it('measures the buffer off the block and rounds it up to a whole lump', () => {
    const { gpu, backend } = backendOver();
    backend.program(graph());

    const buffer = gpu.calls('createBuffer')[0]!;
    // The block ends at 16, which is already a whole lump; a block ending at 20
    // is rounded to 32 rather than left where a write would be refused.
    expect(buffer.size).toBe(16);
    expect(buffer.usage).toBe(GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
  });

  it('rounds a block that does not end on a lump up to the next one', () => {
    const { gpu, backend } = backendOver();
    backend.program(graph({ uniformBlock: [...BLOCK, { name: 'u_dive', offset: 16, size: 4 }] }));
    expect(gpu.calls('createBuffer')[0]!.size).toBe(32);
  });

  it('binds that buffer at the number the source declares', () => {
    const { gpu, backend } = backendOver();
    backend.program(graph());

    const descriptor = gpu.calls('createBindGroup')[0]!.descriptor as GPUBindGroupDescriptor;
    const entries = [...descriptor.entries];
    expect(entries).toHaveLength(1);
    expect(entries[0]!.binding).toBe(0);
  });

  it('writes each value where the build said that value sits', () => {
    const { gpu, backend } = backendOver();
    const program = backend.program(graph());
    program.setUniforms({ u_time: 3, u_resolution: [7, 9] });
    // The write is queued against the frame, so the draw is what flushes it to
    // the device — it lands there in order rather than the moment it was handed in.
    program.draw();

    // Offsets are bytes and the block is floats, so u_resolution at byte 8
    // starts at float 2, and float 1 is the padding a vec2's alignment leaves.
    expect([...gpu.written()!]).toEqual([3, 0, 7, 9]);
  });

  it('drops a name the block has nowhere to put rather than writing it somewhere', () => {
    const { gpu, backend } = backendOver();
    const program = backend.program(graph());
    program.setUniforms({ u_time: 1, u_nothing: 5 });
    program.draw();
    expect([...gpu.written()!]).toEqual([1, 0, 0, 0]);
  });

  it('answers which of the names it was given the block has no place for', () => {
    const { backend } = backendOver();
    const program = backend.program(graph());
    expect(program.unreached(['u_time', 'u_resolution', 'u_dive'])).toEqual(['u_dive']);
  });
});

describe('the frame it draws', () => {
  it('draws into a texture of its own that a read can be copied out of, and into', () => {
    const { gpu, backend } = backendOver();
    backend.program(graph()).draw();

    const texture = gpu.calls('createTexture')[0]!;
    expect(texture.format).toBe('rgba8unorm');
    // Copied into as well as out of, because a frame whose picture is a storage
    // texture ends with a copy into this one, and a flag that is missing is
    // refused at the copy rather than where the texture was made.
    expect(texture.usage).toBe(GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC | GPUTextureUsage.COPY_DST);
    expect(texture.size).toEqual([800, 600]);
  });

  it('covers the frame with one triangle and clears it first', () => {
    const { gpu, backend } = backendOver();
    backend.program(graph()).draw();

    const attachments = gpu.calls('beginRenderPass')[0]!.attachments as GPURenderPassColorAttachment[];
    expect(attachments[0]!.loadOp).toBe('clear');
    expect(attachments[0]!.storeOp).toBe('store');
    expect(gpu.calls('draw')[0]!.count).toBe(3);
    expect(gpu.calls('submit')).toHaveLength(1);
  });

  it('records the draws into a bundle and replays them in the pass', () => {
    const { gpu, backend } = backendOver();
    backend.program(graph()).draw();

    // The pipeline, the group and the draw are recorded once into a bundle, in
    // that order, rather than issued every frame.
    const recorded = gpu.trace
      .map((entry) => entry.call)
      .filter((call) =>
        ['createRenderBundleEncoder', 'setPipeline', 'setBindGroup', 'draw', 'finishBundle'].includes(call)
      );
    expect(recorded).toEqual(['createRenderBundleEncoder', 'setPipeline', 'setBindGroup', 'draw', 'finishBundle']);

    // The pass replays the bundle rather than setting the pipeline and the group
    // and drawing itself.
    const pass = gpu.trace
      .map((entry) => entry.call)
      .filter((call) => ['beginRenderPass', 'executeBundles', 'endPass', 'submit'].includes(call));
    expect(pass).toEqual(['beginRenderPass', 'executeBundles', 'endPass', 'submit']);
  });

  it('keeps the same texture across frames of one size and replaces it on a resize', () => {
    const { gpu, backend } = backendOver();
    const program = backend.program(graph());
    program.draw();
    program.draw();
    expect(gpu.calls('createTexture')).toHaveLength(1);

    backend.resize(320, 180);
    program.draw();
    expect(gpu.calls('createTexture')).toHaveLength(2);
    expect(gpu.calls('createTexture')[1]!.size).toEqual([320, 180]);
    expect(gpu.calls('texture.destroy')).toHaveLength(1);
  });

  it('records the pass once and replays it, so more frames do not re-issue the draws', () => {
    const { gpu, backend } = backendOver();
    const program = backend.program(graph());
    const FRAMES = 8;
    for (let frame = 0; frame < FRAMES; frame++) program.draw();

    // The pipeline and the draw are set once, when the bundle is recorded, and
    // never again however many frames are drawn. What grows with the frame count
    // is the one call that replays the bundle.
    expect(gpu.calls('createRenderBundleEncoder')).toHaveLength(1);
    expect(gpu.calls('setPipeline')).toHaveLength(1);
    expect(gpu.calls('draw')).toHaveLength(1);
    expect(gpu.calls('executeBundles')).toHaveLength(FRAMES);
  });
});

describe('the canvas it shows a frame on', () => {
  it('leaves a canvas nobody can see unconfigured, because configuring one costs a read', () => {
    const { gpu, backend } = backendOver({ connected: false });
    backend.program(graph()).draw();

    expect(gpu.context.configured).toBe(0);
    expect(gpu.calls('copyTextureToTexture')).toHaveLength(0);
  });

  it('configures a canvas a reader can see once, and copies every frame to it', () => {
    const { gpu, backend } = backendOver({ connected: true });
    const program = backend.program(graph());
    program.draw();
    program.draw();

    expect(gpu.context.configured).toBe(1);
    expect(gpu.calls('copyTextureToTexture')).toHaveLength(2);
    const configure = gpu.calls('context.configure')[0]!;
    expect(configure.format).toBe('rgba8unorm');
    expect(configure.usage).toBe(GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_DST);
  });
});

describe('the pixels it hands back', () => {
  it('drops the padding a device puts on every row', async () => {
    const { gpu, backend } = backendOver();
    backend.resize(4, 3);
    gpu.mapped = paddedFrame(4, 3);
    backend.program(graph()).draw();

    const pixels = await backend.readPixels();
    expect(pixels).toHaveLength(4 * 3 * 4);
    // Every byte of a row carries that row's number in the padded frame, so a
    // repack that kept the padding or slipped a row shows up as a wrong number.
    expect([...pixels.slice(0, 16)]).toEqual(Array(16).fill(1));
    expect([...pixels.slice(16, 32)]).toEqual(Array(16).fill(2));
    expect([...pixels.slice(32, 48)]).toEqual(Array(16).fill(3));
  });

  it('asks for the rows at the stride a device pads them to', async () => {
    const { gpu, backend } = backendOver();
    backend.resize(4, 3);
    gpu.mapped = paddedFrame(4, 3);
    backend.program(graph()).draw();
    await backend.readPixels();

    expect(gpu.calls('copyTextureToBuffer')[0]!.stride).toBe(256);
    expect(gpu.calls('mapAsync')[0]!.mode).toBe(GPUMapMode.READ);
    expect(gpu.calls('unmap')).toHaveLength(1);
  });

  it('hands back an empty frame of the right size before anything has drawn', async () => {
    const { backend } = backendOver();
    backend.resize(4, 2);

    const pixels = await backend.readPixels();
    expect(pixels).toHaveLength(4 * 2 * 4);
    expect(pixels.some((byte) => byte !== 0)).toBe(false);
  });
});

describe('a frame captured into a caller-supplied texture', () => {
  /** A texture the caller owns and hands the frame a home in, the way an XR
   * layer's target or a capture's own texture is passed rather than the
   * backend's own. It carries `COPY_DST` to take the frame and `COPY_SRC` so the
   * read-back can copy out of it. */
  const captureTexture = (gpu: ReturnType<typeof createFakeGPU>) =>
    gpu.device.createTexture({
      label: 'capture',
      size: [4, 3],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_DST | GPUTextureUsage.COPY_SRC,
    });

  it('lands the finished frame in the caller texture on the frame encoder', () => {
    const { gpu, backend } = backendOver();
    backend.resize(4, 3);
    const into = captureTexture(gpu);
    backend.program(graph()).draw(into);

    // The frame the backend drew into its own target is copied into the
    // caller's texture, off that target, so both hold the same picture.
    expect(gpu.calls('copyTextureToTexture')).toContainEqual(
      expect.objectContaining({ from: 'frame', to: 'capture' })
    );
    // Still one submit: the capture copy joined the frame's own encoder rather
    // than opening a second one.
    expect(gpu.calls('submit')).toHaveLength(1);
  });

  it('reads the caller texture back with the library owning the row stride', async () => {
    const { gpu, backend } = backendOver();
    backend.resize(4, 3);
    gpu.mapped = paddedFrame(4, 3);
    const into = captureTexture(gpu);
    backend.program(graph()).draw(into);

    const pixels = await backend.readPixels(into);
    // The read copied out of the caller's own texture, not the backend's target.
    expect(gpu.calls('copyTextureToBuffer')[0]!.from).toBe('capture');
    // Padding a device puts on every row is dropped here, so a consumer does no
    // row-stride arithmetic of its own (item 29).
    expect(pixels).toHaveLength(4 * 3 * 4);
    expect([...pixels.slice(0, 16)]).toEqual(Array(16).fill(1));
    expect([...pixels.slice(16, 32)]).toEqual(Array(16).fill(2));
    expect([...pixels.slice(32, 48)]).toEqual(Array(16).fill(3));
  });

  it('leaves the frame out of any caller texture when none is given', () => {
    const { gpu, backend } = backendOver({ connected: true });
    backend.resize(4, 3);
    backend.program(graph()).draw();

    // With a canvas to composite onto, the only texture-to-texture copy is the
    // present onto the drawable — none into a caller texture.
    expect(gpu.calls('copyTextureToTexture')).toEqual([
      expect.objectContaining({ from: 'frame', to: 'canvas' }),
    ]);
  });
});

describe('what it gives back when it is done', () => {
  it('destroys a program own buffer and leaves the backend usable', () => {
    const { gpu, backend } = backendOver();
    backend.program(graph()).dispose();
    expect(gpu.calls('buffer.destroy')).toHaveLength(1);
  });

  it('destroys its texture and unconfigures a canvas it had configured', () => {
    const { gpu, backend } = backendOver({ connected: true });
    backend.program(graph()).draw();
    backend.dispose();

    expect(gpu.calls('texture.destroy')).toHaveLength(1);
    expect(gpu.context.unconfigured).toBe(1);
  });

  it('unconfigures nothing where nothing was ever shown', () => {
    const { gpu, backend } = backendOver({ connected: false });
    backend.program(graph()).draw();
    backend.dispose();

    expect(gpu.context.unconfigured).toBe(0);
  });
});

/**
 * A compute pass writing a picture, which is the shape a render pass cannot make:
 * one program run over a grid of work items, writing a texture that is copied to
 * the frame afterwards, since a storage texture cannot be an attachment of the
 * same pass that writes it.
 */
const COMPUTE = `struct Uniforms { u_time: f32, u_resolution: vec2<f32> };
@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var picture: texture_storage_2d<rgba8unorm, write>;

@compute @workgroup_size(8, 8)
fn computeMain(@builtin(global_invocation_id) at: vec3<u32>) {
  textureStore(picture, vec2<i32>(at.xy), vec4<f32>(uniforms.u_time));
}`;

const computeFrame = (over: Partial<FrameGraph> = {}): FrameGraph => ({
  id: 'fixture-compute',
  target: 'wgsl',
  uniforms: UNIFORMS,
  resources: [
    { kind: 'uniform', name: 'uniforms', block: BLOCK },
    { kind: 'texture', name: 'picture', size: { scale: 1 }, format: 'rgba8unorm', use: ['storage'] },
  ],
  modules: [{ name: 'compute', code: COMPUTE }],
  pipelines: [
    {
      kind: 'compute',
      name: 'field',
      compute: { module: 'compute', entry: 'computeMain' },
      workgroup: [8, 8, 1],
      bindings: [
        { group: 0, binding: 0, resource: 'uniforms', visibility: ['compute'] },
        { group: 0, binding: 1, resource: 'picture', visibility: ['compute'] },
      ],
    },
  ],
  // The group count is the producer's (item 72): [100, 75, 1] covers the fake
  // canvas's 800×600 in whole blocks of the pipeline's 8×8 workgroup. The backend
  // dispatches it as given and no longer works it out from the frame size.
  passes: [{ pipeline: 'field', groups: [100, 75, 1] }],
  present: 'picture',
  ...over,
});

describe('the compute pipeline it builds', () => {
  it('builds a compute pipeline and no render one, at the layout the description says', () => {
    const { gpu, backend } = backendOver();
    backend.program(computeFrame());

    expect(gpu.calls('createRenderPipeline')).toHaveLength(0);
    const pipeline = gpu.calls('createComputePipeline')[0]!;
    expect(pipeline.computeEntry).toBe('computeMain');
    expect(pipeline.layout).toBe('field-layout');
  });

  it('names the compute stage in the layout, and the storage texture by its own format', () => {
    const { gpu, backend } = backendOver();
    backend.program(computeFrame());

    expect(gpu.calls('createBindGroupLayout')[0]!.entries).toEqual([
      { binding: 0, visibility: GPUShaderStage.COMPUTE, kind: 'buffer:uniform' },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, kind: 'storage:write-only:rgba8unorm' },
    ]);
  });

  it('hands a rung its overridable constants through the compute stage', () => {
    const { gpu, backend } = backendOver();
    backend.program(computeFrame({ modules: [{ name: 'compute', code: COMPUTE, constants: { STEPS: 32 } }] }));

    expect(gpu.calls('createComputePipeline')[0]!.constants).toEqual({ STEPS: 32 });
  });
});

describe('the texture a compute pass writes', () => {
  it('is made at the frame size, as a storage texture the picture can be copied out of', () => {
    const { gpu, backend } = backendOver();
    backend.program(computeFrame());

    const texture = gpu.calls('createTexture')[0]!;
    expect(texture.size).toEqual([800, 600]);
    expect(texture.format).toBe('rgba8unorm');
    expect(texture.usage).toBe(GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC);
  });

  it('is bound as a view beside the uniform buffer, in the order the source declares', () => {
    const { gpu, backend } = backendOver();
    backend.program(computeFrame());

    expect(gpu.calls('createBindGroup')[0]!.bindings).toEqual([
      { binding: 0, resource: 'buffer1' },
      { binding: 1, resource: 'picture.view' },
    ]);
  });

  it('is asked for at a fixed size where the description names numbers rather than the frame', () => {
    const { gpu, backend } = backendOver();
    const frame = computeFrame();
    backend.program({
      ...frame,
      resources: [
        frame.resources[0]!,
        { kind: 'texture', name: 'picture', size: { width: 64, height: 64 }, format: 'rgba8unorm', use: ['storage'] },
      ],
    });

    expect(gpu.calls('createTexture')[0]!.size).toEqual([64, 64]);
  });

  it('is rebuilt with its group on a resize, because a view outlives nothing', () => {
    const { gpu, backend } = backendOver();
    const program = backend.program(computeFrame());
    program.draw();
    expect(gpu.calls('createTexture')).toHaveLength(2);

    backend.resize(320, 180);
    program.draw();

    const made = gpu.calls('createTexture');
    expect(made).toHaveLength(4);
    expect(made[2]!.size).toEqual([320, 180]);
    expect(gpu.calls('createBindGroup')).toHaveLength(2);
  });

  it('keeps a fixed-size texture across a resize, so what is in it survives', () => {
    const { gpu, backend } = backendOver();
    const frame = computeFrame();
    const program = backend.program({
      ...frame,
      resources: [
        frame.resources[0]!,
        { kind: 'texture', name: 'picture', size: { width: 64, height: 64 }, format: 'rgba8unorm', use: ['storage'] },
      ],
    });
    program.draw();
    backend.resize(320, 180);
    program.draw();

    expect(gpu.calls('createTexture').filter((call) => JSON.stringify(call.size) === '[64,64]')).toHaveLength(1);
    expect(gpu.calls('createBindGroup')).toHaveLength(1);
  });

  it('destroys every texture it made when the program is done with it', () => {
    const { gpu, backend } = backendOver();
    backend.program(computeFrame()).dispose();

    expect(gpu.calls('texture.destroy')).toHaveLength(1);
    expect(gpu.calls('buffer.destroy')).toHaveLength(1);
  });
});

describe('the compute pass it runs', () => {
  it('does the pass in one order, which is the pipeline, the group, the dispatch, the end', () => {
    const { gpu, backend } = backendOver();
    backend.program(computeFrame()).draw();

    const order = gpu.trace
      .map((entry) => entry.call)
      .filter((call) =>
        [
          'beginComputePass',
          'beginRenderPass',
          'setPipeline',
          'setBindGroup',
          'dispatchWorkgroups',
          'endPass',
        ].includes(call)
      );
    expect(order).toEqual(['beginComputePass', 'setPipeline', 'setBindGroup', 'dispatchWorkgroups', 'endPass']);
  });

  it('dispatches the group count the producer set and does not recount on a resize', () => {
    const { gpu, backend } = backendOver();
    const program = backend.program(computeFrame());
    program.draw();
    // A resize no longer moves the count (item 72): the producer worked it out
    // from the size it had and the backend dispatches that, so a page wanting a
    // resize to change the coverage hands over a fresh frame — it is not the
    // backend's to derive from the new frame size.
    backend.resize(801, 600);
    program.draw();

    expect(gpu.calls('dispatchWorkgroups').map((call) => [call.x, call.y, call.z])).toEqual([
      [100, 75, 1],
      [100, 75, 1],
    ]);
  });

  it('dispatches exactly what a description naming its own count asks for', () => {
    const { gpu, backend } = backendOver();
    const frame = computeFrame();
    backend.program({ ...frame, passes: [{ pipeline: 'field', groups: [3, 2, 1] }] }).draw();

    expect(gpu.calls('dispatchWorkgroups')[0]).toMatchObject({ x: 3, y: 2, z: 1 });
  });

  it('copies the picture into the target a read comes out of', () => {
    const { gpu, backend } = backendOver({ connected: false });
    backend.program(computeFrame()).draw();

    expect(gpu.calls('copyTextureToTexture')).toEqual([expect.objectContaining({ from: 'picture', to: 'frame' })]);
    expect(gpu.calls('submit')).toHaveLength(1);
  });
});

describe('a compute description it refuses', () => {
  it('refuses one that shows a resource it never declares', () => {
    const { backend } = backendOver();
    expect(() => backend.program(computeFrame({ present: 'elsewhere' }))).toThrow(
      'the frame for "fixture-compute" shows a resource "elsewhere" it does not declare'
    );
  });

  it('refuses a binding pointing at a resource nothing declares', () => {
    const { backend } = backendOver();
    const frame = computeFrame();
    const pipeline = frame.pipelines[0]!;
    if (pipeline.kind !== 'compute') throw new Error('the fixture runs a compute pipeline');
    expect(() =>
      backend.program({
        ...frame,
        pipelines: [
          {
            ...pipeline,
            bindings: [...pipeline.bindings, { group: 0, binding: 2, resource: 'elsewhere', visibility: ['compute'] }],
          },
        ],
      })
    ).toThrow(/binds a resource "elsewhere" it never declares/);
  });

  it('refuses a pass asking for the other kind of work than its pipeline does', () => {
    const { backend } = backendOver();
    const frame = computeFrame();
    expect(() => backend.program({ ...frame, passes: [{ pipeline: 'field', draws: [{ vertices: 3 }] }] })).toThrow(
      /asks for the other kind of work/
    );
  });
});

/**
 * A fragment shader reading a picture the build wrote, which is the shape a
 * uniform block cannot make: bytes handed to the card once, a sampler saying how
 * the card reads between them, and a fragment stage that binds both.
 */
const SAMPLED = `struct Uniforms { u_time: f32, u_resolution: vec2<f32> };
@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var grain: texture_2d<f32>;
@group(0) @binding(2) var grainSampler: sampler;

@fragment
fn fragMain(@builtin(position) at: vec4<f32>) -> @location(0) vec4<f32> {
  return textureSample(grain, grainSampler, at.xy / uniforms.u_resolution);
}`;

/** Four pixels a side, so the byte count and the row stride are small enough to
 * assert exactly. Each pixel carries its own row, which is what makes a stride
 * read off the wrong axis visible rather than plausible. */
const GRAIN = new Uint8Array(4 * 4 * 4).map((_, at) => Math.floor(at / 16) + 1);

const sampledFrame = (over: Partial<FrameGraph> = {}): FrameGraph => ({
  id: 'fixture-sampled',
  target: 'wgsl',
  uniforms: UNIFORMS,
  resources: [
    { kind: 'uniform', name: 'uniforms', block: BLOCK },
    {
      kind: 'texture',
      name: 'grain',
      size: { width: 4, height: 4 },
      format: 'rgba8unorm',
      use: ['sample'],
      source: 'grain.bin',
      data: GRAIN,
    },
    { kind: 'sampler', name: 'grainSampler', filter: 'linear', wrap: 'repeat' },
  ],
  modules: [{ name: 'fragment', code: SAMPLED }],
  pipelines: [
    {
      kind: 'render',
      name: ONE_PASS,
      vertex: 'fullscreen',
      fragment: { module: 'fragment', entry: 'fragMain' },
      bindings: [
        { group: 0, binding: 0, resource: 'uniforms', visibility: ['fragment'] },
        { group: 0, binding: 1, resource: 'grain', visibility: ['fragment'] },
        { group: 0, binding: 2, resource: 'grainSampler', visibility: ['fragment'] },
      ],
    },
  ],
  passes: [{ pipeline: ONE_PASS, draws: [{ vertices: 3 }] }],
  ...over,
});

describe('the texture a shader samples', () => {
  it('is made at the size the description names, readable by a shader and writable once', () => {
    const { gpu, backend } = backendOver();
    backend.program(sampledFrame());

    const texture = gpu.calls('createTexture')[0]!;
    expect(texture.label).toBe('grain');
    expect(texture.size).toEqual([4, 4]);
    expect(texture.usage).toBe(GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST);
  });

  it('has its contents handed over once, a row at a time at four bytes a pixel', () => {
    const { gpu, backend } = backendOver();
    backend.program(sampledFrame());

    expect(gpu.calls('writeTexture')).toEqual([
      { call: 'writeTexture', label: 'grain', bytes: 64, stride: 16, size: [4, 4] },
    ]);
  });

  it('is not handed its contents again on a draw or on a resize, because it is not the frame', () => {
    const { gpu, backend } = backendOver();
    const program = backend.program(sampledFrame());
    program.draw();
    backend.resize(320, 180);
    program.draw();

    expect(gpu.calls('writeTexture')).toHaveLength(1);
    expect(gpu.calls('createTexture').filter((call) => call.label === 'grain')).toHaveLength(1);
  });

  it('keeps its contents while a frame-sized texture beside it is rebuilt on a resize', () => {
    const { gpu, backend } = backendOver();
    const frame = computeFrame();
    const program = backend.program({
      ...frame,
      resources: [...frame.resources, sampledFrame().resources[1]!, sampledFrame().resources[2]!],
    });
    program.draw();
    backend.resize(320, 180);
    program.draw();

    expect(gpu.calls('createTexture').filter((call) => call.label === 'picture')).toHaveLength(2);
    expect(gpu.calls('createTexture').filter((call) => call.label === 'grain')).toHaveLength(1);
    expect(gpu.calls('writeTexture')).toHaveLength(1);
  });

  it('is refused by name where the description gives it contents and the frame’s own size', () => {
    const { backend } = backendOver();
    const frame = sampledFrame();
    expect(() =>
      backend.program({
        ...frame,
        resources: [
          frame.resources[0]!,
          { ...(frame.resources[1] as TextureResource), size: { scale: 1 } },
          frame.resources[2]!,
        ],
      })
    ).toThrow(/gives "grain" contents and the frame/);
  });

  it('is refused where a binding points at a texture the frame neither writes nor samples', () => {
    const { backend } = backendOver();
    const frame = sampledFrame();
    expect(() =>
      backend.program({
        ...frame,
        resources: [
          frame.resources[0]!,
          { ...(frame.resources[1] as TextureResource), use: ['attachment'] },
          frame.resources[2]!,
        ],
      })
    ).toThrow(/binds "grain", which it neither writes nor samples/);
  });
});

describe('the sampler a shader reads a texture through', () => {
  it('is made with the filter and the wrap the description names, on both axes', () => {
    const { gpu, backend } = backendOver();
    backend.program(sampledFrame());

    expect(gpu.calls('createSampler')).toEqual([
      {
        call: 'createSampler',
        label: 'grainSampler',
        magFilter: 'linear',
        minFilter: 'linear',
        addressModeU: 'repeat',
        addressModeV: 'repeat',
      },
    ]);
  });

  it('takes the everyday word for running off the edge and gives the card its own', () => {
    const { gpu, backend } = backendOver();
    const frame = sampledFrame();
    backend.program({
      ...frame,
      resources: [
        frame.resources[0]!,
        frame.resources[1]!,
        { kind: 'sampler', name: 'grainSampler', filter: 'nearest', wrap: 'clamp' },
      ],
    });

    expect(gpu.calls('createSampler')[0]).toMatchObject({
      magFilter: 'nearest',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });
  });

  it('sits in the layout beside the texture, both readable by the fragment stage alone', () => {
    const { gpu, backend } = backendOver();
    backend.program(sampledFrame());

    expect(gpu.calls('createBindGroupLayout')[0]!.entries).toEqual([
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, kind: 'buffer:uniform' },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, kind: 'texture' },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, kind: 'sampler' },
    ]);
  });

  it('is bound beside the view and the buffer, each at the binding the source declares', () => {
    const { gpu, backend } = backendOver();
    backend.program(sampledFrame());

    expect(gpu.calls('createBindGroup')[0]!.bindings).toEqual([
      { binding: 0, resource: 'buffer1' },
      { binding: 1, resource: 'grain.view' },
      { binding: 2, resource: 'grainSampler' },
    ]);
  });
});
