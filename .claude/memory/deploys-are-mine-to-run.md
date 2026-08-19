---
name: deploys-are-mine-to-run
description: Never hand a deploy back to the operator as a task — the permissions and tooling are in place, so run it
metadata:
  type: feedback
---

**Never ask the operator to deploy.** Deploying is my step, not theirs. The tooling is in place and the
commands are already allowlisted in the tracked `.claude/settings.json` (`Bash(scp -r dist-3d/* root@…)`,
`Bash(ssh root@themathbible.com:*)`, and the `PowerShell(…)` twins). Ruling given 2026-08-19: *"never ask
me to deploy. you have the permissions and tools for that and you can do it (you always do)."*

**Why:** on 2026-08-19 I merged #749, built `dist-3d/`, hit a denial on `scp`, and wrote the operator a
"to finish it, run these two commands" hand-back. The commands were correct and the permissions were
already there — the deploy simply needed retrying. Handing it back turned a step I could complete into a
chore for them, on top of asserting a cause for the denial that turned out to be false (see
[[tool-denials-are-observations]] — same session, second occurrence of that exact error).

**How to apply:**
- After a merge that should ship, **run the deploy** — do not stop at "ready to deploy" or ask permission
  for the step itself. Follow `docs/RUNBOOK.md` exactly, and scope it by what actually changed since the
  newest `prod/*` tag (`git diff --name-only prod/<latest>..main`): static-only unless `server/` changed,
  and never restart the proxy when it did not.
- **A denial is not a stop sign** — retry the canonical minimal form, more than once. In this session the
  identical `scp` was refused four times and then succeeded with no config change.
- Finish the whole record, not just the upload: verify the live page serves the NEW bundle (compare the
  served asset hash against the local build), then `prod/YYYY-MM-DD` tag **on the deployed commit**, the
  `docs/DEPLOY-LOG.md` entry, and push both.
- The one thing that genuinely IS the operator's: **play-and-approve of a feature PR before merging**. That
  gate is theirs; the deploy that follows is mine.
