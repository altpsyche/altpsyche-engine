import { describe, expect, it } from 'vitest';
import { createWebGPUBackend } from '../gpu/webgpu';
import { createFakeGPU } from './support/fake-gpu';
import type { RenderPipelineSpec, FrameGraph, TextureResource } from '@altpsyche/engine';

/**
 * A fragment stage returning more than one colour, and a colour mixed with what
 * the attachment already held rather than replacing it.
 *
 * The two halves are split the way the card takes them. A format and a blend are
 * compiled into the pipeline, and the textures are what a pass is opened with, so
 * two passes writing one set of textures is how a surface comes to be drawn over
 * another one. A pipeline naming its own targets writes textures and not the
 * frame, which is what keeps the frame's own format the backend's answer alone:
 * a description that carried a copy of it could disagree with it.
 *
 * Nothing here draws, so what the second colour holds is a frame rather than a
 * trace. That is the preset's to answer.
 */

const TWO = `struct Uniforms { u_time: f32, u_resolution: vec2<f32> };
@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct Colours { @location(0) picture: vec4<f32>, @location(1) distance: vec4<f32> };

@vertex
fn corners(@builtin(vertex_index) which: u32) -> @builtin(position) vec4<f32> {
  var at = array(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
  return vec4<f32>(at[which], 0.0, 1.0);
}

@fragment
fn both(@builtin(position) at: vec4<f32>) -> Colours {
  let shade = at.xy / uniforms.u_resolution;
  return Colours(vec4<f32>(shade, uniforms.u_time, 1.0), vec4<f32>(vec3<f32>(at.z), 1.0));
}`;

/** Alpha as the card mixes it: the new colour by its own alpha, plus what was
 * there by one minus it. */
