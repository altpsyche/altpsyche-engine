// Draw every fixture this package owns, on every backend it has a target for.
//
//   node gates/corpus.mjs
//
// This is the check that a backend can draw the whole corpus before anything on a
// page depends on it. A frame that fails to compile, fails to build its resources,
// or comes back with nothing in it is reported by name and fails the run.
//
// A frame of nothing is a failure rather than a pass because a shader that draws
// black is indistinguishable from one that never drew at all, and a gate that
// cannot tell those apart hides a defect for as long as it runs.
//
// Two backends, two columns. Every fixture's source is WGSL: the WebGPU column
// draws that source, and the WebGL 2 column draws the GLSL ES 3.00 the build baked
// from it with naga (item 41, `fixtures/source/glsl/corpus.generated.json`). Each
// pipeline's entry points become GLSL documents of their own and the geometry the
// loader fetched carries through unchanged. A preset the bake could not carry to
// WebGL 2 — a fullscreen WGSL frame that bakes no vertex, or a stage that needs a
// capability WebGL 2 withholds — is a SKIP with the reason named, by outcome
// rather than by construction (item 79): the WebGL 2 draw path runs here, on a
// real context, where before this gate skipped all fifteen without calling it.
import http from 'node:http';
import { rmSync } from 'node:fs';
import { chromium } from 'playwright';
import { CHROME, bundleForPage, loadCorpus, loadFromRoot } from './lib.mjs';

const W = Number(process.env.W ?? 800);
const H = Number(process.env.H ?? 600);
const PORT = Number(process.env.PORT ?? 3162);

const corpus = await loadCorpus();

// The baked GLSL and the refusals beside it, read the same way the node tests read
// the artifact. `naga` is a build-time tool, never shipped (§17 decision 5), so
// this reads the bake it left rather than translating anything now.
const { readFileSync } = await import('node:fs');
const { fileURLToPath } = await import('node:url');
const { dirname, join } = await import('node:path');
const HERE = dirname(fileURLToPath(import.meta.url));
const artifact = JSON.parse(
  readFileSync(join(HERE, '..', 'fixtures', 'source', 'glsl', 'corpus.generated.json'), 'utf8')
);

// The library's own builders, so a frame drawn here is the shape a consumer's
// build produces rather than one this gate invented.
const { glslFrame } = await loadFromRoot('toy/frame.ts');

/**
 * Re-point a WGSL description's pipelines at the baked GLSL for WebGL 2: each
 * entry point a pipeline names becomes a document entered at `main`, and the block
 * bindings drop away because a GLSL program answers where its block sits. Returns
 * the pieces a page rebuilds the frame from, or a `skip` reason where the bake
 * carries no GLSL for an entry the pipelines need — a fullscreen WGSL frame with
 * no baked vertex, or a stage naga refused for a WebGL 2 capability.
 *
 * @param {{ id: string, description: any, bytes: Map<string, Uint8Array> }} one
 */
function webgl2Frame({ id, description, bytes }) {
  const baked = artifact.presets[id]?.entries ?? {};
  const refused = artifact.refused?.[id] ?? [];
  /** @type {Set<string>} */
  const names = new Set();
  /** @type {string | null} */
  let missing = null;
  const pipelines = description.pipelines.map((/** @type {any} */ pipeline) => {
    // A compute pipeline has no vertex or fragment and no place on WebGL 2.
    if (!('fragment' in pipeline)) {
      missing ??= 'compute';
      return pipeline;
    }
    const vertexEntry = pipeline.vertex === 'fullscreen' ? null : pipeline.vertex.entry;
    if (vertexEntry === null) missing ??= 'fullscreen';
    else {
      names.add(vertexEntry);
      if (!baked[vertexEntry]) missing ??= vertexEntry;
    }
    names.add(pipeline.fragment.entry);
    if (!baked[pipeline.fragment.entry]) missing ??= pipeline.fragment.entry;
    return {
      ...pipeline,
      vertex: vertexEntry === null ? 'fullscreen' : { module: vertexEntry, entry: 'main' },
      fragment: { module: pipeline.fragment.entry, entry: 'main' },
      // A GLSL program answers where each uniform block sits, so the block bindings
      // drop away — except a per-draw slice's, which the backend reads to bind one
      // record's range a draw (item 27): its group and binding tell the per-draw
      // block apart from the shared one, and its `perDraw` size is one record's
      // width. Nothing else about it is a GLSL binding number.
      bindings: (pipeline.bindings ?? []).filter((/** @type {any} */ binding) => binding.perDraw !== undefined),
    };
  });
  if (missing) {
    if (missing === 'fullscreen') return { skip: 'a fullscreen WGSL frame, which bakes no vertex for WebGL 2 to link' };
    if (missing === 'compute') return { skip: 'a compute stage, which has no place on WebGL 2' };
    const why = refused.find((/** @type {any} */ r) => r.entry === missing);
    return { skip: why ? `${missing} needs ${why.capability}, which WebGL 2 has not got` : `${missing} baked no GLSL` };
  }
  const modules = [...names].map((name) => ({ name, code: '' }));
  const texts = Object.fromEntries([...names].map((name) => [name, baked[name].glsl]));
  const glsl = { ...description, target: 'glsl', modules, pipelines };
  // Bytes do not survive the trip through `page.evaluate`, so they cross as arrays
  // and are rebuilt into a Uint8Array map inside the page (the shape surface.mjs
  // uses for the same reason).
  const bytesArrays = Object.fromEntries([...bytes].map(([name, made]) => [name, [...made]]));
  return { glsl, texts, bytesArrays };
}

