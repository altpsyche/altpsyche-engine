import type { WgslFrameGraph } from '@altpsyche/engine';
import { describe, expect, it } from 'vitest';
import { frameStores, mergeGroups } from '../graph/attachments';
import type { PassSpec, PipelineSpec, FrameGraph } from '@altpsyche/engine';

/**
 * The two pure frame-attachment analyses of item 1, tested off the graph alone —
 * no device, no backend. `frameStores` decides which attachments a frame reads
 * again and so must store rather than discard, and `mergeGroups` decides which
 * consecutive passes share one render pass. Both are what let `cost()` assert a
 * store count and a trace assert a pass count without a card, so here they are
 * asserted directly, which is where each rule is cheapest to pin down.
 *
 * The store analysis errs to keeping — an attachment is discarded only where the
 * graph proves nothing reads it — and the merge analysis errs to not merging, so
 * the failures worth guarding are a keep read as a discard and a merge that
 * crosses a hazard.
 */

const RENDER = (name: string, over: Partial<Extract<PipelineSpec, { kind: 'render' }>> = {}): PipelineSpec => ({
  kind: 'render',
  name,
  vertex: 'fullscreen',
  fragment: { module: 'wgsl', entry: 'f' },
  bindings: [],
  ...over,
});

function frame(over: { pipelines: PipelineSpec[]; passes: PassSpec[] } & Partial<WgslFrameGraph>): FrameGraph {
  return {
    id: 'attachments-fixture',
    authored: 'wgsl',
    resources: over.resources ?? [],
    modules: [{ name: 'wgsl', wgsl: '' }],
    present: over.present,
    swap: over.swap,
    pipelines: over.pipelines,
    passes: over.passes,
  };
}

describe('frameStores decides what a frame stores rather than discards', () => {
  it('discards a depth attachment no later pass tests against', () => {
    const f = frame({
      pipelines: [RENDER('draw', { depth: { format: 'depth24plus', compare: 'less', write: true } })],
      passes: [{ pipeline: 'draw', draws: [{ vertices: 3 }], depth: { resource: 'depth', clear: 1 } }],
    });
    const stores = frameStores(f);
    // The frame target is shown, so it stores; the depth is never read again, so
    // it discards.
    expect(stores[0]).toEqual({ colour: [true], depth: false, stencil: false });
  });

  it('keeps a depth attachment a later pass loads and tests against', () => {
    const f = frame({
      pipelines: [
        RENDER('first', { depth: { format: 'depth24plus', compare: 'less', write: true } }),
        RENDER('second', { depth: { format: 'depth24plus', compare: 'less', write: false } }),
      ],
      passes: [
        { pipeline: 'first', draws: [{ vertices: 3 }], depth: { resource: 'depth', clear: 1 } },
        { pipeline: 'second', draws: [{ vertices: 3 }], depth: { resource: 'depth' } },
      ],
    });
    const stores = frameStores(f);
    // The first pass's depth is read by the second, so it stores; the second's is
    // read by nothing after it, so it discards.
    expect(stores[0]!.depth).toBe(true);
    expect(stores[1]!.depth).toBe(false);
  });

  it('keeps a named colour attachment a later pass loads, and discards the last writer', () => {
    const f = frame({
      pipelines: [RENDER('a', { targets: [{ format: 'rgba8unorm' }] }), RENDER('b', { targets: [{ format: 'rgba8unorm' }] })],
      passes: [
        { pipeline: 'a', draws: [{ vertices: 3 }], colour: [{ resource: 'scratch', clear: [0, 0, 0, 1] }] },
        { pipeline: 'b', draws: [{ vertices: 3 }], colour: [{ resource: 'scratch' }] },
      ],
    });
    const stores = frameStores(f);
    expect(stores[0]!.colour).toEqual([true]);
    expect(stores[1]!.colour).toEqual([false]);
  });

  it('keeps an attachment the frame presents, however late it is written', () => {
    const f = frame({
      present: 'shown',
      pipelines: [RENDER('a', { targets: [{ format: 'rgba8unorm' }] })],
      passes: [{ pipeline: 'a', draws: [{ vertices: 3 }], colour: [{ resource: 'shown', clear: [0, 0, 0, 1] }] }],
    });
    expect(frameStores(f)[0]!.colour).toEqual([true]);
  });

  it('keeps an attachment a swap pair carries into the next frame', () => {
    const f = frame({
      swap: [['ping', 'pong']],
      pipelines: [RENDER('a', { targets: [{ format: 'rgba8unorm' }] })],
      passes: [{ pipeline: 'a', draws: [{ vertices: 3 }], colour: [{ resource: 'ping', clear: [0, 0, 0, 1] }] }],
    });
    expect(frameStores(f)[0]!.colour).toEqual([true]);
  });

  it('discards the multisample source but keeps whatever a later pass binds', () => {
    const f = frame({
      present: 'flat',
      pipelines: [
        RENDER('ms', { targets: [{ format: 'rgba8unorm' }], samples: 4 }),
        RENDER('read', { bindings: [{ group: 0, binding: 0, resource: 'flat', visibility: ['fragment'], reads: 'sample' }] }),
      ],
      passes: [
        { pipeline: 'ms', draws: [{ vertices: 3 }], colour: [{ resource: 'edges', clear: [0, 0, 0, 1], resolve: 'flat' }] },
        { pipeline: 'read', draws: [{ vertices: 3 }] },
      ],
    });
    const stores = frameStores(f);
    // The samples in `edges` are averaged into `flat` and nothing reads `edges`,
    // so it discards; `flat` is both presented and bound by a later pass.
    expect(stores[0]!.colour).toEqual([false]);
  });
});

