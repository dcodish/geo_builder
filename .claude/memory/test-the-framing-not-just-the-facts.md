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

**2026-09-19, #1240 — the same rule applies to a BASELINE the operator names.** Playing #1232, he
asked for more altitude spellings and set the reference himself: *"baseline is what 2d supports."*
Measuring 2-D rather than porting it found two holes in the premise: `גובה לצלע BC` — one of the four
forms he listed — is **refused by 2-D too**, so it is new capability for both tools and not a port at
all; and 2-D's own median is poorer than its altitude (`AD גובה` parses, `AD תיכון` does not), so
porting "what 2-D supports" literally would have copied an asymmetry into the younger tree. A named
reference implementation is a claim about that implementation, and it is measurable in minutes.

Same session, #1241: the operator ruled that a knee draws only for a **stated** right angle, never a
derived one. Reading 2-D's renderer showed it feeds `rightAngles` from `definiteAngles` — a
*determinacy* notion, not a *provenance* one — so 2-D probably does the opposite. Had that gone in as
"port the 2-D knee", the two products would have disagreed about what the mark MEANS. **Check the
sibling before citing it as the answer, not only before citing it as the problem**
([[cross-product-disparity-is-a-wiring-smell]] is the same coin: a disparity is a smell in whichever
direction it points).

**2026-09-19, #1242 — an ADR cited as justification may be about a NARROWER case.** A refused line
was filed as "the refusal is correct, make it total", justified by ADR-AG-015's *a reference may not
invent a point*. The operator overruled the premise: *"the idea of order is not relevant since the
diagram should either respect all input or refuse to build."* The ADR was about **inventing** a point;
the case in front of me needed the constraint to **wait** for one — a distinction the citation hid.
Worse, the principle was already ruled in the sibling: ADR-104 is titled *"order-independence: a
constraint that can't be satisfied yet is DEFERRED"* and quotes the operator saying the same sentence
in June. **Before citing an ADR to justify a refusal, read its Context and ask whether it covers THIS
case — and grep the sibling's log for the same principle, which may already have been decided the
other way.**

**2026-09-20, #1266 — a DELIBERATE deferral carries a cost premise, and that premise is measurable.**
The operator asked why «BD גובה לצלע AB» answers "I can't read this". The comment above the gate said an
owned refusal "is a larger change (2-D has no refusal vocabulary equivalent to the analytic tree's
`ParseFailure` codes)" — written by an earlier session of mine, and honest about being a choice. Five
minutes of grep: 2-D's `Clarify` union has **15 members**, `refusalOf` maps every one, `submitPipeline`
has ~10 arms, and #967's `angle-sides-disjoint` is the identical shape (grammar read it, geometry
impossible, refuse by name). The "larger change" is one union member and two strings. **A split-out with
a stated reason reads as settled and is quoted forward; check its reason the same way you check a
plan's diagnosis** — especially the form "the tree has no X", which is one grep.

