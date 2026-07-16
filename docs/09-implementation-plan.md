# 09 — Implementation Plan

_Last updated: 2026-07-16 (evening)._

> **Status (2026-07-16).** The full v1 pipeline is shipped and live in prod (engine, renderer, store, parser, LLM fallback, save/load, PNG + `.docx` exports; latest deploy tag `prod/2026-07-16`). Work is now **issue-queue-driven** ([ADR-265](06-decisions.md#adr-265); workflow: [22-workflow.md](22-workflow.md)) — day-to-day priorities are the open GitHub issues on `dcodish/geo_builder`, not this plan. Authoritative *current-state* sources: the **ADR log** ([06-decisions.md](06-decisions.md)), **[DEPLOY-LOG.md](DEPLOY-LOG.md)** (what is live), and **[PROJECT-MEMORY.md](PROJECT-MEMORY.md)** (session log).
>
> **Resume pointer.** The **inscribe triple is FIXED and DEPLOYED** (`prod/2026-07-16-3`, operator play-tested): **#167 P1** ([ADR-337](06-decisions.md#adr-337) — a fact's multi-command lowering is transactional, a failed macro leaves zero trace), **#166** ([ADR-338](06-decisions.md#adr-338) — a macro's defining constraints solve as ONE coupled system; square/rectangle inscribed in a right triangle builds, corner square matches the closed-form oracle), and **#176** ([ADR-339](06-decisions.md#adr-339) — a cyclable variant's DEFAULT settles at commit to general position; the degenerate corner square stays reachable by cycling). Filed **#174** (P3 — 1-of-18 marginal NM convergence). Next: the two open P1s — **#175** (show-another applies unvalidated mutations) and **#173** (trapezoid long-base fixed assumption) — then the P2/P3 queue.
>
> **Active milestone:** Phase 6 theorems — 6a is live; 6b (relevance) T1–T5 are built per [18-theorem-relevance-plan.md](18-theorem-relevance-plan.md); remaining operator gates = play-and-judge the ranking, author ≥3 principles, the 6c ship pass. **Parked threads:** the area constraint, the production proxy deploy, the coordinate-validation campaign.
>
> **Full historical status narrative → [09b-status-log.md](09b-status-log.md)** (archived 2026-07-16 — the 81 KB single-line blockquote that used to live here).

## Purpose

The phased plan for building v1: what each phase delivers, what it depends on, which requirements it satisfies, and the gate that closes it. This is the authoritative plan; [Design §10](04-design.md) is the one-line summary and [Testing §Per-step gates](08-testing-strategy.md) holds the detailed acceptance criteria.

## Approach

- **De-risk the core first.** The constructive engine is the make-or-break unknown — it is Phase 1, proven on fixtures before any UI or parser exists.
- **Gate-driven, not time-boxed.** A phase is done when its acceptance gate (Testing doc) is green — tests pass, `tsc`/build clean, results shown. No phase is "ready" otherwise (ADR-008).
- **Vertical proof, then breadth.** Phases 1–3 prove the full pipeline on a thin slice; Phase 5 widens coverage to all of v1.
- No time estimates here — sequencing and dependencies only. (Estimates can be added if scheduling is needed.)

## Validation corpus (real questions drive the build)

Correctness is judged against **real bagrut questions** (text + official image) in [`sample questions/`](sample%20questions/), not only self-authored fixtures. For each, we reproduce the **figure from the givens** — never the algebra (solving is a non-goal; see [Vision](01-vision.md)).

- **Multi-stage.** A question's later parts (ב, ג, ד…) add givens — the figure accumulates them, which is the incremental model itself (FR-EN-7). A corpus entry captures the figure at each relevant stage; the engine must stay stable as stages accumulate.
- **Comparison is visual/structural, human-judged**, up to the figure's free transforms (placement, rotation, scale, reflection) and the chosen alternative branch — not pixel-matching. "Match" = a valid drawing of the givens, consistent with the official image.
- **Before the parser (Phase 4):** questions are **hand-encoded** into commands (we play the parser); the engine → render → eyeball loop validates the engine early. After Phase 4 the same corpus becomes an automatic text→image test.
- Each reproduced figure is frozen as a **golden fixture**.

**Current corpus:** 7 questions — two parallelograms, one rhombus, one right triangle (Q1–Q4), and three circle problems (Q5–Q7: a triangle inscribed with an arc-midpoint; a chord and diameter intersecting, plus a parallel-line∩circle point; an inscribed triangle with a tangent at a point). Together they exercise the full v1 construct vocabulary (table in Phase 5).

## Phases

### Phase 0 — Foundation ✅ (complete)

Scaffold, archive of the old implementation, the `docs/` set, lint config, and the foundation commit.

---

### Phase 1 — Engine core (make-or-break) ✅ complete

- **Status:** done — `src/engine/` + `src/engine/__tests__/phase1.test.ts` (6/6 green); milestone M1 reached. Supported constructs so far: `square`, point-on-segment, circle∩circle intersection, angle-check.
- **Goal:** prove the constructive model end-to-end on fixtures, no parser/UI.
- **Builds:** the dependency-graph data model; `applyCommand` reducer; topological evaluation; point kinds (free / on-segment / intersection); branch selection + cycle; over-constraint detection; structural stability (persistent DOF + branch indices).
- **Depends on:** Phase 0.
- **Requirements:** FR-EN-1, -2, -6, -7, -8, -9; FR-ALT-1, -2, -3.
- **Gate:** [Testing §Step 1](08-testing-strategy.md) — F1 (build + stability), F2 (alternatives), F3 (over-constraint), determinism; typecheck/build clean.
- **Risk:** R1 (engine expressiveness). If this phase doesn't come together cleanly, the whole approach is reconsidered before investing in UI.

---

### Phase 2 — Renderer (SVG) ✅ complete

- **Status:** done — `src/render/` (`transform.ts`, `scene.ts`, `Figure.tsx`) + `src/render/__tests__/phase2.test.tsx` (9/9 green); typecheck/build clean. `App.tsx` wires the engine → renderer as a live F2 demo with a working "show another configuration" toggle (drag-pan / scroll-zoom / reset).
- **Goal:** draw the engine's output as interactive SVG.
- **Builds:** world→screen transform + fit (isotropic, centred, Y-flipped); points, segments, polygons, labels; pan/zoom/reset. **Deferred to when a corpus question needs them** (kept out of v1 slice until exercised): circles, angle arcs, right-angle marks, equal-side ticks, dashed special lines (Phase 5c), smooth animation of moved points (Phase 8 drag).
- **Depends on:** Phase 1 (consumes computed figures).
- **Requirements:** FR-RN-1, -2, -3, -4.
- **Gate:** ✅ transform unit tests; scene-builder "figure → expected nodes"; DOM-free static render of `<Figure>` via `react-dom/server` (F1 nodes/labels, F2 branch differs); typecheck/build clean.
- **Enables the validation loop:** with the renderer, hand-encoded corpus questions can be rendered and compared to their official images — validating the engine *before* the parser exists.
- **Risk:** low — pure consumer of engine output; renderer is swappable.
- **Note:** the renderer is a **pure consumer** — `scene.ts` resolves a `Construction` + `positions` into flat primitives (no React), tested headlessly; `Figure.tsx` is a thin declarative map over that. Components are rendered to static markup in tests (no jsdom dependency).

---

### Phase 3 — Store & app shell ✅ complete

- **Status:** done — `src/store/geoStore.ts` (Zustand + `zundo` temporal) + `src/store/__tests__/phase3.test.ts` (13/13 green); `App.tsx` rebuilt as the store-driven shell (canvas + fact list + undo/redo/clear + alternatives toggle + language toggle, Hebrew default / RTL); typecheck/build clean. Milestone M2 reached. **The fact list is the source of truth and the figure is derived by replay** — each fact can be selected (highlighted on canvas), deselected (kept but off; dependents auto-drop, reversibly), or deleted (ADR-010).
- **Goal:** a usable loop — drive the engine + renderer through real app state.
- **Builds:** Zustand store (+ `zundo`); `execute` pipeline (apply→evaluate→keep-prior-on-error→log); undo/redo; clear; error-step handling (keep prior figure on failure, surface message, cleared by next success); minimal UI shell (canvas, step list, controls); i18n wired (Hebrew default, RTL via `document.dir`).
- **Depends on:** Phases 1–2.
- **Requirements:** FR-HS-1, -2, -3; FR-EN-10; FR-I18N-1, -2; US-5, US-6, US-8.
- **Gate:** ✅ store integration tests (replay pipeline, stability, keep-prior-on-error, select/deselect/delete + dependent auto-drop, undo/redo incl. undo-a-deselect, clear, alternatives); i18n key-parity test; build clean. **Manual e2e:** the text input is disabled (parser is Phase 4); a "quick facts" row drives the same store pipeline so the loop is exercisable in the browser now.
- **Note:** the fact list is the source of truth; the figure (and per-fact status) is **derived by `replay`** in the view — positions are never stored, so undo can't desync coordinates from facts. Selection is excluded from temporal history (`partialize` + `equality` guard).

---

### Phase 4 — Grammar parser ✅ complete

- **Status:** done — `src/parser/parse.ts` (the `utterance → command[]` boundary) + `src/parser/__tests__/phase4.test.ts` (25/25 green); `App.tsx` text input is **live** and example chips run through the parser; typecheck/build clean. Milestone M3 reached.
- **Goal:** real natural-language input, free and offline.
- **Builds:** Hebrew/English grammar parser → commands; input affordances (clickable examples; "couldn't read that" hint on miss); replaced the hardcoded command lists. (LLM fallback is Phase 7.)
- **Depends on:** Phase 3 (commands flow into the store).
- **Requirements:** FR-IN-1, -3, -4, -5; FR-IN-2 (local path); US-1, US-7.
- **Gate:** ✅ parser table tests (He + En for square, point-on-segment, point-by-distances, free point, angle); negative cases return `not-handled` (the fallback boundary); parse→engine end-to-end; coverage measure on the in-grammar sample. Build clean.
- **Scope note:** the grammar covers the **engine's current vocabulary** only. Higher-level phrasings ("triangle ABC", circles, parallel/perpendicular, …) deliberately return `not-handled` and widen **in lock-step with the engine in Phase 5** — the grammar table grows as each construct lands. Genuine miss-rate against real inputs is measured once the corpus is automatable (post-Phase-5).
- **Risk:** R2 (parser coverage vs fallback rate / cost).

---

### Phase 5 — Full v1 coverage (corpus-driven)

Widen the engine and renderer (and, after Phase 4, the parser) to the construct vocabulary the real corpus demands. Derived from the current 4 questions:

| Construct | Appears in | In engine now |
|---|---|:--:|
| General quadrilateral (parallelogram, rhombus; → rectangle / square / trapezoid / kite) | Q1, Q2, Q3 | ✓ (5a) |
| Arbitrary segment between two points (diagonal, cevian) | all | ✓ (5a) |
| Point on a segment at a given ratio | Q1, Q3 | ✓ |
| Angle bisector (constructive line) | Q2, Q4 | ✓ (5b) |
| Line–line intersection point | Q2, Q4 | ✓ (5a points; 5b two `Line`s) |
| Point on an extension / ray (t ∉ [0,1]) | Q2, Q3 | ✓ (5b) |
| Perpendicular + foot / distance to a line | Q3, Q4 | ✓ (5b foot) |
| Right-triangle construction | Q4 | ✓ (5b) |
| Parallel-line construction | Q6 (+ quads) | ✓ (5c parser: line∥AB ∩ circle) |
| Circle (center + radius) | Q5, Q6, Q7 | ✓ (5c) |
| Point on a circle / inscribed vertex | Q5, Q6, Q7 | ✓ (5c) |
| Arc midpoint | Q5 | ✓ (5c) |
| Diameter (chord through the centre) | Q6, Q7 | ✓ (5c) |
| Line∩circle intersection | Q6 | ✓ (5c) |
| Tangent to a circle at a point | Q7 | ✓ (5c) |

Sub-phases — each ends by **reproducing its corpus questions** (gated per [Testing](08-testing-strategy.md)):

- **5a — Quads & segments:** ✅ **complete** — general quadrilateral (4 free vertices), parallelogram (A,B,C free + D derived = A+C−B), arbitrary segment (undirected, idempotent id), line–line intersection (parallel ⇒ unconstructible). Grammar + renderer widened in lock-step (`isGeoPoint` is the single source of truth for point kinds). **Q1 reproduced** from typed utterances in both locales (`src/engine/__tests__/phase5a.test.ts`); structural assertions (parallelogram valid, E on AC between, segments AC/BE/BD present). Full suite 83/83, build clean.
- **5b — Bisectors, extensions, perpendiculars:** ✅ **complete** ([ADR-019](06-decisions.md#adr-019)) — a first-class **`Line`** object (`through` / `bisector` / `perpendicular` / `parallel`, resolved to an `(anchor, dir)` pair in the same topological sweep as points; **not rendered** — scaffolding only), the points it yields (`line-intersection` of two lines, `foot` of a perpendicular, `midpoint`), point-on-extension (on-segment `t > 1`), and `right-triangle` (right angle at the last vertex; A,C free + B derived ⟂). Grammar widened in lock-step (bisector-meet, foot, midpoint, extension, right-triangle; a *single* bisector and the parallel/⟂ *constraints* stay deferred to 5d). **Q2, Q3, Q4 reproduced** from typed He/En utterances (`src/engine/__tests__/phase5b.test.ts`, 11) with structural assertions (bisector-meet equidistant/incenter, foot ⟂ + collinear, ratio on segment, right angle preserved under a leg move). Catalog flipped + a guard test that every supported example parses both locales. Full suite 159/159, build clean.
- **5c — Circles:** ✅ **complete** ([ADR-020](06-decisions.md#adr-020)) — a first-class **drawn `Circle`** (centre + radius, by length or through a point; resolved in the same interleaved sweep as lines/points), circle-dependent points (`on-circle`/inscribed with golden-angle auto-spread, `antipode`/diameter, `arc-midpoint`, `line-circle`) and the **tangent** line spec (⟂ to the radius). The renderer draws circles (outline, fit-aware). An inscribed polygon reuses the existing shape rules on `on-circle` points (composition, ADR-013). Grammar widened in lock-step (circle, inscribed triangle/quad, chord, diameter, arc-midpoint, point-on-circle, tangent∩line, bisector∩segment, parallel∩circle). **Q5, Q6, Q7 reproduced** from typed He/En utterances (`phase5c.corpus.test.ts`, 6) on top of unit tests (`phase5c.test.ts`, 8); circle render test added. Full suite 173/173, build clean.
- **5d — Constraint-driven DOF ([ADR-012](06-decisions.md)):** make constraints *shape* the figure, not just validate it — when a constraint references a point with a free DOF (on-object `t`, or a free point), solve that DOF deterministically (analytic / bounded 1-D); multiple solutions become alternatives; over-constraint still fires when nothing is free. Sequenced alongside the constructs that need it (e.g. angle/length driving a point-on-segment or free point). Today's behaviour (constraints = checks over fully-determined points) holds until this lands.

- **Depends on:** Phases 1–4 (engine + renderer; parser for the automatic path).
- **Requirements:** FR-EN-3, -4, -5 (full).
- **Gate:** every corpus figure reproduced (visual match up to free transforms / branch); solve-correctness on fixtures (incl. constraint-driven DOF: a referenced free parameter is solved to satisfy the constraint, with branches); stability holds.

---

### Phase 6 — Theorems

> **Detailed pre-dev plan: [16-theorems-plan.md](16-theorems-plan.md)** (2026-07-03) — the pedagogy-first design
> (stated-vs-derived principle, live feed + no-reveal ladder, relevancy/salience model, the v1 matcher set,
> testing gates, 6a/6b/6c slices, and the open decisions awaiting the operator).

- **Goal:** surface relevant theorems as the figure is built — **structurally**, from what the student typed (ADR-038).
- **Builds:** **structural** matchers against the catalog ([07](07-theorem-reference.md)), one per theorem keyed on construct + parent-relationship (the [Pedagogy §4 trigger map](10-pedagogy.md#4-construction--theorem-triggers-the-pedagogical-payload) is the spec), **re-run over the whole accumulated figure each step** (a hypothesis can span facts; a later fact can complete it or change its tier); an **accumulating theorem feed** beside the canvas that surfaces the **diff** — newly-satisfied theorems and confidence/relevance changes — each entry attributed to its completing fact, deduped/updated-in-place, **confidence-tier ordered/coloured** (certain/possible/recall), traceable (highlights the satisfying objects), bilingual, citable by official number.
- **Depends on:** Phase 5 (needs the full construct vocabulary in the dependency graph). Does **not** depend on coordinate analysis — that is Phase 9.
- **Requirements:** FR-TH-1, -2, -3, -4, -5, -6; US-4.
- **Gate:** theorem-detection tests vs the catalog — expected **P/C** IDs surface with the correct **tier**; **O**-tagged items, definitions, and area/perimeter formulas **never** surface; each surfaced entry traces to its triggering fact.
- **Follow-on (deferred):** once detection is in place, **link detected shapes/theorems out to the geometry book** on the same site (FR-REF-1) — keyed off this phase's detection + the shared bagrut numbering.
- **6b+ replan — ACCEPTED, decision-complete (2026-07-06): [18-theorem-relevance-plan.md](18-theorem-relevance-plan.md). T1 BUILT (2026-07-06, [ADR-235](06-decisions.md#adr-235)): coverage disposition map (`src/theorems/coverage.ts`, totality-guarded), measured fill order (`reports/theorem-fill-order.md` — top demand: 80, 15–17, 24, 101, 31, 78, 62, 23), the full 22-question B-series membership gate (`b-corpus.test.ts` — today's misses documented as `gaps`/`planned`, never silent), and the §9.5 feed-audit harness (`src/theorems/audit.ts` + `reports/theorem-audit.md`). ⟵ RESUME HERE: T2 coverage fill, in the measured order, against ADR-235's enumerated evidence worklist (tangency-at-existing-point → tangent bundle; `set-concyclic` → 87; line-through-centre → 103; arc-equality → 92; kite⊃rhombus; named-centre circle → 97/98/84/91/99).** After the operator's dissatisfaction review ("theorems that should appear don't appear; ordering seems random"), a relevance-first replan: T1 coverage-disposition map + full B-series corpus wiring + session-replay audit harness → T2 catalog fill by measured priority (66 of 109 ids are absent today, incl. congruence 18–21, midsegments 62–67, medians 15–17, bisector 78–81) → T3 explainable rank bands + subsumption (order becomes a tested contract) → T4 the observed lane (relations/similar-classes into `MatchCtx`) → T5 the principles lane (operator-authored teacher tips + the approved intent hints). All §8 decision boxes resolved by the operator 2026-07-06: full catalog · converses as amber recognition prompts · bands/no-percentages · default stays L1 · intent hints approved · subsumption folds with a "covered by #X" label · principles catalog = a section in 10-pedagogy.md; the §7a L2/L3 cutoff (definitional-entailment vs sampled-observation) is accepted.
- **6a status — DONE (2026-07-04, [ADR-208](06-decisions.md#adr-208)).** The pure spine `src/theorems/` (coordinate-free `detectTheorems` + authored `THEOREM_TABLE` + `MatchCtx`) is built, the no-reveal boundary is structural (the derived-premise ids 68/69/70/71/76 are simply not tabled), and the App carries a live feed (tier dots, ● new-this-step, per-family background fold, click-to-highlight the premise) with a Display-options toggle. Root fixes over the corpus: dual diameter-form recognition (a `diameter` command OR a `set-collinear` through the centre) and dual tangent-construction recognition (a `via:'tangent'` spec OR the Thales aux-circle fingerprint). **Gate met:** `integrity`/`matchers`/`corpus` (Q5–Q7 step-gated `expectSurfaced ⊆ feed` + `mustNotSurface ∩ feed = ∅`) green; full suite + build clean. **6b next:** the B-series booklet corpus + the parallels/median/midsegment families + the similarity/bisector families gated as *converse-recognition* prompts (never premise announcements).

---

### Phase 7 — API fallback + proxy + cost controls

- **Goal:** handle phrasings the grammar can't, safely and cheaply.
- **Builds:** server-side proxy (key custody, gate, per-IP rate limit); Haiku client; boundary escalation wired to the proxy; client bundle never holds the key. Console spend cap + prepaid credits configured.
- **Depends on:** Phase 4 (the boundary it plugs into).
- **Requirements:** FR-IN-2 (fallback path); NFR-SE-1, -2; NFR-CT-1, -2, -3.
- **Gate:** boundary dispatch test (parser-first; fallback mocked); **bundle check — built client contains no key**; calls target the proxy; optional manual live smoke (env-gated).
- **Why after Phase 5 (sequencing rationale, confirmed 2026-06-10):** the LLM can only emit commands the **engine** supports, so its value scales with the vocabulary — with the few constructs available pre-Phase-5 the grammar already covers most natural phrasings, and freeform input has little to map onto. Until then the **grammar is the primary path** (parser-first, ADR-002) and is kept *tight-but-forgiving*: it absorbs cheap **structural** variation (word/keyword order, spacing, synonyms) but is **not** hand-extended toward freeform phrasing — that long tail is precisely the LLM's job, not more regex.

---

### Phase 8 — Export, polish, deploy

- **Goal:** the author use-case and release readiness.
- **Builds:** image export (SVG/PNG) for authors; local persistence (survive reload); **save-to-file / load-from-file** of a figure (serialize the ordered fact list, replay on load — FR-HS-10); drag free/on-object points to explore; accessibility pass; deploy.
- **Depends on:** Phases 2–6.
- **Requirements:** FR-HS-4, -5, -10; FR-RN-5; NFR-AC-1, -2; US-9, US-10, US-12, US-14.
- **Gate:** export produces a valid image of the figure; persistence survives reload; headline flows pass (Playwright); accessibility checks.

---

### Phase 9 — Reveal / figure unmasking (deferred)

- **Goal:** let a student, **on demand**, unmask what the figure geometrically *is* — equal segments, equal/right angles, measured lengths/angles — without ever being clued unbidden (Pedagogy §5.1).
- **Builds:** **geometric (coordinate) analysis** of the computed figure (the layer deferred from theorem detection in [ADR-038](06-decisions.md#adr-038)); a **Reveal** toggle that annotates the canvas with tick/arc/right-angle marks and measures; strictly opt-in and reversible.
- **Depends on:** Phase 5 (computed coordinates); independent of Phase 6 — theorems and Reveal ship separately, neither blocks the other.
- **Requirements:** FR-RV-1, -2, -3.
- **Gate:** nothing is annotated until Reveal is pressed; pressing it marks all equal segments/angles and measures the figure exhibits; toggling off clears them. No geometric fact is ever surfaced automatically.

---

### Phase 10 — Analytic geometry (coordinate mode) (deferred)

- **Goal:** an **opt-in coordinate-entry mode** for *analytic ("analytical") geometry*, where the coordinate system itself is the object of the exercise — the student places points/objects by explicit coordinates (`A = (3, 4)`) and works on a coordinate grid, rather than describing synthetic relations.
- **Builds:** a coordinate grid + axes with read-outs; first-class coordinate data-entry (the engine is already coordinate-native internally, and a single `point A at (x,y)` already parses — this promotes that from an incidental pin to a real mode); analytic primitives as scope allows (slopes, line equations, distance/midpoint read-outs). Kept deliberately apart from the natural-language synthetic-construction flow so everyday construction never requires coordinates.
- **Depends on:** Phase 5 (the coordinate-native engine); independent of Phases 6/9.
- **Requirements:** FR-IN-9.
- **Notes:** This is a separate product decision, not just a phase — it widens scope past the v1 non-goal of "not a general dynamic-geometry system." Synthetic-geometry construction must stay coordinate-free (students describe relations, not numbers); analytic mode is an additive, opt-in surface. Sequenced after the headline milestones (rework → Phase 6 → Phase 8) and the other parked threads.
- **Gate:** TBD — define when the capability is taken on.

## Milestones

| Milestone | Reached at | Meaning |
|---|---|---|
| M1 — Engine proven | end of Phase 1 | The constructive approach works; safe to build on. |
| M2 — Interactive build | end of Phase 3 | A figure can be built and seen, driven by app state. |
| M3 — Natural-language input | end of Phase 4 | Students can type facts in Hebrew/English. |
| M4 — Feature-complete v1 | end of Phase 6 | All v1 shapes/constraints/specials + theorems. |
| M5 — Deployable | end of Phase 8 | Export, persistence, proxy, polish — shippable. |

## Requirement → phase coverage

| Area | Phase(s) |
|---|---|
| Engine / construction (FR-EN-\*) | 1, 5 |
| Alternatives (FR-ALT-\*) | 1 |
| Rendering (FR-RN-\*) | 2 (RN-5 in 8) |
| History / session (FR-HS-1/2/3) | 3 · (HS-4/5 in 8) |
| Input & parsing (FR-IN-\*) | 4 (fallback path in 7) |
| Theorems (FR-TH-\*) | 6 |
| i18n (FR-I18N-\*) | 3 |
| Security / cost (NFR-SE/CT) | 7 |
| Accessibility (NFR-AC) | 8 |
| Stability (NFR-ST) | 1 (held to throughout) |

Every "Must" requirement lands by **M4**; the rest by **M5**.

## Planned, not started

- **Textbook-statement export (FR-HS-9 / [ADR-133](06-decisions.md#adr-133)).** A "decompiler" reverse stage: `figure/relations → verbal givens` in a textbook register, LLM-backed, behind a **premium feature flag** (NFR-FG-1–3) — on for local dev, off (shown as a paid option) in the default production build. **Requirement captured; not built.** Develop and test locally (deterministic relation-serialiser unit-tested; LLM styling mocked, Opus-as-oracle per repo policy); ship with the flag off until there's a billing/licensing story.
- **Ground-truth relations layer / "view relations" (FR-RV-1–6 / [ADR-134](06-decisions.md#adr-134)).** An on-press layer that shows the relations the givens FORCE — equal sides (ticks), equal angles (arcs), definitive values + area ratios, and a similar/congruent-triangles list beside the canvas. Method: **sample the figure across its free DOFs and keep only relations invariant across all samples** (ground truths, not drawing coincidences); scale-invariant facts (angles, ratios, equalities, similarity, area ratios) show always, absolute sizes only when scale-anchored. Read-only consumer of the engine (no engine edits). **Requirement captured + decided; not built.** First slice: equal-sides/equal-angles ticks/arcs over the appears-only universe; then values/area ratios; then the similar-triangles list. Watch: correctness depends on the sampler exercising every DOF (an ADR-052 audit).
