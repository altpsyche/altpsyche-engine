import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import * as engine from '@altpsyche/engine';

/**
 * Every name the README's examples import has to be a name the door exports. A
 * README is the first thing a reader copies, so an example naming something that
 * moved is worse than no example: it fails in their editor and reads as the
 * library being broken.
 *
 * This checks the names rather than running the code, because running it needs a
 * device and the examples are written to be read. What it catches is the thing
 * that actually happens, which is a rename landing everywhere except here.
 */
const readme = readFileSync(path.join(import.meta.dirname, '..', 'README.md'), 'utf-8');

/** Named imports from the package, across every fenced block in the file. */
function importedNames(): string[] {
  const names = new Set<string>();
  for (const match of readme.matchAll(/import \{([^}]*)\} from '@altpsyche\/engine'/g)) {
    for (const raw of match[1]!.split(',')) {
      const name = raw.trim().replace(/^type\s+/, '');
      if (name) names.add(name);
    }
  }
  return [...names];
}

/** Property reads on a namespace the README shows, like `mat4.lookAt`. */
function namespacedNames(): [string, string][] {
  const pairs = new Set<string>();
  for (const match of readme.matchAll(/\b(vec3|mat4|mat3)\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
    pairs.add(`${match[1]}.${match[2]}`);
  }
  return [...pairs].map((one) => one.split('.') as [string, string]);
}

describe('the README names things the door actually exports', () => {
  it('has at least one example to check, so a rewrite cannot empty this silently', () => {
    expect(importedNames().length).toBeGreaterThan(5);
    expect(namespacedNames().length).toBeGreaterThan(3);
  });

  it('names only exports that exist', () => {
    const missing = importedNames().filter((name) => !(name in engine));
    expect(missing, `the README imports ${missing.join(', ')}, which the door does not export`).toEqual([]);
  });

  it('reads only namespace members that exist', () => {
    const surface = engine as unknown as Record<string, Record<string, unknown>>;
    const missing = namespacedNames()
      .filter(([namespace, member]) => !(member in (surface[namespace] ?? {})))
      .map(([namespace, member]) => `${namespace}.${member}`);
    expect(missing, `the README reads ${missing.join(', ')}, which does not exist`).toEqual([]);
  });
});
