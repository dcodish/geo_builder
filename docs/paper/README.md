# Paper & Theory

The home for **academic writing about Geo Builder** and the **theory behind the implementation** — the material that would go into a paper, thesis chapter, or conference talk, kept separate from the engineering docs (which live one level up in [`docs/`](../README.md)).

Everything here syncs via Dropbox, so it travels across machines like the rest of the repo (per the [project-memory rule](../PROJECT-MEMORY.md)). Durable theory context goes **here**, not in machine-local memory.

## What lives here

| File / folder | Purpose |
|---|---|
| [`01-methods-and-mathematical-lineage.md`](01-methods-and-mathematical-lineage.md) | **The core theory reference.** Every mathematical / algorithmic method the engine uses, mapped to its citeable name and to the exact code — plus what is genuinely novel vs. borrowed. The honest "what can we claim we used." |
| [`outline.md`](outline.md) | The evolving paper outline (sections, the argument, where each result slots in). |
| [`references.md`](references.md) | Bibliography — canonical citations, with a *verify-before-submission* flag on each. |
| [`experiments/`](experiments/PROTOCOL.md) | **Comparative-experiment framework** — the protocol, ledger, and results schema for tracking method A vs B vs C on a fixed benchmark, so we can produce paper-quality comparisons + justifications for choosing one method over another. |
| [`adr-draft-solver-experiment-harness.md`](adr-draft-solver-experiment-harness.md) | Draft ADR for the solver A/B harness (parked until the shared ADR log is free of the concurrent session; then insert as the next free number). |
| [`discussions/`](discussions/) | **Dated logs** of every discussion we have on this topic. Append-only: one file per session, `YYYY-MM-DD-topic.md`. Raw thinking is captured here; distilled conclusions get promoted into the numbered theory docs. |
| `drafts/` | Paper / section drafts (created when we start writing prose). |

## How we work in this folder

- **Discuss → capture → distill.** A discussion is logged in `discussions/` the day it happens. When a conclusion is solid, it's promoted into a numbered theory doc (`0N-*.md`) so the knowledge is reusable, not buried in a log.
- **Claims are grounded in code.** A method is only listed as "used" if it is actually in the engine — each entry cites `file:line`. This keeps us honest (no overclaiming a method we don't run).
- **References get verified before they're cited in submitted prose.** Until then they carry a `⚠ verify` flag.

## Related artifacts elsewhere in the repo

- [`../presentation/geo-builder-algorithms.html`](../presentation/geo-builder-algorithms.html) — the **talk deck** (figures + pseudocode: pipeline, DOF dependency graph, the algorithms, the verification stack). The visual companion to this folder's prose.
- [`../11-architecture-as-compiler.md`](../11-architecture-as-compiler.md) — the compiler-pipeline lens; the conceptual spine the paper's architecture section builds on.
- [`../06-decisions.md`](../06-decisions.md) — the ADR log; the primary-source record of *why* each design choice was made (cite ADRs for provenance).
- [`../10-pedagogy.md`](../10-pedagogy.md) — the teaching charter; the "why it matters for students" argument.
