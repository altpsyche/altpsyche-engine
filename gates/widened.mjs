// The widened list — the presets that genuinely cannot draw byte-identically
// across the two backends, each named with its cause, its date and its readings.
//
// RoadToPureEngine.md §17's amendment to decision 4 (2026-08-24) makes exactness a
// property of a shader rather than a threshold. `exact` is not a field a preset
// writes: **absence means exact**, so the strict side is the default and the
// default is not where things hide. A preset that genuinely cannot be exact is
// named here, and four rules make that a recorded decision rather than relief:
//
//   1. **It is not settable at the preset.** This one file holds the list. A
//      `CapabilityFixture` carries no `exact`/`diverges` field, so a preset author
//      hitting a divergence cannot relieve their own pain in place — they edit
//      this file, which is a diff on a shared list rather than a line in their own
//      fixture.
//   2. **The list's length is asserted, and it is currently zero.** This is the
//      load-bearing rule. `tests/widened.test.ts` pins `WIDENED.length` at 0;
//      growing the list is a diff that reddens that assertion and must update it in
//      the same change, which is what "reviewed" means when nobody's attention can
//      be relied on.
//   3. **The gate prints the list every run.** `printWidened` below is called by
//      the card gate whether the list is empty or not — a seam nobody prints is a
//      seam nobody looks at.
//   4. **An exemption names a cause, not a symptom.** `differs on WebGL 2` is a
//      symptom and worthless; `sin folded differently above ~1e3 argument` is a
//      cause, and a cause can be checked, fixed or refuted a year later.
//      `checkWidened` refuses a symptom-shaped cause, so the blatant forms fail the
//      gate rather than only a reviewer's eye — but the detector is a first-line
//      filter for the canonical symptom shapes, not a substitute for the review
//      rule 2 forces. Final judgement of cause-versus-symptom is a human's on the
//      diff.
//
// And the empty list is the expected state, for the reason the amendment's reading
// gives directly: the measured divergence (7,537 hard jumps against 292) was fixed
// by changing the shader's hash to mix its input's bits, not by widening a bar. The
// right answer to a seam is almost always to fix the shader.

/**
 * @typedef {object} Widened
 * @property {string} id the corpus preset that cannot be byte-exact across the two
 *   backends. Must be a real `CAPABILITY_FIXTURES` id — `tests/widened.test.ts`
 *   cross-checks every entry against the corpus so a stale id cannot hide here.
 * @property {string} cause **why** it diverges — the mechanism, not the place. A
 *   cause names what the arithmetic did (`sin folded differently above ~1e3
 *   argument`); a symptom names only where it showed (`differs on WebGL 2`) and is
 *   rejected by {@link checkWidened}.
 * @property {string} date the day the readings were taken, `YYYY-MM-DD`, so a
 *   year-old exemption reads as one and can be re-measured.
 * @property {string} readings the three numbers §17's amendment prescribes for the
 *   divergence — hard jumps per frame, worst per-channel delta, channels differing
 *   at all — the evidence the exemption rests on rather than a bare claim.
 */

/**
 * The widened list. **Currently empty, and expected to stay so.**
 *
 * @type {readonly Widened[]}
 */
export const WIDENED = [];

// A cause is symptom-shaped when it names only *where* a divergence showed and not
// *what* produced it. The amendment's own worthless example is `differs on
// WebGL 2`: a divergence verb (differ/diverge/fail/break/wrong/mismatch) attached
// to a backend name, carrying no mechanism. This catches that canonical shape; it
// does not — and cannot — decide every borderline case, which is why rule 2's
// reviewed diff is the real guard and this only fails the blatant forms fast.
const DIVERGENCE_VERB = /\b(diff(ers?|erent|erence)?|diverg(es?|ent|ence)?|fail(s|ed|ure)?|break(s|age)?|wrong|mismatch(es|ed)?|off|bad)\b/i;
const BACKEND_NAME = /\b(webgl ?2?|webgpu|gl ?2?|the (other|two) backends?)\b/i;

