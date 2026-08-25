import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createWebGL2Backend } from '../gpu/webgl2';
import { frameOf, glslFrameOf } from '../toy/frame';
import { loadFixture } from './support/fixture';
import { createFakeGL } from './support/fake-gl';
import type { FixtureName } from './support/fixture';
import type { FrameGraph, WgslFrameGraph } from '@altpsyche/engine';

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

/** The bytes the loader fetched, keyed by the resource that reads them — the same
 * rekey `gates/lib.mjs`'s `loadCorpus` does. */
function bytesOf(description: FrameGraph, generated: Map<string, Uint8Array<ArrayBuffer>>) {
  const bytes = new Map<string, Uint8Array<ArrayBuffer>>();
  for (const resource of description.resources) {
    const source = 'source' in resource ? resource.source : undefined;
    if (!source) continue;
    const made = generated.get(source);
    if (!made) throw new Error(`nothing generated ${source} for the fixture`);
    bytes.set(resource.name, made);
  }
  return bytes;
}

/** The WGSL frame a WebGPU-less device selects for a preset, carrying naga's baked
 * GLSL on its `wgsl` document keyed by entry point — the state a corpus loader
 * leaves the source in so the translation travels with it (item 94). */
function bakedWgslFrame(id: FixtureName): WgslFrameGraph {
  const { description, code, generated } = loadFixture(id);
  const baked = artifact().presets[id]?.entries ?? {};
  const glsl = Object.fromEntries(Object.entries(baked).map(([entry, { glsl }]) => [entry, glsl]));
  // The bake rides the source: each WGSL document gains the GLSL its entry points
  // baked to, which is what `glslFrameOf` reads rather than the artifact directly.
  const withBake: WgslFrameGraph = {
    ...(description as WgslFrameGraph),
    modules: (description as WgslFrameGraph).modules.map((module) => ({ ...module, glsl })),
    translated: true,
  };
  return frameOf(id, withBake, { wgsl: code }, undefined, undefined, bytesOf(description, generated)) as WgslFrameGraph;
}

describe('the WebGL 2 corpus column draws baked GLSL off the source that carries it (items 79, 94)', () => {
  it('turns core-geometry into a baked-GLSL frame the backend draws', () => {
    const frame = glslFrameOf(bakedWgslFrame('core-geometry'));
    expect(frame, 'core-geometry bakes both a vertex and a fragment').not.toBeNull();
    expect(frame!.authored).toBe('glsl');
    // The pipeline names the baked entry points as its two documents, entered at
    // main, rather than the one WGSL document the source carried.
    expect(frame!.modules.map((module) => module.name).sort()).toEqual(['shade', 'warp']);
    expect(frame!.modules.every((module) => module.glsl.startsWith('#version 300 es'))).toBe(true);

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
      { group: 1, binding: 0, resource: 'slice', visibility: ['vertex'], perDraw: { size: 16 } },
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
  });
});
