# 06c — Decision log: the analytic-geometry tool (`src-analytic/`)

_The analytic track's OWN ADR log (ids `ADR-AG-NNN`), separate from the sibling logs **by design** —
docs/20 §12 rule 3: parallel session streams must not race on one ADR numbering sequence. Same
conventions otherwise: every significant decision gets an entry; the plan of record is
[19-analytic-geometry-tool.md](19-analytic-geometry-tool.md)._

---

## ADR-AG-001 — Product accepted; the doc-19 §6 deadlock resolved (2026-09-03)

**Context.** The analytic tool was registered in the workspace ([docs/22 §9](22-workflow.md)) and
deliberately queued **last** ([ADR-CX-001](06d-decisions-complex.md#adr-cx-001) D5, "we will leave
analytic to the end"). Its plan, [docs/19](19-analytic-geometry-tool.md), was drafted 2026-07-06 off
a **three-exam** sample and had stood at `PROPOSED` ever since, blocked on one open decision (§6):
does the tool *verify* a claimed locus equation, or *derive* it? Everything downstream — above all
how big the equation layer has to be — turned on that answer, so nothing could be planned.

An operator session on 2026-09-03 supplied the real corpus (`בגרויות 572.pdf`, the level up / אילון
פרץ collection: **twenty** consecutive Q1s, קיץ א' 2021 → קיץ ב' 2026, with the author's own
per-exam topic index). Reading all twenty changed three premises and dissolved the deadlock.

**What the twenty-exam reading established** (full tallies in [docs/19 §2](19-analytic-geometry-tool.md)):

1. **There is no figure.** 17 of 20 questions print no drawing at all; two of them explicitly
   *instruct the student to draw* (`סרטטו במערכת צירים אחת סקיצה…`, `שרטטו את שתי האפשרויות`). This
   inverts the sibling products' value proposition — the 2-D and 3-D tools reproduce a printed
   figure, this one **draws the figure the exam withholds**. Same finding as the complex tool's
   "the Gauss plane is a drawing the exam never prints" ([docs/27 §1](27-complex-numbers-tool.md)).
2. **Every conic in twenty exams is canonical.** Parabola always `y²=2px` on the x-axis; ellipse
   always `x²/a²+y²/b²=1` centred at the origin. No hyperbola, no rotated conic, no translated
   conic — and the formula sheet agrees (§3 of the plan: its whole analytic section is two
   formulas, point-distance and the ellipse). The conic layer is **two shape families in standard
   position**, not a general conic engine.
3. **The parameter model is already built.** A symbolic parameter sits inside the coefficients in
   10 of 20 (`a, b, t, k, p, m, n`), pinned later by a stated relation whose root-find often has
   **two roots**, which the exam then asks for as `שתי האפשרויות`. That is `src3d`'s algebraic lane
   verbatim ([ADR-3D-002](06b-decisions-3d.md#adr-3d-002)): one symbolic parameter, pinned by
   root-finding, roots = branches, `no-roots` an honest contradiction.

**Decisions (operator, 2026-09-03):**

1. **D1 — draw-and-verify, and therefore NO CAS.** The tool draws the figure and paints the locus
   trace; the student types the claimed equation or coordinates and the tool verifies it, marking
   ✓ or refusing it honestly. The charter is unchanged from the three shipped siblings: **reproduce
   and verify, never solve.**

   The reason this now closes a decision that looked open for two months: the asks that *seemed* to
   force symbolic output do not. `הביעו באמצעות k את משוואת המעגל` is verified by checking the
   student's `(x−5k)²+y²=9k²` **across sampled values of k** — the same mechanism `src3d` already
   uses for `AM→ = u + ½v − w` claims, and the same discipline as
   [ADR-CX-001](06d-decisions-complex.md#adr-cx-001) D1 ("bounded, **no CAS**"). Locus asks verify
   identically, as a residual over the swept trace. Draw-and-verify covers **100% of the
   twenty-exam corpus** with zero symbolic algebra. The NO-CAS boundary of
   [src3d/CLAUDE.md](../src3d/CLAUDE.md) rule 3 is adopted here verbatim, with the same escalation
   route: anything needing symbolic solving beyond a 1–2-DOF numeric root-find goes back to the
   operator.

2. **D2 — V0 is the equation + tangency substrate, not the locus.** First playable slice: axes and
   the pinned coordinate gauge · circle / line / canonical parabola / canonical ellipse **by
   equation** · point-on, intersections, point-line distance, tangency · the one-parameter pin with
   roots surfaced as branches. This covers outright the ~7 of 20 exams with no locus ask, and it
   builds the substrate every locus question needs underneath it anyway — so the locus lane (V1)
   lands on proven ground instead of front-loading its risk. Corpus gate for V0: קיץ א' 2022 (two
   circles, all common tangents, `#משיק משותף`) reproduced end-to-end.

**What this does NOT decide.** The 471 ↔ 572 profile split (the registry's "ONE engine with
curriculum-level profiles" — [docs/22 §9](22-workflow.md)) is a V2+ question and is deliberately
left open; V0/V1 target 572 only. Nor does it decide the URL, the deploy path, or whether the tool
reveals an answer after a wrong attempt — all deferred to the first build session.

**Consequences.** [docs/19](19-analytic-geometry-tool.md) is rewritten from `PROPOSED` to the
decision-complete plan of record. `src-analytic/` moves from `plannedTrees` to `trees` in
`BOUNDARIES.json` when the first file lands, not before.

---

## ADR-AG-002 — The ROUTE lane: the pedagogical core, on the existing ask channel (2026-09-03)

**Status:** Accepted (2026-09-03) · **D3 and D4 amended the same day by
[ADR-AG-003](#adr-ag-003) — the data panel follows the 3-D contract (what is fixed by the data is
shown), and the route table's first delivery is a derivation trace, not an options menu. D5 and the
authorship model stand unchanged.**

**Context.** Operator, same session: *"One of the things that makes this tool stand out is that the
input users can give is usually very limited… he wants to know what is the equation of a specific
line… we can possibly also try to give tips or ideas about how to get to this equation. Now this
isn't a solver… it's just, what options do you have based on the question. Somewhat similar (but
much simpler) to the theorem detection concept in the 2-D tool."*

The observation behind it is the product's real shape. In the sibling tools the student types many
facts and the tool draws them; a 572 Q1 gives **four lines of givens and then asks a question**. The
hard part for a student is not the algebra — it is knowing which formula to reach for. A teacher's
entire value in that moment is *"you have a point and you have a perpendicular, so use the
perpendicular-slope rule."* That is a **menu of routes**, and it is to this product what theorem
surfacing is to the 2-D one ([docs/10 §3](10-pedagogy.md)).

**The mechanism already exists — twice.** `shell/frame/DataPanel.tsx` ships the fixed section
skeleton *points · measures · relations · parameters · **ask***, with its `children` slot documented
as taking an ask form; behind it `src3d/engine/queries.ts` ([ADR-3D-057](06b-decisions-3d.md#adr-3d-057),
#274) is the channel itself: *"a SEPARATE input where the student asks for a specific quantity and
sees its value WITHOUT adding anything to the figure. A query is a question, never a fact: it never
enters `replay`, never moves a point, never appears in the step list."* The third utterance class —
givens · claims · **asks** — is settled architecture and the surface is already in shared chrome.
This ADR does not add a lane. It gives that lane **a different answer** when what is asked for is
the exam's own currency.

**Why it is genuinely simpler than the 2-D spine** (and why none of docs/18's wounds reproduce):

1. **No discovery.** The 2-D feed must find which of 109 theorems could apply. Here the student
   *names the target*, so the table is indexed by target kind — line equation · circle equation ·
   conic equation · point coordinates · locus equation · parameter value · length/angle/area. About
   8 kinds × 3–5 routes ≈ 30 authored entries.
2. **No relevance problem.** [docs/18 R3](18-theorem-relevance-plan.md) — "'prioritized' was never
   designed or tested" — cannot occur: a menu scoped to one named target is four items long.
3. **Availability is decidable, not evidential.** The engine already knows whether `B` and `D` are
   determined, so ✓/✗ per route is a fact. No L1/L2/L3 evidence machinery is needed, and the lane
   cannot hallucinate an available route.

**Decisions (operator, 2026-09-03):**

3. **D3 — split by currency.** An ask for an **equation or a point's coordinates** returns the
   **route menu and never the value** — that is what the exam asks for. An ask for a **supporting
   scalar** (length, distance, angle, area) is *answered* when it is knowledge, exactly as the 3-D
   lane does today, preserving the approved "organize your data" pedagogy
   ([src3d/engine/dataView.ts](../src3d/engine/dataView.ts)) without handing over the answer.
4. **D4 — the tool never chains.** A blocked route names the missing **quantity**, never its value
   (`חסר: השיפוע של BD`, never `−5/3`), and stops. If the student wants that quantity's own routes
   they **ask again** — the same single mechanism, no new UI, and the student does the chaining,
   which is the part worth them doing. "Not even step-by-step" stays literally true.
5. **D5 — notices deferred.** Lane B (the tool volunteering `הישר משיק למעגל בכל תצורה` unasked —
   the direct analogue of the 2-D L3-observed hint, and the home of the corpus's most common
   `הוכיחו` item) is **out of the first build**. Routes ship and are validated first; the notices
   lane needs the forced-across-samples discipline and an anti-flood cap of its own.

**Two structural rules that keep this from becoming a solver** (design consequences, not separate
decisions):

- **Route order is authored and constant** — the textbook order, never re-sorted by which route the
  engine would actually take. A ranked menu leaks the intended solution path; a fixed one cannot.
- **No route card ever prints a value.** The tool holds the number; it does not say it. This is the
  2-D no-reveal boundary ([docs/18 §2](18-theorem-relevance-plan.md), the conclusion-side rules)
  transplanted, and it is why D3's split is drawn at *currency* rather than at *difficulty*.

**Authorship.** The route table is **teacher knowledge, not engine knowledge** — the
`PRINCIPLE_TABLE` model ([docs/18 §6](18-theorem-relevance-plan.md)): a readable catalog in the
operator's voice, bound to the code table by an integrity test, growing by operator direction. It
doubles as the coverage map of the technique inventory, the way `catalog.ts` does for input.

**Consequences.** [docs/19 §4b](19-analytic-geometry-tool.md) records the lane; §7 adds the pedagogy
phases R1 (routes) and R2 (notices) as a **second axis** alongside V0–V4 — the route lane needs the
V0 substrate but not the loci, so it does not renumber the capability slices. Still open, unchanged:
whether an answer is ever revealed after a wrong claim.

---

## ADR-AG-003 — Multipart is a WORKSPACE model, and the data panel follows the 3-D contract (2026-09-03)

**Context.** Reviewing [ADR-AG-002](#adr-ag-002), the operator rejected the framing that
multi-section questions are an analytic problem: *"This issue of multipart is not specific for this
type of question. It's always been the case in all of the questions we do. So when the user enters
data for section one… he will then input any new information that was given to him in section two.
Section two builds on section one, so the engine should not be surprised… the data panel accumulates
all of the referred or inferred data from the question."*

**1. The multipart model — already the architecture, now named.** A bagrut question arrives in
sections (א ב ג ד ה) and the student enters each section's givens as they come. There is no
per-section state: the **ordered fact list accumulates across the whole question**, the figure is
re-derived, and the data panel is that ledger made visible. What makes a later section land without
surprise is **M1 — existing-id lowering** ([docs/17 §M1](17-design-rules.md)): "a command that would
create an object whose id already exists is not a conflict and not a re-creation: it lowers to
constraints on the existing object … the lowering lives in ONE place at the apply boundary."

This is mature in every tree — `reinterpretAsConstraint` and the #613 restate-dedupe in 2-D, "M1
duality intact (new id → free rider; existing id → verified/driven given)" in 3-D — and it has been
exercised on real multipart exams twice: [ADR-308](06-decisions.md#adr-308) is a 2025-bagrut
**part-ב** that could not be drawn until M1's over-constraint reporting was fixed, and
[ADR-3D-031](06b-decisions-3d.md#adr-3d-031) is a 2024-Q2 **part-ב** chain landing on the book's
answer.

**Obligation on the new product:** `src-analytic/` inherits M1 at the apply boundary **from day one**,
not as a later refinement. Without it, every second section of every question is a false conflict.
This is the [ADR-W-004](06w-decisions-workspace.md#adr-w-004) discipline applied forward rather than
after a bug: the products copy patterns by design, so a *load-bearing* pattern must be copied
deliberately.

**2. D3 amended — the data panel shows what is fixed by the data.** Operator, verbatim: *"this
should be just like the 3d. we show the values and equations once they are defined by the input …
for starters we should stick with the other tool behavior which is what's fixed by data — we show in
data panel."*

So [ADR-AG-002](#adr-ag-002) D3's currency split is **withdrawn**. The contract is the 3-D one
([src3d/engine/dataView.ts](../src3d/engine/dataView.ts)): derived results — including equations and
coordinates — are shown when they are **knowledge** (invariant across every valid configuration,
never one sample's value, [ADR-052](06-decisions.md#adr-052)), behind the same explicit student
checkbox that gates the 3-D panel. The honesty gate that matters is unchanged and is the one the
`DataPanel` skeleton already binds: *"a value row may print a VALUE only when it is knowledge."*

**3. D4 amended — the route table's first delivery is a TRACE, not an options menu.** Operator:
*"what I want to maybe add is an option of showing how we reached this result — what equations and
inputs did we use. however, we can scope this as a later version."*

With values shown, "here are the routes you could take" loses its occasion; the useful question
becomes **"how was this one reached?"** — which givens and which formula produced the row. The
authored technique table from [ADR-AG-002](#adr-ag-002) survives intact and serves the trace: it is
the vocabulary of the explanation. Two consequences:

- **R1 is re-scoped** from an ask-triggered options menu to a **derivation trace on a shown row**,
  and **deferred to a later version** on the operator's instruction. V1 ships the 3-D panel
  behaviour and nothing more.
- **D4's "never chains" concern is moot in its original form.** It guarded against the tool
  assembling a solution plan while values stayed hidden. A trace explains a result the student can
  already see; it is provenance, not a hint. The anti-solver boundary is now carried entirely by the
  knowledge gate (§2) rather than by withholding.
- The **options menu** survives only as the degenerate case — a row that is **not** determined, where
  the honest answer is what is still missing. Whether that is worth building is deferred with R1.

**Unchanged:** D5 (the notices lane stays deferred) · the authorship model (the technique table is
the operator's voice, bound to a readable catalog by an integrity test) · every ADR-AG-001 decision.

---

## ADR-AG-004 — Suite conformance is a V0 ACCEPTANCE GATE, not a polish pass (2026-09-03)

**Context.** Operator, same session: *"when we start building this tool, it needs to fit into the
overall tool. So it needs to have its specific chips that lead to the page, and the look and feel of
the input and data and grid and so on is exactly like the other tools we have."*

This is already the plan of record — [docs/28 §5](28-product-unification.md) Phase 4 is *"analytic
geometry starts on the shared floor… the first product that never has to re-derive the doctrine or
re-implement the chrome, which is the whole return on this work."* And the floor is **built**: all
three shipped products now import `shell/` (`BOUNDARIES.json` carries `src → shell`, `src3d → shell`
and `src-complex → shell` as asserted-real edges), the canvas cluster is one contract
([ADR-W-024](06w-decisions-workspace.md#adr-w-024)), the quick chips are one component
([ADR-W-029](06w-decisions-workspace.md#adr-w-029)), and `products.json`
([ADR-W-021](06w-decisions-workspace.md#adr-w-021)) is the roster every builder's switcher renders as
data.

**What was missing is not a decision — it is a gate.** Nothing in [docs/19](19-analytic-geometry-tool.md)
said conformance is part of *shipping V0*, and "make it match the others" is exactly the item that
slips to a follow-up when a new product is being built fast. This ADR fixes that: **V0 does not pass
its gate until the checklist below is green.** The corpus gate (קיץ א' 2022) and this one are one
gate, not two.

**The conformance checklist.**

1. **Roster entry in `products.json`** — `id: "analytic"`, `labelKey`, `icon`, `url`, `devUrl`,
   `tree: "src-analytic"`, `buildTarget`, `enabled`. This is what puts the tool's **chip in every
   other builder's switcher**; `server/__tests__/isolation.test.ts` fails on a product tree with no
   entry, and `registry-consistency.test.ts` holds `ci.yml` and the [docs/22 §9](22-workflow.md)
   table in step with it.
2. **A `switcherAnalytic` locale key in EVERY product's resources** — He *and* En, in `src/i18n`,
   `src3d/i18n`, `src-complex/i18n` and its own. `labelKey` is resolved by *each consuming product's*
   i18n (the `products.json` contract), so a missing key is a blank chip in a sibling tool, not in
   this one. **The single easiest item to miss**, because it is the only one whose failure shows up
   somewhere other than the product being built.
3. **Mount the shared frame, do not re-implement it** — `AppFrame`, `Switcher`, `Workbench`,
   `InputArea`, `FactList`, `DataPanel`, `AskLane`, `QuickChips`, `SymbolRow`, `ToolButton`,
   `FigureName`, `Banner`, `Modal`, `ManualScreen`, plus `theme`, `bidi`, `format`, `i18n`, `save`,
   `symbols`, `export/`. The [docs/28 §4a](28-product-unification.md) rulings D1–D10 apply as
   written — three columns with the data panel opt-in on its own side (D1), the shared palette (D3),
   the header with its overflow menu (D4), one input preview (D5), fact-list disable/edit/delete
   (D6), every figure action under the canvas (D7), the one data-panel skeleton and gate (D8), a
   manual screen plus in-app quick commands (D9/D9b), the tablet overlay (D10).
4. **Canvas controls from `shell/frame/canvasControls.ts`** ([ADR-W-024](06w-decisions-workspace.md#adr-w-024))
   — same ↺ / − / + cluster, same glyphs, same zoom arithmetic. Rendered by the product (view state
   never enters the store or undo), styled from the shared module. "Grid and so on" is this item plus
   D7's under-canvas row.
5. **Quick chips supplied as `commands` + `display`, never one string**
   ([ADR-W-029](06w-decisions-workspace.md#adr-w-029)) — raw command is what `onPick` receives and
   what reaches the fact list, the saved file and the `.docx`; the display form is presentation only.
6. **`BOUNDARIES.json`** — move `src-analytic` from `plannedTrees` to `trees`, classify **every**
   directory (classification is total; an unclassified directory fails the suite), add the allowed
   edge `src-analytic → shell`, and the forbidden edges to `src`, `src3d`, `src-complex` and
   `server`.
7. **The parity locks gain the new tree** — `shell/__tests__/row-parity.test.ts`,
   `ask-lane-parity.test.ts`, `switcher-config.test.ts`, `switcher-slices.test.ts`,
   `quick-chips.test.tsx`, `data-panel.test.tsx`. These are source-scan locks over the builders, so a
   fourth builder that is not enumerated is simply unchecked — the conformance is only as real as its
   membership in these tests.
8. **The rest of the [docs/22 §9](22-workflow.md) N+1 recipe** — `analytic.html`,
   `vite.config.analytic.ts` (own `base`, own `dist-analytic/`, **no `@` alias**), `build:analytic`
   and `test:analytic` scripts, the `test-analytic` CI lane and its `changes` classifier paths, the
   `analytic` GitHub label (created 2026-09-03), and the server's `tool: 'analytic'` value, log sink
   and `DashboardProfile`.

**What conformance does NOT mean.** [docs/28 §2](28-product-unification.md) stands: engine, model,
solver, replay, scene, parser rules and catalogs are **copied, never shared**; locale files, the ADR
log, fixtures, the deploy target, the CI lane and the save-file suffix stay per-product. Uniformity
is the chrome and the doctrine, never the geometry.
