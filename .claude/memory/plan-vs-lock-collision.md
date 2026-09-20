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

**A CROSS-PRODUCT port is the highest-risk shape of this** (2026-09-20, #1274 vs #944, round #1280). A
ruling given while playing one product — *"the 2d and 3d tools should follow the same logic"* — reaches
trees whose own rulings were never re-read. 2-D's member of the coincidence rule refused «משולש ABC» +
«D = חיתוך AB ו-BC»; that exact sentence is #944/ADR-489, where the operator reported the opposite and
the shipped lock asserts D IS minted at B. The tell was available before any code: the sibling's lock
files are searchable by the SENTENCE, not only by the function. Grep the other product's `__tests__` for
the literal utterance the port will refuse — `grep -rn "חיתוך AB" src/__tests__` would have found it in
one command. And when the ADR you are writing says "N locks assert this and stay green; if any goes red
a fix has reached past this ruling", that is not a rhetorical flourish — run that check before building,
not as a post-hoc explanation of a red lane.
