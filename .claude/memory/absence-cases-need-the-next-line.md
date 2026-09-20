---
name: absence-cases-need-the-next-line
description: "A play case that asserts an ABSENCE (\"BC is not 10\") stops one line short of the defect — write the student's natural follow-up into the case"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: aaba7871-e52a-4f49-a224-c70d2000bfc4
  modified: 2026-09-20T05:43:14.894Z
---

A play-sheet case whose **Look for** is an absence — "BC is **not** pinned to 10", "no extra point
appears", "nothing claims it" — passes while the real defect sits on the **next line the student would
type**. Round #1252 T3 read «אורך הקטע BC לפחות 10» → *"BC is not 10"* ✔, and the operator's very next
line, «BC=10», came back red `over-constrained: |BC| = 10 cannot hold` ([#1265](https://github.com/dcodish/geo_builder/issues/1265)).

**Why:** an absence is the *negative* half of a fix (we no longer commit the wrong thing). The positive
half — the student can still say the RIGHT thing afterwards — is a different code path, and the one
they actually walk. A refusal or a range is never the last line of a real session.

**How to apply:** when a case's Look for is "not X", add the follow-up line that exercises what the
student wanted instead, and say what it must do. For a REGION, that follow-up is the value AT the
bound. Related: [[play-cases-pass-the-gate]], [[playsheet-cases-declare-start-state]],
[[taught-remedies-are-hypotheses]].

**Same day, T18 — a CONTROL case must be measured to differ from the case it controls.** T18 was written
as *"the case that proves the refusal did not eat the feature"*: `A(0,0) B(6,2) C(1,7) D(7,1)` + «P נקודת
החיתוך של הישר AB עם הישר CD». Those lines are `y = x/3` and `y = 8 − x`, and they meet at **(6, 2) — B**.
So the control and the refusal case it controlled were the same case, and the sheet asserted a feature it
never exercised. One letter fixes it (`D(7,0)`). **Compute what the control's own figure does before
writing "unchanged" next to it** — a control is a claim about geometry, not a formality
([#1254](https://github.com/dcodish/geo_builder/issues/1254), 2026-09-20).

**Same day, T25 — a case whose check is a PANEL must be verified on the panel, not in the data.** T25 said
"open the commands card, look for a תיכון row"; the operator asked what there was to test at all. Measured:
the guide slices each section to six entries and those rows are 7 and 8, so nothing would have been there
([#1275](https://github.com/dcodish/geo_builder/issues/1275) — 124 of 2-D's 154 rows are unreachable the
same way). The issue's own lock asserted the rows exist **in the array**, and the catalog lock proved they
**parse** — both green, feature invisible. **When a fix's payoff is "the student can now FIND it", assert
the rendered list, and re-measure it before writing the case.**

