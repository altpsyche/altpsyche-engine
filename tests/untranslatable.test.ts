import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Item 43, refusal by named construct. §9.1's second consequence: some WGSL will
 * not translate, and it should be **refused by name at build time with the
 * construct named** — a capability refusal in a different coat, in the same
 * vocabulary as §10.
 *
 * Item 41 landed the build (`gates/translate.mjs`) that fails on an untranslatable
 * shader, but proved it only against an ad-hoc naga refusal in its landing
 * session; no untranslatable source was committed, so the fail-by-named-construct
 * path had no standing gate. This is that gate: two committed WGSL fixtures
 * (`fixtures/source/untranslatable/`) that parse as valid WGSL and are refused by
 * naga's GLSL ES 3.00 writer for a reason that is NOT one of the three §10
 * capabilities item 41 maps to a skip — a cube-array texture and an f16 value.
 *
 * naga is a dev-time tool a clean CI machine has not got, so the primary reading
 * drives the build's own classifier over the messages naga really produced (no
 * naga needed), and a second reading — skipped where naga is absent — re-runs the
 * fixtures through live naga so the recorded messages cannot silently drift from
 * what naga refuses today. Both drive `gates/translate.mjs` through a subprocess,
 * the shape `translate-build.test.ts` uses, because importing a `.mjs` into a
 * `.ts` test would not type-check.
 */
const root = path.join(import.meta.dirname, '..');
const gate = path.join(root, 'gates', 'translate.mjs');
const dir = path.join(root, 'fixtures', 'source', 'untranslatable');

/**
 * Recorded from real naga-cli 30.0.1, `--profile es300`. Each fixture parses as
 * valid WGSL and is refused by the GLSL ES 3.00 writer; `message` is what naga
 * printed (collapsed to one line as the gate collapses it), and `construct` is
 * the §10-adjacent name the refusal must carry.
 */
const CASES = [
  {
    file: 'cube-array.wgsl',
    entry: 'fs',
    stage: 'fragment' as const,
    message: "The selected version doesn't support Features(CUBE_TEXTURES_ARRAY)",
    construct: 'cube-array texture',
  },
  {
    file: 'f16.wgsl',
    entry: 'fs',
    stage: 'fragment' as const,
    message: 'GLSL has no 16-bit float type',
    construct: '16-bit float (f16)',
  },
];

const nagaOnPath = (() => {
  try {
    execFileSync('naga', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

describe('an untranslatable construct is refused by name at build time (item 43)', () => {
  it('every fixture is present', () => {
    for (const c of CASES) expect(existsSync(path.join(dir, c.file)), `${c.file} is missing`).toBe(true);
  });

  it('the build classifier refuses each with the construct named, not a raw diagnostic', () => {
    // The build's own decision function, given the message naga really produced,
    // returns `fail` carrying the construct named — this is what makes the build
    // refuse a source it cannot carry with the construct named, per §9.1.
    const script =
      `import { classify } from ${JSON.stringify(gate)};` +
      `const cases = ${JSON.stringify(CASES)};` +
      `process.stdout.write(JSON.stringify(cases.map((c) => classify(c.stage, { ok: false, message: c.message }))));`;
    const out = execFileSync('node', ['--input-type=module', '-e', script], { encoding: 'utf8' });
    expect(JSON.parse(out)).toEqual(CASES.map((c) => ({ action: 'fail', construct: c.construct })));
  });

  it('names the construct even for an unrecorded refusal, never swallowing it', () => {
    // A `Features(X)` message no row names still surfaces its flag; anything else
    // falls back to naga's own wording. So a new untranslatable construct is a
    // build failure that names something, never a silent pass.
    const script =
      `import { namedConstruct } from ${JSON.stringify(gate)};` +
      `process.stdout.write(JSON.stringify([` +
      `namedConstruct("The selected version doesn't support Features(SOME_NEW_FLAG)"),` +
      `namedConstruct("error: the operand of the \`&\` operator must be a reference")` +
      `]));`;
    const out = execFileSync('node', ['--input-type=module', '-e', script], { encoding: 'utf8' });
    expect(JSON.parse(out)).toEqual(['SOME_NEW_FLAG', 'error: the operand of the `&` operator must be a reference']);
  });

  (nagaOnPath ? it : it.skip)('live naga still refuses each fixture, and the record matches its wording', () => {
    // Guards the committed messages against drift: run each fixture through the
    // build's real translate-and-decide path (naga at es300 + classify) and
    // assert it fails with the same construct the record names. If naga's wording
    // for one of these changes, this reddens rather than the record rotting.
    const script =
      `import { decideEntry } from ${JSON.stringify(gate)};` +
      `const dir = ${JSON.stringify(dir)};` +
      `const path = await import('node:path');` +
      `const cases = ${JSON.stringify(CASES)};` +
      `process.stdout.write(JSON.stringify(cases.map((c) => decideEntry(path.join(dir, c.file), c.entry, c.stage))));`;
    const out = execFileSync('node', ['--input-type=module', '-e', script], { encoding: 'utf8' });
    expect(JSON.parse(out)).toEqual(CASES.map((c) => ({ action: 'fail', construct: c.construct })));
  });
});
