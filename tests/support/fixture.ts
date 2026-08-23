import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { FrameDescription } from '@altpsyche/engine';

/**
 * A shader a backend test draws, held here rather than read out of a website's
 * build directory. A test that reached for what some other repository compiled
 * could not run anywhere but beside it, which is what these two did.
 *
 * What that would otherwise cost is the reason those tests read the build in the
 * first place: a description written beside the assertions can only ever say the
 * backend agrees with the test. That reason is kept by a test on the site side
 * comparing its build against these files, so a build that drifts is still
 * caught, by the repository that owns the build rather than by the library.
 */
export interface Fixture {
  description: FrameDescription;
  code: string;
}

/** A fixture whose frame samples a picture, so its bytes came with it. Separating
 * the two keeps a caller that needs the bytes from testing whether they arrived:
 * the fixture either has them and this is what it returns, or asking for them is
 * the error rather than the empty answer. */
export interface PictureFixture extends Fixture {
  bytes: Uint8Array<ArrayBuffer>;
}

interface Stored {
  description: FrameDescription;
  code: string;
  bytes?: string;
}

export const FIXTURES = ['core-compute', 'core-texture'] as const;

export type FixtureName = (typeof FIXTURES)[number];

/** Where the files live, so the site's drift check reads the same path this does
 * rather than spelling it a second time. */
export function fixturePath(name: FixtureName): string {
  return path.join(import.meta.dirname, 'fixtures', `${name}.json`);
}

export function loadFixture(name: FixtureName): Fixture {
  const stored = JSON.parse(readFileSync(fixturePath(name), 'utf-8')) as Stored;
  return { description: stored.description, code: stored.code };
}

export function loadPictureFixture(name: FixtureName): PictureFixture {
  const stored = JSON.parse(readFileSync(fixturePath(name), 'utf-8')) as Stored;
  if (stored.bytes === undefined) throw new Error(`the fixture "${name}" carries no picture`);
  const bytes = Buffer.from(stored.bytes, 'base64');
  return {
    description: stored.description,
    code: stored.code,
    bytes: new Uint8Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)),
  };
}
