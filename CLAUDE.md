# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**This is an orientation file, not a session log.** It tells you what exists, where it lives, and what
you must never do. It deliberately carries **no history and no status** — those live in the ADR logs and
the issue queue (see *Where the current state lives*), which are the copies actually kept current. Do
not append dated progress entries here; a guard test rejects them ([ADR-W-002](docs/06w-decisions-workspace.md)).

## What this is

Geo Builder is a family of four browser builders (2-D geometry, 3-D space, analytic geometry, complex numbers) where Israeli high-school students describe a construction in natural language (Hebrew or English) and watch it render on an interactive canvas, **building the figure up one step at a time**. UI is RTL Hebrew by default. (2-D has a theorem-surfacing engine; its surface is switched off by the operator, #740.)

The defining interaction: a student adds information incrementally — "square ABCD" → "point G on AD" → "angle GBA = 37°" (G slides along AD until the angle holds) — and the figure forms and adapts as constraints accumulate. When a construction has more than one valid drawing, one is shown and the student can press a button to cycle to an alternative configuration.

The pipeline is a compiler: **natural language → commands → constructive evaluation → rendered figure**
([docs/04 §1](docs/04-design.md#1-guiding-principles), "The compiler lens"). Every object is defined in terms of earlier objects in a
dependency graph, classified by degrees of freedom — free point (2), point-on-object (1, the parameter that
makes "G on AD" representable), derived point (0). Evaluation is topological. Every unstated magnitude or choice is a free degree of freedom (ADR-052);
«הציגו תצורה אחרת» re-samples them all, branches and free magnitudes alike (02 FR-ALT-2). Stability is
structural: adding a constraint never makes the existing figure jump.

## Where things live

The layering `engine ← replay ← store` is mechanically enforced by
`src/replay/__tests__/import-direction.test.ts`. Product trees never import each other
(`server/__tests__/isolation.test.ts`). **Every import edge is declared once, in
[`BOUNDARIES.json`](BOUNDARIES.json)**; read it there, never from prose.

| Module | What it is |
| --- | --- |
| `src/engine/` | The constructive engine: dependency-graph data model, pure geometry, constraint solve/residuals, `applyCommand` reducer, topological `evaluate`, `step` (apply / keep-prior / alternatives), the givens verifier |
| `src/replay/` | Top orchestration — the replay/fold memo, deferral fixpoint, atomic-group poisoning, seed/config searches, the shared detection sample core, validity predicates. Pure over `(facts, seed, overrides)` |
| `src/store/` | Session store (Zustand + `zundo`). **The source of truth is `(facts, seed)` — the ordered fact list plus the configuration index; the figure is derived by `replay`** — positions are never stored, so undo cannot desync. A structural edit resets the seed ([ADR-484](docs/06-decisions.md#adr-484)) |
| `src/parser/` | Deterministic bilingual `utterance → command[]`. `catalog.ts` is the user-facing reference **and** coverage map (drives the in-app commands panel). Unmatched input returns `not-handled` — the seam where the LLM fallback escalates |
| `src/theorems/` | Read-only theorem-surfacing spine over a **coordinate-free** `MatchCtx`; folds an authored table, never calls `replay`/`evaluate` |
| `src/render/` | Pure SVG renderer: `transform.ts` + `scene.ts` (no React) + `Figure.tsx`. A **pure consumer** of engine output and swappable |
| `src/app/` | The submit pipeline — the whole text→command orchestration behind an injected `SubmitDeps` UI interface. New submit-path behaviour goes here, never inline in the component |
| `src/validation/` | Differential coordinate check against an **independent closed-form oracle**. Dev/CI only. `coordOracle.ts` imports no engine code: the oracle's independence is the whole point |
| `src/ui/`, `src/i18n/`, `src/export/` | Chrome: theme + modal, i18n bootstrap and locales, image/`.docx` export |
| `src3d/` | The 3-D Space Builder: see [`src3d/CLAUDE.md`](src3d/CLAUDE.md) |
| `src-complex/` | The complex-numbers Builder: see [`src-complex/CLAUDE.md`](src-complex/CLAUDE.md) |
| `src-analytic/` | The analytic-geometry Builder: see [`src-analytic/CLAUDE.md`](src-analytic/CLAUDE.md) |
| `shell/` | The shared chrome tree ([ADR-W-016](docs/06w-decisions-workspace.md#adr-w-016), [ADR-W-019](docs/06w-decisions-workspace.md#adr-w-019)): design tokens, bidi core, i18n bootstrap, save envelope + naming + load audit, symbol-palette core, app frame (header, About/privacy modal, banners, product switcher). Parameterized by the caller — no strings, no product knowledge, no `if (product === …)`. Consumed by all four products (docs/28 §5a) |
| `server/` | The shared LLM proxy + admin dashboard, parameterized by `tool:` — never forked per product |

## Where the current state lives

**No state in this file.** The live sources, in order of reliability:

- **The five decision logs**: [06](docs/06-decisions.md) (2-D, `ADR-NNN`), [06b](docs/06b-decisions-3d.md) (3-D, `ADR-3D-NNN`), [06c](docs/06c-decisions-analytic.md) (analytic, `ADR-AG-NNN`), [06d](docs/06d-decisions-complex.md) (complex, `ADR-CX-NNN`), [06w](docs/06w-decisions-workspace.md) (workspace, `ADR-W-NNN`). They record what was decided and why. The newest entries sit near the end of each log, but not in strict numeric order. A replaced entry carries a **⚠ Superseded** stamp naming its successor; a behaviour the operator has ruled to change before any code changed carries **⚠ Ruled to change**. **An ADR is required for any significant decision.**
- **What a product promises today** is its requirements doc (rule 6), edited in the same commit as the code. Where an old ADR and the requirements doc differ, the doc and the newer ADR win.
- **`gh issue list`** — the live queue (labels: type + priority + product). "What's open / what's next" is answered with the **open-issues report** ([docs/22 §2c](docs/22-workflow.md)) — grouped, with complexity and a recommended order — never a raw dump.
- **`gh pr list`** — work that is finished and pushed but **not merged**: an open PR is a feature awaiting the operator's play-and-approve, and nothing else records it. Pushed is not the finish line ([ADR-W-007](docs/06w-decisions-workspace.md)).
- **[`docs/DEPLOY-LOG.md`](docs/DEPLOY-LOG.md)** — canonical deploy history, one entry per `prod/YYYY-MM-DD` tag. It records what WAS deployed, never what is awaiting deploy — for that, compare the newest `prod/*` tag against `main` (the session-start hook reports both).

`docs/archive/` holds finished plans and reviews: history, never status or rules.

## Standing rules

These are non-negotiable and they override default behaviour.

**1 — Root cause over symptom. NEVER PATCH.** Fix the core feature that failed, never the surface symptom,
and never special-case the one input that errored — the size of the correct fix is not a reason to avoid it.
A green test on the reported case is necessary but **not sufficient**: ask whether the same *class* can still
happen elsewhere: the same wrong outcome in another spelling, rule, seed or builder. A behaviour the report
did not describe is never "the class"; it is a proposal for the operator (rule 7). A narrow local patch is not an acceptable outcome; if the proper fix looks large, or you are
unsure what the core feature is or how far it should reach, **stop and ask the operator** rather than quietly
shipping a patch. State the root cause in the commit message.
**How to comply is dictated in [docs/17-design-rules.md](docs/17-design-rules.md)** — class-first diagnosis,
the patch tripwires, the chokepoint registry, the mechanisms M1–M4, perf rules, the escalation template.
**Read it before fixing any reported bug; it has operator authority.**

**2 — No autonomous Anthropic API calls.** The key in `.env.local` makes a live call possible; **only the
operator authorises one.** To test the LLM fallback, be the **oracle yourself**: reason out the canonical lines
the LLM should emit and verify they parse and build through the real `parse → replay` path. A live call needs
his explicit approval, and only when his live results diverge from your prediction.

**3 — Triage-first when the operator is testing.** A session in which the operator reports issues does the
FULL triage — file each as an issue, root-cause diagnosis per docs/17, classify and prioritise, write a
concrete fix plan into the issue — **and then STOPS. It does not implement.** (The operator raises several
issues per testing pass; immediate fixes force one-at-a-time reporting and overwrite each other.) Fixes
happen in dedicated fix sessions picked off the queue by priority, or on an explicit "fix this now"; P1
prod-honesty emergencies preempt, announced first.

**4 — Reported bugs become regression scenarios.** A fix is not complete until the operator's *exact
utterance sequence* is permanent coverage. **Fixtures-first:** when the essence is "this figure now builds
green and verifies", the default lock is a saved fixture in the product's fixtures folder (2-D: `src/__tests__/fixtures/`;
the others: the "Fixtures" row of [docs/22 §9](docs/22-workflow.md)) (zero authoring, full verifier +
parser-drift net). Write a hand-authored scenario only when the lock needs a bespoke assertion
(a specific relation, ordering, refusal, or branch) — those live in `src/__tests__/scenarios-corpus-{1..4}.ts`
(**append to the LAST chunk**), with the harness in `scenarios-harness.ts`, run by the sharded
`scenarios-e2e-*.test.ts` slices, indexed in [`docs/test-scenarios.md`](docs/test-scenarios.md). This is in
addition to, never a replacement for, the per-fix unit test.

**5 — Readiness gate: a fix is not done until the operator can PLAY it.** Do not report anything "ready" until
its acceptance gate passes — tests green, `tsc`/build clean, results reported honestly (no skipped or `.only`
specs hiding gaps). Tests green is *our* gate, not theirs.

**Every "ready" report carries a NUMBERED TEST-CASE LIST — this list, followed literally.** Not a
summary, not prose. The operator works down it without opening any other document.

1. **`## Heads-up` first** — plain language, self-contained (no ADR/issue id as the only pointer; say
   what changed for a **student**). One line each, nothing else: a **behaviour change**, above all
   anything WITHDRAWN · anything shipped that the operator **did not ask for** (there should be none: rule 7;
   such a case is always 🎮) · **approved but not delivered**, and what it needs · anything **needing a
   ruling**, as the question · the **riskiest area** + the test number covering it. Nothing to say?
   "Nothing surprising here" — never pad.
2. **Cases `T1…Tn`, numbered continuously** across every product, route and PR, so "T7 is wrong"
   identifies itself. **One case = one check** — three checks are three numbers.
3. **Every case, in this order:** `### T<n> · <plain title>` (what a *student* can do, not the
   mechanism) · **Server:** the URL **with its path** (`/` — the ROOT, not `/geo-builder/`;
   `/3d.html`; `/complex.html`) on *every* case, never "the server above" · the utterances **in
   Hebrew**, one per line in a code block · **Look for:** a pass, checkable at a glance · **Before:**
   what prod does today (a free "before"), or "unchanged" for a regression guard.
4. **A REFUSAL case gets its own number** — the easiest thing to leave untested.
5. **Every server named is RUNNING and `curl`-checked**; one port per unmerged PR, from its own
   worktree. A list pointing at a dead port is not a finished report.
6. **Every case is PRE-PLAYED before the sheet ships** ([ADR-W-092](docs/06w-decisions-workspace.md#adr-w-092)):
   the session drives it in a real browser (`npm run playsheet -- --sheet <spec>`), reads the
   screenshots, and a mechanically red case goes back to the fix — the operator never receives one.
   Cases are classed **🎮 play** (needs the operator's hands/judgment) · **👁 look** (judge from the
   embedded screenshot, no typing) · **✅ verified** (record only); the published `report.html`
   carries the evidence, and the chat report keeps the 🎮 utterances copy-pasteable per rule 3.

How: the `/playsheet` skill. Enforced by the `Stop` hook `scripts/ensure-test-server.mjs`, which fails
OPEN — a broken hook must never wedge a session.

**6 — Requirements and design are DELIVERABLES.** A change to what the product PROMISES updates its
requirements doc; a change to HOW it is built updates its design doc — in the **same commit as the code**, like the ADR and the scenario. Every ADR carries `**Requirements:**` and `**Design:**` lines; `none
(internal)` is a first-class answer. Registry [`DOCS.json`](DOCS.json), enforced by
`docs-hygiene.test.ts` ([ADR-W-041](docs/06w-decisions-workspace.md#adr-w-041)).

Strategy and per-step gates: [`docs/08-testing-strategy.md`](docs/08-testing-strategy.md). The engine is pure
and deterministic and is tested hardest; the LLM fallback is always mocked. The **stability** regression —
existing points must not jump when a fact is added — is a first-class test.

**7 — The operator decides what a student sees; a session decides how** ([ADR-W-117](docs/06w-decisions-workspace.md#adr-w-117)).
A session decides the mechanism alone (files, tests, refactors, performance), and may restore a behaviour
that a dated operator ruling, or 2-D measured at HEAD, already defines. Anything else a student can see
(drawn, hidden, labelled, refused, accepted, read, worded or computed differently) is a **product decision**
and needs his dated ruling.
- Every fix plan ends with `## What the student will see`, one line per change, tagged `[asked]` (quote him),
  `[ruled]` (link), `[2-D]` (measured at a named commit) or `[proposed]`. A `[proposed]` line makes the issue
  `needs-operator`; it is never armed.
- **Measured beats written.** If the pickup measurement contradicts the plan's account of the request, of 2-D
  or of another builder, stop and escalate (docs/17 §8). Never ship "because the plan lists it".
- **No defaults.** An open question waits for him, in P1 sessions too. The one exception: a P1 session may
  ship an honest refusal that reuses an existing message, flagged in the Heads-up.
- **Found work is proposed, not queued.** File it `needs-operator` with a proposed priority; never arm it or
  make it P1 yourself, except a figure drawn green for givens that cannot hold (P1, announced at once).
- **Cross-tool warnings.** When he asks a non-2-D tool for behaviour that differs from 2-D, say so before
  building. When a 2-D change would change what the other tools should do, ask whether it applies to them.

## Workflow — the standard operating route

Authoritative: [docs/22-workflow.md](docs/22-workflow.md) ([ADR-265](docs/06-decisions.md#adr-265)).

**Every operator report or request is FILED as a GitHub issue first** (`gh issue create` on
`dcodish/geo_builder`, even when fixed in the same session). Labels: type `bug`/`feature`/`debt` + priority
`P1` (prod honesty/correctness — drop everything) / `P2` (real input fails visibly — schedule by log-triage
demand) / `P3` (polish/debt — batch) + product `2d`/`3d`/`analytic`/`complex`/`server`/`workspace`; `needs-operator` when blocked
on a decision; `icebox` for a closed, parked issue (never one that shows something false); `auto-ok`
marks a fix plan approved for the autonomous `/fix-round` loop. A session applies `auto-ok` only as
transcription of the operator's explicit approval, or to a plan whose every `What the student will see`
line is `[asked]`/`[ruled]`/`[2-D]` (rule 7), always with an audit comment (ADR-W-014, ADR-W-117). The loop's round issues carry `awaiting-play` until the
operator validates the batch ([docs/22 §2d](docs/22-workflow.md), ADR-W-012). A "bug" diagnosed as a **missing capability is relabelled `feature` and treated as one** —
never silently built under a bug's banner.

- **Bugs:** diagnose per docs/17, fix at root, ADR + scenario, commit to `main` with `Fixes #NN`.
- **Features (always a PR):** scope with the operator → branch `feat/<issue#>-slug` → build under the normal
  gates → `gh pr create` (`Closes #NN`) → **operator plays and approves** → merge. An operator
  "commit and deploy now" waives only the play-and-approve gate, **never the PR** — the PR is the permanent
  tracking record.
- **Check which branch the shared tree is on before editing** — a previous session may have left it on a
  feature branch — and **branch in a worktree** when the tree has uncommitted work, never `git checkout`
  over it. Worktree paths, cleanup, and the `node_modules` junction hazard: [docs/22 §7](docs/22-workflow.md).
- **`main` is the trunk** — always green, always deployable. **Deploys use only committed `main` state**, per
  [docs/RUNBOOK.md](docs/RUNBOOK.md), each with a `prod/YYYY-MM-DD[-n]` tag and a DEPLOY-LOG entry; a session runs them itself, never hands them back.
- **Commit ⇒ push.** GitHub is the real backup and the only channel to the other machine.

## Multi-product workspace

[ADR-266](docs/06-decisions.md#adr-266); registry and the adding-product-N+1 recipe: [docs/22 §9](docs/22-workflow.md).

One workspace, several sibling products: the **2-D Geo Builder** (`src/`, log 06, label `2d`), the **3-D Space
Builder** (`src3d/`, log 06b, label `3d`), the **complex-numbers Builder** (`src-complex/`,
log 06d, label `complex`), the **analytic-geometry Builder**
(`src-analytic/`, log 06c, label `analytic`) — all four deployed — plus the shared chrome
(`shell/`) and the **shared server** (`server/`, label `server`). Cross-product decisions go in
`docs/06w-decisions-workspace.md` as `ADR-W-nnn`.

Every workflow artifact is per-product — issue label, ADR log, CI lane, deploy path — so **identify which
product a request relates to before filing or fixing; ask when unclear, never guess across products.**
Product trees never import each other; the shared server is the one deliberate sharing point (parameterized
by `tool:`, never forked). Boundaries are declared in `BOUNDARIES.json` and enforced by
`server/__tests__/isolation.test.ts`.

## Commands

- `npm run dev` — Vite dev server: 2-D at `/`, 3-D at `/3d.html`, complex at `/complex.html`, analytic at `/analytic.html`
- `npm run build` — `tsc -b` then `vite build`; `build:3d` / `build:complex` / `build:analytic` for the siblings
- `npm test` — Vitest (watch). Single file: `npx vitest run <path>`. By name: `npx vitest run -t "<name>"`
- **`npm run test:full`** — the FULL suite (~10 min) — **the bar before any commit and any deploy**. Claim green by READING `reports/suite-verdict.json`, never an exit code ([ADR-W-033](docs/06w-decisions-workspace.md#adr-w-033)).
- **`npm run test:fast`** — every file outside the measured slow tier, all products (~2 min) — the development loop and a fix round's per-item check, **never a commit or deploy gate** ([ADR-W-113](docs/06w-decisions-workspace.md#adr-w-113)).
- **`npm run test:docs`** — the doc gate (~2 s) — the correct bar for a **doc-only** change; anything touching `.ts`/`.tsx` pays `test:full` ([ADR-W-041](docs/06w-decisions-workspace.md#adr-w-041)).
- `npm run test:tiers` — which slow files have actually caught a regression the fast tier missed.
- `npm run test:run:2d` / `test:run:3d` / `test:run:complex` / `test:run:analytic` — per-product slice (tree + `server/`, plus `shell/` for complex and analytic); CI mirrors the split. The same names without `run:` start watch mode and never exit.
- Test runs **queue on one lock across all worktrees** — `test:fast`, `test:full` and `test:run:*` take it themselves; an ad-hoc run uses `npm run test:locked -- npx vitest run <files>` ([ADR-W-114](docs/06w-decisions-workspace.md#adr-w-114)).
- Tier mechanics and the fold-memo rule: [docs/08](docs/08-testing-strategy.md). The `@/` alias is 2-D-only; that hazard and every import edge: [`BOUNDARIES.json`](BOUNDARIES.json).

## Cross-machine setup

David works from two PCs. The project lives at `C:\projects\geo_builder` (**not** Dropbox) and **everything
syncs through git**; `.claude/memory/` is git-tracked so it travels too. New machine: `gh repo clone
dcodish/geo_builder C:\projects\geo_builder`, `npm install`, copy `.env.local`. A `SessionStart` hook pulls
`--ff-only` and reports what needs a decision; the **`/handoff` skill** commits, pushes and reports what does
not travel; a `SessionEnd` hook pushes committed work. **Nothing auto-commits.** Never travels, by design:
`.env.local`, `logs/`, `node_modules/`, `.claude/settings.local.json`.

## Conventions to carry forward

- **No fixed assumptions — every unstated magnitude is a free DOF, not a fixed value ([ADR-052](docs/06-decisions.md#adr-052)).** A student enters only what the question shows; the tool assumes no size, angle, position or proportion that was not stated or forced. A default is only a *starting* point: it must change on «הציגו תצורה אחרת» or when a later constraint forces it, because a fixed default silently asserts a given the question never gave. Smell: a value counted by `rawMovableDof` but absent from `freeDofs` (never sampled).
- **One plane-geometry sentence, one verdict, one drawing in every builder.** For plane geometry 2-D is the reference for the verdict **and** for how the figure is drawn: marks, labels, label text, status wording ([ADR-W-118](docs/06w-decisions-workspace.md#adr-w-118) B1). A plane-geometry input change lands in every builder that should read it, or adds a known-gap row naming its issue; a sentence one builder reads by design needs an `EXCEPTIONS` family. Rows and rule: [docs/22 §10](docs/22-workflow.md) ([ADR-W-108](docs/06w-decisions-workspace.md#adr-w-108)).
- **Honesty invariants.** No stated magnitude is ever silently dropped — a given parses to a constraint, escalates, or errors, but never vanishes. Every stated **value** is visible on the figure (a length, angle, area, letter, the right-angle knee); a stated **relation** (AB = AC, ∥) is in the givens list and is drawn only in an opt-in relations layer, never as a mark at rest ([ADR-W-118](docs/06w-decisions-workspace.md#adr-w-118) B2). Error messages name the conflicting *statement*, never internal state.
- **RTL Hebrew is the default.** All user-facing strings go through `useTranslation`/`t()` (`src/i18n/`, `locales/he.json` + `en.json`). Toggling language updates `document.documentElement.dir`. The parser and the LLM fallback handle both Hebrew and English input.
- **Deterministic element IDs** (`seg-AB`, `poly-ABC`) so re-issuing the same command is idempotent.
- **Stack:** React + Vite + Zustand (+ `zundo` for temporal undo/redo) + TypeScript.

## Documentation

Start at [`docs/README.md`](docs/README.md). The ones you will actually need:
[17-design-rules](docs/17-design-rules.md) (fixing without degrading the codebase — operator authority),
[22-workflow](docs/22-workflow.md), [08-testing-strategy](docs/08-testing-strategy.md),
[LADDER](docs/LADDER.md) (the solve-ladder contract; every mechanism ADR names its stage),
[10-pedagogy](docs/10-pedagogy.md) (the charter: read it before building anything a student sees), and the ADR logs.

**Validation corpus:** `docs/sample questions/` holds real bagrut problems (text + image). The work is
corpus-driven — we reproduce each *figure* (never solve it) and compare against the official image.
