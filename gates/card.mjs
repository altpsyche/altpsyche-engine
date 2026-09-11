// The library on the real graphics card, rather than on the software one.
//
//   npm run gate:card
//
// This gate cannot run in continuous integration and that is not a fault to fix.
// Every headless launch reaches the software renderer whatever the flags say, so
// the card needs a window, and a runner has no display. What selects it is
// `--enable-features=Vulkan` with `--ozone-platform=x11`: without the second the
// window renders as a flickering transparent tile on this driver, and
// `--use-angle=vulkan` and its relatives are not used because they move the whole
// browser onto Vulkan and the window becomes that tile again. The page is served
// over HTTP rather than written in, since `navigator.gpu` is absent on an opaque
// origin however the browser was launched.
//
// `--enable-unsafe-webgpu` on its own reports the software renderer with a 1 GiB
// buffer ceiling while WebGL in the same browser reports the real card, which is
// why this asserts the adapter is not `swiftshader` rather than trusting that
// something drew.
//
// What only a card can say is whether a real driver accepts what this library
// asks of it. The software renderer accepts limits, formats and alignments a
// driver refuses, so a corpus that draws headless is not a corpus that draws. The
// two backends are also held to one picture written in both languages, which is
// the control: it proves the readback and the row direction before any fixture is
// judged, since GLSL counts pixel rows from the bottom and WGSL from the top.
//
// What is not here is a channel-for-channel comparison of a shader's two targets,
// because every fixture this package owns is written in WGSL and has no second
// target to compare. That comparison belongs to whoever writes a shader in a
// language a compiler emits from.
import http from 'node:http';
import { rmSync } from 'node:fs';
import { chromium } from 'playwright';
import { CARD_ARGS, CHROME, bundleForPage, loadCorpus } from './lib.mjs';
import { WIDENED, checkWidened, printWidened } from './widened.mjs';

const W = Number(process.env.W ?? 800);
const H = Number(process.env.H ?? 600);
const PORT = Number(process.env.PORT ?? 3163);

// The tolerance a channel is allowed to differ by across the two backends. A
// hardware compiler folds arithmetic its own way on each of them, so two pictures
// of one gradient are close rather than equal.
const TOLERANCE = 8;

const corpus = await loadCorpus();

const { bundle, staging } = bundleForPage({
  'gpu/webgpu': ['createWebGPUBackend'],
  // The second backend, so the scene tier can be drawn through both on one card and
  // compared (item 106). Until then this gate held one backend and compared its
  // gradient against a hand-built control.
  'gpu/webgl2': ['createWebGL2Backend'],
  'gpu/webgpu-device': ['requestWebGPUDevice'],
  // Rebuilding a frame inside the page, and turning a WGSL frame into the GLSL one
  // WebGL 2 draws — the same two calls `gates/corpus.mjs` uses for its WebGL 2 arm.
  'toy/frame': ['frameOf', 'glslFrameOf', 'glslFrame', 'wgslFrame'],
  // Decision 6's join, on a machine that actually has WebGPU (item 62).
  'gpu/select': ['selectBackend'],
  // `missing` replaced the program's own `unreached` at item 69; a source reading
  // rather than a question put to the built pipeline.
  'index.ts': ['missing'],
  // The live path, so a real driver reads a frame back through the interface a
  // page actually holds (item 17). Everything else in this gate reaches a backend
  // directly, which is the one thing `Surface.read()` exists not to make a caller
  // do.
  'host/surface': ['createSurface'],
  // The program cache's key and the renderer over it, so the moving-geometry check
  // can assert the two frames share a program *and* draw different pictures
  // (item 18, step 6). Either half alone proves nothing: one key and one picture
  // is a cache that is not refilling, two keys and two pictures is the recompile
  // the item removed.
  'pipeline/cache': ['frameKey'],
  'gpu/renderer': ['createFrameRenderer', 'submit'],

  // The cross-backend comparison, bundled so the gate calls exactly the function
  // the node suite tests rather than a restatement of it (item 44).
  'gates/compare.mjs': ['compareFrames'],
});

const server = http.createServer((_request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html' });
  response.end('<!doctype html><html><body style="margin:0"></body></html>');
});
await new Promise((ready) => server.listen(PORT, '127.0.0.1', () => ready(undefined)));

const browser = await chromium.launch({ executablePath: CHROME, headless: false, args: CARD_ARGS });
const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
await page.goto(`http://127.0.0.1:${PORT}/`);
await page.addScriptTag({ path: bundle });

