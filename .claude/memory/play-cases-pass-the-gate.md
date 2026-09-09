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
