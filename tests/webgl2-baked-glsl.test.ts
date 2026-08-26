import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createWebGL2Backend } from '../gpu/webgl2';
import { selectBackend } from '../gpu/select';
import { frameOf, glslFrameOf } from '../toy/frame';
import { loadFixture } from './support/fixture';
import { buffer } from '../graph/handles.js';
import { createFakeGL } from './support/fake-gl';
import type { FixtureName } from './support/fixture';
import type { FrameGraph, GlslRenderSource, RenderPipelineSpec, WgslFrameGraph } from '@altpsyche/engine';

/**
 * The baked GLSL reaching the WebGL 2 backend through the source that carries it,
 * read independently of the gate that draws it (items 79, 94).
 *
 * `gates/corpus.mjs` draws the capability corpus through `createWebGL2Backend` on a
 * real `webgl2` context. Every preset's *source* is WGSL, and WebGL 2 links GLSL,
 * so the frame the gate draws is the WGSL frame turned into GLSL by the library's
 * own `glslFrameOf` — which reads the GLSL ES 3.00 naga baked off each
 * `WgslModule.glsl`, keyed by entry point, rather than off a gate-local stitch of
 * the build artifact (item 94). This test loads that bake onto the source the way a
 * corpus loader does, then asks the library to make the GLSL frame and draws it.
 *
 * The browser draw itself is a `gate:browser` reading — a real context, a software
 * renderer is enough — and is not run here (§17 note 3). What this pins in the fast
 * suite is the half a node machine *can* settle: that the assembled baked-GLSL
 * frame is one the WebGL 2 backend accepts and draws, so a red browser gate would
 * mean the driver refused the GLSL rather than that the source carried it wrong.
 * The bake is loaded onto the source here rather than imported from the `.mjs`
 * gate, the way `translate-build.test.ts` re-implements the entry-point scan, so
 * this is an independent reading of the bake and not a mirror of the gate.
 */
const ARTIFACT = path.join(import.meta.dirname, '..', 'fixtures', 'source', 'glsl', 'corpus.generated.json');
const artifact = (): {
  presets: Record<string, { entries: Record<string, { stage: string; glsl: string }> }>;
} => JSON.parse(readFileSync(ARTIFACT, 'utf8'));

/** The bytes the loader fetched, keyed by the index of the resource that reads them
 * (item 87) — the same rekey `gates/lib.mjs`'s `loadCorpus` does. */
function bytesOf(description: FrameGraph, generated: Map<string, Uint8Array<ArrayBuffer>>) {
  const bytes = new Map<number, Uint8Array<ArrayBuffer>>();
  description.resources.forEach((resource, index) => {
    const source = 'source' in resource ? resource.source : undefined;
    if (!source) return;
    const made = generated.get(source);
    if (!made) throw new Error(`nothing generated ${source} for the fixture`);
    bytes.set(index, made);
  });
  return bytes;
}

/** The WGSL frame a WebGPU-less device selects for a preset, carrying naga's baked
 * GLSL on its `wgsl` document keyed by entry point — the state a corpus loader
 * leaves the source in so the translation travels with it (item 94). */
function bakedWgslFrame(id: FixtureName): WgslFrameGraph {
  const { description, code, generated } = loadFixture(id);
  const baked = artifact().presets[id]?.entries ?? {};
  const glslByEntry: Record<string, string> = Object.fromEntries(
    Object.entries(baked).map(([entry, { glsl }]) => [entry, glsl])
  );
  // The bake rides each render pipeline's own source now, collapsed to that
  // pipeline's own `{ vertex; fragment }` pair (item 103), built from the two entry
  // points it runs off the entry-keyed artifact — which is what `glslFrameOf` reads
  // rather than the artifact directly. A stage naga refused has no entry, so its
  // half is absent and `glslFrameOf` skips the frame by outcome.
  const bakePair = (spec: RenderPipelineSpec): { vertex?: string; fragment?: string } => {
    const pair: { vertex?: string; fragment?: string } = {};
    if (spec.vertex && glslByEntry[spec.vertex.entry] !== undefined) pair.vertex = glslByEntry[spec.vertex.entry];
    if (glslByEntry[spec.fragment.entry] !== undefined) pair.fragment = glslByEntry[spec.fragment.entry];
    return pair;
  };
  // `translated` is true only when every pipeline is a render pipeline naming a
  // vertex stage with both halves baked — the condition under which `glslFrameOf`
  // returns a drawable frame (item 105), mirroring `gates/lib.mjs`'s `loadCorpus`. A
  // fullscreen or partly baked preset is not routed to WebGL 2.
  const translated = (description as WgslFrameGraph).pipelines.every(
    (spec) =>
      spec.kind === 'render' &&
      spec.vertex !== undefined &&
      bakePair(spec).vertex !== undefined &&
      bakePair(spec).fragment !== undefined
  );
  const withBake: WgslFrameGraph = {
    ...(description as WgslFrameGraph),
    pipelines: (description as WgslFrameGraph).pipelines.map((spec) =>
      spec.kind === 'render'
        ? { ...spec, source: { ...spec.source, glsl: bakePair(spec) as { vertex: string; fragment: string } } }
        : spec
    ),
    translated,
  };
  return frameOf(id, withBake, { wgsl: code }, undefined, undefined, bytesOf(description, generated)) as WgslFrameGraph;
}

