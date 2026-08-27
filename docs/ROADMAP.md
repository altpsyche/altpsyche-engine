# Roadmap

**What is available to work on, what is blocked, and what is nothing but an idea.** One item per
piece of work, each carrying the measurement it will have to quote and a `Done when` a reader who
did not do the work can check.

**Why this file exists again.** It was deleted at 0.3.0 because the queue it tracked had emptied,
107 items with every one landed or superseded, and `git log` was left as the record. That was
correct then and it stopped being correct when the package took on the layer above the renderer,
because a piece of work with no place to be written down is a piece of work that gets forgotten or
done twice. A piece of work is filed where the thing it changes lives, which is the rule the
consuming site recorded as its D118 and which put this file here in the first place.

**What this file is not.** It does not track the website that consumes this package, and it does
not track anything about the article series that site publishes. Those live in that repository and
neither one queues work here. **A series wanting a capability is not a reason to build one**, which
is the same rule as the one at the top of `CLAUDE.md`: an argument amounting to "the consumer needs
it" is thrown out and replaced by a reason that stands on the package's own merits.

---

## Nothing is queued

**Read that as written.** The renderer is built to the whole WebGPU core specification, every
capability has a fixture the gates draw, and the gates are green: 4 of 4 browser gates, 17 of 17 on
a real card, 15 of 15 on the recording contract, 514 node tests over 34 files.

So the next item is a decision rather than code, and it is below.

---

## What has to be settled before the first item

### The bound the layer above the renderer is built to

**The renderer had one and it is why that work went well.** The WebGPU core specification was the
bound, every capability landed with a fixture of its own, and nothing was built because a lesson
wanted it. There is no specification for the layer above, so the same question needs a different
answer: what decides whether a scene system, an input abstraction, an asset path or an animation
model belongs in this package.

**Three candidate bounds, and none of them is chosen.**

- **What a reader doing graphics in a browser cannot reasonably write themselves.** A frame graph
  qualifies. A key handler does not.
- **What the comparable packages expose**, treated as a survey rather than a target, since matching
  a feature list is not a design.
- **What the diagnostics can still say something true about.** This package's distinguishing claim
  is that a frame can be described, costed and refused before a driver sees it. A capability that
  cannot be described that way weakens the claim rather than extending it.

**Done when** the bound is written down, with what it admits and what it refuses, and with a
worked example of each.

**Why it blocks everything else.** Every candidate below is a capability, and without a bound the
first one that arrives sets the precedent by accident.

---

## Candidates, which are ideas and not items

**None of these is planned and none may be started before the bound above exists.** They are
written down so the thinking is not lost.

| candidate | what it would be | what makes it doubtful |
| --- | --- | --- |
| input | a device-agnostic reading of pointer, key and touch state per frame | the smallest thing here and the least in need of a library |
| assets | fetching, decoding and residency for images, geometry and text | the `gltf-cube` example parses a document itself in 458 lines on purpose, and its header says a `gltf()` door would be the wrong decision |
| animation | a clock, curves, and a way to drive scene values from them | needs a scene model settled first |
| a scene system | nodes with lifetimes, above the submission path in `scene/` | this is where an abstraction usually starts assuming one backend, which the whole stack is built not to do |
| lights | a light as scene data rather than as uniforms a caller packs | a shadow pass is caller-side today and the `orbit-shadow` example is 464 lines showing it |

**One standing obligation rather than a candidate.** Whatever the layer gains, a consumer that
draws one fullscreen shader must not download it. `chunk-split` in the consuming repository counts
that from the outside, and the two backends already load by dynamic import for the same reason.

---

## How an item is written here

**An item names its steps**, each one commit-sized, each naming the measurement it will quote.
**Each item carries a `Done when`** that someone who did not do the work can check.
**A step that is blocked is said to be blocked**, with what it waits on, rather than left in place
to stop everything behind it.

**Gates are run per the table in `CLAUDE.md`**, which is `npm test` and `npm run type-check` at
every step, `gate:pack` on anything touching the export surface, `gate:browser` once over a batch
and one gate at a time, and `gate:card` never in an unattended run.

**A number is quoted only if a gate produced it**, and what a gate could not see is named in the
commit.
