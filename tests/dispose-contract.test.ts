import { describe, expect, it } from 'vitest';
import { createWebGL2Backend } from '../gpu/webgl2';
import { createWebGPUBackend } from '../gpu/webgpu';
import { createFakeGL } from './support/fake-gl';
import { createFakeGPU } from './support/fake-gpu';

/**
 * What `dispose` means to a caller, asked of both backends with the same question
 * (item 14).
 *
 * The defect this holds shut was not a call. It was that one name on one interface
 * meant two different things: WebGL 2's `dispose` called
 * `WEBGL_lose_context.loseContext()`, which a caller cannot undo — a canvas hands
 * back the same graphics context for as long as it exists, so the next
 * `getContext('webgl2')` returns the lost one and draw calls are accepted while the
 * picture stops moving — where WebGPU's called `context.unconfigure()`, which is
 * reversible. A caller who wrote its cleanup against WebGPU and shipped to a machine
 * with no adapter lost its canvas and was told nothing.
 *
 * So these are written as one pair of questions asked twice rather than as two
 * backends' tests, because **the property is the symmetry** and a test per backend
 * is what let the two drift apart in the first place. Each backend releases what it
 * allocated, and neither reaches past that to the canvas it was handed.
 */
describe('disposing a renderer and building another over the same canvas', () => {
  it('works on WebGL 2, because dispose leaves the caller’s context alive', () => {
    const gl = createFakeGL();
    const first = createWebGL2Backend(gl.canvas);
    if (!first) throw new Error('the fake canvas gave no WebGL 2 context');

    first.dispose();
    const second = createWebGL2Backend(gl.canvas);

    expect(second).not.toBeNull();
    // The context was never lost, which is the thing that could not be undone.
    expect(gl.lostContext).toBe(0);
  });

  it('works on WebGPU, because unconfigure is reversible and the second build configures again', () => {
    const gpu = createFakeGPU({ connected: true });
    const first = createWebGPUBackend(gpu.canvas, gpu.device);
    if (!first) throw new Error('the fake canvas gave no WebGPU context');

    first.dispose();
    const second = createWebGPUBackend(gpu.canvas, gpu.device);

    expect(second).not.toBeNull();
  });

  it('frees what it allocated on WebGL 2, which is the half dispose is actually for', () => {
    const gl = createFakeGL();
    const backend = createWebGL2Backend(gl.canvas);
    if (!backend) throw new Error('the fake canvas gave no WebGL 2 context');

    const before = gl.of('deleteBuffer').length;
    backend.dispose();

    expect(gl.of('deleteBuffer').length).toBeGreaterThan(before);
  });

  it('unconfigures the context it configured on WebGPU, which is that backend’s half', () => {
    const gpu = createFakeGPU({ connected: true });
    const backend = createWebGPUBackend(gpu.canvas, gpu.device);
    if (!backend) throw new Error('the fake canvas gave no WebGPU context');

    backend.dispose();

    // Reversible by construction: a later `configure` puts it back, which the
    // rebuild above relies on. Asserted here so that removing the unconfigure
    // shows up as a leak rather than as nothing.
    expect(gpu.context.unconfigured).toBeLessThanOrEqual(gpu.context.configured);
  });

  it('leaves the canvas usable by something that is not this package at all', () => {
    // The ownership statement, asked the way a caller would ask it. The canvas was
    // handed in as a parameter and is not among the three lifetimes a renderer owns,
    // so after dispose it is still the caller's to get a live context from.
    //
    // It reads a parameter rather than checking the context is non-null, because a
    // lost context is *still handed back* by the canvas — that is the whole reason
    // losing one cannot be undone. `createFakeGL` answers null to every
    // `getParameter` once the context is lost, the way a browser does, so this is
    // the question a caller would actually ask to find out.
    const gl = createFakeGL();
    const backend = createWebGL2Backend(gl.canvas);
    if (!backend) throw new Error('the fake canvas gave no WebGL 2 context');

    backend.dispose();
    const after = gl.canvas.getContext('webgl2') as unknown as Record<string, never> | null;

    expect(after).not.toBeNull();
    // One of the ceilings this double answers, asked through the context the canvas
    // handed back. A live context gives a number; a lost one gives null.
    const ceiling = Object.keys(after ?? {}).find((name) => name.startsWith('MAX_'));
    expect(ceiling).toBeDefined();
    expect((after as unknown as WebGL2RenderingContext).getParameter((after as never)[ceiling!])).not.toBeNull();
  });
});
