import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Every file path a document points at has to be a file that is here. These docs
 * arrived describing a stack that has since left this repository, and a path to a
 * file that went with it reads as a live reference and sends a reader chasing
 * something that is gone. This walks every backtick-quoted and link-quoted path
 * in `docs/` and fails on one that resolves to no file, so the next stale path is
 * caught by a gate rather than noticed by whoever tripped over it.
 *
 * It reads two shapes, which is what the docs use to name a file:
 *   - a Markdown link target, `](renderer/webgpu.ts)`, always a path;
 *   - a backtick span that looks like a file, `` `renderer/types.ts` ``, which is
 *     one when it ends in a source extension and its basename is a filename
 *     rather than a `Type.field` read like `ShaderSource.glsl`.
 * Fenced code blocks are stripped first: their backticks are code, not paths.
 *
 * A short allowlist carries the paths that legitimately do not resolve — files a
 * later roadmap item will create, and the website paths [RoadToPureEngine.md]'s
 * debt table names precisely because they are gone. Each entry is asserted still
 * absent, so an allowlist row that a real file grows under is flagged for removal
 * rather than left hiding a fresh stale path behind it.
 */

const repoRoot = path.join(import.meta.dirname, '..');
const docsDir = path.join(repoRoot, 'docs');

const SOURCE_EXT = ['ts', 'tsx', 'js', 'mjs', 'json', 'md', 'wgsl', 'glsl', 'frag', 'slang', 'sh'];
const endsInSourceExt = new RegExp(`\\.(${SOURCE_EXT.join('|')})$`);

/**
 * Paths that do not resolve on purpose, each with why. A file a roadmap item is
 * yet to create, or a website path named here only to say it is absent.
 */
/** The one document this gate does not read, and why is above where it is skipped:
 * a register of dated rows is a record rather than a signpost, so a path it names is
 * a claim about the past. */
const EXCLUDED_HISTORY = 'JOURNAL.md';

const ALLOWED_ABSENT: Record<string, string> = {
  'docs/TESTING.md': "the consuming site's file, cited by ROADMAP item 1's phone row",
  'host/loop.ts': 'the host loop, a folder RoadToPureEngine §7 and ROADMAP item 39 will build',
  'components/ui/WgslRefusal.tsx': 'a website path RoadToPureEngine §3 row 12 names as one that does not exist here',
  'public/shaders/build/manifest.json': 'a website path RoadToPureEngine §3 row 12 names as one that does not exist here',
};

/** Every file in the repository, minus the trees nothing here would cite. */
function repoFiles(): { rel: Set<string>; base: Set<string> } {
  const rel = new Set<string>();
  const base = new Set<string>();
  const skip = new Set(['node_modules', 'dist', '.git']);
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (skip.has(entry)) continue;
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else {
        rel.add(path.relative(repoRoot, full));
        base.add(entry);
      }
    }
  };
  walk(repoRoot);
  return { rel, base };
}

const files = repoFiles();

/** Drop a `:line` or `#Lline` suffix that a citation carries. */
function bare(ref: string): string {
  return ref.replace(/#L?\d+(-L?\d+)?$/i, '').replace(/:\d+(:\d+)?$/, '');
}

function resolvesToFile(ref: string, fromDir: string): boolean {
  const clean = bare(ref);
  if (clean.includes('*')) return false; // a glob names no single file
  const relToFile = path.relative(repoRoot, path.resolve(fromDir, clean));
  if (files.rel.has(relToFile)) return true;
  const relToRoot = clean.replace(/^(\.\.\/)+/, '').replace(/^\.\//, '');
  if (files.rel.has(relToRoot)) return true;
  if (!clean.includes('/') && files.base.has(clean)) return true;
  return false;
}

function stripFences(text: string): string {
  return text.replace(/```[\s\S]*?```/g, '');
}

/** Is a backtick span a filename rather than a `Type.field` or prose token? */
function looksLikePath(token: string): boolean {
  const clean = bare(token);
  if (!endsInSourceExt.test(clean)) return false;
  if (clean.includes('/')) return true; // a directory component settles it
  return /^[a-z0-9]/.test(clean); // a filename starts lowercase; `ShaderSource.glsl` does not
}

type Ref = { doc: string; kind: 'link' | 'tick'; ref: string; from: string };

function pathRefs(): Ref[] {
  const refs: Ref[] = [];
  for (const name of readdirSync(docsDir)) {
    if (!name.endsWith('.md')) continue;
    // JOURNAL.md is a dated record of what was true when each row was written, not a
    // document teaching a reader where anything lives. A row that named a real file
    // correctly must not become a gate failure because a later commit deleted that
    // file: the row is still an accurate account of the day it describes, and editing
    // history to keep a gate green is the one repair that costs more than the gate is
    // worth. Item 6 was reverted and its rows still name the producer it removed,
    // which is exactly the case this skip exists for.
    if (name === EXCLUDED_HISTORY) continue;
    const full = path.join(docsDir, name);
    const dir = path.dirname(full);
    const text = stripFences(readFileSync(full, 'utf-8'));
    for (const m of text.matchAll(/\]\(([^)]+)\)/g)) {
      const raw = m[1]!.trim();
      if (raw === '' || /^(https?:|mailto:|#)/.test(raw)) continue;
      refs.push({ doc: name, kind: 'link', ref: raw, from: dir });
    }
    for (const m of text.matchAll(/`([^`]+)`/g)) {
      const raw = m[1]!.trim();
      if (!looksLikePath(raw)) continue;
      refs.push({ doc: name, kind: 'tick', ref: raw, from: dir });
    }
  }
  return refs;
}

describe('every path the docs name is a file that is here', () => {
  it('finds paths to check, so a rewrite cannot empty this silently', () => {
    expect(pathRefs().length).toBeGreaterThan(20);
  });

  it('resolves every backtick-quoted and link-quoted path, save the named absences', () => {
    const missing = pathRefs()
      .filter((r) => !resolvesToFile(r.ref, r.from))
      .filter((r) => !(bare(r.ref) in ALLOWED_ABSENT))
      .map((r) => `${r.doc}: ${r.kind} \`${r.ref}\``);
    expect(missing, `these docs name files that are not here:\n${missing.join('\n')}`).toEqual([]);
  });

  it('keeps the allowlist honest: every named absence is still absent', () => {
    const nowPresent = Object.keys(ALLOWED_ABSENT).filter((p) => resolvesToFile(p, docsDir));
    expect(
      nowPresent,
      `these allowlist entries now resolve to a file and should be removed:\n${nowPresent.join('\n')}`,
    ).toEqual([]);
  });
});
