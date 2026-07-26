---
name: never-patch-fix-root
description: When fixing a geo_builder bug, never patch/special-case the erroring input — always fix the core engine feature, even if big; ask when unsure of scope.
metadata:
  type: feedback
---

When fixing any issue in geo_builder, **never write a patch and never special-case just the specific input that errored**. Always find the core engine feature that failed and fix *that*, even when the correct fix is large or risky. The size of the right fix is not a reason to avoid it.

**Why:** the operator stated this as an always-true rule (2026-06-22). Narrow patches accumulate special cases, hide the real defect, and leave sibling bugs unfixed; a root fix usually clears a whole class of figures.

**How to apply:** trace why it happens at the layer where the defect originates; fix there. A green test on the reported case is necessary but not sufficient — ask "can this class of bug happen elsewhere?". If the proper fix looks large, or you're unsure what the core feature is or how far the fix should reach, **stop and ask the operator** — do not quietly ship a patch instead. The big correct fix is always right. Canonical sources in the repo: the "Rule (root cause over symptom — NEVER PATCH)" entry in `CLAUDE.md` and the operational method in `docs/17-design-rules.md`. See [[triage-only-during-testing]] for when a fix is authorized at all.
