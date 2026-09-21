---
name: plan-mechanism-beats-plan-locks
description: "A fix plan's LOCK LIST can contradict its own MECHANISM — follow the mechanism, file the lock as a question, never bend the mechanism to pass a lock"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: d3cebc4d-0bc9-4598-ac3f-13ef8e3443e9
  modified: 2026-09-21T20:55:18.299Z
---

A triaged fix plan carries both a mechanism and a list of locks, and they can disagree — the locks are
written from the symptom, the mechanism from the diagnosis. When they conflict, **the mechanism is the
considered half**; a lock that only passes by widening the mechanism is a question, not a requirement.

#999 (round #1345) prescribed `impliedByPrior` firing when *"the step adds ONLY constraints and every one
is implied"*, and separately asked in lock 4 that «∠ABC = 90» after «AB ⟂ BC» be declined. Measured, that
step adds the entailed constraint **and a measure label** — a 90° value the ⟂ mark does not carry. The
plan's own mechanism already excluded it, and honouring the lock would have deleted a magnitude the
student stated, which is the honesty invariant's cardinal sin. Followed the mechanism, filed #1346.

**Why:** bending a mechanism to satisfy a lock is how a fix acquires a special case — the exact shape
docs/17 forbids — and the lock's author did not have the measurement that shows the two disagree.

**How to apply:** when a lock will not pass, first ask whether the plan's OWN mechanism predicts it
should. If the mechanism says no, stop: the lock is a separate question. Record it in the ADR as a lock
NOT honoured with the measurement, file a successor issue, and say so in the commit's deviations line —
never silently drop it and never widen to reach it. If the mechanism says it SHOULD pass and it does not,
that is the ordinary case: the mechanism is wrong and [[locks-and-gates-are-hypotheses]] applies.

Related: [[plan-vs-lock-collision]] (a plan can arm what an EARLIER ruling forbids — a different
conflict, between the plan and the codebase rather than inside the plan), [[red-suite-may-be-the-gate-working]].
