// @vitest-environment jsdom
//
// A document is needed because the whole subject is what `probe()` puts on one and
// whether it takes it off again.
import { describe, expect, it } from 'vitest';
import { browserProbeHost } from '../host/probe';

/**
 * What `probe()` leaves on the caller's page (item 15).
 *
 * `probe()` is a reading — a pure question about the machine, answered as data — and
 * until 2026-09-11 it appended one 200×100 canvas per backend it trialled,
 * `position: fixed` at the top-left corner, and removed neither. A consumer measured
 * it on 2026-09-09: after one `probe()` on a machine offering both backends, the
 * first picture drawn afterwards had its top-left corner covered, read back as
 * `(25, 51, 76)` — the `(0.1, 0.2, 0.3)` the trials clear to.
 *
 * The canvas is on the document on purpose and that has not changed: the device loss
 * the trial exists to catch only happens for a canvas the browser is compositing. The
 * fix is that the trial needs it while it runs and needs nothing of it afterwards.
 *
 * These run in jsdom, where `navigator.gpu` is absent and `getContext('webgl2')`
 * answers null, so what they hold is the appending and the removal rather than either
 * trial's answer. `gate:browser`'s device report is what holds the answers.
 */
describe('what probe leaves behind on the document', () => {
  it('adds nothing to the body that it does not take away again', async () => {
    const before = document.body.children.length;

    await browserProbeHost().gather();

    expect(document.body.children.length).toBe(before);
  });

  it('takes it away where the trial throws, which is the path a catch would hide', async () => {
    // The removal has to be in a `finally`. The WebGPU trial's `catch` swallows
    // everything, so a removal written after the last statement leaks on exactly the
    // failure that `catch` exists for; this asserts the same rule on the arm jsdom
    // can actually reach.
    const before = document.body.children.length;
    const real = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = () => {
      throw new Error('the trial fell over');
    };

    try {
      await expect(browserProbeHost().gather()).rejects.toThrow('the trial fell over');
    } finally {
      HTMLCanvasElement.prototype.getContext = real;
    }

    expect(document.body.children.length).toBe(before);
  });
});
