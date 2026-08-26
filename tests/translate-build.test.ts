import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Item 41, the build-time translation path. `gates/translate.mjs` (run as
 * `npm run translate`) translates every corpus preset to GLSL ES 3.00 with naga
 * once, at build time, and bakes the result into a committed artifact so a
 * running page reads the bake and downloads no translator (§9.1, §17 decision 2).
 *
 * naga is a dev-time tool a clean CI machine has not got, so this test does not
 * run it — it reads the committed artifact and the sources it was baked from, and
 * it drives the pure fail/skip/bake classifier through a subprocess that needs no
 * naga. The one thing only a machine with naga can show — that the build *fails*
 * on a shader that will not translate — is exercised by the classifier here and
 * was demonstrated end to end against a real naga refusal in the landing commit.
 */
const root = path.join(import.meta.dirname, '..');
const SOURCE = path.join(root, 'fixtures', 'source');
const ARTIFACT = path.join(SOURCE, 'glsl', 'corpus.generated.json');
const gate = path.join(root, 'gates', 'translate.mjs');

/** The same entry-point scan the gate uses, re-implemented here so this test is
 * an independent reading of the sources rather than a mirror of the gate's own
 * count. A compute entry carries `@workgroup_size(...)` between its attribute and
 * `fn`, so the match reaches across it. */
function entryPoints(src: string): { stage: string; name: string }[] {
  return [...src.matchAll(/@(vertex|fragment|compute)\b[\s\S]*?\bfn\s+([A-Za-z0-9_]+)/g)].map((m) => ({
    stage: m[1],
    name: m[2],
  }));
}

type Artifact = {
  profile: string;
  translator: string;
  presets: Record<string, { entries: Record<string, { stage: string; glsl: string }> }>;
  refused: Record<string, { entry: string; stage: string; capability: string }[]>;
};

const artifact = (): Artifact => JSON.parse(readFileSync(ARTIFACT, 'utf8'));

