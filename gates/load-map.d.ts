// What `loadFromRoot(module)` (lib.mjs) hands back, keyed by the module it was
// asked for.
//
// `loadFromRoot` compiles one of the library's `.ts` modules with esbuild and
// `import()`s the result, so at run time it is a plain dynamic import and its type
// is `any` — which is how a gate destructuring `const { frameOf } = await
// loadFromRoot('toy/frame.ts')` called `frameOf` with the wrong arguments and
// stayed green until a browser gate ran an hour later (ROADMAP.md item 76).
//
// This maps each module string a gate actually passes to that module's real
// exported shape, so the destructured functions are checked against the sources.
// A string not in the list falls through to `unknown`, which forces a gate that
// loads a new module to add it here rather than silently getting `any` back. The
// `.js` specifiers resolve to the `.ts` sources under `moduleResolution: bundler`.
export type ModuleOf<M extends string> =
  M extends 'toy/frame.ts' ? typeof import('../toy/frame.js') :
  M extends 'wgsl-layout.ts' ? typeof import('../wgsl-layout.js') :
  M extends 'tests/support/fixture.ts' ? typeof import('../tests/support/fixture.js') :
  M extends 'fixtures/capability-fixtures.ts' ? typeof import('../fixtures/capability-fixtures.js') :
  M extends 'graph/cost.ts' ? typeof import('../graph/cost.js') :
  M extends 'graph/handles.ts' ? typeof import('../graph/handles.js') :
  M extends 'gpu/webgpu.ts' ? typeof import('../gpu/webgpu.js') :
  M extends 'tests/support/fake-gpu.ts' ? typeof import('../tests/support/fake-gpu.js') :
  M extends 'index.ts' ? typeof import('../index.js') :
  unknown;
