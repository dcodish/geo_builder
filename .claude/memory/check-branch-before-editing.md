---
name: check-branch-before-editing
description: The shared tree may sit on a play/* branch mid-session — verify the checked-out branch before editing; build fixes in a main worktree
metadata:
  type: feedback
---

Before editing any file in `C:\projects\geo_builder`, check `git log --oneline -1` / `git status -sb` — the shared tree is often switched to a `play/YYYY-MM-DD*` branch (feature-PR merge branches the operator plays against) and is NOT necessarily on `main`, even when the session-start snapshot said so.

**Why:** on 2026-07-29 a bug-fix edit landed on `play/2026-07-29b` mid-session (the branch was switched between my read and my edit); committing there would have entangled a main-bound fix with unmerged feature branches and disturbed the operator's live play server.

**How to apply:** for bug fixes while the shared tree is on a play branch, `git worktree add "$TMPDIR/claude/geo-wt/<name>" main`, junction `node_modules` into it (`New-Item -ItemType Junction`), do all work + commits there, and run the fix's dev server on a free port (5175+) so the play servers on 5173/5174 keep serving the operator. Related: [[work-pc-cross-machine]], [[commit-means-push]].
