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
