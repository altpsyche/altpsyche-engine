# @altpsyche/engine

A renderer for the browser and the engine above it, published as one npm package from one
import path. **The goal governs every judgement call: this is a world class package for people
doing graphics in a browser, and it is not shaped around the one website that consumes it.**
Where an argument for a design amounts to "the website needs it", throw the argument out and
look for a reason that stands on the package's own merits.

## The three documents, and which one answers what

| document | owns |
| --- | --- |
| [docs/RoadToPureEngine.md](docs/RoadToPureEngine.md) | direction. The eleven decisions, the layer stack, the seven stages, the invariants. **Read §17 before taking any call it already settled.** |
| [docs/ROADMAP.md](docs/ROADMAP.md) | the queue. Fifty-eight items, their dependencies, their status, their done-when. **Nothing else queues work.** |
| [docs/JOURNAL.md](docs/JOURNAL.md) | the register. What a person has to look at afterwards, and every call taken with nobody watching. |

[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) describes the stack **as built** — the door, the
layers, the three lifetimes, handles, the capability model, and what each gate can and cannot
see. [docs/API.md](docs/API.md) is the export surface; `docs/GUIDE-*.md` are the consumer guides.

[docs/ABSTRACTION.md](docs/ABSTRACTION.md) and [docs/RENDERER-DESIGN.md](docs/RENDERER-DESIGN.md)
are **historical as of 2026-08-26**: they predate the split from the website and are now stale
about today's code as well as about direction. Both carry a banner saying so. They are kept
rather than deleted because RoadToPureEngine.md §1 quotes ABSTRACTION.md to build its central
argument, and a document whose source has been deleted argues from nothing.

## What a number may claim

**Never quote a number a gate did not produce.** Not an estimate, not a remembered figure, not a
number from another machine. If a claim needs a measurement, take it or say you did not.

**Name what a gate could not see.** A green gate over a picture that cannot move by construction,
or a count the recorder does not take, proves less than it appears to. One honest line is enough,
and it belongs in the commit message and in JOURNAL.md.

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

**The lowest-numbered item in ROADMAP.md whose `Needs` are all `done`.** Not the most
interesting one, not the one already half in your head. `lifted` never satisfies a `Needs`.

**One item, one session, one commit.** The handover is the repository, not a conversation: a
session that ends without committing has handed nothing over.

**`Done when` is the only definition of done.** If it cannot be checked by someone who did not do
the work, the item is not finished.

## Where a decision goes

**Design decisions about this library are recorded in the consuming repository's log**, which is
what [docs/ROADMAP.md](docs/ROADMAP.md) says of itself and is not this file's to change. That log
is not reachable from here.

So a call taken **in** this repository goes into [docs/JOURNAL.md](docs/JOURNAL.md), in the same
commit as the work, carrying what was decided, **how to reverse it**, and an honest line on what
would change the answer. An entry that does not say how to undo it has not been written. Rows
needing an entry on the consuming side are marked so, and somebody carries them across; that is a
handover rather than a decision moving home.

## Commits

- The message says what landed and carries the measurement it earned.
- **Never push.** The remote is not this session's to publish to.
- One item per commit, except where an item's own text says it goes alone.

## Standing refusals

- No runtime dependency is added to this package without an item in ROADMAP.md that says so. Zero
  runtime dependencies is a published property, per RoadToPureEngine.md §17 decision 5.
- No export moves out from behind the one door in `index.ts`.
- No backend grows a method the other has to throw from. Capability lives in the data.
