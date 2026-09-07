---
name: try-the-neighbouring-spelling
description: "Before calling a refused input a missing capability, type the same statement a different way — if a neighbouring spelling works, it is a two-spellings bug, not a feature"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: fbd75c88-40d1-48d7-8242-cf170223c127
  modified: 2026-09-07T21:14:16.501Z
---

When an input refuses or silently drops a given, **type the same mathematical statement in every other
spelling the product accepts** before classifying it. The answer decides the ROUTE, not just the fix:
a genuine capability gap is a `feature` on the PR route (CLAUDE.md: never built under a bug's banner),
while "one spelling works and another does not" is a bug the round may land directly.

Round #931, #921: «E על SA כך ש-SE = t·SA» silently discarded the ratio, and the catalog listed only the
halves forms («AK = 2KA'»), so it read as a missing capability — which would have finalized the round on
a second escalation. Typing the same statement as its **own fact** settled it in one probe:

```
SE = t·SA   →  vec-rel {symbol: 't'}      t = 1/2  →  accepted;  |SE|/|SA| = 0.500000
```

The capability existed the whole time. It was the #820 class — two spellings of one construction
disagreeing — which the module's own docblock (#748) already had a rule for: *the reading belongs to the
RIDER, not to the utterance that happened to declare it.*

**Why:** a catalog lists the spellings someone wrote down, not the ones the engine supports; the parser
and the apply reducer frequently reach a construct through a lane the catalog never mentions. Judging
"capability vs bug" from the catalog alone mis-routes the work and can escalate a landable fix.

**How to apply:** for a refused or dropped given, run the two-fact form, the one-utterance clause form,
and the numeric twin of a symbolic input (and vice versa) through the real `parse → store` path. Record
the table in the ADR — it is also what tells you whether the fix must serve numeric and symbolic together,
which is how a fix avoids creating a fresh inconsistency of the kind it was filed for.
Related: [[measure-the-plans-therefore]], [[measure-before-diagnosing]].
