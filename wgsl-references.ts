/**
 * Which of a WGSL source's own bound variables one entry point reaches.
 *
 * A frame of several pipelines out of one file needs this. Every pipeline built
 * from that file gets a layout, and a layout has to name the bindings the stage
 * actually reads: one short of that and the driver refuses the pipeline, one over
 * and it is accepted while claiming a stage reads something it never touches. The
 * answer is in the body of the function rather than in the declarations at the top
 * of the file, because two entry points in one file read different halves of them.
 *
 * It is read rather than declared beside the pass for the reason every other
 * number in this build is read: a list written in an entry can disagree with the
 * file, and a disagreement about which resources a stage reads is silent on the
 * card whenever it errs wide.
 *
 * The source is turned into tokens first rather than scanned as a flat string,
 * because scanning strings counts three things that are not references to a
 * binding: the field after a dot, so `field.next` used to look like the binding
 * `next`; a parameter or a local that happens to share a binding's name, so a
 * helper taking `previous: f32` used to look like the texture `previous`; and a
 * dotted field whose name matches a helper, so `thing.size` used to be followed
 * into `size()` and drag in whatever binding that helper reads. Each of those
 * widens the layout, which the card accepts without a word.
 */

type Token = { kind: 'word'; value: string; member: boolean } | { kind: 'punct'; value: string };

const WORD_START = /[A-Za-z_]/;
const WORD_BODY = /\w/;

/** The single characters worth keeping apart from the words: the braces and
 * parentheses that mark out a function, and the colon and equals that mark where
 * a name is being declared rather than read. Everything else a character could be
 * is arithmetic or punctuation the layout does not care about. */
const KEPT_PUNCT = new Set(['{', '}', '(', ')', ':', '=', '<', '>', ';', ',']);

/** The keywords that introduce a name of the source's own rather than a reference
 * to something already declared, so the name right after one of them is a local
 * that shadows any binding spelled the same way. */
const DECLARES_LOCAL = new Set(['let', 'var', 'const']);

/**
 * The source as a stream of words and the punctuation that shapes them.
 *
 * Comments go here rather than in a separate pass, because a comment that names a
 * binding would otherwise put that binding in a stage's layout, and this corpus
 * comments every binding by name directly above it. A word is marked as a member
 * when a dot sits immediately before it, which is what tells a field access apart
 * from a name in its own right.
 */
function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let at = 0;
  let afterDot = false;

  while (at < source.length) {
    const char = source[at] as string;

    if (char === '/' && source[at + 1] === '/') {
      const newline = source.indexOf('\n', at);
      at = newline === -1 ? source.length : newline;
      continue;
    }

    if (char === '/' && source[at + 1] === '*') {
      const close = source.indexOf('*/', at + 2);
      if (close === -1) {
        throw new Error('a block comment is opened and never closed, so the source cannot be read');
      }
      at = close + 2;
      continue;
    }

    if (WORD_START.test(char)) {
      let end = at + 1;
      while (end < source.length && WORD_BODY.test(source[end] as string)) end++;
      tokens.push({ kind: 'word', value: source.slice(at, end), member: afterDot });
      afterDot = false;
      at = end;
      continue;
    }

    if (char === '.') {
      afterDot = true;
      at++;
      continue;
    }

    if (KEPT_PUNCT.has(char)) {
      tokens.push({ kind: 'punct', value: char });
    }
    afterDot = false;
    at++;
  }

  return tokens;
}

/** The index of the token that closes the group opened at `open`, matching each
 * closer against its opener so a nested group of the same kind does not end the
 * outer one early. Throws rather than guessing when the group never closes,
 * because a layout read off a half-parsed function is worse than no layout. */
function closerOf(tokens: Token[], open: number, opener: string, closer: string): number {
  let depth = 0;
  for (let at = open; at < tokens.length; at++) {
    const token = tokens[at] as Token;
    if (token.kind !== 'punct') continue;
    if (token.value === opener) depth++;
    else if (token.value === closer) {
      depth--;
      if (depth === 0) return at;
    }
  }
  throw new Error(`a "${opener}" is opened and never closed, so the source cannot be read`);
}

