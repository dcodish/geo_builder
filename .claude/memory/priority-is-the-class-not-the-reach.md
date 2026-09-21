---
name: priority-is-the-class-not-the-reach
description: "A figure drawn green for givens that cannot hold is P1 by the label's definition — do not discount to P2 because the input takes a mistake to reach (2026-09-21 #1328)"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: cc697c2a-e8ac-4634-b789-38c1e240949c
  modified: 2026-09-21T09:05:26.949Z
---

Grade a bug by the CLASS the label defines, never by how likely the input is. #1328 (2026-09-21):
«משולש ABC» · «AB = AC» · «∠ABC = ∠ACB» · «∠ABC = 90» drew a needle with every row green and
«נקבע במלואו». I filed it P2 reasoning "it needs a contradictory input"; the operator asked
*"would you say T4 issue is a P1"* — and it is: the tool asserts a figure exists for givens that
cannot hold, which is the prod-honesty class verbatim.

**Why:** a student who mistypes a contradictory given is exactly the moment the tool must refuse;
"reachable only by a mistake" describes the honesty class, not an exemption from it.

**How to apply:** when filing, ask "does the tool assert or hide something false about the givens?"
— if yes, P1, whatever the input took. Reachability may lower a P2/P3 polish item, never a P1.
Related: [[test-the-framing-not-just-the-facts]], [[measure-before-diagnosing]].
