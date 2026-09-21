---
name: ship-the-mechanism-file-the-judgement
description: "When a plan bundles an engineering mechanism with bulk pedagogy/editorial judgement, land the mechanism and file the judgement — and leave out the lint that would force the choices"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: d3cebc4d-0bc9-4598-ac3f-13ef8e3443e9
  modified: 2026-09-21T20:55:24.667Z
---

Some plans contain two different kinds of work: a mechanism, and a pile of judgement calls the mechanism
then needs fed. **Land the mechanism, file the judgement as its own `needs-operator` issue.** A round may
not make the operator's teaching decisions at scale just because they sit inside an engineering plan.

#1275 (round #1345) asked for a `featured` flag, a «הצג הכול» expander, a re-worded note, AND for six
rows to be chosen in each capped guide section. The first three are mechanism. The fourth is ~108
decisions about what a student meets first, across four products' front doors — pedagogy, and the
operator is the teacher. No uniform rule could substitute (only two of four catalogs carry a `family`
field). Shipped the mechanism plus the two rows his own report named; filed #1347 with four priced options.

**Why:** the mechanism is what makes the choosing cheap later, and with the expander shipped nothing is
lost meanwhile — every row is reachable, only the first impression stays accidental. Escalating the whole
item would have left the reported symptom unfixed for a decision that is not about the symptom.

**How to apply:**
- Split on *"could a careful engineer derive this, or does it need the operator's taste?"* — not on size.
- Deliver enough of the judgement to make the operator's own reported case pass, and no more.
- **Leave out any lint/gate that would force the remaining choices**, and say so: adding it turns the tree
  red and recreates exactly the pressure the successor issue exists to relieve. The lint lands with the
  answer, in that change.
- The successor issue is mandatory, not optional ([[parked-arms-need-successor-issues]]) — and reference
  its number from the code comment and the ADR so the parked half is discoverable from where it bites.

Related: [[parked-arms-need-successor-issues]], [[plan-mechanism-beats-plan-locks]].
