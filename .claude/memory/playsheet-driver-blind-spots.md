---
name: playsheet-driver-blind-spots
description: "The play-sheet driver misreads two things — a 2-D refusal that takes >2 s (read before it appears) and a notice on the ⚠ channel (read as a refusal); verify those by a timed browser probe or the screenshot, never \"fix\" them"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 6c8406cf-7250-4f0c-80ba-7ffd817e1cc0
  modified: 2026-09-30T08:44:24.960Z
---

`scripts/play-sheet-drive.mjs` gave two false reds in round #1571 (2026-09-30), neither a product bug:
1. **Slow 2-D answers.** «רבע מעגל CAB» refuses after ~2.2 s and «α = 50» settles after ~3.2 s — identical on `main` — but `waitForSettle` gives up first, so the driver saw "0 refusals" / a «חושב…» screenshot.
2. **Notices on the ⚠ channel.** A notice that shares the `noValidConfig` status channel is counted as a refusal by `refusals()` even when the row committed ✓.

**Why:** a mechanically red case goes back to the fix (rule 5), so a driver false-red can send a correct change back or, worse, get "fixed" into the wrong shape.

**How to apply:** when a case is red, look at the screenshot first. For timing, re-run the exact lines with a probe that uses the driver's own helpers (`APPS[..].inputHint`, `refusals`, `dismissModal`) and waits on «חושב» disappearing, on BOTH the branch and `main`, and record the case as verified-by-probe with the timings. Also: when a probe reports 3 ms per line, it never waited — the probe is broken, not the product. Related: [[look-at-the-ui-before-he-does]].
