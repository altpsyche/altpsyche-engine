# Devices

**A hardware log, kept by the people changing the package.** If you are *using* the
package, you do not need a row in here: `await probe()` answers what your browser
offers, on the machine it is running on, which is the only answer that is true for your
user. This file exists so that the package's own claims about hardware have a dated
source, and so a contributor can tell a software renderer's result from a card's.

**Readings, not a support matrix.** Each row below is what one machine saw of itself on one
day. A support matrix, meaning a table of which device "supports" the package, rots on
hardware nobody here owns, and every stale row in it becomes a lie. A reading only ever claims
to be what a device reported when it was asked.

**Absence is not a claim of non-support.** A device with no row here has not been read, and
that is all its absence says. What the package promises is the capability model in
[GUIDE-backends.md](GUIDE-backends.md): a correct refusal by name on any device, read or
unread. These readings are evidence for that promise and never a dependency of it. A shader
that would be refused on hardware nobody has read is still refused, by name, before it
draws.

## How a row is taken

Run `npm run device-report` on a machine with its own display and graphics card. It
opens a browser, calls the package's own `probe()`, and prints a paste-able row plus
its JSON. Add the row here in a pull request. It reads three states where a careless reading
reads two: whether WebGPU was **reported** (`navigator.gpu` present), whether an adapter was
**returned** when asked, and whether the device then **survived** a few frames of on-screen
compositing. That third state matters because an adapter that came back and died inside a
second counts as a success in any two-state reading. The adapter architecture is asserted
**not** to be `swiftshader`, since `--enable-unsafe-webgpu` reports a software renderer that a
reading trusting the adapter's own name would record as hardware.

## Readings

The two software-renderer rows are **transcribed from measurements recorded during
development** on the project's Linux machine. They are carried here, not re-measured, and the
field names are `probe()`'s. Both came from a software renderer: that machine's real graphics
card is reachable through WebGL 2 but not, headless, through a WebGPU adapter. This is exactly
why the three-state reading and the SwiftShader assertion exist.

### 2026-09-11, Linux, the same card re-read after a batch of work, and nothing moved

**Why this row exists.** The 2026-08-26 reading below was the only card reading this package
had, and the roadmap carried its corpus line as dated and unverified because no unattended
session can re-take it. This one was taken with a person present on the same machine, after
items 9, 12 and 10 landed, and its purpose is the comparison rather than the numbers: a batch
that changed a refusal on the drawing path should move no pixel on real hardware, and it moved
none.

```
adapter         nvidia / blackwell, 18 adapter features, 0.3 GiB buffer ceiling
WebGL 2         ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 5080/PCIe/SSE2, OpenGL 4.5.0)
gradient        hard jumps 0 against 0, worst 0, 0 of 1,440,000 channels differ
corpus          16 presets drew through WebGPU on the card
selection       a GLSL frame selected WebGL 2 where WebGPU was offered, 480,000 of 480,000 lit
gate            22 of 22 PASS, 0 FAIL, run twice with the same result
```

**Every pixel count is identical to 2026-08-26's**, preset for preset — `core-depth` 245,496,
`core-scene` 91,571, `core-stencil` 188,356, `core-mips` 479,952, and the twelve others. Item
10 moved two draw-form refusals into `graph/validate.ts` and this says no fixture was relying
on either pairing, which is the thing a software renderer could not have said.

**The cross-backend comparison, which is the reading this row was worth taking for.**

```
core-scene       hard jumps 8234 against 8234, worst 1, 11 of 1,440,000 channels differ
core-draw-list   hard jumps 7895 against 7895, worst 1, 36 of 1,440,000 channels differ
core-material    hard jumps 7527 against 7527, worst 1, 18 of 1,440,000 channels differ
```

**Those are 11, 36 and 18 — the numbers `git show 3324f56` recorded when the Y-negation strip
landed, re-measured independently two weeks later.** Roadmap item 8 is about
`gates/translate.mjs` attributing a literal `0 of 1,440,000` to that change when the zero
belongs to an alternative that was tried and rejected. That item said its correction could only
ever come from the record, because "nothing in an unattended run can re-take 11, 36 or 18".
**This row re-takes them**, so the correction now rests on a fresh measurement as well as on the
commit.

**A timing line the gate prints and never gates**, carried here because it is the only place it
has a home: a thousand objects at 800x600, 120 frames after a warm one, p50 1.20 ms, p95 3.20 ms,
p99 198.50 ms — draw plus a full readback. The p99 is a readback stall and not a frame time.

---

### 2026-08-26, Linux, a real graphics card read headed on the machine's own display

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
`survivedCompositing` is **true** here, where the 2026-08-24 reading lost the device after
three frames, so that compositing death belongs to the software renderer and not to the
package. The adapter architecture is `blackwell`, so the SwiftShader assertion passes on a
real name and not on an absent one. And `timestamp-query` is present, which is the feature GPU
timestamps need and which no reading here had confirmed.

**What it does not settle.** The corpus line covers WebGPU only, because `gate:card`'s loop
draws each preset through one backend. The cross-backend comparison is taken separately, over
the scene presets, and it agrees to within one channel.

**Pixel counts differ slightly from the software renderer's.** That is expected, and worth
writing down: `core-depth` 245,496 here against 245,512 headless, `core-scene` 91,571 against
91,579, `core-stencil` 188,356 against 187,489, `core-mips` 479,952 against 479,964. A
hardware compiler folds arithmetic its own way. Nothing in the suite asserts the two are
equal, and after this reading nothing should start to.

### 2026-08-24, Linux, headless WebGPU on the software renderer

```
date            2026-08-24 (transcribed from a development measurement, not re-measured)
backend         webgpu
tier            toy
webgpu          reported, adapter returned
compositing     DID NOT survive on-screen compositing
renderer        software renderer (SwiftShader)
architecture    swiftshader (SWIFTSHADER, a software renderer named as hardware)
features        not recorded in the source reading
limits          not recorded in the source reading
```

An **on-screen** WebGPU canvas the browser composited, at 200×100, **drew 3 frames and then
lost the device with reason `destroyed`**. The same content on a canvas left **out of the
document drew 54 frames a second**. That is why the reading is taken on-screen: an
off-document surface never dies, and it would have recorded this as a success. This reading is
what `survivedCompositing` exists for.

### 2026-08-24, Linux, `--enable-unsafe-webgpu` reports software while WebGL reports the card

```
date            2026-08-24 (transcribed from a development measurement, not re-measured)
backend         webgpu
tier            toy
webgpu          reported, adapter returned
compositing     not recorded in the source reading
renderer        SwiftShader (WebGPU adapter); the real card is reported by WebGL 2 in the same browser
architecture    swiftshader (SWIFTSHADER, a software renderer named as hardware)
features        not recorded in the source reading
limits          maxBufferSize ≈ 1 GiB
```

Requesting the WebGPU adapter with only `--enable-unsafe-webgpu` reports **SwiftShader with
a 1 GiB buffer ceiling**, while WebGL 2 in the same browser reports the **real graphics card**
(its name is not in the source reading). A reading that trusted the adapter's own name would
have recorded this software renderer as hardware. This reading is what the architecture
assertion exists for.

## Wanted

**No mobile device has been read at all**, and one is wanted more than anything else here.
Every row above is a desktop Linux machine. Any reading from hardware this file does not
have is worth a pull request: a phone, a tablet, an integrated card, macOS, Windows. A missing
row means a missing reading and nothing more.
