---
name: roadmap-strategy-draft
description: "In-progress strategy/roadmap work started 2026-10-26 — the artifact URL, what the operator agreed, and what still needs his answer before anything is written to the repo"
metadata:
  node_type: memory
  type: project
  originSessionId: 085ecb4d-0bb1-4faa-bf28-623344445d75
  modified: 2026-10-26T08:50:09.179Z
---

**Status 2026-10-26: draft, nothing in the queue or workflow changed yet.** The full map is the private
artifact https://claude.ai/artifact/4FEgb4ef1f1UAd6h4wae3Y ("Geo Builder Roadmap Map"). Read it with the
Artifact tool (`action: "read"`) before continuing.

**Agreed with the operator:**
- The competition is general AI. The edge is the givens list, not the picture. This is recorded in the
  Positioning section of docs/01-vision.md (#2555). Related: [[promo-video-plan]].
- Audience for now: the operator teaching in class, plus the teachers he shares with. Students on their own come later.
- Roadmap pace = his teaching calendar. Analytic is **now**: lines and circles are mostly taught, locus is next.
  3-D vectors are **next**: they start in about 4–6 weeks, i.e. early-to-mid December 2026. 2-D is **maintenance**:
  fix bugs, no feature development. Complex comes **last**. Conics (ellipse, parabola) come later in analytic.
- He wants the roadmap built from the feature backlog (parked, deferred, "where it can grow"). The
  artifact's section 5 holds that inventory per product.
- He wants to think more deeply about **locus discoverability** (#1177 and its family).

**Answered 2026-10-26:**
- **Ready for a unit = "ready enough".** The unit's bagrut questions build easily and correctly, and so do the book examples
  he tests. Not 100% coverage. 2-D today is the reference: standard cases work, and a rare bug doesn't block readiness.
- **Conics and the sphere (round solids, #1569) move to next school year.** They are outside this year's curriculum.
  This year's order: analytic locus → 3-D vectors → complex.
- **No fixed fix-round split.** A round follows the current work. *"even P1s don't always have to go in first priority"*.
  This conflicts with CLAUDE.md's "P1 — drop everything", so it needs his wording in an ADR before it changes.
  The proposal on the artifact is to add "how standard is the case" to priority.

**Priority scheme ruled 2026-10-26, filed as #2556 (not built yet):** P1 = a wrong answer that a real person hit
(his own sessions count). A wrong answer found internally = P2 with a `wrong-answer` mark. Priority follows the
product's phase (a complex P2 is not important now). Proposed labels: `wrong-answer` and `reported`, plus a "Later"
bucket and re-ranking whenever a phase changes.

**Still needs his answer:** the process proposals (milestones, rounds that follow the work, the intake gate, phase
review, the P1 rewording). These need a workspace ADR and his approval. Also, book the locus design conversation.

**Why:** the operator found the work "sporadic: no roadmap, no priorities, no phases".

**How to apply:** don't build milestones or change skills until he answers. Start from the artifact.
