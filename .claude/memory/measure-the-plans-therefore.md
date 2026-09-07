---
name: measure-the-plans-therefore
description: "A fix plan's load-bearing \"so it benefits automatically\" link is the cheapest thing to falsify — measure that link before building the mechanism it justifies"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: fbd75c88-40d1-48d7-8242-cf170223c127
  modified: 2026-09-07T21:14:01.232Z
---

Every fix plan has one sentence connecting its mechanism to its symptom — *"the repair path benefits
automatically, because it re-evaluates through the same coupled solve."* **Measure that sentence first.**
It is usually one probe, and it is the only claim in the plan that can make the whole build worthless.

Round #931, #920: the plan's mechanism (a Gauss-Newton polish rung on the coupled solve) was built,
integrated at both driven solvers, gated two different ways — and the 36-configuration sweep came back
**bit-identical**. One instrumented run of the actual decision point then showed why in a single line:
`missingAreDriven=[false,false,false,false]` — the preservation gate re-lists the dropped obligations as
CHECKS, not drivers, so the failing ⟂ was never in any residual set a solver minimises. No amount of
polishing a solve can reach a constraint no solve is trying to satisfy.

**Why:** a wrong root cause and a wrong *linking claim* fail identically at the end (nothing changes), but
the linking claim is far cheaper to test — it is a structural question ("is this constraint driven or
merely checked?"), answerable by printing state, whereas the mechanism costs a session to build.
[[measure-before-diagnosing]] says the diagnosis is a hypothesis; this says the plan's **therefore** is a
separate hypothesis, and often the weaker one.

**How to apply:** before writing the mechanism, restate the plan as *cause → therefore → symptom* and
print the state at the "therefore". If the plan says a fix propagates through some shared path, verify the
failing thing actually travels that path. When it does not, that is the escalation ([[locks-and-gates-are-hypotheses]]) —
and building the mechanism anyway still has value as *priced groundwork*, so record what was built and
what it proved rather than only that it failed.
