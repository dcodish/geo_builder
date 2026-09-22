---
name: test-commands-watch-and-buffer
description: "test:2d/test:3d sit in WATCH mode so a backgrounded run never completes, and piping a long run through Select-Object buffers until it wedges — redirect to a file and read the log"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: ab08da99-e9fb-42f8-9782-b9ed283c09b5
  modified: 2026-09-22T19:07:52.315Z
---

Two ways a test run stalls the session without failing, both hit in the 2026-09-22 fix round:

1. **The per-product lanes watch.** `npm run test:2d` (and its siblings) end in `PASS Waiting for file changes...` and never exit. Backgrounded, the task never completes and no notification ever arrives — the run was green for minutes while the session sat waiting on it. `test:full` and `test:docs` do exit; the lanes do not.
2. **`| Select-Object -Last N` buffers the whole stream.** It holds every line until the pipeline ends, so on a long run it looks identical to a hang, and a `test:complex` run had to be killed with `TaskStop` after producing no output at all.

**Why:** both failures present as "still running". There is no error to notice, so the natural response is to keep waiting — which is exactly the wrong one, and it costs minutes per occurrence in a session that runs the suite many times.

**How to apply:** redirect to a file and read the file — `npm run test:2d > /tmp/lane.log 2>&1` then `tail` it — rather than piping a long run through a formatter. For a lane, expect to `TaskStop` it once the log shows the totals line; the verdict is in the log, not in the exit. And per [[gate-lines-are-read-not-matched]], read the totals line either way: a wedged pipe and a green run are indistinguishable from the outside.

Related: [[gate-lines-are-read-not-matched]], [[detached-servers-and-gh-list-cap]].
