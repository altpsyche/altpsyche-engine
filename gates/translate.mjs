/**
 * Item 41's build-time translation path. Item 75 answered the viability question
 * — can WGSL→GLSL carry the corpus at all — and this is what §9.1 asks for on the
 * back of that answer: **every corpus preset (and every shipped material, of which
 * this library has none yet) translated once by a build step, the result baked and
 * carried so a running page needs no translator.**
 *
 * The translator (`naga`) is a **dev-time tool**, never a runtime dependency
 * (§17 decision 5 keeps this package's `dependencies` at `{}`; §9.1 puts the
 * translator in the build or a lazily-imported chunk). So this step shells out to
 * a `naga` on PATH, bakes its output into a committed artifact, and the artifact —
 * not the translator — is what ships. A scene-tier consumer on WebGL 2 downloads
 * the baked GLSL and no translator. Install naga with
 * `cargo install naga-cli --version 30.0.1`.
 *
 * WebGL 2 authors **GLSL ES 3.00**, so that is the profile the build targets. Nine
 * of the corpus's thirty-four entry points do not translate to es300 — four compute
 * stages, three vertex stages reading a storage buffer, two fragment stages reading
 * a storage texture. **These are not naga failing to translate:** they are the
 * WebGL 2 target lacking the `compute` / `storage-buffer` / `storage-texture`
 * capabilities §10 names, so such a frame is refused by `refusal()` before
 * translation is ever reached (§17 decision 6: GLSL ES 3.00 has no compute stage).
 * The build records them as refusals with the capability named and bakes no GLSL
 * for them. Anything else that will not translate is a genuine untranslatable
 * construct and **fails the build**, naming what naga refused — which is the right
 * place to find out, per §9.1's second consequence.
 *
 * Exit codes: 0 every WebGL 2-authorable entry point translated and the artifact
 * was written; 1 a shader that WebGL 2 could author would not translate (the build
 * fails, naming the construct), or an argument was wrong; 2 no `naga` on PATH.
 *
 * Run it with `npm run translate`. It is not in `gates/all.mjs` for the same
 * reason `gate:card` is not run unattended: it needs a dev tool a clean CI machine
 * has not got, and its output is committed so the tests and the runtime read the
 * bake rather than repeating it.
 */
