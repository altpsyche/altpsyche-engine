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
    // A GLSL frame where WebGL 2 is absent, refused by name even though the machine
    // has WebGPU, because GLSL does not select WebGPU (§17 decision 6).
    const mirror = selectBackend({ target: 'glsl' }, { webgpu: true, webgl2: false });
    expect('backend' in mirror).toBe(false);
    if ('refusal' in mirror) expect(mirror.refusal).toContain('WebGL 2');
  });

  // Item 91's three cases: a WGSL frame reaches WebGL 2 by translation where no
  // WebGPU adapter came back, is refused for the missing translation where none
  // exists, and still prefers WebGPU where an adapter is there. Selection is pure
  // over the graph and the device (§10), so all three are pinned on this machine.
  const webgl2Only: DeviceOffer = { webgpu: false, webgl2: true };

  it('routes a WGSL frame with a translation to WebGL 2 where no WebGPU adapter came back', () => {
    // §17 decision 2: a WGSL scene reaches WebGL 2 by translation, not by refusal.
    expect(chosen(selectBackend({ target: 'wgsl', translated: true }, webgl2Only))).toBe('webgl2');
  });

  it('refuses a WGSL frame with no translation on a WebGL 2 device, naming the translation not the backend', () => {
    // The device offers a backend that could draw the frame if a translation
    // existed, so the actionable gap is the translation — named ahead of the
    // absent WebGPU adapter, which the caller cannot conjure.
    const outcome = selectBackend({ target: 'wgsl' }, webgl2Only);
    expect('backend' in outcome).toBe(false);
    if ('refusal' in outcome) {
      expect(outcome.refusal).toContain('translation');
      expect(outcome.refusal).not.toContain('adapter');
    }
  });

  it('still selects WebGPU for a WGSL frame where an adapter returned one, translation or not', () => {
    // WebGPU is the WGSL frame's native home, walked ahead of the WebGL 2
    // fallback, so a translation being available does not divert it.
    expect(chosen(selectBackend({ target: 'wgsl', translated: true }, has))).toBe('webgpu');
    expect(chosen(selectBackend({ target: 'wgsl' }, has))).toBe('webgpu');
  });
});