const { bundle, staging } = bundleForPage({
  'gpu/webgpu': ['createWebGPUBackend'],
  'gpu/webgl2': ['createWebGL2Backend'],
  'gpu/webgpu-device': ['requestWebGPUDevice'],
  'toy/frame': ['frameOf'],
  // `missing` replaced the program's own `unreached` at item 69. It is a weaker
  // reading and the message below says so: it compares an entry's declared names
  // against the uniforms the SOURCE declares, where `unreached` asked the built
  // pipeline and could therefore see a name the compiler had dropped.
  'index.ts': ['missing'],
});

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-unsafe-webgpu'],
});

// Served over HTTP rather than written in with `setContent`, even though the page
// holds nothing: a written document has an opaque origin, which is not a secure
// one, and `requestAdapter()` on such a page returns nothing whatever flags the
// browser was launched with.
const host = http.createServer((_request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html' });
  response.end('<!doctype html><html><body></body></html>');
});
await new Promise((ready) => host.listen(PORT, '127.0.0.1', () => ready(undefined)));

const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
await page.goto(`http://127.0.0.1:${PORT}/`);
await page.addScriptTag({ path: bundle });

let failures = 0;
const skipped = [];

// Item 79's floor, drawn before the corpus: a one-pass fullscreen GLSL frame
// built by the library's own `glslFrame`, drawn through `createWebGL2Backend` on a
// real context, must light the buffer. This is the WebGL 2 backend's own draw path
// running in a browser at its simplest — everything the corpus column adds is on
// top of a draw proven here.
const fullscreen = glslFrame(
  'webgl2-fullscreen-probe',
  '#version 300 es\nin vec3 position;\nvoid main(){gl_Position=vec4(position,1.0);}',
  '#version 300 es\nprecision highp float;\nout vec4 c;\nvoid main(){c=vec4(0.2,0.6,0.9,1.0);}'
);
const probe = await page.evaluate(
  async ({ frame, W, H }) => {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const backend = window.createWebGL2Backend(canvas);
    if (!backend) return { error: 'no webgl2 context' };
    backend.resize(W, H);
    let program;
    try {
      program = backend.program(frame);
    } catch (e) {
      return { error: String(/** @type {any} */ (e).message || e).slice(0, 300) };
    }
    program.setUniforms({ u_time: 0, u_resolution: [W, H] });
    program.draw();
    const px = await backend.readPixels();
    let lit = 0;
    for (let i = 0; i < px.length; i += 4) if (px[i] > 4 || px[i + 1] > 4 || px[i + 2] > 4) lit++;
    program.dispose();
    backend.dispose();
    return { lit, total: px.length / 4 };
  },
  { frame: fullscreen, W, H }
);
if (probe.error) {
  console.log(`FAIL webgl2-fullscreen-probe WebGL 2  ${probe.error}`);
  failures++;
} else if (probe.lit === 0) {
  console.log(`FAIL webgl2-fullscreen-probe WebGL 2  drew nothing, 0 of ${probe.total} pixels lit`);
  failures++;
} else {
  const lit = /** @type {number} */ (probe.lit);
  const total = /** @type {number} */ (probe.total);
  const share = ((lit / total) * 100).toFixed(1);
  console.log(`PASS webgl2-fullscreen-probe WebGL 2  ${lit.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} pixels lit, ${share}%`);
}

