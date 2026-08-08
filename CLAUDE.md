# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**This is an orientation file, not a session log.** It tells you what exists, where it lives, and what
you must never do. It deliberately carries **no history and no status** — those live in the ADR logs and
the issue queue (see *Where the current state lives*), which are the copies actually kept current. Do
not append dated progress entries here; a guard test rejects them ([ADR-W-002](docs/06w-decisions-workspace.md)).

## What this is

Geo Builder is a browser app where Israeli high-school students describe a geometry construction in natural language (Hebrew or English) and watch it render on an interactive canvas, **building the figure up one step at a time**, with relevant theorems surfaced as they build. UI is RTL Hebrew by default.

The defining interaction: a student adds information incrementally — "square ABCD" → "point G on AD" → "angle GBA = 37°" (G slides along AD until the angle holds) — and the figure forms and adapts as constraints accumulate. When a construction has more than one valid drawing, one is shown and the student can press a button to cycle to an alternative configuration.

The pipeline is a compiler: **natural language → commands → constructive evaluation → rendered figure**
([docs/11](docs/11-architecture-as-compiler.md)). Every object is defined in terms of earlier objects in a
dependency graph, classified by degrees of freedom — free point (2), point-on-object (1, the parameter that
makes "G on AD" representable), derived point (0). Evaluation is topological; a multi-solution construction
stores a **branch index**, which is what "show another configuration" cycles; stability is structural, so
adding a constraint never makes the existing figure jump.

## Where things live

The layering `engine ← replay ← store` is mechanically enforced by
`src/replay/__tests__/import-direction.test.ts`. Product trees never import each other
(`server/__tests__/isolation.test.ts`).

| Module | What it is | Must not import |
| --- | --- | --- |
| `src/engine/` | The constructive engine: dependency-graph data model, pure geometry, constraint solve/residuals, `applyCommand` reducer, topological `evaluate`, `step` (apply / keep-prior / alternatives), the givens verifier | store, parser, render, React |
| `src/replay/` | Top orchestration — the replay/fold memo, deferral fixpoint, atomic-group poisoning, seed/config searches, the shared detection sample core, validity predicates. Pure over `(facts, seed, overrides)` | zustand, parser, render, React |
| `src/store/` | Session store (Zustand + `zundo`). **The ordered fact list is the source of truth; the figure is derived by `replay`** — positions are never stored, so undo cannot desync | render, parser internals |
| `src/parser/` | Deterministic bilingual `utterance → command[]`. `catalog.ts` is the user-facing reference **and** coverage map (drives the in-app commands panel). Unmatched input returns `not-handled` — the seam where the LLM fallback escalates | engine internals beyond types |
| `src/theorems/` | Read-only theorem-surfacing spine over a **coordinate-free** `MatchCtx`; folds an authored table, never calls `replay`/`evaluate` | anything that mutates |
| `src/render/` | Pure SVG renderer: `transform.ts` + `scene.ts` (no React) + `Figure.tsx`. A **pure consumer** of engine output and swappable | engine internals |
| `src/app/` | The submit pipeline — the whole text→command orchestration behind an injected `SubmitDeps` UI interface. New submit-path behaviour goes here, never inline in the component | — |
| `src/validation/` | Differential coordinate check against an **independent closed-form oracle**. Dev/CI only | **the engine** — the oracle's independence is the whole point |
| `src/ui/`, `src/i18n/`, `src/export/` | Chrome: theme + modal, i18n bootstrap and locales, image/`.docx` export | engine |
| `src3d/` | The 3-D Space Builder — a second product. See [`src3d/CLAUDE.md`](src3d/CLAUDE.md) | **`src/` (anything)** |
| `server/` | The shared LLM proxy + admin dashboard, parameterized by `tool:` — never forked per product | product trees |
| `archive/` | The old template-based implementation. Not compiled, not bundled, excluded from tests. Reference only | — |

## Where the current state lives

**No state in this file.** The live sources, in order of reliability:

