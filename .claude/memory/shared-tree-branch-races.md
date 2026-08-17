---
name: shared-tree-branch-races
description: "Re-verify the shared tree's branch IMMEDIATELY before every write git op there — a parallel session can switch it mid-flight (a 2026-08-13 ff-merge landed on another session's feature branch)"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: a822a2f5-6af6-476b-ae68-7d43e510e8f1
  modified: 2026-08-17T14:01:55.530Z
---

On 2026-08-13 an `ff-merge to main` ran in the shared tree minutes after the branch had been verified —
but a PARALLEL operator session had meanwhile switched the tree to its own feature branch, so the merge
landed on **their branch** and had to be surgically undone (their uncommitted work survived only because
the touched files didn't overlap).

**Why:** CLAUDE.md's "check which branch the shared tree is on before editing" is a session-START habit;
in long sessions the check goes stale the moment another session runs. The state can change between any
two of your own commands.

**How to apply:** any WRITE git operation in `C:\projects\geo_builder` (merge, commit, reset, push of a
ref you didn't just create) must re-verify branch + cleanliness in the SAME guarded compound as the
operation — e.g. `test "$(git branch --show-current)" = "main" && git merge --ff-only …` — or better,
avoid the shared tree entirely: land on main by pushing the gated branch (`git push origin
<branch>:main`) and fast-forwarding the local ref via `git fetch . <branch>:main`. See
[[work-pc-cross-machine]].

**Second instance, new mechanism (2026-08-17):** the Bash tool's cwd RESETS to the project root at
turn boundaries — a session working in a worktree composed a commit there, the turn ended (background
task notification), and the next turn's `git add -A && git commit` ran against the SHARED tree
instead; only the same-compound branch guard refused it. So the guard rule covers a second race:
your own cwd, not just a parallel session. **Worktree git ops always use explicit
`git -C <worktree-path>` — never rely on Bash cwd persisting across turns.**
