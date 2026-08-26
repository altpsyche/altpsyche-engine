import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

/**
 * Every name the door exports at run time is written in `docs/API.md` with the
 * signature the compiler gives it.
 *
 * Before this, `API.md` carried no signatures at all — sixty-nine names, each with a
 * line of prose about what it does and nothing about how to call it. A reference you
 * cannot call anything from is an inventory, and the gap showed: the README's own
 * `wgslFrame` example passed an argument of the wrong type for two releases, because
 * nothing anywhere wrote down what the fourth argument was.
 *
 * So the signatures are not transcribed by hand and hoped over. They are printed from
 * the checker here and matched against the document, which means a rename, an argument
 * added, a return type widened, or a new export arriving undocumented all fail this
 * gate and name themselves.
 *
 * What it does not do is read prose, so what a name is *for* is still only as good as
 * whoever wrote the sentence beside it.
 *
 * The match is existence, not exclusivity: a signature has to appear somewhere in the
 * document's fenced blocks. Requiring that no other line mention the name would be a
 * stricter rule this API cannot satisfy — `Arena.resolve(handle)` and the door's own
 * `resolve(frame, device)` are two different functions with one name, and both belong
 * in the document.
 */

const repoRoot = path.join(import.meta.dirname, '..');
const door = path.join(repoRoot, 'index.ts');

/** Namespaces documented member by member rather than as one printed type, because a
 *  reader looks up `mat4.perspective`, never the shape of `mat4`. */
const BY_MEMBER = new Set(['vec3', 'mat3', 'mat4']);

function checker(): { checker: ts.TypeChecker; source: ts.SourceFile } {
  const program = ts.createProgram([door], {
    strict: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    skipLibCheck: true,
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
    types: ['@webgpu/types'],
  });
  return { checker: program.getTypeChecker(), source: program.getSourceFile(door) as ts.SourceFile };
}

const FORMAT = ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope;

/** What every run-time export should read as in the document: one line each, or several
 *  where a namespace is documented member by member. */
function expected(): { name: string; lines: string[]; prefix?: boolean }[] {
  const { checker: check, source } = checker();
  const wanted: { name: string; lines: string[]; prefix?: boolean }[] = [];

  for (const symbol of check.getExportsOfModule(check.getSymbolAtLocation(source) as ts.Symbol)) {
    const resolved = symbol.getFlags() & ts.SymbolFlags.Alias ? check.getAliasedSymbol(symbol) : symbol;
    const flags = resolved.getFlags();
    const isValue = !!(flags & (ts.SymbolFlags.Function | ts.SymbolFlags.Variable | ts.SymbolFlags.Class | ts.SymbolFlags.BlockScopedVariable));
    if (!isValue) continue; // a type is checked by docs-code.test.ts compiling the blocks

    const name = symbol.getName();
    const declaration = resolved.valueDeclaration ?? resolved.declarations?.[0] ?? source;
    const type = check.getTypeOfSymbolAtLocation(resolved, declaration);

    if (flags & ts.SymbolFlags.Class) {
      // A class is checked by the opening of its constructor line rather than the whole
      // of it: the document writes `new Arena<T>(disposeOf, readBack?)` out in full, and
      // pinning every parameter of a constructor here would fail the gate for a change
      // that is a class's own business rather than a promise to a reader.
      wanted.push({ name, lines: [`new ${name}`], prefix: true });
      continue;
    }

    const calls = type.getCallSignatures();
    const lines = calls.map((one) => `${name}${check.signatureToString(one, declaration, FORMAT)}`);

    if (BY_MEMBER.has(name)) {
      for (const member of check.getPropertiesOfType(type)) {
        const memberDeclaration = member.valueDeclaration ?? member.declarations?.[0] ?? declaration;
        const memberType = check.getTypeOfSymbolAtLocation(member, memberDeclaration);
        const memberCalls = memberType.getCallSignatures();
        lines.push(
          memberCalls.length
            ? `${name}.${member.getName()}${check.signatureToString(memberCalls[0] as ts.Signature, memberDeclaration, FORMAT)}`
            : `${name}.${member.getName()}: ${check.typeToString(memberType, memberDeclaration, FORMAT)}`
        );
      }
    } else if (!calls.length) {
      lines.push(`${name}: ${check.typeToString(type, declaration, FORMAT)}`);
    }

    wanted.push({ name, lines });
  }
  return wanted;
}

/** Every line of every fenced TypeScript block in the document, trimmed. */
function documented(): string[] {
  const text = readFileSync(path.join(repoRoot, 'docs', 'API.md'), 'utf-8');
  const lines: string[] = [];
  for (const block of text.matchAll(/```ts\n([\s\S]*?)```/g)) {
    for (const line of (block[1] as string).split('\n')) lines.push(line.trim());
  }
  return lines;
}

const wanted = expected();
const lines = documented();

describe('docs/API.md carries the signature the compiler gives every exported value', () => {
  it('finds exports and documented lines, so a rewrite cannot empty this silently', () => {
    expect(wanted.length).toBeGreaterThan(60);
    expect(lines.length).toBeGreaterThan(100);
  });

  it('writes every run-time export down, with its signature', () => {
    const held = new Set(lines);
    const absent = wanted
      .flatMap((one) => one.lines.map((line) => ({ name: one.name, line, prefix: one.prefix })))
      .filter((one) => (one.prefix ? !lines.some((line) => line.startsWith(one.line)) : !held.has(one.line)))
      .map((one) => `${one.name}: the document does not carry\n    ${one.line}`);
    expect(absent, `docs/API.md is missing or has drifted from these signatures:\n${absent.join('\n')}`).toEqual([]);
  });
});
