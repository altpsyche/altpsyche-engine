---
name: next
description: >
  Pick up work where the last session left it and land the next item of this package.
  Reads docs/ROADMAP.md for state, plans an item before working it, and cuts a version only
  when its gates are green. Use at the start of a session, after a /clear, or whenever the
  user says "next", "continue", "carry on", "what's next", or invokes /next.
---

Session entry point for `@altpsyche/engine`. **[`docs/ROADMAP.md`](../../../docs/ROADMAP.md) is the
handover.** There is no separate handover file and you must not write one: the queue, the register,
the direction document and the session handover were all deleted at 0.3.0, deliberately, and
`CLAUDE.md` says `git log` is the record now.

`CLAUDE.md` is already loaded and holds the rules, the gates and the release convention. This file is
the sequence only, so nothing here repeats it. **Where the two disagree, `CLAUDE.md` is the rule.**

## 0. Budget

```
node .claude/context-used.mjs
```

**CONTINUE** picks an item. **FINISH** lands what is in hand and starts nothing new. **HAND OVER**
starts nothing at all. Re-check after every landed commit, not at the end.

## 1. Read the state, do not trust memory

- **`git status --short` before anything else.** Output means a previous session left work
  uncommitted, and resolving that comes before building on it.
- **[`docs/ROADMAP.md`](../../../docs/ROADMAP.md)**. It is long now; read the campaign section, the
  cut order, and the item you are about to pick. Items that have landed carry their reading under a
  `### Landed on` heading and are history rather than work.
- `git log --oneline -10`, and `git log -S'<symbol>'` when you need to know why a line is the way it
  is. A landed change carries its measurement in its commit message.

Read as little as answers the question. Grep for the symbol, read the function, open a whole file
only when the whole file is the subject.

## 2. Pick one item

**The cut order in the roadmap wins**, under "How the campaign is cut". It says which items ride
which release and which need no release at all. Within that, take the lowest-numbered item that is
not landed and not blocked, and honour any stated preference (item 4 before item 10 was one, and it
turned out to matter).

If the item carries a step list, the pick is **its first unlanded step**, not the item.

**Decisions the roadmap records as answered are not reopened by a session.** A call it leaves open
goes to Siva by name. State the pick in one line before touching anything: `item N, what it is, what
it measures today.`

## 3. Verify the reading before building on it

**Every item's reading was true when it was written and may not be now.** Three of the twelve
readings in the 2026-09-11 campaign came back different, and two items turned out to be *moving* a
rule rather than adding one, which changed where the work went. So check the item's file-and-line
claims against the tree first, and **say so when the reading has moved** rather than quietly working
the item as written.

## 4. Plan before working, where there is no plan

**When the chosen item has no step list, planning it is the session and no code is touched.** Write
into that entry an ordered list of steps, each one commit-sized, each naming the measurement its
commit will quote, and a `Done when` a reader who did not do the work can check. Present it and
stop. **Nothing lands until Siva says go.**

## 5. Resume, do not re-plan

Take the first unlanded step. Do not redesign the remainder because a different order occurred to
you. **When a step proves the plan wrong, stop**, rewrite the remaining steps in the roadmap, say so,
and continue from the corrected list.

## 6. Measure, work, land

The before-state is measured first and it is what the commit body quotes. One step, one finding; a
second defect goes in the roadmap rather than into this commit.

The gates and their costs are the table in `CLAUDE.md`. Two things that table cannot say:

- **`gate:card` runs here.** Siva cleared it on 2026-09-11 and this machine has a display. It still
  needs one — `$DISPLAY` — and it is still not for an unattended run, which is what its own header
  says. It is the only gate that can read a real driver, and it is what re-takes the cross-backend
  channel numbers.
- **A new fixture means `npm run translate`**, which needs `naga` on PATH, and it rebakes
  `fixtures/source/glsl/corpus.generated.json`.

**Never quote a number a gate did not produce, and name what the gates could not see.** That second
half is not a formality here: a green `gate:browser` is a software renderer, `gate:card` is one
machine, and a fixture nothing compares across backends proves less than it looks like. Both of
those blind spots have hidden a real defect in this tree.

## 7. Cut the version

When the last step of a release's items lands:

- Verify the `Done when` line by line, saying which number satisfies which line.
- **At `0.x` a minor is a breaking release** for anything that carets it, and this package's only
  dependant declares it as a `peerDependency`. The roadmap's cut order says what each release
  carries; re-read it rather than assuming.
- Bump the version in its own commit.
- **The release runs in CI from the tag** — `gh workflow run publish.yml --ref <tag>` — so there is
  no local publish, and a local one would break the provenance chain.
- **Push, tag and publish are asked for in the session and never assumed.** A published version
  cannot be withdrawn.

## 8. Boundary

Re-run the budget script and decide out loud. **FINISH or HAND OVER** hands over whatever is left and
never starts what it cannot land and record in the same session, because a half-landed item stops the
roadmap describing the tree.

Handing over is three lines: what landed with its numbers, what the next item is, and `/clear` then
`/next`.

**Never invent work to keep the loop alive.** An empty queue is a real answer, and so is "the next
thing is Siva's call".
