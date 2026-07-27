---
name: test-server-on-fix-ready
description: A fix is not "done" until a dev test server is already running and the operator has the URL plus concrete test cases
metadata:
  type: feedback
---

When reporting a fix as complete or ready, the operator must be able to play it immediately. Before
saying done: start the dev server (`npm run dev`, background), confirm it is serving, and give them
**the URL** (http://localhost:5173/ by default — dev serves at the root, not `/geo-builder/`) plus
**the concrete test cases for that fix**: the exact utterances to type, what to look for, and any
before/after comparison worth making (prod still runs the previous deploy, so it is a free "before").

**Why:** they asked for this on 2026-07-27, after a session where a fix was reported green with the
suite passing and they then had to ask both "how would I test this" and "what server do I use". Tests
green is my gate, not theirs — a fix they cannot play is not a fix they can accept, and the gap between
"committed" and "playable" was landing on them every time.

**How to apply:** the `Stop` hook `scripts/ensure-test-server.mjs` enforces it — it reads the message I
just wrote, and if it announces a finished fix while nothing is listening on 5173–5176 it blocks the turn
and hands the instruction back. Treat a block as the reminder working, not an obstacle: start the server,
then reply with URL + cases. It fails open on any error, so it can nag but never wedge a session. The
whole gate lives in the repo (script + `.claude/settings.json`), so it travels to the other machine.
Related: [[readiness-gate]], [[commit-means-push]], [[triage-only-during-testing]].
