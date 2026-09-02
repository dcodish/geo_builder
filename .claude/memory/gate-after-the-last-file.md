---
name: gate-after-the-last-file
description: "Run `tsc -b` as the LAST act of an item, after the test file is written — gating before the lock exists lets test-only type errors through to the batch gate"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 79d8e913-3646-42eb-939a-24700cb56522
  modified: 2026-09-02T05:09:51.042Z
---

In round #869 two items reported `tsc -b` clean and still landed type errors that the batch full-suite
gate caught: an unused residual parameter in the #520 lock, and a locale-module cast in the #853 i18n
ratchet. Both were **test-only**, and both slipped for the same reason — the per-item `tsc -b` ran after
the *product* change and before the *test file* was written, and the per-item gate after that was
`vitest`, which type-checks nothing.

**Why:** the natural build order is product code → typecheck → test → run test → commit, and typecheck
sits in the middle of it. A lock file is source too, and it is usually the file with the fresh, unchecked
type surface (casts over imported JSON, hand-built fixtures, unused callback params).

**How to apply:** make `tsc -b` the **last** thing before the commit, after every file the item touches
exists — not a step in the middle. In a fix round that is cheap insurance: a type error found per item
costs seconds, the same error found on the staging tip costs a full-suite re-run (~6.5 min) and muddies
the batch's gate record.

Related: [[gate-lines-are-read-not-matched]] — evidence produced is not evidence read; a green `tsc` from
before the last file is not a green `tsc`.
