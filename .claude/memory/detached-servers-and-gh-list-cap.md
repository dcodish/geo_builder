---
name: detached-servers-and-gh-list-cap
description: "Play-sheet dev servers must be launched detached (Start-Process), not in a background Bash; gh issue list silently caps at 30 rows unless --limit is passed"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 2120f1ab-597d-4775-937c-bf2e1d90345b
  modified: 2026-09-13T19:23:44.841Z
---

Two mechanics that bit round #1001 (2026-09-13):

1. **A dev server started in a background Bash dies at the tool's timeout** (max 10 min), and piping it
   through `head` does not help. Launch each play-sheet server detached from PowerShell —
   `Start-Process -FilePath node -ArgumentList "node_modules\vite\bin\vite.js --port NNNN --strictPort"
   -WorkingDirectory <worktree> -WindowStyle Hidden` — then curl-check `localhost:NNNN` and
   `Get-NetTCPConnection -LocalPort NNNN` to confirm the owning PID and its start time. Port 5173 was
   already held by a vite process rooted at the shared tree, which serves the new `main` after a
   fast-forward on its own.
2. **`gh issue list` returns 30 rows by default.** The round's composition query listed 30 `auto-ok`
   issues and silently dropped five older ones (#155, #148, #65, #64, #4), so the ledger's not-picked
   list was short until finalization. Always pass `--limit 200` (or `--limit 500`) on any listing that
   feeds a composition, a digest, or a "what's open" answer.

**Why:** both are silent failures — the server "was running" during the session and vanished before the
operator played; the not-picked list looked complete and was not.

**How to apply:** at Step 6 of `/fix-round` start servers with `Start-Process`; at Step 1 (and in
`/status-update`, `/decisions`) put `--limit 200` on every `gh issue list` / `gh pr list`. See also
[[pr-items-need-their-own-server]], [[vite-binds-ipv6-localhost]], [[gate-lines-are-read-not-matched]].
