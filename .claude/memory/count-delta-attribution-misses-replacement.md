---
name: count-delta-attribution-misses-replacement
description: "When adding a record kind that a store attributes to facts by COUNT DELTA, measure the second statement on the same letter — a replacement leaves counts unchanged and blame lands on an innocent earlier fact (#902, 2026-09-06)"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 6e0cad47-e056-4e8c-b4e6-c5d7d2233d8a
  modified: 2026-09-06T20:32:38.972Z
---

Measuring the reported case is not enough when the new record can be RESTATED. In #902 the first
«k = 2» was attributed correctly (count 0 → 1) and every reported row was green, but «k = 5» after it
REPLACED the pin, changed no count, became nobody's statement — and its contradiction was blamed on an
earlier injection while the new line read green. The parameter lane had the identical hole
(«m = 100» after «m = -5»). Both `store3.ts` owner attributions are keyed on content now
(`pivotPinKey` / `paramPinKey`); `claimOwners` still counts, which is fine only while a claim is never
replaced.

**Why:** the store's `submit` checks only the NEW fact's status (keep-prior). Whatever fact the blame
lands on other than the new one is a silent acceptance of a contradiction — the honesty invariant's
worst shape, and invisible to a test that asserts only the first statement.

**How to apply:** whenever a fix adds or widens a record that `derive3`/`foldFact` attributes by a
before/after count, add the RESTATED case to the measurement script before writing the lock: the same
letter/object stated twice, the second time contradicting. If the first statement goes red and the
second is accepted, the attribution is count-based and needs a content key. Related:
[[measure-before-diagnosing]], [[locks-and-gates-are-hypotheses]].