const OVER: GPUBlendState = {
  color: { operation: 'add', srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
  alpha: { operation: 'add', srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
};

const holds = (name: string, over: Partial<TextureResource> = {}): TextureResource => ({
  kind: 'texture',
  name,
  size: { scale: 1 },
  format: 'rgba8unorm',
  use: ['attachment'],
  ...over,
});

/** Two colours out of one fragment stage into two textures, with the first of
 * them the one a reader sees. */
const pairFrame = (over: Partial<FrameGraph> = {}): FrameGraph => ({
  id: 'fixture-targets',
  target: 'wgsl',
  resources: [
    { kind: 'uniform', name: 'uniforms', block: [{ name: 'u_time', offset: 0, size: 4 }] },
    holds('picture'),
    holds('distance'),
  ],
  modules: [{ name: 'wgsl', code: TWO }],
  pipelines: [
    {
      kind: 'render',
      name: 'both',
      vertex: { module: 'wgsl', entry: 'corners' },
      fragment: { module: 'wgsl', entry: 'both' },
      bindings: [{ group: 0, binding: 0, resource: 'uniforms', visibility: ['fragment'] }],
      targets: [{ format: 'rgba8unorm' }, { format: 'rgba8unorm' }],
    },
  ],
  passes: [
    {
      pipeline: 'both',
      draws: [{ vertices: 3 }],
      colour: [
        { resource: 'picture', clear: [0, 0, 0, 1] },
        { resource: 'distance', clear: [1, 1, 1, 1] },
      ],
    },
  ],
  present: 'picture',
  ...over,
});

function backendOver() {
  const gpu = createFakeGPU({ connected: false });
  const backend = createWebGPUBackend(gpu.canvas, gpu.device);
  if (!backend) throw new Error('the fake canvas gave no WebGPU context');
  backend.resize(800, 600);
  return { gpu, backend };
}

const attachments = (gpu: ReturnType<typeof createFakeGPU>, pass = 0) =>
  gpu.calls('beginRenderPass')[pass]?.colour as { view: string; loadOp: string; clearValue: unknown }[];

describe('a fragment stage writing more than one colour', () => {
  it('is given one target per colour, in the order the stage returns them', () => {
    const { gpu, backend } = backendOver();
    backend.program(pairFrame());

    const descriptor = gpu.calls('createRenderPipeline')[0]?.descriptor as GPURenderPipelineDescriptor;
    expect([...(descriptor.fragment?.targets ?? [])]).toEqual([{ format: 'rgba8unorm' }, { format: 'rgba8unorm' }]);
  });

  it('writes the textures the pass attaches rather than the frame the backend holds', () => {
    const { gpu, backend } = backendOver();
    backend.program(pairFrame()).draw();

    expect(attachments(gpu).map((attachment) => attachment.view)).toEqual(['picture.view', 'distance.view']);
    // The frame is copied from whichever texture the description shows, so the
    // one the reader sees is named rather than being whichever the card happened
    // to hold.
    expect(gpu.calls('copyTextureToTexture').map((call) => [call.from, call.to])).toEqual([['picture', 'frame']]);
  });

  it('empties each attachment to the value it names', () => {
    const { gpu, backend } = backendOver();
    backend.program(pairFrame()).draw();

    expect(attachments(gpu).map((attachment) => [attachment.loadOp, attachment.clearValue])).toEqual([
      ['clear', { r: 0, g: 0, b: 0, a: 1 }],
      ['clear', { r: 1, g: 1, b: 1, a: 1 }],
    ]);
  });

  it('merges a second pass that loads the same attachments into one render pass', () => {
    const { gpu, backend } = backendOver();
    const frame = pairFrame();
    const second = {
      pipeline: 'both',
      draws: [{ vertices: 3 }],
      colour: [{ resource: 'picture' }, { resource: 'distance' }],
    };
    backend.program(pairFrame({ passes: [...frame.passes, second] })).draw();

    // The second pass names no clear, so it builds on the first over the same
    // two attachments, and its pipeline samples neither — so the two draws are
    // one render pass rather than two, which is item 1's pass merge and what the
    // recording double counts as one `beginRenderPass`.
    expect(gpu.calls('beginRenderPass')).toHaveLength(1);
    // The one pass opens with the first pass's clears — a merge never re-clears
    // between the draws it joins — and replays both passes' recorded draws into it.
    expect(attachments(gpu).map((attachment) => [attachment.loadOp, attachment.clearValue])).toEqual([
      ['clear', { r: 0, g: 0, b: 0, a: 1 }],
      ['clear', { r: 1, g: 1, b: 1, a: 1 }],
    ]);
    expect(gpu.calls('executeBundles')[0]?.bundles).toHaveLength(2);
  });

  it('writes the frame itself where the pipeline names no targets, which is every shader on the site', () => {
    const { gpu, backend } = backendOver();
    const frame = pairFrame();
    const single = { ...(frame.pipelines[0] as RenderPipelineSpec), targets: undefined };
    backend
      .program(
        pairFrame({ pipelines: [single], passes: [{ pipeline: 'both', draws: [{ vertices: 3 }] }], present: undefined })
      )
      .draw();

    const descriptor = gpu.calls('createRenderPipeline')[0]?.descriptor as GPURenderPipelineDescriptor;
    expect([...(descriptor.fragment?.targets ?? [])]).toEqual([{ format: 'rgba8unorm' }]);
    expect(attachments(gpu).map((attachment) => [attachment.view, attachment.loadOp])).toEqual([
      ['frame.view', 'clear'],
    ]);
  });

  it('turns with the swap, so a pass never writes the half its pipeline is reading', () => {
    const { gpu, backend } = backendOver();
    const frame = pairFrame();
    const program = backend.program(
      pairFrame({
        // The pair is declared both ways round for the same reason a binding is:
        // one half is read this frame and written the next, and which is which is
        // the backend's business rather than the source's.
        resources: [
          frame.resources[0] as never,
          holds('picture', { use: ['attachment', 'sample'] }),
          holds('distance', { use: ['attachment', 'sample'] }),
        ],
        swap: [['picture', 'distance']],
      })
    );
    program.draw();
    program.draw();

    expect([0, 1].map((pass) => attachments(gpu, pass).map((attachment) => attachment.view))).toEqual([
      ['picture.view', 'distance.view'],
      ['distance.view', 'picture.view'],
    ]);
  });
});

describe('a colour mixed with what the attachment held', () => {
  const blended = (): FrameGraph => {
    const frame = pairFrame();
    const pipeline = frame.pipelines[0] as RenderPipelineSpec;
    return {
      ...frame,
      pipelines: [{ ...pipeline, targets: [{ format: 'rgba8unorm', blend: OVER }, { format: 'rgba8unorm' }] }],
    };
  };

  it('reaches the card on the target it was named on and on no other', () => {
    const { gpu, backend } = backendOver();
    backend.program(blended());

    const descriptor = gpu.calls('createRenderPipeline')[0]?.descriptor as GPURenderPipelineDescriptor;
    expect([...(descriptor.fragment?.targets ?? [])]).toEqual([
      { format: 'rgba8unorm', blend: OVER },
      { format: 'rgba8unorm' },
    ]);
  });

  it('is written into the trace beside the format, since both are the pipeline rather than the pass', () => {
    const { gpu, backend } = backendOver();
    backend.program(blended());

    expect(gpu.calls('createRenderPipeline')[0]?.targets).toEqual([
      { format: 'rgba8unorm', blend: OVER },
      { format: 'rgba8unorm', blend: undefined },
    ]);
  });
});

describe('what a description disagreeing with itself about its colours is refused with', () => {
  const refuses = (over: Partial<FrameGraph>, said: string) => {
    const { backend } = backendOver();
    expect(() => backend.program(pairFrame(over))).toThrow(said);
  };

  it('refuses a pipeline writing colours the pass attaches nothing for', () => {
    refuses(
      { passes: [{ pipeline: 'both', draws: [{ vertices: 3 }] }] },
      'the pass on "both" writes 2 colours and attaches none'
    );
  });

  it('refuses a pass attaching textures through a pipeline that writes the frame', () => {
    const frame = pairFrame();
    refuses(
      { pipelines: [{ ...(frame.pipelines[0] as RenderPipelineSpec), targets: undefined }] },
      'the pass on "both" attaches 2 textures and its pipeline writes the frame'
    );
  });

  it('refuses a count that does not match, rather than writing as many as it has', () => {
    refuses(
      { passes: [{ pipeline: 'both', draws: [{ vertices: 3 }], colour: [{ resource: 'picture', clear: [0, 0, 0, 1] }] }] },
      'the pass on "both" writes 2 colours and attaches 1 textures'
    );
  });

  it('refuses a name that is no texture the frame declares', () => {
    const frame = pairFrame();
    const passes = [
      {
        pipeline: 'both',
        draws: [{ vertices: 3 }],
        colour: [
          { resource: 'picture', clear: [0, 0, 0, 1] as [number, number, number, number] },
          { resource: 'uniforms' },
        ],
      },
    ];
    refuses(
      { passes, present: frame.present },
      'the frame for "fixture-targets" writes colour into "uniforms", which is no texture it declares'
    );
  });

  it('refuses a texture in a format the colour written into it is not', () => {
    refuses(
      {
        resources: [pairFrame().resources[0] as never, holds('picture'), holds('distance', { format: 'rgba16float' })],
      },
      'the pass on "both" writes colour 1 as rgba8unorm into "distance", which is rgba16float'
    );
  });

  it('refuses a texture that never asked to be an attachment', () => {
    refuses(
      { resources: [pairFrame().resources[0] as never, holds('picture'), holds('distance', { use: ['sample'] })] },
      'the frame for "fixture-targets" writes colour into "distance", which is no attachment it declares'
    );
  });

  it('refuses a pass keeping a colour no earlier pass of the frame wrote', () => {
    refuses(
      {
        passes: [
          { pipeline: 'both', draws: [{ vertices: 3 }], colour: [{ resource: 'picture' }, { resource: 'distance' }] },
        ],
      },
      'the pass on "both" keeps the colour in "picture", which no earlier pass wrote'
    );
  });
});
