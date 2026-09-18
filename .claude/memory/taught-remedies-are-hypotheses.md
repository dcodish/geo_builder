---
name: taught-remedies-are-hypotheses
description: "When a fix's answer is to TEACH a spelling in an error message, drive that exact spelling through the real path — #1156 shipped a message recommending a spelling that returned the same refusal"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 65305bb4-bdf9-4223-a5c6-35cf1cc201d3
  modified: 2026-09-18T05:55:39.108Z
---

An error message that teaches a remedy («write `AA'⃗ = 3BC⃗` if you meant vectors») is a **claim about
the grammar**, and it must be measured like any other. ADR-3D-249 / #1156 shipped to `main` on
2026-09-17 teaching two spellings: `|AA'|=3|BC|` built, and `AA'⃗ = 3BC⃗` returned the **identical**
`ambiguous-vector-length` refusal — the tool asking a question, offering two answers, and rejecting one
of them with the same message. Found 2026-09-18 by the operator, not by the suite.

**Why:** the lock (`issue-1156-ratio-taught.test.ts`, 15 cases) contained no `⃗` and no `→` anywhere. It
asserted the ask FIRES and that the length form builds — the half that worked. The remedy text and the
set of accepted spellings had no shared source, so nothing tied the message to reality. The underlying
defect was the same shape: the parser used `VEC_MARKED` to pick a rule and then discarded it, so every
spelling emitted a byte-identical command and `apply` could not honour the marking it advertised.

**How to apply:** when a fix's deliverable is guidance, the lock must submit **every spelling the message
names** through the real submit path and assert it builds — and assert the message text and the accepted
set against ONE source, so editing either fails the test. Grep the new lock for the literal characters
the message recommends; if they do not appear, the remedy was never driven. Extends
[[play-cases-pass-the-gate]] from play-sheet cases to error-message remedies, and is the
[[locks-must-call-not-reproduce]] failure in its teaching form. Related: [[measure-before-diagnosing]].
