# Devices

**Readings, not a support matrix.** Each row below is what one machine saw of itself
on one day. This file publishes readings because a matrix — a table of which device
"supports" the package — rots on hardware nobody here owns and turns every stale row
into a lie ([RoadToPureEngine.md](RoadToPureEngine.md) §17 decision 11). A reading
never claims to be anything but what a device reported when it was asked.

**Absence is not a claim of non-support.** A device with no row here has not been read,
which is all that its absence says. The package's promise is the capability model of
§10 — a correct refusal by name on any device, read or unread — and these readings are
evidence for that promise, never a dependency of it. A shader that would be refused on
hardware nobody has read is still refused, by name, before it draws.

## How a row is taken

Run `npm run device-report` on a machine with its own display and graphics card. It
opens a browser, calls the package's own `probe()`, and prints a paste-able row plus
its JSON. Add the row here in a pull request. Three states are read where a careless
reading reads two: whether WebGPU was **reported** (`navigator.gpu` present), whether
an adapter was **returned** when asked, and whether the device then **survived** a few
frames of on-screen compositing — because an adapter that came back and died under a
second is a success by any two-state reading. The adapter architecture is asserted
**not** to be `swiftshader`, because `--enable-unsafe-webgpu` reports a software
renderer that a reading trusting the adapter's name would record as hardware.

## Readings

The two rows below are **transcribed from the measured facts recorded in
[RoadToPureEngine.md](RoadToPureEngine.md) §17** (measured fact two and decision 11),
taken on the project's Linux machine. They are the readings that already existed when
this file was created and are carried here rather than re-measured; the field names
below are `probe()`'s. Both are software-renderer readings — the machine's real card
is reachable through WebGL 2 but not, headless, through a WebGPU adapter — which is
exactly why the three-state reading and the SwiftShader assertion exist.

### 2026-08-24 — Linux, headless WebGPU on the software renderer

```
date            2026-08-24 (transcribed from §17 measured fact two, not re-measured here)
backend         webgpu
tier            toy
webgpu          reported, adapter returned
compositing     DID NOT survive on-screen compositing
renderer        software renderer (SwiftShader)
architecture    swiftshader (SWIFTSHADER — a software renderer named as hardware)
features        not recorded in the source reading
limits          not recorded in the source reading
```

An **on-screen** WebGPU canvas the browser composited, at 200×100, **drew 3 frames and
then lost the device with reason `destroyed`**. The same content on a canvas left **out
of the document drew 54 frames a second** — which is why the reading is taken on-screen:
an off-document surface never dies and would record this as a success. This is the
reading that motivates `survivedCompositing`.

### 2026-08-24 — Linux, `--enable-unsafe-webgpu` reports software while WebGL reports the card

```
date            2026-08-24 (transcribed from §17 measured fact two, not re-measured here)
backend         webgpu
tier            toy
webgpu          reported, adapter returned
compositing     not recorded in the source reading
renderer        SwiftShader (WebGPU adapter); the real card is reported by WebGL 2 in the same browser
architecture    swiftshader (SWIFTSHADER — a software renderer named as hardware)
features        not recorded in the source reading
limits          maxBufferSize ≈ 1 GiB
```

Requesting the WebGPU adapter with only `--enable-unsafe-webgpu` reports **SwiftShader
with a 1 GiB buffer ceiling**, while WebGL 2 in the same browser reports the **real
card** (its name is not recorded in the source reading). A reading that trusted the
adapter's own name would record this software renderer as hardware. This is the reading
that motivates the architecture assertion.

## Wanted

No iPhone has been read; §57 of [ROADMAP.md](ROADMAP.md) wants one. Any reading from
real hardware — a discrete GPU through a headed WebGPU adapter, a phone, an integrated
card — is a row this file does not yet have. Absence of a row is absence of a reading,
nothing more.
