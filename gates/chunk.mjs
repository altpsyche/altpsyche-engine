/**
 * Item 42's bundle analysis: proof the on-demand translator is absent from the
 * first download.
 *
 * The editing path (`resource/editing.ts`) reaches the translator chunk
 * (`resource/translator.ts`) only through `await import()`. §9.1 asks that this
 * keep the translator out of a page's first download — a scene-tier consumer, whose
 * materials were translated at build time (item 41), fetches it never; the toy-tier
 * editor fetches it once, on demand. A bundle either splits it off or it does not,
 * and only a bundler can say which. So this step runs one: it bundles an entry that
 * imports the editing path exactly as an app would, with code splitting on, and
 * reads esbuild's metafile to answer two questions a page's download depends on.
 *
 *   1. Is the translator its own output chunk, reached from the entry by a
 *      `dynamic-import` edge rather than a static one? (If static, the whole thing
 *      lands in the first download.)
 *   2. Is the translator's source absent from the entry chunk itself — so the bytes
 *      a page downloads first do not carry it?
 *
 * Both must hold. It prints a one-line-per-output summary and a JSON blob the test
 * ([tests/editing-chunk.test.ts](../tests/editing-chunk.test.ts)) reads back, then
 * exits 0 on a clean split and 1 on a translator that leaked into the first chunk.
 *
 * esbuild is a dev tool (a devDependency), never shipped, so this is a gate the way
 * `translate.mjs` is: run by the fast suite through a subprocess, not by a consumer.
 * TypeScript source uses `.js` specifiers that resolve to `.ts` on disk (NodeNext's
 * shape), which esbuild's resolver does not do on its own, so a tiny plugin maps
 * a relative `./x.js` to `./x.ts` where the `.ts` exists.
 */
import { build } from 'esbuild';
import { existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');

/** Resolve `./x.js` to `./x.ts` where the source is TypeScript, so esbuild bundles
 * the tree as written. Relative specifiers only — bare imports are left alone. */
/** @type {import('esbuild').Plugin} */
const tsFromJs = {
  name: 'ts-from-js',
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /^\.\.?\// }, (args) => {
      if (!args.importer) return null; // the entry stdin resolves against resolveDir
      const asTs = resolve(args.resolveDir, args.path.replace(/\.js$/, '.ts'));
      if (args.path.endsWith('.js') && existsSync(asTs)) return { path: asTs };
      return null;
    });
  },
};

export async function analyseChunk() {
  const result = await build({
    // An app's first-download entry: it imports the editing path the way a toy-tier
    // editor would. The translator is reached only from inside editing.ts, and only
    // by await import(), so a clean bundler must split it out.
    stdin: {
      contents: `import { translateForEditing } from './resource/editing.js';
                 globalThis.__editing = translateForEditing;`,
      resolveDir: ROOT,
      sourcefile: 'first-download.js',
      loader: 'js',
    },
    bundle: true,
    splitting: true,
    format: 'esm',
    outdir: 'out', // virtual — nothing is written
    write: false,
    metafile: true,
    logLevel: 'silent',
    plugins: [tsFromJs],
  });

  const outputs = result.metafile.outputs;
  /** @param {string} input */
  const isTranslator = (input) => input.replace(/\\/g, '/').endsWith('resource/translator.ts');

  // The entry chunk is the one esbuild marks with our stdin sourcefile as its entryPoint.
  const [entryFile, entryOut] = Object.entries(outputs).find(([, o]) => o.entryPoint === 'first-download.js') ?? [];
  // entryOut is defined exactly when entryFile is — one tuple — so naming both here
  // narrows entryOut without adding a case that can fire on its own.
  if (!entryFile || !entryOut) throw new Error('no entry chunk in the bundle');

  // The translator chunk is the output whose inputs include resource/translator.ts.
  const translatorFile = Object.keys(outputs).find((f) => Object.keys(outputs[f].inputs).some(isTranslator));

  const entryCarriesTranslator = Object.keys(entryOut.inputs).some(isTranslator);
  const dynamicEdge = entryOut.imports.find(
    (imp) => imp.path === translatorFile && imp.kind === 'dynamic-import',
  );

  const summary = {
    entryChunk: entryFile,
    translatorChunk: translatorFile ?? null,
    // The two facts the page's first download depends on.
    translatorIsOwnChunk: Boolean(translatorFile) && translatorFile !== entryFile,
    reachedByDynamicImport: Boolean(dynamicEdge),
    absentFromEntryChunk: !entryCarriesTranslator,
  };

  return summary;
}

/**
 * The second reading: what a page actually downloads.
 *
 * The claim the door's asynchrony exists for is that a browser fetches one backend and
 * never the other, and a line count is no evidence of it — this bundles the door the way
 * a consumer app does, with splitting and minification on, and reports each output's
 * bytes over the wire. The gzip is taken here rather than guessed because a reader
 * comparing this against another library is comparing transfer sizes.
 *
 * What it asserts is the split; what it prints is the size. A byte count is not gated: a
 * gate that failed on a kilobyte would be a gate nobody could keep green, and the honest
 * shape of the claim is "each backend is a chunk of its own, absent from the first
 * download", which is a fact about the graph rather than about a number.
 */
