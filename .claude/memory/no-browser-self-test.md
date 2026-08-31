---
name: no-browser-self-test
description: The harness CAN drive a real browser via Playwright — proven 2026-08-31; npm run smoke:visual is the gate, and a UI change is not verified until the screenshots are read
metadata:
  type: project
---

**Superseded 2026-08-31 (round #843). The earlier version of this memory was wrong.**

It said there was no browser capability here. What was actually true was narrower: no *tool* in the
harness navigates or screenshots, and `playwright` was not a dependency of this project. But the
Chromium binaries were already in `~/AppData/Local/ms-playwright`, `scripts/visual-parity.mjs` had
been importing `playwright` for a fortnight, and its own header said *"Formal wiring into the
readiness gate is #704's."* Installing the package and driving all three apps worked on the first
try — including reading the PNGs back with the Read tool, RTL and Hebrew rendering correctly.

**So: a UI change can and must be looked at before the operator sees it.**

```
npm run dev
npm run smoke:visual [-- --app 2d|3d|complex] [-- --base http://localhost:PORT]
```

Drives each product's own example lines, captures empty/steps/About to `reports/screens/` (gitignored),
and fails on a blank capture, a refused line, an uncaught page error, or a step that draws no geometry.
Shipped in PR #844 (ADR-W-035); `--base` exists because an unmerged PR needs its own port
([[pr-items-need-their-own-server]]).

**Why this matters more than the capability itself.** On 2026-08-31 two defects shipped in one day —
a bidi fix that did not work, and the #841 placeholder collision — both with green tests and honest
gate reports, both caught by David's eyes. The shape was identical: **the session verified the
mechanism it changed and never looked at the surface a student sees.** The absence also cost the play
gate itself: he waived play-and-approve («lets deploy all for now»), so two UI PRs shipped visually
unseen by either party.

**How to apply.** For any UI-touching work: run it, then actually READ the screenshots — the gate
proves the captures are real, not that they are right. Then say plainly which items are
machine-verified and which need his judgement, instead of handing over an undifferentiated checklist;
that conflation is what prompted his original question. Still never claim to have "tested it in the
app" for anything not actually driven and looked at.

Related: [[gate-lines-are-read-not-matched]], [[deploys-are-mine-to-run]], [[pr-items-need-their-own-server]].
