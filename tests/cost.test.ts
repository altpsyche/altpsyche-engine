import { describe, expect, it } from 'vitest';
import { cost } from '@altpsyche/engine';
import type { PassSpec, PipelineSpec, ResourceSpec, FrameGraph } from '@altpsyche/engine';
import { texture, uniform, moduleHandle, pipelineHandle } from '../graph/handles.js';

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
}): FrameGraph {
  return {
    id: 'cost-fixture',
    authored: 'wgsl',
    resources: over.resources ?? [{ kind: 'uniform' }],
    modules: [{ name: 'wgsl', wgsl: '' }],
    pipelines: over.pipelines ?? [
      {
        kind: 'render',
        source: { vertex: 'fullscreen', fragment: { document: 'wgsl', text: '', entry: 'fragMain' } },
        bindings: [{ group: 0, binding: 0, resource: uniform(0), visibility: ['fragment'] }],
      },
    ],
    passes: over.passes,
  };
}

describe('cost', () => {
  it('counts a single fullscreen pass writing the frame target', () => {
    const c = cost(frame({ passes: [{ pipeline: pipelineHandle(0), draws: [{ vertices: 3 }] }] }), SIZE);
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

  it('counts an instanced draw as one draw, not as many (item 28)', () => {
    // One draw covering a thousand instances is one draw call the card makes,
    // however many copies it reads, so the cost of instancing a thousand objects
    // through one pass is one draw rather than a thousand — the whole reason the
    // budget of item 31 can hold `instanced-cubes` inside a small draw count.
    const c = cost(frame({ passes: [{ pipeline: pipelineHandle(0), draws: [{ vertices: 3, instances: 1000 }] }] }), SIZE);
    expect(c.draws).toBe(1);
    // A pass carrying two instanced draws is two draws, since the count is per
    // draw call rather than per instance: the instances of one call are free, a
    // second call is not.
    const two = cost(
      frame({ passes: [{ pipeline: pipelineHandle(0), draws: [{ vertices: 3, instances: 500 }, { vertices: 3, instances: 500 }] }] }),
      SIZE
    );
    expect(two.draws).toBe(2);
  });

  it('counts a pipeline switch on each change but not on a repeat', () => {
    const pipelines: PipelineSpec[] = [
      { kind: 'render', source: { vertex: 'fullscreen', fragment: { document: 'wgsl', text: '', entry: 'a' } }, bindings: [] },
      { kind: 'render', source: { vertex: 'fullscreen', fragment: { document: 'wgsl', text: '', entry: 'b' } }, bindings: [] },
    ];
    const passes: PassSpec[] = [
      { pipeline: pipelineHandle(0), draws: [{ vertices: 3 }] },
      { pipeline: pipelineHandle(0), draws: [{ vertices: 3 }] },
      { pipeline: pipelineHandle(1), draws: [{ vertices: 3 }] },
    ];
    const c = cost(frame({ pipelines, passes }), SIZE);
    expect(c.passes).toBe(3);
    expect(c.draws).toBe(3);
    // a (from nothing), a (repeat, no switch), b (switch): two switches.
    expect(c.pipelineSwitches).toBe(2);
  });

  it('does not count a bind switch when two pipelines bind the same resources', () => {
    const bindings = [{ group: 0, binding: 0, resource: uniform(0), visibility: ['fragment'] as ('fragment')[] }];
    const pipelines: PipelineSpec[] = [
      { kind: 'render', source: { vertex: 'fullscreen', fragment: { document: 'wgsl', text: '', entry: 'a' } }, bindings },
      { kind: 'render', source: { vertex: 'fullscreen', fragment: { document: 'wgsl', text: '', entry: 'b' } }, bindings },
    ];
    const passes: PassSpec[] = [
      { pipeline: pipelineHandle(0), draws: [{ vertices: 3 }] },
      { pipeline: pipelineHandle(1), draws: [{ vertices: 3 }] },
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
        source: { vertex: 'fullscreen', fragment: { document: 'wgsl', text: '', entry: 'a' } },
        bindings: [{ group: 0, binding: 0, resource: uniform(0), visibility: ['fragment'] }],
      },
      {
        kind: 'render',
        source: { vertex: 'fullscreen', fragment: { document: 'wgsl', text: '', entry: 'b' } },
        bindings: [{ group: 0, binding: 0, resource: uniform(1), visibility: ['fragment'] }],
      },
    ];
    const passes: PassSpec[] = [
      { pipeline: pipelineHandle(0), draws: [{ vertices: 3 }] },
      { pipeline: pipelineHandle(1), draws: [{ vertices: 3 }] },
    ];
    expect(cost(frame({ pipelines, passes }), SIZE).bindSwitches).toBe(2);
  });

  it('counts a compute pass as a dispatch, not a draw', () => {
    const pipelines: PipelineSpec[] = [
      {
        kind: 'compute',
        compute: { module: moduleHandle(0), entry: 'main' },
        bindings: [],
        workgroup: [8, 8, 1],
      },
    ];
    const passes: PassSpec[] = [{ pipeline: pipelineHandle(0), groups: [1, 1, 1] }];
    const c = cost(frame({ pipelines, passes }), SIZE);
    expect(c.draws).toBe(0);
    expect(c.dispatches).toBe(1);
    expect(c.attachmentStores).toBe(0);
  });

  it('loads an attachment kept from an earlier pass and clears one that is not', () => {
    const target: ResourceSpec = {
      kind: 'texture',
      size: { scale: 1 },
      format: 'rgba8unorm',
      use: ['attachment', 'sample'],
    };
    const pipelines: PipelineSpec[] = [
      {
        kind: 'render',
        source: { vertex: 'fullscreen', fragment: { document: 'wgsl', text: '', entry: 'a' } },
        bindings: [],
        targets: [{ format: 'rgba8unorm' }],
      },
      {
        kind: 'render',
        source: { vertex: 'fullscreen', fragment: { document: 'wgsl', text: '', entry: 'b' } },
        bindings: [],
        targets: [{ format: 'rgba8unorm' }],
      },
    ];
    const passes: PassSpec[] = [
      // Cleared: fills rather than reads, so no load.
      { pipeline: pipelineHandle(0), draws: [{ vertices: 3 }], colour: [{ resource: texture(0), clear: [0, 0, 0, 1] }] },
      // No clear: keeps and reads what the first pass wrote, so one load.
      { pipeline: pipelineHandle(1), draws: [{ vertices: 3 }], colour: [{ resource: texture(0) }] },
    ];
    const c = cost(frame({ pipelines, passes, resources: [target] }), SIZE);
    expect(c.attachmentLoads).toBe(1);
    // The first pass stores, because the second reads it; the second discards,
    // because nothing reads scratch after it — no later pass, no present, no
    // swap (item 1). So the two writes are one store, not two.
    expect(c.attachmentStores).toBe(1);
    // The scratch texture has no source of its own, so it is transient.
    expect(c.transientBytes).toBe(800 * 600 * 4);
  });

  it('counts the resolve as the store and discards the samples it came from', () => {
    const resources: ResourceSpec[] = [
      { kind: 'texture', size: { scale: 1 }, format: 'rgba8unorm', use: ['attachment'], samples: 4 },
      { kind: 'texture', size: { scale: 1 }, format: 'rgba8unorm', use: ['attachment'] },
    ];
    const pipelines: PipelineSpec[] = [
      {
        kind: 'render',
        source: { vertex: 'fullscreen', fragment: { document: 'wgsl', text: '', entry: 'a' } },
        bindings: [],
        targets: [{ format: 'rgba8unorm' }],
        samples: 4,
      },
    ];
    const passes: PassSpec[] = [
      { pipeline: pipelineHandle(0), draws: [{ vertices: 3 }], colour: [{ resource: texture(0), clear: [0, 0, 0, 1], resolve: texture(1) }] },
    ];
    const c = cost(frame({ pipelines, passes, resources }), SIZE);
    // The multisampled source is discarded — nothing reads it once its samples
    // are averaged — so the resolve's write of `flat` is the only store (item 1).
    expect(c.attachmentStores).toBe(1);
    // Four samples of the msaa texture, one of the resolve target.
    expect(c.transientBytes).toBe(800 * 600 * 4 * 4 + 800 * 600 * 4);
  });

  it('stores both halves of a depth-stencil a later pass reads, and discards both where none does', () => {
    const resources: ResourceSpec[] = [
      { kind: 'texture', size: { scale: 1 }, format: 'depth24plus-stencil8', use: ['attachment'] },
    ];
    const pipelines: PipelineSpec[] = [
      {
        kind: 'render',
        source: { vertex: 'fullscreen', fragment: { document: 'wgsl', text: '', entry: 'a' } },
        bindings: [],
        depth: { format: 'depth24plus-stencil8', compare: 'less', write: true, stencil: 'mark' },
      },
    ];
    const passes: PassSpec[] = [
      // First pass fills both halves; the second tests against both, so the
      // first stores each half and the card takes a store op for each.
      { pipeline: pipelineHandle(0), draws: [{ vertices: 3 }], depth: { resource: texture(0), clear: 1, stencilClear: 0 } },
      // Second pass loads both halves and nothing reads them after it, so each
      // half discards (item 1).
      { pipeline: pipelineHandle(0), draws: [{ vertices: 3 }], depth: { resource: texture(0) } },
    ];
    const c = cost(frame({ pipelines, passes, resources }), SIZE);
    // Two frame-colour stores + the first pass's two depth-stencil halves = 4.
    // The second pass's halves discard, so they add none.
    expect(c.attachmentStores).toBe(4);
    // The second pass loads both halves; the first clears both, so no loads there.
    expect(c.attachmentLoads).toBe(2);
  });

  it('sums transient buffer bytes and excludes uploaded resources', () => {
    const resources: ResourceSpec[] = [
      // Transient: the card fills it, no source.
      { kind: 'buffer', bytes: 4096, access: 'read-write' },
      // Resident: uploaded from bytes, so its cost is arena.traffic()'s.
      { kind: 'buffer', bytes: 256, access: 'read', data: new Uint8Array(256) },
      { kind: 'uniform' },
    ];
    const passes: PassSpec[] = [{ pipeline: pipelineHandle(0), draws: [{ vertices: 3 }] }];
    expect(cost(frame({ passes, resources }), SIZE).transientBytes).toBe(4096);
  });

  it('sums the whole mip ladder of a transient texture', () => {
    const resources: ResourceSpec[] = [
      { kind: 'texture', size: { width: 4, height: 4 }, format: 'rgba8unorm', use: ['attachment'], mips: 'generate' },
    ];
    const passes: PassSpec[] = [{ pipeline: pipelineHandle(0), draws: [{ vertices: 3 }] }];
    // 4x4 + 2x2 + 1x1 pixels at four bytes each: (16 + 4 + 1) * 4 = 84.
    expect(cost(frame({ passes, resources }), SIZE).transientBytes).toBe(84);
  });

  it('follows the frame size on a frame-sized transient', () => {
    const resources: ResourceSpec[] = [
      { kind: 'texture', size: { scale: 1 }, format: 'rgba8unorm', use: ['attachment'] },
    ];
    const passes: PassSpec[] = [{ pipeline: pipelineHandle(0), draws: [{ vertices: 3 }] }];
    const small = cost(frame({ passes, resources }), { width: 100, height: 100 });
    const large = cost(frame({ passes, resources }), { width: 200, height: 200 });
    expect(small.transientBytes).toBe(100 * 100 * 4);
    expect(large.transientBytes).toBe(200 * 200 * 4);
  });

  it('returns identical numbers on a repeated call', () => {
    const g = frame({ passes: [{ pipeline: pipelineHandle(0), draws: [{ vertices: 3 }] }] });
    expect(cost(g, SIZE)).toEqual(cost(g, SIZE));
  });
});
