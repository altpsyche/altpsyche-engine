import type { FrameGraph } from '../graph/types.js';

/**
 * Re-uploads a frame's resource bytes into the buffers a program already built
 * for them (item 18, step 3).
 *
 * **Why this exists.** A compiled program bakes in the bytes of the frame it was
 * built from, so a picture whose geometry moves cannot share one: the program
 * cache is keyed on a string that contains those bytes, and a fresh `data` every
 * tick is a fresh key every tick. Measured on this tree before anything changed:
 * sixty ticks of one 16x16 quad grid link sixty programs where the cache exists
 * to link one, and the key is 31,335 characters over 7,696 bytes of geometry.
 * The alternative — a cheap identity in the key instead of the bytes — was
 * refused, because a different identity is still a different program and all
 * sixty compiles stand.
 *
 * **So the bytes stop identifying a program and start being something a program
 * is handed.** This is the half that makes that safe: a program drawn with a
 * frame other than the one it was built from is refilled from that frame first,
 * so a cache hit draws the geometry it was asked for rather than the geometry
 * the first frame happened to carry. Without it, dropping the bytes from the key
 * is exactly the false hit the key exists to prevent.
 *
 * **A length that changed is refused by name rather than written past.** A
 * buffer is allocated for a size. A frame whose geometry grew is a different
 * program however the key is written, and the honest answer is to say so where
 * it happens: a silent partial write is a picture with the end of its geometry
 * missing, which reads as a modelling bug rather than as a cache bug and costs
 * whoever finds it a day.
 *
 * **This is generic over the buffer because the two backends hold different
 * ones** — a `GPUBuffer` and a `WebGLBuffer` — and the rule about *which*
 * resources are refilled, and what happens when a length moves, is one rule and
 * not two. A backend that grew its own copy would be the second place the rule
 * lives, and the first one to drift.
 *
 * **To reverse**: delete this and the `refill` member on both backends, and put
 * the resource bytes back in `frameKey`. **What would change the answer**: a
 * measurement showing a recompile costs little enough that sixty a second do not
 * matter, which is unmeasured on any machine — `gate:card` never runs
 * unattended, and the counts this was built on come from a double whose
 * `linkProgram` compiles nothing.
 *
 * @returns how many buffers were written, which is what a test counts.
 */
export function refillBuffers<Buffer>(
  next: FrameGraph,
  held: Map<number, { buffer: Buffer; bytes: number }>,
  write: (buffer: Buffer, data: Uint8Array<ArrayBuffer>) => void
): number {
  let written = 0;
  for (const [index, resource] of next.resources.entries()) {
    const slot = held.get(index);
    if (!slot) continue;
    // Only the kinds that carry bulk bytes have `data` at all, and a resource
    // that has the field and left it empty is one the build never filled — the
    // program built its buffer without contents and there is nothing here to put
    // back.
    const data = 'data' in resource ? resource.data : undefined;
    if (!data) continue;
    if (data.byteLength !== slot.bytes) {
      throw new Error(
        `resource ${index} on "${next.id}" came back with ${data.byteLength} bytes where the program was built for ${slot.bytes}. ` +
          'A buffer is allocated for a size, so geometry that changed length is a different program and not a refill of this one.'
      );
    }
    write(slot.buffer, data);
    written++;
  }
  return written;
}
