---
name: red-suite-may-be-the-gate-working
description: When a newly-added invariant turns tests red, measure the failing scenario on the PRE-change baseline before assuming the invariant is wrong — the tests may be encoding the bug
metadata:
  type: feedback
---

Adding a correctness gate and seeing the suite go red is **not** evidence the gate is too strict. Measure
each failing scenario on the baseline **before** the change, and ask what the old code was actually doing.

On 2026-09-02 (#872), a flat-collapse arm was added to 3-D's `degenerate()` accept gate. The full suite went
red in exactly three places. Measured on `main` — the shipped code, no changes — every one of the three was
**already building a flat solid**, silently, green, in prod:

| lock | figure | flatness (off-plane / span) on `main` |
| --- | --- | --- |
| `issue-821` | «SB מקביל למישור ACD» on a pyramid | 8.8e-9 |
| `relation-battery` | tetra + «AB=u» + «CD מקביל ל-u» | 1.0e-8 |
| `issue-817` | its 7-line sequence, six seeds | 3.8e-14 … 8.4e-17 |

Two were **forced by the givens**, not solver accidents — plane ACD *is* the base plane and B lies in it;
two parallel lines are coplanar so a tetra with AB ∥ CD has no volume. The tests had been asserting that
contradictions build. The instinct to "relax the new gate until the suite is green" would have preserved
three real defects and thrown away the fix.

**Why:** a test asserts what the code did when it was written, not what is correct. A new invariant is
precisely the instrument that finds where those two diverged, so its first red run is data about the old
behaviour. Relaxing the gate to restore green is the highest-cost possible mistake: it destroys the finding
*and* leaves the fix looking done.

**How to apply:**
- On a red suite after adding an invariant, **measure the failing scenario on the baseline first** — a
  probe on the pre-change tree, printing the actual quantity the invariant measures. Decide only then.
  ([[measure-before-diagnosing]] — same discipline, applied to test failures rather than issue bodies.)
- If the old behaviour was wrong, **re-base the test, never relax the gate**: move it to a scenario where
  its subject is genuinely satisfiable, and **keep the old figure as an explicit refusal lock** so the
  witness survives the edit. Deleting the assertion loses the finding.
- Expect one of these to collide with a **prior ADR** rather than being merely stale — here #817 had
  deliberately decided collapse is *tolerated* and the renderer made total over it. A design reversal is
  the operator's call: present it with the measurements and a recommendation, and file the record
  reconciliation as its own issue instead of burying it in the fix commit.
- A fix that only corrects the residual can expose a *second* defect underneath it. Here the corrected
  bisector let the solver satisfy the given by flattening the pyramid instead — measurably, silently. Check
  what the solve did to *satisfy* the constraint, not just that the constraint now holds.
