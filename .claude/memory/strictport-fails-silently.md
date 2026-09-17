---
name: strictport-fails-silently
description: "A dev server launch with --strictPort dies silently when a stale server holds the port; curl 200 then proves nothing — verify the served build by IDENTIFIER, not status code"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 0c4db279-1eb4-4175-a02b-5c7a07d2e526
  modified: 2026-09-17T14:38:43.363Z
---

`Start-Process … vite --port N --strictPort` **exits silently** when port N is already held. The
stale server keeps answering, `curl` returns **200**, and the readiness check passes — while the
operator plays against code from a previous session.

This happened on 2026-09-17 to all three servers of rounds #1169/#1173 at once: the processes
answering 5173/5174/5175 had been started the previous day and at 00:58/01:06 that morning by earlier
sessions. The operator reported "T11 still shows the old message" and T13 likewise — both fixes were
correct on disk and green through the real submit path. A whole test pass was wasted.

**Why:** old worktrees leave live vite processes behind for days, and this project's ports (5173–5176)
are a small, reused pool.

**How to apply:** before handing over ANY play sheet —

1. `Get-CimInstance Win32_Process -Filter "Name='node.exe'"`, match `vite.js --port`, and read
   **`CreationDate`**. A start time older than this session means it is not yours. Kill it.
2. Start the server, then verify by **content**: fetch a module and grep for an **identifier** the
   new build introduces (`DISPLAY_ONLY`, `fmtAnalytic`, `assumedParallel`).
   **Vite strips comments during TS→JS transform**, so a docblock phrase always greps 0 and looks
   like a failure — the marker must be code.
3. Assert the NEGATIVE control too: `main`'s server must NOT serve an identifier that exists only on
   an unmerged branch. That is what proves two servers are really different trees.

A status code proves a port is open. It never proves whose build is behind it — see also
[[detached-servers-and-gh-list-cap]] and [[pr-may-ship-mid-pass]].
