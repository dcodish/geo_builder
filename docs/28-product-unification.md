# 28 — Product unification: making three tools feel and behave like one

> **Status: WORKING DRAFT — decision-complete, not yet accepted, nothing here is executable.**
> No ADR has been written for it. The operator asked for a draft to iterate on before any of it is
> committed to; tracking issue [#648](https://github.com/dcodish/geo_builder/issues/648).
> **§8 is now empty of open questions** — every fork, every interface decision (§4a D1–D10) and all
> four programme questions were ruled on 2026-08-16. What remains before execution is an ADR and
> your acceptance, not a decision.
>
> **§4 was ruled on by the operator on 2026-08-16 and is no longer a fork** — separate builders at
> separate links, one learned interface, a toolbar switcher. That ruling added a second row family
> to §6 (interaction contracts), which is the draft's main change since the first pass.
>
> Drafted 2026-08-16. Every number in §1 is measured at `main` @ `397e8e5`, not estimated.

---

## 1. The problem, measured

The operator's report (2026-08-16):

> *"we now have 3 tools but each has its own ui and look and feel is a bit different so they don't
> feel like one tool… should we continue on this route or step back a sec and do some ordering and
> ensure we have a robust product that doesn't fix one item in 2d just to realise we should have
> also done it on other tools, or worse — we fix in one tool and break in another."*

That is three distinct complaints, and they have three different answers. Measured:

### 1a. The chrome genuinely diverges

| surface | `src/` (2-D) | `src3d/` (3-D) | `src-complex/` |
| --- | --- | --- | --- |
| design tokens | `ui/theme.ts` | **none** | **none** — a third palette in `styles.css` (warm stone vs the siblings' slate) |
| inline hex colours in the app file | **194** | 42 | on a third styling stack (CSS file, not TS tokens) |
| `ui/` directory | `Modal.tsx`, `symbols.ts`, `theme.ts` | `symbols3.ts` only | no `ui/` at all |
| i18n bootstrap | `i18n/index.ts` | `i18n/index3.ts` | `i18n/index.ts` — ~25 lines, written **three times** |
| bidi isolation | in the format layer | `i18n/bidi.ts` | absent |

[ADR-W-016](06w-decisions-workspace.md#adr-w-016) recorded the behavioural half on 2026-08-15: the
load audit (ADR-242 / ADR-3D-087 — complex has neither), save naming (ADR-274/286 — complex's store
comment claims a convention its code does not implement), the in-app privacy note (NFR-SE-3, absent
in a publicly linked product), the build stamp, usage logging, and the palette-as-assertable-module,
whose whole point `src-complex` reversed on day one by re-inlining it. **Each has now been
implemented-or-forgotten three times.**

This is the half the operator can see. It is also the half that is already decided and simply not
built — see §5 phase 1.

### 1b. The engine does NOT meaningfully duplicate

| tree | engine LOC (excl. tests) | reasons about |
| --- | --- | --- |
| `src/engine` + `src/replay` | ~15,300 | 2-D points, circles, chords, constructive DOF |
| `src3d/engine` | ~10,900 | vectors, planes, solids, LM solve |
| `src-complex/` (model+solve+replay) | ~4,900 | log-polar carriers, exact ℚ arithmetic |

A circle-circle intersection and a plane-normal resolution are not the same code wearing different
names. [ADR-W-003](06w-decisions-workspace.md#adr-w-003)'s *engine is copied, never shared* is
**correct and this draft does not propose changing it.** Sharing that layer is the speculative
generality ADR-W-003 was written to prevent, and [ADR-W-004](06w-decisions-workspace.md#adr-w-004)
already states why copying is right there: *"the check IS the mechanism."*

### 1c. The doctrine is duplicated in PROSE — which is the real defect

The thing that actually produces "we fixed it in 2-D and should have done it in 3-D too" is neither
chrome nor engine. It is the layer between them: the *contracts* every product is supposed to
honour — honesty gates, ADR-052 DOF accounting, M1 drive-or-check duality, the solve ladder,
requirement gates, branch/configuration cycling.

Measured evidence that it transfers only by human memory:

- **51 distinct 2-D ADR ids are cited from the 3-D log**, across **70** "the 2-D…" references. The
  3-D log is substantially a re-derivation of 2-D decisions.
- **The honesty-gate family is asymmetric, and nobody can currently say which gaps are deliberate:**

  | tree | gates | names |
  | --- | --- | --- |
  | `src/parser` | **18** | `droppedCirclePredicate`, `droppedComparison`, `droppedCompoundRelation`, `droppedConstructNoun`, `droppedGivenNumbers`, `droppedGivenRelations`, `droppedGivenVerbs`, `droppedMidsegment`, `droppedNewLabels`, `droppedRadiusSymbol`, `droppedRegionSubject`, `droppedShapeNoun`, `droppedWordRelations`, `statedConvexity`, `statedDims`, `statedRadiusSymbols`, `statedSideLength`, `statedVerbOperands` |
  | `src3d/parser` | **8** | `droppedConstructNoun`, `droppedGivenNumbers`, `droppedNewLabels`, `droppedShapeNoun`, `droppedTriShape`, `statedQuadBase`, `statedTriShape`, `statedTriShapeWord` |
  | `src-complex/` | **0 of this family** | uses **total span accounting** (`parser/span.ts`) instead |

  Some of the 2-D↔3-D gap is legitimate — 3-D has fewer construct families. But **no artifact
  records which of the ten missing gates are deliberate and which are oversights.**
  [#555](https://github.com/dcodish/geo_builder/issues/555) is one confirmed oversight: the sequence
  gate is absent in 3-D, and its 2-D twin was a **P1** that committed the negation of a stated
  betweenness under a green ✓.

- **The solve ladder is documented twice** ([LADDER.md](LADDER.md), [LADDER-CX.md](LADDER-CX.md))
  and **3-D has no ladder document at all**, despite every 3-D mechanism ADR being required to name
  the stage it inserts at.

**A finding worth stating on its own, because it inverts the obvious framing:** `src-complex`'s zero
`dropped*` gates is not a hole. Total span accounting — every non-filler token span claimed or the
parse refuses — is a *structurally stronger* mechanism than eighteen post-hoc vetoes, and it fails
closed. On the property "no stated magnitude is ever silently dropped", the three products rank
**complex > 2-D > 3-D**, and the newest product has the best answer. Any conformance artifact must
therefore be written over **properties, not implementations** (§6), or it will force the two shipped
products' weaker mechanism onto the one that got it right.

### 1d. "Fix in one, break another" — already solved this morning

[ADR-W-017](06w-decisions-workspace.md#adr-w-017) (2026-08-16) added `npm run check:siblings`: a diff
refusal on shipped siblings' files (escape hatch is a *reason*, `ALLOW_SIBLING_EDIT="why"`, not a
flag) plus the sibling builds run regardless of the diff, to catch shared-surface breakage the diff
cannot see. ~10 seconds.

**This draft proposes nothing here — that half is done.** It closes *breaking* a sibling. It does
nothing about *forgetting* one, which is §1c and the substance of this document.

---

## 2. What must stay per-product, permanently

Recorded so that no phase below is read as proposing otherwise:

- **Engine, model, solver, replay, scene, parser rules and catalogs** — copied, never shared
  (ADR-W-003, ADR-W-004). The sibling *audit* spans the trees; the *code* does not.
- **Locale files, ADR logs, fixtures, deploy targets, CI lanes, save-file suffixes** — per-product
  by [docs/22 §9](22-workflow.md).
- **A product never imports another product's tree.** `BOUNDARIES.json` is the authority and
  `server/__tests__/isolation.test.ts` reads it.

---

## 3. The three layers, and the honest verdict on each

| layer | duplicated? | verdict |
| --- | --- | --- |
| **Engine** | No — different mathematics | **Leave alone.** Copying is correct. |
| **Chrome / shell** | Yes, three times, visibly | **Share it.** Already decided (ADR-W-016), not built. |
| **Doctrine / contracts** | Yes, in prose only | **Make it enumerable and checkable.** No mechanism exists today. |

---

## 4. RESOLVED — separate builders at separate links, one learned interface

**Operator ruling, 2026-08-16:**

> *"i will eventually have 4 or maybe even more builders that should all look and feel the same but
> in reality they are accessed via different links. we might have a toolbar on the ui to switch
> between them but thats it. so from a user pov he should be familiar with the tool and how to use
> it and what to expect."*

**Decided.** Each builder keeps its own entry, build, `dist-*`, and prod path. There is **no
merge into one app with modes** — that option is rejected, not deferred. Navigation between builders
is an ordinary link in a shared toolbar.

This is the low-risk branch, and it leaves the operator's *"I cannot afford impacting the 2-D and 3-D
in prod"* constraint intact: no product's URL, bundle, routing or deploy topology changes.

**Three consequences that shape everything below, and the third is not obvious:**

1. **The product switcher is itself a shared shell surface** — already named in ADR-W-016's rule-1
   seed list. It must be **data-driven, never import-driven**: `shell/` may not import a product
   tree (a forbidden edge in `BOUNDARIES.json`), so the roster of builders is configuration — name,
   URL, icon, per locale — handed in by the caller. Four-plus builders is exactly the case where a
   hand-maintained roster drifts, so the roster wants one home and a test that every declared
   product appears in it.

2. **The bar is "familiar", not "identical".** The engines differ by design (§2) and always will.
   A student who has used the 2-D builder should find the 3-D one's *frame* already learned — the
   same header, the same input box and palette behaviour, the same fact list, the same
   configuration cycling, the same save/load, the same error voice — while the *subject matter*
   inside is different. That is a statement about the shell and about interaction behaviour, not
   about geometry.

3. **"What to expect" makes UX consistency a testable contract, not a style guide.** This is the
   part that changes §6. If a student learns *"press this to see another configuration"* in 2-D and
   the complex builder either lacks the control, places it elsewhere, or makes it mean something
   subtly different, the tool has broken the promise the ruling makes — and nothing in the repo
   would currently catch it. The correctness doctrine (§1c) and the interaction contract are two
   row families of one mechanism, and this ruling is what puts the second family on the list.

**What was rejected, recorded so it is not re-litigated:** one app with modes (one URL, one bundle,
a mode switcher). It buys a shared session and cross-builder figures, and costs a change to both
shipped products' entry, routing, store bootstrap and deploy topology — precisely what ADR-W-016 was
written to avoid while they are stable, and it cannot be delivered incrementally.

**One rule kept anyway, because it is free:** `shell/` should not *assume* a single product per page.
Nothing plans to exploit that, but writing the frame parameterized rather than hard-wired costs
nothing today and is the difference between "we chose not to" and "we cannot".

---

## 4a. The UI/UX rulings (2026-08-16, taken one at a time)

The operator asked to be walked through the interface decisions individually. Each row is a ruling,
with what it changes. **Measured before asking, not recalled** — the differences below were read out
of `src/App.tsx` (2,240 lines), `src3d/App3.tsx` (851) and `src-complex/App.tsx` (319).

### D1 — Column model: **three columns, data panel opt-in, on its own side**

What the two shipped builders actually are:

- **2-D is two-column.** Canvas + one 400px `<aside>` (`order: 1`, so RTL puts it on the right)
  holding *everything*: input, steps, values, the query lane, shapes.
- **3-D is three-column.** Input + fact list (`md:w-96`, right), canvas (`flex-1`, centre), and a
  separate `md:w-64` data panel (left), gated behind one `showData` checkbox.

The operator's preference — *"what I like in the 3-D is that the data panel is on the left… it makes
it a bit more cleaner"* — decodes to something structural rather than positional: **3-D separates
"what I typed" from "what the figure knows"**, where 2-D stacks five kinds of thing in one column.

**Ruled: 3-D's three-column structure, 2-D's visual design, data column opt-in.**

*Consequence:* the layout must collapse on narrow screens, which is what forced D2.

### D2 — Styling mechanism: **Tailwind, carrying 2-D's token values, migrated per surface**

Three mechanisms exist today: 2-D inline `React.CSSProperties` over `ui/theme.ts`; 3-D real
**Tailwind v4** (`@tailwindcss/vite`, already in `package.json`); complex a plain CSS file.

The deciding fact: **inline style objects cannot express `:hover` or media queries at all.** Under D1
that is disqualifying — 3-D's `md:flex-row` collapse would have to be rebuilt as a JS resize
listener. And the failure mode is already measured: 2-D carries **194 inline hex colours despite
owning `theme.ts`**, because nothing forces token use.

**Ruled:** `theme.ts` *values* become the Tailwind theme, so the look is 2-D's, unchanged. `shell/`
and `src-complex` use it immediately; **2-D migrates one surface at a time as phase 3 touches it**,
each surface its own PR and revert unit. No big-bang conversion of the stable product.

### D3 — Colour palette: **one identical palette, 2-D's values**

Closer than they look: 2-D and 3-D **already share slate neutrals**. The divergence is one hue —
2-D `primary: #2563eb` (blue-600) vs 3-D sky-600 — plus complex's warm **stone** neutrals. Complex
had already borrowed 2-D's exact violet accent values (`#6d28d9` / `#f5f3ff` / `#ddd6fe`) — copying
by eye rather than by token, which is the ADR-W-016 argument in miniature.

**Ruled:** `src/ui/theme.ts` is the single palette — slate neutrals, blue-600 primary, violet accent,
`ok`/`warn`/`danger`. 3-D changes sky→blue; complex changes stone→slate; 2-D unchanged. Builder
identity is carried by the **switcher's active state**, not by the theme.

> **Guard — the operator's qualification, in the same breath:** *"we need to ensure that only
> relevant symbols appear per tool."*
>
> **The COLOUR palette is identical; the SYMBOL palette is NOT.** The word collides and the mistake
> would be easy to make. Symbols stay a **shared core + per-tool extension**, per the operator's
> 2026-08-16 ruling on [#525](https://github.com/dcodish/geo_builder/issues/525): most symbols are
> common to 2-D and 3-D, and complex diverges much more. A builder must never offer a glyph it
> refuses in every position — the offered-but-unsupported asymmetry that
> [#511](https://github.com/dcodish/geo_builder/issues/511) is blocked on.

### D4 — Header: **full bar, secondary actions behind an overflow menu**

The header is where "implemented-or-forgotten three times" is most visible. Measured:

| control | 2-D | 3-D | complex |
| --- | --- | --- | --- |
| title | h1 + subtitle | h1 + tagline | h1 |
| figure name | header field | header field (inline-editable, #42) | — |
| save / load | header row | — | header buttons |
| **language toggle** | ✅ | **❌ absent from the whole tree** | ✅ |
| Help / guide | ✅ | ❌ | ❌ |
| About modal | ✅ | ❌ — the code says *"this app has no about modal"* | ❌ |
| privacy note | inside About | a footer line (NFR-SE-3 fallback) | — |

**`changeLanguage` appears in `src/` and `src-complex/` and nowhere in `src3d/`** — a student in the
3-D builder cannot switch to English, though the parser handles both. Filed separately; it is not a
design difference but a forgotten surface, and exactly the class §6 family 2 exists to catch.

**Ruled:** title, figure name and the switcher stay visible; save / load / export / language / guide /
about collapse into a `⋯` overflow menu. The switcher is a dropdown, not a tab strip — *"4 or maybe
even more builders"* is the case a tab strip fails. Every builder gets the **full** action set, so
3-D gains both the language toggle and an About modal.

*Cost accepted:* one extra click for save/load.

### D5 — Input area: **one preview doing both jobs, wrap-selection palette**

Measured, and the three builders disagree in three different ways:

| | 2-D | 3-D | complex |
| --- | --- | --- | --- |
| preview | **maths** rendered (fractions, radicals, subscripts — #77/#40) | **bidi** isolation, and only when it would change the layout (`inputPreview3`, #482 option 3) | none |
| palette insert | at the caret, with `caretBack` for `\|·\|` | at the caret | **wraps the current selection** — select `AB`, press `\|·\|`, get `\|AB\|` |

**Third instance of the pattern from §1c: the newest builder has the better mechanism.** Complex's
wrap-selection palette strictly subsumes caret-insert (an empty selection *is* a caret insert, and
2-D's `caretBack` case falls out of it). Span accounting, then wrap-selection — twice now the rebuild
found the better answer while the shipped products kept the first one.

**Ruled:** one preview box that renders the maths **and** isolates the bidi, shown whenever either
job applies and hidden on a plain line — 3-D's "only when it adds information" gate, over 2-D's
content. Wrap-selection palette behaviour everywhere.

*Consequence:* the "does this add information?" gate is one predicate, and it must hold in every
builder — a natural row for §6 family 2.

### D6 — Fact list: **disable, edit in place, and delete — all three, everywhere**

The widest divergence found in the whole walkthrough, and it is on the surface the architecture is
built on (*"the ordered fact list is the source of truth; the figure is derived by replay"*).
Verified at the **store** level, not just the UI:

| operation | 2-D | 3-D | complex |
| --- | --- | --- | --- |
| enable / disable | ✅ (also per group) | ✅ | ❌ |
| edit in place | ✅ `replaceGroup`, re-parses | ❌ | ❌ |
| delete | ✅ `removeGroup` | ❌ | ❌ → ✅ `removeFact` |

`src3d/store/store3.ts` has neither `removeFact` nor `replaceGroup`; `useComplexStore` has
`removeFact` and no `enabled` flag. **The reversible/destructive pair is inverted between them** — in
3-D you can only mute a statement, in complex the only button destroys it.

**Ruled:** all three operations in every builder. They are semantically distinct — *disable* answers
"what if I hadn't said this?" and is reversible; *delete* answers "I typed that by mistake"; *edit*
keeps the statement's **position**, which matters because order is meaningful in a construction.

*Cost accepted:* this is the largest build of the walkthrough — 3-D needs `replaceGroup` +
`removeGroup`, complex needs an `enabled` flag threaded through its replay. **An edited line
re-parses**, so it faces the same honesty gates as a typed one; that is a §6 family 1 row, not just
a UI behaviour.

### D7 — Canvas controls: **every figure action lives under the canvas**

Both builders have viewport control already — 2-D's `Figure.tsx` carries a pan/zoom layer with
rotation and flips; 3-D has orbit/pan/zoom + reset view (#533). Those differ **by nature** (orbit is
meaningless in 2-D) and are `n/a` rows, not divergence. The real difference is placement:

- **2-D** puts *show another configuration*, undo, redo, clear and the DOF cue in the **sidebar**.
- **3-D** puts the same set in a row **under the canvas**.

**Ruled:** under the canvas, in every builder. Two zones with no ambiguity — *things I do to the
figure* beneath the drawing, *things I said* in the input column — which is the same separation D1
was chosen for. 2-D moves four controls; 3-D is already there.

**This also settles the DOF cue's placement** (originally listed as its own step): it reports the
figure's remaining freedom, so it belongs with the figure. Its *semantics* are a separate, already-
ruled matter ([#370](https://github.com/dcodish/geo_builder/issues/370): count the 6 sampled
placement DOFs).

*Argument on the losing side, recorded:* undo/redo act on the **fact list**, not the figure, so they
now sit one column away from what they rewind. Accepted for the simpler two-zone rule.

### D8 — Data panel: **one skeleton, one gate, per-builder rows**

| | 2-D | 3-D |
| --- | --- | --- |
| gate | a **compute button** (`values.compute` / `computing`) — the values are expensive | a **checkbox** (`showData`) — cheap |
| rows | radius, area, perimeter, angle + the query lane | relations, mutual, vectors (decomp/coords/magnitude/square), points, planes, params + the query lane |

**Ruled:** the same five sections in the same order in every builder — **points · measures ·
relations · parameters · ask** — each filling only the rows that apply to it (complex adds
modulus/argument; 3-D adds vectors and planes; an empty section is simply absent). **One control
opens it**; where the values are expensive, that is a *computing state*, not a different kind of
control.

*Cost accepted:* 2-D's compute-button becomes a checkbox plus a computing state — a real change to a
shipped behaviour, taken so the panel does not open two different ways depending on which builder
you are in.

**Not a UI choice, and binding regardless of the above:** the panel may print a value only when it is
**knowledge** — invariant across every valid configuration, with the gauge pinned — never "in the
current sample". ADR-421 was a **P1** on exactly this, and the operator ruled it again for complex on
[#623](https://github.com/dcodish/geo_builder/issues/623). §6 family 1 row.

### D9 — Guide: **a separate manual SCREEN per builder, plus in-app quick commands**

Operator ruling, 2026-08-16 — none of the three options offered:

> *"re the command catalog - it should be a separate screen altogether for each tool with examples of
> how to enter commands. so my vision is more of a manual guide than just a list of options. having
> said that, the tool should have some quick commands. the most popular commands that a user can
> click and see build without data entry."*

**This splits one surface into two things with different jobs:**

| | the manual | quick commands |
| --- | --- | --- |
| what | a **separate screen**, per builder — prose + worked examples of *how to enter* commands | a **small set** of the most popular commands, clickable, building with no typing |
| job | teaching | doing |
| where | its own route, reached from the `⋯` menu and the empty state | in the app itself (D9b) |

Today's surfaces are neither: 2-D's modal tab and 3-D's inline block are both *lists of options*,
which is exactly what the ruling rejects.

> **Risk this creates, and the guard for it.** `catalog.ts` is not only the user-facing reference —
> it is the **coverage map** (`CLAUDE.md`: *"Absence from the catalog = absence from coverage"*), and
> today the in-app list is rendered straight from it, so the list cannot lie about what the parser
> accepts. A hand-written manual **can**: prose drifts from the grammar the moment a rule changes,
> and a manual that teaches an utterance the parser refuses is an honesty violation aimed at exactly
> the student who trusted it.
>
> **The manual must stay catalog-backed:** every catalog entry appears in the manual, and **every
> example printed in the manual is executed through the real parser in the test suite**. Prose is
> free; examples are tested. That is a §6 family 1 row, and it is what makes a manual safe to write.

**Following from the ruling, not separately decided:** About/privacy stays a small modal mounted by
every builder — complex ships publicly with **no privacy note at all** (NFR-SE-3, flagged by
ADR-W-016), which the manual screen does not fix.

### D9b — Quick commands: **big on the empty canvas, a compact row once building**

**Ruled:** large chips centred on the empty canvas — a first click that needs no reading and no
typing — shrinking to a one-line strip above the input once a figure exists, so the affordance is
still there when a student forgets a phrasing mid-build. The empty state also links to the manual.

2-D already has the empty-state half (`canvas.emptyTitle` + clickable example chips); the compact
strip and the whole surface in 3-D and complex are new.

*Cost accepted:* one more line in the column D1 was chosen to unclutter.

### D10 — Tablet: **the data panel becomes an overlay in portrait; canvas and input stay side by side**

Bounded by an existing ruling: **NFR-US-4** — tablets in scope (touch, pinch-zoom, +/− buttons),
**phones explicitly out of scope** (operator, 2026-07-03, reaffirmed 2026-07-11).

The arithmetic forces the question: 256 + 384 = **640px of side panels**, against an iPad portrait
width of **768px**, leaves ~128px of canvas. 2-D's canvas already declares a 360px minimum, so it
would overflow rather than compress.

**Ruled:** landscape keeps all three columns. In portrait the data panel stops being a column and
slides **over** the canvas as a dismissable overlay when ticked, so **the canvas and the input box
are always both visible**. That is not an aesthetic preference — the defining interaction is watching
the figure form as information is added, and a layout that scrolls the figure off-screen while the
student types breaks the product, not just the page.

*Cost accepted:* while open, the overlay covers part of the figure it describes.

### Walkthrough complete

All ten decisions are ruled. Two of them changed the plan rather than just the pixels: **D9** added a
per-builder manual screen that did not exist in any product, and **D6** turned out to be the largest
build in the programme. The **§6 family 2** row set is now concrete rather than illustrative — every
ruling above is a row, and the builders' current states are its first failing column. (position, palette, live preview) · 6. Fact/steps
list · 7. Canvas controls ("show another configuration", zoom/pan/reset) · 8. Data panel contents
· 9. DOF cue · 10. Modals (About/privacy — 2-D only today) · 11. Responsive/mobile

---

## 5. Proposed order of work

Phased so that each phase is independently valuable and independently revertible. **Nothing here is
scheduled; §8 must be answered first.**

### Phase 1 — build `shell/`, complex consumes it *(already decided; just not built)*
[#617](https://github.com/dcodish/geo_builder/issues/617), slice S0 of the complex rebuild
(ADR-W-016). Creates `shell/`, the `BOUNDARIES.json` edges, and the CI lane. **Zero risk to 2-D and
3-D: neither tree changes.**

Urgency independent of this document: `ci.yml` contains **zero** occurrences of "complex" while S1,
S2, S3 and the engine switch have all merged into that tree. Four slices have landed unguarded.

*Gate:* isolation + docs-hygiene green; 2-D and 3-D bytes unchanged; `check:siblings` clean.

### Phase 2 — the doctrine conformance matrix
The new mechanism. Design in §6. Independent of §4 — it is worth building under either option.

*Gate:* the matrix's first run is expected to FAIL, and that failure is the deliverable — it names
every contract a product does not answer for. Nothing is fixed in this phase; unexamined cells become
issues.

### Phase 3 — the shipped products adopt `shell/`
**Only after complex has proved `shell/` in prod.** One surface at a time, each its own PR and its
own revert unit, sibling builds green at every step, tokens first (the highest-visibility,
lowest-risk surface), then the frame + switcher, then the rest of the seed list.

Under the §4 ruling this phase is bounded: it changes what the shipped products *import*, never
their entry, routing, bundle or prod path.

*Gate:* per surface — `npm run test:full`, both sibling builds, and an operator play of both shipped
products before the next surface starts.

### Phase 4 — analytic geometry starts on the shared floor
`src-analytic/` is deliberately last ([ADR-CX-001](06d-decisions-complex.md) D5). If phases 1–3
land first, it is the first product that never has to re-derive the doctrine or re-implement the
chrome — which is the whole return on this work.

---

## 6. The conformance matrix (phase 2, design sketch)

**Not shared code.** A shared *checklist with teeth*: the contracts listed once, each product
answering for itself, a missing answer made loud instead of invisible.

**Shape.** One manifest — properties as rows, products as columns; each cell is one of:

| cell | meaning |
| --- | --- |
| `satisfied: <mechanism>` | the product honours the property, naming the code that does it |
| `n/a: <reason>` | the property cannot arise here (e.g. a 2-D-only construct family) |
| `absent: <issue#>` | a known, tracked gap |
| *(unset)* | **fails the test** — nobody has looked |

The fourth state is the entire point. Today a 3-D gate that nobody thought about is
indistinguishable from one deliberately omitted; this makes them different objects.

**Two row families**, per the §4 ruling. The correctness family was always the point; the
interaction family exists because *"the user should be familiar with the tool and what to expect"* is
a promise that four-plus builders can break silently.

### Family 1 — correctness contracts

**Properties, not implementations** (per §1c's finding). Rows are written as claims about behaviour:

- *No stated magnitude is silently dropped.* — 2-D `satisfied: 18 dropped*/stated* gates`;
  3-D `satisfied: 8 gates` + the unset cells that fall out of the 2-D list; complex
  `satisfied: total span accounting, fails closed`.
- *A statement whose point SEQUENCE is its semantics is not reordered by the LLM seam.* — 2-D
  `satisfied: restoreStatedSequences`; 3-D `absent: #555`; complex `unset`.
- *Every unstated magnitude is a free DOF, never a fixed default* (ADR-052).
- *A recognized ambiguity surfaces a typed refusal rather than declining to the LLM lane*
  (ADR-3D-131 / [#519](https://github.com/dcodish/geo_builder/issues/519)).
- *An error message names the conflicting statement, never internal state* (ADR-276).
- *Restating a known fact adds no row* — the operator's 2026-08-16 ruling on
  [#613](https://github.com/dcodish/geo_builder/issues/613), explicitly *"true to all tools"*, and
  the first contract to enter the matrix already scoped cross-product.
- *A saved file replays to the same figure; positions are never stored* (ADR-232).
- *The load audit reports what it could not restore* (ADR-242 / ADR-3D-087).

### Family 2 — interaction contracts (the §4 ruling's half)

What a student learns once and expects everywhere. Each row is *"this control exists, is reachable
the same way, and means the same thing"* — or an explicit `n/a` with a reason.

- **The utterance input**: same position, same submit behaviour, same symbol palette (shared
  vocabulary + per-builder extension, the operator's ruling on
  [#525](https://github.com/dcodish/geo_builder/issues/525)), same live preview, same RTL/bidi
  handling of the student's own text ([#482](https://github.com/dcodish/geo_builder/issues/482)).
- **The fact list**: same place, same enable/disable, same edit and undo semantics, same rule that
  restating a known fact adds no row ([#613](https://github.com/dcodish/geo_builder/issues/613), the
  operator's *"true to all tools"*).
- **"Show another configuration"**: present wherever the builder has free DOFs, same label, same
  meaning — cycle an unstated choice, never change a stated one.
- **The DOF cue**: same place, same semantics for "fully determined".
- **The commands/coverage panel**: driven by that builder's own catalog, presented identically.
- **Save / load**: one envelope shape, one naming convention, one load audit, one file-suffix
  convention per builder.
- **Error voice**: a refusal names the conflicting *statement*, never internal state — the same
  sentence shape in every builder.
- **The product switcher**: same position, same roster, in every builder.

An `n/a` here is normal and healthy — "show another configuration" means nothing in a builder with
no free DOFs. What the matrix forbids is the *unexamined* cell: a control that exists in three
builders and was simply never considered in the fourth.

**Where it lives.** `server/__tests__/` — the `isolation.test.ts` precedent, so it runs in **every**
per-product lane and a product cannot skip its own row by staying in its lane.

**Precedents in-repo, so this is not a new pattern:**
- [ADR-W-003](06w-decisions-workspace.md#adr-w-003) — classification is **total**; an unclassified
  directory fails the test.
- [ADR-W-006](06w-decisions-workspace.md#adr-w-006) — a mirror's contract is **derived** from the
  mirrored source, never enumerated by hand.
- [ADR-W-017](06w-decisions-workspace.md#adr-w-017) — an unrecognised path is **shared, never
  inert**; unknown-by-default must mean "check it".

**Explicitly NOT this:** a shared honesty-gate *implementation*. That would drag `src-complex`'s
stronger span accounting down to the older products' post-hoc vetoes, and it would put engine-layer
code in a shared tree, which §2 forbids.

**Open sub-question:** derived or hand-maintained? ADR-W-006 argues derived, but the properties above
are not mechanically extractable from code — a hand-written row set with a mechanical
*completeness* check (every product answers every row) may be the honest compromise. §8 Q4.

---

## 7. Risk, and the operator's standing constraint

> *"i cannot afford impacting the 2d and 3d in prod… i will later have this unification discussion."*
> — operator, 2026-08-15, recorded verbatim in ADR-W-016

Phases 1 and 2 respect this **completely**: phase 1 changes zero lines of `src/` or `src3d/` by
construction, and phase 2 adds a test that reports, and changes no product behaviour.

Phase 3 is the first phase that edits shipped products, which is why it is gated on prod evidence
from complex and split per surface. The §4 ruling caps how far it can go: imports change, entry
points and deploy topology do not.

**The cost of waiting**, stated so the choice is symmetric: ADR-W-016's own argument is that a third
copy *"re-drifts on the first divergent edit — which already happened"* and turns the later
unification into a three-way reconciliation. Analytic would make it four-way. Every complex slice
landing now is written against no shared floor.

---

## 8. Open questions — must be answered before this becomes a plan of record

**Answered 2026-08-16 — kept here as the record:**

- ~~One app, or separate builders?~~ **Separate builders at separate links, with a toolbar
  switcher** (§4). One app with modes is rejected, not deferred.
- ~~Does `shell/` own the app frame, or only its parts?~~ **The frame**, which follows from the
  ruling rather than being decided separately: a switcher in every builder's toolbar is a frame the
  builders share, not a widget each one hosts. *Flagged as a reading of the ruling — correct it here
  if the intent was narrower.*

- ~~What is the visual target?~~ **2-D's look**, via `theme.ts` values carried by Tailwind — §4a D2
  and D3. The whole interface is now specified in §4a, D1–D10.

**All four remaining questions were answered 2026-08-16:**

**Q1 — sequencing: BUILD-LED.** 2-D is the reference; work starts (shell/ + the CI lane, then the UI
rulings) and matrix rows are written **alongside each surface as it lands**, rather than up front.
*Accepted cost, stated plainly:* there is no baseline, so improvement is asserted rather than shown,
and the **correctness** gaps — the unknown ones, the class that produced a P1 — stay unmeasured
during the build.

> **Implementation rule that keeps that cost from growing:** when a surface lands, its row is written
> for **every** builder, not only the one being worked on. Otherwise "measure as we go" yields a
> matrix describing whichever builder was touched last, and the cross-builder question — the entire
> point — never gets asked.

**Q2 — the row list is DERIVED, by a dedicated extraction pass over the ADR corpus.** The operator
rejected the draft's hand-authored answer as under-specified, correctly: it described the enforcement
and skipped where the content comes from.

Measured: **665 ADRs** across the four logs, of which **109 have contract-shaped titles** that state
the property outright (*"…may never share a location"*, *"…escalates, never half-parses"*, *"…never
silently read as a plain line"*). **The row list already exists — distributed across the logs.**

Ruled: **triage all 665 titles**, classify each as cross-cutting contract / product-specific
mechanism / process decision, and read every candidate's body to extract the property, its
provenance, which builders it binds, and how each answers today. The keyword shortlist is rejected as
the scope — it would miss ADR-421 (the knowledge rule, a P1) and ADR-232 (replay inputs only), whose
titles carry none of those words, and a filter cannot report what it missed.

> **This resolves the ADR-W-006 tension rather than excusing it.** The ADR corpus *is* the source to
> derive from, so the matrix is a derivation, not an enumeration. The maintenance rule can then be
> mechanical: a new ADR whose title carries contract language must be either classified into the
> matrix or explicitly excluded with a stated reason — otherwise the check fails.

**Q3 — any mechanism that holds the property counts.** The matrix asks *does the property hold*, not
*how*; it still records **which** mechanism each builder uses, so asymmetry stays visible and can be
picked up as ordinary scheduled work. A better mechanism appearing in one builder creates **zero**
obligations in the others — the alternative turns every improvement into N−1 obligations and makes
improving expensive, which punishes exactly the behaviour worth encouraging.

*Live case that shaped the ruling:* on *"nothing stated is silently dropped"* — complex **enforces**
span accounting (#621, landed 2026-08-16), 2-D has the same accounting **in shadow** behind its 18
gates, 3-D has 8 gates and no accounting. All three pass the property. The asymmetry is recorded and
scheduled as [#659](https://github.com/dcodish/geo_builder/issues/659), not forced.

*Accepted cost:* the weakest mechanism can persist as long as no counter-example is found — and "no
counter-example found" is not "holds".

**Q4 — one machine-readable product registry, several consumers — plus operator-editable config.**

The registry is the machine version of the [docs/22 §9](22-workflow.md) table that nothing enforces
today: id, label key, URL, icon, source tree, build target. `shell/`'s switcher renders it as **data,
never imports** (the forbidden edge stands), and the isolation test cross-checks it against
`BOUNDARIES.json` — a registered tree with no roster entry **fails**, so builder 5 cannot ship missing
from two toolbars. It also retires the drift in the docs/22 §9 table and the `ci.yml` classifier's
second hand-maintained copy of the same paths.

**Operator requirement added in the same answer:**

> *"I would also add to the recommendation that we have human manageable config/admin pages where i
> can decide things without having to change code for it."*

`server/admin.ts` already exists — password-protected, parameterized by `tool:` — but it is
**read-only and stateless** (a signed cookie, no store), so editable config is new scope: persistence
+ write endpoints, on an auth surface that is already built.

**The line that keeps it honest, and it is not negotiable:** admin config may only **choose among
what the code already supports**; it may never **assert support the code lacks**.

| may be configured (curation) | must stay in code + tests (capability) |
| --- | --- |
| which builders appear in the switcher, and their order | which builders exist, their trees and URLs — cross-checked against `BOUNDARIES.json` |
| labels and icons | what the parser accepts |
| **which quick commands are featured**, per builder | the catalog itself — the coverage map |
| defaults a deploy shouldn't be needed to change | any honesty gate, contract or verifier |

A quick command saved in admin is **validated against that builder's catalog at save time** and
refused if absent. Without that, the admin page becomes a way to offer a student a command that
fails — the offered-but-unsupported asymmetry [#511](https://github.com/dcodish/geo_builder/issues/511)
is blocked on, with a nicer UI.

*Degraded path:* the static registry is the fallback and the config overlays it, so a server that is
down or unreachable leaves every builder working with its built-in roster.

---

## 9. What this document does NOT propose

- Merging or sharing any engine code (§2).
- Changing `BOUNDARIES.json`'s copied-never-shared rule for `engine`.
- Touching `src/` or `src3d/` in phases 1–2.
- A big-bang refactor. Every phase is independently revertible, and phase 3 is per-surface.
- **Any change to the products' URLs, entry points, bundles or deploy topology.** Ruled out by §4:
  the builders stay separate apps at separate links, and the switcher is a link in a shared toolbar.
