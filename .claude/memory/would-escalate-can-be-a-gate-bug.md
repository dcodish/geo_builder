---
name: would-escalate-can-be-a-gate-bug
description: "A ⇗ would-escalate triage row may be a GATE false-positive, not the partial parse the skill assumes — run the gates separately from the parse before classifying"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: f2d0732c-0292-4c5c-920e-639826233513
  modified: 2026-09-17T06:55:24.792Z
---

The log-triage skill describes `⇗ Would ESCALATE` as "a *partial-parse* signal, not a grammar gap". There is
a third possibility it does not name: **the parse is perfect and the honesty gate is wrong.**

2026-09-17, `E=(-1,7)` (#1161). Reported as `dropped:1`. The parse was flawless —
`free-point x:-1 y:7`. `droppedGivenNumbers` (ADR-250) extracts numeric literals **without their sign**,
found `1` in the text, saw only `-1` in the command, and declared it dropped. Positive coordinates were clean;
every negative one flagged, one flag per negative.

**Why:** the bucket label attributes the drop to the parser, so the instinct is to go read the grammar rule
and conclude a construct is half-built. Here the grammar was already right and the defect was one layer
down — a false positive in an honesty gate, which is the mirror image of what gates exist to prevent. It
costs a paid fallback call *and* lets the LLM re-roll an answer the parser already had correct.

**How to apply:** for any `⇗` row, run the parse and the gates as two separate measurements before
classifying. If the commands faithfully carry every stated value, the bug is in the gate, not the grammar —
and the fix belongs at the gate's chokepoint (the number scanner), never at the one construct that surfaced
it. The same split tells you where the issue gets filed and under which product.

Corollary: the register/scope comments state what is *supposed* to build ([[measure-before-diagnosing]]).
`scope.ts` said in its own note that `A = (3,5)` stays supported — that sentence is what made the gate the
suspect rather than the parser. Related: [[locks-and-gates-are-hypotheses]],
[[test-the-framing-not-just-the-facts]].
