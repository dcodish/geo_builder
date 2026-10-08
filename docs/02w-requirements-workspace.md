# 02w — Functional Requirements: the shared surfaces

_The contract for what every builder shares. Registered in [`DOCS.json`](../DOCS.json) as the
`workspace` product's requirements doc ([ADR-W-041](06w-decisions-workspace.md#adr-w-041))._

## How this document is organised

By what a student meets in every builder: the governing rule; the suite chrome (the frame, the words a student
reads, typing a statement, acting on the canvas); the data panel and the ask lane; save and load;
discoverability; export; the admin surface; language and display. Each requirement is its bold promise, the
clauses still part of it, any ⚠ marker, and a **Sources** line naming the ADRs and issues that hold its history.
*Suite rulings* holds the operator rulings these promises rest on, and *Cross-builder behaviour — the one
table* is the one place that says which builder does what, so a requirement here does not repeat it.

## What this document owns

The surfaces a student meets in **every** builder, and the operator surface behind them:

| | lives in | this doc's ids |
|---|---|---|
| The suite chrome — frame, switcher, workbench, tool row, banner, manual | `shell/frame/` | `FR-SU-*` |
| The data panel and the ask lane | `shell/frame/` + per-product answers | `FR-DP-*` |
| Save-file envelope, naming, load audit | `shell/save.ts` | `FR-SL-*` |
| Discoverability — crawl files, page metadata | `deploy/homepage/` + each builder's page head | `FR-DI-*` |
| Image and question-document export | `shell/export/` | `FR-EX-*` |
| The admin dashboard and operator config | `server/` | `FR-AD-*` |
| Shared i18n, bidi isolation, number display | `shell/` | `FR-WI-*` |

**It does not own product geometry.** What a *figure* must do lives in each product's own requirements
doc ([02](02-requirements.md) for 2-D, [02b](02b-requirements-3d.md) for 3-D, [02c](02c-requirements-analytic.md)
for analytic, [02d](02d-requirements-complex.md) for complex). Where a shared mechanism generalises a promise a
product doc already made, this document says so rather than restating it.

IDs are stable references. "Must" = the suite is broken without it; "Should" = desirable; "Later" =
not yet; "Withdrawn" = out of scope, with the reason and new owner named.

## The governing rule

