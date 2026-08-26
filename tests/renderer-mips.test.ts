import type { WgslFrameGraph } from '@altpsyche/engine';
import { describe, expect, it } from 'vitest';
import { createWebGPUBackend } from '../gpu/webgpu';
import { createFakeGPU } from './support/fake-gpu';
import { moduleHandle, pipelineHandle, sampler, texture, uniform } from '../graph/handles.js';
import type { FrameGraph, TextureResource } from '@altpsyche/engine';

/**
 * A texture carrying a ladder of smaller copies of itself, so it can be read at
 * any size without the picture sparkling as it shrinks.
 *
 * Nothing in WebGPU makes them. The backend draws each level from the level above
 * it with a program of its own, the same way it owns the three corners that cover
 * a frame, and the count of levels is worked out from the size rather than
 * declared: a count that disagrees with the size is a level the card either
 * refuses to make or never fills.
 *
 * What the levels look like is a picture rather than a trace, which is the
 * preset's to answer. What is here is that every level exists, that each is drawn
 * from the one above it, and that the drawing happens when the contents arrive
 * rather than every frame.
 */

const READS = `struct Uniforms { u_time: f32, u_resolution: vec2<f32> };
@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var grain: texture_2d<f32>;
@group(0) @binding(2) var grainSampler: sampler;

@fragment
fn fragMain(@builtin(position) at: vec4<f32>) -> @location(0) vec4<f32> {
  let across = at.xy / uniforms.u_resolution;
  return textureSampleLevel(grain, grainSampler, across, across.x * 4.0);
}`;

const BYTES = new Uint8Array(64 * 64 * 4).fill(128);

const grain = (over: Partial<TextureResource> = {}): TextureResource => ({
  kind: 'texture',
  size: { width: 64, height: 64 },
  format: 'rgba8unorm',
  use: ['sample'],
  mips: 'generate',
  data: BYTES,
  ...over,
});

const laddered = (over: Partial<WgslFrameGraph> = {}): FrameGraph => ({
  id: 'fixture-mips',
  authored: 'wgsl',
  // uniforms=0, grain=1, grainSampler=2 — each named below by its index.
  resources: [
    { kind: 'uniform', block: [{ name: 'u_time', offset: 0, size: 4 }] },
    grain(),
    { kind: 'sampler', filter: 'linear', wrap: 'clamp' },
  ],
  modules: [],
  pipelines: [
    {
      kind: 'render',
      source: { wgsl: { vertex: READS, fragment: READS } },
      fragment: { document: 'wgsl', entry: 'fragMain' },
      bindings: [
        { group: 0, binding: 0, resource: uniform(0), visibility: ['fragment'] },
        { group: 0, binding: 1, resource: texture(1), visibility: ['fragment'], reads: 'sample' },
        { group: 0, binding: 2, resource: sampler(2), visibility: ['fragment'] },
      ],
    },
  ],
  passes: [{ pipeline: pipelineHandle(0), draws: [{ vertices: 3 }] }],
  ...over,
});

function backendOver() {
  const gpu = createFakeGPU({ connected: false });
  const backend = createWebGPUBackend(gpu.canvas, gpu.device);
  if (!backend) throw new Error('the fake canvas gave no WebGPU context');
  backend.resize(800, 600);
  return { gpu, backend };
}

// `grain` sits at resource index 1, so the backend labels its texture `texture1`.
const made = (gpu: ReturnType<typeof createFakeGPU>) =>
  gpu.calls('createTexture').find((call) => call.label === 'texture1');

