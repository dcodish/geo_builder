---
name: anchor-wait-predicates
description: "A wait-loop's grep must match the exact marker it waits for — `grep -q \"3d exit\"` matched \"build:3d exit 0\" and started the batch full suite while the 3-D lane was still running (round #927, 2026-09-07)"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: a7777971-5135-4bac-b089-580d8f55077d
  modified: 2026-09-07T19:27:41.949Z
---

In round #927 a background chain waited for a lane with `until grep -q "3d exit" log`, but the same
log carried `build:3d exit 0` from the step before, so the wait ended at once and `npm run test:full`
overlapped the still-running 3-D lane — exactly the overlap the fix-round rules forbid (round #822
doubled every gate that way). The verdict was still valid (pass/fail is not timing-sensitive) but the
timings and any tier drift from that run were not trustworthy.

**Why:** a substring predicate on a shared log matches the first line that contains it; every step
in a chain writes "<step> exit N" lines, and short markers are substrings of longer ones.

**How to apply:** write per-step markers that cannot be substrings of each other (`LANE3D-DONE`,
`BUILD-DONE`), anchor the grep (`grep -q "^3d exit"`), or wait on the background TASK notification
instead of a log. Related: [[gate-lines-are-read-not-matched]].
