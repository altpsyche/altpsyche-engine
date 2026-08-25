// The library's own exports, hung off `window` for a page.
//
// A gate bundles a handful of the library's functions and assigns them to
// `window` (see `bundleForPage` in lib.mjs), then reaches them from inside a
// `page.evaluate` callback as `window.frameOf`, `window.missing` and the rest.
// That callback is type-checked against the DOM `Window`, which knows nothing of
// these, so the call was unchecked and a signature that drifted was caught only
// by a browser gate an hour later (ROADMAP.md item 76).
//
// Typing each `window` property as the library function it actually is closes
// that: `window.frameOf(...)` in a gate is now checked against `frameOf`'s real
// signature, so deleting one of its parameters fails `type-check` at the gate's
// own line rather than at run time. If one of these exports is removed outright,
// the `typeof import(...)` below stops resolving and this file fails to compile,
// which is the same drift caught one file over.
//
// These are types only; nothing here runs. The `.js` specifiers resolve to the
// `.ts` sources under `moduleResolution: bundler`, the way every import in the
// library is written.
import type * as Door from '../index.js';
import type { createWebGPUBackend } from '../gpu/webgpu.js';
import type { createWebGL2Backend } from '../gpu/webgl2.js';
import type { vec3 } from '../scene/maths.js';
import type { readFrameCoverage } from '../trace/frame-coverage.js';
import type { compareFrames } from './compare.js';

declare global {
  interface Window {
    frameOf: typeof Door.frameOf;
    glslFrameOf: typeof Door.glslFrameOf;
    missing: typeof Door.missing;
    probe: typeof Door.probe;
    readingRow: typeof Door.readingRow;
    createSurface: typeof Door.createSurface;
    requestWebGPUDevice: typeof Door.requestWebGPUDevice;
    projectTrace: typeof Door.projectTrace;
    wrapDevice: typeof Door.wrapDevice;
    createWebGPUBackend: typeof createWebGPUBackend;
    createWebGL2Backend: typeof createWebGL2Backend;
    vec3: typeof vec3;
    readFrameCoverage: typeof readFrameCoverage;
    compareFrames: typeof compareFrames;
  }
}

export {};
