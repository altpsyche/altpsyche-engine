import { describe, expect, it } from 'vitest';
import { Arena } from '../resource/arena';

/**
 * The arena's own contract, held without a device: it hands out branded integer
 * handles, resolves a live one to the resource it names, and — the property the
 * whole thing exists for — never hands the same handle out twice. A slot freed
 * and reused carries a bumped generation, so the handle it is handed out under
 * after a free cannot equal the one it carried before it, and a handle to the old
 * occupant is caught rather than resolving to the new one.
 *
 * A string stands in for a card resource here, because the arena holds whatever
 * it is told to and frees it through the disposer it was given: nothing here needs
 * a buffer or a texture to check that a stale handle is detectable.
 */

/** An arena over named tokens, plus the record of what it disposed, so a test can
 * assert the disposer ran on the resource a free named. */
function arenaOfTokens() {
  const freed: string[] = [];
  const arena = new Arena<string>((token) => freed.push(token));
  return { arena, freed };
}

describe('the arena addresses resources by handle', () => {
  it('resolves a live handle to the resource it was allocated with', () => {
    const { arena } = arenaOfTokens();
    const handle = arena.allocate(() => 'buffer');
    expect(arena.resolve(handle)).toBe('buffer');
    expect(arena.live(handle)).toBe(true);
  });

  it('hands the resource `make` returns rather than the thunk', () => {
    const { arena } = arenaOfTokens();
    let calls = 0;
    const handle = arena.allocate(() => `made-${++calls}`);
    expect(arena.resolve(handle)).toBe('made-1');
    expect(calls).toBe(1);
  });
});

describe('a handle freed and reallocated does not compare equal to its predecessor', () => {
  it('reuses the slot but bumps the generation, so the new handle differs', () => {
    const { arena } = arenaOfTokens();
    const first = arena.allocate(() => 'a');
    arena.free(first);
    const second = arena.allocate(() => 'b');
    // The slot is reused — that is the free list working — but the handle is not,
    // which is the generation working.
    expect(second).not.toBe(first);
    expect(arena.resolve(second)).toBe('b');
  });

  it('refuses the freed handle rather than resolving it to the slot’s new occupant', () => {
    const { arena } = arenaOfTokens();
    const first = arena.allocate(() => 'a');
    arena.free(first);
    arena.allocate(() => 'b');
    expect(arena.live(first)).toBe(false);
    expect(() => arena.resolve(first)).toThrow(/no live resource/);
  });

  it('disposes the resource a free names, and only once', () => {
    const { arena, freed } = arenaOfTokens();
    const handle = arena.allocate(() => 'a');
    arena.free(handle);
    expect(freed).toEqual(['a']);
    // A double free is harmless: the slot is already stale, so nothing is disposed
    // a second time.
    arena.free(handle);
    expect(freed).toEqual(['a']);
  });
});

describe('the resize and upload verbs', () => {
  it('resize frees the old resource and returns a fresh handle to the new one', () => {
    const { arena, freed } = arenaOfTokens();
    const before = arena.allocate(() => 'small');
    const after = arena.resize(before, () => 'large');
    expect(freed).toEqual(['small']);
    expect(after).not.toBe(before);
    expect(arena.resolve(after)).toBe('large');
    expect(() => arena.resolve(before)).toThrow(/no live resource/);
  });

  it('upload runs against the live resource a handle names', () => {
    const { arena } = arenaOfTokens();
    const handle = arena.allocate(() => 'target');
    let seen: string | null = null;
    arena.upload(handle, (resource) => (seen = resource));
    expect(seen).toBe('target');
  });

  it('upload refuses a stale handle', () => {
    const { arena } = arenaOfTokens();
    const handle = arena.allocate(() => 'target');
    arena.free(handle);
    expect(() => arena.upload(handle, () => undefined)).toThrow(/no live resource/);
  });
});
