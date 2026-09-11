import { describe, expect, it } from 'vitest';
import { mat4 } from '../scene/maths';
import { AIMED_PROJECTION, CAPABILITY_FIXTURES } from '../fixtures/capability-fixtures';

/**
 * The projection the capability presets are aimed with, held to the arithmetic this
 * package publishes (item 6).
 *
 * **Why this exists.** Four presets were aimed by sixteen numbers that are
 * `mat4.perspective`'s output, copied, and nothing named both. The defect is not the
 * literal: a fixture that *called* `mat4.perspective` would move whenever
 * `mat4.perspective` moved, which is the weaker check, and `CONTRIBUTING.md` says a
 * suite rewritten alongside the code it checks cannot catch a mistake in that code.
 * The defect was that the agreement was unasserted in either direction. Change
 * `perspective` to write clip depth from minus one to one and its own tests would be
 * rewritten with it, these fixtures would keep the zero-to-one numbers, and the two
 * would disagree in silence — which is exactly what happened across two packages and
 * is what opened item 3.
 *
 * So the literal stays literal and this names both sides. It is red if either moves
 * alone, which is the whole of what it is for.
 */

/** The arguments the presets are aimed with, stated here because this is where the
 * two sides are compared: sixty degrees of vertical view, a square frame, and a
 * depth range from half a unit in front of the camera to five. */
const FOV_Y = Math.PI / 3;
const ASPECT = 1;
const NEAR = 0.5;
const FAR = 5;

/** The places a fixture number is written to seven decimals, which is how the
 * literal was taken down in the first place. Comparing at full precision would fail
 * on a digit no picture can show; comparing loosely would pass a projection with the
 * wrong depth convention, since `-1.1111111` against `1.1111111` is the whole
 * difference between the two ranges and is nowhere near a rounding.
 *
 * Seven decimals is also exactly where float32 starts to show, which is why the
 * second test below exists: the same entry rounds to `-1.1111111` from the
 * arithmetic and `-1.1111112` from `mat4.pack`'s `Float32Array`. */
const PLACES = 7;

const rounded = (n: number): number => Number(n.toFixed(PLACES));

describe('the projection the capability presets are aimed with', () => {
  it('is what mat4.perspective writes for those arguments, to the digit it was taken down at', () => {
    const computed = [...mat4.perspective(FOV_Y, ASPECT, NEAR, FAR)].map(rounded);
    expect(AIMED_PROJECTION).toEqual(computed);
  });

  it('is the arithmetic’s numbers and not the buffer’s, which differ in the last digit of one entry', () => {
    // **Item 6's step 1 said to compare against `mat4.pack(mat4.perspective(...))`
    // and that is the wrong side of a float32 boundary.** `pack` is a `Float32Array`,
    // the view the card reads, so `far / (near - far)` — `-1.1111111...` in the
    // arithmetic — comes back as `-1.1111112` once rounded to seven decimals, against
    // the literal's `-1.1111111`. One digit, in one entry, and it would have made the
    // check above red on a tree where nothing was wrong.
    //
    // The literal is the arithmetic's and that is the right choice: it is what
    // `scene/maths.ts` publishes, and what a reader comparing the two would compute.
    // The buffer's own view is not ignored, though — it is held to the literal within
    // the precision a float32 has, so a projection that changed by more than the
    // rounding is caught on this side as well.
    const packed = [...mat4.pack(mat4.perspective(FOV_Y, ASPECT, NEAR, FAR))];
    expect(rounded(packed[10]!)).not.toBe(AIMED_PROJECTION[10]);
    for (const [at, number] of packed.entries()) {
      expect(number).toBeCloseTo(AIMED_PROJECTION[at]!, 6);
    }
  });

  it('carries the zero-to-one depth range, which is the entry pair that would drift', () => {
    // `far / (near - far)` and `near * far / (near - far)`, the two entries a change
    // of depth convention moves. Named on their own so a failure says *which* half of
    // the projection disagreed rather than only that sixteen numbers did.
    expect(AIMED_PROJECTION[10]).toBe(rounded(FAR / (NEAR - FAR)));
    expect(AIMED_PROJECTION[14]).toBe(rounded((NEAR * FAR) / (NEAR - FAR)));
    // Both are negative, which is what zero-to-one looks like with a right-handed
    // view space looking down negative z. A minus-one-to-one projection writes a
    // different pair and this is the cheapest place to see it.
    expect(AIMED_PROJECTION[10]).toBeLessThan(0);
    expect(AIMED_PROJECTION[14]).toBeLessThan(0);
  });

  it('is sixteen numbers in column-major order, which is what a mat4 uniform takes', () => {
    // Not a restatement of the check above: it holds the *shape*, so a literal that
    // lost or gained an entry fails here by name rather than as a mismatch of arrays.
    expect(AIMED_PROJECTION).toHaveLength(16);
    expect(mat4.pack(mat4.perspective(FOV_Y, ASPECT, NEAR, FAR))).toHaveLength(16);
  });

  it('is the one array all four aimed presets are fed, rather than four copies of it', () => {
    // Read off the registry, not asserted about the constant: what item 6 changed is
    // that the four presets *share* this array, and the way to check sharing is
    // identity. A future preset that pastes the sixteen numbers again instead of
    // importing the constant shows up here as a fifth `u_place` this does not count,
    // which is why the count is asserted too.
    const aimed = CAPABILITY_FIXTURES.flatMap((preset) =>
      preset.uniforms.filter((one) => one.name === 'u_place').map((one) => one.value)
    );
    expect(aimed).toHaveLength(4);
    for (const value of aimed) expect(value).toBe(AIMED_PROJECTION);
  });

  it('is fed to the four presets the item named and no others', () => {
    // Which four, by name, so a preset gaining or losing the projection is a red
    // gate that says which one rather than a count that moved. Item 6 named the four
    // by line number rather than by name and the names are not the ones a reader
    // would guess: `core-geometry` draws the same grid `core-depth` does and is aimed
    // by neither this nor any projection, and `core-report` — which reads back a
    // count — is aimed by this one. `core-blend` and `core-count` are deliberately
    // absent: both were written without a projection so that this item's four copied
    // literals did not become five or six.
    const aimed = CAPABILITY_FIXTURES.filter((preset) =>
      preset.uniforms.some((one) => one.name === 'u_place')
    ).map((preset) => preset.id);
    expect(aimed.sort()).toEqual(['core-depth', 'core-multisample', 'core-report', 'core-stencil']);
  });
});
