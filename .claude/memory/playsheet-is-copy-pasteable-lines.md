---
name: playsheet-is-copy-pasteable-lines
description: "The play sheet in CHAT must give every utterance line by line in a code block, ready to copy-paste — never a table, never a summary pointing at the issue"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 827c167d-0ebd-4640-bec4-ed6a6c98af3f
  modified: 2026-09-08T11:01:31.907Z
---

The operator plays from the chat message. Every test case's utterances must appear **one per line inside a
code block**, exactly as typed into the app — never condensed into a table row, never "the full lines are
on issue #NN". This applies to `/fix-round` reports and to every other "ready" report.

**Why:** he copy-pastes the lines straight into the app while playing. A table cell with the lines run
together, or a pointer to the issue, means he has to retype them or open another document — which is the
exact thing standing rule 5 exists to prevent ("the operator works down it without opening any other
document"). Given 2026-09-08 after round #940, where the issue body had the correct per-line format and
the chat copy had a summary table.

**How to apply:** in the chat report, write each case as its own `### T<n> · <title>` block with
**Server:** (URL + path), then a fenced code block holding the Hebrew utterances one per line, then
**Look for:** and **Before:**. The chat copy and the round-issue copy must be the SAME text — if the issue
version is the good one, paste it, do not re-summarise it. See [[gate-lines-are-read-not-matched]] for the
sibling rule about evidence: producing the right artifact is not the same as putting it in front of him.
