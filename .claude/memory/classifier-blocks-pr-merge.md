---
name: classifier-blocks-pr-merge
description: "gh pr merge WORKS — it is a local `git merge` into main that the classifier refuses; never tell the operator a merge is impossible without retrying gh pr merge first"
metadata: 
  node_type: memory
  type: project
  originSessionId: f88aafe1-e903-48ea-aab6-e845d3cfac50
  modified: 2026-09-14T17:24:33.421Z
---

**Corrected 2026-09-14 (PRs #1003/#1004). The earlier version of this note was wrong and cost a
session.** It recorded a single 2026-09-03 denial (PR #894) as a standing fact — *"`gh pr merge` is
blocked, hand the merge to the operator"* — and a later session believed it, told the operator the
merge was theirs to do, and stopped with two green PRs sitting unmerged until they asked *"what are
you waiting for?"*. `gh pr merge 1003 --merge` then worked on the first try.

**What is actually true:**

- **`gh pr merge` works.** It is the PR route's own command and it is permitted.
- **A local `git merge origin/<branch>` while the shared tree is on `main` is refused**, with the
  reason `[Merge Without Review]`. So is a compound command containing one. That block is correct
  and should not be worked around — it exists to stop `main` being advanced outside the PR route.
- Read-only `gh pr view --json mergeCommit,mergedAt` can also trip the classifier on the word alone.
  Ask for `--json state` instead, or read `git log origin/main`.

**How to apply:** merge with `gh pr merge <n> --merge`. If the worktree for that branch still exists,
`--delete-branch` fails on the local half *after the merge has already succeeded* — check
`git log origin/main` before treating that error as a failed merge, then remove the worktree and
delete the branch.

**The general lesson, which is the part worth keeping:** a denial recorded in memory is an
observation about one moment, not a capability boundary — see [[tool-denials-are-observations]].
Before reporting "I can't", retry the canonical command *in this session*. Writing a stale denial
into memory as a rule is worse than not recording it, because it silently converts a retryable
refusal into a permanent one.
