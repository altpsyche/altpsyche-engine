// A reading of the graphics device in front of you, printed as a row you can paste
// into a pull request against docs/DEVICES.md.
//
//   npm run device-report
//
// This is not a gate. It asserts nothing and fails nothing; it opens a browser,
// asks `probe()` what the device is, and prints the row `readingRow()` formats. A
// stranger runs it on their own machine and contributes a reading nobody here can
// take, because the package's device readings are evidence gathered from hardware
// rather than a matrix written down (RoadToPureEngine.md §17 decision 11).
//
// It launches headed with the card flags for the same reason gate:card does: every
// headless launch on this Linux driver reaches SwiftShader whatever the flags say,
// so a real adapter needs a window plus `--enable-features=Vulkan` and
// `--ozone-platform=x11` together (§17, three notes). On a machine with its own
// display and card that is exactly what a stranger wants. The page is served over
// HTTP because `navigator.gpu` is absent on an opaque origin.
//
// The reading it prints can be a SwiftShader row, and that is not a failure: an
// honest software-renderer reading — reported, returned, and NOT SwiftShader
// failing — is a row worth having, because it is what most CI and many headless
// setups actually see. The point is a paste-able reading, not a green light.
import http from 'node:http';
import { rmSync } from 'node:fs';
import { chromium } from 'playwright';
import { CARD_ARGS, CHROME, bundleForPage } from './lib.mjs';

const PORT = Number(process.env.PORT ?? 3164);

// The door's own `probe` and `readingRow`, bundled and hung off `window`, so this
// prints exactly what a consumer's `probe()` returns rather than a restatement of
// it that could drift from the shipped one.
const { bundle, staging } = bundleForPage({
  'index.ts': ['probe', 'readingRow'],
});

const server = http.createServer((_request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html' });
  response.end('<!doctype html><html><body style="margin:0"></body></html>');
});
await new Promise((ready) => server.listen(PORT, '127.0.0.1', ready));

const browser = await chromium.launch({ executablePath: CHROME, headless: false, args: CARD_ARGS });
const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
page.on('console', (message) => console.log(`  [page] ${message.text()}`));
await page.goto(`http://127.0.0.1:${PORT}/`);
await page.addScriptTag({ path: bundle });

const row = await page.evaluate(async () => {
  const reading = await window.probe();
  return { row: window.readingRow(reading), reading };
});

console.log('\n--- paste this into docs/DEVICES.md, one dated row ---\n');
console.log(row.row);
console.log('\n--- as JSON ---\n');
console.log(JSON.stringify(row.reading, null, 2));

await browser.close();
server.close();
rmSync(staging, { recursive: true, force: true });
