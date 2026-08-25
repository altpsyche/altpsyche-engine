import { describe, expect, it } from 'vitest';
import { resolve, webgpuCapabilities, webgl2Capabilities } from '@altpsyche/engine';
import type { BackendSelection, Capability, DeviceProfile } from '@altpsyche/engine';

/**
 * `resolve(frame, device)` wires §10 end to end (item 51): the graph's language
 * routes it to a backend, and the graph's `requires` are read against that
 * backend's capabilities — selection first, refusal second — as one reading over
 * two records. No device is touched and no backend method is consulted, so every
 * case here is checkable on this machine, which never returns a real adapter.
 *
 * The capabilities are the device's own, derived from what a live device reports:
 * `webgpuCapabilities` off a WebGPU device's features, `webgl2Capabilities` off a
 * WebGL 2 context's extensions. The two derivations are pure, so they are pinned
 * here from the feature/extension names rather than from a context.
 */

/** The backend an outcome selected, or a marker for a refusal so a wrong arm reads
 * as a failed assertion rather than a thrown property access. */
const chosen = (outcome: BackendSelection) =>
  'backend' in outcome ? outcome.backend : `refused: ${outcome.refusal}`;

/** A WGSL compute graph: it needs `compute` and `storage-texture`, the two a
 * WebGL 2 device has neither of. `id` is what the message names the graph by. */
const computeFrame = {
  id: 'field',
  authored: 'wgsl' as const,
  requires: ['compute', 'storage-texture'] as readonly Capability[],
};

/** A plain WGSL fragment graph, needing nothing optional. */
const fragmentFrame = { id: 'toy', authored: 'wgsl' as const, requires: undefined };

/** A GLSL graph, which speaks WebGL 2 and requires nothing WebGL 2 lacks. */
const glslFrame = { id: 'paste', authored: 'glsl' as const, requires: undefined };

/** A WebGL 2 machine: no WebGPU adapter, a WebGL 2 context with only its core set. */
const webgl2Machine: DeviceProfile = { webgpu: null, webgl2: webgl2Capabilities([]) };

/** A WebGPU machine that also has WebGL 2, both with their core capabilities. */
const webgpuMachine: DeviceProfile = {
  webgpu: webgpuCapabilities([]),
  webgl2: webgl2Capabilities([]),
};

describe('resolve — selection first, refusal second', () => {
  it('names the missing capability, not the backend, for a compute graph on a WebGL 2 machine', () => {
    // Item 51's done-when: the message a page can print names `compute`.
    const outcome = resolve(computeFrame, webgl2Machine);
    expect('backend' in outcome).toBe(false);
    if ('refusal' in outcome) {
      expect(outcome.refusal).toContain('compute');
      expect(outcome.refusal).toContain('storage-texture');
      expect(outcome.refusal).toContain('field');
      // The capability leads; the backend is named after it, not instead of it.
      expect(outcome.refusal.indexOf('compute')).toBeLessThan(outcome.refusal.indexOf('webgl2'));
    }
  });

  it('selects WebGPU for a compute graph where an adapter returned the capabilities', () => {
    expect(chosen(resolve(computeFrame, webgpuMachine))).toBe('webgpu');
  });

  it('selects WebGPU for a plain WGSL graph that requires nothing optional', () => {
    expect(chosen(resolve(fragmentFrame, webgpuMachine))).toBe('webgpu');
  });

  it('selects WebGL 2 for a GLSL graph even where WebGPU is also on offer', () => {
    expect(chosen(resolve(glslFrame, webgpuMachine))).toBe('webgl2');
  });

  it('draws a scene requiring storage-buffer on WebGL 2 rather than refusing it (item 92)', () => {
    // A GLSL scene declaring `requires: ['storage-buffer']` — the reduced scene
    // tier's per-instance data — resolves to WebGL 2, which now has the capability
    // via its uniform-block raster path, rather than being refused for want of a
    // storage buffer. The read-write, compute-filled expression of the same name is
    // refused by name at the backend, not here.
    const scene = { id: 'panels', authored: 'glsl' as const, requires: ['storage-buffer'] as readonly Capability[] };
    expect(chosen(resolve(scene, webgl2Machine))).toBe('webgl2');
  });

  it('refuses a WGSL graph needing an optional capability the selected WebGPU device lacks, by name', () => {
    // A WebGPU device with no optional features: it speaks WGSL and is selected,
    // but a graph needing `timestamp` is refused against it by that name, not the
    // language refusal — selection succeeded, the capability did not.
    const timed = { id: 'timed', authored: 'wgsl' as const, requires: ['timestamp'] as readonly Capability[] };
    const outcome = resolve(timed, { webgpu: webgpuCapabilities([]), webgl2: null });
    expect('backend' in outcome).toBe(false);
    if ('refusal' in outcome) expect(outcome.refusal).toContain('timestamp');
  });

  it('gives the bare language refusal where no offered backend is missing a required capability', () => {
    // A GLSL graph on a WebGPU-only machine: WebGL 2 is not on offer and the graph
    // requires nothing, so there is no capability to name — the refusal is that no
    // backend speaks GLSL here, naming WebGL 2.
    const outcome = resolve(glslFrame, { webgpu: webgpuCapabilities([]), webgl2: null });
    expect('backend' in outcome).toBe(false);
    if ('refusal' in outcome) expect(outcome.refusal).toContain('WebGL 2');
  });

  it('returns a message rather than throwing — no backend method is consulted', () => {
    // Item 51's second half: the capability answer is data, so producing it never
    // reaches a backend method that could throw. The compute-on-WebGL-2 case is the
    // one a throwing design would have thrown on.
    expect(() => resolve(computeFrame, webgl2Machine)).not.toThrow();
  });
});

describe('capability derivation from a live device', () => {
  it('reads every core WebGPU capability off a device with no optional features', () => {
    const caps = webgpuCapabilities([]);
    for (const core of ['compute', 'storage-buffer', 'storage-texture', 'indirect', 'occlusion', 'msaa'] as const) {
      expect(caps.has(core)).toBe(true);
    }
    // Optional ones are absent until their feature is reported.
    expect(caps.has('timestamp')).toBe(false);
    expect(caps.has('float-blend')).toBe(false);
  });

  it('adds a WebGPU optional capability when its feature is reported', () => {
    const caps = webgpuCapabilities(['timestamp-query', 'float32-blendable']);
    expect(caps.has('timestamp')).toBe(true);
    expect(caps.has('float-blend')).toBe(true);
    expect(caps.has('depth-clamp')).toBe(false);
  });

  it('gives WebGL 2 msaa and storage-buffer, and none of the other WebGPU-only capabilities', () => {
    const caps = webgl2Capabilities([]);
    expect(caps.has('msaa')).toBe(true);
    // `storage-buffer` is the reduced scene tier of §17 decision 1 made real
    // (item 92): a scene's read-only per-instance data gets a uniform-block raster
    // path here, so a graph requiring it is drawn rather than refused — the
    // read-write, compute-filled expression of the same name is refused by name at
    // the backend, not by the capability.
    expect(caps.has('storage-buffer')).toBe(true);
    for (const only of ['compute', 'storage-texture', 'indirect', 'timestamp', 'occlusion'] as const) {
      expect(caps.has(only)).toBe(false);
    }
  });

  it('adds float-blend to WebGL 2 when EXT_float_blend is listed', () => {
    expect(webgl2Capabilities(['EXT_float_blend']).has('float-blend')).toBe(true);
  });
});
