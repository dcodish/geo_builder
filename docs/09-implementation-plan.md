# 09 — Implementation Plan

_Last updated: 2026-06-11._

> **Status:** Phases 0–4 complete (M1–M3). **Phase 5a complete** (quad, parallelogram, segment, line∩line; **Q1 reproduced**). **Phase 5b complete** ([ADR-019](06-decisions.md#adr-019)) — a **`Line`** object (through / bisector / perpendicular / parallel → `(anchor,dir)`), the points it produces (line∩line of two lines, foot of ⟂, midpoint), point-on-extension, and **right-triangle**; **Q2, Q3, Q4 reproduced**. **Phase 5c complete** ([ADR-020](06-decisions.md#adr-020)) — a drawn **`Circle`** object (centre + radius), circle-dependent points (on-circle/inscribed, antipode/diameter, arc-midpoint, line∩circle) + the **tangent** line spec; the renderer now draws circles; **Q5, Q6, Q7 reproduced** from typed He/En utterances. **The full v1 construct vocabulary (Q1–Q7) is now covered.** **Phase 5d** ([ADR-021](06-decisions.md#adr-021)) adds the distance/equal/parallel/perpendicular constraints (generic mechanism, ADR-014); **ADR-018 Stage 1** (pinned-vs-free + seeded `resample`) is built. **186 tests green, build clean** on `rebuild-foundation` (GitHub backup: `dcodish/geo_builder`).
>
> **Session 2026-06-11 banked a large hardening + UX pass** (all from a code review + manual stress-testing, no new corpus coverage): ADR-014 generic constraint solving + DOF-selection fix; parser misparse defense; ADR-015 edit-a-fact-in-place; ADR-016 snap-to-intersection; renderer lines-only + smart label placement; categorized commands coverage-map panel; and a deep **shape-composition** sweep — ADR-013 amendments (similarity-fit so composed shapes don't degenerate; vertex-order independence), ADR-017 (no two nodes may coincide + flip to avoid), empty-side composition + `flip` flag so any shape lands away from existing geometry, and textbook-clean upright templates. Plus **ADR-018** (direction only, not built): *alternatives = samples of the figure's residual freedom* — cycling should re-sample free DOFs so an underdetermined figure visibly wanders and converges as facts accumulate.
>
> **Next (resume here):** corpus fully reproduced (Q1–Q7); **5d constraints** ([ADR-021](06-decisions.md#adr-021)) and **ADR-018 Stage 1** (seeded `resample`) are built. Cross-cutting remainders: ADR-018 Stage 2/3 (constraints auto-prune sampled DOFs; a DOF-remaining cue), a single-bisector / free-point-driver constraint carrier, and drawing a bare/clipped line. Then **Phase 6 (theorems)**. **In progress:** a large differential coordinate-validation campaign (LLM-generated fully-determined diagrams → predicted coords → build → assert node coordinates vs an independent reference).

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

- **Goal:** surface relevant theorems as the figure is built.
- **Builds:** `detect(figure)` predicates against the catalog ([07](07-theorem-reference.md)); theorem panel UI (definite-first, bilingual, citable by official number).
- **Depends on:** Phase 5 (needs the full computed figure).
- **Requirements:** FR-TH-1, -2, -3; US-4.
- **Gate:** theorem-detection tests vs the catalog — expected P/C IDs surface with correct confidence; O-tagged, definitions, and formulas never surface.

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
- **Builds:** image export (SVG/PNG) for authors; local persistence (survive reload); drag free/on-object points to explore; accessibility pass; deploy.
- **Depends on:** Phases 2–6.
- **Requirements:** FR-HS-4, -5; FR-RN-5; NFR-AC-1, -2; US-9, US-10, US-12.
- **Gate:** export produces a valid image of the figure; persistence survives reload; headline flows pass (Playwright); accessibility checks.

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
