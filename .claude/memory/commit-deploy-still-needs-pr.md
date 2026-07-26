---
name: commit-deploy-still-needs-pr
description: An operator "commit and deploy" waives only the play-and-approve gate — feature/fix work still goes through a PR (self-merged immediately) for tracking.
metadata:
  type: feedback
---

Operator ruling (2026-07-11, after the issue-queue fix session went straight to `main`): "even if I say commit+deploy — a PR must be written for future tracking."

**Why:** the PR is the permanent tracking record — a reviewable diff, a CI run, and a discussion anchor per feature — even when nobody reviews it before merge. Direct commits to `main` lose that record.

**How to apply:** when the operator authorizes immediate commit+deploy, build on a `feat/<issue#>-slug` (or `fix/...`) branch, `gh pr create` with `Closes #NN`, **self-merge immediately**, then deploy from `main`. Only the operator's play-and-approve step is skipped. Codified in the repo at docs/22-workflow.md §4. See [[never-patch-fix-root]] for the sibling fixing discipline and [[commit-means-push]] for push.
