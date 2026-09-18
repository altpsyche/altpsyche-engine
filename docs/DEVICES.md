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

**A row is pasted from the gate's own stdout and never retyped from a summary of it.** That applies
to `npm run device-report` and to `npm run gate:card` alike, and it is written down because a row
here was once written from prose about a run rather than from the run: it lost two words off a
renderer string and counted twenty-two presets where the gate draws twenty. Neither error is visible
to a reader who does not have the machine, which is what makes the rule worth a sentence — a
transcription slip and a real change read identically from this side of the handover.

## Readings

The two software-renderer rows are **transcribed from measurements recorded during
development** on the project's Linux machine. They are carried here, not re-measured, and the
field names are `probe()`'s. Both came from a software renderer: that machine's real graphics
card is reachable through WebGL 2 but not, headless, through a WebGPU adapter. This is exactly
why the three-state reading and the SwiftShader assertion exist.

### 2026-09-19, Linux, the released `0.6.1` tree is read on a card, and not one number moved

**This is the reading `0.6.1` shipped without.** That release's own message said so plainly:
`gate:card` was not re-taken, because the arm its refusal exists for is one a real card does not
have, and every browser gate in the run was a software renderer's. The run below was taken
afterwards, by hand, on a machine with a card and a display, against the released tree `84889ba`
with `node_modules` as installed. **It is carried here, not re-measured**: the session writing this
row has no display, and every headless launch it could make reaches the software renderer. The run
was taken twice and read identically both times.

```
adapter     nvidia / blackwell, 18 adapter features, 0.3 GiB buffer ceiling
WebGL 2     ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 5080/PCIe/SSE2, OpenGL 4.5.0)
display     X11 on :0, which is what the gate's own flags need
whole gate  37 PASS, 0 FAIL, 0 SKIP
```

**Every figure below is pasted from the second run's stdout**, which is how this row is taken and
why the section above now says so. The first version of this row was written from a prose summary of
the same run and carried two errors that the stdout does not: a renderer string two words short, and
a preset count of twenty-two where the gate draws twenty.

**37 against the 37 of 2026-09-14, and the figures under it are the same figures.** That is the
whole point of the row rather than a disappointment in it: `0.6.1` added no fixture, so the gate did
not grow, and it changed one refusal's wording on a path a card never takes, so the pictures should
not have moved. They did not. **A release can now say that its own tree was drawn on a card**, which
is a thing `0.6.1` could not say on the day it was cut.

**Both 37s are `gate:card` on this same adapter, so this is a card read against a card and not a
card read against a software renderer.** The row says nothing moved, and what it means is that one
driver drew the same corpus the same way at two trees. The comparison that *would* say something
about the ground under the reading — a real driver refusing limits, formats and alignments
SwiftShader accepts, which is `gates/card.mjs`'s own header saying a corpus that draws headless is
not a corpus that draws — is against `gate:browser`, and it is not made here. What that header buys
is already bought by the gate passing at all; it is not bought again by two passes agreeing.

**Eleven presets compared across the two backends**, of 1,440,000 channels each:

```
core-texture            hard jumps 0 v 0          worst 1   40 differ
core-scissor            hard jumps 4254 v 4254    worst 0    0 differ
core-blend              hard jumps 4006 v 4006    worst 0    0 differ
core-target             hard jumps 26856 v 26856  worst 0    0 differ
core-mips               hard jumps 7731 v 7731    worst 0    0 differ
core-multisample-depth  hard jumps 12447 v 12447  worst 0    0 differ
core-stencil            hard jumps 2712 v 2712    worst 0    0 differ
core-count              hard jumps 2102 v 2102    worst 0    0 differ
core-scene              hard jumps 8234 v 8234    worst 0    0 differ
core-draw-list          hard jumps 7895 v 7895    worst 0    0 differ
core-material           hard jumps 7527 v 7527    worst 0    0 differ
```

