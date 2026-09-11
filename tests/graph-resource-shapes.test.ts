import { describe, expect, it } from 'vitest';
import { validate } from '../graph/validate';
import { pipelineHandle, texture, uniform } from '../graph/handles';
import type { FrameGraph, RenderPipelineSpec, TextureResource } from '@altpsyche/engine';

/**
 * What a declared texture may and may not be, held independently of either backend
 * (item 4).
 *
 * **Why this file exists rather than a check beside each backend.** All six of these
 * rules were already written, twice, and that is what made them a defect. Four
 * appeared in both backends in near enough one sentence, so a drift between the
 * copies would have read as a repetition rather than as a disagreement — and two of
 * them *had* drifted, over whether contents means `data` alone or `data` or `source`,
 * so one description was refused on one card and drawn on the other. A sixth was in
 * `gpu/webgl2.ts` alone, so a WebGPU frame asking for a ladder over a texture with
 * nothing in it was built rather than refused.
 *
 * So the rules moved into `graph/validate.ts` at step 2 and these read them there.
 * **Nothing in this file imports a backend or a device**, which is the point: a rule
 * decidable from the graph alone is tested from the graph alone. The per-backend
 * tests that came with the rules went on asserting whatever their backend did, so a
 * rule moved with its own tests is a rule nothing independent reads — the mistake
 * `CONTRIBUTING.md` names as the one that survives.
 *
 * **These are red for the rule and not for the wording.** Each holds a graph that
 * breaks exactly one rule against the sentence naming it, and each is paired with the
 * same graph minus the fault, which must pass — because a test that only ever sees a
 * throw cannot tell a rule from a function that throws at everything.
 *
 * **There are no backstops left to name.** Step 3 was written expecting the backends
 * to keep theirs as unreachable guards, the way `gpu/select.ts` describes for the
 * read-write storage buffer. They do not: step 2 deleted all seven copies rather than
 * leaving any, so the count of throw sites fell from 22 to 16 in `gpu/webgpu.ts` and
 * from 43 to 36 in `gpu/webgl2.ts`. What guards a caller who skips `validate` is that
 * there is no way to: both backends run it, one directly and one through
 * `submit/plan.ts`.
 */

const SOURCE = `struct U { u_time: f32 };
@group(0) @binding(0) var<uniform> uniforms: U;
@vertex fn warp(@builtin(vertex_index) which: u32) -> @builtin(position) vec4<f32> {
  return vec4<f32>(f32(which), 0.0, 0.0, 1.0);
}
@fragment fn shade() -> @location(0) vec4<f32> {
  return vec4<f32>(uniforms.u_time, 0.0, 0.0, 1.0);
}`;

/** A texture of a fixed size with its bytes already in hand, which every rule below
 * bends one field of. */
const image = (over: Partial<TextureResource> = {}): TextureResource => ({
  kind: 'texture',
  size: { width: 4, height: 4 },
  format: 'rgba8unorm',
  use: ['sample'],
  data: new Uint8Array(4 * 4 * 4),
  ...over,
});

/** One render pass over one pipeline, with the texture under test at index 1. Every
 * graph here is sound but for the field the test bends, so a throw names that field
 * and nothing else. */
const frameOf = (one: TextureResource, over: Partial<FrameGraph> = {}): FrameGraph => {
  const pipeline: RenderPipelineSpec = {
    kind: 'render',
    source: { wgsl: { vertex: SOURCE, fragment: SOURCE } },
    vertex: { document: 'wgsl', entry: 'warp' },
    fragment: { document: 'wgsl', entry: 'shade' },
    bindings: [{ group: 0, binding: 0, resource: uniform(0), visibility: ['fragment'] }],
  };
  return {
    id: 'shapes',
    authored: 'wgsl',
    resources: [{ kind: 'uniform', block: [{ name: 'u_time', offset: 0, size: 4 }] }, one],
    modules: [],
    pipelines: [pipeline],
    passes: [{ pipeline: pipelineHandle(0), draws: [{ vertices: 3 }] }],
    ...over,
  } as FrameGraph;
};

describe('a ladder over a texture something writes every frame', () => {
  it('is refused over an attachment, whose levels would be of a picture that is gone', () => {
    expect(() => validate(frameOf(image({ mips: 'generate', use: ['attachment'] })))).toThrow(
      'the frame for "shapes" gives resource 1 a ladder and writes it every frame'
    );
  });

  it('is refused over a storage texture for the same reason, which was WebGPU’s reading alone', () => {
    // WebGL 2 counted only an attachment here, and a storage texture is written
    // every frame just as an attachment is. The broader predicate is the one that
    // moved, and this is the case that says so.
    expect(() => validate(frameOf(image({ mips: 'generate', use: ['storage'] })))).toThrow(
      'the frame for "shapes" gives resource 1 a ladder and writes it every frame'
    );
  });

  it('is allowed over a texture only sampled, which is what a ladder is for', () => {
    expect(() => validate(frameOf(image({ mips: 'generate' })))).not.toThrow();
  });
});

