---
name: no-autonomous-api-calls
description: geo_builder — never make Anthropic/Haiku API calls without explicit per-instance operator approval; act as the oracle myself using the session model instead.
metadata:
  type: feedback
---

In the geo_builder project, **never fire a live Anthropic / Haiku API call autonomously** — even though the API key in `.env.local` makes it technically possible and the endpoint is reachable. **Only the operator (David) authorises a live API call**, per-instance.

**Why:** to prevent drift / thousands of test calls / surprise cost. The key being available is a discipline matter, not a green light.

**How to apply:** to test the LLM fallback or whether a freeform sentence can be decomposed, **act as the oracle myself using this session's model** (subscription-based, free) — reason out the canonical command lines the LLM *should* emit, then verify they PARSE and BUILD through the real `parse → replay` path. The session model ≈ Haiku is accepted as good enough for development. Escalate to a live Haiku call **only with explicit operator approval**, and only when the operator's live testing diverges from my prediction (suspecting Haiku-specific behaviour). The production app still legitimately uses the API key server-side; the subscription is not a server-callable backend.

Recorded durably in the repo too: `CLAUDE.md` (Testing section) + `docs/PROJECT-MEMORY.md` (Operational notes).
