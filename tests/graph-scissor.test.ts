import { describe, expect, it } from 'vitest';
import { validate } from '../graph/validate';
import { pipelineHandle, uniform } from '../graph/handles';
import type { FrameGraph, RenderPipelineSpec, ScissorRect } from '@altpsyche/engine';

/**
 * What a scissor rectangle has to be, held from the graph alone (item 16).
 *
 * **What this file deliberately does not check is whether the rectangle fits the
 * attachment**, and that is a limit rather than a gap. A frame's textures may be
 * `{ scale: 1 }`, so a graph in hand has no pixel size to hold a rectangle against
 * and only gains one when it is resolved at a width and a height. Both backends are
 * given the resolved size and clamp there. What is checkable without a size is that
 * the four numbers describe a region at all, and every one of these is a rectangle a
 * card refuses with a message naming neither the pass nor the frame.
 *
 * Nothing here imports a backend or a device, for the reason `graph-draw-forms`
 * gives: a rule decidable from the graph alone is tested from the graph alone.
 */
const SOURCE = `
struct U { u_time: f32 };
@group(0) @binding(0) var<uniform> uniforms: U;
@vertex fn warp() -> @builtin(position) vec4<f32> { return vec4<f32>(0.0, 0.0, 0.0, 1.0); }
@fragment fn shade() -> @location(0) vec4<f32> {
  return vec4<f32>(uniforms.u_time, 0.0, 0.0, 1.0);
}`;

const frameOf = (scissor: ScissorRect | undefined): FrameGraph => {
  const pipeline: RenderPipelineSpec = {
    kind: 'render',
    source: { wgsl: { vertex: SOURCE, fragment: SOURCE } },
    vertex: { document: 'wgsl', entry: 'warp' },
    fragment: { document: 'wgsl', entry: 'shade' },
    bindings: [{ group: 0, binding: 0, resource: uniform(0), visibility: ['fragment'] }],
  };
  return {
    id: 'scissor-fixture',
    authored: 'wgsl',
    resources: [{ kind: 'uniform', block: [{ name: 'u_time', offset: 0, size: 4 }] }],
    modules: [],
    pipelines: [pipeline],
    passes: [{ pipeline: pipelineHandle(0), draws: [{ vertices: 3 }], ...(scissor ? { scissor } : {}) }],
  } as FrameGraph;
};

describe('a scissor rectangle has to be a rectangle', () => {
  it('accepts a whole-numbered rectangle with a positive extent', () => {
    expect(() => validate(frameOf({ x: 96, y: 120, width: 360, height: 210 }))).not.toThrow();
  });

  it('accepts a pass that names none at all, since a scissor is optional', () => {
    expect(() => validate(frameOf(undefined))).not.toThrow();
  });

  it('refuses a fractional edge, naming which of the four it was', () => {
    // A rectangle worked out from a ratio rather than from pixels. The card takes
    // unsigned integers and a fraction reaches it as a truncation nobody asked for.
    expect(() => validate(frameOf({ x: 96.5, y: 120, width: 360, height: 210 }))).toThrow(
      'scissors the pass on pipeline 0 to a x of 96.5, which is no whole number of pixels'
    );
    expect(() => validate(frameOf({ x: 96, y: 120, width: 360.25, height: 210 }))).toThrow('a width of 360.25');
  });

  it('refuses a corner outside the attachment it is counted from', () => {
    expect(() => validate(frameOf({ x: -1, y: 120, width: 360, height: 210 }))).toThrow(
      'scissors the pass on pipeline 0 to a corner at -1,120, which is outside its own attachment'
    );
    expect(() => validate(frameOf({ x: 96, y: -8, width: 360, height: 210 }))).toThrow('a corner at 96,-8');
  });

  it('refuses an extent of nothing, because a pass that writes nothing is a pass left out', () => {
    // Zero is refused rather than read as "draw nothing". An accidental zero — a
    // width worked out from a size that came back undefined — is otherwise a frame
    // that draws nothing and reports nothing, which is the failure this whole
    // package exists to turn into a sentence.
    expect(() => validate(frameOf({ x: 96, y: 120, width: 0, height: 210 }))).toThrow(
      'scissors the pass on pipeline 0 to 0x210, and a pass that may write nothing is a pass left out'
    );
    expect(() => validate(frameOf({ x: 96, y: 120, width: 360, height: -4 }))).toThrow('to 360x-4');
  });
});
