---
name: vite-binds-ipv6-localhost
description: "A vite dev server here listens on [::1], so a readiness poll against 127.0.0.1 never connects — poll \"localhost\" (or curl). Prefer 5173 when free: the Stop hook only checks 5173-5176 and a high port makes it report \"no server\" every turn"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 09d2d2c7-4829-4e9a-a337-9ec8831ea6e8
  modified: 2026-09-15T10:00:00.000Z
---

On this machine `npx vite --port N` binds **`[::1]:N` only** (IPv6 localhost). A Node
`net.connect(N, '127.0.0.1')` readiness poll therefore times out while `curl http://localhost:N/`
answers 200 — three Playwright drive attempts died on that in round #992 (2026-09-11).

**Also `npx` does not start under `Start-Process`** — it exits immediately and the port never opens.
Launch with `node node_modules/vite/bin/vite.js --port N --strictPort` instead, which does detach and
outlives the tool call ([[detached-servers-and-gh-list-cap]]).

**CORRECTED 2026-09-15.** The old note said 5173–5180 are "routinely held by stale servers" and to
pick a high port. Measured this session, **5173–5176 were all free**. Meanwhile
`scripts/ensure-test-server.mjs` (the Stop hook) checks **only 5173–5176**, so a server on 5291 makes
it report "NO dev test server is running" on every single turn — a false alarm that costs a
correction each time and trains the session to ignore a guard that is usually right.

**Why:** the harness CAN drive the real app (see [[no-browser-self-test]]), but only if the server it
drives is the one it thinks it is — and a hook that cries wolf every turn is worse than no hook.

**How to apply:** try **5173 first** and only move up if it is genuinely taken (`curl` it — do not
assume). `curl -s -o /dev/null -w '%{http_code}'` before driving, and in any Node poll connect to
`'localhost'`, never `'127.0.0.1'`. Keep one port per unmerged PR
([[pr-items-need-their-own-server]]); when several are needed, put the one the operator plays on 5173
so the hook sees it. Kill by PID from `netstat -ano` to reclaim a port.
