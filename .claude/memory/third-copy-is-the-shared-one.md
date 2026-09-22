---
name: third-copy-is-the-shared-one
description: "Before building a mechanism in one product tree, count the siblings that already have it — two existing copies means yours is the third and belongs in shell/ with a §5c lock"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 8c5a7ea4-cff0-4ae1-b901-c37d21fcd4d3
  modified: 2026-09-22T10:20:21.814Z
---

When adding a mechanism to one product tree, **count how many siblings already have something of the
same shape before writing it local**. Two existing copies means the one being written is the third,
and the operator's standing rule is that the tools share as much of the design and pedagogy as
possible — so it belongs in `shell/`, parameterized (the caller injects its lexicon, its predicates
and its message keys; `shell/` keeps no product strings, [ADR-W-016]), with the cross-product lock
pattern of ADR-W-071 / docs/28 §5c: shared rows in `shell/__tests__/fixtures/`, a thin lock per tree,
legitimate differences as **explicit options** rather than silent exclusions.

**Why:** 2026-09-22, #1353. I built analytic's imperative register as a bespoke shape
(`imperativeCandidates()` + a new `SubmitVerdict` kind) when `src/parser/scope.ts` and
`src3d/parser/scope3.ts` already shared a `ScopeCategory`/`ScopeMatch` shape. The ADR I wrote
explicitly justified not hoisting — *"one implementation is not a pattern"* — which was false: it was
the third. The operator caught it the moment the PR merged, and it cost a follow-up issue (#1358) plus
an ADR amendment. Shipping the RIGHT behaviour into one tree with no shared seam still widens the
disparity: four tools then answer the same student action four different ways.

**How to apply:** before writing a new product-local module, grep the sibling trees for the same
concern and read what shape they use. If one sibling has it, matching its shape is enough; if two do,
the work includes hoisting the core and writing the shared lock, and that cost goes in the plan up
front — not discovered after the merge. A note in an ADR saying "not shared yet" needs the sibling
count in it, or it is a guess. Converge UPWARD (bring the others to the better behaviour) rather than
reverting the good one to buy consistency at the lowest common denominator.

Related: [[cross-product-disparity-is-a-wiring-smell]] (the diagnosis-side twin — a sibling that
behaves differently is read as a bug), [[locks-must-call-not-reproduce]].
