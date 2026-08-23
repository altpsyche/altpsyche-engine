// Every gate in this library that needs a browser, run one after another.
//
//   npm run gate:browser
//
// The library's node tests are what a consumer runs, and they need nothing but
// node. These need a browser, so they are a second script rather than part of the
// first: installing a browser to use a rendering library would be a cost paid by
// everybody to prove something only this repository has to prove.
//
// Every gate here runs even when an earlier one failed. A run that stops at its
// first failure loses every reading behind it, which is the expensive kind of
// mistake: one red gate hides four green ones and the next run starts from
// nothing. Each gate prints its own readings as it goes and this prints which of
// them passed at the end.
//
// A gate that needs a real graphics card is not in this list. Every headless
// launch reaches the software renderer whatever the flags say, so such a gate
// needs a desktop session and is run by hand from its own file.
//
// One gate can be run on its own, which is what a session iterating on it does:
//
//   node gates/browser-pin.mjs
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// The pin comes first because every gate under it compares a reading against one
// taken earlier, and a browser that moved without a commit makes every one of
// those comparisons mean something else.
const GATES = ['browser-pin.mjs', 'trace-contract.mjs', 'surface.mjs'];

const results = [];
for (const gate of GATES) {
  console.log(`\n=== ${gate} ===`);
  const started = Date.now();
  const run = spawnSync(process.execPath, [path.join(HERE, gate)], { stdio: 'inherit' });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  results.push({ gate, ok: run.status === 0, seconds });
}

console.log('');
for (const { gate, ok, seconds } of results) console.log(`${ok ? 'PASS' : 'FAIL'} ${gate} in ${seconds}s`);
const failed = results.filter((result) => !result.ok);
console.log(
  failed.length === 0
    ? `${results.length} of ${results.length} browser gates passed`
    : `${failed.length} of ${results.length} browser gates failed: ${failed.map((result) => result.gate).join(', ')}`
);
process.exitCode = failed.length === 0 ? 0 : 1;
