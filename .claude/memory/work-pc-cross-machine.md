---
name: work-pc-cross-machine
description: "David alternates work/home PCs; geo_builder now syncs via git/GitHub (NOT Dropbox as of 2026-07-23) — pick up cross-machine progress at session start via git + the source-of-truth docs"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 30dffdd3-8780-4c4b-9a11-09812e4a1426
---

David alternates between a **work PC** (hostname `comp11229`) and a **home PC** (hostname `DESKTOP-GQHOSST`), doing progress on whichever he's at.

**The project moved OUT of Dropbox on 2026-07-23** — it now lives at `C:\projects\geo_builder` and syncs between machines via **git/GitHub** (`dcodish/geo_builder`), not Dropbox. The move happened because Dropbox kept corrupting `node_modules` (missing `@babel/core`), `.git`, and source files with `(conflicted copy)` duplicates. Claude's auto-memory (`.claude/memory/`) is now **git-tracked** (`autoMemoryDirectory` → the repo-local dir) so it travels via GitHub too. On a fresh machine: `gh repo clone dcodish/geo_builder C:\projects\geo_builder`, `npm install`, copy `.env.local` (the API key — untracked by design). See CLAUDE.md "Cross-machine setup" for the canonical version.

**Why:** Work done on the other machine won't be in this session's conversation history or context automatically — but it *will* be in the git-synced repo (source + docs + auto-memory) once pushed. Conversation history does NOT travel; only committed-and-pushed git state does.

**Automated since 2026-07-26:** a `SessionStart` hook runs `scripts/session-sync.mjs start` (pull `--ff-only`, then report new commits, dependency changes needing `npm install`, leftover uncommitted files, unpushed commits, and auto-memory landing outside the repo); a `SessionEnd` hook pushes committed work. The operator types nothing on arrival. Leaving is the `/handoff` skill — commit with real messages, push, and state what does not travel. Migration note: five memories were stranded at the OLD Dropbox project path (`~/.claude/projects/c--Users-User-Dropbox-projects-geo-builder/memory`) by the move and were recovered into the repo on 2026-07-26; that stale directory is now inert.

**How to apply:** At the start of any geo_builder session, assume work may have happened on the other machine since I last saw it, and that it only arrives here if it was **committed and pushed**. Read the synced source-of-truth docs first — [docs/PROJECT-MEMORY.md](docs/PROJECT-MEMORY.md) (session log), [docs/09-implementation-plan.md](docs/09-implementation-plan.md) (Status line), and the ADR log — and check `git log`/`git status` (and `git fetch` if unsure the local is current) to pick up recent changes, rather than trusting only what's in my local context. This is why durable project context must live in the repo, not local memory ([[memory-in-repo]]).
