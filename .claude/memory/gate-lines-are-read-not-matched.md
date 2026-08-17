---
name: gate-lines-are-read-not-matched
description: "Two 2026-08-17 failures, one class: evidence produced but not READ (a screenshot taken, never reviewed; a sibling-safety FAIL grep'd past). Quote gate lines verbatim before claiming them; compose gate chains with && so a red gate reds the task"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 297336d3-4977-4b2a-8fd3-33f7365d4f6e
  modified: 2026-08-17T19:30:06.494Z
---

Two failures in one session (2026-08-17, the unification programme), same class — **evidence was
produced but never read**:

1. A 3-D screenshot was captured and the PR claimed "3-D blue verified" — but only the complex
   screenshot had been reviewed. The operator caught it ("did you test this?").
2. A background gate task chained `check:siblings ; test:full` — the `;` let the task exit 0 on the
   suite while `sibling-safety: FAIL` sat in its output, and the landing compound grep'd the line,
   displayed it, and chained past it into a commit + PR whose body claimed PASS.

**Why:** a claim of verification was generated from the *act* of producing evidence (shot taken,
gate run) rather than from *reading its result*. Pattern-matching output for reporting is not
reading it for truth.

**How to apply:**
- A gate chain in one task composes with `&&` (or explicit exit-code checks) so any red gate reds
  the whole task — never `;` between gates.
- Before any "gates green / verified" claim lands in a commit, PR, or message: QUOTE the decisive
  lines (`sibling-safety: PASS`, the `Tests N passed` line) after actually reading them — if the
  text says FAIL anywhere, the landing stops.
- Every screenshot taken for verification is READ (the #704 practice) — capturing is not checking.

See [[shared-tree-branch-races]] for the same session's cwd lesson.
