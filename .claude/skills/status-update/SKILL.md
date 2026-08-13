---
name: status-update
description: The operator's STANDARD issue-queue report — open issues grouped P1/P2/P3 and split by product (2d/3d/server/workspace), bugs vs features vs debt distinguished, a value indicator and a complexity/risk grade per issue, the full ATTENTION surface (decisions waiting on the operator, fix plans awaiting auto-ok, PRs awaiting play-and-approve, fix-round output awaiting validation), and a recommended composition for the next fix round. Use this whenever the operator asks for a list of issues, the open queue, project status, "what's open", "what should we fix next", "מה המצב", what needs their attention, a status update, or wants to plan the next fix session — even if they don't say "status-update" by name.
---

# Status update — the standard issue-queue report

One report shape, every time, so the operator can compare across days and decide the next round in
minutes. The report is built live from the GitHub queue (never from memory or a cached list), and the
value/complexity grades come from the rubrics below so two sessions grade the same issue the same way.

## Step 1 — pull the live queue

```sh
gh issue list --state open --limit 200 --json number,title,labels,updatedAt,url
gh pr list --state open --json number,title,headRefName,updatedAt,url
```

For grading you also need the bodies of issues you don't already know. Fetch them in bulk (one call,
not N):

```sh
gh issue list --state open --limit 200 --json number,body
```

Classify each issue from its labels: priority `P1`/`P2`/`P3` (an unlabeled priority is a triage bug —
report it in a "mislabeled" line rather than guessing), type `bug`/`feature`/`debt`, product
`2d`/`3d`/`server`/`workspace`, and the attention labels: `needs-operator` (blocked on a decision),
`auto-ok` (plan approved for `/fix-round`), `in-round` (a fix round executing NOW — or, with no
session running one, crashed mid-flight; ADR-W-013), `awaiting-play` (fix-round output not yet
validated).

## Step 2 — grade each issue

Grade from the issue body (they carry root causes and fix plans per docs/17 — use them). One line of
justification per grade, short enough to fit a table cell.

**Value (what fixing it buys) — H / M / L:**
- **H** — a prod honesty/correctness violation (the tool asserts or hides something it shouldn't);
  real prod users hitting it (log-triage demand counts, when the issue cites them); or it BLOCKS other
  scheduled work or an operator workflow.
- **M** — a real input that visibly fails or a missing capability the bagrut corpus needs; a workflow
  improvement the operator asked for.
- **L** — polish, internal debt, perf that isn't user-visible, audits.

**Complexity/Risk — S / M / L, with the risk named:**
- Size from the issue's own measured surface when it has one (e.g. "67 dispatch sites, 6 files"), else
  from the layer: a parser rule or i18n string is **S**; a store/App plumbing change is **S–M**; an
  engine mechanism is **M**; anything touching the solver, the sampler, or a cross-cutting gate is
  **L** — grade the RISK separately from the size, and say what the risk is (e.g. "solver: branch
  selection can shift — #518 took three full-suite calibrations"). A one-line fix in a risky layer is
  still risky.

## Step 3 — render the report

Use exactly this structure (omit an empty section with one line saying it's empty — an empty P1
section is information, not clutter):

```markdown
# Issue queue — YYYY-MM-DD

Open: N (P1: n / P2: n / P3: n) · bugs n · features n · debt n
Attention: needs-operator n · plans awaiting auto-ok n · PRs awaiting play n · rounds in flight n · rounds awaiting play n
Prod: <current prod tag> · undeployed on main: <none | short list>

## P1 — drop everything
| # | Product | Type | Title (shortened) | Value | Complexity/Risk |

## P2 — real input fails visibly
(one table like the above, rows sorted: 2d, then 3d, then server/workspace)

## P3 — polish / debt, batched
(same table shape)

## Waiting on you
(the full attention surface, in four sub-lists — every row one sentence, readable without opening
the issue; omit an empty sub-list with a one-line "none")

### Decisions
### Plans awaiting your auto-ok
### PRs awaiting play-and-approve
### Fix-round output awaiting validation

## Recommended next round
```

**The "Waiting on you" section** is the one the operator acts on immediately — it is the whole
reason the report exists as a habit. Its four sub-lists:

1. **Decisions** — `needs-operator`-labeled issues PLUS any issue whose body or your comments
   explicitly pose an unanswered operator question (a ruling, an A/B choice, a scope decision) —
   the label lags reality, so scan for the questions, and add the label where it's missing
   (`gh issue edit N --add-label needs-operator`) so the queue converges on the truth.
2. **Plans awaiting your `auto-ok`** — open issues that carry a concrete fix plan (root cause +
   mechanism + files, per docs/22 §2b), are not `needs-operator`, and are not yet `auto-ok`'d:
   the candidates that feed `/fix-round`. One row each: #, the plan's gist, complexity grade.
   Blessing a plan is a 30-second read — surface it so the round never starves silently. An
   issue with NO plan is not a candidate; it belongs in the tables, flagged per the honesty rule.
3. **PRs awaiting play-and-approve** — every open PR (`gh pr list`): finished, unplayed work
   (ADR-W-007). One row: PR#, what it delivers, which issues it closes.
4. **Fix-round output awaiting validation** — open issues labeled `awaiting-play`: each is a
   round's play sheet the operator has not yet worked through (closing it is the validation
   signal — see the fix-round skill). An open **`in-round`** issue also lands here, flagged
   loudly: unless a round is running right now, it is a round that died mid-flight — its
   ledger body says which items landed before the crash and which never resolved.

**The recommendation** is a concrete next-round composition, not a restatement of the tables:
- Every open P1 goes first, always, each with one line on why it can't wait.
- Then a **mix** of P2 and P3 — the operator explicitly wants both, not a pure-P2 diet. Aim for
  2–3 P2s that form a coherent theme (same module or mechanism — shared context makes a batch cheaper
  than its parts) plus 1–2 quick P3 wins riding along. Say WHY this particular mix: theme affinity,
  an operator ruling already given (an unblocked, scoped issue beats an unscoped one), value density
  (H-value S-complexity first), or risk isolation (don't put two L-risk solver items in one round).
- Name what you deliberately deferred and why, in one line — the operator should see the shape of the
  choice, not just its result.
- **Close with the one-reply arming line** (ADR-W-014): tell the operator that replying "approved"
  (or "approved, but swap X for Y") arms exactly this composition — you then apply `auto-ok` to the
  named issues **in the same turn**, each with an audit comment quoting the approval and its date,
  and confirm the queue state back. Approval must be explicit and name/accept THIS batch — silence,
  enthusiasm, or old prose approvals in issue bodies arm nothing. An operator edit ("also add #N")
  is part of the approval; transcribe it as given.

## Grounding rules

- Never grade from the title alone; titles compress, bodies carry the diagnosis.
- If the queue disagrees with something the session believes (an issue you thought closed is open, or
  vice versa), the queue wins — note the discrepancy instead of "correcting" the report.
- Value/complexity are YOUR assessment, clearly presented as such — the operator overrides freely, and
  an override stated in their reply is worth recording on the issue (`gh issue comment`).
- The report is a terminal deliverable: keep every table cell short (the justification is one clause,
  not a paragraph), and put anything long in the issue, not the report.
