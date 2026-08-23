/**
 * Asking the browser for a WebGPU graphics card, kept apart from the backend.
 *
 * This is separate from `webgpu.ts` on purpose. The backend is the heavy half,
 * over a thousand lines, and a page loads it only after it has decided WebGPU is
 * the backend to use. Deciding that means asking for a card, which is this
 * function, so it runs on every page before any backend is chosen. Were it to
 * live beside the backend, importing it would pull the whole backend in eagerly
 * and a card-less browser would download WebGPU code it can never run. On its
 * own it is a few lines the backend never has to bring with it.
 */

/**
 * Whether this browser will give a graphics card for WebGPU, and the device if
 * it does.
 *
 * Asking for the adapter is the check rather than asking whether the API is
 * there: a browser with no flag set reports `navigator.gpu` and then hands back
 * nothing when asked for a card, so a page that trusted the API's presence would
 * show a blank canvas. An adapter is spent by the device it makes, so this asks
 * for a fresh one every time rather than holding one.
 */
export async function requestWebGPUDevice(): Promise<GPUDevice | null> {
  if (typeof navigator === 'undefined' || !navigator.gpu) return null;
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return null;
    // Everything optional the adapter says it has is asked for, because a device
    // is given only what was asked for however much the card can do, and a frame
    // that wants timing on a card that offers it would otherwise be told the
    // device cannot time anything. Nothing here can be refused: a feature comes
    // off the adapter's own list rather than a list written down.
    return await adapter.requestDevice({ requiredFeatures: [...adapter.features] as GPUFeatureName[] });
  } catch {
    return null;
  }
}
