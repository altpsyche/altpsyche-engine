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

### 2026-09-12, Linux, a corpus at zero with the picture upside down — a reading that was reverted

**Read this row for what it warns about rather than for its numbers.** The change it measures was
reverted the same day. It gave WGSL its own framebuffer origin on WebGL 2 — the clip-space y
negation kept, the winding inverted, the readback and scissor flips conditioned on the frame — and it
took every gated cross-backend preset to exact agreement:

```
                 before          after
core-scissor     11              0
core-blend        0              0
core-target      77 (worst 2)    0
core-stencil      0              0
core-count        0              0
core-scene       11              0
core-draw-list   36              0
core-material    18              0
core-texture  1,424,706 (w235)   40 at worst 1
core-mips     1,401,861 (w128)   574,095 at worst 15
```

**And it displayed the frame mirrored.** No check in `gate:card` could see that, because every one of
them reads pixels through `readPixels` — the very call the change had taught not to turn a translated
frame over. Reading the same drawn frame off a 2D context instead:

```
                  screen top       screen bottom
before and after  221,173,121      0,0,0          (top matches readPixels' top)
under the change  0,0,0            221,173,121    (bottom matches readPixels' top)
```

**`gate:card` read 33 of 33 with the picture upside down.** Every cross-backend number in this file
is a `readPixels` number, and that is worth knowing before trusting any of them about what a reader
sees.

**The zeros are kept, and what they mean is now narrower than this row first claimed.** It read them
as proof that the residuals this file records three times as 11, 36 and 18 are a real defect rather
than compiler noise. **A second attempt the same day corrected the coordinate for those same presets
and left them at 11, 36 and 18**, so the coordinate is not what they are, and the zero this change
reached was something else about its rasterisation — plausibly pixel-centre alignment. **They are
unexplained: neither exonerated as compiler noise nor convicted as a defect.**

---

### 2026-09-11, Linux, three presets compared across the backends for the first time, and two were wrong

**Why this row exists.** Item 19 made `core-texture`, `core-target` and `core-mips` drawable on
WebGL 2 — each had been skipped for want of a baked vertex, so each was drawn by one backend and
compared with nothing. This is the first cross-backend reading any of them has ever had, and it is
the reason that item existed.

```
core-target    hard jumps 26,856 against 26,855, worst   2,        77 of 1,440,000 differ
core-texture   hard jumps      0 against      0, worst 235, 1,424,706 of 1,440,000 differ
core-mips      hard jumps  7,725 against  7,731, worst 128, 1,401,861 of 1,440,000 differ
```

**The tolerance is 8.** `core-target` agrees and is on the gate's cross-backend list. The other two
are **item 20** and are held off it — a gate expected to be red stops being read.

**The diagnosis, taken in the same session by comparing each pair again with one frame flipped in Y:**

```
                as drawn                         WebGL 2 flipped in Y
core-texture    worst 235, 1,424,706 differ      worst  1,      40 differ
core-mips       worst 128, 1,401,861 differ      worst 15, 574,095 differ
```

**`core-texture` was an exact vertical mirror** — flipped it reads worst 1, 40 of 1,440,000, the same
one-channel residual every agreeing preset has. `core-mips` was a mirror with a second defect under
it.

**A texture-upload flip was tried the same day and reverted**, and both readings are kept because
the pair is what shows it was the wrong fix:

```
                with the upload flipped            reverted (the tree as it stands)
core-mips       as drawn worst  15,   574,191      as drawn worst 128, 1,401,861
core-texture    as drawn worst 231, 1,417,121      as drawn worst 235, 1,424,706
```

**`core-mips` swapped exactly under the flip and `core-texture` did not**, and that asymmetry is the
evidence: flipping the stored texture cancels a mirrored *coordinate* for a straight lookup, and
`core-texture`'s second lookup is offset by the result of its first, so two flips do not compose.
The cause is `@builtin(position)` — WGSL's origin is top-left and GLSL's `gl_FragCoord` is
bottom-left, and naga emits one as the other. Item 20 carries it. **Every gated cross-backend figure
was unchanged throughout**, `core-target` still 77 at worst 2.

