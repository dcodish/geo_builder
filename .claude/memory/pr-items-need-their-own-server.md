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

**Cleanup half (learned 2026-08-26, hit twice in one session):** a TaskStop'd/killed vite can leave a
zombie `node` that still LISTENS on the port (serving 404s from a deleted worktree) and holds a file
handle that makes `git worktree remove` / `rm -rf` fail with "Device or resource busy". Before reusing
a port or blaming vite: `Get-NetTCPConnection -LocalPort <p> -State Listen` → `Stop-Process` the PID.
Never pipe the dev server through `| head` in a background command — the closed pipe kills vite at
startup while npm exits 0, which reads as "server up" when nothing is listening.

**Identity half (2026-09-16, the worst version yet):** with `--strictPort`, a launch onto a port a
LEFTOVER server already holds dies instantly — and that leftover answers `curl` with **200**. Four
ports were reported "curl-checked, 200" while all three PR launches had failed with `Port NNNN is
already in use` in a log nobody read; the operator played a stale tree from a previous session and
reported T1/T2 as broken. The feature was fine.

- **Kill first.** Before launching a play server, `Get-NetTCPConnection -State Listen` over the whole
  range and `Stop-Process` anything squatting — old sessions leave servers running for days.
- **Read the launch log**, not the HTTP status. `already in use` / `error when starting` ⇒ failed.
- **Verify IDENTITY, never liveness.** Fetch a module from the running server and grep a string that
  exists ONLY on that branch (a new identifier such as `bareAngleMark`, a new i18n key, a file main
  does not have), plus a NEGATIVE control on `main` proving the string is absent there. A 200 proves
  something is listening, not that it is yours — the same class as [[gate-lines-are-read-not-matched]].
