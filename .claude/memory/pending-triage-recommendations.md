---
name: pending-triage-recommendations
description: "Two hand-verified 2-D feature recommendations from the 2026-08-11 log-triage, awaiting operator approval — the full report is gitignored and does NOT travel across PCs"
metadata: 
  node_type: memory
  type: project
  originSessionId: 42043d42-a636-4a82-ab88-9727bbce2811
  modified: 2026-08-11T10:33:06.782Z
---

The 2026-08-11 /log-triage run (work PC, on the 08-10 log cache — the prod box refused SSH that day)
found **no NEW LIVE gaps**, but hand-verifying the UNVERIFIED cluster produced two feature
recommendations that are **awaiting operator approval** and live only in the gitignored
`reports/log-triage-recommendation-2026-08-11.md` on the work PC:

1. **Arc relations demand an explicit «במעגל O» anchor** (proposed P2, 2d). «קשת AD = קשת BC» /
   «קשת AD שווה לקשת BC» are not-handled solely for the missing anchor — verified the «שווה ל» wording
   parses fine WITH it. The prod student's circle was anonymous, so the anchor was unwritable. Fix at
   the implied-circle binding seam (chord/tangent rules already bind it; arc rules are the odd family out).
2. **Forward references between clauses of one utterance** (proposed P3, 2d). «F אמצע DO … O - חיתוך
   של AC ו-BD» — every clause parses alone (dash+של phrasing is covered); `splitStatements` applies
   left-to-right so a last-clause definition drops earlier clauses' points. Fix: topological clause
   reorder by label introduction. (The «ן-»→«ו-» typo appeared twice in the same rows.)

On approval: file as `feature` issues (ready-to-file text is in the report) and build via the docs/22
PR route. Once both are filed or declined, **delete this memory** — the issue queue takes over.

Context for a home-PC triage run: the surfaced ledger (#502) was committed/pushed 2026-08-11
(`3430b60`), so carried rows will not re-surface as NEW. If the home scp ALSO fails, the droplet's
sshd is the suspect (the work-PC pull worked on 08-10, failed on 08-11).
