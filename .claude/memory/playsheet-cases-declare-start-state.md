---
name: playsheet-cases-declare-start-state
description: Every play-sheet case must state the canvas AND THE TOOL it starts from — the operator continues from the previous case, so a case written for a fresh canvas or a different builder fails and reads as a code bug
metadata:
  type: feedback
---

A play-sheet case that assumes an empty canvas MUST say so («נקה הכל» / reload) as its first
instruction. The operator works down T1…Tn in order and keeps typing into the SAME canvas — that is
the natural reading, and it is what he does.

2026-09-08 (#942, ADR-486): T2 was «משולש ABC · D = חיתוך AB ו-BC», written for a fresh canvas. He
typed it under T1's figure, where `D` was already the inscribed square's vertex, so it correctly
refused `over-constrained: D coincides with its constructed target`. Reported as "T2 - it refused. not
like you expected" — a wasted round trip, and for a moment it looked like the fix had failed.

**Why:** a case is a claim about the product, and a claim that only holds from a state the sheet never
names is not checkable. The operator cannot know which cases share state and which do not.

**How to apply:** on every case, either open with the reset instruction or explicitly say it continues
from the previous case's figure. And prefer sequences whose letters cannot collide with earlier cases'.
Second lesson from the same case: pick the case's spelling by MEASURING it, not by picking the first
one that produces the effect — the first T2 spelling also tripped an unrelated amber banner
(`intersectionsWithinSegments`, now #944), which would have read as a second bug.

See [[playsheet-is-copy-pasteable-lines]], [[measure-before-diagnosing]], [[locks-and-gates-are-hypotheses]].

**The same hazard runs the other way, when READING his report** (2026-09-16, T32 of the #1116 sheet):
his screenshot carried a dashed «0.8» distance from the *previous* case, and T32's own claim was that
no height is drawn. Diagnosed straight from the image it was a P1 honesty bug — a magnitude on the
canvas that the givens never fixed. A clean run of the three utterances he pasted drew no measurement
at all, and he confirmed: *"that was from a different test"*. So a screenshot of a sheet run is a
picture of the WHOLE run, not of the case — re-run the case's own lines on a cleared canvas before
believing anything in the frame that the case did not ask for.

**THE TOOL IS PART OF THE START STATE, and a number that is only true in one tool is a trap**
(2026-09-22, round #1345 T22). The case said *"open the guide and find «מעגלים» — look for «הצג הכול
(63)»"* with the 2-D server on its Server line. He had been in the ANALYTIC builder for the four cases
before it and stayed there, where «מעגלים» is a different section with 5 rows — under the cap, so
correctly no link at all. Reported as *"there are no 63 examples"*. Measured after: 2-D circles 63,
analytic lines 16, analytic circles 5. **The feature was working in his screenshot** — the «הצג הכול
(16)» in frame was analytic's lines section.

Two rules follow, and they cost nothing:
- When consecutive cases change BUILDER, say so on the case's face («THE 2-D TOOL — switch back from
  analytic first»), not only in the Server line. He reads the instruction, not the URL.
- **Never quote a count, a name or a section that is only true in one builder without naming it.**
  A section name shared across tools («מעגלים», «נקודות», «ישרים») is exactly where this bites; give
  the per-tool numbers in the Look-for so the case is checkable wherever he happens to be.
