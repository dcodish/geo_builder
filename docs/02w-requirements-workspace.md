# 02w — Functional Requirements: the shared surfaces

_The contract for what every builder shares. Registered in [`DOCS.json`](../DOCS.json) as the
`workspace` product's requirements doc ([ADR-W-041](06w-decisions-workspace.md#adr-w-041))._

## What this document owns

The surfaces a student meets in **every** builder, and the operator surface behind them:

| | lives in | this doc's ids |
|---|---|---|
| The suite chrome — frame, switcher, workbench, tool row, banner, manual | `shell/frame/` | `FR-SU-*` |
| The data panel and the ask lane | `shell/frame/` + per-product answers | `FR-DP-*` |
| Save-file envelope, naming, load audit | `shell/save.ts` | `FR-SL-*` |
| Image and question-document export | `shell/export/` | `FR-EX-*` |
| The admin dashboard and operator config | `server/` | `FR-AD-*` |
| Shared i18n, bidi isolation, number display | `shell/` | `FR-WI-*` |

**It does not own product geometry.** What a *figure* must do lives in each product's own requirements
doc ([02](02-requirements.md) for 2-D, [02c](02c-requirements-analytic.md) for analytic; `02b`/`02d`
pending). Where a shared mechanism generalises a promise a product doc already made, this document says
so rather than restating it — the prose duplication [docs/28 §1c](28-product-unification.md) identified
as the real defect.

