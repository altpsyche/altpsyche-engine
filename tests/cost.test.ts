import { describe, expect, it } from 'vitest';
import { cost } from '@altpsyche/engine';
import type { PassSpec, PipelineSpec, ResourceSpec, ShaderFrame } from '@altpsyche/engine';

/**
 * `cost(graph, size)` — the pure structural metric of §17 decision 9, item 21.
 *
 * These frames are built by hand rather than drawn from the corpus, because the
 * point here is the arithmetic: a frame whose passes, attachments and resources
 * are known lets each field of the returned cost be asserted exactly. `cost`
 * validates nothing (that is `validate`'s), so the frames are as small as each
 * field under test needs and no smaller.
 */

const SIZE = { width: 800, height: 600 };

/** A one-pipeline, one-binding frame with a list of passes and resources handed
 * in — the minimum a cost reads. */
function frame(over: {
  pipelines?: PipelineSpec[];
  passes: PassSpec[];
  resources?: ResourceSpec[];
}): ShaderFrame {
  return {
    id: 'cost-fixture',
    target: 'wgsl',
    uniforms: [],
    resources: over.resources ?? [{ kind: 'uniform', name: 'uniforms' }],
    modules: [{ name: 'wgsl', code: '' }],
    pipelines: over.pipelines ?? [
      {
        kind: 'render',
        name: 'frame',
        vertex: 'fullscreen',
        fragment: { module: 'wgsl', entry: 'fragMain' },
        bindings: [{ group: 0, binding: 0, resource: 'uniforms', visibility: ['fragment'] }],
      },
    ],
    passes: over.passes,
  };
}

