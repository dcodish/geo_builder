---
name: negated-closing-keywords-still-close
description: "GitHub matches `close/fixes/resolves #NNN` in a commit body regardless of the words around it — writing \"Does NOT close #920\" closed #920 (round #961, 2026-09-10)"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: d20df1a4-1584-4eea-91f9-ced70cdf8f01
  modified: 2026-09-09T17:28:23.827Z
---

A commit that deliberately used `Refs #920` still auto-closed the issue, because its body explained
the decision in prose: *"Does **NOT close #920**: the hypotenuse seating is a KNOWN OPEN GAP."*
GitHub's linked-issue parser matches the bare pattern `close #NNN` and does not read the negation in
front of it — so the sentence written to keep the issue open is precisely what closed it.

**Why it matters:** an issue held OPEN by an operator ruling (here: the missing seating waits for a
second case in its class) silently disappears from the queue, and the ledger's own claim that it
stays open becomes false. Nobody notices until someone re-derives the whole history a fourth time.

**How to apply:** never write a closing keyword followed by `#NNN` in a commit message or PR body
unless you mean it — including inside a negation, a quotation, or a "what this does not do" note.
Say it without the pattern: *"#920 stays open — the hypotenuse seating is held"*, or name the issue
without the hash (`issue 920`). The keywords are close/closes/closed, fix/fixes/fixed,
resolve/resolves/resolved. After a push that references an issue you intend to keep open, verify with
`gh issue view N --json state` — the same check that caught this one.

Related: [[gate-lines-are-read-not-matched]] (evidence produced is not evidence read).