describe('a ladder over a texture with nothing in it', () => {
  it('is refused, having nothing to average — and this rule reached WebGPU at all only now', () => {
    expect(() => validate(frameOf(image({ mips: 'generate', data: undefined })))).toThrow(
      'the frame for "shapes" gives resource 1 a ladder and no contents to build it from'
    );
  });

  it('is allowed where the contents are an address the fetch has not returned yet', () => {
    // `source` and no `data` is the description a build hands over before its fetch
    // comes back, and its contents exist: the ladder has something to average once
    // they arrive. This is the other side of step 1's answer — the same field that
    // makes a refusal fire two rules up keeps this one quiet.
    expect(() => validate(frameOf(image({ mips: 'generate', data: undefined, source: 'grain.bin' })))).not.toThrow();
  });
});

describe('a texture keeping several samples of a pixel', () => {
  const averaged = (over: Partial<TextureResource> = {}) =>
    image({ data: undefined, use: ['attachment'], samples: 4, ...over });

  it('is refused contents, since nothing writes into one from outside', () => {
    expect(() => validate(frameOf(averaged({ data: new Uint8Array(4 * 4 * 4) })))).toThrow(
      'the frame for "shapes" gives resource 1 contents and several samples a pixel'
    );
  });

  it('is refused contents that are only an address yet, in the same words', () => {
    // The divergence step 1 settled: WebGPU read `data` alone here and let this
    // description through, so it was refused on one card and drawn on the other.
    expect(() => validate(frameOf(averaged({ source: 'edges.bin' })))).toThrow(
      'the frame for "shapes" gives resource 1 contents and several samples a pixel'
    );
  });

  it('is refused to a shader, which reads one only through a multisampled binding', () => {
    expect(() => validate(frameOf(averaged({ use: ['attachment', 'sample'] })))).toThrow(
      'the frame for "shapes" binds resource 1, which keeps several samples a pixel'
    );
  });

  it('is refused as a storage texture for the same reason, which was WebGPU’s reading alone', () => {
    expect(() => validate(frameOf(averaged({ use: ['attachment', 'storage'] })))).toThrow(
      'the frame for "shapes" binds resource 1, which keeps several samples a pixel'
    );
  });

  it('is refused as the picture, since nothing copies out of one', () => {
    expect(() => validate(frameOf(averaged(), { present: texture(1) }))).toThrow(
      'the frame for "shapes" shows resource 1, which keeps several samples a pixel'
    );
  });

  it('is allowed as an attachment nothing samples, shows or fills, which is the one thing it is', () => {
    expect(() => validate(frameOf(averaged()))).not.toThrow();
  });
});

describe('contents and the frame’s own size', () => {
  it('is refused, since the bytes arrive once and the texture is remade on every resize', () => {
    expect(() => validate(frameOf(image({ size: { scale: 1 } })))).toThrow(
      `the frame for "shapes" gives resource 1 contents and the frame's own size, which is thrown away on a resize`
    );
  });

  it('is refused where the contents are only an address yet, in the same words', () => {
    expect(() => validate(frameOf(image({ size: { scale: 1 }, data: undefined, source: 'grain.bin' })))).toThrow(
      `the frame for "shapes" gives resource 1 contents and the frame's own size, which is thrown away on a resize`
    );
  });

  it('is allowed where the texture follows the frame and carries no contents', () => {
    expect(() => validate(frameOf(image({ size: { scale: 1 }, data: undefined })))).not.toThrow();
  });

  it('is allowed where the contents come with a size of their own', () => {
    expect(() => validate(frameOf(image()))).not.toThrow();
  });
});

describe('the resource a frame shows', () => {
  it('is refused where the frame declares no such resource, in the handle safety net’s own words', () => {
    // Not a rule item 4 moved: `validate`'s handle net had been refusing this all
    // along, and what the two backends held were a second and a third wording of it.
    // It is here so the six above are read beside the one that was already home.
    expect(() => validate(frameOf(image(), { present: texture(7) }))).toThrow(
      'the frame for "shapes" presents resource 7, which it does not declare'
    );
  });

  it('is refused where the resource is not a texture', () => {
    expect(() => validate(frameOf(image(), { present: texture(0) }))).toThrow(
      'the frame for "shapes" presents resource 0, which is a uniform where a texture was wanted'
    );
  });
});