- **[`docs/06-decisions.md`](docs/06-decisions.md)** (2-D, `ADR-NNN`) and **[`docs/06b-decisions-3d.md`](docs/06b-decisions-3d.md)** (3-D, `ADR-3D-NNN`) — the decision logs. The tail of each is the most recent work, and these are the records that are actually maintained. **An ADR is required for any significant decision.**
- **`gh issue list`** — the live queue (labels: type + priority + product).
- **[`docs/DEPLOY-LOG.md`](docs/DEPLOY-LOG.md)** — canonical deploy history, one entry per `prod/YYYY-MM-DD` tag.

Older narrative logs (`docs/09-implementation-plan.md`, `docs/09b-status-log.md`, `docs/PROJECT-MEMORY.md`)
carry useful background but **lag behind the ADR logs** — read them for context, never as current status.

## Standing rules

These are non-negotiable and they override default behaviour.

**1 — Root cause over symptom. NEVER PATCH.** Fix the core feature that failed, never the surface symptom,
and never special-case the one input that errored — the size of the correct fix is not a reason to avoid it.
A green test on the reported case is necessary but **not sufficient**: ask whether the same *class* can still
happen elsewhere. A narrow local patch is not an acceptable outcome; if the proper fix looks large, or you are
unsure what the core feature is or how far it should reach, **stop and ask the operator** rather than quietly
shipping a patch. State the root cause in the commit message.
**How to comply is dictated in [docs/17-design-rules.md](docs/17-design-rules.md)** — class-first diagnosis,
the patch tripwires, the chokepoint registry, the mechanisms M1–M4, perf rules, the escalation template.
**Read it before fixing any reported bug; it has operator authority.**

**2 — No autonomous Anthropic API calls.** Never fire a live Anthropic/Haiku call on your own, though the
key in `.env.local` makes it technically possible. **Only the operator authorises a live call.** To test the
LLM fallback, act as the **oracle yourself with your own session model** — reason out the canonical command
lines the LLM should emit, then verify they parse and build through the real `parse → replay` path. Escalate
to a live Haiku call only with explicit operator approval, and only when the operator's live results diverge
from your prediction.

**3 — Triage-first when the operator is testing.** A session in which the operator reports issues does the
FULL triage — file each as an issue, root-cause diagnosis per docs/17, classify and prioritise, write a
concrete fix plan into the issue — **and then STOPS. It does not implement.** (The operator raises several
issues per testing pass; immediate fixes force one-at-a-time reporting and overwrite each other.) Fixes
happen in dedicated fix sessions picked off the queue by priority, or on an explicit "fix this now"; P1
prod-honesty emergencies preempt, announced first.

**4 — Reported bugs become regression scenarios.** A fix is not complete until the operator's *exact
utterance sequence* is permanent coverage. **Fixtures-first:** when the essence is "this figure now builds
green and verifies", the default lock is a saved `.geo.json` fixture in `fixtures/` (zero authoring, full
verifier + parser-drift net). Write a hand-authored scenario only when the lock needs a bespoke assertion
(a specific relation, ordering, refusal, or branch) — those live in `src/__tests__/scenarios-corpus-{1..4}.ts`
(**append to the LAST chunk**), with the harness in `scenarios-harness.ts`, run by the sharded
`scenarios-e2e-*.test.ts` slices, indexed in [`docs/test-scenarios.md`](docs/test-scenarios.md). This is in
addition to, never a replacement for, the per-fix unit test.

**5 — Readiness gate: a fix is not done until the operator can PLAY it.** Do not report anything "ready" until
its acceptance gate passes — tests green, `tsc`/build clean, results reported honestly (no skipped or `.only`
specs hiding gaps). Whenever you report a fix complete, **a dev server must already be running** and the message
must carry **the URL** (`npm run dev` → `http://localhost:5173/` — dev serves at the ROOT, not `/geo-builder/`)
**plus the concrete test cases**: the exact utterances to type — **in Hebrew**, one per line in a code block
for copy-paste (the operator tests in Hebrew; the suite covers the English mirrors) — what to look for, and any
worthwhile before/after (prod runs the previous deploy, so it is a free "before"). Tests green is *our* gate,
not theirs.
Enforced by the `Stop` hook [`scripts/ensure-test-server.mjs`](scripts/ensure-test-server.mjs), which fails
OPEN — a broken hook must never wedge a session.

