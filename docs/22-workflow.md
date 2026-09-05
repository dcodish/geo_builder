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

**Passing the body — write a file, then `--body-file`, then VERIFY.** `gh`'s `--body` takes a *literal string*: it has no stdin form, so `--body @-` (the `curl` / `gh api -f` idiom) silently files an issue whose entire body is the two characters `@-`, and `gh issue create` still exits 0 and prints a URL. This destroyed the root-cause diagnosis of six issues before it was noticed (#304, #307, #309, #361, #362, #363 — the four open ones were reconstructed from code on 2026-07-27; the diagnoses are gone). So:

```sh
# write the body to a real file first (scratchpad is fine), then:
gh issue create --title "…" --label bug --label P2 --label 2d --body-file /path/to/body.md
gh issue view <NN> --json body -q '.body' | head -3   # ← never skip: confirm it is not empty
```

A heredoc into `--body "$(cat <<'EOF' … EOF)"` also works. The verify step is the part that matters — a filing failure here is silent and costs the whole diagnosis.

**Labels** (create-once, see §6): one *type* — `bug` | `feature` | `debt`; one *priority* — `P1` | `P2` | `P3`; one *app* — `2d` | `3d` | `server`; plus `needs-operator` when blocked on an operator decision, `auto-ok` when the operator has approved the issue's fix plan for autonomous execution (§2d — operator-applied ONLY), `in-round` on a fix-round's round issue while the round executes (an open `in-round` issue with no session running it = a round died mid-flight — [ADR-W-013](06w-decisions-workspace.md)), and `awaiting-play` on the same issue from round-finish until the operator validates the batch (§2d).

**"Filed, not fixed" items in ADRs must also become issues** — an ADR sentence is documentation, an issue is a queue entry. (The historical backlog in [14-backlog.md](14-backlog.md) and ADR prose was partially migrated at adoption; sweep opportunistically.)

**Prod-log triage findings follow the same taxonomy:** the log-triage agent/skill classifies each cluster `bug` vs `feature` with a proposed priority, **files the `bug` clusters as issues immediately** (deduped against open issues), and holds `feature` clusters as recommendations — those are filed as issues only once the operator approves them for building (then built via the feature route, §4).

## 2. Priority rubric

- **P1 — production correctness / honesty.** A figure that renders wrong while looking right, a silently dropped given, a crash, data loss, prod down. **Drop everything**; fix before any other work; hotfix may land directly on `main` (gates still apply); deploy promptly.
- **P2 — a real input fails visibly.** An honest refusal/escalation on something students genuinely type, a common phrasing gap, a verifier-amber that should be green. Scheduled by **measured demand** (log-triage counts beat intuition — see the `/log-triage` skill).
- **P3 — polish / perf / internal debt.** Batched; picked up when the P1/P2 queue is quiet.

Honesty violations outrank capability gaps: a wrong figure teaches a student something false; a refusal only inconveniences them.

## 2b. Triage-first: a reported issue is QUEUED, never auto-fixed (operator directive, 2026-07-10 — ADR-265 Am. 1)

The operator raises issues **while testing**, often several per pass. If the reporting session starts fixing immediately, the operator is forced to feed one issue at a time and parallel fixes overwrite each other in the shared tree. So the reporting session's job is **triage, not repair**:

1. **File the issue** (§1) with type + priority + app labels.
2. **Diagnose to the class level** (per [docs/17](17-design-rules.md)): reproduce from the logs, find the root cause, classify `bug` vs `feature`, set the priority.
3. **Write the analysis into the issue** (a comment or the body): root cause, the class it belongs to, a concrete fix plan (mechanism, files, tests, blast radius), open questions for the operator.
4. **STOP — do not implement.** No branch, no code, no "it's a one-liner" exceptions. Reply to the operator with the classification + plan and move to the next report.

Fixing happens in **dedicated fix sessions**: the operator opens one and picks issues off the queue by priority (`gh issue list` sorted P1→P3), or invokes an autonomous **fix round** over operator-approved plans (§2d). Only then do the bug route (§3 steps 4–6) / feature route (§4 steps 3–7) run.

**Exceptions:** (a) the operator explicitly says to fix/build it *now* in this session; (b) a **P1 prod-down / honesty emergency** — drop-everything still applies, but say so before starting.

## 2c. The OPEN-ISSUES REPORT (#48, operator-approved 2026-07-11)

