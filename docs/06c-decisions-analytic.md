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

---

## ADR-AG-005 — The input language, the naming conventions, and the THREE kinds of inequality (2026-09-03)

**Context.** Asked whether the plan was buildable, the honest answer was "enough to start, not enough
to finish V0": [docs/19](19-analytic-geometry-tool.md) §2c/§2d carried a *construct set* and a
*vocabulary list*, which is not a grammar. Every sibling has the layer above that — `catalog.ts`,
`catalog3.ts`, [docs/27 §10](27-complex-numbers-tool.md)'s "generic sentence families" — and it is
what a build session hits in hour one. A second gap sat underneath it: the corpus does not only *pin*
parameters, it **bounds** them, in 14 of the 20 exams, and `src3d`'s transplanted model covers only
the pinning.

This ADR closes both. The language itself is [docs/19 §10](19-analytic-geometry-tool.md), extracted
from the same twenty exams; the decisions are here.

**D6 — naming, taken from what the corpus already does.**

- **Circles are named**: `מעגל I` / `מעגל II` (the corpus's own Roman-numeral device), or
  `המעגל שמרכזו M`, or bare `המעגל` when unique. Circles are the one family that regularly arrives in
  twos, so naming is not optional for them.
- **Parabolas and ellipses are anonymous** — `הפרבולה`, `האליפסה`. No exam in twenty carries two
  parabolas or two ellipses, so at most one of each may exist per figure. A second one is a refusal,
  not a silently-shadowed object.
  > **The one-of-each half is WITHDRAWN** by [ADR-AG-018](#adr-ag-018) (#1026, 2026-09-15). Being
  > rare in the corpus was a reason not to *name* them; it was never a reason to *refuse* the second
  > one, and the refusal that shipped was not enforcing this bullet — it was reporting a collision
  > between two objects minted with the same fixed id. Anonymity stands; the limit does not.
- **Lines** are `ℓ`, `ℓ1`, `ℓ2` (typed `l`, `l1`, `l2`), or named by two points, or by role
  (`המשיק`). This **inherits the 3-D trap verbatim**: `ℓ` is not a `\w` character, so a `\b` after a
  line name silently fails — use an explicit lookahead ([src3d/CLAUDE.md](../src3d/CLAUDE.md)). The
  cost of rediscovering that was a session in the 3-D tree; [ADR-W-004](06w-decisions-workspace.md#adr-w-004)
  says to carry it across rather than pay it twice.
- **Points** are a capital letter with an optional digit subscript (`F1`, `D2`), the
  [ADR-228](06-decisions.md#adr-228) convention already in the 2-D parser.

**D7 — an inequality is one of THREE things, and they are not interchangeable.** This is the decision
the plan was missing. The corpus's inequalities do three different jobs, act at three different
points in the pipeline, and fail in three different ways:

| Kind | Corpus form | Where it acts | Failure mode |
|---|---|---|---|
| **1. Parameter domain** | `a הוא פרמטר חיובי` · `t פרמטר קטן מ-9` · `0<k<6` · `a≠0` | **Declaration.** A precondition on the symbol, not a given to be satisfied. It **filters the roots** of every later pin — roots outside the domain were never candidates and are dropped silently | An empty admissible set is an honest contradiction *of the pin*, reported against the pinning statement |
| **2. Branch selector** | `שיעור ה-y של B קטן מ-6` · `שיעור ה-x של M קטן משיעור ה-x של A` · `r<R` · `a<13` | **After solving.** An ordinary given that picks among branches already computed — the 3-D sign-given mechanism ([docs/20 §2](20-space-vectors-tool.md), «שיעור ה-z חיובי») | Selecting no branch is a contradiction named against the selector, never an empty figure |
| **3. Sweep range** | `A היא נקודה כלשהי על מעגל II כך ש-−1.5 ≤ שיעור ה-y של A ≤ 1.5` | **Sampling.** Bounds a *free* DOF's interval. Never affects determinacy | None — it narrows a sweep; its consumer is the locus lane, which paints and verifies the trace only over the range |

**Why the distinction is load-bearing, not pedantry.** Conflating them produces exactly the bugs this
product would otherwise ship: treat a **domain** as a **selector** and `a>0` reports "no valid
configuration" instead of simply never proposing a negative `a`; treat a **sweep range** as a
**constraint** and a deliberately free point becomes determined, which is an
[ADR-052](06-decisions.md#adr-052) violation (a default masquerading as a given). V0's own gate exam
(קיץ א' 2022) needs kinds 1 and 2 simultaneously — `r<R` and `a<13` are what make its *two*
possibilities two rather than four.

Each kind names where it inserts, per the [LADDER](LADDER.md) convention; the product's own ladder
document (`LADDER-AG.md`, the [LADDER-CX](LADDER-CX.md) pattern) is written when the engine exists.

**D8 — the catalog carries the `catalog3.ts` contract.** `src-analytic/parser/catalogAnalytic.ts` is
simultaneously the user-facing reference, the coverage map (a guard test re-parses **every** entry in
He *and* En), and **the only vocabulary the LLM fallback may emit**. Its governing principle is that
**the student types the exam's own sentence** — every canonical entry is a phrasing that occurs in the
corpus, never an invented command language. Input normalization (`^2`≡`²`, `-`≡`−`, `sqrt`≡`√`,
`l1`≡`ℓ1`, `<A`≡`∡A`, …) lives at the **single** normalization chokepoint, never per rule, and every
symbol the palette offers must parse — the shared `shell/symbols.ts` test contract.

**Also settled by convention, not worth an option list:** the URL is `/analytic-builder/`, devUrl
`/analytic.html`, `build:analytic` → `dist-analytic/`, matching the three siblings exactly. The
operator may override before the first build; nothing else depends on it.

**Still open after this ADR:** the 471 ↔ 572 profile split (V4) · whether an answer is ever revealed
after a wrong claim (largely moot under [ADR-AG-003](#adr-ag-003) D3′, since values already show
behind the student's checkbox).

---

## ADR-AG-006 — V0 slice A BUILT: the substrate, the four-curve family, and suite conformance (2026-09-03)

**What landed** (`feat/888-analytic-v0`). The product exists and draws. Typing the exam's own
sentences — `נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9`, `נתון הישר l1: y=x`, `נתונה הנקודה A(2,6)` —
puts them on axes, in Hebrew or English, with the data panel carrying what is fixed by the data.
Families F1 (points, parameters allowed in coordinates), F3 (lines by equation), F5 (circles by
equation), F6 (canonical conics) and F11 (parameter declaration) of [docs/19 §10](19-analytic-geometry-tool.md).

**Three engineering decisions worth recording, because they shaped everything above them:**

1. **A curve is ONE thing** — an implicit `f(x, y; params) = 0` — and its kind comes from an **exact
   conic fit**: seven lattice probes read `A…F` off the residual, with no least squares and no
   symbolic algebra. This is why `(x−3)²+(y−4)²=9`, `x²+y²−6x−8y+16=0` and `x²−6x+y²−8y+16=0` are
   read as one circle without a pattern per spelling, and it puts the **canonicity gate in one
   place**: a rotated conic, a translated conic and a hyperbola are each refused *by name* rather
   than mis-drawn. Pattern-matching per spelling was the obvious alternative and would have grown a
   rule per exam.
2. **The expression layer is hand-written**, because the exam multiplies by JUXTAPOSITION (`2a`,
   `4√5`, `25k²`, `2ax`). It parses and evaluates only — the NO-CAS boundary
   ([ADR-AG-001](#adr-ag-001) D1) is structural, since there is nothing in the module that could
   simplify or solve.
3. **`isKnowledge` is the honesty boundary, and it is exercised on every panel row.** With values
   shown ([ADR-AG-003](#adr-ag-003) §2) nothing is protected by withholding, so a coordinate prints
   only when it is the same at every seed: `A(−9a, 0)` prints `—`, `B(3,4)` prints its value.

**Three predicted traps, all of which bit, all now locked:**

- **Hebrew morphology.** «נתון» ends in FINAL nun (ן) and «נתונה/נתונים/נתונות» in medial nun (נ), so
  `נתונ(ה|ים|ות)?` silently dropped the commonest form — eleven tests failed at once. The
  `מאונ[ךכ]` class from the 3-D tree ([ADR-W-004](06w-decisions-workspace.md#adr-w-004): carry the
  class across rather than pay it twice) on a different letter. Predicted in
  [docs/19 §10a](19-analytic-geometry-tool.md); still shipped, because knowing about a class is not
  the same as writing the alternation out.
- **A case-insensitive Roman-numeral class ate real input.** `[IVX]{1,3}` with the `i` flag read the
  `x` of «the circle x²+y²−2ax−2x=0» as a numeral and swallowed the equation. Numerals are matched
  case-sensitively with a following-separator lookahead.
- **Bidi reversed the axis labels.** The RTL page set each SVG label's base direction, so `-6`
  rendered as `6-` — the axis lying about its own coordinates, the worst class of bug this product
  can have. **Found by reading the screenshot, not by a test**, which is the whole argument for the
  visual smoke gate; `direction: ltr` on the surface is the fix.

**Gates.** `npm run test:analytic` 350/350 · `tsc -b` clean · `npm run build:analytic` clean ·
`check-sibling-safety --product analytic` PASS (with the documented cross-product reason: the
`switcherAnalytic` key belongs in every sibling's resources) · `visual-smoke --app analytic` 6 shots,
read back by the session.

**Cross-product effects, as [ADR-AG-004](#adr-ag-004) warned.** `products.json` feeds the admin form
and the docs/22 §9 table, so a fourth entry moved fixtures in
`server/__tests__/admin-config.test.ts` (an id used there as an example of an UNREGISTERED tool was
`'analytic'`) and required the §9 column, the CI lane and classifier, `scripts/visual-smoke.mjs` and
`scripts/check-sibling-safety.mjs`.

**Not claimed.** V0's corpus gate (קיץ א' 2022 — two internally tangent circles with all common
tangents) needs tangency, intersections and the one-parameter **pin**, which are the next slices;
D7 kinds 2 and 3 land with the pin.

---

## ADR-AG-007 — The analytic tool is NOT DEPLOYED, and that is structural (2026-09-03)

**Context.** Operator, on seeing V0 slice A run: *"we now set a rule that analytical tool doesnt get
deployed. so the deployed version doesnt have this capability and only local testing would show it.
This is until the tool has decent capability."*

**Why this needed more than "don't run the scp".** Not deploying `dist-analytic/` is easy — nothing
in [RUNBOOK](RUNBOOK.md) ever mentioned it. The real exposure is the **switcher**: every builder
renders `products.json` as data, so with the analytic entry `enabled: true` the three *deployed*
tools would each show a «גאומטריה אנליטית» chip pointing at `/analytic-builder/`, and every student
who clicked it would get a 404. The ruling therefore has to live in the registry, not in a habit.

**Decision.**

- The analytic entry carries **`enabled: false`**. Every shipped builder's roster is
  `filter(p => p.enabled)`, so **no deployed page can link to this tool** — and no sibling needed a
  single line changed to make that true.
- It also carries **`devOnly: true`**, and the analytic app — *and only the analytic app* — widens
  its own filter to `enabled || (import.meta.env.DEV && devOnly)`. The suite bar stays whole while
  developing: locally the analytic app shows all four builders, the 2-D app shows three. Verified by
  screenshot in both directions rather than asserted.
- **The visual smoke still covers it.** The `products.json`-derived lock was split into two halves —
  every *shipped* product must have a smoke sequence, and every smoked app must be a registry entry
  — precisely because a not-yet-deployed tool is the one that most needs smoking: it is the only
  evidence anyone has that it renders at all.

**Undeploying is one line.** Flip `enabled` to `true`, drop `devOnly`, and add the
`dist-analytic/` → `/analytic-builder/` row to the RUNBOOK. Nothing else knows about the
distinction.

**A class worth naming, because it bit three times in one session.** `'analytic'` was being used
across the suite as an example of a name that is *not* a product: an unregistered switcher id in
`server/__tests__/admin-config.test.ts`, an unknown `--product` viewpoint in
`server/__tests__/sibling-safety.test.ts`, and an absent app in the hard-coded
`['2d','3d','complex']` of `scripts/__tests__/visual-smoke.test.ts`. **A negative example must be a
name no roster can ever claim** (`'no-such-product'`, `'statistics'`), never one it merely has not
claimed yet — otherwise shipping product N+1 turns three passing guards red for reasons that have
nothing to do with the change. Two were fixed by renaming the example; the third was fixed at the
root, by making the guard read the registry instead of a literal.

---

## ADR-AG-008 — The canonicity refusal is WIRED, not just computed (#896)

**Context.** [ADR-AG-006](#adr-ag-006) claimed the canonicity gate "puts the refusal in one place: a
rotated conic, a translated conic and a hyperbola are each refused *by name* rather than mis-drawn",
and [`src-analytic/CLAUDE.md`](../src-analytic/CLAUDE.md) states it as a hard boundary. Measured
through the real `parse → fold → evaluate` path while writing PR #894's play sheet, it was not true:

| input | parse | fault | drawn |
| --- | --- | --- | --- |
| `(y-2)^2=8(x-1)` translated | **ok** | **none** | none |
| `x^2+xy+y^2=1` rotated | **ok** | **none** | none |
| `x^2/9-y^2/16=1` hyperbola | fails `not-handled` | reported | none |
| `y^2=54x` canonical | ok | none | drawn |

Only the hyperbola was refused, and only because it never parses. The other two parsed, committed to
the line list, drew nothing and **said nothing**. A stated given vanished — the one thing the root
CLAUDE.md says this product may never do.

**Root cause — the reason was computed and thrown away one line later.** `classify` returned
`'translated-conic'` and `'rotated'` correctly; the type even documents the distinction it draws
(`'vacant'` — *"Not an error"* — versus the scope reasons — *"the student is told which"*). Then:

```ts
export function resolveCurve(c: Curve, env: Env): NumCurve | null {
  const res = curveFromEquation(c.eq, env, c.kind);
  return res.ok ? res.curve : null;          // ← the reason dies here
}
```

Downstream every layer was therefore blind by construction: `evaluate` could only record an id
(`vacant.push(d.id)`), `derive` produced no fault because nothing told it there was one, and `App`
— which surfaces only `faults` — committed the line as if it had landed. `figure.vacant` was read
by **no UI code at all**. Every piece existed and none was connected: even `errOutOfScope`
(«המשפט מובן, אך אינו נתמך בכלי הזה») was already written in both locales and already wired into
App's error map.

**Decision.** Carry the reason the whole way, and keep the two failure kinds distinct at every step.

- `resolveCurve` returns the classifier's `ClassifyResult` **reason intact**, instead of collapsing
  it to `NumCurve | null`.
- `Figure.vacant` becomes `Vacancy[]` — `{ id, reason }` rather than a bare id. Carrying only the id
  is what made the refusal unreportable.
- `derive` turns a **scope** reason into a `LineFault` with code `out-of-scope`, blamed on the line
  that introduced the object (first writer wins, the rule `owner` already encodes for apply errors),
  so App refuses the line instead of committing it.
- A `'vacant'` reason is deliberately **not** a fault. An empty circle at this parameter value is
  the documented "not at this value" that the domain filter needs to observe; reporting it as a
  refusal would be the opposite defect, and it has its own test.

**Why a THIRD failure stage is the right shape.** A line could already fail at parse (`not-handled`,
`bad-equation`) or at apply (`conflicting-restatement`, `conic-slot-taken`). Canonicity cannot be
decided at either: the equation is only classifiable once parameters have values, which is
evaluation. So the fix is not "check earlier" — it is to let the stage that *can* decide report what
it decided.

**Locked** in `src-analytic/__tests__/engine.test.ts` (#896 block, 6 tests): one per row of the
table, the canonical control that must keep drawing with no fault, a refusal blamed on the line that
wrote it while its honest siblings still land, and the genuinely-vacant circle that must NOT raise.

**A note on the record.** ADR-AG-006's gate list said this behaviour worked. It was written from the
classifier's code rather than from a run — the same class as its sibling defect that session, where
a recorded `check-sibling-safety` PASS ([ADR-W-039](06w-decisions-workspace.md#adr-w-039)) had been
produced by an env var CI could never set. Both were found by running the thing instead of reading
it; the tests above are what make the claim self-checking from here.

---

## ADR-AG-009 — The model is OBJECT-FIRST; an equation is one way to STATE an object (2026-09-15)

**Requirements:** [02c](02c-requirements-analytic.md) R1, R2, R5 — ratified by this ADR; §5a–5d are its
evidence. **Design:** [04c](04c-design-analytic.md) "The three cores" and "Shape" — rewritten when the
slice lands, not in advance of it.

**Context.** The operator ruled on 2026-09-04 that *"the base is geometry with coordinates, because that
is how the bagrut is built"* — the primitive is the **geometric object** (point, segment, polygon,
circle, conic), and an equation, a shape noun, or a coordinate pair are three ways a student can *state*
one. It was captured as [02c](02c-requirements-analytic.md) R1, which flagged its own urgency: *"this is
the cheapest moment the decision is available — one slice built, nothing deployed, no student input.
Re-founding later costs every slice built on the old shape as well."*

Eleven days passed and nothing was built on either shape, so the moment is intact. The operator
re-affirmed the ruling on 2026-09-15 and directed that the **re-founding is the next slice**, ahead of
the relations (tangency, intersections, the pin) that [docs/19 §7](19-analytic-geometry-tool.md) had
sequenced first.

**Measured, not assumed.** The three corpus questions in [02c §5](02c-requirements-analytic.md) were run
through the real `parse → fold → evaluate` path before this was written:

| case | points | curves | outcome |
| --- | --- | --- | --- |
| §5a parallelogram + tangent circle | 2 | 0 | 3 of 5 lines refused |
| §5c triangle by side equations | 0 | 0 | **every line refused** |
| §5d right triangle, hypotenuse by equation | 1 | 0 | 3 of 4 lines refused |
| control — point + circle + parabola, all by equation | 1 | 2 | clean |

They do not half-work. §5a's own conclusion — *"an equation-first model cannot express this question at
all"* — is confirmed from the code rather than from the reading.

**Decision.**

1. **The object is the primitive.** A construction is a dependency graph of geometric objects, each
   classified by degrees of freedom, exactly as the three siblings model it. A **curve carrying an
   implicit equation is one object kind among several**, not the model.
2. **An equation is a STATEMENT FORM, and so is a shape noun, and so is a coordinate pair.** «מקבילית
   ABCD», `A(3,5)` and `y = x−1` are three ways to say something about the same graph. This is R6 already
   ruled: the shape noun is optional for an equation and load-bearing for a shape.
3. **The exact conic fit is kept and demoted.** [ADR-AG-006](#adr-ag-006) D1's *"a curve is ONE thing"*
   is **superseded as a statement about the model** and **retained as a statement about curve objects**:
   the seven-probe fit stops being how the product is built and becomes *how an equation identifies which
   object it names*. Nothing in `conic.ts` is discarded. The canonicity gate and its refusal wiring
   ([ADR-AG-008](#adr-ag-008)) are untouched.
4. **The gauge stays pinned, and coordinates stay knowledge.** R2's *"the gauge starts free and
   coordinates consume it"* is the genuine new behaviour: «משולש שווה שוקיים ABC» with no coordinates
   draws generically, and `A(0,0)` then `B(4,0)` progressively anchor it. `isKnowledge` generalises to
   cover it with **no new mechanism** (R3) — an unanchored vertex varies by seed and prints `—`; anchor it
   and it prints.

**The tier question is settled by measurement, and it is cheaper than 02c assumed.**
[02c](02c-requirements-analytic.md) R5 tiers the solve cost and calls tier 3 *"a general constraint
solver — i.e. the synthetic engine again"*, which reads as a reason to stop at tier 2. Two facts decide
it instead:

- **Tier 2 does not reach the corpus.** §5a interacts a partly-anchored parallelogram, an area value and
  two tangencies; §5c derives every vertex from two side lines plus a segment ratio. Both exceed "some
  coordinates plus one shape constraint". Stopping at tier 2 would re-found the model and still not
  express the questions the re-founding is *for*.
- **Tier 3 is not an invention — it exists twice and its core is small.** `src/engine/evaluate.ts`
  minimises `Σ jointCostTerm` over every constraint across every carrier; `src/engine/carriers.ts` is the
  exhaustive DOF classification (free vertex 2, parametric point 1, on-line offset 1, shape scalar 1);
  `src/engine/solve.ts` supplies the per-constraint residuals and the 1-DOF root-find whose roots are the
  branch index. The 14,102 lines in `src/engine` are overwhelmingly **grammar** — `apply.ts` alone is
  2,484 — and grammar breadth is paid per corpus question whichever tier is chosen.

So: **tier 3, by transplanting the carrier/DOF + joint-solve core; NOT by transplanting the 2-D
grammar.** The core is small, twice proven (2-D and 3-D), and copied rather than imported — R4 and
[BOUNDARIES.json](../BOUNDARIES.json) are unchanged, and the cost of a third copy is the acknowledged
price of the product boundary, not a new argument.

**What this does NOT license.** The NO-CAS boundary ([ADR-AG-001](#adr-ag-001) D1) is untouched: a
numeric residual minimiser is not symbolic algebra, and the escalation route is unchanged. Nothing here
authorises simplifying, solving or manipulating an expression symbolically.

**Staging.** The re-founding is a slice, not a rewrite; the four families that build today
([ADR-AG-006](#adr-ag-006)) must still build when it lands, which is the acceptance condition that keeps
it honest.

| stage | content | gate |
| --- | --- | --- |
| **B1 — the graph** | Objects, carrier/DOF classification, topological evaluate, the free-DOF sampler and the seed. Equation-curves become one object kind. | Every V0 slice-A catalog entry still builds, and the DOF cue is visible |
| **B2 — the joint solve** | Per-constraint residuals, the joint minimisation, roots as branches, `no-roots` as an honest contradiction | A partly-anchored shape draws generically and anchors as coordinates arrive (R2/R3) |
| **B3 — the shape vocabulary** | Shape nouns carrying their own constraints, sides addressable as lines, vertices derived from intersections, the axes as objects | **§5a and §5c build**, both possibilities cycled, nothing silently defaulted |

The relations lane ([docs/19 §7](19-analytic-geometry-tool.md) V0's tangency/intersection/pin) is
**not cancelled and not re-sequenced away** — it lands on B1's object layer, where a tangency is a
relation between two objects rather than a special case of two equations. Its corpus gate (קיץ א' 2022)
stands.

**Risks, named.**

- **The re-founding must not become a second 2-D tool.** The transplant is the carrier/DOF core and the
  joint solve. Every construct beyond that is justified by a corpus question or it does not come across.
- **`isKnowledge` is doing more work after this, not less.** R16 is still open and now matters more: a
  value must be invariant across the **discrete** branch choices too, and today the gate re-evaluates
  across seeds only.
- **[#1014](https://github.com/dcodish/geo_builder/issues/1014) sits inside B1.** The free-DOF register
  being fed by declarations rather than by the expressions is precisely the register B1 rebuilds, so the
  fix belongs to that slice rather than ahead of it.
- **`src-analytic/CLAUDE.md` and [04c](04c-design-analytic.md) describe the equation-first tree and stay
  accurate until B1 lands.** They are orientation files for code that exists; they change with the slice,
  in its commit, never in advance of it.

---

## ADR-AG-010 — The teacher lane: authoring and live demonstration are in scope (2026-09-15)

**Requirements:** [02c](02c-requirements-analytic.md) §7 (new — the teacher lane); workspace
[01 G6](01-vision.md), [02 US-11](02-requirements.md). **Design:** none (internal) — the mechanisms are
`shell/`'s existing export and canvas controls; no new design section until a slice needs one.

**Context.** [02c](02c-requirements-analytic.md) was captured live from the 2026-09-04 session and is
entirely student-facing: it contains **no teacher content at all**. The workspace vision has named
teachers and authors as a secondary audience since [01 §Audience](01-vision.md) — *"preparing problems,
demonstrating them live, and authoring materials"* — and the siblings serve them through the shared PNG
and `.docx` export ([FR-HS-5](02-requirements.md), [FR-HS-11](02-requirements.md)). The analytic product
inherited that chrome and never asked what, if anything, it owed the audience specifically.

**Why the question is sharper here than in the siblings.** The product's defining fact cuts both ways.
17 of 20 sampled Q1s print no figure, so the student has nothing to reproduce — and the **teacher
preparing that lesson has nothing to project or photocopy either**, and must build coordinate diagrams by
hand in a general tool. That is the tedium [01](01-vision.md) named as the authoring case, at its worst,
and it is why this is worth a ruling rather than an assumption.

**Decision** (operator, 2026-09-15, choosing from four candidates):

- **IN — worksheet authoring and export.** The figure plus its givens as a clean image and a `.docx`
  page fit for a worksheet or an exam. The mechanism is already built and shipped in the 2-D tool
  ([ADR-251](06-decisions.md#adr-251), FR-HS-11) and the chrome is inherited from `shell/`, so this is
  a conformance-and-fit question, not a new capability.
- **IN — live classroom demonstration.** «הציגו תצורה אחרת» is designed as a **teaching device** — the
  way a teacher shows a class *why* a question has two answers — and R22's determinacy signal as a live
  demonstration of *"were your givens enough?"*. Both are existing behaviours; what this ruling adds is
  that they are designed and played **for projection**, not only for a student at a laptop.
- **OUT, for now — a corpus question library.** The twenty 572 Q1s as loadable saved figures was offered
  (it is nearly free once the tool can express them, since the validation fixtures and a teacher's
  question bank would be the same files, and [FR-HS-10](02-requirements.md) already calls it "future").
  The operator did not take it. It is **not rejected on the merits** — it is not in scope now, and
  nothing in this ADR forecloses it.

**What follows.**

- The teacher lane is **requirements, not a slice of its own**: it is recorded in
  [02c §7](02c-requirements-analytic.md), and the acceptance gates of the slices that make the tool
  expressive enough to author with are where it is actually paid for. A teacher cannot author an analytic
  worksheet until the tool can build the figure, so [ADR-AG-009](#adr-ag-009)'s B3 gates this too.
- **Projection is a play condition, not a feature.** Where a case in a play sheet exercises the
  demonstration lane, it says so — legibility at a distance, and the configuration cycle visible as a
  *change*, which is what [#1009](https://github.com/dcodish/geo_builder/issues/1009) is already building
  for the 2-D tool.

**Deliberately not decided.** Whether the teacher audience ever justifies a distinct mode, role or
surface. Nothing in the three shipped products has one ([02 §Actors](02-requirements.md): *"no
authentication or distinct roles in v1; all are the same anonymous user"*), and this ruling does not
create one.

---

## ADR-AG-011 — B1 BUILT: the object graph, and the register that makes a parameter free (#1015)

**Requirements:** [02c](02c-requirements-analytic.md) R1 (the model), P4 (the DOF cue), R3 (the honesty
gate generalises — and the half of it that was missing). **Design:** [04c](04c-design-analytic.md)
"The model — objects, and the register that makes them free" (new section; "Shape" and "Known gaps"
updated).

**What landed** (`feat/1015-object-graph`). `Construction` is `{ params, objects }`; `GeoObject` is a
discriminated union whose two stated members are `point` and `curve`. `engine/carriers.ts` is new and
holds the degree-of-freedom contract. **No statement form was added** — the vocabulary is still V0's,
and that is the point: the re-founding is proved by every existing catalog entry still building on the
new model, not by new capability. [ADR-AG-009](#adr-ag-009)'s B1 gate, met.

**Three decisions worth recording.**

1. **The register of free parameters is derived from the OBJECTS' expressions, not from the
   declarations.** This inverts where freedom comes from. Previously `sampleEnv` read the F11
   declarations alone, so a symbol occurring only inside an equation was never registered, evaluated
   to `NaN`, and the curve reached the honest "not at this parameter value" path *by accident*: it
   drew nothing and said nothing (#1014). `נתונה פרבולה שמשוואתה y^2=2ax` is a **catalog entry**, so
   the tool's own reference card carried a line that produced an empty canvas. A declaration now
   **narrows** a symbol's domain; it does not grant existence. A symbol is free because it is *used
   and unpinned*, which is [ADR-052](06-decisions.md#adr-052) stated at the register rather than at
   the sampler.

2. **A new object kind cannot be added without declaring its freedom.** `carrierOf`, `symbolDeps` and
   `objectDeps` are exhaustive switches over `GeoObject`, so the compiler — not a reviewer — stops a
   kind arriving without a DOF decision. Copied from `src/engine/carriers.ts` (ADR-043), never
   imported, and deliberately taken across *before* the vocabulary grows, which is the only moment it
   is cheap. Both stated kinds answer `null`: their freedom is their parameters', and counting it
   twice would report two DOFs for the one unknown in `A(−9a, 0)`.

3. **No topological sort was built, and that is a decision rather than an omission.** Every object in
   this slice is stated, so the object→object relation is empty — and a sort over an empty relation is
   structure no test can exercise, which is the failure mode of *passing by checking nothing*. What is
   real today is the object→**parameter** layer: the environment is complete before evaluation begins,
   and every figure exercises it. `symbolDeps` is that relation and the seam the ordering grows from
   when B3 lands the first derived kind. B1's issue listed "topological evaluate" in scope; it is
   recorded here as consciously deferred rather than quietly dropped.

**A second honesty hole, found by reading the screenshot (#1020 — P1).** With #1014 fixed, `y²=2ax`
draws. The data panel then printed it as **`parabola: y² = 6.915870381x, F(1.728967595, 0)`** — one
seed's sample asserted as fact, on the row [ADR-AG-003](#adr-ag-003) §2 calls the whole honesty
boundary.

The gate was not missing; **one of its two callers never used it.** `App.tsx` routed the *point* rows
through `isKnowledge` and read the *curve* rows straight off seed 0. Survivable only while every
drawable curve was fully pinned — which #1014 had just stopped being true. `knownCurve` now gates a
curve coefficient by coefficient **through `isKnowledge` itself**, so there is no second definition of
"invariant", and a curve that is a *different family* at another seed is refused too
([02c](02c-requirements-analytic.md) R13's third row). An unpinned curve is **drawn and its row is
open** — `parabola: —` — exactly as an unpinned coordinate shows.

**Worth naming, because it is the second time in this tree.** ADR-AG-006's reversed axis labels were
found the same way: *by reading the screenshot, not by a test*. Here the suite was green across all
105 tests while the panel was lying about a number. The visual smoke's own closing line — *"this gate
proves they are real, not that they are right"* — is the whole argument, and the analytic smoke
sequence now carries a line with an **undeclared parameter** precisely so the DOF cue and the open row
are in a captured frame rather than only in a test.

**Found and NOT fixed here, filed instead ([#1019](https://github.com/dcodish/geo_builder/issues/1019)).**
An unbounded parameter is never sampled negative — measured over seeds 0–39, min 1.115, max 3.965 — so
the tool asserts `a > 0` for a parameter nobody bounded, and `y² = 2ax` opens rightward in every
configuration. Pre-existing (it has always applied to a declared-but-unbounded parameter), but B1 makes
it the **common** case. It is not fixed inside B1 because the fix changes what every existing figure
looks like at seed 0 — a play-visible change deserving its own decision and its own play case, not a
silent rider on a refactor.

**Gates.** `npm run test:full` green, read from `reports/suite-verdict.json` ·
`npx tsc -b` clean · `npm run build:analytic` clean · `visual-smoke --app analytic` 7 shots, read back
by the session (which is how #1020 was found) · `src-analytic` 110 tests, up from 64.

**The catalog guard grew its missing half.** It asserted that every entry *parses*, in both languages
— which is exactly how an entry that parses perfectly and draws nothing shipped on the reference card.
It now also asserts that every entry **produces geometry**, with the `parameters` category exempt by
its own field (a declaration legitimately draws nothing) rather than by a list of sentences that would
drift.

---

## ADR-AG-012 — The analytic tool is a FOURTH ENGINE, and the 2-D tree is not touched for it (2026-09-15)

**Requirements:** [02c](02c-requirements-analytic.md) R4 (reaffirmed, and its cost re-priced); the
"471 ↔ 572 profile split" in [§5 Deliberately still open](19-analytic-geometry-tool.md) is **not**
settled by this. **Design:** none (internal) — this confirms the existing boundary rather than
changing one; [04c](04c-design-analytic.md) "Boundaries" already states it.

**Context.** The operator brought a new corpus — roughly forty «lines and points» exercises they are
teaching now (midpoints, medians, centroids, incircles, areas, sides by equation). Measured against
it, the analytic tool parsed **4 of 29** candidate inputs. The same exercises were then run through
the **2-D** tool, which built them and got them right: centroid `M(-2,4)`, midpoint `M(3,-2)`,
parallelogram diagonal `G(1.5,1.5)`, incentre `O(0,2)`, and a vertex pinned by `שטח המשולש ABC הוא 7`.

That raised a genuine architectural question, and it was put to the operator rather than decided:
**is the analytic tool a fourth engine, or a profile of the 2-D one?** [docs/22 §9](22-workflow.md)
already contemplates *"ONE engine with curriculum-level profiles"*, and the overlap measured about
80% for this corpus.

**A premise of the original plan fell during that measurement, and it is recorded because it will
mislead the next reader otherwise.** [docs/19 §6](19-analytic-geometry-tool.md) calls the coordinate
substrate *"New core #1 … the deepest departure from the 2-D tool"*, and
[`src-analytic/CLAUDE.md`](../src-analytic/CLAUDE.md) warns of *"the gauge inversion"*. Measured, the
2-D tool **already consumes the gauge**: with `נקודה A ב-(1,3)` stated, `A` sits at exactly `(1,3)` at
seeds 0, 1, 2 and 5, and so does the derived centroid; without coordinates the same triangle floats
(`A(2.00,3.60)` → `A(1.72,4.56)`). That is [02c](02c-requirements-analytic.md) R2 — *"the gauge starts
free and coordinates consume it"* — already shipped in the sibling. It is not an inversion and not a
departure.

**Decision** (operator, 2026-09-15): *"I dont want to touch the 2d tool or add analytical capabilities
to it. i want the analytical tool to support it … the 2d should not be impacted in any way since its
in a good shape."*

- **`src-analytic/` gains the capability. `src/` is not modified for analytic purposes** — not a
  coordinate frame, not an equation grammar, not a profile flag. The proposal to give the 2-D tool
  axes (shown only where the gauge is consumed) is **rejected**, and is recorded here so it is not
  re-proposed as though it were new.
- The four products stay four products. Capability crosses trees by **copying**, never importing —
  `BOUNDARIES.json` and `server/__tests__/isolation.test.ts` are unchanged and remain the enforcement.

**Why the operator's reason is the right one.** *"It's in a good shape"* is not conservatism. `src/`
is the deployed product with the deepest regression history in the workspace, and the constructs at
issue — midpoint, tangency feet, concurrency points — are precisely where that history is thickest
([ADR-116](06-decisions.md#adr-116), [ADR-297](06-decisions.md#adr-297),
[ADR-333](06-decisions.md#adr-333) are all letter-hijacking and branch-selection bugs in this exact
family). Threading a second product's gauge model through it would put a shipped tool's correctness at
risk for **zero student benefit**: no student of Q1-analytic opens the synthetic builder.

**What this costs, stated plainly rather than discovered later.** [ADR-AG-009](#adr-ag-009) ruled
*"transplant the carrier/DOF + joint-solve core, NOT the 2-D grammar; every construct beyond the core
is justified by a corpus question or it does not come across."* That ruling stands, and this corpus is
now a large justification: shape nouns (~20 exercises), point-on-object and region (~14), midpoint
(~11), area as a pin (~10), concurrency points (~6). So a substantial slice of the 2-D **grammar** is
now corpus-justified, and it will be written a second time.

Two things keep that from becoming "port the whole tool":

- **The corpus is the gate, not the sibling's catalog.** A construct comes across because an exercise
  needs it, and `src/`'s catalog is a *reference* for how it was solved, never a checklist to mirror.
- **Most of `src/engine`'s 14k lines are not this.** Theorem surfacing, ink crossings, letter
  placement, shape detection and the verifier are synthetic-tool concerns with no analytic counterpart.

**What is NOT decided here.** The 471 ↔ 572 profile split *within* the analytic product
([docs/19 §5](19-analytic-geometry-tool.md)) is untouched — this ruling is about which tree owns the
capability, not about how one tree serves two curricula. And nothing here says the copied constructs
must match `src/`'s spelling; the analytic catalog answers to its own corpus.

---

## ADR-AG-013 — B4 BUILT: derived points over stated parents, and the sort that was not needed (#1028)

**Requirements:** [02c §8](02c-requirements-analytic.md) (new — the «lines and points» corpus and its
families F16/F17); P4 (the DOF cue, unchanged by derived points). **Design:**
[04c](04c-design-analytic.md) "The model" — the object kinds and the evaluation-order invariant.

**What landed.** Five new object kinds — `derived`, `segment`, `polygon` beside `point` and `curve` —
and with them the constructs the operator's «lines and points» corpus is mostly made of: the midpoint,
the centroid, the incentre, the orthocentre, the circumcentre, and a quadrilateral's diagonal meet.
All solver-free, so they land before B2 (#1016) even though they outrank most of what B2 and B3 carry.

**The values are checked against an INDEPENDENT oracle.** Each gate figure was first built in the 2-D
tool through its real `parse → replay` path and checked by hand against the closed form, *before* this
engine existed: midpoint `(3,−2)`, centroid `(−2,4)`, diagonal meet `(1.5,1.5)`, incentre `(0,2)`. A
test whose expectation came from the code under test proves only self-consistency. The suite also
asserts the *properties* rather than the numbers — the incentre equidistant from all three sides, the
circumcentre from all three vertices, a right triangle's orthocentre at its right-angle vertex.

**Three decisions worth recording.**

1. **The topological sort was not needed, and that is a finding rather than a deferral.**
   [ADR-AG-011](#adr-ag-011) deferred one because the object→object relation was empty. Derived points
   made it non-empty — and a sort is still the wrong shape. `apply` refuses a statement naming an
   object that does not exist yet (`unknown-reference`), so **a parent is always already in the list
   when its dependent is appended**: declaration order is provably a valid evaluation order and a
   cycle is unreachable. The invariant is *asserted* (`depsPrecedeDependents`) instead of being
   re-established by a sort that could never find anything out of place. The refusal is not a
   limitation bolted on to make this true — it is required on its own terms: inventing the missing
   `B` would place a point the question never gave ([ADR-052](06-decisions.md#adr-052)) and spend a
   letter the student is about to use ([ADR-297](06-decisions.md#adr-297)).

2. **A shape noun that carries a GIVEN is refused by name, not flattened.** `משולש` and `מרובע` assert
   nothing beyond their vertices, so they build. `מקבילית`, `טרפז`, `ריבוע` each carry a given
   (AB ∥ DC, four equal sides) this slice cannot honour, and drawing one as a plain ring of sides
   would be **a stated given vanishing** — the one thing the root CLAUDE.md forbids outright. They
   refuse with `out-of-scope`, which is a refusal the product owns rather than a question outsourced
   to the LLM ([ADR-3D-214](06b-decisions-3d.md#adr-3d-214) D2). B3 (#1017) is where they become
   buildable.

3. **Identity is canonical, because M1's absorb is keyed on the id.** A segment's id sorts its
   endpoints and a polygon's takes the smallest rotation/reflection of its vertex ring, so
   «הקטע AB» ≡ «הקטע BA» and «משולש ABC» ≡ «משולש ACB» are each one object — while `ABCD` and `ABDC`
   stay two, because they are two different figures. Found by a test: before canonicalisation the
   same segment drew twice and the same triangle reported a `conflicting-restatement`.

**A degenerate configuration is VACANT, never a fault and never a NaN.** Three collinear points have
no circumcentre; the point is reported absent at this configuration and nothing is raised, which is
[ADR-AG-008](#adr-ag-008)'s distinction applied to a new kind. Degeneracy is judged **relative to the
longest side**, so a large thin triangle is still a triangle.

**Two defects found by READING the slice's own smoke screenshot, which is now three for three in this
tree.** (ADR-AG-006's reversed axis labels, [#1020](https://github.com/dcodish/geo_builder/issues/1020)'s
sampled equation, and now [#1029](https://github.com/dcodish/geo_builder/issues/1029): the panel
printed `M = (-1.666666667, 5)`. `src-analytic/App.tsx` kept a **private `toPrecision(10)` rounder**
instead of delegating to `shell/format.ts`, breaking the operator's standing two-decimal ruling
(#723) — and it was invisible until derived points produced the tool's first computed, non-terminating
coordinate. Every coordinate before today was one the student had typed. Fixed by deleting the private
rounder, not by changing its precision: #723 is a chokepoint ruling, not a number.

**Gates.** `npm run test:full` green, read from `reports/suite-verdict.json` · `tsc -b` clean ·
`build:analytic` clean · `visual-smoke --app analytic` extended with a triangle and its centroid, 11
shots, read back by the session (which is how #1029 was found) · `src-analytic` 154 tests, up from 110.

**The catalog guard grew a third requirement.** [ADR-AG-011](#adr-ag-011) made every entry prove it
*draws*; an entry like «M אמצע AB» is meaningless without A and B, so entries now declare their
context (`needs`) and the guard builds them in it. Declared rather than inferred — a guard that
guessed the context would be asserting something the catalog never said.

---

## ADR-AG-014 — A derived point SHOWS ITS CONSTRUCTION: the method, not only the answer (#1030)

**Requirements:** [02c §8](02c-requirements-analytic.md) R40 (new); R21 (this is its own justification,
supplied on the figure); [ADR-AG-010](#adr-ag-010) R34 (projection legibility, which drove a revision).
**Design:** [04c](04c-design-analytic.md) "The model" — the construction is carried on the `Figure`
and rendered behind a toggle.

**Context.** Operator, 2026-09-15, looking at a triangle whose centroid the tool had just found:

> the tool can find easily the location of that point **but what does the student learn from this**.
> What I would like to have is the [medians] drawn maybe in a dotted line, and the **ratio of 2:1**
> somehow shown — so something that will give a student an understanding of **what kind of builds he
> needs to do** to get this solution.

[ADR-AG-013](#adr-ag-013) had just made the tool able to *find* a centroid. It drew the triangle,
dropped a dot, and printed the coordinates — and **every step a student is graded on was invisible**.

**This is R21's own argument, drawn.** [02c R21](02c-requirements-analytic.md) ruled that showing a
derived result is correct *because* "for a student the answer is meaningless without the way … a
student who reads the equation off the canvas cannot write the working that earns the marks." That
ruling assumed the way came from elsewhere. It now comes from the figure. Nothing here solves
anything: the construction is what the student must build, and the algebra remains theirs.

**Decision.** Every derived rule knows the construction that defines it — it *is* the closed form's
own geometry — and can draw it.

| rule | drawn | label |
| --- | --- | --- |
| centroid | three medians, vertex → opposite midpoint | the two PARTS labelled **2x / x**, **2y / y**, **2z / z** |
| orthocentre | three altitudes to their feet | — |
| incentre | three bisectors, each to its foot on the opposite side | — |
| circumcentre | each side's midpoint → the centre | — |
| diagonal meet | the two diagonals | — |
| midpoint | the segment it bisects | — |

**Operator rulings that shaped it** (2026-09-15, answering the three questions the issue posed):

- **A toggle, not always drawn.** «הצג בנייה», OFF by default. Three medians per derived point buries
  a real figure, and a real question carries several. **One GLOBAL toggle**, matching how R20 settled
  the equations toggle — the two controls behave alike rather than each inventing a scope. The button
  appears only when there *is* a construction, so the control never promises what the figure cannot
  give.
- **A label, not tick marks** — and, on a second ruling the same day, the label names the two
  **PARTS** rather than stamping the ratio on the whole: `2x` and `x` on the first median, `2y`/`y`
  and `2z`/`z` on the others. The operator's own phrasing, and it is the board convention. The
  difference is not cosmetic: `2:1` *tells* a student the ratio, while `2x` and `x` **hand them the
  variables to write the equation with**, and distinct letters let all three medians enter one
  calculation. The first build stamped `2:1`; this replaced it before the slice shipped.

  *Watch on play:* `x` and `y` also name the **axes** in this product, which they do not on a
  synthetic geometry board. The letters are the operator's choice; if a student reads `2x` as an
  x-coordinate, `MEDIAN_SYMBOLS` is the one line to change.
- **The feet are shown**, as hollow dots. Shown — **not yet clickable**: promoting a foot to a named
  point is #1025's mechanism, and building a one-off click here would be a second promotion
  mechanism. The same dots gain the click when that lands.

**Decoration, never objects.** The construction carries no id, spends no letter and never enters the
fact list. A construction line minted as a `GeoObject` would occupy a name the student is about to
use — [ADR-297](06-decisions.md#adr-297)'s defect exactly — and the suite asserts the object list is
unchanged by turning the construction on.

**The tests are about GEOMETRY, not pixels**, because a construction drawn from wrong geometry teaches
something false, which is worse than teaching nothing. The suite asserts that each median really ends
at the opposite side's midpoint, that every median really passes through the centroid, that **the part labelled
`2x` really is twice the part labelled `x`** and that each label sits on its own part (a label on the
wrong side would teach the ratio backwards), that an altitude really meets its side at a right angle, and that a bisector really divides the opposite side as `AB:AC`.

**Revised after reading the screenshot — the third time in this tree, and the second in two slices.**
The first render used 12px `#94a3b8` text, which was readable on a laptop and muddy against its own
dashed median. [ADR-AG-010](#adr-ag-010) R34 makes legibility at **projection size** a design
condition for exactly this surface, so the ratio — the teaching content, not the context — is now
larger, darker, and painted stroke-then-fill so it carries its own white halo over any ink.

**Gates.** `npm run test:full` green, read from `reports/suite-verdict.json` · `tsc -b` clean ·
`build:analytic` clean · 14 new geometry tests (`construction.test.ts`) · driven in a real browser:
the toggle appears, produces 3 dashed lines, 3 feet and three `2:1` labels, and removes the group
entirely when switched off. **Not in the shared visual smoke** — that harness types lines and captures,
it does not click controls; this feature's evidence is the dedicated browser run and its screenshots,
and that limit is stated rather than papered over.

---

## ADR-AG-015 — B2/B3 BUILT: free vertices, the joint solve, and entry order stops mattering (#1016 #1017 #1033 #1034 #1047)

**Requirements:** [02c](02c-requirements-analytic.md) R19 (entry-order independence), R5 (tier 3,
ratified by [ADR-AG-009](#adr-ag-009)), P4/R22 (the DOF cue as the determinacy signal), §8 F16/F17.
**Design:** [04c](04c-design-analytic.md) "The model" — the constraint layer and the solve.

**What landed.** The operator's own worked example, in the operator's own order:

```
משולש ABC · AD תיכון לצלע BC · שטח המשולש ABC הוא 20 · A(6,4) · D(0,3) · B על החלק החיובי של ציר x
```

builds and yields **B(2,0), C(−2,6)** — image 7 #6's published answer, which is the independent
oracle the tests check against rather than this engine's own output.

**Five decisions worth recording.**

1. **A shape noun DECLARES; a reference still may not invent.** [ADR-AG-013](#adr-ag-013) made
   «משולש ABC» refuse when a vertex was missing, and that reasoning was right for «M אמצע AB» —
   inventing a point places a position the question never gave ([ADR-052](06-decisions.md#adr-052))
   and spends a letter the student is about to use ([ADR-297](06-decisions.md#adr-297)). It was wrong
   for a **declaration**: «משולש ABC» is the student *introducing* A, B and C, and the honest answer
   is a vertex with two free degrees of freedom. The refusal stays for references and goes for
   declarations, and `apply` is the one place that tells them apart. A sentence that NAMES a new
   point emits an explicit `declare` fact, so the distinction is stated rather than inferred.

2. **Entry order stops mattering, and it is an exact substitution rather than a solve.** «A(6,4)»
   after «משולש ABC» is M1 lowering: the coordinates **consume** the vertex's two DOF, replacing the
   free object in place. Both orders end at the identical figure — [02c R19](02c-requirements-analytic.md),
   the sibling's M2 — which matters because every exam paragraph names the shape first and places it
   later.

3. **Levenberg–Marquardt, not Gauss–Newton.** An area constraint is quadratic in the vertices, so a
   Gauss–Newton step from a far-off seed overshoots and diverges on the corpus's own figures. The
   damping is the smallest addition that makes the method survive a bad start; measured, the gate
   converges to the same answer from three very different ones.

4. **A residual is a VECTOR, one entry per equation — never a norm.** The first build returned the
   *distance* for a midpoint condition. It converged, and the DOF cue then read **1** on a figure that
   was fully determined: a norm's Jacobian has rank 1 at the solution, so the figure reported freedom
   it did not have. Per component, the cue counts 6 → 6 → 5 → 3 → 1 → **0**, reaching zero exactly as
   the last given lands. That is [R22](02c-requirements-analytic.md) — *"the moment the equation
   appears is the moment the student learns their givens were sufficient"* — and a cue that never
   reaches zero teaches its opposite. **Caught by reading the number, not by a failing test.**

5. **The DOF cue reports `carriers − rank(J)`, so a dependent given removes no extra freedom.**
   Stating the same area twice must not make a figure look over-determined. Counting constraints
   would; the Jacobian's rank does not.

**Honesty.** A constraint the solve cannot meet is a **fault blamed on the line that stated it** — the
figure is never drawn as though it satisfied a given it does not. And a **selector** is D7 kind 2, not
a constraint: «החלק החיובי» consumes no freedom and filters configurations *after* the solve, so a
draw that fails it advances the seed ([ADR-098](06-decisions.md#adr-098)'s pattern) rather than
reporting a contradiction. Conflating the two is the bug D7 exists to prevent.

**Also fixed on the way:** `evaluate`'s object switch had no exhaustiveness guard, so the new kind
compiled clean and would have evaluated to **nothing** — the [#1038](https://github.com/dcodish/geo_builder/issues/1038)
class again, in a second place. It now ends in a `never` check like every switch in `carriers.ts`.

**Not claimed.** The area *measurement* (#1027), the option list for a two-root pin (#1036), the
component form `x_M` (#1040), and the bare-equation gap (#1037) are untouched. Only the sentences
named above parse.

---

## ADR-AG-016 — The canvas shows the QUESTION; the data panel shows the ANSWER (#1032)

**Requirements:** [02c](02c-requirements-analytic.md) R20 (equations/coordinates on the canvas, now
ruled more precisely), R21/R22. **Design:** [04c](04c-design-analytic.md) — `provenanceOf` and the
scene's label parts.

**Context.** Operator, 2026-09-15, on a figure the tool had just solved: *"the canvas itself shows the
inputs on the canvas itself. So point A and D were defined so I want to see them, and point B was
partially defined so I also want to see that. **Anything that is derived from the figure should stay
in the data panel**."* Asked what a partially-defined point should read: *"for B, we should show
`B(x_B, 0)`."*

**The rule, and it is PROVENANCE rather than determinacy.** The obvious implementation gates the label
on `isKnowledge` — and it is wrong. In image 7 #6 the joint solve determines `B = (2,0)` exactly, so
the honesty gate calls both coordinates knowledge and a gate-driven label prints `B(2,0)`. The ruling
says that is the **answer**, and the answer belongs in the panel. The canvas carries what the
student's own givens pin about that point:

| point | its own givens | canvas | panel |
| --- | --- | --- | --- |
| `A(6,4)` | both coordinates | `A(6, 4)` | `A(6, 4)` |
| `D(0,3)` | both coordinates | `D(0, 3)` | `D(0, 3)` |
| `B` | «על החלק החיובי של ציר x» — pins `y` only | **`B(x_B, 0)`** | `B(2, 0)` |
| `C` | nothing about `C` alone | `C` | `C(-2, 6)` |

So **the canvas and the panel deliberately disagree about `B`**, and that disagreement is the feature:
the figure becomes the question, printable as a worksheet with the givens marked the way a textbook
marks them, and the solution is somewhere the student can choose not to look. It also keeps the canvas
legible — a solved figure otherwise carries a coordinate pair on every vertex.

**What "its own givens" means, precisely.** Only constraints whose references are exactly that one
point. «שטח המשולש ABC הוא 20» names three, so it is provenance for none of them — which is why `C`
shows its name alone even though the figure fixes it. An axis-parallel `on-line` pins one coordinate;
a slanted line pins neither on its own.

**The honesty invariant still binds, separately.** A stated coordinate carrying a free parameter —
`A(-9a, 0)` — is **not** known here either, so the canvas never prints a sampled number. Provenance
decides *whether the givens say anything*; the honesty gate decides *whether what they say is a
number*. Both must pass.

**Not MathML, and the reason is recorded so it does not read as an omission.** The operator asked for
`B(x_B, 0)` "in mathml". Subscripts are drawn with an SVG `<tspan>` at reduced size and a baseline
offset: MathML inside SVG requires `<foreignObject>`, is unevenly supported across browsers, and would
not survive the PNG export this product already ships. The rendered subscript is identical. The
letters match the ruled component notation (02c R31c), so what the canvas *shows* is what the student
may *type* (#1040) — the same word in both directions.

**Legibility.** Point labels are painted stroke-then-fill with a white halo, as the construction ratios
already were ([ADR-AG-014](#adr-ag-014)): `B(x_B, 0)` lands on the x-axis and `D(0, 3)` on its own
segment, and both were muddy without it. [ADR-AG-010](#adr-ag-010) R34 makes that a design condition
rather than a polish item.

## ADR-AG-017 — A rule that MATCHED owes an answer about what it matched (#1039 #1042 #1046)

**Status:** accepted, 2026-09-15 · **Round:** [#1056](https://github.com/dcodish/geo_builder/issues/1056)
(analytic batch A, the honesty sweep)

**Requirements:** [02c](02c-requirements-analytic.md) §9 — R41 (a shape noun asserts its vertex count),
R42 (`x`/`y` name the plane, not a point's unknown), R43 (a refusal names what it collided with).
**Design:** [04c](04c-design-analytic.md) "The parser's rule contract" — the three-way rule answer and
the owned refusal codes.

**Context.** The operator's play session of 2026-09-15 produced three separate reports that measurement
showed to be one defect wearing three faces:

- «M(3,y)» was **accepted**, drew nothing and said nothing (#1039);
- «משולש ABCD» **built a four-sided triangle**, and «מפגש התיכונים במרובע ABC» **built a centroid**
  while ignoring the word «מרובע» the student had typed (#1042);
- a name clash said «השם כבר משמש עצם מסוג אחר» — *you picked a bad name* — when the student had not
  picked a bad name at all (#1046).

**The common root: a rule recognised the sentence and then answered as though it had not.** The parser's
rule functions returned `Fact[] | null`, so a rule with something to say about a sentence it had matched
had only `null` to say it with — and `null` means `not-handled`, whose message is *"I could not
understand the statement"*. That is a false statement to the student about a sentence we did parse. It is
also the **LLM escalation seam**, so well-formed givens were being handed to the model rather than
answered by the product that understood them.

Two of the three were worse than a mis-worded refusal: `parseShape` checked `vertices.length < 3` and
`CONCURRENCY_HE` matched the shape noun **non-capturingly**, so the student's own word was invisible to
the code that should have checked it. The figure then contradicted the sentence that produced it, which
is a stated given vanishing — the one thing the root CLAUDE.md forbids outright.

**Decision.**

1. **A rule answers three ways, not two** — `made(facts)`, `refuse(code, line)`, or `null` for "not my
   sentence". `parseLine` chains the rules with `??`, which falls through on `null` alone, so a rule that
   owns a refusal keeps the last word. The contract is in [04c](04c-design-analytic.md).
2. **Three owned refusal codes, one per class**: `reserved-coordinate`, `bad-arity`, `repeated-vertex`.
   Each renders a locale string naming the student's own statement and, where there is one, the supported
   form («אפשר להשתמש באות אחרת, למשל M(3,t)»).
3. **The shape noun is CAPTURED and checked**, in both halves — the count against the noun the student
   typed, and the noun against the construct's own arity. A repeated label is refused: «משולש ABA» is not
   a triangle, and `polygonId`'s canonical ring is meaningless for one.
4. **`x` and `y` are decided at the point of entry.** `RESERVED_SYMBOLS` keeps them out of the free
   register (`carriers.ts`), which is right for a curve's equation and silent for a coordinate. The fix is
   not to widen the filter but to make the parser answer the case: **a filter that drops by omission must
   be a decision where the sentence is still in front of us.**
5. **A clash carries what it collided with.** `ApplyError.existing` is a stable token (`derived:centroid`)
   minted in the engine and rendered into Hebrew or English in `App.tsx`. The engine stays language-free;
   the message still says *what* the name holds.

**What the fix is NOT.** It is not three message changes. Two of these cases were building wrong figures,
and the reported inputs («M(3,y)», «משולש ABCD») are each one member of a class — so the sweep covered
every rule that can recognise a sentence and find it wrong, including two the reports never mentioned:
the area given over too few vertices, and a cevian naming a zero-length side.

**Measured before and after, on the merged tip of PR #1055** — the baseline is what makes these tests
locks rather than descriptions:

| input | before | after |
| --- | --- | --- |
| `M(3,y)` | accepted, 0 points, `vacant` | `reserved-coordinate` |
| `משולש ABCD` | built, 4 vertices | `bad-arity` |
| `משולש ABA` | built `poly-AAB` over 2 points | `repeated-vertex` |
| `M מפגש התיכונים במרובע ABC` | **built a centroid** | `bad-arity` |
| `M מפגש התיכונים במשולש ABCD` | `not-handled` | `bad-arity` |
| `שטח המשולש AB הוא 7` | `not-handled` | `bad-arity` |
| clash on a derived `M` | "a different kind of object" | names the centroid |

**Consequences.** `not-handled` now means what it says, which matters beyond the message: it is the
signal the LLM fallback escalates on, so its precision is a cost control as well as an honesty property.
The three codes are additions to `ParseFailure`, the store's `InputError` union and `App.tsx`'s code→key
map — the registry that a new refusal must be added to in all three places, which is itself the thing
that makes a missing entry a type error rather than a blank message.

## ADR-AG-018 — The conic "slot" was an ID COLLISION, not a policy (#1026)

**Status:** accepted, 2026-09-15 · **Supersedes:** [ADR-AG-005](#adr-ag-005) D6, second bullet (the
one-parabola-one-ellipse limit; the anonymity it also states is untouched) ·
**Round:** [#1056](https://github.com/dcodish/geo_builder/issues/1056)

**Requirements:** [02c](02c-requirements-analytic.md) §5b — "two ellipses in one figure" moves from
**BLOCKER** to supported. **Design:** [04c](04c-design-analytic.md) "The three cores" — the id rule for
unnamed objects, unchanged in mechanism and now applied to one more family.

**Context.** «נתונה אליפסה שמשוואתה x²/9+y²/16=1» followed by a second, different ellipse was refused
with «בשרטוט יכולה להיות פרבולה אחת ואליפסה אחת» — *a figure holds one parabola and one ellipse*. That
sentence states a policy, and no one had decided it. What actually happened is that both anonymous
ellipses were minted with the **fixed id `ellipse`**, so the second collided with the first on its name;
`conicSlotTaken` then translated the collision into a rule about figures.

The tell was already in the tree: unnamed **lines and circles** had carried a content-derived id
(`anonIndex`, a hash of the normalized equation) since slice A. Only the conics were given fixed ids,
and only the conics acquired a "policy".

The cost was not hypothetical. [02c §5b](02c-requirements-analytic.md) listed *two ellipses in one
figure* as a **BLOCKER** against a real exam whose part ג asks for «אליפסה קנונית חדשה» — a question the
tool could not reproduce because of a limit nothing had chosen.

**Decision.**

1. **Anonymous conics take a content-derived id** — `parabola-<hash>` / `ellipse-<hash>` — the same
   mechanism, the same function, as unnamed lines and circles.
2. **`conicSlotTaken` is DELETED**, with its error code, both locale strings, the store's union member
   and `App.tsx`'s map entry. A refusal that can no longer happen must not stay wired, or it becomes
   the next reader's false constraint.
3. **The M1 absorb is what the content id has to preserve**, and it is asserted directly: restating the
   same conic is still one object, because the same equation hashes the same. That is what lets a
   question's section ב re-state section א's given, and it would have failed silently by drawing twice.
4. **Anonymity stands.** The corpus does not name conics, and this ADR does not name them either.

**A second defect, found by reading the panel's own fallback while making this change.** The data panel
labelled a curve `c.label.name || c.id`, so an unnamed curve printed its **internal id** at the student:
today, live, a circle row reads `circle-anonq3c8qq` inside an RTL Hebrew panel. It was invisible while
the conic ids happened to read `parabola` and `ellipse`, and content-derived ids would have made it
unmissable. Fixed at the fallback: an unnamed curve prints **no name**. The row needs none — the
equation, focus and directrix `describeCurve` prints are what distinguish two anonymous parabolas, and
they are the student's own numbers rather than ours. This is [#1029](https://github.com/dcodish/geo_builder/issues/1029)'s
class exactly (internal state reaching a surface), which is why it was fixed here rather than filed:
the change that exposed it is this one.

**Deliberately NOT decided: how a student REFERS to one of two anonymous conics.** With two ellipses on
a canvas, «האליפסה» is ambiguous, and the honest answer needs corpus evidence — the 5b question's own
wording — rather than an invented ordinal. Filed as its own issue. Nothing in this ADR depends on it:
both conics draw, both print their own row, and neither can be named today anyway.

**Consequences.** One fewer refusal code across four files. `conflicting-restatement` on a curve now
means only what it says — a NAMED curve restated with a different equation — because the anonymous case
can no longer reach it. `src-analytic` 194 → 197 tests, including the inverted lock: the test that
asserted the old policy now asserts that two ellipses coexist, with the absorb tested alongside it so
the content id cannot silently stop deduplicating.

## ADR-AG-019 — The shape noun is optional for an equation, and the discriminator is MEASURED (#1037)

**Status:** accepted, 2026-09-15 · **Implements:** [02c](02c-requirements-analytic.md) R6 (operator
ruling, 2026-09-04) · **Round:** [#1056](https://github.com/dcodish/geo_builder/issues/1056)

**Requirements:** [02c](02c-requirements-analytic.md) R6 — ruled 2026-09-04, unimplemented until now;
R44 added for the identity rule below. **Design:** [04c](04c-design-analytic.md) "The parser's rule
contract" — the bare-equation branch and its discriminator.

**Context.** Operator, 2026-09-15: *"why is `x-y+2=0` not recognized by the tool at input?"* It was
not, and neither was `y^2=54x` — **which is R6's own example.** R6 had ruled the shape noun *optional
for an equation and load-bearing for a shape*, "because the fit already knows the kind". This is a
ruled requirement that was never built, not a missing capability: `conic.ts` has fitted six
coefficients from seven lattice probes and named the family since slice A. Every `matchCurve` branch
was simply gated on a noun or a name, so a bare equation fell through every rule to `not-handled` —
and `not-handled` is the **LLM escalation seam**, so the shortest thing a student can type was being
sent to the paid model as though we had not understood a sentence we understand perfectly.

The corpus writes figures this way. Image 6 gives a triangle as `4x+3y=0`, `12x-5y=0`, `x=15`; image 7
#10 opens «משוואת אחת ממצלעות משולש היא x-y+2=0».

**Decision.**

1. **A bare equation builds, and the branch runs LAST** — after every named form, parameter
   declaration, inequality, shape, derived point and coordinate has had first refusal. The issue
   placed it "last in `matchCurve`", but `matchCurve` runs *before* the point and shape rules, and
   the protection this branch needs is precisely that those answer first. Implemented as a late
   branch in `parseLine` instead; the deviation is the plan's own stated intent ("every named form,
   parameter declaration, inequality and point rule gets first refusal") over its stated location.
2. **The discriminator is that the equation is in the PLANE's variables, read off the PARSED
   expression's symbol set** — not by looking for an `x` in the text. This is the whole defence, and
   it is the `[IVX]` Roman-numeral trap ([ADR-AG-006](#adr-ag-006)) on a new letter: a branch matching
   anything containing `=` eats `AB = 4√5` and `x_A = 5`.
3. **It was MEASURED against the corpus before it was written**, as the issue demanded. Every line
   that must build resolves to symbols containing `x` or `y`; every line that must not — `AB = 4√5`,
   `AB=10`, `AB+BC=10`, `AB = AC`, `a = 5`, `k=3` — resolves to symbols that are not the plane's, and
   `x_A = 5` does not parse as an equation at all. Two different mechanisms, both verified rather than
   assumed.
4. **No kind is claimed.** `Curve.kind` becomes OPTIONAL — an *expectation* the statement made, not
   the answer. `classify` remains the authority; the expectation only makes a refusal specific
   ("you wrote «אליפסה» and this is a hyperbola"). A bare hyperbola or rotated conic is still refused
   **by name** at evaluation ([ADR-AG-008](#adr-ag-008)), which is why this branch needed no new
   refusal of its own.

**R44 — an anonymous curve's identity is its EQUATION**, recorded here because this change forced it.
Anonymous lines and circles were minted `line-<hash>` / `circle-<hash>`, so the bare form of a line the
student had already given with its noun produced a SECOND object: `line-anon8q5bxa` beside
`curve-anon8q5bxa`, two panel rows for one line. That duplication did not exist before — without a
bare form there was only ever one spelling of an anonymous curve — so this change introduced it, and
fixing it here rather than filing it is the never-patch rule applied to one's own work. All anonymous
curves now share the `curve-<hash>` namespace; named ones (`line-l1`, `circle-I`) are unaffected,
because a name IS an identity.

**A consequence worth stating: absence of a claim is not a conflicting claim.** With the namespace
shared, «הישר x-y+2=0» followed by «x-y+2=0» reached the M1 absorb with `kind: 'line'` on one side and
`undefined` on the other, and both `sameCurve` and the clash test compared them with `!==` — reporting
the student's own restatement as a contradiction. Both now require **two** claimed kinds before they
disagree. This is the second-order defect of making a field optional, and it is exactly the kind that
ships silently: the figure was right, only the refusal was invented.

**Consequences.** `not-handled` narrows again, on top of [ADR-AG-017](#adr-ag-017) — fewer understood
sentences reach the LLM, which is a cost control as much as an honesty property. Five catalog entries
teach the short form, so the reference card and the model's allowed vocabulary both carry it.
`src-analytic` 194 → 212 tests.


## ADR-AG-020 — "Already known" is a THIRD outcome, and narrowing is not it (#1045)

**Status:** accepted, 2026-09-15 · **Round:** [#1056](https://github.com/dcodish/geo_builder/issues/1056)

**Requirements:** [02c](02c-requirements-analytic.md) §9 R45. **Design:**
[04c](04c-design-analytic.md) "The submit path's three answers".

**Context.** Operator, play-testing T21: *"the second time should say **this is already known** and
**not enter it twice**."* Measured: «M אמצע AB» typed twice produced two rows mentioning אמצע and a
counter reading «4 נתונים» for three givens — with no error, no notice, and nothing said.

**The engine was right the whole time.** `applyFact` has answered `absorbed: true | false` since V0,
and it produced one `M`, no duplicate object. The signal simply had no reader: `derive` reported
`faults` and dropped everything else, so `App.submit` could only ask *"is there a fault?"* and called
`recordLine` on every `no`. An absorbed line is neither a fault nor a creation, and the submit path
had no third branch. This is [#1020](https://github.com/dcodish/geo_builder/issues/1020)'s shape
exactly: **a mechanism that exists, is correct, and has a caller that never asks.**

Why it is more than tidiness: silence reads as failure, so a student who sees nothing happen types the
line again, or differently. The fact list is the source of truth *and the save file*, so a row that
contributed nothing is noise in the artifact a teacher exports. And absorption is a teaching moment —
[ADR-AG-003](#adr-ag-003) makes M1 the reason a later section of a question may restate an earlier
one, so "already known" is the tool confirming the restatement was consistent.

**Decision.**

1. **`applyFact` reports an EFFECT, not a boolean** — `created` | `known` | `narrowed`. The boolean
   was hiding a real distinction (below). `fold` carries the effects out positionally beside `errors`,
   and `derive` rolls them up to one **per-line** outcome, adding `faulted`.
2. **`App.submit` gains its third branch**: a `known` line is not recorded and shows a notice —
   `role="status"`, muted, never the danger colour. It is not a refusal; the student was right.
3. **The rollup is deliberately generous.** A line can lower to several facts («AD תיכון לצלע BC» is
   four), and it counts as contributing if *any* of them created or narrowed something. Only a line
   whose every fact was already known is `known`, because that is the only case where dropping the row
   is honest.

**`narrowed` is the part that would have shipped as a lie.** «a הוא פרמטר» then «a<13» is also
absorbed — it merges into the existing declaration rather than creating a second one — but it **did
add information**, and the corpus writes parameter domains in exactly that two-step. Telling the
student "already known" there, and silently dropping the row, would delete a given they had stated:
the honesty invariant this whole round is about. The two are told apart by asking whether the merge
changed the domain at all, compared through a normalized form rather than by reference identity —
`next !== c` happens to work today and would break the first time a no-op branch rebuilt its object.

**Consequences.** The counter and the fact list now agree with the figure, because all three read one
answer computed at the apply boundary instead of each deriving their own. `absorbed` is gone from the
public shape; the one test that read it now asserts the effect. `src-analytic` 194 → 202 tests.

## ADR-AG-021 — A segment–segment question answered with the line–line formula (#1043)

**Status:** accepted, 2026-09-15 · **Round:** [#1056](https://github.com/dcodish/geo_builder/issues/1056)

**Requirements:** [02c](02c-requirements-analytic.md) — none changed; this restores what F16 already
promises. **Design:** none (internal to `engine/derived.ts`).

**Context.** From a Codex review of the tree, verified by hand before filing. «G מפגש האלכסונים במרובע
ABCD» over a **concave** quadrilateral returned a point that lies on neither diagonal:
`A(0,0) B(4,0) C(1,1) D(0,4)` gave `G = (2,2)`, at `t = 2` along a diagonal `AC` that ends at `(1,1)`.
Committed with no fault, drawn, and printed in the data panel as a coordinate the student can read off
the figure.

**Root cause.** `diagonalMeet` solved for the intersection of the two supporting **lines** and returned
it unconditionally, guarding only the parallel case. The docblock said `null` "when the diagonals are
parallel (they do not meet)", which is a true statement about one way they can fail to meet and was
being read as the complete contract.

**An invented point is the same class of defect as a dropped given.** Both make the figure say
something the sentence does not, and this one is worse to a student than a refusal would be: the
coordinate is printed as knowledge, in the panel, beside coordinates that are true.

**Decision.**

1. **Both parameters come from the same determinant** — `t` along `AC` and `u` along `BD` — so they
   are consistent by construction rather than by two solves that could disagree near-degenerately.
2. **`null` unless both lie in `[0, 1]`**, under a relative epsilon. An absolute one would mean
   something different on a figure spanning 3 units than on one spanning 3000, and the corpus contains
   both.
3. **The interval is CLOSED**, and that is a decision rather than a tolerance artefact: `t = 0` or
   `t = 1` puts the crossing exactly on a vertex — a degenerate quadrilateral whose diagonals
   genuinely do touch there. Tested directly (`A(0,0) B(4,0) C(2,2) D(0,4)`, where `BD` passes through
   `C`), so the ruling cannot drift with the epsilon.
4. **The docblock now states the implemented contract**, both halves.

**`null` is VACANCY, not a fault.** `evalRule` already propagates it and the figure reports the point
absent at this configuration ([ADR-AG-008](#adr-ag-008)) — never `NaN`, never invented. Nothing new was
needed for that, which is why this fix is eight lines: the honest path existed and the function was not
taking it.

**Consequences.** `src-analytic` 194 → 202 tests, including the reported figure, the reviewer's own,
the closed-endpoint ruling and a scale check at 1000×.

## ADR-AG-022 — An unbounded parameter varies in SIGN; seed 0 may still be the familiar draw (#1019)

**Status:** accepted, 2026-09-15 · **Round:** [#1056](https://github.com/dcodish/geo_builder/issues/1056)

**Requirements:** [02c](02c-requirements-analytic.md) §9 R46. **Design:** none (internal to
`engine/evaluate.ts`'s sampler).

**Context.** `sampleParam`'s unbounded branch was `v = 1 + 3 * u` — always in `[1, 4)`. Measured over
seeds 0–39: **min 1.115, max 3.965, not one negative value.** So `y² = 2ax` drew a right-opening
parabola at every configuration, and nothing in the question had said it opens right. The bounded and
half-bounded branches were correct; they respect what was stated. Only the unbounded branch invented a
bound, which is [ADR-052](06-decisions.md#adr-052)'s cardinal sin — a **default masquerading as a
given** — and the conformance smell that ADR names exactly: a value counted as free and never actually
sampled across its range.

It is pre-existing, and [ADR-AG-011](#adr-ag-011) (B1) widened its blast radius rather than causing it:
with the register fed by the objects' own expressions, every undeclared symbol in every equation now
reaches this branch, where before it was left unbound and the object silently drew nothing (#1014).

**Decision.**

1. **The magnitude stays in `[1, 4)` and the SIGN varies.** Keeping `|v| ≥ 1` is what holds every
   configuration away from the degenerate `0`, where `y²=2px` collapses to a doubled axis — the
   documented `vacant`, which is "not at this value" rather than an error.
2. **Seed 0 stays positive.** ADR-052 permits a default as a *starting* point so the figure can be
   drawn at all, and the right-opening parabola is the better first draw for a student. What ADR-052
   forbids is a default that never moves — so every later configuration may take either sign, and
   «הציגו תצורה אחרת» reaches the other one within a few presses (measured: seed 2).
3. **The sign is drawn per parameter, on a disjoint jitter stream.** Two unbounded symbols must not
   march in lockstep, or a figure with both could never reach two of its four sign combinations.
   Measured: two parameters agree in sign on 10 of 20 seeds.

**A correction to the issue's own framing, found by measuring.** #1019 expected this fix to "change
what every existing figure looks like at seed 0", and deferred it out of B1 on that basis. It does not:
seed 0's value is byte-identical before and after (`3.4579351904…`), because the sign decision is
skipped at seed 0 entirely. The play-visible change is confined to the *later* configurations, which is
where it was missing. The deferral was still right — this deserved its own decision — but the cost it
was priced at was not the cost.

**R46 is the general statement**, because this branch will not be the last sampler: **a free magnitude
must be sampled across everything the student left open, sign included.** Bounding it to what looks
familiar is the same defect as drawing a figure that violates a given, one step removed.

**Consequences.** `src-analytic` 194 → 201 tests, including the seed-0 lock (the familiar draw is
allowed to be first), the both-signs-within-six-seeds lock, the away-from-zero lock, the independence
lock, and controls asserting the three bounded branches are untouched.

## ADR-AG-023 — One namespace for every anonymous curve (round #1056 reconciliation)

**Status:** accepted, 2026-09-15 · **Completes:** [ADR-AG-018](#adr-ag-018) (#1026) and
[ADR-AG-019](#adr-ag-019) (#1037) · **Round:**
[#1056](https://github.com/dcodish/geo_builder/issues/1056)

**Requirements:** [02c](02c-requirements-analytic.md) R44 — unchanged; this is R44 applied to the one
family that had been left out. **Design:** [04c](04c-design-analytic.md) "The parser's last branch".

**Context.** Two fixes in the same round met at the same line. ADR-AG-018 gave anonymous conics a
content-derived id, `parabola-<hash>`. ADR-AG-019 ruled that an anonymous curve is identified by its
**equation** and put unnamed lines and circles in a single `curve-<hash>` namespace. Each was right on
its own branch and each suite was green.

**Together they were wrong**, and neither branch could see it: with conics keeping a kind prefix,
«נתונה פרבולה שמשוואתה y^2=54x» and the bare «y^2=54x» land in different namespaces, so one parabola
becomes two objects and two data-panel rows — precisely the duplication ADR-AG-019 had just removed for
lines and circles.

**Decision.** Every unnamed curve — line, circle, parabola, ellipse — takes `curve-<hash of its
normalized equation>`. A NAMED curve keeps its name (`line-l1`, `circle-I`), because a name is an
identity. ADR-AG-018's property is untouched: two different equations still hash differently and remain
two objects, and the same equation restated is still absorbed.

**Why this is its own ADR rather than a quiet fix-up.** The defect existed in neither branch and in
both — it is a property of the pair, invisible to each item's own gate, and the kind that a round
landing items independently would ship. It is the case the staging tip exists for, and recording it is
how the next round learns to look for it: **when two items in one batch touch the same identity rule,
their conflict may be semantic and produce no merge conflict at all.** Git merged these files cleanly.

**Consequences.** Locked by four cases in `engine.test.ts` asserting the property of the pair — the
noun and bare forms of a parabola and of an ellipse are each one object, two different conics are still
two, and every unnamed curve of all four families shares the namespace while the named ones do not.

## ADR-AG-024 — A relation is between two DIRECTIONS, and the resolver is the design (#1052 #1051)

**Status:** accepted, 2026-09-15 · **Round:** [#1061](https://github.com/dcodish/geo_builder/issues/1061)
(analytic batch B, the relation vocabulary)

**Requirements:** [02c](02c-requirements-analytic.md) §9 R47. **Design:**
[04c](04c-design-analytic.md) "Relations, and the direction resolver".

**Context.** Measured before building: **0 of 14 parallel/perpendicular phrasings and 0 of 5 slope
phrasings** were understood. «מקביל» did not exist in the parser at all; `perpendicular` existed in
`solve.ts` (built for «AD גובה») and no sentence could reach it.

**The decision that matters is not "add two constraints".** It is that a relation is between two
**directions**, and four different things have one: a segment named by two points (`DE`), a polygon
side («הצלע AB»), a named line (`ℓ1`), and an **axis** («ציר ה-x»). Any of the four against any of the
four, under either relation, is sixteen sentences — and it is **one constraint kind with a resolver in
front of it**, not sixteen rules.

**Why the resolver had to come first, not later.** [#1049](https://github.com/dcodish/geo_builder/issues/1049)'s
«מקבילית ABCD» *is* `AB ∥ DC, AD ∥ BC`, and [#1051](https://github.com/dcodish/geo_builder/issues/1051)'s
«שיפוע AB הוא 2» is the same direction algebra (parallel is equal slope). Built separately, the tool
could state a parallelism one way and measure it another and **disagree with itself**. One definition
is the only way that cannot happen, and it is why these two issues were bundled rather than sequenced.

**Decision.**

1. **`Direction`** — a three-member union (`points` / `axis` / `curve`) resolved once in the parser,
   consumed by every rule that relates directions. The relation never learns what kind of phrase
   produced it.
2. **One constraint kind, `relation`**, carrying `rel: 'parallel' | 'perpendicular'` and two
   directions. The residual differs only in which product is driven to zero — **cross** for parallel,
   **dot** for perpendicular — and every other property is identical.
3. **Directions are UNIT vectors.** A relation between a 3-unit segment and a 3000-unit one must
   converge the same way; an un-normalised cross product would let the long operand dominate the
   minimisation for no geometric reason.
4. **A slope is `dy = m·dx`, never `dy/dx = m`.** The quotient has a pole at a vertical segment, and a
   residual that blows up is one the minimiser cannot cross — a figure whose solution path passed near
   vertical would be unreachable. Written this way a vertical segment simply fails the given, which is
   #1051's explicit requirement.
5. **A named line resolves through a resolver the CALLER supplies.** `solve.ts` knows points and
   nothing else; teaching it curves would drag the classifier into the solver. `evaluate` passes
   `lineDirOf(c, env)` instead, and a `curve` operand that cannot be resolved reports "cannot be
   judged" exactly as an absent point does.
6. **`bad-operand` is its own refusal.** The student who writes «DE מקביל לפיל» got the sentence shape
   right; telling them "I did not understand" would send them to rewrite the half that was correct
   ([ADR-AG-017](#adr-ag-017)).

**Two things this round had to fix to get here, both filed separately.**

**#1059, in part.** «הישר DE מקביל לישר BF» was refused as a **bad equation** — the line noun gate ends
in `(.+)` and called the rest an equation. A noun gate may not claim the rest of the line, so it now
declines when the tail contains Hebrew. *The obvious discriminator — "contains an `=`" — is wrong, and
this tree's own existing lock caught it:* «נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2» is a **truncated
equation with no `=`**, and that student must be told their equation is unreadable rather than that the
sentence was not understood. The two failures look alike and want opposite answers. **The «מעגל O»
centre reading is deliberately NOT done here** — it belongs with the circle-by-centre object #1060
needs.

**#1062, entirely**, because #1051's vertical-slope lock could not be written without it. The
constraint check lived **inside the solve** (`if (ids.length > 0 …)`, and then only on
non-convergence), so a **fully determined figure never checked a single given**. `A(0,0) B(4,0) C(0,3)`
with «שטח המשולש ABC הוא 999» was accepted in silence — and that is `area`, which shipped in PR #1055
this morning, along with `on-line`. The check is now separate from the solve: the solve *finds* a
configuration, the check *reports* on the one reached. `null` stays "cannot be judged" rather than
"false", so a constraint naming a vacant point is still not blamed on the student.

**Deliberately NOT built:** «שיפוע הישר הוא 2» with no operand named. That is a contextual reference —
"the line", when there is exactly one — and this tree has no mechanism for one. It answers
`bad-operand`, which is honest: the relation was understood and the operand was not.

**Consequences.** 14 of 14 relation phrasings and 4 of 5 slope phrasings now build, over all four
operand kinds. Five catalog entries carry the new forms, chosen to walk the **operands** rather than
the phrasings — a catalog listing four spellings of one operand would prove nothing about the resolver.
`src-analytic` 240 → 278 tests.

## ADR-AG-025 — Lengths are VALUES, and that needs an expression layer (#1050)

**Status:** accepted, 2026-09-15 · **Round:** [#1061](https://github.com/dcodish/geo_builder/issues/1061)

**Requirements:** [02c](02c-requirements-analytic.md) §9 R49. **Design:**
[04c](04c-design-analytic.md) "Lengths as values".

**Context.** Operator: *"I want to support things like `AB+BC=10` or `AB+BC=DE`"*. Measured: both
`not-handled`, and so were `AB = AC` and `AB = 10` — **the tool had no notion of a segment's length as
a value at all.**

**Why this is a different SHAPE from every constraint built so far.** [ADR-AG-015](#adr-ag-015) built a
constraint layer whose every member is a **fixed-arity relation**: an area equals a number, a point is
the midpoint of two others, two directions are parallel. `AB + BC = DE` is not that. It is an equation
between two **expressions**, and neither side has an arity the grammar fixes. One kind per form would
be four kinds for `AB = 10`, `AB = AC`, `AB + BC = 10` and `2·AB = 3·CD`; as an expression it is **one
kind with different trees**, which is what makes the ratios and squares the corpus also writes fall out
rather than each needing another rule.

**Decision.**

1. **A `length-eq` constraint over two `LengthExpr` trees.** The residual is `eval(left) − eval(right)`,
   scale-normalised like the area residual and for the same reason: a figure measured in thousands and
   one measured in units must converge alike.
2. **It REUSES `expr.ts` rather than growing a second parser.** Operator precedence, juxtaposition
   (`2AB`), `√`, powers and the typeset/keyboard normalisation are already written, tested and
   load-bearing; a parallel implementation would be a second place for `4√5` to be read differently.
3. **Length terms are encoded as PRIVATE-USE placeholder characters.** The one thing `expr.ts` cannot
   do is see `AB` as a single symbol — its tokenizer reads single Latin letters, so `AB` is the product
   `A·B`. Each `|PQ|` is rewritten to one character from the Unicode private-use area before parsing
   and bound to the measured distance at evaluation. **Private-use precisely because no student can
   type one and no corpus phrasing contains one**: an encoding that could collide with real input would
   be the `[IVX]` defect again ([ADR-AG-006](#adr-ag-006)), where an internal token class ate an
   equation. `SYMBOL_RE` widens by exactly that range and by nothing else.
4. **The powers and quotients the corpus writes come free**, which is the return on (2): `AC² + BC² =
   1250` is Pythagoras stated as a given, and it parses because `expr.ts` already had `^`.

**THE COLLISION, and why the guard is position rather than tokens.** `AB` is a length here and a LINE
NAME elsewhere — «משוואת הישר AB היא y=2x» is corpus vocabulary too. The length rule lives in
`parseConstraint`, which `parseLine` reaches **only after `matchCurve`**, so any sentence carrying a
curve noun is already spoken for, and a bare equation in the plane's variables is claimed by
[ADR-AG-019](#adr-ag-019)'s branch, which runs later still and tests for `x`/`y` rather than for
lengths. Three rules, three disjoint conditions, one ordering — and it is **asserted** rather than
assumed, because this tree has twice been bitten by a token class eating real input.

**A length is ≥ 0**, so `AB = 12` with `AB + BC = 10` is reported `unsatisfiable` naming the statement,
rather than solved with a negative length. On a figure with no free carriers it is checked too, via
[#1062](https://github.com/dcodish/geo_builder/issues/1062)'s separation of the check from the solve —
which landed in this same round and is what makes `A(0,0) B(4,3)` with `AB = 10` a refusal.

**Measured after:** `AB = 10` → 10.0000 · `AB = 4√5` → 8.9443 · `AC² + BC² = 1250` → 1250.00 ·
`AB = AC` equal to 4 decimal places · `AB + BC = DE` equal to 3. Every one verified from the placed
points, independently of the solver's own verdict.

**Consequences.** `src-analytic` 278 → 295 tests. Three catalog entries walk the tree SHAPES rather
than the phrasings. The equal-length kind is the one [#1049](https://github.com/dcodish/geo_builder/issues/1049)
needs for «ריבוע ABCD» (a rectangle plus `AB = BC`), so the shape-noun round consumes this rather than
defining its own — the same reason #1052 and #1051 were bundled.

## ADR-AG-026 — A name can be a geometric CLAIM, and «הישר AB» is one (#1066)

**Status:** accepted, 2026-09-15 · **Round:** [#1067](https://github.com/dcodish/geo_builder/issues/1067)

**Requirements:** [02c](02c-requirements-analytic.md) §9 R50. **Design:**
[04c](04c-design-analytic.md) "Relations, and the direction resolver" — the resolver now hands over
whole curves.

**Context.** The operator, playing PR #1064: «משוואת הישר AB היא y=2x» drew a line, and `A` and `B`
were nowhere near it. Measured, the decisive case is worse than the screenshot:

```
A(0,0) · B(5,1) · משוואת הישר AB היא y=2x   → faults: []   B(5,1) on y=2x? NO
```

Both points fully placed, the student names the line **through them**, gives its equation, and the tool
accepts it in silence while drawing a line that misses `B`.

**The defect was never missing geometry — it was a name nothing was checking.** `matchCurve` mints
`line-<name>` for any `LINE_NAME`, and `LINE_NAME` admits both `ℓ1` and a two-point run. For `ℓ1` that
is right: **an arbitrary name asserts nothing.** For `AB` it is not: **«הישר AB» asserts that the line
passes through A and through B.** The id merely happened to read `line-AB`, and the figure held two
unrelated things sharing a name.

This is the class this product spent the day on — [ADR-AG-017](#adr-ag-017)'s name that lies — reaching
a place neither that ADR nor [#1062](https://github.com/dcodish/geo_builder/issues/1062) touched,
because nothing was wrong with the constraint layer: **there was no constraint at all.**

**Decision.**

1. **A two-point line name lowers to INCIDENCES.** «משוואת הישר AB היא y=2x» emits `declare A`,
   `declare B` and two `on-curve` constraints. The curve object stays, so the line still draws and the
   panel still carries its equation.
2. **Operator ruling, 2026-09-15: introduce the points, with DOF** — *"when A and B don't exist yet …
   introduce them with dof"*. That matches the shape nouns ([ADR-AG-013](#adr-ag-013)): a line NAMED by
   two points is naming them, not mentioning them in passing, and «M אמצע AB»'s refusal is for a
   sentence that merely *refers*. Measured: two introduced points at 2 DOF each, minus one incidence
   each, leaves the figure at **2 DOF** — the points slide along the line and the line stays put.
3. **`on-curve` is the first member of a family named in slice A and left empty.** `carriers.ts` has
   declared `CarrierFamily = 'free' | 'on-curve'` since the beginning with no members; this is the kind
   that fills it. `on-line` stays for the axes, whose coefficients are known without a figure.
4. **The caller-supplied resolver widens from a DIRECTION to a whole curve.** ADR-AG-024 had `evaluate`
   hand `solve.ts` a line's direction; an incidence needs the curve's own residual, and a direction is
   meaningful only for a line. So the resolver returns the `NumCurve` and `solve.ts` derives the
   direction where the distinction already lives. `curves.ts` already owns the distance-like residual
   for every family, which is what keeps *"is this point on this line"* and *"does this line pass
   through this point"* one answer instead of two.

**Nothing new was built.** `declare` existed for the cevian rule, the `free` kind for #1017, the
residual in `curves.ts` since slice A. The fix is a **lowering** decision at the parser, plus widening a
resolver by one type.

**It only reports the placed case because #1062 landed first.** `A(0,0) B(5,1)` has no free carrier, so
before the check was separated from the solve this would have gone on being accepted in silence — the
refusal above is #1062's separation doing its work in a place it was not written for.

**The control is the whole point.** «נתון הישר l1: y=2x» beside a triangle still constrains nothing and
leaves the figure at 6 DOF. If that ever changes, this ADR has been mis-implemented: the decision is
about **names**, not about lines.

**Consequences.** `src-analytic` 295 → 301 tests. One existing case was rewritten rather than deleted:
`carriers.test.ts`'s "keeps ids in disjoint spaces" enumerated `['A', 'line-AC', 'circle-I']` and now
sees `C` introduced. It asserts the **invariant** it is named after — a point id is a bare letter, a
curve id is namespaced, and the two cannot collide — instead of a population that this ADR was entitled
to change.

## ADR-AG-027 — Maths has no words; a discriminator measured only against its own inputs is unmeasured (#1068)

**Status:** accepted, 2026-09-15 · **Amends:** [ADR-AG-019](#adr-ag-019) (#1037) ·
**Round:** [#1067](https://github.com/dcodish/geo_builder/issues/1067)

**Requirements:** [02c](02c-requirements-analytic.md) R6 — unchanged; this repairs its implementation.
**Design:** [04c](04c-design-analytic.md) "The parser's last branch".

**Context.** [ADR-AG-019](#adr-ag-019) built the bare-equation branch and chose its discriminator with
care: *"the discriminator must be that the equation is in the PLANE's variables … and it must be
measured against the corpus, not reasoned about."* It was measured — against `AB = 4√5`, `x_A = 5`,
`a = 5`, `AB+BC=10` — and it is right about every one of them.

**It was never measured against prose.** `expr.ts` multiplies by juxtaposition, so every letter of an
English sentence becomes a symbol:

```
"P is on the line y=x"  →  symbols [P,e,h,i,l,n,o,s,t,x,y]
"my answer = x"         →  symbols [a,e,m,n,r,s,w,x,y]
```

Both contain `x`. Both passed. **Both were drawn.** «my answer = x» produced a line on the canvas, from
a sentence that is not about geometry at all, with nothing said.

Found by the operator two rounds later, while typing an ordinary English sentence in the course of
asking for something else entirely.

**Decision.** The branch asks first whether the text is an equation **at all**: a **space-delimited run
of three or more letters is a word**, and no equation in this grammar contains one.

- `normalizeMath` runs first, so `sqrt` is already `√` — the one legitimate multi-letter token cannot be
  mistaken for a word, and this is why the guard is applied to the normalized text rather than the raw.
- Every parameter is a single letter, so juxtaposed products (`2abc`) are **not space-delimited** and
  stay legal. A test on any three-letter run would have refused them; the boundary is what makes the
  guard safe rather than merely strict.
- It **declines** rather than refusing. A sentence with words is not a malformed equation — it is a
  sentence this rule has no claim on, and `not-handled` reaches the LLM seam, which is what that seam is
  for.

Measured after: six prose lines decline, nine bare equations build, **zero catalog entries affected**.

**The lesson, which is the reason this is an ADR and not a one-line fix.** This is the `[IVX]` trap
([ADR-AG-006](#adr-ag-006)) for the third time in this tree, and each time the fix has been "measure the
discriminator against the corpus". That instruction was followed here and the defect shipped anyway,
because the corpus consulted was **the corpus of givens** — the inputs the rule was designed for.

> **A discriminator measured only against the inputs it was designed for has not been measured.**
> The question is not "does it accept what it should" but "what else does it accept" — and the second
> needs inputs from outside the rule's own world: prose, another rule's vocabulary, a student's typo,
> a sentence in the other language.

`src-analytic/CLAUDE.md` carries the `[IVX]` trap already; this adds the sharper form.

**Consequences.** `src-analytic` 307 → 311 tests, four of them prose cases that no previous round would
have thought to write. The branch is otherwise unchanged, and R6 is implemented as it was always meant
to be.

## ADR-AG-028 — A known length becomes visible, and WHICH SURFACE is the decision (#1065)

**Status:** accepted, 2026-09-15 · **Round:** [#1067](https://github.com/dcodish/geo_builder/issues/1067)

**Requirements:** [02c](02c-requirements-analytic.md) §9 R52. **Design:**
[04c](04c-design-analytic.md) "Lengths as values".

**Context.** Operator, playing PR #1064: *"we should have 10 show on the AB line since this is a given
and not calculated. data panel doesnt show that AB=10"*, and *"data panel doesnt show AC value (10)
after i write AB=10 and AB=AC"*.

**The engine already knew.** Measured before building:

```
משולש ABC · AB = 10          → isKnowledge(|AB|) = { known: true, value: 10 }
                               isKnowledge(|AC|) = { known: false }   ← correctly still free
… · AB = AC                  → isKnowledge(|AC|) = { known: true, value: 10 }
```

Both cases right, including the one that must stay silent. **No surface printed either** — the data
panel had sections for points and curves and nothing else. This is
[#1020](https://github.com/dcodish/geo_builder/issues/1020)'s shape for the **third time** in this
product: a mechanism that exists, is correct, and has no caller. Worth noticing as a pattern rather
than a coincidence.

**Decision — the two halves of the operator's report are the two halves of a rule this product already
had.** [ADR-AG-016](#adr-ag-016): the canvas shows the QUESTION, the data panel shows the ANSWER. Their
own words draw the line: *"since this is a given and not calculated."*

| | surface | because |
| --- | --- | --- |
| «AB = 10» → `10` on the segment | **canvas** | the student STATED it; it is their given, like the `A(6,4)` labels #1032 draws |
| «AB = AC» → `CA = 10` in the panel | **panel** | the tool DERIVED it; it is an answer |

So a length is labelled on the figure only when a given **pins it by itself** — one length term against
a value. «AB = AC» pins neither: it relates them, and whichever becomes known does so *through* the
other, which is derivation.

**Three mechanics this needed.**

1. **A drawn segment knows whose endpoints it has.** `FigureSegment` carried resolved positions, with a
   docblock explaining that this is deliberate so the renderer never looks a vertex up. That is still
   true — the ids ride *alongside* the positions, and the renderer still consumes only what it is
   handed.
2. **The label is decided in the engine and FORMATTED in the renderer.** The engine emits a number; the
   scene formats it through `shell/format`. Putting a rounder in the engine would break the #723
   chokepoint the tree relearned in #1029.
3. **One row per PAIR in the panel**, not per drawn piece. A polygon emits one segment per side, and a
   student who also states «הקטע AB» would otherwise see `AB` twice. A length is a property of two
   points, not of how many things are drawn between them.

**The defect this build introduced and caught before landing.** The first draft passed `known: true`
unconditionally, and «AB = a» with a free parameter printed **3.46** on the canvas — one seed's sample
asserted as fact, which is #1020 exactly, in a feature whose own docblock warned against it. The gate
is now the same one `provenanceOf` uses for coordinates: **the stated value must carry no free
symbols**. Caught by verifying against a case the operator had not reported, which is the habit
[ADR-AG-027](#adr-ag-027) was written about one round earlier.

**Consequences.** `src-analytic` 311 → 318 tests, each asserting WHICH SURFACE rather than that a number
exists somewhere. The panel's lengths section shares `isKnowledge` with the coordinate and equation
rows, so all three answer the same question the same way — and when the measuring lane
([#1027](https://github.com/dcodish/geo_builder/issues/1027)) lands, «מה אורך AB» must read this same
value or the tool could report a length two ways.

## ADR-AG-029 — The point-on-object carrier, and the NOUN that bounds it (#1069 #1073)

**Status:** accepted, 2026-09-15 · **Round:** [#1067](https://github.com/dcodish/geo_builder/issues/1067)

**Requirements:** [02c](02c-requirements-analytic.md) §9 R53. **Design:**
[04c](04c-design-analytic.md) "A point on an object".

**Context.** The root [CLAUDE.md](../CLAUDE.md) describes what this product IS:

> a student adds information incrementally — "square ABCD" → **"point G on AD"** … classified by degrees
> of freedom — free point (2), **point-on-object (1, the parameter that makes "G on AD"
> representable)**, derived point (0)

`carriers.ts` named the family in slice A and left it empty: *"a point free on a curve (1), an
unanchored vertex (2)"*. The unanchored vertex arrived in #1017. **The point on an object never did**,
and the operator hit the gap three times in one session — «P על הישר y=x», «D על הצלע BC», «נקודה B על
הישר y=x» — before it was built. Measured: 0 of 12 phrasings.

**The ruling that shapes it.** Operator, 2026-09-15:

> for D - we need to separate the cases. D על הצלע BC or D על הקטע BC means is between B and C.
> D על הישר BC means anywhere on the line

**The noun decides whether the carrier is bounded**, and the consequence is the design:

| sentence | lowers to | DOF |
| --- | --- | --- |
| «D על הישר BC» | `on-line-2pt(D, B, C)` | **1** |
| «D על הצלע BC» / «על הקטע BC» | the same, **plus** a `between` selector | **1** |
| «B על הישר y=x» | the line minted from its equation, + `on-curve` | **1** |
| «P על הישר ℓ1» | `on-curve(P, line-ℓ1)` | **1** |

**One degree of freedom in every row, and that is the point.** A bound is a REGION — D7 kind 2 — and
consumes no freedom. Folding it into the constraint would drop the cue to 0 and report a figure as more
determined than it is, which is the defect D7 exists to prevent. So `Selector` becomes a union: the
existing half-plane, and the span between two points.

**Decisions.**

1. **`on-line-2pt` gets its own residual** rather than reusing the `parallel` relation on `BD ∥ BC`,
   which is the same algebra. The relation normalises both operands to unit vectors, so a `D` sitting
   exactly on `B` has no direction and the relation answers *"cannot be judged"* — while an incidence
   must still HOLD there, and an endpoint is a legitimate position on a side. Same cross product,
   different degenerate behaviour.
2. **The betweenness interval is CLOSED**, for the reason [ADR-AG-021](#adr-ag-021) closed the diagonal
   meet: an endpoint is a real position, and leaving that to a tolerance makes the ruling depend on an
   epsilon.
3. **The operand vocabulary is `direction()`'s**, not a second list of ways to name a segment. That
   resolver exists ([ADR-AG-024](#adr-ag-024)) precisely so «הצלע AB» cannot come to mean one thing in a
   relation and another in an incidence.
4. **An inline equation mints the line as an object**, content-addressed, so it draws, the panel carries
   it, and stating the same line again is one object ([ADR-AG-023](#adr-ag-023)).

**Two defects found by measuring rather than by the plan.**

**A selector that can NEVER hold was silent.** «D על הצלע BC» with «BD = 18» on a 10-unit side places
`D` beyond `C`; the selector goes false, the seed search finds nothing, and the figure was drawn anyway
with `D` outside the side the student named — **a figure contradicting its own givens**. `derive`'s own
docblock had said since slice A that *"if «החלק החיובי» can never hold, that IS worth reporting"*, and
nothing reported it. Now it does, under #1058's predicate: **a figure with no freedom has no other
configuration to try**, so a failing selector there is permanent. The under-determined case — 24
exhausted seeds as evidence rather than proof — is deliberately left to
[#1071](https://github.com/dcodish/geo_builder/issues/1071)'s measurement question, because refusing a
satisfiable figure is the opposite defect.

**The axis rule did not introduce its point, and the new rule did.** «B נמצא על ציר ה-x» with no `B`
answered `unknown-reference` while «B נמצא על הישר y=x» introduced it — the same sentence shape behaving
two ways. The operator's #1066 ruling settles it: a sentence that NAMES a point on an object introduces
it with the freedom the object leaves. Folded in, so there is one behaviour rather than two rules
drifting apart — which is exactly what #1069's plan warned about in keeping the axis rule separate.

**One lock flipped, correctly.** [ADR-AG-027](#adr-ag-027)'s prose case asserted «P is on the line y=x»
was `not-handled`. It was prose only because nothing could read it; now it says what it means. The case
keeps the three lines that are still genuinely prose and asserts the three that flipped.

**Consequences.** `src-analytic` 318 → 325 tests. The `on-curve` carrier family finally has members, and
[#1046](https://github.com/dcodish/geo_builder/issues/1046)'s `P(t,t)` — a student improvising around
this gap — is now a notation question rather than the only way to say the thing.

## ADR-AG-030 — A given the figure already ENTAILS is said, not recorded (#1063)

**Status:** accepted, 2026-09-15 · **Extends:** [ADR-AG-020](#adr-ag-020) (#1045) ·
**Round:** [#1067](https://github.com/dcodish/geo_builder/issues/1067)

**Requirements:** [02c](02c-requirements-analytic.md) §9 R54. **Design:**
[04c](04c-design-analytic.md) "The submit path's three answers" — now four.

**Context.** The operator, playing [#1062](https://github.com/dcodish/geo_builder/issues/1062)'s own
fix: *"B11 says area is 6 but that is already known at this point so we should say this is known. B on
x-axis should also fall into the already known category."*

B11 and B12 were written as the GUARDS proving #1062 had not overreached — that a TRUE given on a
determined figure stays silent — and they exposed the opposite gap. **#1062 made the tool notice a
given is false; this is it noticing a given is redundant.** The same question asked in both directions.

**Why [ADR-AG-020](#adr-ag-020) could not see it.** #1045's `known` is decided in `applyFact` by
STRUCTURAL comparison: is this fact already in the list? «שטח המשולש ABC הוא 6» on a determined triangle
was never stated before. It is simply *true and already settled*, which is a property of the whole
figure and invisible to a function that judges one fact against one construction.

**The predicate, measured.** Two conditions, and neither alone is enough:

| case | dof before → after | holds | verdict |
| --- | --- | --- | --- |
| area is 6, determined figure | 0 → 0 | yes | **entailed** |
| `B` on the x-axis, and it is | 0 → 0 | yes | **entailed** |
| area is 999 | 0 → 0 | **no** | refused |
| free triangle, `AB ∥ ציר x` | 6 → **5** | yes | **recorded** |
| free triangle, area is 6 | 6 → **5** | yes | **recorded** |

**The counter-case is why "the residual is zero" is not enough.** On a free triangle «AB מקביל לציר x»
is satisfied at seed 0 only because the sampler put it there; the constraint is real and removes a
degree of freedom. Calling it "already known" would **silently discard a stated given**, which is the
defect this product exists to avoid. The freedom test is what separates *"true here"* from *"true
necessarily"*.

**The test is on what the figure GAINED, not on the sentence's fact kinds.** The first draft asked
whether the line lowered to constraints only — and that answer changed under it when
[ADR-AG-029](#adr-ag-029) taught the axis rule to declare its point. «B נמצא על ציר ה-x» then emitted a
`declare` that is absorbed because `B` exists, and a fact-kind test called the line new. Comparing the
construction's objects, params and selectors before and after asks the question that actually matters
and cannot go stale when a rule changes what it emits.

A NEW SELECTOR counts as contributing even when it happens to hold, because a selector consumes no
freedom by design and the DOF comparison cannot see it. That is the conservative direction: it records
a line that arguably added nothing, rather than discarding one that did.

**It costs nothing.** Both derivations already exist in `App.submit` — the current figure and the dry
run the submit path has always done.

**Consequences.** The message is its own — «זה כבר נובע…» rather than «כבר ידוע…» — because the student
did not repeat themselves; they stated something the figure had already settled, which is worth telling
them differently. `src-analytic` 325 → 330 tests.

## ADR-AG-031 — Vacancy needs a PREDICATE, and ADR-AG-008 is amended rather than overturned (#1058)

**Status:** accepted, 2026-09-15 · **Amends:** [ADR-AG-008](#adr-ag-008) ·
**Round:** [#1067](https://github.com/dcodish/geo_builder/issues/1067)

**Requirements:** [02c](02c-requirements-analytic.md) §9 R55. **Design:** none (internal to `derive`).

**Context.** The operator, playing round #1056's T12: *"we should not accept this input as is since it
doesnt exist. we should put a message to user about why its not drawn and not accept the input."*

[ADR-AG-021](#adr-ag-021) had just fixed the half that INVENTED a diagonal meet on a concave
quadrilateral. The absence was then correct — and silent.

**ADR-AG-008's rule is right, and it is a statement about a figure that still has freedom.** *"Not at
this parameter value"* presupposes there are other values. Measured on the reported figure: **`dof = 0`
at every seed.** There is no other configuration; «הציגו תצורה אחרת» can never help; the student named a
point and the tool declined to have one without saying so.

**Decision: silent while the figure can still move, reported once it cannot.** The rule keeps its scope
and gains its predicate. A new refusal code, `does-not-exist`, distinct from `unsatisfiable` — that is a
given the solve could not MEET, this is a construct whose definition has no answer here.

**The class is wider than the diagonals**, which is why it is a predicate and not a special case: three
collinear points have no circumcentre, for ever, and behaved the same way. So does a circle written
`x²+y²+1=0`.

**Two of ADR-AG-008's own locks flipped, and reading them was the interesting part.** Both asserted that
vacancy raises nothing — one on three pinned collinear points, one on `x²+y²+1=0`. **Neither figure has
a parameter**, so both were testing the rule *outside its own stated scope*: "at this parameter value"
is vacuous when there is no parameter. They now assert the reported behaviour, and each gained a sibling
that exercises the rule where it does apply — a free triangle, and a circle whose radius depends on a
free `a`. The amendment is locked from both sides.

**It reuses [ADR-AG-017](#adr-ag-017)'s `existing` token**, so the message names «מפגש האלכסונים» rather
than `derived:diagonals` — the engine stays language-free and the locale renders the construct's own
corpus noun.

**Consequences.** `src-analytic` 330 → 337 tests.

## ADR-AG-035 — A shape noun is a TABLE ROW, and an unstated choice is a discrete DOF (#1049)

**Status:** accepted, 2026-09-15 · **Supersedes the refusal in** [ADR-AG-013](#adr-ag-013) ·
**Round:** [#1067](https://github.com/dcodish/geo_builder/issues/1067)

**Requirements:** [02c](02c-requirements-analytic.md) §9 R59, R60. **Design:**
[04c](04c-design-analytic.md) "The shape registry".

**Context.** Operator, 2026-09-15:

> we need support for **all kinds of 2d shapes**. **I don't want to mention each one.** But for
> instance, the tool doesn't support `משולש ישר זווית`. It also doesn't support `זווית B ישרה` so I
> can tell the tool what is the right angle.

Measured: 0 of 20 forms. Seven nouns were refused `out-of-scope` by ADR-AG-013 — deliberately,
because each carried a given the tool could not then honour and drawing a parallelogram as a plain
ring of four sides would be a stated given vanishing.

**The requirement is about the shape of the CODE, and that is what was built.** «I don't want to
mention each one» is not a request for ten nouns; it is a request that the eleventh cost nothing.
`engine/shapes.ts` is a table from noun to constraints, its whole vocabulary is `parallel`, `equal`
and `rightAngleAt`, and a row that needs a fourth helper is a signal that the CONSTRAINT layer is
missing a kind — not that the table needs an exception. That is asserted, not hoped for: a test
walks every row in `SHAPES`, parses `<noun> ABCD`, and requires the facts to be a polygon plus
exactly the constraints the row declares, so a noun implemented as a special case anywhere else
fails it.

**ADR-AG-013's refusal is not overturned, it is spent.** Its own comment said *"refused until B3 can
honour it"*. B3 shipped as ADR-AG-015; the registry uses it; the given is honoured rather than
dropped. Three locks flipped and the invariant they protected — a noun's given must never silently
vanish — is now asserted the other way round: the parse must produce constraints, and the SHAPE
tests verify each one from the placed points at four seeds, because a figure that records «AB ∥ DC»
and draws something else is the very defect those locks existed to prevent.

**The subtle half: an unstated choice is a DISCRETE degree of freedom.** «משולש ישר-זווית ABC» does
not say which angle is the right one. [02c R14](02c-requirements-analytic.md) is explicit —
*"continuous ones sample and resample; discrete ones cycle"* — so a new constraint kind, `choice`,
carries the seats, and `resolveChoices` picks `options[seed % n]` **before the solve**. Measured:
seeds 0, 1, 2 put the right angle at A, at B, at C. Nothing below `evaluate` learns that discrete
freedom exists: the residual, the rank count, the satisfaction check and the provenance all see an
ordinary constraint, and the residual **throws** if it is ever handed an unresolved choice, because
silently measuring `options[0]` would draw one seat and call it the only one.

**«זווית B ישרה» is the student consuming that freedom, and it is why it shipped here.** The
collapse happens at M1: a stated constraint that `namesOption` one of a choice's options REPLACES
the choice. It reports `narrowed`, not `created` — the constraint count is unchanged and what moved
is the freedom, the same answer «a<13» gives after «a הוא פרמטר». For that comparison to be
structural rather than a special case, both sides are built by the same `rightAngleAt`, which sorts
its rays so the two spellings cannot differ.

**A vertex alone does not name an angle**, so that form lowers to a `right-angle` FACT and the rays
come from the shape the vertex belongs to, resolved at M1. Where there is no such shape, or more
than one, it is refused as `ambiguous-angle` and the message names the format that is unambiguous.
Picking a pair of rays would be ADR-052's cardinal sin in vocabulary form.

**A fourth list of shape nouns was found and removed.** The AREA rule carried its own
`משולש|מרובע|מצולע`, which is why «שטח הדלתון ABCD» was refused by a tool that had just drawn the
kite. It reads the registry now. Its noun and its vertices are both optional, and the two absences
mean different things: «שטח ABCD» needs no noun, while «שטח הדלתון הוא 24» — the operator's own
phrasing — names the figure by its noun, which is a **contextual reference** and therefore resolved
at M1 against the construction, unambiguous when exactly one shape answers to it and refused
(`ambiguous-shape`) otherwise. The polygon object now carries its `noun` so that question can be
asked at all — which [#1070](https://github.com/dcodish/geo_builder/issues/1070) needs too, since
«האלכסון הראשי» is meaningless until the figure knows it is a kite.

**A drift found on the way, and fixed positively.** Two places decided "does this fact name an
object?" by listing the kinds that do NOT, so every new id-less fact had to be remembered in both —
and `right-angle`, which carries an `id` for a different reason, was silently treated as naming an
object and collided with the point it merely mentions. `namesObject` states the list positively, so
a new fact kind is excluded until it says otherwise.

**Deliberately NOT in scope, and stated rather than quietly skipped:** a general angle value.
«זווית ABC היא 60» needs an angle RESIDUAL, which is its own mechanism; only 90° is understood, and
a stated value that is not 90 falls through rather than being quietly treated as a right angle.

**Consequences.** `src-analytic` 682 → 714 tests. Ten nouns ship: משולש · משולש ישר-זווית · משולש
שווה שוקיים · משולש שווה צלעות · מרובע · מקבילית · מלבן · ריבוע · מעוין · טרפז · טרפז שווה שוקיים ·
טרפז ישר-זווית · דלתון, with the English aliases pointing at the same rows.
## ADR-AG-032 — A CARRIER is not a stated object (#1076)

**Status:** accepted, 2026-09-15 · **Amends:** [ADR-AG-029](#adr-ag-029) (#1073) ·
**Round:** [#1067](https://github.com/dcodish/geo_builder/issues/1067)

**Requirements:** [02c](02c-requirements-analytic.md) §9 R56. **Design:**
[04c](04c-design-analytic.md) "A point on an object".

**Context — an operator RULING**, given while playing ADR-AG-029's own fix:

> when I say that נקודה B על הישר y=x - what i really mean is that B is (t,t). so I dont want the
> line itself drawn. if i want the line itself, I will say y=x

**What was measured.** The line was drawn, and — the detail that decided the shape of the fix —
both spellings mint the SAME id:

```
נקודה B על הישר y=x   → objects: curve-anon2j9w, B      scene: crv=1
y=x                    → objects: curve-anon2j9w         scene: crv=1
```

**Root cause: "the student stated this" was never recorded.** #1073 has to create the curve — a
point on a line needs a line to be on, and that 1-DOF carrier is the product's defining mechanism.
What it could not do is say *why* the curve exists. Every object in the construction reached
`figure.curves` and then the scene, so the two provenances were indistinguishable.

**Decision: `stated: boolean` on the curve object, set at the M1 boundary** (`apply.ts`) — the one
place that already decides new-object versus statement-about-existing, so this adds no decision
point. Required rather than optional, so a future rule that mints a curve without answering the
question is a **compile error** rather than an over-drawn canvas.

**Where each layer draws the line.** The carrier stays in `figure.curves`: the solve measures
`on-curve` against it, and the data panel names it as the provenance of the point that rides it —
ADR-AG-025's rule, that a value's home is where it came from. The RENDERER filters it. Undrawn is a
statement about the figure the student asked for, not about what the engine knows.

**Promotion is the branch that was most likely to be got wrong, and it was.** Because ids are
content-derived (ADR-AG-023), «y=x» after «נקודה B על הישר y=x» is not a new curve — it changes what
the existing one IS. Both of the surrounding mechanisms would have mishandled it:

- ADR-AG-020's structural absorption sees the same curve twice and answers «כבר ידוע»;
- ADR-AG-030's entailment test sees no new object, no new parameter and no freedom consumed, and
  answers «זה כבר נובע» — while the canvas visibly gains a line.

`applyFact` already had the vocabulary: promotion reports `created`, and the submit path reads that
answer before either test runs. **That is the same move #1045 made** — the answer existed and
nothing read it, for a third time in this tree. Promotion is one-way: a stated curve is never
demoted by a later carrier mention, because nothing the student said withdraws the request.

**The noun list gained the curve families in the same change**, and that was not scope creep — it
was this ADR's own claim failing measurement. The fix direction asserted the over-drawing happens
«for every carrier the on-object rule mints: «נקודה P על הפרבולה y=x²»», and measuring it showed
that sentence never reached the rule at all: the noun alternation held only `צלע|קטע|ישר`. A noun
missing from an alternation does not refuse — it falls through to `not-handled`, which reads to a
student as *"this tool does not do circles"*. `HE_EQ_OF` joined it too, since «המעגל שמשוואתו …» is
how the corpus writes a circle. None of the curve nouns is BOUNDED; `bounded` tests for
`צלע|קטע|side|segment` by name rather than for "has a noun", which is what kept the operator's
boundedness ruling intact through the widening.

**Consequences.** `src-analytic` 337 → 343 tests. «y=x²» is still refused `out-of-scope` — a
translated conic, outside ADR-AG-005's four-family scope, and an honest refusal rather than
anything this changed.
## ADR-AG-033 — The segment NOUN is optional, and naming a segment INTRODUCES its endpoints (#1074)

**Status:** accepted, 2026-09-15 · **Amends:** [ADR-AG-013](#adr-ag-013) (declaration vs reference) ·
**Round:** [#1067](https://github.com/dcodish/geo_builder/issues/1067)

**Requirements:** [02c](02c-requirements-analytic.md) §9 R57. **Design:** none (a rule's matcher).

**Context.** Operator, 2026-09-15: *"when there are 2 points like E and F defined, and I write EF,
i want the segment drawn"*. Measured: «הקטע EF» built `seg-EF`; «EF» was `not-handled`.

**Root cause: the matcher was written around the fullest phrasing the corpus shows.** That is now
the THIRD time — #1069 (the point-on-object nouns), #1072 («משוואת AB» without «הישר»), and here —
so the finding is not about segments. **A rule that requires its noun does not refuse the shorter
spelling; it declines it, and the sentence falls off the end of the chain into `not-handled`,
which reads to a student as "this tool does not know what a segment is".** The exam writes «EF»
constantly — "חשבו את EF", "העבירו את EF" — and a student transcribing givens writes what the page
writes.

**Why the position is safe without a discriminator.** A bare pair of names cannot be a coordinate
(no parentheses), an equation (no `=`) or a relation (no verb), and `parseShape` already sits second
to last. The one collision that matters — «AB = 5», where `AB` is a LENGTH — is decided by rule
order alone: every `=`-bearing rule lives in `parseConstraint`, which runs first. It is locked from
both sides.

**The second half is a ruling, extended.** A segment whose endpoints did not exist refused with
`unknown-reference`, and ADR-AG-013 argued for that explicitly: *"segments sit with the references…
a student who means to introduce them has a shape noun for it."* The operator's «הישר AB» ruling
(*"introduce them with dof"*) settles the general question the other way, and the principle it
states is sharper than the noun it was given about:

> **NAMING a thing introduces its points; REFERRING to one does not.**

«הקטע EF» names a segment. «M אמצע AB» names `M` while *referring* to `A` and `B`, and still
refuses — inventing them would place positions the question never gave (ADR-052). The evidence
that ADR-AG-013 had already drawn this line correctly and filed segments on the wrong side of it:
**every existing lock on that refusal is a midpoint test.** Not one flipped.

**Consequences.** «EF» on an empty figure introduces two 2-DOF vertices and draws the segment —
dof 4, the figure movable under «הציגו תצורה אחרת», exactly as «משולש ABC» behaves. `src-analytic`
343 → 349 tests.
## ADR-AG-034 — A QUADRANT is a region, and a region SEEDS rather than filters (#1071)

**Status:** accepted, 2026-09-15 · **Amends:** [ADR-AG-011](#adr-ag-011) (#1033, the half-axis) ·
**Round:** [#1067](https://github.com/dcodish/geo_builder/issues/1067)

**Requirements:** [02c](02c-requirements-analytic.md) §9 R58. **Design:**
[04c](04c-design-analytic.md) "A point on an object, and the carrier that holds it".

**Context.** Operator, 2026-09-15: *"I want to be able to place a point in a quartile: C ברביע
השלישי"*. Measured 0 of 5 phrasings.

**The easy half.** A quadrant is a pair of inequalities, so it is D7's SECOND kind — a branch
selector over configurations the solve produced — and not the third, a constraint that removes
freedom. **A point in the third quadrant is still a 2-DOF point**; it is simply not drawn anywhere
else. Lowering it to constraints would make the DOF cue lie, which is what D7 exists to prevent. It
needs no new mechanism: two `axis-side` selectors, the ones ADR-AG-011 built for «B על החלק החיובי
של ציר x», stated at once.

**The half that mattered was step 2 of the plan: *measure whether the seed search is adequate*.** It
is not, and the figure was dishonest about it:

```
A ברביע הראשון / B ברביע השני / C ברביע השלישי / D ברביע הרביעי
  selectorsOk : false        ← and NO fault reported
  A           : (5.76, -2.13)   ← the fourth quadrant, after the student said the first
```

`derive` advances the seed up to 24 times looking for a configuration where every selector holds.
One sign holds about half the time, a quadrant a quarter, **four quadrant points about one seed in
256**. The search exhausted, the figure was drawn anyway, and ADR-AG-008's "another configuration
may have it" kept it silent — correctly, by its own rule, because the figure still had freedom.

**Decision: a region selector SEEDS the point it names.** The sampled magnitude is kept and only the
sign is folded, so «הציגו תצורה אחרת» still moves the point *within* its region; the solve may still
move it afterwards if a constraint says so; and the post-hoc check is untouched and still has the
last word, so a contradiction («C(-3,4)» with «C ברביע הראשון») is still refused in either order.

**Why that is the right shape and sample-and-reject was not.** Rejection sampling is correct for a
BRANCH — which of two intersection points, ADR-AG-011's own case — where the candidates are
enumerable and the selector picks among them. It is the wrong tool for a REGION, where the answer is
a half-plane and the sampler can simply be *told which half*. The two had been conflated because the
first region selector to arrive (the positive half-axis) had only one of them, where a coin flip and
24 tries is plenty.

**Measured after:** 40 placements over ten seeds, none misplaced. And it improved ADR-AG-011's own
case, which is the sign that the generalisation was already implied.

**Consequences.** `src-analytic` 349 → 355 tests. The deferred half of #1069's note in `derive` —
whether an exhausted seed search on a figure WITH freedom should be reported — stays deferred and is
now much rarer, because the common case no longer exhausts anything.