let failures = 0;
/** @param {boolean} ok @param {string} line */
const say = (ok, line) => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${line}`);
};

const card = await page.evaluate(async () => {
  const adapter = await navigator.gpu?.requestAdapter();
  if (!adapter) return { error: 'no WebGPU adapter on a headed browser with --enable-features=Vulkan' };
  const device = await adapter.requestDevice();
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2');
  const named = gl?.getExtension('WEBGL_debug_renderer_info');
  return {
    vendor: adapter.info?.vendor ?? 'unknown',
    architecture: adapter.info?.architecture ?? 'unknown',
    features: adapter.features.size,
    maxBufferSize: device.limits.maxBufferSize,
    webgl: named ? /** @type {WebGL2RenderingContext} */ (gl).getParameter(named.UNMASKED_RENDERER_WEBGL) : 'not reported',
  };
});

if (card.error) {
  console.error(card.error);
await browser.close();
  server.close();
  rmSync(staging, { recursive: true, force: true });
  process.exit(1);
}

say(card.architecture !== 'swiftshader', `the adapter is the card  ${card.vendor} / ${card.architecture}`);
console.log(
  `     ${card.features} adapter features, ${(/** @type {number} */ (card.maxBufferSize) / 1024 ** 3).toFixed(1)} GiB buffer ceiling\n` +
    `     WebGL 2 in the same browser reports ${card.webgl}`
);

// One gradient, written once for each backend, computed from the pixel position:
// the smallest picture that still proves the readback and the row direction.
const CONTROL = {
  wgsl: '@fragment fn fragMain(@builtin(position) p: vec4f) -> @location(0) vec4f { let uv = p.xy / vec2f(800.0, 600.0); return vec4f(uv, 0.5, 1.0); }',
  fragment:
    '#version 300 es\nprecision highp float;out vec4 o;void main(){vec2 uv=vec2(gl_FragCoord.x,600.0-gl_FragCoord.y)/vec2(800.0,600.0);o=vec4(uv,0.5,1.0);}',
  vertex: '#version 300 es\nin vec2 position;void main(){gl_Position=vec4(position,0.0,1.0);}',
};

const control = await page.evaluate(
  async ({ sources, W, H }) => {
    const adapter = /** @type {GPUAdapter} */ (await navigator.gpu.requestAdapter());
    const device = await adapter.requestDevice();
    const format = 'rgba8unorm';
    const vs = device.createShaderModule({
      code: '@vertex fn main(@builtin(vertex_index) i:u32)->@builtin(position) vec4f{var c=array(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));return vec4f(c[i],0,1);}',
    });
    const fs = device.createShaderModule({ code: sources.wgsl });
    const compiled = (await fs.getCompilationInfo()).messages.filter((message) => message.type === 'error');
    if (compiled.length) return { error: compiled.map((message) => message.message).join(' | ') };

    const pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: vs, entryPoint: 'main' },
      fragment: { module: fs, entryPoint: 'fragMain', targets: [{ format }] },
      primitive: { topology: 'triangle-list' },
    });
    const texture = device.createTexture({
      size: [W, H],
      format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        { view: texture.createView(), clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' },
      ],
    });
    pass.setPipeline(pipeline);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);

    const stride = Math.ceil((W * 4) / 256) * 256;
    const readback = device.createBuffer({
      size: stride * H,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const copy = device.createCommandEncoder();
    copy.copyTextureToBuffer({ texture }, { buffer: readback, bytesPerRow: stride }, [W, H]);
    device.queue.submit([copy.finish()]);
    await readback.mapAsync(GPUMapMode.READ);
    const padded = new Uint8Array(readback.getMappedRange());
    const fromGPU = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++) fromGPU.set(padded.subarray(y * stride, y * stride + W * 4), y * W * 4);
    readback.unmap();

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const gl = /** @type {WebGL2RenderingContext} */ (canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false }));
    /** @param {number} kind @param {string} source */
    const build = (kind, source) => {
      const shader = /** @type {WebGLShader} */ (gl.createShader(kind));
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(/** @type {string} */ (gl.getShaderInfoLog(shader)));
      return shader;
    };
    const program = /** @type {WebGLProgram} */ (gl.createProgram());
    try {
      gl.attachShader(program, build(gl.VERTEX_SHADER, sources.vertex));
      gl.attachShader(program, build(gl.FRAGMENT_SHADER, sources.fragment));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(/** @type {string} */ (gl.getProgramInfoLog(program)));
    } catch (e) {
      return { error: String(/** @type {any} */ (e).message || e) };
    }
    gl.useProgram(program);
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const slot = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(slot);
    gl.vertexAttribPointer(slot, 2, gl.FLOAT, false, 0, 0);
    gl.viewport(0, 0, W, H);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.finish();
    const raw = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, raw);

    // GLSL counts pixel rows from the bottom and WGSL from the top, so one of the
    // two frames is turned over before they are compared and a source that never
    // says which target it is on reads as a different picture rather than drift.
    const fromGL = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++) fromGL.set(raw.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);

    // The three numbers of §17's amendment to decision 4, and no average: hard
    // jumps per frame (compared as counts), the worst single channel, and the
    // channels differing at all. `window.compareFrames` is the same function the
    // node suite exercises, bundled in above.
    return window.compareFrames(fromGPU, fromGL, W, H);
  },
  { sources: CONTROL, W, H }
);

// The clean-pass signal is `differing === 0` in the limit, but two hardware
// compilers fold one gradient's arithmetic close rather than equal, so the pass
// bar is the worst single channel within `TOLERANCE`. All three numbers are
// printed whether it passes or not, since a seam nobody prints is a seam nobody
// looks at, and the average that would have buried it is gone.
say(
  !control.error && control.maxDelta <= TOLERANCE,
  control.error ??
    `the two agree on a gradient  hard jumps ${control.hardJumps.a} against ${control.hardJumps.b}, ` +
      `worst ${control.maxDelta}, ${control.differing.toLocaleString('en-US')} of ${control.channels.toLocaleString('en-US')} channels differ`
);

// Every fixture through this library's own backend, on the card. A frame of
// nothing fails rather than passes, because a shader drawing black cannot be told
// from one that never drew, and a driver's own refusal arrives as an uncaptured
// error rather than at the call that caused it.
for (const { id, frame, values, entry } of corpus) {
  const result = await page.evaluate(
    async ({ frame, values, declared, W, H }) => {
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;

      const device = await window.requestWebGPUDevice();
      if (!device) return { error: 'no WebGPU device on the card' };
      /** @type {string[]} */
      const refusals = [];
      device.addEventListener('uncapturederror', (event) => refusals.push(String(/** @type {any} */ (event).error.message)));

      const backend = window.createWebGPUBackend(canvas, device);
      if (!backend) return { error: 'no webgpu context' };
      backend.resize(W, H);

      let program;
      try {
        program = backend.program(frame);
      } catch (e) {
        return { error: String(/** @type {any} */ (e).message || e).slice(0, 300) };
      }
      const absent = window.missing(frame, declared);
      program.setUniforms(values);
      program.draw();
      const px = await backend.readPixels();
      let lit = 0;
      for (let i = 0; i < px.length; i += 4) if (px[i] > 4 || px[i + 1] > 4 || px[i + 2] > 4) lit++;
      program.dispose();
      const refused = refusals.length ? refusals[0].slice(0, 300) : null;
      backend.dispose();
      return refused ? { error: refused } : { lit, total: px.length / 4, absent };
    },
    { frame, values, declared: entry.uniforms.map((uniform) => uniform.name), W, H }
  );

  if (result.error) say(false, `${id} on the card  ${result.error}`);
  else if (result.absent?.length)
    say(false, `${id} on the card  the program has nowhere to put ${result.absent.join(', ')}`);
  else if (result.lit === 0) say(false, `${id} on the card  drew nothing, 0 of ${result.total} pixels lit`);
  else {
    // The earlier arms rule out the error shape and a zero `lit`, so both are present here.
    const lit = /** @type {number} */ (result.lit);
    const total = /** @type {number} */ (result.total);
    say(true, `${id} on the card  ${lit.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} pixels lit`);
  }
}

// ── What reaches the screen, not what reaches readPixels (item 20) ────────────
//
// **Every other check in this file reads pixels through `readPixels`**, and
// item 20 made that call turn a translated frame over or not depending on which
// way up its vertex stages left it. So `readPixels` agreeing proves the *bytes*
// are right and says nothing about the *canvas* — and the canvas is what a page
// shows. A frame rasterised upside down in the framebuffer would read back
// correctly and display wrong, and nothing else here would notice.
//
// This draws one preset through WebGL 2 and reads the same frame two ways: off
// the canvas with a 2D context, which is what a reader sees, and through
// `readPixels`, which every other check uses. `core-scissor` is the preset
// because its rectangle is off-centre in both axes on purpose, so a flip is a
// different picture rather than the same one.
//
// **Reported, never gated, and the reason is honest rather than cautious.** The
// two do not agree whole-frame even on a tree nobody has touched — 1,213,200 of
// 1,920,000 channels, with the canvas bottom reading black where `readPixels`
// reads content. Why has not been isolated; the likely cause is that this preset
// does not paint the default framebuffer everywhere the offscreen target is
// painted. **So whole-frame equality is not yet an invariant and asserting it
// would be a red gate standing in for an unfinished reading.**
//
// **What it does say is which end of the screen the picture starts at**, and that
// is what it was written for. On this tree the canvas top matches `readPixels`'
// top. Under item 20's reverted step 2c — the clip-space y negation restored —
// the canvas *bottom* matched `readPixels`' top instead: the frame was rasterised
// upside down, read back correctly by a `readPixels` that had been taught not to
// turn it over, and displayed mirrored. **Every other check in this file was
// blind to that, because every other check reads through `readPixels`.** That is
// the blind spot this line exists to keep visible until it can be gated.
console.log('');
const scissorPreset = corpus.find((preset) => preset.id === 'core-scissor');
if (!scissorPreset) {
  say(false, 'the canvas shows what readPixels reads  the corpus dropped core-scissor');
} else {
  const bytesArrays = Object.fromEntries([...scissorPreset.bytes].map(([index, made]) => [index, [...made]]));
  const onScreen = await page.evaluate(
    async ({ id, description, code, block, bytesArrays, values, W, H }) => {
      const generated = new Map();
      description.resources.forEach((/** @type {any} */ r, /** @type {number} */ i) => {
        const source = 'source' in r ? r.source : undefined;
        if (source && bytesArrays[i]) generated.set(i, new Uint8Array(bytesArrays[i]));
      });
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      document.body.appendChild(canvas);
      try {
        const wgsl = window.frameOf(id, description, { wgsl: code }, block, undefined, generated);
        const glsl = window.glslFrameOf(/** @type {any} */ (wgsl));
        if (!glsl) return { error: 'core-scissor baked no vertex to link' };
        const backend = window.createWebGL2Backend(canvas);
        if (!backend) return { error: 'no webgl2 context' };
        backend.resize(W, H);
        const program = backend.program(glsl);
        program.setUniforms(values);
        program.draw();

        // The canvas as the page shows it, read **before** anything awaits. This
        // backend leaves the browser free to throw a finished frame away — it asks
        // for no `preserveDrawingBuffer` — so a `drawImage` after an await reads a
        // cleared buffer and measures nothing. A WebGL 2 canvas can be drawn into a
        // 2D context at all, unlike a WebGPU one, which is item 17's finding and is
        // why this check exists for this backend only.
        const flat = document.createElement('canvas');
        flat.width = W;
        flat.height = H;
        const ctx = flat.getContext('2d');
        if (!ctx) return { error: 'no 2d context' };
        ctx.drawImage(canvas, 0, 0);
        const shown = ctx.getImageData(0, 0, W, H).data;
        const read = await backend.readPixels();

        let differing = 0;
        let worst = 0;
        let mirrored = 0;
        const stride = W * 4;
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < stride; x++) {
            const off = Math.abs(shown[y * stride + x] - read[y * stride + x]);
            if (off > worst) worst = off;
            if (off > 8) differing++;
            // The same comparison against the canvas turned over, so a failure says
            // whether the screen is mirrored or merely different.
            if (Math.abs(shown[(H - 1 - y) * stride + x] - read[y * stride + x]) > 8) mirrored++;
          }
        }
        /** @param {Uint8Array|Uint8ClampedArray} buf @param {number} fy */
        const at = (buf, fy) => {
          const y = Math.floor(H * fy);
          const i = y * stride + (W >> 1) * 4;
          return [buf[i], buf[i + 1], buf[i + 2], buf[i + 3]].join(',');
        };
        const samples = {
          shownTop: at(shown, 0.25),
          shownBottom: at(shown, 0.75),
          readTop: at(read, 0.25),
          readBottom: at(read, 0.75),
        };
        program.dispose();
        backend.dispose();
        return { differing, worst, mirrored, channels: W * H * 4, samples };
      } catch (e) {
        return { error: String(/** @type {any} */ (e).message || e).slice(0, 200) };
      } finally {
        canvas.remove();
      }
    },
    { id: scissorPreset.id, description: scissorPreset.description, code: scissorPreset.code, block: scissorPreset.block, bytesArrays, values: scissorPreset.values, W, H }
  );

  // **This gates now, and item 20's step 2c is what made it able to** (2026-09-12).
  // It was reported and never gated because the two disagreed whole-frame on an
  // untouched tree — 1,213,200 of 1,920,000 channels, the canvas bottom reading
  // black where `readPixels` read content — and asserting a number nobody had
  // isolated would have been a red gate standing in for an unfinished reading.
  // The presentation step isolated it: a frame used to reach the screen by a pass
  // drawing the default framebuffer, which the compositor is free to treat as it
  // likes, and it now reaches the screen as a blit of a colour target this backend
  // owns. The two agree to 0 of 1,920,000, worst channel 0.
  //
  // **It is the only reading in this repository that sees what a reader sees.**
  // Every other cross-backend number here is a `readPixels` number, and step 2c's
  // first attempt passed 33 of 33 checks with the picture on the screen upside
  // down. Step 2d negates y in the vertex stage, which is exactly the change that
  // can do that again, so this is the guard that change is taken against.
  if (onScreen.error) {
    say(false, `the canvas against readPixels  ${onScreen.error}`);
  } else {
    const differing = /** @type {number} */ (onScreen.differing);
    const mirrored = /** @type {number} */ (onScreen.mirrored);
    const channels = /** @type {number} */ (onScreen.channels);
    say(
      differing === 0,
      `the canvas shows what readPixels reads  ${differing.toLocaleString('en-US')} of ` +
        `${channels.toLocaleString('en-US')} channels differ, worst ${onScreen.worst}; ` +
        `turned over, ${mirrored.toLocaleString('en-US')} differ`
    );
    const samples = /** @type {any} */ (onScreen).samples;
    console.log(
      `     on screen  top ${samples.shownTop}  bottom ${samples.shownBottom}` +
        `   |   through readPixels  top ${samples.readTop}  bottom ${samples.readBottom}`
    );
  }
}

// ── A figure whose geometry moves, on a real driver (item 18, step 6) ─────────
//
// Item 18 took a resource's bulk bytes out of the program cache key so that a
// picture whose shape moves stops recompiling every frame, and made a cache hit
// refill the program's buffers from the frame it was handed. Sixty ticks of one
// moving figure went from sixty linked programs to one.
//
// **Everything that guards it is a double.** A double can show the upload was
// issued before the draw; it cannot show the driver honoured that order, or that
// the draw sampled the refilled buffer rather than the bytes the program was
// compiled with. A refill that writes a buffer the draw does not read looks
// identical on both fakes. That is what this check is for, and it is the only
// place in the repository that can say it.
//
// **Both halves are asserted together because either alone proves nothing.** One
// key and one picture is a cache that hits and never refills — the silent stale
// draw. Two keys and two pictures is the recompile the item removed, passing for
// the wrong reason.
console.log('');
const movingGeometry = await page.evaluate(
  async ({ W, H }) => {
    const WGSL = `struct Uniforms { u_time: f32 };
