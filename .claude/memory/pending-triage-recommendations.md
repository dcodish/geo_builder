---
name: pending-triage-recommendations
description: "Two hand-verified 2-D feature recommendations from the 2026-08-11 log-triage, awaiting operator approval — the full report is gitignored and does NOT travel across PCs"
metadata: 
  node_type: memory
  type: project
  originSessionId: 42043d42-a636-4a82-ab88-9727bbce2811
  modified: 2026-08-11T12:51:41.094Z
---

The 2026-08-11 /log-triage run (work PC, on the 08-10 log cache — the prod box refused SSH that day)
found **no NEW LIVE gaps**, but hand-verifying the UNVERIFIED cluster produced two feature
recommendations that are **awaiting operator approval** and live only in the gitignored
`reports/log-triage-recommendation-2026-08-11.md` on the work PC:

1. ~~**Arc relations demand an explicit «במעגל O» anchor**~~ — superseded by REC-1, which was
   **APPROVED and FILED 2026-08-13 as issue #546** (feature, P2, 2d). Operator ruled: membership
   tie-break first (bind when the utterance's named points uniquely determine the circle, matching
   the ADR-119 chord behavior), and an `ambiguous-circle` clarify telling the student to name the
   circle when it stays ambiguous. The issue queue owns it now — nothing pending here.
2. **Forward references between clauses of one utterance** (proposed P3, 2d). «F אמצע DO … O - חיתוך
   של AC ו-BD» — every clause parses alone (dash+של phrasing is covered); `splitStatements` applies
   left-to-right so a last-clause definition drops earlier clauses' points. Fix: topological clause
   reorder by label introduction. (The «ן-»→«ו-» typo appeared twice in the same rows.)

A third recommendation joined them on 2026-08-11 (home PC): **the incremental tangent-pair crossing**
«המשיקים נחתכים בנקודה E» has no rule (P3, 2d) — the one-utterance form is covered, the incremental one
is not, and it is the only prod row in the window where the **LLM failed too**. REC-2 in the same report.

On approval: file as `feature` issues (ready-to-file text is in the reports) and build via the docs/22
PR route. Once all are filed or declined, **delete this memory** — the issue queue takes over.

Re-confirmed by the 2026-08-13 work-PC triage run: still no new 2-D gaps, and the tangent-cluster
rows remain UNVERIFIED in the auto report (edit-action prefix). REC-1 was approved and filed that
day (#546); **still pending an operator decision: item 2 (forward references between clauses) and
REC-2 («המשיקים נחתכים בנקודה E», #546's sibling)**. SSH pull to the prod box worked again on 08-13.

Context for a home-PC triage run: the surfaced ledger (#502) was committed/pushed 2026-08-11
(`3430b60`), so carried rows will not re-surface as NEW. If the home scp ALSO fails, the droplet's
sshd is the suspect (the work-PC pull worked on 08-10, failed on 08-11).
