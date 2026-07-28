---
name: test-server-on-fix-ready
description: Never ask the operator to test anything without first starting the server and giving the URL plus the exact cases to type
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 37aeea55-dbe9-442d-a749-4712c96b6f5a
  modified: 2026-07-28T16:51:29.742Z
---

Whenever I put the operator at the keyboard — reporting a fix as done, walking them through PRs waiting
for play-and-approve, or asking them to confirm anything in the app — they must be able to play it
immediately. Before saying it: start the dev server (`npm run dev`, background), confirm it is serving,
and give them **the URL** (http://localhost:5173/ by default — dev serves at the root, not
`/geo-builder/`; 3-D is `/3d.html` on the same server) plus **the concrete cases**: the exact utterances
to type, what to look for, and any before/after comparison worth making (prod runs the previous deploy,
so it is a free "before"). If the code to play lives on a branch, rebase and serve it — never hand them
a branch name and a list of utterances.

**Why:** they asked for this on 2026-07-27, after a fix was reported green and they had to ask both
"how would I test this" and "what server do I use". They restated it more broadly on 2026-07-28 when I
walked them through four waiting PRs with utterances but no running server: *"we have a rule — you never
just tell me to test something without telling me where to test (you start a server for me) and what to
test."* Tests green is my gate, not theirs — anything they cannot play is not something they can accept.

**Format the cases for COPY-PASTE — one utterance per line, nothing else on the line.** They asked for
this on 2026-07-28: *"when you give me test cases, i need them line by line for copy paste."* So put each
scenario in a fenced code block with one utterance per line, in the order to type them. Never join steps
with arrows (`A → B → C`), never bury an utterance inside prose or a table cell, never add commentary,
quotes, bullets, or numbering on the utterance line — every one of those has to be hand-stripped before
it can be pasted into the app. Put the "what to look for" in prose above or below the block, not inside it.

**How to apply:** the `Stop` hook `scripts/ensure-test-server.mjs` enforces the reporting-a-fix case — it
reads the message I just wrote, and if it announces a finished fix while nothing is listening on
5173–5176 it blocks the turn and hands the instruction back. Treat a block as the reminder working, not
an obstacle. It fails open on any error, so it can nag but never wedge a session. The hook only catches
the fix-is-done phrasing, so the wider rule (any "go try this") is mine to keep. Also: check the server
is not STALE — a vite process older than the current HEAD will lie to them (a "crash" once turned out to
be a server predating the fix). And never rebase or switch branches under a server they are actively using:
on 2026-07-28 branch surgery mid-session hot-swapped pre-fix modules into their open tab, and they reported
a working feature as broken. Do the git work first, or restart and tell them to hard-reload. The whole gate lives in the repo (script + `.claude/settings.json`), so
it travels to the other machine. Related: [[readiness-gate]], [[commit-means-push]],
[[triage-only-during-testing]].
