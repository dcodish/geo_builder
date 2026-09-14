---
name: predicate-vs-its-own-case
description: "Before building a plan's predicate, check it against the plan's OWN reported case — a fix whose acceptance condition the reported figure fails is a no-op, and that is an escalation, not a build"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 320ec4f9-2c74-47fb-abb5-1565c5f174ec
  modified: 2026-09-14T19:27:50.432Z
---

A fix plan states a mechanism AND a predicate ("treat it as redundant when the residual is zero at the
sample seeds **and nothing moved and the DOF count did not drop**"). Run that predicate against the
plan's own reported case **before writing any code**. If the reported case fails the predicate, the fix
is a no-op on the very figure it was written for — and the plan's root cause is wrong, not merely
incomplete.

**Why:** #999 (round #1006) targeted the constraint-COUNT arm of `dryRunOutcome`. Measured on pristine
`main`, the reported «AB ⟂ BC» after «∠ABC = 90» **does** move the figure (B by 2.27, C by 1.76 on a
scale ≈ 5) and **does** drop `freeDofCount` 1 → 0 — so `moved` returned `produced: true` long before the
count arm was reached, and the plan's own guards excluded its own example. I built and typechecked the
replacement; it changed nothing. Two hours recoverable by one measurement.

**How to apply:** at triage-read time, write the plan's predicate as a probe over the reported utterance
sequence and print every term of it (each guard separately, not just the verdict). Then either the
predicate fires — build it — or it does not, and you escalate with that table as the evidence. The probe
that falsifies the predicate is also the probe that finds the REAL mechanism: in #999 the same print
exposed a worse, unfiled defect (the figure jumps and the DOF count lies on a statement that adds
nothing → #1007, P2).

Related: [[measure-the-plans-therefore]] (mechanism→symptom is a separate hypothesis),
[[locks-and-gates-are-hypotheses]], [[measure-before-diagnosing]], [[red-suite-may-be-the-gate-working]].
