import { describe, expect, it } from 'vitest';
import { PipelineCache, frameKey, pipelineStructureOf, structureKey } from '../pipeline/cache';
import type { PipelineStructure } from '../pipeline/cache';
import { wgslFrame } from '@altpsyche/engine';
import type { PipelineSpec } from '@altpsyche/engine';

/**
 * The pipeline cache's own contract, held without a device: a pipeline depends on
 * its structure and on nothing else, so two requests carrying the same structure
 * are one pipeline and two differing in any structural field are two. A string
 * stands in for a compiled pipeline, because the cache holds whatever a build
 * returns and this file is about which builds it runs, not what they produce.
 *
 * `frameKey` is the other half: the program key that replaces item 2's inline one,
 * asserted on the very case item 2 existed for — two frames equal in id and module
 * text but differing in the resources their program bakes in.
 */

/** A structure that varies one field at a time, so a test can say a difference of
 * exactly this much keys apart. The spec is minimal: `structureKey` serialises it
 * whole, so what it carries beyond a name is only what a test puts there. */
const structure = (over: Partial<PipelineStructure> = {}): PipelineStructure => ({
  kind: 'render',
  stages: [{ code: 'fn main() {}', entry: 'main' }],
  spec: {
    kind: 'render',
    name: 'draw',
    vertex: 'fullscreen',
    fragment: { module: 'source', entry: 'fragMain' },
    bindings: [],
  } as PipelineSpec,
  ...over,
});

describe('what the cache builds', () => {
  it('builds once for two requests of one structure and hands back one handle', () => {
    const cache = new PipelineCache<string>();
    let builds = 0;
    const make = () => `pipeline-${++builds}`;

    const first = cache.request(structure(), make);
    const second = cache.request(structure(), make);

    expect(second).toBe(first);
    expect(builds).toBe(1);
    expect(cache.size).toBe(1);
    expect(cache.resolve(first)).toBe('pipeline-1');
  });

  it('builds again and hands back a second handle for any structural difference', () => {
    const cache = new PipelineCache<string>();
    const make = () => 'pipeline';
    const base = cache.request(structure(), make);

    // Each of these differs from the base in exactly one of the fields item 12
    // names — source, entry point, vertex layout, and, through the spec, formats,
    // blend and depth — and each must be a pipeline of its own.
    const differ: Partial<PipelineStructure>[] = [
      { stages: [{ code: 'fn main() { discard; }', entry: 'main' }] },
      { stages: [{ code: 'fn main() {}', entry: 'other' }] },
      { vertex: { stride: 12, attributes: [{ location: 0, offset: 0, format: 'float32x3' }] } },
      { spec: { ...(structure().spec as object), targets: [{ format: 'rgba8unorm' }] } as PipelineSpec },
      {
        spec: {
          ...(structure().spec as object),
          targets: [{ format: 'rgba8unorm', blend: { color: {}, alpha: {} } }],
        } as PipelineSpec,
      },
      { spec: { ...(structure().spec as object), depth: { format: 'depth24plus', compare: 'less' } } as PipelineSpec },
    ];

    const handles = differ.map((over) => cache.request(structure(over), make));

    // Every one is distinct from the base and from every other, so the cache built
    // one pipeline per structure rather than collapsing any pair.
    const all = [base, ...handles];
    expect(new Set(all).size).toBe(all.length);
    expect(cache.size).toBe(all.length);
  });

  it('refuses a handle it never minted rather than resolving to a slot', () => {
    const cache = new PipelineCache<string>();
    cache.request(structure(), () => 'only');
    expect(() => cache.resolve(9 as never)).toThrow(/never minted/);
  });
});

describe('the bound the shared cache holds to (item 63)', () => {
  // A structure that differs only in its source, so each `code` is a distinct
  // structure the cache builds and holds its own pipeline for.
  const bodied = (code: string) => structure({ stages: [{ code, entry: 'main' }] });

  it('frees the stalest when a new structure pushes past the bound', () => {
    const evicted: string[] = [];
    const cache = new PipelineCache<string>({ bound: 2, onEvict: (value) => evicted.push(value) });
    let builds = 0;
    const make = () => `pipeline-${++builds}`;

    const a = cache.request(bodied('a'), make); // pipeline-1
    cache.request(bodied('b'), make); // pipeline-2
    // The third distinct structure pushes past the bound of two, so the stalest —
    // 'a', built first and never touched since — is freed rather than kept alive.
    cache.request(bodied('c'), make); // pipeline-3, evicts pipeline-1
    expect(cache.size).toBe(2);
    expect(evicted).toEqual(['pipeline-1']);
    // The freed structure's handle no longer resolves, so nothing reads a pipeline
    // the cache has handed back.
    expect(() => cache.resolve(a)).toThrow(/never minted/);
    // And asking for 'a' again builds it afresh, proving the cache holds none of it.
    cache.request(bodied('a'), make); // pipeline-4, evicts pipeline-2 ('b')
    expect(builds).toBe(4);
    expect(evicted).toEqual(['pipeline-1', 'pipeline-2']);
  });

  it('touches a structure on a repeat request, so the one drawn stays warm', () => {
    const evicted: string[] = [];
    const cache = new PipelineCache<string>({ bound: 2, onEvict: (value) => evicted.push(value) });
    let builds = 0;
    const make = () => `pipeline-${++builds}`;

    cache.request(bodied('a'), make); // pipeline-1
    cache.request(bodied('b'), make); // pipeline-2
    // Touch 'a', which moves it to the back of the recency order.
    cache.request(bodied('a'), make); // hit, no build, 'a' now freshest
    expect(builds).toBe(2);
    // A new structure now evicts 'b' — the new stalest — rather than the touched 'a'.
    cache.request(bodied('c'), make); // pipeline-3, evicts pipeline-2 ('b')
    expect(evicted).toEqual(['pipeline-2']);
    expect(cache.size).toBe(2);
  });

  it('with no bound keeps every distinct structure, the program-scoped default', () => {
    const cache = new PipelineCache<string>();
    for (const code of ['a', 'b', 'c', 'd', 'e']) cache.request(bodied(code), () => code);
    expect(cache.size).toBe(5);
  });

  it('hands every held pipeline back when cleared', () => {
    const evicted: string[] = [];
    const cache = new PipelineCache<string>({ onEvict: (value) => evicted.push(value) });
    cache.request(bodied('a'), () => 'pa');
    cache.request(bodied('b'), () => 'pb');
    cache.clear();
    expect(cache.size).toBe(0);
    expect(evicted.sort()).toEqual(['pa', 'pb']);
  });
});

