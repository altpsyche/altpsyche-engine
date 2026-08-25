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
  'graph/capability.ts',
  'graph/types.ts',
  'graph/validate.ts',
  'graph/cost.ts',
  'graph/refusal.ts',
  'graph/attachments.ts',
  'toy/frame.ts',
  'trace/frame-coverage.ts',
  'trace/trace.ts',
  'gpu/renderer.ts',
  'gpu/select.ts',
  'gpu/webgl2.ts',
  'gpu/webgpu.ts',
  'gpu/webgpu-device.ts',
  'host/probe.ts',
  'host/surface.ts',
  'resource/arena.ts',
  'pipeline/cache.ts',
  'submit/plan.ts',
  'submit/execute.ts',
  'submit/gl2.ts',
  'submit/frame-resources.ts',
  'submit/transient-pool.ts',
  'scene/draw-list.ts',
  'scene/material.ts',
  'scene/maths.ts',
  'scene/scene.ts',
  'scene/scene-view.ts',
  'wgsl-layout.ts',
  'wgsl-references.ts',
  'wgsl-binding.ts',
  'shader-geometry.ts',
].map((p) => resolve(ROOT, p));

const WEBGPU_BACKEND = resolve(ROOT, 'gpu/webgpu.ts');

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
    const eagerRoots = ['index.ts', 'host/surface.ts'].map((p) => resolve(ROOT, p));

    const { files } = walk(eagerRoots, false);

    expect(
      files.has(WEBGPU_BACKEND),
      'gpu/webgpu.ts is reachable through a static import, so it lands in the eager chunk a card-less browser downloads. It must be reached only through `await import()`.'
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

/**
 * The four layer rules of §7 and §17 decision 7, kept by a walk rather than by
 * intention. RoadToPureEngine.md §7 says of each that it is "enforceable and worth
 * enforcing in tests/import-graph.test.ts", and decision 7 says the same of the
 * loop rule: "so the promise is a test rather than a discipline". Each rule below
 * is green on the tree today and goes red the moment its edge is drawn — verified
 * once per rule when it landed, recorded in JOURNAL.md.
 */

/** The `.ts` files directly inside one folder, absolute. */
function filesIn(dir: string): string[] {
  const at = resolve(ROOT, dir);
  return readdirSync(at)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => resolve(at, name));
}

/** The first path segment of a shipping file, which is the layer it belongs to. */
const layerOf = (file: string): string => relative(ROOT, file).split('/')[0] as string;

describe('graph/ imports nothing outside itself (§7 rule 1)', () => {
  it('names any edge from a graph/ module to a file outside graph/ or to a package', () => {
    // graph/ is types plus pure functions over them, and importing nothing is what
    // makes a graph serializable, comparable, snapshot-testable and sendable to a
    // worker — the property item 34's golden snapshots and cost()/validate()/refusal()
    // all rest on. A single type-only edge to resource/ (FrameTraffic) is what item
    // 39 severed by moving that interface into graph/types.ts.
    const graphDir = resolve(ROOT, 'graph');
    const strays: string[] = [];
    for (const file of filesIn('graph')) {
      for (const edge of edgesOf(file)) {
        const target = resolveSpec(file, edge.spec);
        if ('external' in target) {
          strays.push(`${rel(file)} imports the package "${target.external}"`);
        } else if (dirname(target.file) !== graphDir) {
          strays.push(`${rel(file)} imports ${rel(target.file)}, which is outside graph/`);
        }
      }
    }
    expect(strays, strays.join('\n')).toEqual([]);
  });
});

describe('a producer imports neither gpu/ nor submit/ (§7 rule 2)', () => {
  it('names any producer edge into a backend or the executor', () => {
    // A producer (toy/, scene/) turns a model into a graph and takes an Arena as a
    // parameter; it never reaches a device. So the whole scene tier is unit-testable
    // with no card, and its output is a value you can diff.
    const forbidden = new Set(['gpu', 'submit']);
    const reaches: string[] = [];
    for (const file of [...filesIn('toy'), ...filesIn('scene')]) {
      for (const edge of edgesOf(file)) {
        const target = resolveSpec(file, edge.spec);
        if ('file' in target && forbidden.has(layerOf(target.file))) {
          reaches.push(`${rel(file)} imports ${rel(target.file)}`);
        }
      }
    }
    expect(reaches, reaches.join('\n')).toEqual([]);
  });
});

/** The layers that must run off the main thread — in a worker, in Node against the
 * double, into a target a WebXR session hands them. host/ is the only DOM, trace/
 * and index.ts sit beside it, and everything else is below it. */
const BELOW_HOST = ['graph', 'gpu', 'resource', 'pipeline', 'submit', 'toy', 'scene'];

/** Type names that name a DOM object that does not exist off the main thread. A
 * canvas is deliberately absent: `HTMLCanvasElement | OffscreenCanvas` is how the
 * backends accept a surface without requiring the DOM one, and the check below
 * allows `HTMLCanvasElement` only where an `OffscreenCanvas` sits beside it. */
const DOM_TYPES = new Set([
  'HTMLCanvasElement',
  'HTMLElement',
  'HTMLImageElement',
  'HTMLVideoElement',
  'Window',
  'Document',
  'Element',
]);

/** DOM references in type position that would make a file require the DOM to exist.
 * Type position, because §7 rule 3's own example of the violation is "a signature
 * that demands an `HTMLCanvasElement`", and because the word `document` is a shader
 * document all over these files in value position — a value scan could not tell the
 * two apart, a type scan needs no such disambiguation. */
function domTypeOffendersIn(file: string): string[] {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const offenders: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName) && DOM_TYPES.has(node.typeName.text)) {
      const name = node.typeName.text;
      const union = node.parent;
      const pairedWithOffscreen =
        name === 'HTMLCanvasElement' &&
        ts.isUnionTypeNode(union) &&
        union.types.some((t) => ts.isTypeReferenceNode(t) && ts.isIdentifier(t.typeName) && t.typeName.text === 'OffscreenCanvas');
      if (!pairedWithOffscreen) offenders.push(`${rel(file)} names the DOM type ${name} in a signature`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return offenders;
}

describe('nothing below host/ requires a DOM object to exist (§7 rule 3)', () => {
  it('names any below-host signature that demands a DOM object', () => {
    const emitted = emittedByTheBuild();
    const offenders: string[] = [];
    for (const file of emitted) {
      if (BELOW_HOST.includes(layerOf(file))) offenders.push(...domTypeOffendersIn(file));
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});

describe('host/loop.ts imports only the package door (§17 decision 7)', () => {
  it('names any import in host/loop.ts that is not the package door', () => {
    // decision 7: engine.loop(fn) is a convenience over submit(graph), so host/loop.ts
    // may import only the package's own public exports — the door, index.ts, or the
    // package by name. That keeps loop from holding any logic submit lacks. The file
    // does not exist yet (it arrives with submit(graph), item 68); this check stands
    // ready so the promise is a test the moment loop.ts lands, not a discipline.
    const loop = resolve(ROOT, 'host/loop.ts');
    const door = resolve(ROOT, 'index.ts');
    const offenders: string[] = [];
    if (existsSync(loop)) {
      for (const edge of edgesOf(loop)) {
        const target = resolveSpec(loop, edge.spec);
        if ('external' in target) {
          if (target.external !== '@altpsyche/engine') {
            offenders.push(`host/loop.ts imports the package "${target.external}", not the door`);
          }
        } else if (target.file !== door) {
          offenders.push(`host/loop.ts imports ${rel(target.file)}, not the package door`);
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});
