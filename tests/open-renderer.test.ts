// @vitest-environment jsdom
//
// A document is needed because `openRenderer` reads whether this machine offers
// WebGL 2 from a throwaway canvas, and that canvas is made with
// `document.createElement`. jsdom answers `getContext('webgl2')` with null, so the
// context is swapped on the prototype below and every canvas in a test — the
// throwaway one and the one being drawn into — answers with the recording double.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { glslFrame, glslFrameOf, openRenderer, wgslFrame } from '@altpsyche/engine';
import type { FrameGraph, RenderPipelineSpec, WgslFrameGraph } from '@altpsyche/engine';
import { createFakeGL } from './support/fake-gl';

/**
 * The door that carries a selection through to a renderer (item 12).
 *
 * What these hold is the join rather than the selection: `selectBackend` has its
 * own file of tests and is not re-tested here. What had no test before is the
 * space between the answer and the renderer — the translation step nothing at the
 * door named, and the silent WebGL 2 default that a caller naming nothing used to
 * get on a machine offering WebGPU.
 *
 * **The refusals are the point.** Every one of them was a throw from inside a
 * backend before, or a picture that never arrived, so each is asserted by the
 * sentence it prints rather than by the fact that something went wrong.
 */

const BLOCK = [{ name: 'u_time', offset: 0, size: 4 }];
const WGSL = '@fragment fn fragMain() -> @location(0) vec4<f32> { return vec4<f32>(1.0); }';
const GLSL_VERTEX = '#version 300 es\nin vec3 position;\nvoid main(){gl_Position=vec4(position,1.0);}';
const GLSL_FRAGMENT = '#version 300 es\nprecision highp float;\nout vec4 c;\nvoid main(){c=vec4(1.0);}';

let restore: (() => void) | null = null;

beforeEach(() => {
  const fake = createFakeGL();
  const original = HTMLCanvasElement.prototype.getContext;
  // Every canvas answers through the double, because two are made in one call:
  // the throwaway one the WebGL 2 offering is read from, and the one drawn into.
  HTMLCanvasElement.prototype.getContext = fake.canvas.getContext as typeof original;
  restore = () => {
    HTMLCanvasElement.prototype.getContext = original;
  };
});

afterEach(() => {
  restore?.();
  restore = null;
});

const canvas = (): HTMLCanvasElement => document.createElement('canvas');

/** A WGSL frame whose build claims a translation exists. `translated` is the
 * build's claim and the bake is the truth, and the three frames below are the
 * shapes where the two disagree — which is what routes a frame to WebGL 2 and
 * then leaves `glslFrameOf` with nothing to give. */
const claiming = (frame: WgslFrameGraph, pipelines: RenderPipelineSpec[]): WgslFrameGraph =>
  ({ ...frame, translated: true, pipelines }) as WgslFrameGraph;

/** The fullscreen shape: a render pipeline with no vertex stage, because the
 * backend supplies the corners. */
const fullscreen = (): WgslFrameGraph => {
  const frame = wgslFrame('fullscreen-claim', WGSL, BLOCK) as WgslFrameGraph;
  return claiming(frame, frame.pipelines as RenderPipelineSpec[]);
};

/** A pipeline naming a vertex stage whose GLSL the build never baked. */
const unbakedStage = (): WgslFrameGraph => {
  const frame = wgslFrame('unbaked-claim', WGSL, BLOCK) as WgslFrameGraph;
  const one = frame.pipelines[0] as RenderPipelineSpec;
  return claiming(frame, [{ ...one, vertex: { document: 'wgsl', entry: 'vertMain' } } as RenderPipelineSpec]);
};

/** A pipeline with both halves baked, which is the condition under which
 * `glslFrameOf` gives back a drawable frame. */
const translatable = (): WgslFrameGraph => {
  const frame = wgslFrame('translatable', WGSL, BLOCK) as WgslFrameGraph;
  const one = frame.pipelines[0] as RenderPipelineSpec;
  return claiming(frame, [
    {
      ...one,
      vertex: { document: 'wgsl', entry: 'vertMain' },
      source: { ...one.source, glsl: { vertex: GLSL_VERTEX, fragment: GLSL_FRAGMENT } },
    } as RenderPipelineSpec,
  ]);
};

/** A compute pipeline, which WebGL 2 has no stage for at all. */
const computeStage = (): WgslFrameGraph => {
  const frame = wgslFrame('compute-claim', WGSL, BLOCK) as WgslFrameGraph;
  const compute = {
    kind: 'compute',
    bindings: [],
    workgroup: [1, 1, 1],
    compute: { module: 0, entry: 'main' },
  } as unknown as RenderPipelineSpec;
  return claiming(frame, [compute]);
};

