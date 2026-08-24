import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import ts from 'typescript';

/**
 * What this library is allowed to depend on, kept by a walk rather than by
 * intention, because an outward edge is one careless import away and reads as
 * harmless.
 *
 * Three shapes are checked. Nothing that ships imports anything outside what
 * ships, so a consumer installing this gets a closure that carries only itself and
 * the manifest can go on declaring no runtime dependencies. The WebGPU backend, a
 * file a card-less browser can never run, is reached only through a dynamic import
 * so a consumer's bundler splits it into its own chunk: a static edge into it from
 * the eager graph puts it back in every page's first download, and no other gate
 * sees that regression. And the set this walks is the set the publish build emits,
 * compared because neither list can read the other.
 *
 * It arrived from the website that used to hold these files, where the first shape
 * was written as "nothing reaches the site" because the site was the only thing
 * outside. Generalising it to "nothing outside what ships" is what makes it mean
 * the same thing in a repository with no site in it.
 */

const ROOT = resolve(__dirname, '..');

/** What the library is, as the set whose import closure is walked. The door is not
 * here because it is walked separately as the eager root, and it is added back
 * where this list is compared with the build's own. */
const SHIPPING = [
  'graph/handles.ts',
  'graph/refs.ts',
  'renderer/types.ts',
  'renderer/frame.ts',
  'renderer/frame-rules.ts',
  'renderer/frame-coverage.ts',
  'renderer/index.ts',
  'renderer/probe.ts',
  'renderer/select.ts',
  'renderer/surface.ts',
  'renderer/trace.ts',
  'renderer/webgl2.ts',
  'renderer/webgpu.ts',
  'renderer/webgpu-device.ts',
  'resource/arena.ts',
  'pipeline/cache.ts',
  'submit/plan.ts',
  'submit/execute.ts',
  'submit/gl2.ts',
  'submit/frame-resources.ts',
  'engine/draw-list.ts',
  'engine/material.ts',
  'engine/maths.ts',
  'engine/scene.ts',
  'wgsl-layout.ts',
  'wgsl-references.ts',
  'wgsl-binding.ts',
  'shader-geometry.ts',
].map((p) => resolve(ROOT, p));

const WEBGPU_BACKEND = resolve(ROOT, 'renderer/webgpu.ts');

interface Edge {
  spec: string;
  dynamic: boolean;
}

/** Import, export-from and `import()` specifiers, read off the parse tree rather
 * than matched in the text, because `['from', 'to']` is not an import and a regex
 * cannot tell it from one. */
