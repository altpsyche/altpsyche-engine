/**
 * The second example: a Shadertoy paste, unmodified, becomes a drawable frame.
 *
 * `SOURCE` is a `mainImage` copied as it appears on the Shadertoy page — no
 * `#version`, no uniform declarations, no `main`. The `shadertoy()` producer
 * wraps it into the GLSL pair the WebGL 2 backend links, supplying the uniform
 * block and the fullscreen vertex half. This file feeds the uniform-only subset
 * that subset names, and `createSurface` runs it on the one tier a card draws
 * today.
 *
 * Like every example it reaches the library through the one door and nothing
 * under it. The paste itself demonstrates the subset's edge: it reads `iTime` and
 * `iResolution` and no channel, which is exactly what this path carries — a paste
 * sampling `iChannel0` is refused by name, and swapping one in here is how a
 * reader sees that refusal.
 */
import { createSurface, shadertoy } from '@altpsyche/engine';

// Shadertoy's own default shader, pasted verbatim. It reads `iTime` and
// `iResolution`, both in the uniform-only subset this path carries.
const SOURCE = `void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    vec2 uv = fragCoord/iResolution.xy;
    vec3 col = 0.5 + 0.5*cos(iTime+uv.xyx+vec3(0,2,4));
    fragColor = vec4(col,1.0);
}`;

const canvas = document.querySelector('canvas') as HTMLCanvasElement;

const frame = shadertoy(SOURCE);

// `iTimeDelta` and `iFrame` are per-frame facts the surface's clock does not
// carry on its own, so they are tracked here off the elapsed time it does.
let previousElapsed = 0;
let frameCount = 0;

const surface = await createSurface(canvas, frame, {
  uniforms: (elapsedSeconds) => {
    const delta = elapsedSeconds - previousElapsed;
    previousElapsed = elapsedSeconds;
    return {
      iResolution: [canvas.width, canvas.height, 1],
      iTime: elapsedSeconds,
      iTimeDelta: delta,
      iFrame: frameCount++,
      iMouse: [0, 0, 0, 0],
    };
  },
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