**Why these were unwritten until 2026-09-05.** The audit behind [#904](https://github.com/dcodish/geo_builder/issues/904)
found the entire shared surface — including a 1,248-line admin dashboard and an answer-giving lane in
all four builders — with **no requirement anywhere**. Its rulings existed only as D1–D10 inside
[docs/28](28-product-unification.md), a *plan*: a plan finishes, a contract stands.

IDs are stable references. "Must" = the suite is broken without it; "Should" = desirable; "Later" =
not yet; "Withdrawn" = out of scope, with the reason and new owner named.

## The governing rule

- **FR-SU-0 (Must)** — **Shared chrome is parameterized by its caller and knows no product.** Roster,
  labels, and content arrive as data; a shared module may never branch on product identity, because
  "a fork wearing a shared file's name" ([ADR-W-016](06w-decisions-workspace.md#adr-w-016)) reintroduces
  exactly the divergence the tree exists to remove. The student-visible consequence is the testable one:
  **a change to shared chrome either changes every builder or is not a shared change.** *(Realised —
  enforced by [`BOUNDARIES.json`](../BOUNDARIES.json)'s forbidden `shell → product` edges and
  `server/__tests__/isolation.test.ts`.)*

## The suite — one learned interface

- **FR-SU-1 (Must)** — **One look.** Every builder renders the same design tokens and the same palette,
  so a student who learns one interface has learned all of them. *(Realised — `shell/theme.ts`;
  rulings D2/D3, [docs/28 §4a](28-product-unification.md).)*
- **FR-SU-2 (Must)** — **A visible builder switcher**, present in every builder, listing the suite from
  the machine registry ([`products.json`](../products.json)) rather than from code. A builder marked not
  enabled **never appears in a shipped page** — the promise that no chip can point at a 404. *(Realised —
  `shell/frame/Switcher.tsx`, [ADR-W-021](06w-decisions-workspace.md#adr-w-021); the analytic builder is
  `enabled: false` + `devOnly`, [ADR-AG-007](06c-decisions-analytic.md).)*
- **FR-SU-3 (Must)** — **One three-zone workbench:** input, canvas, and an **opt-in** data panel on its
  own side. The zones do not move between builders. *(Realised — `shell/frame/Workbench.tsx`; D1.)*
- **FR-SU-4 (Should)** — **One header and tool row.** Primary session actions are visible; secondary ones
  live behind a single overflow menu, in the same order everywhere. *(Realised — `AppFrame.tsx`,
  `ToolButton.tsx`; D4 as amended by #706.)*
- **FR-SU-5 (Must)** — **One voice for refusals and notices.** A refusal, a warning and a notice look and
  read the same in every builder; error text names the conflicting *statement*, never internal state.
  *(Realised — `shell/frame/Banner.tsx`.)*
- **FR-SU-6 (Should)** — **Every figure action lives under the canvas**, not scattered between header and
  sidebar. *(Realised — D7.)*
- **FR-SU-7 (Should)** — **A manual screen per builder, in one chrome.** Each builder documents its own
  language; the frame around that documentation is identical. *(Realised — `ManualScreen.tsx`; D9.)*
- **FR-SU-8 (Should)** — **Quick commands adapt to the moment:** large chips on an empty canvas, a compact
  row once the student is building — so the affordance teaches at the point of not-knowing and gets out of
  the way afterwards. *(Realised — `QuickChips.tsx` + `InputArea.tsx`; D9b.)*
- **FR-SU-9 (Should)** — **Tablet is supported.** In portrait the data panel becomes an overlay while the
  canvas and input stay side by side; phones are explicitly out of scope
  ([NFR-US-4](03-nonfunctional-requirements.md)). *(D10.)*
- **FR-SU-10 (Should)** — **The figure's name is one component**, mounted identically everywhere, so
  naming, renaming and the saved-file name agree across builders. *(Realised — `FigureName.tsx`.)*

## The data panel and the ask lane

The pedagogy boundary of each product still governs *what* may be answered; these are promises about the
**channel**.

- **FR-DP-1 (Must)** — **The ask lane is always present.** Never behind a button, never gated on a
  computation having run, and it does not vanish when the student adds a fact. Before this was shared,
  2-D rendered it inside the values block — so it existed only after «חשב ערכים» ran and disappeared on
  the next line. *(Realised — `shell/frame/AskLane.tsx`, [ADR-W-038](06w-decisions-workspace.md#adr-w-038).)*
- **FR-DP-2 (Must)** — **Asking is the pull.** Nothing expensive is computed until the student actually
  asks; opening the panel computes nothing. *(Realised — ADR-W-038.)*
- **FR-DP-3 (Must)** — **The panel reports what the FIGURE knows, never what one drawing happens to
  show.** A value is displayed only when it is invariant across the figure's residual freedom; a number
  true only of the current sample is not knowledge and must not be printed. This is the shared statement
  of the honesty rule each product enforces in its own engine, and it is the reason the panel can be
  trusted at all. *(Generalises the 2-D reveal contract, [FR-RV-5](02-requirements.md); 3-D states it as
  "a number drawn on the canvas must be seed-invariant knowledge".)*
- **FR-DP-4 (Must)** — **Answers are product-shaped; the lane is not.** A length with units, a vector
  equation and a complex modulus are genuinely different answers, and each product owns its rows. What is
  shared is the box, the submit, the palette and the always-there rule. *(Realised — ADR-W-038.)*
- **FR-DP-5 (Should)** — **The panel is opt-in** and never surfaces a geometric fact unbidden — the
  boundary that keeps students reaching their own conclusions ([10-pedagogy](10-pedagogy.md)).

## Save and load

- **FR-SL-1 (Must)** — **Every saved file carries an envelope** — an app marker and an integer version —
  and a foreign or future file **refuses gracefully with a clear bilingual message** rather than producing
  a corrupt figure. *(Realised — `shell/save.ts`; the complex builder ignored `version` entirely before
  the shared envelope.)*
- **FR-SL-2 (Must)** — **A save never silently overwrites.** Files are named `<name>-<suffix>.json` per
  product, with a date-stamped fallback. *(Realised — issue #20, [ADR-274](06-decisions.md#adr-274).)*
- **FR-SL-3 (Must)** — **The load reports what it could not restore.** A partially-restorable file loads
  and *says what was lost*; it neither fails silently nor pretends completeness. *(Realised —
  [ADR-242](06-decisions.md#adr-242); each product translates its own reasons.)*
- **FR-SL-4 (Should)** — **The file body is the product's own replay inputs, not its positions**, so a
  later engine that lays the same facts out differently still loads the file. *(Generalises
  [FR-HS-10](02-requirements.md).)*

## Export

- **FR-EX-1 (Should)** — **A clean, print-ready image** of the current figure, from every builder, on a
  white background at export resolution rather than screen resolution. *(Realised — `shell/export/svgToPng.ts`;
  generalises [FR-HS-5](02-requirements.md).)*
- **FR-EX-2 (Should)** — **The built question as a document**, laying out the figure beside the student's
  own numbered givens, Hebrew RTL correct in Word. **Deterministic — never LLM-generated**: the givens are
  the student's own words in entry order. *(Realised — `shell/export/questionDoc.ts`; generalises
  [FR-HS-11](02-requirements.md).)*

## The admin surface

Operator-facing, never student-facing. Privacy properties are governed by
[NFR-SE-1…3](03-nonfunctional-requirements.md) and are not restated here.

- **FR-AD-1 (Must)** — **The dashboard is password-protected**, with a signed, expiring session cookie
  verified on every request. *(Realised — `server/admin.ts`.)*
- **FR-AD-2 (Should)** — **It reports what students actually typed** — traffic, parse-outcome breakdown,
  language split, top utterances, and per-session timelines in entry order — because the queue is
  prioritised by measured demand, not intuition ([docs/22 §2](22-workflow.md)). *(Realised.)*
- **FR-AD-3 (Must)** — **Config may CHOOSE AMONG what the code already supports; it may never ASSERT
  support the code lacks.** This is the non-negotiable line on the operator surface. A product id absent
  from the registry is refused, so builder N+1 cannot be conjured from a form field. *(Realised —
  `server/adminConfig.ts`, [ADR-W-018](06w-decisions-workspace.md#adr-w-018) decision 7.)*
- **FR-AD-4 (Must)** — **A featured quick command is validated at SAVE time against that tool's own
  grammar** and refused, naming the entry and the reason, if it does not parse. Otherwise the admin page
  becomes a way to hand a student a command that fails. *(Realised for the lane whose parser the server
  can run; for the others a quick command is refused as **unsupported — honestly, not silently**.)*

## Language and display

- **FR-WI-1 (Must)** — **RTL Hebrew is the default in every builder**, English available, and toggling
  updates layout direction. *(Realised — `shell/i18n.ts`.)*
- **FR-WI-2 (Must)** — **An LTR technical run inside an RTL sentence never reverses.** `z1 = 3+4i`,
  `y = -2x + 8` and `ℓ1` read correctly inside a Hebrew refusal. Each builder had to learn this
  separately; it is now one mechanism. *(Realised — `shell/bidi.ts`.)*
- **FR-WI-3 (Should)** — **One display-number format** across builders, so the same quantity never appears
  with different precision in two tools. *(Realised — `shell/format.ts`, operator ruling 2026-08-18.)*
- **FR-WI-4 (Must)** — **Every builder can name every builder.** The switcher resolves its labels through
  each consuming product's own i18n, so a missing key is a blank chip *in that product*. *(Realised;
  the failure surfaces in a different product from the omission, which is why it is stated here.)*

## Not owned here

- **Product geometry, constructs and refusal semantics** — each product's own requirements doc.
- **Privacy, cost, security and performance** — [03-nonfunctional-requirements](03-nonfunctional-requirements.md).
- **How the shared tree is built** — `04w` (pending, [#904](https://github.com/dcodish/geo_builder/issues/904));
  the seeding rule and boundary edges are [ADR-W-016](06w-decisions-workspace.md#adr-w-016) and
  [`BOUNDARIES.json`](../BOUNDARIES.json).