**The gate's timing line across four runs of this machine on one day**: p50 1.10–1.30 ms, p95
1.60–4.00 ms, p99 115.00–196.10 ms, a thousand objects at 800x600, draw plus a full readback. That
spread on one machine in one day is why it is reported and never gated.

---

### 2026-09-11, Linux, the scissor's first reading on a card, taken after item 17 landed

**Why this row exists.** Item 16 built a scissor and could not finish: its cross-backend agreement
was asserted only under the software renderer, and its own `Done when` said the card reading was
left for a person. This run takes it. The row below is the whole gate, so the comparison against the
earlier reading the same day is also here.

```
adapter         nvidia / blackwell, 18 adapter features, 0.3 GiB buffer ceiling
WebGL 2         ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 5080/PCIe/SSE2, OpenGL 4.5.0)
gradient        hard jumps 0 against 0, worst 0, 0 of 1,440,000 channels differ
corpus          19 presets drew through WebGPU on the card
selection       a GLSL frame selected WebGL 2 where WebGPU was offered, 480,000 of 480,000 lit
gate            29 of 29 PASS, 0 FAIL, then 30 of 30 with the live-readback check added
```

**The reading item 16 was waiting for.**

```
core-scissor     hard jumps 4254 against 4254, worst 1, 11 of 1,440,000 channels differ
```

**Under the software renderer the same preset read 9 of 1,440,000, worst 1, against a tolerance of
8.** On the card it is 11, worst 1 — the same order, a different count, and both far inside the
tolerance. That is what a scissor should look like: the rectangle is the same rectangle on both
backends and the disagreement is two hardware compilers folding the same arithmetic differently,
which is the identical story `core-scene`, `core-draw-list` and `core-material` already tell.
**`core-scissor` on the card is 480,000 of 480,000 pixels lit**, the frame's own area, the scissored
inset being a colour rather than a hole.

**The other four cross-backend presets are unchanged from the earlier reading**, and three of them
are the third independent measurement of the Y-negation numbers:

```
core-blend       hard jumps 4006 against 4006, worst 0, 0 of 1,440,000 channels differ
core-stencil     hard jumps 2712 against 2712, worst 0, 0 of 1,440,000 channels differ
core-count       hard jumps 2102 against 2102, worst 0, 0 of 1,440,000 channels differ
core-scene       hard jumps 8234 against 8234, worst 1, 11 of 1,440,000 channels differ
core-draw-list   hard jumps 7895 against 7895, worst 1, 36 of 1,440,000 channels differ
core-material    hard jumps 7527 against 7527, worst 1, 18 of 1,440,000 channels differ
```

**Every pixel count is again identical to 2026-08-26's**, preset for preset — `core-depth` 245,496,
`core-scene` 91,571, `core-stencil` 188,356, `core-mips` 479,952. Items 14, 16 and 17 landed between
that reading and this one, and they moved no pixel on real hardware. Item 14 changed what `dispose`
does to a canvas and item 17 added a readback; neither should show here, and neither does.

**The live path was read back on the card in the same session**, through a check added to
`gates/card.mjs` for exactly this, which took the gate to 30 of 30:

```
live readback    480,000 of 480,000 pixels are the drawn colour, worst channel off by 0
                 loop still running after the read, null after dispose
same canvas 2D   alpha 0 at the centre  (reported, never gated)
```

**The second line is the consumer's 2026-09-09 finding re-taken on this machine.** They measured
`(0,0,0,0)` from `drawImage` of a drawn canvas and the roadmap recorded that as a reading no session
here could take. This one takes it: the canvas a WebGPU surface drew reads alpha 0 through a 2D
context while `Surface.read()` on the same surface gives back every pixel exactly. That is the whole
argument for the method, measured rather than asserted.

**The timing line the gate prints and never gates**: a thousand objects at 800x600, 120 frames after
a warm one, **p50 1.30 ms, p95 1.80 ms, p99 196.10 ms** — draw plus a full readback, against
1.20 / 3.20 / 198.50 earlier the same day, and 1.10 / 3.90 / 118.10 on the run that added the check.
The p99 is a readback stall and not a frame time, and the spread across three runs of the same
machine on one day is why this line is reported and never gated. **None of these three is a reading
of `Surface.read()`**: they are the gate's own draw-and-read loop over a scene.

---

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