describe('a frame no allowed backend can draw is refused before the browser is touched', () => {
  it('refuses a WGSL frame narrowed to WebGL 2 that carries no translation at all', async () => {
    // `translated` is absent, so selection itself comes back empty. The refusal is
    // `selectBackend`'s own words rather than anything this door writes, which is
    // what says the door adds no second opinion.
    const opened = await openRenderer(canvas(), wgslFrame('untranslated', WGSL, BLOCK), { backend: 'webgl2' });
    expect('refusal' in opened).toBe(true);
    expect((opened as { refusal: string }).refusal).toContain('no backend can draw a wgsl frame');
  });
});

describe('the translation step, which nothing at the door used to name', () => {
  // Each of the three shapes `glslFrameOf` returns null for gets a sentence naming
  // which one it was. The pairing is asserted rather than assumed: the frame is put
  // through `glslFrameOf` in the same test, so a shape that stops being refused
  // there fails here rather than printing a cause for a frame that translated fine.
  const cases: [string, () => WgslFrameGraph, string][] = [
    ['a compute stage', computeStage, 'compute stage, which WebGL 2 has none of'],
    ['a fullscreen frame with no vertex stage', fullscreen, 'baked no vertex stage'],
    ['a stage the build refused to translate', unbakedStage, 'baked no GLSL for one of its stages'],
  ];

  for (const [what, build, expected] of cases) {
    it(`refuses ${what} by name rather than throwing inside the backend`, async () => {
      const frame = build();
      expect(glslFrameOf(frame), 'the fixture must be one glslFrameOf has nothing to give for').toBeNull();

      const opened = await openRenderer(canvas(), frame, { backend: 'webgl2' });
      expect('refusal' in opened, `${what} opened a renderer it should have refused`).toBe(true);
      const { refusal } = opened as { refusal: string };
      expect(refusal).toContain(expected);
      expect(refusal).toContain(frame.id as string);
      // The throw this door exists to stop. Before item 12 a caller reaching this
      // point handed the frame to the backend and got this sentence out of it.
      expect(refusal).not.toContain('was handed a wgsl frame to draw');
    });
  }

  it('hands back the GLSL translation for a frame that does translate, not the frame it was given', async () => {
    // The converse of the three above, and the reason `OpenedRenderer` carries a
    // frame at all. A caller that kept its own copy and submitted that would hand a
    // WGSL frame to a WebGL 2 renderer, which is the throw this door exists to stop.
    const frame = translatable();
    expect(glslFrameOf(frame), 'the fixture must be one glslFrameOf can translate').not.toBeNull();

    const opened = await openRenderer(canvas(), frame, { backend: 'webgl2' });
    expect('renderer' in opened, JSON.stringify(opened)).toBe(true);
    const { renderer, frame: drawn } = opened as { renderer: { backend: string }; frame: FrameGraph };
    expect(renderer.backend).toBe('webgl2');
    expect(drawn.authored).toBe('glsl');
    expect(drawn).not.toBe(frame);
  });
});

describe('a renderer opened is a renderer that draws the frame it hands back', () => {
  it('opens WebGL 2 for a GLSL frame and hands back the frame it was given', async () => {
    const frame: FrameGraph = glslFrame('glsl-one', GLSL_VERTEX, GLSL_FRAGMENT);
    const opened = await openRenderer(canvas(), frame);
    expect('renderer' in opened, JSON.stringify(opened)).toBe(true);
    const { renderer, frame: drawn } = opened as { renderer: { backend: string }; frame: FrameGraph };
    expect(renderer.backend).toBe('webgl2');
    // No translation was needed, so it is the same object rather than a copy.
    expect(drawn).toBe(frame);
  });

  it('narrows to the named backend rather than overriding the selection', async () => {
    // `backend` still means what it meant on the primitive — use this one — but a
    // frame the named backend cannot draw is now refused by name here instead of
    // reaching that backend and throwing out of it.
    const frame: FrameGraph = glslFrame('glsl-narrowed', GLSL_VERTEX, GLSL_FRAGMENT);
    const opened = await openRenderer(canvas(), frame, { backend: 'webgl2' });
    expect('renderer' in opened).toBe(true);
    expect((opened as { renderer: { backend: string } }).renderer.backend).toBe('webgl2');
  });

  it('refuses where the machine offers no WebGL 2 context, rather than assuming one', async () => {
    // The offering is read rather than assumed, which is what this asserts: with the
    // double taken off, jsdom answers no context, so WebGL 2 is not offered and the
    // selection comes back empty. A door that assumed WebGL 2 is always there would
    // open a renderer here and hand back one that draws nothing.
    restore?.();
    restore = null;
    const frame: FrameGraph = glslFrame('no-context', GLSL_VERTEX, GLSL_FRAGMENT);
    const opened = await openRenderer(canvas(), frame);
    expect('refusal' in opened).toBe(true);
    expect((opened as { refusal: string }).refusal).toContain('no backend can draw a glsl frame');
  });
});
