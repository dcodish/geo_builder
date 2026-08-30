---
name: tier-json-machine-drift
description: reports/test-tiers.json drifts wholesale between the two PCs because it stores raw ms — don't commit the churn
metadata:
  type: project
---

`npm run test:full` rewrites `reports/test-tiers.json` with **absolute milliseconds**, so the same
green suite produces a different file on each of David's two PCs — the home PC ran ~30% faster than
the office PC on 2026-08-30, which moved `measuredCutoffMs` (64346 → 35379) and reshuffled slow-tier
membership even though nothing about the code changed.

**Why:** the file is a measurement, not a decision. Committing it from whichever machine happened to
run last makes it ping-pong across every cross-machine round ([[work-pc-cross-machine]]), and the diff
looks like a real change to the next session.

**How to apply:** after a full run whose only dirt is `reports/test-tiers.json`, check whether membership
moved for a *reason* (a genuinely new slow file) or just from timing. Timing-only → `git checkout --` it
and deploy/commit the clean tree; the tooling's "commit test-tiers.json" hint is not a per-run obligation.
The conservative membership is the one measured on the SLOWER machine, so keeping the office-measured
file costs nothing at home.