describe('the structure key', () => {
  it('is one string for two equal structures and two for any difference', () => {
    expect(structureKey(structure())).toBe(structureKey(structure()));
    expect(structureKey(structure())).not.toBe(
      structureKey(structure({ stages: [{ code: 'fn main() {}', entry: 'renamed' }] }))
    );
  });

  it('keys apart two frames whose one spec binds resources of different kinds', () => {
    // The gap a shared cache (item 63) would otherwise activate: two frames carry
    // the same pipeline spec — same name, same bindings by name, same source — but
    // the resource under the binding is a read-only storage buffer in one and a
    // writable one in the other. The bind-group layout the card bakes differs, so
    // the second frame must not be handed the first's pipeline. Resolving the
    // binding's kind and access into the structure is what keys them apart.
    const spec: PipelineSpec = {
      kind: 'render',
      name: 'draw',
      vertex: 'fullscreen',
      fragment: { module: 'wgsl', entry: 'fragMain' },
      bindings: [{ group: 0, binding: 0, resource: 'data', visibility: ['fragment'] }],
    };
    const frame = (access: 'read' | 'read-write'): Parameters<typeof pipelineStructureOf>[0] => ({
      id: 'shared-spec',
      authored: 'wgsl',
      modules: [{ name: 'wgsl', wgsl: 'fn main() {}' }],
      resources: [{ kind: 'buffer', name: 'data', access, bytes: 16 }],
      pipelines: [spec],
      passes: [{ pipeline: 'draw', draws: [{ vertices: 3 }] }],
    });

    expect(structureKey(pipelineStructureOf(frame('read'), spec))).not.toBe(
      structureKey(pipelineStructureOf(frame('read-write'), spec))
    );
  });
});

describe('the program key that supersedes item 2', () => {
  const CODE = '@fragment fn fragMain() -> @location(0) vec4<f32> { return vec4<f32>(1.0); }';
  const BLOCK = [
    { name: 'u_time', offset: 0, size: 4 },
    { name: 'u_resolution', offset: 8, size: 8 },
  ];

  it('keys two frames apart on their resources, not just id and module text', () => {
    // Item 2's exact case: same id, same module text, a uniform block laid out at
    // different offsets, so a program built for one draws the other with the wrong
    // buffer under it. The keys must differ or the second frame is handed the
    // first's program.
    const otherBlock = [
      { name: 'u_time', offset: 0, size: 4 },
      { name: 'u_resolution', offset: 16, size: 8 },
    ];
    const one = wgslFrame('same', CODE, BLOCK);
    const other = wgslFrame('same', CODE, otherBlock);
    expect(one.id).toBe(other.id);
    expect(one.modules).toEqual(other.modules);

    expect(frameKey(one)).not.toBe(frameKey(other));
  });

  it('is one string for a frame keyed twice, so the live loop builds it once', () => {
    const frame = wgslFrame('fixture', CODE, BLOCK);
    expect(frameKey(frame)).toBe(frameKey(frame));
  });

  it('carries a resource’s bytes exactly, so one byte apart is one key apart', () => {
    // A byte a program uploads into a buffer is part of what the program draws, so
    // two frames differing only in those bytes are two programs. The bytes travel
    // in the key compactly rather than as a per-index object, but exactly: a single
    // byte changed is a different key.
    const withData = (byte: number) => {
      const frame = wgslFrame('bytes', CODE, BLOCK);
      return {
        ...frame,
        resources: [
          ...frame.resources,
          {
            kind: 'vertices' as const,
            name: 'mesh',
            stride: 4,
            count: 1,
            topology: 'triangle-list' as const,
            attributes: [{ location: 0, offset: 0, format: 'float32' as const }],
            data: new Uint8Array([1, 2, 3, byte]),
          },
        ],
      };
    };
    expect(frameKey(withData(4))).not.toBe(frameKey(withData(5)));
    expect(frameKey(withData(4))).toBe(frameKey(withData(4)));
  });

  it('derives a pipeline structure from a frame that keys with the same string', () => {
    // The frame's own pipeline, resolved to a structure, keys the same whether it
    // is asked for once or twice — the derivation is a function of the frame, so
    // the backend building the pipeline and the cache keying it agree.
    const frame = wgslFrame('fixture', CODE, BLOCK);
    const derived = pipelineStructureOf(frame, frame.pipelines[0]);
    expect(structureKey(derived)).toBe(structureKey(pipelineStructureOf(frame, frame.pipelines[0])));
  });
});
