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

1. ~~**Arc relations demand an explicit «במעגל O» anchor**~~ — **superseded and re-diagnosed 2026-08-11
   (home PC), see `reports/log-triage-recommendation-2026-08-11-home.md` REC-1.** The anchor is NOT
   required: «קשת AD = קשת BC» builds fine against a single anonymous circle at HEAD. The real
   discriminator is the circle **count** — `existingCircleRef` (src/parser/parse.ts:345) ends with
   `circles.length === 1 ? circles[0] : null`, so ANY anonymous «המעגל» reference dies the moment a
   second circle exists (verified on triangle + circumcircle + incircle: tangent-at-a-point and arc
   equality both not-handled; `מיתר AB` binds correctly because it uses `withCarrierMembership`/ADR-119
   instead). Fix = a membership tie-break at that chokepoint + `ambiguous-circle` clarify. Still P2, 2d.
2. **Forward references between clauses of one utterance** (proposed P3, 2d). «F אמצע DO … O - חיתוך
   של AC ו-BD» — every clause parses alone (dash+של phrasing is covered); `splitStatements` applies
   left-to-right so a last-clause definition drops earlier clauses' points. Fix: topological clause
   reorder by label introduction. (The «ן-»→«ו-» typo appeared twice in the same rows.)

A third recommendation joined them on 2026-08-11 (home PC): **the incremental tangent-pair crossing**
«המשיקים נחתכים בנקודה E» has no rule (P3, 2d) — the one-utterance form is covered, the incremental one
is not, and it is the only prod row in the window where the **LLM failed too**. REC-2 in the same report.

On approval: file as `feature` issues (ready-to-file text is in the reports) and build via the docs/22
PR route. Once all are filed or declined, **delete this memory** — the issue queue takes over.

Context for a home-PC triage run: the surfaced ledger (#502) was committed/pushed 2026-08-11
(`3430b60`), so carried rows will not re-surface as NEW. If the home scp ALSO fails, the droplet's
sshd is the suspect (the work-PC pull worked on 08-10, failed on 08-11).
