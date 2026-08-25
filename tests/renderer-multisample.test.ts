import { describe, expect, it } from 'vitest';
import { createWebGPUBackend } from '../gpu/webgpu';
import { createFakeGPU } from './support/fake-gpu';
import type { RenderPassSpec, RenderPipelineSpec, FrameGraph, TextureResource } from '@altpsyche/engine';

/**
 * A pass keeping several samples of every pixel, averaged into a picture keeping
 * one.
 *
 * What it is for is an edge. A triangle covers part of the pixel its boundary
 * runs through, and a card asked for one sample either fills that pixel or leaves
 * it, so a slanted edge comes out as a staircase. Asked for four, it takes four
 * readings inside the pixel and the average of them is however much of the pixel
 * the triangle covered, which is what turns the staircase into a gradient.
 *
 * The count is written on the attachment and again on the pipeline, because the
 * card takes it at both calls and reports a disagreement against whichever
 * arrived second. So the two are compared here, and every other thing a texture
 * can be is closed to one keeping several samples: it cannot be copied out of,
 * written into from outside, laddered, or bound to a shader.
 *
 * Whether the edge actually softens is a picture rather than a trace, which is
 * the preset's to answer.
 */

const DRAWS = `struct Uniforms { u_time: f32, u_resolution: vec2<f32> };
@group(0) @binding(0) var<uniform> uniforms: Uniforms;

@fragment
fn fragMain(@builtin(position) at: vec4<f32>) -> @location(0) vec4<f32> {
  return vec4<f32>(at.xy / uniforms.u_resolution, 0.0, 1.0);
}`;

const picture = (name: string, over: Partial<TextureResource> = {}): TextureResource => ({
  kind: 'texture',
  name,
  size: ['frame', 'frame'],
  format: 'rgba8unorm',
  use: ['attachment'],
  ...over,
});

const shade = (over: Partial<RenderPipelineSpec> = {}): RenderPipelineSpec => ({
  kind: 'render',
  name: 'shade',
  vertex: 'fullscreen',
  fragment: { module: 'wgsl', entry: 'fragMain' },
  bindings: [{ group: 0, binding: 0, resource: 'uniforms', visibility: ['fragment'] }],
  targets: [{ format: 'rgba8unorm' }],
  samples: 4,
  ...over,
});

const into = (over: Partial<RenderPassSpec> = {}): RenderPassSpec => ({
  pipeline: 'shade',
  draws: [{ vertices: 3 }],
  colour: [{ resource: 'edges', clear: [0, 0, 0, 1], resolve: 'flat' }],
  ...over,
});

const averaged = (over: Partial<FrameGraph> = {}): FrameGraph => ({
  id: 'fixture-multisample',
  target: 'wgsl',
  uniforms: [
    { name: 'u_time', type: 'float' },
    { name: 'u_resolution', type: 'vec2' },
  ],
  resources: [
    { kind: 'uniform', name: 'uniforms', block: [{ name: 'u_time', offset: 0, size: 4 }] },
    picture('edges', { samples: 4 }),
    picture('flat'),
  ],
  modules: [{ name: 'wgsl', code: DRAWS }],
  pipelines: [shade()],
  passes: [into()],
  present: 'flat',
  ...over,
});

function backendOver() {
  const gpu = createFakeGPU({ connected: false });
  const backend = createWebGPUBackend(gpu.canvas, gpu.device);
  if (!backend) throw new Error('the fake canvas gave no WebGPU context');
  backend.resize(800, 600);
  return { gpu, backend };
}

const made = (gpu: ReturnType<typeof createFakeGPU>, label: string) =>
  gpu.calls('createTexture').find((call) => call.label === label);

describe('the textures a multisampled pass is given', () => {
  it('keeps four samples of every pixel in the attachment it draws into', () => {
    const { gpu, backend } = backendOver();
    backend.program(averaged());

    expect(made(gpu, 'edges')?.samples).toBe(4);
  });

  it('keeps one in the picture those samples are averaged into, which is what a count of none means', () => {
    const { gpu, backend } = backendOver();
    backend.program(averaged());

    expect(made(gpu, 'flat')?.samples).toBeUndefined();
  });

  it('asks only to be drawn into, since nothing may copy out of it or read it', () => {
    const { gpu, backend } = backendOver();
    backend.program(averaged());

    expect(made(gpu, 'edges')?.usage).toBe(GPUTextureUsage.RENDER_ATTACHMENT);
    // The average is what the reader ends up seeing, so that one is copied out.
    expect(made(gpu, 'flat')?.usage).toBe(GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC);
  });

  it('leaves a frame that keeps one sample everywhere asking for no count at all', () => {
    const { gpu, backend } = backendOver();
    backend.program(
      averaged({
        resources: [averaged().resources[0] as TextureResource, picture('edges'), picture('flat')],
        pipelines: [shade({ samples: undefined })],
        passes: [into({ colour: [{ resource: 'edges', clear: [0, 0, 0, 1] }] })],
        present: 'edges',
      })
    );

    expect(made(gpu, 'edges')?.samples).toBeUndefined();
  });
});

