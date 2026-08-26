import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Every file path a document points at has to be a file that is here. These docs
 * arrived describing a stack that has since left this repository, and a path to a
 * file that went with it reads as a live reference and sends a reader chasing
 * something that is gone. This walks every backtick-quoted and link-quoted path
 * in `docs/` and fails on one that resolves to no file, so the next stale path is
 * caught by a gate rather than noticed by whoever tripped over it.
 *
 * It reads three shapes, which is what the docs use to name a file:
 *   - a Markdown link target, `](gpu/webgpu.ts)`, always a path;
 *   - a backtick span that looks like a file, `` `graph/types.ts` ``, which is
 *     one when it ends in a source extension and its basename is a filename
 *     rather than a `Type.field` read like `ShaderSource.glsl`.
 *   - a Mermaid node label, `frame["fill the documents in<br/>toy/frame.ts"]`,
 *     read from inside a ```mermaid fence, because a diagram is the most-read part
 *     of a document and a stale path in a node label sends a reader chasing a file
 *     that left with the website exactly as a stale prose path does.
 * Fenced code blocks are stripped before the link and backtick pass — their
 * backticks are code, not paths — and the Mermaid fences are then read on their
 * own, so a node label is checked while a `ts` fence's example code is not.
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
  // A file in the *reader's* own project rather than in this repository.
  // `docs/EXAMPLES.md` walks through building a page from nothing, so it names the
  // files a reader creates. This gate exists to catch a reference to one of ours
  // that has gone, which this is not — and it stays on the list rather than being
  // un-backticked, so that a future stale `main.js` of ours is still caught.
  'main.js': "a file the reader creates in docs/EXAMPLES.md's walkthrough, never one of ours",
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

/** Drop the suffix a citation carries: a `:line`, an `#L12` line anchor, or a
 *  `#heading-anchor` naming a section inside the file. A fragment is a place in a
 *  document rather than part of its name, so what is checked is the file it hangs
 *  off — which is the half that can go stale by a file being deleted. */
function bare(ref: string): string {
  return ref.replace(/#.*$/, '').replace(/:\d+(:\d+)?$/, '');
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

/**
 * A file- or folder-shaped token inside a Mermaid label. `looksLikePath` alone
 * misses `content/shaders`, which has no source extension, so a two-segment
 * lowercase path with content on both sides of a slash also counts. A bare
 * `graph/` — a folder node label, trailing slash, nothing after — is deliberately
 * not a file reference and stays unflagged, which is what keeps the §7-folder
 * diagram in `RoadToPureEngine.md` from reading as a wall of missing files.
 */
const MULTI_SEGMENT = /^[a-z0-9][\w.*-]*\/[\w.*-]+/;
function looksLikeMermaidPath(token: string): boolean {
  return looksLikePath(token) || MULTI_SEGMENT.test(token);
}

type Ref = { doc: string; kind: 'link' | 'tick' | 'mermaid'; ref: string; from: string };

/**
 * The node labels of every ```mermaid fence, as path refs. Reads the text inside
 * each `["..."]` label, drops the HTML tags a label carries (`<b>`, `<br/>`), and
 * splits on the separators a label uses, returning each token that looks like a
 * path. Exported to the negative test below, which injects a stale path inside a
 * fence and asserts it is caught — the shape `stripFences` would otherwise hide.
 */
function mermaidPathRefs(text: string, from: string, doc = ''): Ref[] {
  const refs: Ref[] = [];
  for (const fence of text.matchAll(/```mermaid\n([\s\S]*?)```/g)) {
    for (const label of fence[1]!.matchAll(/\["?([^"\]]*)"?\]/g)) {
      const cleaned = label[1]!.replace(/<[^>]*>/g, ' '); // drop <b>, <br/>, and the rest
      for (const raw of cleaned.split(/[\s·,]+/)) {
        const token = raw.trim();
        if (token && looksLikeMermaidPath(token)) refs.push({ doc, kind: 'mermaid', ref: token, from });
      }
    }
  }
  return refs;
}

/** Every markdown document a reader is pointed at: the guides under `docs/` and the
 *  four at the repository root. The root files were outside this check until 0.3.0,
 *  which was a hole rather than a choice — README.md names more paths than any guide
 *  does, and a broken link there is the first one a consumer meets. */
function markdownDocs(): { name: string; full: string }[] {
  const found = readdirSync(docsDir)
    .filter((name) => name.endsWith('.md'))
    .map((name) => ({ name, full: path.join(docsDir, name) }));
  for (const name of ['README.md', 'CONTRIBUTING.md', 'CHANGELOG.md', 'CLAUDE.md']) {
    const full = path.join(docsDir, '..', name);
    if (existsSync(full)) found.push({ name, full });
  }
  return found;
}

function pathRefs(): Ref[] {
  const refs: Ref[] = [];
  for (const { name, full: docPath } of markdownDocs()) {
    // JOURNAL.md is a dated record of what was true when each row was written, not a
    // document teaching a reader where anything lives. A row that named a real file
    // correctly must not become a gate failure because a later commit deleted that
    // file: the row is still an accurate account of the day it describes, and editing
    // history to keep a gate green is the one repair that costs more than the gate is
    // worth. Item 6 was reverted and its rows still name the producer it removed,
    // which is exactly the case this skip exists for.
    if (name === EXCLUDED_HISTORY) continue;
    const dir = path.dirname(docPath);
    const raw = readFileSync(docPath, 'utf-8');
    refs.push(...mermaidPathRefs(raw, dir, name));
    const text = stripFences(raw);
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

  it('reads a stale path inside a Mermaid fence, which stripping the fence would hide', () => {
    const injected = '```mermaid\nflowchart TB\n    n["a node<br/>lib/gone/vanished.ts"]\n```\n';
    const refs = mermaidPathRefs(injected, docsDir);
    expect(refs.map((r) => r.ref)).toContain('lib/gone/vanished.ts');
    expect(refs.filter((r) => !resolvesToFile(r.ref, r.from))).toHaveLength(1);
  });

  it('reads a live file label but not a folder node label inside a Mermaid fence', () => {
    const fence = '```mermaid\n    a["fill in<br/>gpu/webgpu.ts"]\n    b["<b>graph/</b> types"]\n```';
    const refs = mermaidPathRefs(fence, docsDir);
    expect(refs.map((r) => r.ref)).toContain('gpu/webgpu.ts'); // a file label is read
    expect(refs.map((r) => r.ref)).not.toContain('graph/'); // a folder label is not
    expect(refs.every((r) => resolvesToFile(r.ref, r.from))).toBe(true); // and what is read resolves
  });

  it('keeps the allowlist honest: every named absence is still absent', () => {
    const nowPresent = Object.keys(ALLOWED_ABSENT).filter((p) => resolvesToFile(p, docsDir));
    expect(
      nowPresent,
      `these allowlist entries now resolve to a file and should be removed:\n${nowPresent.join('\n')}`,
    ).toEqual([]);
  });
});
