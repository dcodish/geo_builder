---
name: vite-binds-ipv6-localhost
description: "A vite dev server here listens on [::1], so a readiness poll against 127.0.0.1 never connects and 5173–5180 are usually held by stale servers — poll \"localhost\" (or curl) and pick a high port"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 09d2d2c7-4829-4e9a-a337-9ec8831ea6e8
  modified: 2026-09-11T12:10:16.765Z
---

On this machine `npx vite --port N` binds **`[::1]:N` only** (IPv6 localhost). A Node `net.connect(N, '127.0.0.1')`
readiness poll therefore times out while `curl http://localhost:N/` answers 200 — three Playwright drive attempts
died on that in round #992 (2026-09-11). Also, ports **5173–5180 are routinely held by stale dev servers** from
earlier sessions (`netstat -ano | grep LISTENING`), so `--strictPort` on a low number fails with "already in use".

**Why:** the harness CAN drive the real app (see [[no-browser-self-test]]), but only if the server it drives is
the one it thinks it is — a 404 from a stranger's server on the expected port looks like "the app is broken".

**How to apply:** start the worktree's server on a high port (5197+), `curl -s -o /dev/null -w '%{http_code}'`
it before driving, and in any Node poll connect to `'localhost'`, never `'127.0.0.1'`. Kill by PID from
`netstat -ano` when a port must be reclaimed. Keep one port per unmerged PR ([[pr-items-need-their-own-server]]).
