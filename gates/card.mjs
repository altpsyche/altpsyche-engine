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
  'toy/frame': ['frameOf', 'glslFrameOf', 'glslFrame'],
  // Decision 6's join, on a machine that actually has WebGPU (item 62).
  'gpu/select': ['selectBackend'],
  // `missing` replaced the program's own `unreached` at item 69; a source reading
  // rather than a question put to the built pipeline.
  'index.ts': ['missing'],
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
const SCENE_TIER = ['core-scene', 'core-draw-list', 'core-material'];
console.log('');
for (const one of corpus.filter((preset) => SCENE_TIER.includes(preset.id))) {
  // Bytes do not survive `page.evaluate`, so they cross as arrays keyed by the
  // resource's index — its handle since item 87 — and are rebuilt inside the page.
  const bytesArrays = Object.fromEntries([...one.bytes].map(([index, made]) => [index, [...made]]));
  const both = await page.evaluate(
    async ({ id, description, code, block, bytesArrays, values, W, H }) => {
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

      return window.compareFrames(fromGPU, fromGL, W, H);
    },
    { id: one.id, description: one.description, code: one.code, block: one.block, bytesArrays, values: one.values, W, H }
  );

  const label = `${one.id} on both backends`;
  if (both.skip) say(true, `${label}  skipped: ${both.skip}`);
  else if (both.error) say(false, `${label}  ${both.error}`);
  else {
    // **Asserted, since item 107 closed.** It reported rather than asserted while the
    // two backends drew different pictures; the mirror is gone and the residual is
    // now one channel of rounding, so this holds the same bar the gradient control
    // above does. Three numbers print whether it passes or not: a seam nobody prints
    // is a seam nobody looks at, and the average that would bury it does not exist.
    say(
      both.maxDelta <= TOLERANCE,
      `${label}  hard jumps ${both.hardJumps.a} against ${both.hardJumps.b}, ` +
        `worst ${both.maxDelta}, ${both.differing.toLocaleString('en-US')} of ${both.channels.toLocaleString('en-US')} channels differ`
    );
  }
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