describe('the pipeline and the pass a multisampled attachment is drawn by', () => {
  it('builds the pipeline under the count its pass writes into', () => {
    const { gpu, backend } = backendOver();
    backend.program(averaged());

    expect(gpu.calls('createRenderPipeline').map((call) => call.samples)).toEqual([4]);
  });

  it('names where the samples are averaged on the attachment they come from', () => {
    const { gpu, backend } = backendOver();
    const program = backend.program(averaged());
    program.draw();

    const opened = gpu.calls('beginRenderPass');
    expect(opened).toHaveLength(1);
    // The samples are averaged into `flat`, which is what the reader sees, and
    // nothing reads the multisampled `edges` itself — so its store is a discard
    // while the resolve still writes the average (item 1).
    expect(opened[0]?.colour).toEqual([
      {
        view: 'edges.view',
        resolve: 'flat.view',
        loadOp: 'clear',
        storeOp: 'discard',
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
      },
    ]);
  });

  it('averages into nothing where the attachment keeps one sample', () => {
    const { gpu, backend } = backendOver();
    const program = backend.program(
      averaged({
        resources: [averaged().resources[0] as TextureResource, picture('edges'), picture('flat')],
        pipelines: [shade({ samples: undefined })],
        passes: [into({ colour: [{ resource: 'edges', clear: [0, 0, 0, 1] }] })],
        present: 'edges',
      })
    );
    program.draw();

    expect(gpu.calls('beginRenderPass')[0]?.colour).toEqual([
      {
        view: 'edges.view',
        resolve: undefined,
        loadOp: 'clear',
        storeOp: 'store',
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
      },
    ]);
  });
});

describe('what a description keeping several samples a pixel is refused for', () => {
  const refused = (frame: FrameGraph, message: string) => {
    const { backend } = backendOver();
    expect(() => backend.program(frame)).toThrow(message);
  };

  it('averaging the samples nowhere, since nothing else can read them', () => {
    refused(
      averaged({ passes: [into({ colour: [{ resource: 'edges', clear: [0, 0, 0, 1] }] })] }),
      'the pass on "shade" keeps several samples a pixel in "edges" and averages them nowhere'
    );
  });

  it('averaging into a texture the frame does not declare', () => {
    refused(
      averaged({ passes: [into({ colour: [{ resource: 'edges', clear: [0, 0, 0, 1], resolve: 'elsewhere' }] })] }),
      'the frame for "fixture-multisample" averages "edges" into "elsewhere", which is no texture it declares'
    );
  });

  it('averaging into a picture of another shape, since averaging is a read of the pixel underneath', () => {
    refused(
      averaged({
        resources: [
          averaged().resources[0] as TextureResource,
          picture('edges', { samples: 4 }),
          picture('flat', { size: [64, 64] }),
        ],
      }),
      'the pass on "shade" averages "edges" into "flat", which is not the same picture keeping one sample'
    );
  });

  it('averaging into a texture that keeps several samples itself', () => {
    refused(
      averaged({
        resources: [
          averaged().resources[0] as TextureResource,
          picture('edges', { samples: 4 }),
          picture('flat', { samples: 4 }),
        ],
        present: 'edges',
      }),
      'the frame for "fixture-multisample" shows "edges", which keeps several samples a pixel'
    );
  });

  it('averaging an attachment that keeps one sample, which has nothing to average', () => {
    refused(
      averaged({
        resources: [averaged().resources[0] as TextureResource, picture('edges'), picture('flat')],
        pipelines: [shade({ samples: undefined })],
      }),
      'the pass on "shade" averages "edges" into "flat" and it keeps one sample a pixel'
    );
  });

  it('a pipeline and an attachment disagreeing about the count', () => {
    refused(
      averaged({ pipelines: [shade({ samples: undefined })] }),
      'the pass on "shade" draws 1 samples a pixel into "edges", which keeps 4'
    );
  });

  it('drawing several samples into the frame the reader sees, which keeps one', () => {
    refused(
      averaged({
        resources: [averaged().resources[0] as TextureResource],
        pipelines: [shade({ targets: undefined })],
        passes: [{ pipeline: 'shade', draws: [{ vertices: 3 }] }],
        present: undefined,
      }),
      'the pass on "shade" draws 4 samples a pixel into the frame'
    );
  });

  it('showing the attachment rather than the average, since nothing may copy out of it', () => {
    refused(
      averaged({ present: 'edges' }),
      'the frame for "fixture-multisample" shows "edges", which keeps several samples a pixel'
    );
  });

  it('giving it contents, since nothing may write into it from outside', () => {
    refused(
      averaged({
        resources: [
          averaged().resources[0] as TextureResource,
          picture('edges', { samples: 4, size: [64, 64], data: new Uint8Array(64 * 64 * 4) }),
          picture('flat'),
        ],
      }),
      'the frame for "fixture-multisample" gives "edges" contents and several samples a pixel'
    );
  });

  it('giving it a ladder, which is refused for the reason a ladder over any written texture is', () => {
    refused(
      averaged({
        resources: [
          averaged().resources[0] as TextureResource,
          picture('edges', { samples: 4, mips: 'generate' }),
          picture('flat'),
        ],
      }),
      'the frame for "fixture-multisample" gives "edges" a ladder and writes it every frame'
    );
  });

  it('binding it to a shader, which reads one only through a multisampled declaration', () => {
    refused(
      averaged({
        resources: [
          averaged().resources[0] as TextureResource,
          picture('edges', { samples: 4, use: ['attachment', 'sample'] }),
          picture('flat'),
        ],
      }),
      'the frame for "fixture-multisample" binds "edges", which keeps several samples a pixel'
    );
  });

  it('keeping the depth of a multisampled pass at a different count', () => {
    refused(
      averaged({
        resources: [
          averaged().resources[0] as TextureResource,
          picture('edges', { samples: 4 }),
          picture('flat'),
          picture('depth', { format: 'depth24plus' }),
        ],
        pipelines: [shade({ depth: { format: 'depth24plus', compare: 'less', write: true } })],
        passes: [into({ depth: { resource: 'depth', clear: 1 } })],
      }),
      'the pass on "shade" draws 4 samples a pixel and keeps depth in "depth", which keeps 1'
    );
  });
});
