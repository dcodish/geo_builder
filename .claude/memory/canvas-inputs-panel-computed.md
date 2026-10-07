---
name: canvas-inputs-panel-computed
description: "Settled operator rule — the canvas shows what the student stated (the parameter/symbol), the data panel shows computed values; never file \"should the canvas show the derived value?\" as a question"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 6c8406cf-7250-4f0c-80ba-7ffd817e1cc0
  modified: 2026-09-29T18:45:35.046Z
---

The canvas carries the student's INPUTS (a symbol such as `y_M` or `α` stays on the canvas while it is unvalued); the data panel carries the CALCULATED values (`M = (0, 1)`). This is ADR-W-047 (2026-09-08), and the operator re-affirmed it on 2026-09-29 when #1563 re-asked it: *"my ruling in the past was no."*

**Why:** A bagrut question is worked in parts; part 1 reasons with the letter, so replacing it on the canvas with a computed number erases what the student is reasoning about. Re-asking a settled ruling costs the operator's attention and reads as not having done the homework.

**How to apply:** When a canvas label and the panel disagree only because the panel shows a derived value, that is the rule working — not a bug and not a question. Before filing any display question, grep `docs/06w-decisions-workspace.md` for ADR-W-047 and ADR-W-118. The rule covers all four builders (complex included since 2026-10-07, #1862). The recorded exceptions are the only ones: a parameter the student *valued* gets a chip on the valuing line; a typed complex number shows in its polar form in the polar view; analytic writes a computed circle centre (and, #1863, a parabola/ellipse focus and directrix) when determined; 3-D writes computed coordinates while its data panel is open. **This rule is about values, not marks**: it never licenses drawing a stated relation (AB = AC) as a mark at rest — relations live in the givens list and the opt-in relations layer (ADR-W-118 B2, #1805). Related: [[prior-rulings-live-in-comments]].
