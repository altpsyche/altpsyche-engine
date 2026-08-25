import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { deprecate } from '../deprecate.js';
import { legacyEcho } from './support/deprecated-export.js';

/**
 * The deprecation mechanism (§17 decision 8, ROADMAP.md item 56). A deprecated
 * export leaves in two halves and this proves both, as far as a node suite can:
 *
 *  - the runtime half — a one-shot dev-mode warning per symbol — is exercised
 *    here directly, calling a deprecated export twice and reading the warnings;
 *  - the editor half — the `@deprecated` JSDoc that a language server draws struck
 *    through — is proven up to the tag the server keys off: the compiler is asked
 *    whether the declaration carries a recognised `@deprecated` tag. The pixels a
 *    real editor paints are the one thing no node gate reaches; the tag that makes
 *    it paint them is what is asserted.
 */
describe('a deprecated export warns once per session (item 56)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('warns the first time a deprecated export is reached and not again', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const first = legacyEcho(41);
    const second = legacyEcho(42);

    // The export still does its old thing on every call.
    expect(first).toBe(41);
    expect(second).toBe(42);
    // But it warns exactly once, however many times it is reached this session —
    // a loop calling it every frame must not warn every frame.
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('legacyEcho');
    expect(warn.mock.calls[0]?.[0]).toContain('deprecated');
  });

  it('keys the one-shot per symbol, so a different name warns on its own', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    deprecate('some-other-symbol');
    deprecate('some-other-symbol');

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain('some-other-symbol');
  });

  it('is silent in a production build, where a developer is not reading warnings', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const before = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      // A name never warned about elsewhere, so the one-shot set is not the reason
      // it stays quiet — the production check is.
      deprecate('production-only-symbol');
      deprecate('production-only-symbol');
    } finally {
      if (before === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = before;
    }

    expect(warn).not.toHaveBeenCalled();
  });
});

describe('a deprecated export carries the tag an editor draws struck through (item 56)', () => {
  it('marks the export with a @deprecated JSDoc tag the compiler recognises', () => {
    // Parse the demonstrator the same way the language server would, and ask the
    // compiler — not a regex — whether `legacyEcho`'s declaration carries a
    // `@deprecated` tag. That recognised tag is exactly what a server keys its
    // strikethrough off, so its presence is the strongest claim a node gate can
    // make about an editor rendering it never sees.
    const file = resolve(import.meta.dirname, 'support/deprecated-export.ts');
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);

    let declaration: ts.FunctionDeclaration | undefined;
    source.forEachChild((node) => {
      if (ts.isFunctionDeclaration(node) && node.name?.text === 'legacyEcho') declaration = node;
    });
    expect(declaration, 'the demonstrator no longer exports legacyEcho').toBeDefined();

    const tags = ts.getJSDocTags(declaration as ts.Node);
    const deprecatedTag = tags.find((tag) => tag.tagName.escapedText === 'deprecated');
    expect(deprecatedTag, 'legacyEcho carries no @deprecated JSDoc tag to draw struck through').toBeDefined();
  });
});
