---
name: pr-servers-have-no-llm-key
description: "A PR worktree's dev server has no .env.local, so the LLM fallback answers \"none\" in ~3 ms — the operator reads it as \"not escalated\""
metadata:
  node_type: memory
  type: feedback
  originSessionId: 09a71641-cfed-4f06-918c-f6ccf8c99bfd
  modified: 2026-09-24T16:38:20.743Z
---

A worktree never gets `.env.local` (it is gitignored and never travels), so a play server started from a PR worktree has no API key: the dev proxy answers the LLM fallback with `result:"none"` in a few milliseconds and the student sees the plain refusal. On 2026-09-24 (round #1397 T19) the operator reported «זוית C=200 … was not escalated to llm»; the dev log showed the escalation DID fire (`source:"llm" result:"none"` 3 ms after the parser).

**Why:** a play sheet case that depends on the LLM lane cannot pass on a PR port, and the failure looks like a product bug.

**How to apply:** when a play case can reach the fallback, say on the sheet that PR ports have no model, or ask the operator whether to copy `.env.local` into the worktree (live calls are his to authorise — standing rule 2). Check `logs/debug-log*.jsonl` timing before diagnosing "did not escalate" ([[dev-log-has-his-exact-run]]).
