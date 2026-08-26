import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import * as engine from '@altpsyche/engine';

/**
 * Every name a document's examples import has to be a name the door exports.
 *
 * A document is the first thing a reader copies, so an example naming something that
 * moved is worse than no example: it fails in their editor and reads as the library
 * being broken. This checks the names rather than running the code, because running it
 * needs a device and the examples are written to be read. What it catches is the thing
 * that actually happens, which is a rename landing everywhere except in prose.
 *
 * It reads **every** markdown document rather than only the README, which is where this
 * check started. The README was the one file with a gate over its names while the guides
 * — which carry more code than it does — had none, and a reader who arrives at
 * `docs/EXAMPLES.md` and copies a page out of it is in exactly the position the README
 * check exists to protect. The `CHANGELOG` is read too, and that is deliberate rather
 * than an oversight to fix: a changelog entry naming a removed export in an `import`
 * line would be telling a reader to import something that is gone. It describes what a
 * name *was* in prose instead.
 */
const repoRoot = path.join(import.meta.dirname, '..');

/** Every document a reader is pointed at: the guides under `docs/`, and the ones at the
 *  root that ship or are read beside the source. `CLAUDE.md` is included because it is
 *  in the tree and read like the rest; it names no imports today, which costs nothing. */
function documents(): { name: string; text: string }[] {
  const docsDir = path.join(repoRoot, 'docs');
  const found = readdirSync(docsDir)
    .filter((name) => name.endsWith('.md'))
    .map((name) => ({ name: `docs/${name}`, full: path.join(docsDir, name) }));
  for (const name of ['README.md', 'CONTRIBUTING.md', 'CHANGELOG.md', 'CLAUDE.md']) {
    found.push({ name, full: path.join(repoRoot, name) });
  }
  return found.map(({ name, full }) => ({ name, text: readFileSync(full, 'utf-8') }));
}

/**
 * Named **value** imports from the package, across every fenced block in one document.
 *
 * A `type X` specifier is skipped rather than stripped of its keyword. This check asks
 * whether a name is on the door at run time, and a type is not there to be found however
 * correct it is — stripping the keyword made every type a document imports read as a
 * missing export. Types are checked by `docs-code.test.ts`, which compiles the blocks and
 * so reads the type-only imports the way the compiler does.
 */
function importedNames(text: string): string[] {
  const names = new Set<string>();
  for (const match of text.matchAll(/import \{([^}]*)\} from '@altpsyche\/engine'/g)) {
    for (const raw of match[1]!.split(',')) {
      const name = raw.trim();
      if (name && !/^type\s/.test(name)) names.add(name);
    }
  }
  return [...names];
}

/** Property reads on a namespace a document shows, like `mat4.lookAt`. */
function namespacedNames(text: string): [string, string][] {
  const pairs = new Set<string>();
  for (const match of text.matchAll(/\b(vec3|mat4|mat3)\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
    pairs.add(`${match[1]}.${match[2]}`);
  }
  return [...pairs].map((one) => one.split('.') as [string, string]);
}

const docs = documents();

describe('every document names things the door actually exports', () => {
  it('finds documents and imports to check, so a rewrite cannot empty this silently', () => {
    expect(docs.length).toBeGreaterThan(5);
    const imports = docs.flatMap((doc) => importedNames(doc.text));
    const reads = docs.flatMap((doc) => namespacedNames(doc.text));
    expect(imports.length).toBeGreaterThan(20);
    expect(reads.length).toBeGreaterThan(3);
  });

  it('names only exports that exist', () => {
    const missing = docs.flatMap((doc) =>
      importedNames(doc.text)
        .filter((name) => !(name in engine))
        .map((name) => `${doc.name}: ${name}`)
    );
    expect(missing, `these documents import names the door does not export:\n${missing.join('\n')}`).toEqual([]);
  });

  it('reads only namespace members that exist', () => {
    const surface = engine as unknown as Record<string, Record<string, unknown>>;
    const missing = docs.flatMap((doc) =>
      namespacedNames(doc.text)
        .filter(([namespace, member]) => !(member in (surface[namespace] ?? {})))
        .map(([namespace, member]) => `${doc.name}: ${namespace}.${member}`)
    );
    expect(missing, `these documents read members that do not exist:\n${missing.join('\n')}`).toEqual([]);
  });
});
