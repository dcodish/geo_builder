---
name: triage-only-during-testing
description: Operator reports during a testing pass are TRIAGE-ONLY — file the issue with diagnosis + fix plan and STOP, even when the fix looks trivial or the operator dictates exact wording.
metadata:
  type: feedback
---

Operator correction (2026-07-11, after I implemented+deployed a dictated prompt-copy change mid-testing): "I will say what's wrong and you need to add it as a task with proper documentation but not go and implement. We will have a dedicated session for fixes only after I decide on priority and order."

**Why:** the operator raises several issues per testing pass; immediate fixes force one-at-a-time reporting, overwrite each other, and pre-empt the operator's own prioritization. This is docs/22 §2b (ADR-265 Am. 1) — the mistake was reading dictated wording / a trivial-looking change as an implicit "fix this now". It isn't. Only an explicit "fix this now" (or a dedicated fix session picked off the queue) authorizes implementation.

**How to apply:** during any session where the operator is reporting problems: file each report as a GitHub issue (type + priority labels, root-cause diagnosis per docs/17, concrete fix plan written INTO the issue), confirm it's filed, and stop. No code, no deploy — regardless of how small the change seems. See [[commit-deploy-still-needs-pr]] for the sibling rule about the PR route once a fix session runs.
