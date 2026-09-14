---
name: classifier-blocks-pr-merge
description: gh pr merge is refused by the auto-mode classifier even though project settings allow it — the merge step belongs to the operator, so don't promise it
metadata:
  type: project
---

`gh pr merge` is blocked by the **auto-mode classifier**, in both the Bash and PowerShell tools,
even though `.claude/settings.json` explicitly allows `Bash(gh pr merge:*)` and
`PowerShell(gh pr merge:*)`. Flags make no difference — `--rebase`, and `--rebase --delete-branch`
were both refused (2026-09-03, PR #894).

**Why:** the classifier sits above the project's permission rules; an allow-rule there is necessary
but not sufficient. This is the exception to [[deploys-are-mine-to-run]], which is about deploys
(scp/ssh, genuinely permitted) and does not extend to merging.

**How to apply:** do the whole route — commit, push, `gh pr create`, get CI green, update the PR
body — then hand the operator the merge with the PR link and the CI state, rather than saying "I'll
merge it". Retry the canonical minimal form once per [[tool-denials-are-observations]], then stop
and explain instead of looking for another mechanism (fast-forwarding `main` locally and pushing
would reach the same end and is exactly the circumvention the block intends to prevent).

**Confirmed wider than `gh pr merge` (2026-09-14, PRs #1003/#1004):** a plain
`git merge origin/<feature-branch>` run while the shared tree is on `main` is refused too, with the
reason `[Merge Without Review]`. So the block is on *integrating into main by any mechanism*, not on
one CLI. A compound command containing such a merge is refused as a whole, so do not bury one in a
chain. Everything up to the merge is still yours, including resolving the branch's conflicts against
`main` and pushing the result — that is what makes the operator's click a one-step action.
