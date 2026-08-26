# Contributing

Everything in here is for someone changing the package. If you are *using* it, none of this
matters to you: read [README.md](README.md), [docs/EXAMPLES.md](docs/EXAMPLES.md),
[docs/API.md](docs/API.md) and the guides instead.

## Getting set up

```bash
npm install
npm test           # about two seconds
npm run type-check
```

There are **no runtime dependencies** and that is a published property, not an accident. If a
change needs one, it needs a decision first.

## The gates, and what each is for

| command | costs | proves |
| --- | --- | --- |
| `npm test` | ~2s | the pure layers, both backends against recording doubles, and every code block in the documents |
| `npm run type-check` | seconds | the types |
| `npm run gate:pack` | seconds | the built package installs and plain node can import it |
| `npm run gate:browser` | minutes | four gates in a real browser: the corpus on both backends, the trace contract, a live surface |
| `npm run gate:card` | a desktop session and a graphics card | the only gate that reads real hardware |

Run `gate:browser`'s gates **one at a time** if you run them by hand. Several at once starve
each other under the software renderer and time out, which looks like a failure and is not
one.

## What the documents are held to

Two gates in the node suite, because a wrong document is worse than a missing one. A reader
copies it and blames the library.

**`tests/docs-code.test.ts` compiles every fenced JavaScript or TypeScript block that imports
the package entry.** It compiles them and does not run them. What goes wrong in a document is
that it names something which is not there, and a type-check catches exactly that. Two
conventions keep the blocks readable: a block may use `canvas` and `frame` without declaring
them, and a block whose first line is `// continues the block above` is checked with the
previous block of that document in front of it. Neither convention can hide a wrong argument
list or an invented property, which is the defect this gate exists for.

**`tests/api-signatures.test.ts` prints every run-time export's signature from the compiler
and matches it against `docs/API.md`.** A rename, an added argument, a widened return type or a
new undocumented export fails the gate instead of sitting in the reference as a lie. Nobody
writes those signatures by hand. They are pasted from what the checker prints.

Neither gate reads prose. A sentence about what a name is *for* is still only as good as
whoever wrote it.

`npm run example <name>` opens one of the pages in `examples/` in a browser. The examples are
not a gate, since nothing in them asserts a pixel. They are the only place the *whole* stack
runs the way a consumer runs it, so a change that breaks one has broken something no gate asked
about. [docs/DEVICES.md](docs/DEVICES.md) is the hardware log: one dated row per machine, taken
with `npm run device-report`, and the place a claim about a graphics card has to come from.

## What the cheap gates cannot see

This section is the one to read twice. It is where mistakes survive.

**Every headless browser launch reaches SwiftShader, the software renderer, whatever the flags
say.** So a pixel count from `gate:browser` belongs to a software renderer. It is a real result
about the translation and the draw path. It is not a result about a graphics card. `gate:card`
needs a visible window on a real display, plus `--enable-features=Vulkan` **and**
`--ozone-platform=x11` together. Without the second, the window renders as a flickering
transparent tile. Do not reach for `--use-angle=vulkan`: it moves the whole browser onto Vulkan
and produces that same tile.

**A test suite rewritten alongside the code it checks cannot catch a mistake in that code.**
When a change rewrites resolution logic and its tests move with it, the only independent
reading left is the browser batch's trace agreement. A node suite in the hundreds can go green
over its own rewritten snapshots while a defect walks straight through.

**No gate builds a surface on a real graphics card.** `gates/surface.mjs` drives
`createSurface` on both backends and runs headless, so its WebGPU arm is the software
renderer's. `gates/card.mjs` is the only gate that touches real hardware, and it builds the two
backends directly instead of going through `createFrameRenderer`. So nothing asserts the path a
consumer actually takes, which is `createSurface` with a WebGPU device from a real adapter. A
page can fail to get a device on real hardware while every gate here is green.

**A gate that reports a failure as a skip is worse than no gate.** One did that once. The
corpus gate treated a broken frame build as a capability refusal, went green, and let a defect
through. If you add a gate, make sure it can fail for the thing it exists to check.

## Two rules about numbers

**Never quote a number a gate did not produce.** Not an estimate, not a remembered figure, not a
number from another machine. If a claim needs a measurement, take it or say you did not.

**Name what a gate could not see.** A green gate over a picture that cannot move by construction
proves less than it looks like. One honest line, in the commit message.

## How work is tracked

**In the issue tracker and in commit messages.** There is no queue in this repository. Every
landed change carries the measurement it earned in its commit message, so `git log` is the
record of what was done and what it cost.

If you want the reasoning behind a design, read the doc comments. This codebase writes *why*
at the point of the decision, not in a document beside it.

## Design rules that are not negotiable

- **No backend grows a method the other has to throw from.** Capabilities are data. A graph
  declares what it needs, a device reports what it has, and `refusal` names the gap before a
  driver is reached.
- **`graph/` imports nothing.** That is what keeps a frame graph serialisable, comparable, and
  answerable on a machine with no graphics card. `tests/import-graph.test.ts` enforces it.
- **One entry point.** Everything public leaves through `index.ts`. Nothing reaches around it.
- **Zero runtime dependencies.**

## Commits

Say what landed and carry the measurement it earned. If a gate could not see something, say so
in the message and not only in a file.
