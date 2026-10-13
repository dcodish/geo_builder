---
name: browser-probes-hit-live-llm
description: a Playwright probe against the local dev server sends unparsed lines to the LIVE Anthropic API unless it launches through scripts/lib/browser-harness.mjs
metadata:
  node_type: memory
  type: feedback
  originSessionId: 417a7a59-a268-4817-9e91-ea4b709ffad6
  modified: 2026-10-09T06:50:18.526Z
---

The dev server's `llmProxyPlugin` (vite.config.ts → server/llmProxy.ts) answers `POST /api/parse` with a live
Anthropic call whenever `.env.local` holds a key, and it has no cache. Any browser automation that types a line
the deterministic parser does not handle — `scripts/play-sheet-drive.mjs`, `visual-smoke.mjs`, an ad-hoc probe —
therefore makes a live call, which CLAUDE.md rule 2 forbids without the operator's approval. On 2026-10-09 a
triage probe made 18 such calls before this was noticed (visible as `"source":"llm"` rows in `logs/debug-log*.jsonl`).

**Why:** rule 2 — only the operator authorises a live call; the harness gives no warning.
**How to apply:** since #1955 (ADR-W-127) launch every probe with `launchBrowser()` from `scripts/lib/browser-harness.mjs`.
It stubs `/api/parse` on every context, and a guard test fails on any other `playwright` import. The dev proxy also
answers a headless browser as keyless, so a probe that bypasses the harness is refused (`[geo-llm-proxy] refused a
model call from a headless browser` in the server log). A headed probe that bypasses the harness is the one remaining
way to make a live call.
