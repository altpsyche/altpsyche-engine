import { describe, expect, it } from 'vitest';
import { createWebGPUBackend } from '../renderer/webgpu';
import { assembleFrame, documentNames } from '@altpsyche/engine';
import type { FrameDescription, ShaderFrame } from '@altpsyche/engine';
import { createFakeGPU } from './support/fake-gpu';

/**
 * Two distinct WGSL documents in one description, which the three-value address
 * union could not describe: both would have carried the address `wgsl`, a set of
 * addresses would have collapsed them to one request, and a re-keying from address
 * to name would have handed both the same text. Keyed by name, each is fetched,
 * carried and referenced under the one name it has, and the two texts stay apart.
 *
 * The vertex half is its own WGSL document rather than the backend's corners, so a
 * pipeline naming a document at each stage is what forces two documents into one
 * WGSL frame — the case item 3's `Done when` asks for.
 */
const VERTEX = '@vertex fn main(@builtin(vertex_index) i : u32) -> @builtin(position) vec4f { return vec4f(0); }';
const FRAGMENT = '@fragment fn fragMain() -> @location(0) vec4f { return vec4f(1); }';

const description: FrameDescription = {
  target: 'wgsl',
  resources: [{ kind: 'uniform', name: 'uniforms' }],
  documents: [{ name: 'corners' }, { name: 'shade' }],
  pipelines: [
    {
      kind: 'render',
      name: 'frame',
      vertex: { module: 'corners', entry: 'main' },
      fragment: { module: 'shade', entry: 'fragMain' },
      bindings: [{ group: 0, binding: 0, resource: 'uniforms', visibility: ['fragment'] }],
    },
  ],
  passes: [{ pipeline: 'frame', draws: [{ vertices: 3 }] }],
};

function assembled(): ShaderFrame {
  return assembleFrame(
    'two-wgsl-documents',
    description,
    new Map([
      ['corners', VERTEX],
      ['shade', FRAGMENT],
    ]),
    new Map(),
    [{ name: 'u_time', type: 'float' }],
    [{ name: 'u_time', offset: 0, size: 4 }]
  );
}

describe('a description naming two distinct WGSL documents', () => {
  it('carries the names apart, one request each rather than one collapsed pair', () => {
    expect(documentNames(description)).toEqual(['corners', 'shade']);
  });

  it('assembles with both documents’ text intact, neither overwriting the other', () => {
    const frame = assembled();
    expect(frame.modules).toEqual([
      { name: 'corners', code: VERTEX },
      { name: 'shade', code: FRAGMENT },
    ]);
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
 * Two documents sharing one name are two descriptions of one text, not two texts:
 * the loader fetches one, `Object.fromEntries` maps both to one key, and the second
 * silently wins. Keying by name is what lets two documents coexist (above); this is
 * the hole it leaves open — nothing checked the names differ — closed by a refusal
 * at the same site that already refuses a document with no text.
 */
const collision: FrameDescription = {
  target: 'wgsl',
  resources: [{ kind: 'uniform', name: 'uniforms' }],
  documents: [{ name: 'shade' }, { name: 'shade' }],
  pipelines: [
    {
      kind: 'render',
      name: 'frame',
      vertex: { module: 'shade', entry: 'main' },
      fragment: { module: 'shade', entry: 'fragMain' },
      bindings: [{ group: 0, binding: 0, resource: 'uniforms', visibility: ['fragment'] }],
    },
  ],
  passes: [{ pipeline: 'frame', draws: [{ vertices: 3 }] }],
};

describe('a description whose documents do not carry distinct names', () => {
  it('is refused, naming both the id and the repeated name', () => {
    expect(() =>
      assembleFrame(
        'name-collision',
        collision,
        new Map([['shade', FRAGMENT]]),
        new Map(),
        [{ name: 'u_time', type: 'float' }],
        [{ name: 'u_time', offset: 0, size: 4 }]
      )
    ).toThrowError(/name-collision.*shade|shade.*name-collision/);
  });

  it('names both the id and the repeated name literally', () => {
    let message = '';
    try {
      assembleFrame('name-collision', collision, new Map([['shade', FRAGMENT]]), new Map(), [], []);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('name-collision');
    expect(message).toContain('shade');
  });
});
