/**
 * The rules about a frame's buffers that the build and the backend both have to
 * hold, kept here so the two agree by reading one fact rather than by each
 * writing its own copy of it. The build refuses a bad description before the site
 * is shipped and the backend refuses one the card would reject at a call; when
 * the same rule was written out in both files the two numbers could drift apart
 * and only one of them be right.
 */

/** How many bytes one query answer takes in the buffer a pass resolves it into.
 * A timestamp and an occlusion count are each this wide. */
export const QUERY_BYTES = 8;

/** A timed pass writes a time at each end of itself, so it resolves two of them. */
export const TIMED_QUERY_BYTES = 2 * QUERY_BYTES;

/** A visible pass counts the samples of its draw that got through, which is one
 * answer. */
export const VISIBLE_QUERY_BYTES = QUERY_BYTES;

/** A storage buffer is read four bytes at a time, so its size is a positive whole
 * number of those words. The card refuses any other over a binding size that
 * names neither the buffer nor the description, so both the build and the backend
 * refuse it first and in the same words. */
export function assertWholeWords(id: string, name: string, bytes: number): void {
  if (bytes <= 0 || bytes % 4 !== 0) {
    throw new Error(
      `the frame for "${id}" gives "${name}" ${bytes} bytes, which is no whole number of four-byte words`
    );
  }
}
