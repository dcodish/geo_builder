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
- **Git:** work is on branch `rebuild-foundation`; backed up to the private GitHub remote `https://github.com/dcodish/geo_builder` (origin; both `main` and `rebuild-foundation` pushed, 2026-06-11). Push after committing so the backup stays current — Dropbox-synced `.git` is not a real backup.
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

- **2026-06-11 — Design-review fixes (pre-5b hardening).** An architecture review flagged structural issues; all fixed before starting 5b. End state: **118 tests green, build clean.**
  - **ADR-014** — constraint-driven solving refactored from a bespoke point kind per (carrier × constraint) into one generic mechanism: `solve.ts` (constraint refs / residual / description) + `solveParam` (generic deterministic 1-D root finder) + a generic `on-segment-solved` carrier kind that embeds the driving constraint. New constraints = new residual cases, not new point kinds.
  - **DOF selection fixed** — `set-angle` now drives the first referenced point (vertex → ray1 → ray2) that has a free DOF, not only the vertex. "∠GBA = 37°" with G on AD (vertex determined, freedom in the ray point) now solves; previously it was wrongly rejected.
  - **Vision example corrected** — the docs' flagship "∠GAB = 37°" was geometrically impossible (G on AD ⇒ ∠GAB = 90° for every t); docs now use the satisfiable "∠GBA = 37°", and the impossible variant became a 5d test of the honest "cannot place" rejection.
  - **Parser misparse defense** — the dangerous failure is the silent half-parse, not the miss: added lines-first intersection phrasing ("האלכסונים AC ו-BD נחתכים בנקודה E"; note נחתך final-ך ≠ נחתכ in inflected forms), lowercase filler-word stripping in `labelRun` ("connect A to B" no longer reads T,O), word-bounded segment labels in point-on-segment ("F on the extension of AD" escalates instead of reading "th"), and a stop-on-unreadable guard (a recognised intersection keyword with an unreadable sentence aborts the parse rather than letting `segment` half-parse it). Negative corpus in `phase4.test.ts` pins all of it.
  - **GitHub backup remote added** — private repo, `git push` now backs up history beyond Dropbox.
  - Review watch-items recorded for later phases: 5c must handle both circle dependency directions (inscribed vs circumscribed phrasings); Phase-6 theorem detection should derive "definite" structurally or by jiggle-testing free DOFs, never from one drawing's coordinates.

- **2026-06-11 (cont.) — renderer polish + in-place fact editing (manual-testing session).**
  - **Lines only, no fill** — polygons are no longer filled or stroked (every shape edge is already a `segment`); the canvas is just its lines. Selection now shows as accented edges + vertices, not a fill.
  - **Label placement** — each vertex label sits in the *largest empty angular wedge* around it (`scene.ts` `outwardDir`/`labelDir`, pure + unit-tested), so labels land on the outer side and never on a line. Handles shared vertices, single edges, and collinear (midpoint → perpendicular).
  - **ADR-015 — edit a fact in place** — new store `update(id, cmd, utterance)` + an inline ✎ editor on each fact row (re-parse the phrasing, write back at the same position). "Change E to 40%" now works; previously re-typing was rejected as a redefinition conflict and delete+re-add broke replay order. The replay model (ADR-010) made this a few lines, no engine change; undoable; dependents follow or auto-drop.
  - **ADR-016 — snap to intersection** — segment crossings are a *suggestion*, never auto-created (auto-create would reintroduce figure-recognition, clutter O(N²), and be unstable under drag/alternatives). The renderer detects interior crossings of declared segments (`render/intersections.ts`, pure) and draws a faint hollow dot; clicking it creates a real named `line-line-intersection` point (host picks the next free letter). Stays constructive; behind an optional `onPickIntersection` prop so the renderer stays side-effect-free.
  - 142 tests green, build clean.

- **2026-06-11 (cont.) — composition degeneracy fix (found in manual testing).** Building `triangle ABC` then `parallelogram ABDF` in the running app drew a collapsed (collinear) parallelogram. Root cause: a composed shape (ADR-013) reused existing base corners but gave its *new free vertices* absolute template defaults, so a free non-base vertex (parallelogram/quad/trapezoid/triangle) landed on the reused edge's line. Fixed by fitting the shape template to its anchors via a similarity transform (`fitTemplate`/`placeBase` in apply.ts; `pos` threaded into `applyCommand`); see the ADR-013 amendment. **Why tests missed it:** shape tests only built standalone-from-empty, and the property-checked shapes (square/rectangle/rhombus) derive their non-base vertices from the base edge so they can't degenerate — the vulnerable (free non-base vertex) × (composed) cross had zero coverage. New `phase5-composition.test.ts` (15 tests) builds every shape standalone and on an edge, plus single-vertex sharing, derived-anchor fit, allocation (new-vs-reused point accounting), idempotency, and stability — all asserted from (x,y). 133 tests green, build clean.

- **2026-06-11 (cont.) — composition order-independence (ADR-013 amendment 2, found in manual testing).** `trapezoid ABCD` then `ריבוע RTCD` (a square on side DC, new corners named first) was rejected "C is already defined" — the existing C,D fell on the square's *derived* slots, and a shape can reuse existing points only at *free base* slots. Fix: `normalizeShapeComposition` (apply.ts) cyclically rotates the vertex tuple so existing points land on free slots before the conflict check + build (a rotation = same polygon, different start vertex). Diagonal pairs / all-vertices-declared still conflict (no rotation frees them). 147 tests green, build clean.

- **2026-06-11 (cont.) — no two nodes on the same point (ADR-017, found in manual testing).** A 3rd shape on edge CD (`מקבילית ABCD`, `ריבוע CDFG`, `מקבילית CDTY`) placed T,Y exactly on A,B — the fit rebuilt the first parallelogram on itself. Two layers: (1) `evaluate` now fails any figure with two coincident distinct points (`coincide:true`, keeps prior, explains) — a general invariant; (2) `applyStep` auto-retries a colliding composed shape with `mirrorComposition` (reflect its new free vertices across the reused edge → other side). Default side preferred; flip only on collision; if no free vertex to flip (2nd square on an edge) it errors honestly. 149 tests green, build clean.

- **2026-06-11 (cont.) — textbook-clean defaults + empty-side composition (ADR-017 amendment).** Operator wants shapes to look like textbook figures (upright, base horizontal). Required two things together: (1) a `flip` flag on the derived corner kinds (`derived`/`perp-offset`/`rotated`) so square/rectangle/rhombus can mirror to either side of their base edge without relabelling — `mirrorComposition` now reflects free vertices *and* toggles `flip`, mirroring the whole shape; (2) `chooseComposition` in `applyStep` evaluates both default and mirror and picks the side *away* from existing geometry (not only on collision). This decoupled composition from template tuning, so the standalone templates were normalised to base-on-x-axis / built-upward (parallelogram/trapezoid were base-at-top; quad had a tilted base). Net: a square on a parallelogram's edge flips to the empty side; standalone shapes are upright. NOTE the renderer auto-centres/scales, so world origin doesn't fix screen position — orientation + proportions are what matter. 150 tests green, build clean.

## Resume pointer

See the **Status** line at the top of [09-implementation-plan.md](09-implementation-plan.md) and the "Current state / Next step" section in [../CLAUDE.md](../CLAUDE.md).