describe('the WebGL 2 corpus column draws baked GLSL off the source that carries it (items 79, 94)', () => {
  it('turns core-geometry into a baked-GLSL frame the backend draws', () => {
    const frame = glslFrameOf(bakedWgslFrame('core-geometry'));
    expect(frame, 'core-geometry bakes both a vertex and a fragment').not.toBeNull();
    expect(frame!.authored).toBe('glsl');
    // The pipeline carries its own baked GLSL source now (item 99): its two stages
    // are the baked vertex and fragment, entered at main, rather than the one WGSL
    // document the source carried. A render frame names no shared module.
    expect(frame!.modules).toEqual([]);
    const pipeline = frame!.pipelines[0] as RenderPipelineSpec;
    const source = pipeline.source as GlslRenderSource;
    // The pipeline names a vertex stage (not the fullscreen frame that bakes none),
    // both stages enter at main, and the source's GLSL pair carries each stage's
    // baked text.
    expect(pipeline.vertex).toBeDefined();
    expect(pipeline.vertex!.entry).toBe('main');
    expect(pipeline.fragment.entry).toBe('main');
    expect(source.glsl.vertex.startsWith('#version 300 es')).toBe(true);
    expect(source.glsl.fragment.startsWith('#version 300 es')).toBe(true);

    const gl = createFakeGL();
    const backend = createWebGL2Backend(gl.canvas);
    expect(backend).not.toBeNull();
    backend!.resize(800, 600);
    const program = backend!.program(frame!);
    program.setUniforms({ u_time: 0, u_resolution: [800, 600] });
    expect(() => program.draw()).not.toThrow();
    // The geometry's one instanced draw is issued, which is the draw the browser
    // gate then lights the buffer with; on the fake this reads calls, not pixels.
    expect(gl.of('drawElementsInstanced')).toHaveLength(1);
  });

  it('turns core-depth, which draws the sheet through the backend it once refused', () => {
    // A second preset, and a two-pass depth-tested one (item 48), to show the
    // transform is not shaped around the one geometry preset it must draw.
    const frame = glslFrameOf(bakedWgslFrame('core-depth'));
    expect(frame, 'core-depth bakes a vertex and a fragment').not.toBeNull();
    const gl = createFakeGL();
    const backend = createWebGL2Backend(gl.canvas);
    backend!.resize(800, 600);
    expect(() => backend!.program(frame!).draw()).not.toThrow();
  });

  it('turns core-perdraw-uniform, and the backend binds one range a draw (item 85)', () => {
    // The per-draw preset: one grid drawn three times, each draw pointed at its own
    // record by the offset it names. This is the half a node machine can settle —
    // the assembled baked-GLSL frame is one the backend accepts and draws, so a red
    // browser gate would mean the driver refused the GLSL, not that the source
    // carried it wrong. That the three quads light is the corpus gate's.
    const frame = glslFrameOf(bakedWgslFrame('core-perdraw-uniform'));
    expect(frame, 'core-perdraw-uniform bakes a vertex and a fragment').not.toBeNull();
    // The per-draw binding survives the re-point where the shared block's binding
    // drops, so the backend can read which buffer to slice and how wide a record is.
    expect(frame!.pipelines[0].bindings).toEqual([
      { group: 1, binding: 0, resource: buffer(1), visibility: ['vertex'], perDraw: { size: 16 } },
    ]);
    const gl = createFakeGL();
    const backend = createWebGL2Backend(gl.canvas)!;
    backend.resize(800, 600);
    const program = backend.program(frame!);
    program.setUniforms({ u_time: 0, u_resolution: [800, 600] });
    expect(() => program.draw()).not.toThrow();
    // Three draws, three ranges, each at its own 256-byte offset: the slice each
    // draw reads is decided by the offset the backend bound, not the block's last
    // write. The geometry is one instanced draw apiece (item 77).
    expect(gl.of('bindBufferRange').map((call) => call.offset)).toEqual([0, 256, 512]);
    expect(gl.of('drawElementsInstanced')).toHaveLength(3);
  });

  it('reports no baked GLSL for a fullscreen WGSL preset rather than inventing a vertex', () => {
    // core-texture is a fullscreen fragment: WGSL supplies the corners, so naga
    // bakes only a fragment and there is no vertex for WebGL 2 to link. The gate
    // skips it by outcome — a reported reason — rather than drawing it.
    expect(glslFrameOf(bakedWgslFrame('core-texture'))).toBeNull();
    // …and a fragment-only bake is not a translation: a WebGPU-less device is
    // refused for a missing translation rather than routed to a backend that then
    // cannot build the frame (item 105 tightened `translated` to full-bake).
    expect(bakedWgslFrame('core-texture').translated).toBe(false);
    const outcome = selectBackend(bakedWgslFrame('core-texture'), { webgpu: false, webgl2: true });
    expect('refusal' in outcome && outcome.refusal).toContain('translation');
  });
});