Strategy and per-step gates: [`docs/08-testing-strategy.md`](docs/08-testing-strategy.md). The engine is pure
and deterministic and is tested hardest; the LLM fallback is always mocked. The **stability** regression —
existing points must not jump when a fact is added — is a first-class test.

## Workflow — the standard operating route

Authoritative: [docs/22-workflow.md](docs/22-workflow.md) ([ADR-265](docs/06-decisions.md#adr-265)).

**Every operator report or request is FILED as a GitHub issue first** (`gh issue create` on
`dcodish/geo_builder`, even when fixed in the same session). Labels: type `bug`/`feature`/`debt` + priority
`P1` (prod honesty/correctness — drop everything) / `P2` (real input fails visibly — schedule by log-triage
demand) / `P3` (polish/debt — batch) + product `2d`/`3d`/`server`/`workspace`; `needs-operator` when blocked
on a decision. A "bug" diagnosed as a **missing capability is relabelled `feature` and treated as one** —
never silently built under a bug's banner.

- **Bugs:** diagnose per docs/17, fix at root, ADR + scenario, commit to `main` with `Fixes #NN`.
- **Features (always a PR):** scope with the operator → branch `feat/<issue#>-slug` → build under the normal
  gates → `gh pr create` (`Closes #NN`) → **operator plays and approves** → merge. An operator
  "commit and deploy now" waives only the play-and-approve gate, **never the PR** — the PR is the permanent
  tracking record.
- **Check which branch the shared tree is on before editing** — a previous session may have left it on a
  feature branch. **Branch in a worktree** when the tree has uncommitted work — never `git checkout` over it.
  Worktrees and all temp/scratch dirs live under `"$TMPDIR"/claude/geo-wt/<branch>`, **never** inside the repo
  tree. `git worktree remove`/`prune` when merged. Never link `node_modules` into a worktree: `git worktree
  remove` follows the junction and destroys the shared tree's copy.
- **`main` is the trunk** — always green, always deployable. **Deploys use only committed `main` state**, per
  [docs/RUNBOOK.md](docs/RUNBOOK.md), each with a `prod/YYYY-MM-DD[-n]` tag and a DEPLOY-LOG entry.
- **Commit ⇒ push.** GitHub is the real backup and the only channel to the other machine.

## Multi-product workspace

[ADR-266](docs/06-decisions.md#adr-266); registry and the adding-product-N+1 recipe: [docs/22-workflow.md §9](docs/22-workflow.md).

One workspace, several sibling products: the **2-D Geo Builder** (`src/`, log 06, label `2d`), the **3-D Space
Builder** (`src3d/`, log 06b, ids `ADR-3D-NNN`, label `3d`), the **shared server** (`server/`, label `server`),
and planned **analytic geometry** (`src-analytic/`, `ADR-AG-NNN` in 06c, label `analytic`) and **complex
numbers** (`src-complex/`, `ADR-CX-NNN` in 06d, label `complex`). Cross-product decisions go in
`docs/06w-decisions-workspace.md` as `ADR-W-nnn`.

Every workflow artifact is per-product — issue label, ADR log, CI lane, deploy path — so **identify which
product a request relates to before filing or fixing; ask when unclear, never guess across products.**
Product trees never import each other; the shared server is the one deliberate sharing point (parameterized
by `tool:`, never forked). Boundaries are declared in `BOUNDARIES.json` and enforced by
`server/__tests__/isolation.test.ts`.

## Commands

- `npm run dev` — Vite dev server (2-D at `/`, 3-D at `/3d.html`)
- `npm run build` — `tsc -b` typecheck then `vite build`; `npm run build:3d` for the 3-D app
- `npm test` — Vitest (watch). Single file: `npx vitest run <path>`. By name: `npx vitest run -t "<name>"`
- **`npm run test:full`** — the FULL suite (~6 min) — **the bar before any commit and any deploy**. Also refreshes the measured tier membership and records any failure the fast tier would have missed ([ADR-394](docs/06-decisions.md#adr-394)).
- **`npm run test:fast`** — every file measured under 60 s (~40 s) — the development loop, **never a gate**. Its exclusion list is derived from `reports/test-tiers.json`, not hand-maintained, so a newly-slow test joins the slow tier automatically.
- `npm run test:tiers` — which slow files have actually caught a regression the fast tier missed. **A corpus-wide property goes in `scenarios-harness.ts`, called from the shard's per-scenario test** — a new FILE re-pays every cold solve (vitest isolates files, so the fold memo cannot cross them).
- `npm run test:2d` / `npm run test:3d` — per-product slice (product tree + shared `server/` tests); one-shot `test:run:2d` / `test:run:3d`. CI mirrors the split: a diff touching one product runs only that lane; shared surface runs all lanes.
- Path alias `@/` → `src/` (keep `tsconfig.json` and `vite.config.ts` in sync). **The alias belongs to the 2-D app only** — `vite.config.3d.ts` deliberately has none, and a stray `@/` inside `src3d/` would typecheck while silently coupling the products, which is why the isolation test rejects it.

## Cross-machine setup

David works from two PCs. **This project is NOT in Dropbox** (moved 2026-07-23 — Dropbox kept corrupting
`node_modules`, `.git`, and source files): it lives at `C:\projects\geo_builder` and **everything syncs through
git.** New machine: `gh repo clone dcodish/geo_builder C:\projects\geo_builder`, `npm install`, copy `.env.local`.
Claude's auto-memory (`.claude/memory/`) is git-**tracked** so it travels too — the deliberate exception to the
workspace "keep projects in Dropbox for memory" convention.

The switch is mechanical (`scripts/session-sync.mjs` + hooks): a `SessionStart` hook pulls `--ff-only` and
reports anything needing a decision; the **`/handoff` skill** commits, pushes, and reports what does not travel;
a `SessionEnd` hook pushes committed work as a net. **Nothing auto-commits.** **What never travels, by design:**
`.env.local`, `logs/`, `node_modules/`, `.claude/settings.local.json`.

## Conventions to carry forward

- **No fixed assumptions — every unstated magnitude is a free DOF, not a fixed value ([ADR-052](docs/06-decisions.md#adr-052)).** A student enters only what the question shows; the tool must assume no size/angle/position/proportion unless it was stated (a number, an angle, or a relation that forces it). A default value is allowed as a *starting* point so the figure can be drawn, but it must change on "show another configuration" or when a later constraint forces it — a fixed default silently asserts a given the question never gave (the same cardinal sin as drawing a figure that violates the givens). Conformance smell: a value counted by `rawMovableDof` but absent from `freeDofs` (so never sampled) is a default masquerading as fixed.
- **Honesty invariants.** No stated magnitude is ever silently dropped — a given parses to a constraint, escalates, or errors, but never vanishes. Everything the student stated is visible on the figure. Error messages name the conflicting *statement*, never internal state.
- **RTL Hebrew is the default.** All user-facing strings go through `useTranslation`/`t()` (`src/i18n/`, `locales/he.json` + `en.json`). Toggling language updates `document.documentElement.dir`. The parser and the LLM fallback handle both Hebrew and English input.
- **Deterministic element IDs** (`seg-AB`, `poly-ABC`) so re-issuing the same command is idempotent.
- **Stack:** React + Vite + Zustand (+ `zundo` for temporal undo/redo) + TypeScript.

## Documentation

Full docs live in [`docs/`](docs/) — start at [`docs/README.md`](docs/README.md). They are the authoritative,
detailed source; this file is the quick orientation. The ones you will actually need:
[17-design-rules](docs/17-design-rules.md) (how to fix a bug without degrading the codebase — operator authority),
[22-workflow](docs/22-workflow.md), [08-testing-strategy](docs/08-testing-strategy.md),
[LADDER](docs/LADDER.md) (the cross-layer solve-ladder contract — every mechanism ADR names the stage it inserts
at), [10-pedagogy](docs/10-pedagogy.md), and the ADR logs.

**Validation corpus:** `docs/sample questions/` holds real bagrut problems (text + image). The work is
corpus-driven — we reproduce each *figure* (never solve it) and compare against the official image.
