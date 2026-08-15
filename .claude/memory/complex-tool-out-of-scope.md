---
name: complex-tool-out-of-scope
description: "Ignore everything about the complex-numbers tool (label `complex`, src-complex/, ADR-CX-*, docs/27) — it runs as a parallel effort — until the operator revokes this"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: d8d59f10-9d9b-4c4c-8885-1c1e8160c4e9
  modified: 2026-08-15T06:47:40.118Z
---

The **complex-numbers tool is out of scope** until the operator says otherwise (set 2026-08-15).
Anything carrying the `complex` label, living in `src-complex/`, or recorded as `ADR-CX-NNN`
(`docs/06d-decisions-complex.md`, `docs/27-complex-numbers-tool.md`) is somebody else's lane.

**Why:** it is being built in a **parallel effort**, so surfacing its issues costs the operator
attention on work they are not steering from here, and acting on them risks two sessions colliding in
one tree. This is explicitly revocable — *"until i change this rule"* — so treat it as a filter, never
as a judgement about the product's value.

**How to apply:**

- **Reports and queues** — exclude `complex` from `/status-update`, from the open-issues report, and
  from the "waiting on you" digest. Do not list complex PRs as awaiting play-and-approve (as of
  2026-08-15 that means #585 and PR #588 drop off the operator's surface).
- **`/fix-round`** — never compose a `complex` issue into a round, and do not list it among the
  eligible-but-not-picked; it is not eligible at all. Say the filter is why, if it would otherwise
  look like an omission.
- **Parallel commits on `main`** — ADR-CX / docs/27 commits appearing mid-round are expected, not an
  anomaly. Still reconcile them per the landing rule (verify the diff is disjoint before rebasing —
  [[shared-tree-branch-races]]), just do not report them as work needing attention.
- **Deploys** — a static deploy may carry complex docs commits in its range; log them factually as
  riding along, without commentary.
- **Do not** file, triage, fix, or review complex-tool issues on your own initiative. If the operator
  raises one directly, that is them changing the rule for that item — do the work.

Revoke this file when the operator lifts the rule.
