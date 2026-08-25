/**
 * The second example: a GLSL fragment shader a consumer wrote, drawn on WebGL 2.
 *
 * This is what §17 decision 6 buys. The library takes GLSL in — a whole fragment
 * document, `#version` and uniform declarations and `main` included — and
 * `selectBackend` routes it to WebGL 2 even on a machine that has WebGPU, because
 * that is where it runs. Nothing is refused and nothing is translated.
 *
 * The uniforms are this file's own choice of names. The library has no opinion on
 * what a shader calls its clock or its viewport, and deliberately ships no adapter
 * that supplies a particular set: a consumer arriving from any editor or tutorial
 * writes the eight lines below to match whatever their source already reads.
 *
 * Like every example it reaches the library through the one door and nothing
 * under it.
 */
import { createSurface, glslFrame } from '@altpsyche/engine';

// The vertex half, because WebGL 2 links a pair. Three corners covering the frame.
const VERTEX = `#version 300 es
void main() {
  vec2 corner = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}`;

// The fragment half: a whole document, as a consumer would already have it.
const FRAGMENT = `#version 300 es
precision highp float;

uniform vec2 viewport;
uniform float seconds;

out vec4 colour;

void main() {
  vec2 uv = gl_FragCoord.xy / viewport;
  colour = vec4(0.5 + 0.5 * cos(seconds + uv.xyx + vec3(0.0, 2.0, 4.0)), 1.0);
}`;

const canvas = document.querySelector('canvas') as HTMLCanvasElement;

const frame = glslFrame('glsl-fragment', VERTEX, FRAGMENT);

const surface = await createSurface(canvas, frame, {
  uniforms: (elapsedSeconds) => ({
    viewport: [canvas.width, canvas.height],
    seconds: elapsedSeconds,
  }),
  onError: (message) => console.error(message),
});

if (!surface) {
  console.error('no backend would give this page a context');
} else {
  const fit = () => surface.resize(canvas.clientWidth, canvas.clientHeight);
  addEventListener('resize', fit);
  fit();
  surface.start();
}
