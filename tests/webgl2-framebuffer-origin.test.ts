import { describe, expect, it } from 'vitest';
import type { FrameGraph, GlslFrameGraph } from '@altpsyche/engine';
import { createWebGL2Backend } from '../gpu/webgl2';
import { bottomUpFrame, createFakeGL } from './support/fake-gl';
import { pipelineHandle, vertices } from '../graph/handles.js';

/**
 * Which way up a frame leaves the framebuffer, and the three things that follow
 * from it (item 20).
 *
 * WGSL's `@builtin(position)` counts rows from the top left and GLSL ES 3.00's
 * `gl_FragCoord` counts from the bottom left. The only lever WebGL 2 leaves is the
 * one the WebGPU specification names for OpenGL — flip y in the vertex stage and
 * invert the winding — so a translated frame carries the flip and
 * `framebufferOrigin: 'top-left'` to say it does.
 *
 * **Three readers must agree or the picture is wrong twice**: the winding, the
 * readback, and the scissor. On the card that shows as the whole cross-backend
 * corpus reading 0 of 1,440,000 channels; here it is held per reader, because
 * `gate:card` needs a display and a person and never runs unattended.
 *
 * **The winding in particular was asserted by nothing but `core-count`**, which
 * cuts a stencil hole by winding and would have broken loudly on a card. That is a
 * real check but it is not one CI can run.
 */

const VERTEX = '#version 300 es\nin vec2 position;\nvoid main(){gl_Position=vec4(position,0.0,1.0);}';
const FRAGMENT = '#version 300 es\nprecision highp float;\nout vec4 c;\nvoid main(){c=vec4(1.0);}';

const GL_CW = 0x0900;
const GL_CCW = 0x0901;

const WIDE = 4;
const TALL = 2;

/** One frame, `origin` saying what a translated frame would carry and `undefined`
 * what a hand-authored one does. */
const frame = (origin?: 'top-left'): FrameGraph =>
  ({
    id: 'origin',
    authored: 'glsl',
    ...(origin ? { framebufferOrigin: origin } : {}),
    resources: [{ kind: 'uniform' }],
    modules: [],
    pipelines: [
      {
        kind: 'render',
        source: { glsl: { vertex: VERTEX, fragment: FRAGMENT } },
        vertex: { document: 'vertex', entry: 'main' },
        fragment: { document: 'fragment', entry: 'main' },
        bindings: [],
      },
    ],
    passes: [{ pipeline: pipelineHandle(0), draws: [{ vertices: 3 }] }],
  }) as GlslFrameGraph;

function drawn(origin?: 'top-left') {
  const gl = createFakeGL();
  const backend = createWebGL2Backend(gl.canvas);
  if (!backend) throw new Error('the fake canvas gave no WebGL 2 context');
  backend.resize(WIDE, TALL);
  gl.frame = bottomUpFrame(WIDE, TALL);
  const program = backend.program(frame(origin));
  program.draw();
  return { gl, backend };
}

describe('a frame translated from WGSL, which rasterises top-first', () => {
  it('draws with the winding inverted, because negating y reverses it', async () => {
    const { gl } = drawn('top-left');
    expect(gl.of('frontFace').map((call) => call.mode)).toEqual([GL_CW]);
  });

  it('is read back without turning it over, because it is already top-first', async () => {
    const { gl, backend } = drawn('top-left');
    const pixels = await backend.readPixels();

    // The driver hands rows bottom-first and each pixel carries the row it came
    // from. This frame was drawn upside down on purpose, so the driver's first row
    // *is* the top row and must be handed straight back. Turning it over here is
    // what item 107 measured as a mirror at 344,146 of 1,440,000 channels.
    expect(Array.from(pixels.subarray(0, 4))).toEqual(Array.from(gl.frame!.subarray(0, 4)));
  });
});

describe('a hand-authored GLSL frame, which is left exactly as it was', () => {
  it('draws with OpenGL’s own winding', async () => {
    const { gl } = drawn();
    expect(gl.of('frontFace').map((call) => call.mode)).toEqual([GL_CCW]);
  });

  it('is still turned over on the way out, so its author gets rows top-first', async () => {
    const { gl, backend } = drawn();
    const pixels = await backend.readPixels();

    // Its author wrote GL and expects GL, so nothing was done to the frame and the
    // readback owes them the flip it always did. The driver's last row is the top
    // one. This is the half of item 8's objection that was right, and it is why the
    // flip is conditioned rather than removed.
    const stride = WIDE * 4;
    expect(Array.from(pixels.subarray(0, 4))).toEqual(
      Array.from(gl.frame!.subarray((TALL - 1) * stride, (TALL - 1) * stride + 4))
    );
  });
});
