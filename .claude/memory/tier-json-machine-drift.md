---
name: tier-json-machine-drift
description: "reports/test-tiers.json no longer stores timings (#812) — a diff in it is now a real membership change, but membership can still differ per machine"
metadata: 
  node_type: memory
  type: project
  originSessionId: f2fd245a-2843-40f3-a231-fcfa4334f955
  modified: 2026-09-01T16:36:57.228Z
---

**Superseded in part by #812 / ADR-W-037 (2026-09-01, round #864).** The artifact no longer carries
`slow[].ms` or `measuredCutoffMs` — it holds the tier MEMBERSHIP as file paths, sorted by path, one per
line. So the old failure mode is gone: a green suite on either PC no longer rewrites the file just
because the clock differed, and two branches that each add a slow test now merge as two insertions
instead of conflicting on a column of numbers.

**What is left.** A diff in this file is now a REAL membership change — but membership can still differ
between the two PCs, because the relative rule (the heaviest files holding 75% of suite time) is
invariant under a *uniform* speed difference and the machines are not uniformly different (core counts
change per-file wall time unevenly). So it can still ping-pong across a cross-machine round
([[work-pc-cross-machine]]), just without the noise on top.

**And it is noisy run-to-run on ONE machine.** Measured 2026-09-01: two full runs 40 minutes apart on the
same PC moved three files in and out of the tier. The rule is a share of total suite time, so ordinary
load variation reshuffles the tail. So a membership diff is NOT automatically worth committing.

**How to apply:** after a full run, read the diff. Paths only, and it names which files joined and left.
Commit it when the membership change has a REASON (a genuinely new slow test, a file that got much
faster); discard it when it is the same handful of borderline files trading places — and always discard
it before tagging a deploy, so the tag sits on the tested commit. If you ever see an `ms` or
`measuredCutoffMs` line reappear, something regressed #812 and `server/__tests__/test-tiers.test.ts` should
have caught it. The conservative membership is still the one measured on the SLOWER machine.