Ten of the eleven agree channel for channel at worst 0. `core-texture`'s 40 of 1,440,000 at worst 1
is the figure this file has carried since 2026-09-11 and is not new here. The gradient check reads
hard jumps 0 against 0, worst 0, 0 of 1,440,000 differing, and the widened-exemption list is empty.

**All twenty presets the gate draws, in gate order, pixels lit of 480,000, drawing on the card
alone:**

```
core-compute 480,000      core-texture 480,000      core-state 480,000
core-geometry 129,600     core-perdraw 115,267      core-perdraw-uniform 112,896
core-depth 245,496        core-scissor 480,000      core-blend 158,400
core-target 248,832       core-mips 479,958         core-multisample 87,477
core-multisample-depth 153,064                      core-indirect 480,000
core-report 270,400       core-stencil 188,356      core-count 480,000
core-scene 91,571         core-draw-list 78,215     core-material 84,933
```

**The four checks that are not a pixel count**, each as it was reported:

```
the canvas shows what readPixels reads   0 of 1,920,000 differ, worst 0; turned over,
                                         1,245,602 differ, so the row-direction control holds
                                         on screen  top 221,173,121,255  bottom 119,142,178,255
                                         readPixels top 221,173,121,255  bottom 119,142,178,255
a figure whose geometry moves redraws    one program for both frames: true;
                                         86,400 left / 0 right, then 0 / 86,400
a live surface reads itself back         480,000 of 480,000 are the drawn colour, worst
                                         channel 0, loop still running, null after dispose
a GLSL frame selects WebGL 2             webgpu offered: true, chose webgl2, 480,000 lit
```

The live-surface line is the one `0.6.1`'s changelog entry leans on when it says that a page drawing
on a real card never meets the new refusal. It has read that way since 2026-09-12; this is the first
time it has read that way on the tree that carries the refusal.

**Reported and never gated**, carried here because it is a card's number and no unattended run can
take it. **Both runs are given, because these are the only figures in this row that moved between
them:**

```
presentation step, 800x600, 200 frames x 5 rounds     run 1     run 2
  straight to the canvas                              0.0019    0.0022  ms a frame
  offscreen then copied                               0.0127    0.0124
  offscreen then copied turned over                   0.0153    0.0142
  so the copy costs                                   0.0108    0.0102
  and the flip adds                                   0.0026    0.0018

a thousand objects, 800x600, 120 frames after a warm one
  p50                                                 1.20      1.20    ms
  p95                                                 3.00      1.70
  p99                                                12.40      3.80

a live surface through a 2D context   alpha 0 at the centre, which is why Surface.read() exists
```

**Two runs, minutes apart, same tree, same card: the p99 moved by better than three times and the
p95 by nearly two, while every gated figure above is identical and the p50 did not move at all.**
That is the reading, and it is a reading about the numbers rather than about the machine. **p50 is
the only figure here a single run establishes.** The p95 and the p99 are one sample each per run and
this row does not average them, pick the friendlier one, or call the difference a warm cache — the
likeliest story is a first run paying for a cold compositor or shader cache, and two samples cannot
tell that from noise.

The p99 is a readback stall and not a frame time, which is the same caveat the 2026-09-11 row's
198.50 ms carries. **That 198.50 against either of these is not a trend**: different day, different
tree, and a quantity that moves three times between two runs of the same gate is not one a
month-apart comparison can say anything about.

**What this row cannot say.** One machine, one driver, one day, and a reading nobody else can
reproduce without that machine. It says nothing about AMD, Intel or Apple drivers, nothing about
mobile, and nothing about the refusal `0.6.1` added — the browser this ran in never spends its
device, which is exactly why the release shipped without this reading in the first place. And it
closes `0.6.1` only. It does not stop the next version being cut from a tree no card has touched,
which is a process question and is answered in [CONTRIBUTING.md](../CONTRIBUTING.md) rather than
here.

---

### 2026-09-14, Linux, the two backends agree to the channel on a depth kept at the colour's sample count

**Item 21's last open line, taken with Siva at the machine.** The item built a multisampled depth
into the WebGL 2 backend and added `core-multisample-depth` to the cross-backend list, and until this
run the two backends had never been compared on it anywhere but a software renderer. **They agree
exactly.**

