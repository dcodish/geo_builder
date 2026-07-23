---
name: work-pc-cross-machine
description: "This machine is David's WORK PC; he alternates work/home PCs and the project syncs via Dropbox — pick up cross-machine progress at session start"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 30dffdd3-8780-4c4b-9a11-09812e4a1426
---

This machine is David's **work PC** (hostname `comp11229`). The **home PC** is hostname `DESKTOP-GQHOSST` (both names show up in Dropbox "conflicted copy" filenames). He alternates between the two, doing progress on whichever he's at. The whole geo_builder project lives on Dropbox, so the files (including all repo docs) sync automatically between machines.

**Why:** Work done at home won't be reflected in this session's memory/context automatically — but it *will* be present in the synced repo files. Conversation history and machine-local memory do NOT travel; only the Dropbox-synced repo does.

**How to apply:** At the start of any geo_builder session, assume work may have happened on the other machine since I last saw it. Read the synced source-of-truth docs first — [docs/PROJECT-MEMORY.md](docs/PROJECT-MEMORY.md) (session log), [docs/09-implementation-plan.md](docs/09-implementation-plan.md) (Status line), and the ADR log — and check `git log`/status to pick up recent changes, rather than trusting only what's in my local context. This is why durable project context must live in the repo, not local memory ([[memory-in-repo]]).