**Trigger.** The operator asks what is open / what is next / how to plan a building session. The answer is
this report, not a `gh issue list` dump — the queue is 60+ items, and an unordered dump moves the ranking
work onto the operator every time.

**Content.** All open issues, grouped by product label (`2d` / `3d` / `server` / workspace), one row each:

> `#NN · type · priority · one-line summary · complexity (S/M/L) · value note · blocked-on`

Complexity comes from the **issue's own fix plan** (S = a mechanism already exists and the fix is local;
M = a new mechanism or a cross-file change; L = a program of work, or a ruling is needed first). `blocked-on`
carries `needs-operator` and any dependency on another issue.

**Recommendation.** A proposed implementation ORDER with the rationale, sorted by:

1. **P1 first** — this band should be empty; a P1 preempts everything and is announced before work starts.
2. **Dependency order** — an issue whose fix plan builds on another's lands after it.
3. **Value per complexity** within a priority band — an S that closes a class beats an L that closes one input.
4. **Batchability** — issues sharing a root cause are proposed as ONE batch with a single gate run. Most of
   the P3 queue only ever pays for itself this way; that is why it accumulates otherwise.

State explicitly when two orderings are defensible and why one was picked.

**Honesty rule.** The report reflects the issues **as filed**. An issue missing its fix plan (a triage-first
violation, §2b) is FLAGGED as such rather than improvised into a plan inline — a plan invented at report time
has had none of the diagnosis the queue is supposed to carry.

**Route awareness.** The report says which rows can land directly on `main` (bug/debt) and which need a PR
plus the operator's play-and-approve (feature, §4). That distinction, not the priority, is usually what
decides how much can be closed in one session.

## 2d. The fix round: autonomous execution of `auto-ok`'d plans (#543/#544, operator-approved 2026-08-12 — [ADR-W-012](06w-decisions-workspace.md))

The operator-invoked batch loop that replaces one-at-a-time fix dispatch. Full procedure:
**`.claude/skills/fix-round/SKILL.md`**; the contract in one paragraph:

