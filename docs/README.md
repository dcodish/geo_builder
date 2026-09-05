# Geo Builder — Documentation

Living project documentation for a **four-product workspace**: the 2-D Geo Builder
(`themathbible.com/geo-builder/`), the 3-D Space Builder (`/3d-builder/`), the complex-numbers Builder
(`/complex-builder/`), and the analytic Builder (`src-analytic/` — **built locally, deliberately not
deployed**, [ADR-AG-007](06c-decisions-analytic.md)). The machine-readable roster is
[`products.json`](../products.json); the documentation registry is [`DOCS.json`](../DOCS.json).

**For current state, read the tail of the relevant decision log, `gh issue list`, and
[DEPLOY-LOG.md](DEPLOY-LOG.md)** — those are the records actually kept current
([ADR-W-002](06w-decisions-workspace.md#adr-w-002)). The repo-root [`CLAUDE.md`](../CLAUDE.md) is an
**orientation** file and deliberately carries no status. Day-to-day process lives in
[22-workflow.md](22-workflow.md) and [RUNBOOK.md](RUNBOOK.md).

> **How statuses in this index work.** A status below is **what the document says about itself**. Where a
> document states none, this table describes its content and makes no status claim. **Do not write a
> status here that the document does not carry** — the previous version of this index asserted statuses
> for docs 19, 20, 27 and 28 that all four contradicted, and omitted 15 documents entirely. Totality is
> now enforced: `docs-hygiene.test.ts` fails if any `docs/*.md` is missing from this file.

## The contract — what the products promise, and how they are built

Per-product docs follow the decision-log suffixes (`02b`/`02c`/`02d` requirements, `04b`/`04c`/`04d`
design, `02w`/`04w` for shared surfaces), registered in [`DOCS.json`](../DOCS.json)
([ADR-W-041](06w-decisions-workspace.md#adr-w-041)). Entries marked *(to write)* are declared gaps
tracked by [#904](https://github.com/dcodish/geo_builder/issues/904), not oversights.

| # | Document | What it covers |
|---|---|---|
| 01 | [Vision](01-vision.md) | Purpose, audience, the core interaction, goals & non-goals |
| 02 | [Functional Requirements — 2-D](02-requirements.md) | What the 2-D builder must do (`FR-*`), actors, user stories |
| 02b | [Requirements — 3-D](02b-requirements-3d.md) | The 3-D contract: the two lanes, gauge-vs-knowledge, claims are verified never obeyed, the NO-CAS bound. `catalog3.ts` remains the construct inventory |
| 02c | [Requirements — Analytic](02c-requirements-analytic.md) | **In progress; the product's standing requirements doc.** V1 pedagogy + requirements, captured live 2026-09-04, promoted from `19a` by ADR-W-041 |
| 02d | *(to write)* | Requirements — complex-numbers Builder |
| 02w | [Requirements — shared surfaces](02w-requirements-workspace.md) | The contract every builder shares: suite chrome, the ask lane + data panel, save/load envelope, export, the admin surface, bidi and number display |
| 03 | [Non-Functional Requirements](03-nonfunctional-requirements.md) | Quality attributes (`NFR-*`): usability, stability, cost, security, privacy |
| 04 | [Design — 2-D](04-design.md) | Architecture, data model, engine, input layer, rendering. **2-D only** |
| 04b–04w | *(to write)* | Design — 3-D, analytic, complex, and the shared `shell/` + `server/` |
| 05 | [Glossary](05-glossary.md) | Shared vocabulary for the domain and the system |

## Decision logs — the records that are kept current

| # | Document | Scope |
|---|---|---|
| 06 | [Decisions — 2-D](06-decisions.md) | `ADR-NNN`; also repo-wide/infra decisions |
| 06b | [Decisions — 3-D](06b-decisions-3d.md) | `ADR-3D-NNN` |
| 06c | [Decisions — Analytic](06c-decisions-analytic.md) | `ADR-AG-NNN` |
| 06d | [Decisions — Complex](06d-decisions-complex.md) | `ADR-CX-NNN` |
| 06w | [Decisions — Workspace](06w-decisions-workspace.md) | `ADR-W-nnn` — decisions belonging to no single product |

## Process & operations

| # | Document | What it covers |
|---|---|---|
| 08 | [Testing Strategy](08-testing-strategy.md) | Test levels, per-layer coverage, the two tiers, golden fixtures, the definition-of-ready gate |
| 17 | [Design Rules](17-design-rules.md) | **Read before fixing any bug.** Class-first diagnosis, patch tripwires, the chokepoint registry, mechanisms M1–M4, the escalation template |
| 22 | [Project Workflow](22-workflow.md) | **Adopted ([ADR-265](06-decisions.md#adr-265)).** Issues → PRs → `main` → deploy; the priority rubric; §3b the requirements/design contract step; §9 the product registry |
| — | [LADDER](LADDER.md) | The cross-layer solve-ladder contract (2-D) — every mechanism ADR names the stage it inserts at |
| — | [LADDER-CX](LADDER-CX.md) | The same contract for the complex-numbers engine |
| — | [test-scenarios](test-scenarios.md) | Index of every reported-bug regression scenario; parity with the corpus is test-enforced |
| — | [RUNBOOK](RUNBOOK.md) | Ops: deploy procedures for each app + the proxy, verification, troubleshooting, rollback |
| — | [DEPLOY-LOG](DEPLOY-LOG.md) | Append-only record of what is live, paired with `prod/*` git tags |

## Domain & reference

| # | Document | What it covers |
|---|---|---|
| 07 | [Theorem Reference](07-theorem-reference.md) | The official bagrut theorem list (109 + appendices), bilingual, IDs + role tags. **Byte-matched against `THEOREM_TABLE` by a test** |
| 10 | [Pedagogy](10-pedagogy.md) | The teaching charter, and the operator-editable principles catalog (byte-guarded) |
| 11 | [Architecture as a Compiler](11-architecture-as-compiler.md) | The pipeline lens, revised 2026-07-24 after the docs/23 review corrected three stale premises |
| 12 | [Letter Placement](12-letter-placement.md) | The two levers that decide a figure's lettering: naming order and orientation |
| 29 | [Complex formula sheet](29-complex-formula-reference.md) | The official formula sheet, transcribed. **Byte-matched against the formula table by a test** |

## Product plans

Each is the build plan for one product; the *contract* lives in that product's requirements/design docs
above, and the *current state* in its decision log.

| # | Document | Status (as the document states it) |
|---|---|---|
| 19 | [Analytic-geometry tool](19-analytic-geometry-tool.md) | **Accepted**, rewritten 2026-09-03 against twenty consecutive 572 Q1s; V0 in build (#888). Not deployed |
| 20 | [Space/vectors tool (3-D)](20-space-vectors-tool.md) | **Accepted, built and in production.** V8 complete — every 2009–2024 exam's space/vectors input is expressible |
| 27 | [Complex-numbers tool](27-complex-numbers-tool.md) | **Accepted; shipped** `prod/2026-08-17-4` |
| 28 | [Product unification](28-product-unification.md) | **Plan of record** ([ADR-W-018](06w-decisions-workspace.md#adr-w-018)); executing since 2026-08-17 |
| 24 | [Foundation hardening plan](24-foundation-hardening-plan.md) | **Executed 2026-07-24/25**, but the umbrella issue [#310](https://github.com/dcodish/geo_builder/issues/310) is still open — treat as in progress |

## Historical — completed or superseded

**These describe finished or replaced work.** They carry useful background; none is current status. Read
them for *why* something is the way it is, never for *what is true now*.

| # | Document | Why it is here |
|---|---|---|
| 09 | [Implementation Plan](09-implementation-plan.md) | The original phased build plan. Background; lags the ADR logs ([ADR-W-002](06w-decisions-workspace.md#adr-w-002)) |
| 09b | [Status Log](09b-status-log.md) | Explicitly archived 2026-07-16 — the status blockquote stack that had grown to ~81 KB on one line |
| 13 | [Design Audit (2026-06-17)](13-design-audit-2026-06-17.md) | The case-by-case-patching audit; its directions became ADR-043…047 |
| 14 | [Backlog & Quick-Win Triage](14-backlog.md) | Superseded by the issue queue ([ADR-265](06-decisions.md#adr-265)). Surviving items are being swept into issues |
| 15 | [Hardening Plan (2026-07-02)](15-hardening-plan.md) | The sequenced A–F program from the multi-area review; its tracking table is ticked through ADR-170…207 |
| 16 | [Phase 6 Theorems Plan](16-theorems-plan.md) | **Superseded for 6b+ by [18](18-theorem-relevance-plan.md)**, per its own header |
| 18 | [Theorem Discovery v2 — relevance replan](18-theorem-relevance-plan.md) | *"The replan is fully built (T1–T5)"*; operator play-and-judge gates remain |
| 21 | [572 coverage audit](21-572-coverage-audit.md) | A point-in-time sweep of ~42 exams (2026-07-08) that scoped the 3-D V8 work |
| 23 | [Architecture review (2026-07)](23-architecture-review-2026-07.md) | Commissioned review; findings adopted, execution became [24](24-foundation-hardening-plan.md) |
| 25 | [Joint-solve design](25-joint-solve-design.md) | S3.2 design; approved and built 2026-07-25 with one measured amendment |
| 26 | [3-D relations plan](26-3d-relations-plan.md) | **Complete (2026-07-28)** — all six slices landed |
| — | [Manual verification (2026-06-15)](manual-verification-2026-06-15.md) | A dated verification record for the deferred-backlog batch |
| — | [Project Memory](PROJECT-MEMORY.md) | Operational notes + a dated session log. Background, not status; lags the ADR logs |
| — | [Paper & Theory](paper/README.md) | Academic writing and the theory/algorithmic lineage behind the implementation |

## How to use these

- **Read in order** for a full picture: 01 → 02/03 establish *what* and *why*, 04 establishes *how*.
- These are **living documents**. Add an ADR whenever a significant decision is made or changed, and
  update the requirements/design docs in the **same commit as the code** — that is standing rule 6 in
  `CLAUDE.md`, the [§3b](22-workflow.md) contract step, and it is test-enforced.
- **A doc-only change is gated by `npm run test:docs`** (~2 s), not the full suite; `.github/workflows/docs.yml`
  runs the same gate in CI on the paths `ci.yml` ignores.
- Adding a document means adding it to this index — the totality guard will tell you if you forget.
