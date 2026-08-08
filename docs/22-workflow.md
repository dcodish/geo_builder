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

**Labels** (create-once, see §6): one *type* — `bug` | `feature` | `debt`; one *priority* — `P1` | `P2` | `P3`; one *app* — `2d` | `3d` | `server`; plus `needs-operator` when blocked on an operator decision.

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

Fixing happens in **dedicated fix sessions**: the operator opens one and picks issues off the queue by priority (`gh issue list` sorted P1→P3). Only then do the bug route (§3 steps 4–6) / feature route (§4 steps 3–7) run.

**Exceptions:** (a) the operator explicitly says to fix/build it *now* in this session; (b) a **P1 prod-down / honesty emergency** — drop-everything still applies, but say so before starting.

## 3. The bug route (operator reports something broken)

Steps 1–3 run in the reporting session; steps 4–6 run **only in a dedicated fix session or on an explicit "fix now"** (§2b).

1. **File the issue** (§1) — before or in parallel with diagnosis, never "after, if I remember."
2. **Diagnose per [docs/17](17-design-rules.md)** — reproduce from `logs/debug-log.jsonl` / prod events through the real `parse → replay` path; identify the *class*, not the instance.
3. **Reclassify honestly:** if diagnosis shows a *missing capability* rather than a defect, relabel `bug` → `feature` and switch to the feature route (§4) — do not silently build new capability under a bug's banner.
4. **Fix at the root** — ADR entry; unit test + the exact-utterance scenario in `scenarios.test.ts` + index in [test-scenarios.md](test-scenarios.md); full suite + `tsc -b` + build green.
5. **Land it:** small/contained fixes commit **directly to `main`** with `Fixes #NN` in the message (auto-closes the issue). Large, risky, or multi-session fixes go through a PR (§4 steps 4–6).
6. Status/docs updates as today (CLAUDE.md current-state, PROJECT-MEMORY session log).

## 4. The feature route (new capability — always a PR)

Applies to feature requests **and** bug reports reclassified as capability gaps. Steps 1–2 run in the reporting session; building (steps 3–7) starts **only in a dedicated session on operator go** (§2b).

1. **File the issue** labeled `feature` + priority.
2. **Scope with the operator** before building anything non-trivial (the ADR-262 pattern — AskUserQuestion rounds; big things get a plan doc first, like docs/18/20).
3. **Branch:** `feat/<issue#>-<slug>` (fixes that go the PR route: `fix/<issue#>-<slug>`). Prefer a **git worktree** for the branch when the shared Dropbox tree carries another session's work — created **outside Dropbox** under `"$TMPDIR"/claude/geo-wt/<branch>`, never as a sibling in `Dropbox/projects/` (§7).
4. **Build** under the normal gates (ADR, tests, scenario/fixture, suite + `tsc` + build green).
5. **Open the PR** with `gh pr create` — title `feat: <what> (ADR-NNN)`, body: what/why, the ADR link, `Closes #NN`, test evidence. CI must pass.
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

| | 2-D Geo Builder | 3-D Space Builder | Shared server |
| --- | --- | --- | --- |
| **Source** | `src/` | `src3d/` | `server/` |
| **Entry / build** | `index.html` · `npm run build` → `dist/` | `3d.html` · `npm run build:3d` → `dist-3d/` | `npm run build:proxy` → `dist-server/` |
| **Prod path** | `/geo-builder/` | `/3d-builder/` | proxy service `:8788` |
| **ADR log** | [06-decisions.md](06-decisions.md) (`ADR-NNN`) | [06b-decisions-3d.md](06b-decisions-3d.md) (`ADR-3D-NNN`) | in 06 (repo-wide/infra ADRs also live here) |
| **Plan / status** | the [06](06-decisions.md) tail + `gh issue list` ([20](20-space-vectors-tool.md)/[09](09-implementation-plan.md) for background) | the [06b](06b-decisions-3d.md) tail + `gh issue list` | RUNBOOK.md |
| **Orientation file** | [CLAUDE.md](../CLAUDE.md) | [src3d/CLAUDE.md](../src3d/CLAUDE.md) | in the root CLAUDE.md |
| **Issue label** | `2d` | `3d` | `server` |
| **Tests (local)** | `npm run test:2d` (= `vitest src/ server/`) | `npm run test:3d` (= `vitest src3d/ server/`) | runs in **every** lane |
| **CI lane** | `test-2d` | `test-3d` | both |
| **Fixtures** | `src/__tests__/fixtures/` | `fixtures3/` | — |
| **Save-file suffix** | `-geo` (`<name>-geo.json`, ADR-274) | `-vectors` (`<name>-vectors.json`, ADR-3D-036) | — |

Planned products (recommendation accepted 2026-07-10): **analytic geometry** — the 471 (4-pt) + 572 (5-pt) analytic-geometry questions as ONE engine with curriculum-level profiles (`src-analytic/`, ADR log `06c-decisions-analytic.md`, ids `ADR-AG-NNN`, label `analytic`); **complex numbers** (`src-complex/`, ADR log `06d-decisions-complex.md`, ids `ADR-CX-NNN`, label `complex`).

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
