import type { WgslFrameGraph } from '@altpsyche/engine';
import { describe, expect, it } from 'vitest';
import { createWebGPUBackend } from '../gpu/webgpu';
import { createFakeGPU } from './support/fake-gpu';
import { moduleHandle, pipelineHandle, texture, uniform } from '../graph/handles.js';
import type {
  RenderPassSpec,
  RenderPipelineSpec,
  FrameGraph,
  StencilMode,
  TextureResource,
} from '@altpsyche/engine';

/**
 * A mask one surface leaves behind for another to be cut by.
 *
 * A stencil is a number kept per pixel, written by the pass that marks and
 * compared by the pass that draws inside the mark. What each pass does to it is a
 * named mode rather than the card's own comparison, three operations and two masks
 * per face, so what these hold is the name turning into the right fields: a mode
 * that marked where it should have tested draws the whole frame and a mode that
 * wrote where it should have kept leaves a mask the next pass cannot use.
 *
 * The value the mask carries is the modes' own, so nothing declares it and nothing
 * can disagree about it. It reaches the card on the pass rather than in the
 * pipeline, which is where the card takes it.
 *
 * Nothing here draws. Whether the mask cut the picture is a frame rather than a
 * trace, which is what the preset the browser gates draw is for.
 */

const SHEETS = `struct Uniforms { u_time: f32, u_resolution: vec2<f32> };
@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct Vertex { @builtin(position) at: vec4<f32>, @location(0) place: vec2<f32> };

@vertex
fn corner(@builtin(vertex_index) which: u32) -> Vertex {
  let place = vec2<f32>(f32(which & 1u), f32(which >> 1u)) * 4.0 - 1.0;
  return Vertex(vec4<f32>(place, 0.5, 1.0), place);
}

@fragment
fn marking(shaded: Vertex) -> @location(0) vec4<f32> {
  return vec4<f32>(shaded.place, uniforms.u_time, 1.0);
}

@fragment
fn filling(shaded: Vertex) -> @location(0) vec4<f32> {
  return vec4<f32>(shaded.place.yx, 1.0, 1.0);
}`;

const mask = (over: Partial<TextureResource> = {}): TextureResource => ({
  kind: 'texture',
  size: { scale: 1 },
  format: 'stencil8',
  use: ['attachment'],
  ...over,
});

/** One pass marking the mask and one drawn only inside the mark, which is the
 * smallest frame a stencil does anything in. */
const masked = (over: Partial<WgslFrameGraph> = {}): FrameGraph => ({
  id: 'fixture-stencil',
  authored: 'wgsl',
  resources: [{ kind: 'uniform', block: [{ name: 'u_time', offset: 0, size: 4 }] }, mask()],
  modules: [],
  pipelines: [
    {
      kind: 'render',
      source: { wgsl: { vertex: SHEETS, fragment: SHEETS } },
      vertex: { document: 'wgsl', entry: 'corner' },
      fragment: { document: 'wgsl', entry: 'marking' },
      bindings: [{ group: 0, binding: 0, resource: uniform(0), visibility: ['fragment'] }],
      depth: { format: 'stencil8', stencil: 'mark' },
    },
    {
      kind: 'render',
      source: { wgsl: { vertex: SHEETS, fragment: SHEETS } },
      vertex: { document: 'wgsl', entry: 'corner' },
      fragment: { document: 'wgsl', entry: 'filling' },
      bindings: [{ group: 0, binding: 0, resource: uniform(0), visibility: ['fragment'] }],
      depth: { format: 'stencil8', stencil: 'inside' },
    },
  ],
  passes: [
    { pipeline: pipelineHandle(0), draws: [{ vertices: 3 }], depth: { resource: texture(1), stencilClear: 0 } },
    { pipeline: pipelineHandle(1), draws: [{ vertices: 3 }], depth: { resource: texture(1) } },
  ],
  ...over,
});

function backendOver() {
  const gpu = createFakeGPU({ connected: false });
  const backend = createWebGPUBackend(gpu.canvas, gpu.device);
  if (!backend) throw new Error('the fake canvas gave no WebGPU context');
  backend.resize(800, 600);
  return { gpu, backend };
}

/** What the description says, refused by a message naming both halves of the
 * disagreement rather than whichever call the card took second. */
function refuses(over: Partial<WgslFrameGraph>, said: string) {
  const { backend } = backendOver();
  expect(() => backend.program(masked(over)).draw()).toThrow(said);
}

/** The same frame with the two pipelines' modes replaced, which is how the
 * counting pair is read off the same two passes as the mask pair. */
const under = (first: StencilMode, second: StencilMode): Partial<WgslFrameGraph> => {
  const base = masked() as WgslFrameGraph;
  const pipelines = (base.pipelines as RenderPipelineSpec[]).map((spec, at) => ({
    ...spec,
    depth: { format: 'stencil8' as const, stencil: at === 0 ? first : second },
  }));
  return { pipelines };
};

