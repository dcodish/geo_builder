---
name: budgets-must-charge-cache-hits
description: A work-count budget is only deterministic if a memo hit is charged the work it saved; a determinism lock must run cold AND warm on a figure whose cost sits in memoized calls
metadata:
  node_type: memory
  type: feedback
  originSessionId: e7b4d610-504f-4b8e-9937-9f5f2cc0e131
  modified: 2026-09-30T17:46:51.792Z
---

ADR-558 (2026-09-30) bounded the 2-D knowledge pool by `evaluateCore` calls to make "same input, same answer" true, and shipped a lock asserting an identical verdict on a second run. The lock passed; the guarantee was false: on the T12 figure the same facts came back incomplete cold (21 s) and complete warm (2.7 s), because the extra seeds run `replay`, which is memoized, and a hit counts zero work. Found only when the operator reported a 25 s ask (#1605).

**Why:** a counter of work actually done measures cache warmth as much as input. A lock on a figure whose cost happens to sit in un-memoized calls cannot see this.

**How to apply:** whenever a budget, cap or "deterministic" claim counts operations, (1) check every memo the counted path can hit and charge a hit its recorded cost, or prove no memo is reachable; (2) write the determinism lock as cold-then-warm on a figure whose cost is in the memoized path, and assert the counted work is equal, not just the verdict. See [[locks-and-gates-are-hypotheses]], [[measure-before-diagnosing]].
