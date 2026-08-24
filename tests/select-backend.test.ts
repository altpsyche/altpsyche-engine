import { describe, expect, it } from 'vitest';
import { selectBackend } from '@altpsyche/engine';
import type { BackendSelection, DeviceOffer } from '@altpsyche/engine';

/**
 * Which backend draws a frame, decided inside the library from two facts and no
 * device: the language the frame is authored in, and what this machine offers.
 *
 * The point of a pure reading is exactly that these three cases are checkable on
 * any machine, including this one, which never returns a real WebGPU adapter. So
 * the offering is a written fixture rather than a probe: `has` says both backends
 * are on offer, which stands in for a machine that has WebGPU as well as WebGL 2.
 */

const has: DeviceOffer = { webgpu: true, webgl2: true };

/** The backend an outcome selected, or a marker for a refusal so a wrong arm is a
 * failed assertion rather than a thrown property read. */
const chosen = (outcome: BackendSelection) => ('backend' in outcome ? outcome.backend : `refused: ${outcome.refusal}`);

describe('selectBackend', () => {
  it('routes a GLSL-authored frame to WebGL 2 on a machine that also has WebGPU', () => {
    // GLSL selects WebGL 2 even where WebGPU exists: the offering carries both.
    expect(chosen(selectBackend({ target: 'glsl' }, has))).toBe('webgl2');
  });

  it('routes a WGSL frame to WebGPU where an adapter actually returned one', () => {
    expect(chosen(selectBackend({ target: 'wgsl' }, has))).toBe('webgpu');
  });

  it('refuses only when no backend is left, naming what was missing', () => {
    // A WGSL frame on a machine whose adapter came back empty: WebGPU is the only
    // backend that speaks WGSL today, so nothing is left and the refusal names it.
    const outcome = selectBackend({ target: 'wgsl' }, { webgpu: false, webgl2: true });
    expect('backend' in outcome).toBe(false);
    if ('refusal' in outcome) {
      expect(outcome.refusal).toContain('WebGPU');
      expect(outcome.refusal).toContain('adapter');
    }

    // And the mirror: a GLSL frame where WebGL 2 is absent, refused by name even
    // though the machine has WebGPU, because GLSL does not select WebGPU.
    const mirror = selectBackend({ target: 'glsl' }, { webgpu: true, webgl2: false });
    expect('backend' in mirror).toBe(false);
    if ('refusal' in mirror) expect(mirror.refusal).toContain('WebGL 2');
  });
});
