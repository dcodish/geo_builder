---
name: locks-must-call-not-reproduce
description: "A test that REPRODUCES a decision instead of calling it stays green through the change that kills the feature — extract the decision, then lock it"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 5610c0fa-33e8-4e0e-a029-cafb7ebbb9fd
  modified: 2026-09-16T11:25:45.721Z
---

A lock that re-implements the logic it is guarding proves nothing about the code that ships. It tests a
copy, and the copy does not change when the original does.

**2026-09-16, #1102.** `#1063` built an "this already follows from your givens" notice and shipped green.
It was dead in the app. `#1076` landed **15 minutes later in the same round** with an
`outcomes === 'created'` early return in `App.tsx` submit that reached first, making the #1063 branch
unreachable for exactly the class it was built for. All three of the operator's own reported sentences
still added a row and said nothing.

The gate never saw it because `engine.test.ts` did not CALL the submit decision — it **reproduced** it:

```js
const verdict = (before, line) => {
  if (trial.outcomes[before.length] === 'known') return 'restated';   // no 'created' arm
  return parsed.facts.length > 0 && gained === 0 && … ? 'entailed' : 'recorded';
};
```

The reproduction modelled a submit path that no longer existed, and would have stayed green through any
future change to the real one.

**Why it happens here:** the decision lived inline in a component, where no test can reach it. The store's
own docblock already named the fix — *"whether a line is acceptable is the submit path's question
(`app/submit.ts`)"* — and `src-analytic/app/submit.ts` had never been created. `src/` and `src3d/` keep
theirs behind `SubmitDeps` / `store3.submitSteps`, so their locks drive the real path.

**Why:** a decision reachable from no test is a decision that will silently stop happening, and the
green suite will report that it still does.

**How to apply:** when a behaviour lives inline in a component, EXTRACT it to a module first and have
both the component and the lock call it — do not write a test that re-derives the answer. Applied the
same day in `src-analytic/app/answers.ts` (#1118, ADR-AG-067), and it paid immediately: the operator
reversed the design an hour later and the correction cost one rewritten test file and nothing else.

A second tell from the same day: **a claimed filing may not exist.** The DEPLOY-LOG for
`prod/2026-09-16-2` said a defect was *"filed and fixed next"*; no issue was ever opened and it stayed
live three deploys (#1119). Grep the issue list before trusting "already filed".

See [[locks-and-gates-are-hypotheses]], [[gate-lines-are-read-not-matched]], [[measure-before-diagnosing]].
