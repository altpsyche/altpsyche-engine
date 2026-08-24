import { describe, expect, it } from 'vitest';
import { shadertoy } from '@altpsyche/engine';
import { createWebGL2Backend } from '../renderer/webgl2';
import { createFakeGL } from './support/fake-gl';

/**
 * The Shadertoy producer: an unmodified paste of a `mainImage` function becomes
 * a frame the WebGL 2 backend draws, and a paste reaching for a channel is
 * refused by name.
 *
 * "Draws" here is the backend issuing its one `drawArrays` over the produced
 * frame against the stand-in context, the same way `renderer-webgl2.test.ts`
 * holds the backend. What a real driver does with the wrapped source is the
 * corpus gate's on a real context; this holds that the wrapping assembles into a
 * frame the backend accepts and draws, and that a channel is stopped before any
 * of that.
 */

// An unmodified Shadertoy paste using only the uniform-only subset. This is what
// a caller copies out of the Shadertoy editor: a `mainImage` and nothing around
// it.
const PLASMA = `void mainImage( out vec4 fragColor, in vec2 fragCoord ) {
  vec2 uv = fragCoord / iResolution.xy;
  vec3 col = 0.5 + 0.5 * cos(iTime + uv.xyx + vec3(0, 2, 4));
  fragColor = vec4(col, 1.0);
}`;

describe('the Shadertoy producer', () => {
  it('turns an unmodified paste into a drawable GLSL frame', () => {
    const frame = shadertoy(PLASMA, 'plasma');
    expect(frame.target).toBe('glsl');

    const gl = createFakeGL();
    const backend = createWebGL2Backend(gl.canvas);
    if (!backend) throw new Error('the fake canvas gave no WebGL 2 context');
    const program = backend.createProgram(frame);
    program.draw();
    expect(gl.of('drawArrays')).toHaveLength(1);
  });

  it('carries the uniform-only subset a Shadertoy source may read', () => {
    const names = shadertoy(PLASMA).uniforms.map((u) => u.name).sort();
    expect(names).toEqual(['iFrame', 'iMouse', 'iResolution', 'iTime', 'iTimeDelta']);
  });

  it('keeps the pasted source intact so its own helpers survive', () => {
    const frame = shadertoy(PLASMA, 'plasma');
    const fragment = frame.modules.find((m) => m.name === 'fragment');
    expect(fragment?.code).toContain(PLASMA);
    // The declarations the Shadertoy page supplies are added around it.
    expect(fragment?.code).toContain('uniform float iTime;');
    expect(fragment?.code).toContain('mainImage(');
  });

  it('refuses a source sampling iChannel0, naming it and saying textures are not here yet', () => {
    const withChannel = `void mainImage( out vec4 fragColor, in vec2 fragCoord ) {
  fragColor = texture(iChannel0, fragCoord / iResolution.xy);
}`;
    expect(() => shadertoy(withChannel, 'buffered')).toThrow(/iChannel0/);
    expect(() => shadertoy(withChannel, 'buffered')).toThrow(/texture/);
  });

  it('names every distinct channel a source reaches for', () => {
    const twoChannels = `void mainImage( out vec4 fragColor, in vec2 fragCoord ) {
  fragColor = texture(iChannel0, fragCoord) + texture(iChannel2, fragCoord);
}`;
    expect(() => shadertoy(twoChannels)).toThrow(/iChannel0, iChannel2/);
  });
});
