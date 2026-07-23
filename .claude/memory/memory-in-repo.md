---
name: memory-in-repo
description: "For geo_builder, keep all durable memory in the repo (it travels via Dropbox), not in machine-local memory"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 88027cdc-952d-4125-8f14-2fb88bd19212
---

David works on geo_builder across multiple computers. The repo lives in Dropbox and syncs; the assistant's machine-local memory (`~/.claude/...`) does **not** sync. **Rule:** write all durable project memory into the REPO so it travels — decisions in `docs/06-decisions.md` (ADRs), status in `docs/09-implementation-plan.md`, operational notes in `docs/PROJECT-MEMORY.md`, and the rule itself in `CLAUDE.md`. Do not rely on machine-local memory for this project.

**Why:** he may resume from a different computer, where local memory is absent.

**How to apply:** at session start read `CLAUDE.md` + `docs/PROJECT-MEMORY.md`; when you'd normally save a memory for this project, put it in the repo instead (or as well). See [[architecture-decisions]].
