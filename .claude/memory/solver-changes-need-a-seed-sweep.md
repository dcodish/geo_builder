---
name: solver-changes-need-a-seed-sweep
description: "A solver change is measured by its whole-rate across 24 seeds and by a browser drive's per-line timing, never by the locks alone — the #1317 family passed 62 locks while converging at 2 of 24 seeds and freezing the page for 30 s"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 6174efcc-ef4d-4273-9dd6-941e0c4f0edd
  modified: 2026-09-21T15:52:29.552Z
---

After changing the analytic solve vector (ADR-AG-144, 2026-09-21) every lock was green and the exam figure
built at seed 0 — while `evaluate` converged at only 2 of 24 seeds, and a Playwright drive of the page timed
out on line 14. Three basin problems (an absolute-value residual starving the Jacobian, a joint descent from
a compromised start, a wrong-sign root that re-sampling could not leave) and a 24-seed spread walk on a
determined figure were all invisible to the locks, because the locks assert the figure the drawable search
eventually finds.

**Why:** the drawable search walks past bad seeds, so a lock on `derive()` passes at 2/24 as well as at 24/24;
the cost of walking is paid by the student at the keyboard, not by the test.

**How to apply:** before calling any solver, sampler or seeding change done, run a 24-seed whole-count
(`evaluate(c, s)` for s in 0..23 — unsatisfied, selectorsOk, vacant) on the issue's own figure and on a
param-free control, and drive the reported sequence through the page with per-line timings. A whole-rate
under ~20/24 or a line over ~2 s is a finding, not a tolerance. See [[measure-before-diagnosing]],
[[no-browser-self-test]].
