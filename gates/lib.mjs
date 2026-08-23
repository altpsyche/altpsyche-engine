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
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
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

/**
 * The library's own modules, bundled for a page and hung off `window`.
 *
 * A page cannot import TypeScript and a gate must not restate what it measures,
 * so the sources are bundled as they are written. The caller removes the staging
 * directory when it is done with the bundle.
 */
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
  execFileSync(esbuild, [entry, '--bundle', `--outfile=${bundle}`], { stdio: ['ignore', 'pipe', 'pipe'] });
  return { bundle, staging };
}

/**
 * One of the library's modules, compiled and loaded into this process.
 *
 * A gate runs under node, which reads no TypeScript. Restating a rule instead of
 * compiling it is what goes wrong here: a restated shape cannot disagree with
 * itself, so nothing notices when it drifts from the shipped one.
 */
export async function loadFromRoot(module) {
  const staging = mkdtempSync(path.join(os.tmpdir(), 'engine-gate-'));
  const compiled = path.join(staging, 'module.mjs');
  execFileSync(esbuild, [path.join(ROOT, module), '--bundle', '--format=esm', `--outfile=${compiled}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const loaded = await import(compiled);
  rmSync(staging, { recursive: true, force: true });
  return loaded;
}
