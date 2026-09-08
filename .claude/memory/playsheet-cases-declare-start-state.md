---
name: playsheet-cases-declare-start-state
description: Every play-sheet case must state the canvas it starts from — the operator continues from the previous case, so a case written for a fresh canvas fails and reads as a code bug
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
