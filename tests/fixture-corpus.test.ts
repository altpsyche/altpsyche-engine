import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { FIXTURES, loadFixture, sourcePath, type FixtureName } from './support/fixture';
import { CAPABILITY_FIXTURES } from '../fixtures/capability-fixtures';

/**
 * Whether the corpus is whole, which is the question a derived fixture replaces a
 * drift check with. Nothing here can go stale, because nothing is stored, so what
 * is left to get wrong is a source with no entry, an entry with no source, or a
 * declaration the describer refuses.
 */
const dir = path.join(import.meta.dirname, '..', 'fixtures', 'source');

describe('the fixture corpus', () => {
  it('has an entry for every source and a source for every entry', () => {
    // Only the `.wgsl` sources; `source/glsl/` holds the build-time GLSL bake
    // (item 41), which is generated output rather than a corpus source.
    const onDisk = readdirSync(dir)
      .filter((f) => f.endsWith('.wgsl'))
      .sort();
    const declared = CAPABILITY_FIXTURES.map((one) => one.source).sort();
    expect(declared).toEqual(onDisk);
  });

  it.each(FIXTURES)('%s derives a description off its own source', (name: FixtureName) => {
    expect(existsSync(sourcePath(name))).toBe(true);
    const fixture = loadFixture(name);
    expect(fixture.code.length).toBeGreaterThan(0);
    expect(fixture.description.target).toBe('wgsl');
    expect(fixture.description.passes.length).toBeGreaterThan(0);
    // Every address the description sends a reader to is a thing the declaration
    // generated, because a description naming bytes nobody made is a fetch of
    // nothing and the card reports an unfilled resource as no error at all.
    for (const resource of fixture.description.resources)
      if ('source' in resource && resource.source) expect(fixture.generated.has(resource.source)).toBe(true);
  });
});
