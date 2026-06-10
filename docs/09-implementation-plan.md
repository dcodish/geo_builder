# 09 — Implementation Plan

_Last updated: 2026-06-10._

## Purpose

The phased plan for building v1: what each phase delivers, what it depends on, which requirements it satisfies, and the gate that closes it. This is the authoritative plan; [Design §10](04-design.md) is the one-line summary and [Testing §Per-step gates](08-testing-strategy.md) holds the detailed acceptance criteria.

## Approach

- **De-risk the core first.** The constructive engine is the make-or-break unknown — it is Phase 1, proven on fixtures before any UI or parser exists.
- **Gate-driven, not time-boxed.** A phase is done when its acceptance gate (Testing doc) is green — tests pass, `tsc`/build clean, results shown. No phase is "ready" otherwise (ADR-008).
- **Vertical proof, then breadth.** Phases 1–3 prove the full pipeline on a thin slice; Phase 5 widens coverage to all of v1.
- No time estimates here — sequencing and dependencies only. (Estimates can be added if scheduling is needed.)

## Phases

### Phase 0 — Foundation ✅ (complete)

Scaffold, archive of the old implementation, the `docs/` set, lint config, and the foundation commit.

---

### Phase 1 — Engine core (make-or-break)

- **Goal:** prove the constructive model end-to-end on fixtures, no parser/UI.
- **Builds:** the dependency-graph data model; `applyCommand` reducer; topological evaluation; point kinds (free / on-segment / intersection); branch selection + cycle; over-constraint detection; structural stability (persistent DOF + branch indices).
- **Depends on:** Phase 0.
- **Requirements:** FR-EN-1, -2, -6, -7, -8, -9; FR-ALT-1, -2, -3.
- **Gate:** [Testing §Step 1](08-testing-strategy.md) — F1 (build + stability), F2 (alternatives), F3 (over-constraint), determinism; typecheck/build clean.
- **Risk:** R1 (engine expressiveness). If this phase doesn't come together cleanly, the whole approach is reconsidered before investing in UI.

---

### Phase 2 — Renderer (SVG)

- **Goal:** draw the engine's output as interactive SVG.
- **Builds:** world→screen transform + fit; points, segments, polygons, circles, angle arcs, right-angle marks, equal-side ticks, labels, dashed special lines; pan/zoom/reset; smooth animation of moved points.
- **Depends on:** Phase 1 (consumes computed figures).
- **Requirements:** FR-RN-1, -2, -3, -4.
- **Gate:** renderer component tests (figure → expected SVG nodes); transform unit tests; visual check of F1/F2.
- **Risk:** low — pure consumer of engine output; renderer is swappable.

---

### Phase 3 — Store & app shell

- **Goal:** a usable loop — drive the engine + renderer through real app state.
- **Builds:** Zustand store (+ `zundo`); `executeCommand` pipeline (apply→validate→solve→recompute→history); undo/redo; clear; error-step handling (keep prior figure on failure); minimal UI shell (input field, canvas, step list); i18n wired (Hebrew default, RTL).
- **Depends on:** Phases 1–2.
- **Requirements:** FR-HS-1, -2, -3; FR-EN-10; FR-I18N-1, -2; US-5, US-6, US-8.
- **Gate:** store integration tests (pipeline, undo/redo, clear, error step); i18n key-parity test; manual end-to-end of a hardcoded scenario through the UI.

---

### Phase 4 — Grammar parser

- **Goal:** real natural-language input, free and offline.
- **Builds:** Hebrew/English grammar parser → commands; input affordances (examples / clarification on miss); replaces the hardcoded command lists. (LLM fallback is Phase 7.)
- **Depends on:** Phase 3 (commands flow into the store).
- **Requirements:** FR-IN-1, -3, -4, -5; FR-IN-2 (local path); US-1, US-7.
- **Gate:** parser table tests (He + En across v1 vocabulary); negative cases return "not handled"; boundary dispatch test; measured miss-rate.
- **Risk:** R2 (parser coverage vs fallback rate / cost).

---

### Phase 5 — Full v1 coverage

- **Goal:** widen the engine + parser + renderer to the whole v1 scope.
- **Builds:** circles; midpoints, foot-of-perpendicular, on-circle points; special lines (height, median, angle bisector, perpendicular bisector, midsegment); equal-segments and remaining constraints; broader figures.
- **Depends on:** Phases 1–4.
- **Requirements:** FR-EN-3, -4, -5 (full); broader FR-IN coverage.
- **Gate:** solve-correctness across the expanded fixture set; stability still holds; parser table extended.

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
