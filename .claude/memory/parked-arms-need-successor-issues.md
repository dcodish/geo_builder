---
name: parked-arms-need-successor-issues
description: "A CLOSED issue's ADR \"⚠ What is NOT built\" table is unfiled work — check it before calling a re-report new, and file a successor at close time"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 62e1e204-8048-4821-9146-f507aadfea12
  modified: 2026-09-20T12:55:35.806Z
---

An issue closed `COMPLETED` can still carry scope that was never built: the ADRs in this repo end with a
"⚠ What is NOT built, and the finding that decides it" table, and each row is real work with **no issue
unless someone filed one**. #1165 parked three arms; two got successor issues (#1222 arm 2, #1240) and the
angle bisector got none — so the operator re-reported the identical need six days later (2026-09-20,
«CE חוצה זווית C במשולש ABC» → #1284).

**Why:** the queue is the live record, the ADR log is not scanned when composing rounds. A parked arm that
exists only in an ADR is invisible to `gh issue list` and to the operator, so the only thing that surfaces
it again is the operator hitting it a second time — which is the failure mode the queue exists to prevent.

**How to apply:** two directions.
- *Triaging a report* — grep the closed issues for the sentence, not just the open ones, and read the
  linked ADR's "not built" table before writing "missing capability". A re-report is usually a parked arm,
  and saying so (with the ADR's own parking rationale, which often already names the buildable spelling)
  is worth more than re-deriving the diagnosis.
- *Closing an issue* — if the ADR parks an arm, file its successor in the same pass and link it from the
  close comment. `none (deliberately dropped)` is a fine answer; silence is not.

Also: an issue body's own claim about what the engine can already do is a hypothesis
([[measure-before-diagnosing]], [[measure-the-plans-therefore]]). #1165 said `bisectorFoot()` made the
bisector "present and proven"; it is a *drawing* helper reachable only from the incentre's construction,
not a residual, and the real lowering turned out to be an existing `length-eq` product. Related:
[[prior-rulings-live-in-comments]].
