---
name: cross-product-disparity-is-a-wiring-smell
description: "Before escalating a 3-D (or complex) capability gap, check whether 2-D already handles the same utterance sequence — the operator reads a sibling-product disparity as a wiring bug, not a spec question, and 2-D's mechanism is the template to port (2026-09-11, #985)"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 41d38bce-e024-4bc7-9645-a1607e5a4bdc
  modified: 2026-09-11T10:15:56.301Z
---

When 3-D refuses a sequence 2-D builds, the operator treats it as **something not wired correctly**, not
as a scoping decision — and points at the 2-D tool as the reference implementation.

**Why:** Round #988 escalated #985 («משולש ABC» · «טרפז ABCD» refused in 3-D) after the plan's mechanism
failed contact with the code, offering three options. The operator sent it straight back: *"I see no
reason that a parallelogram can be built and trapezoid cannot … it's an indication that something is not
wired correctly. the 2d tool does this sequence with no issue at all."* Measuring 2-D first would have
shown the answer in one step — 2-D mints the corner as a `scaled-offset` vertex (anchor + k·(to − from)),
which is exactly the 1-DOF point kind 3-D lacked — and skipped the escalation round-trip entirely.

**How to apply:** for any 3-D/complex refusal or capability gap, run the identical utterance sequence
through 2-D's `factsOf → replayFacts` and read what point/constraint kinds it produced. If 2-D builds it,
the escalation is not "should we support this" but "port 2-D's mechanism"; write the sibling's mechanism
into the issue/ADR as the template. Also compare which sides/pairs each product picks — #989 was found
this way (2-D's parallel pair depends on typing order). Related: [[measure-before-diagnosing]],
[[measure-the-plans-therefore]], [[try-the-neighbouring-spelling]].
