---
name: locks-and-gates-are-hypotheses
description: "A fix plan's LOCK is a hypothesis like its root cause — and a gate that skips its assertion passes by checking nothing; measure the achievable range, and give every conditional oracle an exercised-counter"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: fccb25f9-6fe9-45f4-b8c2-1fe47db96268
  modified: 2026-09-05T21:40:18.773Z
---

Round #915 (2026-09-06) hit both halves of this in one session.

- **#909's plan demanded a lock that would have been a FALSE REFUSAL.** It said «20° must still refuse»,
  citing a measured achievable range of 47.76°–89.95° for the angle between two box diagonals. That
  range was measured over **sampled** boxes, not **achievable** ones: with `cos = |b²−c²| / (√(a²+b²+c²)·√(b²+c²))`,
  small `a` and `c` against `b` drive it toward 1. Implementing the lock would have enforced the tool's
  own sampled proportions as a given — the ADR-052 cardinal sin, shipped under a green test. The drive
  honours 20° and produces a legal box (1.0000 × 2.7545 × 0.0340, all edge angles 90°, an independent
  closed form agreeing to 20.0001°). The test now asserts the box is LEGAL instead.
- **#174's gate had been passing vacuously.** Its `MARGINAL` set was written to force a flip when a
  near-miss was fixed (`expect(marginals.filter(k => !MARGINAL.has(k))).toEqual([])`), and its comment
  says «do NOT widen this set to make a failure pass». But a config that stops building at all is
  `continue`d as an honest refusal, never reaches `marginals`, and the filter is satisfied by an empty
  list. So it could not tell «fixed» from «this figure no longer builds» — and the figure had gone back
  to refusing, silently, for some unknown number of rounds.

**Why:** a triage session writes the lock in the same breath as the diagnosis, from the same reading of
the same failing case. Verifying the root cause does not verify the lock — they are separate claims, and
the lock is the one that gets frozen into the suite and defended by future sessions.

**How to apply:** before implementing a plan's lock, ask **"what does the code do at this input NOW, and
is the demanded verdict the honest one?"** For a range or a bound, measure what is ACHIEVABLE (let the
solver reshape) rather than what happens to be SAMPLED — those differ by orders of magnitude, and a
refusal lock built on the sampled range refuses correct student input. When a lock turns out wrong, say
so in the ADR and the commit and replace it with the assertion that IS true (here: the produced figure
is checked against an independent closed form), never quietly drop it.

Corollary for any oracle with an early return: **give it an exercised-counter the test asserts moved.**
`dofHonesty` (#912) skips figures whose cue reports no freedom, so a change that made figures stop
claiming freedom would have made it green while checking nothing; the slices now assert
`dc.dofChecked > 0`, exactly as they already did for the round-trip and gate properties.

Related: [[measure-before-diagnosing]] (the facts are hypotheses); [[test-the-framing-not-just-the-facts]]
(the question is a hypothesis); [[red-suite-may-be-the-gate-working]] (a failing lock may be right);
[[gate-lines-are-read-not-matched]].
