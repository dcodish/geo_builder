---
name: adr-id-is-max-over-every-heading-level
description: "The next ADR id is max+1 over EVERY heading level and the whole file — logs are not in numeric order (06b has ### entries past the last ##), and a docs-gate \"claimed twice\" is the only thing that catches a collision"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: cc697c2a-e8ac-4634-b789-38c1e240949c
  modified: 2026-09-21T12:51:39.917Z
---

Before writing an ADR, compute the id as `grep -oE "^#+ ADR-<PREFIX>-[0-9]+" <log> | grep -oE "[0-9]+$" | sort -n | tail -1` + 1
— every heading level, the whole file. Round #1332 (2026-09-21) collided three times: ADR-W-069/070 already existed
(renumbered to 072), and in 06b the tail entry was ADR-3D-242 while ADR-3D-256 sat earlier in the file under `###`
(243 → 256 → 257 before the docs gate went green).

**Why:** the logs append at the end but are not sorted, and some entries use `###`; reading the last `##` heading
under-counts. A concurrent branch in the same round can also take the next id, so on the staging tip the ids from
different items must be re-checked once more.

**How to apply:** compute the max with the command above in the branch you are writing in, then re-run the docs gate
(`npm run test:docs`) on the STAGING tip after merging all items — it is the one place a cross-branch collision shows.
Related: [[gate-lines-are-read-not-matched]].