/**
 * A WGSL scene's read-only storage buffer reaching WebGL 2 by a hand-authored GLSL
 * bake (item 105). naga's es300 target has no storage-buffer syntax, so it records
 * `core-material`'s and `core-draw-list`'s `project` vertex as a `storage-buffer`
 * skip; item 92 landed the raster path for it — the buffer bound whole as a std140
 * uniform block, indexed by `gl_InstanceID` — and this item supplies the bake, so
 * item 91's selection finds a translation and routes the frame to WebGL 2 rather
 * than refusing it.
 *
 * Before this item both presets baked only their fragment, so `glslFrameOf` returned
 * null and a WebGPU-less device was refused for a missing translation; the routing
 * assertions here would have failed. That the picture is byte-correct on a card is a
 * `gate:browser`/`gate:card` reading (§17 note 3), not run here — the fake records
 * calls, not pixels, and reports the blocks a driver would rather than compiling the
 * GLSL, so a red browser gate would mean the driver refused the hand-authored GLSL.
 */
describe("a WGSL scene's read-only storage buffer bakes to WebGL 2 (item 105)", () => {
  const STORAGE = {
    'core-material': { bytes: 160, instances: 2 },
    'core-draw-list': { bytes: 192, instances: 3 },
  } as const;

  for (const id of ['core-material', 'core-draw-list'] as const) {
    it(`routes ${id} to WebGL 2 now that a full translation exists`, () => {
      const frame = bakedWgslFrame(id);
      // Both stages are baked, so the frame carries a translation and a WebGPU-less
      // device selects WebGL 2 rather than refusing for a missing one.
      expect(frame.translated).toBe(true);
      const selection = selectBackend(frame, { webgpu: false, webgl2: true });
      expect('backend' in selection && selection.backend).toBe('webgl2');
      // A WebGPU device still draws it natively — the translation is a fallback, not a
      // redirection (item 91).
      const onGpu = selectBackend(frame, { webgpu: true, webgl2: true });
      expect('backend' in onGpu && onGpu.backend).toBe('webgpu');
    });

    it(`bakes ${id}'s storage buffer as a uniform block indexed by gl_InstanceID (item 92's shape)`, () => {
      const frame = glslFrameOf(bakedWgslFrame(id));
      expect(frame, `${id} now bakes both a vertex and a fragment`).not.toBeNull();
      const source = (frame!.pipelines[0] as RenderPipelineSpec).source as GlslRenderSource;
      // The read-only storage buffer at @group(1) @binding(0) becomes a std140 uniform
      // block whose member carries the binding's `_group_G_binding_B` tag, read out by
      // gl_InstanceID — the one raster path GLSL ES 3.00 has for a read-only array<T>.
      expect(source.glsl.vertex).toContain('_group_1_binding_0[gl_InstanceID]');
      expect(source.glsl.vertex.startsWith('#version 300 es')).toBe(true);
    });

    it(`draws ${id} through the backend that once refused its buffer, bound whole`, () => {
      const frame = glslFrameOf(bakedWgslFrame(id));
      const { bytes, instances } = STORAGE[id];
      const gl = createFakeGL();
      // The blocks a driver reports for the baked GLSL: the shared Uniforms block
      // (untagged) and the storage buffer's block, its member carrying the binding's
      // tag so `resolveBlocks` binds it to its own point above the shared one.
      gl.blocks = [
        {
          bytes: 80,
          members: [
            { name: 'Uniforms._group_0_binding_0_vs.u_time', offset: 0 },
            { name: 'Uniforms._group_0_binding_0_vs.u_resolution', offset: 8 },
            { name: 'Uniforms._group_0_binding_0_vs.u_view', offset: 16 },
          ],
        },
        { bytes, members: [{ name: '_group_1_binding_0[0]', offset: 0 }] },
      ];
      const backend = createWebGL2Backend(gl.canvas)!;
      backend.resize(800, 600);
      const program = backend.program(frame!);
      program.setUniforms({ u_time: 0, u_resolution: [800, 600], u_view: new Array(16).fill(0) });
      expect(() => program.draw()).not.toThrow();
      // One instanced draw issuing the object count, and the storage buffer bound whole
      // to its own block point (STORAGE_POINT_BASE = 2) — item 92's raster path.
      expect(gl.of('drawElementsInstanced')).toHaveLength(1);
      expect(gl.of('drawElementsInstanced').at(-1)).toMatchObject({ instances });
      expect(gl.of('bindBufferBase').map((call) => call.index)).toContain(2);
    });
  }
});
