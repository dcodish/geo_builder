---
name: analytic-v4-plan-on-1616
description: "The A–E plan to bring the analytic tool to 2-D level lives on issue #1616 — as of the 2026-10-03 handoff comment, slices C, D and E are BUILT as stacked PRs #1695 → #1700 → #1705 awaiting the operator's play; merge C→D→E"
metadata:
  node_type: memory
  type: project
  originSessionId: ebe6e910-268c-424d-bcb3-e1fff465749b
  modified: 2026-10-03T09:45:46.776Z
---

The analytic V4 plan ("the 471 profile", slices A–E) is tracked on GitHub issue **#1616**. Its **latest handoff comment (2026-10-03)** is the current state: A and B shipped; **C, D and E are built and green as stacked PRs #1695 (C → main) → #1700 (D) → #1705 (E)**, awaiting the operator's play of the 30-case sheet `scripts/playsheets/round-2026-10-03-cde.json`. The comment lists every open operator question (#1662, #1698, 6/5 position words, 7/4 misprint, «x = 4» after «AB = 3x», …).

**Why:** sessions end long and the operator switches machines; issue bodies are never revised (see [[prior-rulings-live-in-comments]]), so the newest comment, not the body, is authoritative.

**How to apply:** on "continue the analytic plan", read `gh issue view 1616 --comments` (last comment) first, then `gh pr list`. Merge strictly C → D → E, retargeting each PR to `main` as its base lands — never `--delete-branch` mid-stack ([[stacked-pr-merge-order]]). Measure with the 471 ratchet (floor 257/41) and the #1649 parity lock (analytic #1622 gaps reached 0).

**Lesson from building C–E with parallel streams:** split by family, but expect two streams to build the SAME sentence — converge duplicates onto one lowering at integration (bounds → D3's `order`, points → E1, sized circle → E3), and pre-allocate ADR/R ids per stream. Analytic follows 2-D's verdict for plane geometry ([[cross-product-disparity-is-a-wiring-smell]]).
