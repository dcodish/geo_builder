# 22 — Project Workflow (issues → PRs → main → deploy)

**Status: ADOPTED 2026-07-10 ([ADR-265](06-decisions.md#adr-265)).** This is the standard operating route for every request, bug report, and change. It wraps — never replaces — the existing doctrine: root-cause discipline ([17-design-rules.md](17-design-rules.md)), the scenario rule (every diagnosed bug → `scenarios.test.ts` + [test-scenarios.md](test-scenarios.md)), ADRs ([06](06-decisions.md)/[06b](06b-decisions-3d.md)), and the definition-of-ready gate ([08-testing-strategy.md](08-testing-strategy.md)).

## 1. The single tracker: GitHub Issues

Every operator report and feature request becomes a **GitHub issue** on `dcodish/geo_builder` — *filed first, even when it will be fixed in the same session*. The issue is the queryable record ("what's known-broken? what's queued?") that ADR prose and chat can't provide.

**File with `gh issue create`.** Body format:

```
**Reported:** <date> (<session id from debug-log / prod events, if any>)
**What was typed / asked:** <exact utterance(s) or request>
**Expected:** …
**Actual:** …
**Evidence:** <debug-log line / prod events / screenshot ref>
**Class hypothesis:** <per docs/17 — what family is this a member of?>
**Links:** ADR-NNN, related issues
```

**Labels** (create-once, see §6): one *type* — `bug` | `feature` | `debt`; one *priority* — `P1` | `P2` | `P3`; one *app* — `2d` | `3d` | `server`; plus `needs-operator` when blocked on an operator decision.

**"Filed, not fixed" items in ADRs must also become issues** — an ADR sentence is documentation, an issue is a queue entry. (The historical backlog in [14-backlog.md](14-backlog.md) and ADR prose was partially migrated at adoption; sweep opportunistically.)

## 2. Priority rubric

- **P1 — production correctness / honesty.** A figure that renders wrong while looking right, a silently dropped given, a crash, data loss, prod down. **Drop everything**; fix before any other work; hotfix may land directly on `main` (gates still apply); deploy promptly.
- **P2 — a real input fails visibly.** An honest refusal/escalation on something students genuinely type, a common phrasing gap, a verifier-amber that should be green. Scheduled by **measured demand** (log-triage counts beat intuition — see the `/log-triage` skill).
- **P3 — polish / perf / internal debt.** Batched; picked up when the P1/P2 queue is quiet.

Honesty violations outrank capability gaps: a wrong figure teaches a student something false; a refusal only inconveniences them.

## 3. The bug route (operator reports something broken)

1. **File the issue** (§1) — before or in parallel with diagnosis, never "after, if I remember."
2. **Diagnose per [docs/17](17-design-rules.md)** — reproduce from `logs/debug-log.jsonl` / prod events through the real `parse → replay` path; identify the *class*, not the instance.
3. **Reclassify honestly:** if diagnosis shows a *missing capability* rather than a defect, relabel `bug` → `feature` and switch to the feature route (§4) — do not silently build new capability under a bug's banner.
4. **Fix at the root** — ADR entry; unit test + the exact-utterance scenario in `scenarios.test.ts` + index in [test-scenarios.md](test-scenarios.md); full suite + `tsc -b` + build green.
5. **Land it:** small/contained fixes commit **directly to `main`** with `Fixes #NN` in the message (auto-closes the issue). Large, risky, or multi-session fixes go through a PR (§4 steps 4–6).
6. Status/docs updates as today (CLAUDE.md current-state, PROJECT-MEMORY session log).

## 4. The feature route (new capability — always a PR)

Applies to feature requests **and** bug reports reclassified as capability gaps.

1. **File the issue** labeled `feature` + priority.
2. **Scope with the operator** before building anything non-trivial (the ADR-262 pattern — AskUserQuestion rounds; big things get a plan doc first, like docs/18/20).
3. **Branch:** `feat/<issue#>-<slug>` (fixes that go the PR route: `fix/<issue#>-<slug>`). Prefer a **git worktree** for the branch when the shared Dropbox tree carries another session's work (§7).
4. **Build** under the normal gates (ADR, tests, scenario/fixture, suite + `tsc` + build green).
5. **Open the PR** with `gh pr create` — title `feat: <what> (ADR-NNN)`, body: what/why, the ADR link, `Closes #NN`, test evidence. CI must pass.
6. **Operator gate:** the operator plays with it (dev server / screenshots) and approves; then merge to `main` (squash or merge-commit, either is fine; keep `Closes #NN`).
7. Deploy from `main` when ready (§5).

## 5. Main, deploys, and the deploy log

- **`main` is the trunk** — always green (CI), always deployable. `rebuild-foundation` is retired; sessions work on `main` + topic branches. *(Migrated 2026-07-10: main fast-forwarded to the rebuild-foundation head.)*
- **Deploy only committed state** from `main`, following **[RUNBOOK.md](RUNBOOK.md)**. The old habit of deploying an uncommitted working tree is retired — commit (or PR-merge) first, so every prod bundle is reconstructable.
- **Every deploy gets:** a git tag `prod/YYYY-MM-DD[-n]` on the deployed commit, **and** an entry in **[DEPLOY-LOG.md](DEPLOY-LOG.md)** (date, tag, commit, which app(s), bundle hash, one-line what-changed). The deploy log is canonical — PROJECT-MEMORY no longer accumulates deploy entries (a session-log line may reference the tag).
- Why it matters here specifically: log-triage re-runs prod utterances against HEAD, silently assuming prod ≈ HEAD; the tag + log make "what is actually live?" answerable (the ADR-115 "stale dev server" class, prod edition).

## 6. One-time GitHub setup (done at adoption)

Labels: `P1` (red) `P2` (orange) `P3` (yellow) · `bug` `feature` `debt` · `2d` `3d` `server` · `needs-operator`. CI already runs on every push and PR (`.github/workflows/ci.yml`). Branch protection on `main` is optional (solo repo; CI is the real gate) — revisit if collaborators join.

## 7. Concurrency rules (the Dropbox reality)

The repo's `.git` syncs between two PCs via Dropbox, and parallel Claude sessions share one working tree. Rules that keep the new flow safe:

- **Commit before switching contexts** — an uncommitted tree is invisible to the other PC's git and rides along into anyone's commit.
- **Never `git checkout` a different branch in the shared tree while it carries another session's uncommitted work** — use a **worktree** (`git worktree add`) for topic branches instead; the shared tree stays on `main`.
- **One session = one concern** — a session's commits should map to one issue/PR so `Fixes #NN` stays honest.
- Push after every commit (GitHub is the real backup; Dropbox corrupts `.git` — see PROJECT-MEMORY operational notes).

## 8. Where each artifact lives (quick map)

| Event | Record |
| --- | --- |
| Request / bug report | GitHub issue (type + priority + app labels) |
| Decision | ADR in [06](06-decisions.md) / [06b](06b-decisions-3d.md) |
| New capability | FR line in [02-requirements.md](02-requirements.md) (existing rule) + `feature` issue + PR |
| The fix itself | commit/PR with `Fixes #NN`, root cause in the message |
| Regression lock | scenario in `scenarios.test.ts` + [test-scenarios.md](test-scenarios.md) (+ fixture where natural) |
| Deploy | tag `prod/…` + [DEPLOY-LOG.md](DEPLOY-LOG.md) entry, per [RUNBOOK.md](RUNBOOK.md) |
| Session narrative | [PROJECT-MEMORY.md](PROJECT-MEMORY.md) session log (unchanged) |
| Status / resume pointer | [09-implementation-plan.md](09-implementation-plan.md) + CLAUDE.md (unchanged) |