function edgesOf(file: string): Edge[] {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const edges: Edge[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      edges.push({ spec: node.moduleSpecifier.text, dynamic: false });
    } else if (node.kind === ts.SyntaxKind.CallExpression) {
      const call = node as ts.CallExpression;
      const arg = call.arguments[0];
      if (call.expression.kind === ts.SyntaxKind.ImportKeyword && arg && ts.isStringLiteral(arg)) {
        edges.push({ spec: arg.text, dynamic: true });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return edges;
}

type Target = { file: string } | { external: string };

/** Turn a specifier into the file it names, or report it as a package. A relative
 * specifier here ends in `.js` even though the file beside it is `.ts`, because
 * that is what node will look for once this is compiled, so the extension is
 * swapped back before the file is looked for. */
function resolveSpec(fromFile: string, spec: string): Target {
  if (!spec.startsWith('.')) return { external: spec };
  const base = resolve(dirname(fromFile), spec.replace(/\.js$/, ''));
  for (const candidate of [base + '.ts', base + '/index.ts', base]) {
    if (existsSync(candidate)) return { file: candidate };
  }
  return { file: base };
}

const rel = (file: string): string => relative(ROOT, file);

/** Every file reachable from the roots, and every package any of them import,
 * following dynamic edges when `includeDynamic` is set. */
function walk(roots: string[], includeDynamic: boolean): { files: Set<string>; externals: Map<string, string[]> } {
  const files = new Set<string>();
  const externals = new Map<string, string[]>();
  const queue = [...roots];
  while (queue.length) {
    const file = queue.shift() as string;
    if (files.has(file)) continue;
    files.add(file);
    for (const edge of edgesOf(file)) {
      if (edge.dynamic && !includeDynamic) continue;
      const target = resolveSpec(file, edge.spec);
      if ('external' in target) {
        const seen = externals.get(target.external);
        if (seen) seen.push(rel(file));
        else externals.set(target.external, [rel(file)]);
        continue;
      }
      if (!files.has(target.file)) queue.push(target.file);
    }
  }
  return { files, externals };
}

/** The set the publish build emits, read out of its own `include` rather than
 * written down a second time. */
function emittedByTheBuild(): Set<string> {
  const config = readFileSync(resolve(ROOT, 'tsconfig.build.json'), 'utf8');
  const include = JSON.parse(config.replace(/^\s*\/\/.*$/gm, '')).include as string[];
  const emitted = new Set<string>();
  for (const pattern of include) {
    if (!pattern.includes('*')) {
      emitted.add(resolve(ROOT, pattern));
      continue;
    }
    const dir = resolve(ROOT, pattern.slice(0, pattern.indexOf('/**')));
    const descend = (at: string): void => {
      for (const entry of readdirSync(at, { withFileTypes: true })) {
        const full = resolve(at, entry.name);
        if (entry.isDirectory()) descend(full);
        else if (entry.name.endsWith('.ts')) emitted.add(full);
      }
    };
    descend(dir);
  }
  return emitted;
}

describe('what ships imports nothing that does not ship', () => {
  it('names any edge from a shipping module out to a package or to a file left behind', () => {
    const { files, externals } = walk(SHIPPING, true);
    const ships = emittedByTheBuild();

    const outward: string[] = [];
    for (const reached of files) {
      if (!ships.has(reached)) outward.push(`a shipping module reaches ${rel(reached)}, which the build does not emit`);
    }
    for (const [pkg, importers] of externals) {
      outward.push(`a shipping module imports the package "${pkg}" (from ${[...new Set(importers)].join(', ')})`);
    }

    expect(outward, outward.join('\n')).toEqual([]);
  });
});

describe('the WebGPU backend is loaded on demand, not on every page', () => {
  it('keeps the backend out of the eager graph so a card-less browser never fetches it', () => {
    // The eager graph is what a consumer downloads first: the door and the surface
    // it re-exports. Neither may reach the backend except through the dynamic
    // import in the renderer that splits it into its own chunk.
    const eagerRoots = ['index.ts', 'renderer/surface.ts'].map((p) => resolve(ROOT, p));

    const { files } = walk(eagerRoots, false);

    expect(
      files.has(WEBGPU_BACKEND),
      'renderer/webgpu.ts is reachable through a static import, so it lands in the eager chunk a card-less browser downloads. It must be reached only through `await import()`.'
    ).toBe(false);
  });
});

describe('what the publish build emits is what this check calls shipping', () => {
  it('names any file one list has and the other does not', () => {
    // Two lists describe the same set: SHIPPING above, whose closure is walked, and
    // the include of the config that emits the output. They are written in different
    // files because neither can read the other, so the only thing keeping them
    // together is this comparison. Without it the build silently publishes a file
    // nothing checks, or checks a file it never ships.
    //
    // The door is added here rather than to SHIPPING, so the walk keeps measuring
    // the modules and this keeps measuring the package.
    const emitted = emittedByTheBuild();
    const shipping = new Set([...SHIPPING, resolve(ROOT, 'index.ts')]);

    const shippedButNotEmitted = [...shipping].filter((f) => !emitted.has(f)).map(rel);
    const emittedButNotShipping = [...emitted].filter((f) => !shipping.has(f)).map(rel);

    expect(
      { shippedButNotEmitted, emittedButNotShipping },
      'the publish build and this check disagree about what the library is'
    ).toEqual({ shippedButNotEmitted: [], emittedButNotShipping: [] });
  });
});
