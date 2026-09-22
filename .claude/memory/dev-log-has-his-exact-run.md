---
name: dev-log-has-his-exact-run
description: "Before asking the operator to re-run anything, read logs/debug-log.jsonl — dev logs every submit with its result, so his exact sequence is already on disk; a screenshot is a lossy reconstruction"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: d3cebc4d-0bc9-4598-ac3f-13ef8e3443e9
  modified: 2026-09-22T04:44:40.845Z
---

In DEV every submit posts to `/api/log` → **`logs/debug-log.jsonl`**, one line per input with
`utterance`, `source` and `result` (plus a `figure` line carrying the whole fact list). The operator's
session is therefore already on disk before he finishes describing it. **Read it first.**

2026-09-22, round #1345 T4. He reported «AB ⟂ BC» committing without the «כבר קיים» note. I rebuilt the
sequence from his screenshot, measured it 11 ways through the real submit pipeline, found it clean every
time, and filed *"could not reproduce — stale browser tab suspected"* with a hard-reload request. The log
had the answer:

```
04:32:50  "AB ⟂ BC"   result= (none -> COMMITTED)
04:33:05  "AB ⟂ BC"   result= implied-restatement
```

Fifteen seconds apart, same code. The figure differed — at 04:32:50 it still carried a `BC = 10` row he
deleted before taking the screenshot. That row was the whole defect (it collapsed the sample pool to 1 and
the predicate failed open, #1351). **The screenshot showed the figure AFTER the evidence was removed.**

**Why:** a screenshot is the end state of a run, not the run. The log is the run — including the rows he
deleted, the order he typed them in, and the `result` the code actually recorded, which is the one thing a
reconstruction can never recover.

**How to apply:**
- Before writing "could not reproduce", grep the log for the utterance and read the `result` field. A
  missing `result` on the parser path means the happy path committed; a named result tells you which arm
  fired.
- Reconstruct the figure from the nearest `kind: "figure"` line, not from the picture — it lists every
  fact with its `utterance` and `cmd`.
- The log also dates the run, so it settles "was this before or after the fix landed" without guessing.
- Same file per product: `debug-log.jsonl`, `debug-log-3d.jsonl`, `debug-log-analytic.jsonl`.

Related: [[measure-before-diagnosing]] (this is what to measure FIRST),
[[playsheet-cases-declare-start-state]] (its closing note — a screenshot is a picture of the whole run).