```
core-multisample-depth  hard jumps 12447 against 12447, worst 0, 0 of 1,440,000 channels differ
```

Zero channels differing at worst zero, against a tolerance of 8 — the reading every other compared
preset gets except `core-texture`, which stays at 40 at worst 1. The hard-jump counts match as well,
which is the separate reading: it counts how many pixels sit on a step rather than a gradient, so two
pictures agreeing on the channels but drawing one edge as a staircase would differ here. They are the
same number, so the crossing edge the depth test creates is averaged on both backends rather than on
one.

**The whole gate, on `nvidia / blackwell`: 37 PASS and 0 FAIL**, the adapter reporting 18 features
and a 0.3 GiB buffer ceiling, WebGL 2 in the same browser reporting `ANGLE (NVIDIA Corporation,
NVIDIA GeForce RTX 5080/PCIe/SSE2, OpenGL 4.5.0)`. **That 37 against the 35 of 2026-09-12 is the gate
growing and not a reading improving**: item 21's preset adds one corpus draw and one cross-backend
comparison. Eleven presets are compared across the two backends now and every one reads 0 of
1,440,000 at worst 0, `core-texture` excepted at 40 and worst 1. The widened-exemption list is empty.

```
core-multisample-depth on the card   153,064 of 480,000 pixels lit
```

Two pixels short of the 153,066 SwiftShader lit under `gates/corpus.mjs`, which is two backends'
worth of rasteriser disagreeing about two edge pixels and not a difference between the two backends
here — those differ by zero.

**What this row closes.** Item 21 built a capability on the strength of a raw-WebGL 2 reading with
none of this package in the path, and the honest gap was that nothing had compared what this package
then drew with it. This is that comparison, and the item closes on it.

**What this row cannot say.** One machine, one driver, one day, and one preset for this capability.
It says the two backends agree on a four-sample depth beside a four-sample colour at 800x600 on a
5080; it says nothing about another count, another format — `DEPTH24_STENCIL8` is built by the same
line and drawn by no preset — or another card.

---

### 2026-09-14, Linux, three devices say a multisampled depth renderbuffer completes, and tests

**Item 21's step 2, which no unattended session can take.** Taken by Siva on this machine with a
person at it, in raw WebGL 2 with no part of this package in the path — both of the refusals the item
is about fire before a GL call is made, so nothing the package does could be measured through. **It
is carried here, not re-measured**: this session has no display and every headless launch it could
make reaches the software renderer, which is `CLAUDE.md`'s table and `gates/card.mjs`'s own header.
GL errors were drained before and after every case.

**Three devices, one machine**, which is a wider reading than any row above it and still one machine:

```
nvidia          ANGLE (NVIDIA, Vulkan 1.4.341), via --use-angle=vulkan
amd             ANGLE (AMD, Vulkan 1.4.354, RADV RAPHAEL_MENDOCINO), via the radv ICD
swiftshader     ANGLE (Google, Vulkan 1.3.0, Subzero), playwright's default
```

**What the devices offer.** `MAX_SAMPLES` reads 8 on both cards and 4 on SwiftShader, and
`getInternalformatParameter(RENDERBUFFER, <format>, SAMPLES)` answers per format:

```
                      nvidia    amd       swiftshader
RGBA8                 8,4,2     8,4,2     4
DEPTH_COMPONENT24     8,4,2     8,4,2     4
STENCIL_INDEX8        8,4,2     8,4,2     4
DEPTH24_STENCIL8      8,4,2     8,4,2     4
```

**All three formats `depthStencilOf` maps are offered at exactly the counts `RGBA8` is offered at, on
all three devices.** That is an observation and not a proof: three devices on one machine. A backend
reading one list per device rather than one per format would be consistent with this row and is not
established by it.

**What a framebuffer does with them**, `checkFramebufferStatus`:

