import { describe, expect, it } from 'vitest';
import { validate } from '../graph/validate';
import { buffer, pipelineHandle, uniform, vertices } from '../graph/handles';
import type { DrawSpec, FrameGraph, RenderPipelineSpec, VertexResource } from '@altpsyche/engine';

/**
 * Which draw form a pass may use, held independently of either backend (item 10).
 *
 * **Why this file exists rather than a check beside each backend.** Both of these
 * rules were already written, and that is what made them a defect. The first lived
 * in `gpu/webgl2.ts` alone, so a description WebGL 2 refused by name was one WebGPU
 * built and handed to the card — which refused it after the fact with a message
 * naming neither the draw nor the pipeline, while `resolve` and `cost` had both
 * passed it. The second lived in two places at once, `submit/plan.ts` for WebGPU and
 * `gpu/webgl2.ts` for WebGL 2, in two different sentences for one rule.
 *
 * So the rules moved into `graph/validate.ts` and these read them there. **Nothing
 * in this file imports a backend or a device**, which is the point: a rule decidable
 * from the graph alone is tested from the graph alone, and a backend's copy of it
 * can go without these noticing — which is what says the copies are backstops now
 * rather than the load-bearing refusal.
 */

const SOURCE = `struct U { u_time: f32 };
@group(0) @binding(0) var<uniform> uniforms: U;
@vertex fn warp(@location(0) at: vec2<f32>) -> @builtin(position) vec4<f32> {
  return vec4<f32>(at, 0.0, 1.0);
}
@fragment fn shade() -> @location(0) vec4<f32> {
  return vec4<f32>(uniforms.u_time, 0.0, 0.0, 1.0);
}`;

const mesh: VertexResource = {
  kind: 'vertices',
  stride: 8,
  attributes: [{ location: 0, offset: 0, format: 'float32x2' }],
  topology: 'triangle-list',
  count: 3,
  data: new Uint8Array(24),
};

/** One render pass over one pipeline, which either reads geometry or does not. */
const frameOf = (reads: boolean, draws: DrawSpec[]): FrameGraph => {
  const pipeline: RenderPipelineSpec = {
    kind: 'render',
    source: { wgsl: { vertex: SOURCE, fragment: SOURCE } },
    vertex: { document: 'wgsl', entry: 'warp' },
    fragment: { document: 'wgsl', entry: 'shade' },
    ...(reads ? { geometry: vertices(1) } : {}),
    bindings: [{ group: 0, binding: 0, resource: uniform(0), visibility: ['fragment'] }],
  };
  return {
    id: 'draw-forms',
    authored: 'wgsl',
    resources: [{ kind: 'uniform', block: [{ name: 'u_time', offset: 0, size: 4 }] }, mesh],
    modules: [],
    pipelines: [pipeline],
    passes: [{ pipeline: pipelineHandle(0), draws }],
  } as FrameGraph;
};

describe('a pipeline that reads geometry is drawn by instances and not by its own corners', () => {
  it('refuses a corners draw, naming the pipeline and the resource it reads', () => {
    // The pairing the card refuses with "Vertex buffer slot 0 required by
    // [RenderPipeline (unlabeled)] was not set", which names neither the draw nor
    // the pipeline and arrives only once a frame has been built and submitted.
    expect(() => validate(frameOf(true, [{ vertices: 3 }]))).toThrow(
      'the pass on pipeline 0 draws 3 corners of its own and its pipeline reads geometry from resource 1'
    );
  });

  it('refuses it where one corners draw sits among instances draws that are fine', () => {
    // Every draw is asked rather than the first, because a pass mixing the two is a
    // pass where the good draws would hide the bad one.
    expect(() => validate(frameOf(true, [{ instances: 2 }, { vertices: 3 }]))).toThrow('draws 3 corners of its own');
  });

  it('takes an instances draw, which is the form that binds the buffer', () => {
    expect(() => validate(frameOf(true, [{ instances: 1 }]))).not.toThrow();
  });
});

describe('a pipeline that reads no geometry is drawn by its own corners', () => {
  it('refuses an instances draw, which has no count of vertices from anywhere', () => {
    // The form leaves the count to the resource and the pipeline names no resource,
    // so the executor reaches none of its three arms and the draw is skipped in
    // silence — a frame that costs one draw and makes none.
    expect(() => validate(frameOf(false, [{ instances: 3 }]))).toThrow(
      "the pass on pipeline 0 draws its pipeline's geometry and that pipeline reads none"
    );
  });

  it('takes a corners draw, which is the form that needs no buffer', () => {
    expect(() => validate(frameOf(false, [{ vertices: 3 }]))).not.toThrow();
  });
});

describe('what the two rules deliberately leave alone', () => {
  it('takes an indirect draw on a pipeline that reads no geometry', () => {
    // `drawIndirect` reads its vertex count out of the buffer, so a geometry-less
    // pipeline drawn indirectly is a description WebGPU draws correctly. WebGL 2 has
    // no call for it and refuses it by the capability it names, which is a backend's
    // rule and stays in that backend — this asserts the graph rule does not take it
    // over and refuse a frame one backend draws.
    const frame = frameOf(false, [{ instances: 1 }]);
    const indirect = {
      ...frame,
      resources: [...frame.resources, { kind: 'buffer', bytes: 16 }],
      passes: [{ pipeline: pipelineHandle(0), draws: [{ indirect: buffer(2) }] }],
    } as unknown as FrameGraph;
    expect(() => validate(indirect)).not.toThrow();
  });
});
