# 08 — Testing Strategy

_Scope: the whole workspace — the 2-D, 3-D, complex and analytic builders and the shared `server/`. The last-changed date is git's to state; the hand-kept line here read 2026-06-10 while the file had been edited through August._

## Purpose

Define how Geo Builder is tested and — critically — **what must pass before any feature or build step is declared "ready."** Nothing is reported as done until its gate (below) is green and the results are shown honestly.

## Principles

- **The engine is pure and deterministic — test it hardest.** The constructive engine has no I/O; a given command sequence must produce the same figure every time. Most tests live here.
- **Tests gate the build.** Each build step ([Design §10](04-design.md)) has an acceptance gate. "Ready" = gate passes, typecheck clean, build succeeds, results reported.
- **Honesty over green.** Failing or skipped tests are reported, never hidden. No `.only`, no silently-skipped specs, no "works on my machine."
- **"No error" is not "correct" — verify the OUTPUT against the ORIGINAL givens.** A step applying without error does not mean the drawing honours what was stated (a re-definition can silently no-op; a solver can drift). After evaluate, `checkGivens` ([src/engine/verify.ts](../src/engine/verify.ts)) re-derives the relations the INPUT asserts (from the commands, independent of how each object was built) and checks them against the final coordinates; any unmet given surfaces as a `violations` warning in the app, not a silent green. New constructs must extend this verifier, and a figure is not "done" until its stated givens verify.
- **Test the natural-phrasing surface, not just one phrasing.** A construct is not covered until SEVERAL natural He/En ways to say it parse (synonyms — e.g. פוגש / חותך / נחתך / meets / cuts — word order, with/without "the line"). Tests written only against the author's own phrasing encode the author's blind spots (this is how the `פוגש` miss shipped). Drive the real app (or a headless replay of the user's exact input) before calling a figure done — unit tests prove the code does what it was told, not that the figure matches the problem.
- **No live API in automated tests.** The LLM fallback is mocked; cost and flakiness stay out of CI. A separate, opt-in smoke test may hit the API manually.
- **Determinism is engineered.** Any randomness (e.g. initial placement of a free point) is seeded so tests are reproducible.

## Test levels & tooling

| Level | Tool | Scope |
|---|---|---|
| Unit | Vitest | Pure functions: engine, parser, transforms, command mapping, theorem predicates |
| Property-based | Vitest, hand-rolled seeded generators | Invariants over generated inputs: stability, geometric correctness, branch validity. **`fast-check` was proposed and never adopted** — the campaigns below are seeded generators written directly, which give the same invariant coverage with no dependency |
| Integration | Vitest | Store orchestration (apply→validate→solve→recompute, undo/redo), input-boundary dispatch |
| Component | Vitest + React Testing Library + jsdom | SVG renderer output from a given figure |
| E2E / visual | **Playwright — installed and in use** | `npm run smoke:visual` drives the real app, captures the states a play sheet will ask about, and fails on a blank capture, a refused line or an uncaught page error ([ADR-W-035](06w-decisions-workspace.md#adr-w-035)). A LOCAL gate, not CI. `scripts/visual-parity.mjs` compares captures across builders |

## Two tiers ([ADR-394](06-decisions.md#adr-394), issue #344)

| Command | Scope | Cost | Role |
|---|---|---|---|
| `npm run test:full` | everything | **~10 min** | **The gate.** Run before every commit and every deploy. |
| `npm run test:fast` | every file measured under 60 s | **~60 s**, ~10,160 tests | The development loop. **Never a gate.** |
| `npm run test:tiers` | — | instant | Which slow files have actually caught something |
| **`npm run test:docs`** | the `DOCS.json` doc-gate set | **~2 s**, 674 tests | **The gate for a DOC-ONLY change** ([ADR-W-041](06w-decisions-workspace.md#adr-w-041)). Anything touching `.ts`/`.tsx` pays `test:full`. Five product tests read a document at runtime — two BYTE-MATCH one against a code table — and `ci.yml` ignores `docs/`, so `.github/workflows/docs.yml` runs this set on the paths CI declines (#905) |

**The split is measured, never hand-written.** `test:full` records the files exceeding 60 s into `reports/test-tiers.json`; `test:fast` derives its `--exclude` list from it. A newly-slow test joins the slow tier by itself — the drift that quietly undid [ADR-280](06-decisions.md#adr-280)'s 3-min suite over two weeks. The file is rewritten only when *membership* changes, so a routine green run leaves the tree clean. Commit it: the fast tier must mean the same thing on every machine.

**How to CLAIM green — read the verdict, never an exit code** ([ADR-W-033](06w-decisions-workspace.md#adr-w-033), #750). Every run writes `reports/suite-verdict.json`: `{green, mode, files, tests, failingFiles, sha, dirty}`. A green claim means that file says `green: true`, `mode: "full"`, `sha` equal to `HEAD`, and `dirty: false` — not that a command "exited 0". The exit status is honest and is routinely destroyed at the call site: a POSIX pipeline reports its LAST command's status, so `npm run test:full 2>&1 | tail -40` reads `tail`'s `0` whatever the suite did (the sibling form is a gate chain composed with `;` instead of `&&`). Both have already produced a false green here. `npm run test:tiers` prints the newest verdict and says whether it is still valid for the current tree. The file is gitignored — it is per-machine, per-run evidence, and the other PC's verdict is not yours.

**Why the fast tier is not a gate.** Measured by mutation: blinding `meetsRequirements` or `checkGivens` is caught in the fast tier within 42 s, but blinding `requirementSamples` (the [ADR-256](06-decisions.md#adr-256)/[ADR-295](06-decisions.md#adr-295) detection filter) passes 5007 fast tests and is caught by **exactly one** slow-tier test. The fast tier is a fast *signal*, not a proof.

**Unique catches are tracked.** When a full run fails and every failure is in a slow-only file, the fast tier would have been green — that is appended to `reports/tier-catches.jsonl`. `npm run test:tiers` ranks the slow files by how often they were the only thing that caught a regression, and lists those that never have (candidates to speed up or fold into a shard). The tier split is a coverage/speed trade, so it should be re-argued from evidence rather than assumed.

**Corollary for new tests — put a scenario's oracles in ONE test.** vitest isolates each *file* in its own worker, so the [ADR-280](06-decisions.md#adr-280) fold memo cannot cross files: a second oracle in a second file re-pays the entire cold solve (measured: repeat replay of the same content **0 ms** in-process, a different seed **4.9%**, a cold one **100%**). Adding a new corpus-wide property as its own file is how the suite got to 13 minutes. Add it to `scenarios-harness.ts` and call it from the shard's per-scenario test instead.

## Per-product lanes — the workspace has four builders, not one

This document was written for a single product and describes the 2-D engine throughout. The nets below
are 2-D unless stated; the **structure** around them is workspace-wide:

| | 2-D | 3-D | Complex | Analytic |
| --- | --- | --- | --- | --- |
| Local slice | `npm run test:2d` | `test:3d` | `test:complex` | `test:analytic` |
| CI lane | `test-2d` | `test-3d` | `test-complex` | `test-analytic` |
| Fixture net | `src/__tests__/fixtures/` | `fixtures3/` | `src-complex/__tests__/fixtures/` | `src-analytic/__tests__/fixtures/` |
| Solve-ladder contract | [LADDER](LADDER.md) | — | [LADDER-CX](LADDER-CX.md) | — |

- **The shared `server/` tests run in EVERY lane** — that is why the cross-product guards live there
  (`isolation.test.ts`, `registry-consistency.test.ts`, `docs-hygiene.test.ts`): a violation introduced
  by any product fails that product's own lane.
- **A diff touching one product runs only its lane**; anything on the shared surface runs all four.
  Unknown-by-default is *run everything*, never *skip* ([ci.yml](../.github/workflows/ci.yml)).
- **Sibling safety** (`node scripts/check-sibling-safety.mjs`, [ADR-W-017](06w-decisions-workspace.md)) runs in
  every lane: a change in one tree must not be able to regress a shipped sibling, and it proves that in seconds.
- **The fixtures-first rule is per-product.** Each tree has its own saved-figure net with the same contract:
  drop a saved file in the folder and it becomes permanent coverage, replayed through the real load path
  with zero per-figure authoring.

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
- **F3 — Contradiction:** square ABCD, then angle DAB = 37° — every referenced point is determined and the corner is 90°, so the check rejects. _(over-constraint)_ The G-referencing variant (angle GAB = 37° with G on AD) now exercises the *solver*: the engine drives G's `t`, finds ∠GAB is 90° for every position, and rejects with "cannot place" — covered by the Phase-5d gate.
- **F4 — Isosceles triangle:** AB = AC. _(theorem detection: #22)_
- **F5 — Cyclic quadrilateral:** opposite angles sum to 180°. _(theorem #87)_
- _(extend as v1 coverage grows)_

**Saved-figure fixtures net ([ADR-232](06-decisions.md#adr-232), 2026-07-06).** The FR-HS-10 save/load file format doubles as a fixtures format: every `src/__tests__/fixtures/*.geo.json` is replayed by `src/__tests__/fixtures.test.ts` through the REAL load path (raw text → `deserializeFigure` → `replay`) and asserted, with zero per-figure authoring: (1) **replays green** — builds, nothing pending, givens verifier clean (strong per ADR-053: green = every stated relation re-derived and checked), every fact ok; (2) **parser drift** — each stored utterance, re-parsed with its prefix figure context, must lower to the SAME commands (out-of-grammar = LLM-escalated, skipped). **Promotion discipline:** only add a file after eyeballing the figure against the textbook image — the net locks in current behavior, including any undetected wrongness. This net complements, never replaces, `scenarios.test.ts` (fixtures: "everything green stays green"; scenarios: figure-specific assertions).

**FIXTURES-FIRST rule (S4.1 of [docs/24](24-foundation-hardening-plan.md), 2026-07-24).** When locking a fixed operator-reported bug whose essence is *"this figure now builds green and verifies"*, the DEFAULT lock is a **fixture** (save the figure in the app or via the generator, drop the `.geo.json` in the folder — zero authoring, full verifier + drift assertions), not a hand-written scenario. Write a **scenario** only when the lock needs a bespoke `check` (a specific coordinate relation, an ordering, a refusal message, a branch count). Rationale (docs/23 §5): the scenario corpus's growth model has a visible authoring/merge ceiling while the fixtures net is the highest-leverage, lowest-cost net in the repo and was underused (5 files at review time). The CLAUDE.md scenario rule still stands for its purpose — the operator's exact *sequence* becomes permanent coverage — a fixture saved from that sequence satisfies it for build-green classes.

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
8. **The requirements and design docs are updated in the same commit** when the change alters what the
   product promises or how it is built ([ADR-W-041](06w-decisions-workspace.md#adr-w-041), standing rule 6);
   the ADR carries its `**Requirements:**` / `**Design:**` lines. A doc-only change is gated by
   `npm run test:docs`, everything else by `test:full`.

**Claim green by READING `reports/suite-verdict.json`** — `green: true`, `mode: "full"`, `sha` equal to
HEAD, `dirty: false` — never by an exit code ([ADR-W-033](06w-decisions-workspace.md#adr-w-033)).

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

- **Pixel-perfect** visual regression (per-pixel snapshot diffing) — still out. What exists instead is
  `npm run smoke:visual` (captures real states and fails on blank/refused/error) and
  [scripts/visual-parity.mjs](../scripts/visual-parity.mjs) (compares a surface ACROSS builders, the
  docs/28 one-look goal). Neither diffs pixels against a golden image; both are local, not CI.
- Load / stress and cross-browser matrices — single evergreen target for v1.
- The LLM's parsing *quality* on arbitrary phrasings — covered by the optional manual smoke, not CI.

## Decisions — RESOLVED (2026-09-05, [ADR-W-041](06w-decisions-workspace.md#adr-w-041))

These three sat under "Open decisions (recommendations)" from 2026-06-10 until 2026-09-05. Two had in
fact been settled by what was built; the third is settled here with data.

- **`fast-check` (property-based): NO, and not "not yet".** The recommendation was *yes*, but what got
  built instead were **hand-rolled seeded generators** — the invariants campaign (343 diagrams,
  `CAMPAIGN_MULT` widens it) and the coordinate campaign (172 figures, `COORD_MULT`). They give the same
  invariant coverage with no dependency, and they generate *geometry* rather than arbitrary values, which
  a generic shrinker is poor at. The tooling table said "proposed" for three months while the capability
  already existed under another name.

- **Playwright: YES — installed and in use, as a LOCAL gate.** `npm run smoke:visual` drives the real
  app, captures the states a play sheet will ask about, and fails on a blank capture, a refused line or an
  uncaught page error ([ADR-W-035](06w-decisions-workspace.md#adr-w-035)). Deliberately **not** CI
  (ADR-W-005) — it needs a running dev server, like `check:siblings`.

- **Coverage: MEASURED, never gated.** `@vitest/coverage-v8` is installed and `npm run test:coverage`
  reproduces the run. First measurement, 2026-09-05 over `src/` (the 2-D tree):

  | | statements | branches | functions |
  | --- | --- | --- | --- |
  | **`src/` total** | **87.3%** | **90.9%** | **94.7%** |

  Per area, which is the part worth reading:

  | area | lines | | area | lines |
  | --- | --- | --- | --- | --- |
  | `parser` | **99.1%** | | `store` | 86.6% |
  | `replay` | **98.3%** | | `validation` | 76.5% |
  | `engine` | **97.2%** | | `app` | 67.9% |
  | `theorems` | **97.1%** | | `render` | 66.1% |
  | `i18n` | 100% | | `App.tsx` | **0%** |

  **The numbers confirm the strategy rather than challenging it.** The 2026-06-10 recommendation was
  "high on engine + parser, lighter on UI, don't chase 100%" — and that is exactly the shape: the pure,
  correctness-critical core sits at 97–99% while the React component is untested. `App.tsx` alone (1,394
  statements at 0%) accounts for most of the gap between 87% and the core's 97%.

  **It stays a diagnostic, not a gate.** A line-coverage threshold would be a weaker claim dressed as a
  stronger one: this repo's correctness evidence is the four independent nets below (invariants campaign,
  the coordinate oracle at 5.6e-15 worst residual, the givens verifier, and the scenario + fixture nets),
  and `test:full` already fails on any of them. Coverage cannot tell you an assertion is *right*; the
  mutation result in the tier section — blinding `requirementSamples` passes 5,007 fast tests — is the
  standing proof that executed is not the same as checked.

  **One item worth a look, not a target:** [`src/app/submitPipeline.ts`](../src/app/submitPipeline.ts) at
  **56.3%**. CLAUDE.md routes all new submit-path behaviour there specifically to keep it out of the
  component, so it is engine-layer by intent ([BOUNDARIES.json](../BOUNDARIES.json) classifies it
  `engine`) while carrying component-level coverage.

## Validation campaign (property-based, 2026-06-12)

`src/engine/__tests__/campaign.test.ts` is a deterministic seeded generator that emits **343 diverse diagrams** across the full construct vocabulary (every shape, point, line, circle, and constraint family) and validates each by its **geometric invariants** — a square has four equal sides and right angles; an on-segment point is collinear and between; |AB| = 6 holds; an inscribed point is at the radius; a tangent is ⟂ the radius — rather than exact coordinates (a valid drawing can sit anywhere). Each diagram is built command-by-command, required to evaluate to a finite figure, and shape diagrams are re-checked under the ADR-018 sampler (a square stays a square after its free vertices are perturbed). `_invariants.ts` is the predicate library. The committed default is 343 cases; `CAMPAIGN_MULT=N` widens the same generator for ad-hoc bug-hunting — sweeps of **100k+ randomised diagrams** run clean. The only failures the sweep ever surfaced were *degenerate generated inputs* (coincident points, a straight angle) that the engine **correctly rejects** — i.e. zero engine bugs; those generators were tightened so the sweep is green at any multiplier.

## Coordinate-validation campaign (differential, 2026-06-24 — [ADR-109](06-decisions.md#adr-109))

`src/validation/` is the **differential** sibling of the invariants campaign: where that checks *relations*, this checks **exact coordinates against an independent closed-form oracle**. `coordOracle.ts` recomputes each construct's coordinates by hand and **imports nothing from the engine** (that independence is what makes the comparison meaningful — otherwise it would check the engine against itself). `coordCampaign.ts` is a seeded generator whose recipes **pin their base points** with `free-point`, so the figure has no free similarity gauge — the engine's coordinate frame equals the oracle's and derived points are compared **directly, with no Procrustes alignment**. A branchy construct (circle∩circle, by-distances, square chirality) has several valid configurations; `compareToConfigs` passes the figure iff the engine matches one WHOLE configuration within tolerance (1e-4). `__tests__/coordValidation.test.ts` proves the harness passes a correct figure, **catches a perturbed/missing coordinate** (the load-bearing test), and gates the committed 172-figure corpus at zero mismatches; `COORD_MULT=N` widens the sweep.

- **Scope.** Only constructs with an independent closed form AND no unstated default DOF: midpoint, foot, line∩line, on-segment(t), by-distances, circle∩circle, distance/equal-driven on-segment (the numeric solver), square, parallelogram. Shapes with default DOFs (rectangle/rhombus/trapezoid height/angle) stay with the *invariants* campaign; on-circle/arc/diameter points (engine angle convention) are a later slice.
- **Regime.** Applies only to figures **determined up to similarity (0 shape DOF)** — the only case with a unique ground truth. A debug-log audit found ~11% of real successful figures are 0-shape-DOF; the rest (under-determined) are covered by the invariants + sampler-stability + givens-verifier nets. So this is a sharp tool for the determined slice, **dev/CI-only** (it cannot ship — production student figures have no unique coordinate to diff against).
- **Finding (initial run).** The engine matches the oracle to **~machine epsilon — worst residual 5.6e-15 over a 13,760-figure (`COORD_MULT=80`) sweep**, i.e. coordinate output incl. the numeric solver paths is exact to double precision on every covered construct. Zero engine bugs surfaced; the harness is a pure read-only consumer of `build`/`evaluate` (no engine changes).

## Comparative / experimental testing (method A vs B vs C)

When we evaluate an **alternative method or algorithm** for a pluggable element of the engine (a root finder, a multivariate solver, a global sampler, a decomposition), the comparison is governed by a dedicated **experiment protocol** so results are reproducible and paper-quality: [paper/experiments/PROTOCOL.md](paper/experiments/PROTOCOL.md) (ledger + results schema alongside it). It sits **on top of** the three correctness nets above (invariants campaign, coordinate-validation campaign, givens verifier), **reusing them as ground truth**, and adds the cross-method dimension + cost/robustness metrics + a provenance ledger. The *architecture* of the swap-and-measure harness is the solver-experiment ADR ([draft](paper/adr-draft-solver-experiment-harness.md), to be numbered in [06](06-decisions.md)); this testing layer is **dev/CI only — nothing in it ships**. Key rule: **correctness is a hard GATE (zero regressions vs. a frozen `solver-baseline` tag), not a metric** — a faster-but-wrong method is disqualified before its speed is even considered.
