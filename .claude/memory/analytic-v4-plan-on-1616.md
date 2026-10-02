---
name: analytic-v4-plan-on-1616
description: "The A–E plan to bring the analytic tool to 2-D level (4-point bagrut, 471) lives in the 2026-10-02 handoff comment on issue #1616 — slices C #1620 → D #1621 → E #1622 are next; \"done\" = the #1649 parity lock has no analytic known-gap rows"
metadata:
  node_type: memory
  type: project
  originSessionId: ebe6e910-268c-424d-bcb3-e1fff465749b
  modified: 2026-10-02T14:55:48.548Z
---

The analytic V4 plan ("the 471 profile", slices A–E) is tracked on GitHub issue **#1616**. Its **2026-10-02 handoff comment** is the current state: A (#1618) and B (#1619) shipped; **C #1620 is next**, then D #1621, then E #1622. It also lists the standing rulings and the fold-in bugs (#1670, #1673, #1662).

**Why:** the session that ran A and B ended long. The operator asked that a NEW session continue the plan and be able to find it. Issue bodies are never revised (see [[prior-rulings-live-in-comments]]), so the comment, not the body, is authoritative.

**How to apply:** on "continue the analytic plan / phase C", read `gh issue view 1616 --comments` (the last handoff comment) first. Measure progress two ways:
- the 471 corpus ratchet floor (217/263 · 21/46 at handoff);
- the #1649 parity lock (`shell/__tests__/fixtures/geo-input-parity.ts`). A slice is done when its analytic known-gap rows flip.

Analytic follows 2-D's verdict for plane geometry ([[cross-product-disparity-is-a-wiring-smell]]).
