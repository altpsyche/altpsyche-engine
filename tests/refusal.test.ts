import { describe, expect, it } from 'vitest';
import { refusal } from '@altpsyche/engine';
import type { Capability, DeviceCapabilities } from '@altpsyche/engine';

/**
 * `refusal(graph, device)`: whether a graph may run on a device, answered by
 * naming what is missing rather than by a call that throws. A pure reading over
 * two records — the graph's `requires` and the device's `capabilities` — so every
 * case here is checkable on any machine with no card present, which is the whole
 * point of the capability model of §10: the question is data, not a method.
 *
 * The message names the capability rather than the backend, because the
 * capability is the fact a caller can act on. So the assertions read the message
 * for the capability names the graph declared, and one case reads it for the
 * absence of a capability the device does have.
 */

/** A device by the two facts refusal reads: which backend, and which capabilities
 * it has. `webgl2` here has none of the WebGPU-only ones, which is the honest
 * WebGL 2 answer of §10. */
const device = (backend: DeviceCapabilities['backend'], has: Capability[]): DeviceCapabilities => ({
  backend,
  capabilities: new Set(has),
});

/** A graph by the one thing refusal reads besides its id: what it requires. */
const graph = (id: string, requires: Capability[]) => ({ id, requires });

describe('refusal', () => {
  it('names every missing capability, and the message names the capability rather than the backend', () => {
    const message = refusal(graph('particles', ['compute', 'storage-buffer']), device('webgl2', []));
    expect(message).not.toBeNull();
    // The two capabilities the graph declared and the device lacks are both named.
    expect(message).toContain('compute');
    expect(message).toContain('storage-buffer');
    // The graph is named, so a reader knows which one was refused.
    expect(message).toContain('particles');
    // Two missing reads "neither".
    expect(message).toContain('webgl2 has neither');
  });

  it('returns null where the device has every capability the graph requires', () => {
    // The same needs, on a device that reports them: refusal is silence.
    const message = refusal(graph('particles', ['compute', 'storage-buffer']), device('webgpu', ['compute', 'storage-buffer']));
    expect(message).toBeNull();
  });

  it('returns null for a graph that requires nothing, whatever the device', () => {
    expect(refusal(graph('fullscreen', []), device('webgl2', []))).toBeNull();
    // `requires` absent is the same as requiring nothing.
    expect(refusal({ id: 'fullscreen' }, device('webgl2', []))).toBeNull();
  });

  it('names only the capabilities the device lacks, not the ones it has', () => {
    // The device has compute but not storage-buffer, so only the missing one is
    // named and the present one is not: the message is what a caller can act on.
    const message = refusal(graph('sim', ['compute', 'storage-buffer']), device('webgpu', ['compute']));
    expect(message).not.toBeNull();
    expect(message).toContain('storage-buffer');
    expect(message).not.toContain('compute');
    // One missing reads "does not have it".
    expect(message).toContain('webgpu does not have it');
  });

  it('reads "has none of them" when three or more are missing, joining them with commas and a final and', () => {
    const message = refusal(graph('sim', ['compute', 'storage-buffer', 'indirect']), device('webgl2', []));
    expect(message).toBe(
      'the graph "sim" needs compute, storage-buffer and indirect; webgl2 has none of them'
    );
  });

  it('joins two missing capabilities with and, one alone with neither commas nor and', () => {
    expect(refusal(graph('a', ['msaa', 'occlusion']), device('webgl2', []))).toBe(
      'the graph "a" needs msaa and occlusion; webgl2 has neither'
    );
    expect(refusal(graph('b', ['timestamp']), device('webgl2', []))).toBe(
      'the graph "b" needs timestamp; webgl2 does not have it'
    );
  });
});
