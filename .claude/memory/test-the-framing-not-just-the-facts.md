---
name: test-the-framing-not-just-the-facts
description: "An escalation's QUESTION is a hypothesis too — before costing out the answer, check whether the student's statement should have been honoured rather than better refused"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 7d6cf4c9-ed74-4903-8db6-6b892854e932
  modified: 2026-09-05T19:50:39.615Z
---

On 2026-09-05, a `/decisions` pass put two escalations to the operator with their original framing
intact. Both framings were wrong, and in both cases the facts underneath them were correct.

- **#909** was escalated as *"should a claim the givens leave free say «not yet determined» instead of
  ✗, over 31 claim kinds or just the magnitude ones?"* — a wording-and-cost question, priced at one
  or two sessions. The operator answered with a question instead: *"why cant an angle like that be 47
  and the tool adds this as an input?"* Measuring that took ten minutes and settled it: a stated angle
  between two segments **already drives the figure** when the segments share a vertex
  (`הזווית בין AC לבין AB היא 40` → the box is reshaped, angle = 40.0000°), and falls through to the
  refute lane only when they do not (`apply.ts` guards the pin on `claim.a1 === claim.a2`).
  `relationTable.ts` already declared the row `drive-dims`. So it was a **bug against a declared
  contract**, not a missing capability — and the fix is to honour the given, not to soften the
  refusal. Relabelled `feature` → `bug`; the 31-kind sweep was deferred to nothing.
- **#892** asked *"does a pinned `p²` cycle both roots?"* Six seeds showed there is no root set to
  cycle: when the letter appears only squared, `±√` draw the **identical** figure; when it also
  appears at degree 1, the data determines the sign (`C(p²,p,0)` resolved `p = −2` correctly). The
  question had no branch semantics behind it and never needed the operator at all.

**Why:** an escalation is written by whoever hit the wall, in the vocabulary of the wall they hit. It
faithfully records *"the message is wrong"* and rarely asks *"should there have been a message?"* A
dossier that inherits that framing inherits its blind spot, and then spends an operator ruling —
permanently recorded, then built — on the wrong axis. Verifying every fact in the dossier does not
catch this, because the facts are usually right.

**How to apply:** before putting an escalation to the operator, ask **"is the near-miss case already
working, and why is this one different?"** — then measure the neighbour, not just the reported case.
Wherever the answer is *"a stated given is being CHECKED instead of USED"*, the framing is wrong: per
CLAUDE.md's honesty invariant a given drives, escalates, or errors, so a refusal-wording question is
often a missing-drive bug wearing a UX hat. Cheap tell: the relation/capability table already claims
the action the code does not perform.

Corollary: a clarifying question from the operator is data, not an interruption — both corrections
here came from one. Answer it by measuring, and re-ask the decision with the corrected framing rather
than defending the menu.

Related: [[measure-before-diagnosing]] (the facts are hypotheses); [[prior-rulings-live-in-comments]]
(check what was already settled before asking).
