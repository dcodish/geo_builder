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
- **Shell CWD gotcha (Windows):** a `cd` inside a Bash tool call into `docs/sample questions/` made later `vitest`/`tsc` runs resolve from there ("No test files found", phantom `tsconfig.json` errors). Fix: prefix the command with `Set-Location "c:\Users\User\Dropbox\projects\geo_builder"`. The CRLF warnings on commit are harmless (Windows checkout, LF in repo).

## Session log

- **2026-06-10 — Phases 2→5 (partial), one long session.** Built on the Phase-1 engine through to a usable, breadth-y app. End state: **98 tests green, build clean**, all on `rebuild-foundation`.
  - **Phase 2** — SVG renderer (`src/render/`): pure `transform` + `scene` + declarative `Figure` (pan/zoom/reset, highlight). Renderer is a pure, swappable consumer of engine output; tested headlessly via `react-dom/server`.
  - **Phase 3** — store/app shell (`src/store/geoStore.ts`, Zustand + zundo). **Fact list is the source of truth; the figure is derived by `replay`.** Facts are select/deselect/delete-able (ADR-010), dependents auto-drop reversibly. Hebrew/RTL, undo/redo, clear.
  - **Phase 4** — grammar parser (`src/parser/parse.ts`): deterministic, offline, bilingual `utterance → command[]`; keyword-order-independent; `not-handled` is the Phase-7 LLM boundary. **The text box is live.**
  - **Phase 5a** — quad, parallelogram, segment, line∩line; **corpus Q1 reproduced** from typed He/En utterances.
  - **Polygon family** — triangle, rectangle, rhombus, trapezoid; **in-app command reference** (`parser/catalog.ts` → "What can I type?" panel, open by default).
  - **Phase 5d (first slice)** — constraint-driven DOF: `angle BEA = 90` with E on AC now *solves* E to the perpendicular foot (ADR-012).
  - **Decisions made this session:** ADR-009 (redefinition is a conflict) → amended by **ADR-011** (re-placing a free point is a *move*); **ADR-010** (facts select/deselect/delete, replay model); **ADR-012** (constraints solve a free DOF — first slice done); **ADR-013** (shapes build on existing points / composition). Plus the recorded rationale for keeping Phase 7 (LLM) after Phase 5.
  - **Notable bugs fixed from real use:** duplicate fact rows on re-issue (idempotent `execute`); `square ADFG` on a parallelogram rejected (→ ADR-013); `ABCD ריבוע` order rejected (order-independent grammar); `angle BEA=90` rejected (→ 5d slice).
  - **Resume here (next):** Phase 5b proper — a **line** object to enable **parallel-line** ("BC ∥ AD") and **perpendicular + foot**, then **angle bisector** and **right-triangle** → reproduce **Q2–Q4**; then 5c (circles → Q5–Q7). Also pending: the rest of 5d (on-segment as a ray, free-point/length/parallel drivers).

## Resume pointer

See the **Status** line at the top of [09-implementation-plan.md](09-implementation-plan.md) and the "Current state / Next step" section in [../CLAUDE.md](../CLAUDE.md).
