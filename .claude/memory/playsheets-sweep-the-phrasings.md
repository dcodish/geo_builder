---
name: playsheets-sweep-the-phrasings
description: "A PR's play sheet must sweep the phrasings a student would type, not just the builder's one spelling — the operator found the gap himself on #1511 (2026-09-29)"
metadata:
  node_type: memory
  type: feedback
  originSessionId: fb65550a-a642-4c0e-bef1-e4eea7b0c85a
  modified: 2026-09-29T09:24:29.827Z
---

A feature PR's play sheet has to cover the natural phrasings a student or bagrut text uses (conjoined/plural subjects, word order, synonyms, question openers «מהו/מצא את», trailing «?», copula variants), each measured on the PR branch AND on main, with the failing ones listed as red cases — not only the one spelling the builder chose.

**Why:** 2026-09-29 the operator played PR #1511 and found «מעגל O ומעגל M משיקים מבחוץ» fails while «המעגלים משיקים מבחוץ» works; he asked for per-PR sheets and for the session to test without him. The sweep then found 37 red cases across the five open PRs, including three honesty-class bugs (degenerate radius drawn green, negative radius accepted, internal id in a refusal).

**How to apply:** when building a play sheet for a feature, first run a headless phrasing sweep (~100 lines through the real submit/ask path) on the branch and on main, then author cases from it. Every new ask/given atom that accepts only a bare form is the one-spelling class — see [[try-the-neighbouring-spelling]] and [[play-cases-pass-the-gate]].
