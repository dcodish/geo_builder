# 08 — Testing Strategy

_Last updated: 2026-06-10._

## Purpose

Define how Geo Builder is tested and — critically — **what must pass before any feature or build step is declared "ready."** Nothing is reported as done until its gate (below) is green and the results are shown honestly.

## Principles

- **The engine is pure and deterministic — test it hardest.** The constructive engine has no I/O; a given command sequence must produce the same figure every time. Most tests live here.
- **Tests gate the build.** Each build step ([Design §10](04-design.md)) has an acceptance gate. "Ready" = gate passes, typecheck clean, build succeeds, results reported.
- **Honesty over green.** Failing or skipped tests are reported, never hidden. No `.only`, no silently-skipped specs, no "works on my machine."
- **No live API in automated tests.** The LLM fallback is mocked; cost and flakiness stay out of CI. A separate, opt-in smoke test may hit the API manually.
- **Determinism is engineered.** Any randomness (e.g. initial placement of a free point) is seeded so tests are reproducible.

## Test levels & tooling

| Level | Tool | Scope |
|---|---|---|
| Unit | Vitest | Pure functions: engine, parser, transforms, command mapping, theorem predicates |
| Property-based | Vitest + fast-check _(proposed)_ | Invariants over generated inputs: stability, geometric correctness, branch validity |
| Integration | Vitest | Store orchestration (apply→validate→solve→recompute, undo/redo), input-boundary dispatch |
| Component | Vitest + React Testing Library + jsdom | SVG renderer output from a given figure |
| E2E | Playwright _(proposed, headline flows)_ | Build → render → cycle alternative → export, in a real browser |

## What we test, per layer

### Engine (core — highest rigor)

- **Apply-command:** each command yields the expected objects/constraints; deterministic IDs; **idempotency** — re-issuing a command adds nothing (FR-EN-9).
- **Solve correctness:** for each supported construction, solved positions satisfy the constraints within tolerance ε — e.g. a square has equal sides and 90° angles; a point-on-AD is collinear with A,D and within the segment; a set distance/angle matches (FR-EN-3/4/6, NFR-CO-1/3).
- **Branches / alternatives:** constructions with multiple solutions enumerate the correct count; each branch is geometrically valid; cycling visits all and is reversible (FR-ALT-1/2/3).
- **Over-constraint:** a table of known-contradictory inputs is each rejected, the previous figure kept, a reason produced (FR-EN-8).
- **Stability (the regression test):** across an incremental command sequence, points not forced to move by the new fact move less than ε between steps; cycling an alternative perturbs only the affected branch (NFR-ST-1/2/3).
- **Determinism:** identical command sequences produce identical positions.

### Parser (grammar)

- **Table-driven:** `utterance → expected command[]`, in Hebrew and English, across the full v1 vocabulary (shapes, points-on, distance, angle, right-angle, parallel/perpendicular, equal-segments, special lines).
- **Negative cases:** unparseable input returns "not handled" so the boundary escalates — not a wrong parse.
- **Coverage drives cost:** parser miss-rate = API spend; track which inputs fall through.

### Input boundary & LLM fallback

- **Dispatch contract:** parseable input is handled locally and the fallback is **not** invoked; only on a parser miss is the (mocked) fallback called (ADR-002, NFR-CT/AV).
- **Tool-call → command mapping:** fixture tool-call payloads map to the right commands (pure function).
- **Proxy client:** request shape, gating, error/timeout handling — with a mocked HTTP layer; never a real call.
- **Optional live smoke (manual, env-gated):** a handful of real prompts to sanity-check the prompt + schema; excluded from CI to avoid cost.

### Store / orchestration

- The full step pipeline; **undo/redo** restores prior state (FR-HS-2); **clear** resets (FR-HS-3); a validation failure records an error step and **keeps the previous construction** (FR-EN-8); the history list is correct (FR-HS-1).

### Renderer (SVG)

- **Transform math:** world→screen mapping and the fit transform as pure functions.
- **Element mapping:** a given figure yields the expected SVG nodes — points, segments, polygons, circles, angle arcs (measure shown only when constrained), right-angle marks, equal-side ticks, labels, dashed special lines (FR-RN-1/2).
- **Topology-diff logic:** the "what changed → animate vs rebuild" decision is a tested pure function; the animation itself is not unit-tested.

### Theorems