```
                                   nvidia      amd         swiftshader
4x colour + 4x DEPTH_COMPONENT24   COMPLETE    COMPLETE    COMPLETE
4x colour + 4x DEPTH24_STENCIL8    COMPLETE    COMPLETE    COMPLETE
8x colour + 8x DEPTH_COMPONENT24   COMPLETE    COMPLETE    INCOMPLETE_ATTACHMENT
4x colour + 1x DEPTH_COMPONENT24   INCOMPLETE_MULTISAMPLE, all three
1x colour + 1x DEPTH_COMPONENT24   COMPLETE, all three
```

**SwiftShader's `MAX_SAMPLES` of 4 means it**: the 8x row also raises a GL error on allocation there.
A backend must read the count rather than assume the 8 both cards offer. The mismatched row is
`FRAMEBUFFER_INCOMPLETE_MULTISAMPLE` on all three, which is the sample-agreement rule item 21's step 1
moves into `graph/validate.ts`, seen from the device side.

**And the depth test runs rather than merely attaching.** On the 4x colour + 4x `DEPTH_COMPONENT24`
framebuffer: two full-screen quads, red at z -0.5 and green at z 0.5, `LEQUAL`, depth writes on,
blit-resolved, centre pixel read back.

```
                       nvidia         amd            swiftshader
drawn far then near    255,0,0,255    255,0,0,255    255,0,0,255
drawn near then far    255,0,0,255    255,0,0,255    255,0,0,255
```

Near wins in both orders on every device, no GL error. So the attachment tests and writes, which is
the half of the question a `COMPLETE` status does not answer.

**The WebGPU half has no reading and will not get one on this machine.** `navigator.gpu` is absent
from playwright's Chromium headless on software, headless on the card, and headed on `DISPLAY :0`,
and from `/usr/bin/chromium` headless and headed — with `--enable-unsafe-webgpu`,
`--enable-features=Vulkan`, `VulkanFromANGLE`, `WebGPU`, `--ignore-gpu-blocklist` and `--enable-gpu`
in combination. **It is absent from the build rather than blocked by a flag**, so that this package's
WebGPU backend draws a multisampled depth attachment stays read off `gpu/webgpu.ts` building every
texture through one format-agnostic path, and off the WebGPU specification, rather than off a device.
Another machine or another browser build is what would answer it.

**One flag worth knowing, and item 21's step 4 may want it.** Playwright's Chromium defaults to
SwiftShader here. `--use-angle=vulkan --enable-features=Vulkan --ignore-gpu-blocklist --enable-gpu`
puts it on the NVIDIA card, and the radeon ICD through `VK_DRIVER_FILES` puts it on the AMD one. The
four browser gates are a software renderer's today whoever runs them.

**What this row cannot say.** Three devices on one machine on one day, all three reached through
ANGLE over Vulkan — so it is three drivers under one translation layer rather than three independent
WebGL 2 implementations, and a device that reaches WebGL 2 by another road is unread. It says nothing
about WebGPU, nothing about a stencil-only multisample attachment beyond the counts
`STENCIL_INDEX8` reports, and nothing about what this package does with any of it: no part of
`@altpsyche/engine` was in the path.

---

### 2026-09-12, Linux, `probe()` reads the same card either side of taking its trial canvases off the page

**Item 15's step 3, which no gate can take.** Step 1 made `probe()` remove the canvases it creates
while trialling a backend, and the confirmation it owed was that the answers did not move. No browser
gate calls `probe()` — `gates/device-report.mjs` is the only caller and it is not a gate, asserting
nothing — so this is a reading with a person at the machine, which is what the step said it would
need.

**Taken either side of `774b9ae` by checking out that commit's parent version of `host/probe.ts`
alone**, the rest of the tree unchanged, so the only difference between the two runs is the removal
itself. **The two readings are byte-for-byte identical**, compared over the whole JSON and not only
the printed row: 71 lines each, `diff` silent.

