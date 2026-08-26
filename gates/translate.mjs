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
import { readFileSync, readdirSync, writeFileSync, mkdtempSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(here, '..', 'fixtures', 'source');
const BAKED = join(SOURCE, 'glsl');
const ARTIFACT = join(BAKED, 'corpus.generated.json');
/** Where a hand-authored GLSL bake lives for a stage naga cannot translate but
 * WebGL 2 can still draw by a raster path this package chose (item 105). naga's
 * es300 target refuses `BUFFER_STORAGE`, so a WGSL scene's read-only storage buffer
 * has no naga bake; item 92 landed the raster path for it — a std140 uniform block
 * indexed by `gl_InstanceID` — and these files are that path hand-authored per
 * preset, overlaid below where naga records a `storage-buffer` skip. Anything naga
 * *can* translate is never hand-authored: this directory is only the gap es300's
 * missing storage-buffer syntax leaves. */
const HANDWRITTEN = join(BAKED, 'handwritten');

/** WebGL 2 is GLSL ES 3.00; that is what the build bakes for, per §9.1. */
export const WEBGL2_PROFILE = 'es300';
/** The naga version this bake was produced with, carried in the artifact so a
 * reader knows what to reinstall to regenerate it. */
export const TRANSLATOR = 'naga-cli 30.0.1';

// naga picks its GLSL stage from the output extension.
const EXT = { vertex: 'vert', fragment: 'frag', compute: 'comp' };

/**
 * The hand-authored GLSL for one entry point, or null where none exists (item 105).
 * A preset stage naga cannot translate to es300 for want of storage-buffer syntax,
 * but which item 92's raster path *can* draw, carries its GLSL here keyed
 * `<id>.<entry>.<ext>`. The overlay in `translateCorpus` reads this and bakes it in
 * place of the `storage-buffer` skip, so the committed artifact carries the same
 * bake a rebake with naga on PATH would produce — the file is the source, not the
 * hand-edited JSON. Returns null for any stage with no file, so compute and
 * storage-texture skips (and any storage-buffer stage no one hand-authored) stay
 * skips exactly as before.
 * @param {string} id @param {string} entry @param {'vertex' | 'fragment' | 'compute'} stage
 * @returns {string | null}
 */
export function handAuthored(id, entry, stage) {
  const file = join(HANDWRITTEN, `${id}.${entry}.${EXT[stage]}`);
  return existsSync(file) ? readFileSync(file, 'utf8') : null;
}

/** Every `@vertex`/`@fragment`/`@compute` entry point in a source, in file order.
 * A compute entry carries `@workgroup_size(...)` between its stage attribute and
 * `fn`, so the match reaches across attributes to the name. Shared in shape with
 * item 75's `gates/naga-corpus.mjs`, which asked the viability question this step
 * builds on. */
/** @param {string} src */
export const entryPoints = (src) =>
  [...src.matchAll(/@(vertex|fragment|compute)\b[\s\S]*?\bfn\s+([A-Za-z0-9_]+)/g)].map((m) => ({
    stage: /** @type {'vertex' | 'fragment' | 'compute'} */ (m[1]),
    name: /** @type {string} */ (m[2]),
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
/**
 * @param {'vertex' | 'fragment' | 'compute'} stage
 * @param {{ ok: boolean, message?: string } | null} es300 — null for compute, which is refused before es300 is asked
 * @returns {{ action: 'bake' } | { action: 'skip', capability: string } | { action: 'fail', construct: string }}
 */
export function classify(stage, es300) {
  if (stage === 'compute') return { action: 'skip', capability: 'compute' };
  // Reached only for a non-compute stage, where the caller always asked es300.
  const result = /** @type {{ ok: boolean, message?: string }} */ (es300);
  if (result.ok) return { action: 'bake' };
  const msg = /** @type {string} */ (result.message);
  if (msg.includes('BUFFER_STORAGE')) return { action: 'skip', capability: 'storage-buffer' };
  if (msg.includes('IMAGE_LOAD_STORE')) return { action: 'skip', capability: 'storage-texture' };
  // Item 43: not a §10 capability the two lines above map to a skip, so it is a
  // genuine untranslatable construct — refused, and named, per §9.1's second
  // consequence ("refused by name at build time with the construct named ...
  // the same vocabulary as §10").
  return { action: 'fail', construct: namedConstruct(msg) };
}

/**
 * Item 43. naga refusal signatures mapped to the construct they are about, in the
 * §10-adjacent vocabulary §9.1 asks the refusal to speak. Each is recorded from a
 * real naga-cli 30.0.1 es300 refusal — see `tests/untranslatable.test.ts`, which
 * re-checks every row against live naga when it is on PATH, so a row that stops
 * matching naga's wording is caught rather than left to rot.
 * @type {ReadonlyArray<readonly [string, string]>}
 */
const NAMED_CONSTRUCTS = [
  ['Features(CUBE_TEXTURES_ARRAY)', 'cube-array texture'],
  ['GLSL has no 16-bit float type', '16-bit float (f16)'],
];

/**
 * Item 43. Names the construct a refusal is about rather than handing back naga's
 * raw diagnostic, so a build failure reads in the same vocabulary as §10's
 * capability refusals. A message no row recognises still **names** the construct:
 * a `Features(X)` message surfaces its flag `X`, and anything else falls back to
 * naga's own wording — which names what it refused. So a new untranslatable
 * construct is never silently swallowed, only less tidily named until it earns a
 * row above.
 * @param {string} message — a naga refusal, already collapsed to one line
 * @returns {string}
 */
export function namedConstruct(message) {
  for (const [signature, construct] of NAMED_CONSTRUCTS) {
    if (message.includes(signature)) return construct;
  }
  const feature = message.match(/Features\(([A-Z0-9_ |]+)\)/);
  if (feature) return /** @type {string} */ (feature[1]).trim();
  return message;
}

/**
 * Item 43. Runs one entry point through the same es300 translation the corpus
 * build uses and returns the build's decision for it, so the untranslatable
 * fixtures' gate can prove — against live naga — that a source using a construct
 * WebGL 2 cannot carry is refused with the construct named. Needs `naga` on PATH.
 * @param {string} file — absolute path to a `.wgsl` source
 * @param {string} entry — entry-point name
 * @param {'vertex' | 'fragment' | 'compute'} stage
 */
export function decideEntry(file, entry, stage) {
  const out = join(mkdtempSync(join(tmpdir(), 'translate-')), `${entry}.${EXT[stage]}`);
  const es300 = stage === 'compute' ? null : naga(WEBGL2_PROFILE, entry, file, out);
  return classify(stage, es300);
}

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

/**
 * naga's GLSL backend emits one line that adjusts WGSL's clip space to GLSL's, and
 * it adjusts **two** axes at once:
 *
 *   gl_Position.yz = vec2(-gl_Position.y, gl_Position.z * 2.0 - gl_Position.w);
 *
 * The Z half is needed and kept: WebGPU's depth range is [0, 1] and GL's is
 * [-1, 1], so without the remap a depth test compares the wrong numbers.
 *
 * **The Y negation is wrong here and is stripped (item 107).** It exists for a
 * consumer that renders into a top-left-origin framebuffer, and this backend does
 * not: GL's framebuffer origin is bottom-left, its display reads row 0 at the
 * bottom, and `gpu/webgl2.ts`'s `readPixels` already turns the frame over so a
 * caller gets rows top-first whatever the source language. Negating Y *as well*
 * turns it twice — so a scene rendered on WebGL 2 came back mirrored top-to-bottom
 * against the same scene on WebGPU.
 *
 * **Measured on an RTX 5080 before and after.** With the negation: `core-scene`
 * differed from its WebGPU frame on 344,146 of 1,440,000 channels, worst channel
 * 244, with the hard-jump counts *matching* on both sides — the signature of a
 * mirror, since mirroring preserves adjacency. Without it: **0 of 1,440,000
 * channels differ**, on all three scene presets. That convergence is what licenses
 * this, and it is why the strip happens here rather than in `readPixels`: the
 * readback flip is correct for every source language and is unit-tested as such.
 *
 * @param {string} glsl
 */
const withoutClipSpaceYFlip = (glsl) =>
  glsl.replace(
    'gl_Position.yz = vec2(-gl_Position.y, gl_Position.z * 2.0 - gl_Position.w);',
    'gl_Position.z = gl_Position.z * 2.0 - gl_Position.w;',
  );

/** Runs the whole build. Kept as a function so a test on a machine with naga can
 * drive it and read the artifact back; the CLI below is the `npm run translate`
 * entry. */
export function translateCorpus() {
  const out = mkdtempSync(join(tmpdir(), 'translate-'));
  const files = readdirSync(SOURCE)
    .filter((f) => f.endsWith('.wgsl'))
    .sort();

  if (files.length !== 16) {
    console.error(`expected 16 corpus WGSL presets, found ${files.length}`);
    process.exit(1);
  }

  /** @type {Record<string, { entries: Record<string, { stage: string, glsl: string }> }>} */
  const presets = {};
  /** @type {Record<string, { entry: string, stage: string, capability: string }[]>} */
  const refused = {};
  /** @type {{ id: string, entry: string, stage: string, construct: string }[]} */
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
        const glsl = withoutClipSpaceYFlip(readFileSync(join(out, `${ep.name}.${EXT[ep.stage]}`), 'utf8'));
        (presets[id] ??= { entries: {} }).entries[ep.name] = { stage: ep.stage, glsl };
        baked++;
        console.log(`  BAKE ${ep.stage}:${ep.name}  ${glsl.length} bytes of GLSL ES 3.00`);
      } else if (decision.action === 'skip') {
        // A stage naga refused for a capability WebGL 2 withholds, but which item
        // 92's raster path can still draw, carries a hand-authored bake (item 105).
        // Overlaying it here rather than in a consumer keeps the committed artifact
        // the single thing every reader loads, and keeps that artifact reproducible:
        // a rebake with naga on PATH bakes the same file. Only `storage-buffer` skips
        // are overlaid, since that is the one capability item 92 gave a raster path;
        // compute and storage-texture stay skips (no file, so `hand` is null).
        const hand = decision.capability === 'storage-buffer' ? handAuthored(id, ep.name, ep.stage) : null;
        if (hand !== null) {
          (presets[id] ??= { entries: {} }).entries[ep.name] = { stage: ep.stage, glsl: hand };
          baked++;
          console.log(
            `  BAKE ${ep.stage}:${ep.name}  ${hand.length} bytes of hand-authored GLSL ES 3.00 (naga refused: needs ${decision.capability})`,
          );
        } else {
          (refused[id] ??= []).push({ entry: ep.name, stage: ep.stage, capability: decision.capability });
          console.log(`  SKIP ${ep.stage}:${ep.name}  refused before translation: needs ${decision.capability}`);
        }
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
    if (/** @type {any} */ (e).code === 'ENOENT') {
      console.error('\nno `naga` on PATH — install with: cargo install naga-cli --version 30.0.1');
      process.exit(2);
    }
    throw e;
  }
}
