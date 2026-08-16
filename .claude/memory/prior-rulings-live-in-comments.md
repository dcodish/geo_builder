---
name: prior-rulings-live-in-comments
description: An issue body's "open question" is often already answered in a comment on it or a sibling issue — scan before presenting a decision as open
metadata:
  type: feedback
---

Before surfacing an issue's "open design question" to the operator as undecided, read the issue's
COMMENTS and those of its siblings. Issue bodies are written once at triage and never revised, so a
question the body poses may already have been ruled on — sometimes months earlier, sometimes on a
related issue rather than this one.

On 2026-08-16 I presented #509's A/B/C option list as an open decision and recommended B (the issue
body's own recommendation). The operator replied *"I already said in the past that option A is the
right way to go"* — the ruling existed; my report re-litigated it and pushed the opposite answer.

**Why:** re-asking a settled question wastes the operator's turn and, worse, a recommendation that
contradicts an earlier ruling can talk them out of their own decision. The whole point of the
status report is that they decide once.

**How to apply:** when a body says "needs a ruling" / "operator to decide", fetch
`gh issue view N --json comments` for that issue AND the ones it cross-references before listing it
under Decisions. If a ruling is found, record it as decided and arm the issue instead. Several
issues in this queue (#537, #342, #370, #364, #578) show the pattern — bodies still posing questions
that comments answered. Related: [[status-update-arming]].
