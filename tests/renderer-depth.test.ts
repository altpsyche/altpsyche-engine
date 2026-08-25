import { describe, expect, it } from 'vitest';
import { createWebGPUBackend } from '../gpu/webgpu';
import { createFakeGPU } from './support/fake-gpu';
import type { RenderPipelineSpec, FrameGraph, TextureResource } from '@altpsyche/engine';

/**
 * Two surfaces at two distances, which is the first frame where what is drawn
 * second may be hidden by what was drawn first.
 *
 * The depth of a fragment is kept in a texture of its own, and a fragment is
 * drawn only where it passes a comparison against what that texture already
 * holds. The two halves of that are given to the card in two separate calls: the
 * comparison is compiled into the pipeline and the texture is attached to the
 * pass. So a description can disagree with itself, and a card reports the
 * disagreement against whichever of the two calls arrived second while naming
 * neither the pass nor the texture. These hold each disagreement to a refusal
 * that names both.
 *
 * Nothing here draws. Whether depth ordered a picture is a frame rather than a
 * trace, which is what the preset drawn by the browser gates is for.
 */

const SURFACES = `struct Uniforms { u_time: f32, u_resolution: vec2<f32> };
@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct Vertex { @builtin(position) at: vec4<f32>, @location(0) place: vec2<f32> };

@vertex
fn tilt(@builtin(vertex_index) which: u32) -> Vertex {
  let corner = vec2<f32>(f32(which & 1u), f32(which >> 1u)) * 4.0 - 1.0;
  return Vertex(vec4<f32>(corner, 0.5, 1.0), corner);
}

@fragment
fn near(shaded: Vertex) -> @location(0) vec4<f32> {
  return vec4<f32>(shaded.place, uniforms.u_time, 1.0);
}

@fragment
fn far(shaded: Vertex) -> @location(0) vec4<f32> {
  return vec4<f32>(shaded.place.yx, 0.0, 1.0);
}`;

const kept = (over: Partial<TextureResource> = {}): TextureResource => ({
  kind: 'texture',
  name: 'depth',
  size: { scale: 1 },
  format: 'depth24plus',
  use: ['attachment'],
  ...over,
});

/** One pipeline testing depth over one attachment, which is the smallest frame
 * that has both halves of it. */
const tiltedFrame = (over: Partial<FrameGraph> = {}): FrameGraph => ({
  id: 'fixture-depth',
  target: 'wgsl',
  resources: [{ kind: 'uniform', name: 'uniforms', block: [{ name: 'u_time', offset: 0, size: 4 }] }, kept()],
  modules: [{ name: 'wgsl', code: SURFACES }],
  pipelines: [
    {
      kind: 'render',
      name: 'far',
      vertex: { module: 'wgsl', entry: 'tilt' },
      fragment: { module: 'wgsl', entry: 'far' },
      bindings: [{ group: 0, binding: 0, resource: 'uniforms', visibility: ['fragment'] }],
      depth: { format: 'depth24plus', compare: 'less', write: true },
    },
  ],
  passes: [{ pipeline: 'far', draws: [{ vertices: 3 }], depth: { resource: 'depth', clear: 1 } }],
  ...over,
});

/** The same frame with a second pipeline drawn in front of the first without
 * leaving its own depth behind, which is what lets the far surface show through
 * the near one. Both run in one pass over one attachment. */
const crossingFrame = (): FrameGraph => {
  const frame = tiltedFrame();
  const behind = frame.pipelines[0] as RenderPipelineSpec;
  return {
    ...frame,
    pipelines: [
      behind,
      {
        ...behind,
        name: 'near',
        fragment: { module: 'wgsl', entry: 'near' },
        depth: { format: 'depth24plus', compare: 'less', write: false },
      },
    ],
    passes: [...frame.passes, { pipeline: 'near', draws: [{ vertices: 3 }], depth: { resource: 'depth' } }],
  };
};

function backendOver() {
  const gpu = createFakeGPU({ connected: false });
  const backend = createWebGPUBackend(gpu.canvas, gpu.device);
  if (!backend) throw new Error('the fake canvas gave no WebGPU context');
  backend.resize(800, 600);
  return { gpu, backend };
}

