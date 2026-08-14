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

---

## ADR-CX-003 — The input language is a contract of generic sentence FAMILIES (2026-08-14)

**Status:** Accepted (operator directive, same day)

**Context.** Reviewing the §2b exemplar the operator directed: *"make sure we have the language to
support it. Be generic here — not only these specific formats but all families of them."* The
ad-hoc grammar lists (D2 + the ADR-CX-002 deltas) named forms by example; nothing stated the
generalization each example stands for, which is exactly how a parser grows case-by-case patches
(the 2-D tool's original sin, docs/13).

**Decision.** [docs/27 §10](27-complex-numbers-tool.md) is the authoritative grammar contract:
**thirteen sentence families (F1–F13)**, each defined generically (any names, any comparator, any
arity, any parameter expression — not a specific question's phrasing), each carrying at least two
corpus witnesses, each assigned to its build slice. Two cross-cutting principles govern all of
them:

1. **P1 — one form, driveOrCheck decides.** A relation sentence has ONE canonical form; whether it
   pins a DOF (given) or verifies (claim) is the engine's decision. No given/claim phrasing split
   may ever enter the grammar.
2. **P2 — exam typography normalizes at the parse seam.** Unicode subscripts (`Z₁`), superscripts
   (`Z₂³`), `°`, `−`, `·`, `×`, NBSP and bidi controls are display forms; `Z₁Z₂³Z₄` ≡
   `z1*z2^3*z4`. Implemented in the C0 prototype the same day (subscript + implicit-multiplication
   normalization with tests).

Completeness is auditable in both directions (docs/27 §10 coverage check): every corpus statement
maps to a family or a *named* deferral (linear systems over ℂ, mixed-modulus equations); every
family has corpus witnesses — no speculative grammar. A new question that fits no family is a
**family-level** addition to §10 first, never a one-off parser rule — the anti-patch tripwire for
this product.

**Consequences.** Per-slice catalogs are authored from the family table; scenario gates cite
families, not phrasings; the `not-handled` seam (→ LLM fallback) is defined as "outside every
family" rather than "outside the tested strings".