export async function analyseDownload() {
  const result = await build({
    // What a page's own module looks like: the door, and the calls a first page makes.
    stdin: {
      contents: `import { createSurface, wgslFrame, uniformBlockOf } from './index.js';
                 globalThis.__page = [createSurface, wgslFrame, uniformBlockOf];`,
      resolveDir: ROOT,
      sourcefile: 'page.js',
      loader: 'js',
    },
    bundle: true,
    splitting: true,
    minify: true,
    format: 'esm',
    outdir: 'out',
    write: false,
    metafile: true,
    logLevel: 'silent',
    plugins: [tsFromJs],
  });

  const outputs = result.metafile.outputs;
  /** @param {string} suffix */
  const chunkCarrying = (suffix) =>
    Object.keys(outputs).find((file) =>
      Object.keys(outputs[file].inputs).some((input) => input.replace(/\\/g, '/').endsWith(suffix)),
    );

  const [entryFile, entryOut] = Object.entries(outputs).find(([, o]) => o.entryPoint === 'page.js') ?? [];
  if (!entryFile || !entryOut) throw new Error('no entry chunk in the bundle');

  const gzipped = new Map(
    result.outputFiles.map((file) => [file.path.replace(/\\/g, '/').replace(/^.*\/out\//, 'out/'), gzipSync(file.contents).byteLength]),
  );

  /** @param {string} file */
  const sizeOf = (file) => ({ file, bytes: outputs[file].bytes, gzip: gzipped.get(file) ?? null });

  const webgpu = chunkCarrying('gpu/webgpu.ts');
  const webgl2 = chunkCarrying('gpu/webgl2.ts');
  /** @param {string | undefined} file */
  const separate = (file) => Boolean(file) && file !== entryFile;

  return {
    entry: sizeOf(entryFile),
    webgpu: webgpu ? sizeOf(webgpu) : null,
    webgl2: webgl2 ? sizeOf(webgl2) : null,
    others: Object.keys(outputs)
      .filter((file) => file !== entryFile && file !== webgpu && file !== webgl2)
      .map(sizeOf),
    // The facts, as opposed to the figures.
    backendsAreOwnChunks: separate(webgpu) && separate(webgl2) && webgpu !== webgl2,
    backendsAbsentFromEntry: !Object.keys(entryOut.inputs).some((input) =>
      /gpu\/(webgpu|webgl2)\.ts$/.test(input.replace(/\\/g, '/')),
    ),
    reachedByDynamicImport: [webgpu, webgl2].every((file) =>
      entryOut.imports.some((imp) => imp.path === file && imp.kind === 'dynamic-import'),
    ),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const summary = await analyseChunk();
  const outs = summary;
  console.log(`entry chunk:      ${outs.entryChunk}`);
  console.log(`translator chunk: ${outs.translatorChunk}`);
  console.log(`  its own chunk, not the entry's:  ${outs.translatorIsOwnChunk}`);
  console.log(`  reached by await import():        ${outs.reachedByDynamicImport}`);
  console.log(`  absent from the first download:   ${outs.absentFromEntryChunk}`);
  const clean = outs.translatorIsOwnChunk && outs.reachedByDynamicImport && outs.absentFromEntryChunk;
  console.log(`\nJSON ${JSON.stringify(summary)}`);
  if (!clean) {
    console.error('\nthe translator leaked into the first download; the split is not clean');
    process.exit(1);
  }
  console.log('\nthe translator is a separate chunk, absent from the first download');

  const download = await analyseDownload();
  /** @param {{ file: string, bytes: number, gzip: number | null }} one */
  const row = (one) => `  ${one.file.padEnd(34)} ${String(one.bytes).padStart(7)} B  ${String(one.gzip ?? '?').padStart(6)} B gzipped`;
  console.log('\nwhat a page downloads, minified, splitting on:');
  console.log(row(download.entry) + '   <- the first download');
  if (download.webgl2) console.log(row(download.webgl2) + '   <- WebGL 2, fetched only where it draws');
  if (download.webgpu) console.log(row(download.webgpu) + '   <- WebGPU, likewise');
  for (const one of download.others) console.log(row(one));
  console.log(`  each backend its own chunk: ${download.backendsAreOwnChunks}`);
  console.log(`  absent from the first download: ${download.backendsAbsentFromEntry}`);
  console.log(`  reached by await import(): ${download.reachedByDynamicImport}`);
  console.log(`\nDOWNLOAD ${JSON.stringify(download)}`);
  if (!download.backendsAreOwnChunks || !download.backendsAbsentFromEntry || !download.reachedByDynamicImport) {
    console.error('\na backend is in the first download; the whole point of the async door is gone');
    process.exit(1);
  }
}
