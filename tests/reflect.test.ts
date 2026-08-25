import { describe, expect, it } from 'vitest';
import { reflect, missing, wgslFrame, glslFrame } from '@altpsyche/engine';
import { uniformBlockOf } from '@altpsyche/engine';

/**
 * The source-level reflection that replaced two compiled-program queries —
 * `ShaderProgram.unreached` and the hand-written `FrameGraph.uniforms` list
 * (ROADMAP item 69). It reads what a shader takes off the source, so it answers
 * without a device and cannot drift from a list beside the code.
 */

const WGSL = `struct Uniforms { u_time: f32, u_resolution: vec2<f32>, u_frame: i32 };
@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@fragment fn fragMain() -> @location(0) vec4<f32> { return vec4<f32>(uniforms.u_time); }`;

const wgsl = () => wgslFrame('wgsl-fixture', WGSL, uniformBlockOf(WGSL));

describe('what a WGSL frame declares', () => {
  it('reads each field of the uniform struct, in the order written', () => {
    expect(reflect(wgsl())).toEqual([
      { name: 'u_time', type: 'float' },
      { name: 'u_resolution', type: 'vec2' },
      { name: 'u_frame', type: 'int' },
    ]);
  });

  it('maps WGSL spellings to the common vocabulary a page reads', () => {
    // f32 -> float, vec2<f32> -> vec2, i32 -> int: a WGSL frame and a GLSL frame
    // answer alike, which is what lets one caller read either.
    expect(reflect(wgsl()).map((u) => u.type)).toEqual(['float', 'vec2', 'int']);
  });
});

const GLSL_VERTEX = '#version 300 es\nin vec3 position;\nvoid main(){gl_Position=vec4(position,1.0);}';

describe('what a GLSL frame declares', () => {
  it('reads a loose uniform declaration by its own GLSL type', () => {
    const fragment =
      '#version 300 es\nprecision highp float;\nuniform vec2 viewport;\nuniform float seconds;\nout vec4 c;\nvoid main(){c=vec4(seconds);}';
    expect(reflect(glslFrame('glsl-fixture', GLSL_VERTEX, fragment))).toEqual([
      { name: 'viewport', type: 'vec2' },
      { name: 'seconds', type: 'float' },
    ]);
  });

  it('reads the members of a std140 block', () => {
    const fragment =
      '#version 300 es\nprecision highp float;\nuniform Uniforms { float u_time; int u_frame; };\nout vec4 c;\nvoid main(){c=vec4(u_time);}';
    expect(reflect(glslFrame('glsl-block', GLSL_VERTEX, fragment))).toEqual([
      { name: 'u_time', type: 'float' },
      { name: 'u_frame', type: 'int' },
    ]);
  });

  it('names a uniform declared in the vertex and the fragment once', () => {
    const vertex =
      '#version 300 es\nuniform float u_time;\nin vec3 position;\nvoid main(){gl_Position=vec4(position*u_time,1.0);}';
    const fragment =
      '#version 300 es\nprecision highp float;\nuniform float u_time;\nout vec4 c;\nvoid main(){c=vec4(u_time);}';
    expect(reflect(glslFrame('glsl-shared', vertex, fragment))).toEqual([{ name: 'u_time', type: 'float' }]);
  });

  it('ignores a commented-out declaration', () => {
    const fragment =
      '#version 300 es\nprecision highp float;\n// uniform float u_gone;\nuniform float u_time;\nout vec4 c;\nvoid main(){c=vec4(u_time);}';
    expect(reflect(glslFrame('glsl-commented', GLSL_VERTEX, fragment)).map((u) => u.name)).toEqual(['u_time']);
  });
});

describe('the names a source has no place for', () => {
  it('is the same list the old compiled-program query gave for the WGSL corpus', () => {
    expect(missing(wgsl(), ['u_time', 'u_resolution', 'u_frame', 'u_dive'])).toEqual(['u_dive']);
  });

  it('empties when the source declares every name asked about', () => {
    expect(missing(wgsl(), ['u_time', 'u_frame'])).toEqual([]);
  });

  it('counts a declared-but-unread uniform as present, where the compiler would have dropped it', () => {
    // The divergence item 69 records: a GLSL compiler removes a uniform no line
    // reads, so the old program query called it absent; the source declares it,
    // so `reflect` calls it present — the answer a page drawing controls wants.
    const fragment =
      '#version 300 es\nprecision highp float;\nuniform float u_unread;\nout vec4 c;\nvoid main(){c=vec4(1.0);}';
    expect(missing(glslFrame('glsl-unread', GLSL_VERTEX, fragment), ['u_unread'])).toEqual([]);
  });
});