describe('what each mode becomes on the card', () => {
  it('marks by passing always and leaving the value behind, writing every bit', () => {
    const { gpu, backend } = backendOver();
    backend.program(masked());

    expect(gpu.calls('createRenderPipeline')[0]?.depth).toMatchObject({
      format: 'stencil8',
      stencilFront: { compare: 'always', failOp: 'keep', depthFailOp: 'keep', passOp: 'replace' },
      stencilBack: { compare: 'always', failOp: 'keep', depthFailOp: 'keep', passOp: 'replace' },
      stencilWrites: 0xff,
    });
  });

  it('draws inside the mark by comparing for equality and leaving the mask alone', () => {
    const { gpu, backend } = backendOver();
    backend.program(masked());

    // Writing nothing is what lets a third pass be cut by the same shape, and a
    // mode that wrote here would leave the mask holding wherever this pass drew.
    expect(gpu.calls('createRenderPipeline')[1]?.depth).toMatchObject({
      stencilFront: { compare: 'equal', failOp: 'keep', depthFailOp: 'keep', passOp: 'keep' },
      stencilBack: { compare: 'equal', failOp: 'keep', depthFailOp: 'keep', passOp: 'keep' },
      stencilWrites: 0,
    });
  });

  it('counts by moving the two faces in opposite directions, which is the whole point of two', () => {
    const { gpu, backend } = backendOver();
    backend.program(masked(under('count', 'nonzero')));

    // A winding number is counted by letting the faces of a path's triangles
    // cancel, so a backend giving both faces one operation counts nothing and
    // draws a filled hole. This is the one place a pipeline this package builds
    // could not express a pipeline the specification describes.
    const depth = gpu.calls('createRenderPipeline')[0]?.depth as {
      stencilFront: { passOp?: string };
      stencilBack: { passOp?: string };
    };
    expect(depth.stencilFront.passOp).toBe('increment-wrap');
    expect(depth.stencilBack.passOp).toBe('decrement-wrap');
    expect(depth.stencilFront.passOp).not.toBe(depth.stencilBack.passOp);
  });

  it('wraps rather than clamps, since a back face can arrive before the front it cancels', () => {
    const { gpu, backend } = backendOver();
    backend.program(masked(under('count', 'nonzero')));

    // A clamp at zero would lose a back face that arrived first, and the order
    // faces arrive in is not the order they were wound.
    const depth = gpu.calls('createRenderPipeline')[0]?.depth as {
      stencilFront: { passOp?: string };
      stencilBack: { passOp?: string };
    };
    expect(depth.stencilFront.passOp).not.toBe('increment-clamp');
    expect(depth.stencilBack.passOp).not.toBe('decrement-clamp');
  });

  it('draws where the count did not come back to zero, and writes nothing doing it', () => {
    const { gpu, backend } = backendOver();
    backend.program(masked(under('count', 'nonzero')));

    expect(gpu.calls('createRenderPipeline')[1]?.depth).toMatchObject({
      stencilFront: { compare: 'not-equal', failOp: 'keep', depthFailOp: 'keep', passOp: 'keep' },
      stencilBack: { compare: 'not-equal', failOp: 'keep', depthFailOp: 'keep', passOp: 'keep' },
      stencilWrites: 0,
    });
  });

  it('tests the counter against zero, where the mask modes test against every bit', () => {
    const { gpu, backend } = backendOver();
    backend.program(masked(under('count', 'nonzero'))).draw();

    // The reference is what makes `nonzero` mean anything: compared against
    // every bit it would draw where the counter happened to reach 255, which is
    // why the reference belongs to the mode rather than to the file.
    expect(gpu.calls('setStencilReference').map((call) => call.reference)).toEqual([0, 0]);
  });

  it('leaves the depth half out for a format that keeps none', () => {
    const { gpu, backend } = backendOver();
    backend.program(masked());

    const depth = gpu.calls('createRenderPipeline')[0]?.depth as { compare?: string; write?: boolean };
    expect(depth.compare).toBeUndefined();
    expect(depth.write).toBeUndefined();
  });

  it('sets the value on every pass that masks, since the card takes it there', () => {
    const { gpu, backend } = backendOver();
    backend.program(masked()).draw();

    // A pass that never sets it masks against whatever the pass before it left,
    // and it is not compiled into the pipeline, so this is the only place it can
    // come from. It is the mask modes' reference — every bit — and it used to be
    // `1` here against `0xff` in the WebGL 2 backend, which item 2 collapsed into
    // the one table both backends now read.
    expect(gpu.calls('setStencilReference').map((call) => call.reference)).toEqual([0xff, 0xff]);
  });

  it('leaves a pass whose pipeline says nothing about a mask without one', () => {
    const { gpu, backend } = backendOver();
    const frame = masked();
    const pipelines = [{ ...(frame.pipelines[0] as RenderPipelineSpec), depth: undefined }];
    backend.program(masked({ pipelines, passes: [{ pipeline: pipelineHandle(0), draws: [{ vertices: 3 }] }] })).draw();

    expect(gpu.calls('setStencilReference')).toEqual([]);
  });
});