/** The names one function declares of its own: the parameters between its
 * parentheses and the locals in its body, each found as a name sitting directly
 * before the colon or equals that declares it. A parameter's type and a local's
 * initialiser are read normally, so a binding used to size a local is still seen.
 */
function localsOf(params: Token[], body: Token[]): Set<string> {
  const locals = new Set<string>();

  for (let at = 0; at < params.length; at++) {
    const token = params[at] as Token;
    const next = params[at + 1];
    if (token.kind === 'word' && !token.member && next?.kind === 'punct' && next.value === ':') {
      locals.add(token.value);
    }
  }

  for (let at = 0; at < body.length; at++) {
    const token = body[at] as Token;
    if (token.kind !== 'word' || !DECLARES_LOCAL.has(token.value)) continue;
    for (let ahead = at + 1; ahead < body.length; ahead++) {
      const name = body[ahead] as Token;
      const next = body[ahead + 1];
      if (name.kind !== 'word' || name.member) continue;
      if (next?.kind === 'punct' && (next.value === ':' || next.value === '=')) {
        locals.add(name.value);
        break;
      }
    }
  }

  return locals;
}

/** Every function the source declares, with the names each one reaches: a name it
 * reads, a function it calls or a type it writes, all three spelled the same way,
 * with a field after a dot and a name the function declares of its own both left
 * out. The caller separates a binding from a type or a call by asking about the
 * names it already knows the source binds. */
function functionsOf(source: string): Map<string, string[]> {
  const tokens = tokenize(source);
  const found = new Map<string, string[]>();

  for (let at = 0; at < tokens.length; at++) {
    const token = tokens[at] as Token;
    const name = tokens[at + 1];
    if (
      token.kind !== 'word' ||
      token.value !== 'fn' ||
      name?.kind !== 'word' ||
      tokens[at + 2]?.kind !== 'punct' ||
      (tokens[at + 2] as { value: string }).value !== '('
    ) {
      continue;
    }

    const paramsClose = closerOf(tokens, at + 2, '(', ')');
    let bodyOpen = paramsClose + 1;
    while (
      bodyOpen < tokens.length &&
      !(tokens[bodyOpen]?.kind === 'punct' && (tokens[bodyOpen] as { value: string }).value === '{')
    ) {
      bodyOpen++;
    }
    if (bodyOpen >= tokens.length) {
      throw new Error(`the function "${name.value}" has no body, so the source cannot be read`);
    }
    const bodyClose = closerOf(tokens, bodyOpen, '{', '}');

    const params = tokens.slice(at + 3, paramsClose);
    const body = tokens.slice(bodyOpen + 1, bodyClose);
    const locals = localsOf(params, body);

    // Parameters establish locals and reach nothing: a parameter's type is a type
    // rather than a binding, and its attributes put words like `builtin`,
    // `position` and `interpolate` in reach of a stage that never samples them.
    // A layout one binding too wide is accepted by the driver while claiming a
    // stage reads what it never touches, so this is silent on the card.
    const reached: string[] = [];
    for (const inner of body) {
      if (inner.kind === 'word' && !inner.member && !locals.has(inner.value)) {
        reached.push(inner.value);
      }
    }
    found.set(name.value, reached);

    at = bodyClose;
  }

  return found;
}

/**
 * Every name one entry point reaches, following the functions it calls.
 *
 * A helper is followed because a binding read two calls down is still a binding
 * that stage reads, and a layout without it is a pipeline the driver refuses. The
 * walk keeps a set of what it has already opened, so two functions calling each
 * other are each read once instead of the walk pushing them at each other for as
 * long as the build is given, which is a hang rather than a crash.
 */
export function namesReachedBy(source: string, entry: string): Set<string> {
  const functions = functionsOf(source);
  const reached = new Set<string>();
  const opened = new Set<string>();
  const pending = [entry];

  while (pending.length > 0) {
    const name = pending.pop() as string;
    if (opened.has(name)) continue;
    opened.add(name);

    for (const word of functions.get(name) ?? []) {
      reached.add(word);
      if (functions.has(word)) pending.push(word);
    }
  }

  return reached;
}
