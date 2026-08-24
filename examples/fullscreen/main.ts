/**
 * The first example: one fullscreen pass, authored by hand.
 *
 * It builds a GLSL pair — the three-corner vertex half the backend fills, and a
 * fragment that paints an animated gradient — hands the pair to `glslFrame`, and
 * runs it with `createSurface`. A GLSL-authored frame draws on WebGL 2, which is
 * the one tier this package draws on a card today, so nothing here asks for a
 * device or names a backend: the renderer picks the only one a GLSL pair fits.
 *
 * It reaches the library through the one door and touches nothing under it, which
 * is the whole of what an example is for — the surface a stranger meets is the
 * surface this file is allowed to use.
 */
import { createSurface, glslFrame } from '@altpsyche/engine';

// The corners are the backend's, so this half only forwards the position it is
// handed. `position` is the attribute name the WebGL 2 backend fills.
const VERTEX = `#version 300 es
in vec3 position;
void main() {
  gl_Position = vec4(position, 1.0);
}`;

// A gradient that rolls with the clock, normalised against the drawing buffer so
// it fills whatever the canvas has been resized to.
const FRAGMENT = `#version 300 es
precision highp float;
uniform float uTime;
uniform vec3 iResolution;
out vec4 fragColour;
void main() {
  vec2 uv = gl_FragCoord.xy / iResolution.xy;
  vec3 colour = 0.5 + 0.5 * cos(uTime + uv.xyx * 6.283185 + vec3(0.0, 2.0, 4.0));
  fragColour = vec4(colour, 1.0);
}`;

const canvas = document.querySelector('canvas') as HTMLCanvasElement;

const frame = glslFrame('fullscreen', VERTEX, FRAGMENT, [
  { name: 'uTime', type: 'float' },
  { name: 'iResolution', type: 'vec3' },
]);

const surface = await createSurface(canvas, frame, {
  // The clock is the one value that changes; the resolution is read off the
  // drawing buffer the surface sizes, so a resize needs no code here.
  uniforms: (elapsedSeconds) => ({
    uTime: elapsedSeconds,
    iResolution: [canvas.width, canvas.height, 1],
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
