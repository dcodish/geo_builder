---
name: worktree-node-modules-junction
description: Never junction/symlink node_modules into a git worktree — `git worktree remove` follows it and destroys the shared tree's node_modules
metadata:
  type: feedback
---

Do **not** create a `node_modules` junction (`mklink /J`) or symlink from a git worktree to the main tree's `node_modules`. `git worktree remove --force` follows the link and deletes the **target's** contents — it wrecked `C:\projects\geo_builder\node_modules` on 2026-07-30 (`.bin` emptied, `npx tsc` stopped resolving), and it half-fails ("Invalid argument"), so the damage is silent until the next command fails.

**Instead:** run `npm install` inside the worktree (costs disk, not correctness), or work in the main tree on a branch when it is clean.

**If it already happened:** `cmd //c rmdir <worktree>\node_modules` removes a junction *without* following it — never `rm -rf`. Then `npm ci` in the main tree. `npm ci` will fail on a locked `.node` binary if any vite dev server is running from that tree; stop the servers on 5173–5176 first (`netstat -ano | grep LISTENING`, then `taskkill /PID <pid> /T /F`), then retry.

Related: [[check-branch-before-editing]], [[test-server-on-fix-ready]].
