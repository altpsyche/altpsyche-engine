#!/usr/bin/env bash
# Installs this library somewhere outside its own repository and asks the installed
# copy two questions. What is installed is either the working tree, packed here, or
# a version off the registry, named as the second argument.
#
# Installing rather than importing the sources is the whole point. It reads `dist`
# and the `exports` field the way a consumer's tooling will, so a file missing from
# `files` or an entry pointing at nothing fails here and nowhere else. It runs
# outside the repository so nothing resolves through it by accident.
#
# The first question is what a consumer can build with it, which is the check beside
# the tests, run through tsx. The second question exists because the first one cannot
# fail the way that matters: tsx resolves a relative import with no extension, so a
# `dist` only a bundler could load passed this check for every version published.
#
# The third question is what a consumer's BUNDLER makes of it, and it is here because
# the first two both passed over a defect that shipped. `export *` on the door left
# esbuild a lazy namespace it then never initialised, so an installed consumer that
# bundled — which is most of them, Vite included — read `undefined` out of every
# re-exported constant and got a description naming a document with no name. Plain
# node was fine, tsx was fine, 661 tests were fine. Nothing that did not bundle could
# see it.
# Plain node is stricter, and asking it to import the package by name is what
# catches a directory import node will not follow.
#
# A published version is worth running through the same pair as a packed one,
# because the two can differ: what a workflow built is not what is on this disk, and
# the thing a consumer installs is the registry's copy rather than either.
#
# Packing compiles first, through the `prepack` script rather than a line here, so
# every path that produces a tarball carries a library built from the tree it was
# packed from. The output directory is not committed, so without that a run on a
# fresh clone packs the licence, the readme and the manifest and nothing else: this
# gate said `it carries: LICENSE README.md package.json` on a runner and passed
# locally in the same commit, because a local checkout had a stale build lying about.
#
#   gates/pack.sh                              # the working tree
#   gates/pack.sh '' @altpsyche/engine@0.2.0   # what is published
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work="${1:-}"
work="${work:-$(mktemp -d)}"
spec="${2:-}"

if [ -z "$spec" ]; then
  cd "$repo"
  tarball="$(npm pack --silent | tail -1)"
  trap 'rm -f "$repo/$tarball"' EXIT
fi

rm -rf "$work" && mkdir -p "$work"
[ -z "$spec" ] && cp "$repo/$tarball" "$work/"
cp "$repo/tests/support/fake-gpu.ts" "$work/fake-gpu.ts"
sed "s#'./support/fake-gpu'#'./fake-gpu'#" "$repo/tests/consumer-check.ts" > "$work/draw.ts"

cd "$work"
cat > package.json <<'JSON'
{
  "name": "engine-consumer-check",
  "private": true,
  "type": "module",
  "devDependencies": { "tsx": "^4.20.3", "@webgpu/types": "^0.1.71" }
}
JSON
npm install --no-audit --no-fund --silent "${spec:-./$tarball}" >/dev/null
npm install --no-audit --no-fund --silent >/dev/null

installed="$(node -e "const p=require('./node_modules/@altpsyche/engine/package.json');console.log(p.name+'@'+p.version)")"
echo "installed $installed from ${spec:-the working tree}"
echo "it carries: $(ls node_modules/@altpsyche/engine | tr '\n' ' ')"

# Node's own resolution against the installed copy, before anything that resolves
# more loosely gets a turn. A refusal names the specifier node would not follow,
# which is the whole reading: the package is either loadable by anything or loadable
# by a bundler alone, and nothing else here can tell those two apart.
node --input-type=module -e "
  import('@altpsyche/engine')
    .then((m) => console.log('plain node imports it: ' + Object.keys(m).length + ' names on the door'))
    .catch((error) => {
      console.error('plain node refuses it: ' + String(error.message).split('\n')[0]);
      process.exit(1);
    });
"

npx --yes tsx draw.ts

# The third question: bundled, the way a consumer's toolchain actually ships it.
# A binding that survives node's own resolution can still be dropped by a bundler,
# and this is the only check here that would notice.
cat > bundled.mjs <<'JS'
import { wgslDescription, WGSL_DOCUMENT } from '@altpsyche/engine';
const modules = wgslDescription('x').modules;
if (WGSL_DOCUMENT !== 'wgsl' || modules[0]?.name !== 'wgsl') {
  console.error(
    'a bundler lost the door\'s re-exports: WGSL_DOCUMENT=' + JSON.stringify(WGSL_DOCUMENT) +
    ' modules=' + JSON.stringify(modules)
  );
  process.exit(1);
}
console.log('bundled by esbuild, the door keeps its re-exports: ' + JSON.stringify(modules));
JS

npx --yes esbuild bundled.mjs --bundle --format=esm --outfile=bundled.out.mjs >/dev/null
node bundled.out.mjs
