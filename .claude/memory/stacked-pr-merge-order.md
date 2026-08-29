---
name: stacked-pr-merge-order
description: "Deleting a stacked PR's base branch auto-closes the next PR, and a closed PR cannot be reopened or retargeted while its base is missing — restore the ref first"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: e0db1da6-0bdf-4904-bdd7-fb1e918a7771
  modified: 2026-08-29T14:20:13.505Z
---

When merging a STACK of PRs (`#804 → #805 → #806 → #809`, round #800), never pass
`--delete-branch` until the whole stack has landed. GitHub closes any PR whose base branch is
deleted, so deleting the stack base takes the next PR down with it — and a closed PR can be
neither reopened nor retargeted while its base branch is missing (`gh pr reopen` fails with
"Could not open the pull request"; `gh pr edit --base` fails with "Cannot change the base branch
of a closed pull request").

**Recovery:** push the deleted tip back (`git push origin <sha>:refs/heads/<branch>`), then
`gh pr reopen N`, then `gh pr edit N --base main`, then merge. The sha is still in the local
object store — read it from `git for-each-ref refs/remotes/origin` output captured earlier, or
`git reflog`.

**Correct order:** merge base → retarget the next PR to `main` (`gh pr edit N --base main`) →
resolve its conflict against the new `main` in a worktree → push → merge → repeat. Delete every
branch at the end, in one pass, after confirming no open PR targets any of them.

**Why:** rounds stack PRs whenever they append to the same ADR tail or snapshot files, so this
recurs every round that ships more than one feature in a tree. The conflicts themselves are
usually only `reports/test-tiers.json` ([[gate-lines-are-read-not-matched]] applies — read the
conflict, do not assume it is source).

**How to apply:** before the first `gh pr merge` of a round, list the stack and its bases
(`gh pr list --json number,baseRefName,headRefName`); merge in dependency order with NO
`--delete-branch`; clean up branches only once `gh pr list` returns empty.