```
date            2026-09-12
backend         webgpu
tier            toy
webgpu          reported, adapter returned
compositing     survived a few on-screen frames
renderer        nvidia
architecture    blackwell (not swiftshader)
features        bgra8unorm-storage, clip-distances, core-features-and-limits, depth-clip-control,
                depth32float-stencil8, dual-source-blending, float32-blendable, float32-filterable,
                indirect-first-instance, primitive-index, rg11b10ufloat-renderable, subgroups,
                texture-component-swizzle, texture-compression-bc, texture-compression-bc-sliced-3d,
                texture-formats-tier1, texture-formats-tier2, timestamp-query
limits          36 reported
```

**The three states are all three**, which is what makes this a reading and not a boolean: WebGPU
reported, an adapter returned, and the device survived on-screen compositing. The architecture
asserts not-`swiftshader`, so this is the card and not the software renderer every headless launch on
this machine reaches.

**What this row cannot say.** One machine, one day, and one backend's trial. `probe()` trials both
and the row records the one it selected; that the WebGL 2 trial's answer is also unmoved rests on the
same JSON being identical, which covers every field `probe()` returns, rather than on a second
reading taken through a forced WebGL 2 path. And an identical reading either side is evidence the
removal changed no answer — it is not evidence that a page with many `probe()` calls leaks nothing,
which is what `tests/probe-document.test.ts` counts and which needs no card.

---

### 2026-09-12, Linux, `core-mips` joins the zeros, and what was read as a ladder defect was a sampler default

**One line.** `gpu/webgpu.ts` never set `mipmapFilter`, which WebGPU defaults to `nearest`, so that
backend snapped between levels where the WebGL 2 backend mixed them — `LINEAR_MIPMAP_LINEAR` being
what a laddered smooth sampler gets there. `core-mips` reads a fractional level that climbs across
the frame, so one backend drew it banded and the other smooth.

```
core-mips   574,095 of 1,440,000 at worst 15  ->  0 of 1,440,000 at worst 0
```

**The reading it was written on was wrong, and it had stood for a day.** This file and
`docs/ROADMAP.md` both said the disagreement was that WebGL 2 calls `generateMipmap` where the WebGPU
backend draws the steps by hand. That is true and is not why they differed: both are 2x2 box averages
of the level above. Only the read between levels differed.

Every other preset is unchanged at 0, and `core-mips`'s own lit-pixel count moved from 479,952 to
479,958 — the picture itself is slightly different, which is the banding going away.

**What this row cannot say.** One card, and the corpus has exactly one laddered preset. "A texture
with one level is unaffected" is an argument from the API plus seven presets reading zero, not a
measurement of a second ladder.

---

### 2026-09-12, Linux, the vertex flip lands and the whole gated corpus reads zero, with the picture the right way up

**What landed.** Item 20's step 2d, on top of the presentation step in the row below: the build-time
translation keeps naga's clip-space y negation instead of stripping it, the backend inverts the
winding for such a frame, the scissor flip is skipped for it, the readback does not turn it over, and
the blit onto the canvas does. Two hand-authored vertex stages that stand in for translator output
got the same negation.

**Every gated cross-backend preset is exactly zero**, worst channel 0, on nvidia / blackwell:

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
```

**So 11, 36 and 18 were the coordinate after all, and three earlier readings of this file were
wrong about them.** They were recorded as "two hardware compilers folding the same arithmetic
apart", reproduced exactly three times on this card, and read as a session having found nothing
wrong. The entry below narrowed that to "unexplained: neither exonerated nor convicted", because
correcting only the fragment coordinate left all three where they were. The full fix takes them to
zero. **A number reproducible to the channel, three times, on one machine, can still be a defect** —
which is the reading this row is worth keeping for.

**And the picture is the right way up, which is the thing the last attempt got wrong.**

```
                      the canvas against readPixels    screen top     screen bottom
