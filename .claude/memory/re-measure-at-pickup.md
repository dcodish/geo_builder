---
name: re-measure-at-pickup
description: "A fix session re-runs the issue's own case before reading its plan — a divergence is expected, not alarming, and only \"the named cause isn't what fires\" is an escalation"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 0655f2c1-9bc0-4bfc-9c4d-15ce5f4e2c56
  modified: 2026-09-20T05:35:08.446Z
---

Re-run the reported case against the current tip **before** reading an issue's fix plan, and expect
what you find to differ from what the issue says. The trunk lands ~35 commits a day (~20 ADR-bearing),
so an issue four days old has had ~130 land under it.

**Why:** operator, 2026-09-20, after the overnight run #1252 — *"i think the time from triage to closure
might also change the diagnosis … just document it so you dont panic when something is different between
diagnosis and fix time."* He was correcting my framing: I had reported five escalations as evidence that
the queue's plans were written badly, when four other items that night diverged simply because the code
had moved under them. Those are different failures with different remedies, and I ran them together.

Measured that night: **all four STALE items still built and landed** (#1128, #1216, #1129, #1198 — one
of them changed by another item landing four hours earlier in the same run). **All four WRONG-when-written
items escalated** (#1202, #999, #1227, #1222/#1240). The two look identical at the moment of discovery.

**How to apply:**
- Already passes → close with the evidence, don't build. Partly fixed → correct the issue AND the ADR,
  build the rest. Dependency landed → re-scope. **Only** "the cause the plan names is not what fires"
  is a docs/17 §8 escalation.
- Record the first three in one line as a re-measurement, not as "deviations from plan" — that
  overstates them and buries the row that matters.
- Per item at pickup, never once when composing a round: a long run invalidates its own queue.
- A plan saying "not measured past the above" is a hypothesis however confidently phrased. The good
  counter-example is #1182, which labelled its guess and was right — see
  [measure-before-diagnosing](measure-before-diagnosing.md) and
  [measure-the-plans-therefore](measure-the-plans-therefore.md).

Documented in [ADR-W-064](../../docs/06w-decisions-workspace.md), docs/17 §5 step 0, docs/22 §3, and
the `fix-round` skill Step 2 — so this file is the pointer, not the copy.
