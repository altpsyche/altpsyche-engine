# Naga against the corpus

**One question, not a comparison:** can WGSL→GLSL carry this corpus at all? This is
item 75's finding, and it is what licenses items 41 and 42 (the build-time and
on-demand translation paths). It is **not** item 40 — which of Naga or Tint is
better is a separate, heavier question that needs a Tint build this machine cannot
produce, and item 40 keeps it.

**Answer: yes.** Every one of the fifteen corpus WGSL presets translates to GLSL.
All thirty-four entry points across them are carried, with no construct refused, at
the profile that can express every stage (GLSL ES 3.10).

## How this was taken

- **Tool:** `naga` (naga-cli **30.0.1**), a **dev-time tool**. `cargo` and `rustc`
  were already on this machine (item 40's lift note established both, and that
  30.0.1 is on crates.io). It is **not** a dependency of this package —
  `dependencies` stays empty, per §17 decision 5 — and it is not a `devDependency`
  either, being a Rust binary rather than an npm one. Install it with:

  ```sh
  cargo install naga-cli --version 30.0.1   # lands in ~/.cargo/bin
  ```

- **Inputs:** the fifteen `.wgsl` presets under `fixtures/source/`, unmodified.
- **Command per entry point** — naga picks the GLSL stage from the output
  extension and the entry point by name; a WGSL file with several entry points is
  translated one stage at a time, which is what GLSL's one-stage-per-file shape
  requires:

  ```sh
  naga --profile es310 --entry-point <name> <in>.wgsl <out>.<vert|frag|comp>
  ```

- **Reproduce** — this prints the table below and exits 0 while every preset still
  translates, 1 if one stops (the row names the construct), 2 if no naga is on
  PATH:

  ```sh
  node gates/naga-corpus.mjs
  ```

  It is deliberately not in `gates/all.mjs` or `package.json`: it needs a dev tool
  a clean CI machine has not got, the same reason `gate:card` is not run unattended.
- **Date:** 2026-08-25.

## The two profiles, and why both are read

- **es310 — the viability profile.** GLSL ES 3.10 can express every stage the
  corpus uses, compute included. This is the column that answers item 75's
  question, and it is all green.
- **es300 — WebGL 2's own profile.** WebGL 2 authors GLSL ES **3.00**, not 3.10.
  The vertex and fragment stages are translated at es300 as well, so the reading
  says what the WebGL 2 target itself will accept — not merely what naga can emit.
  Compute is not asked for at es300 at all: **WebGL 2 has no compute stage**, so a
  compute entry has no es300 form to want.

## The readings

`•` = translated. Each preset's entry points are listed by stage.

| preset | entry points | es310 (viability) | es300 (WebGL 2) |
| --- | --- | --- | --- |
| core-compute | compute:paint | • | — no compute on WebGL 2 |
| core-depth | vertex:away, vertex:toward, fragment:farther, fragment:nearer | • all 4 | • all 4 |
| core-draw-list | vertex:project, fragment:surface | • both | fragment •; **vertex refused: storage buffer** |
| core-geometry | vertex:warp, fragment:shade | • both | • both |
| core-indirect | compute:plan, compute:paint, fragment:shade | • all 3 | compute — (none); **fragment refused: storage texture** |
| core-material | vertex:project, fragment:surface | • both | fragment •; **vertex refused: storage buffer** |
| core-mips | fragment:fragMain | • | • |
| core-multisample | vertex:lean, fragment:shade | • both | • both |
| core-perdraw | vertex:warp, fragment:shade | • both | fragment •; **vertex refused: storage buffer** |
| core-report | vertex:front, vertex:behind, fragment:nearer, fragment:farther | • all 4 | • all 4 |
| core-scene | vertex:project, fragment:surface | • both | • both |
| core-state | compute:step, fragment:shade | • both | compute — (none); **fragment refused: storage texture** |
| core-stencil | vertex:shape, fragment:marking, fragment:filling | • all 3 | • all 3 |
| core-target | vertex:warp, fragment:paint, fragment:grade | • all 3 | • all 3 |
| core-texture | fragment:fragMain | • | • |

**Totals:** 15 presets, 34 entry points, **34 translated at es310, 0 refused.**

## What the es300 refusals are, and what they are not

They are **not** naga failing to carry a WGSL construct — every one of these entry
points translates cleanly at es310. They are the WebGL 2 **target** lacking a
feature the GLSL ES 3.00 version cannot express:

- **`BUFFER_STORAGE | DYNAMIC_ARRAY_SIZE`** on three vertex stages
  (`core-draw-list`, `core-material`, `core-perdraw`): they read a runtime-sized
  storage buffer (an `array<Object>` of per-object model matrices / per-draw
  slices). Shader storage buffers arrived in GLSL ES **3.10**; WebGL 2 has none.
- **`IMAGE_LOAD_STORE`** on two fragment stages (`core-indirect`, `core-state`):
  they sample a storage texture written by a compute pass. Storage-image load/store
  is also ES 3.10; WebGL 2 has none.

Both map exactly onto capabilities the package's own `refusal()` already names —
`storage-buffer`, `storage-texture`, `compute`. A WebGL 2 device reports none of
them, so a frame that requires one is refused **before** translation is ever
reached. So the es300 column is not new bad news for items 41 and 42: it is the
same capability wall, seen from the translator's side. The presets a WebGL 2
consumer can actually author — no storage buffer, no storage texture, no compute —
translate to es300 whole.

## What this result must not be read as saying

Per item 75's own caution, recorded here so the next reader does not take a
viability check for a guarantee:

- **"Naga carries the corpus" is not "Naga carries the scene tier."** The corpus is
  fifteen fullscreen and compute presets. Scene materials have vertex stages,
  per-draw buffer slices and depth state the corpus barely exercises, and the
  presets that do touch them are hand-written rather than producer-emitted. This
  reading licenses items 41 and 42; it closes neither item 44's cross-backend pixel
  question nor item 52's, and it says nothing about `orbit-shadow` translating.
- **This is translation, not execution.** Every reading here is naga producing GLSL
  and validating it — no card compiled or drew any of this GLSL. That the translated
  GLSL draws the same picture is item 44's question and a browser's or a card's to
  answer, not this document's.
- **es310-green is the corpus, at es310.** The WebGL 2 path (items 41/42) emits
  es300, where the storage/compute users are refused for want of the capability, not
  the translation. Whoever builds those paths reads the es300 column, not the es310
  one, for what WebGL 2 will accept.