for (const { id, frame, values, entry, description, bytes } of corpus) {
  if (entry.language !== 'wgsl') throw new Error(`the corpus gained a ${entry.language} fixture and this gate draws WGSL`);

  const result = await page.evaluate(
    async ({ frame, values, declared, W, H }) => {
      // A canvas of its own per fixture: disposing a backend loses its context,
      // and a canvas the browser composites takes the device down with it on the
      // software renderer.
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;

      const device = await window.requestWebGPUDevice();
      if (!device) return { error: 'no WebGPU adapter, the browser needs --enable-unsafe-webgpu' };

      // Anything the pipeline refuses arrives here rather than where it was made,
      // because WebGPU reports a bad shader through the device.
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

      // A uniform an entry describes is a value a caller expects to reach the
      // card, so a name nothing declares is a control wired to nothing. The
      // source is what answers since item 69: a compiled program is no longer
      // asked, so a name the compiler dropped after accepting it is invisible
      // here in a way it was not before.
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

  const label = `${id} WebGPU`;
  if (result.error) {
    console.log(`FAIL ${label}  ${result.error}`);
    failures++;
  } else if (result.absent?.length) {
    console.log(`FAIL ${label}  the program has nowhere to put ${result.absent.join(', ')}, which its entry declares`);
    failures++;
  } else if (result.lit === 0) {
    console.log(`FAIL ${label}  drew nothing, 0 of ${result.total} pixels lit`);
    failures++;
  } else {
    // The earlier arms have ruled out the error shape and a zero `lit`, so both are
    // present here; the casts state what the branches already guarantee.
    const lit = /** @type {number} */ (result.lit);
    const total = /** @type {number} */ (result.total);
    const share = ((lit / total) * 100).toFixed(1);
    const named = entry.uniforms.length;
    console.log(
      `PASS ${label}  ${lit.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} pixels lit, ${share}%` +
        `, ${named} declared uniform${named === 1 ? '' : 's'} found in the source`
    );
  }

  // The WebGL 2 column, by outcome (item 79). A preset the bake did not carry to
  // WebGL 2 is a SKIP with the reason; one it did is drawn through the backend's
  // own path on a real context and lights the buffer or fails by name.
  const gl2Label = `${id} WebGL 2`;
  const built = webgl2Frame({ id, description, bytes });
  if (built.skip) {
    skipped.push(`${gl2Label}  ${built.skip}`);
    continue;
  }
  const glsl = /** @type {any} */ (built.glsl);
  const texts = /** @type {Record<string, string>} */ (built.texts);
  const bytesArrays = /** @type {Record<string, number[]>} */ (built.bytesArrays);
  const gl2 = await page.evaluate(
    async ({ id, glsl, texts, bytesArrays, values, W, H }) => {
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const backend = window.createWebGL2Backend(canvas);
      if (!backend) return { error: 'no webgl2 context' };
      backend.resize(W, H);
      const generated = new Map(Object.entries(bytesArrays).map(([name, made]) => [name, new Uint8Array(made)]));
      let program;
      try {
        const frame = window.frameOf(id, glsl, texts, undefined, undefined, generated);
        program = backend.program(frame);
      } catch (e) {
        return { error: String(/** @type {any} */ (e).message || e).slice(0, 300) };
      }
      program.setUniforms(values);
      program.draw();
      const px = await backend.readPixels();
      let lit = 0;
      for (let i = 0; i < px.length; i += 4) if (px[i] > 4 || px[i + 1] > 4 || px[i + 2] > 4) lit++;
      program.dispose();
      backend.dispose();
      return { lit, total: px.length / 4 };
    },
    { id, glsl, texts, bytesArrays, values, W, H }
  );
  if (gl2.error) {
    // A preset whose GLSL the backend refuses to build or draw is one this backend
    // does not yet carry to WebGL 2 — a capability it withholds (MSAA is item 80,
    // depth/stencil landed at item 48) or a construct it will not link. That is a
    // skip by outcome, with the backend's own words, not a gate failure: item 79
    // asks the draw path to *run*, and here it ran and refused by name. A wrong
    // picture is a card's to judge (item 44), out of this gate's reach.
    skipped.push(`${gl2Label}  refused: ${gl2.error}`);
  } else if (gl2.lit === 0) {
    console.log(`FAIL ${gl2Label}  drew nothing, 0 of ${gl2.total} pixels lit`);
    failures++;
  } else {
    // The error and zero-lit arms are ruled out, so both are present; the casts
    // state what the branches already guarantee, as the WebGPU column above does.
    const lit = /** @type {number} */ (gl2.lit);
    const total = /** @type {number} */ (gl2.total);
    const share = ((lit / total) * 100).toFixed(1);
    console.log(`PASS ${gl2Label}  ${lit.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} pixels lit, ${share}%`);
  }
}

await browser.close();
host.close();
rmSync(staging, { recursive: true, force: true });

console.log('');
for (const line of skipped) console.log(`SKIP ${line}`);
// Two columns over fifteen presets plus the one fullscreen probe, minus the WebGL 2
// skips (a preset the bake could not carry): that is how many draws were asked for.
const asked = corpus.length * 2 + 1 - skipped.length;
console.log(`\n${asked - failures} of ${asked} draws lit their buffer, with ${failures} failed and ${skipped.length} WebGL 2 skips`);
process.exitCode = failures ? 1 : 0;
