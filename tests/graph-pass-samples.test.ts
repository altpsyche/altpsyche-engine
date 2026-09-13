import { describe, expect, it } from 'vitest';
import { validate } from '../graph/validate';
import { createWebGL2Backend } from '../gpu/webgl2';
import { createWebGPUBackend } from '../gpu/webgpu';
import { createFakeGL } from './support/fake-gl';
import { createFakeGPU } from './support/fake-gpu';
import { pipelineHandle, texture, uniform } from '../graph/handles';
import type { FrameGraph, RenderPipelineSpec, TextureResource } from '@altpsyche/engine';

/**
 * Every attachment of one pass keeps the number of samples a pixel its pipeline was
 * built at, held independently of either backend (item 21's step 1).
 *
 * **Why this file exists rather than a check beside each backend**, which is item 4's
 * reason said again. The rule was written twice and in two wordings, and neither was
 * in `graph/validate.ts`: `submit/plan.ts` held it once for the colour attachments and
 * once for the depth, and that file is reached from the WebGPU backend alone, while
 * `gpu/webgl2.ts` stated the same fault as a capability of its own — "tests depth
 * against the multisample target resource N, which this backend does not". So one
 * description was refused by two sentences on two paths, and a caller comparing them
 * would have read a device difference where there is none.
 *
 * **There is no device difference to read.** Three devices were measured on
 * 2026-09-14 — nvidia, amd and SwiftShader, the reading is in `docs/DEVICES.md` — and
 * all three answer `FRAMEBUFFER_INCOMPLETE_MULTISAMPLE` for a four-sample colour
 * attachment beside a single-sample depth. A rule every device holds is a rule about
 * the description.
 *
 * **Red for the rule and not for the wording**, which is item 4's discipline: each
 * graph below breaks exactly this rule and is paired with the same graph minus the
 * fault, which must pass. The last two tests are the ones the step was taken for —
 * the same frame handed to each backend, and the same sentence back.
 */

const SOURCE = `struct U { u_time: f32 };
@group(0) @binding(0) var<uniform> uniforms: U;
@vertex fn warp(@builtin(vertex_index) which: u32) -> @builtin(position) vec4<f32> {
  return vec4<f32>(f32(which), 0.0, 0.0, 1.0);
}
@fragment fn shade() -> @location(0) vec4<f32> {
  return vec4<f32>(uniforms.u_time, 0.0, 0.0, 1.0);
}`;

const picture = (over: Partial<TextureResource> = {}): TextureResource => ({
  kind: 'texture',
  size: { scale: 1 },
  format: 'rgba8unorm',
  use: ['attachment'],
  ...over,
});

/**
 * One pass at four samples a pixel: a multisample colour attachment at index 1
 * averaged into index 2, a depth at index 3, and the pipeline carrying the same
 * count. Every graph below bends one of the three counts.
 */
const averaged = (over: Partial<FrameGraph> = {}, pipeline: Partial<RenderPipelineSpec> = {}): FrameGraph =>
  ({
    id: 'fixture-samples',
    authored: 'wgsl',
    resources: [
      { kind: 'uniform', block: [{ name: 'u_time', offset: 0, size: 4 }] },
      picture({ samples: 4 }),
      picture(),
      picture({ format: 'depth24plus', samples: 4 }),
    ],
    modules: [],
    pipelines: [
      {
        kind: 'render',
        source: { wgsl: { vertex: SOURCE, fragment: SOURCE } },
        vertex: { document: 'wgsl', entry: 'warp' },
        fragment: { document: 'wgsl', entry: 'shade' },
        bindings: [{ group: 0, binding: 0, resource: uniform(0), visibility: ['fragment'] }],
        targets: [{ format: 'rgba8unorm' }],
        samples: 4,
        depth: { format: 'depth24plus', compare: 'less-equal', write: true },
        ...pipeline,
      },
    ],
    passes: [
      {
        pipeline: pipelineHandle(0),
        draws: [{ vertices: 3 }],
        colour: [{ resource: texture(1), clear: [0, 0, 0, 1], resolve: texture(2) }],
        depth: { resource: texture(3), clear: 1 },
      },
    ],
    present: texture(2),
    ...over,
  }) as FrameGraph;

