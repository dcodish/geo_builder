---
name: pr-servers-have-no-llm-key
description: "PR worktree play servers deliberately run WITHOUT an LLM key (operator ruling) — the fallback answers \"none\" in ~3 ms; say so on the sheet, never copy .env.local"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 09a71641-cfed-4f06-918c-f6ccf8c99bfd
  modified: 2026-09-24T16:43:42.097Z
---

A worktree never gets `.env.local` (gitignored, never travels), so a play server started from a PR worktree has no API key: the dev proxy answers the LLM fallback with `result:"none"` in a few milliseconds and the student sees the plain refusal. On 2026-09-24 (round #1397 T19) the operator reported «זוית C=200 … was not escalated to llm»; the dev log showed the escalation DID fire (`source:"llm" result:"none"` 3 ms after the parser).

**Operator ruling, 2026-09-24:** keep it that way — *"no - i like that the llm costs are lower. it also help finetune what needs to be supported"*. A line that only the model could build is a grammar gap worth seeing.

**Why:** lower cost, and playing without the model exposes what the deterministic grammar is missing.

**How to apply:** never copy `.env.local` into a worktree or offer to. On a play sheet, a case that can only pass through the model must say "PR ports have no model — expect «לא הבנתי»" or be played on prod instead. Before diagnosing "did not escalate", read `logs/debug-log*.jsonl` timing ([[dev-log-has-his-exact-run]]).
