/**
 * The gate harness, exercised by the cheap suite.
 *
 * `gates/lib.mjs` is a `.mjs` outside `tsconfig`, so `type-check` cannot see it and
 * a change to a function it calls drifts silently. That has now happened three
 * times: `bench:traffic` died for 31 commits on item 26's `draw`-to-`draws` rename
 * (item 73), and `loadCorpus` died on item 69 dropping `frameOf`'s `uniforms`
 * parameter — which killed the browser batch three gates deep, an hour after the
 * commit that caused it and a whole run away from the change.
 *
 * The browser gates do exercise this code, and that is the problem rather than the
 * answer: they run once over a batch, cost minutes, and a throw here takes all
 * three down at once and reports nothing about the pictures they exist to compare.
 * This test asks the same question in a second and names the harness when it breaks.
 *
 * It asserts shape rather than content. What each preset draws is the browser
 * gates' business; that the harness can still assemble them is this file's.
 */
import { describe, expect, it } from 'vitest';

describe('the gate harness still assembles what the browser gates draw', () => {
  it('loads every capability fixture into a frame', async () => {
    const { loadCorpus } = await import('../gates/lib.mjs');
    const corpus = await loadCorpus();

    const { CAPABILITY_FIXTURES } = await import('../fixtures/capability-fixtures.js');
    expect(corpus).toHaveLength(CAPABILITY_FIXTURES.length);

    // Every entry carries what a gate reads off it, so a rename that empties one of
    // these fails here rather than three gates deep in a browser.
    for (const entry of corpus) {
      expect(entry.id, 'a corpus entry with no id').toBeTruthy();
      expect(entry.frame, `${entry.id} assembled no frame`).toBeTruthy();
      expect(entry.frame.modules.length, `${entry.id} carries no module`).toBeGreaterThan(0);
      for (const module of entry.frame.modules) {
        expect(module.name, `${entry.id} has a module with no name`).toBeTruthy();
        expect(module.code, `${entry.id}'s module "${module.name}" has no text`).toBeTruthy();
      }
    }
  });
});