import { readFileSync, readdirSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(here, '..', 'fixtures', 'source');
const BAKED = join(SOURCE, 'glsl');
const ARTIFACT = join(BAKED, 'corpus.generated.json');

/** WebGL 2 is GLSL ES 3.00; that is what the build bakes for, per §9.1. */
export const WEBGL2_PROFILE = 'es300';
/** The naga version this bake was produced with, carried in the artifact so a
 * reader knows what to reinstall to regenerate it. */
export const TRANSLATOR = 'naga-cli 30.0.1';

// naga picks its GLSL stage from the output extension.
const EXT = { vertex: 'vert', fragment: 'frag', compute: 'comp' };

/** Every `@vertex`/`@fragment`/`@compute` entry point in a source, in file order.
 * A compute entry carries `@workgroup_size(...)` between its stage attribute and
 * `fn`, so the match reaches across attributes to the name. Shared in shape with
 * item 75's `gates/naga-corpus.mjs`, which asked the viability question this step
 * builds on. */
export const entryPoints = (src) =>
  [...src.matchAll(/@(vertex|fragment|compute)\b[\s\S]*?\bfn\s+([A-Za-z0-9_]+)/g)].map((m) => ({
    stage: m[1],
    name: m[2],
  }));

/**
 * What the build does with one entry point, given its stage and — for a stage
 * WebGL 2 can run — the result of translating it to es300. Pure, so the fail /
 * skip / bake decision is testable without naga on PATH.
 *
 * - A **compute** stage has no place on WebGL 2 at all, so it is a `compute`
 *   capability refusal read before es300 is ever asked (es300 is null here).
 * - An es300 **success** bakes.
 * - An es300 failure naming `BUFFER_STORAGE` is a `storage-buffer` refusal, one
 *   naming `IMAGE_LOAD_STORE` is a `storage-texture` refusal — the two features
 *   GLSL ES 3.00 has no syntax for, mapped to the §10 capability names.
 * - Anything else that will not translate is a genuine untranslatable construct
 *   and **fails the build**, carrying naga's message so the construct is named.
 */
export function classify(stage, es300) {
  if (stage === 'compute') return { action: 'skip', capability: 'compute' };
  if (es300.ok) return { action: 'bake' };
  const msg = es300.message;
  if (msg.includes('BUFFER_STORAGE')) return { action: 'skip', capability: 'storage-buffer' };
  if (msg.includes('IMAGE_LOAD_STORE')) return { action: 'skip', capability: 'storage-texture' };
  return { action: 'fail', construct: msg };
}

const naga = (profile, name, input, output) => {
  try {
    execFileSync('naga', ['--profile', profile, '--entry-point', name, input, output], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    return { ok: true };
  } catch (e) {
    if (e.code === 'ENOENT') throw e;
    return { ok: false, message: (e.stderr?.toString() || e.message).trim().replace(/\s+/g, ' ') };
  }
};

/** Runs the whole build. Kept as a function so a test on a machine with naga can
 * drive it and read the artifact back; the CLI below is the `npm run translate`
 * entry. */
export function translateCorpus() {
  const out = mkdtempSync(join(tmpdir(), 'translate-'));
  const files = readdirSync(SOURCE)
    .filter((f) => f.endsWith('.wgsl'))
    .sort();

  if (files.length !== 15) {
    console.error(`expected 15 corpus WGSL presets, found ${files.length}`);
    process.exit(1);
  }

  const presets = {};
  const refused = {};
  const failures = [];
  let baked = 0;
  let entryCount = 0;

  for (const file of files) {
    const id = file.replace(/\.wgsl$/, '');
    const src = readFileSync(join(SOURCE, file), 'utf8');
    const eps = entryPoints(src);
    console.log(`\n${file}  (${eps.length} entry points)`);
    for (const ep of eps) {
      entryCount++;
      // Compute is not asked of es300 — WebGL 2 has no compute stage.
      const es300 =
        ep.stage === 'compute'
          ? null
          : naga(WEBGL2_PROFILE, ep.name, join(SOURCE, file), join(out, `${ep.name}.${EXT[ep.stage]}`));
      const decision = classify(ep.stage, es300);
      if (decision.action === 'bake') {
        const glsl = readFileSync(join(out, `${ep.name}.${EXT[ep.stage]}`), 'utf8');
        (presets[id] ??= { entries: {} }).entries[ep.name] = { stage: ep.stage, glsl };
        baked++;
        console.log(`  BAKE ${ep.stage}:${ep.name}  ${glsl.length} bytes of GLSL ES 3.00`);
      } else if (decision.action === 'skip') {
        (refused[id] ??= []).push({ entry: ep.name, stage: ep.stage, capability: decision.capability });
        console.log(`  SKIP ${ep.stage}:${ep.name}  refused before translation: needs ${decision.capability}`);
      } else {
        failures.push({ id, entry: ep.name, stage: ep.stage, construct: decision.construct });
        console.log(`  FAIL ${ep.stage}:${ep.name}  will not translate -> ${decision.construct}`);
      }
    }
  }

  if (failures.length) {
    console.error(
      `\n${failures.length} WebGL 2-authorable entry point${failures.length === 1 ? '' : 's'} would not translate; ` +
        `the build fails rather than the page:`,
    );
    for (const f of failures) console.error(`  ${f.id} ${f.stage}:${f.entry} -> ${f.construct}`);
    process.exit(1);
  }

  mkdirSync(BAKED, { recursive: true });
  const artifact = {
    // A header a reader can act on: what wrote this, with which tool, at which
    // profile. No date — this file is generated, and Date.now() would churn it
    // on every rebake for no reader's benefit.
    generatedBy: 'gates/translate.mjs',
    translator: TRANSLATOR,
    profile: WEBGL2_PROFILE,
    presets,
    refused,
  };
  writeFileSync(ARTIFACT, JSON.stringify(artifact, null, 2) + '\n');

  console.log(
    `\n${files.length} presets, ${entryCount} entry points: ${baked} baked to GLSL ES 3.00, ` +
      `${entryCount - baked} refused before translation (compute / storage-buffer / storage-texture).`,
  );
  console.log(`artifact written to fixtures/source/glsl/corpus.generated.json`);
  return artifact;
}

// Run when invoked directly, not when imported by a test for its pure helpers.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    translateCorpus();
  } catch (e) {
    if (e.code === 'ENOENT') {
      console.error('\nno `naga` on PATH — install with: cargo install naga-cli --version 30.0.1');
      process.exit(2);
    }
    throw e;
  }
}