describe('the texture the mask is kept in', () => {
  it('is attached beside the colour, emptied where the pass names a value', () => {
    const { gpu, backend } = backendOver();
    backend.program(masked()).draw();

    expect(gpu.calls('beginRenderPass')[0]?.depth).toMatchObject({
      view: 'texture1.view',
      stencilLoadOp: 'clear',
      stencilClearValue: 0,
      stencilStoreOp: 'store',
    });
  });

  it('keeps what the marking pass left where the pass after it names no value', () => {
    const { gpu, backend } = backendOver();
    backend.program(masked()).draw();

    // Emptying it between the two passes is the mask lost: the second pass would
    // find nothing marked and draw nowhere at all.
    expect(gpu.calls('beginRenderPass')[1]?.depth).toMatchObject({
      stencilLoadOp: 'load',
      stencilClearValue: undefined,
    });
  });

  it('gets no depth operations at all, since the format keeps no depth to empty', () => {
    const { gpu, backend } = backendOver();
    backend.program(masked()).draw();

    const depth = gpu.calls('beginRenderPass')[0]?.depth as { loadOp?: string; storeOp?: string };
    expect(depth.loadOp).toBeUndefined();
    expect(depth.storeOp).toBeUndefined();
  });

  it('carries both halves where the format keeps both', () => {
    const { gpu, backend } = backendOver();
    const both = 'depth24plus-stencil8' as const;
    const frame = masked();
    const pipelines = frame.pipelines.map((one) => ({
      ...(one as RenderPipelineSpec),
      depth: {
        format: both,
        compare: 'less' as const,
        write: true,
        stencil: (one as RenderPipelineSpec).depth?.stencil,
      },
    }));
    const passes = [
      { ...(frame.passes[0] as RenderPassSpec), depth: { resource: texture(1), clear: 1, stencilClear: 0 } },
      frame.passes[1] as RenderPassSpec,
    ];
    backend
      .program(masked({ resources: [frame.resources[0] as never, mask({ format: both })], pipelines, passes }))
      .draw();

    expect(gpu.calls('beginRenderPass')[0]?.depth).toMatchObject({
      loadOp: 'clear',
      clearValue: 1,
      stencilLoadOp: 'clear',
      stencilClearValue: 0,
    });
  });
});

describe('what a description disagreeing with itself about a mask is refused with', () => {
  it('refuses a mask nothing wrote and the pass keeps', () => {
    const frame = masked();
    refuses(
      { passes: [{ ...(frame.passes[0] as RenderPassSpec), depth: { resource: texture(1) } }, frame.passes[1] as never] },
      'keeps the mask in resource 1, which no earlier pass wrote'
    );
  });

  it('refuses a mode over a format that keeps no stencil', () => {
    const frame = masked();
    const pipelines = frame.pipelines.map((one) => ({
      ...(one as RenderPipelineSpec),
      depth: { format: 'depth24plus' as const, compare: 'less' as const, write: true, stencil: 'mark' as const },
    }));
    refuses(
      { resources: [frame.resources[0] as never, mask({ format: 'depth24plus' })], pipelines },
      'masks with a stencil and keeps its depth as depth24plus'
    );
  });

  it('refuses a depth comparison over a format that keeps no depth', () => {
    const frame = masked();
    const pipelines = [
      {
        ...(frame.pipelines[0] as RenderPipelineSpec),
        depth: { format: 'stencil8' as const, compare: 'less' as const, write: true, stencil: 'mark' as const },
      },
      frame.pipelines[1] as never,
    ];
    refuses({ pipelines }, 'tests depth and keeps it as stencil8, which keeps none');
  });

  it('refuses a format keeping depth that no pipeline tests', () => {
    const frame = masked();
    const pipelines = frame.pipelines.map((one) => ({
      ...(one as RenderPipelineSpec),
      depth: {
        format: 'depth24plus-stencil8' as const,
        stencil: (one as RenderPipelineSpec).depth?.stencil,
      },
    }));
    refuses(
      { resources: [frame.resources[0] as never, mask({ format: 'depth24plus-stencil8' })], pipelines },
      'keeps depth as depth24plus-stencil8 and tests none of it'
    );
  });

  it('refuses a mask kept in a texture that never asked to be an attachment', () => {
    const frame = masked();
    refuses(
      { resources: [frame.resources[0] as never, mask({ use: ['sample'] })] },
      'keeps depth in resource 1, which is no attachment it declares'
    );
  });
});