/**
 * Whether a cause is symptom-shaped and must be refused. True when the cause names
 * a divergence and a backend but no mechanism — the `differs on WebGL 2` shape. A
 * cause that also carries a mechanism (a word beyond the verb, the backend and the
 * connective glue) is not flagged, so `sin folded differently on WebGL 2 above
 * ~1e3` passes: it says *what*, not only *where*.
 *
 * @param {string} cause
 * @returns {boolean}
 */
export function symptomShaped(cause) {
  const text = String(cause).trim();
  if (!text) return true; // an empty cause is the purest symptom: no reason at all
  if (!DIVERGENCE_VERB.test(text) && !BACKEND_NAME.test(text)) return false;
  // Strip the divergence verbs, the backend names, and the connective glue that
  // binds a bare "X differs on Y" together. What is left is the mechanism, if any.
  const mechanism = text
    .replace(DIVERGENCE_VERB, ' ')
    .replace(BACKEND_NAME, ' ')
    .replace(/\b(on|in|at|the|a|an|is|are|it|its|only|between|from|to|and|of|with|by)\b/gi, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  return mechanism.length === 0;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate one widened entry, throwing with a named cause on any malformation. The
 * card gate and `tests/widened.test.ts` both run this, so a symptom-shaped or
 * ill-dated exemption reddens a gate rather than surviving to a reviewer's mercy.
 * Growing the list past zero still needs the reviewed diff of rule 2 — this checks
 * an entry is well-formed, not that it deserves to exist.
 *
 * @param {Widened} entry
 * @param {(id: string) => boolean} [isPreset] an optional check that `id` names a
 *   real corpus preset; the card gate passes one built from the loaded corpus.
 * @returns {void}
 */
export function checkWidened(entry, isPreset) {
  if (!entry || typeof entry !== 'object') throw new Error(`a widened entry must be an object, not ${typeof entry}`);
  for (const field of /** @type {const} */ (['id', 'cause', 'date', 'readings'])) {
    if (typeof entry[field] !== 'string' || !entry[field].trim())
      throw new Error(`a widened entry needs a non-empty ${field}`);
  }
  if (!ISO_DATE.test(entry.date)) throw new Error(`the widened entry for "${entry.id}" dates as "${entry.date}", not YYYY-MM-DD`);
  if (symptomShaped(entry.cause))
    throw new Error(
      `the widened entry for "${entry.id}" names a symptom, not a cause: "${entry.cause}". ` +
        `Name the mechanism (what the arithmetic did), not the place it showed.`
    );
  if (isPreset && !isPreset(entry.id))
    throw new Error(`the widened entry names "${entry.id}", which is no corpus preset`);
}

/**
 * Print the widened list, empty or not — rule 3. Returns the lines rather than
 * only printing them so a test can read exactly what a gate would show.
 *
 * @param {readonly Widened[]} [list]
 * @returns {string[]}
 */
export function printWidened(list = WIDENED) {
  const lines =
    list.length === 0
      ? [
          // **This line used to say "every corpus preset is held byte-exact across the
          // two backends", and that was a claim the list could not support.** An empty
          // list means no preset has been *granted an exemption*; it says nothing about
          // what was measured, because nothing here measures. On 2026-08-26 the card
          // gate read three scene presets differing across the backends by up to 245 of
          // 255 on the worst channel while this line printed underneath it, unchanged.
          // A list that reports its own emptiness as proof is worse than no list.
          'the widened list is empty — no preset has been granted an exemption, which is not a measurement of agreement',
        ]
      : [
          `the widened list carries ${list.length} preset${list.length === 1 ? '' : 's'} that cannot be byte-exact:`,
          ...list.map((one) => `  ${one.id}  (${one.date})  ${one.cause}  —  ${one.readings}`),
        ];
  for (const line of lines) console.log(line);
  return lines;
}
