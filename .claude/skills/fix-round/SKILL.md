---
name: fix-round
description: Execute a batch of operator-approved (auto-ok) fix plans autonomously — pick 3–5 work items off the queue by priority, fix each at the root in its own worktree under the full gates, land bugs on main and features as PRs, escalate instead of patching when a plan fails contact with the code, and finish with ONE round issue (awaiting-play) carrying the batch play sheet. Use when the operator says to run a fix round, "run the loop", clear the queue, or work through the auto-ok'd issues. Never run uninvoked, and never as a substitute for triage — it executes plans, it does not write them.
---

# Fix round — autonomous execution of triaged, operator-approved fix plans

The round automates ONE stage of the pipeline: fix execution. Intake (log-triage + operator
reports), triage (root-cause diagnosis + fix plan written into the issue, docs/22 §2b), and
validation (the operator plays the result) keep their owners. The premise that keeps the
never-patch rule intact: **the round executes plans a triage session already root-caused — it
never improvises a diagnosis to keep the loop moving.** When a plan fails contact with the code,
the round escalates and skips (Step 4); skipping always beats patching.

## Step 0 — preconditions (abort, don't improvise)

1. **Tree state:** the shared tree must be on `main`, clean, and up to date with `origin/main`
   (`git fetch` + compare). Behind origin → pull `--ff-only` first; dirty or on a branch →
   STOP and report (another session's work; never checkout over it).
2. **Cross-machine check:** if memory or the operator has flagged uncommitted work on the other
   PC, do not run — report why and stop.
3. **P1 gate:** any open P1 → STOP and announce it. A fix round never picks up a P1 silently;
   the operator decides whether the round becomes a P1 session.

## Step 1 — compose the round

```sh
gh issue list --state open --label auto-ok --json number,title,labels,body,url
```

Eligible = `auto-ok` AND a concrete fix plan in the body/comments AND not `needs-operator`.
An `auto-ok` issue with no real plan is a labeling error: report it in the round summary,
leave a comment asking for triage, skip it — never invent the plan inline.

- **Bundle** issues sharing one root cause or mechanism into a single work item (the plans say
  so when it's true — same class, same chokepoint). Bundling is encouraged when it is the right
  fix shape; the cap below never forbids a correct bundle.
- **Cap: 3–5 work items** per round (a bundle counts as ONE item). Priority order P2 → P3
  within eligibility; value density (per the /status-update rubric) breaks ties.
- **Announce the composition** — one line per item (issues, plan gist, route bug/feature) —
  before any code. This is the round's contract; anything not listed is not touched.

## Step 2 — execute each item, isolated

Sequential, one item at a time (parallel items in one tree overwrite each other):

1. **Worktree per item**, outside the repo: `"$TMPDIR"/claude/geo-wt/<branch>`, branch
   `fix/<issue#>-<slug>` (or `feat/<issue#>-<slug>`), branched from current `main`. Run
   `npm install` in the worktree — NEVER link or copy `node_modules` (`git worktree remove`
   follows junctions and destroys the shared tree's copy).
2. **Follow the issue's fix plan** under full docs/17 discipline: class-level fix, chokepoint
   registry, no special-casing the reported input.
3. **Per-item gates, no exceptions:** ADR entry in the product's log; per-fix unit test; the
   regression lock per standing rule 4 (fixtures-first — a `.geo.json` fixture when the essence
   is "builds green and verifies", a scenario in the LAST corpus chunk when a bespoke assertion
   is needed); `npm run test:full` green; `tsc -b` + build clean.

## Step 3 — land per the existing routes

- **Bugs/debt:** merge the item branch into `main` (rebase on latest `main` first if earlier
  items landed), commit message states the root cause and carries `Fixes #NN`. **Push
  immediately** (commit ⇒ push). Remove the worktree after merge.
- **Features** (including bugs reclassified as capability gaps): `gh pr create` with
  `Closes #NN`; the PR body carries what/why, the ADR link, test evidence, and the play
  instructions (Hebrew utterances). **The round never merges a PR** — play-and-approve is the
  operator's gate.
- If a later item's full-suite run breaks an earlier item's scenario, stop landing and
  reconcile before any push — never push a red combination.

## Step 4 — the escalation exit (the never-patch guard)

Escalate — do not patch — when any of these hits:

- the plan's stated root cause turns out wrong or incomplete;
- the correct fix outgrows the plan's scope (new mechanism, cross-layer reach, an operator
  ruling needed);
- two serious attempts leave the gates red.

Escalating means: comment the docs/17 escalation template on the issue (what the plan said,
what the code showed, the options with costs), swap labels `auto-ok` → `needs-operator`, drop
the worktree, move to the next item. An escaped item is a GOOD outcome — it is the mechanism
working. Track the round's escalation rate in the summary; it is the data the Phase-2
(unattended runs) landing-policy decision needs (#543).

## Step 5 — the round issue: durable play sheet + validation marker

Fixes auto-close their issues on push, so the round leaves ONE durable artifact
(`--body-file` + verify, per docs/22 §1):

```sh
gh issue create --title "fix-round YYYY-MM-DD: <n> items (<#s>)" \
  --label workspace --label awaiting-play --body-file <sheet.md>
```

Body: **landed** (issue → commit, one line each) · **in PRs** (issue → PR#) · **escalated**
(issue → why, one line) · **the play sheet** — per item: the exact utterances to type **in
Hebrew**, one per line in a code block, what to look for, and the before/after note (prod runs
the previous deploy — a free "before"). The operator plays, files normal issue reports for
anything wrong, and **closes the round issue when done** — that close is the validation
signal. `/status-update` reads open `awaiting-play` issues as the validation queue.

## Step 6 — readiness gate (standing rule 5)

The final message: dev server already running, the URL (`http://localhost:5173/` — root, not
`/geo-builder/`), the play sheet inline (the round issue is the durable copy), the escalation
list, and honest gate results. Tests green is our gate, not the operator's.

## What a round NEVER does

Pick anything without `auto-ok` · write a fix plan for an unplanned issue · merge a feature PR
· deploy · take a P1 silently · run over a dirty/behind tree · keep a symptom patch to avoid
an escalation · exceed the announced composition mid-round (found new work → file an issue).
