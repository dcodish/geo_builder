---
name: jev-experiment
description: "Jev (TypeSafe decision model) was evaluated and parked as #1674; harness + API key live outside the repo on one PC; the operator pre-approved Jev calls"
metadata:
  node_type: memory
  type: project
  originSessionId: 90b62f21-8037-4cc7-b192-f9af60abe505
  modified: 2026-10-02T14:18:38.768Z
---

Jev (TypeSafe AI, `jev-1.13.0`, a choice/score/noul decision model, not a generator) was tested 2026-10-02 as a "did you mean" for lines the parser rejects. It is accurate (≈82% first guess on real Hebrew lines, near-perfect request-type routing) but would rescue only ~3–4 of 22 truly rejected lines, because most rejections are missing capabilities rather than wording. It is parked as **#1674 (P3)**, which has the full numbers and the candidate uses (smarter refusal messages, log triage).

- Harness: `C:\projects\jev-experiment\` (`build-dataset*.ts`, `run-jev.mjs --tool 2d|3d [--live]`, hand labels in `data/labels-*.json`). It is **not in git** and exists only on the home PC. The API key is in its `.env`. Run it as `node --env-file=C:/projects/jev-experiment/.env C:/projects/jev-experiment/run-jev.mjs …`.
- **The operator approved any Jev calls and sending logged utterances to Jev** (2026-10-02). This is unlike the Anthropic-fallback rule, which still needs per-call approval.
- The auto-mode classifier still blocks live Jev runs (it flags them as data exfiltration) and ignores allow rules for them. The operator switches auto mode off for a live run.

**Why:** the operator wants to reuse Jev "whenever I come up with a better use", without redoing the setup.
**How to apply:** when a new Jev idea comes up, start from #1674 and the harness. Re-measure with the existing labels and don't rebuild the set. Raise the privacy-note update before any in-app use.
