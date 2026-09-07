---
name: plan-vs-lock-collision
description: "Before building an approved plan, grep the existing locks around the chokepoint it names — a plan can arm behaviour that a test already forbids on an EARLIER operator ruling (#924 arm 2 vs the #353/#498 nudge lock, round #927)"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: a7777971-5135-4bac-b089-580d8f55077d
  modified: 2026-09-07T19:27:31.275Z
---

An approved fix plan can collide with a lock that records an earlier operator ruling on the same input
shape. In round #927 (2026-09-07), #924's arm 2 armed «תיבה abcd» to UPLIFT silently; the standing lock
`lowercase-nudge.test.ts` (#498, on the #353 ruling "insist on uppercase and give a message") asserts it
must be TAUGHT. The collision surfaced only when the lane went red, after the code was written.

**Why:** the plan author reads the code, not every test; a ruling lives in a test's assertion and its
comment, and two rulings months apart can point opposite ways on one case. A round must not pick
between an operator's rulings — that is an escalation, not a judgement call.

**How to apply:** before writing code for a plan, grep the tests that name the chokepoint and the ADRs
the plan cites (`grep -rn "<function>\|#<issue>" src*/__tests__`), and read any assertion that fixes the
behaviour the plan changes. If one records a ruling the plan reverses, escalate that arm with both
rulings quoted; deliver the arms that do not collide. Related: [[test-the-framing-not-just-the-facts]],
[[locks-and-gates-are-hypotheses]].
