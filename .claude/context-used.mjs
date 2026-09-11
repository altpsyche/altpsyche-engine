/**
 * How full is this session's context window?
 *
 * The number is not a guess: every assistant message in the session transcript
 * records its own `usage`, and the newest one's
 * `input_tokens + cache_read_input_tokens + cache_creation_input_tokens` is the
 * size of the context that message was answered with. That is the working set.
 *
 * Usage: node .claude/context-used.mjs [session-id | transcript-path]
 *
 * Prints used tokens, the percentage of the window, and a verdict:
 *   CONTINUE   under 40% — safe to start another finding
 *   FINISH     40-50% — land what is in hand, then hand over
 *   HAND OVER  over 50% — commit, tick the doc, tell the user to /clear
 *
 * The window is read from the configured model: an `[1m]` suffix means 1M
 * tokens, anything else 200k. Override with CONTEXT_WINDOW=<tokens>.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');

function windowSize() {
  if (process.env.CONTEXT_WINDOW) return Number(process.env.CONTEXT_WINDOW);
  try {
    const settings = JSON.parse(fs.readFileSync(path.join(CLAUDE_DIR, 'settings.json'), 'utf8'));
    return /\[1m\]/i.test(settings.model ?? '') ? 1_000_000 : 200_000;
  } catch {
    return 200_000;
  }
}

/** Claude Code names a project directory after its cwd, with separators flattened. */
function projectDir() {
  const slug = process.cwd().replace(/[/\\:]/g, '-');
  return path.join(CLAUDE_DIR, 'projects', slug);
}

/**
 * Which transcript belongs to this session: one transcript per session, named for
 * the session id, which Claude Code puts in the environment of everything it runs.
 * Several sessions share one project directory, so the newest file in it is
 * whoever wrote last rather than whoever is asking, and a step running beside a
 * long session reads that session's usage and refuses on it. There is no guess
 * that fails loudly, so an unnamed session gets no number at all.
 */
function transcriptPath(dir) {
  const named = process.argv[2] ?? process.env.CLAUDE_CODE_SESSION_ID;
  if (!named) {
    throw new Error(
      'no session named: set CLAUDE_CODE_SESSION_ID, or pass a session id or a transcript path as the first argument'
    );
  }
  const full = named.endsWith('.jsonl') ? path.resolve(named) : path.join(dir, `${named}.jsonl`);
  if (!fs.existsSync(full)) throw new Error(`no transcript at ${full}`);
  return full;
}

function lastUsage(file) {
  let usage = null;
  let turns = 0;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry.type !== 'assistant' || !entry.message?.usage) continue;
    usage = entry.message.usage;
    turns++;
  }
  if (!usage) throw new Error(`no assistant message with usage in ${file}`);
  return { usage, turns };
}

try {
  const limit = windowSize();
  const { usage, turns } = lastUsage(transcriptPath(projectDir()));
  const used =
    (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
  const pct = (used / limit) * 100;
  const verdict = pct >= 50 ? 'HAND OVER' : pct >= 40 ? 'FINISH' : 'CONTINUE';

  console.log(
    `${used.toLocaleString('en-US')} / ${limit.toLocaleString('en-US')} tokens  ${pct.toFixed(1)}%  over ${turns} turns  ${verdict}`
  );
} catch (error) {
  console.error(`cannot read this session's usage: ${error.message}`);
  process.exit(1);
}
