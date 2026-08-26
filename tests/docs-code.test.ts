import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

/**
 * Every code block in every document has to compile against the door.
 *
 * This is the gate the documents most needed and did not have. `docs-names.test.ts`
 * checks that a name a document imports exists, which catches a rename and nothing
 * else: it cannot see how many arguments a call takes, what type they are, or
 * whether a property being read is on the object at all. So the documents drifted
 * into being confidently wrong in the places a reader starts. Found by the first run
 * of this check, all four written from memory of the design rather than from code
 * that runs:
 *
 *   - README's `wgslFrame` example passed an array of `{ name, type }` where
 *     `constants?: Record<string, number>` goes — its flagship example did not
 *     compile;
 *   - README and `GUIDE-backends.md` both read `reading.offer` and
 *     `reading.capabilities` off `probe()`, and `DeviceReading` has neither. The
 *     documents had invented an API and never called `resolve`, which is the real
 *     one;
 *   - `GUIDE-frame-graph.md`'s long form wrote `source: { vertex: …, fragment: … }`,
 *     a shape `RenderSource` has never had, while claiming to be
 *     `examples/instanced-cubes` trimmed.
 *
 * Prose cannot fail a gate, which is what made describing cheap and demonstrating
 * unrewarded. This makes a demonstration the cheap thing to trust.
 *
 * **Two conventions**, because a document is not a source file and should not read
 * like one.
 *
 * A block may assume the two things nearly every browser example needs — `canvas`,
 * an `HTMLCanvasElement`, and `frame`, a `FrameGraph` — without declaring them. The
 * declaration is injected only when the block mentions the name and does not declare
 * it itself, so a block that builds its own `frame` keeps its own. Neither ambient
 * can hide the defects above: a wrong argument list or an invented property fails
 * whatever supplies the receiver.
 *
 * A block whose first line is `// continues the block above` is checked with the
 * previous checked block of the same document in front of it. A guide that builds on
 * the code above it should not have to restate that code to be checkable, and the
 * alternative — every block standing alone — buys nothing and costs a reader the
 * repetition.
 *
 * Blocks are compiled, never run. Running one needs a device and a browser, which is
 * what `examples/` and the browser gates are for; what goes wrong in a document is
 * that it names something that is not there, and a type-check is exactly the reading
 * that catches it. It costs about 0.6 s over one program for every block in the set.
 */

const repoRoot = path.join(import.meta.dirname, '..');
const door = path.join(repoRoot, 'index.ts');

/** A block that carries on from the one before it, rather than standing alone. */
const CONTINUES = /^\/\/ continues the block above/m;

/**
 * What a block may assume exists. Kept to the two a browser example cannot avoid:
 * a canvas to draw into and a frame to draw. Each is injected only where the block
 * uses the name and does not bind it itself.
 */
const AMBIENT: Record<string, string> = {
  canvas: 'declare const canvas: HTMLCanvasElement;',
  frame: "import type { FrameGraph as AmbientFrameGraph } from './index.js';\ndeclare const frame: AmbientFrameGraph;",
};

function preambleFor(code: string): string {
  return (
    Object.entries(AMBIENT)
      .filter(([name]) => new RegExp(`\\b${name}\\b`).test(code))
      .filter(([name]) => !new RegExp(`\\b(?:const|let|var|function)\\s+${name}\\b`).test(code))
      .map(([, declaration]) => declaration)
      .join('\n') + '\n'
  );
}

/** Every document a reader is pointed at: the guides under `docs/`, and the README. */
function documents(): string[] {
  const docs = readdirSync(path.join(repoRoot, 'docs'))
    .filter((name) => name.endsWith('.md'))
    .map((name) => path.join('docs', name));
  return ['README.md', ...docs];
}

type Block = { doc: string; line: number; code: string };

/** Every fenced JavaScript or TypeScript block that reaches the door, in document order. */
function blocks(): Block[] {
  const found: Block[] = [];
  for (const rel of documents()) {
    const text = readFileSync(path.join(repoRoot, rel), 'utf-8');
    for (const match of text.matchAll(/```(?:js|ts|javascript|typescript)\n([\s\S]*?)```/g)) {
      const line = text.slice(0, match.index).split('\n').length;
      let code = match[1] as string;
      if (CONTINUES.test(code)) {
        const previous = [...found].reverse().find((block) => block.doc === rel);
        if (previous) code = `${previous.code}\n${code}`;
      }
      if (!code.includes('@altpsyche/engine')) continue;
      found.push({ doc: rel, line, code });
    }
  }
  return found;
}

/** Every block type-checked in one program, so the cost is one program's rather than
 *  one per block. Each block becomes a virtual module beside the door, which is what
 *  lets `'@altpsyche/engine'` resolve to the source being tested rather than to
 *  whatever is installed. */
function diagnose(found: Block[]): string[] {
  const virtual = new Map<string, string>();
  found.forEach((block, index) => {
    const name = path.join(repoRoot, `__doc-block-${index}.ts`);
    virtual.set(name, preambleFor(block.code) + block.code.replace(/'@altpsyche\/engine'/g, `'./index.js'`));
  });

  const host = ts.createCompilerHost({});
  const readFile = host.readFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  host.readFile = (name) => (virtual.has(name) ? virtual.get(name) : readFile(name));
  host.fileExists = (name) => virtual.has(name) || fileExists(name);

  const program = ts.createProgram([...virtual.keys(), door], {
    strict: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    skipLibCheck: true,
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
    types: ['@webgpu/types'],
  }, host);

  return ts
    .getPreEmitDiagnostics(program)
    .filter((diagnostic) => diagnostic.file && virtual.has(diagnostic.file.fileName))
    .map((diagnostic) => {
      const file = diagnostic.file as ts.SourceFile;
      const index = Number(/__doc-block-(\d+)\.ts$/.exec(file.fileName)?.[1]);
      const block = found[index] as Block;
      const at = file.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ');
      return `${block.doc}: the block at line ${block.line}, ${at.line + 1} lines in — TS${diagnostic.code}: ${message}`;
    });
}

const found = blocks();

describe('every code block in the documents compiles against the door', () => {
  it('finds blocks to check, so a rewrite cannot empty this silently', () => {
    expect(found.length).toBeGreaterThan(10);
    expect(new Set(found.map((block) => block.doc)).size).toBeGreaterThan(3);
  });

  it('compiles every one of them', () => {
    const failures = diagnose(found);
    expect(failures, `these documents show code that does not compile:\n${failures.join('\n')}`).toEqual([]);
  });

  it('catches a call the door would refuse, so a green run means something', () => {
    const injected: Block[] = [
      { doc: 'injected', line: 0, code: "import { wgslFrame } from '@altpsyche/engine';\nwgslFrame('id', 'code', [], [{ wrong: true }]);\n" },
    ];
    expect(diagnose(injected)).toHaveLength(1);
  });
});
