---
name: icebox-queue-sweep
description: "The `icebox` label (closed, not planned) holds parked issues; 2026-10-05 sweep cut open 182→131; the \"stop the refill\" rule is still undecided"
metadata:
  node_type: memory
  type: project
  originSessionId: b3e55d2c-e524-464a-be50-e40ea7f70a56
  modified: 2026-10-05T18:41:26.421Z
---

On 2026-10-05 the operator approved a one-time queue sweep. Issues a session found while working, that no student hit and he never asked for, and where the tool shows nothing false, were **closed "not planned" with the `icebox` label**. So were issues he had already parked. Each carries a "reopen when a student hits it or the operator asks" comment. 50 were parked and 2 closed as done; the open list went 182 → 131.

**Why:** the queue was growing faster than rounds drained it (2026-09-28 week: 250 opened, 220 closed). About a third of new issues were session-generated: parity ports, successors and "found while fixing" items.

**How to apply:**
- Treat `label:icebox` as parked, not dead. Reopen one when the prod logs show a student hitting it.
- When proposing parking, never park an issue where the tool says something false: a wrong figure, a false "contradicts", a silent misread, or a guide sentence that fails.
- The operator wants to "talk once we have data" about **stopping the refill**: sessions recording parity gaps, leftover arms and "noticed while working" items in the parity table, ADRs or icebox instead of opening issues. This is NOT ruled yet.
- Until it is ruled, [[parked-arms-need-successor-issues]] still stands. Bring the inflow numbers to that conversation.
