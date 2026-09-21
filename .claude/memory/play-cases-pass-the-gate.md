---
name: play-cases-pass-the-gate
description: "A play-sheet case (or a scenario built with factsOf) can commit lines the submit gate REFUSES — validate every play case through the real dry-run gate before listing it; the sheet dies at the first refused line (2026-09-09, #955 T2/T6)"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: d20df1a4-1584-4eea-91f9-ced70cdf8f01
  modified: 2026-09-09T14:35:31.414Z
---

Two of the six #955 play cases died at line 3 on the operator's canvas: «AB = x» after «AB = 3» is
refused pre-commit (`dryRunOutcome` → `reason: 'empty'`), and «DE = x» before D/E exist is refused
("references an unknown point", not deferral-worthy). Headlessly both sequences "worked", because
`factsOf`/`replayFacts` (the scenario harness, and `run-sequence.mjs` with it) COMMIT every line and
report a refusal only as a replay status — the UI never lets such a line into the fact list.

**Why:** a lock or a play case that drives a path no student can reach guards nothing and costs an
operator slot; it is the twin of [[drive-the-reported-path]] (a refused line never becomes a fact) and of
[[playsheet-cases-declare-start-state]]. The reported angle case was fine precisely because the operator
had reached it in the UI; the "twins" I authored by analogy were not.

**How to apply:** before a case goes on a play sheet (and before a `factsOf` scenario is written for a
sequence the operator did NOT type), drive it through the deterministic half of the real gate — parse →
`droppedNewLabels`/`droppedGivenNumbers` → `dryRunOutcome` → `deferralWorthwhile` (the mirror in
`src/__tests__/scenarios-props-submit-gate.test.ts`; my scratch `measure-gate.mjs` under vite-node does
exactly this). A `produced:false` with `reason:'empty'`, or an `error` that is not deferral-worthy, means
the UI refuses the line and everything after it is unreachable. Issue #960 makes this a harness rule.

**INHERITED cases are not pre-validated (2026-09-16, PR #1008).** The rule above was followed for cases
I authored and skipped entirely for cases I COPIED from round #1006's sheet — four of them, listed
verbatim with new port numbers. All four were dead: «זוית ABC» / «זוית B» gate as
`{produced:false, reason:'empty'}` on any figure whose arms already exist. The operator hit it on his
second case.

Worse, **the disproof was already in the queue.** #1011 was filed FROM round #1006 — the same round
whose sheet I was copying — titled *"PR #1008's «זוית ABC» commits nothing"*, with the full
measurement table. Nobody had to re-derive it; it only had to be read.

- Re-run the gate on every case, including ones a previous sheet already listed. A PR ages; `main`
  moves 93 commits; a case that passed on Monday is a hypothesis on Wednesday.
- **Before listing any PR's cases, search the queue for issues filed AGAINST that PR** (`gh issue list
  --search "<PR number>"` and the issue it closes). A blocking bug found while BUILDING the PR lives
  there, not in the PR body — the PR body is written by the session that thought it worked.
- A case can also pass for the WRONG REASON: #1006's T6 chained «זוית ABC» then «זווית BCA = 40» and
  would have read green on the 40°, while the arc it was actually checking was never drawn.

**A DISPLAY case must still be SUBMITTED (2026-09-21, round #1306 T1/T2).** Two cases on PR #1307 were
written as preview-only — *"do not submit; the preview is the whole case"* — because the PR's deliverable
was the input preview. I validated them by calling `inputPreviewDisplay3` directly, which is the display
function and nothing else. Both passed. The operator typed the same lines, pressed enter, and both
REFUSED: «וקטור CD» after «וקטור AB» is `unknown-point` (#1310) and «אורך AB = 5» on a free vector is
`claim-refuted` (#1311) — pre-existing lanes, byte-identical on `main`, invisible to the display function.

A case a student can only pass by NOT finishing their action is testing half a feature, and it hides
whether the sentence being previewed so nicely can be entered at all. Validating against the unit under
test rather than the student's whole action is the same error as driving `factsOf` instead of the gate —
[[drive-the-reported-path]] one layer up.

- **Every play case runs to the end of the student's action, submit included**, whatever layer the item
  under test lives at. If the submit is expected to refuse, that refusal belongs in **Look for**.
- Validate by driving the STORE's submit (`useGeo3.getState().submit` / `runSubmit`), never the
  component function the fix happens to touch — then read back both the display and `lastError`.
