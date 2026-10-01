---
name: git-stash-is-shared-across-worktrees
description: "refs/stash is ONE stack for every worktree of the repo — parallel agents using `git stash` for a fails-before check pop each other's work; use a temp copy or `git diff > patch` instead"
metadata:
  node_type: memory
  type: feedback
  originSessionId: ebe6e910-268c-424d-bcb3-e1fff465749b
  modified: 2026-10-01T17:21:33.194Z
---

`git stash` is not per-worktree: `refs/stash` belongs to the repository, so every worktree pushes onto and pops from the SAME stack. On 2026-10-01 (#1619 phase B, three parallel agents in three worktrees) two agents ran `git stash push` two seconds apart for their fails-before checks and each `pop` restored the OTHER agent's changes into its own tree; one noticed and swapped them back, the other verified byte-identity against its stash commit before committing.

**Why:** the fails-before check (stash the fix, run the new test, restore) is a standard step in every agent brief, and parallel worktrees are the standard way phase work is split ([[shared-tree-branch-races]] is the same class one level up: shared git state mutated by concurrent sessions).

**How to apply:** when more than one worktree is active, never use `git stash` in a brief or by hand. For a fails-before check, save the change as a patch (`git diff > ../x.patch`, `git checkout -- <paths>`, run, `git apply ../x.patch`) or test against a temporary copy. Put this line in every parallel agent's brief. After any stash incident, verify each tree against its own commit/patch before committing.
