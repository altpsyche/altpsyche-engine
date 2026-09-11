import { describe, expect, it } from 'vitest';
import type { FrameGraph, WgslFrameGraph } from '@altpsyche/engine';
import { GEOMETRY_PRIMITIVE, wgslFrame } from '@altpsyche/engine';
import { frameKey } from '../pipeline/cache.js';
import { createWebGL2Backend } from '../gpu/webgl2';
import { createFakeGL } from './support/fake-gl';
import { createFrameRenderer, submit } from '../gpu/renderer.js';
import { indices, pipelineHandle, texture, vertices } from '../graph/handles.js';

/**
 * One test per field the program key reads (item 18, step 5).
 *
 * **Written against the fields and not against the new key**, per
 * `CONTRIBUTING.md`: a test rewritten alongside the code it checks catches
 * nothing, so each case below names a field of `FrameGraph` and asserts that two
 * frames differing only in that field are two programs. If a later change drops
 * a field from the key, the case for that field goes red and names it.
 *
 * **And the one step 4 put at risk.** Two frames differing *only* in a
 * resource's bulk bytes now share a key on purpose. That is only correct if the
 * cached program draws the second frame's bytes, so the last group asserts the
 * bytes reach the card before the draw that reads them. A double can show that
 * ordering; it cannot show the card obeyed it, which is step 6.
 */

const CODE = '@fragment fn fragMain() -> @location(0) vec4<f32> { return vec4<f32>(1.0); }';
const OTHER_CODE = '@fragment fn fragMain() -> @location(0) vec4<f32> { return vec4<f32>(0.5); }';
const BLOCK = [{ name: 'u_time', offset: 0, size: 4 }];

const base = (): WgslFrameGraph => wgslFrame('fixture', CODE, BLOCK) as WgslFrameGraph;

/** The same frame with one field replaced, so each case below differs in exactly
 * the field it names and in nothing else. */
const withField = (over: Partial<WgslFrameGraph>): FrameGraph => ({ ...base(), ...over }) as FrameGraph;

describe('every field the program key reads separates two frames', () => {
  it('id', () => {
    expect(frameKey(withField({ id: 'one' }))).not.toBe(frameKey(withField({ id: 'two' })));
  });

  it('modules', () => {
    const one = withField({ modules: [] });
    const other = withField({ modules: [{ name: 'compute', wgsl: '@compute @workgroup_size(1) fn main() {}' }] });
    expect(frameKey(one)).not.toBe(frameKey(other));
  });

  it('pipelines, through the structure key the pipeline module owns', () => {
    const one = base();
    const other = wgslFrame('fixture', OTHER_CODE, BLOCK);
    expect(frameKey(one)).not.toBe(frameKey(other));
  });

  it('resources, on a uniform block laid out at different offsets', () => {
    const one = wgslFrame('fixture', CODE, [{ name: 'u_time', offset: 0, size: 4 }]);
    const other = wgslFrame('fixture', CODE, [{ name: 'u_time', offset: 16, size: 4 }]);
    expect(frameKey(one)).not.toBe(frameKey(other));
  });

  it('passes', () => {
    const one = base();
    const other = withField({ passes: [...one.passes, ...one.passes] });
    expect(frameKey(one)).not.toBe(frameKey(other));
  });

  it('present', () => {
    expect(frameKey(withField({ present: texture(0) }))).not.toBe(frameKey(withField({ present: texture(1) })));
  });

  it('swap', () => {
    const one = base();
    const other = withField({ swap: [[texture(0), texture(1)]] });
    expect(frameKey(one)).not.toBe(frameKey(other));
  });

  it('a resource’s byte length, which is what the bytes were replaced by', () => {
    const withBytes = (length: number): FrameGraph => {
      const frame = base();
      return {
        ...frame,
        resources: [
          ...frame.resources,
          {
            kind: 'vertices' as const,
            stride: 4,
            count: 1,
            topology: 'triangle-list' as const,
            attributes: [{ location: 0, offset: 0, format: 'float32' as const }],
            data: new Uint8Array(length),
          },
        ],
      } as FrameGraph;
    };
    // A buffer is allocated for a size, so this one has to stay in the key: a
    // figure that grew must miss and recompile rather than hit a buffer built for
    // the smaller one.
    expect(frameKey(withBytes(4))).not.toBe(frameKey(withBytes(8)));
  });
});

