/**
 * The widened list (ROADMAP.md item 45).
 *
 * RoadToPureEngine.md §17's amendment to decision 4 makes exactness a property of a
 * shader: `exact` is not a preset field — absence means exact — and a preset that
 * genuinely cannot be byte-exact across the two backends is named on one list, with
 * a cause, a date and its readings. Four rules make that a recorded decision:
 *
 *   1. It is not settable at the preset — one file holds the list.
 *   2. Its length is asserted, and is currently zero (the load-bearing rule).
 *   3. The gate prints it every run.
 *   4. An exemption names a cause, not a symptom.
 *
 * This suite pins rule 2, exercises rule 4's refusal directly, and cross-checks
 * every entry against the real corpus so a stale id cannot hide. Rule 1 is a fact
 * about the fixture type (it carries no `exact`/`diverges` field, asserted below);
 * rule 3 is the card gate's `printWidened`, whose output shape is pinned here since
 * `gate:card` never runs unattended.
 */
import { describe, expect, it } from 'vitest';
import { WIDENED, checkWidened, printWidened, symptomShaped } from '../gates/widened.mjs';
import { CAPABILITY_FIXTURES, type CapabilityFixture } from '../fixtures/capability-fixtures';

const isPreset = (id: string) => CAPABILITY_FIXTURES.some((one) => one.id === id);

describe('the widened list', () => {
  it('is empty — the load-bearing rule (2): growing it must redden this assertion', () => {
    // Absence means exact, and the expected state is empty because the measured
    // divergence was fixed by changing the shader, not by widening a bar. Adding a
    // preset here is a diff that fails this line and must update it deliberately.
    expect(WIDENED.length).toBe(0);
  });

  it('rule 1: a preset cannot exempt itself — the fixture type carries no exactness field', () => {
    // "Not settable at the preset" is a fact about `CapabilityFixture`: a preset
    // author has no `exact`/`diverges` field to relieve their own pain in place, so
    // the only way to exempt a preset is a diff to the shared list.
    const fields = new Set<keyof CapabilityFixture>(['id', 'language', 'source', 'uniforms', 'frame']);
    const forbidden = ['exact', 'diverges', 'widened', 'tolerance', 'skip'];
    for (const preset of CAPABILITY_FIXTURES)
      for (const key of forbidden) expect(Object.prototype.hasOwnProperty.call(preset, key)).toBe(false);
    // And the type's own keys are exactly the five a source cannot say about itself.
    expect(new Set(Object.keys(CAPABILITY_FIXTURES[0])).size).toBeLessThanOrEqual(fields.size);
  });

  it('every entry is well-formed and names a real preset', () => {
    // Empty today, so this guards the future: whatever lands on the list must pass
    // the same validation the card gate runs, against the same corpus.
    for (const entry of WIDENED) expect(() => checkWidened(entry, isPreset)).not.toThrow();
  });

  describe('rule 4: a symptom is refused, a cause is kept', () => {
    it('refuses the amendment’s own worthless example', () => {
      // `differs on WebGL 2` names where it showed, not what produced it.
      expect(symptomShaped('differs on WebGL 2')).toBe(true);
      expect(symptomShaped('fails on webgpu')).toBe(true);
      expect(symptomShaped('wrong on the other backend')).toBe(true);
      expect(symptomShaped('')).toBe(true);
    });

    it('keeps a cause that names a mechanism', () => {
      // The amendment's own good example, and a variant that still carries a
      // mechanism even while naming the backend.
      expect(symptomShaped('sin folded differently above ~1e3 argument')).toBe(false);
      expect(symptomShaped('hash reuses a shared corner value that folds sub-representably on WebGL 2')).toBe(false);
    });

    it('checkWidened throws by name on a symptom-shaped cause', () => {
      expect(() =>
        checkWidened({ id: 'core-texture', cause: 'differs on WebGL 2', date: '2026-08-25', readings: '220 vs 220' }, isPreset)
      ).toThrow(/symptom/);
    });

    it('checkWidened accepts a well-formed, cause-shaped entry', () => {
      expect(() =>
        checkWidened(
          {
            id: 'core-texture',
            cause: 'sin folded differently above ~1e3 argument',
            date: '2026-08-25',
            readings: 'hard jumps 7,537 vs 292; worst 255; 61,000 of 1,440,000 channels differ',
          },
          isPreset
        )
      ).not.toThrow();
    });
  });

  describe('checkWidened refuses the other malformations', () => {
    const good = {
      id: 'core-texture',
      cause: 'sin folded differently above ~1e3 argument',
      date: '2026-08-25',
      readings: 'hard jumps 7,537 vs 292',
    } as const;

    it('a non-ISO date', () => {
      expect(() => checkWidened({ ...good, date: 'August 2026' }, isPreset)).toThrow(/YYYY-MM-DD/);
    });
    it('an empty field', () => {
      expect(() => checkWidened({ ...good, readings: '  ' }, isPreset)).toThrow(/readings/);
    });
    it('an id naming no preset', () => {
      expect(() => checkWidened({ ...good, id: 'core-nonesuch' }, isPreset)).toThrow(/no corpus preset/);
    });
  });

  describe('rule 3: the gate prints the list whether empty or not', () => {
    it('prints the empty-list line today', () => {
      const lines = printWidened([]);
      expect(lines).toHaveLength(1);
      expect(lines[0]).toMatch(/empty/);
    });

    it('prints one line per preset when the list is not empty', () => {
      const lines = printWidened([
        { id: 'core-texture', cause: 'sin folded differently above ~1e3', date: '2026-08-25', readings: '7,537 vs 292' },
      ]);
      expect(lines).toHaveLength(2);
      expect(lines[0]).toMatch(/1 preset that cannot be byte-exact/);
      expect(lines[1]).toContain('core-texture');
    });
  });
});
