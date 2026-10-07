# Geo Builder — Documentation

Living project documentation for a **four-product workspace**: the 2-D Geo Builder
(`themathbible.com/geo-builder/`), the 3-D Space Builder (`/3d-builder/`), the complex-numbers Builder
(`/complex-builder/`), and the analytic Builder (`/analytic-builder/`, deployed since `prod/2026-09-16`). The machine-readable roster is
[`products.json`](../products.json); the documentation registry is [`DOCS.json`](../DOCS.json).

**For current state, read the tail of the relevant decision log, `gh issue list`, and
[DEPLOY-LOG.md](DEPLOY-LOG.md)** — those are the records actually kept current
([ADR-W-002](06w-decisions-workspace.md#adr-w-002)). The repo-root [`CLAUDE.md`](../CLAUDE.md) is an
**orientation** file and deliberately carries no status. Day-to-day process lives in
[22-workflow.md](22-workflow.md) and [RUNBOOK.md](RUNBOOK.md).

> **How statuses in this index work.** A status below is **what the document says about itself**. Where a
> document states none, this table describes its content and makes no status claim. **Do not write a
> status here that the document does not carry.** Totality is enforced: `docs-hygiene.test.ts` fails if
> any `docs/*.md` is missing from this file.

## The contract — what the products promise, and how they are built

Per-product docs follow the decision-log suffixes (`02b`/`02c`/`02d` requirements, `04b`/`04c`/`04d`
design, `02w`/`04w` for shared surfaces), registered in [`DOCS.json`](../DOCS.json)
([ADR-W-041](06w-decisions-workspace.md#adr-w-041)).

| # | Document | What it covers |
|---|---|---|
| 01 | [Vision](01-vision.md) | Purpose, audience, the core interaction, goals & non-goals |
| 02 | [Functional Requirements — 2-D](02-requirements.md) | What the 2-D builder must do (`FR-*`), actors, user stories |
| 02b | [Requirements — 3-D](02b-requirements-3d.md) | The 3-D contract: the two lanes, gauge-vs-knowledge, claims are verified never obeyed, the NO-CAS bound. `catalog3.ts` remains the construct inventory |
| 02c | [Requirements — Analytic](02c-requirements-analytic.md) | **In progress; the product's standing requirements doc.** V1 pedagogy + requirements, captured live 2026-09-04, promoted from `19a` by ADR-W-041 |
| 02d | [Requirements — Complex](02d-requirements-complex.md) | The complex contract: the Gauss plane the exam never prints, exactness over ℚ, branches as «כל האפשרויות», and the THREE-valued claim verdict |
| 02w | [Requirements — shared surfaces](02w-requirements-workspace.md) | The contract every builder shares: suite chrome, the ask lane + data panel, save/load envelope, export, the admin surface, bidi and number display |
| 03 | [Non-Functional Requirements](03-nonfunctional-requirements.md) | Quality attributes (`NFR-*`): usability, stability, cost, security, privacy |
| 04 | [Design — 2-D](04-design.md) | Architecture, data model, engine, input layer, rendering. **2-D only** |
| 04b | [Design — 3-D](04b-design-3d.md) | The context-free parser and why that is the better architecture, the coordinate-injection pivot, the landing funnel, relations as a disposition map |
| 04c | [Design — Analytic](04c-design-analytic.md) | The parameter-carrying expression layer, the conic fit and canonicity gate, and the first builder born after the chassis |
| 04d | [Design — Complex](04d-design-complex.md) | Log-polar makes the corpus LINEAR — exact ℚ elimination, branches as integer unknowns, DOF as nullspace dimension, and the three-valued claim verdict |
| 04w | [Design — the shared chrome](04w-design-shell.md) | How `shell/` is built: slots not flags, the evidence-seeded entry rule, the two layers, the staggered adoption, and the rule that is enforced at import level only |
| 04s | [Design — the shared server](04s-design-server.md) | The one Node service: single-file bundle, the key boundary, one proxy parameterized by `tool:`, cost controls, the event sink and dashboard — and the tree's missing type gate |
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
| 10 | [Pedagogy](10-pedagogy.md) | The pedagogy charter (being rewritten for all four builders, #1861) |
| 12 | [Letter Placement](12-letter-placement.md) | The two levers that decide a figure's lettering: naming order and orientation |
| 29 | [Complex formula sheet](29-complex-formula-reference.md) | The official formula sheet, transcribed. **Byte-matched against the formula table by a test** |
| — | [`sample questions/`](sample%20questions/) | Real bagrut problems (text + image), the validation corpus. `theorem-ground-truth.md` there is read by a test |
| — | [`5pts_GeometryList_Teachers.pdf`](5pts_GeometryList_Teachers.pdf) | The official theorem list, the source of 07 (07's header says how to read it) |

## Outreach

| # | Document | What it covers |
|---|---|---|
| — | [`outreach/`](outreach/) | Material for posts, talks and teachers — [30, how the tools are built](outreach/30-how-the-tools-are-built.md), the [paper](outreach/paper/README.md) drafts and the algorithms [presentation](outreach/presentation/geo-builder-algorithms.html). Not a rule or a spec |

## Archive — history, never a rule

[`archive/`](archive/) holds finished plans and reviews. Read them for *why* something is the way it is,
never for *what is true now*: each carries a banner naming where its live parts went.

| # | Document | What replaced it |
|---|---|---|
| 09 | [Implementation Plan](archive/09-implementation-plan.md) | The ADR logs and the issue queue |
| 11 | [Architecture as a Compiler](archive/11-architecture-as-compiler.md) | [04 §1](04-design.md#1-guiding-principles), "The compiler lens" |
| 13 | [Design Audit (2026-06-17)](archive/13-design-audit-2026-06-17.md) | Its directions became ADR-043…047 |
| 15 | [Hardening Plan (2026-07-02)](archive/15-hardening-plan.md) | Done; its items shipped as ADR-170…207 |
| 16 | [Phase 6 Theorems Plan](archive/16-theorems-plan.md) | Superseded by 18. The theorem surface is switched off (#740) |
| 18 | [Theorem Discovery v2](archive/18-theorem-relevance-plan.md) | Built, then switched off (#740); its intent is quoted in [10](10-pedagogy.md) |
| 19 | [Analytic-geometry tool](archive/19-analytic-geometry-tool.md) | [02c](02c-requirements-analytic.md) §1a and §3a, [04c](04c-design-analytic.md) |
| 20 | [Space/vectors tool (3-D)](archive/20-space-vectors-tool.md) | [02b](02b-requirements-3d.md) "Scope and non-goals", [04b](04b-design-3d.md), `catalog3.ts` |
| 21 | [572 coverage audit](archive/21-572-coverage-audit.md) | The 3-D catalog, `catalog3.ts` |
| 23 | [Architecture review (2026-07)](archive/23-architecture-review-2026-07.md) | Executed as 24 |
| 24 | [Foundation hardening plan](archive/24-foundation-hardening-plan.md) | Executed; the remaining solver step is #1874 |
| 25 | [Joint-solve design](archive/25-joint-solve-design.md) | Built 2026-07-25; the remaining solver step is #1874 |
| 26 | [3-D relations plan](archive/26-3d-relations-plan.md) | [04b](04b-design-3d.md) "Adding a relation" |
| 27 | [Complex-numbers tool](archive/27-complex-numbers-tool.md) | [02d](02d-requirements-complex.md) "Appendix — Grammar families", [04d](04d-design-complex.md) |
| 28 | [Product unification](archive/28-product-unification.md) | [04w](04w-design-shell.md) (§5b–§5d) and [02w](02w-requirements-workspace.md) "Suite rulings"; Phase 2 is #663/#664 |

Deleted in #1861 and reachable only in git history:
[PROJECT-MEMORY](https://github.com/dcodish/geo_builder/blob/6dcdff48/docs/PROJECT-MEMORY.md),
[09b (status log)](https://github.com/dcodish/geo_builder/blob/6dcdff48/docs/09b-status-log.md),
[14 (backlog)](https://github.com/dcodish/geo_builder/blob/6dcdff48/docs/14-backlog.md) and the
[2026-06-15 manual-verification record](https://github.com/dcodish/geo_builder/blob/6dcdff48/docs/manual-verification-2026-06-15.md).
The pre-adoption deploys PROJECT-MEMORY held are now in
[DEPLOY-LOG](DEPLOY-LOG.md#pre-adoption-deploys-untagged-2026-07-0407-10).

## How to use these

- **Read in order** for a full picture: 01 → 02/03 establish *what* and *why*, 04 establishes *how*.
- These are **living documents**. Add an ADR whenever a significant decision is made or changed, and
  update the requirements/design docs in the **same commit as the code** — that is standing rule 6 in
  `CLAUDE.md`, the [§3b](22-workflow.md) contract step, and it is test-enforced.
- **A doc-only change is gated by `npm run test:docs`** (~2 s), not the full suite; `.github/workflows/docs.yml`
  runs the same gate in CI on the paths `ci.yml` ignores.
- Adding a document means adding it to this index — the totality guard will tell you if you forget.
