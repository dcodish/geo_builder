---
name: commit-means-push
description: In geo_builder, "commit" means commit AND push to GitHub — don't make the operator ask for the push separately.
metadata:
  type: feedback
---

When the operator says "commit" in the geo_builder project, do BOTH `git commit` and `git push` to the GitHub remote (`dcodish/geo_builder`) — treat them as one action, don't wait for a separate "push" instruction. Trunk is `main`.

**Why:** the operator confirmed (2026-06-24) they consider "commit" and "push" the same thing. The rationale got *stronger* after the project left Dropbox (2026-07-23): GitHub is now the only channel between the home PC and the work PC, so an unpushed commit is invisible on the other machine and unbacked-up anywhere. See [[work-pc-cross-machine]].

**How to apply:** after any `git commit` the operator asked for, immediately `git push origin <branch>` without prompting. Still surface the result. A SessionEnd hook also pushes committed work as a safety net, but it is a net, not a substitute — push explicitly.