- **FR-SU-0 (Must)** — **Shared chrome is parameterized by its caller and knows no product.** Roster,
  labels, and content arrive as data; a shared module may never branch on product identity, because
  "a fork wearing a shared file's name" ([ADR-W-016](06w-decisions-workspace.md#adr-w-016)) reintroduces
  exactly the divergence the tree exists to remove. The student-visible consequence is the testable one:
  **a change to shared chrome either changes every builder or is not a shared change.**
  - Sources: ADR-W-016; the enforced edges are [`BOUNDARIES.json`](../BOUNDARIES.json).

## The suite — one learned interface

### The frame

- **FR-SU-1 (Must)** — **One look.** Every builder renders the same design tokens and the same palette, so a student who learns one interface has learned all of them. **⚠ Ruled to change (2026-10-07, ADR-W-118 B8 · #1596):** «✓ הציור נקבע במלואו» appears only when exactly one figure exists, in every builder. The text below describes the code until that ships. **One wording for one state**: «✓ הציור נקבע במלואו על ידי הנתונים», «דרגות חופש: N», «חושב…», the ask button «שאלו», and the undo/redo/clear/another/About row read the same in every builder (He and En), and the About opens once on a first visit in all four. The empty-canvas example chips show their math typeset, like the fact rows. Sources: rulings D2/D3 (*Suite rulings* below), [ADR-W-098](06w-decisions-workspace.md#adr-w-098), #1453, [ADR-W-100](06w-decisions-workspace.md#adr-w-100), #1530.
- **FR-SU-2 (Must)** — **A visible builder switcher**, present in every builder, listing the suite from
  the machine registry ([`products.json`](../products.json)) rather than from code. A builder marked not
  enabled **never appears in a shipped page** — the promise that no chip can point at a 404. On a phone,
  where the strip scrolls inside itself, the **current** builder's tab is always in view.
  - Sources: [ADR-W-021](06w-decisions-workspace.md#adr-w-021), [ADR-AG-007](06c-decisions-analytic.md),
    [ADR-W-097](06w-decisions-workspace.md#adr-w-097), #1458, #1861.
- **FR-SU-3 (Must)** — **One three-zone workbench:** input, canvas, and an **opt-in** data panel on its
  own side. The zones do not move between builders.
  - Sources: ruling D1 (*Suite rulings* below).
- **FR-SU-4 (Should)** — **One header and tool row.** Primary session actions are visible; secondary ones
  are visible too — save/load in the tool row, language and About as buttons on the suite bar — in the
  same order everywhere; there is no overflow menu.
  - Sources: ruling D4 (*Suite rulings* below), #706, #1861.
- **FR-SU-6 (Should)** — **Every figure action lives under the canvas**, not scattered between header and
  sidebar.
  - Sources: ruling D7.
- **FR-SU-9 (Should)** — **Tablet is supported**; phones are explicitly out of scope
  ([NFR-US-4](03-nonfunctional-requirements.md)). Below 900px every builder stacks one column: the input,
  then the figure, then the fact list, then the data panel, so the input and the top of the figure share
  the first screen.
  - Sources: [ADR-W-112](06w-decisions-workspace.md#adr-w-112), #1459 (supersedes ruling D10), #1861.
- **FR-SU-10 (Should)** — **The figure's name is one component**, mounted identically everywhere, so
  naming, renaming and the saved-file name agree across builders.

### The words a student reads

- **FR-SU-5 (Must)** — **One voice for refusals and notices.** A refusal, a warning and a notice look and
  read the same in every builder; error text names the conflicting *statement*, never internal state.
  A message may interpolate only what the student typed or the figure shows — never an engine id or noun.
  - Sources: [ADR-W-096](06w-decisions-workspace.md#adr-w-096), #1522.
- **FR-SU-7 (Should)** — **A manual screen per builder, in one chrome.** Each builder documents its own
  language; the frame around that documentation is identical. **A section shows a SAMPLE, and the sample is
  chosen rather than sliced:** the guide caps each section so it teaches rather than inventories, the entries
  it shows first are marked and not merely written first, and **every remaining row is one click away** — a
  coverage map two thirds of which a student cannot reach is not a guide. The note under a capped section says
  the tool has more COMMANDS there, never "more phrasings of these", because what is hidden are separate
  capabilities. The six are CHOSEN to span six different CAPABILITIES, not six phrasings of one. **A tool
  advertises only its OWN syntax.** **The guide speaks the student's language, not the builders':** no
  design-doc section, issue or decision number, "DOF", or name of the machinery (grammar, parser, engine,
  tier/layer, how a line is solved) in any guide entry, section title, or the refusal that points a student at
  the guide; a curriculum term («פרבולה קנונית») is not jargon.
  - Sources: ruling D9, [ADR-W-074](06w-decisions-workspace.md#adr-w-074) (and Am. 1), #1275, #1347, #1245,
    [ADR-W-101](06w-decisions-workspace.md#adr-w-101), #1456.
- **FR-SU-8 (Should)** — **Quick commands sit on the empty canvas:** large chips, so the affordance teaches
  at the point of not-knowing. ~~A compact row once the student is building~~ was withdrawn by the
  operator: *"on the input panel, I dont want to see the chips"*.
  - Sources: ruling D9b (*Suite rulings* below), [ADR-AG-064](06c-decisions-analytic.md#adr-ag-064), #1105, #1861.
- **FR-SU-11 (Should)** — **Every builder's About says the same kinds of things:** what the tool is,
  who it is for, that the figure builds one given at a time and adapts, that it draws and does not
  solve, alternative configurations where the builder has them, a «try this» sequence, and the author
  credit — in Hebrew and English. **Every sample line builds** when typed in order on an empty
  canvas.
  - Sources: [ADR-W-091](06w-decisions-workspace.md#adr-w-091), #1477.

### Typing a statement

- **FR-SU-12 (Must)** — **A symbol button types the symbol on its face**, and a comparison is recorded as
  its mathematical symbol whichever way it was entered: the `≥` button inserts `≥`, and a typed `>=` is
  recorded (row, save file, export, log) as `≥`. A button may insert a keyboard form only when its
  grammar does not read the glyph, and must say so.
  - Sources: [ADR-W-095](06w-decisions-workspace.md#adr-w-095), #1348.
- **FR-SU-15 (Must)** — **A claim to prove is never drawn as a given.** **⚠ Ruled to change (2026-10-07, ADR-W-118 B14/D3 · #1870):** the complex builder refuses a proof-verb line like the others, while keeping its claim check for a bare statement. The text below describes the code until that ships. In every builder, a line that asks the student to PROVE something — «הוכיחו כי …», «הוכח ש …», «הראו כי …», «יש להוכיח …», "prove that …", "show that …", with or without an item marker («א.», «(1)») and also when it follows a given on the same line («נתון AB = AC. הוכיחו כי AB ⊥ AC») — is refused, and nothing of the line is recorded. The refusal says that it is a claim to prove, not a given, that the tool draws the givens and does not check proofs, and quotes the claim so the student knows which part to leave out. «כי» and «ש» in their other senses («נתון כי …», «כך ש-…») and «הראו» as "show me" are never refused for this. Sources: [ADR-W-107](06w-decisions-workspace.md#adr-w-107), #1666, #1649, #1618.
- **FR-SU-16 (Must)** — **A plane-geometry sentence gets the same answer in every builder that reads plane geometry.** When a student types a plane-geometry sentence, the 2-D builder and the analytic builder give the same verdict: both build it, both refuse it, or both ask the same kind of question. The 2-D builder's verdict is the reference. The 3-D builder is to give the same verdict for the core plane families: polygons, lengths, angles, midpoints and ratios, cevians, parallel and perpendicular, and area — that parity is **parked, not realised**: most of 3-D's known-gap rows are owned by #1679, which is in the icebox (as are 2-D's own phrasing gaps, #1677). The exceptions are topic families that one builder reads by design: coordinates, equations, R³ lines and planes, named lines, parameters, coordinate notation, solids and vectors, circle geometry in 3-D, and free points in 3-D. A builder that does not read such a family answers it honestly, with a refusal, a question or the model, and never draws it as something else. A known difference is listed with the issue that will remove it. The operator's ruling: «analytics and 2d should have same user experience».
  - Sources: [ADR-W-108](06w-decisions-workspace.md#adr-w-108), #1649, [ADR-W-118](06w-decisions-workspace.md#adr-w-118) B15, #1861.

### Acting on the canvas

- **FR-SU-13 (Must)** — **A point's letter is changed where the point is.** In every builder, clicking a point opens one small popover at it. The student types the new letter, and Enter or ✓ applies it; nothing goes through the main input. A letter already in use is never merged onto: the popover says it is taken, quotes the statement that holds it in the student's own words, and offers to **exchange** the two letters («החליפו בין A ל-B»), in both directions, whichever point was clicked first. The exchange keeps every statement, keeps the drawing where it is (only the letters change places), and is undone in one step, like a rename. The same exchange can be typed («החלף בין A ל-B» / "swap A and B").
  - Sources: [ADR-W-105](06w-decisions-workspace.md#adr-w-105), [ADR-AG-192](06c-decisions-analytic.md#adr-ag-192), #1631, #1861.
- **FR-SU-14 (Must)** — **A segment is hidden or dashed where it is.** In every builder that lets a student click a segment, the click opens one small menu at it: «הסתירו קטע / הציגו קטע» and «מקווקו / רציף», with the builder's own items below (2-D: «החליפו קצוות»; analytic: the measurements). A hidden segment is not drawn, but it stays in the figure: every statement, reference, measurement and question about it still works, and the menu, reached from a faint mark on the line, shows it again. Un-hiding a dashed segment brings it back dashed. The choice is saved with the figure and comes back when the file is opened.
  - Sources: [ADR-W-106](06w-decisions-workspace.md#adr-w-106), #1653.

## Suite rulings (moved from docs/28 §4/§4a, #1861)

The operator's rulings of 2026-08-16 on how the builders relate ([ADR-W-018](06w-decisions-workspace.md#adr-w-018)),
and the interface rulings D1–D10 taken one at a time the same day, with their later amendments. The FR
lines above are the testable promises; this section is the ruling each rests on. Each ruling's state was
checked against the code on 2026-10-07.

### One learned interface (docs/28 §4)

> *"i will eventually have 4 or maybe even more builders that should all look and feel the same but in
> reality they are accessed via different links. we might have a toolbar on the ui to switch between
> them but thats it. so from a user pov he should be familiar with the tool and how to use it and what
> to expect."* (operator, 2026-08-16)

- **Separate builders at separate links.** Each builder keeps its own entry, build, `dist-*` directory
  and production path. Moving between builders is an ordinary link in the shared switcher. **One app
  with modes is rejected, not deferred**: it would change both shipped products' entry, routing, store
  bootstrap and deploy topology, and it cannot be delivered incrementally.
- **The switcher is shared chrome, driven by data, never by imports.** The roster is configuration
  ([`products.json`](../products.json)), because `shell/` may not import a product tree (FR-SU-0, FR-SU-2).
- **The bar is "familiar", not "identical".** A student who has used one builder finds the next one's
  *frame* already learned: the header, the input box and palette, the fact list, configuration cycling,
  save and load, and the voice of a refusal. The subject matter inside differs by design. For plane
  geometry the bar is higher: the verdict and the display follow 2-D (FR-SU-16;
  [ADR-W-108](06w-decisions-workspace.md#adr-w-108); [ADR-W-118](06w-decisions-workspace.md#adr-w-118) B1).
- **"What to expect" is a testable contract, not a style guide.** A control a student learned in one
  builder that is missing, misplaced or subtly different in another breaks the ruling. The cross-product
  locks ([04w](04w-design-shell.md), the pattern formerly docs/28 §5c) are how it is checked.
- **`shell/` does not assume one product per page.** Nothing uses this; keeping the frame parameterized
  costs nothing and keeps "we chose not to" from becoming "we cannot".

### The interface rulings D1–D10 (docs/28 §4a)

- **D1 — Three columns, the data panel opt-in on its own side.** 3-D's structure with 2-D's visual
  design: input and fact list at the reading start, the canvas in the middle, the data panel at the end,
  separating "what I typed" from "what the figure knows". *In force* (FR-SU-3, `Workbench.tsx`).
- **D2 — Styling. Superseded by the operator, 2026-08-18: shared COMPONENTS, not shared values.** *"the
  look is different so it cannot be the same code base — it's not really shared"*. Every chrome surface is
  one `shell/` component mounted by every builder, and each product passes content (symbols,
  placeholders, handlers, rows), never its own chrome. The engine boundary is unchanged: canvases,
  parsers and stores stay per product ([ADR-W-003](06w-decisions-workspace.md#adr-w-003)). The original
  ruling (Tailwind carrying 2-D's token values) is history.
- **D3 — One colour palette, 2-D's values**: slate neutrals, blue-600 primary, violet accent,
  ok/warn/danger (`shell/theme.ts`, FR-SU-1). A builder's identity is the switcher's active state, not
  its colours. Calibrated 2026-08-17 (#706): 2-D's palette is the base, plus a polish pass on hierarchy,
  spacing and affordances. **The SYMBOL palette is not identical** (operator: *"we need to ensure that
  only relevant symbols appear per tool"*): a shared core plus a per-builder extension, and a builder
  never offers a glyph it refuses in every position (#525, #511). *In force.*
- **D4 — The header follows the level model. Done; the `⋯` menu is retired.** *A control lives at the
  level of the thing it acts on* (operator, 2026-08-17):
  - Level 1, the **suite bar** (which tool): the builder strip, the interface language, About.
  - Level 2, the **tool row** (this session): the builder's title beside its session actions; save and
    load are visible buttons there.
  - Level 3, the **surface** (one surface): figure actions under the canvas (D7), the palette with the
    input box, row operations with the fact list.

  The switcher is a visible strip with every builder inline; past its inline limit the tail folds into
  «עוד ▾». The figure's name sits centred above the canvas, and the tool row's actions cluster at the
  reading start. The `⋯` menu was retired on 2026-08-17 (*"there are 2 options there that can be on the
  toolbar as is"*): hiding is never the default again. The titles are the curriculum's subject names,
  and a builder's title and strip label are the same name: הנדסת המישור, הנדסת המרחב, מספרים מרוכבים
  (and analytic's גאומטריה אנליטית). *Realised* (FR-SU-4, `AppFrame.tsx`, `Switcher.tsx`).
- **D5 — The input area: one preview doing both jobs, and a wrap-selection palette.** The preview renders
  the maths and isolates the bidi, and shows only when either job applies. A palette button wraps the
  selection; an empty selection is a caret insert. *In force* (`InputArea.tsx`, `shell/symbols.ts`).
- **D6 — The fact list: disable, edit in place and delete, in every builder.** Disabling answers "what if
  I hadn't said this?" and is reversible; deleting answers "I typed that by mistake"; editing keeps the
  statement's position, because order is meaningful in a construction. An edited line re-parses through
  the same gates as a typed one. Re-enabling or committing an edit is gated on each product's own refusal
  surface, and editing a muted line rewrites its text only, gating for real on re-enable. *Realised* in
  all four builders (`FactList.tsx`; `shell/__tests__/fact-list-ops-parity-1548.test.ts`).
- **D7 — Every figure action lives under the canvas**, in every builder: *things I do to the figure*
  beneath the drawing, *things I said* in the input column. The cost was accepted: undo and redo sit one
  column away from the list they rewind. *In force* (FR-SU-6). The freedom cue moved into the data panel's
  head-line (D8).
- **D8 — The data panel: one skeleton, one control, per-builder rows.** The same sections in the same
  order in every builder (points · measures · relations · parameters · ask), each filling only the rows
  that apply; an empty section is absent (`DataPanel.tsx`). Its head-line carries the freedom count
  («דרגות חופש: N»), never a per-DOF listing or a configuration count; a contradiction stays on the
  always-visible strip (operator, 2026-08-18). **One control opens the panel.**
  **⚠ Ruled to change (2026-10-07, ADR-W-118 B15/D4 · #1871):** that control is a «נתונים» checkbox in
  all four builders, with a "computing" state where the values are expensive. Today every builder opens
  the panel with the shared head button, and 2-D also keeps a separate compute button. **Binding
  whatever the control:** the panel prints a value only when it is knowledge (FR-DP-3).
- **D9 — A separate manual SCREEN per builder, plus quick commands in the app** (operator: *"it should be
  a separate screen altogether for each tool with examples of how to enter commands … the tool should
  have some quick commands"*). The manual teaches; the quick commands do. **The manual stays
  catalog-backed**: every catalog entry appears in it, and every example it prints runs through the
  real parser in the test suite. About and the privacy note are a small modal mounted by every builder
  (FR-SU-7, FR-SU-11). *In force.*
- **D9b — Quick commands: big chips on the empty canvas. Half withdrawn.** The empty-state half stands,
  and every chip shown on the empty canvas builds there ([ADR-3D-288](06b-decisions-3d.md#adr-3d-288)).
  The other half, a compact strip above the input once a figure exists, was withdrawn by the operator on
  2026-09-16 (#1105, [ADR-AG-064](06c-decisions-analytic.md#adr-ag-064)) on seeing it built for the first
  time: *"on the input panel, I dont want to see the chips. behavior should be like 2d and 3d tools"*.
  Analytic was the only builder that had built that half (FR-SU-8).
- **D10 — Tablet. Superseded by [ADR-W-112](06w-decisions-workspace.md#adr-w-112)** (#1459, operator
  2026-09-27: *"Input above the canvas"*). Below 900px every builder stacks one column (input, figure,
  fact list, data panel); the portrait overlay of the data panel is gone. Tablets stay in scope and
  phones out of it (NFR-US-4, FR-SU-9).

## Cross-builder behaviour — the one table (#1861, ruling B3)

**This table is the single place to look up how a student-visible behaviour works in each builder.** The
principles behind each row are in [docs/10](10-pedagogy.md). For plane geometry, 2-D is the reference
for input **and** display (P12, [ADR-W-118](06w-decisions-workspace.md#adr-w-118) B1). Every cell
that differs from 2-D carries one of these statuses:

| Status | Meaning |
| --- | --- |
| **Same** | Every builder behaves alike |
| **Ruled** | A difference the operator decided (the ruling is cited) |
| **Ruled change** | He has ruled; the code has not caught up; the issue is named |
| **Gap** | A known difference with an open or parked issue |
| **Open** | Not ruled. Ask him before building anything that touches it (CLAUDE.md rule 7) |

Before building anything a student sees in a non-2-D builder, find its row. A new behaviour with no row is
**Open**. Measured 2026-10-07 at `de335e5c`, from the audit's cross-tool pass and the code.

| Behaviour | 2-D | 3-D | Analytic | Complex | Status |
| --- | --- | --- | --- | --- | --- |
| Plane-geometry sentence verdicts | reference | core families; most gaps parked | locked to 2-D | n/a (not plane geometry) | **Ruled** — ADR-W-108; 3-D parity parked (#1679, icebox; B15) |
| Givens list: mute, edit, delete | shared list | same | same | same | **Same** |
| Undo / redo | yes | yes | yes | yes | **Same** |
| Letter popover and swap | yes | yes | yes | n/a | **Same** (ADR-W-105) |
| Data-panel control | the shared panel head toggle, plus a separate «חשב ערכים» compute button | the shared panel head toggle («נתונים» / «הצגה») | the shared panel head toggle, labelled «הצג נתונים» | the shared panel head toggle («נתונים») | **Ruled change** — one «נתונים» control everywhere, with a computing state where values are expensive; 2-D's separate compute button goes (D4, #1871) |
| A stated length on the figure | label | label | label | stated numbers plotted | **Same** |
| A stated angle | arc with value or letter | arc | arc | n/a | **Same** |
| A right angle | knee | knee | knee (also for an asked-for height) | n/a | **Same** |
| A stated equality «AB = AC» at rest | nothing | nothing | ticks | n/a | **Ruled change** — nothing at rest anywhere (B2, #1805) |
| The opt-in relations layer | yes (hover) | none | none | none | **Ruled** — 2-D only; not ported (operator, 2026-10-07: "no need to port this capability"). Elsewhere relations live in the givens list |
| Parallel marks | none | none | none | n/a | **Same** |
| The area label | «13» | — | «S=13» | — | **Ruled change** — «S=13» everywhere (B9, #1865) |
| A computed value on the canvas | opt-in layer only | coordinates while the panel is open | a circle centre's coordinates when known | every plotted reading | **Ruled** — canvas = inputs (ADR-W-047); exceptions per docs/10 P5. **Ruled change**: complex (B6, D1, #1862); analytic foci and directrix (B7, #1863) |
| Letter ↔ value chip | yes | yes | no | no | **Gap** — analytic #1725 (icebox); complex follows from B6 (#1862) |
| «✓ הציור נקבע במלואו» | only when one figure fits | whenever nothing is free | whenever nothing is free | whenever nothing is free | **Ruled change** — 2-D's rule everywhere (B8, #1596) |
| Note for a choice the tool made | yes | n/a | no | n/a | **Ruled change** — port to analytic (B10, #1864) |
| «הציגו תצורה אחרת» wording | locked | same | same | same | **Same** (ADR-W-098) |
| Two possible values | not shown | both, as S₁/S₂ | both, with «או» | withheld | **Ruled change** — both, with «או», everywhere (B12, #1867). Three or more: no value shown; the student cycles configurations (operator, 2026-10-07) |
| "Not understood" refusal | «לא הצלחתי לקרוא את זה עדיין — נסו…» | «לא הצלחתי להבין את הנתון…» | «לא הצלחתי להבין את המשפט» | as analytic | **Ruled change** — 2-D's wording everywhere (B13, #1868) |
| "The tool's limit, not your mistake" | no | yes | no | no | **Ruled change** — everywhere (B13, #1868) |
| Student-text check (ADR-W-096) | no | yes | no | no | **Gap** — #1522 (icebox) |
| Restated fact «כבר נובע…» | yes | yes | yes | no | **Gap** — #1565 |
| A one-line compound that loses a part («משולש ABC ישר זווית ב-B», «…בנקודה E שהיא אמצע BD») | refused whole, parts listed; the right-angle syntax taught (ADR-603) | records it, the angle elsewhere | hands it to the model, or reads both parts | n/a | **Ruled change** — refused in every builder (2026-10-08, #1888/#1889, ADR-W-120); 3-D and analytic: #1888; a dropped ROLE word (#1904, ADR-604) the same way |
| Two points on one spot | refused or redrawn | same | same | not measured | **Same** for 2-D/3-D/analytic (ADR-W-066/072); complex **Open** |
| A declared polygon forced flat | refused | refused | refused | n/a | **Same** (ADR-W-115) |
| A proof target «הוכיחו כי» | refused | refused | refused | checked as a claim | **Ruled change** — refuse proof verbs, keep the bare-claim check (B14, D3, #1870) |
| AI fallback for unread input | yes | yes | yes | none | **Ruled change** — build it (B14, #1869) |
| Save, load, share link | shared | same | same | same | **Same** |
| Image export | yes | yes | yes | yes | **Same** |
| Question export «הורידו שאלה» | yes | yes | no | no | **Ruled change** — every builder (B16, #1872) |
| Empty state | «מה בונים היום?» | same | its own title and hint | same as 2-D | **Ruled change** — shared title, analytic keeps its hint (B15, #1871) |
| Hide a segment | menu, not undoable | no menu | menu, undoable | n/a | **Ruled change** — 2-D becomes undoable (B15, #1871); 3-D **Ruled** n/a |
| Header, suite bar, About | shared frame | same | same | same | **Same** |
| Language toggle and RTL | shared | same | same | same | **Same** (bidi: three kits held by one fixture) |
| Commands panel / manual | shared | same | same | same | **Same** |
| Symbol palette | shared core + extension | same | same | same | **Same** (drift tracked: #725, #1828) |
| Theorem surfacing | engine only; surface off | none | formula trace | formula sheet in the panel | **Ruled** — off (#740, B4) |

## The data panel and the ask lane

The pedagogy boundary of each product still governs *what* may be answered; these are promises about the
**channel**.

- **FR-DP-1 (Must)** — **The ask lane is always present.** Never behind a button, never gated on a
  computation having run, and it does not vanish when the student adds a fact.
  - Sources: [ADR-W-038](06w-decisions-workspace.md#adr-w-038).
- **FR-DP-2 (Must)** — **Asking is the pull.** Nothing expensive is computed until the student actually
  asks; opening the panel computes nothing.
  - Sources: ADR-W-038.
- **FR-DP-3 (Must)** — **The panel reports what the FIGURE knows, never what one drawing happens to
  show.** A value is displayed only when it is invariant across the figure's residual freedom; a number
  true only of the current sample is not knowledge and must not be printed. This is the shared statement
  of the honesty rule each product enforces in its own engine. What the CANVAS carries is a separate
  rule — the student's inputs, with recorded exceptions.
  - Sources: [ADR-W-047](06w-decisions-workspace.md#adr-w-047), [ADR-W-118](06w-decisions-workspace.md#adr-w-118)
    B7, #1861; generalises the 2-D reveal contract, [FR-RV-5](02-requirements.md).
- **FR-DP-4 (Must)** — **Answers are product-shaped; the lane is not.** A length with units, a vector
  equation and a complex modulus are genuinely different answers, and each product owns its rows. What is
  shared is the box, the submit, the palette and the always-there rule.
  - Sources: ADR-W-038.
- **FR-DP-5 (Should)** — **The panel is opt-in** and never surfaces a geometric fact unbidden — the
  boundary that keeps students reaching their own conclusions ([10-pedagogy](10-pedagogy.md)).

## Save and load

- **FR-SL-1 (Must)** — **Every saved file carries an envelope** — an app marker and an integer version —
  and a foreign or future file **refuses gracefully with a clear bilingual message** rather than producing
  a corrupt figure.
- **FR-SL-2 (Must)** — **A save never silently overwrites.** Files are named `<name>-<suffix>.json` per
  product, with a date-stamped fallback.
  - Sources: [ADR-274](06-decisions.md#adr-274), #20.
- **FR-SL-3 (Must)** — **The load reports what it could not restore.** A partially-restorable file loads
  and *says what was lost*; it neither fails silently nor pretends completeness. Each product translates its
  own reasons.
  - Sources: [ADR-242](06-decisions.md#adr-242).
- **FR-SL-4 (Should)** — **The file body is the product's own replay inputs, not its positions**, so a
  later engine that lays the same facts out differently still loads the file.
  - Sources: generalises [02](02-requirements.md) FR-HS-10.
- **FR-SL-5 (Must)** — **A builder opens EMPTY.** Every load — from the switcher, a bookmark, or a
  refresh — starts with a clean canvas and an empty list; **no product restores a previous session on
  its own.** One rule for all builders, so a student opening a tool to start a new question is never
  evaluated against a figure they did not build. A session may be PERSISTED and OFFERED (FR-SL-6) — what
  is forbidden is restoring it without being asked. Storage is reached through ONE module,
  `shell/session/persist.ts`, and never directly from a product tree.
  - Sources: [ADR-W-046](06w-decisions-workspace.md#adr-w-046), #919,
    [ADR-W-078](06w-decisions-workspace.md#adr-w-078), #1238.
- **FR-SL-6 (Must)** — **Unsaved work survives a reload as an OFFER.** When a builder loads and a
  recent session exists, it says so and gives the student two choices — continue where they left off,
  or start fresh — and does nothing until one is chosen. The stored payload is the product's own save
  envelope, so **restoring is loading**: a statement the tool can no longer rebuild is reported by the
  load audit (FR-SL-3), never dropped in silence, and positions are still never stored (FR-SL-4). A
  session is offered for a bounded window and is forgotten when the student starts fresh or clears the
  canvas; storage that is unavailable, blocked or full simply means no offer.
  - Sources: ADR-W-078, #1238; un-withdraws [02](02-requirements.md) FR-HS-4 in this form only.
- **FR-SL-7 (Should)** — **A figure travels as a LINK.** A teacher can copy the current figure as a
  single URL, send it over an ordinary channel (WhatsApp), and a student who taps it lands in the
  builder **with that figure, fully editable** — no account, no download, no "open with". The figure
  rides in the URL's **fragment**, so it is never sent to any server and no student's work is logged
  by following a link; and the link is **measured before it is offered** — a figure too large for a
  safe URL is refused with a reason, never emitted truncated, because a truncated link opens as a
  figure missing statements that nobody can see are missing. The payload is the product's own save
  envelope, trimmed where there is anything to trim, so opening a link is a LOAD and inherits every
  refusal and the load audit (FR-SL-3). The same button is the student's way to hand work back. A
  link that arrives while the student **already has work on the canvas asks before replacing it** —
  the same rule as FR-SL-6, for the same reason: work a student cannot get back is never discarded
  on their behalf.
  - Sources: [ADR-W-079](06w-decisions-workspace.md#adr-w-079), #1189,
    [ADR-W-080](06w-decisions-workspace.md#adr-w-080), #1372; realises [02](02-requirements.md) FR-HS-6.
- **FR-SL-8 (Should)** — **A shared figure has a SHORT link and shows a picture of itself.** The link
  a teacher sends is short enough to look trustworthy in a chat — a long opaque blob reads as
  phishing to a teenager, a parent or a school — and chat clients that preview links show the
  FIGURE, so the recipient can see what they are being sent before tapping. This necessarily means
  the figure is **stored on the server**: a preview crawler cannot see a URL fragment, so FR-SL-7's
  privacy property (nothing leaves the machine) cannot coexist with a preview, and the in-app
  privacy note says so plainly rather than going stale. A stored share is **append-only** — nothing
  can overwrite or alter a figure someone already holds a link to, so a link means the same figure
  forever — and ids are unguessable, so the store cannot be walked. Storage is bounded by an
  allocation (2 GB, by operator ruling); past it a new share is **refused with a reason** and links
  already sent keep working, because silently deleting an old figure to make room is the one failure a
  teacher could not diagnose. FR-SL-7's long link remains as the offline fallback and whenever the store
  cannot be reached. The operator is **warned before it fills**: the admin dashboard shows a banner from
  80% of the allocation, red from 95%, saying what refuses at 100%, and every store-full refusal writes a
  line to the proxy journal. No lower cap and no eviction — a warning only, by operator ruling.
  - Sources: [ADR-W-081](06w-decisions-workspace.md#adr-w-081), #1374,
    [ADR-W-104](06w-decisions-workspace.md#adr-w-104), #1380.
- **FR-SL-9 (Must)** — **An arriving figure is bounded.** A link, a short link, a file or a restored
  session is input from someone else, so its size is checked on ARRIVAL — never trusted because the
  sender's tool would not have emitted it. A figure over a stated ceiling (characters, inflated bytes,
  and statements) is **refused before anything replays**, with a message that says it is too large to
  open rather than calling it broken, and the student's canvas is left as it was. The share store refuses
  to hold what the builders would refuse to open.
  - Sources: [ADR-W-082](06w-decisions-workspace.md#adr-w-082), #1379.
- **FR-SL-10 (Must)** — **A shared figure never becomes a search result.** Every `/g/` response — the
  page, its preview image, and the dead-link answer — tells search engines not to index it, because the
  page's title is whatever the uploader typed, and an indexable one would put a stranger's words on a
  themathbible.com result. The chat-app preview (FR-SL-8) is unaffected: it reads the page, it does not
  index it.
  - Sources: [ADR-W-084](06w-decisions-workspace.md#adr-w-084), #1384.

## Discoverability

How a student who has never heard of the tools finds them — through a search engine or an AI answer
engine. Owned by the site-root files in `deploy/homepage/` and by each builder's page head.

- **FR-DI-1 (Should)** — **The site answers a crawler.** A `robots.txt` that admits **every** crawler,
  AI answer and training crawlers included (operator ruling, #1384: reach is the point of a free tool),
  and names a sitemap; a sitemap listing the homepage and **every** builder in `products.json`; a site
  icon a browser and a search result can show; and **one host** — `www.` redirects to the apex rather
  than serving a second copy.
  - Sources: ADR-W-084, #1384.
- **FR-DI-2 (Should)** — **Every builder's page says what it is, without JavaScript.** Its HTML carries
  a title and description in the operator-approved wording (Hebrew only — one URL per builder, no
  English variant is indexed), a canonical URL from the product registry, a link-preview card whose
  picture is a figure the builder really draws, structured data (`WebApplication`), and — for crawlers
  that do not run JavaScript, which is most AI crawlers — a readable block saying what the tool is, how
  to use it, and **the product's own featured catalog examples**, which the app replaces when it
  starts. A builder with no page cannot be built. The homepage carries the same, and promises nothing
  a tool does not currently do.
  - Sources: [ADR-W-085](06w-decisions-workspace.md#adr-w-085), #1383.
- **FR-DI-3 (Should)** — **A student searching for GeoGebra can find an honest comparison.** One page,
  `/geogebra/`, says what the tools do differently (the question's own sentences, not tools or command
  syntax) **and where GeoGebra is the better tool**, in wording the operator approved sentence by
  sentence. It names GeoGebra only to compare — no logo, nothing imitating its identity, and a line
  saying the site is not affiliated. Every example on it builds, and its «open the example» link opens
  that figure. Claims about GeoGebra are re-checked against GeoGebra's own site before any edit.
  - Sources: [ADR-W-086](06w-decisions-workspace.md#adr-w-086), #1386.

## Export

- **FR-EX-1 (Should)** — **A clean, print-ready image** of the current figure, from every builder, on a
  white background at export resolution rather than screen resolution.
  - Sources: generalises [02](02-requirements.md) FR-HS-5.
- **FR-EX-2 (Should)** — **⚠ Ruled to change (2026-10-07, ADR-W-118 B16 · #1872):** «הורידו שאלה» is offered in every builder, the analytic and complex builders included; today only 2-D and 3-D offer it. The text below describes the code until that ships. **The built question as a document**, laying out the figure beside the student's
  own numbered givens, Hebrew RTL correct in Word. **Deterministic — never LLM-generated**: the givens are
  the student's own words in entry order.
  - Sources: generalises [02](02-requirements.md) FR-HS-11.
- **FR-EX-3 (Must)** — **A downloaded image never contains on-screen chrome, in every builder.** What is
  painted only to be interacted with — hover marks, crossing offers, hit rings, hidden-item ghosts,
  selection accents, edit affordances — is not part of the figure and never reaches a worksheet. The
  contract is one shared strip (`[data-noexport]` + the `data-export-*` accent reverts in
  `shell/export/svgToPng.ts`); the opt-in is each renderer's tagging, and each product carries a lock
  that renders its figure with every chrome affordance ON and asserts the stripped ink is its chrome-free
  render — so a product cannot ship untagged chrome by forgetting to opt in. A new builder cannot ship an
  image export without that lock.
  - Sources: [ADR-W-051](06w-decisions-workspace.md#adr-w-051), [ADR-AG-151](06c-decisions-analytic.md#adr-ag-151),
    #1391.

## The admin surface

Operator-facing, never student-facing. Privacy properties are governed by
[NFR-SE-1…3](03-nonfunctional-requirements.md) and are not restated here.

- **FR-AD-1 (Must)** — **The dashboard is password-protected**, with a signed, expiring session cookie
  verified on every request.
- **FR-AD-2 (Should)** — **It reports what students actually typed** — traffic, parse-outcome breakdown,
  language split, top utterances, and per-session timelines in entry order — because the queue is
  prioritised by measured demand, not intuition ([docs/22 §2](22-workflow.md)).
- **FR-AD-3 (Must)** — **Config may CHOOSE AMONG what the code already supports; it may never ASSERT
  support the code lacks.** This is the non-negotiable line on the operator surface. A product id absent
  from the registry is refused, so builder N+1 cannot be conjured from a form field.
  - Sources: [ADR-W-018](06w-decisions-workspace.md#adr-w-018) decision 7.
- **FR-AD-4 (Must)** — **A featured quick command is validated at SAVE time against that tool's own
  grammar** and refused, naming the entry and the reason, if it does not parse. For a tool whose parser
  the server cannot run, a quick command is refused as **unsupported — honestly, not silently**.

## Language and display

- **FR-WI-1 (Must)** — **RTL Hebrew is the default in every builder**, English available, and toggling
  updates layout direction.
- **FR-WI-2 (Must)** — **An LTR technical run inside an RTL sentence never reverses.** `z1 = 3+4i`,
  `y = -2x + 8` and `ℓ1` read correctly inside a Hebrew refusal. Every builder is held to one shared
  fixture table of these cases.
  - Sources: #1296, #1861; the three bidi kits and their table are [04w](04w-design-shell.md).
- **FR-WI-3 (Should)** — **One display-number format** across builders, so the same quantity never appears
  with different precision in two tools.
- **FR-WI-4 (Must)** — **Every builder can name every builder.** The switcher resolves its labels through
  each consuming product's own i18n, so a missing key is a blank chip *in that product*.
- **FR-WI-5 (Must)** — **A statement row reads in the direction of its CONTENT, in every builder.** A
  row with no Hebrew letter («∠ABC = 90», «|AB| = 5») is LTR, so a leading `∠` stays in front. A row
  with Hebrew is RTL, even when it opens with a Latin label («K על AB»). The same holds in the row's
  edit box.
  - Sources: [ADR-W-088](06w-decisions-workspace.md#adr-w-088).

## Not owned here

- **Product geometry, constructs and refusal semantics** — each product's own requirements doc.
- **Privacy, cost, security and performance** — [03-nonfunctional-requirements](03-nonfunctional-requirements.md).
- **How the shared tree is built** — [04w](04w-design-shell.md);
  the seeding rule and boundary edges are [ADR-W-016](06w-decisions-workspace.md#adr-w-016) and
  [`BOUNDARIES.json`](../BOUNDARIES.json).
