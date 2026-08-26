# Contributing

Everything in here is for someone changing the package. If you are *using* it, you want
[README.md](README.md), [docs/EXAMPLES.md](docs/EXAMPLES.md), [docs/API.md](docs/API.md) and the
guides — none of this matters to you.

## Getting set up

```bash
npm install
npm test           # about a second
npm run type-check
```

There are **no runtime dependencies** and that is a published property, not an accident. If a
change needs one, it needs a decision first.

## The gates, and what each is for

| command | costs | proves |
| --- | --- | --- |
| `npm test` | ~1s | the pure layers, and both backends against recording doubles |
| `npm run type-check` | seconds | the types |
| `npm run gate:pack` | seconds | the built package installs and plain node can import it |
| `npm run gate:browser` | minutes | four gates in a real browser: the corpus on both backends, the trace contract, a live surface |
| `npm run gate:card` | a desktop session and a real card | the only thing that reads actual hardware |

Run `gate:browser`'s gates **one at a time** if you run them by hand. Several at once starve each
other under the software renderer and time out, which reads as a red gate and is not one.

`npm run example <name>` opens one of the pages in `examples/` in a browser. They are not a gate —
nothing asserts a pixel in them — but they are the only place the *whole* stack runs the way a
consumer runs it, and a change that breaks one of them has broken something a gate did not ask
about. [docs/DEVICES.md](docs/DEVICES.md) is the hardware log: one dated row per machine, taken
with `npm run device-report`, and the place a claim about a real card has to come from.

## What the cheap gates cannot see

This is the most important thing to internalise, because it is where mistakes survive.

**Every headless browser launch reaches SwiftShader, the software renderer, whatever the flags
say.** So a pixel count from `gate:browser` is a software renderer's. It is a real result about
the translation and the draw path; it is not a result about a graphics card. `gate:card` needs a
visible window on a real display, plus `--enable-features=Vulkan` **and** `--ozone-platform=x11`
together — without the second the window renders as a flickering transparent tile. Do not reach
for `--use-angle=vulkan`: it moves the whole browser onto Vulkan and produces the same tile.

**A test suite rewritten alongside the code it checks cannot catch a mistake in that code.** When
a change rewrites resolution logic and the tests move with it, only the browser batch's trace
agreement is independent. This is not hypothetical: a migration that passed 837 node tests and
rewrote its own golden snapshots was caught by one browser gate and nothing else.

**No gate builds a surface on a real card.** `gates/surface.mjs` drives `createSurface` on both
backends, and it is headless, so its WebGPU arm is the software renderer's. `gates/card.mjs` is
the one thing that touches the card, and it builds the two backends directly rather than through
`createFrameRenderer`. So the path a consumer actually takes — `createSurface` with a WebGPU
device from a real adapter — is asserted by nothing. That hole is not theoretical: four of the
six pages in `examples/` reported "WebGPU could not give this page a device" on this machine's
RTX 5080 while every gate was green, because they asked the drawing canvas for a WebGL 2 context
before handing it to WebGPU and a canvas keeps the first context type it is given.

**A gate that reports a failure as a skip is worse than no gate.** One did, once — the corpus
gate treated a broken frame build as a capability refusal, went green, and let a defect through.
If you add a gate, make sure it can fail for the thing it exists to check.

## Two rules about numbers

**Never quote a number a gate did not produce.** Not an estimate, not a remembered figure, not a
number from another machine. If a claim needs a measurement, take it or say you did not.

**Name what a gate could not see.** A green gate over a picture that cannot move by construction
proves less than it looks like. One honest line, in the commit message.

## How work is tracked

**In the issue tracker and in commit messages, as of 0.3.0.** This repository used to carry its
own queue, register and direction documents in `docs/`. They were deleted when the queue they
tracked was emptied: 107 items, every one either landed, superseded by an item that landed, or a
standing obligation that cannot close.

What survived them is in the code and in the history. Every landed change carries the measurement
it earned in its commit message, and `git log` is the record — `git log --grep '^item 27'` still
finds what item 27 landed. If you want the reasoning behind a design, read the doc comments: this
codebase writes *why* at the point of the decision rather than in a document beside it.

## Design rules that are not negotiable

- **No backend grows a method the other has to throw from.** Capability lives in the data: a graph
  declares what it needs, a device reports what it has, and `refusal` names the gap before a
  driver is reached.
- **`graph/` imports nothing.** That is what keeps a frame graph serialisable, comparable, and
  answerable on a machine with no card. `tests/import-graph.test.ts` enforces it.
- **One door.** Everything public leaves through `index.ts`. Nothing reaches around it.
- **Zero runtime dependencies.**

## Commits

Say what landed and carry the measurement it earned. If a gate could not see something, say so in
the message rather than only in a file.
