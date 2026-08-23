import { describe, expect, it } from 'vitest';
import { declaredFrame, generatedBytes } from '../fixtures/shader-describe';
import type { DeclaredFrame } from '../fixtures/declared-frame';

/**
 * What a declaration asks to be generated, and whether the bytes and the address
 * the description sends a reader to are the same answer.
 *
 * These arrived from the site's build test when the corpus moved. What they hold is
 * the split a declaration is read under: the size is the declaration's and the
 * layout and the format are the generator's, so a run of vertices as long as the
 * primitive it holds is the only thing saying the two agreed about which primitive
 * was asked for.
 */
const drawing = [
  'struct Uniforms { u_time: f32, u_resolution: vec2<f32> };',
  '@group(0) @binding(0) var<uniform> uniforms: Uniforms;',
  'struct Vertex { @builtin(position) at: vec4<f32>, @location(0) place: vec2<f32> };',
  '@vertex',
  'fn warp(@location(0) corner: vec2<f32>, @location(1) place: vec2<f32>) -> Vertex {',
  '  return Vertex(vec4<f32>(corner, 0.0, 1.0), place);',
  '}',
  '@fragment',
  'fn shade(shaded: Vertex) -> @location(0) vec4<f32> {',
  '  return vec4<f32>(shaded.place, uniforms.u_time, 1.0);',
  '}',
].join('\n');

const id = 'fixture-geometry';

const frame: DeclaredFrame = {
  geometry: [{ name: 'grid', primitive: 'quad-grid', size: [4, 4] }],
  passes: [{ pipeline: 'shade', vertex: 'warp', geometry: 'grid', instances: 2 }],
};

describe('what a declaration generates beside a WGSL shader', () => {
  it('makes one run of bytes per buffer, each as long as the primitive it holds', () => {
    const made = generatedBytes(id, frame);

    expect([...made].map(([name, bytes]) => [name, bytes.byteLength])).toEqual([
      ['fixture-geometry-grid.vertices.bin', 25 * 16],
      ['fixture-geometry-grid.indices.bin', 4 * 4 * 6 * 2],
    ]);
  });

  it('makes the same bytes twice over one declaration', () => {
    const first = generatedBytes(id, frame);
    const second = generatedBytes(id, frame);

    expect([...first.values()].map((bytes) => [...bytes])).toEqual([...second.values()].map((bytes) => [...bytes]));
  });

  it('sends the frame to the addresses those bytes were made under', () => {
    const description = declaredFrame(id, drawing, frame);
    const named = description.resources.flatMap((resource) =>
      'source' in resource && resource.source ? [resource.source] : []
    );

    expect(named).toEqual(['fixture-geometry-grid.vertices.bin', 'fixture-geometry-grid.indices.bin']);
  });
});
