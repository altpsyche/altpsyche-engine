// Says which browser this library's gates are measuring with, and proves it opens.
//
// Every other gate here compares a reading against one taken earlier, and a
// browser that changed without a commit makes that comparison meaningless. This
// prints the pin and the build so a moved browser arrives as a line in a diff
// rather than as an unexplained reading somewhere downstream.
//
//   node gates/browser-pin.mjs
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { CHROME, ROOT, bundleForPage } from './lib.mjs';
import { rmSync } from 'node:fs';

const declared = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).devDependencies.playwright;
const installed = JSON.parse(
  readFileSync(path.join(ROOT, 'node_modules/playwright/package.json'), 'utf8')
).version;
console.log(`playwright ${installed}, declared ${declared}`);
console.log(`browser ${CHROME}`);

const browser = await chromium.launch({ executablePath: CHROME });
let failures = 0;
try {
  const page = await browser.newPage();
  const version = browser.version();
  console.log(`build ${version}`);

  // The bundler is proved here rather than in the first gate that needs it,
  // because a gate that cannot compile the library reports nothing about the
  // library and everything about the toolchain.
  const { bundle, staging } = bundleForPage({ 'engine/maths.ts': ['vec3'] });
  try {
    await page.addScriptTag({ path: bundle });
    const measured = await page.evaluate(() => window.vec3.magnitude(window.vec3(3, 4, 0)));
    const ok = Math.abs(measured - 5) < 1e-9;
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'} the library's own code ran in the page, and a vector measures ${measured}`);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
} catch (error) {
  failures++;
  console.log(`FAIL ${String(error.message).split('\n')[0]}`);
} finally {
  await browser.close().catch(() => {});
}

console.log(failures === 0 ? 'the browser opens and runs this library' : `${failures} failed`);
process.exitCode = failures === 0 ? 0 : 1;