const GL_VERTEX =
  '#version 300 es\nlayout(location=0) in vec2 position;\nlayout(location=1) in vec2 grid;\nvoid main(){gl_Position=vec4(position,0.0,1.0);}';
const GL_FRAGMENT = '#version 300 es\nprecision highp float;\nout vec4 c;\nvoid main(){c=vec4(1.0);}';

/** One figure in GLSL whose first geometry byte is `mark`, fresh every call. */
function figure(mark: number): FrameGraph {
  const grid = GEOMETRY_PRIMITIVE['quad-grid'];
  const made = grid.bytes(8, 8);
  const geometry = new Uint8Array(made.vertices);
  geometry[0] = mark;
  return {
    id: 'figure',
    authored: 'glsl',
    resources: [
      { kind: 'uniform' },
      {
        kind: 'vertices',
        stride: grid.stride,
        attributes: grid.attributes,
        topology: grid.topology,
        count: made.vertexCount,
        indices: indices(2),
        data: geometry,
      },
      { kind: 'indices', format: grid.indexFormat, count: made.indexCount, data: made.indices },
    ],
    modules: [],
    pipelines: [
      {
        kind: 'render',
        source: { glsl: { vertex: GL_VERTEX, fragment: GL_FRAGMENT } },
        vertex: { document: 'warp', entry: 'main' },
        fragment: { document: 'shade', entry: 'main' },
        geometry: vertices(1),
        bindings: [],
      },
    ],
    passes: [{ pipeline: pipelineHandle(0), draws: [{ instances: 1 }] }],
  } as FrameGraph;
}

describe('two frames differing only in geometry bytes, which now share a program', () => {
  it('share a key, which is the whole point and would have been a defect before', () => {
    expect(frameKey(figure(1))).toBe(frameKey(figure(2)));
  });

  it('put the second frame’s bytes on the card before the draw that reads them', async () => {
    const gl = createFakeGL();
    const renderer = await createFrameRenderer(gl.canvas, { backend: 'webgl2' });
    if (!renderer) throw new Error('the fake canvas gave no WebGL 2 renderer');

    submit(renderer, figure(1), {});
    const drawsAfterFirst = gl.of('drawElements').length + gl.of('drawElementsInstanced').length;
    submit(renderer, figure(2), {});

    // One program for both frames.
    expect(gl.of('linkProgram')).toHaveLength(1);
    // And the second frame drew. A cache hit that skipped the draw would pass
    // every key assertion above.
    const drawsAfterSecond = gl.of('drawElements').length + gl.of('drawElementsInstanced').length;
    expect(drawsAfterSecond).toBeGreaterThan(drawsAfterFirst);

    // The order is the assertion. The refill has to land *before* the draw that
    // reads it, or the card draws the first frame's geometry and nothing here
    // would say so. `calls` keeps the order the backend made them in.
    const order = gl.calls.map((entry) => entry.call);
    const refilled = order.indexOf('bufferSubData');
    const drewLast = order.lastIndexOf('drawElements') === -1 ? order.lastIndexOf('drawElementsInstanced') : order.lastIndexOf('drawElements');
    expect(refilled).toBeGreaterThan(-1);
    expect(refilled).toBeLessThan(drewLast);
    // And the bytes that landed are the second frame's, not the first's.
    expect(gl.of('bufferSubData')[0]?.first).toBe(2);
  });

  it('draws the first frame’s geometry only once, so nothing was drawn twice from one upload', async () => {
    const gl = createFakeGL();
    const backend = createWebGL2Backend(gl.canvas);
    if (!backend) throw new Error('the fake canvas gave no WebGL 2 context');
    backend.resize(200, 100);
    const program = backend.program(figure(1));

    // Refilling with the same array twice writes once: the second call sees the
    // array it already holds. This is what keeps a static page from paying for
    // the fix.
    const same = figure(2);
    expect(program.refill(same)).toBe(2);
    expect(program.refill(same)).toBe(0);
  });
});