const madeDepth = (gpu: ReturnType<typeof createFakeGPU>) =>
  gpu.calls('createTexture').filter((call) => call.label === 'depth');

describe('the texture a frame keeps its depth in', () => {
  it('is made at the frame size in the format the pipeline tests, asking to be an attachment', () => {
    const { gpu, backend } = backendOver();
    backend.program(tiltedFrame());

    expect(madeDepth(gpu).map((call) => [call.size, call.format, call.usage])).toEqual([
      [[800, 600], 'depth24plus', GPUTextureUsage.RENDER_ATTACHMENT],
    ]);
  });

  it('is attached to the pass, cleared to the value the description names, and discarded where nothing reads it again', () => {
    const { gpu, backend } = backendOver();
    const frame = tiltedFrame();
    const passes = [
      { ...(frame.passes[0] as object), depth: { resource: 'depth', clear: 0.25 } },
    ] as FrameGraph['passes'];
    backend.program(tiltedFrame({ passes })).draw();

    // One pass tests against this depth and nothing reads it afterwards, so the
    // card is asked to discard it rather than write it back (item 1). A second
    // pass loading it — as `crossingFrame` has — is what keeps the first store.
    expect(gpu.calls('beginRenderPass')[0]?.depth).toEqual({
      view: 'depth.view',
      loadOp: 'clear',
      storeOp: 'discard',
      clearValue: 0.25,
    });
  });

  it('is emptied to the far end of the range, so a first surface at any distance is drawn', () => {
    const { gpu, backend } = backendOver();
    backend.program(tiltedFrame()).draw();

    // Depth reaches the card as 0 at the near plane and 1 at the far one, so a
    // first surface passes against an attachment emptied to 1 and none passes
    // against one emptied to 0.
    expect(gpu.calls('beginRenderPass')[0]?.depth).toMatchObject({ loadOp: 'clear', clearValue: 1 });
  });

  it('keeps what the pass before it wrote where the description names no value', () => {
    const { gpu, backend } = backendOver();
    backend.program(crossingFrame()).draw();

    // The second surface is tested against the first, so emptying the attachment
    // between the two passes is the whole picture lost: every surface would pass
    // against a fresh one and the last drawn would win.
    expect(gpu.calls('beginRenderPass').map((call) => (call.depth as { loadOp: string }).loadOp)).toEqual([
      'clear',
      'load',
    ]);
    expect(gpu.calls('beginRenderPass')[1]?.depth).toMatchObject({ loadOp: 'load', clearValue: undefined });
  });

  it('is left off a pass the description keeps no depth for', () => {
    const { gpu, backend } = backendOver();
    const frame = tiltedFrame();
    const pipelines = [{ ...(frame.pipelines[0] as RenderPipelineSpec), depth: undefined }];
    backend.program(tiltedFrame({ pipelines, passes: [{ pipeline: 'far', draws: [{ vertices: 3 }] }] })).draw();

    expect(gpu.calls('beginRenderPass')[0]?.depth).toBeUndefined();
  });

  it('is rebuilt at the new size on a resize, and the pass is given a view of the new one', () => {
    const { gpu, backend } = backendOver();
    const program = backend.program(tiltedFrame());
    program.draw();
    backend.resize(400, 300);
    program.draw();

    // A texture following the frame is thrown away and remade, so the view the
    // pass held is a view of a texture that no longer exists.
    expect(madeDepth(gpu).map((call) => call.size)).toEqual([
      [800, 600],
      [400, 300],
    ]);
    expect(gpu.calls('texture.destroy').map((call) => call.label)).toContain('depth');
    expect(gpu.calls('createView').filter((call) => call.label === 'depth')).toHaveLength(2);
  });

  it('goes when the program does, the same as every other texture it owns', () => {
    const { gpu, backend } = backendOver();
    backend.program(tiltedFrame()).dispose();

    expect(gpu.calls('texture.destroy').map((call) => call.label)).toContain('depth');
  });
});

