// Hold the recording double to what a real graphics card is actually asked.
//
//   node gates/trace-contract.mjs
//
// The node tests prove the backend makes the right calls by handing it a device
// that writes them down. That proof is only worth what the double is worth, and a
// double nothing checks is a second copy of this package's own assumptions: a
// restated shape cannot disagree with itself, so nothing notices when it drifts
// from the real thing.
//
// So this draws every fixture twice. Once in node against the double, once in a
// browser against a real device wrapped in the same recorder, and the two traces
// are compared call for call. `trace/trace.ts` is that one recorder and it says
// which fields of each call are compared, which is the flat reading taken on the
// way through rather than a descriptor holding objects the driver made.
//
// The frame each fixture draws is derived from its source and its declaration by
// the same code any consumer's build would use. Assembling a description here
// instead would make this a gate holding a device to a shape this file invented,
// which is the one thing a contract must not be.
//
// What it does not catch, measured rather than assumed. The recorder is shared, so
// a change to the recording itself moves both traces together and the gate stays
// green: what this compares is the double's answers against a real device's, not
// the recorder against itself. And a device answer the backend only re-reads
// across frames is invisible to a contract that draws one, which was measured by
// making the double's texture report a width of 0 and getting agreement back,
// because the backend reads that width when it decides whether to rebuild the
// target and one draw never asks twice. The mutation that does show is the double
// claiming a canvas a reader can see, which puts a copyTextureToTexture in the
// trace the device never makes.
//
// The canvas is detached on both sides. A page that configures a canvas for
// WebGPU can no longer wait on the card in this browser, so a run collecting
// pixels must not configure one, and a detached canvas is what the double reports
// as well, so the two agree about a call neither of them makes.
import http from 'node:http';
import { rmSync } from 'node:fs';
import { chromium } from 'playwright';
import { CHROME, bundleForPage, loadCorpus, loadFromRoot } from './lib.mjs';

const W = 800;
const H = 600;
const PORT = Number(process.env.PORT ?? 3160);

// The software renderer, asked for rather than accepted: a reading compared
// against one taken earlier has to come off the same graphics stack, and every
// headless launch reaches this one whatever the flags say.
const SOFTWARE_ARGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--enable-unsafe-webgpu',
];

/** The trace the double records for one fixture, drawn through exactly the
 * sequence the page below draws it through. A step in one and not the other is a
 * difference the contract would report as the device's, which is the one way this
 * gate can lie. */
async function traceOffTheDouble(engine, backends, fake, frame, values) {
  const gpu = fake.createFakeGPU({ connected: false });
  gpu.mapped = fake.paddedFrame(W, H);
  const backend = backends.createWebGPUBackend(gpu.canvas, gpu.device);
  if (!backend) throw new Error('the double gave no backend');

  backend.resize(W, H);
  const program = backend.program(frame);
  program.setUniforms(values);
  program.draw();
  await backend.readPixels();
  program.dispose();
  backend.dispose();

  return engine.projectTrace(gpu.trace);
}

async function main() {
  const engine = await loadFromRoot('index.ts');
  const backends = await loadFromRoot('gpu/webgpu.ts');
  const fake = await loadFromRoot('tests/support/fake-gpu.ts');
  const corpus = await loadCorpus();

  const { bundle, staging } = bundleForPage({
    'gpu/webgpu.ts': ['createWebGPUBackend'],
    'gpu/webgpu-device.ts': ['requestWebGPUDevice'],
    'trace/trace.ts': ['projectTrace', 'wrapDevice'],
  });

  const browser = await chromium.launch({ executablePath: CHROME, args: SOFTWARE_ARGS });

  // Served over HTTP rather than written in with `setContent`: a written document
  // has an opaque origin, which is not a secure one, and `requestAdapter()` on
  // such a page returns nothing whatever flags the browser was launched with.
  const host = http.createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end('<!doctype html><html><body></body></html>');
  });
  await new Promise((ready) => host.listen(PORT, '127.0.0.1', () => ready()));

  const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.addScriptTag({ path: bundle });

  let failures = 0;

  for (const { id, frame, values } of corpus) {
    const expected = await traceOffTheDouble(engine, backends, fake, frame, values);

    const result = await page.evaluate(
      async ({ frame, values, W, H }) => {
        const device = await window.requestWebGPUDevice();
        if (!device) return { error: 'no WebGPU adapter, the browser needs --enable-unsafe-webgpu' };

        const trace = [];
        const recorded = window.wrapDevice(device, trace);

        // A canvas of its own per fixture, and never in the document: disposing a
        // backend loses its context, and a canvas the browser composites takes
        // the device down with it on the software renderer.
        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;

        const backend = window.createWebGPUBackend(canvas, recorded);
        if (!backend) return { error: 'no webgpu context' };

        backend.resize(W, H);
        try {
          const program = backend.program(frame);
          program.setUniforms(values);
          program.draw();
          await backend.readPixels();
          program.dispose();
          backend.dispose();
        } catch (e) {
          return { error: String(e?.message ?? e).slice(0, 300) };
        }

        return { trace: window.projectTrace(trace) };
      },
      { frame, values, W, H }
    );

    if (result.error || !result.trace) {
      console.log(`FAIL ${id}  ${result.error ?? 'the page returned no trace'}`);
      failures++;
      continue;
    }

    const differences = engine.compareTraces(expected, result.trace);
    if (differences.length) {
      console.log(
        `FAIL ${id}  ${differences.length} difference${differences.length === 1 ? '' : 's'} over ${expected.length} calls`
      );
      for (const difference of differences.slice(0, 12)) console.log(`     ${difference}`);
      if (differences.length > 12) console.log(`     and ${differences.length - 12} more`);
      failures++;
      continue;
    }

    console.log(`PASS ${id}  ${expected.length} calls agree, the double and the device call for call`);
  }

  await browser.close();
  host.close();
  rmSync(staging, { recursive: true, force: true });

  const total = corpus.length;
  console.log(`\n${total - failures} of ${total} agree`);
  process.exitCode = failures ? 1 : 0;
}

await main();