- For each golden figure, `detect` returns the expected theorem **IDs** (from [07](07-theorem-reference.md)) with correct confidence (definite/possible); **O-tagged theorems never surface**; definitions/formulas never surface (FR-TH-1/2/3).

### i18n

- Every translation key exists in both `he` and `en` (a key-parity test).

## Golden fixtures

A shared set of canonical figures, expressed as command sequences, reused across engine/store/theorem/E2E tests. Initial set:

- **F1 — Square + point on side:** square ABCD; G on AD. _(stability)_
- **F2 — Two-configuration construction:** a point at the intersection of a circle and a line (or an SSA triangle). _(branches / alternatives)_
- **F3 — Contradiction:** square ABCD, then angle GAB = 37° with G on AD — impossible, since AD⊥AB forces 90°. _(over-constraint)_
- **F4 — Isosceles triangle:** AB = AC. _(theorem detection: #22)_
- **F5 — Cyclic quadrilateral:** opposite angles sum to 180°. _(theorem #87)_
- _(extend as v1 coverage grows)_

## Requirement → test traceability

| Requirement | Covered by |
|---|---|
| FR-EN-3/4/6 (shapes, constraints, solve) | Engine solve-correctness tests |
| FR-EN-8 (over-constraint) | F3 + contradiction table |
| FR-EN-9 (idempotency) | Apply-command tests |
| FR-ALT-1/2/3 (alternatives) | Branch tests + F2 |
| FR-TH-1/2/3 (theorems) | Theorem-detection tests vs catalog [07](07-theorem-reference.md) |
| FR-IN-2 (translate input) | Parser table + boundary dispatch |
| FR-HS-1/2/3 (history / undo / clear) | Store integration tests |
| FR-RN-1/2 (render) | Renderer component tests |
| NFR-ST-\* (stability) | Stability regression / property test |
| NFR-CO-\* (correctness) | Engine solve-correctness tests |
| NFR-AV / CT (offline / cost) | Boundary dispatch (parser-first, no live call) |
| NFR-SE-1 (key not in browser) | Bundle check: built client contains no key; calls target the proxy |

## Definition of Ready (the gate)

Before a feature or build step is reported as **ready**, all of the following hold and are shown:

1. All unit / integration / component tests for the touched layers pass.
2. The **stability** regression passes.
3. The acceptance tests for the relevant requirements pass (see traceability).
4. `tsc` typecheck is clean and `npm run build` succeeds.
5. For UI work: the headline scenario is verified (E2E, or a manual check with evidence).
6. No `.only`, no skipped specs masking gaps, no silent fallback hiding a failure.
7. Results are reported honestly — failures shown with output, not omitted.

## Per-step acceptance gates

Each build step gets a concrete gate listing the specific assertions that must pass.

### Step 1 — Engine-core slice (make-or-break)

Proves the constructive model end-to-end on fixtures, with no parser or UI:

- **Build & stability (F1):** `square ABCD` → solved figure is a square (sides equal ±ε, angles 90°±ε); `G on AD` → G collinear with A–D and within the segment; **A, B, C, D move < ε** (stability).
- **Alternatives (F2):** a two-solution construction enumerates exactly 2 valid branches; toggling cycles between them; points outside the affected branch stay put.
- **Over-constraint (F3):** the contradictory step is rejected, the prior figure kept, a reason produced.
- **Determinism:** running F1–F3 twice yields identical coordinates.
- Typecheck + build clean.

Proceed to Step 2 (renderer) only when this gate is green.

> Note: the original slice shorthand "square → G on AD → angle → alternative" mixed two things — the angle-on-a-square case is the *contradiction* fixture (F3), and the *alternative* demo needs a construction with a real solution branch (F2). The gate above splits them accordingly.

## Out of scope (v1)

- Pixel-perfect visual regression (snapshot / screenshot diffing) — revisit if UI churn warrants it.
- Load / stress and cross-browser matrices — single evergreen target for v1.
- The LLM's parsing *quality* on arbitrary phrasings — covered by the optional manual smoke, not CI.

## Open decisions (recommendations)

- **fast-check (property-based):** recommend **yes** — stability and geometric invariants are natural properties; small dependency, high value.
- **Playwright E2E:** recommend a tiny suite for the 2–3 headline flows once the UI exists; manual acceptance is fine until then.
- **Coverage targets:** recommend high coverage on engine + parser (correctness-critical, pure); lighter on UI. Don't chase 100%.
