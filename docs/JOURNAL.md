# Journal

**This file is the register a person reads after a run nobody watched.** It is not a queue —
[ROADMAP.md](ROADMAP.md) is the only thing that queues work, and every row below names the item
that tracks it. A row needing work nobody is tracking needs a roadmap item too, in the same
commit.

**Why it exists here.** [ROADMAP.md](ROADMAP.md) says design decisions about this library are
recorded in the consuming repository's log, and that log is not reachable from this tree. An
unattended session that takes a call and writes it nowhere has taken an untracked, unreversible
call — which is the failure this file exists to prevent. So a call taken **in** this repository is
written **here**, and rows that also need an entry on the consuming side are marked `carry` so
somebody moves them across. That is a handover, not a decision changing home.

## What earns a row

Every one of these, whether or not anything went wrong:

- **A call taken with nobody watching.** What was decided, **how to reverse it**, and what would
  change the answer. An entry with no reversal recipe has not been written.
- **Something that could not be verified on this machine** — the card gate, a phone, a deployed
  address, a reproduction nobody has managed.
- **A risk accepted, a bar widened, or a number nobody has looked at.** Per RoadToPureEngine.md
  §17's amendment to decision 4: a number a gate accepts because its bar was widened is a number
  nobody has looked at.
- **A gate that passed for a reason that does not prove what the step claimed** — a picture that
  cannot move by construction, a count the recorder does not take.
- **Something a green gate is blind to**, changed anyway.
- **Uncertainty proceeded through.** Say what would settle it, not only that it is open.

Say what would settle it. A row that records a doubt and not its remedy is a doubt nobody can
close.

## Columns

| column | holds |
| --- | --- |
| date | when the row was written |
| item | the ROADMAP.md item this belongs to |
| kind | `call`, `unverified`, `risk`, `blind-gate`, `doubt` |
| carry | `carry` where the consuming repository's log also needs an entry, otherwise blank |
| what | the row itself, including how to reverse a call and what would settle a doubt |

---

## Rows

| date | item | kind | carry | what |
| --- | --- | --- | --- | --- |

*(Empty. The first unattended run writes into it.)*
