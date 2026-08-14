# 06d — Decision log: the complex-numbers tool (`src-complex/`)

_The complex-numbers track's OWN ADR log (ids `ADR-CX-NNN`), separate from the sibling logs **by
design** — docs/20 §12 rule 3: parallel session streams must not race on one ADR numbering sequence.
Same conventions otherwise: every significant decision gets an entry; the plan of record is
[27-complex-numbers-tool.md](27-complex-numbers-tool.md)._

---

## ADR-CX-001 — Product accepted; planning decisions D1–D5 resolved (2026-08-14)

**Context.** The product was registered in the workspace ([docs/22 §9](22-workflow.md)) with no plan.
An operator planning session produced [docs/27](27-complex-numbers-tool.md) — a corpus reading of
eight 572 exams (2011–2024) plus the formula-sheet contract — which posed five decisions. The
operator resolved all five the same day (issue
[#583](https://github.com/dcodish/geo_builder/issues/583)).

**Decisions (operator, 2026-08-14):**

1. **D1 — exact polar core.** Verification runs over exact values — arguments as rational multiples
   of π, moduli as bounded radicals, numeric fallback for non-nice values. Chosen because the
   corpus's for-all-n and minimal-n asks (4 of 8 exams) are unverifiable by numeric sampling.
   Bounded, **no CAS** — the ADR-3D-002 symbolic-layer discipline transplanted.
2. **D2 — v1 given-forms = the docs/27 §8 grammar.** Cartesian/polar literals with parameter
   coefficients, six operations + conjugate + |·| + integer powers, `zⁿ = w`, the closed locus list,
   quadrant/membership givens, symbolic exponents `kn+c`. Linear systems over ℂ and mixed-modulus
   equations (`|z|i + 2z = √3`) deferred past v1.
3. **D3 — standing product rule: ALWAYS VISUALIZE.** Operator's wording: "the rule should be
   (always) to visualize the problem — whenever possible, we draw the points." No
   plot-after-candidate mode exists; exact-value labels are toggleable. Corollary from the same
   ruling: **wherever possible the student can switch a number's displayed form between polar and
   cartesian** — a display transform only, which must never reach the parser or engine (the
   ADR-448 / ADR-3D-144 display-seam rule applies from day one).
4. **D4 — series in scope.** Sequence/series asks are a recurring part of the corpus questions, so
   v1 plots power cycles and verifies student-claimed sum values (never printing a sum unprompted —
   the reproduce-and-verify charter is unchanged).
5. **D5 — build order: complex before analytic.** "We will leave analytic to the end." The product
   queue is now complex next, analytic (doc 19) last; doc 19's open §6 decision stays parked and
   does not block this track.

**Consequences.** docs/27 is ACCEPTED and gains the C0–C5 corpus-gated build plan (§9); this file
opens the `06d` log; the `complex` GitHub label exists; build slices go the feature/PR route with
per-slice exam gates becoming permanent fixtures. Entry point: C0 (product tree + Gauss plane +
literals + the polar↔cartesian toggle).

---

## ADR-CX-002 — The pedagogy ruling and the capstone exemplar (2026-08-14)

**Status:** Accepted (operator, same session as ADR-CX-001)

**Context.** Debating prototype-now vs define-first, the operator supplied one exam question
(image; transcribed in [docs/27 §2b](27-complex-numbers-tool.md)) with the ruling: *"from a
pedagogy POV, I would like the user to be able to enter the inputs from this question and have the
tool visualize the location of points and calculations."* The question turns out to exercise all
six corpus archetypes at once, ending with five roots of `Z⁵ = Z₁·Z₂³·Z₄` (= Z₂⁵ by construction)
judged against a parallelogram — the plotted constellation *is* the exam's answer (1 on / 1 inside
/ 3 outside).

**Decisions.**

1. **The pedagogical charter, stated by the operator:** the student enters a real exam question's
   givens; the tool visualizes the *locations* of the numbers and the *calculations* (derived
   numbers, measures, root constellations) as geometry. This is the complex edition of the
   reproduce-and-verify charter — the figure, not a printed answer, is what teaches.
2. **The exemplar is the CX capstone gate** (docs/27 §9): after C2–C5 it must reproduce
   end-to-end from typed Hebrew givens, r staying a free DOF throughout, with the expected figure
   pinned in docs/27 §2b (θ = arctan ½ via the area given, the `arg Z₂ < 45°` inequality pruning
   the second branch; perimeter 60r; parallelogram; roots 1 on / 1 inside / 3 outside).
3. **D2 grammar extended** (v1): argument inequalities/ranges as branch-selecting givens ·
   measure claims as expressions in a parameter (`= 15r`, `= 60r`), verified across sampled r ·
   polygon objects over represented points incl. the named origin O, with perimeter/area ·
   quadrilateral-classification claims (reusing the 2-D He lexicon) · sequence-defined numbers
   (geometric-sequence phrasing defines Z₄ = Z₂²/Z₁) · root-vs-region counting claims
   (inside/on/outside a stated polygon).
4. **D1 refined:** the exact-argument representation is **symbolic base + rational multiple of
   π** — the exemplar's pinned θ = arctan ½ is not rational-π, yet the root spacing θ + k·72°
   must stay exact; the numeric fallback carries the base, the offsets stay symbolic. The
   rational-π family alone would have silently failed this whole question family
   (Pythagorean-triple exams), which is why the refinement is recorded now, before C1 exists.

**Consequences.** docs/27 §2b holds the transcription, target utterance shape, gate assertions,
and grammar deltas; C1's exact core is specified as two-layer (symbolic-base arguments, sampled
parameters) from the start; the 2-D quadrilateral vocabulary becomes a deliberate cross-product
*pattern* reuse (copied lexicon, never a code import — the isolation rule stands).