A round picks **5–8 work items**, hard ceiling 10 (a bundle of issues sharing one root cause counts as
one item; fewer is always fine — the band is not a quota — [ADR-W-028](06w-decisions-workspace.md), which
consumed the six-round measured escalation rate of 8% to replace ADR-W-012's untested Phase-1 3–5) from
the open issues labeled **`auto-ok`** — the label records an **operator approval** of the issue's fix
plan; `needs-operator` disqualifies. The approval is the operator's alone, but its *application* may be
transcription ([ADR-W-014](06w-decisions-workspace.md)): when a session has presented a concrete batch
(e.g. `/status-update`'s recommended round) and the operator replies with an explicit batch approval
("approved", "okay, fix 1/2/3", including swaps), the session applies `auto-ok` to exactly the named
issues and posts an **audit comment on each** quoting the approval and its date. **And since
[ADR-W-014 Am. 1](06w-decisions-workspace.md) (operator ruling 2026-08-13, "if an issue has a clear
plan, it should be auto-ok"): a CLEAR PLAN is itself the approval** — an issue whose body carries a
concrete, self-contained fix plan and no open operator question is armed at triage/status time with an
audit comment citing the ruling. What still disqualifies: `needs-operator`, any unanswered
ruling/scope question, and a plan that is a sketch with open options ("needs a scope call", "two
directions worth measuring", incomplete diagnosis). A bare `auto-ok` with neither an audit comment nor
the operator's own hand behind it remains a labeling error, not an eligibility. The round's ONE durable artifact, the **round issue**, is
opened **at composition time** (label `in-round` — [ADR-W-013](06w-decisions-workspace.md)) carrying
the announced composition plus the eligible-but-not-picked list, and is updated as each item resolves —
a live ledger, so a crashed session leaves a discoverable round rather than orphaned commits. Each item
is fixed **at the root, per its plan**, in its own worktree under the full gates (ADR + rule-4
regression lock + full suite + `tsc` + build). Bugs land on `main` (`Fixes #NN` + `round #RR`, §3)
after a fetch confirms `origin/main` has not moved externally mid-round; features become PRs the round
**never merges** (§4). A plan that fails contact with the code is **escalated, never patched**: the
docs/17 escalation template goes on the issue, `auto-ok` → `needs-operator`, and the round moves on —
and the **second** escalation in one round finalizes it (land what is done, the rest to Skipped), because
two stale plans in a round is a triage signal rather than something to grind through. More than ~2 items
on one chokepoint is composed into the next round instead, since they rebase over each other.
The round finishes by finalizing the round issue — per-item evidence (commit, ADR ids, gate record, a
required *deviations-from-plan* line), landed/PR'd/escalated/**skipped** sections, the batch play sheet
(Hebrew utterances per item, **split into batch/landed-on-`main` and individual/PR sections** — the PRs
were always played one at a time under §4, so only the landed half is genuinely a batch), and a machine-greppable
`stats: picked= landed= prs= escalated= skipped=` line (the Phase-2 data, aggregated by listing round
issues) — and swapping **`in-round` → `awaiting-play`**; the operator plays the batch in one sitting
and **closes the round issue as the validation signal**. Open P1s or a stale `in-round` issue stop a
round before it starts — a P1 is never taken silently, and there is never a second live round.
`/status-update`'s "Waiting on you" section surfaces the whole loop: plans awaiting `auto-ok`, PRs
awaiting play, rounds in flight, rounds awaiting validation.

**Gating and landing (ADR-W-034, operator ruling 2026-08-30):** each item is gated on `tsc`, build, its
product lane and its own locks; the FULL suite runs once per batch, on the merged staging tip, and the
batch lands on `main` in ONE push. Round #822 measured the per-item alternative at ~5 hours for 8 items.

**Phase 2 (not yet built, not yet decided):** scheduled unattended rounds and their landing policy
(bugs direct-to-main vs one-PR-per-round) wait on Phase 1's measured escalation rate ([ADR-W-012](06w-decisions-workspace.md)).
[ADR-W-028](06w-decisions-workspace.md) spent that data on the *cap* only — every round measured so far had
a human at the keyboard, so unattended running remains a separate risk argument.

## 3. The bug route (operator reports something broken)

Steps 1–3 run in the reporting session; steps 4–6 run **only in a dedicated fix session or on an explicit "fix now"** (§2b).

1. **File the issue** (§1) — before or in parallel with diagnosis, never "after, if I remember."
2. **Diagnose per [docs/17](17-design-rules.md)** — reproduce from `logs/debug-log.jsonl` / prod events through the real `parse → replay` path; identify the *class*, not the instance.
3. **Reclassify honestly:** if diagnosis shows a *missing capability* rather than a defect, relabel `bug` → `feature` and switch to the feature route (§4) — do not silently build new capability under a bug's banner.
4. **Fix at the root** — ADR entry; unit test + the exact-utterance scenario in `scenarios.test.ts` + index in [test-scenarios.md](test-scenarios.md); full suite + `tsc -b` + build green.
5. **Update the contract** ([ADR-W-041](06w-decisions-workspace.md#adr-w-041), §3b) — a fix that changes what the product PROMISES updates its requirements doc, one that changes HOW it is built updates its design doc, **in the same commit**. Most bug fixes restore a promise rather than change one, so most answer `none (internal)` — but the ADR must say so explicitly.
6. **Land it:** small/contained fixes commit **directly to `main`** with `Fixes #NN` in the message (auto-closes the issue). Large, risky, or multi-session fixes go through a PR (§4 steps 4–6).

*(A step here used to read "status/docs updates as today (CLAUDE.md current-state, PROJECT-MEMORY session log)". It is gone: [ADR-W-002](06w-decisions-workspace.md#adr-w-002) moved status OUT of CLAUDE.md — a guard test now rejects it — and PROJECT-MEMORY lags the ADR logs. The current-state homes are the ADR log tail, the issue queue and DEPLOY-LOG.)*

## 3b. The contract step: requirements and design ([ADR-W-041](06w-decisions-workspace.md#adr-w-041))

Both routes carry it, because the contract was the one artifact with **no home and no gate** — and it rotted while every other gate stayed green (887 commits, 216 of them `feat`, between two touches of `docs/02-requirements.md`). The hook is the ADR, not a checklist item, because an ADR is already mandatory and a test can read it.

**Every ADR carries two lines**, directly under its title:

```markdown
## ADR-NNN — <title> (#issue)

**Requirements:** FR-<area>-<n> (new) · FR-RV-1…7 (status → Realised)  |  none (internal)
**Design:** 04b §6 — the landing funnel gains a stage                  |  none (internal)
```

> Use the placeholder form `FR-<area>-<n>` (the convention [docs/02](02-requirements.md) itself uses), never a real-looking `FR-RN-NN`. The FR-resolution guard cannot tell an example from a claim, so a plausible-but-undefined id fails the suite — correctly, since a promise with no contract behind it is exactly what it catches. It fired on this template twice while it was being written: once on the example id, once on the sentence warning about the example id.

- **Requirements** changes when what the product **promises a student** changes: a new construct, a changed refusal, a new honesty guarantee, or an existing FR whose *status* is now wrong (a `(Later)` that shipped).
- **Design** changes when **how it is built** changes: a new module or layer, a new stage in the solve ladder, a moved boundary, a new shared surface.
- **`none (internal)` is a first-class answer and most ADRs use it.** A refactor, a perf fix, or a solver change behind an unchanged promise genuinely alters no contract. This matters: if an FR id were the only acceptable answer, sessions would invent FRs to pass the gate, and an inflated requirements doc lies with more words than a stale one.

**Which document** — [`DOCS.json`](../DOCS.json) is the registry (per product: requirements doc, design doc, or a `null` with the issue that will write it). The scheme mirrors the ADR logs: `02`/`02b`/`02c`/`02d` requirements and `04`/`04b`/`04c`/`04d` design, with **`02w`/`04w`** owning the shared surfaces (the `shell/` chrome, the admin dashboard, the ask lane) so they are written once rather than restated in four product docs.

**Enforcement.** `server/__tests__/docs-hygiene.test.ts` fails when an ADR at or above its log's cutoff is missing either line, when a cited `FR-*` resolves nowhere, when a product in `products.json` has no `DOCS.json` entry, or when `docs/README.md` omits a document. Cutoffs are set at each log's *current max + 1*, so no ADR ever has to be backfilled.

**The gate for a doc-only change is `npm run test:docs`** (~2 s), not the ~10-minute suite; anything touching `.ts`/`.tsx` pays `test:full`. `.github/workflows/docs.yml` runs the same gate in CI on the paths `ci.yml` ignores (#905).

## 4. The feature route (new capability — always a PR)

Applies to feature requests **and** bug reports reclassified as capability gaps. Steps 1–2 run in the reporting session; building (steps 3–7) starts **only in a dedicated session on operator go** (§2b).

1. **File the issue** labeled `feature` + priority.
2. **Scope with the operator** before building anything non-trivial (the ADR-262 pattern — AskUserQuestion rounds; big things get a plan doc first, like docs/18/20).
3. **Branch:** `feat/<issue#>-<slug>` (fixes that go the PR route: `fix/<issue#>-<slug>`). Prefer a **git worktree** for the branch when the shared Dropbox tree carries another session's work — created **outside Dropbox** under `"$TMPDIR"/claude/geo-wt/<branch>`, never as a sibling in `Dropbox/projects/` (§7).
4. **Build** under the normal gates (ADR, tests, scenario/fixture, suite + `tsc` + build green).
   **If the change touches a UI surface, the visual smoke is part of those gates**
   ([ADR-W-035](06w-decisions-workspace.md#adr-w-035)): `npm run dev` then
   `npm run smoke:visual -- --app <2d|3d|complex>` (add `--base http://localhost:PORT` for a PR on
   its own port, #783). The script drives the real app, captures the states the play sheet will ask
   the operator to check, and **fails on a blank capture, a refused line, or an uncaught page
   error** — then the session **reads the screenshots itself** and fixes or files what it sees.
   Passing the gate proves the captures are real, not that they are right; looking is still the job.
   Not CI (ADR-W-005) — a local gate, like `check:siblings`.
4b. **Update the contract** ([ADR-W-041](06w-decisions-workspace.md#adr-w-041), §3b) — a new capability almost always changes what the product PROMISES, so a feature that answers `none (internal)` on **both** lines should be re-read: either it is genuinely internal, or a promise is being made that nothing has written down. New FR ids go in the product's requirements doc; a new mechanism or layer goes in its design doc. Same commit as the code, same branch as the PR.
5. **Open the PR** with `gh pr create` — title `feat: <what> (ADR-NNN)`, body: what/why, the ADR link, `Closes #NN`, test evidence. CI must pass.
   For a UI-touching PR the body also carries **"screenshots reviewed by the session"** next to the
   test evidence, naming what was captured and what the session saw — the procedural line, like the
   sibling-safety one. The operator's play stays the acceptance judgment (does the design feel
   right); it stops being the first line of defence against mechanical breakage.
6. **Operator gate:** the operator plays with it (dev server / screenshots) and approves; then merge to `main` (squash or merge-commit, either is fine; keep `Closes #NN`).
7. Deploy from `main` when ready (§5).

**An operator "commit and deploy now" waives ONLY the play-and-approve gate (step 6), never the PR itself** (operator ruling, 2026-07-11: "even if I say commit+deploy — a PR must be written for future tracking"). In that mode: build on the branch as usual, open the PR, **self-merge immediately**, and deploy — the PR remains the permanent tracking record (reviewable diff, CI run, discussion anchor). Committing feature work directly to `main` is never the right reading of a deploy instruction. (The 2026-07-11 fix-session batch predates this ruling and went to `main` directly — commit `b54b155`; its tracking lives in the issues + ADRs 268–274.)

## 5. Main, deploys, and the deploy log

- **`main` is the trunk** — always green (CI), always deployable. `rebuild-foundation` is retired; sessions work on `main` + topic branches. *(Migrated 2026-07-10: main fast-forwarded to the rebuild-foundation head.)*
- **Deploy only committed state** from `main`, following **[RUNBOOK.md](RUNBOOK.md)**. The old habit of deploying an uncommitted working tree is retired — commit (or PR-merge) first, so every prod bundle is reconstructable.
- **Every deploy gets:** a git tag `prod/YYYY-MM-DD[-n]` on the deployed commit, **and** an entry in **[DEPLOY-LOG.md](DEPLOY-LOG.md)** (date, tag, commit, which app(s), bundle hash, one-line what-changed). The deploy log is canonical — PROJECT-MEMORY no longer accumulates deploy entries (a session-log line may reference the tag).
- Why it matters here specifically: log-triage re-runs prod utterances against HEAD, silently assuming prod ≈ HEAD; the tag + log make "what is actually live?" answerable (the ADR-115 "stale dev server" class, prod edition).

## 6. One-time GitHub setup (done at adoption)

Labels: `P1` (red) `P2` (orange) `P3` (yellow) · `bug` `feature` `debt` · `2d` `3d` `server` · `needs-operator`. The app-label set **grows with the workspace** — each new product (§9) gets its own label at creation (planned: `analytic`, `complex`); `server` doubles as the label for shared-infra / CI / workspace items. CI runs per-product lanes on every push and PR (`.github/workflows/ci.yml`, ADR-266). Branch protection on `main` is optional (solo repo; CI is the real gate) — revisit if collaborators join.

## 7. Concurrency rules (the Dropbox reality)

The repo's `.git` syncs between two PCs via Dropbox, and parallel Claude sessions share one working tree. Rules that keep the new flow safe:

- **Commit before switching contexts** — an uncommitted tree is invisible to the other PC's git and rides along into anyone's commit.
- **Never `git checkout` a different branch in the shared tree while it carries another session's uncommitted work** — use a **worktree** (`git worktree add`) for topic branches instead; the shared tree stays on `main`.
- **Worktrees and ALL scratch/temp working dirs live OUTSIDE Dropbox** — under the machine's OS temp, project-scoped: `"$TMPDIR"/claude/geo-wt/<branch>` for worktrees (derive the path from `$TMPDIR`/`%TEMP%`; never hardcode a `C:\Users\<name>\…` path), and the session scratchpad for loose scratch files. **Never create a worktree or temp dir as a sibling of the repo inside `Dropbox/projects/`, and never inside the repo tree.** Dropbox syncs everything to all three machines and leaves orphaned worktree shells (empty `node_modules`, stale `src/` copies, dangling symlinks) behind on `git worktree remove`/`prune` — that residue is dead weight on every machine and reads like garbage in the projects folder. Clean up with `git worktree remove` (or `git worktree prune` for stale registrations) when a branch is merged; if a temp dir ever *does* end up in Dropbox, delete the folder outright. `git worktree list` shows the live ones.
- **Never link or copy `node_modules` into a worktree.** `git worktree remove` follows the junction and destroys the **shared tree's** copy — a working tree that then fails to build for every other session. (Moved here from CLAUDE.md, which is at its size ceiling; this is the hazard's one home.)
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

## 9. The multi-product workspace (product registry — ADR-266)

This repo is **one workspace hosting several sibling products**. Every artifact in §8 is **per-product**: a request names (or implies) a product, and its issue label, ADR log, status section, CI lane, and deploy target all follow from that. When a session can't tell which product a request relates to, it asks — it never guesses across products.

### Registry

**The machine copy is [`products.json`](../products.json)** ([ADR-W-021](06w-decisions-workspace.md#adr-w-021)):
the shell switcher renders it as data, `server/__tests__/isolation.test.ts` cross-checks it against
`BOUNDARIES.json`, and `server/__tests__/registry-consistency.test.ts` asserts THIS table and
`ci.yml` stay in step with it — the table below is human commentary on the one authoritative roster.

| | 2-D Geo Builder | 3-D Space Builder | Complex Builder | Analytic Builder | Shared server |
| --- | --- | --- | --- | --- | --- |
| **Source** | `src/` | `src3d/` | `src-complex/` | `src-analytic/` | `server/` |
| **Entry / build** | `index.html` · `npm run build` → `dist/` | `3d.html` · `npm run build:3d` → `dist-3d/` | `complex.html` · `npm run build:complex` → `dist-complex/` | `analytic.html` · `npm run build:analytic` → `dist-analytic/` | `npm run build:proxy` → `dist-server/` |
| **Prod path** | `/geo-builder/` | `/3d-builder/` | `/complex-builder/` | `/analytic-builder/` | proxy service `:8788` |
| **ADR log** | [06-decisions.md](06-decisions.md) (`ADR-NNN`) | [06b-decisions-3d.md](06b-decisions-3d.md) (`ADR-3D-NNN`) | [06d-decisions-complex.md](06d-decisions-complex.md) (`ADR-CX-NNN`) | [06c-decisions-analytic.md](06c-decisions-analytic.md) (`ADR-AG-NNN`) | in 06 (repo-wide/infra ADRs also live here) |
| **Plan / status** | the [06](06-decisions.md) tail + `gh issue list` ([20](20-space-vectors-tool.md)/[09](09-implementation-plan.md) for background) | the [06b](06b-decisions-3d.md) tail + `gh issue list` | the [06d](06d-decisions-complex.md) tail + `gh issue list` ([27](27-complex-numbers-tool.md) for the plan) | the [06c](06c-decisions-analytic.md) tail + `gh issue list` ([19](19-analytic-geometry-tool.md) for the plan) | RUNBOOK.md |
| **Orientation file** | [CLAUDE.md](../CLAUDE.md) | [src3d/CLAUDE.md](../src3d/CLAUDE.md) | [src-complex/CLAUDE.md](../src-complex/CLAUDE.md) | [src-analytic/CLAUDE.md](../src-analytic/CLAUDE.md) | in the root CLAUDE.md |
| **Issue label** | `2d` | `3d` | `complex` | `analytic` | `server` |
| **Tests (local)** | `npm run test:2d` (= `vitest src/ server/`) | `npm run test:3d` (= `vitest src3d/ server/`) | `npm run test:complex` (= `vitest src-complex/ shell/ server/`) | `npm run test:analytic` (= `vitest src-analytic/ shell/ server/`) | runs in **every** lane |
| **CI lane** | `test-2d` | `test-3d` | `test-complex` | `test-analytic` | all |
| **Fixtures** | `src/__tests__/fixtures/` | `fixtures3/` | `src-complex/__tests__/fixtures/` | `src-analytic/__tests__/fixtures/` | — |
| **Save-file suffix** | `-geo` (`<name>-geo.json`, ADR-274) | `-vectors` (`<name>-vectors.json`, ADR-3D-036) | `-complex` (`<name>-complex.json`) | `-analytic` (`<name>-analytic.json`) | — |

**Complex numbers SHIPPED 2026-08-17** (`prod/2026-08-17-4`, the log-polar engine cutover — the row
above was added by [ADR-W-021](06w-decisions-workspace.md#adr-w-021) after this table had run a full
product behind reality, which is the drift the machine registry exists to kill). Planned, and
deliberately **last** (D5 ruling, [ADR-CX-001](06d-decisions-complex.md#adr-cx-001)): **analytic
geometry** — the 471 (4-pt) + 572 (5-pt) analytic-geometry questions as ONE engine with
curriculum-level profiles (`src-analytic/`, ADR log `06c-decisions-analytic.md`, ids `ADR-AG-NNN`,
label `analytic`). **Planned 2026-09-03** ([ADR-AG-001](06c-decisions-analytic.md#adr-ag-001)
through [ADR-AG-005](06c-decisions-analytic.md#adr-ag-005)) and **V0 in build** (#888): the tree is
registered in `BOUNDARIES.json`, the suite-conformance checklist is half of V0's acceptance gate
([ADR-AG-004](06c-decisions-analytic.md#adr-ag-004)), and the plan of record is
[docs/19](19-analytic-geometry-tool.md). **It is deliberately NOT DEPLOYED**
([ADR-AG-007](06c-decisions-analytic.md#adr-ag-007)): its registry entry carries `enabled: false`
(so no shipped builder links to it) plus `devOnly: true` (so it appears in its own switcher
locally), and it has no RUNBOOK row until the operator lifts the rule.

**Cross-product decisions** — ones belonging to no single product (this registry, the isolation rule, deploy topology, documentation structure) — go in [06w-decisions-workspace.md](06w-decisions-workspace.md) as `ADR-W-nnn`, under the issue label `workspace` ([ADR-W-001](06w-decisions-workspace.md#adr-w-001)). Pre-existing workspace decisions keep their original homes and ids: [ADR-266](06-decisions.md#adr-266) stays in the 2-D log, deliberately — over 200 ADR ids are referenced from docs and code comments, and stable anchors beat tidy filing.

**Orientation files carry no history or status** ([ADR-W-002](06w-decisions-workspace.md#adr-w-002)): CLAUDE.md and src3d/CLAUDE.md say what exists, where it lives, and what must never be done. A dated progress entry belongs in the ADR, which is the copy actually kept current; `server/__tests__/docs-hygiene.test.ts` enforces this in every CI lane.

### Isolation rules (operator authority — generalizes docs/20 §12)

- **`BOUNDARIES.json` (repo root) is the authority** ([ADR-W-003](06w-decisions-workspace.md#adr-w-003)): trees, layers, and every import edge with its rationale. `server/__tests__/isolation.test.ts` **reads** it — adding a product or an edge is a manifest edit, not a test edit, and the rule is never restated in two places that can drift.
- A product's source tree **never imports another product's tree** — patterns are **COPIED**, not shared. Exception: *within* one product family (e.g. the analytic tool's 471/572 levels) sharing is free — they are one product with profiles.
- The **shared server is the one deliberate sharing point** — parameterized by a `tool:` field (`server/parseHandler`, `handleLog`, admin `DashboardProfile`), never forked per product. It imports from BOTH product trees on purpose; that coupling is recorded in the manifest as an `allowed` edge, so it can never be mistaken for the violation it superficially resembles. A product never imports the server back — it talks to the proxy over HTTP.
- **Every directory carries a layer** — `engine` (reasons about points/lines/planes/DOF/constraints; copied, never shared), `lexicon` (vocabulary, noun→shape), `shell` (everything else). Classification is total: an unclassified directory fails the test. Whether a non-`engine` layer may be *physically* shared is deliberately undecided — see ADR-W-003's trigger. Before copying a file because the sibling tree has one like it, apply the copy tripwire ([17 §2](17-design-rules.md), item 8).
- **A diagnosed bug class is checked against the sibling product** and the answer stated in the ADR ([ADR-W-004](06w-decisions-workspace.md#adr-w-004)) — the products copy patterns by design, so they copy defects by design.
- The 2-D locale files, ADR logs, and status text of one product are never touched by another product's work.
- Full-suite runs (`npm run test:run`) remain the bar **before any deploy** and for changes to the shared surface; the per-product lanes are for the edit-push loop.

### Adding product N+1 (the sibling-app recipe)

1. Plan doc first (the docs/20 pattern: corpus audit → scope → decisions doc `06X-decisions-<tool>.md` with id prefix `ADR-<TOOL>-NNN`).
2. `src-<tool>/` + `<tool>.html` + `vite.config.<tool>.ts` (own `base`, own `dist-<tool>/`, **no `@` alias** — it maps to `src/`) + `npm run build:<tool>`.
3. GitHub label `<tool>`; a status section in CLAUDE.md (own section, like the 3-D one).
4. CI: add the product's exclusive paths to the `changes` classifier in `.github/workflows/ci.yml` + a `test-<tool>` lane (`vitest src-<tool>/ server/`); add `test:<tool>` npm scripts. **Until the classifier knows the new paths they fall in the uncategorized bucket and run all lanes — safe by default.**
5. Server: a `tool:` value + log sink + `DashboardProfile` in the shared proxy; Apache directives per RUNBOOK/deploy docs.
6. Extend `server/__tests__/isolation.test.ts` with the new tree.