@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@vertex
fn warp(@location(0) corner: vec2<f32>) -> @builtin(position) vec4<f32> {
  return vec4<f32>(corner, 0.0, 1.0);
}
@fragment
fn shade() -> @location(0) vec4<f32> {
  return vec4<f32>(0.9, 0.3, 0.2, 1.0);
}`;

    /** One triangle, `side` picking which half of the frame it covers. The two
     * are the same length to the byte, so the only thing that could separate them
     * is the geometry itself — which is exactly what no longer separates them. */
    /** @type {(side: string) => any} */
    const figure = (side) => {
      const x = side === 'left' ? -0.5 : 0.5;
      const corners = new Float32Array([x - 0.4, -0.9, x + 0.4, -0.9, x, 0.9]);
      return {
        id: 'moving-figure',
        authored: 'wgsl',
        resources: [
          { kind: 'uniform', block: [{ name: 'u_time', offset: 0, size: 4 }] },
          {
            kind: 'vertices',
            stride: 8,
            attributes: [{ location: 0, offset: 0, format: 'float32x2' }],
            topology: 'triangle-list',
            count: 3,
            data: new Uint8Array(corners.buffer.slice(0)),
          },
        ],
        modules: [],
        pipelines: [
          {
            kind: 'render',
            source: { wgsl: { vertex: WGSL, fragment: WGSL } },
            vertex: { document: 'wgsl', entry: 'warp' },
            fragment: { document: 'wgsl', entry: 'shade' },
            geometry: 1,
            bindings: [{ group: 0, binding: 0, resource: 0, visibility: ['fragment'] }],
          },
        ],
        passes: [{ pipeline: 0, draws: [{ instances: 1 }] }],
      };
    };

    const left = figure('left');
    const right = figure('right');
    const sameKey = window.frameKey(left) === window.frameKey(right);

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const adapter = await navigator.gpu?.requestAdapter();
    if (!adapter) return { error: 'no adapter' };
    const device = await adapter.requestDevice();
    const renderer = await window.createFrameRenderer(canvas, { backend: 'webgpu', device });
    if (!renderer) return { error: 'no renderer' };

    /** Lit pixels either side of the centre line, which is how the picture is
     * read: the triangle is on one side or the other and nothing is on both. */
    /** @type {(pixels: Uint8Array) => { onLeft: number; onRight: number }} */
    const halves = (pixels) => {
      let onLeft = 0;
      let onRight = 0;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const at = (y * W + x) * 4;
          if (pixels[at] > 40 || pixels[at + 1] > 40) {
            if (x < W / 2) onLeft++;
            else onRight++;
          }
        }
      }
      return { onLeft, onRight };
    };

    try {
      const first = halves(await renderer.frame(left, { u_time: 0 }));
      // The same renderer, so this is a cache hit if the keys agree — and the
      // whole question is whether the card then draws the geometry it was handed
      // rather than the geometry the program was compiled with.
      const second = halves(await renderer.frame(right, { u_time: 0 }));
      renderer.dispose();
      return { sameKey, first, second };
    } catch (e) {
      renderer.dispose();
      return { error: String(/** @type {any} */ (e).message || e).slice(0, 200) };
    }
  },
  { W, H }
);

if (movingGeometry.error) {
  say(false, `a figure whose geometry moves redraws on the card  ${movingGeometry.error}`);
} else {
  const first = /** @type {{onLeft: number, onRight: number}} */ (movingGeometry.first);
  const second = /** @type {{onLeft: number, onRight: number}} */ (movingGeometry.second);
  // The first frame is on the left and nowhere else; the second is on the right
  // and nowhere else. A stale draw would repeat the first reading exactly.
  const moved = first.onLeft > 1000 && first.onRight === 0 && second.onRight > 1000 && second.onLeft === 0;
  say(
    movingGeometry.sameKey === true && moved,
    `a figure whose geometry moves redraws on the card  one program for both frames: ` +
      `${movingGeometry.sameKey}; first frame ${first.onLeft.toLocaleString('en-US')} left / ` +
      `${first.onRight.toLocaleString('en-US')} right, second ${second.onLeft.toLocaleString('en-US')} left / ` +
      `${second.onRight.toLocaleString('en-US')} right`
  );
}

// ── The live path reads itself back, on a real driver (item 17) ───────────────
//
// `Surface.read()` landed with six tests against a double and no driver had ever
// run it: the surface gate's checks never call it, and every other check in this
// file reaches a backend directly, which is the one thing this method exists so a
// page does not have to do. So the gap this closes is specific — not "does a
// readback work", which the control above already says, but "does the readback a
// page reaches through the interface it holds give back the frame on its canvas".
//
// The canvas is on the page and the loop is running when the read is taken,
// because that is the case that has no other answer: a caller wanting these
// pixels any other way needs a second renderer over a second canvas, and on
// WebGL 2 cannot reuse the first canvas at all.
console.log('');
const liveRead = await page.evaluate(
  async ({ W, H }) => {
    // A flat colour rather than a gradient: what is under test is whether the
    // bytes are the frame at all, and a single expected triple says that without
    // a tolerance argument about interpolation. 240, 92, 51 is the colour the
    // consumer's own 2026-09-09 reading used, so the two readings name the same
    // number.
    const code =
      '@fragment fn fragMain() -> @location(0) vec4<f32> { return vec4<f32>(240.0/255.0, 92.0/255.0, 51.0/255.0, 1.0); }';
    const frame = window.wgslFrame('live-readback', code, [{ name: 'u_time', offset: 0, size: 4 }]);

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    document.body.appendChild(canvas);

    const adapter = await navigator.gpu?.requestAdapter();
    if (!adapter) return { error: 'no adapter' };
    const device = await adapter.requestDevice();

    const surface = await window.createSurface(canvas, frame, {
      backend: 'webgpu',
      device,
      dpr: [1, 1],
      uniforms: (elapsed) => ({ u_time: elapsed }),
    });
    if (!surface) return { error: 'the canvas gave no surface' };

    try {
      surface.start();
      // A few real animation frames, so the read below is taken against a loop
      // that is genuinely running rather than against a surface that has drawn
      // once.
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(done))));

      const runningBefore = surface.running;
      const pixels = await surface.read();
      const runningAfter = surface.running;
      if (!pixels) return { error: 'read() gave null on a live surface' };

      let matched = 0;
      let worst = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const dr = Math.abs(pixels[i] - 240);
        const dg = Math.abs(pixels[i + 1] - 92);
        const db = Math.abs(pixels[i + 2] - 51);
        const off = Math.max(dr, dg, db);
        if (off > worst) worst = off;
        if (off <= 1) matched++;
      }

      // What the canvas alone would have given, which is the trap the guide warns
      // about: a 2D context drawn from this canvas reads nothing on WebGPU,
      // because the canvas texture is configured to be copied *to* and the one
      // carrying COPY_SRC is the backend's own target.
      let canvasAlpha = -1;
      try {
        const flat = document.createElement('canvas');
        flat.width = W;
        flat.height = H;
        const ctx = flat.getContext('2d');
        if (!ctx) throw new Error('no 2d context');
        ctx.drawImage(canvas, 0, 0);
        canvasAlpha = ctx.getImageData(W >> 1, H >> 1, 1, 1).data[3];
      } catch {
        canvasAlpha = -1;
      }

      const afterDispose = (surface.dispose(), await surface.read());
      document.body.removeChild(canvas);
      return {
        length: pixels.length,
        expected: W * H * 4,
        matched,
        total: W * H,
        worst,
        runningBefore,
        runningAfter,
        nullAfterDispose: afterDispose === null,
        canvasAlpha,
      };
    } catch (e) {
      return { error: String(/** @type {any} */ (e).message || e).slice(0, 200) };
    }
  },
  { W, H }
);

if (liveRead.error) {
  say(false, `a live surface reads itself back on the card  ${liveRead.error}`);
} else {
  const matched = /** @type {number} */ (liveRead.matched);
  const total = /** @type {number} */ (liveRead.total);
  const ok =
    liveRead.length === liveRead.expected &&
    matched === total &&
    liveRead.runningBefore === true &&
    liveRead.runningAfter === true &&
    liveRead.nullAfterDispose === true;
  say(
    ok,
    `a live surface reads itself back on the card  ${matched.toLocaleString('en-US')} of ` +
      `${total.toLocaleString('en-US')} pixels are the drawn colour, worst channel off by ${liveRead.worst}, ` +
      `loop still running, null after dispose`
  );
  // Reported and never gated: it is the consumer's finding re-taken on this
  // machine, and a browser that changed it would not be a fault in this package.
  console.log(
    `     the same canvas through a 2D context: alpha ${liveRead.canvasAlpha} at the centre ` +
      `(reported, never gated — it is why Surface.read() exists)`
  );
}

// ── Decision 6's promise, on a machine that has WebGPU (item 62) ───────────────
//
// A consumer arriving with a GLSL shader gets a picture rather than a lecture: GLSL
// selects WebGL 2 *even where WebGPU exists*, because the language it is written in
// is the capability it forfeits. Items 6, 8 and 9 each built a piece of this and
// each disclosed the half it could not prove — the offering in their tests is a
// written fixture, because the machine they ran on never returned a WebGPU adapter.
// This browser did return one, which is the whole point of taking it here.
console.log('');
const glslJoin = await page.evaluate(async ({ W, H }) => {
  const vertex = '#version 300 es\nin vec2 position;void main(){gl_Position=vec4(position,0.0,1.0);}';
  const fragment =
    '#version 300 es\nprecision highp float;out vec4 o;void main(){o=vec4(0.2,0.7,0.9,1.0);}';
  const frame = window.glslFrame('glsl-fragment', vertex, fragment);

  // The offering is this machine's, read rather than written down: an adapter was
  // returned above, so `webgpu` is true here and the selection is the real question.
  const adapter = await navigator.gpu?.requestAdapter();
  const offer = { webgpu: Boolean(adapter), webgl2: Boolean(document.createElement('canvas').getContext('webgl2')) };
  const chose = window.selectBackend(frame, offer);
  if (!('backend' in chose)) return { error: `selection refused it: ${chose.refusal}` };

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const backend = window.createWebGL2Backend(canvas);
  if (!backend) return { error: 'no webgl2 context' };
  backend.resize(W, H);
  let lit = 0;
  try {
    const program = backend.program(frame);
    program.draw();
    const px = await backend.readPixels();
    for (let i = 0; i < px.length; i += 4) if (px[i] > 4 || px[i + 1] > 4 || px[i + 2] > 4) lit++;
    program.dispose();
  } catch (e) {
    return { error: String(/** @type {any} */ (e).message || e).slice(0, 200) };
  }
  backend.dispose();
  return { offer, backend: chose.backend, lit, total: W * H };
}, { W, H });

if (glslJoin.error || !glslJoin.offer) {
  say(false, `a GLSL frame on a WebGPU machine  ${glslJoin.error ?? 'no reading came back'}`);
} else {
  // The earlier arm rules out the error shape, so the four readings are all present.
  const lit = /** @type {number} */ (glslJoin.lit);
  const total = /** @type {number} */ (glslJoin.total);
  say(
    glslJoin.offer.webgpu === true && glslJoin.backend === 'webgl2' && lit > 0,
    `a GLSL frame selects WebGL 2 where WebGPU exists  webgpu offered: ${glslJoin.offer.webgpu}, ` +
      `chose ${glslJoin.backend}, ${lit.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} pixels lit`
  );
}

// ── The scene tier on both backends, on the card (item 106) ────────────────────
//
// This is where §17 decision 1 gets its answer: how far the WebGL 2 scene tier
// actually reaches, measured rather than asserted. The three presets below are the
// scene tier's own — `sceneView`-shaped graphs with per-instance records — and each
// is drawn twice on this one card, once through each backend, then compared by item
// 44's three numbers.
//
// **Item 106 was written against `orbit-shadow` and these presets are the vehicle
// instead**, decided 2026-08-26 with a person present and recorded in JOURNAL.md.
// `orbit-shadow` is an example driven by `sceneView` from a world and cameras, so
// putting it here means bundling the producer and building a world inside the page;
// these three are corpus presets the loader already hands over built, they exercise
// three graphs rather than one, and the WebGL 2 arm is the path `gates/corpus.mjs`
// already proves. What is lost is the literal vehicle the item named.
//
// The bar is the same as the gradient control's: `differing === 0` in the limit, and
// the pass is the worst single channel within TOLERANCE, because two hardware
// compilers fold one graph's arithmetic close rather than equal. All three numbers
// print whether it passes or not.
//
// **`core-blend` is here and is not a scene preset** (item 11). It is on this list
// for the reason the list exists at all: it is the one preset whose two backends
// can be compared under a blend. That gap is not hypothetical — `core-depth` blends
// and drew unblended on WebGL 2 for as long as it was in the corpus, and nothing
// saw it, because the only comparison this package takes between the two backends
// is the one below and `core-depth` was never on it. A preset that blends and is
// drawn by both backends is what closes that, and it is why `core-blend` was
// written with one colour target and no depth: a second target naming a different
// blend needs `per-target-blend`, which WebGL 2 has not got, and the preset would
// be skipped there and compare nothing.
//
// **`core-count` is here for the same reason** (item 2). The audit that opened the
// counting modes found `StencilMode`'s meaning written once per backend with each
// copy asserting the other agreed — and the assertion was false: the reference was
// `0xff` in both backends' tables and `1` in `submit/execute.ts`, so WebGPU wrote
// and compared `1` where WebGL 2 wrote and compared `0xff`. Each backend was
// self-consistent, so both drew the same picture and nothing was wrong to look at;
// what let it live is that no stencil preset was on this list. `core-count` closes
// that, and it is the preset a mask cannot draw at all, so it reads the counting
// modes as well as the reference.
//
// **`core-stencil` joined it at step 4 of the same item**, and the gap is worth
// recording because it hid the defect above. Its filling pipeline named no vertex
// stage, so it baked no GLSL vertex and `gates/corpus.mjs` skipped the whole preset
// on WebGL 2 — a preset skipped on one backend compares nothing, which is the trap
// `core-blend` was written to avoid. It has a vertex stage now, so the mask modes
// are compared here beside the counting ones.
//
// **`core-scissor` joined it at item 16 step 3**, and it is on this list for the
// reason `core-blend` is: a scissor is core render-pass state on both backends whose
// effect appears in no shader, so nothing but a cross-backend comparison can tell an
// applied rectangle from an ignored one — or, worse, from one flipped the wrong way
// round, since WebGPU counts a scissor from the top-left and WebGL 2 from the
// bottom-left. Its rectangle is off-centre in both axes so that a wrong flip is a
// different picture rather than the same one.
//
// **`core-texture`, `core-target` and `core-mips` joined it at item 19 step 4**,
// which is the step the other three exist for: each was skipped on WebGL 2 for
// want of a baked vertex, so each was drawn by one backend and compared with
// nothing. Making them drawable was the precondition; this is the comparison.
// Each earns its place on a different reading, and none of them on a shader:
//
//   - **`core-target`** is the round trip. A pass draws into a texture and the
//     next samples it back at the frame's own size, so an attachment written by
//     one backend and read by the other's arithmetic is what is being compared.
//     It agrees: worst 2, 77 of 1,440,000 channels.
//
// **`core-texture` and `core-mips` were held off this list for a day, and item 20
// is why they are on it.** Both were added on 2026-09-11 and both came back red on
// the first run:
//
//   core-texture  hard jumps     0 against     0, worst 235, 1,424,706 of 1,440,000 differ
//   core-mips     hard jumps 7,725 against 7,731, worst 128, 1,401,861 of 1,440,000 differ
//
// Almost every channel, against a tolerance of 8. **That is the exact defect class
// item 19 was opened to expose** — both presets were skipped on WebGL 2 for want
// of a baked vertex, so both had been drawing two different pictures for as long
// as they had existed and nothing was red. They were held out under **item 20**
// rather than left red, because a gate that is expected to be red stops being
// read, and a diagnostic block below printed both readings until that item closed.
//
// **It closed on 2026-09-12 and they read 40 at worst 1 and 0 at worst 0.** Two
// causes, neither of them the one the first hypothesis named. `@builtin(position)`
// counts rows from the top left in WGSL and from the bottom left in GLSL ES, which
// took a presentation step the backend owns and a clip-space y flip in the vertex
// stage to reconcile — two reverted attempts proved neither half works alone. And
// the WebGPU backend read *between* a ladder's levels with `nearest`, never having
// set `mipmapFilter`, where the WebGL 2 backend mixed them.
const SCENE_TIER = [
  'core-scene',
  'core-draw-list',
  'core-material',
  'core-blend',
  'core-stencil',
  'core-count',
  'core-scissor',
  'core-target',
  // **The last two, added by item 20's step 3 on 2026-09-12.** They were held off
  // this list and printed by a diagnostic block below, because they disagreed
  // across the backends at nearly every channel — 1,424,706 and 1,401,861 of
  // 1,440,000 against a tolerance of 8 — and a gate expected to be red stops being
  // read. Item 20 found both causes: `@builtin(position)` counts rows from the
  // opposite corner in the two languages, fixed by a presentation step and a
  // vertex flip (steps 2c and 2d), and the WebGPU backend read between a ladder's
  // levels with `nearest` because it never set `mipmapFilter` (step 2e). They read
  // 40 at worst 1 and 0 at worst 0 now, so they are held to the same bar as the
  // rest and the diagnostic block is gone.
  'core-texture',
  'core-mips',
];
/**
 * One preset drawn through both backends on this card and compared two ways: as
 * drawn, and with the WebGL 2 frame flipped in Y. The straight reading is what
 * `SCENE_TIER` gates on; the flipped one is item 20's step 1, which asks whether
 * two disagreeing pictures are vertical mirrors of each other.
 *
 * It is one function so that the gated comparison and the diagnostic cannot drift
 * apart: a diagnostic drawing its frames differently from the check it is
 * diagnosing would explain the wrong thing.
 */
/** @type {(input: { id: string; description: any; code: string; block: any; bytesArrays: any; values: any; W: number; H: number }) => Promise<any>} */
const compareBothWays = async ({ id, description, code, block, bytesArrays, values, W, H }) => {
      /** @param {any} description */
      const generatedFor = (description) => {
        const generated = new Map();
        description.resources.forEach((/** @type {any} */ resource, /** @type {number} */ index) => {
          const source = 'source' in resource ? resource.source : undefined;
          if (source && bytesArrays[index]) generated.set(index, new Uint8Array(bytesArrays[index]));
        });
        return generated;
      };
      /** @param {number} w @param {number} h */
      const canvasOf = (w, h) => {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        return canvas;
      };

      // The WebGPU half, on the card.
      const device = await window.requestWebGPUDevice();
      if (!device) return { error: 'no WebGPU device on the card' };
      const gpu = window.createWebGPUBackend(canvasOf(W, H), device);
      if (!gpu) return { error: 'no webgpu context' };
      gpu.resize(W, H);
      let fromGPU;
      try {
        const wgsl = window.frameOf(id, description, { wgsl: code }, block, undefined, generatedFor(description));
        const program = gpu.program(wgsl);
        program.setUniforms(values);
        program.draw();
        fromGPU = await gpu.readPixels();
        program.dispose();
      } catch (e) {
        return { error: `webgpu: ${String(/** @type {any} */ (e).message || e).slice(0, 200)}` };
      }
      gpu.dispose();

      // The WebGL 2 half, in the same browser on the same card, through the baked
      // GLSL. A null frame is the bake carrying none — an outcome, not a throw.
      const gl = window.createWebGL2Backend(canvasOf(W, H));
      if (!gl) return { error: 'no webgl2 context' };
      gl.resize(W, H);
      let fromGL;
      try {
        const wgsl = window.frameOf(id, description, { wgsl: code }, block, undefined, generatedFor(description));
        const glsl = window.glslFrameOf(/** @type {any} */ (wgsl));
        if (!glsl) return { skip: 'the source carried no baked GLSL to draw' };
        const program = gl.program(glsl);
        program.setUniforms(values);
        program.draw();
        fromGL = await gl.readPixels();
        program.dispose();
      } catch (e) {
        return { error: `webgl2: ${String(/** @type {any} */ (e).message || e).slice(0, 200)}` };
      }
      gl.dispose();

      // Both comparisons, because item 20 asks whether the two pictures are
      // vertical mirrors of each other and the straight reading alone cannot say.
      // The flip is of the WebGL 2 frame, row for row; `readPixels` has already
      // put both frames top row first, so this is a mirror of the *picture* and
      // not an undo of the row-direction repack.
      const stride = W * 4;
      const flipped = new Uint8Array(fromGL.length);
      for (let y = 0; y < H; y++) {
        flipped.set(fromGL.subarray((H - 1 - y) * stride, (H - y) * stride), y * stride);
      }
      return {
        straight: window.compareFrames(fromGPU, fromGL, W, H),
        flipped: window.compareFrames(fromGPU, flipped, W, H),
      };
    };

console.log('');
for (const one of corpus.filter((preset) => SCENE_TIER.includes(preset.id))) {
  // Bytes do not survive `page.evaluate`, so they cross as arrays keyed by the
  // resource's index — its handle since item 87 — and are rebuilt inside the page.
  const bytesArrays = Object.fromEntries([...one.bytes].map(([index, made]) => [index, [...made]]));
  const both = await page.evaluate(compareBothWays, {
    id: one.id,
    description: one.description,
    code: one.code,
    block: one.block,
    bytesArrays,
    values: one.values,
    W,
    H,
  });

  const label = `${one.id} on both backends`;
  if (both.skip) say(true, `${label}  skipped: ${both.skip}`);
  else if (both.error) say(false, `${label}  ${both.error}`);
  else {
    const straight = /** @type {any} */ (both).straight;
    const flipped = /** @type {any} */ (both).flipped;
    const ok = straight.maxDelta <= TOLERANCE;
    // **Asserted, since item 107 closed.** It reported rather than asserted while the
    // two backends drew different pictures; the mirror is gone and the residual is
    // now one channel of rounding, so this holds the same bar the gradient control
    // above does. Three numbers print whether it passes or not: a seam nobody prints
    // is a seam nobody looks at, and the average that would bury it does not exist.
    //
    // **A failing preset prints the same comparison with the WebGL 2 frame turned
    // over**, which is the first question to ask of two pictures that disagree:
    // mirroring preserves adjacency, so a flipped reading that is *better* than the
    // straight one says the frame is upside down rather than wrong. That reading
    // was a block of its own until item 20's step 3 deleted it — it existed to
    // diagnose `core-texture` and `core-mips`, which are on this list now — and it
    // is kept here because it costs one comparison over buffers already in hand and
    // because it is what a session reading a red line wants next.
    say(
      ok,
      `${label}  hard jumps ${straight.hardJumps.a} against ${straight.hardJumps.b}, ` +
        `worst ${straight.maxDelta}, ${straight.differing.toLocaleString('en-US')} of ${straight.channels.toLocaleString('en-US')} channels differ` +
        (ok
          ? ''
          : `; turned over, worst ${flipped.maxDelta}, ${flipped.differing.toLocaleString('en-US')} differ`)
    );
  }
}

// ── What the presentation step costs, on the card (item 20, step 2c) ─────────
//
// **Step 2c landed on 2026-09-12 and this block is kept rather than removed**: it
// was written to answer whether the step was affordable, and it now re-takes the
// cost of what the backend actually does on every machine this gate is run on.
// The `direct` round is what the backend used to do and no longer does, so it is
// the baseline the copy is charged against rather than a live path.
//
// The step needed the backend to stop drawing into the caller's
// canvas directly and to render into an offscreen target it blits at present —
// that being the only place a y flip can go once the geometry is flipped, and the
// reason both earlier attempts were reverted. **The cost of that is a copy per
// frame on every page, forever, and nothing had measured it.**
//
// So this draws the same frame both ways at the frame's own size and reports the
// per-frame difference: straight into the default framebuffer, which is what
// happens today, and into a renderbuffer-backed framebuffer blitted onto the
// default one, which is what the fix would do.
//
// **Amortised over many frames with one `finish` at the end**, rather than a
// `finish` per frame: forcing a sync every frame measures the stall and not the
// work. Reported and never gated, like every millisecond in this file — §17
// decision 9 says wall-clock is measured on real hardware and never gated.
//
// **Step 2d or 3 deletes this block** once the number has been read and the choice
// between always-offscreen and translated-only is made.
console.log('');
const presentCost = await page.evaluate(async ({ W, H, frames }) => {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  document.body.appendChild(canvas);
  const gl = canvas.getContext('webgl2', { antialias: false });
  if (!gl) return { error: 'no webgl2 context' };
  try {
    const compile = (/** @type {number} */ kind, /** @type {string} */ src) => {
      const sh = /** @type {WebGLShader} */ (gl.createShader(kind));
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(String(gl.getShaderInfoLog(sh)));
      return sh;
    };
    const program = /** @type {WebGLProgram} */ (gl.createProgram());
    gl.attachShader(program, compile(gl.VERTEX_SHADER, '#version 300 es\nin vec2 p;void main(){gl_Position=vec4(p,0.0,1.0);}'));
    gl.attachShader(
      program,
      compile(
        gl.FRAGMENT_SHADER,
        '#version 300 es\nprecision highp float;out vec4 c;void main(){vec2 u=gl_FragCoord.xy/vec2(' +
          W +
          '.0,' +
          H +
          '.0);c=vec4(u,0.5,1.0);}'
      )
    );
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(String(gl.getProgramInfoLog(program)));
    gl.useProgram(program);

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const at = gl.getAttribLocation(program, 'p');
    gl.enableVertexAttribArray(at);
    gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
    gl.viewport(0, 0, W, H);

    // The offscreen target the fix would render into: a colour renderbuffer, which
    // is what a backend that never samples its own output would allocate.
    const fbo = gl.createFramebuffer();
    const colour = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, colour);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, W, H);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, colour);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) return { error: 'offscreen target incomplete' };

    const drain = new Uint8Array(4);
    /** `mode` 0 draws straight into the canvas, which is what happens today; 1
     * renders offscreen and copies; 2 renders offscreen and copies **turned over**,
     * which is what the fix would actually do — a flipped blit is a different
     * access pattern from a straight one and is the figure the decision needs. */
    /** @param {number} mode */
    const run = (mode) => {
      for (let i = 0; i < frames; i++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, mode === 0 ? null : fbo);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        if (mode !== 0) {
          gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fbo);
          gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
          // The y flip is the source rectangle read bottom-to-top, which is how
          // `blitFramebuffer` turns an image over.
          if (mode === 2) gl.blitFramebuffer(0, H, W, 0, 0, 0, W, H, gl.COLOR_BUFFER_BIT, gl.NEAREST);
          else gl.blitFramebuffer(0, 0, W, H, 0, 0, W, H, gl.COLOR_BUFFER_BIT, gl.NEAREST);
        }
      }
      // **`finish` alone does not force this work.** The canvas is never
      // composited here, so the driver is free to discard every draw and answer
      // `finish` immediately — measured, and it read 0.0 ms for a thousand
      // fullscreen draws, which is what sent this measurement back for a second
      // attempt. Reading one pixel out of the default framebuffer forces the queue
      // to drain, and one readback amortised over `frames` draws is a sync this
      // measurement can afford where a per-frame one would measure the stall.
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, drain);
    };

    // Warm: the first frames of any path pay compilation and allocation the steady
    // state does not.
    run(0);
    run(1);
    run(2);

    /** @param {number} mode */
    const timed = (mode) => {
      const t0 = performance.now();
      run(mode);
      return performance.now() - t0;
    };
    // Interleaved and repeated, so a thermal or scheduling drift during the run
    // lands on both paths rather than on whichever went second.
    let direct = 0;
    let viaBlit = 0;
    let viaFlip = 0;
    const rounds = 5;
    for (let r = 0; r < rounds; r++) {
      direct += timed(0);
      viaBlit += timed(1);
      viaFlip += timed(2);
    }
    gl.deleteFramebuffer(fbo);
    gl.deleteRenderbuffer(colour);
    // Totals as well as per-frame, because a per-frame figure that rounds to zero
    // cannot be told from a loop that never ran.
    return {
      direct: direct / rounds / frames,
      viaBlit: viaBlit / rounds / frames,
      viaFlip: viaFlip / rounds / frames,
      directTotal: direct,
      viaBlitTotal: viaBlit,
      viaFlipTotal: viaFlip,
      frames,
      rounds,
    };
  } catch (e) {
    return { error: String(/** @type {any} */ (e).message || e).slice(0, 200) };
  } finally {
    canvas.remove();
  }
}, { W, H, frames: 200 });

if (presentCost.error) {
  console.log(`     the presentation step costs  ${presentCost.error}  (reported, never gated)`);
} else {
  const direct = /** @type {number} */ (presentCost.direct);
  const viaBlit = /** @type {number} */ (presentCost.viaBlit);
  console.log(
    `     the presentation step costs (item 20, step 2c, landed), ${W}x${H}, ` +
      `${presentCost.frames} frames x ${presentCost.rounds} rounds interleaved:`
  );
  console.log(
    `     straight to the canvas ${direct.toFixed(4)} ms a frame; offscreen then copied ` +
      `${viaBlit.toFixed(4)}; offscreen then copied turned over ${Number(presentCost.viaFlip).toFixed(4)} ` +
      `— the copy the landed step costs is ${(viaBlit - direct).toFixed(4)} ms a frame, and the flip step 2d adds ` +
      `${(Number(presentCost.viaFlip) - viaBlit).toFixed(4)} more  (reported, never gated)`
  );
}

// ── A thousand objects, timed on the card (item 31's millisecond half) ─────────
//
// Item 31 asks for two things and insists they are not confused: **counters that
// are enforced** and **milliseconds that are tracked**. The counters are asserted
// in CI by `tests/instanced-cubes-cost.test.ts`, which reads `cost()` over a
// thousand-object frame and holds it to an exact figure. Milliseconds cannot be
// asserted anywhere — §17 decision 9 settles that wall-clock is *measured on real
// hardware and never gated*, because a flaky perf gate is disabled within a month
// and takes the real signal with it.
//
// So this prints and asserts nothing. It is a reading, taken where a reading can
// honestly be taken, with the device named beside it — which is the only form in
// which a millisecond figure from this project means anything.
const timed = corpus.find((preset) => preset.id === 'core-draw-list');
if (timed) {
  const bytesArrays = Object.fromEntries([...timed.bytes].map(([index, made]) => [index, [...made]]));
  const times = await page.evaluate(
    async ({ id, description, code, block, bytesArrays, values, W, H, frames }) => {
      const generated = new Map();
      description.resources.forEach((/** @type {any} */ r, /** @type {number} */ i) => {
        const source = 'source' in r ? r.source : undefined;
        if (source && bytesArrays[i]) generated.set(i, new Uint8Array(bytesArrays[i]));
      });
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const device = await window.requestWebGPUDevice();
      if (!device) return { error: 'no WebGPU device on the card' };
      const backend = window.createWebGPUBackend(canvas, device);
      if (!backend) return { error: 'no webgpu context' };
      backend.resize(W, H);
      const frame = window.frameOf(id, description, { wgsl: code }, block, undefined, generated);
      const program = backend.program(frame);
      program.setUniforms(values);
      // One drawn and read back first, so compilation and first-use allocation are
      // not counted as frame time.
      program.draw();
      await backend.readPixels();
      /** @type {number[]} */
      const ms = [];
      for (let i = 0; i < frames; i++) {
        const at = performance.now();
        program.setUniforms(values);
        program.draw();
        await backend.readPixels();
        ms.push(performance.now() - at);
      }
      program.dispose();
      backend.dispose();
      ms.sort((a, b) => a - b);
      const at = (/** @type {number} */ q) => ms[Math.min(ms.length - 1, Math.floor(ms.length * q))];
      return { p50: at(0.5), p95: at(0.95), p99: at(0.99), frames: ms.length };
    },
    { id: timed.id, description: timed.description, code: timed.code, block: timed.block, bytesArrays, values: timed.values, W, H, frames: 120 }
  );
  console.log('');
  if (times.error) console.log(`     a thousand objects: ${times.error}`);
  else
    console.log(
      `     a thousand objects on ${card.vendor} / ${card.architecture}, ${W}x${H}, ${times.frames} frames after a warm one:\n` +
        `     p50 ${/** @type {number} */ (times.p50).toFixed(2)} ms, p95 ${/** @type {number} */ (times.p95).toFixed(2)} ms, ` +
        `p99 ${/** @type {number} */ (times.p99).toFixed(2)} ms  (draw plus a full readback, reported and never gated)`
    );
}

await browser.close();
server.close();
rmSync(staging, { recursive: true, force: true });

// The widened list, printed every run whether it is empty or not (item 45, rule 3):
// the presets that cannot be byte-exact across the two backends, with cause and
// readings. Absence means exact, so an empty list says every preset is held strict.
// Each entry is validated against the loaded corpus, so a symptom-shaped cause or an
// id naming no preset reddens this gate rather than surviving to a reviewer.
console.log('');
const isPreset = (/** @type {string} */ id) => corpus.some((one) => one.id === id);
for (const entry of WIDENED) {
  try {
    checkWidened(entry, isPreset);
  } catch (e) {
    say(false, `the widened list  ${String(/** @type {any} */ (e).message || e)}`);
  }
}
printWidened();

console.log(`\n${failures ? `${failures} failed` : 'the card draws this library’s whole corpus'}`);
process.exitCode = failures ? 1 : 0;
