// `npm run example <name>` — build one example and open it in a browser.
//
// An example is a page: it draws through the library's own graphics APIs, which
// exist only in a browser, so running one means serving it and opening it rather
// than executing it under node. The steps are the ones the gates already trust:
//
//   - The example's source is bundled by esbuild, with `@altpsyche/engine`
//     aliased to the door at `index.ts` — the same alias the gates and the test
//     runner reach the door through, so the example imports the package by the
//     name a stranger would and never by a path into a folder.
//   - The bundle is served over `http://localhost`, which is a secure context,
//     so a WebGPU example would have its adapter and a WebGL 2 one has its
//     context. The port is whatever the OS hands back, so two runs do not fight.
//   - The default browser is opened on the served page, and the server stays up
//     until Ctrl-C. A machine with no desktop prints the URL to open by hand.
//
// It builds the bundle once at startup, so a source that will not compile — a
// shader typo, an import the door does not carry — fails here with the error
// rather than in a browser tab with a blank canvas.
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXAMPLES = path.join(ROOT, 'examples');
const esbuild = path.join(ROOT, 'node_modules/.bin/esbuild');
const DOOR = `--alias:@altpsyche/engine=${path.join(ROOT, 'index.ts')}`;

/** The examples that can be opened: a directory under `examples/` with a
 * `main.ts` entry. The runner and its helpers are files here too, so the
 * presence of an entry is what makes a directory an example rather than its
 * name. */
function available() {
  return readdirSync(EXAMPLES)
    .filter((entry) => {
      const dir = path.join(EXAMPLES, entry);
      return statSync(dir).isDirectory() && existsSync(path.join(dir, 'main.ts'));
    })
    .sort();
}

const name = process.argv[2];
const names = available();
if (!name || !names.includes(name)) {
  console.error(name ? `there is no example "${name}".` : 'name an example to open.');
  console.error(`available: ${names.join(', ')}`);
  process.exit(1);
}

const entry = path.join(EXAMPLES, name, 'main.ts');
let bundle;
try {
  bundle = execFileSync(esbuild, [entry, '--bundle', DOOR, '--format=esm'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
} catch {
  // esbuild wrote its diagnostics to this process's stderr already.
  console.error(`\nexample "${name}" did not build.`);
  process.exit(1);
}

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>@altpsyche/engine · ${name}</title>
<style>
  html, body { margin: 0; height: 100%; background: #000; overflow: hidden; }
  canvas { display: block; width: 100vw; height: 100vh; }
</style>
</head>
<body>
<canvas></canvas>
<script type="module" src="/bundle.js"></script>
</body>
</html>`;

const server = createServer((request, response) => {
  if (request.url === '/bundle.js') {
    response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
    response.end(bundle);
    return;
  }
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(page);
});

server.listen(0, '127.0.0.1', () => {
  const { port } = server.address();
  const url = `http://localhost:${port}/`;
  console.log(`example "${name}" is at ${url}`);
  console.log('Ctrl-C to stop.');
  open(url);
});

/** Ask the OS to open the page in the default browser. A failure is not fatal:
 * the URL is already printed, and a headless machine has no browser to open. */
function open(url) {
  const command =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    spawn(command, args, { stdio: 'ignore', detached: true }).unref();
  } catch {
    // Left with the printed URL, which is the fallback a stranger reads anyway.
  }
}

process.on('SIGINT', () => {
  server.close();
  process.exit(0);
});
