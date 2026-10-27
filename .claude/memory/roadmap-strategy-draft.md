---
name: roadmap-strategy-draft
description: "In-progress strategy/roadmap work started 2026-10-26 — the artifact URL, what the operator agreed, and what still needs his answer before anything is written to the repo"
metadata:
  node_type: memory
  type: project
  originSessionId: 085ecb4d-0bb1-4faa-bf28-623344445d75
  modified: 2026-10-26T11:59:09.791Z
---

**Status 2026-10-26: draft, nothing in the queue or workflow changed yet.** Two private artifacts:
- **The overview he works from:** https://claude.ai/artifact/2RxjAuuDfhvG5kcNAFw7Ew ("Geo Builder Roadmap"). It has
  the year strip, a five-week board of 11 workstreams, this week's focus and what waits on him. Each workstream
  opens its issues. He asked for this after finding the long map "lots of text, hard to follow". Keep it one screen.
- **The detailed reference:** https://claude.ai/artifact/4FEgb4ef1f1UAd6h4wae3Y ("Geo Builder Roadmap Map"), with the
  full directions inventory per product.

Read both with the Artifact tool (`action: "read"`) before continuing.

**The overview is driven by its own database** (load the ArtifactData tool; url = the overview). Documents:
- `plan/current`: the weeks and the workstreams with their issue numbers. Add a newly filed issue to a workstream here; no republish needed.
- `state/issues`: the live state of each plan issue.
- `snapshots/<date>`: counts by workstream, by phase and by tool × priority. One document per refresh, and **the
  first one is the baseline**: never overwrite it.
- `decisions/<id>`: the decisions that gate the plan, each with its status: open, answered (he clicked a choice on the
  page), or recorded. **On every session start, list `decisions`. For each `answered` one, transcribe the ruling to its
  GitHub issue (quote his note) and set its status to `recorded`.**
- `tools/snapshot`: the refresh script's source and the how-to. Refresh after each fix round, and whenever he asks.

**Saving from the page:** when the page is opened in the Claude Code desktop **side panel**, writes to its database do not
land (seen 2026-10-26: all ten selections were lost). The page now warns after 8 s and has a "Copy my answers" button.
Saving from claude.ai in a browser is untested. Decisions are numbered D1–D10 by `rank`.

**The ten plan decisions D1–D10 were ruled on 2026-10-26** (given in chat). They are transcribed to #1177, #1186,
#2556, #2499, #2538, #2552, #2554 and #2547, and `needs-operator` was removed from #2499, #2538, #2552 and #2547. Four
choices differ from the recommendation:
- **D1 B:** the canvas-label design session runs first, in week 1; the locus chip waits for it.
- **D6 A:** ship #2499 now; one slower refusal is a scoped exception to the no-slowdown rule.
- **D7 B:** #2538 uses one general rule (about 4 s on one quadrilateral line accepted).
- **D8 B:** only the exam's two «המעגל הראשון» sentences.

**Next:** he asked to connect GitHub to claude.ai, so the page can read issue state live through the `mcp`
capability. Once the connector exists, check its tools and make one read-only call before wiring it. **He wants the roadmap discussed and agreed
before any relabelling.**

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
