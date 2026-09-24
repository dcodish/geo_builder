# 04w — Design: the shared chrome (`shell/`)

_How the one shared UI tree is built. Registered in [`DOCS.json`](../DOCS.json) as the `workspace`
product's design doc ([ADR-W-041](06w-decisions-workspace.md#adr-w-041))._

**What it must promise** is [02w](02w-requirements-workspace.md) — one look, an always-present ask lane,
a save envelope that refuses a foreign file, and so on. This document is how those are built, and why
the tree exists at all.

## The problem it solves

Three products grew the same chrome three times and it looked and behaved like three different apps.
[docs/28 §1](28-product-unification.md) measured the divergence: the ask lane existed in three shapes,
bidi isolation was present in two builders and absent in the third, and the doctrine was duplicated **in
prose** across the orientation files — which §1c named as the real defect. Copying an engine is correct
(2-D and 3-D geometry differ in kind); copying a *button row* is not.

## The one architectural rule

> **`shell/` is parameterized by its caller and knows no product.**

Roster, labels, content and callbacks arrive **as data**. A shared module may never branch on product
identity, because "a fork wearing a shared file's name" ([ADR-W-016](06w-decisions-workspace.md#adr-w-016)
rule 2) reintroduces the divergence the tree exists to remove.

**How it is achieved in practice: slots, not flags.** Every frame component takes the product-shaped part
as a prop it renders without inspecting — `AskLane` takes "the product's own answered rows",
`DataPanel` takes "extra product blocks below the skeleton", `FactList` takes "the product's row of list
actions". The component owns the *shape*; the caller owns the *content*.

**Verified, not assumed** (2026-09-05): the word "product" appears 58 times in `shell/frame/`, every one
in a prop docblock describing a slot. There is no `product === '2d'`-style branch anywhere in `shell/`
source — the only such comparisons in the tree are inside a test asserting switcher config.

## What may enter, and when

[ADR-W-016](06w-decisions-workspace.md#adr-w-016) seeds the tree **by evidence**: a surface enters only
when it is *already implemented ≥ 2 times and settled*. The clause exists to stop an abstraction being
invented from a single example, where the second use then bends its shape.

[ADR-W-040](06w-decisions-workspace.md#adr-w-040) records what the clause is actually counting:
**consumers, not copies.** A settled single implementation that acquires a second *consumer* satisfies
it; a surface still being designed does not, however many callers want it. That reading is what let
`mathText` move in with one implementation and two consumers rather than being copied first and
extracted later.

## Two layers

| Layer | Modules | What they are |
|---|---|---|
| **Primitives** | `theme.ts` · `bidi.ts` · `i18n.ts` · `format.ts` · `math.tsx` · `symbols.ts` · `save.ts` · `switcherConfig.ts` | Pure, no React, no product knowledge. Design tokens, bidi isolation, the i18n bootstrap, number/math display, the save envelope, the config overlay merge |
| **Frame** | `AppFrame` · `Workbench` · `Switcher` · `InputArea` · `FactList` · `DataPanel` · `AskLane` · `SymbolRow` · `QuickChips` · `Banner` · `ManualScreen` · `Modal` · `ToolButton` · `FigureName` | React components implementing the D1–D10 rulings ([docs/28 §4a](28-product-unification.md)), each taking its product-shaped content as a slot |
| **Export** | `export/svgToPng.ts` · `export/questionDoc.ts` | The shared output paths behind "save image" and "download question" |

The primitives layer is the one a product can adopt without changing its layout, which is why adoption
started there.

## Adoption order, and why it was staggered

The tree was created with **exactly one consumer** — `src-complex/`, the product not yet in production —
under an explicit operator constraint: *"i cannot afford impacting the 2d and 3d in prod."* That is why
the first ADR records its own reversibility: nothing shipped depended on it, so the tree could have been
deleted without touching a live product.

Consumers were then added deliberately, each as its own tracked edge in
[`BOUNDARIES.json`](../BOUNDARIES.json): `src-complex` → `src3d` (B3) → `src-analytic` (born after the
chassis existed, so it mounted the frame rather than re-deriving it) → `src` **last**. With the 2-D edge
the one-look goal became structural rather than aspirational: every product now consumes the tree, so a
chrome change that reaches one reaches all.

## The guide's sample, and its escape hatch ([ADR-W-074](06w-decisions-workspace.md#adr-w-074))

`ManualScreen` shows a capped SAMPLE per section, because a guide that lists 63 circle rows teaches
nothing. Two rules make a cap honest, and the shipped guide had neither:

| rule | mechanism | why |
| --- | --- | --- |
| the sample is CHOSEN | `featured` on the entry; `manualShown` takes featured first, then catalog order | file order meant every capability added after a section filled up landed in the invisible tail |
| every row is REACHABLE | «הצג הכול» / «הצג פחות» per capped section | the catalog is a coverage map; a map a student cannot read is not one |

`manualShown` is exported so its lock calls it rather than re-slicing the array (ADR-W-053). Both
groups keep their relative order, so the catalog's own order still documents itself, and a featured
entry can never push a section past its cap.

**The note under a capped section is part of the contract.** It must say the tool has more COMMANDS
there — not "more phrasings of these", which was false: what is hidden are separate capabilities, and
telling a student otherwise is a claim about the tool that the tool does not meet.

**The chrome owns the RULE; the product owns the QUESTION.** `shell/` may never import a product tree
(ADR-W-016 rule 2), so the selection's lock lives here and *"does this catalog's section display the
rows a student was told to look for?"* lives in the product's own tests. `isolation.test.ts` enforced
this the first time the two were written together, which is the guard working.

## Boundaries

Enforced by `server/__tests__/isolation.test.ts` reading `BOUNDARIES.json`:

- **allowed:** each product tree → `shell` (four edges, each asserted **real** — so the manifest can
  never advertise an adoption the code has lost).
- **forbidden:** `shell` → any product tree (the parameterization rule, made mechanical), and
  `shell ↔ server` in both directions (`shell/` ships in browser bundles; importing server code would
  pull key handling into every consumer).

Asserting the *allowed* edges is as load-bearing as forbidding the others: it is what stops `shell/`
quietly becoming a dead tree the registry still advertises.

## Known gap — the rule is enforced at the import level only

`BOUNDARIES.json` can prove `shell/` does not **import** a product. It cannot prove a shared component
has not grown a `variant` / `mode` / `kind` prop that *is* product identity wearing a different name —
the same fork, one layer down. Today that holds by review and by the slot discipline above, and the
audit found it clean; nothing makes it fail automatically if it stops being true.

The designed mechanism is the **conformance matrix** ([docs/28 §5 Phase 2](28-product-unification.md),
issue [#664](https://github.com/dcodish/geo_builder/issues/664)) — one row per shared contract, one
column per builder, where *an unexamined cell fails the suite*. It is specified and not yet built.
Recorded here rather than only in the issue, because a design doc that omits the weakest property of its
central rule is not describing the system.

## The session seam ([ADR-W-078](06w-decisions-workspace.md#adr-w-078))

A builder opens EMPTY and OFFERS to continue. Three files, and the split between them is what keeps
`shell/` free of product knowledge:

| file | what it owns |
| --- | --- |
| `shell/session/persist.ts` | the only door to browser storage — `{savedAt, payload}` under a per-product key, the staleness window, and the wrapping that turns a private window / blocked site data / an exhausted quota into "no stored session" |
| `shell/session/adapter.ts` | the `SessionAdapter` contract a product exports as a VALUE, so the cross-product checks (docs/28 §5c) can drive real wiring rather than scan source |
| `shell/frame/ResumeOffer.tsx` | the banner — two actions, caller's strings, no auto-dismiss (a banner that expires on its own is a silent start-fresh) |

**The payload is the product's own save-envelope text**, byte for byte — the same string its save
button writes to a file. `shell/` never parses it. Two consequences worth stating: restoring is
LOADING, so the load audit (FR-SL-3) covers a restored session for free; and the persisted shape
inherits the save file's versioning rather than becoming a second format to migrate.

**The write rule is the load-bearing one: an empty session is never written.** Every builder boots
empty, so a persister that mirrored its boot state would erase the session it was about to offer.
The adapter's `snapshot()` returns `null` for an empty session, and that null is checked by the
shared rows and by the meta-lock — it is a contract, not an optimisation.

Each product wires four things: its key, its `snapshot()` (its serializer, skipped when empty), its
`restore()` (its existing load path), and its `isEmpty()`/`reset()`. The app reads the offer ONCE on
mount — never in a selector, never on every render — and the figure enters the session only on the
student's tap.

## The share link ([ADR-W-079](06w-decisions-workspace.md#adr-w-079))

`shell/session/link.ts` — the encoding, and nothing about any product. A save-envelope text goes in;
a base64url string goes out, and the caller puts it after a `#`.

- **base64url**, because a chat client's link detector must not be able to chop the payload; plain
  base64's `+ / =` invites exactly that.
- **the `#` fragment**, because a fragment is never sent to a server: the figure reaches no log, and
  a link-preview fetch sees only the bare app URL. A privacy property of the encoding, not a policy.
- **`deflateSync`, synchronously** (fflate's "deflate" is the raw stream), because Safari rejects a
  clipboard write issued after an `await`, and `CompressionStream` does not exist before iOS 16.4.
- **`decode` returns null for anything that is not ours** — truncated, foreign, or not deflate — so
  the caller refuses rather than half-loading.

The product half (2-D: `src/store/shareLink.ts`) owns the base path (`import.meta.env.BASE_URL`,
never hardcoded — the same code serves `/` in dev and `/geo-builder/` in production), the
measurement, and the boot read. Three rules there are worth stating because each one protects a
student rather than a byte:

1. **Measure before copying.** An over-long link is refused with a reason; a truncated one opens as
   a figure silently missing its last statements.
2. **A link outranks the session offer** (ADR-W-078) and is never shown alongside it — the student
   asked for *this* figure.
3. **Consume the fragment once read** (`history.replaceState`). Otherwise a refresh sits behind a
   URL that still says "open the original", and the student's later edits are discarded by it.

### Extended to every builder, and the fragment is a SUBSCRIPTION ([ADR-W-080](06w-decisions-workspace.md#adr-w-080))

`shell/session/link.ts` now owns four product-independent pieces — the encoding, `payloadInHash`,
`consumeFragment` and `appBaseUrl` — because the sibling port would otherwise have made four copies
of each. Each product keeps only what is genuinely its own: the payload, the load path, and "is the
canvas empty".

**`onSharedLink` replaces the mount read.** A URL differing only by its `#` is a same-document
navigation: `hashchange` fires and the document does not reload, so a mount-only read never fires
again and a link pasted into an already-open tab does nothing at all (#1373, measured in prod). The
handler therefore runs for the fragment present at subscribe time *and* on every later change. The
consume uses `replaceState`, which does not fire `hashchange`, so there is no loop — locked, because
that is the property whose failure would be silent and expensive.

**The trim is a per-product MEASUREMENT, never a copy.** 2-D drops fact ids and its archive header;
analytic has nothing to drop (346 chars for a real session); complex keeps `freePos`, which is an
input rather than a position; 3-D drops `savedAt` for determinism, not size. The cross-product rows
lock the properties — fragment not query, base64url, refusals, and *the same figure gives the same
link twice* — while leaving each product's payload its own.

**A link arriving on a non-empty canvas ASKS.** It cannot happen on a cold load, so it could not
happen at all until the fragment became a subscription; once it can, opening silently would discard
work the student cannot recover. Same banner shape as the session offer, same rule.

### The SHORT link and the store ([ADR-W-081](06w-decisions-workspace.md#adr-w-081))

The long fragment link above is unchanged and is still what a figure travels as. `/g/<id>` trades it
for something a teacher can send without it looking like phishing, and — the reason it exists at all
— something a chat client can PREVIEW.

**A preview forces server storage.** A crawler cannot see a `#` fragment. So the short link and the
preview are one decision, and the trade (figures leave the machine) was the operator's, made
explicitly.

| piece | owns |
| --- | --- |
| `server/shareStore.ts` | the append-only store, the upload's refusals, and the `/g/<id>` page + image |
| `server/shareProxy.ts` | the DEV host of the same handlers — dev and prod must not differ, which is how #1373 shipped |
| `shell/session/shortLink.ts` | the upload, product-free; returns a URL or a NAMED reason to fall back |
| `shell/frame/ShareSheet.tsx` | the sheet that shows the link with its own copy button |

**What is uploaded is the FRAGMENT**, not the save envelope — the server moves an opaque string and
a picture, and `/g/<id>` hands the blob straight back as a fragment, so the existing loader opens a
short link with no new code path.

**Three rules that are not implementation detail:**

1. **Append-only.** No endpoint updates or deletes. A link means the same figure forever, which also
   makes the image immutable-cacheable.
2. **Refuse, never evict.** Past the allocation a new share is refused with a reason; links already
   sent keep working. Eviction would be the one failure a teacher could not diagnose.
3. **The long link is a first-class fallback.** Offline or store-full, the teacher still gets a
   working link, named as the long one. A share button that fails closed would be worse than the URL
   it replaced.

**The clipboard is no longer guaranteed**, because the link now requires an upload and Safari
rejects a clipboard write after an `await`. The sheet shows the URL and copies on a fresh gesture.

### Arrival is bounded ([ADR-W-082](06w-decisions-workspace.md#adr-w-082))

A link is a stranger's input, so every ceiling that matters is checked on ARRIVAL, not only on emit:

| bound | where | value | why this chokepoint |
| --- | --- | --- | --- |
| characters, before decoding | `readFigurePayload` (`shell/session/link.ts`) | `LINK_ARRIVAL_MAX_CHARS` = 4 × `LINK_MAX_CHARS` | nothing this code emits is longer; refusing before `atob` costs nothing |
| inflated bytes, while inflating | the same | `PAYLOAD_MAX_BYTES` = 256 KB | fflate is fed 512-byte slices and abandoned at the line — a one-shot push expands the whole bomb before any callback can object |
| statements, before replay | `readEnvelope` (`statements:` names the list) and 2-D's / 3-D's own deserializers, via `figureTooLarge` (`shell/save.ts`) | `MAX_FIGURE_STATEMENTS` = 64 | replay is superlinear in constrained statements; a short link can carry 96 |
| the store | `handleShare` (`server/shareStore.ts`) | the same two size constants, MIRRORED | `server/` may not import `shell/`; a lock reads the shell source and holds them equal |

Every refusal is `too-large`, carried to the student as its own message (link or file), never as
«broken link». The §5c share rows grow each product's OWN payload past the ceiling, so all four
builders are held to the same bound by one fixture.

### Share pages stay out of the index ([ADR-W-084](06w-decisions-workspace.md#adr-w-084))

`handleSharePage` sets `X-Robots-Tag: noindex` **once, before it branches**, so the page, the preview
PNG and the dead-link 404 all carry it and no later early return can skip it; the page adds the
matching `<meta name="robots">`. It is a header, not a `Disallow: /g/`: a disallowed URL is never
fetched, so its noindex would never be read, and a preview crawler that obeys robots.txt would lose
the picture #1374 exists for. The page's old `<link rel="canonical">` pointed at the builder URL
*with its `#fragment`*, which search engines strip — it named every share's canonical as the bare
builder page, and was removed.

## The site root ([ADR-W-084](06w-decisions-workspace.md#adr-w-084))

Not `shell/` code, recorded here because every builder is served beneath it. `deploy/homepage/` is
the canonical copy of what sits at `httpdocs/`: the homepage, `robots.txt` (allow all, sitemap
line), `sitemap.xml` (the homepage plus every `products.json` builder — locked against the registry),
and the site icon. `favicon.svg` is the one source; `favicon.ico` (16/32/48, PNG frames) and
`apple-touch-icon.png` (180) are regenerated from it by `scripts/render-icons.mjs` through Chromium,
and committed because this directory deploys as a plain copy with no build step. The `www.` → apex
redirect is a Plesk setting, outside the repo (RUNBOOK).

### The comparison page ([ADR-W-086](06w-decisions-workspace.md#adr-w-086))

`deploy/homepage/geogebra/index.html` is a hand-written static page beside the homepage, deployed to
`httpdocs/geogebra/`. Its two example blocks are `<pre data-example="…">` so the lock can read them
back and replay them; the bagrut block is compared line for line with the locked fixture
`2022-summer-a-issue59.geo.json`. The «open the example» button is an ordinary share link
(`serializeFigureForLink` → `figureLinkUrl`, ADR-W-079) generated from that same fixture, and the lock
decodes it through the loader a click uses. The example blocks use the body font in plain RTL — not a
monospace font, which has no Hebrew glyphs, and not `unicode-bidi: plaintext`, which turned every
line that starts with a Latin label into a left-aligned LTR paragraph (measured at phone width).

## The page a crawler reads ([ADR-W-085](06w-decisions-workspace.md#adr-w-085))

`shell/seo/seo.ts` is pure `SeoPage → HTML`: `seoHead` (title, description, canonical, icons, OG and
Twitter, JSON-LD — `<` escaped as `\u003c` so no string can close the script) and `seoStaticBody` (one
`h1`, `h2` sections, the examples as a list). `applySeo` replaces the entry's `<title>` and fills its
EMPTY `#root`, and throws when either anchor is missing, so a builder cannot ship bare.
`shell/seo/seoPlugin.ts` applies it in `transformIndexHtml`, **keyed by the entry file name**
(`index.html`, `3d.html`, …) because one dev server serves all four entries; every config passes the
same table and an unknown entry refuses the build. In a build it emits `seo/icon.svg`,
`seo/apple-touch-icon.png` and `seo/og.png` under the builder's base with **unhashed** names (chat apps
cache a preview URL forever); in dev it inlines the icons and omits `og:image`.

The table is `seo-pages.ts` at the repo root — build tooling, the one place that knows all four
products, so `shell/` keeps its no-product-knowledge rule. Its three sources: the approved wording,
`products.json` for URLs, and each catalog's `featured` rows for the examples. The static block works
because every `main.tsx` mounts with `createRoot().render`, which **replaces** the container's
children: a student sees the block only while the script downloads, as the loading screen.

The images are regenerated, never edited: `scripts/render-icons.mjs` (from each product's
`seo/icon.svg`) and `scripts/render-og.mjs`, which types a figure into the running app and takes the
app's **own «download image» output** (FR-EX-3's chrome-free export), then lays it beside the icon and
the name read from the served `<h1>`.

## The junk gate ([ADR-W-087](06w-decisions-workspace.md#adr-w-087))

`shell/llm/constructionSignal.ts` answers one question for every builder that escalates to the model:
*could anything in this utterance be geometry?* A point label (an uppercase run not continuing into a
lowercase word), a relation symbol, or a word of the caller's vocabulary is a signal; a digit alone is
not. Each builder asks it at its own escalation seam, BEFORE the call: 2-D through `classifyOutOfScope`'s
`unrelated` (now in `PRE_LLM`), 3-D through `classifyGuidance3`'s `unrelated` fallback, analytic through
`reachesFallback`. The vocabulary is the product's, and each product's catalog net asserts that no line
it teaches scores zero, so the gate can never brush off a sentence the tool accepts.

## The fact row's direction ([ADR-W-088](06w-decisions-workspace.md#adr-w-088))

`shell/frame/FactList.tsx` owns the base direction of every statement row. A row carries `text`, the
statement's string, and `content`, its rendering. The chrome wraps `content` in
`<div dir={textDir(text)} data-fact-text>`, using the `textDir` the product passes (required). The
edit-in-place box takes its `dir` from the same function, per keystroke. The row's other parts sit
outside that scope and follow the UI's direction: `lead` (the status mark), `trail` (3-D's plane
chips), `notes` (advisories and readouts, each with its own `dir`) and `error`. A product still
decides WHICH string is the statement (3-D: `factRowText3`) and HOW it is typeset. Shell only decides
that the direction comes from that string. The rows and checks live in
`shell/__tests__/fixtures/fact-row-dir-rows.tsx`, and each tree runs them against its own `textDir`.
