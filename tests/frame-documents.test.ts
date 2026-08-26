import { describe, expect, it } from 'vitest';
import { createWebGPUBackend } from '../gpu/webgpu';
import { assembleFrame, documentNames } from '@altpsyche/engine';
import { pipelineHandle, uniform } from '../graph/handles.js';
import type { FrameGraph, RenderPipelineSpec } from '@altpsyche/engine';
import { createFakeGPU } from './support/fake-gpu';

/**
 * A render pipeline whose two stages are distinct WGSL documents — its vertex a
 * document of its own rather than the backend's corners, its fragment another. The
 * source lives on the pipeline now (item 99), so the two documents are named on the
 * pipeline's own `source` and a loader fetches each under its own name; a set of
 * document names collapses no request and no re-keying hands both the same text.
 *
 * The vertex half being its own WGSL document is what forces two documents into one
 * WGSL render pipeline — the case item 3's `Done when` asks for, now carried by the
 * per-pipeline source rather than a shared module pool.
 */
const VERTEX = '@vertex fn main(@builtin(vertex_index) i : u32) -> @builtin(position) vec4f { return vec4f(0); }';
const FRAGMENT = '@fragment fn fragMain() -> @location(0) vec4f { return vec4f(1); }';

const description: FrameGraph = {
  authored: 'wgsl',
  resources: [{ kind: 'uniform' }],
  modules: [],
  pipelines: [
    {
      kind: 'render',
      // Two distinct WGSL documents (item 3): the vertex and fragment name different
      // fetch keys, so the pair holds two distinct texts once filled rather than one
      // file twice. Item 102 kept this capability when §9's arm became a pair.
      source: { wgsl: { vertex: '', fragment: '' } },
      vertex: { document: 'corners', entry: 'main' },
      fragment: { document: 'shade', entry: 'fragMain' },
      bindings: [{ group: 0, binding: 0, resource: uniform(0), visibility: ['fragment'] }],
    },
  ],
  passes: [{ pipeline: pipelineHandle(0), draws: [{ vertices: 3 }] }],
};

function assembled(): FrameGraph {
  return assembleFrame(
    'two-wgsl-documents',
    description,
    new Map([
      ['corners', VERTEX],
      ['shade', FRAGMENT],
    ]),
    new Map(),
    [{ name: 'u_time', offset: 0, size: 4 }]
  );
}

describe('a render pipeline whose two stages are distinct WGSL documents', () => {
  it('carries the names apart, one request each rather than one collapsed pair', () => {
    expect(documentNames(description)).toEqual(['corners', 'shade']);
  });

  it('assembles with both documents’ text intact on the pipeline’s own source', () => {
    const frame = assembled();
    // A render frame names no shared module (item 99); the text rides each stage of
    // the pipeline's source, filled by the loader from the fetched documents.
    expect(frame.modules).toEqual([]);
    const pipeline = frame.pipelines[0] as RenderPipelineSpec;
    // Both documents' text arrives intact and distinct on the pipeline's own source
    // pair — the item 3 capability, held through item 102/103's pair shape.
    expect(pipeline.source).toEqual({ wgsl: { vertex: VERTEX, fragment: FRAGMENT } });
    expect(pipeline.vertex).toEqual({ document: 'corners', entry: 'main' });
    expect(pipeline.fragment).toEqual({ document: 'shade', entry: 'fragMain' });
  });

  it('draws, compiling a module from each document’s own text', () => {
    const gpu = createFakeGPU();
    const backend = createWebGPUBackend(gpu.canvas, gpu.device);
    if (!backend) throw new Error('the fake canvas gave no WebGPU context');
    backend.resize(800, 600);
    backend.program(assembled()).draw();
    expect(gpu.calls('beginRenderPass')).toHaveLength(1);
    expect(gpu.calls('draw')[0]).toMatchObject({ count: 3 });
  });
});

/**
 * A pipeline naming a document the fetch never filled is a description of a file
 * nobody read: left through, the card would be handed whatever the memory held. The
 * loader refuses it at the same site it refuses a document with no text, naming both
 * the id and the document.
 */
const missing: FrameGraph = {
  authored: 'wgsl',
  resources: [{ kind: 'uniform' }],
  modules: [],
  pipelines: [
    {
      kind: 'render',
      source: { wgsl: { vertex: '', fragment: '' } },
      vertex: { document: 'corners', entry: 'main' },
      fragment: { document: 'shade', entry: 'fragMain' },
      bindings: [{ group: 0, binding: 0, resource: uniform(0), visibility: ['fragment'] }],
    },
  ],
  passes: [{ pipeline: pipelineHandle(0), draws: [{ vertices: 3 }] }],
};

describe('a description naming a document the fetch did not fill', () => {
  it('is refused, naming both the id and the unfilled document', () => {
    expect(() =>
      assembleFrame(
        'unfilled-document',
        missing,
        new Map([['corners', VERTEX]]),
        new Map(),
        [{ name: 'u_time', offset: 0, size: 4 }]
      )
    ).toThrowError(/unfilled-document.*shade|shade.*unfilled-document/);
  });

  it('names both the id and the unfilled document literally', () => {
    let message = '';
    try {
      assembleFrame('unfilled-document', missing, new Map([['corners', VERTEX]]), new Map(), []);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('unfilled-document');
    expect(message).toContain('shade');
  });
});
