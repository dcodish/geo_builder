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

## How to use these

- **Read in order** for a full picture; 01 → 02/03 establish *what* and *why*, 04 establishes *how*.
- These are **living documents** — update them as the design evolves, and add an ADR to `06` whenever a significant decision is made or changed.
- The repo-root `CLAUDE.md` is the quick orientation for Claude Code sessions and points here for depth.
