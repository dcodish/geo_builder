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
4. **Stale-round gate:** an open issue labeled `in-round` means a previous round is executing
   or died mid-flight → STOP and report it with its ledger state; the operator decides whether
   to close it, resume it, or fold its remnants into this round. Never open a second live round.

## Step 1 — compose the round

```sh
gh issue list --state open --label auto-ok --json number,title,labels,body,url
```

Eligible = `auto-ok` AND a concrete fix plan in the body/comments AND not `needs-operator`.
An `auto-ok` issue with no real plan is a labeling error: record it in the ledger's Skipped
section, leave a comment asking for triage, skip it — never invent the plan inline.

- **Bundle** issues sharing one root cause or mechanism into a single work item (the plans say
  so when it's true — same class, same chokepoint). Bundling is encouraged when it is the right
  fix shape; the cap below never forbids a correct bundle.
- **Cap: 3–5 work items** per round (a bundle counts as ONE item). Priority order P2 → P3
  within eligibility; value density (per the /status-update rubric) breaks ties.
- **Announce the composition** — one line per item (issues, plan gist, route bug/feature) —
  before any code. This is the round's contract; anything not listed is not touched.
- **Open the round issue NOW, not at the end** ([ADR-W-013](../../../docs/06w-decisions-workspace.md)) —
  it is the round's live ledger, and creating it before any code makes a crashed session
  discoverable instead of leaving orphaned pushed commits:

  ```sh
  gh issue create --title "fix-round YYYY-MM-DD: <n> items (<#s>)" \
    --label workspace --label in-round --body-file <composition.md>
  ```

  Initial body: the announced composition verbatim (per item: issues, plan gist, route), **plus
  every eligible `auto-ok` issue NOT picked and why** (cap, no plan, `needs-operator`) — so
  "why wasn't #N in this round?" is answerable later. The `in-round` label means *executing now
  or died mid-flight*; a session that finds an open `in-round` issue at start reports it instead
  of starting a new round.

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
4. **Commits reference the round:** every item commit carries `Fixes #NN` AND mentions the
   round issue (`round #RR`) — from any commit you can find the round, from the round every
   commit.

## Step 3 — land per the existing routes

- **Fetch before every landing.** If `origin/main` has moved beyond the round's own landings
  (the other PC pushed mid-round), STOP landing and reconcile — report, don't silently rebase
  over external movement. The round's own earlier landings are the only movement it absorbs
  unannounced.
- **Bugs/debt:** merge the item branch into `main` (rebase on latest `main` first if earlier
  items landed), commit message states the root cause and carries `Fixes #NN` + `round #RR`.
  **Push immediately** (commit ⇒ push). Remove the worktree after merge.
- **Features** (including bugs reclassified as capability gaps): `gh pr create` with
  `Closes #NN`; the PR body carries what/why, the ADR link, test evidence, and the play
  instructions (Hebrew utterances). **The round never merges a PR** — play-and-approve is the
  operator's gate.
- If a later item's full-suite run breaks an earlier item's scenario, stop landing and
  reconcile before any push — never push a red combination.
- **Update the ledger as each item resolves** — landed (SHA), PR'd (PR#), escalated, or
  skipped, appended to the round issue body (`gh issue edit --body-file`) with the item's
  evidence lines (Step 5 format). The ledger never lies about progress: an item is recorded
  when it resolves, not remembered for the end.

## Step 4 — the escalation exit (the never-patch guard)

Escalate — do not patch — when any of these hits:

- the plan's stated root cause turns out wrong or incomplete;
- the correct fix outgrows the plan's scope (new mechanism, cross-layer reach, an operator
  ruling needed);
- two serious attempts leave the gates red.

Escalating means: comment the docs/17 escalation template on the issue (what the plan said,
what the code showed, the options with costs), swap labels `auto-ok` → `needs-operator`, drop
the worktree, record it in the ledger (issue → why, one line), move to the next item. An
escaped item is a GOOD outcome — it is the mechanism working. The stats line (Step 5) is what
accumulates the escalation rate across rounds; it is the data the Phase-2 (unattended runs)
landing-policy decision needs (#543).

## Step 5 — finalize the round issue: ledger → play sheet + validation marker

Fixes auto-close their issues on push, so the round issue (opened in Step 1) is the ONE
durable artifact. Finalize its body (`gh issue edit --body-file` + verify, per docs/22 §1) and
**swap labels `in-round` → `awaiting-play`** — the swap is what marks execution finished.

Final body, in order:

- **Composition** — the Step-1 contract kept verbatim (planned items + not-picked list), so
  plan-vs-outcome is readable without the session chat.
- **Landed** — per item: issue → commit SHA · **ADR id(s)** · a one-line **gate record**
  (full suite at which commit, test counts, `tsc`/build) · a required
  **"deviations from plan:"** line — `none`, or what and why. Writing that line honestly is
  itself a tripwire: a deviation you struggle to justify in one line was an escalation.
- **In PRs** — issue → PR#, same evidence lines.
- **Escalated** — issue → why, one line each (the template lives on the issue itself).
- **Skipped** — anything eligible the round did not resolve (labeling errors, mid-round
  drops), with the reason. Chat-only skips under-report the round.
- **The play sheet** — per item: the exact utterances to type **in Hebrew**, one per line in
  a code block, what to look for, and the before/after note (prod runs the previous deploy —
  a free "before").
- **The stats line**, exactly this machine-greppable form, always last:
  `stats: picked=N landed=N prs=N escalated=N skipped=N`
  — the Phase-2 landing-policy decision (#543) aggregates these by listing round issues,
  never by re-reading prose.

The operator plays, files normal issue reports for anything wrong, and **closes the round
issue when done** — that close is the validation signal. `/status-update` reads open
`awaiting-play` issues as the validation queue and open `in-round` issues as a round
executing now or crashed mid-flight.

## Step 6 — readiness gate (standing rule 5)

The final message: dev server already running, the URL (`http://localhost:5173/` — root, not
`/geo-builder/`), the play sheet inline (the round issue is the durable copy), the escalation
list, and honest gate results. Tests green is our gate, not the operator's.

## What a round NEVER does

Pick anything without `auto-ok` · write a fix plan for an unplanned issue · merge a feature PR
· deploy · take a P1 silently · run over a dirty/behind tree · keep a symptom patch to avoid
an escalation · exceed the announced composition mid-round (found new work → file an issue) ·
land over unreconciled external `origin/main` movement · leave outcomes, deviations, or skips
out of the ledger (chat is not a record) · finish with the `in-round` label still on.
