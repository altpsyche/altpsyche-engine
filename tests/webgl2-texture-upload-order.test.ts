import { describe, expect, it } from 'vitest';
import type { FrameGraph } from '@altpsyche/engine';
import { createWebGL2Backend } from '../gpu/webgl2';
import { createFakeGL } from './support/fake-gl';
import { pipelineHandle, texture, uniform } from '../graph/handles.js';

/**
 * Which way up a texture's bytes reach the card (item 20).
 *
 * **This exists because the fix it holds was held by a card reading alone.**
 * `texImage2D` places the first row of the bytes at `v = 0`, and in OpenGL that is
 * the *bottom* of the texture; WebGPU's `writeTexture` places the first row at
 * `v = 0` where that is the *top*. So the same bytes sampled at the same
 * coordinate read a vertically mirrored picture, and the two backends drew two
 * different pictures from one source for as long as no preset compared them.
 *
 * On the card that shows as `core-mips` differing in 1,401,861 of 1,440,000
 * channels and agreeing to worst-15 once one frame is flipped. **`gate:card` needs
 * a display and a person and never runs unattended**, so without this the fix
 * could be undone by an edit and nothing in CI would say so. A byte *count* cannot
 * tell a flipped upload from an unflipped one, which is why the double had to
 * learn to record the rows.
 */

const VERTEX = '#version 300 es\nin vec2 position;\nvoid main(){gl_Position=vec4(position,0.0,1.0);}';
const FRAGMENT =
  '#version 300 es\nprecision highp float;\nuniform sampler2D _group_0_binding_1;\nout vec4 c;\nvoid main(){c=texture(_group_0_binding_1,vec2(0.5));}';

const ACROSS = 4;
const DOWN = 3;

/** A picture whose every pixel carries the row it is in, so which way up it
 * arrived is readable off one byte rather than inferred from a length. Row 0 is
 * the top row, which is the order the package declares for both `data` and
 * `readPixels`. */
const picture = () => {
  const bytes = new Uint8Array(ACROSS * DOWN * 4);
  for (let y = 0; y < DOWN; y++) bytes.fill(y + 1, y * ACROSS * 4, (y + 1) * ACROSS * 4);
  return bytes;
};

const frame = (): FrameGraph =>
  ({
    id: 'upload-order',
    authored: 'glsl',
    resources: [
      { kind: 'uniform' },
      {
        kind: 'texture',
        size: { width: ACROSS, height: DOWN },
        format: 'rgba8unorm',
        use: ['sample'],
        data: picture(),
      },
      { kind: 'sampler', filter: 'linear', wrap: 'repeat' },
    ],
    modules: [],
    pipelines: [
      {
        kind: 'render',
        source: { glsl: { vertex: VERTEX, fragment: FRAGMENT } },
        vertex: { document: 'warp', entry: 'main' },
        fragment: { document: 'shade', entry: 'main' },
        bindings: [
          { group: 0, binding: 0, resource: uniform(0), visibility: ['fragment'] },
          { group: 0, binding: 1, resource: texture(1), visibility: ['fragment'], reads: 'sample' },
        ],
      },
    ],
    passes: [{ pipeline: pipelineHandle(0), draws: [{ vertices: 3 }] }],
  }) as FrameGraph;

describe('a texture’s bytes reaching the WebGL 2 card', () => {
  it('go in bottom row first, so sampling agrees with WebGPU', () => {
    const gl = createFakeGL();
    const backend = createWebGL2Backend(gl.canvas);
    if (!backend) throw new Error('the fake canvas gave no WebGL 2 context');
    backend.resize(200, 100);

    backend.program(frame());

    const uploaded = gl.of('texImage2D').find((call) => call.byteLength === ACROSS * DOWN * 4);
    expect(uploaded, 'the picture never reached the card').toBeTruthy();
    // The caller's top row is row 1 and its bottom row is row 3. They arrive the
    // other way up, because `texImage2D`'s first row is OpenGL's bottom — which is
    // exactly what makes the sampled picture agree with WebGPU's.
    expect(uploaded!.firstRow).toBe(DOWN);
    expect(uploaded!.lastRow).toBe(1);
  });

  it('does not disturb a scratch attachment, which has no bytes to turn over', () => {
    const gl = createFakeGL();
    const backend = createWebGL2Backend(gl.canvas);
    if (!backend) throw new Error('the fake canvas gave no WebGL 2 context');
    backend.resize(200, 100);

    backend.program(frame());

    // Every other `texImage2D` is an empty attachment built with null pixels, and
    // a flip of nothing must stay nothing rather than becoming a zero-filled image.
    for (const call of gl.of('texImage2D').filter((one) => one.byteLength === undefined)) {
      expect(call.firstRow).toBeUndefined();
    }
  });
});
