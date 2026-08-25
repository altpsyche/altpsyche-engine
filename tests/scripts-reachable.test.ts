import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Every `scripts` entry in `package.json` is either run by something in this
 * repository — another script, a test, or a gate invokes it — or it is named on
 * the list below with the reason it is not, which is a script that needs hardware
 * this machine has not got or a top-level entry a person or CI runs by hand.
 *
 * Item 73 fixed `bench:traffic` and gave it a runner, which closed that one hole.
 * It did not close the class: the reason `bench:traffic` went unread for 31
 * commits was that nothing pointed at it — not that it was broken (ROADMAP.md item
 * 74). A script added tomorrow is in exactly the same position, and which files a
 * gate happens to name is a worse record of what deliberately needs hardware than
 * a list that says so. This is that list, and the check that a script not on it is
 * pointed at by something.
 *
 * A script "runs" another when its command carries `npm run <name>` (`npm test`
 * for `test`). A test or gate "runs" a script when the file that script's command
 * executes — `gates/traffic.mjs`, `examples/run.mjs` — is named on a non-comment
 * line of a file under `tests/` or `gates/`. Comment lines are stripped first, so
 * a docstring mentioning `npm run device-report` is not mistaken for a caller: the
 * mention has to be code that loads or spawns the file.
 */
const root = path.join(import.meta.dirname, '..');

/**
 * The scripts that nothing here invokes on purpose, each with the reason it is not
 * a defect. Two kinds: a script that needs hardware this machine has not got, and
 * a top-level entry that a person or CI runs by hand. Growing this list is a diff
 * someone reviews — which is the point — and every entry is asserted to name a
 * real script, so a row left behind by a deleted script is flagged rather than
 * left hiding.
 */
const ACCOUNTED: Record<string, string> = {
  // Needs hardware this machine has not got.
  'gate:card':
    'needs a real graphics card and a desktop session — every headless launch reaches the software renderer whatever the flags say (RoadToPureEngine.md §17 note 3), so it is run by hand from its own file',
  'device-report':
    'needs a real card and a live browser to print a paste-able `probe()` row a stranger contributes (RoadToPureEngine.md §17 decision 11)',
  'gate:browser':
    "needs Playwright's pinned browser and is run once over a batch, never per step (CLAUDE.md gate table)",
  example: 'opens an example in a browser and needs a display to see it draw',
  // Top-level entries a person or CI runs by hand.
  test: 'the fast-suite runner — the top-level entry CI and every step run, and the one this very check runs inside',
  'type-check': 'the type gate — a top-level entry run in every step, needing no browser and no card',
  'gate:pack':
    'the export-surface gate — packs and installs the tarball into a directory outside the repository, needing a network for `npm install`, and is run by hand over a step that moved the door',
  prepack:
    'an npm lifecycle script, triggered by `npm pack` inside `gates/pack.sh` rather than as `npm run prepack` anywhere — it compiles the tree every tarball is packed from',
};

/** The `scripts` block of `package.json`, script name to command. */
function packageScripts(): Record<string, string> {
  const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf-8'));
  return manifest.scripts ?? {};
}

/** The runnable file a command executes — `gates/traffic.mjs`, `examples/run.mjs` — or null. */
function targetFile(command: string): string | null {
  const match = command.match(/\b[\w./-]+\.(?:mjs|cjs|js|ts|sh)\b/);
  return match ? path.basename(match[0]) : null;
}

/** Every `tests/**` and `gates/*` source, with comment lines stripped, keyed by its path. */
function callerSources(): { file: string; code: string }[] {
  const sources: { file: string; code: string }[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(mjs|cjs|js|ts|sh)$/.test(entry)) continue;
      // Drop lines that are only a comment, so a docstring naming a script's file
      // — `* ... npm run device-report`, `# gates/pack.sh packs the package` — is
      // not read as a caller. Only a line of code that loads or spawns the file is.
      const code = readFileSync(full, 'utf-8')
        .split('\n')
        .filter((line) => {
          const trimmed = line.trimStart();
          return !(
            trimmed.startsWith('//') ||
            trimmed.startsWith('*') ||
            trimmed.startsWith('/*') ||
            trimmed.startsWith('#')
          );
        })
        .join('\n');
      sources.push({ file: full, code });
    }
  };
  walk(path.join(root, 'tests'));
  walk(path.join(root, 'gates'));
  return sources;
}

/**
 * The scripts nothing accounts for: neither invoked by another script, nor by a
 * test or gate, nor named on the accounted list. Pure over its inputs so the
 * "fails by name" behaviour can be exercised on a synthetic manifest below without
 * touching the real `package.json`.
 */
function unaccounted(
  scripts: Record<string, string>,
  accounted: Record<string, string>,
  sources: { file: string; code: string }[],
): string[] {
  const commands = Object.entries(scripts);
  const orphans: string[] = [];
  for (const [name, command] of commands) {
    if (name in accounted) continue;

    const invokedByScript = commands.some(
      ([other, otherCommand]) =>
        other !== name &&
        (otherCommand.includes(`npm run ${name}`) || (name === 'test' && /\bnpm test\b/.test(otherCommand))),
    );
    if (invokedByScript) continue;

    const file = targetFile(command);
    const invokedByCaller =
      file !== null &&
      sources.some(({ file: source, code }) => path.basename(source) !== file && code.includes(file));
    if (invokedByCaller) continue;

    orphans.push(name);
  }
  return orphans;
}

describe('every package.json script is run by something or named as needing hardware', () => {
  const scripts = packageScripts();
  const sources = callerSources();

  it('leaves no script that nothing invokes and nothing accounts for', () => {
    const orphans = unaccounted(scripts, ACCOUNTED, sources);
    expect(
      orphans,
      `these scripts are invoked by no test, no gate and no other script, and are on no accounted list: ${orphans.join(', ')}. ` +
        'Point something at each, or add it to ACCOUNTED with the reason it needs hardware or is run by hand.',
    ).toEqual([]);
  });

  it('flags a script nothing runs, by name — the behaviour a new orphan trips', () => {
    // The load-bearing check, proven on a synthetic manifest so it never has to be
    // proven by breaking the real one: a script pointed at by nothing and on no
    // list is returned by name, which is what fails `npm test` above. The target
    // file name is assembled at runtime rather than written as a literal, so this
    // test's own source is not a caller that names it — which would account for it.
    const ghost = ['ghost', 'nobody', 'runs.mjs'].join('-');
    const withOrphan = { ...scripts, 'orphan-nobody-runs': `node gates/${ghost}` };
    expect(unaccounted(withOrphan, ACCOUNTED, sources)).toEqual(['orphan-nobody-runs']);
  });

  it('carries no accounted row for a script that no longer exists', () => {
    const stale = Object.keys(ACCOUNTED).filter((name) => !(name in scripts));
    expect(stale, `ACCOUNTED names scripts that are gone from package.json: ${stale.join(', ')}`).toEqual([]);
  });

  it('accounts for gate:card and device-report by the list, each with a reason', () => {
    // The two the item names outright: they need hardware this machine has not
    // got, so they can never be invoked here and the list is the only honest home.
    for (const name of ['gate:card', 'device-report']) {
      expect(name in scripts, `${name} is no longer a script`).toBe(true);
      expect(ACCOUNTED[name], `${name} needs a reason on the accounted list`).toBeTruthy();
    }
  });
});
