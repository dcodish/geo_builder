---
name: analytic-v4-plan-on-1616
description: "The A–E plan to bring the analytic tool to 2-D level lives on issue #1616 — as of 2026-10-04 ALL slices A–E plus the follow-up PRs (#1724/#1731/#1732/#1734) are merged and deployed (prod/2026-10-04); what remains is the open analytic issue queue"
metadata:
  node_type: memory
  type: project
  originSessionId: ebe6e910-268c-424d-bcb3-e1fff465749b
  modified: 2026-10-04T04:43:34.997Z
---

The analytic V4 plan ("the 471 profile", slices A–E) is tracked on GitHub issue **#1616**. **As of 2026-10-04 it is complete:** A–E merged (PRs #1695, #1700, #1705, #1713), plus the operator-played follow-ups #1724 (stated measures on the figure), #1731 (two values as a config choice), #1732 (trig → angle + slope), #1734 (named perpendicular builds itself) and #1733 (angle label at its arc). Everything is live as **prod/2026-10-04**. The analytic #1622 parity gaps are 0; the 471 corpus ratchet floor is 357/45 (measures `confirmTaught`). The newest #1616 comment is the handoff.

**Why:** sessions end long and the operator switches machines. Issue bodies are never revised (see [[prior-rulings-live-in-comments]]), so the newest comment is authoritative, not the body.

**How to apply:** on "continue analytic", don't look for a remaining slice. Run the open-issues report filtered to `analytic`. Follow-ups filed during the build, e.g. #1687, #1699, #1701–#1704, #1710, #1712, #1725, #1722; 3-D #1726/#1735 are separate. Analytic follows 2-D's verdict for plane geometry ([[cross-product-disparity-is-a-wiring-smell]]), except where an EXCEPTIONS family says otherwise (X10: x/y never a length in analytic).

**Lesson from building C–E with parallel streams:** split by family, but expect two streams to build the SAME sentence. Converge the duplicates onto one lowering at integration, and pre-allocate ADR/R ids per stream. When GitHub's auto-merges of a stack conflict with the tested resolution, verify ancestry and then `git merge -s ours origin/main` (tree identical) instead of re-resolving.
