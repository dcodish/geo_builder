# Project Memory & Operational Notes

_The **travelling memory** for this repo. Because the repo syncs (Dropbox), anything here is available on every machine — unlike the assistant's machine-local memory, which does **not** travel._

> **Rule:** durable project context goes **in the repo** — in the formal docs, or in this file — **never only in machine-local memory.** Read this file (and `../CLAUDE.md`) at the start of every session.

## Where memory lives

- **Decisions (why we chose things)** → [06-decisions.md](06-decisions.md) — the ADR log is the authoritative record. Add an ADR for any significant decision.
- **Plan & current status / resume pointer** → [09-implementation-plan.md](09-implementation-plan.md) (the Status line at the top).
- **Vision / requirements / NFRs / design / glossary / testing** → docs 01–05, 08.
- **Theorem source** → [07-theorem-reference.md](07-theorem-reference.md) + the bagrut PDF.
- **Operational notes / working context that doesn't fit a formal doc** → this file (below).

## Operational notes

- **Protected PDFs (e.g. the bagrut list):** the Read tool refuses the copy-protected `5pts_GeometryList_Teachers.pdf`. Extract text with PyMuPDF (`python -c "import fitz; ..."`) and write to a UTF-8 file — the Windows console is cp1255 and chokes on symbol chars.
- **Validation corpus:** `sample questions/` holds real bagrut problems (text + image). We reproduce the **figure** from the givens (never solve) and compare visually to the official image. Questions are **multi-stage** — later parts add givens; the figure accumulates them.
- **Tooling:** tests run with `npx vitest run`; `archive/` is excluded from tests and not compiled (`vite.config.ts`). On a fresh machine, run `npm install` before testing (`node_modules` is not in git).
- **Git:** work is on branch `rebuild-foundation`; no remote yet — history currently survives only via Dropbox-synced `.git`. Consider adding a private GitHub remote for a real backup.

## Resume pointer

See the **Status** line at the top of [09-implementation-plan.md](09-implementation-plan.md) and the "Current state / Next step" section in [../CLAUDE.md](../CLAUDE.md).
