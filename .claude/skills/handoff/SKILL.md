---
name: handoff
description: End-of-session handoff between the operator's work PC and home PC — commit everything worth keeping with proper messages, push to GitHub, and report exactly what does and does not travel to the other machine. Use when the operator says they are done for the day, switching machines, wrapping up, going home, or asks to make sure the other PC will pick this up.
---

# Handoff — leave this machine so the other one can pick up

The project left Dropbox on 2026-07-23, so **git is the only channel between the two machines**. Conversation history does not travel. Uncommitted files do not travel. Committed-but-unpushed work does not travel. This skill closes that gap deliberately rather than hoping.

The `SessionEnd` hook pushes *committed* work automatically — it is a safety net for "forgot to push", not a substitute for this. Nothing auto-commits, because commit messages in this repo carry meaning (ADR references, `Fixes #NN`, root-cause statements per CLAUDE.md).

## Steps

1. **Survey.** `git status --porcelain` and `git log --oneline origin/main..HEAD`. Also check `git stash list` — a forgotten stash is invisible on the other machine.

2. **Account for every changed file.** For each one decide: commit it, or deliberately leave it. Say which, out loud, in the summary. Scratch files that were never meant to be kept should be deleted, not silently left dirty for the next session to trip over. Watch for:
   - `.claude/memory/*` — auto-memory written this session. **Always commit these**; they are how the other machine inherits what was learned.
   - `docs/PROJECT-MEMORY.md`, `docs/06-decisions.md`, `docs/09-implementation-plan.md` — if this session made a decision or moved status and these were not updated, that is a gap to fix now, not after the handoff. The next session on the other machine reads these first.
   - `fixtures/*.geo.json`, `fixtures3/*.geo3.json` — saved manual sessions are permanent regression coverage; they only count once committed.

3. **Verify before committing** if source changed: `npm run test:fast` (or the per-product `npm run test:run:2d` / `test:run:3d`) and `npx tsc -b`. Report results honestly — never describe a red or unrun suite as green. If something fails, say so and ask whether to commit anyway (work-in-progress that needs to reach the other machine is a legitimate reason to commit red, but it must be stated in the commit message).

4. **Commit** in logical units following the repo convention (`fix(3d):`, `docs:`, `perf(test):`, …) with the root cause stated, ADR ids referenced, and `Fixes #NN` where an issue applies. Several small honest commits beat one dump.

5. **Push** to `origin`. Confirm with `git status -sb` that the branch is not ahead and the tree is clean. If work sits on a feature branch, push the branch and say so — the other machine must check that branch out, not `main`.

6. **Report** — the operator is walking away, so the summary must stand alone:
   - what was committed and pushed (one line each)
   - what state the next session arrives at, and the immediate next step
   - **what does not travel**, when relevant: `.env.local` (the API key — untracked by design, must already exist on the other machine), `logs/debug-log.jsonl` (dev session logs are machine-local; save a `.geo.json` fixture instead if a figure needs to be diagnosed elsewhere), `node_modules/` (run `npm install` there if `package.json` or `package-lock.json` changed), `.claude/settings.local.json` (per-machine permission allowlist; harmless drift, it just re-prompts)
   - anything left uncommitted on purpose, so it is a known loss and not a surprise

## Arriving on the other machine

Nothing to type. The `SessionStart` hook runs `scripts/session-sync.mjs start`, which pulls `--ff-only` and reports what arrived, whether dependencies changed, and whether anything was left uncommitted or unpushed. Read [docs/PROJECT-MEMORY.md](docs/PROJECT-MEMORY.md) and the Status line in [docs/09-implementation-plan.md](docs/09-implementation-plan.md) to pick up the thread.
