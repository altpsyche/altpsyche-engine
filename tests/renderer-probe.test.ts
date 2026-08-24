import { describe, expect, it } from 'vitest';
import { probe, readingOf, readingRow, type BackendFacts, type ProbeFacts, type ProbeHost } from '../renderer/probe';

/**
 * The reading, held to its shape and its judgement rather than to any one device's
 * numbers. A ceiling or a renderer string is the machine's, so a test asserting one
 * would be measuring the machine; what is asserted here is that every field
 * decision 11 names is present, that the two assertions (survived, not SwiftShader)
 * read the right facts, and that the offering selects the backend a shader would be
 * drawn by. The browser half — asking for an adapter, running a composited canvas —
 * is `browserProbeHost`, which no node suite can hold and `npm run device-report`
 * exercises instead.
 */

const gpuFacts = (over: Partial<BackendFacts> = {}): BackendFacts => ({
  renderer: 'Apple M2',
  architecture: 'metal-3',
  report: { limits: { maxBufferSize: 268435456, maxBindGroups: 4 }, features: ['timestamp-query'] },
  survivedCompositing: true,
  ...over,
});

const glFacts = (over: Partial<BackendFacts> = {}): BackendFacts => ({
  renderer: 'ANGLE (Apple, Apple M2, OpenGL 4.1)',
  architecture: 'unknown',
  report: { limits: { MAX_TEXTURE_SIZE: 16384 }, features: ['EXT_color_buffer_float'] },
  survivedCompositing: true,
  ...over,
});

const facts = (over: Partial<ProbeFacts> = {}): ProbeFacts => ({
  webgpuReported: true,
  webgpu: gpuFacts(),
  webgl2: glFacts(),
  tier: 'toy',
  ...over,
});

const hostOf = (f: ProbeFacts, date = '2026-08-24'): ProbeHost => ({
  now: () => date,
  gather: async () => f,
});

describe('probe returns every field decision 11 names', () => {
  it('carries all of them off a WebGPU-capable device', async () => {
    const reading = await probe(hostOf(facts()));
    expect(Object.keys(reading).sort()).toEqual(
      [
        'adapterReturned',
        'architecture',
        'backend',
        'date',
        'features',
        'limits',
        'notSwiftShader',
        'renderer',
        'survivedCompositing',
        'tier',
        'webgpuReported',
      ].sort(),
    );
    expect(reading.date).toBe('2026-08-24');
    expect(reading.tier).toBe('toy');
  });
});

describe('the backend a reading records is the one a shader is drawn by', () => {
  it('selects WebGPU where an adapter came back, and reads its facts', () => {
    const reading = readingOf(facts(), '2026-08-24');
    expect(reading.backend).toBe('webgpu');
    expect(reading.webgpuReported).toBe(true);
    expect(reading.adapterReturned).toBe(true);
    expect(reading.renderer).toBe('Apple M2');
    expect(reading.architecture).toBe('metal-3');
    expect(reading.features).toEqual(['timestamp-query']);
    expect(reading.limits.maxBufferSize).toBe(268435456);
  });

  it('falls to WebGL 2 where WebGPU was reported but no adapter came back', () => {
    const reading = readingOf(facts({ webgpu: null }), '2026-08-24');
    expect(reading.backend).toBe('webgl2');
    expect(reading.webgpuReported).toBe(true);
    expect(reading.adapterReturned).toBe(false);
    expect(reading.renderer).toBe('ANGLE (Apple, Apple M2, OpenGL 4.1)');
    expect(reading.limits.MAX_TEXTURE_SIZE).toBe(16384);
  });

  it('records no backend where the device offers neither', () => {
    const reading = readingOf(facts({ webgpu: null, webgl2: null, webgpuReported: false }), '2026-08-24');
    expect(reading.backend).toBe(null);
    expect(reading.adapterReturned).toBe(false);
    expect(reading.renderer).toBe('none');
    expect(reading.features).toEqual([]);
    expect(reading.limits).toEqual({});
    expect(reading.survivedCompositing).toBe(false);
  });
});

describe('the two assertions read the facts they are about, not the adapter’s word', () => {
  it('fails not-SwiftShader when the architecture names the software renderer', () => {
    const reading = readingOf(facts({ webgpu: gpuFacts({ architecture: 'swiftshader' }) }), '2026-08-24');
    expect(reading.notSwiftShader).toBe(false);
  });

  it('fails not-SwiftShader when the renderer string names it though the architecture does not', () => {
    // The `--enable-unsafe-webgpu` case: WebGL reports SwiftShader in the renderer
    // string while the adapter architecture is left unremarkable.
    const reading = readingOf(
      facts({ webgpu: null, webgl2: glFacts({ renderer: 'ANGLE (Google, SwiftShader Device)' }) }),
      '2026-08-24',
    );
    expect(reading.backend).toBe('webgl2');
    expect(reading.notSwiftShader).toBe(false);
  });

  it('passes not-SwiftShader for a real card', () => {
    expect(readingOf(facts(), '2026-08-24').notSwiftShader).toBe(true);
  });

  it('records an adapter that returned and then died as returned-but-not-survived', () => {
    // The third state: a two-state reading would call this a success. It is the
    // one-second death measured on the software renderer.
    const reading = readingOf(facts({ webgpu: gpuFacts({ survivedCompositing: false }) }), '2026-08-24');
    expect(reading.adapterReturned).toBe(true);
    expect(reading.survivedCompositing).toBe(false);
  });
});

describe('a reading prints a row a stranger can paste', () => {
  it('names every field on its own line, assertions as words', () => {
    const row = readingRow(readingOf(facts(), '2026-08-24'));
    expect(row).toContain('backend         webgpu');
    expect(row).toContain('adapter returned');
    expect(row).toContain('survived a few on-screen frames');
    expect(row).toContain('metal-3 (not swiftshader)');
    expect(row).toContain('2026-08-24');
  });

  it('spells out a failed assertion rather than printing a bare boolean', () => {
    const row = readingRow(readingOf(facts({ webgpu: gpuFacts({ architecture: 'swiftshader' }) }), '2026-08-24'));
    expect(row).toContain('SWIFTSHADER — a software renderer named as hardware');
  });
});
