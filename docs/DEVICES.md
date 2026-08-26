# Devices

**Readings, not a support matrix.** Each row below is what one machine saw of itself
on one day. This file publishes readings because a matrix — a table of which device
"supports" the package — rots on hardware nobody here owns and turns every stale row
into a lie. A reading
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

The two software-renderer rows below are **transcribed from measurements recorded during
development**, taken on the project's Linux machine. They are the readings that already existed when
this file was created and are carried here rather than re-measured; the field names
below are `probe()`'s. Both are software-renderer readings — the machine's real card
is reachable through WebGL 2 but not, headless, through a WebGPU adapter — which is
exactly why the three-state reading and the SwiftShader assertion exist.

### 2026-08-26 — Linux, a real card, read headed on the machine's own display

**The first hardware reading in this file.** The two rows below it are transcribed
software-renderer readings; this one was taken by `npm run device-report` on the machine's
own X11 display, with a person present, and every field is that run's output.

```
date            2026-08-26
backend         webgpu
tier            toy
webgpu          reported, adapter returned
compositing     survived a few on-screen frames
renderer        nvidia
architecture    blackwell (not swiftshader)
features        bgra8unorm-storage, clip-distances, core-features-and-limits,
                depth-clip-control, depth32float-stencil8, dual-source-blending,
                float32-blendable, float32-filterable, indirect-first-instance,
                primitive-index, rg11b10ufloat-renderable, subgroups,
                texture-component-swizzle, texture-compression-bc,
                texture-compression-bc-sliced-3d, texture-formats-tier1,
                texture-formats-tier2, timestamp-query
limits          36 reported
```

**What `gate:card` read on the same machine in the same session:**

```
adapter         nvidia / blackwell, 18 adapter features, 0.3 GiB buffer ceiling
WebGL 2         ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 5080/PCIe/SSE2, OpenGL 4.5.0)
gradient        hard jumps 0 against 0, worst 0, 0 of 1,440,000 channels differ
corpus          all 16 presets drew through WebGPU on the card
```

**Three things this settles**, each of which had only a software-renderer answer before.
`survivedCompositing` is **true** here where the 2026-08-24 reading lost the device after
three frames — so that compositing death is the software path's, not a property of the
package. The adapter architecture is `blackwell`, so the SwiftShader assertion passes on a
real name rather than by absence. And `timestamp-query` is present, which is the feature
GPU timestamps need, and which no reading here had confirmed.

**What it does not settle.** The corpus line is WebGPU only — `gate:card`'s loop draws each
preset through one backend. The cross-backend comparison is taken separately, over the scene
presets, and agrees to within one channel.

**Pixel counts differ slightly from the software renderer's**, which is expected and worth
recording rather than smoothing: `core-depth` 245,496 here against 245,512 headless,
`core-scene` 91,571 against 91,579, `core-stencil` 188,356 against 187,489, `core-mips`
479,952 against 479,964. A hardware compiler folds arithmetic its own way. Nothing in the
suite asserts equality between the two, and after this reading nothing should start to.

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

No iPhone has been read, and one is wanted. Any reading from
real hardware — a discrete GPU through a headed WebGPU adapter, a phone, an integrated
card — is a row this file does not yet have. Absence of a row is absence of a reading,
nothing more.
