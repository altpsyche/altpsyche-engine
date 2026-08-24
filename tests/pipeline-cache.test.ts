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

describe('the structure key', () => {
  it('is one string for two equal structures and two for any difference', () => {
    expect(structureKey(structure())).toBe(structureKey(structure()));
    expect(structureKey(structure())).not.toBe(
      structureKey(structure({ stages: [{ code: 'fn main() {}', entry: 'renamed' }] }))
    );
  });
});

describe('the program key that supersedes item 2', () => {
  const CODE = '@fragment fn fragMain() -> @location(0) vec4<f32> { return vec4<f32>(1.0); }';
  const UNIFORMS = [
    { name: 'u_time', type: 'float' },
    { name: 'u_resolution', type: 'vec2' },
  ];
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
    const one = wgslFrame('same', CODE, BLOCK, UNIFORMS);
    const other = wgslFrame('same', CODE, otherBlock, UNIFORMS);
    expect(one.id).toBe(other.id);
    expect(one.modules).toEqual(other.modules);

    expect(frameKey(one)).not.toBe(frameKey(other));
  });

  it('is one string for a frame keyed twice, so the live loop builds it once', () => {
    const frame = wgslFrame('fixture', CODE, BLOCK, UNIFORMS);
    expect(frameKey(frame)).toBe(frameKey(frame));
  });

  it('carries a resource’s bytes exactly, so one byte apart is one key apart', () => {
    // A byte a program uploads into a buffer is part of what the program draws, so
    // two frames differing only in those bytes are two programs. The bytes travel
    // in the key compactly rather than as a per-index object, but exactly: a single
    // byte changed is a different key.
    const withData = (byte: number) => {
      const frame = wgslFrame('bytes', CODE, BLOCK, UNIFORMS);
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
    const frame = wgslFrame('fixture', CODE, BLOCK, UNIFORMS);
    const derived = pipelineStructureOf(frame, frame.pipelines[0]);
    expect(structureKey(derived)).toBe(structureKey(pipelineStructureOf(frame, frame.pipelines[0])));
  });
});
