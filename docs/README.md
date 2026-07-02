# Geo Builder — Documentation

Living project documentation. Status: **design phase** (last updated 2026-06-10). The system described here is the **target design**; the engine, parser, and UI are not yet implemented. For the current state of the repository, see the repo-root [`CLAUDE.md`](../CLAUDE.md).

## Contents

| # | Document | What it covers |
|---|----------|----------------|
| 01 | [Vision](01-vision.md) | Purpose, audience, the core interaction, goals & non-goals |
| 02 | [Functional Requirements](02-requirements.md) | What the system must do (`FR-*`), actors, user stories |
| 03 | [Non-Functional Requirements](03-nonfunctional-requirements.md) | Quality attributes (`NFR-*`): usability, stability, cost, security, … |
| 04 | [Design](04-design.md) | Architecture, data model, engine, input layer, rendering, build order |
| 05 | [Glossary](05-glossary.md) | Shared vocabulary for the domain and the system |
| 06 | [Decisions (ADR log)](06-decisions.md) | Key decisions and the reasoning behind each |
| 07 | [Theorem Reference](07-theorem-reference.md) | The official bagrut theorem list (109 + appendices), bilingual, IDs + role tags — canonical source for the theorem feature |
| 08 | [Testing Strategy](08-testing-strategy.md) | Test levels, per-layer coverage, golden fixtures, requirement→test traceability, and the "definition of ready" gate |
| 09 | [Implementation Plan](09-implementation-plan.md) | Phased build plan: scope, dependencies, requirement coverage, per-phase gates, and milestones |
| 10 | [Pedagogy](10-pedagogy.md) | The teaching charter: what students should learn, how each mechanic teaches, and the construction→theorem trigger map (Phase 6 payload) |
| 11 | [Architecture as a Compiler](11-architecture-as-compiler.md) | A lens: the NL→commands→evaluation→render pipeline as a compiler front-end + constraint interpreter + retargetable back-end — and where new work slots in |
| 12 | [Letter Placement](12-letter-placement.md) | The vertex/point label-placement guide |
| 13 | [Design Audit (2026-06-17)](13-design-audit-2026-06-17.md) | Full design+development audit: the case-by-case-patching root cause, prioritized re-work/generalizations (R1–R9), and the test-strategy shift — directions captured as Proposed ADR-043…047 |
| 14 | [Backlog & Quick-Win Triage](14-backlog.md) | The prioritized index of open work — parked engineering threads + operator-raised N1–N6, with grounded "already done / not quick / quick win" verdicts and what to pick up next |
| — | [Project Memory](PROJECT-MEMORY.md) | Travelling memory: where memory lives, operational notes, resume pointer (read at session start) |
| — | [Paper & Theory](paper/README.md) | Academic writing + the theory/algorithmic lineage behind the implementation (method↔citation mapping, paper outline, dated discussion logs) |

## How to use these

- **Read in order** for a full picture; 01 → 02/03 establish *what* and *why*, 04 establishes *how*.
- These are **living documents** — update them as the design evolves, and add an ADR to `06` whenever a significant decision is made or changed.
- The repo-root `CLAUDE.md` is the quick orientation for Claude Code sessions and points here for depth.
