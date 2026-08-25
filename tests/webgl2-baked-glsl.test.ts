import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createWebGL2Backend } from '../gpu/webgl2';
import { frameOf } from '../toy/frame';
import { loadFixture } from './support/fixture';
import { createFakeGL } from './support/fake-gl';
import type { FrameDescription } from '@altpsyche/engine';

/**
 * Item 79's frame assembly, read independently of the gate that uses it.
 *
 * `gates/corpus.mjs` draws the capability corpus through `createWebGL2Backend` on
 * a real `webgl2` context. Every preset's *source* is WGSL, and WebGL 2 links
 * GLSL, so the frame the gate draws is the WGSL description re-pointed at the GLSL
 * ES 3.00 the build baked with naga (`fixtures/source/glsl/corpus.generated.json`,
 * item 41): each pipeline's `vertex`/`fragment` entry becomes a GLSL document of
 * its own, and the geometry bytes the loader fetched carry through unchanged.
 *
 * The browser draw itself is a `gate:browser` reading — a real context, a software
 * renderer is enough — and is not run here (§17 note 3). What this pins in the fast
 * suite is the half a node machine *can* settle: that the assembled baked-GLSL
 * frame is one the WebGL 2 backend accepts and draws, so a red browser gate would
 * mean the driver refused the GLSL rather than that the harness built the frame
 * wrong. The transform below is re-implemented rather than imported from the `.mjs`
 * gate, the way `translate-build.test.ts` re-implements the entry-point scan, so
 * this is an independent reading of the bake and not a mirror of the gate.
 */
const ARTIFACT = path.join(import.meta.dirname, '..', 'fixtures', 'source', 'glsl', 'corpus.generated.json');
const artifact = (): {
  presets: Record<string, { entries: Record<string, { stage: string; glsl: string }> }>;
} => JSON.parse(readFileSync(ARTIFACT, 'utf8'));

/** Re-point a WGSL description's pipelines at the baked GLSL: each entry point a
 * pipeline names becomes a document of its own, entered at `main`, and the block
 * bindings drop away because a GLSL program answers where its block sits. Returns
 * null where the bake carries no GLSL for an entry the pipelines need — a
 * fullscreen WGSL frame (no vertex baked) or a stage naga refused. */
function glslFrameOf(id: string, description: FrameDescription, bytes: Map<string, Uint8Array<ArrayBuffer>>) {
  const baked = artifact().presets[id]?.entries ?? {};
  const names = new Set<string>();
  let unbaked: string | null = null;
  const pipelines = description.pipelines.map((pipeline) => {
    // A compute pipeline has no vertex or fragment and no place on WebGL 2; the
    // corpus's one compute preset is left unbaked and skipped either way.
    if (!('fragment' in pipeline)) {
      unbaked = 'compute';
      return pipeline;
    }
    const vertex =
      pipeline.vertex === 'fullscreen' ? 'fullscreen' : { module: pipeline.vertex.entry, entry: 'main' as const };
    if (pipeline.vertex === 'fullscreen') unbaked = 'fullscreen';
    else {
      names.add(pipeline.vertex.entry);
      if (!baked[pipeline.vertex.entry]) unbaked = pipeline.vertex.entry;
    }
    names.add(pipeline.fragment.entry);
    if (!baked[pipeline.fragment.entry]) unbaked = pipeline.fragment.entry;
    // The block bindings drop away because a GLSL program answers where its block
    // sits — except a per-draw slice's, which the backend reads to know which
    // buffer to bind one record's range of a draw (item 27/85).
    const bindings = (pipeline.bindings ?? []).filter((binding) => binding.perDraw !== undefined);
    return { ...pipeline, vertex, fragment: { module: pipeline.fragment.entry, entry: 'main' as const }, bindings };
  });
  if (unbaked) return null;
  const documents = [...names].map((name) => ({ name }));
  const texts = Object.fromEntries([...names].map((name) => [name, baked[name].glsl]));
  const glsl = {
    ...description,
    target: 'glsl',
    documents,
    pipelines: pipelines as FrameDescription['pipelines'],
  } as FrameDescription;
  return frameOf(id, glsl, texts, undefined, undefined, bytes);
}

/** The bytes the loader fetched, keyed by the resource that reads them — the same
 * rekey `gates/lib.mjs`'s `loadCorpus` does. */
function bytesOf(description: FrameDescription, generated: Map<string, Uint8Array<ArrayBuffer>>) {
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

describe('the WebGL 2 corpus column draws baked GLSL, not the WGSL source (item 79)', () => {
  it('re-points core-geometry at its baked GLSL and the backend draws it', () => {
    const { description, generated } = loadFixture('core-geometry');
    const frame = glslFrameOf('core-geometry', description, bytesOf(description, generated));
    expect(frame, 'core-geometry bakes both a vertex and a fragment').not.toBeNull();
    expect(frame!.target).toBe('glsl');
    // The pipeline names the baked entry points as its two documents, entered at
    // main, rather than the one WGSL document the source carried.
    expect(frame!.modules.map((module) => module.name).sort()).toEqual(['shade', 'warp']);
    expect(frame!.modules.every((module) => module.code.startsWith('#version 300 es'))).toBe(true);

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

  it('re-points core-depth, which draws the sheet through the backend it once refused', () => {
    // A second preset, and a two-pass depth-tested one (item 48), to show the
    // transform is not shaped around the one geometry preset it must draw.
    const { description, generated } = loadFixture('core-depth');
    const frame = glslFrameOf('core-depth', description, bytesOf(description, generated));
    expect(frame, 'core-depth bakes a vertex and a fragment').not.toBeNull();
    const gl = createFakeGL();
    const backend = createWebGL2Backend(gl.canvas);
    backend!.resize(800, 600);
    expect(() => backend!.program(frame!).draw()).not.toThrow();
  });

  it('re-points core-perdraw-uniform, and the backend binds one range a draw (item 85)', () => {
    // The per-draw preset: one grid drawn three times, each draw pointed at its own
    // record by the offset it names. This is the half a node machine can settle —
    // the assembled baked-GLSL frame is one the backend accepts and draws, so a red
    // browser gate would mean the driver refused the GLSL, not that the harness
    // built the frame wrong. That the three quads light is the corpus gate's.
    const { description, generated } = loadFixture('core-perdraw-uniform');
    const frame = glslFrameOf('core-perdraw-uniform', description, bytesOf(description, generated));
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
    const { description, generated } = loadFixture('core-texture');
    expect(glslFrameOf('core-texture', description, bytesOf(description, generated))).toBeNull();
  });
});