describe('the levels a laddered texture is made with', () => {
  it('is as many as halving the longest side reaches, which is 7 for a 64 pixel picture', () => {
    const { gpu, backend } = backendOver();
    backend.program(laddered());

    expect(made(gpu)?.levels).toBe(7);
  });

  it('counts off the longer side, so a picture wider than it is tall gets the wider one’s ladder', () => {
    const { gpu, backend } = backendOver();
    backend.program(
      laddered({
        resources: [...laddered().resources.slice(0, 1), grain({ size: { width: 256, height: 64 } }), ...laddered().resources.slice(2)],
      })
    );

    expect(made(gpu)?.levels).toBe(9);
  });

  it('leaves a texture read at its own size with no ladder at all', () => {
    const { gpu, backend } = backendOver();
    const plain = laddered().resources.map((one) => (one.kind === 'texture' ? grain({ mips: undefined }) : one));
    backend.program(laddered({ resources: plain }));

    expect(made(gpu)?.levels).toBeUndefined();
  });

  it('asks to be drawn into as well as read, since every level below the first is drawn', () => {
    const { gpu, backend } = backendOver();
    backend.program(laddered());

    expect(made(gpu)?.usage).toBe(
      GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
    );
  });
});

describe('the passes that fill the ladder', () => {
  it('is one per level below the first, each drawing three corners', () => {
    const { gpu, backend } = backendOver();
    backend.program(laddered());

    // Six passes for seven levels: the first level is the contents that arrived.
    expect(gpu.calls('beginRenderPass')).toHaveLength(6);
    // Six ladder draws of three corners each, then the frame pass's own three
    // corners recorded once into its bundle, which is a draw and not a pass.
    expect(gpu.calls('draw').map((call) => call.count)).toEqual([3, 3, 3, 3, 3, 3, 3]);
    expect(gpu.calls('createRenderBundleEncoder')).toHaveLength(1);
  });

  it('draws each level from the level above it, one level at a time', () => {
    const { gpu, backend } = backendOver();
    backend.program(laddered());

    // Two views a pass, the level being drawn into and the level being read, and
    // one more with no level at all, which is the shader's own binding of the
    // whole picture.
    const views = gpu.calls('createView').filter((call) => call.label === 'texture1');
    expect(views.filter((call) => call.level === undefined)).toHaveLength(1);
    expect(views.filter((call) => call.level !== undefined).map((call) => [call.level, call.levels])).toEqual([
      [1, 1],
      [0, 1],
      [2, 1],
      [1, 1],
      [3, 1],
      [2, 1],
      [4, 1],
      [3, 1],
      [5, 1],
      [4, 1],
      [6, 1],
      [5, 1],
    ]);
  });

  it('happens after the contents arrive, since a level is an average of the one above it', () => {
    const { gpu, backend } = backendOver();
    backend.program(laddered());

    const written = gpu.trace.findIndex((entry) => entry.call === 'writeTexture');
    const drawn = gpu.trace.findIndex((entry) => entry.call === 'beginRenderPass');
    expect(written).toBeGreaterThan(-1);
    expect(drawn).toBeGreaterThan(written);
  });

  it('happens once rather than every frame, because the contents it averages arrive once', () => {
    const { gpu, backend } = backendOver();
    const program = backend.program(laddered());
    program.draw();
    program.draw();

    // Six for the ladder and one per frame for the shader itself.
    expect(gpu.calls('beginRenderPass')).toHaveLength(8);
  });

  it('builds one pipeline and one sampler for every ladder rather than one per texture', () => {
    const { gpu, backend } = backendOver();
    backend.program(laddered());

    expect(gpu.calls('createRenderPipeline')).toHaveLength(2);
    expect(gpu.calls('createSampler').map((call) => call.label)).toEqual(['sampler2', 'averaging']);
  });

  it('refuses a ladder over a texture the frame writes, since nothing redraws the levels', () => {
    const { backend } = backendOver();
    const written = laddered().resources.map((one) =>
      one.kind === 'texture' ? grain({ use: ['storage'], data: undefined }) : one
    );

    expect(() => backend.program(laddered({ resources: written }))).toThrow(
      'the frame for "fixture-mips" gives resource 1 a ladder and writes it every frame'
    );
  });
});