describe('mergeGroups decides which consecutive passes share a render pass', () => {
  const targets = [{ format: 'rgba8unorm' as const }];

  it('merges a second pass that loads the same attachment with no sampled dependency', () => {
    const f = frame({
      pipelines: [RENDER('a', { targets }), RENDER('b', { targets })],
      passes: [
        { pipeline: 'a', draws: [{ vertices: 3 }], colour: [{ resource: 'buf', clear: [0, 0, 0, 1] }] },
        { pipeline: 'b', draws: [{ vertices: 3 }], colour: [{ resource: 'buf' }] },
      ],
    });
    expect(mergeGroups(f)).toEqual([[0, 1]]);
  });

  it('does not merge a second pass that clears the shared attachment', () => {
    const f = frame({
      pipelines: [RENDER('a', { targets }), RENDER('b', { targets })],
      passes: [
        { pipeline: 'a', draws: [{ vertices: 3 }], colour: [{ resource: 'buf', clear: [0, 0, 0, 1] }] },
        { pipeline: 'b', draws: [{ vertices: 3 }], colour: [{ resource: 'buf', clear: [0, 0, 0, 1] }] },
      ],
    });
    expect(mergeGroups(f)).toEqual([[0], [1]]);
  });

  it('does not merge a pass whose set differs from the group it would join', () => {
    const f = frame({
      pipelines: [RENDER('a', { targets }), RENDER('b', { targets })],
      passes: [
        { pipeline: 'a', draws: [{ vertices: 3 }], colour: [{ resource: 'buf', clear: [0, 0, 0, 1] }] },
        { pipeline: 'b', draws: [{ vertices: 3 }], colour: [{ resource: 'other' }] },
      ],
    });
    expect(mergeGroups(f)).toEqual([[0], [1]]);
  });

  it('does not merge across a sampled read of what an earlier pass wrote, even by its swap partner', () => {
    const f = frame({
      swap: [['ping', 'pong']],
      pipelines: [
        RENDER('a', { targets }),
        RENDER('b', {
          targets,
          // b writes ping again but samples pong, the half the swap fills from
          // what an earlier pass left in ping — a read that needs the pass
          // boundary the merge would remove.
          bindings: [{ group: 0, binding: 0, resource: 'pong', visibility: ['fragment'], reads: 'sample' }],
        }),
      ],
      passes: [
        { pipeline: 'a', draws: [{ vertices: 3 }], colour: [{ resource: 'ping', clear: [0, 0, 0, 1] }] },
        { pipeline: 'b', draws: [{ vertices: 3 }], colour: [{ resource: 'ping' }] },
      ],
    });
    expect(mergeGroups(f)).toEqual([[0], [1]]);
  });

  it('does not merge a pass writing the frame target, whose backend clear would wipe the first', () => {
    const f = frame({
      pipelines: [RENDER('a', { targets }), RENDER('b')],
      passes: [
        { pipeline: 'a', draws: [{ vertices: 3 }], colour: [{ resource: 'buf', clear: [0, 0, 0, 1] }] },
        { pipeline: 'b', draws: [{ vertices: 3 }] },
      ],
    });
    expect(mergeGroups(f)).toEqual([[0], [1]]);
  });

  it('does not merge passes carrying a query or a stencil, which are per-pass', () => {
    const stencil = frame({
      pipelines: [
        RENDER('a', { targets, depth: { format: 'stencil8', stencil: 'mark' } }),
        RENDER('b', { targets, depth: { format: 'stencil8', stencil: 'inside' } }),
      ],
      passes: [
        { pipeline: 'a', draws: [{ vertices: 3 }], colour: [{ resource: 'buf', clear: [0, 0, 0, 1] }], depth: { resource: 'mask', stencilClear: 0 } },
        { pipeline: 'b', draws: [{ vertices: 3 }], colour: [{ resource: 'buf' }], depth: { resource: 'mask' } },
      ],
    });
    expect(mergeGroups(stencil)).toEqual([[0], [1]]);

    const timed = frame({
      pipelines: [RENDER('a', { targets }), RENDER('b', { targets })],
      passes: [
        { pipeline: 'a', draws: [{ vertices: 3 }], colour: [{ resource: 'buf', clear: [0, 0, 0, 1] }] },
        { pipeline: 'b', draws: [{ vertices: 3 }], colour: [{ resource: 'buf' }], timed: 'took' },
      ],
    });
    expect(mergeGroups(timed)).toEqual([[0], [1]]);
  });

  it('breaks a group at a compute pass between two mergeable render passes', () => {
    const f = frame({
      pipelines: [
        RENDER('a', { targets }),
        { kind: 'compute', name: 'c', compute: { module: 'wgsl', entry: 'm' }, bindings: [], workgroup: [8, 8, 1] },
        RENDER('b', { targets }),
      ],
      passes: [
        { pipeline: 'a', draws: [{ vertices: 3 }], colour: [{ resource: 'buf', clear: [0, 0, 0, 1] }] },
        { pipeline: 'c', groups: [1, 1, 1] },
        { pipeline: 'b', draws: [{ vertices: 3 }], colour: [{ resource: 'buf' }] },
      ],
    });
    expect(mergeGroups(f)).toEqual([[0], [1], [2]]);
  });
});
