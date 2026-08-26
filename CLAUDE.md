# @altpsyche/engine

A renderer for the browser and the engine above it, published as one npm package from one
import path. **The goal governs every judgement call: this is a world class package for people
doing graphics in a browser, and it is not shaped around the one website that consumes it.**
Where an argument for a design amounts to "the website needs it", throw the argument out and
look for a reason that stands on the package's own merits.

## The documents

| document | owns |
| --- | --- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | the stack as built: the door, the layers, the three lifetimes, handles, the capability model |
| [docs/API.md](docs/API.md) | every name the door exports, grouped by what a reader is doing |
| [docs/GUIDE-frame-graph.md](docs/GUIDE-frame-graph.md), [docs/GUIDE-backends.md](docs/GUIDE-backends.md) | the consumer guides |
| [docs/DEVICES.md](docs/DEVICES.md) | hardware readings, one row per machine per day |
| [CONTRIBUTING.md](CONTRIBUTING.md) | the gates, what each cannot see, and the rules that are not negotiable |

**The queue, the register, the direction document and the session handover were deleted at
0.3.0**, when the queue they tracked was emptied — 107 items, every one landed, superseded by an
item that landed, or a standing obligation that cannot close. `git log` is the record now: a
landed change carries its measurement in its commit message, and `git log --grep '^item 27'`
still finds what item 27 landed. `git show` recovers any of the four deleted files from history.

**So there is no in-repository queue any more.** Work is decided in the open and tracked outside
this tree. What has not changed is the standard a change is held to, which is the rest of this
file.

## What a number may claim

**Never quote a number a gate did not produce.** Not an estimate, not a remembered figure, not a
number from another machine. If a claim needs a measurement, take it or say you did not.

**Name what a gate could not see.** A green gate over a picture that cannot move by construction,
or a count the recorder does not take, proves less than it appears to. One honest line is enough,
and it belongs in the commit message.

## The gates, and what each costs

| command | cost | when |
| --- | --- | --- |
| `npm test` | about 1 second | every step, always |
| `npm run type-check` | seconds | every step, always |
| `npm run gate:pack` | seconds | any step touching `package.json`, `index.ts` or the export surface |
| `npm run gate:browser` | minutes, four gates, needs Playwright's pinned browser | **once over a batch**, not per step |
| `npm run gate:card` | needs a desktop session and a real graphics card | **never in an unattended run.** Every headless launch reaches the software renderer whatever the flags say, and the gate's own header says so |

**Run the browser gates one at a time.** Several at once starve each other under the software
renderer and time out, which reads as a red gate and is not one.

## How work is chosen

**`Done when` is still the only definition of done**, whatever tracks it: if a change cannot be
checked by someone who did not make it, it is not finished.

**One change, one commit**, carrying the measurement it earned.

## Where a decision goes

**Into the code, at the point of the decision.** This codebase writes *why* in the doc comment
above the thing decided, which is why its comments are long and why they survive a file move. A
design decision that only exists in a document beside the code is one the next reader will not
find.

A call worth recording carries three things: what was decided, **how to reverse it**, and what
would change the answer. That belongs in the commit message.

## Commits

- The message says what landed and carries the measurement it earned.
- **Never push.** The remote is not this session's to publish to.
- One item per commit, except where an item's own text says it goes alone.

## Standing refusals

- No runtime dependency is added to this package without a deliberate decision. Zero runtime
  dependencies is a published property.
- No export moves out from behind the one door in `index.ts`.
- No backend grows a method the other has to throw from. Capability lives in the data.
