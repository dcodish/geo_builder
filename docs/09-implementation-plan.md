# 09 — Implementation Plan

_Last updated: 2026-06-10._

> **Status:** Phases 0–3 complete (engine M1; SVG renderer; store + app shell — milestone M2). **Next:** Phase 4 (grammar parser) → Phase 5a → reproduce corpus Q1. Work is on branch `rebuild-foundation`.

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

### Phase 4 — Grammar parser

- **Goal:** real natural-language input, free and offline.
- **Builds:** Hebrew/English grammar parser → commands; input affordances (examples / clarification on miss); replaces the hardcoded command lists. (LLM fallback is Phase 7.)
- **Depends on:** Phase 3 (commands flow into the store).
- **Requirements:** FR-IN-1, -3, -4, -5; FR-IN-2 (local path); US-1, US-7.
- **Gate:** parser table tests (He + En across v1 vocabulary); negative cases return "not handled"; boundary dispatch test; measured miss-rate.
- **Risk:** R2 (parser coverage vs fallback rate / cost).

---

### Phase 5 — Full v1 coverage (corpus-driven)

Widen the engine and renderer (and, after Phase 4, the parser) to the construct vocabulary the real corpus demands. Derived from the current 4 questions:

| Construct | Appears in | In engine now |
|---|---|:--:|
| General quadrilateral (parallelogram, rhombus; → rectangle / square / trapezoid / kite) | Q1, Q2, Q3 | ✗ (square only) |
| Arbitrary segment between two points (diagonal, cevian) | all | ✗ (trivial) |
| Point on a segment at a given ratio | Q1, Q3 | ✓ |
| Angle bisector (constructive line) | Q2, Q4 | ✗ |
| Line–line intersection point | Q2, Q4 | ✗ (circle∩circle only) |
| Point on an extension / ray (t ∉ [0,1]) | Q2, Q3 | ✗ |
| Perpendicular + foot / distance to a line | Q3, Q4 | ✗ |
| Right-triangle construction | Q4 | ✗ |
| Parallel-line construction | Q6 (+ quads) | ✗ |
| Circle (center + radius) | Q5, Q6, Q7 | ✗ |
| Point on a circle / inscribed vertex | Q5, Q6, Q7 | ✗ |
| Arc midpoint | Q5 | ✗ |
| Diameter (chord through the centre) | Q6, Q7 | ✗ |
| Line∩circle intersection | Q6 | ✗ (circle∩circle only) |
| Tangent to a circle at a point | Q7 | ✗ |

Sub-phases — each ends by **reproducing its corpus questions** (gated per [Testing](08-testing-strategy.md)):

- **5a — Quads & segments:** general quadrilateral + arbitrary segment + line–line intersection → reproduce **Q1**.
- **5b — Bisectors, extensions, perpendiculars:** angle bisector, point-on-ray/extension, perpendicular + foot, right-triangle construction → reproduce **Q2, Q3, Q4**.
- **5c — Circles:** circle (center + radius), point-on-circle / inscribed vertices, chord & diameter, arc midpoint, line∩circle, tangent-at-a-point → reproduce **Q5, Q6, Q7**.

- **Depends on:** Phases 1–4 (engine + renderer; parser for the automatic path).
- **Requirements:** FR-EN-3, -4, -5 (full).
- **Gate:** every corpus figure reproduced (visual match up to free transforms / branch); solve-correctness on fixtures; stability holds.

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
