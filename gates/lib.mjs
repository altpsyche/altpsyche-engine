// What every gate in this library needs to open a browser and get the library's
// own code into it.
//
// The library draws through the browser's graphics APIs, so the things it claims
// are only true where there is a browser to claim them in. Node can hold the
// recording double and the fake device; it cannot hold a driver.
//
// Three things here are load-bearing.
//
//   - The browser is **whatever build Playwright has pinned**, asked for rather
//     than written down. A path with a build number in it was copied into four
//     files once and all four broke the moment the dependency moved, because
//     installing a browser deletes the build it replaces.
//   - `CHROME` is overridable, for the run that needs a real graphics card rather
//     than a comparison against a number recorded earlier.
//   - A gate loads the library's **sources**, not its `dist`. A published package
//     carries neither the backends nor the fake device, on purpose, so a gate
//     reading `dist` could not reach what it exists to measure.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CHROME = process.env.CHROME ?? chromium.executablePath();

// A window plus these two is what reaches a real adapter on this driver. Without
// the second the window renders as a flickering transparent tile, and a machine's
// own flags file cannot supply it, because Playwright launches with what it is
// given and nothing else.
export const CARD_ARGS = ['--enable-features=Vulkan', '--ozone-platform=x11'];

const esbuild = path.join(ROOT, 'node_modules/.bin/esbuild');

// Nothing has installed this package into itself, so the name a consumer imports
// resolves to nothing here and the bundler is told where it is, the same way the
// test runner is told in its own config. What this buys is that a gate reaches the
// door by the name everybody else uses, rather than by a relative path that would
// keep working if the door stopped exporting something.
const DOOR = `--alias:@altpsyche/engine=${path.join(ROOT, 'index.ts')}`;

/**
 * The library's own modules, bundled for a page and hung off `window`.
 *
 * A page cannot import TypeScript and a gate must not restate what it measures,
 * so the sources are bundled as they are written. The caller removes the staging
 * directory when it is done with the bundle.
 */
/** @param {Record<string, string[]>} imports */
export function bundleForPage(imports) {
  const staging = mkdtempSync(path.join(os.tmpdir(), 'engine-gate-'));
  const entry = path.join(staging, 'entry.ts');
  const lines = [];
  for (const [module, names] of Object.entries(imports)) {
    lines.push(`import { ${names.join(', ')} } from '${path.join(ROOT, module)}';`);
    for (const name of names) lines.push(`(window as any).${name} = ${name};`);
  }
  writeFileSync(entry, lines.join('\n'));
  const bundle = path.join(staging, 'bundle.js');
  execFileSync(esbuild, [entry, '--bundle', DOOR, `--outfile=${bundle}`], { stdio: ['ignore', 'pipe', 'pipe'] });
  return { bundle, staging };
}

/**
 * One of the library's modules, compiled and loaded into this process.
 *
 * A gate runs under node, which reads no TypeScript. Restating a rule instead of
 * compiling it is what goes wrong here: a restated shape cannot disagree with
 * itself, so nothing notices when it drifts from the shipped one.
 */
/**
 * @template {string} M
 * @param {M} module
 * @returns {Promise<import('./load-map.js').ModuleOf<M>>}
 */
export async function loadFromRoot(module) {
  const staging = mkdtempSync(path.join(os.tmpdir(), 'engine-gate-'));
  const compiled = path.join(staging, 'module.mjs');
  const source = path.join(ROOT, module);
  execFileSync(
    esbuild,
    [
      source,
      '--bundle',
      '--format=esm',
      // For this process rather than for a page, so a module that reads a file or
      // a directory keeps the node built-ins it reads them with instead of the
      // bundler refusing to resolve them.
      '--platform=node',
      DOOR,
      // The bundle is written to a temporary directory, so a module that reads a
      // file beside itself would look for it there and find nothing. The corpus
      // is loaded exactly that way, by a module that walks from its own directory
      // to the sources, so the directory it walks from is the one it was written
      // in rather than the one it is running from.
      `--define:import.meta.dirname=${JSON.stringify(path.dirname(source))}`,
      `--outfile=${compiled}`,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  );
  const loaded = await import(compiled);
  rmSync(staging, { recursive: true, force: true });
  return loaded;
}

/**
 * Every fixture this package owns, as the frame a backend draws.
 *
 * Nothing about a fixture is stored: the source is a file here, the frame is
 * declared beside it, and the description and every generated byte are worked out
 * by the same loader the node tests use. A gate that derived one of its own would
 * be a gate measuring its own idea of a frame rather than what a consumer's build
 * would produce.
 *
 * The uniform values come off each entry as well, so a matrix aiming a pair of
 * surfaces is the matrix the fixture was written to be seen through instead of a
 * zero putting every corner of the frame on one point.
 */
export async function loadCorpus() {
  const { frameOf } = await loadFromRoot('toy/frame.ts');
  const { uniformBlockOf } = await loadFromRoot('wgsl-layout.ts');
  const { loadFixture } = await loadFromRoot('tests/support/fixture.ts');
  const { CAPABILITY_FIXTURES } = await loadFromRoot('fixtures/capability-fixtures.ts');

  // Every preset's source is WGSL; the GLSL ES 3.00 the build baked from it with
  // naga (item 41) travels with that source here, keyed by entry point on each WGSL
  // document's `glsl`, so a WebGPU-less device reaches WebGL 2 through the source
  // rather than through a gate-local stitch (item 94). `naga` is a build-time tool
  // never shipped (§17 decision 5), so this reads the bake it left.
  const artifact = JSON.parse(
    readFileSync(path.join(ROOT, 'fixtures', 'source', 'glsl', 'corpus.generated.json'), 'utf8')
  );

  return CAPABILITY_FIXTURES.map((entry) => {
    const { description, code, generated } = loadFixture(entry.id);

    // The baked GLSL for this preset, keyed by the entry point each stage baked, or
    // an empty map where naga refused every stage. Attached to the WGSL documents so
    // the translation rides the source; `glslFrameOf` reads it off there.
    const baked = artifact.presets?.[entry.id]?.entries ?? {};
    const glslBake = Object.fromEntries(
      Object.entries(baked).map(([point, { glsl }]) => [point, glsl])
    );
    const described =
      Object.keys(glslBake).length > 0
        ? {
            ...description,
            modules: description.modules.map((/** @type {any} */ module) => ({ ...module, glsl: glslBake })),
            translated: true,
          }
        : description;

    // The bytes arrive keyed by the address a description sends a reader to, and a
    // frame wants them keyed by the resource that reads them, which is the
    // remapping a loader does after fetching those files.
    const bytes = new Map();
    description.resources.forEach((resource, index) => {
      // Only some resource kinds carry a `source`; the others skip here exactly as
      // a falsy `source` skipped them before, so the `in` narrows the union without
      // changing which resources are remapped. A frame wants the bytes keyed by the
      // resource's index (its handle), which is how `frameOf` reads them now (item 87).
      const source = 'source' in resource ? resource.source : undefined;
      if (!source) return;
      const made = generated.get(source);
      if (!made) throw new Error(`nothing generated ${source} for ${entry.id}`);
      bytes.set(index, made);
    });

    const block = uniformBlockOf(code);
    const uniforms = entry.uniforms.map((uniform) => ({ name: uniform.name, type: uniform.type }));
    return {
      id: entry.id,
      entry,
      description: described,
      code,
      bytes,
      block,
      values: Object.fromEntries(entry.uniforms.map((uniform) => [uniform.name, uniform.value])),
      frame: frameOf(entry.id, described, { wgsl: code }, block, undefined, bytes),
    };
  });
}
