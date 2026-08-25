/**
 * Item 75's reproduction: the fifteen corpus WGSL presets, every entry point,
 * run through `naga` to GLSL. It answers one question — can WGSL→GLSL carry this
 * corpus at all? — and prints a row per entry point so a reader sees which
 * construct, if any, a translator refuses.
 *
 * Naga is a **dev-time tool**, never a runtime dependency (§17 decision 5 keeps
 * this package's `dependencies` at zero; §9.1 puts the translator in the build or
 * a lazily-imported chunk). So this script shells out to a `naga` on PATH rather
 * than importing anything: install it with `cargo install naga-cli --version
 * 30.0.1` and it lands in `~/.cargo/bin`. With no `naga` present the script exits
 * 2 and says so — the same shape as a gate that needs hardware this machine has
 * not got, and the reason this file is not in `gates/all.mjs`.
 *
 * Exit codes: 0 every entry point translated at the viability profile; 1 one did
 * not (naga has stopped carrying the corpus — the row names the construct); 2 no
 * `naga` on PATH. The readings this produced on 2026-08-25 are written up in
 * docs/NAGA-CORPUS.md; run this to reproduce them.
 */
import { readFileSync, readdirSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(here, '..', 'fixtures', 'source');

// naga picks its GLSL stage from the output extension.
const EXT = { vertex: 'vert', fragment: 'frag', compute: 'comp' };

// The profile the corpus is measured against is the one that can carry every
// stage: GLSL ES 3.10, which is where compute lives. WebGL 2 authors GLSL ES
// 3.00, and its vertex and fragment stages are also translated below at `es300`
// so the readings say what the WebGL 2 target itself accepts; compute has no
// place on WebGL 2 at all, so it is not asked for at es300.
const VIABILITY = 'es310';
const WEBGL2 = 'es300';

/** Every `@vertex`/`@fragment`/`@compute` entry point in a source, in file
 * order. A compute entry carries `@workgroup_size(...)` between its stage
 * attribute and `fn`, so the match reaches across attributes to the name. */
/** @param {string} src */
const entryPoints = (src) =>
  [...src.matchAll(/@(vertex|fragment|compute)\b[\s\S]*?\bfn\s+([A-Za-z0-9_]+)/g)].map((m) => ({
    stage: /** @type {'vertex' | 'fragment' | 'compute'} */ (m[1]),
    name: m[2],
  }));

/** @param {string} profile @param {string} name @param {string} input @param {string} output */
const naga = (profile, name, input, output) => {
  try {
    execFileSync('naga', ['--profile', profile, '--entry-point', name, input, output], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    return { ok: true };
  } catch (e) {
    if (/** @type {any} */ (e).code === 'ENOENT') throw e;
    const err = /** @type {any} */ (e);
    return { ok: false, message: (err.stderr?.toString() || err.message).trim().replace(/\s+/g, ' ') };
  }
};

const out = mkdtempSync(join(tmpdir(), 'naga-corpus-'));
const files = readdirSync(SOURCE)
  .filter((f) => f.endsWith('.wgsl'))
  .sort();

if (files.length !== 15) {
  console.error(`expected 15 corpus WGSL presets, found ${files.length}`);
  process.exit(1);
}

let failed = 0;
let entryCount = 0;
for (const file of files) {
  const src = readFileSync(join(SOURCE, file), 'utf8');
  const eps = entryPoints(src);
  console.log(`\n${file}  (${eps.length} entry points)`);
  for (const ep of eps) {
    entryCount++;
    const dst = join(out, `${ep.name}.${EXT[ep.stage]}`);
    let result;
    try {
      result = naga(VIABILITY, ep.name, join(SOURCE, file), dst);
    } catch (e) {
      if (/** @type {any} */ (e).code === 'ENOENT') {
        console.error('\nno `naga` on PATH — install with: cargo install naga-cli --version 30.0.1');
        process.exit(2);
      }
      throw e;
    }
    // WebGL 2's own profile, for the stages WebGL 2 can run. Compute is not one.
    /** @type {{ ok?: boolean, message?: string, skip?: boolean }} */
    const webgl2 =
      ep.stage === 'compute'
        ? { skip: true }
        : naga(WEBGL2, ep.name, join(SOURCE, file), join(out, `${ep.name}.w2.${EXT[ep.stage]}`));
    if (!result.ok) failed++;
    const tail = webgl2.skip
      ? '  (no es300: WebGL 2 has no compute)'
      : webgl2.ok
        ? '  es300 ok'
        : `  es300 FAIL: ${webgl2.message}`;
    console.log(
      result.ok
        ? `  OK   ${ep.stage}:${ep.name}${tail}`
        : `  FAIL ${ep.stage}:${ep.name} -> ${result.message}`,
    );
  }
}

console.log(
  `\n${files.length} presets, ${entryCount} entry points, ${entryCount - failed} translated, ${failed} failed (profile ${VIABILITY}).`,
);
process.exit(failed === 0 ? 0 : 1);
