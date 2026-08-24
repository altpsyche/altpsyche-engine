/**
 * The Shadertoy producer.
 *
 * A Shadertoy fragment is not a whole shader: it is one function, `mainImage`,
 * that writes a colour for a pixel, and it leans on a handful of uniforms the
 * Shadertoy page declares around it — `iTime`, `iResolution` and the rest. This
 * turns an unmodified paste of that function into the GLSL pair the WebGL 2
 * backend links a program from, by supplying the `#version` line, the uniform
 * declarations, the fragment output and the `main` that calls `mainImage`, plus
 * the fullscreen vertex half the backend has no source for.
 *
 * It is a producer in the sense the road document means: it imports the frame
 * builders and returns a `ShaderFrame`, and it reaches no device. The backend
 * that draws the result is chosen and built somewhere else entirely.
 *
 * The subset it carries is the uniform-only one — `iTime`, `iTimeDelta`,
 * `iFrame`, `iResolution`, `iMouse`. A source reaching for a channel wants a
 * texture, and textures are not on this path yet, so it is refused by name
 * rather than wrapped into a program that would compile against an `iChannel0`
 * nobody feeds and draw a wrong picture in silence.
 */
import { glslFrame } from './frame.js';
import type { ShaderFrame } from './types.js';

/** The uniform subset a Shadertoy paste may read, in the declarations the
 * Shadertoy environment writes around one. `iFrame` is an integer counter there
 * and is declared as one here so a source doing integer work on it — `iFrame % 2`,
 * an array index — compiles unmodified. */
const SHADERTOY_UNIFORMS = `uniform vec3 iResolution;
uniform float iTime;
uniform float iTimeDelta;
uniform int iFrame;
uniform vec4 iMouse;`;

/** The names and types a caller feeds by name, which is what a host loop reads to
 * know what to hand over. `iFrame` is named `int` to match its declaration; the
 * value is still one number per frame like the rest. */
const SHADERTOY_UNIFORM_LIST: { name: string; type: string }[] = [
  { name: 'iResolution', type: 'vec3' },
  { name: 'iTime', type: 'float' },
  { name: 'iTimeDelta', type: 'float' },
  { name: 'iFrame', type: 'int' },
  { name: 'iMouse', type: 'vec4' },
];

/** The three corners the backend draws, so this vertex half only forwards the
 * position the backend supplies. It reads no uniform and declares no varying,
 * because a Shadertoy fragment works in pixel coordinates off `gl_FragCoord` and
 * wants nothing interpolated from here. */
const SHADERTOY_VERTEX = `#version 300 es
in vec3 position;
void main() {
  gl_Position = vec4(position, 1.0);
}`;

/** The channels a Shadertoy source samples a texture through. Finding any of them
 * is the signal that the paste wants a resource this path does not carry. The
 * word boundary keeps a longer identifier that merely contains one of these — a
 * variable a source named `myiChannel0x` — from reading as a channel. */
const CHANNELS = /\biChannel[0-3]\b/g;

/**
 * An unmodified Shadertoy fragment source becomes a drawable frame.
 *
 * The source is dropped in whole between the uniform declarations and the `main`
 * that drives it, so a paste that defines `mainImage` and nothing else is enough
 * and a paste that also defines its own helpers keeps them. The fragment output
 * carries a name a Shadertoy source would not collide with, because the source's
 * own `fragColor` is the `out` parameter of `mainImage` rather than a global.
 *
 * A source naming a channel is refused before any of that, with the channel named
 * and the reason said plainly: textures are not on this path yet. The message
 * names every distinct channel the source reaches for, so a paste using two of
 * them is told about both rather than one at a time.
 */
export function shadertoy(source: string, id = 'shadertoy'): ShaderFrame {
  const channels = [...new Set(source.match(CHANNELS) ?? [])];
  if (channels.length > 0) {
    throw new Error(
      `the Shadertoy source for "${id}" samples ${channels.join(', ')}, and textures are not in this path yet`
    );
  }

  const fragment = `#version 300 es
precision highp float;
${SHADERTOY_UNIFORMS}
out vec4 altpsyche_fragColour;

${source}

void main() {
  altpsyche_fragColour = vec4(0.0, 0.0, 0.0, 1.0);
  mainImage(altpsyche_fragColour, gl_FragCoord.xy);
}`;

  return glslFrame(id, SHADERTOY_VERTEX, fragment, SHADERTOY_UNIFORM_LIST);
}
