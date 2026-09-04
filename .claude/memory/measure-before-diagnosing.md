---
name: measure-before-diagnosing
description: "A root cause written from reading code is a hypothesis — run it and measure before it goes in the issue body, because a wrong diagnosis gets built on"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 5dd166f3-bdf1-4c93-b683-4b5af62f30de
  modified: 2026-09-04T00:00:00.000Z
---

On 2026-08-31, in one round, **two of four issues were filed with a root cause I had reasoned to from
reading the code, and both were wrong**:

- **#848** — filed as *"the commas render on the wrong side"*. Dumping the actual rendered markup
  showed the commas were fine (`u̲,` sat correctly inside its island); the **equations** were reversed
  (`AB`, `=`, `u` were three separate islands, and islands in an RTL container lay right-to-left).
  Corrected and retitled before any code was written — but only because the fix forced a measurement.
- **#850** — the plan asserted *"a cube/prism knows its opposite faces."* It does not: `SolidObj`
  stores face rings and no parallelism, and `prismBaseN()` covers six kinds that exclude `cube` and
  `box` — the exact kinds in the report. Escalated instead of built.

**Why:** both diagnoses were plausible readings of the code, and both were about what the code *would*
do rather than what it *does*. A wrong root cause in an issue body is worse than none — it is the
thing the next session (or the fix-round loop) builds against, and it survives review because it
reads like analysis.

**How to apply:** before writing a root cause into an issue, **run the case and print the actual
state** — the rendered markup, the derived construction, the verdict. It is usually a five-line probe
in a scratch test or the browser. Then write the diagnosis from what came back. The measurement also
belongs in the issue, so the next reader can tell analysis from observation.

Corollary, learned the same day: for anything visual, the measurement must be the **rendered** result.
`textContent` was correct on every broken build of the bidi row, which is how that defect survived two
fixes — see [[no-browser-self-test]].

**Corollary 2 (2026-09-02, #874): measuring the wrong LAYER is the same failure wearing a lab coat.**
I filed a P2 claiming a radius slider "EMPTIES the figure and blames the student's «AB = 10»" — with a
measurement table, which is exactly what makes it convincing. But I had called `replay(facts, seed,
override)` directly. The app dials through the store's `setRadius`, which carries a guard
(`if (fig.lastError === null && !radiusViolated)`) that **rejects** every such value: the real
behaviour was a frozen slider and an intact figure. Caught it only because a later question sent me
back to the store. Retracted, retitled, downgraded to P3.

**How to apply:** before measuring, ask *which entry point does the student actually go through?* —
the store action, not the pure function it wraps; the submit pipeline, not `parse`. A pure-core probe
answers "can the engine do this", never "what does the user see". When the claim is about UI
behaviour, the probe must start where the click starts, and the issue should say which path was
measured.

Related: [[gate-lines-are-read-not-matched]] (evidence produced is not evidence read).

**Corollary 3 (2026-09-04, #511/#899): a hand-counted number in a PLAY SHEET is the same hypothesis,
and it costs the operator a play.** T7 told the operator *"there are 19 symbols now; there were 18."*
The real counts are 20 and 19 — I counted the array by eye instead of rendering it. The operator opened
the palette on **:5173** (`main`) rather than the PR's **:5175**, counted the 19 buttons actually there,
matched the number I had given for "now", and correctly reported the button as missing. The PR was
fine. Two browser calls settled it afterwards; the same two calls beforehand would have prevented it.

**How to apply:** every checkable NUMBER or visual claim in a report to the operator — button counts,
"there are N symbols", "the list shows X" — gets rendered and read back before it ships, exactly like a
root cause. And when a play sheet's "Before" is a count, prefer a claim the wrong server cannot
accidentally satisfy: say WHERE the new thing sits ("`²` starts the second row"), not just how many
things there are. See [[pr-items-need-their-own-server]] and [[no-browser-self-test]].