before step 2d        0 of 1,920,000, worst 0          221,173,121    119,142,178
after step 2d         0 of 1,920,000, worst 0          221,173,121    119,142,178
```

The first attempt at this change read 33 of 33 with the frame displayed upside down, because every
check in `gate:card` is a `readPixels` check. That reading gates now — step 2c made it able to — and
it is unchanged through the flip. This is what the guard was put in for and it is the whole reason
the two steps went in this order.

**The two presets still held off the gated list, and they have swapped which column is right:**

```
              as drawn                      WebGL 2 flipped in Y
core-texture  40 of 1,440,000, worst 1      1,424,706, worst 235
core-mips     574,095, worst 15             1,401,861, worst 128
```

`core-texture` is inside the tolerance of 8 and is now only waiting to be moved onto the list. The
`core-mips` residual is the mip ladder and nothing to do with the origin: WebGL 2 calls
`generateMipmap` where the WebGPU backend draws the steps by hand.

**What this row cannot say.** One machine and one driver. The winding inversion is exercised on the
card by `core-count` alone — it cuts a stencil hole by cancelling one square against another by
winding, so it would break loudly — and by unit tests otherwise. **No hand-authored GLSL frame is in
the cross-backend corpus**, so the branch that a published `glslFrame` takes is covered by the node
suite and by nothing a card has drawn.

---

### 2026-09-12, Linux, the WebGL 2 backend takes a presentation step, and the canvas reading gates at last

**What landed.** Item 20's step 2c: the WebGL 2 backend renders every frame into a colour target it
owns and blits that onto the canvas, rather than a pass with no colour target drawing the default
framebuffer directly. Nothing is turned over yet — the y flip is step 2d — so this row is the cost
and the blast radius of the step alone.

**Every gated cross-backend preset is where it was, to the channel:**

```
                 before          after
core-scissor     11              11
core-blend        0               0
core-target      77 (worst 2)    77 (worst 2)
core-stencil      0               0
core-count        0               0
core-scene       11              11
core-draw-list   36              36
core-material    18              18
```

**The reading this step was not taken for, and it is the interesting one.** The canvas against
`readPixels` — the only check in this repository that sees what a reader sees, read off a 2D context
rather than through `readPixels` — **went from 1,213,200 differing channels of 1,920,000 to 0, worst
channel 0.**

```
                      the canvas against readPixels      screen top     screen bottom
before this step      1,213,200 of 1,920,000, worst 255  221,173,121    0,0,0
after it                      0 of 1,920,000, worst 0    221,173,121    119,142,178
```

The frame used to reach the screen by a pass drawing the default framebuffer, whose contents a
compositor may treat as it likes and which this backend asks no `preserveDrawingBuffer` of; it now
reaches the screen as a blit of a target this backend owns. That is why the bottom of the canvas read
black while `readPixels` read content, which the entry above could only record as unisolated. **The
reading gates now**, and it is the guard step 2d — the vertex flip, the change that put the picture
upside down once already — will be taken against.

**One defect the step caused and the reading caught.** A `blitFramebuffer` is clipped by the scissor
test, and `core-scissor`'s last pass leaves a rectangle enabled, so the first build of this step took
that preset from 11 differing channels to **1,213,207**. Nothing before this step could notice:
the frame was already on the canvas by the time the pass ended. The backend now disables the scissor
test before it presents, which also ends a frame in the state the next frame should start from.

**What the step costs, re-measured on the card it was budgeted on:**

```
straight to the canvas, which is what the backend used to do   0.0023 ms a frame
offscreen, then copied — what the backend does now             0.0122
offscreen, then copied turned over — what step 2d will do      0.0146
```

**0.0099 ms a frame**, against this gate's own p50 of 1.20 ms for a thousand objects: about 0.8% of a
frame. Step 2d's flip adds 0.0024 more.

**What this row cannot say.** It is one card, an RTX 5080, at 800x600, and the cost is a fullscreen
copy so it scales with pixels rather than with the scene — a 3840x2160 frame is about 17 times the
area, which is arithmetic and not a reading. The memory a second full-size colour target costs is
measured nowhere here. And `core-texture` and `core-mips` are still off the gated list at
1,424,706 and 1,401,861: this step is the prerequisite for their fix and not the fix.

---

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
