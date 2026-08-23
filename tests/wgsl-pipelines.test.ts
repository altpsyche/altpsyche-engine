import { describe, expect, it } from 'vitest';
import { storageBuffersOf, vertexInputsOf } from '../fixtures/wgsl-pipelines';

/**
 * What a vertex stage reads out of a buffer, read off the source so the build can
 * hold it to the bytes the generator wrote.
 *
 * A stage reading three floats where the buffer holds two reads every vertex
 * after the first out of the middle of the last one, and the card reports nothing
 * at all, so a disagreement has to be found here or not at all.
 */

const GRID = `struct Vertex { @builtin(position) at: vec4<f32>, @location(0) place: vec2<f32> };

@vertex
fn warp(@location(0) corner: vec2<f32>, @location(1) place: vec2f) -> Vertex {
  return Vertex(vec4<f32>(corner, 0.0, 1.0), place);
}`;

describe('the fields a vertex stage reads', () => {
  it('reads each location and the format it expects, in both spellings of the type', () => {
    expect(vertexInputsOf(GRID, 'warp')).toEqual([
      { location: 0, format: 'float32x2' },
      { location: 1, format: 'float32x2' },
    ]);
  });

  it('reads past the brackets of the attributes rather than stopping at the first one', () => {
    expect(vertexInputsOf(`@vertex fn one(@location(3) only: vec4f) -> vec4f { return only; }`, 'one')).toEqual([
      { location: 3, format: 'float32x4' },
    ]);
  });

  it('names the entry point it cannot find', () => {
    expect(() => vertexInputsOf(GRID, 'shade')).toThrow(/declares no vertex entry point "shade"/);
  });

  it('refuses a stage taking its fields in a struct, rather than reading it wrong', () => {
    expect(() => vertexInputsOf(`@vertex fn warp(in: Vertex) -> Vertex { return in; }`, 'warp')).toThrow(
      /reads no field of a vertex at a location of its own/
    );
  });

  it('refuses a field in a shape this build writes no vertices in', () => {
    expect(() =>
      vertexInputsOf(`@vertex fn warp(@location(0) m: mat2x2<f32>) -> vec4f { return vec4f(0.0); }`, 'warp')
    ).toThrow(/reads a "mat2x2<f32>", which this build writes no vertices in/);
  });
});

describe('the blocks of bytes a source declares as storage', () => {
  const WRITES = `@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read_write> counts: array<u32>;
@binding(2) @group(0) var<storage, read> limits: array<u32, 4>;
@group(0) @binding(3) var<storage> settled: Numbers;`;

  it('are found with where each is bound and whether the source may write into it', () => {
    expect(storageBuffersOf(WRITES)).toEqual([
      { name: 'counts', group: 0, binding: 1, access: 'read-write' },
      { name: 'limits', group: 0, binding: 2, access: 'read' },
      { name: 'settled', group: 0, binding: 3, access: 'read' },
    ]);
  });

  it('leaves a source with no such declaration empty rather than guessed at', () => {
    expect(storageBuffersOf(`@group(0) @binding(0) var<uniform> uniforms: Uniforms;`)).toEqual([]);
  });

  it('takes either order of the two attributes, since Slang writes one and this corpus the other', () => {
    expect(storageBuffersOf(`@binding(5) @group(0) var<storage, read_write> counts: array<u32>;`)).toEqual([
      { name: 'counts', group: 0, binding: 5, access: 'read-write' },
    ]);
  });

  it('refuses a declaration carrying one of the two attributes, rather than binding it somewhere', () => {
    expect(() => storageBuffersOf(`@binding(1) var<storage, read_write> counts: array<u32>;`)).toThrow(
      'the storage buffer "counts" declares one of @group and @binding without the other'
    );
  });
});
