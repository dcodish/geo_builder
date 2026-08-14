# Geo Builder — Documentation

Living project documentation. Both apps are **built and in production** (themathbible.com/geo-builder/ + /3d-builder/).

**For current state, read the tail of [06-decisions.md](06-decisions.md) / [06b-decisions-3d.md](06b-decisions-3d.md), `gh issue list`, and [DEPLOY-LOG.md](DEPLOY-LOG.md)** — those are the records actually kept current ([ADR-W-002](06w-decisions-workspace.md#adr-w-002)). The repo-root [`CLAUDE.md`](../CLAUDE.md) is an **orientation** file (what exists, where it lives, what must never be done) and deliberately carries no status; [09-implementation-plan.md](09-implementation-plan.md) and [PROJECT-MEMORY.md](PROJECT-MEMORY.md) are background that lags. Day-to-day process lives in [22-workflow.md](22-workflow.md) (issues → PRs → main → deploy) and [RUNBOOK.md](RUNBOOK.md).

## Contents

| # | Document | What it covers |
|---|----------|----------------|
| 01 | [Vision](01-vision.md) | Purpose, audience, the core interaction, goals & non-goals |
| 02 | [Functional Requirements](02-requirements.md) | What the system must do (`FR-*`), actors, user stories |
| 03 | [Non-Functional Requirements](03-nonfunctional-requirements.md) | Quality attributes (`NFR-*`): usability, stability, cost, security, … |
| 04 | [Design](04-design.md) | Architecture, data model, engine, input layer, rendering, build order |
| 05 | [Glossary](05-glossary.md) | Shared vocabulary for the domain and the system |
| 06 | [Decisions (ADR log)](06-decisions.md) | Key decisions and the reasoning behind each |
| 06b | [Decisions — 3-D tool](06b-decisions-3d.md) | The 3-D track's own ADR log (`ADR-3D-NNN`) — separate by design so parallel sessions never race on one numbering (docs/20 §12) |
| 06w | [Decisions — workspace](06w-decisions-workspace.md) | Cross-product decisions (`ADR-W-nnn`): ones belonging to no single product — the registry, boundaries, documentation structure. `06c`/`06d` are reserved for the planned analytic and complex products |
| 07 | [Theorem Reference](07-theorem-reference.md) | The official bagrut theorem list (109 + appendices), bilingual, IDs + role tags — canonical source for the theorem feature |
| 08 | [Testing Strategy](08-testing-strategy.md) | Test levels, per-layer coverage, golden fixtures, requirement→test traceability, and the "definition of ready" gate |
| 09 | [Implementation Plan](09-implementation-plan.md) | Phased build plan: scope, dependencies, requirement coverage, per-phase gates, and milestones |
| 10 | [Pedagogy](10-pedagogy.md) | The teaching charter: what students should learn, how each mechanic teaches, and the construction→theorem trigger map (Phase 6 payload) |
| 11 | [Architecture as a Compiler](11-architecture-as-compiler.md) | A lens: the NL→commands→evaluation→render pipeline as a compiler front-end + constraint interpreter + retargetable back-end — and where new work slots in |
| 12 | [Letter Placement](12-letter-placement.md) | The vertex/point label-placement guide |
| 13 | [Design Audit (2026-06-17)](13-design-audit-2026-06-17.md) | Full design+development audit: the case-by-case-patching root cause, prioritized re-work/generalizations (R1–R9), and the test-strategy shift — directions captured as Proposed ADR-043…047 |
| 14 | [Backlog & Quick-Win Triage](14-backlog.md) | The prioritized index of open work — parked engineering threads + operator-raised N1–N6, with grounded "already done / not quick / quick win" verdicts and what to pick up next |
| 15 | [Hardening Plan (2026-07-02)](15-hardening-plan.md) | The sequenced A–F hardening program from the multi-area Fable review — all phases complete (ADR-170…207) |
| 16 | [Phase 6 Theorems Plan](16-theorems-plan.md) | The pedagogy-first pre-dev plan for theorem surfacing: stated-vs-derived principle, no-reveal ladder, relevancy model, matcher set, gates, slices |
| 17 | [Design Rules](17-design-rules.md) | **Read before fixing any bug.** The operator-commissioned doctrine: class-first diagnosis, patch tripwires, the chokepoint registry, designed mechanisms M1–M4, perf rules, escalation template |
| 18 | [Theorem Discovery v2 — Relevance Replan](18-theorem-relevance-plan.md) | **ACCEPTED, decision-complete (2026-07-06); T1 next.** The 6b+ replan after the operator's dissatisfaction review: coverage disposition map (66/109 ids absent today), evidence-predicate library, explainable rank bands + subsumption, the observed (L2/L3) lane, the principles lane (teacher tips + intent hints); all §8 decisions resolved |
| 19 | [Analytic-geometry tool (sibling app)](19-analytic-geometry-tool.md) | **PROPOSED — one decision open (2026-07-06).** A second tool at its own URL for bagrut analytic geometry: corpus reading (Q1 is a *locus* problem), the shared-chassis / new-core split, the locus↔free-DOF bridge, and vectors/3-D parked as a third track |
| 20 | [Space/vectors tool (3-D)](20-space-vectors-tool.md) | **ACCEPTED, decision-complete (2026-07-06); V0 next.** The detailed plan for the third tool at **`/3d-builder/`** (bagrut Q2, vectors geometric + algebraic): corpus reading of four 572 exams, the two lanes + the coordinate-injection pivot, three new cores (bounded symbolic vector layer — **NO CAS**, linear equation layer, SVG projection renderer with textbook hidden-line style), phased V0–V6 build gated on the corpus |
| 22 | [Project Workflow](22-workflow.md) | **The standard operating route (ADR-265):** GitHub issues for every report, priority rubric P1–P3, bug vs feature routes, PRs to `main`, deploy tagging |
| 27 | [Complex-numbers tool (sibling app)](27-complex-numbers-tool.md) | **PROPOSED — decisions D1–D5 open (2026-08-14).** The fourth sibling (`src-complex/`, label `complex`): corpus reading of eight 572 exams (Q3 lives on an unprinted Gauss plane), the three exact chassis matches (branch index ↔ root multiplicity, free DOF ↔ unstated parameter, dependency graph ↔ derived numbers), the bounded exact-polar core, and the complex-before-analytic build-order question |
| — | [RUNBOOK](RUNBOOK.md) | Ops: deploy procedures for both apps + the proxy, verification, troubleshooting index, rollback, logs |
| — | [DEPLOY-LOG](DEPLOY-LOG.md) | Append-only record of what is live in production (paired with `prod/*` git tags) |
| — | [Project Memory](PROJECT-MEMORY.md) | Operational notes and a dated session log. **Background, not status** — it lags the ADR logs (ADR-W-002) |
| — | [Paper & Theory](paper/README.md) | Academic writing + the theory/algorithmic lineage behind the implementation (method↔citation mapping, paper outline, dated discussion logs) |

## How to use these

- **Read in order** for a full picture; 01 → 02/03 establish *what* and *why*, 04 establishes *how*.
- These are **living documents** — update them as the design evolves, and add an ADR whenever a significant decision is made or changed: `06` for the 2-D app, `06b` for 3-D, `06w` for anything cross-product.
- The repo-root `CLAUDE.md` (and `src3d/CLAUDE.md`) is the quick orientation for Claude Code sessions and points here for depth. It holds no history or status by design — a dated progress entry belongs in its ADR.
