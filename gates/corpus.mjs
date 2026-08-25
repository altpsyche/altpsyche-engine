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
// A backend a fixture cannot go on is said out loud rather than left out. Every
// fixture here is written in WGSL, so every one of them skips WebGL 2 by name: a
// gate that quietly covers less than it did is worse than a gate that covers less
// and says so.
import http from 'node:http';
import { rmSync } from 'node:fs';
import { chromium } from 'playwright';
import { CHROME, bundleForPage, loadCorpus } from './lib.mjs';

const W = Number(process.env.W ?? 800);
const H = Number(process.env.H ?? 600);
const PORT = Number(process.env.PORT ?? 3162);

const corpus = await loadCorpus();

const { bundle, staging } = bundleForPage({
  'gpu/webgpu': ['createWebGPUBackend'],
  'gpu/webgl2': ['createWebGL2Backend'],
  'gpu/webgpu-device': ['requestWebGPUDevice'],
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
await new Promise((ready) => host.listen(PORT, '127.0.0.1', () => ready()));

const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
await page.goto(`http://127.0.0.1:${PORT}/`);
await page.addScriptTag({ path: bundle });

let failures = 0;
const skipped = [];

for (const { id, frame, values, entry } of corpus) {
  if (entry.language !== 'wgsl') throw new Error(`the corpus gained a ${entry.language} fixture and this gate draws WGSL`);
  skipped.push(`${id} WebGL 2  written in WGSL, which has no GLSL to draw`);

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
      const refusals = [];
      device.addEventListener('uncapturederror', (event) => refusals.push(String(event.error.message)));

      const backend = window.createWebGPUBackend(canvas, device);
      if (!backend) return { error: 'no webgpu context' };

      backend.resize(W, H);
      let program;
      try {
        program = backend.program(frame);
      } catch (e) {
        return { error: String(e.message || e).slice(0, 300) };
      }

      // A uniform an entry describes is a value a caller expects to reach the
      // card, so a name the program has nowhere to put is a control wired to
      // nothing. The built pipeline is asked rather than the source text.
      const absent = program.unreached(declared);

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
    const share = ((result.lit / result.total) * 100).toFixed(1);
    const named = entry.uniforms.length;
    console.log(
      `PASS ${label}  ${result.lit.toLocaleString('en-US')} of ${result.total.toLocaleString('en-US')} pixels lit, ${share}%` +
        `, ${named} declared uniform${named === 1 ? '' : 's'} reached`
    );
  }
}

await browser.close();
host.close();
rmSync(staging, { recursive: true, force: true });

console.log('');
for (const line of skipped) console.log(`SKIP ${line}`);
console.log(`\n${corpus.length - failures} of ${corpus.length} drew, with ${skipped.length} skips`);
process.exitCode = failures ? 1 : 0;