describe('cost', () => {
  it('counts a single fullscreen pass writing the frame target', () => {
    const c = cost(frame({ passes: [{ pipeline: 'frame', draw: { vertices: 3 } }] }), SIZE);
    expect(c).toEqual({
      passes: 1,
      draws: 1,
      dispatches: 0,
      pipelineSwitches: 1,
      bindSwitches: 1,
      // The frame's own target is cleared and presented: no load, one store.
      attachmentLoads: 0,
      attachmentStores: 1,
      transientBytes: 0,
    });
  });

  it('counts a pipeline switch on each change but not on a repeat', () => {
    const pipelines: PipelineSpec[] = [
      { kind: 'render', name: 'a', vertex: 'fullscreen', fragment: { module: 'wgsl', entry: 'a' }, bindings: [] },
      { kind: 'render', name: 'b', vertex: 'fullscreen', fragment: { module: 'wgsl', entry: 'b' }, bindings: [] },
    ];
    const passes: PassSpec[] = [
      { pipeline: 'a', draw: { vertices: 3 } },
      { pipeline: 'a', draw: { vertices: 3 } },
      { pipeline: 'b', draw: { vertices: 3 } },
    ];
    const c = cost(frame({ pipelines, passes }), SIZE);
    expect(c.passes).toBe(3);
    expect(c.draws).toBe(3);
    // a (from nothing), a (repeat, no switch), b (switch): two switches.
    expect(c.pipelineSwitches).toBe(2);
  });

  it('does not count a bind switch when two pipelines bind the same resources', () => {
    const bindings = [{ group: 0, binding: 0, resource: 'uniforms', visibility: ['fragment'] as ('fragment')[] }];
    const pipelines: PipelineSpec[] = [
      { kind: 'render', name: 'a', vertex: 'fullscreen', fragment: { module: 'wgsl', entry: 'a' }, bindings },
      { kind: 'render', name: 'b', vertex: 'fullscreen', fragment: { module: 'wgsl', entry: 'b' }, bindings },
    ];
    const passes: PassSpec[] = [
      { pipeline: 'a', draw: { vertices: 3 } },
      { pipeline: 'b', draw: { vertices: 3 } },
    ];
    const c = cost(frame({ pipelines, passes }), SIZE);
    // Two distinct pipelines, but one bind set: two pipeline switches, one bind.
    expect(c.pipelineSwitches).toBe(2);
    expect(c.bindSwitches).toBe(1);
  });

  it('counts a bind switch when the bound resources differ', () => {
    const pipelines: PipelineSpec[] = [
      {
        kind: 'render',
        name: 'a',
        vertex: 'fullscreen',
        fragment: { module: 'wgsl', entry: 'a' },
        bindings: [{ group: 0, binding: 0, resource: 'uniforms', visibility: ['fragment'] }],
      },
      {
        kind: 'render',
        name: 'b',
        vertex: 'fullscreen',
        fragment: { module: 'wgsl', entry: 'b' },
        bindings: [{ group: 0, binding: 0, resource: 'other', visibility: ['fragment'] }],
      },
    ];
    const passes: PassSpec[] = [
      { pipeline: 'a', draw: { vertices: 3 } },
      { pipeline: 'b', draw: { vertices: 3 } },
    ];
    expect(cost(frame({ pipelines, passes }), SIZE).bindSwitches).toBe(2);
  });

  it('counts a compute pass as a dispatch, not a draw', () => {
    const pipelines: PipelineSpec[] = [
      {
        kind: 'compute',
        name: 'step',
        compute: { module: 'wgsl', entry: 'main' },
        bindings: [],
        workgroup: [8, 8, 1],
      },
    ];
    const passes: PassSpec[] = [{ pipeline: 'step', dispatch: 'frame' }];
    const c = cost(frame({ pipelines, passes }), SIZE);
    expect(c.draws).toBe(0);
    expect(c.dispatches).toBe(1);
    expect(c.attachmentStores).toBe(0);
  });

  it('loads an attachment kept from an earlier pass and clears one that is not', () => {
    const target: ResourceSpec = {
      kind: 'texture',
      name: 'scratch',
      size: ['frame', 'frame'],
      format: 'rgba8unorm',
      use: ['attachment', 'sample'],
    };
    const pipelines: PipelineSpec[] = [
      {
        kind: 'render',
        name: 'into',
        vertex: 'fullscreen',
        fragment: { module: 'wgsl', entry: 'a' },
        bindings: [],
        targets: [{ format: 'rgba8unorm' }],
      },
      {
        kind: 'render',
        name: 'again',
        vertex: 'fullscreen',
        fragment: { module: 'wgsl', entry: 'b' },
        bindings: [],
        targets: [{ format: 'rgba8unorm' }],
      },
    ];
    const passes: PassSpec[] = [
      // Cleared: fills rather than reads, so no load.
      { pipeline: 'into', draw: { vertices: 3 }, colour: [{ resource: 'scratch', clear: [0, 0, 0, 1] }] },
      // No clear: keeps and reads what the first pass wrote, so one load.
      { pipeline: 'again', draw: { vertices: 3 }, colour: [{ resource: 'scratch' }] },
    ];
    const c = cost(frame({ pipelines, passes, resources: [target] }), SIZE);
    expect(c.attachmentLoads).toBe(1);
    expect(c.attachmentStores).toBe(2);
    // The scratch texture has no source of its own, so it is transient.
    expect(c.transientBytes).toBe(800 * 600 * 4);
  });

  it('counts a multisample resolve as one more store', () => {
    const resources: ResourceSpec[] = [
      { kind: 'texture', name: 'msaa', size: ['frame', 'frame'], format: 'rgba8unorm', use: ['attachment'], samples: 4 },
      { kind: 'texture', name: 'flat', size: ['frame', 'frame'], format: 'rgba8unorm', use: ['attachment'] },
    ];
    const pipelines: PipelineSpec[] = [
      {
        kind: 'render',
        name: 'ms',
        vertex: 'fullscreen',
        fragment: { module: 'wgsl', entry: 'a' },
        bindings: [],
        targets: [{ format: 'rgba8unorm' }],
        samples: 4,
      },
    ];
    const passes: PassSpec[] = [
      { pipeline: 'ms', draw: { vertices: 3 }, colour: [{ resource: 'msaa', clear: [0, 0, 0, 1], resolve: 'flat' }] },
    ];
    const c = cost(frame({ pipelines, passes, resources }), SIZE);
    // The multisampled attachment stores, and its resolve target stores too.
    expect(c.attachmentStores).toBe(2);
    // Four samples of the msaa texture, one of the resolve target.
    expect(c.transientBytes).toBe(800 * 600 * 4 * 4 + 800 * 600 * 4);
  });

  it('counts both halves of a depth-stencil attachment', () => {
    const resources: ResourceSpec[] = [
      { kind: 'texture', name: 'zs', size: ['frame', 'frame'], format: 'depth24plus-stencil8', use: ['attachment'] },
    ];
    const pipelines: PipelineSpec[] = [
      {
        kind: 'render',
        name: 'solid',
        vertex: 'fullscreen',
        fragment: { module: 'wgsl', entry: 'a' },
        bindings: [],
        depth: { format: 'depth24plus-stencil8', compare: 'less', write: true, stencil: 'mark' },
      },
    ];
    const passes: PassSpec[] = [
      // Depth cleared, stencil kept: the depth half fills, the stencil half loads.
      { pipeline: 'solid', draw: { vertices: 3 }, depth: { resource: 'zs', clear: 1 } },
    ];
    const c = cost(frame({ pipelines, passes, resources }), SIZE);
    // Frame colour store (1) + depth store (1) + stencil store (1) = 3.
    expect(c.attachmentStores).toBe(3);
    // Stencil half kept (loads), depth half cleared (does not).
    expect(c.attachmentLoads).toBe(1);
  });

  it('sums transient buffer bytes and excludes uploaded resources', () => {
    const resources: ResourceSpec[] = [
      // Transient: the card fills it, no source.
      { kind: 'buffer', name: 'scratch', bytes: 4096, access: 'read-write' },
      // Resident: uploaded from bytes, so its cost is arena.traffic()'s.
      { kind: 'buffer', name: 'consts', bytes: 256, access: 'read', data: new Uint8Array(256) },
      { kind: 'uniform', name: 'uniforms' },
    ];
    const passes: PassSpec[] = [{ pipeline: 'frame', draw: { vertices: 3 } }];
    expect(cost(frame({ passes, resources }), SIZE).transientBytes).toBe(4096);
  });

  it('sums the whole mip ladder of a transient texture', () => {
    const resources: ResourceSpec[] = [
      { kind: 'texture', name: 'ladder', size: [4, 4], format: 'rgba8unorm', use: ['attachment'], mips: 'generate' },
    ];
    const passes: PassSpec[] = [{ pipeline: 'frame', draw: { vertices: 3 } }];
    // 4x4 + 2x2 + 1x1 pixels at four bytes each: (16 + 4 + 1) * 4 = 84.
    expect(cost(frame({ passes, resources }), SIZE).transientBytes).toBe(84);
  });

  it('follows the frame size on a frame-sized transient', () => {
    const resources: ResourceSpec[] = [
      { kind: 'texture', name: 'scratch', size: ['frame', 'frame'], format: 'rgba8unorm', use: ['attachment'] },
    ];
    const passes: PassSpec[] = [{ pipeline: 'frame', draw: { vertices: 3 } }];
    const small = cost(frame({ passes, resources }), { width: 100, height: 100 });
    const large = cost(frame({ passes, resources }), { width: 200, height: 200 });
    expect(small.transientBytes).toBe(100 * 100 * 4);
    expect(large.transientBytes).toBe(200 * 200 * 4);
  });

  it('returns identical numbers on a repeated call', () => {
    const g = frame({ passes: [{ pipeline: 'frame', draw: { vertices: 3 } }] });
    expect(cost(g, SIZE)).toEqual(cost(g, SIZE));
  });
});
