import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

/**
 * Every example reaches the library through the one door and nothing under it.
 *
 * An example is the surface a stranger meets, so an example that reached into a
 * folder — `../toy/frame.js`, `../wgsl-layout.js` — would be teaching a
 * reach the package does not offer and would keep drawing an export the moment it
 * left the door. ROADMAP item 7 makes that a rule: each example imports the
 * package door, `@altpsyche/engine`, and no other specifier.
 *
 * This reads the import, export-from and `import()` specifiers off the parse tree
 * rather than matching them in the text, the way `import-graph.test.ts` does, so
 * a string that merely looks like a path is not mistaken for an import. Every
 * specifier an example names has to be the door.
 */

const ROOT = path.resolve(import.meta.dirname, '..');
const EXAMPLES = path.join(ROOT, 'examples');
const DOOR = '@altpsyche/engine';

/** Import, export-from and dynamic-`import()` specifiers of one file. */
function specifiersOf(file: string): string[] {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const specifiers: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteral(arg)) specifiers.push(arg.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return specifiers;
}

/** Every example's `main.ts`, which is the entry the runner bundles and opens. */
function exampleEntries(): string[] {
  return readdirSync(EXAMPLES)
    .map((entry) => path.join(EXAMPLES, entry))
    .filter((dir) => statSync(dir).isDirectory())
    .map((dir) => path.join(dir, 'main.ts'))
    .filter((entry) => statSync(entry, { throwIfNoEntry: false })?.isFile());
}

describe('every example reaches only the package door', () => {
  const entries = exampleEntries();

  it('finds the examples, so a rename cannot empty this silently', () => {
    const names = entries.map((entry) => path.basename(path.dirname(entry)));
    expect(names).toEqual(expect.arrayContaining(['fullscreen', 'glsl-fragment']));
  });

  it('imports the door and nothing else, with no relative reach into a folder', () => {
    const offenders: string[] = [];
    for (const entry of entries) {
      const rel = path.relative(ROOT, entry);
      const specifiers = specifiersOf(entry);
      expect(specifiers.length, `${rel} imports nothing; an example that draws imports the door`).toBeGreaterThan(0);
      for (const specifier of specifiers) {
        if (specifier !== DOOR) offenders.push(`${rel}: \`${specifier}\``);
      }
    }
    expect(offenders, `these examples reach past the door:\n${offenders.join('\n')}`).toEqual([]);
  });
});