describe('the depth state a pipeline draws under', () => {
  it('is given the format, the comparison and whether a fragment that passes writes', () => {
    const { gpu, backend } = backendOver();
    backend.program(tiltedFrame());

    const descriptor = gpu.calls('createRenderPipeline')[0]?.descriptor as GPURenderPipelineDescriptor;
    expect(descriptor.depthStencil).toEqual({
      format: 'depth24plus',
      depthCompare: 'less',
      depthWriteEnabled: true,
    });
  });

  it('is absent from a pipeline the description does not test, which is every shader on the site', () => {
    const { gpu, backend } = backendOver();
    const frame = tiltedFrame();
    const pipelines = [{ ...(frame.pipelines[0] as RenderPipelineSpec), depth: undefined }];
    backend.program(tiltedFrame({ pipelines, passes: [{ pipeline: 'far', draws: [{ vertices: 3 }] }] }));

    const descriptor = gpu.calls('createRenderPipeline')[0]?.descriptor as GPURenderPipelineDescriptor;
    expect(descriptor.depthStencil).toBeUndefined();
  });

  it('is one state per pipeline over one attachment, so two surfaces are tested differently', () => {
    const { gpu, backend } = backendOver();
    backend.program(crossingFrame()).draw();

    expect(
      gpu.calls('createRenderPipeline').map((call) => [call.fragmentEntry, (call.depth as { write: boolean }).write])
    ).toEqual([
      ['far', true],
      ['near', false],
    ]);
    // Both passes attach the same texture, which is what makes the second
    // surface tested against the first rather than against a fresh one.
    expect(gpu.calls('beginRenderPass').map((call) => (call.depth as { view: string }).view)).toEqual([
      'depth.view',
      'depth.view',
    ]);
  });
});

describe('what a description disagreeing with itself about depth is refused with', () => {
  const refuses = (over: Partial<FrameGraph>, said: string) => {
    const { backend } = backendOver();
    expect(() => backend.program(tiltedFrame(over))).toThrow(said);
  };

  it('refuses a pipeline testing depth over a pass that attaches nothing to keep it in', () => {
    refuses(
      { passes: [{ pipeline: 'far', draws: [{ vertices: 3 }] }] },
      'the pass on "far" tests depth and attaches nothing to keep it in'
    );
  });

  it('refuses a pass keeping depth through a pipeline that tests none', () => {
    const frame = tiltedFrame();
    refuses(
      { pipelines: [{ ...(frame.pipelines[0] as RenderPipelineSpec), depth: undefined }] },
      'the pass on "far" keeps depth in "depth" and its pipeline tests none'
    );
  });

  it('refuses a name that is no texture the frame declares', () => {
    refuses(
      { passes: [{ pipeline: 'far', draws: [{ vertices: 3 }], depth: { resource: 'uniforms' } }] },
      'the frame for "fixture-depth" keeps depth in "uniforms", which is no texture it declares'
    );
  });

  it('refuses a texture in a format the pipeline does not test against', () => {
    const frame = tiltedFrame();
    refuses(
      { resources: [frame.resources[0] as never, kept({ format: 'depth32float' })] },
      'the pass on "far" tests depth as depth24plus and keeps it in "depth", which is depth32float'
    );
  });

  it('refuses a texture that never asked to be an attachment', () => {
    const frame = tiltedFrame();
    refuses(
      { resources: [frame.resources[0] as never, kept({ use: ['sample'] })] },
      'the frame for "fixture-depth" keeps depth in "depth", which is no attachment it declares'
    );
  });

  it('refuses a pass keeping a depth no earlier pass of the frame wrote', () => {
    refuses(
      { passes: [{ pipeline: 'far', draws: [{ vertices: 3 }], depth: { resource: 'depth' } }] },
      'the pass on "far" keeps the depth in "depth", which no earlier pass wrote'
    );
  });

  it('refuses a format carrying a stencil no pipeline says anything about the mask of', () => {
    // The card would give the depth half alone and draw wherever the memory
    // behind the mask happened to hold the reference, so the disagreement is
    // named here rather than left to the driver.
    const frame = tiltedFrame();
    const stencilled = {
      ...(frame.pipelines[0] as RenderPipelineSpec),
      depth: { format: 'depth24plus-stencil8' as const, compare: 'less' as const, write: true },
    };
    refuses(
      { pipelines: [stencilled], resources: [frame.resources[0] as never, kept({ format: 'depth24plus-stencil8' })] },
      'keeps a stencil in depth24plus-stencil8 and its pipeline says nothing about the mask'
    );
  });
});