describe('the build-time translation path bakes GLSL and ships no translator', () => {
  it('carries GLSL ES 3.00, not the translator that made it', () => {
    const a = artifact();
    expect(a.profile).toBe('es300');
    for (const [id, preset] of Object.entries(a.presets)) {
      for (const [name, entry] of Object.entries(preset.entries)) {
        // A baked entry is real GLSL ES 3.00, and it is a stage WebGL 2 can run —
        // never compute, which has no place there.
        expect(entry.glsl.startsWith('#version 300 es'), `${id}:${name} is not GLSL ES 3.00`).toBe(true);
        expect(['vertex', 'fragment']).toContain(entry.stage);
      }
    }
  });

  it('accounts for every entry point of every source: baked or refused, nothing dropped', () => {
    const a = artifact();
    const files = readdirSync(SOURCE)
      .filter((f) => f.endsWith('.wgsl'))
      .sort();
    expect(files.length).toBe(16);

    let entryTotal = 0;
    for (const file of files) {
      const id = file.replace(/\.wgsl$/, '');
      const eps = entryPoints(readFileSync(path.join(SOURCE, file), 'utf8'));
      entryTotal += eps.length;
      for (const ep of eps) {
        const baked = a.presets[id]?.entries[ep.name];
        const refused = (a.refused[id] ?? []).find((r) => r.entry === ep.name);
        // Exactly one of the two: the artifact either carries GLSL for this entry
        // or records why WebGL 2 refuses it. Never both, never neither.
        expect(Boolean(baked) !== Boolean(refused), `${id}:${ep.name} is neither baked nor refused, or both`).toBe(
          true,
        );
        if (baked) expect(baked.stage).toBe(ep.stage);
        if (refused) expect(refused.stage).toBe(ep.stage);
      }
    }
    // The corpus item 75 measured 34 entry points across 15 presets; item 85 added
    // `core-perdraw-uniform`'s two (a per-draw uniform slice), so it is 36 now.
    expect(entryTotal).toBe(36);
  });

  it('overlays a hand-authored GLSL bake where naga has no storage-buffer syntax (item 105)', () => {
    const a = artifact();
    const HAND = path.join(SOURCE, 'glsl', 'handwritten');
    for (const [id, entry] of [
      ['core-material', 'project'],
      ['core-draw-list', 'project'],
    ] as const) {
      const glsl = readFileSync(path.join(HAND, `${id}.${entry}.vert`), 'utf8');
      // The committed artifact carries exactly the hand-authored file, so it cannot
      // drift from the source and a naga rebake — which reads the same file through
      // translate.mjs's overlay — reproduces it byte-for-byte.
      expect(a.presets[id]?.entries[entry]?.glsl, `${id}:${entry} artifact ≠ handwritten source`).toBe(glsl);
      expect(a.presets[id]?.entries[entry]?.stage).toBe('vertex');
      // It is a translation now, not a skip: no refusal records it.
      expect((a.refused[id] ?? []).some((r) => r.entry === entry)).toBe(false);
      // Item 92's raster path: the read-only storage buffer as a uniform block indexed
      // by gl_InstanceID, the one shape GLSL ES 3.00 has for a read-only array<T>.
      expect(glsl).toContain('_group_1_binding_0[gl_InstanceID]');
    }
    // The overlay applies only where a file exists: core-perdraw's storage-buffer
    // vertex has none, so it stays a recorded refusal (item 105 scoped to the two).
    expect((a.refused['core-perdraw'] ?? []).some((r) => r.entry === 'warp')).toBe(true);
  });

  it('handAuthored overlays exactly the hand-authored stages, nothing else (item 105)', () => {
    // Drive the gate's overlay reader through a subprocess, the way `classify` is
    // driven: it proves translateCorpus bakes the file for the two storage-buffer
    // vertices and leaves every other refused stage a skip, without needing naga.
    const script =
      `import { handAuthored } from ${JSON.stringify(gate)};` +
      `process.stdout.write(JSON.stringify({` +
      ` material: handAuthored('core-material', 'project', 'vertex') !== null,` +
      ` drawList: handAuthored('core-draw-list', 'project', 'vertex') !== null,` +
      ` perdraw: handAuthored('core-perdraw', 'warp', 'vertex') !== null,` +
      ` compute: handAuthored('core-compute', 'paint', 'compute') !== null }));`;
    const out = execFileSync('node', ['--input-type=module', '-e', script], { encoding: 'utf8' });
    expect(JSON.parse(out)).toEqual({ material: true, drawList: true, perdraw: false, compute: false });
  });

  it('names a WebGL 2 capability for every refusal, never a bare symptom', () => {
    const a = artifact();
    const allowed = new Set(['compute', 'storage-buffer', 'storage-texture']);
    const refused = Object.values(a.refused).flat();
    expect(refused.length).toBeGreaterThan(0);
    for (const r of refused) {
      // The three features GLSL ES 3.00 has no syntax for, and the exact §10
      // capability names refusal() reads — a compute stage is never baked.
      expect(allowed.has(r.capability), `refusal names "${r.capability}", not a §10 capability`).toBe(true);
      if (r.capability === 'compute') expect(r.stage).toBe('compute');
    }
  });

  it('no shipped source carries a translator: the bake is at build time', () => {
    // The library's published surface, named by tsconfig.build.json's include.
    const shippedDirs = ['graph', 'gpu', 'resource', 'pipeline', 'submit', 'toy', 'scene', 'host', 'trace'];
    const shippedFiles = ['index.ts', 'shader-geometry.ts', 'wgsl-binding.ts', 'wgsl-layout.ts', 'wgsl-references.ts'];

    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const full = path.join(dir, e.name);
        return e.isDirectory() ? walk(full) : full.endsWith('.ts') ? [full] : [];
      });
    const files = [...shippedDirs.flatMap((d) => walk(path.join(root, d))), ...shippedFiles.map((f) => path.join(root, f))];

    // A translator would arrive as one of these: naga/tint by name, a wasm module,
    // or the WebAssembly runtime. None ships — translation is a build step, and
    // the editing-path on-demand chunk is item 42's, fetched by await import().
    const forbidden = /\bnaga\b|\btint\b|\.wasm\b|WebAssembly/i;
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      const hit = src.split('\n').findIndex((line) => forbidden.test(line));
      expect(hit, `${path.relative(root, file)}:${hit + 1} names a translator; it must never ship`).toBe(-1);
    }
  });

  it('has zero runtime dependencies, so nothing a consumer installs is a translator', () => {
    const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
    // §17 decision 5: dependencies stay at zero. A translator entering here is the
    // one way the "downloads no translator" guarantee could quietly break.
    expect(pkg.dependencies ?? {}).toEqual({});
  });

  it('classifies fail / skip / bake so an untranslatable shader fails the build', () => {
    // Drive the gate's pure classifier through a subprocess: it needs no naga, and
    // importing a .mjs into a .ts test would not type-check. This is the logic that
    // makes clause two of the Done-when true — a genuine untranslatable construct
    // is a build failure, a missing WebGL 2 capability is a recorded refusal.
    const cases = [
      { stage: 'compute', es300: null, want: { action: 'skip', capability: 'compute' } },
      { stage: 'fragment', es300: { ok: true }, want: { action: 'bake' } },
      {
        stage: 'vertex',
        es300: { ok: false, message: "doesn't support Features(BUFFER_STORAGE | DYNAMIC_ARRAY_SIZE)" },
        want: { action: 'skip', capability: 'storage-buffer' },
      },
      {
        stage: 'fragment',
        es300: { ok: false, message: "doesn't support Features(IMAGE_LOAD_STORE)" },
        want: { action: 'skip', capability: 'storage-texture' },
      },
      {
        stage: 'fragment',
        es300: { ok: false, message: 'error: the operand of the `&` operator must be a reference' },
        want: { action: 'fail', construct: 'error: the operand of the `&` operator must be a reference' },
      },
    ];
    const script =
      `import { classify } from ${JSON.stringify(gate)};` +
      `const cases = ${JSON.stringify(cases)};` +
      `process.stdout.write(JSON.stringify(cases.map((c) => classify(c.stage, c.es300))));`;
    const out = execFileSync('node', ['--input-type=module', '-e', script], { encoding: 'utf8' });
    expect(JSON.parse(out)).toEqual(cases.map((c) => c.want));
  });
});
