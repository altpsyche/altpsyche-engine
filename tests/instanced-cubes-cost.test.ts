import { describe, expect, it } from 'vitest';
import { cost } from '@altpsyche/engine';
import { moduleHandle, pipelineHandle, texture, uniform, vertices } from '../graph/handles.js';
import type { FrameCost, FrameGraph } from '@altpsyche/engine';

/**
 * The cost of a thousand objects, which is Phase 3's whole point: `instanced-cubes`
 * (item 30) draws them in one pass through one instanced draw, and `cost()` counts
 * that one call as one draw however many instances it reads (item 28). This pins
 * the number a budget (item 31) is then set against, so a regression that split the
 * thousand into many draws or many passes — the shape items 26–28 removed — fails
 * here rather than only slowing a card.
 *
 * The frames are built to match `examples/instanced-cubes/main.ts` in the fields
 * `cost()` reads. Nothing here draws: `cost()` is a fact about structure, so it is
 * asserted on any machine (§17 decision 9) with no backend and no card present,
 * which is the same home item 23 pins the corpus's per-preset costs at.
 */

const COUNT = 1000;
const SIZE = { width: 800, height: 600 };

/** The WebGPU authoring: one cube vertex buffer with its bytes (resident, so it is
 * not transient), one frame-sized depth attachment (transient), one render pipeline
 * reading the geometry and testing depth, and one pass issuing a single instanced
 * draw into the frame's own colour target. */
const wgslCubes: FrameGraph = {
  id: 'instanced-cubes',
  authored: 'wgsl',
  resources: [
    { kind: 'uniform', block: [{ name: 'u_time', offset: 0, size: 4 }] },
    {
      kind: 'vertices',
      stride: 24,
      attributes: [
        { location: 0, offset: 0, format: 'float32x3' },
        { location: 1, offset: 12, format: 'float32x3' },
      ],
      topology: 'triangle-list',
      count: 36,
      data: new Uint8Array(36 * 24),
    },
    { kind: 'texture', size: { scale: 1 }, format: 'depth24plus', use: ['attachment'] },
  ],
  modules: [{ name: 'wgsl', wgsl: '' }],
  pipelines: [
    {
      kind: 'render',
      vertex: { module: moduleHandle(0), entry: 'cube' },
      fragment: { module: moduleHandle(0), entry: 'shade' },
      geometry: vertices(1),
      bindings: [{ group: 0, binding: 0, resource: uniform(0), visibility: ['vertex'] }],
      depth: { format: 'depth24plus', compare: 'less', write: true },
    },
  ],
  passes: [{ pipeline: pipelineHandle(0), draws: [{ instances: COUNT }], depth: { resource: texture(2), clear: 1 } }],
};

/** The WebGL 2 authoring: the backend's own corners, one instanced draw covering
 * the thousand objects, no depth and no vertex buffer of its own. */
const glslCubes: FrameGraph = {
  id: 'instanced-cubes',
  authored: 'glsl',
  resources: [{ kind: 'uniform' }],
  modules: [
    { name: 'vertex', glsl: '' },
    { name: 'fragment', glsl: '' },
  ],
  pipelines: [
    {
      kind: 'render',
      vertex: { module: moduleHandle(0), entry: 'main' },
      fragment: { module: moduleHandle(1), entry: 'main' },
      bindings: [],
    },
  ],
  passes: [{ pipeline: pipelineHandle(0), draws: [{ vertices: 3, instances: COUNT }] }],
};

describe('a thousand instanced objects cost one draw in one pass', () => {
  it('counts the WebGPU cubes as one pass, one draw, whatever the instance count', () => {
    // One pass; one draw for the one instanced call; the first pipeline and bind
    // both count from nothing; the frame's own colour stores once and loads none;
    // the cleared depth is discarded (item 1); the depth target is the one
    // transient, frame-sized at four bytes a pixel (depth24plus).
    const expected: FrameCost = {
      passes: 1,
      draws: 1,
      dispatches: 0,
      pipelineSwitches: 1,
      bindSwitches: 1,
      attachmentLoads: 0,
      attachmentStores: 1,
      transientBytes: 800 * 600 * 4,
    };
    expect(cost(wgslCubes, SIZE)).toEqual(expected);
  });

  it('counts the WebGL 2 cubes as one pass, one draw, no transient of their own', () => {
    const expected: FrameCost = {
      passes: 1,
      draws: 1,
      dispatches: 0,
      pipelineSwitches: 1,
      bindSwitches: 1,
      attachmentLoads: 0,
      attachmentStores: 1,
      transientBytes: 0,
    };
    expect(cost(glslCubes, SIZE)).toEqual(expected);
  });

  it('still counts one draw were the thousand ten times over, since instances are free', () => {
    // The property a budget leans on: instances of a call cost nothing in `draws`,
    // so raising `COUNT` never changes the draw count — only a second call would.
    const bigger = {
      ...glslCubes,
      passes: [{ pipeline: pipelineHandle(0), draws: [{ vertices: 3, instances: COUNT * 10 }] }],
    };
    expect(cost(bigger, SIZE).draws).toBe(1);
  });
});
