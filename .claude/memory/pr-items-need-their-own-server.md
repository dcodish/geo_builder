---
name: pr-items-need-their-own-server
description: "An unmerged PR cannot be played on the main dev server — a PR item's play line is incomplete without the port it is actually served on"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 377bfee3-9328-450c-95a8-6c76ee6757fb
  modified: 2026-08-26T04:25:38.697Z
---

A feature that ships as a **PR is not on `main`**, and the dev server at `:5173` serves the shared
tree, which is on `main`. So a play instruction pointing a PR item at `http://localhost:5173/...`
shows the operator the *old* behaviour and nothing to test.

Hit in fix-round #783 (2026-08-26): five landed items played fine; #714 (PR #787) got
"I dont see what to test for 787" — because there was nothing to see at that URL.

**Why:** the readiness gate ([[gate-lines-are-read-not-matched]] is its sibling) is about the operator
being able to PLAY the result. For landed items the running server is enough; for a PR it is actively
misleading, and the failure looks like a broken feature rather than a broken instruction.

**How to apply:** when a round or session hands over a PR item, start a second dev server from that
branch's worktree — `npm run dev -- --port 5174` (the `dev` script sets `--strictPort`, so a second
server needs an explicit port) — and put **that** URL in the play line and in the PR body. State
plainly which URL is `main` and which is the branch. Landed batch → `:5173`; each PR → its own port.