/** The same graph with one resource's count replaced, which is the one fault each
 * test below introduces. */
const counting = (at: number, samples: 4 | undefined): FrameGraph => {
  const base = averaged();
  const resources = base.resources.map((resource, index) => {
    if (index !== at || resource.kind !== 'texture') return resource;
    const { samples: _was, ...rest } = resource;
    return samples === undefined ? rest : { ...rest, samples };
  });
  return { ...base, resources } as FrameGraph;
};

describe('every attachment of one pass keeps the count its pipeline was built at', () => {
  it('passes the graph that agrees, so the tests below are red for the fault', () => {
    expect(() => validate(averaged())).not.toThrow();
  });

  it('refuses a colour attachment keeping fewer than the pipeline draws', () => {
    expect(() => validate(counting(1, undefined))).toThrow(
      'the pass on pipeline 0 draws 4 samples a pixel and attaches resource 1, which keeps 1'
    );
  });

  it('refuses a depth attachment keeping fewer than the pipeline draws, in the same sentence', () => {
    expect(() => validate(counting(3, undefined))).toThrow(
      'the pass on pipeline 0 draws 4 samples a pixel and attaches resource 3, which keeps 1'
    );
  });

  it('refuses an attachment keeping more than a single-sample pipeline draws', () => {
    const single = averaged({}, { samples: undefined });
    expect(() => validate(single)).toThrow(
      'the pass on pipeline 0 draws 1 samples a pixel and attaches resource 1, which keeps 4'
    );
  });

  /**
   * The two paths, on one frame. `gpu/webgl2.ts` calls `validate` outright and
   * `gpu/webgpu.ts` reaches it through `submit/plan.ts`, so the sentence a caller
   * gets no longer depends on which backend answered — which is the whole of what
   * this step bought. Neither backend gets far enough to touch its device.
   */
  const mismatched = counting(3, undefined);

  /** The same frame written in the language that backend takes, since a WebGL 2
   * backend refuses a WGSL frame before it reads a pass. Only the authoring changes:
   * the resources, the pipeline's counts and the pass are the ones above. */
  const GLSL_VERTEX = '#version 300 es\nvoid main(){gl_Position=vec4(0.0,0.0,0.0,1.0);}';
  const GLSL_FRAGMENT = '#version 300 es\nprecision highp float;\nout vec4 c;\nvoid main(){c=vec4(1.0);}';
  const asGlsl = (frame: FrameGraph): FrameGraph =>
    ({
      ...frame,
      authored: 'glsl',
      pipelines: frame.pipelines.map((spec) => ({
        ...spec,
        source: { glsl: { vertex: GLSL_VERTEX, fragment: GLSL_FRAGMENT } },
        vertex: { document: 'vertex', entry: 'main' },
        fragment: { document: 'fragment', entry: 'main' },
        bindings: [],
      })),
    }) as FrameGraph;

  it('gives the WebGL 2 backend that sentence', () => {
    const gl = createFakeGL();
    const backend = createWebGL2Backend(gl.canvas);
    if (!backend) throw new Error('the fake canvas gave no WebGL 2 context');
    expect(() => backend.program(asGlsl(mismatched))).toThrow(
      'the pass on pipeline 0 draws 4 samples a pixel and attaches resource 3, which keeps 1'
    );
  });

  it('gives the WebGPU backend the same sentence, word for word', () => {
    const gpu = createFakeGPU({ connected: false });
    const backend = createWebGPUBackend(gpu.canvas, gpu.device);
    if (!backend) throw new Error('the fake canvas gave no WebGPU context');
    backend.resize(800, 600);
    expect(() => backend.program(mismatched)).toThrow(
      'the pass on pipeline 0 draws 4 samples a pixel and attaches resource 3, which keeps 1'
    );
  });
});
