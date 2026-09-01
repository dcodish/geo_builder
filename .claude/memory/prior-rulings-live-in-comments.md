---
name: prior-rulings-live-in-comments
description: An issue body is written once and never revised — the ruling may be in a comment, and the WORK may already have shipped; verify against comments AND git before presenting anything as open
metadata:
  type: feedback
---

Issue bodies are written once at triage and never revised. Before surfacing an issue's "open
question" as undecided, check two things — the comments, **and the code**.

**1 — the ruling may already be in a comment.** On 2026-08-16 I presented #509's A/B/C options as
open and recommended B (the body's own recommendation). The operator replied *"I already said in the
past that option A is the right way to go."* The ruling existed; my report re-litigated it and pushed
the opposite answer.

**2 — the WORK may already have shipped, and comments alone will not tell you.** On 2026-08-25 I
listed #659 ("span accounting has been SHADOW-ONLY, blocked on unknown-word debt and a stale report")
as a live decision. Every clause was false: the flip merged 2026-08-19 (PR #759, ADR-453) and had
been in prod six days, the report was re-run, and the 76-word debt was zero — it had been three
matcher defects, not missing vocabulary. I had read the newest comment; it argued *for* the flip
(evidence from #779), so it read as still-pending. The announcement was an OLDER comment, and the
decisive proof was `git log -- <the module>`, which I only ran because a follow-up question made me
look again.

**3 — a LABEL you apply from the body can re-ask a settled question.** On 2026-09-01, in a
`/status-update` pass, I applied `needs-operator` to #551 with the note *"the label was lagging the
body."* Backwards: the body lags. #551 had been ruled **parked** on 2026-08-26 (*"park it until
demand shows up"*) with `needs-operator` deliberately cleared and three concrete revisit triggers
recorded — none of which had fired. I read the body's `Design doc first -> operator sign-off` route,
did not read the comment run, and re-opened a closed question by labelling it. The same pass then
listed it as the top item under "Waiting on you". Caught in the following `/decisions` pass and
reverted.


**Why:** re-asking a settled question wastes the operator's turn, and a recommendation that
contradicts an earlier ruling can talk them out of their own decision. Presenting shipped work as
pending is worse — it makes the whole report untrustworthy, since the operator cannot tell which
other rows are stale.

**How to apply:** for any issue you are about to list under Decisions or grade as open work —
`gh issue view N --json comments` for it and its cross-references (newest comment is NOT enough —
read the run), **and** `git log --oneline -- <the file or module it names>` plus a `grep` for the
mechanism. If it shipped, say so, close the issue, and note the discrepancy rather than quietly
correcting the report. When a body and the code disagree, **the code wins** — then post a comment
saying the body is stale, so the next reader is not caught by the same thing. Related:
[[gate-lines-are-read-not-matched]] (the sibling rule: evidence produced is not evidence read).

**The label is a claim too.** `gh issue edit --add-label needs-operator` asserts "this is waiting on
the operator" as loudly as a sentence in a report does, and a status pass that reads bodies at scale is
exactly where this misfires. Read the comment run BEFORE adding an attention label, not just before
writing the row. If the body states a routing gate ("needs sign-off", "blocked on X", "build order"),
treat that as a claim to verify, never as current state — gates in bodies are the single most
frequently-stale thing in this queue.
