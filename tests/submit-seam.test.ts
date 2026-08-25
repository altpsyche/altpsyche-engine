import { describe, expect, it } from 'vitest';
import { planFromDescription, planFramePasses } from '../submit/plan';
import { frameOf, wgslDescription, glslDescription, ONE_PASS, WGSL_DOCUMENT } from '@altpsyche/engine';
import type { DrawnGeometry } from '../submit/plan';

/**
 * The seam of [ROADMAP.md](../docs/ROADMAP.md) item 14: a build-time frame filled
 * onto the new path in one place.
 *
 * `submit/` is the new path — a graph becomes a plan and then commands. A
 * build-time `FrameGraph` is the shape above it, naming its modules rather
 * than carrying their text. `planFromDescription` is the single call that carries
 * one across: it fills the frame's modules through `frameOf` and plans the
 * resulting graph through `planFramePasses`. What this file asserts is that the
 * seam is exactly that composition and nothing more — the same plan the two steps
 * produce by hand, the same refusals `frameOf` already makes, and no device
 * reached for a frame that draws its backend's own corners.
 */

const BLOCK = [
  { name: 'u_time', offset: 0, size: 4 },
  { name: 'u_resolution', offset: 8, size: 8 },
];

const WGSL = `struct Uniforms { u_time: f32, u_resolution: vec2<f32> };
@binding(0) @group(0) var<uniform> uniforms: Uniforms;
@fragment fn fragMain() -> @location(0) vec4<f32> { return vec4<f32>(uniforms.u_time); }`;

const VERTEX = '#version 300 es\nin vec3 position;\nvoid main(){gl_Position=vec4(position,1.0);}';
const FRAGMENT = '#version 300 es\nprecision highp float;\nout vec4 c;\nvoid main(){c=vec4(1.0);}';

// A fullscreen frame draws the backend's own corners, so the plan never asks which
// vertices a draw walks. A resolver that throws proves the corpus reaches the new
// path through the seam without a resident lifetime under it.
const noGeometry = (name: string): DrawnGeometry => {
  throw new Error(`the seam resolved geometry "${name}" for a fullscreen frame`);
};

describe('planFromDescription is the one seam a description reaches the new path through', () => {
  it('plans a WGSL description into the same passes the two steps produce by hand', () => {
    const description = wgslDescription(WGSL);
    const byHand = planFramePasses(
      frameOf('fixture', description, { [WGSL_DOCUMENT]: WGSL }, BLOCK),
      noGeometry
    );

    const throughSeam = planFromDescription(
      'fixture',
      description,
      { [WGSL_DOCUMENT]: WGSL },
      noGeometry,
      { block: BLOCK }
    );

    expect(throughSeam).toEqual(byHand);
    expect(throughSeam).toHaveLength(1);
    expect(throughSeam[0]?.spec.name).toBe(ONE_PASS);
  });

  it('plans a GLSL pair the same way, carrying both documents across', () => {
    const description = glslDescription();
    const texts = { vertex: VERTEX, fragment: FRAGMENT };
    const byHand = planFramePasses(frameOf('fixture', description, texts), noGeometry);

    const throughSeam = planFromDescription('fixture', description, texts, noGeometry);

    expect(throughSeam).toEqual(byHand);
    expect(throughSeam).toHaveLength(1);
  });

  it("carries frameOf's refusals rather than restating them", () => {
    const description = wgslDescription(WGSL);
    // A document the loader never fetched text for is a description frameOf
    // refuses; the seam refuses it there rather than planning an empty module.
    expect(() => planFromDescription('unfetched', description, {}, noGeometry, { block: BLOCK })).toThrow(
      'names a document'
    );
  });
});
