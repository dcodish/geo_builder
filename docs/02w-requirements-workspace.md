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
| Discoverability — crawl files, page metadata | `deploy/homepage/` + each builder's page head | `FR-DI-*` |
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
  language; the frame around that documentation is identical. **A section shows a SAMPLE, and the sample is chosen rather than sliced:** the guide caps each section so it teaches rather than inventories, the entries it shows first are marked and not merely written first, and **every remaining row is one click away** — a coverage map two thirds of which a student cannot reach is not a guide. The note under a capped section says the tool has more COMMANDS there, never "more phrasings of these", because what is hidden are separate capabilities. *(Realised — `ManualScreen.tsx`; D9; [ADR-W-074](06w-decisions-workspace.md#adr-w-074), #1275. The six are CHOSEN to span six different CAPABILITIES, not six phrasings of one — a section that leads with four ways to state an angle teaches a student that the tool does one thing. Operator-approved per section, 2026-09-22, and a capped section featuring fewer than six fails the suite ([ADR-W-074](06w-decisions-workspace.md#adr-w-074) Am. 1, #1347). **A tool advertises only its OWN syntax:** coordinate placement left the 2-D catalog, because it belongs to the analytic Builder (#1245).)*
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
- **FR-SL-5 (Must)** — **A builder opens EMPTY.** Every load — from the switcher, a bookmark, or a
  refresh — starts with a clean canvas and an empty list; **no product restores a previous session on
  its own.** One rule for all builders, so a student opening a tool to start a new question is never
  evaluated against a figure they did not build. *(Operator ruling 2026-09-06 —
  [ADR-W-046](06w-decisions-workspace.md#adr-w-046), #919. **Amended 2026-09-21
  ([ADR-W-078](06w-decisions-workspace.md#adr-w-078), #1238):** a session may now be PERSISTED and
  OFFERED (FR-SL-6) — what is forbidden is restoring it without being asked. The clause "no product
  tree reads or writes a session key" narrows accordingly: storage is reached through ONE module,
  `shell/session/persist.ts`, and never directly from a product tree. Lock:
  `src-complex/__tests__/no-session-restore-919.test.ts`, asserting both directions.)*
- **FR-SL-6 (Must)** — **Unsaved work survives a reload as an OFFER.** When a builder loads and a
  recent session exists, it says so and gives the student two choices — continue where they left off,
  or start fresh — and does nothing until one is chosen. A student who switches apps, takes a call or
  locks their phone does not lose an hour's figure; a student who came to start a new question is not
  handed an old one. The stored payload is the product's own save envelope, so **restoring is
  loading**: a statement the tool can no longer rebuild is reported by the load audit (FR-SL-3), never
  dropped in silence, and positions are still never stored (FR-SL-4). A session is offered for a
  bounded window and is forgotten when the student starts fresh or clears the canvas; storage that is
  unavailable, blocked or full simply means no offer. *(Operator ruling 2026-09-21 —
  [ADR-W-078](06w-decisions-workspace.md#adr-w-078), #1238; un-withdraws [02](02-requirements.md)
  FR-HS-4 in this form only. Locks: `shell/__tests__/session-persist-1238.test.ts`, the cross-product
  `session-offer-1238.test.ts` in each tree, and a meta-lock over the shared checks.)*
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
  on their behalf. *(Realised in ALL FOUR builders —
  [ADR-W-079](06w-decisions-workspace.md#adr-w-079) (#1189, 2-D) and
  [ADR-W-080](06w-decisions-workspace.md#adr-w-080) (#1372, the three siblings); realises
  [02](02-requirements.md) FR-HS-6. Measured per product: 2-D worst case 1,162 characters over its
  fixture corpus, 3-D 1,008 over its 31, analytic 407 for a real 13-line session — against a 2,000
  threshold. A short link through the proxy, with a preview image, is
  [#1374](https://github.com/dcodish/geo_builder/issues/1374) and deliberately separate — it would
  put figures on a server, which this does not.)*
- **FR-SL-8 (Should)** — **A shared figure has a SHORT link and shows a picture of itself.** The link
  a teacher sends is short enough to look trustworthy in a chat — a long opaque blob reads as
  phishing to a teenager, a parent or a school — and chat clients that preview links show the
  FIGURE, so the recipient can see what they are being sent before tapping. This necessarily means
  the figure is **stored on the server**: a preview crawler cannot see a URL fragment, so FR-SL-7's
  privacy property (nothing leaves the machine) cannot coexist with a preview, and the in-app
  privacy note says so plainly rather than going stale. A stored share is **append-only** — nothing
  can overwrite or alter a figure someone already holds a link to, so a link means the same figure
  forever — and ids are unguessable, so the store cannot be walked. Storage is bounded by an
  allocation; past it a new share is **refused with a reason** and links already sent keep working,
  because silently deleting an old figure to make room is the one failure a teacher could not
  diagnose. FR-SL-7's long link remains as the offline fallback and whenever the store cannot be
  reached. *(Realised — [ADR-W-081](06w-decisions-workspace.md#adr-w-081), #1374. Operator ruling
  2026-09-23: 2 GB allocated, usage tracked on the admin dashboard rather than by push alert;
  measured at ~50 KB a share, so ~40,000 shares.)*
- **FR-SL-9 (Must)** — **An arriving figure is bounded.** A link, a short link, a file or a restored
  session is input from someone else, so its size is checked on ARRIVAL — never trusted because the
  sender's tool would not have emitted it. A figure over a stated ceiling (characters, inflated bytes,
  and statements — measured at ~2.5× the largest real figure) is **refused before anything replays**,
  with a message that says it is too large to open rather than calling it broken, and the student's
  canvas is left as it was. The share store refuses to hold what the builders would refuse to open.
  *(Realised in all four builders and the store — [ADR-W-082](06w-decisions-workspace.md#adr-w-082), #1379.)*
- **FR-SL-10 (Must)** — **A shared figure never becomes a search result.** Every `/g/` response — the
  page, its preview image, and the dead-link answer — tells search engines not to index it, because the
  page's title is whatever the uploader typed, and an indexable one would put a stranger's words on a
  themathbible.com result. The chat-app preview (FR-SL-8) is unaffected: it reads the page, it does not
  index it. *(Realised — [ADR-W-084](06w-decisions-workspace.md#adr-w-084), #1384.)*

## Discoverability

How a student who has never heard of the tools finds them — through a search engine or an AI answer
engine. Owned by the site-root files in `deploy/homepage/` and by each builder's page head.

- **FR-DI-1 (Should)** — **The site answers a crawler.** A `robots.txt` that admits **every** crawler,
  AI answer and training crawlers included (operator ruling, #1384: reach is the point of a free tool),
  and names a sitemap; a sitemap listing the homepage and **every** builder in `products.json`; a site
  icon a browser and a search result can show; and **one host** — `www.` redirects to the apex rather
  than serving a second copy. *(Realised — [ADR-W-084](06w-decisions-workspace.md#adr-w-084), #1384; the
  `www.` redirect is a hosting-panel setting, see [RUNBOOK](RUNBOOK.md).)*
- **FR-DI-2 (Should)** — **Every builder's page says what it is, without JavaScript.** Its HTML carries
  a title and description in the operator-approved wording (Hebrew only — one URL per builder, no
  English variant is indexed), a canonical URL from the product registry, a link-preview card whose
  picture is a figure the builder really draws, structured data (`WebApplication`), and — for crawlers
  that do not run JavaScript, which is most AI crawlers — a readable block saying what the tool is, how
  to use it, and **the product's own featured catalog examples**, which the app replaces when it
  starts. A builder with no page cannot be built. The homepage carries the same, and promises nothing
  a tool does not currently do. *(Realised — [ADR-W-085](06w-decisions-workspace.md#adr-w-085), #1383.)*

- **FR-DI-3 (Should)** — **A student searching for GeoGebra can find an honest comparison.** One page,
  `/geogebra/`, says what the tools do differently (the question's own sentences, not tools or command
  syntax) **and where GeoGebra is the better tool**, in wording the operator approved sentence by
  sentence. It names GeoGebra only to compare — no logo, nothing imitating its identity, and a line
  saying the site is not affiliated. Every example on it builds, and its «open the example» link opens
  that figure. Claims about GeoGebra are re-checked against GeoGebra's own site before any edit.
  *(Realised — [ADR-W-086](06w-decisions-workspace.md#adr-w-086), #1386.)*

## Export

- **FR-EX-1 (Should)** — **A clean, print-ready image** of the current figure, from every builder, on a
  white background at export resolution rather than screen resolution. *(Realised — `shell/export/svgToPng.ts`;
  generalises [FR-HS-5](02-requirements.md).)*
- **FR-EX-2 (Should)** — **The built question as a document**, laying out the figure beside the student's
  own numbered givens, Hebrew RTL correct in Word. **Deterministic — never LLM-generated**: the givens are
  the student's own words in entry order. *(Realised — `shell/export/questionDoc.ts`; generalises
  [FR-HS-11](02-requirements.md).)*
- **FR-EX-3 (Must)** — **A downloaded image never contains on-screen chrome, in every builder.** What is
  painted only to be interacted with — hover marks, crossing offers, hit rings, hidden-item ghosts,
  selection accents, edit affordances — is not part of the figure and never reaches a worksheet. The
  contract is one shared strip (`[data-noexport]` + the `data-export-*` accent reverts in
  `shell/export/svgToPng.ts`); the opt-in is each renderer's tagging, and each product carries a lock
  that renders its figure with every chrome affordance ON and asserts the stripped ink is its chrome-free
  render — so a product cannot ship untagged chrome by forgetting to opt in. *(Realised —
  [ADR-W-051](06w-decisions-workspace.md#adr-w-051), [ADR-AG-151](06c-decisions-analytic.md#adr-ag-151); a
  `clean-export.test.tsx` in every builder that exports an image, over `shell/export/exportMarkup.ts`, and
  that list is READ from `products.json` by `shell/__tests__/clean-export-registry-1391.test.ts`, so a new
  builder cannot ship an export without one.)*

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
