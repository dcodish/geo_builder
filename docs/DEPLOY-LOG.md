# DEPLOY LOG — what is live on themathbible.com

Append-only, newest first. One entry per deploy, written **at deploy time** ([docs/22 §5](22-workflow.md)). Every entry pairs with a git tag `prod/YYYY-MM-DD[-n]` on the deployed commit. This file is canonical — deploy notes no longer accumulate in PROJECT-MEMORY. Pre-adoption deploy history (2026-07-04 … 2026-07-10) lives in PROJECT-MEMORY's operational notes.

| Date | Tag | Commit | App(s) | Bundle(s) | What changed |
| --- | --- | --- | --- | --- | --- |
| 2026-07-10 | `prod/2026-07-10-2` | `e39679a` | 3-D (static only; proxy untouched) | `3d-C0CHZumu.js` | ADR-3D-033 — a membership statement about an existing point DRIVES the figure (stage-4 member-pin re-solve, warm-started, transactional); fixes #9 (session `n6lmx1rj`, `M על מישור DCC'D'` refused not-on-plane). |
| 2026-07-10 | `prod/2026-07-10` | `6168d0c` | 2-D + 3-D (static only; proxy untouched) | `index-42UWO93R.js` / `3d-BJG80kY4.js` | 2-D: ADR-262 Am.1, ADR-264 (+Am.1/2) — clause split, honesty gates, hover/canvas fixes. 3-D: ADR-3D-030/031/032 — plane-eq as M1 given, pair-named parametric line, derived plane equations, symbolic coordinate. (Tag added retroactively at workflow adoption.) |
