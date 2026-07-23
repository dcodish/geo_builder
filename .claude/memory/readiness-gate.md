---
name: readiness-gate
description: "How David wants build work reported — nothing is \"ready\" until its test gate passes"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 88027cdc-952d-4125-8f14-2fb88bd19212
---

David requires a defined testing gate before anything is called "ready" (asked for this before any engine code). Do not declare a feature or build step done until: its acceptance tests pass, the **stability** regression passes, `tsc` + `npm run build` are clean, and results are reported honestly — failing/skipped tests shown, never hidden (no `.only`, no silent skips, no silent LLM fallback masking a failure).

**Why:** he wants trustworthy "ready", not optimistic claims.

**How to apply:** for each build step, follow the per-step gate in `docs/08-testing-strategy.md`; run the tests and show the output before saying it's ready. The engine is pure/deterministic — test it hardest; mock the LLM fallback (no live API in tests). See [[architecture-decisions]].
