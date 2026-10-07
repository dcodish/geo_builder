# 04w — Design: the shared chrome (`shell/`)

_How the one shared UI tree is built. Registered in [`DOCS.json`](../DOCS.json) as the `workspace`
product's design doc ([ADR-W-041](06w-decisions-workspace.md#adr-w-041))._

**What it must promise** is [02w](02w-requirements-workspace.md) — one look, an always-present ask lane,
a save envelope that refuses a foreign file, and so on. This document is how those are built, and why
the tree exists at all.

## The problem it solves

Three products grew the same chrome three times and it looked and behaved like three different apps.
[docs/28 §1](archive/28-product-unification.md) measured the divergence: the ask lane existed in three shapes,
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
| **Frame** | `AppFrame` · `Workbench` · `Switcher` · `InputArea` · `FactList` · `DataPanel` · `AskLane` · `SymbolRow` · `QuickChips` · `Banner` · `ManualScreen` · `Modal` · `ToolButton` · `FigureName` | React components implementing the D1–D10 rulings ([02w, *Suite rulings*](02w-requirements-workspace.md), moved from docs/28 §4a), each taking its product-shaped content as a slot |
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

The designed mechanism is the **conformance matrix** ([docs/28 §5 Phase 2](archive/28-product-unification.md),
issue [#664](https://github.com/dcodish/geo_builder/issues/664)) — one row per shared contract, one
column per builder, where *an unexamined cell fails the suite*. It is specified and not yet built.
Recorded here rather than only in the issue, because a design doc that omits the weakest property of its
central rule is not describing the system.

## How a cross-product wiring guard is written (docs/28 §5c, moved in #1861; [ADR-W-071](06w-decisions-workspace.md#adr-w-071))

`shell/` may never import a product tree, so a guard that wants to check "every builder does X" cannot
simply call all four. The tempting answer is to read each `App*.tsx` as text and grep for the shape. That
asserts where a decision LIVES rather than that the product MAKES it, and it breaks the first time
someone extracts the decision into its own function. That is what went red in #1315, on a refactor that
improved the code.

**The pattern instead:**

1. The product's decision is a **callable function**, not an arrow inside a JSX prop. A ternary in a prop
   is invisible to every test, which is what forces the source scan in the first place.
2. The **rows and the checks** live once, in `shell/__tests__/fixtures/`, as a pure
   `xFaults(subject, opts) → string[]` plus a thin `xSuite()` wrapper that runs it as `it` rows.
3. Each tree has a **thin lock** that imports its own function and calls the shared suite. A product
   importing `shell/` is the allowed direction.
4. Where products legitimately differ, the difference is an **explicit option** on the suite
   (`isolatesFirst` for the preview), never a silent exclusion.
5. A **meta-lock** in `shell/` runs the shared checks against deliberately broken stubs and asserts each
   is caught. It calls the same `xFaults`, never its own copy.

**The registry is the fixtures directory:** every `shell/__tests__/fixtures/*-rows.ts` file (and
`geo-input-parity.ts`) is an instance, and its meta-lock sits beside it as `*-meta*.test.ts`. Three
instances stretch the pattern, and are the models for the next one of their kind:
- `privacy-disclosure-rows.ts` (#1426, [ADR-W-090](06w-decisions-workspace.md#adr-w-090)) applies it to
  WIRING rather than behaviour. The product's callable is `privacyDeclaration(t)`, and the fixture
  measures the other side itself by walking the bundle's import graph from the product's real entry. It is
  an import-reachability scan, not a text grep of `App*.tsx`, so moving a sink into a new file cannot hide
  it.
- `about-content-rows.ts` (#1477, [ADR-W-091](06w-decisions-workspace.md#adr-w-091)) holds a DECLARATION
  to the product's BEHAVIOUR. The callable is `aboutContent(t)`, and the product also passes a step runner
  over its real submit gate, so every «try this» line the About shows must build in sequence on an empty
  canvas. The runner returns one verdict per step: an early return is a fault, never a pass.
- `geo-input-parity.ts` (#1649, [ADR-W-108](06w-decisions-workspace.md#adr-w-108)) asserts EQUALITY across
  builders without one test seeing two of them. Each row carries the reference verdict (2-D's) as a
  literal, `expect`, and every tree's thin lock asserts its own submit decision against that literal, so
  the builders agree transitively. Known gaps are a ratchet: a gap that closes fails until its row moves
  to the parity rows. Each catalog's sentences must be covered by a row or a topic exception.

## The shared bidi core's run-span rule (formerly docs/28 §5b, moved in #1861; [ADR-W-070](06w-decisions-workspace.md#adr-w-070))

`makeBidi().segments` (`shell/bidi.ts`) decides where a technical run begins and ends: the one decision
every bidi surface is built on. The span is `[first CORE character … last CORE character]`, then grown
by three rules:

1. **partner debt**: a delimiter whose partner is already inside the span joins it;
2. **a leading SIGN**: `-`, `−` or `+` immediately before the span joins it, **unless a Hebrew letter sits
   immediately before the sign**. Then it is a particle's maqaf («ציר ה-x», «ו-B», «מ-9») and belongs to
   the Hebrew;
3. **balanced hug**: a delimiter pair wrapping the span joins it, outermost last.

**The order of 2 and 3 is load-bearing.** `(-2,4)` must become the span `-2,4` before the hug runs, so
that the hug then sees `(` and `)` adjacent and absorbs the pair. Reversed, the parens stay outside and
the student reads «(2,4-)», the #1296 defect.

The signs are **not** in the run alphabet (`BASE_CORE`). A CORE character may START a run on its own, and
a bare `-` between Hebrew words is a maqaf; a sign extends a run that already exists, at its left edge.

**Three copies, one table.** `shell/bidi.ts` serves analytic and complex. 2-D (`src/i18n/bidi.ts`) and
3-D (`src3d/i18n/bidi.ts`) keep their own copies ([ADR-W-016](06w-decisions-workspace.md#adr-w-016)). The
rule is locked by one row table, `shell/__tests__/fixtures/issue-1296-rows.ts`, asserted identically
against each copy (in `shell/__tests__`, `src/i18n/__tests__` and `src3d/__tests__`), because a per-tree
lock cannot see a copy drifting. The one legitimate divergence is 3-D's `declSplit` (a declaration renders
as a name island plus an equation island, a documented `makeBidi` option). It is asserted on both sides,
so a migration of 3-D onto the shared core has to decide about it rather than lose it.

## The sequence gate (docs/28 §5d, moved in #1861; [ADR-W-076](06w-decisions-workspace.md#adr-w-076))

*Never reorder the letters of a point sequence: the sequence IS the statement.* One algorithm,
`shell/llm/sequenceGate.ts`, three consumers.

```
shell/llm/sequenceGate.ts        the algorithm: stated runs by label multiset, ambiguity -> refuse,
                                 reverse == same statement, rewrite by match index
        ^            ^            ^
        |            |            |
src/parser/parse.ts  src3d/parser/honesty3.ts  src-analytic/parser/honestyAnalytic.ts
  ULABEL             primed labels             a capital + optional digit
  normalizeUtterance normalize3                identity
  mask the area S    canonicalise primes       identity
  emit the ORIGINAL  emit the CANONICALISED    emit the original
```

Read the last row of that table first. The two shipped copies **differed** in what they emit, and the
extraction preserved the difference (`prepareLine` returns `{ match, emit }`) rather than unifying it.
Unifying would have changed output in a shipped tool: a behaviour change wearing a refactor's clothes.

**Where each product runs it:** 2-D in `submitPipeline`, 3-D in `App3`, analytic in `runFallback`. In
every case it runs on the model's lines and **before** the deterministic re-parse, because the restored
spelling is what must be parsed, recorded and read back. Complex has no LLM lane yet
([ADR-W-118](06w-decisions-workspace.md#adr-w-118) B14, #1869).

**The corrections are logged.** Each product puts `restored` (`WAS→WANT`) on the submit event. Without
it, a submit that was silently corrected looks exactly like one that needed no correction, which is how
2-D #536 went unnoticed until it reached production.

**The rows, and the proof they bite.** `shell/__tests__/fixtures/sequence-gate-rows.ts` holds the checks
once; each tree has a thin lock; 3-D's primed alphabet rides as an explicit option. The meta-lock
(`issue-1356-sequence-gate-meta.test.ts`) runs those rows against deliberately broken gates (one that
does nothing, one that restores without logging, one that rewrites a reversal, one that invents an
unstated run, one that picks a spelling the student left ambiguous) and asserts each is caught. A row the meta-lock shows cannot fail is deleted, never kept as a check of nothing.

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

## The privacy note is a declaration ([ADR-W-090](06w-decisions-workspace.md#adr-w-090))

`AppFrameAbout.privacy` is `{ text, discloses }` (`shell/frame/privacy.ts`), not a string. `discloses`
lists every place a student's input can leave the browser for: `usage-log` (the server usage log),
`llm` (the model fallback, an external AI service) and `share-store` (the short-link store). Each
product builds its declaration in one callable, `<tree>/ui/privacy.ts` → `privacyDeclaration(t)`, used
by `AppFrame` and by 2-D's first-load intro. The wording stays the product's own; shell holds no
string.

The declaration is checked, not trusted. `shell/__tests__/fixtures/privacy-disclosure-rows.ts` walks the
product's bundle from its real entry (`products.json` → the page → its module script) through every
import it can reach, across the tree and `shell/`, and collects the server endpoints (`…api/<name>`)
named in string or template literals. `SINK_OF_ENDPOINT` classifies each endpoint once: a sink, or a
named non-sink (`config`). Wired and declared must be equal, both ways. An endpoint nobody classified
fails, and so does a scan that never entered the tree. Each tree has a thin lock
(`<tree>/__tests__/privacy-disclosure-1426.test.ts`). `shell/__tests__/privacy-disclosure.test.ts` is
the §5c meta-lock plus a roster net that fails a registered builder with no lock.

What the lock does not check: whether the TEXT describes each declared sink. That stays reviewed prose,
per product and per locale. The lock guarantees that wiring a sink forces the declaration to change, and
that change is where the text gets reviewed.

## The About content is a declaration ([ADR-W-091](06w-decisions-workspace.md#adr-w-091))

`AppFrameAbout.content` is an `AboutContent` (`shell/frame/about.tsx`), not free JSX: `{ lead, points,
tryTitle, trySteps, credit: { by, name, contact, email } }`. `AboutBody` renders the one layout. It shows
the lead, the points as bullets, the try title, one line per try step with its direction taken from its
content (`makeBidi().textDir`, marked `data-about-step`), and the credit line. It uses design tokens
only. The frame's About modal renders it, followed by the privacy note and the build stamp. 2-D's
first-load intro renders the same `AboutBody`. Each product builds its declaration in one callable,
`<tree>/ui/about.ts` → `aboutContent(t)`. The words are the product's own. The credit's address is
the suite's single copy in `products.json` → `contact.email`.

The declaration is checked, not trusted. `shell/__tests__/fixtures/about-content-rows.ts` holds each
builder to a non-empty lead and try title, at least 3 points and 2 try steps in he and en, and a complete
credit. It then submits every try step through the product's REAL submit gate, in order, from an empty
canvas. The step is submitted as a student types it, with bidi isolates stripped. The runner must answer
once per step, and the shared layout must render every section. Each tree has a thin lock
(`<tree>/__tests__/about-content-1477.test.ts`); 2-D's also pins its text byte-for-byte against the
pre-#1477 About. `shell/__tests__/about-content.test.ts` is the §5c meta-lock plus a roster net.

What the lock does not check: whether the words are good. That is prose, per product and per locale.

## The grid step ([ADR-W-094](06w-decisions-workspace.md#adr-w-094))

`shell/ticks.ts` holds the one "nice step" rule (1, 2 or 5 × 10ⁿ) and the tick values across a range. Analytic re-exports `tickStep` from it, so its grid is byte-identical by construction. The complex Builder grids its VISIBLE window with it (`render/visibleGrid`), replacing a private copy with different thresholds. A §5c lock (`shell/__tests__/ticks-1465.test.ts`) fails if any product tree defines its own `tickStep`/`niceStep`.

## The palette face and the typed comparison ([ADR-W-095](06w-decisions-workspace.md#adr-w-095))

A `SymbolSpec` whose face (`label`) is one character inserts exactly that character, or carries `keyboardForm` saying why not. `shell/__tests__/fixtures/palette-faces.ts` checks it, and every product runs it over its own palette. The store-side ingest (ADR-W-029) is `ingestTypedText` in `bidi.ts`: `stripFormatControls` and then `foldComparisons` (`>=` → `≥`, `<=` → `≤`, a bare two-character operator only). Every product store records through it, analytic's included, which had no ingest boundary before. The parsers keep only the strip; every grammar reads both spellings the same way.

## The spaced conjunction ([ADR-AG-239](06c-decisions-analytic.md#adr-ag-239))

`shell/conjunction.ts` `foldConjunctionSpacing` turns «AB ו- BC», «AB ו -BC» and «AB ו - BC» into «AB ו-BC». It is a PARSER-boundary fold, not a store one: 2-D `normalizeUtterance`, 3-D `normalize3` and analytic `orthography` call it, and the stored line stays as typed. A glued «ו-» always folds; a hyphen with a space before it folds only before a name-shaped token, so a minus sign («2 ו -3», «ו -y = x», «a ו -a») is never absorbed into the conjunction. The cross-builder lock is the parity rows `conj-space-*-1691-*`.

## Indexed names ([ADR-600](06-decisions.md#adr-600))

`shell/indexedName.ts` is the student's name alphabet, once: `NAME_LETTER` (Latin, and Greek in both cases), `INDEX` (glued digits, `_1` / `_{1}`, subscript digits), `INDEXED_NAME` («S1», «α1», «Α1» — one letter with an index, standing alone) and `UNGLUED`, the zero-width guard that a number never begins glued to a name letter, after an `_`, or inside another number. It is pure regex source with no product knowledge. 2-D re-exports it from `src/parser/lexicon.ts` (the angle value reader, the subscript fold and the number gate compose it); analytic's tokenizer test `INDEXED_TOKEN` (`src-analytic/engine/carriers.ts`, #1785) is `INDEXED_NAME_RE`. The cross-builder lock is the parity rows `indexed-*-1785` and `*-1814`.

## Student-facing text ([ADR-W-096](06w-decisions-workspace.md#adr-w-096))

`shell/studentText.ts` `studentFacingViolations(values, { typed, names })` judges the VALUES a message interpolates, never its template, since a template may quote a worked example. A value may name what the student typed (case-insensitive) or what the figure shows; an id-shaped token (`~x`, `@x`, `#x`, `kind-Id`), an untyped English word, or an unknown capital label is a violation. Each product runs it over its own refusal corpus through its own humanizer. 3-D's is `src3d/i18n/errorText3.ts`; the other three are #1522.

## The current tool is in view on a phone ([ADR-W-097](06w-decisions-workspace.md#adr-w-097))

`Switcher` holds a ref on its `aria-current` segment and, on mount and whenever the active tool changes, calls `scrollIntoView({ inline: 'nearest', block: 'nearest' })`. That moves nothing when the tab is already visible, and the browser handles the RTL scroll direction. The visual smoke opens every product at 390×844 and fails if that tab's rectangle is not inside the strip.

## One wording per role, and the first-visit About ([ADR-W-098](06w-decisions-workspace.md#adr-w-098))

Shell holds no strings, so the suite vocabulary is held by a lock, not a module: `shell/__tests__/suite-vocabulary.test.ts` maps nine roles (determined, DOF count, busy, ask, undo, redo, clear-all, show-another, About) to each product's key(s), reads the four locales by file, and requires one wording per role in each language, anchored to the operator's ruled text. A product without a surface (complex has no busy state) is recorded as absent with its reason. The first-visit About is `AppFrameAbout.autoOpenKey`: opt-in, one localStorage key per product, written on close. 2-D's private first-load modal is retired into it, keeping its `geo_intro_seen` key.

## The example chips' math ([ADR-W-100](06w-decisions-workspace.md#adr-w-100))

`QuickChips` renders each label through `shell/math`'s `mathHtml` after the product's `display` (bidi isolation), so a chip shows the same typeset math as the fact row its click creates; the click still submits the raw command (ADR-W-029).

## The guide speaks student ([ADR-W-101](06w-decisions-workspace.md#adr-w-101))

`ManualScreen.tsx` exports `guideJargon(text, allow?)` — the jargon tokens in one string, by CLASS: a design-doc section (`§2b`), an issue number (`#760`), a decision id, `DOF`, and the machinery's names in English (tier, layer, grammar, parser, engine, solver, LLM, regex, fallback) and Hebrew (שכבה, דקדוק, מנוע, פרסר, אלימינציה, איטרציה — stems, so a prefixed «בשכבה» is caught). `guideJargonIn(content)` walks any object to every string leaf and reports `path: «token» in «text»`, so a new catalog field or locale key is linted the day it lands. Each product's lock hands it its own catalog, section titles and whole he/en locale and expects `[]` (the #1347 shape: the chrome owns the rule, the product owns the question). `allow` names an exact token, for the day a curriculum word collides with a stem; none does today.

## The letter popover ([ADR-W-105](06w-decisions-workspace.md#adr-w-105))

`shell/frame/LetterPopover.tsx` is the on-canvas «click a point, type its letter» popover, used by 2-D's point menu and 3-D's rename. Its contract:

| prop | meaning |
| --- | --- |
| `x`, `y`, `bounds` | the anchor (the click) and the canvas size, in px of the positioned container. Placed by **physical** `left`/`top`, clamped into the canvas, never a logical inset (under RTL that mirrors the menu, 2-D F1/REN-1) |
| `title`, `label` | the header, and the letter the callbacks receive first |
| `onRename?(from, to)` | returns `{ok:true}` or `{ok:false, reason, holder?}`. `reason:'taken'` with a `holder: {text, onHighlight?}` shows the holder line and the swap offer. Any other reason (including a product's own, such as `busy`) shows the "invalid" note. Absent means no letter box |
| `onSwap?(a, b)` | returns `{ok}`; absent means no offer |
| `strings` | `placeholder`, `apply`, `taken`, `bad`, `takenBy` (`{{what}}`), `swapLetters` (`{{a}}`, `{{b}}`) — all from the caller |
| `maxLength` | the longest typed label (2-D 3, 3-D 4 for `C1'`) |
| `children` | the product's own items below the letter block (2-D: hide/show label) |
| `onClose` | the backdrop, Escape, a successful rename or swap |

The caller mounts it once per opening (`key`), so typed text, the note and the offer never outlive the point they were for.

**The decisions are in `letterOffer.ts`, not in the JSX.** `swapOffered(holder)` (the offer's scope: any holder, [ADR-532](06-decisions.md#adr-532)), `afterRename(result, to)`, `afterSwap(result)`, `typedLetter` (trim and upper-case; a product with a richer label grammar normalises further in its own store), and `fillLetters`. 2-D's `Figure.tsx` re-exports `swapOffered`, so its #1199 lock calls the gate's own function.

**The buttons declare their colour** (`letterPopoverBtn.color = var(--color-text, ink)`), because the swap offer sits inside the muted holder block and a button may inherit it ([ADR-520](06-decisions.md#adr-520) Am. 2). The token falls back to the ink value in a builder whose stylesheet does not define it (3-D).

**The product adapts its store's answer** with one small exported function: 2-D's `letterRename` in `Figure.tsx`, 3-D's `letterRename3` in `rename3.ts`. The App wiring calls that function, and so does the cross-product lock.

**The cross-product lock** (docs/28 §5c) is `shell/__tests__/fixtures/letter-swap-rows.ts`. Each builder's thin lock hands over a subject: `setup`, two taken letters, its real `rename` (through its adapter), its real `swap`, `undo`, `statements()` and `points()`. A new builder adds one thin lock in its own tree; the meta-lock proves each row can fail.

## The segment menu ([ADR-W-106](06w-decisions-workspace.md#adr-w-106))

`shell/frame/SegmentMenu.tsx` is the on-canvas «click a segment» menu, used by 2-D's segment and circle menus and the analytic builder's segment click. Its contract:

| prop | meaning |
| --- | --- |
| `x`, `y`, `bounds` | the anchor (the click) and the container size, in px. Placed by **physical** `left`/`top`, clamped, never a logical inset (2-D F1/REN-1), exactly as the letter popover |
| `title` | the header: the segment's name («AB»), or «⊙ O» for 2-D's circle |
| `state` | the product's stored `{hidden?, dashed?}` for this segment |
| `onToggleHidden?`, `onToggleDashed?` | the product's store toggles; absent = no such entry |
| `strings` | `hide`, `show`, `dashed`, `solid` — all from the caller |
| `children` | the product's own items below the display entries (2-D: «החליפו קצוות»; analytic: the measure entries) |
| `onClose` | the backdrop and every toggle (the result is seen on the canvas at once) |

**The decisions are in `segmentDisplay.ts`, not in the JSX.** `toggleSegFlag(map, key, flag)` keeps the map canonical: only `true` flags are stored, an all-off entry is removed, and hiding does not forget the dash. `segInk(display)` returns `solid` / `dashed` / `ghost`, and both renderers paint from it and write it as `data-ink`. `segmentMenuItems(state, wired)` returns hide or show, then dashed or solid while the segment is drawn. `cleanSegDisplay(raw)` cleans a loaded map. The key is the product's own (2-D: the seg id; analytic: the endpoint pair `A|B`).

**A hidden segment has no ink, never no existence.** Where segments are clickable, a faint dashed ghost (`data-noexport`) stays on the line so the menu can bring it back. A product's store keeps the segment in the construction.

**The cross-product lock** (docs/28 §5c) is `shell/__tests__/fixtures/segment-display-rows.ts`. Each builder's thin lock hands over a subject: `setup`, its real toggles, `ink()` read off its real rendered canvas, `measurable()` through its own measure path, `statements()`, an optional `undo` (present only where the display choice is in the undo slice: analytic yes, 2-D no), and its real save → load. The meta-lock proves each row can fail.

## Proof targets ([ADR-W-107](06w-decisions-workspace.md#adr-w-107))

`shell/proofTarget.ts` decides whether a typed line contains a claim the student is asked to PROVE. It is pure and knows no product: `findProofTarget(text)` returns `{ target: true, span: [start, end), sentence }` or `null`, with indices into the string the caller passed.

| match | where | examples |
| --- | --- | --- |
| a proof verb + its complementizer | anywhere in the line | «הוכיחו כי», «הוכח ש-», «הוכיחו שהמשולש …», «הראו כי», «הראה ש-AB …», «יש להוכיח כי», «צריך להראות ש-», "prove that", "show that" |
| a bare prove-verb | only where a sentence starts (line start, after `. ; : , ! ?` or a line break, past an item marker) | «הוכיחו: …», «ב) הוכח את הטענה», "prove: …" |

**Not matched:** a show-verb without its complementizer («הראו את הזוויות», «הראו שני גבהים»: the "show me" imperative), «כיצד» ("how"), and «כי» / «ש» anywhere except directly after a proof verb («נתון כי», «ידוע ש-», «כך ש-»). Invisible paste controls (bidi isolates and marks) are skipped like spaces. `sentence` runs from the verb to the next sentence end (`. ; ! ?` before a space, or a line break) and leaves out an item marker, so in «נתון AB = AC. הוכיחו כי AB ⊥ AC» it is the claim alone.

**Each builder calls it before its grammar** and words its own refusal (same meaning in all three: a claim to prove, not a given; the tool draws the givens and does not check proofs; type only what is given; quoting `sentence`). Nothing of the line is recorded.
- 2-D: `decidePreParse`, the edit seam, and `parse()`.
- 3-D: `readStatement3`.
- Analytic: `parseLine`.

**The cross-product lock** (docs/28 §5c) is `shell/__tests__/fixtures/proof-target-rows.ts`. Each builder's thin lock hands over a `ProofGate`: its REAL submit decision on a figure with A, B and C, answering `{ proof, recorded, text }`. The rows check that every spelling is refused as a proof target, recorded by none and quoted by the refusal, and that the negatives are never refused as one. The meta-lock proves each check can fail.

## Geometry-input parity ([ADR-W-108](06w-decisions-workspace.md#adr-w-108))

`shell/__tests__/fixtures/geo-input-parity.ts` holds the rows and the checks once (docs/28 §5c). `shell/` imports no product, so no single test runs two builders. Equality is carried **transitively**: each row states `expect`, the verdict the reference gives. The 2-D thin lock asserts 2-D gives it, and every other thin lock asserts the same literal.

| piece | what it is |
| --- | --- |
| `Verdict` | `builds` (recorded, or already known) · `refused` (an owned refusal) · `asks` (a clarifying question: 2-D `clarify`, analytic and 3-D `ambiguous-*`) · `not-handled` (the line would go to the model) |
| `StepRunner` | the product's REAL submit decision over an empty canvas, carrying the figure forward; one verdict per step |
| `ParityRow` | `steps` (context, then the sentence under test), `expect`, optional `contextFor` (another context for one product, the sentence unchanged), `exception`, `only`, `knownGap` |
| `EXCEPTIONS` X1–X10 (X10: [ADR-W-109](06w-decisions-workspace.md#adr-w-109)) | per family: the builders that read it, the builders that must not BUILD it (`mustRefuse`), whether it is a topic outside plane geometry, and its sentence patterns |
| `parityFaults(runners)` | per row and product: an early return; a context line that does not build; an expected product off `expect`; a known gap that now gives `expect` ("move it to the parity rows"); a `mustRefuse` product that builds |
| `catalogCoverageFaults(product, sentences)` | each construction sentence of the catalog is a step of a row the product takes part in, a topic-family sentence the product reads, or on `UNCOVERED_CATALOG` (a ratchet under `UNCOVERED_CEILING`) |
| `rowFaults()` | the rows themselves: unique ids, issues named, exception patterns matched, `only` and `contextFor` used where they are checked |

**The runners.**
- 2-D: `decideDeterministic2D`, applying binds, the batch commit or the store operation as `runSubmit` does.
- Analytic: `decideSubmit`, appending on `record`.
- 3-D: `decideSubmit3`, carrying facts and seed.

The model is never called. **The meta-lock** runs the same checks against an oracle built from the rows, and against that oracle with one defect each: an early return, always-builds, always-refuses, swapped asks/refused, a known gap that heals, a broken context, an excluded builder that absorbs. Each is caught.
