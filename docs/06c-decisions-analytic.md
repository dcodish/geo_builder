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

**Still open after this ADR:** the 471 ↔ 572 profile split (V4) · ~~whether an answer is ever revealed
after a wrong claim~~ — **closed by [ADR-AG-072](#adr-ag-072) §6**: there are no claims, so there is
nothing to reveal after one. (It was already largely moot under [ADR-AG-003](#adr-ag-003) D3′, since
values show behind the student's checkbox.)

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

## ADR-AG-037 — A diagonal is an OBJECT, and only some shapes have a PRINCIPAL one (#1070)

**Status:** accepted, 2026-09-15 · **Builds on** [ADR-AG-035](#adr-ag-035) (the registry) ·
**Round:** [#1067](https://github.com/dcodish/geo_builder/issues/1067)

**Requirements:** [02c](02c-requirements-analytic.md) §9 R62. **Design:**
[04c](04c-design-analytic.md) "The shape registry" (contextual references).

**Context.** Operator, 2026-09-15:

> trying to say אלכסוני המרובע נפגשים בנקודה O - not supported
> for a דלתון - i want to be able to say משוואת האלכסון הראשי or האלכסון המשני and give the equation
> **what i said about a kite should be true for other quads**

**Three gaps, and they are three different kinds of thing.**

**1 — One phrasing admitted where the corpus writes two.** «O מפגש האלכסונים במרובע ABCD» built;
«אלכסוני המרובע נפגשים בנקודה O» did not. They say the identical thing — the first is a NOUN
PHRASE naming the point, the second a SENTENCE with a verb — and D8's whole principle is that the
student types the exam's own sentence. One alternation over the existing `ROLES` table, so the
medians, the altitudes and the angle bisectors arrive with the diagonals rather than as three more
rules.

**The interesting part was Hebrew grammar.** «האלכסונים» standing alone becomes «אלכסוני המרובע» in
front of the shape — the construct state. The noun-phrase form only ever sees the free state, so the
table was written with it, and the verb form only ever sees the construct state. Both spellings are
one noun, and the table now says so. Measured: the same fix carries «תיכוני המשולש» and «גבהי
המשולש».

**2 — «האלכסון AC» is the LINE AC**, and the whole sentence already worked with a different noun.
So this is a noun the line rule did not accept, not a new construct — and adding it to `HE_LINE`
means the diagonal INHERITS [ADR-AG-026](#adr-ag-026) (the name is a geometric claim: `A` and `C`
are on that line) rather than re-deriving it. The lock compares the two constructions and requires
them identical.

**3 — The modelling decision: «האלכסון הראשי» is a fact about the FIGURE, not a naming convention.**
In a kite the principal diagonal is the axis of symmetry — the one joining the two vertices where
the equal sides meet. So the operator's generalisation holds **in one direction only**, and stating
that direction is the decision:

> **Every quadrilateral has two diagonals as objects; only some have a PRINCIPAL one.**

The registry row carries `principalDiagonal` where the noun distinguishes them, and a shape whose
noun does not — a plain «מרובע», a parallelogram, and notably a **rhombus**, whose diagonals are
unequal but whose NOUN says nothing about which is which — is refused by name
(`undistinguished-diagonal`), with the message naming the endpoint form that does work. Picking one
would assert a distinction the question never made, which is [ADR-052](06-decisions.md#adr-052)'s
cardinal sin in vocabulary form.

**Both new forms are CONTEXTUAL references, and they reuse #1049's resolution rather than inventing
one.** «אלכסוני המרובע נפגשים בנקודה O» names no vertices and «האלכסון הראשי» names no shape; both
are questions about the construction, so both are resolved at M1 and refused when the answer is not
exactly one object. That is now the third pair of this shape in the tree (`right-angle`, `area-of`,
and these), which is why `applyAll` exists: a resolved reference applies **the facts the spelled-out
sentence would have produced**, so the two phrasings cannot drift apart.

**A fifth hand-written list of shape nouns was found and removed.** `SHAPE_ARITY` in the parser knew
`משולש` and `מרובע` only, so «מפגש האלכסונים בדלתון ABC» could not be checked at all — the arity
guard #1042 added was silently inapplicable to every noun #1049 shipped. It reads the registry now.
Five lists, one table.

**Consequences.** `src-analytic` +12 tests.

## ADR-AG-038 — «מעגל O» names the CENTRE, and the circle stays anonymous (#1059)

**Status:** accepted, 2026-09-15 · **Settles an ambiguity in** [ADR-AG-005](#adr-ag-005) D6 ·
**Round:** [#1067](https://github.com/dcodish/geo_builder/issues/1067)

**Requirements:** [02c](02c-requirements-analytic.md) §9 R63. **Design:** none (a rule and a rule kind).

**Context — an operator ruling.** #1059 measured that «נתון מעגל O שמשוואתו (x-3)^2+(y-5)^2=25» — an
ordinary circle given by its equation — could not be stated at all, and raised the question it turns
on: is `O` the circle's NAME or its CENTRE? D6 says circles are named with the corpus's Roman-numeral
device or «המעגל שמרכזו M», and a bare letter is ambiguous between them. The operator, 2026-09-15:

> «מעגל O» means the center letter is O

**Decision: a Roman numeral NAMES the circle; any other letter is its CENTRE.** The two readings of
one sentence shape are told apart by which letter it is, which is what the corpus itself does. The
numeral branch runs first and the centre branch sees only what it declined, with an explicit
lookahead so `I` can never be read as a centre.

**The circle stays ANONYMOUS, and that is the load-bearing half.** It keeps the content-derived id a
bare equation would give it, so `O` is free to be the point. Naming the curve `O` as well would put
one student letter on two objects in the M1 id space — and the whole value of the ruling is that `O`
means one thing.

**The centre is a derived point whose parent is a CURVE**, which is new: every rule until now was
defined over points. So `parentsOf` reports none for it and `curveParentOf` reports the curve —
two questions kept apart rather than one list meaning two things, because the callers check
different properties (a point must be positional, a curve must be a curve).

**It does not contradict [ADR-AG-036](#adr-ag-036), it completes it.** #1024 draws EVERY circle's
centre and mints nothing, precisely so an unnamed centre spends no letter. Here the letter is the
student's own: they can then write «AO = 5», and the point appears in the data panel like any other
point they introduced. Named and unnamed centres are different things and get different treatment.

**Two things this did NOT need.** The misreporting #1059 was filed for — «מעגל O משיק לציר x» told
the student «לא הצלחתי לקרוא את המשוואה» about a sentence containing no equation — **was already
fixed**, by [ADR-AG-027](#adr-ag-027)'s Hebrew-tail discriminator (#1068), and re-measuring said so
before any code was written. And a curve that turns out to have no centre («מעגל M שמשוואתו y=2x»
fits a line) is reported by [ADR-AG-031](#adr-ag-031)'s vacancy predicate with no new message,
because that mechanism was already right.

**Still not supported, and stated rather than skipped:** «מעגל O» with no equation at all. That is a
circle with a free centre and a free radius — a 3-DOF free OBJECT — and it needs curve carriers,
which is a mechanism rather than a rule. [#1060](https://github.com/dcodish/geo_builder/issues/1060)
(axis tangency) depends on the same thing.

**Consequences.** `src-analytic` +7 tests.
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

## ADR-AG-036 — A circle MARKS its centre, and the mark is not the label (#1024)

**Status:** accepted, 2026-09-15 · **Round:** [#1067](https://github.com/dcodish/geo_builder/issues/1067)

**Requirements:** [02c](02c-requirements-analytic.md) §9 R61. **Design:** none (the renderer).

**Context — an operator ruling**, 2026-09-15:

> T15 - we need to draw the center. **in analytical geo the center is always important.**

and, filing the request:

> when drawing a circle, always mark the center and if center is known, put its values.

**The state it found.** The centre was computed, resolved into every `NumCurve`, and already printed
in the data panel as «מעגל I: O(3, 4), r = 3». The canvas drew the outline alone. So this was never
missing geometry — it was a value the tool had and did not show, on the one point of a circle every
student draws by hand and every corpus question names («ומרכזו בנקודה K»).

**Decision 1: the centre is a FEATURE OF THE CURVE, never a point object.** Minting a `GeoObject` for
it would spend a letter the student is about to use and put it in the M1 id space — the defect
[ADR-297](06-decisions.md#adr-297) fixed in the 2-D tree ("a decomposition never spends a student's
letter"). `SceneCurve` carries the mark; `buildScene` reads it off the resolved curve. It is drawn as
a small cross rather than a filled dot, so it cannot be mistaken for one of the student's own points.

**Decision 2: the MARK and the LABEL answer two different questions.** The mark says *"this circle
has a centre, here"*, which is true in every configuration. The label states a VALUE, which
[ADR-AG-003](#adr-ag-003) §2 permits only when the givens fix it. So `(x-3)²+(y-4)²=9` is marked and
labelled `(3, 4)`, while `(x-a)²+(y-4)²=9` is **marked and left unlabelled** — the same restraint the
panel already shows on the same figure, and the reason the two are separate fields rather than one.

**The gate is SUPPLIED, not re-decided.** Whether a value is knowledge is a question about the
construction across several configurations, and a `Figure` is one configuration — the renderer
cannot ask it. So `buildScene` takes an optional `SceneKnowledge`, and `App` passes the same
`knownCurve` the data panel uses. Two consequences, both deliberate: the canvas and the panel cannot
drift, and a caller that supplies no gate gets the mark WITHOUT a label rather than one sample's
coordinates printed as if they were given.

**Deliberately NOT here**, and stated rather than quietly skipped:

- the SYMBOLIC label `(a, 4)` the operator also asked for. It needs an `Expr` for the centre, and the
  centre is derived from NUMERIC conic coefficients — so it needs symbolic coefficient extraction,
  which is a mechanism, not a display change. Filed; the unlabelled mark is the honest interim, not a
  silent omission. **`exprText` ([#1023](https://github.com/dcodish/geo_builder/issues/1023)) was
  deliberately not built here either**: it would have had no caller, which is the pattern this tree
  has already produced three times (#1020, #1045, #1065).
- «נתון מעגל» with no equation, which is a 3-DOF free object and belongs to the carrier work.

**Consequences.** `src-analytic` 714 → 720 tests. The mark appears for every drawn circle, including
one the student stated bare; a CARRIER circle (ADR-AG-032) has no mark because it has no outline
either.
## ADR-AG-039 — A shape's vertices are DISTINCT, and that is a region rather than a given (#1077)

**Status:** accepted, 2026-09-15 · **Fixes a defect in** [ADR-AG-035](#adr-ag-035) ·
**Round:** [#1067](https://github.com/dcodish/geo_builder/issues/1067)

**Requirements:** [02c](02c-requirements-analytic.md) §9 R64. **Design:**
[04c](04c-design-analytic.md) "The shape registry".

**Context.** The operator reported «משוואת האלכסון המשני היא y=-x+2» as unsupported. It parses — that
half is [ADR-AG-037](#adr-ag-037) — and checking it showed the kite it was about had COLLAPSED, `B`
and `D` drawn at one point. Measured, and the diagonal turned out not to be the cause:

| figure | configurations that collapse |
| --- | --- |
| `דלתון ABCD` | **25 / 60** |
| `דלתון ABCD` + a diagonal's equation | **51 / 60** |
| `מקבילית ABCD` | 2 / 60 |
| every other noun | 0–1 / 60 |

**Root cause: the given every shape noun carries and none of them wrote down.** «דלתון ABCD» lowers
to `|AB| = |AD|` and `|CB| = |CD|`, and **both hold trivially when `B` and `D` are the same point**.
That is a genuine solution of the stated constraints and a smooth minimum, so the solver finds it.
The kite is the worst case because its givens are equalities between ADJACENT sides; a
parallelogram's are parallel relations, which a collapsed side cannot satisfy because a zero-length
segment has no direction — which is why it was nearly immune and why the defect hid.

A figure drawn that way contradicts the noun the student wrote, and said nothing.

**Decision: a `distinct` SELECTOR over the shape's vertices.** Not a constraint, for two independent
reasons: it consumes no freedom (a quadrilateral has eight degrees either way, and a DOF cue that
dropped here would be lying), and "not equal" is not an equation a least-squares solve can drive to
zero. It is a REGION — the configurations minus the degenerate ones — which is exactly D7's second
kind, and `derive` already re-seeds until the selectors hold.

**The threshold is relative to the figure's own span, and it was MEASURED rather than guessed.** An
absolute epsilon would be a magnitude this product never stated ([ADR-052](06-decisions.md#adr-052))
and would mean different things at different scales. A thousandth of the span was tried first and
still let through a parallelogram whose `A` and `B` were 0.009 apart on a figure spanning 5 — about
one pixel, which is a collapsed figure to a student however different the numbers are. **The
threshold is about what a reader can see, so it is set where seeing stops:** a hundredth.

**Measured after: every noun, sixty configurations each, zero collapses** — including the operator's
reported pair of lines.

**Why this was not caught by #1049's own locks.** They verified each noun's givens from the placed
points at four seeds, which is the right shape of test and found nothing: the kite's givens HELD in
the collapsed figure. What no test asked was whether the figure was a figure. The lesson is narrow
and worth keeping: **a constraint check cannot catch a degenerate solution, because the degenerate
solution satisfies the constraints.**

**Consequences.** `src-analytic` +6 tests.

## ADR-AG-040 — A measure stands on both sides, and a comparison is VOCABULARY (#1075)

**Status:** accepted, 2026-09-15 · **Generalises** [ADR-AG-025](#adr-ag-025) (lengths as values) ·
**Round:** [#1067](https://github.com/dcodish/geo_builder/issues/1067)

**Requirements:** [02c](02c-requirements-analytic.md) §9 R65. **Design:**
[04c](04c-design-analytic.md) "Lengths as values" — now measures.

**Context.** Operator, 2026-09-15: *"שטח ABEF גדול פי 3 משטח משולש CEF - is not supported"*.

**Measured before building, and it moved the diagnosis.** The obvious reading is that «ABEF» lacks a
noun. It is not that: «שטח המשולש ABC גדול פי 3 משטח המשולש CEF», with both nouns present, failed
identically. The area rule matched its head and handed the tail to the EQUATION parser, which
correctly refused it. Two separate things were missing.

**1 — A comparison is vocabulary, not mechanism.** «X גדול פי 3 מ-Y» means «X = 3Y», which
`length-eq` already expresses. So the words are REWRITTEN into the equation before any constraint
rule sees the line, and nothing downstream learns they exist. The consequence is the reason for the
shape: the comparison inherits areas as terms, parameters, the solve and the refusal, rather than
needing each of them again — and the lock asserts that the two spellings produce the IDENTICAL
construction. «גדול פי» and «גדול ב-» are a ratio and a difference: one word apart, two equations,
and the table says which is which.

**2 — An AREA is a term.** `LengthTerm` became `MeasureTerm`, a union of a point PAIR and a vertex
RING, so «שטח ABC» and «AB» are encoded the same way into the same expression. That is exactly what
ADR-AG-025's placeholder encoding was built to allow, one kind wider: `AB = 10`, `AB = AC`,
`AB + BC = 10`, `2·AB = 3·CD` and now «שטח ABC = שטח CEF + 4» are one constraint kind with different
trees. **The area token is matched BEFORE the length tokens**, and that order is the whole of it —
`ABC` would otherwise read as the length `AB` followed by a stray `C`.

**A refusal is the right answer too, and the operator's own case is one.** With his literal
coordinates `ABEF` has area 12 and `CEF` has area 6, so «פי 3» is false there and the figure says so.
A comparison is a given like any other.

**Consequences.** `src-analytic` +9 tests. «שטח הדלתון גדול פי 2 משטח המשולש ABC» works because the
noun resolution ([ADR-AG-035](#adr-ag-035)) and the comparison meet without either knowing about the
other.

## ADR-AG-041 — A carrier's information belongs on the POINT, and the panel shows SLOPES (#1078)

**Status:** accepted, 2026-09-15 · **Reverses the panel half of** [ADR-AG-032](#adr-ag-032) ·
**Round:** [#1067](https://github.com/dcodish/geo_builder/issues/1067)

**Requirements:** [02c](02c-requirements-analytic.md) §9 R66, R67. **Design:** none (the panel).

**Context.** Three operator reports on one screenshot, 2026-09-15, of the figure «משולש ABC» / «AB
מקביל לציר ה-x» / «BC מקביל לציר ה-y» / «B על הישר y=x»:

> **B should be something like (t,t)** showing we collapsed the y based on the x
> the part where it shows **-x+y=0 is meaningless** since the line is not really drawn and in any
> case **there is no way to know what it belongs to**
> in this case, **the data panel should show the slope of AB and BC**

**1 — A decision reversed, and the reversal is right.** ADR-AG-032 kept a carrier in the data panel
*"because it is the honest provenance of where B lives"*. Played, that reasoning does not survive:
**a curve row cannot say whose carrier it is.** «-x + y = 0» sat unlabelled in a list of curves, next
to no point, for a line the student never asked to see. It was not provenance, it was an orphan. The
information is real and the row was the wrong home; the flag now means one thing in both places —
undrawn on the canvas, unlisted in the panel.

**2 — The right home is the POINT.** `B = (x_B, x_B)` for `y = x`, `B = (x_B, 2·x_B + 3)` for
`y = 2x + 3`: the dependency made visible, which is what the operator asked for. It prints no VALUE,
so [ADR-AG-003](#adr-ag-003) §2 is untouched — it names a dependency, and it is strictly more honest
than the dash, which said *"unknown"* where the truth was *"unknown in one coordinate and determined
by it in the other"*. A point on a CIRCLE has no such closed form and keeps the dash; none is
invented. A point with one coordinate pinned reads the same way, which is «B נמצא על ציר ה-x» getting
`(x_B, 0)` for free.

**The letter is `x_B`, not `t`.** The operator wrote `(t,t)`; this product's convention for an
unpinned component is the point's own symbol ([#1032](https://github.com/dcodish/geo_builder/issues/1032)),
which the canvas already prints — and a shared `t` would say two different points on one line were
the same point. **Flagged for the operator**, since they named the other form.
**`exprText` was still not needed**: `knownCurve` hands back resolved numeric coefficients, so the
text is built from those. The printer keeps waiting for a caller that genuinely has an `Expr`.

**3 — The panel shows slopes**, and the operator's figure is the sharpest possible argument for it:
every length and every coordinate there is open, and the two SLOPES are the only things the givens
fix. A panel showing only lengths told the student *"nothing is known"* about a figure that knew two
things. A VERTICAL segment prints «אנכי» rather than nothing, because that is an answer and it is
exactly what «BC מקביל לציר ה-y» tells them. A square's slopes stay open — it may be rotated — which
is the guard that the row is gated and not computed.

**4 — A gate calibrated tighter than the solve, found on the way.** The slopes came out empty even
after the section existed. `isKnowledge` used `1e-7`, **finer than `SATISFIED_EPS`, the accuracy the
solve itself promises**, so a value produced BY the solve carried more wobble than the test allowed:
«AB מקביל לציר ה-x» gives slopes of `1.3e-8`, `-3.2e-7`, `-7.8e-9` across three configurations —
invariantly zero by any reading — and the spread of `3.2e-7` failed. The rule that fixes it is worth
stating: **a knowledge test cannot be tighter than the solve that produced the value, or it reports
the solver's own noise as freedom.** It remains relative, and a quantity that really moves with a
free DOF moves by orders of magnitude more; the lock asserts both directions.

**Consequences.** `src-analytic` +13 tests. This affects every gated row, not only slopes — lengths
and coordinates determined through the joint solve were being under-reported the same way.

## ADR-AG-042 — A coordinate about an existing point is a STATEMENT about it (#1046, #1040)

**Status:** accepted, 2026-09-15 · **Corrects the disposition of** [ADR-AG-018](#adr-ag-018) (#1038) ·
**Round:** [#1067](https://github.com/dcodish/geo_builder/issues/1067)

**Requirements:** [02c](02c-requirements-analytic.md) §9 R68. **Design:** none (the M1 boundary).

**Context.** Operator, 2026-09-15: *"how would i be able to say that **the x value of M is 3** if it
refuses to draw M again. **it should know i'm referring to the existing M**"*.

**#1038 was right about the duplicate and wrong about the meaning.** Two objects with one name was
the bug, and stopping it was correct. But `name-kind-clash` misdescribes what the student said: they
did not name a different object, they made a statement about this one — which is exactly what M1 is
for. `apply.ts`'s own docblock had reserved the slot: *"richer lowerings — a restatement becoming a
constraint that drives a free figure — attach to this same function when the constraint layer lands,
and nowhere else."* It has landed.

**ONE disposition, not two.** The issue proposed splitting on determinacy — a CLAIM to verify when
the point is determined, a CONSTRAINT to solve when it is not. The constraint kind covers both: on a
determined figure the solve has nothing left to move, the residual stays non-zero, and
[ADR-AG-028](#adr-ag-028) reports it as unsatisfiable, naming the statement. The verify half comes
free, with no second mechanism to keep in step with the first.

**The asymmetry is deliberate and is the interesting part.** «M מפגש התיכונים» then «M(3,5)» is a
statement; «M(3,5)» then «M מפגש התיכונים» is still a CLASH. Giving a derived point a coordinate says
where it is; naming a point and then saying it is the centroid defines it twice. A free VERTEX being
placed stays the substitution it always was, because two coordinates consume its two degrees exactly.

**[#1040](https://github.com/dcodish/geo_builder/issues/1040) came with it**, because it is the same
given with one component left open: «שיעור ה-x של M הוא 3» is «M(3, y)». `coord` has carried optional
components since V0 and 02c R31 ruled the form — it was ruled and never implemented, which is this
tree's most productive bug class for the fourth time.

**Consequences.** Two locks flipped, both asserting `name-kind-clash` for the statement direction,
and the invariant they protected — one name never holds two objects — is asserted unchanged beside
them. `src-analytic` +15 tests (with ADR-AG-043).

## ADR-AG-043 — A constraint is blamed where it is APPLIED, not where it was parsed (#1079)

**Status:** accepted, 2026-09-15 · **Round:** [#1067](https://github.com/dcodish/geo_builder/issues/1067)

**Requirements:** none (an honesty invariant already required). **Design:** none (internal to `fold`).

**Context.** Found by testing the FALSE version of ADR-AG-042's new sentence — and it turned out to
reach four sentence kinds that had already shipped today.

```
משולש ABC + זווית B ישרה      on an impossible figure → ACCEPTED, 0 faults, unsatisfied = 1
משולש ABC + זווית ABC ישרה     the same given, spelled out → REFUSED unsatisfiable
```

**Root cause.** `derive` blamed an unsatisfiable constraint through a map built from the PARSER's
facts, so a constraint synthesised inside `applyFact` was not in it and the fault was dropped by a
`continue`. The engine detected it every single time; only the reporting was lost.

**This is the cost of the resolved-reference pattern, which is a day old.** «זווית B ישרה»,
«שטח הדלתון הוא 24», «אלכסוני המרובע נפגשים בנקודה O» and «משוואת האלכסון הראשי» all build their
constraints at M1 because only M1 knows what they refer to. The pattern is right; the bookkeeping did
not follow it, and the result was **a figure shown as though it satisfied a given it does not** — the
one thing this product may never do.

**Decision: `fold` records which FACT added each constraint**, by comparing the construction before
and after each one. That covers a nested `applyFact` without knowing anything about it, so the next
resolved reference is attributed with nothing to remember — which is the property that matters, since
forgetting is exactly what happened here.

Two details it handles: a constraint can be REPLACED rather than appended (ADR-AG-035's choice
collapse), and the replacement belongs to the line that named the seat; and the constraint reported
for a choice is the OPTION, which is not itself in the list, so the choice holding it carries the
blame.

**The lock that matters most** asserts the two spellings of one given produce the SAME answer. They
diverged for a day without any test noticing, because every test was written for one spelling.

## ADR-AG-044 — The ask lane: two surfaces, ONE grammar (#1027)

**Status:** accepted, 2026-09-15 · **Round:** [#1067](https://github.com/dcodish/geo_builder/issues/1067)

**Requirements:** [02c](02c-requirements-analytic.md) R23–R27, already written — this implements them.
**Design:** [04c](04c-design-analytic.md) "The ask lane".

**Context.** Operator, 2026-09-15: *"data panel should have a data entry option to query sizes and
equations"*. 02c R23–R27 specified it before the product was built and V0 skipped it: the panel
counted objects and measured nothing.

**Decision: an ask is a MEASURE EXPRESSION**, which is the grammar [ADR-AG-040](#adr-ag-040) built
for «שטח ABC גדול פי 3 משטח CEF». So `AB`, `שטח ABC`, `AB + BC` and `2·AB` are all askable **because
they were already sayable**, and neither surface grows a vocabulary the other lacks. Two more
question shapes ride alongside because the panel already had the answers: a point's name asks for its
coordinates, and «משוואת הישר ℓ1» asks for its equation.

**The alternative was a question grammar of its own**, and it is worth saying why not: the two
surfaces would have drifted the way the three builders' ask boxes drifted before ADR-W-038 unified
the box itself. A student who can SAY «שטח המשולש ABC» and cannot ASK it has met an arbitrary wall.

**The honesty gate is the same gate.** An answer is a value, so it passes `isKnowledge`: the same
number in every configuration, or no number. Asking «AB» on a figure that has not fixed it gets an
open answer — which is itself worth knowing and is the truthful one.

**Three answers, not two.** *Not fixed by the givens yet* (the figure still has freedom), *cannot be
computed* (it is pinned and still unanswerable) and *I did not understand the question* are three
different situations, and a student told the wrong one looks in the wrong place. The wording is
chosen from the figure's own freedom rather than from the question.

**The lane itself is the SHARED one** (`shell/frame/AskLane`, ADR-W-038): always present, never
behind a button, never gated on a computation having run. The ANSWERS are this product's, which is
the split that keeps the shell free of product knowledge.

**`src-analytic/app` is classified `engine`** in BOUNDARIES.json, like its 2-D twin and for the same
reason: it decides what a question MEANS against the figure and which answers pass the gate. The
boundary guard caught the unclassified directory on its first run, which is the guard working.

**Consequences.** `src-analytic` +9 tests. The interactive half of R23–R27 now exists; what is still
missing from [#1027](https://github.com/dcodish/geo_builder/issues/1027) is the ANGLE row and the
distance-to-a-line ask, neither of which this grammar carries yet.

## ADR-AG-045 — A circle on a CENTRE POINT, and tangency to the axes (#1060)

**Status:** accepted, 2026-09-15 · **Round:** [#1067](https://github.com/dcodish/geo_builder/issues/1067)

**Requirements:** [02c](02c-requirements-analytic.md) §9 R70. **Design:**
[04c](04c-design-analytic.md) "A circle on a point".

**Context.** Operator, 2026-09-15: *"we need to support מעגל O משיק לציר x and all verses of the axis
tangency"*. Measured: 0 of 11 phrasings, and — as [ADR-AG-038](#adr-ag-038) recorded — the blocker
was never the vocabulary. **A circle whose centre is a POINT could not be represented at all.**

**Why the existing model could not hold it.** A `Curve` is an equation over the plane's variables
whose coefficients are expressions in PARAMETERS. That cannot say *"the circle centred at O"*,
because `O` is an object, not a number — and the corpus pins circles that way constantly
(«מעגל שמרכזו M», «מעגל המשיק לציר ה-x»). So this is the first curve whose shape depends on the
figure, and it is an OBJECT KIND rather than another `Curve` member: a `Curve` resolves from the
environment alone, and this one needs the placed points.

**`evaluate` turns it into an ordinary `NumCurve`** once the centre has a position, so everything
downstream is unchanged and inherits it for free: it draws, its centre is marked
([ADR-AG-036](#adr-ag-036)), the panel lists it, and a point can ride it as a carrier.

**The radius is a parameter named after the centre — `r_O`.** Deterministic, so it needs no
resolution against the figure and cannot collide with a student's own single letters, and legible in
the panel. It is **declared positive**, because [ADR-AG-009](#adr-ag-009) taught an undeclared
parameter to sample negative — right for a coefficient, wrong for a length.

**Tangency is one equation: the distance from the centre to the axis IS the radius.** That is the
whole feature, and the DOF arithmetic is the check on it — measured, not asserted:

| given | dof |
| --- | --- |
| «נתון מעגל O» | **3** — a free centre and a free radius |
| «מעגל O משיק לציר x» | **2** |
| «המעגל O משיק לשני הצירים» | **1** |

**The residual is UNSIGNED**, and that is a ruling rather than an implementation detail: a circle
below the x-axis touches it exactly as one above does, and demanding a sign would assert a side the
question never gave. The lock samples twelve configurations and requires BOTH signs to appear.

**«המעגל משיק לציר ה-x» is the third contextual reference** in a day — after «שטח הדלתון הוא 24» and
«אלכסוני המרובע נפגשים» — and it reuses their resolution rather than adding one: one circle makes it
unambiguous, none or several makes it a refusal.

**Consequences.** `src-analytic` +17 tests. What this does NOT yet do is tangency to a stated LINE
(«המעגל משיק לישר AB»), which is the same equation with a different distance and wants the direction
resolver; it is left out rather than half-built.

## ADR-AG-046 — An unfixed curve says its EQUATION, not a dash (#1023)

**Status:** accepted, 2026-09-15 · **Round:** [#1067](https://github.com/dcodish/geo_builder/issues/1067)

**Requirements:** [02c](02c-requirements-analytic.md) §9 R71. **Design:** none (a printer and a row).

**Context.** #1023 specified `exprText` as *"the enabling primitive behind two operator requests"* and
it was deliberately left unbuilt **twice** — [ADR-AG-036](#adr-ag-036) records the reason: a mechanism
with no caller is this tree's most repeated defect (#1020, #1045, #1065, and #1065's own docblock
warning about it). This is the caller arriving.

**Seen in a screenshot, not in a test.** The visual smoke of the day's work showed the panel's curve
list with two rows reading `—`: a parabola whose `p` is free, and a circle whose centre rides a
parameter. Both are curves **the student wrote down**, and the row threw the equation away.

**Decision: an unfixed curve row prints its own equation symbolically** — `y^2 - 2·p·x = 0` — and a
circle given by its CENTRE ([ADR-AG-045](#adr-ag-045)) prints the centre and radius it was stated
with, because that is how the student said it.

**It does not weaken the honesty gate, and the distinction is exact.** `y² − 2px = 0` states no
magnitude; it names the dependency. That is strictly more than the dash said — which claimed
*"unknown"* about something perfectly known in form — and strictly less than a number. It is
[02c](02c-requirements-analytic.md) P4's *"an under-determined figure is drawn, and its openness is
VISIBLE"* made legible instead of merely signalled.

**Parentheses by PRECEDENCE, not defensively.** `a·b + c` reads as written and `(a + b)·c` keeps what
it needs. A printer that brackets everything yields `((a)*(b))+((c))` — correct, unreadable, and not
what a student has in their notebook, which is the whole point of showing it. The lock round-trips:
printing, re-parsing and printing again must give the same text.

**Consequences.** `src-analytic` +7 tests. The other half of #1023 — a symbolic CENTRE label
`(a, 4)` on the canvas — still needs symbolic conic-coefficient extraction and is still not built.

## ADR-AG-047 — When a pin has TWO roots, the panel lists both (#1036)

**Status:** accepted, 2026-09-15 · **Round:** [#1067](https://github.com/dcodish/geo_builder/issues/1067)

**Requirements:** [02c](02c-requirements-analytic.md) §9 R72. **Design:** none (a row and a gate).

**Context.** Operator, 2026-09-15: *"if the area is given, **the options for point C** (on the data
panel) should be shown"*. «הבחן בין שני מקרים» appears about six times in the forty «lines and
points» exercises: **the exam is not asking for an answer, it is asking the student to notice there
are two.**

**Why it is not a weakening of [ADR-AG-003](#adr-ag-003) §2.** Neither member of the set is
knowledge — cycle the configuration and `C` moves, so printing one alone would be the cardinal sin.
**The SET is knowledge**: it is the same set at every seed, and cycling permutes which member is
drawn and changes the set not at all. The lock asserts that invariance directly, because it is the
whole justification.

**A correction to the issue's own design note, found by measuring.** It says *"the pin's root-find
already produces every root"*. It does not: the joint solve is a least-squares descent that finds ONE
root from one starting point. Measured on that very figure, `(3,3)` comes up at 19 seeds of 24 and
`(1,-5)` at 5 — **both roots are reached by different SEEDS**, not enumerated by one call. So the set
is collected the way `isKnowledge` collects its verdict, by evaluating the figure at several
configurations. The feature is what the operator asked for; the mechanism is not what the issue
assumed, and nothing new is solved.

That measurement also set the sample size: **24 configurations**, because the rarer root appears in
5 of them and a smaller sample can miss it — reporting one answer where there are two, which is worse
than reporting none.

**The value is read as a VECTOR, and that is load-bearing.** Asked per component the same figure
answers `x ∈ {1,3}` and `y ∈ {-5,3}` — four options for a point that is only ever `(1,-5)` or
`(3,3)`, two of them false. The point is the unit of the answer.

**A cap of four separates a set from a family.** A point free to slide takes a new value at almost
every seed; listing four of them would be a lie about the shape of the answer. Over the cap, the row
falls through to the dependency text ([ADR-AG-046](#adr-ag-046)) or the dash.

**The drawn member is marked**, which is what connects the row to «הציגו תצורה אחרת»: the panel states
the shape of the answer and the canvas shows which one is in front of you.

**Consequences.** `src-analytic` +6 tests. The point row now has four answers, in order of how much
the figure knows: the numbers · the option set · the dependency · the dash.

## ADR-AG-048 — An intersection is a point ON BOTH things (#1025)

**Status:** accepted, 2026-09-15 · **Round:** [#1067](https://github.com/dcodish/geo_builder/issues/1067)

**Requirements:** [02c](02c-requirements-analytic.md) §9 R73. **Design:** none (a rule over existing
constraints).

**Context.** [#1025](https://github.com/dcodish/geo_builder/issues/1025) asked for **clickable**
intersection dots: a shape's crossings with the axes and with other shapes, promotable to named
points. This delivers the capability in the product's own idiom — a SENTENCE — which is also what the
exam writes: «נקודת החיתוך של המעגל עם ציר ה-x».

**It needs no new mechanism, and that is the whole decision.** An intersection is a point that is ON
BOTH things, so it lowers to a `declare` and two incidences, each consuming one of the point's two
degrees of freedom. The joint solve finds a crossing; the DOF cue reports 0; nothing was added to the
engine.

**Modelling it as a DERIVED point would have been the wrong shape.** A derived point is one answer in
closed form, and **a line meets a circle twice**. As a constrained free point it has two solutions,
different configurations reach different ones, and [ADR-AG-047](#adr-ag-047) lists both in the panel —
measured on `(x-3)²+(y-4)²=25` against the x-axis, which gives exactly `(0,0)` and `(6,0)`. The two
features compose with nothing between them, which is the sign that both are the right shape.

**The operand vocabulary is `direction()`'s**, the same resolver the relations use, so «הישר AB»,
«הצלע AB» and «הישר l1» mean here what they mean there. A named CIRCLE is mapped alongside it, to the
id `matchCurve` mints — the same id, or the two rules would build two objects for one circle, which is
[ADR-AG-023](#adr-ag-023)'s defect. An operand it cannot read is refused as `bad-operand`, naming the
formats that work.

**What this does NOT do** is the clicking. Dots on the canvas, promotable by pointer, remain #1025's
own; they are a different interaction and want the selection mechanism #1048 needs too.

**Consequences.** `src-analytic` +7 tests.

## ADR-AG-049 — A conic is referred to by its KIND, and the corpus is why (#1057)

**Status:** accepted, 2026-09-15 · **Round:** [#1067](https://github.com/dcodish/geo_builder/issues/1067)

**Requirements:** [02c](02c-requirements-analytic.md) §9 R74. **Design:** none (a rule and an M1 branch).

**Context.** [ADR-AG-018](#adr-ag-018) removed the one-conic-per-kind limit and deliberately did NOT
decide how a student refers to one of two anonymous conics. #1057 held the question open and listed
the candidates — a display ordinal, letting the student name them, ordering by entry — and said the
corpus was the only real evidence.

**The corpus answers it, and the answer was already written down.** [docs/19](19-analytic-geometry-tool.md)
§4a, from the survey of twenty exams: *"**No exam in twenty carries two parabolas or two ellipses; at
most one of each per figure**"*. So there is no convention to find and none to invent. Inventing
«האליפסה הראשונה» would put the student in front of a phrase the exam never uses, which is exactly
what [ADR-AG-005](#adr-ag-005) D8 exists to prevent.

**Decision: the reference is by KIND — «האליפסה», «המעגל», «הפרבולה» — resolved at M1 against the
figure**, unambiguous when it holds one curve of that kind and refused when it holds none or several.
The refusal is per kind, so a circle and an ellipse together are two unambiguous references.

**The same survey showed the real gap was elsewhere.** «הנקודה A נמצאת על האליפסה» is listed as F2
vocabulary and the tool could not read it **at all** — every on-object form until now needed the
curve's equation or its name in the same sentence. The ambiguity #1057 worried about had never
arisen, because the sentence that would raise it did not parse. That is the fourth contextual
reference in a day and reuses the resolution the other three share.

**Two defects surfaced by measuring the new sentence, both older than it:**

- **An anonymous conic has no declared kind.** 02c R6 makes the noun optional *"because the fit
  already knows the kind"*, so «x²/9 + y²/4 = 1» carries none, and matching on the declaration alone
  found no ellipse in a figure that plainly had one. The kind is resolved from the FIT, against the
  probe environment `sameNumbers` already uses.
- **`on-curve` could not see a `circle-at`** ([ADR-AG-045](#adr-ag-045)). A point told to lie on a
  circle given by its CENTRE was not judged at all: the residual answered "cannot be told", the solve
  had nothing to pull on, and the point was drawn off the circle **in silence**. The resolver now
  knows both ways a curve can exist — and it needed the PLACED centre, which is why it takes the
  placement and not only the environment.

**Consequences.** `src-analytic` +7 tests.

## ADR-AG-050 — A shape NAMED in a given is drawn (#1080)

**Status:** accepted, 2026-09-15 · **Narrows** [ADR-AG-030](#adr-ag-030) ·
**Round:** [#1067](https://github.com/dcodish/geo_builder/issues/1067)

**Requirements:** [02c](02c-requirements-analytic.md) §9 R75. **Design:** none (a parser helper).

**Context — an operator ruling.** Looking at three points, an area given, and no triangle:

> in such a case, **the triangle should be drawn as the user mentions and refers to it**

**Root cause: the shape noun was read for its ARITY and then discarded.** «שטח המשולש ABC» lowers to
an `area` constraint over three ids and «במשולש ABC» to a `centroid` rule over three ids; in both, the
word «משולש» survived only long enough to check the vertex count. The figure was left showing three
loose dots for a question plainly about a triangle. It is [ADR-AG-019](#adr-ag-019)'s class turned
around — that was a noun the parser could not SEE, this is one it sees, checks, and throws away.

**Decision, and it generalises past the reported sentence: naming a shape in a given makes the shape
part of the figure.** One helper, called by every rule that takes a noun plus a vertex run, emitting
exactly the facts «משולש ABC» emits — so the ring is identical however it arrived, the id is
canonical, and stating it twice is absorbed by M1 rather than drawn twice. It carries the noun's own
GIVENS too ([ADR-AG-035](#adr-ag-035)): «שטח הדלתון ABCD הוא 24» is a kite AND an area, because that
is what the sentence says.

**It narrows ADR-AG-030, and the narrowing is correct rather than a regression.** «שטח המשולש ABC הוא
6» over three pinned points used to answer «זה כבר נובע»; it now DRAWS the triangle, so the line
changes the figure and is recorded. That is the entailment test working, not failing: what it asks is
whether the figure gained anything, and now it does. Where the shape is already stated, nothing is
gained and the answer is unchanged — asserted both ways. **The operator validated the old behaviour
and has been told.**

**A catalog row was found to be lying**, by the lock that compares a row's two halves: the Hebrew
«G מפגש האלכסונים במרובע ABCD» names a quadrilateral and the English *"the intersection of the
diagonals of ABCD"* named none, so one half drew a shape and the other did not. The English entry
gained its noun. The drift was there before and only became observable now.

**Consequences.** `src-analytic` +8 tests. A noun whose arity disagrees with its vertex run is now
refused in these sentences too, which is [ADR-AG-019](#adr-ag-019)'s rule reaching the rules it had
never been applied to.

## ADR-AG-051 — The concurrency VERB is an alternation, and the fifth one-spelling gate (#1081)

**Status:** accepted, 2026-09-15 · **Round:** [#1067](https://github.com/dcodish/geo_builder/issues/1067)

**Requirements:** covered by R62. **Design:** none (one alternation).

**Context.** Operator, 2026-09-15: «אלכסוני הדלתון **נחתכים** בנקודה O» — not supported. Measured,
«נפגשים» on the same figure worked perfectly: the kite resolved, the point was placed, and **the only
difference was one verb**.

**The finding is not about this verb.** [ADR-AG-037](#adr-ag-037) built the sentence around
«נפגשים», which is what the corpus examples in front of it used. This is the **fifth** time a gate in
this parser admitted one spelling of a sentence it fully understands:

| | the gate | the missing spelling |
| --- | --- | --- |
| #1069 | the point-on-object nouns | «על הפרבולה» |
| #1072 | «משוואת הישר AB» | «משוואת AB» |
| #1074 | «הקטע EF» | «EF» |
| #1070 | «האלכסונים» | «אלכסוני» — the construct state |
| **#1081** | «נפגשים» | «נחתכים» |

Each time the student is told the tool did not understand them, about a sentence it understands
completely. The cost of the fix is one alternation every time; the cost of the defect is a student
concluding the tool cannot do something it can.

**So the LOCK is the deliverable, not the verb.** It asserts the FORMS — every verb over every role,
fifteen combinations plus the English — and compares the CONSTRUCTIONS rather than the parses,
because what must agree is the figure. A sixth spelling now has a place to be added and a test that
will notice if it is not.

**Consequences.** `src-analytic` +18 tests.

## ADR-AG-052 — The honesty gate measures what the tool would DRAW (#1083)

**Status:** accepted, 2026-09-15 · **Round:** [#1067](https://github.com/dcodish/geo_builder/issues/1067)

**Requirements:** covered by [ADR-AG-003](#adr-ag-003) §2 — this makes it true. **Design:** none (internal).

**Context.** Operator, 2026-09-15: *"on this shape, point C should be able to be positioned"*, on a
full kite figure whose `C` the panel showed as a dependency.

**Measured, and the figure was not the problem.** `derive` returned the identical figure at every
seed — `C = (-4.9999998506756826, -5.0000000829500193)`, to seventeen digits — while `isKnowledge`
answered `false`. The reason:

```
raw evaluate(c, 0) → C = (-3.841,  -2.681)   selectorsOk = FALSE
raw evaluate(c, 1) → C = (-4.267,  -3.535)   selectorsOk = FALSE
raw evaluate(c, 2) → C = (-8.233, -11.467)   selectorsOk = FALSE
```

**Root cause: the gate and the canvas were looking at different figures.** `derive` advances the seed
until the SELECTORS hold, because a configuration that fails them is not a figure this tool shows.
`isKnowledge` and `knownOptions` called `evaluate` directly, and judged *"does this value vary?"*
across configurations that had been rejected before they ever reached the canvas. Of course it varied
there.

**Every gated row was affected** — coordinates, lengths, slopes, equations, ask answers — on any
figure whose configuration is chosen by a selector: a quadrant ([ADR-AG-034](#adr-ag-034)), a
half-axis, a betweenness ([ADR-AG-029](#adr-ag-029)), and the distinctness every shape now carries
([ADR-AG-039](#adr-ag-039)). The last of those made it far commoner than it had been.

**Decision: one sampler, `drawableAt`, shared by both gates** — the same seed advance `derive`
performs, memoised per construction because the panel asks per coordinate per point.

**A second defect, found in the fix.** With drawable sampling the option set answered `(-5,-5)` and
`(-5,-5)` — twice. Twenty-four drawable configurations had all found the same answer, spread over
`1.1e-5`, and the clustering used `SATISFIED_EPS`. That constant is **how small a RESIDUAL must be
for one configuration to satisfy its givens**; how far apart two independent least-squares descents
may land and still be the same solution is a different question with a larger answer. Hence
`SAME_VALUE_EPS`, measured from that spread rather than chosen.

**A limit worth stating rather than hiding.** Scanning two hundred configurations found a SECOND
drawable solution for the operator's figure — `C = (-9, -13)` — reachable about once in thirteen
drawable configurations and not at all within the twenty-four the gates sample. The tool therefore
reports `(-5, -5)` as knowledge, and there exists a configuration it did not find. **Sampling cannot
prove uniqueness**; it never could, and this ADR does not change that. What it changes is that the
sampling now looks at figures the student could actually see. The operator has been told, because if
this figure is meant to have two cases the search budget is the thing to raise.

**Consequences.** `src-analytic` +7 tests. Twenty-four drawable samples of that figure cost ~380 ms,
once per construction.

## ADR-AG-053 — The search starts where the FIGURE lives (#1085, #1084, #1082)

**Status:** accepted, 2026-09-15 · **Round:** [#1067](https://github.com/dcodish/geo_builder/issues/1067)

**Requirements:** covered by [02c](02c-requirements-analytic.md) R14 and R72. **Design:** none.

**Context.** Operator, 2026-09-15, on an exam question whose part א reads *"find the coordinates of
vertex A (**two possibilities**)"*: the panel said something wrong about `A`, and «הציגו תצורה אחרת»
was disabled. Three defects, and the deepest one decides what the tool can answer at all.

**1 — The search started in a fixed box, and that box chose the answers.** `freeCoord` placed every
free vertex in `[-6, +6]` before the solve, whatever the figure. The two answers are `(1,3)` and
`(11,13)`; the first is inside that box and the second is not. A least-squares descent goes to the
basin it starts in, so **the second answer was not rare, it was unreachable** — forty configurations,
forty times `(1,3)`.

The box was written when every test figure sat near the origin. It is a magnitude the product never
stated ([ADR-052](06-decisions.md#adr-052)) and, worse, one that **decides which answers exist**. The
search now starts in the box of everything the student has PLACED, grown by half its own size so it
can reach past the given points, and never smaller than the old default; a figure with nothing placed
has no scale of its own and keeps that default.

**Measured after: twenty configurations each.** The option row reads `(1, 3) | (11, 13)` — the exam's
«שתי אפשרויות», in the panel. It is also the quieter half of [ADR-AG-052](#adr-ag-052), where a second
configuration was reachable about once in thirteen tries: same cause, milder symptom.

**2 — «הציגו תצורה אחרת» was disabled at DOF 0.** The cue counts CONTINUOUS freedom, and a figure with
none can still have several configurations — which is what a discrete branch IS, and what this product
has had since the branch index existed. The exam asks for both answers and the control that would show
the second was greyed out. It is never disabled now: when another configuration exists it shows it,
and when none does it says so, which is more than a disabled button ever said.

**3 — The panel's mathematics is MathML**, through the SHARED renderer (`shell/math`, ADR-W-040) that
2-D and 3-D already use — not through an emitter of this product's own. One was written and then
**deleted**: measuring the shared component against the panel's real strings showed it handled every
one of them, and a second implementation beside a shared component is the fork the shell exists to
prevent. The only adjustment is at the display boundary, where `x_B` becomes `x_{B}`, because the
engine's symbol names are what its expressions are built from and must not change to suit a renderer.

**Consequences.** Both of the operator's reported figures now answer as the exam does.

## ADR-AG-054 — A crossing offers a SENTENCE (#1025), and a point owns its label (#1086)

**Status:** accepted, 2026-09-15 · **Completes** [ADR-AG-048](#adr-ag-048) ·
**Round:** [#1067](https://github.com/dcodish/geo_builder/issues/1067)

**Requirements:** [02c](02c-requirements-analytic.md) §9 R76. **Design:**
[04c](04c-design-analytic.md) "The ask lane" — the same split, a third surface.

**Context.** Operator, 2026-09-15: *"when a line we draw crosses another line, we need to see the
dashed circle allowing us to create that point"*. ADR-AG-048 built the SENTENCE for a crossing and
left the clicking open; this is the clicking.

**Decision: the dot does not mint a point — it writes the sentence.** Clicking adds
«P נקודת החיתוך של הישר AB עם הישר CD», exactly what typing it produces. The student sees what was
added, can rename it, and can delete it like any other given. That is [ADR-AG-044](#adr-ag-044)'s
rule on a third surface: **two surfaces, one grammar**, now three.

**The constraint that falls out of it is the interesting part.** A dot can only be offered where both
objects have a name the GRAMMAR can use — a segment by its endpoints, a named line, a named circle.
An ANONYMOUS conic has none ([ADR-AG-049](#adr-ag-049) closed that question by finding the corpus
never needs one), so its crossings get **no dot** rather than a dot whose click has nothing to say.
A limit worth having in the engine, where it is visible, rather than discovered in a click handler.

**Two more things a dot must not do**, both asserted: offer a crossing where a point already stands —
that is the tool suggesting the student repeat themselves — and offer the same crossing twice when two
sides of one figure meet there.

**And a collision, from two features that landed hours apart** (#1086). [ADR-AG-036](#adr-ag-036)
marks every circle's centre and labels it; [ADR-AG-038](#adr-ag-038) makes «מעגל O» name that centre
as a POINT, which draws its own label. Both drew at one position: «O, 5)», with the `(3` behind the
letter. **The point owns the label** — not by draw order, but because a point the student named
carries its own under [#1032](https://github.com/dcodish/geo_builder/issues/1032)'s
canvas-is-the-question rule, and a second label for one place could only repeat it or contradict it.

**Consequences.** `src-analytic` +8 tests. Straight-to-straight crossings only: a line meets a circle
twice and the sentence handles that (ADR-AG-047 lists both), but the DOT would have to say which of
the two it is — a second question, not needed for this to be useful.

## ADR-AG-055 — The tool joins the suite: a session, a panel that reads right, and the value behind the letter (#1087, #1088, #1089)

**Status:** accepted, 2026-09-16 · **Extends** [ADR-W-016](06w-decisions-workspace.md#adr-w-016) ·
**Corrects** [ADR-AG-054](#adr-ag-054)

**Requirements:** [02c](02c-requirements-analytic.md) §9 R77, R78, R79. **Design:**
[04c](04c-design-analytic.md) "The session, and the panel that shows it".

**Context.** Three operator reports, one week apart in the queue and one afternoon apart in fact, all
of the same shape: *this tool is not yet one of the four*.

1. *"I want the visualization of the tool to match that of the other tools. currently the buttons are
   not located in same locations and there is no load and save and stuff we have on other tools"*
   (#1087).
2. *"input panel needs to support bidi in the same way we have for the other tools"* (#1088).
3. *"the O should show the values. now it only shows O"* (#1089) — on a figure ADR-AG-054 had changed
   that morning.

**Decision 1 — a save holds the LINES, and a load is audited.** The session serializes to the ordered
sentence list plus the seed and the figure's name, inside `shell/save`'s envelope. There is no
position and no parameter value in the file, so a load re-parses the student's own words: the format
is a parser-drift net as much as a document, and a line that no longer builds can be reported **by
name**. Envelope refusals are kept OUT of the audit and routed to the error surface, where they name
which of the three reasons applies — another builder's file, a newer format, or not a save file —
because a generic "could not read" sends a student to fix a file that was read perfectly well.

The utility row is now save · load · copy image · save image · guide, the order the three older
builders had each grown by hand with nothing holding it. `shell/__tests__/utility-row-parity.test.ts`
holds it now, across all four — verified to fail on a swapped pair before being kept.

**Decision 2 — every surface that shows a line isolates its runs.** The segmentation was never wrong:
measured directly, `(x-3)^2+(y-4)^2=9` is ONE run, caret included. What was wrong is that this panel
passed **none** of the four seams its siblings pass (`boxDir`, `preview`, `previewDir`, `editDir`),
and that `InputArea`'s quick strip had no seam to pass anything to — it rendered `{cmd}` raw, where
its sibling component `QuickChips` has carried a `display` hook since [#751](06w-decisions-workspace.md#adr-w-029)
closed exactly this defect. 2-D and 3-D pass no `quickCommands` at all, so the half-closed class sat
unexercised until the first product whose every command is a Hebrew sentence carrying an equation.
**The fix is in the shared component**, with the lock written in #751's own shape beside #751's own
test — a class closed on one of its two paths is not closed.

**Decision 3 — a derived point's provenance is its PARENT's provenance.** ADR-AG-054 resolved the
overlapping labels at a circle's named centre by silencing the centre mark, and the operator's reply
identified what that cost: *"the issue last time was the O was located over the values so it hid
them"*. The mark going quiet took the number with it. Measured, the figure was contradicting itself —
`provenanceOf` reported O unknown while `knownCurve` printed the same circle's centre as `(3, 5)`.

The cause was one blanket line — *"a derived point's position comes from its parents, never from
givens about itself"* — written when every derived rule had POINT parents, where it is right: a
centroid over three free vertices IS placed by the solve, and a number there would assert a given the
question never gave (ADR-052). `circle-centre` is the one rule whose parent is a curve, a distinction
`derived.ts` already drew and provenance never learned. **This tree's most repeated defect, for the
seventh time: the model grew a case and a switch that enumerates cases did not.**

ADR-AG-054's rule is unchanged and was right — two labels must not overlap at one place. It was wrong
only about which of them carries the value.

**Consequences.** `shell` +8 tests (a new component seam, a new cross-product parity lock);
`src-analytic` +19. `row-parity.test.ts` still enumerates three products by hand and does not know
this one exists — filed as debt rather than widened here, because widening it means auditing every
assertion in it against a fourth product, which is its own piece of work. The parametric-circle centre
is conservative (both components open where `y` is really given) and the design doc says why.

## ADR-AG-056 — An equation is a name the grammar can use (#1092)

**Status:** accepted, 2026-09-16 · **Narrows** [ADR-AG-054](#adr-ag-054) · **Does NOT settle**
[ADR-AG-049](#adr-ag-049)

**Requirements:** [02c](02c-requirements-analytic.md) §9 R76 (amended). **Design:**
[04c](04c-design-analytic.md) "The session, and the panel that shows it" — the round-trip rule.

**Context.** Operator, 2026-09-15 (T34): *"attached image where a line crosses BC and there is no
clickable"*. Measured: with a triangle drawn, «נתון הישר l1: y=9» offers two rings and «נתון הישר y=9»
offers none, though both draw the same line across the same two sides.

**What ADR-AG-054 got right, and where its line sat wrong.** That ADR made the limit deliberate: a
ring may be offered only where the grammar can name both objects, because a click with nothing to say
is worse than no click. That reasoning stands. What it inherited was the assumption that an unnamed
curve has no referent — which came from [ADR-AG-049](#adr-ag-049), where the open question is that the
NOUN «הפרבולה» is **ambiguous between two** anonymous conics. **An equation is not ambiguous.** It
identifies exactly one curve, and a student writing «הישר y=9» is using the ordinary way to refer to
one. So the limit was drawn around *namelessness* when the thing that actually blocks a sentence is
*ambiguity*.

**The second half is the recurring defect.** Measured before writing anything:

```
'הנקודה P נמצאת על הישר y=9'             → builds, P = (-5.08, 9.00)   ✔
'P נקודת החיתוך של הישר AB עם הישר y=9'   → bad-operand                 ✘
```

The resolver from an equation to the anonymous curve **already existed and was already correct** — the
on-curve rule mints `curve-${anonIndex(...)}` for exactly this operand, guarded by the reserved-symbol
test that stops prose becoming a curve (#1068). `incidenceOn`, which the crossing rule uses, handled
axes, circles-by-numeral and `direction()`, and never reached it — while its own docblock stated the
contract it was failing: *"the naming forms `matchCurve` mints are mapped here to the same ids it
mints."* **This tree's most repeated defect, now for the eighth time** (#1020, #1045, #1065, #1023,
#1088): a mechanism that exists, is correct, and has a caller that does not reach it.

**Decision.** `CurveLabel` gains `eqSrc` — the equation as the student wrote it. It belongs on the
LABEL because for a curve with no other name **the equation is its name**, and it is the same string
`anonIndex` hashed into the id. That is what makes the offered sentence round-trip: it re-parses to
the SAME object rather than minting a second one for one curve (the ADR-AG-023 defect). Asserted
directly — the lock re-derives with the dot's own sentence and requires `figure.curves` to be
unchanged in length.

`incidenceOn` reads an equation operand, written kind-agnostically because `anonIndex` is: a parabola's
equation names its parabola exactly as a line's names its line. `words()` writes one for **lines only**
— a ring on an anonymous conic would need a noun for the sentence, which is ADR-AG-049's question and
is deliberately left open. Lines are the reported case and the corpus's constant one.

**Consequences.** `src-analytic` +10 tests, covering four spellings («נתון הישר y=9», the bare «y=9»,
the spaced «y = 9» that exercises `anonIndex`'s normalisation, and the English «the line y=9»), each
with its round trip. The two guards are locked with them: a named line still names itself by its NAME,
and prose containing an `=` is still `bad-operand` rather than a curve minted out of a sentence.

## ADR-AG-057 — A line CONSTRUCTED through a point (#1093)

**Status:** accepted, 2026-09-16 · **Copies** [ADR-AG-045](#adr-ag-045) (`circle-at`) ·
**Applies** [ADR-AG-026](#adr-ag-026)'s naming ruling

**Requirements:** [02c](02c-requirements-analytic.md) §9 R80. **Design:**
[04c](04c-design-analytic.md) "A circle on a point" — the same section, one dimension over.

**Context.** Operator, 2026-09-15: *"דרך P עובר ישר מקביל ל AB - not supported"*. Measured: the
grammar had no «דרך» rule at all, so this was a missing capability and was built as a feature rather
than patched in under a bug's banner (docs/22).

**Decision 1 — it is an OBJECT, not constraints on a curve.** The line does not exist until the
sentence creates it, and its equation is never given: it is fixed by a point it passes through and a
direction it copies. `line-at` is therefore the exact parallel of `circle-at`, and carries freedom the
same way — **none of its own**. The anchor's DOF are counted where the point lives; the direction is
read off an object the figure already determines. `evaluate` reads the placed anchor and the resolved
direction and emits the line in closed form.

The alternative was a curve with free coefficients plus an incidence and a parallel relation. It is
worse for the reason `circle-at` exists at all: there is no curve-with-free-coefficients kind, and it
would put two DOF into the solve only to remove them with two constraints, where the closed form is
immediate. **No new residual, no new solver code.**

`perp` is a flag rather than a second object kind, because nothing else about the construction
differs; the vector is rotated after resolution, which keeps `Direction` a pure reference to something
in the figure — "that object turned 90°" is not an object.

`dirVector` is the solver's own resolver, **exported rather than re-implemented**. It already knows
all three ways a direction can be named and already returns `null` for a degenerate one; a second copy
is exactly the drift the single `direction()` resolver exists to prevent.

**Decision 2 — the anchor is INTRODUCED, the direction is not.** The operator ruled (2026-09-15, #1066)
that «הישר AB» with A and B absent introduces them with DOF, because naming a line by two points is
naming *them*. «דרך Q» is the same act, so Q is declared and the line rides it. The DIRECTION operand
is not declared, and the asymmetry is the point: a direction is what a RELATION's operand is, and
relations do not introduce their operands. **Naming what a construction is about differs from naming
what it is measured against.**

**A pre-existing bug this uncovered.** `LINE_NAME` contains `[A-Z][0-9]?[A-Z][0-9]?` and the English
line rule carried `/i`, so **any two lowercase letters matched as a line's NAME**: «the line
**th**rough P is perpendicular to AB» was claimed by the curve rule, and the student was told their
equation («rough P is …») was unreadable. The file's own `TWO_POINTS` comment warns about this exact
trap — *"a case-insensitive whole-pattern would quietly start accepting `ab` as two vertices"* — and
the fix is the one it already prescribes: spell the English words' case out and drop the flag. It
would equally have swallowed «the line from A to B» and any other «line <two letters>…» sentence.

**Rule ORDER matters and is asserted.** «…מקביל ל AB» ends in a relation phrase, so `RELATION_HE`
matched the whole sentence with «דרך P עובר ישר» as its left operand and then refused an operand the
student had written perfectly — the swallowing defect #1059 records. The cure is the one the relation
rule's own docblock gives: a construction recognisable from a keyword no other rule uses costs nothing
to match early and removes the ambiguity entirely.

**Consequences.** `src-analytic` +23 tests, covering twelve spellings (both readings × Hebrew and
English × the inflection runs), the axis and named-line directions, the DOF conformance assertion, the
anchor-follows behaviour, idempotent restatement, and both guards on the uncovered `/i` bug. Two
catalog entries, deliberately axis-based so each builds standing alone as the catalog lock requires.

**Left open:** how a student REFERS to this line afterwards, and therefore whether its crossings offer
a ring. It has no equation to name itself with ([ADR-AG-056](#adr-ag-056)) and no letter. «הישר דרך
P» is the obvious candidate and the corpus has not been checked for it, so the honest default holds:
no name the grammar can use means no ring.

## ADR-AG-058 — The chrome is the SUITE's, not this product's (#1098, #1090)

**Status:** accepted, 2026-09-16 · **Completes** [ADR-AG-055](#adr-ag-055) · **Closes**
[#1090](https://github.com/dcodish/geo_builder/issues/1090)

**Requirements:** [02c](02c-requirements-analytic.md) §9 R81. **Design:**
[04c](04c-design-analytic.md) "The session, and the panel that shows it".

**Context.** Operator, 2026-09-16, with 2-D, 3-D and analytic screenshots side by side: *"I wanted the
analytics to look like the other tools with all aspects"*. ADR-AG-055 delivered the SESSION actions
in the suite's order and stopped there; seven differences remained, measured against the source.

**The first one was ours, and the component had predicted it.** `shell/frame/FigureName`'s docblock
carries the operator's B3 ruling — *"the name is CENTERED ABOVE THE CANVAS"* — and warns that a field
standardized in two products *"drifts a third time"* otherwise. ADR-AG-055 mounted it in the INPUT
zone, **drifting it a fourth, in the change whose whole purpose was parity.** A one-line move; the
lesson is that reading a shared component's contract is part of mounting it, and the lock now asserts
the zone rather than trusting the next author to read.

**Three more were one omission.** `shell/frame/figureRow` states the row contract in its own docblock
— `[accent alternatives] … extras … [spacer] … [subtle undo/redo/clear]` — and exists because *"Same
members, three implementations."* This builder never imported it, so it was the fourth: its actions
floated over the canvas corner, clear-all sat on the fact-list footer (the correction #739 had
already made for complex), and the alternatives button wore no accent.

**One was NOT a shared-style bug, and measuring is what showed it.** The canvas cluster sat left here
and right in the siblings. `canvasClusterStyle` uses `insetInlineEnd`, which under this product's RTL
page resolves LEFT — and 2-D wraps its cluster in `dir="ltr"`. So the fix is one attribute here, not
an edit to `canvasControls.ts`, **which would have moved the cluster in all four products.** The
temptation to fix a shared style from one product's symptom is the drift this file keeps recording.

**Decision — undo/redo, and why it is cheap here.** The session IS the ordered line list and the
figure is derived from it (ADR-AG-055), so there is no position, parameter value or solver state to
roll back: a history entry is a list of strings plus the seed, and an undone figure is **re-derived**
rather than restored. `zundo`'s `temporal` wraps the store with a partialize slice of `lines + seed`
— the seed because it is the configuration the student SAW (2-D's E5/STO-5 lesson), and nothing else,
so an error, a notice or a figure name never becomes a step to undo. Availability is read from
`pastStates`/`futureStates`, not from the line count: **clearing the canvas is itself undoable, and a
count-based test would grey out the one press that recovers it.**

**And the lock found a defect in a sibling.** Widening `row-parity.test.ts` from three products to
four — which is #1090's fix, done here rather than left as the hole that let this drift happen —
immediately failed for **complex, which has no undo/redo either** ([#1099](https://github.com/dcodish/geo_builder/issues/1099)).
It is recorded as a NAMED, self-expiring exception plus a companion assertion that complex is the only
one, so the day it gains a history that test fails and the exception is deleted with it. Weakening the
check to make the suite green would have hidden a real defect in a shipped product — the whole reason
the file exists. Fixing complex here would have meant a sibling edit inside an analytic chrome change.

**Left for a ruling:** the empty state. «מה בונים היום?» is the siblings' wording; this product says
«התחילו לשרטט — הבחינה לא מדפיסה שרטוט», which is a thing only this tool needs to say. Changing a
voice is not a parity defect, so it waits.

**Consequences.** `src-analytic` +10 tests (the history, and what it deliberately does not record);
`shell` +4 (the widened parity lock and the sibling gap it found). Verified in a real browser, not
only in tests: the name centres above the canvas, the cluster sits right, undo takes a row away and
redo brings it back, zero console errors.

## ADR-AG-059 — A parenthesised power is maths too (#1097)

**Status:** accepted, 2026-09-16 · **Completes** [ADR-AG-053](#adr-ag-053)'s MathML ruling ·
**Changes** `shell/math`

**Requirements:** [02c](02c-requirements-analytic.md) §9 R82. **Design:** none (shared renderer).

**Context.** Operator, 2026-09-16: *"input panel is not mathml"*, with a screenshot of the givens
list showing «נתון מעגל O שמשוואתו (x-3)^2+(y-5)^2=25» as raw typed text. The earlier ruling
(*"data panel should be in mathml"*) had been applied to one panel and not the other.

**The measurement that changed the fix.** The obvious change — render the rows through `MathText`,
as the data panel does — **would have shipped something that did nothing for the reported line.**
Measured before writing any code:

```
mathHtml('… y^2=54x')          → <math><msup><mi>y</mi><mn>2</mn></msup></math>=54x   ✓
mathHtml('… (x-3)^2+(y-5)^2=25') → (x-3)^2+(y-5)^2=25   — untouched                     ✗
```

`SUP` was `[A-Za-z0-9](?:²|\^\d+)`: **a single-character base only.** A parenthesised base is the
commonest form this product sees — every circle equation is `(x-a)^2+(y-b)^2=r^2` — so the panel
would have gained a renderer that still printed `^2` for the exact sentence the operator sent.

**Decision.** The defect is in the SHARED renderer and is fixed there: `SUP` accepts a flat
parenthesised group, and `baseML` renders its contents as real maths (identifiers, numbers and
operators, parentheses as `<mo>`) rather than escaping the group as one blob. Flat on purpose —
`[^()]+` covers the corpus, and inventing a parser to typeset nesting nothing writes is how a
renderer acquires bugs nobody can reproduce; a nested group is left alone rather than half-rendered,
and that is asserted.

**Isolate first, then typeset.** The bidi runs are decided by `shell/bidi` (the seam #1088
vindicated) and `mathHtml` escapes everything that is not a maths token, so the isolate characters
ride through untouched and the two mechanisms compose rather than fight. Asserted directly: the
output still carries LRI/PDI, and stripping tags and isolates round-trips to what the student typed.

**Presentation only.** `editValueOf` still returns the raw line, so ✎ shows what was typed rather
than a re-serialisation — the rule `QuickChips`' `display` follows and #1088 extended to the strip.
Held by a source-scan, because that is the property a refactor breaks silently.

**Consequences.** `shell/math` gains one token form, which every builder inherits: 2-D and 3-D write
`(a+b)^2` too. `src-analytic` +10 tests. Verified in a browser: two `<math>` elements in the givens
list, no literal `^2` left, no console errors.

## ADR-AG-060 — The canvas is a CAMERA over the plane (#1094)

**Status:** accepted, 2026-09-16 · **Extends** [ADR-W-024](06w-decisions-workspace.md#adr-w-024)

**Requirements:** [02c](02c-requirements-analytic.md) §9 R83. **Design:**
[04c](04c-design-analytic.md) — `src-analytic/render/view.ts` carries the reasoning.

**Context.** Operator, 2026-09-16: *"the canvas has no zoom and move features"*. Measured: the shared
`+ − ↺` cluster and nothing else — **no pan at all**, and zoom only in 1.25× steps about the
figure's centre, recomputed on every derive, so a student could not look at a corner of their own
drawing and the view jumped whenever the extent changed.

**Decision — box arithmetic, NOT a `<g transform>`.** 2-D pans and zooms with a transform layer over
a fixed projection, which is right there: the drawing is the content and there is no background.

**This canvas is a COORDINATE SYSTEM.** Its axes, grid and tick labels are content. Under a transform
they would scale with the drawing — the grid coarsening, the labels growing, «10» ceasing to mean
ten. So the view moves the WORLD BOX and re-projects. The capability is 2-D's; the implementation
deliberately is not, and **a naive port would have shipped a coordinate plane whose numbers lie.**

`render/view.ts` is pure arithmetic over a box — no React, no DOM — so the two properties that make a
canvas a camera are asserted directly rather than through a rendered page: a drag keeps the world
point under the cursor under the cursor, and so does a wheel zoom. `centre: null` means "follow the
figure", which is the load-bearing part: a drawing that grows stays framed until the student moves the
view, and is theirs afterwards — a view that re-centred on every derive would be unusable while
typing.

The wheel listener is registered NATIVELY and non-passively: React 18 attaches `onWheel` as passive,
so `preventDefault` is a no-op and the page scrolls behind the canvas (2-D's F5/REN-2 lesson).

**A correction worth recording.** This work was held back for half a day as "NOT READY" because
screenshots after a pan showed stray blue marks beside the y-axis. Root-causing it properly found
**nothing wrong with the product**: the DOM carries correct `<text>` labels with correct characters,
widths and computed fills on this branch AND on `main`; and asking the browser to rasterise its own
SVG and reading the pixels around the label returns **0 blue pixels and 24 ordinary dark ones**. The
artifact lives in Playwright's element-screenshot capture path, not in anything a student sees.

Two lessons, and the second is the useful one: a screenshot is evidence of what the *capture* did, not
only of what the page renders — and **"I cannot explain it" was the right reason to hold, even though
the defect turned out not to exist.** Shipping on the guess that it was harmless would have been
right by luck; the measurement is what made it right on purpose.

**Out of scope, deliberately:** touch pinch-zoom. It is a separate gesture with its own
pointer-tracking hazards (2-D's comment records a second finger corrupting the pan), and the operator
works on a desktop.

**Consequences.** `src-analytic` +15 tests on the pure arithmetic, including both camera invariants
across repeated steps, the auto-centre arming, the rendered-size measurement, and the shared clamp.
The `+`/`−` buttons keep their old behaviour exactly — they zoom about the current centre — so
nothing the operator already had changed.

## ADR-AG-061 — A conic's crossings are offered too, and the ring you click is the point you get (#1096)

**Status:** accepted, 2026-09-16 · **Overturns** [ADR-AG-054](#adr-ag-054)'s conic limit ·
**Closes** [ADR-AG-049](#adr-ag-049)'s open question · **Extends** [ADR-AG-056](#adr-ag-056)

**Requirements:** [02c](02c-requirements-analytic.md) §9 R76 (amended again). **Design:**
[04c](04c-design-analytic.md) — `engine/crossings.ts`.

**Context.** Operator ruling, 2026-09-16, on play case T49: *"i dont agree. I think we need to offer
the rings in this case too"*. T49 had been written to assert the OPPOSITE — that an anonymous conic
gets no ring — and he overruled it.

**It extends a principle rather than contradicting one.** ADR-AG-056 had already found the right
boundary for lines: **what blocks a sentence is AMBIGUITY, not namelessness.** ADR-AG-049's open
question is that the NOUN «הפרבולה» is ambiguous between two anonymous parabolas — but «הפרבולה
y^2=54x» names exactly one curve. ADR-AG-054 drew its limit around the wrong property, twice; this
finishes moving it.

**Two halves, and the second is what makes the rings honest.**

*The geometry.* `crossingsOf` did straight × straight only. It now also does straight × conic, in
closed form: the line is parametrised as `P0 + t·d`, which removes every vertical/horizontal special
case, and substituting into each canonical form (`NumCurve` admits only three) leaves a quadratic in
`t`. A near-zero leading coefficient is the genuinely linear case — a line parallel to a parabola's
axis meets it once — and is solved as such rather than divided through, which is where a naive
quadratic draws a ring at the edge of the world.

*Which solution did they click?* A line meets a conic TWICE, so both rings carry the SAME sentence,
and [ADR-AG-047](#adr-ag-047) already lists both solutions with «הציגו תצורה אחרת» moving between
them. **Clicking the left ring and landing on the right point would break the contract rings exist
for.** So the click carries WHERE it was, and `seedShowing` picks the configuration that puts the new
point nearest there. This invents no given: both roots are valid, the student can still cycle, and
choosing which to show FIRST is exactly what the branch mechanism is for (ADR-052 permits a starting
choice so long as it can change). **The operator was away and had asked not to be consulted, so this
is recorded as the session's call, not his ruling.**

**A latent bug it surfaced.** A named circle's stored label is «מעגל I», not «I», so `words()`
prepending the noun produced «המעגל מעגל I» — which the grammar refuses. It could not surface while
circles were excluded from the crossing search, and did the moment they were let in.

**And one case deliberately left refusing.** A TANGENCY offers no ring. Measured, the sentence a ring
would add there returns `unsatisfiable` while landing on exactly the right point — the two incidences
are degenerate at a touch. **A ring whose click fails is worse than no ring**, which is ADR-AG-054's
principle and outranks the ruling to offer more rings; that ruling was about anonymous conics, not
about tangency. Filed as [#1100](https://github.com/dcodish/geo_builder/issues/1100) rather than
papered over, with the note that the refusal itself looks wrong and is worth fixing on its own.

**Consequences.** `src-analytic` +14 tests. **Two existing assertions were REWRITTEN, not deleted** —
the one ADR-AG-054 wrote and the one #1092 left in place — each now recording that the rule changed
and why, so the log reads as a decision reversed rather than a test quietly dropped.

## ADR-AG-062 — The formula behind a measurement, with this figure's numbers in it (#1053)

**Status:** accepted, 2026-09-16 · **Delivers** docs/19 §4b's deferred R1 (the derivation trace),
in its first concrete slice

**Requirements:** [02c](02c-requirements-analytic.md) §9 R84. **Design:**
`src-analytic/engine/techniques.ts` carries the reasoning.

**Context.** Operator, 2026-09-15: *"when I select to see a distance or an equation of a line, I want
the relevant formula to be shown on screen, so we don't just show the result — we show what to use
to get to this result."*

**The level is the operator's ruling.** The issue offered three and asked; he answered *"1053 - yes -
b is correct"*:

  1. the formula alone — `d = √((x₂−x₁)² + (y₂−y₁)²)`
  2. **the formula with THIS figure's values substituted** — `d = √((4−1)² + (5−1)²)`
  3. the arithmetic worked through — `= √25 = 5`

(3) is the tool doing the student's homework. (2) is where the teaching is: seeing *their* numbers in
the general form is the step a student actually gets wrong, and it is still not the working that
earns the marks. **A test guards the boundary** — a substituted trace must contain the figure's own
numbers and must NOT contain the answer, nor arrive with the subtractions already collapsed. Level
(3) is one "helpful" line away at all times, and that line is now a failing test.

**Authored, not generated.** docs/19 §4b specified the substrate when it deferred this: *"an authored
technique table … teacher knowledge, not engine knowledge"*. The engine computes a distance from a
residual and a solve, not from `√((x₂−x₁)²+(y₂−y₁)²)`; a trace derived from the code would be correct
and **unlike anything in the student's notebook**, which is the one thing it must not be.

**Only what a surface can ask for.** The table holds TWO entries, and that is deliberate. The issue
names four moves; `point↔line distance` has no way to be requested until #1048's click-to-measure,
and `slope` is shown in the panel rather than asked. Authoring entries for rows nobody can request
would be writing a teacher's words against a guess. The two here are exactly the two the operator
named and the two the ask lane already accepts.

**What gets NO trace, and why each is right.** A point's coordinates — they are READ off the givens,
not computed. A compound expression like «AB + CA» — arithmetic the student assembled, not one named
move. An area — no entry in the table. A line GIVEN by its equation — there is no technique behind a
given, and printing a derivation for one would be the tool explaining the student to themselves. And
an answer the figure does not determine: no row, nothing to explain — which is also docs/19 §9's
boundary, *"it must not answer 'how COULD you reach X'"*, that being a planner.

**A vertical line** says the formula does not apply rather than dividing by zero, and a negative
coordinate is parenthesised — `5 − (−3)` — because `5 − −3` is the commonest way a substituted
formula stops looking like the one in the student's notes.

**Consequences.** `src-analytic` +13 tests, six of them about what does NOT get a trace and three
about the level holding. Rendered through the same MathML path as everything else numeric (#1097) and
styled quieter than the answer, because it is the method and not the result. Verified in a browser:
«AB» shows `d = √((4 - 1)² + (5 - 1)²)` under `AB = 5`, and «משוואת הישר AB» shows the two-point
form under its equation.

## ADR-AG-063 — A press is not yet a drag (#1101)

**Status:** accepted, 2026-09-16 · **Corrects** [ADR-AG-060](#adr-ag-060) · **P1, live in production**

**Requirements:** none (behaviour restored). **Design:** none (a correction to ADR-AG-060).

**Context.** Found while building #1048, by clicking canvas objects that ought to have responded.
Measured on `main`:

```
MAIN (has #1094 pan): rings=2  sentenceAdded=false
```

The dashed crossing rings (#1025, #1092) still DREW and no longer RESPONDED. The operator had
validated them in T46–T48; ADR-AG-060 landed afterwards and broke them, and the break shipped in
`prod/2026-09-16-2`.

**Root cause.** ADR-AG-060's pan handler took `setPointerCapture` on **press**. Capture retargets the
whole gesture to the capturing element, so the `click` that follows never reaches the child carrying
the handler. Every press became a pan, including presses that never moved.

**A ring that looks clickable and is not is worse than no ring at all** — the tool invites an action
and then ignores it, which is the same dishonesty as printing a number it does not know.

**Decision.** Capture is deferred until the pointer has actually travelled (`DRAG_SLOP = 4px`). Below
the threshold the gesture stays a click and passes through to whatever is under it; above it, the pan
begins exactly as before. Nothing about panning changes for anyone who was panning.

**Why ADR-AG-060's own verification missed it, which is the part worth keeping.** That work drove a
pan and a wheel zoom in a real browser and asserted the view moved — and it did. **Nothing asserted
that a click still reached the objects underneath**, because those objects belonged to a feature that
already worked and was not being changed. The lesson is narrow and practical: *when a new
interaction layer is added over an existing one, the thing to test is not the new behaviour but
whether the old one survived.* The lock therefore asserts both together, because either alone passes
while the other is broken.

**Consequences.** `src-analytic` +5 tests. Source-scan rather than rendered-DOM, since this tree has
no jsdom and the property at stake is a discipline about WHEN capture is taken — which reads clearly
in the source and is exactly what a future edit would undo. One of those assertions initially read
past its own subject (a fixed-width slice spilling into the next handler) and judged the wrong code;
the helper now bounds each handler at the next prop.

## ADR-AG-064 — The drawing surface is MEASURED, and the chrome is the suite's (#1103, #1106, #1105, #1107)

**Status:** accepted, 2026-09-16 · **Withdraws** [docs/28 §D9b](28-product-unification.md)'s compact-strip half

**Requirements:** none (conformance — 02c already promises the suite chrome). **Design:**
[28 §D9b](28-product-unification.md) amended; the D1 Workbench contract gains an inside-the-card rule.

**Context.** Four reports from one side-by-side comparison with 2-D, all of them *"make it look like
the other tools"*. They are one decision because they are one cause: **the D1 contract locks the CARD
and stops at its edge**, so everything the surface does inside the card drifted per-product and nothing
measured it.

| # | symptom | measured |
| --- | --- | --- |
| 1103 | the canvas letterboxes | 420px of a 1094px card dead, drag tracking the cursor at **0.82×** |
| 1106 | no clear-all button | the ADR-W-023 row rendered **51px past a page that cannot scroll** |
| 1105 | example chips never leave | analytic is the **only** product that passes `quickCommands` |
| 1107 | clear-all leaves the draft | #146's defect, reintroduced once per new product (now 4) |

**Decision.**

1. **The scene is built at the MEASURED viewport**, via a `ResizeObserver` on `viewportRef` — the same
   element `view.ts` reads for pointer arithmetic, so the projection and the tracked rect cannot
   disagree. A nominal 720×720 `viewBox` under `xMidYMid meet` letterboxes **by construction** at every
   window size, and the 0.82× drag was that same ratio: the promise *"the world point under the cursor
   stays under the cursor"* was arithmetically unreachable. 2-D and 3-D have always measured.
2. **`flex: 1` + `minHeight: 0` on the viewport**, never `height: 100%` — in a fixed-height flex column
   `100%` resolves against the CARD, so one child claimed all three children's space. `minHeight: 0` is
   load-bearing: without it a flex item will not shrink below its content.
3. **No compact chip strip.** D9b's second half is withdrawn rather than the code corrected, because
   analytic was the only product that ever built it.
4. **Clear-all clears the SESSION**, not just the store — drafts and the ask lane with it. The fix has
   lived as a per-product hand-written list since #146 and has now been reintroduced twice; the list is
   the defect, and a conformance probe is what stops a fifth product repeating it.

**A contracted control that is invisible is not satisfied.** #1106 is the sharpest of the four: the row
was *present in the markup* and unreachable on screen, so every structural test passed. "Rendered" is
not "reachable", and only a positional assertion can tell them apart.

**Consequences.** The analytic canvas fills its card and the drag tracks 1:1. #1110's general
stale-answer fix stays open — only the clear-all corner is taken here.

## ADR-AG-065 — Two crossings of one pair are two points, and the SENTENCE says which (#1113)

**Status:** accepted, 2026-09-16 · **P1, was live in production** · **Extends** [ADR-AG-047](#adr-ag-047), [ADR-AG-056](#adr-ag-056)

**Requirements:** [02c](02c-requirements-analytic.md) §9 — an intersection sentence may name WHICH
crossing. **Design:** none (internal to `engine/crossings.ts` + the selector family).

**Context.** Operator, playing T16: *"somehow i got 2 points with different names on the same location
which should never happen"*. Measured: four ring clicks put **four letters on (0.9194, 1.8388)** while
the second crossing at (3.4806, 6.9612) never received a point at all. Shipped in `prod/2026-09-16-3`.

**Root cause.** An intersection is not a derived point — it is a `declare` plus two incidences, and the
joint solve finds *a* crossing ([ADR-AG-047](#adr-ag-047), and that modelling is still right). Two
sentences naming crossings of the same pair therefore carried **identical constraints**, so nothing
distinguished them and every one settled on the same root. #1096's *"the ring you click is the point
you get"* held between distinct crossings and failed between the two roots of one pair — the case it
was built for — because the click's choice was settled only for the click and discarded at commit.

Second, independent: the ring dedupe used an **absolute** `1e-6`, so a crossing that drifted to the
fourth decimal was offered again although a point sat on it. [ADR-AG-021](#adr-ag-021) had already ruled
against absolute epsilons; this dedupe never inherited it.

**Decision — the operator's, put to him as three options.**

1. **The sentence names the root.** «נקודת החיתוך הראשונה / השנייה», accepted by the grammar and
   emitted by the ring, so a clicked line re-parses to the point that was clicked
   ([ADR-AG-048](#adr-ag-048)). A **stored branch index was offered and refused**: it would put state
   behind the student's back and a save would have to carry it or silently collapse the pair on reload.
2. **`crossing-distinct`, a SELECTOR** — `distinct`'s reasons exactly: it consumes no freedom (the
   crossing is already pinned by its two incidences) and *"not the other root"* is a region, not an
   equation a least-squares solve can drive to zero. It names only its own subject and finds its
   siblings by **incidence signature**, because the parser is pure over one line.
3. **Emitted for every intersection**, ordinal or not — the defect is a property of the construct, not
   of the wording.
4. **Relative epsilon in the dedupe**, inheriting ADR-AG-021 rather than restating it.

**A bounded residue, filed rather than hidden: [#1114](https://github.com/dcodish/geo_builder/issues/1114).**
A *third* sentence on a two-root pair is **detected** (`selectorsOk` false) and **not reported**, because
`derive` reports a failing selector only at zero freedom — [#1071](https://github.com/dcodish/geo_builder/issues/1071)'s
open question, which stays open. #1114 carries the argument that settles this case without it: at most
two crossings is **counting**, not sampling, so no satisfiable figure can be wrongly refused.

**Consequences.** Both roots are reachable and two letters no longer share a point. `src-analytic`
gains `issue-1113-crossing-roots.test.ts` (7), which asserts the residue as well as the fix.

## ADR-AG-066 — Clicking an object asks a SENTENCE, and a distance is DRAWN (#1048)

**Status:** accepted, 2026-09-16 · **Extends** [ADR-AG-048](#adr-ag-048), [ADR-AG-053](#adr-ag-053), [ADR-AG-062](#adr-ag-062)

**Requirements:** [02c](02c-requirements-analytic.md) R86. **Design:**
[04c](04c-design-analytic.md) — "Measuring by clicking".

**Context.** Operator, 2026-09-15: *"one of the purposes here is to teach how to find the equation of a
line, how to find the distance between a line and a point and between two points … a user can say I
want to see the distance between this point and a specific line, and **the canvas should show the
height from the point to the line** … clicking on a line itself should allow us to either show the
equation of the line or the distance between the two nodes … maybe also the slope as a third option."*

**Decision.**

1. **A click opens a menu of SENTENCES, not a menu of results.** Every option is spelled exactly as a
   student would type it — «המרחק מ-A לישר l1», «שיפוע הישר l1» — and choosing one asks it through the
   ask lane. That is the reason to prefer this to a toolbar: a button teaches nothing, while a click
   that *names* the thing teaches the vocabulary the exam uses (ADR-W-030's argument, and ADR-AG-048's
   «two surfaces, one grammar»). It also means **one measurement engine**, reachable by clicking and by
   typing, rather than two that can disagree.
2. **The menu offers only what the figure can answer.** «אורך» is offered for a line whose name really
   is two points the figure holds, and not for «ℓ1», which has no nodes — offering it would promise a
   number that cannot exist. A test asserts that *every* offered sentence is one the ask lane
   understands, so the menu cannot drift away from the grammar.
3. **A point-to-line distance is a `MeasureTerm`**, joining `length` and `area` in the one union rather
   than becoming a second grammar. That is what makes «המרחק מ-A לישר l1 = 5» the same constraint kind
   as «AB = 5» with no new solver code, and the union addition forced every consumer to handle it —
   exhaustiveness working as designed.
4. **THE PERPENDICULAR IS DRAWN.** A distance reported as `2.6` teaches nothing; the height dropped
   from the point, with its right angle at the foot, is the construction the student must actually
   perform, and the distance is *defined* by it ([ADR-AG-014](#adr-ag-014)'s principle). It is
   **decoration**: no id, no letter, never in the fact list, and an ask never mutates the figure
   (02c R24). It is carried on the ANSWER, because it exists for exactly as long as the question does.
5. **Not behind «הצג בנייה».** That toggle exists because three medians per derived point bury a
   figure; this is one segment that appears only while its question is on the panel, and hiding the
   answer to what was just asked would invert the operator's request.
6. **Drawn only when the distance is KNOWLEDGE.** On an under-determined figure the point sits where
   the sampler put it, and a height drawn there asserts a magnitude nobody stated (ADR-052) — the
   cardinal sin. The value is open and no height appears.
7. **The right-angle tick is built in SCREEN space**, from the foot's own two directions, so it stays
   square at every zoom; a world-space square would shear under the camera (#1094).

**Known gap, filed not hidden: [#1115](https://github.com/dcodish/geo_builder/issues/1115).** The menu
offers distances to NAMED lines only. An anonymous «נתון הישר y=9» is nameable by its equation since
[ADR-AG-056](#adr-ag-056) and should be offered too; that needs `POINT_LINE_TOKEN` widened to accept an
equation operand, which is a grammar change with real ambiguity risk against the surrounding expression
and deserves its own slice rather than being rushed in beside this.

**Consequences.** `src-analytic` gains `issue-1048-click-measure.test.ts` (13). The point-to-line
technique entry ADR-AG-062 deliberately left unauthored is now written, because something can finally
ask for it.

## ADR-AG-067 — The row is a RECORD, the drawing is a VIEW (#1118)

**Status:** accepted, 2026-09-16 · **Completes** [ADR-AG-066](#adr-ag-066)

**Requirements:** [02c](02c-requirements-analytic.md) R86 (extended). **Design:**
[04c](04c-design-analytic.md) — "Measuring by clicking".

**Context.** Operator, playing #1048 the hour it was built: *"I want to be able to also remove the
distance — maybe I click on the dot again and I can remove the line … it's one thing to see it, but
then I want to remove it and continue on."*

ADR-AG-066 tied the drawn height's lifetime to its ANSWER **precisely so that dropping the answer would
drop the height** — and then shipped no way to drop an answer. `setAnswers` had one writer that only
ever prepended.

**The first build removed both, and he corrected it on sight:**

> *"once the distance between a point and line (or anything else) is asked for and appears in the data
> panel, it should stay there. just remove the dotted line if asked on the canvas."*

**Decision — and the correction is the decision.**

1. **The panel is a RECORD; the canvas is a VIEW of one entry in it.** What the student asked and what
   the figure answered is history, and clearing a dotted line to see the figure underneath **is not
   withdrawing the question**. ADR-AG-066's "the drawing belongs to the answer" was right about
   ownership and wrong about lifetime: the answer owns the mark, and `shown` says whether it is on.
2. **Three gestures, not two:**

   | gesture | row | drawing |
   | --- | --- | --- |
   | ask it (menu or typing) | added, or refreshed in place | drawn |
   | click the same menu entry again | **stays** | hidden |
   | the ✕ on the row | removed | goes with it |

3. **A menu entry whose drawing is on SAYS so** — it carries a ✕ and reads as a switch. An entry that
   silently did the opposite of what it did last time would be worse than no toggle at all.
4. **TYPING the same question again is NOT the toggle gesture, and this is the subtlest part.** Clicking
   an entry that is visibly lit means *take it back*. Typing a sentence means *tell me this*, and
   answering that by hiding the answer would be the opposite of what was asked. So the typed lane is
   **idempotent**: the question is re-evaluated (the figure may have moved), it replaces its row rather
   than stacking a duplicate, and it always shows. The first draft routed both through one toggle; it
   was wrong for the same reason a search box that clears on re-search is wrong.
5. **Hiding evaluates nothing.** `make` is a thunk the toggle calls only when the question is new —
   asserted, so a future refactor cannot make clearing a line cost a solve.
6. **The QUESTION is the key.** It is the sentence the student asked, unique to the measurement, and
   exactly what the menu offers — so the menu and the panel cannot disagree about what is showing.

**The decisions live in `app/answers.ts`, not in the component — and that is [#1102](https://github.com/dcodish/geo_builder/issues/1102)'s
lesson applied the same day it was learned.** That issue's submit decision sat inline in `App.tsx`, its
test reproduced the logic instead of calling it, and a change fifteen minutes later shadowed the real
one while the lock stayed green. These functions are what the component calls and what the locks call —
which is also why the operator's correction cost a rewritten test file and nothing else.

**Consequences.** `src-analytic` gains `issue-1118-retire-measurement.test.ts` (14). Asking the same
question twice no longer produces two identical rows with the drawing stacked on itself — the state the
operator hit within a minute of first use.

---

## ADR-AG-068 — The submit decision is a FUNCTION the app and the locks both call (#1102)

**Requirements:** none (internal) — no promise to the student changes; #1063's promise is restored.
**Design:** [04c](04c-design-analytic.md) — `app/submit.ts` joins `app/ask.ts` and `app/answers.ts` as
the app layer's decision modules.

**The defect this fixes is not a wrong branch — it is an unreachable one.** #1063 built the notice for
*a given the figure already entails*, shipped it green, and it never fired in the app for any of the
three sentences the operator reported. Measured on `main` in a real browser: «AB = 4» after `A(0,0)`
`B(4,0)` added a third row and said nothing.

**Why the branch was dead.** `App.tsx` submit ran, in order:

```js
if (trial.outcomes[lines.length] === 'created') { recordLine(line); return; }   // e22377d3, #1076
…
if (parsed.facts.length > 0 && gained === 0 && …) { setNotice(…); return; }     // e4774a7f, #1063
```

`e22377d3` landed **fifteen minutes after** `e4774a7f`, in the same round. The promotion arm is right in
itself — a line that promotes a carrier to a stated curve really does change the figure — but it was
stated as `outcomes === 'created'`, which is far wider than promotion.

**What separates the two classes — measured, not reasoned.** The obvious discriminators do not work:
both classes report `created`, and both can leave `gained` at zero.

| line | outcome | gained | **constraints added** |
| --- | --- | --- | --- |
| «AB = 4» on a determined `A`,`B` — entailed | `created` | 0 | **1** |
| «שטח המשולש ABC הוא 6» on a determined triangle — entailed | `created` | 0 | **1** |
| «y=x» after «נקודה B על הישר y=x» — promotion | `created` | 0 | **0** |

`applyFact` reports `created` when it appends a constraint (`engine/apply.ts`), which is the whole
reason an entailed given reached the promotion arm at all. **A promotion states no constraint; an
entailed given is nothing but a constraint.** So the arm narrows to *created, and appended no
constraint* — a property of the construction, not a property of the one input that was reported.

A line that both gains an object and states a constraint is unaffected: it fails the entailment test on
`gained === 0` and records through the same path it always did.

**The structural half, which is the actual root cause.** `store/useAnalyticStore.ts` has named
`app/submit.ts` since V0 — *"Whether a line is acceptable is the submit path's question"* — **and the
file did not exist.** The decision lived inline in the component, reachable from no test, so the lock
for #1063 REPRODUCED it:

```js
const verdict = (before, line) => {
  …
  if (trial.outcomes[before.length] === 'known') return 'restated';   // no `created` arm, ever
  …
};
```

That copy modelled a submit path which no longer existed, and would have stayed green through any
further change to the real one. **Narrowing the `created` arm without extracting the decision would have
left the next regression exactly as invisible** — which is why this ADR is about the seam and not about
the condition.

`decideSubmit(raw, lines, seed, current)` is now pure over its inputs and returns one of five verdicts;
`App.tsx` dispatches on it and stores nothing of its own, and the lock calls the same function. The
component's `parseLine` import is gone with the logic.

**Verified both directions.** Restoring the old condition turns the new cases red (3 failed) and the
#1076 guard is what forbids the lazy fix of deleting the promotion arm — so the lock fails for the right
reason in each direction, rather than passing by checking nothing.

**Consequences.** `src-analytic/app/submit.ts` is new. `engine.test.ts`'s #1063 block calls the decision
instead of reproducing it and gains two cases (the three reported sentences; the #1076 promotion guard),
65 tests green in that file. The same signature defect — an internal decision reachable from no test —
is what [ADR-AG-067](#adr-ag-067) had already applied to `app/answers.ts` on the strength of this issue's
diagnosis, before this fix was built.

---

## ADR-AG-069 — The world box is fitted to the CANVAS, at one place (#1122)

**Requirements:** none (internal) — 02c R20's promise (coordinates and equations belong on the figure) is
restored where it had stopped holding. **Design:** [04c](04c-design-analytic.md) — `viewBox` takes the
surface.

**The second letterbox.** [ADR-AG-062](#adr-ag-062) / #1103 fixed the MEASUREMENT half: the scene is built
at the `ResizeObserver`'s size, so the `<svg>`'s `viewBox` equals its own box and `preserveAspectRatio`
letterboxes nothing. That holds. Its second step — *"pad the world box to the surface's aspect, at ONE
place"* — was never implemented, and there is a second letterbox one layer down: `viewBox` took its
half-extents from the FIGURE's box, so `makeTransform` fitted it with `Math.min(width / w, height / h)`
and centred the remainder in `ox`/`oy`. **The letterbox moved from outside the svg to inside it.**

Operator, on the shipped build: *"note the canvas doesnt draw the lines nicely when i zoom and play with
the canvas"* — lines stopping dead in empty gridded canvas. Measured: 33% of the width dead at 1920×1080,
**51% at 1920×860**. `lineSegmentIn` clips to the world box, which is correct; the box was the wrong box.
Zoom could not help — both half-extents are divided by `view.zoom`, so the aspect and the dead band are
invariant under it.

**And the drag sheared.** Pointer travel maps through the rendered rect while the drawing filled only the
rect's height, so tracking was x=0.735 / y=1.000 at 1920×1080 and x=0.530 / y=1.000 at 1920×860. Before
#1103 both axes lagged uniformly at 0.82 — the figure kept its shape under the hand. Afterwards one axis
was exact and one was not, which is worse: a diagonal drag no longer moves along the cursor's line.

**The fix is the step that was skipped, done at one place.** `viewBox(figure, view, surface)` grows the
SHORT axis to the canvas's aspect. Every consumer reads that one box — the scene, `panned`, `toWorld`, the
wheel anchor — so there is no second opinion about what the canvas is showing, which is exactly what let
the projection and the drag disagree. `makeTransform` then returns `ox === 0 && oy === 0` by construction.
Growing shows **more plane**; the scale stays a single isotropic number, never a stretched one. Without a
measured surface the figure's aspect stands as a first-paint fallback, refitted one frame later.

**Locks — the ones #1103 should have carried** (`issue-1122-world-box.test.ts`, 8): `ox`/`oy` are zero
across 5 surfaces × 4 figure aspects × 3 zooms; the box carries the canvas aspect; the short axis GROWS
(fitting by shrinking would satisfy the aspect while cropping the drawing); a line's clipped span touches
both canvas edges; the wheel anchor holds.

**The drag case had to be rewritten, and that is worth recording.** Its first draft compared `toWorld`
before and after `panned` — both of which share one box, so it was self-consistent at any aspect and
stayed **green with the fix removed**. The skew lives BETWEEN the world box and the drawing, so the case
now goes through `makeTransform`: take a world point, find where it is really painted, drag, and require
it to be painted exactly `(dx, dy)` away. Verified red without the fix — x moves 91.9px for a 200px drag.

A lock that passes for the wrong reason is the failure mode
[ADR-W-053](06w-decisions-workspace.md#adr-w-053) exists to name, and #1103's own locks are the example:
they assert the svg box, and none asserts that the world box agrees with it.

---

## ADR-AG-070 — An answer is DERIVED from the figure, never stored beside it (#1110)

**Requirements:** none (internal) — 02c R23–R27 stand; what changes is that the panel can no longer
state a reading the figure has stopped supporting. **Design:** [04c](04c-design-analytic.md) — the ask
lane's record moves into the store.

**Operator, playing T15:** *"it still carries the PQ from data i deleted"* — a distance between two
crossing points he had removed, still stated as fact. A stale measurement presented as current is the
honesty class this product exists to avoid.

**Root cause.** The answers were component state with exactly one writer. `setAnswers` was never called
on `clearAll`, `removeLine`, `replaceLine`, a load, or undo/redo — so an answer survived every one of
them. The store is the source of truth for the figure; the answers were not in it, so the thing that
invalidates them could not reach them.

**The fix is the issue's option 1, and its fallback is deliberately NOT shipped.** The cheap shape —
drop every answer whenever `lines` or `seed` changes — is honest but empties the lane on any edit, and
the issue says not to ship it as the answer without saying so. An answer is a **reading of a particular
`(facts, seed)`**: the moment either changes it is stale or must be recomputed, and keeping it verbatim
is the one option that is never right. So the **question** is stored and the **reading is derived** by
the same fold as everything else.

This is the shape complex already had — its `askRows` come from `queries` in the store — which is why
#1110 was analytic's alone, and is a plain instance of
[ADR-W-053](06w-decisions-workspace.md#adr-w-053)'s lesson: the tree that kept the decision and the data
in the component is the tree that drifted.

**What falls out of it, rather than being added:**

- **«נקה הכל» retires the answers**, because `clearAll` clears `queries`.
- **Editing a given moves the answer with it** — «AB» reading `6` becomes `10` when `B(6,0)` is edited to
  `B(10,0)` — where the fallback shape would have emptied the lane.
- **Undo restores what the student was READING**, not merely the figure: `queries` ride in the temporal
  partialize for the same reason `seed` does (E5/STO-5).
- **A stale value is unrepresentable rather than unlikely** — there is no stored reading to go stale.
- **Hiding a drawing evaluates nothing**, which [ADR-AG-067](#adr-ag-067) had to assert with a counted
  thunk. With the record separated from the reading it is structural, and the thunk is gone.

**Consequence for the #1118 lock, worth stating because a case INVERTED.** It asserted *"the row keeps
its VALUE across a hide and a show — it was never recomputed"*. That is now false on purpose: keeping a
reading verbatim across a figure change is the defect. The case is replaced by one asserting that a
stored question carries no value at all.

**Consequences.** `useAnalyticStore` gains `queries: AskedQuestion[]` and `setQueries`; the gestures stay
decided in `app/answers.ts` (the store decides nothing, per its own docblock) and now fold the record
rather than a list of computed answers. New `issue-1110-answers-follow.test.ts` (7);
`issue-1118-retire-measurement.test.ts` rewritten for the record shape (13). Analytic lane 69 files /
1101 tests.

---

## ADR-AG-071 — "Your figure has no C" is a different answer from "I did not understand you" (#1111)

**Requirements:** [02c](02c-requirements-analytic.md) R26 extended — an unanswerable question says WHY,
and "the figure has no such object" is one of the reasons. **Design:** none (internal).

**Operator, playing T15:** *"i asked for AB in different ways and got some wierd answers"*. The weird one:
«מרחק של C מ-AB» on a figure with no `C` answered **«לא הבנתי את השאלה»** — *I did not understand the
question*. The Hebrew was understood perfectly; the tool simply had no `C`.

**And it knew.** `ask.ts` computed which id was missing and the very next line discarded it:

```ts
const missing = measure.terms…find((id) => !objectById(d.construction, id));
if (missing !== undefined) return { question, value: null, unreadable: true };
```

The comment above it stated the distinction correctly. A student told their sentence was not understood
will rewrite the sentence for ever, because the sentence was never the problem. This is CLAUDE.md's
standing rule — *error messages name the conflicting statement, never internal state* — with the
conflicting statement already in hand.

**The sweep is the fix.** `Answer` gains `missing?: { name, kind }`, and **four** of `ask.ts`'s six
`unreadable` returns become it: a point by name, a line in a slope question, a curve in an equation
question, and a point inside a measure expression. The plan counted three; there are four, and fixing
only the reported branch would have been patching the input that errored. The two that stay are genuinely
unreadable — empty input, and a sentence the measure grammar cannot parse at all.

Copy names the letter, in both languages — «אין בשרטוט נקודה בשם C» / *there is no point C in your
figure*. A generic "one of the points does not exist" would repeat today's defect more politely.

**What this fix does NOT do, and it is the operator's own sentence.** Driving his exact wording rather
than a neighbouring spelling shows «מרחק של D מ-AB» is **`unreadable` still** — the «של» word order is not
in the measure grammar at all, so it never reaches the missing-object check. Five neighbouring spellings
do reach it («המרחק מ-D לישר AB», «המרחק מ-D ל-AB», «DA», «D», «שטח DBC», «AB + DC»). That is a missing
CAPABILITY, relabelled a feature per CLAUDE.md and filed as
[#1134](https://github.com/dcodish/geo_builder/issues/1134) rather than widened in under a bug's banner.
It is recorded as a named case in the lock, asserting today's behaviour, so the gap is visible from the
test rather than rediscovered by the next person who types it.

**A pre-existing assertion INVERTED, and is worth flagging.** `ask.test.ts` carried *"a question about
something the figure does not have is UNREADABLE, not unanswered"* — precisely the behaviour this issue
rules wrong. It now asserts the named answer, with the reason in the case.

**Consequences.** `issue-1111-missing-object.test.ts` (9), each branch asserted separately so a future
merge of the copy cannot re-collapse them. Analytic lane 70 files / 1110 tests.

---

## ADR-AG-072 — A locus is a point with one degree of freedom, and the tool DRAWS it, NAMES it and SOLVES it (#1136, #1137, #1138)

**Status:** accepted, 2026-09-16 · **Amends [ADR-AG-001](#adr-ag-001) D1** (the verify half of the
charter is withdrawn) · **closes** the [ADR-AG-005](#adr-ag-005) open item *"whether an answer is
ever revealed after a wrong claim"* — there are no claims

**Requirements:** [02c](02c-requirements-analytic.md) R87. **Design:**
[04c](04c-design-analytic.md) — "The locus lane".

**Context.** מקומות גיאומטריים is the most-asked construct in the corpus — **13 of 20** sampled 572
Q1s — and the shape is always one of four: ישר ×4 · פרבולה ×5 · מעגל ×3 · אליפסה ×1. It is the V1
lane of [docs/19 §7](19-analytic-geometry-tool.md) and had never been designed past a sentence.
Operator, opening the session: *"we need to discuss the part of מקומות גיאומטריים of the analytical
tool. how would you address this?"*

### The finding the design rests on: the engine already solves the locus

Measured through the real `parse → fold → evaluate` path before anything was designed, six seeds
each:

| figure | result |
| --- | --- |
| `A(0,0)` `B(8,0)` `משולש ABM` `MA = MB` | M at **x=4.00 every seed**, y different each time — the perpendicular bisector, sampled. `carrierDof = 1` |
| `A(-9,0)` `B(41,0)` `משולש ABP` `PA מאונך ל-PB` | P at (12.65,−24.77), (−3.13,−16.09), (37.77,−12.29)… **all at distance 25.00 from (16,0)** — the circle on diameter AB, which is חורף 25's locus. `carrierDof = 1` |
| …plus `MA = 5` | `carrierDof = 0`, M pinned |

`carrierDofOf` + `freeRank` + `solveLM` already give the locus as a **detector and a point sampler**.
[docs/19 §6](19-analytic-geometry-tool.md) called this *"new core #3 — the locus sweep"*; it is not a
new core, and the plan's own best guess ("a locus **is** a swept free DOF") turns out to understate
it — the freedom is not merely analogous, it is the same number the DOF cue already prints.

> **A locus is a named point whose residual `carrierDof` is 1.** «הציגו תצורה אחרת» is already
> walking it, one point at a time. The lane is that button shown all at once.

**No new constraint kinds are needed for the corpus's four shapes.** `length-eq` covers `MA=MB`
(ישר) and `PF₁+PF₂=2a` (אליפסה); `relation perpendicular` covers ∠APB=90° (מעגל); `lengths.ts`
already carries a `point-line` measure term, which is the parabola.

**Decisions (operator, 2026-09-16).**

1. **Input is ORDINARY GIVENS; there is no locus grammar in V1.** Operator: *"maybe the user defines
   the point like it says point M is this and that and so on so it kind of gives the information with
   all of the degrees of freedom."* That is exactly the model the measurement found. The student
   states the point and its property in sentences the tool already has, and the locus falls out of the
   DOF. The set-former phrasing («המקום הגיאומטרי של כל הנקודות M המקיימות…») becomes **sugar over the
   same thing** later, never a prerequisite — which deletes the hardest parser family from V1.

2. **The surface is the ASK LANE, not a new panel.** Operator: *"maybe we have a separate area where
   a user can enter a point he wants to see the locus for and we do it."* That area exists:
   [ADR-AG-044](#adr-ag-044)'s lane, with [ADR-AG-067](#adr-ag-067)'s row/drawing lifetimes finished
   the same week — ask → row + drawing · click the entry again → drawing hidden, **row stays** · ✕ →
   both go. «המקום הגיאומטרי של P» is one more ask sentence. **One field widens:** `Answer.mark` is
   distance-shaped (`{from, foot}`) and `drawnMarks` filters on it; it must also carry a polyline.

3. **The tracer is CONTINUATION, not seed scatter.** Solve once, step along the null space of the
   Jacobian by a fixed arclength, re-solve, repeat to the view box or to closure. Seeds are not a
   sweep: seed 2 of the bisector put M at y=**317** and seed 3 at y=**1.23**, so joining them in seed
   order paints confetti. Sorting has no honest key in 2-D — angle works for the circle and fails for
   the bisector and the parabola. Marching squares over a residual field would serve this ADR's first
   half and **cannot** serve the second (in the construction locus the traced point is *downstream* of
   the free one and has no residual in its own `(x,y)`). Continuation is the only mechanism that covers
   both, and it sits **on** `solveLM`/`freeRank` rather than beside them.

4. **The tool SHOWS the equation, and determinacy is a TWO-SEED SET COMPARISON.** Operator: *"I don't
   want a guessing game. we either show or not. I think we need to show the equation if we can
   determine it"*, and *"only if we are positive about the equation we show it. otherwise, we stick to
   showing the shape."* Its mechanical form:

   > Sweep the trace at two different seeds. **Same set** → determinate: fit and print the equation.
   > **Different set** → shape only.

   This is the **set-level sibling of `isKnowledge`**, and naming it that way is the whole of the
   decision. `isKnowledge` asks *is this value invariant across every admissible parameter* — a locus
   point is by definition **not** invariant, so a value-level gate answers "no" on every locus and
   would suppress the feature entirely. The set is invariant where the point is not.

   It falls out correctly with **no special-casing for parameters**, which is why it is preferred to
   an `if (hasParameter)` test that would be a patch in the shape of a rule:

   - bisector, no parameter → seed 0 and seed 5 both trace `x=4` → same set → print `x = 4`;
   - חורף 25, `A(−9a,0)` `B(41a,0)` `∠APB=90°` → at `a=1` the circle is r=25 at (16,0), at `a=2` it is
     r=50 at (32,0) → **different set → shape only**. Reaching `(x−16a)²+y²=625a²` would mean
     recognising a symbolic dependence across samples, which is the NO-CAS boundary
     ([src-analytic/CLAUDE.md](../src-analytic/CLAUDE.md) rule 2) and stays refused.

   Side effect, and a good one: «הציגו תצורה אחרת» then makes the circle **grow with `a`** on screen,
   which is [02c P6](02c-requirements-analytic.md)'s "a parametric equation is a FAMILY" made visible.

5. **The KIND is shown whenever the KIND is invariant, even if the coefficients are not** (operator:
   *"1 - yes"*). In חורף 25 the coefficients move with `a` but it is a circle for every `a`, and
   *"show that the locus of P is a circle"* is precisely what that exam asks. Determinable ⇒ shown,
   which is decision 4's rule applied one level up.

6. **No student-side validation. This is the amendment to [ADR-AG-001](#adr-ag-001) D1.** Operator:
   *"2 - no. I dont want a validation tool."* D1's charter read *"the student types the claimed
   equation or coordinates and the tool verifies it, marking ✓ or refusing it honestly… **reproduce and
   verify, never solve**"*, and verification was half of it. It is withdrawn. **The charter is now
   `reproduce and ANSWER, never solve`** — "never solve" still means no CAS and is untouched.

   Three notes on blast radius, checked rather than assumed. (a) [ADR-AG-003](#adr-ag-003) had already
   withdrawn D3's currency split on 2026-09-03 — *"we show the values and equations once they are
   defined by the input"* — so showing a locus equation needed **no** amendment; it is D3′'s knowledge
   contract with decision 4 supplying the knowledge predicate. (b) [02c](02c-requirements-analytic.md)
   contains no occurrence of "verify" and was therefore already consistent with this ruling; the stale
   charter lived only in this ADR and in [docs/19](19-analytic-geometry-tool.md) §4 and §5. (c) The
   [ADR-AG-005](#adr-ag-005) open item *"whether an answer is ever revealed after a wrong claim"*
   closes: there is no claim.

7. **The SELF-CHECK is not validation and must survive.** The pipeline is `sweep → least-squares fit
   → snap to rationals → re-verify the snapped equation against the trace → print, or print nothing`.
   The last step is the tool checking **itself**, not grading a student. With decision 6 removing the
   student-side check, nothing else stands between a slightly over-eager rational snap and the tool
   printing a confident wrong equation — the one thing this product may not do. `x² + y² − 32.0000001x
   − 224.9998 = 0` is not an answer: if it will not snap, print nothing and keep the shape.
   **A later session must not delete this as "the validation we ruled out."**

   Fitting a point cloud is **not** `conic.ts`'s exact six-coefficient fit from seven lattice probes of
   a known equation. It is least squares plus a canonicity check, and a traced **ray** will fit happily
   as a full line.

8. **The "draw only when it is knowledge" gate gains a SECOND ARM, never a bypass.** `Answer.mark` is
   documented as *"present only when the distance is KNOWLEDGE — on an under-determined figure, drawing
   it would assert a magnitude the student never gave"*. A locus inverts that: it is honest **because**
   the figure is under-determined, since it draws every position rather than one. The existing gate
   would silently suppress the trace on exactly the figures it exists for, and *"every surface that
   prints a number is gated, and remembering only one is the recurring failure"* is this tree's own
   documented trap.

9. **The trace paints to the VIEW BOX**, and the box stays driven by the stated objects, so an infinite
   locus never inflates the frame ([ADR-AG-069](#adr-ag-069)).

10. **Out of scope, refused BY NAME.** «המקום הגיאומטרי של מרכזי המעגלים שהקטע AB הוא מיתר שלהם»
    quantifies over *circles*, not points, and needs a free circle object. The «מקבילית» precedent
    applies: a given we understand but cannot honour is refused by name, never flattened and never
    escalated to the LLM.

**Staging.** #1136 (the free-point sentence — `נקודה M` does not parse today, and the `free` carrier
it needs has existed since slice A) blocks #1137 (V1a, the property locus: tracer, ask-lane row,
determinacy gate, fit pipeline). #1138 (V1b, the construction locus) follows and reuses all of it,
adding a walkable `on-curve` driver and a trace that follows a **derived** point. docs/19 §7's V1 gate
splits accordingly: **קיץ א' 2024** for V1a, **קיץ ב' 2024 + חורף 2024** for V1b.

**Consequences.** docs/19 §4 and §5 lose the "verify" charter; §7's V1 entry is rewritten and split.
02c gains R87 and its §6 open-rulings list loses the reveal-after-a-wrong-claim item. 04c gains "The
locus lane". Nothing in `src-analytic/` changes in this commit — the three issues carry the build.

---

## ADR-AG-076 — The answer row is typeset, and punctuated as a sentence (#1117 + #1112)

> **Renumbered from ADR-AG-072.** Another session landed its own ADR-AG-072 (the locus lane) while
> round #1135 was executing, and both claimed the number. Theirs landed first, so this one moved. The
> commit that introduced this decision (`fe52156b`) says ADR-AG-072 in its message and cannot be
> rewritten — it is already pushed — so the pointer is recorded here instead. **`test:docs` does not
> check ADR ids for uniqueness**, which is why neither session was told; filed as the guard that should
> have caught it.

**Requirements:** none (internal) — R26's promise is unchanged; the row now keeps it legibly.
**Design:** none (internal).

Two operator reports against **one template string**, which is why they are one item.

**#1117**, playing PR #1116 T28: *"we don't have MathML in the input in the data panel"*. The row read

```
המרחק מ-A לישר l1 = 2.6                      ← plain text
d(A, l1) = |3·2 - 4·5 + 1| / √(3² + (-4)²)   ← typeset, directly beneath it
```

so one line contradicted the next.

**#1112**, playing T15: *"the last one משוואת AB = -2x + y = 0 should be משוואת AB: -2x + y = 0"*. The row
is built as `question SEP value`, and for an equation question the value is **itself an equation** — so
the row carried two `=` and read as a broken statement. Nothing is wrong with the mathematics; the row was
punctuated as if «משוואת AB» were a quantity.

**The separator is chosen from the VALUE, not from the question kind.** A value that is already an
equation cannot be joined to its question with another `=`. Deciding on content gives one rule covering
every question kind that exists now and every one added later; a list of "the rules that return equations"
would need editing each time a rule learned to, and the row would read as broken until someone remembered.

**Ordering, and why this is item 2 and not item 1.** Routing the row through `MathText` could not have
improved anything before [ADR-W-055](06w-decisions-workspace.md#adr-w-055) / #1125: the renderer's grammar
stopped at literal values, so the row would have become *wrongly* typeset rather than plain — not
obviously better than what the operator reported. That dependency was flagged on PR #1116 rather than
discovered here, and #1125 is item 1 of this round for exactly this reason.

#1125 also **corrected #1117's own premise**: it says the trace is *"MathML, correct"*, and it was not —
it was plain glyphs with `<math>` islands embedded. Both halves of the contradiction were broken; the row
is the half this ADR fixes.

**Consequences.** `issue-1117-answer-row.test.ts` (6). Its `describeCurve` is the app's real line shape
rather than a stub returning `''` — a stub hides the whole defect, because the row then has nothing
containing an `=` to collide with. Analytic lane 1135.

---

## ADR-AG-073 — The magnitude rule belongs to the SYMBOL, not to the term (#1119)

**Requirements:** none (internal). **Design:** none (internal).

```
נתון הישר l1: 3x-4y+1=0
```
printed **`l1: 3x - 4y + = 0`** — the constant simply gone, and the equation malformed.

**Root cause: a coefficient rule applied to a term that has no symbol.** `lineText` suppresses the
magnitude when `|k| = 1`, which is correct notation *for a coefficient* — `1x` must print as `x`. The
**constant** term is formatted by the same helper with `sym = ''`, so the rule erased the number itself.
One condition, scoped to the symbol it was always about.

It fired for **any** line whose constant is ±1 — `-y + 1 = 0`, `x + y + 1 = 0`, `3x - 4y - 1 = 0` — not
only the #1093-built lines that the `prod/2026-09-16-2` DEPLOY-LOG entry described.

**A bookkeeping failure is the reason this survived, and it is the part worth remembering.** That
DEPLOY-LOG entry says of this defect: *"Cosmetic, the figure itself is correct; **filed** and fixed
next."* **No issue was ever filed** — a search across every issue, open and closed, found nothing. It
shipped and stayed live through three deploys. **A claimed filing that did not happen is worse than an
unfiled defect, because it stops anyone looking.**

**`lineText` is now exported**, per [ADR-W-053](06w-decisions-workspace.md#adr-w-053): it was
module-private, so a lock could only have REPRODUCED it — and a reproduction would have carried this bug
in the same shape and agreed with itself.

**Neighbours confirmed rather than assumed** (the plan's step 2): `describeCurve`'s parabola and ellipse
branches format their own numbers and never call this helper, so they were never affected.

**Consequences.** `issue-1119-constant-term.test.ts` (6), verified **red without the fix** (3 failed),
and carrying the opposite direction too — a ±1 *coefficient* still drops its `1`, so this is a scoping
fix and not a deletion.

---

## ADR-AG-074 — A rule that recognises a PREFIX must decline, not refuse on the student's behalf (#1123)

**Requirements:** none (internal) — the honesty invariants it restores are already stated in CLAUDE.md.
**Design:** none (internal).

**Operator:** *"the analytics tool doesnt support the ratio AC:CB=3:2"*. The ratio grammar really is
missing — that is #1124 — but the sentence never reached the seam where that could be said:

```
AC:CB = 3:2   →   bad-equation · detail «CB = 3:2»
```

**`CB = 3:2` appears nowhere in what the student typed.** The colon rule manufactured it by cutting the
sentence at the first colon, and `parseLine` stops at a refusal, so no later rule ever saw the line.
Measured through `derive`, the figure then drew `C` wherever the sampler put it — `AC:CB` was 3:8 there —
while the stated ratio vanished.

That breaks **both** honesty invariants at once: *"error messages name the conflicting statement, never
internal state"*, and *"no stated magnitude is ever silently dropped"*.

**Root cause.** `LINE_NAME`'s second alternative is a two-point run, so `AC:` matches as a line name and
the branch claimed everything after the colon as that line's equation. The existing `matchCurve` guard —
*"the tail contains no Hebrew"* (#1059) — cannot help, because `CB = 3:2` is pure Latin and digits.

**The class, and why the fix is a discriminator.** This is the **fourth instance**, three documented in
`parseAnalytic.ts` itself: `[IVX]{1,3}` with an `i` flag eating a circle equation's `x`
([ADR-AG-006](#adr-ag-006)); a case-insensitive `LINE_NAME` reading the `th` of *"the line through P"*
(#1093 — the same alternative as here); `HAS_A_WORD` drawing «my answer = x» as a line (#1068). **A rule
recognises a PREFIX, claims the remainder unconditionally, and then refuses on the student's behalf.**
Each prior fix narrowed one discriminator; this branch never had one.

**The discriminator is the one the file already uses** at the bottom of `matchCurve` for the bare-equation
branch: the tail must parse as an equation AND mention the plane's own variables. Special-casing a `p:q`
tail would have left the class alive for every other `XY:<not-an-equation>` sentence — the patch tripwire
docs/17 names.

**Declining is right HERE SPECIFICALLY because the bare-colon form carries no noun.** «נתון הישר AB: …»
has evidence the student meant an equation and must keep refusing loudly — that is the #1059 ruling, and
the truncated-equation lock («נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2») rides on it. Both are asserted in the
new lock, so the distinction is kept rather than flattened.

With that in place `AC:CB = 3:2` reaches **`not-handled` with the student's whole line as the detail** —
honest, and the seam #1124's ratio grammar plugs into.

**Consequences.** `issue-1123-colon-claim.test.ts` (6), including a **generic** honesty case: a
`not-handled` refusal reports the input verbatim. Asserted as a property rather than per-case, because
this is the fourth escape of one class. Analytic lane 1147.

---

## ADR-AG-075 — A pair of curves has only so many crossings, and the bound is structural (#1114)

**Requirements:** none (internal). **Design:** none (internal).

Split out of #1113 while fixing it. That issue made the two crossings of one line × conic pair land on
the two different roots; a **third** sentence on the same pair still built.

**Measured, and worse than the issue recorded.** Naming `R` did not merely stack it on `P` — it dragged
`Q` there too:

```
P(0.92, 1.84)  Q(3.48, 6.96)                    ← two crossings, correct
P(0.92, 1.84)  Q(0.92, 1.84)  R(0.92, 1.84)     ← after naming a third
```

**Why this did not have to wait for #1071.** `crossing-distinct` DETECTED it — `selectorsOk` was false —
but `derive` reports a failing selector only when the figure has no freedom left, and here `A` and `B`
are free on the line. That gate is deliberate: with freedom left, 24 exhausted seeds are evidence and not
proof, and reporting on them could refuse a satisfiable figure. **This case is a counting argument, not a
sampling one** — a straight meets a conic in at most two points at ANY configuration, so three such
sentences cannot all hold under any seed (ADR-AG-008 / #1058's "vacuously never"). So the refusal lives
beside the construct in `applyFact`, `derive`'s freedom gate is untouched, and #1071 stays open.

**The bound comes from the curve KINDS alone**, never their parameters — which is what lets it run at
apply time, before anything is evaluated. `maxCrossings` returns `null` where it has no certain bound, and
then nothing is refused: **a bound that is not certain must never become a refusal**, because refusing a
satisfiable figure is the worse defect of the two.

**A first version of the check never fired, and the reason is worth recording.** It counted `on-curve`
constraints only. A line named by two points lowers to **`on-line-2pt`**, so each crossing carried
`on-line-2pt(P, A, B)` beside `on-curve(P, circle-I)` and the check saw one carrier per point instead of
two. `carriersOfPoint` now counts both kinds, with a synthetic order-independent `line2pt:` key so
«the line AB» and «the line BA» are one carrier. Measured, not assumed — the plan said this sentence
lowers to two `on-curve` constraints, and it does not.

**#1113's recorded residue fired exactly as designed.** That file carried a case asserting the CURRENT
state — detection live, refusal absent — so that the day the refusal arrived it would fail and be
revisited. It failed in this round. It is kept and inverted rather than deleted, and now asserts the
refusal names the student's own sentence.

**Consequences.** `issue-1114-crossing-cap.test.ts` (5), including the control that two crossings still
land on two different roots — a cap that broke #1113 would be a worse defect than the one fixed — and the
same bound at a different arity (two straights meet once, so a second name is refused). Analytic lane
76 files / 1152 tests.

---

## ADR-AG-077 — A ratio is a REWRITE of a length equation, and the form decides whether it places or relates (#1124)

**Requirements:** [02c](02c-requirements-analytic.md) R88. **Design:** none (internal) — no new engine
kind; the rules are `parseRatioColon` / `parseDividesInRatio` in the parser.

**Operator:** *"the analytics tool doesnt support the ratio AC:CB=3:2"*. The **mechanism was already
here** — `length-eq` carries `AB = 10`, `AB = AC` and `2·AB = 3·CD` as one kind with different trees —
and only the notation was missing. 2-D has had all three forms since #519.

**The split is 2-D's, ported rather than reinvented.** The bare colon is a RELATION over points that
already exist; the keyworded divider is a PLACEMENT that mints one. Deciding by **form** is what makes
«C מחלקת את AB ביחס 3:2» a single sentence a student can type, and it is why the issue recommended
porting the split instead of picking one lowering.

`AC:CB = p:q` ⇒ `|AC| = (p/q)·|CB|` — exactly what «AC = 1.5CB» already lowers to. **No new engine
kind**, and the divider reuses precisely what «C על הקטע AB» emits (`declare` + `on-line-2pt` +
`between`) plus that constraint.

### The first build parsed perfectly and drew the wrong figure

Worth recording in full, because everything about it looked right.

It hand-wrote the `LengthExpr` tree. Every spelling parsed; the fact tree printed **byte-identical** to
the one «AC = 1.5CB» produces; the derived construction printed byte-identical too — same objects, same
params, same selectors, same constraints, same outcomes. And `C` landed at **3.75 instead of 6.00**, with
`unsatisfied` **empty**.

The cause: `LengthExpr.terms[i]` is bound to a **private-use code point** (`PLACEHOLDER_BASE`, U+E000),
so the placeholder symbol's name is an invisible character. `JSON.stringify` renders it as an invisible
glyph between the quotes, which means **`name: ""` and `name: ""` are indistinguishable in every
console, diff and test dump.** The constraint was never evaluated, and nothing anywhere said so.

The fix is to **call `parseLengthExpr`** and wrap its expr, rather than reproduce its encoding — the rule
[ADR-W-053](06w-decisions-workspace.md#adr-w-053) states, arriving here from a direction nobody predicted:
not a test reproducing a decision, but a *rule* reproducing a data encoding, with the same result of
agreeing with itself while being wrong.

It is also why this ADR's lock asserts **geometry** rather than parsing. A test that checked "it parsed"
would have passed on that build.

### Ordering

The rules run **before `matchCurve`**, whose bare-colon branch would otherwise claim «AC:CB = 3:2» as a
line named `AC` with the equation `CB = 3:2` — the reported bug, fixed in
[ADR-AG-074](#adr-ag-074) / #1123 by making that branch decline a tail that is not an equation in the
plane's variables. That fix is what turned this sentence into an honest `not-handled`, and this ADR is
what plugs into that seam; #1123's lock is updated to say so rather than left asserting a refusal that is
now a build.

**Catalog entries for all three forms** are listed individually — the direct lesson of #347: the coverage
guard builds every entry, so a spelling that is not there is never exercised and can rot back out in
silence.

**Consequences.** `issue-1124-ratio-family.test.ts` (12), asserting geometry per spelling, the identity
with «AC = 1.5CB», the n-way refusal by name, and the named-line ordering regression. Analytic lane 1161.

---

## ADR-AG-078 — A notation the tool writes is a notation it reads (#1127 + #1134)

**Requirements:** [02c](02c-requirements-analytic.md) R89. **Design:** none (internal).

Four spellings, bundled because they are **one sentence about the grammar**: in each case the product
itself produces a notation and then refuses it back.

| spelling | who writes it | was |
| --- | --- | --- |
| `x_A = 5` | the data panel prints coordinates this way; R31c calls it canonical | `not-handled` |
| «x של A הוא 5» | **this parser's own docblock**, which claimed the bare form was supported | `not-handled` |
| «קדקוד A(1,2)» | the exam, constantly | `not-handled` |
| «מרחק של C מ-AB» | **the operator**, in his own T15 report | `unreadable` |

**`קדקוד` joins `HE_POINT`, the shared token**, never inline at a call site — the tree's stated rule is
that a noun gate re-spelled inline drifts, and it has paid for that three times. The lock asserts the
spelling across two unrelated constructs, which is what would fail if it had been added at one site.

**The «של» order is a word order, not a wider operand.** «המרחק מ-A לישר l1» names the point after `מ-`
and the line after `ל-`; the operator's wording inverts which preposition introduces which. One token
with two alternations rather than two tokens, because the operand classes are identical and only the
prepositions differ — two tokens would be the same rule written twice and free to drift. Deliberately
**not** the widening #1115 was disarmed over: no `=`, digits or operators enter the operand.

**It unblocks #1111.** That issue built «אין בשרטוט נקודה בשם D» for exactly this sentence, and it could
never fire because the sentence never parsed. The two halves are asserted together, because neither is
worth anything alone.

### Two corrections to the issues' own framing, both measured

- **«xA = 5» is not the component form and never was.** It parses as a CURVE — the equation `x·A = 5`.
  A lock comparing the new spelling against it would have compared two unrelated things; the real
  equivalence is the noun form, and that is what is asserted.
- **The bare «x של A» form was already documented as supported and was not.** The noun was required, so
  «x של A הוא 5» was refused while «שיעור ה-x של A הוא 5» worked. A comment claiming a capability is how
  a gap survives being looked at — the same shape as #1119's DEPLOY-LOG entry claiming an issue had been
  filed when none was.

**English gains no `vertex` noun**, deliberately: `point` is spelled inline at six call sites rather than
in a shared token, so adding one beside each would be precisely the drift this ADR is about. Its own
issue if the corpus ever wants it.

**Four recorded gaps fired closing this**, all self-expiring records doing their job: #1111's KNOWN GAP
case, `parser.test.ts`'s *"the component form remains unbuilt"* line, and (in the same round) #1113's
crossing residue and the `NO_HISTORY_YET` parity exception. Each is kept and inverted rather than
deleted.

**Consequences.** `issue-1127-1134-spellings.test.ts` (13). Catalog entries for all three new spellings
(#347's lesson). Analytic lane 76 files / 1161 tests.

---

## ADR-AG-079 — A circle's centre is namable, and the name asserts nothing (#1109)

**Requirements:** [02c](02c-requirements-analytic.md) R90. **Design:** none (internal).

**Operator, playing T10/T12:** *"when a center of a circle is defined by the equation, it should be
clickable so user can assign the center with a letter"*. The `+` mark has been drawn since #1024 and was
inert, while a **crossing** in the same figure was clickable and minted a letter — so the affordance
existed and the most interesting point on a circle did not have it. A student reads that as a bug.

**The ruling (2026-09-16):** *"the click only names what doesn't have a name"*. Two halves, both built
and both asserted:

- **It NAMES; it never asserts.** No constraint, no degree of freedom — a label is not a given, so on
  «נתון מעגל O משיק לציר x» the centre keeps its freedom after being named.
- **Offered only where a name is MISSING**, and gone once one exists.

**The grammar was the whole of the work, and that was measured.** The issue warned the missing sentence
was *"probably the larger part"*; none of six spellings parsed. But the ENGINE half already existed —
`circle-centre` has been a `DerivedRule` since [ADR-AG-020](#adr-ag-020) / #1059, the one whose parent is
a CURVE rather than a set of points. So this is a parser rule emitting an existing fact. Minting a second
kind of centre-point would have been [ADR-AG-023](#adr-ag-023)'s divergence.

**It travels the crossing's road rather than forking it**, which was the issue's own design constraint:
the same `Namable` shape, the same `freeLetter`, concatenated into the same offer list — one kind of
offer, one letter source, one grammar. No second click handler in `App.tsx`.

### The round-trip assertion earned its place immediately

The first build composed the offered sentence from `label.name` — which is the whole **noun phrase**,
«מעגל I» and not «I» — and offered **«P מרכז המעגל מעגל I»**, which does not parse. The centre coordinates
were right, the gating was right, and the sentence was unusable. Nothing but the round-trip check would
have caught it, and that is exactly what [ADR-AG-048](#adr-ag-048)'s «two surfaces, one grammar» rule is
for: an offered sentence the parser cannot read back is a ring whose click fails, which
[ADR-AG-054](#adr-ag-054) says is worse than no ring. The student's letter now comes from the **id**
(`circle-I`), which is what the grammar refers to.

**Siblings, decided out loud** (the issue's step 5): a parabola's FOCUS and an ellipse's CENTRE are the
same question and are **not** in this slice — neither has a `DerivedRule`, so each is new engine work
rather than a spelling. Circle-only.

**One honesty wrinkle found and filed, not fixed here:** refusing «O מרכז המעגל Z» reports
`unknown-reference` with the detail **`circle-Z`** — an internal id, where the student wrote `Z`. That is
CLAUDE.md's *"error messages name the conflicting statement, never internal state"*, and it is
pre-existing and general to `unknown-reference` rather than introduced here, so it is filed rather than
widened into this slice.

**Consequences.** `issue-1109-name-centre.test.ts` (11) and a catalog entry. Analytic lane 77 files /
1168 tests.

## ADR-AG-080 — A shape noun promises a RING, and the configuration drawn must honour it (#1158 + #1166)

**Requirements:** [02c](02c-requirements-analytic.md) R91. **Design:** [`src-analytic/CLAUDE.md`](../src-analytic/CLAUDE.md) (the drawability predicate). **LADDER stage:** configuration choice — inside `drawableAt`'s seed sweep, after the solve and before anything downstream reads the figure.

**Two operator reports on 2026-09-17, one sentence.**

- *"i later ask for another shape and get this — which should never happen on any quad"*, with «טרפז ABCD» drawn as a crossed butterfly (#1158).
- *"on same diagram, i now have a collapsed triangle on several show next steps"*, with «משולש ABC» drawn as a straight line (#1166).

Measured at `deef0103`: his trapezoid crossed at **16 of 24** configurations, his triangle exactly flat at **13 of 24**, and `faults = []` at every single one. The tool believed both figures satisfied their givens — and they did satisfy the **constraints**. What they did not satisfy is **the noun**.

**The ruling: a polygon noun asserts more than the relations it lowers to.** «טרפז» promises a simple ring and «משולש» promises three non-collinear points, and neither promise is expressible in the vocabulary a noun lowers through. [`shapes.ts`](../src-analytic/engine/shapes.ts) is explicit that *"`parallel(a,b,c,d)` and `equal(a,b,c,d)` are the whole vocabulary"*, and both are **direction-insensitive**: a cross-product residual cannot tell `A→B→C→D` from the traversal that folds the ring over itself, and a length equation cannot either. So the promise has to be kept somewhere else, and that somewhere is where the configuration is chosen.

### Why it is ONE seam and not two predicates

#1166 ruled this before either was built:

> #1158 (simplicity) and this (degeneracy) are the same sentence: *the configuration drawn must honour the polygon noun that was declared*. Fixed independently they will grow two parallel predicate lists that drift — the failure this codebase has paid for repeatedly.

So there is one module, [`engine/rings.ts`](../src-analytic/engine/rings.ts), one verdict type (`'crossed' | 'degenerate'`), and one consumer. «מרובע» is the row that proves it was never about the parallel relation: it lowers to **no constraint at all** and still crossed 11 times in 24.

### The chokepoint is where the configuration is CHOSEN

`whole()` inside `drawableAt` gains a third term beside "the selectors hold" and "every named object exists". That single insert fixes the canvas, the data panel, `isKnowledge`, `knownOptions` and «הציגו תצורה אחרת» together, because all of them route through it — and the operator met the defect *through* the configuration walk, which is downstream of this function. Adding «דלתון» stays one row in `shapes.ts` and inherits this with no edit.

It is consulted as a **preference inside the existing budget**, like its two neighbours. Measured: a valid ring was reachable within 7 extra seeds from every start across seven figures, with zero unreachable inside `DRAWABLE_TRIES = 24`. The budget did not need raising.

**Result, same seeds:** crossed **0/24** on all six quadrilateral figures (from 11–16), exactly flat **0/24** on all four triangle figures (from 13–17). Near-degeneracy fell as a side effect — the operator's own figure went from 17/24 under 5° to 6/24 — without being targeted.

### Simplicity, not convexity. Exact degeneracy, not narrowness.

Both bounds are [ADR-052](06-decisions.md#adr-052) and both are asserted:

- **A concave quadrilateral is a legitimate «מרובע»** and the exam draws them. Rejecting concavity would assert a given the question never gave — the cardinal sin from the other side. This is where the 2-D sibling's `declaredPolygonsConvex` is deliberately **not** the template: 2-D *prefers* convexity under [ADR-018](06-decisions.md#adr-018)/ADR-097, a different decision for a different product.
- **A thin triangle is ugly but TRUE.** #1166 ruled exact degeneracy invalid and near-degeneracy a seed preference, so the tolerance is `|sin θ| < 1e-3` — **0.057°**, two orders of magnitude below the 3–5° band it must not touch, and two above the collapsed configurations it must catch. The bands were measured, which is why the value is not delicate.

Read per **vertex** rather than by area: an n-gon with a straight corner is really an (n−1)-gon whatever its area says, and area would mean something different at every zoom. The 2-D sibling learned the same thing (`hasStraightVertex`).

### The second arm was built, measured, and WITHDRAWN

The plan's arm 2 reported on the declaring line when the search found nothing valid. Built, it moved three `derived.test.ts` locks — and every figure it fired on had **`reportedDof = 0`**. With the choice in place, the only figures reaching that state are ones where the student **pinned** the coordinates themselves, which is #1166's own *"out of scope here"* residual. On such a figure there is one configuration, never a search, so «לא נמצאה תצורה שבה מתקיים» is not even a true sentence.

Both obvious gates are already argued against in this tree: `reportedDof === 0` is exactly the three locks, which encode [ADR-AG-008](#adr-ag-008)'s `does-not-exist` answer for a collinear circumcentre; `reportedDof > 0` is what the selector arm refuses to do, for #1071's reason — with freedom left, 24 exhausted seeds are evidence and not proof. An arm with no uncontested domain is a ruling, not a gate, so it is [#1170](https://github.com/dcodish/geo_builder/issues/1170) and `derive.ts` carries a comment saying why there is nothing there.

**Residual risk, stated:** a figure that *has* freedom and whose 24 seeds all produce a bad ring is still drawn silently. Measured zero occurrences across the twelve figures of both issues.

### The lock asserts the operator's complaint, not just the mechanism

His second sentence was *"we need to give the user different options and not similar options"*. #1166's comment measured that and refuted the obvious diagnosis — analytic's distinctness test was already fine (0 of 12 offers under the 3% bar), and the offers were numerically far apart. What made them useless is that six of the first seven were *another straight line*: numerically distant, perceptually identical. So the lock walks the real **offer list** through `anotherConfiguration` and asserts successive offers differ as **shapes**, on a similarity-invariant fingerprint — not that raw seeds differ, which would measure a list no student is shown.

**Consequences.** `engine/rings.ts` (new), `Figure.ringFaults`, one term in `whole()`. `issue-1158-1166-polygon-noun-validity.test.ts` (24 tests, sweeping `SHAPES` so a noun added later inherits the lock). Analytic lane 80 files / 1235 tests.

## ADR-AG-081 — The locus lane, V1a: the button shown all at once (#1136 + #1137)

**Requirements:** [02c](02c-requirements-analytic.md) R87 (specified), R92 (the free point). **Design:** [`src-analytic/CLAUDE.md`](../src-analytic/CLAUDE.md). **LADDER stage:** a reader over the solved figure — it walks the carrier system `evaluate` already builds and mutates nothing.

Implements [ADR-AG-072](#adr-ag-072), scoped with the operator 2026-09-16. Locus is **13 of 20** sampled 572 Q1s — the most-asked construct in the corpus.

**What a student can now do:**

```
A(-9,0)
B(41,0)
נקודה P
PA מאונך ל-PB
```

then ask **«המקום הגיאומטרי של P»** and get the circle **drawn**, the row reading **«מעגל»**, and its equation **`(x − 16)² + y² = 625`**.

### The engine already solved it — confirmed before anything was built

Measured through the real `parse → fold → evaluate` path: `MA = MB` puts `M` at **x = 4.00 at every seed** with a different `y` each time; `∠APB = 90°` puts `P` at **distance 25.00 from (16, 0)** at every seed. `carrierDof = 1` in both. docs/19 §6 called the tracer "new core #3"; **it is not a new core**, and no constraint kind was added.

> A locus is a named point whose residual `carrierDof` is 1. «הציגו תצורה אחרת» is already walking it, one point at a time. This lane is that button shown all at once.

### #1136 first, because the workaround was itself the cardinal sin

Every measurement in #1137 had to smuggle a 2-DOF point in as `משולש ABM` — asserting a triangle the student never mentioned, which is [ADR-052](06-decisions.md#adr-052) through the front door. The `free` carrier family has existed since slice A; **only the sentence was missing**, so «נקודה M» emits the `declare` fact the cevian and polygon rules already emit.

**The class was measured, not assumed** (#1136's plan asked for it): «מעגל O» could already be declared unplaced; **«ישר k» still cannot**, for the same reason the point could not. That half is NOT fixed here — a free line has no object kind and no `carrierOf` row, so it is engine work rather than a sentence, and it is [#1171](https://github.com/dcodish/geo_builder/issues/1171). The lock asserts the split so it cannot be quietly forgotten.

### CONTINUATION, and the two alternatives are refuted by measurement

Solve once, step along the null space of the Jacobian by a fixed arclength, re-solve; outward both ways, to closure or to a bound.

- **Seed scatter is not a trace.** Seed 2 puts `M` at `y = 317.54`, seed 3 at `y = 1.23`. Joined in seed order that is confetti, and sorting has no honest key in 2-D — angle works for the circle and fails for the bisector and the parabola.
- **Marching squares cannot reach V1b.** #1138's traced point is DOWNSTREAM of the free one, so it has no scalar residual in its own `(x,y)` and there is nothing to contour. Continuation walks the FIGURE's freedom, so the same tracer covers both halves — `positionsAt` re-evaluates the whole dependent chain per step and traces whichever point was asked about.

`carrierSystem` was extracted from `evaluate` so the solve and the tracer read **the same residuals**; a second construction of "what the constraints say" would be two definitions of the figure drifting apart.

### The determinacy gate, and it is the honesty gate

> *"only if we are positive about the equation we show it. otherwise, we stick to showing the shape."*

Trace at two configurations, compare the **sets**. Same ⇒ print the equation; different ⇒ the kind alone. It is the set-level sibling of `isKnowledge` — that predicate asks whether a VALUE is invariant, and a locus point is by definition not, which is exactly why the *set* needs its own predicate.

It falls out with no special-casing: the bisector prints `x = 4`; **חורף 25 with `A(−9a,0)` `B(41a,0)` prints «מעגל» and no equation**, because reaching `(x − 16a)² + y² = 625a²` means recognising a symbolic dependence across samples — the CAS boundary. And the KIND still shows, because the kind IS invariant and *"show that the locus of P is a circle"* is precisely what that exam asks.

### The self-check earned its place three times over

`fit → snap to rationals → RE-VERIFY the snapped equation against the trace → print, or print nothing`. With no student-side validation anywhere in this product, nothing else stands between an over-eager snap and a confident wrong equation. Three defects were found by measuring it rather than reasoning about it, and each was a class:

1. **A line is not a well-posed conic fit.** Infinitely many conics contain a straight line, so the least-squares eigenspace is degenerate and the most elementary locus in the corpus classified as `rotated`. Cured by fitting the **lowest-degree curve first**, which is also what a student writes.
2. **Snapping must be RELATIVE.** חורף 25's `F` fits to `−368.99998759` against `−369` — absolute error `1.2e−5`, relative `3.4e−8`. Held to an absolute `1e−6` a perfectly determinate locus printed nothing.
3. **Normalisation must be MONIC.** Dividing by the largest coefficient makes that same circle's `A = −1/225`, which is not a rational with a denominator under 64. Monic gives `1, 1, −32, −225` — integers, which is what exam loci have.

A fourth was a scope question rather than a bug: the view box is driven by the STATED objects, so «A(0,0)» + «MA = 5» gives a box about five across for a curve ten across, and tracing only inside it produced a **23° arc** — too little to identify (the gate then reported "shape only" about a determinate locus) and too little to show the student their answer. The walk now goes wider than the frame and the RENDERER clips, which leaves ADR-AG-072 §9 intact: the frame is still driven by the stated objects and an infinite locus still does not inflate it.

### The knowledge gate needed a SECOND ARM, not a bypass

`Answer.mark` is present *only* when a distance is knowledge, because drawing it on an under-determined figure would assert a magnitude nobody gave. A locus is the **inverse**: it is honest *because* the figure is under-determined, since it draws every position rather than one. The gate as written would have suppressed the trace on exactly the figures it exists for — and *"every surface that prints a number is gated, and remembering only one is the recurring failure"* is this tree's own documented trap.

The trace rides ADR-AG-067's existing `shown` lifetime rather than inventing a fourth rule, so «click the entry again» hides a locus exactly as it hides a height and the row stays.

**Consequences.** `engine/locus.ts` and `engine/locusFit.ts` (new), `carrierSystem` extracted from `evaluate`, `Answer.locus`, `drawnLoci`, `SceneLocus`, four `locus.*` locale keys, one catalog entry. `issue-1136-1137-locus.test.ts` (24). Analytic lane 88 files / 1236 tests.

**Not in this slice:** #1138 (V1b, the construction locus) — it inherits the tracer, the surface, the gate and the fit pipeline whole. The set-former phrasing «המקום הגיאומטרי של כל הנקודות M המקיימות…» stays sugar for later (ADR-AG-072 §1). «המקום הגיאומטרי של מרכזי המעגלים…» quantifies over *circles* and is still refused by name.

## ADR-AG-082 — A shape noun's UNSTATED choice is the tool's assumption, and a statement pins it (#1159)

**Requirements:** [02c](02c-requirements-analytic.md) R93. **Design:** [04c](04c-design-analytic.md) — *a noun's unstated choice is the tool's*. **LADDER stage:** the apply boundary — the noun lowers as before, and what changes is what a later statement may do to it.

**Operator, playing the analytic tool:** *"I write «טרפז ABCD» and the tool assumed AB is parallel to CD. I then write «AB parallel to CD» and the tool says this is already known — which it should not be, because that was **assumed, not given**."*

He is right, and the 2-D tool already agreed with him: [ADR-506](06-decisions.md#adr-506) (#989) settled exactly this, from the same complaint. This tree never received the ruling. **Ported, not copied** — the trees share rulings and never code (`src-analytic/CLAUDE.md` boundary 1), and 2-D expresses it as `trapezoidRingInForce` over its own model.

### One gap, three symptoms, all measured

| # | sequence | before | after |
|---|---|---|---|
| 1 | «טרפז ABCD» · «BC מקביל ל-AD» | **both** pairs held ⇒ a PARALLELOGRAM at every seed | one pair — the student's |
| 2 | «טרפז ABCD» · «AB מקביל ל-CD» | `already-follows` | `record` |
| 3 | «AB מקביל ל-**CD**» vs «AB מקביל ל-**DC**» | `already-follows` vs `already-known` | identical |

Symptom 1 is the serious one: the tool kept its own guess **and** added the student's, and drew something that is not a trapezoid, silently, at every configuration.

### The decision

**A shape noun that leaves a choice unstated records that choice as the TOOL'S, not the student's.** `engine/shapes.ts`'s three `טרפז*` rows emit their parallel pair through `assumedParallel`, which carries `assumed: true` on the constraint. Two things may then happen at the apply boundary, and **neither is a restatement**:

- the student names **that** pair — the constraint stops being a guess and becomes their given (`narrowed`);
- the student names the **other** pair — the assumption **yields** to them (`created`).

Stating both is a parallelogram they asked for, and is left alone: the second statement finds no assumption to displace because the first already pinned it.

**Not a `choice` constraint**, deliberately. A `choice` is walked by «הציגו תצורה אחרת», which would flip which pair is parallel *under the student* — and the exam's lettering does not invite that. The pair defaults by ring order and is pinned or displaced by a statement; nothing cycles.

**`displacedAssumption` reads the RING**, not the letters: the stated pair must be an opposite-side pair of the same declared polygon as the assumed one. So it cannot fire on two segments that merely share names with a ring's sides, and a quadrilateral noun added later inherits it.

### The entailment gate needed its own arm, and measurement said so

The plan expected symptom 2 to fall out of symptom 1's fix. **It does not**, and the plan said to verify rather than assume: pinning an assumption changes neither the constraint count nor the figure's freedom, so all three of the entailment gate's conditions still hold and it still answered *«זה כבר נובע מהנתונים שכתבתם»*. The signal is that **an assumption stopped being one**, so `decideSubmit` counts assumed relations before and after and records when the count drops.

### `canonicalConstraint` — the identity of a constraint as a STATEMENT

Symptom 3 came from comparing constraints with `JSON.stringify`. `shapes.ts` justifies that compare in its own docblock — *"honest here precisely because both sides are built by the functions in this file; there is no second way to spell a right angle at B"* — and that argument is sound for a seat the table builds. It is **false** for a constraint the PARSER built from a student's sentence, where the spelling is theirs.

So one key, used by every comparison site (`namesOption`, the duplicate absorb, the assumption match): each point pair sorted, then the two operands of a symmetric relation sorted. **Not a spelling-equivalence table** — the analytic mirror of #999's ruling: normalise the one thing that is genuinely a spelling and never enumerate which kinds mean the same as which others. `assumed` is deliberately outside the key, which is exactly what lets a stated pair recognise the assumed one.

**Counter-direction, asserted:** a parallelogram's pair is a real given, so restating it is still absorbed as «כבר ידוע» — a fix that made every parallel record would have swapped one dishonest message for another.

**Consequences.** `assumed?: true` on the `relation` constraint, `canonicalConstraint`/`sameConstraint` (`solve.ts`), `assumedParallel` + `displacedAssumption` (`shapes.ts`), one arm in `apply.ts`, one in `decideSubmit`. `issue-1159-trapezoid-pair.test.ts` (12). Analytic lane 81 files / 1237 tests — none of `options`, `named-shape`, `shapes`, `lowering`, `panel` moved, which was this issue's stated escalation trigger.
## ADR-AG-083 — A constraint's CURVE references are checked like its point references (#1150 + #1145)

**Requirements:** [02c](02c-requirements-analytic.md) — none added; this restores an existing promise (the honesty invariant: a given parses to a constraint, escalates, or errors, but never vanishes). **Design:** [04c](04c-design-analytic.md) — *the apply boundary's reference check*. **LADDER stage:** the apply boundary, beside the point-reference refusal it completes.

**Operator, on his saved figure «עבודת סוכות 1»:** *"the last input referred to l1 and l2 which don't exist and yet point D was positioned"*.

### The diagnosis in the issue was wrong, and the issue said to check it

#1150 proposed that the point rule's optional tail *"fails to match, so the rule succeeds with the tail dropped"* — the ADR-AG-017/#1042 class — and flagged it **measured but not yet complete**. Measured at HEAD, the sentence parses **fully**:

```
«נקודה D היא חיתוך של l7 ו- l8»  →  declare · on-curve · on-curve · selector
```

Both constraints faithfully name `l7` and `l8`. Nothing was dropped by the parser.

**The hole is one seam later.** `constraintRefs` answers *which POINTS does this constraint touch* — which is exactly right for both of its callers (`carriers.ts`, to find the carriers a constraint can move; the apply boundary, to refuse a statement about a point the figure lacks), so `on-curve` returns only its point and `dirRefs` returns `[]` for a curve direction. **Nothing ever asked whether the curve existed.** The constraints passed the apply boundary in silence, could not be measured at evaluation, and `D` was drawn as an ordinary free point at a sampled position — while the data panel one column over read `D = –`. The canvas asserted a position the panel admitted was undetermined.

Same class as the issue named; different mechanism. The lesson is the one docs/17 keeps making: a root cause read off the code is a hypothesis.

### The decision

**`constraintCurveRefs` is the other half of `constraintRefs`, and the apply boundary checks both.** Kept separate rather than merged, because the two have different truth conditions — a point ref must resolve to something positional, a curve ref to something with a shape (`curve`, `circle-at`, `line-at`). Merging them would have made the check reject every curve reference as "not a point", which is the opposite defect.

Its `default` arm returns `[]` rather than throwing on an unhandled kind, deliberately unlike `constraintRefs`'s exhaustive `never`: naming no curve is the common case, and a kind that does name one will be caught by its own test rather than by a compile error that every future kind has to answer.

### #1145 rides along, because this fix would otherwise have created a new instance of it

A curve's id is prefixed so that a circle and a point may both be called `I` — «מעגל I» is `circle-I`, «הישר l7» is `line-l7`. That prefix is internal, and it was reaching the student: «O מרכז המעגל Z» reported the detail **`circle-Z`**, a word they never typed. The new check above would have reported `line-l7` the same way, on a message that did not exist before.

`statedName(id)` strips the prefixes the parser minted and is applied at **every** `unknown-reference` site, not the two that were reported — it is the identity on an unprefixed id (a point is just `A`), so a uniform call cannot be wrong and the next site handed a curve id inherits the fix. An anonymous curve (`curve-<hash>`) is left whole: there is no student name to recover, and printing the hash's tail would be a different wrong word rather than the right one.

CLAUDE.md, *Honesty invariants*: **error messages name the conflicting statement, never internal state.**

**Counter-direction, asserted:** the same sentence with both lines PRESENT still records. A reference check that refused a legitimate statement would be far worse than the silence it replaces.

**Consequences.** `constraintCurveRefs` (`solve.ts`), `statedName` + `CURVE_BEARING` + one arm (`apply.ts`), nine `unknown-reference` sites routed through `statedName`. `issue-1150-1145-refs.test.ts` (10). Analytic lane 82 files / 1237 tests.

## ADR-AG-084 — Exact forms: the analytic tree gets the display tier its three siblings already had (#1120)

**Requirements:** [02c](02c-requirements-analytic.md) R94. **Design:** [04c](04c-design-analytic.md) — *the tree's display formatter*. **LADDER stage:** display only — no value, gate or comparison anywhere in the product is affected.

**Operator, playing PR #1116 T29, and again unprompted the next day:** *"in the data panel, the slope of 4/3 is written as 1.33 which is wrong"*. **Ruling, 2026-09-16, verbatim: "exact forms".**

He is right that *wrong* is the word rather than *imprecise*: in analytic geometry the slope of that line **is** 4/3, and `1.33` is a different number the panel was stating as the value. It also sat badly beside this product's own promise — #1053 shows the FORMULA behind an answer so a student sees the method, and the method here yields 4/3. Showing the working and then rounding the result teaches them to write `1.33` on an exam that wants `4/3`.

### Two corrections to the issue's framing, both measured

**1 — This is NOT a workspace change.** The ruling's transcription says *"`fmtNum` is the workspace's single display chokepoint, so this is a workspace ADR and not a per-product one. Every number in every tool is in its scope."* Measured, that is not the shape of the code. [`shell/format.ts`](../shell/format.ts)'s own docblock already describes the architecture — *"Exact symbolic forms (5, 1/2, √2, cis120°) never pass through here … Each keeps its own product-specific tiers ABOVE the decimal fallback"* — and three of the four trees have built theirs:

| tree | exact tier |
| --- | --- |
| 2-D | `exactFormOf` — rational · √ · π ([ADR-410](06-decisions.md), #217) |
| 3-D | `cleanNum` — integer · `p/q` (q ≤ 24) · surd |
| complex | exactness carried structurally in the value model (`ExactValue`) |
| **analytic** | **none — `fmtNum` called directly** |

So the shared formatter was never the defect. **Analytic is the one tree that never built the tier above it**, and a cross-product disparity of that shape is a wiring smell rather than a workspace redesign. The fix is scoped to this tree and this ADR is `ADR-AG`, not `ADR-W`.

**2 — Recognition, not carriage — a DEVIATION from the transcribed mechanism, stated plainly.** The operator's words were *"exact forms"*, which names an outcome. The transcription went further and selected the body's **option (2), carry the stated value** — *"the parser already holds `4/3` as text, so it is kept alongside the float"*. This builds **option (1), recognition**, and the reasons are:

- it is what **both** sibling trees that print exact forms already do, so it satisfies the ruling with the mechanism the workspace has settled on twice;
- the value reaching display is a `number`, and the exactness of `4/3` lives in the equation several layers up. Carrying it would mean threading an exact representation through `isKnowledge` and every value path — a new value-carrying layer, which is a new mechanism rather than a tier;
- the issue's stated objection to option (1) — *"it will occasionally print a fraction for a number that only looks like one"* — is answered by discipline rather than by architecture, and the discipline is the siblings': a **relative** tolerance of `1e-6`, a denominator capped at **12**, and a caller that has already gated on invariance (`isKnowledge` — the same number in every admissible configuration). **`1.3333` typed by a student stays `1.33`**, and that is asserted first-class.

**If the operator meant the stated-text mechanism specifically, this is the line to revisit** — it is recorded here rather than folded in silently.

### What was built

`src-analytic/format.ts`: `fractionText` (the tier) and `fmtAnalytic` (tier, then the shared decimal fallback, with the sub-epsilon clamp the old `fmt` carried). The tree's **one** display formatter, so the panel and the canvas cannot print one value two ways — `fmtNum`'s own *"never per-call-site"* rule applied one level up. `App.tsx`'s `fmt` and `render/scene.ts`'s three labels route through it.

**Copied, not imported**: `src-analytic/CLAUDE.md` boundary 1 — 2-D's lives in `src/`, which this tree may not import. A third recogniser in the workspace is the architecture `shell/format.ts` describes, not a new sin.

**No surd tier**, deliberately: no witness in this tree's corpus yet, and a tier with no witness has no test that could fail. √2 falls to the decimal, honestly.

**Consequences.** `src-analytic/format.ts` (new), one line in `App.tsx`, three labels in `scene.ts`. `issue-1120-exact-forms.test.ts` (7), whose load-bearing case is the counter-direction. Analytic lane 82 files / 1246 tests — **no display assertion moved.**

## ADR-AG-085 — A number's notation depends on its POSITION; a refusal's noun depends on the KIND (#1180 + #1179)

**Requirements:** [02c](02c-requirements-analytic.md) R94 (amended). **Design:** [04c](04c-design-analytic.md) — *the tree's display formatter*. **LADDER stage:** display and refusal wording; no value, gate or comparison changes.

Both found by the operator playing round #1173, and both are that round repairing its own output.

### #1180 — `4/3` is right as a VALUE and wrong as a COEFFICIENT

*"the data panel has something weird in the 4/3 display"*. The curve row read `-4/3x + y = 0`, and that is wrong twice over: **`4/3x` is ambiguous** — it reads as `4/(3x)` at least as naturally as `(4/3)x` — and the panel typesets its rows, so the fraction stacked vertically mid-equation.

A misreadable correct equation is indistinguishable from a wrong one, which is a worse failure than the rounding [#1120](https://github.com/dcodish/geo_builder/issues/1120) was filed to fix.

**Ruling, 2026-09-17: clear the fractions** — `-4x + 3y = 0`, the form a textbook prints. Offered brackets (`-(4/3)x + y = 0`) as the smaller change and he chose this instead; recorded as given.

**What ADR-AG-084 got right and what it missed.** Its chokepoint rule — *one display formatter, so the panel and the canvas cannot print one value two ways* — is correct and unchanged. What it missed is that **a number's notation depends on its position in an expression**, which is a different axis from which surface shows it. `fmtAnalytic` is untouched; `fractionClearingFactor` is the new question, asked where a number is placed INTO an equation.

**The sub-question resolved itself by measurement.** The ruling did not say whether a STATED equation should be rewritten, and echoing the student's own form would have been defensible. Measured first: a line stated as «משוואת הישר AB היא y=(4/3)x» carries `eqSrc = null` and is rendered from its CLASSIFIED coefficients into `ax + by + c = 0`. **The row has never echoed the student's form.** So clearing fractions is the same kind of act as the normalisation already happening, applied uniformly, and no stated-vs-derived split is needed — which is the opposite of what I recommended before measuring.

Sign is not normalised: `-4x + 3y = 0`, exactly as the ruling wrote it. A convention that also flipped signs would be a second decision nobody has made. A coefficient with no small rational form (a surd) cannot be cleared, and the equation is left in decimals rather than scaled by something meaningless.

**Known sibling, not in this tree yet:** `locusFit.ts`'s `y = <slope>x + c` has the identical ambiguity and lives on PR #1172's branch. Recorded on [#1176](https://github.com/dcodish/geo_builder/issues/1176) so it is fixed when that branch is repaired, rather than discovered again in play.

### #1179 — the refusal named the right object with the wrong noun

*"the message is wrong — הנקודה l7 … it should be **the line** l7"*.

[#1145](https://github.com/dcodish/geo_builder/issues/1145) fixed which WORD a refusal quotes; this is the sentence around it. One point-shaped string served every missing reference, so two of the three refusals named the right object with the wrong kind — and **#1150's new curve check made those two far more reachable**, which is why it surfaced on the first play.

`ApplyError` gains `expected?: RefKind`, a TOKEN the locale renders — the same contract `existing` has carried since #1046, so the engine stays language-free. The kind is read from the id the parser minted (`refKindOf`): curves are prefixed so a circle and a point may both be called `I`, points are bare, so **the id alone answers it at every site** and no call site has to remember to say. That is what stops the next site handed a curve id from repeating the defect.

**Four sentences, written out, not one templated noun.** Hebrew gender carries through the whole clause — «הנקודה … הוגדרה» against «הישר … הוגדר» — so slotting a noun into one sentence would be wrong in three cases of four. An anonymous curve (`curve-<hash>`) gets the **kind-free** wording: it has no name the student wrote, so no noun would be true.

**Consequences.** `fractionClearingFactor` (`format.ts`), one scaling in `lineText`; `RefKind`/`refKindOf`/`unknownRef` (`apply.ts`), `expected` threaded through `derive` → `submit` → the store, four locale strings per language. `issue-1180-1179-equation-and-noun.test.ts` (14) — asserting the **rendered** sentence through the real locale, because a key that exists proves nothing about what a student reads. Analytic lane 84 files / 1278 tests.
## ADR-AG-086 — A locus is traced at the configuration being SHOWN, and a neighbour it cannot measure is skipped (#1176)

**Requirements:** [02c](02c-requirements-analytic.md) R87 — unchanged in what it promises; this is the implementation failing to keep it. **Design:** [04c](04c-design-analytic.md) — *the locus lane*. **LADDER stage:** the ask lane's read of the figure.

**Operator, playing PR #1172's T10:** *"when pressing show another option, the shape breaks"* — with `P` well off the circle drawn as its own locus.

### The canvas drew a curve that did not contain the point it named

`ask.ts` called `locusOf(…, [0, 1], …)` with the seed pair **hardcoded**, while the figure sits at the session's seed. From the first press of «הציגו תצורה אחרת» the drawn locus therefore belonged to a different value of the figure's free parameter:

| seed | `a` | P | traced circle | on it? |
|--:|--:|---|---|---|
| 0 | 3.458 | (108.0, −68.6) | centre (54.6, 0) r 86.4 | yes |
| 1 | 1.314 | (−4.5, −20.7) | centre (55.3, 0) r 86.4 | **no** |
| 2 | −3.400 | (21.9, −37.5) | centre (55.4, −0.2) r 86.4 | **no** — the screenshot |

The traced circle was **identical at every seed** while `P` moved. It also broke ADR-AG-072 §4's own stated side effect — *"«הציגו תצורה אחרת» then makes the circle GROW with `a` on screen"* — because it was never re-traced.

**A `Derivation` now carries its `seed`.** Not carrying it is what made the defect possible: `ask` had no way to know which configuration it was answering about. Carried rather than re-derived, so a consumer cannot disagree with its own figure by construction.

### The lock is the deliverable, not the one-line fix

All 24 locks in `issue-1136-1137-locus.test.ts` passed throughout. They assert the trace's SHAPE and the gate's VERDICT — both true — and neither asked the question that matters on a figure that moves:

> the traced point lies **on its own trace**, at the configuration shown, at every seed.

It is invisible without a parameter, because there the locus really is the same set at every seed. So the parameterised figure is not an edge case for this feature; it is the only case that can fail.

### The comparison sample must be MEASURABLE, not merely different

Exposed by the fix and owned with it. The determinacy gate answers "kind only" when the two traced sets differ — but it was also answering that when it simply **could not measure one of them**, which is not evidence about the set at all.

Measured: the plain bisector traces `x = 4` exactly at almost every configuration, but at seed 2 the free point solves out at `y ≈ 317`, so the figure is drawn fifty times larger than the points defining it and `MA = MB` pins `x` to only ~1e−4 out there. That trace legitimately fails the self-check — and as the *neighbour* of seed 1 it was suppressing the equation on a configuration that measured perfectly well. The comparison now advances past a configuration it cannot measure, bounded by `COMPARE_TRIES = 3`. It never widens what counts as agreement: two traces that both measure and disagree still print the kind alone.

**Investigated and rejected before settling there.** A finer step does not help — measured, the drift is `1.9e-3` at step 14.6, 7.3 and 3.65 alike, because it is ill-conditioning and not accumulation. Trimming the fit to the view box does not help either (`2.6e-4`, still short of the snap bar). At an ill-conditioned configuration the tool genuinely cannot verify `x = 4`, and ADR-AG-072 §7 already says what to do: **if it will not snap, print nothing.** That case is now asserted deliberately rather than worked around, so a future change which starts printing an equation there has to say why.

### Riding along: #1180's ruling reaches this surface too

`locusEquation`'s slope arm built `y = <slope>x + c`, so a fractional slope printed `y = 4/3x + 2` — the ambiguity (`4/(3x)`?) the operator reported against the panel's curve row. Same ruling, same treatment: the equation clears its fractions, `3y = 4x + 6`, using the `fractionClearingFactor` that landed with round #1173. The two axis-parallel arms keep their exact value (`x = 4/3`): nothing follows them, so there is nothing to misread.

**Consequences.** `Derivation.seed`, one call site in `ask.ts`, `COMPARE_TRIES` in `locus.ts`, the slope arm in `locusFit.ts`. `issue-1176-locus-configuration.test.ts` (11). Analytic lane 86 files / 1388 tests.

## ADR-AG-087 — the CANVAS gets a bidi chokepoint, so a label cannot reorder a number (#1191)

**Requirements:** [02c](02c-requirements-analytic.md) — **R87 unchanged**; this is the implementation failing to keep it, one surface over. **Design:** [04c](04c-design-analytic.md) — the renderer's label seam. **LADDER stage:** render only; nothing in the engine, the tracer or the ask lane moves.

**Operator, playing PR #1172.** A perpendicular bisector of `A(0,0)`–`B(6,8)`, drawn dashed, labelled on the canvas:

```
4 · ישרy = −3x + 25        ← what the student READ  (captured in a browser, before)
ישר · 4y = −3x + 25        ← what the tool computed (captured in a browser, after)
```

`3x + 4y = 25` **is** the perpendicular bisector, and the drawn `M` sits on it. The geometry, the tracer and the determinacy gate are all correct. **This is display only** — and it is the class `Figure.tsx`'s own header comment calls *"the worst class of bug this tool can have"*: the canvas silently lying about a number, reached through a label instead of a tick.

### Root cause — the canvas had no bidi chokepoint at all

The label went onto the canvas as a raw string: `ask.ts` composes `value = \`${kindWord} · ${eq}\``, `App.tsx` hands it to `buildScene` as `loci[].label`, `scene.ts` copies it into `SceneLocus.label.text`, `Figure.tsx` renders it in a plain SVG `<text>`.

The root `<svg>` sets `direction: ltr`, so the paragraph level is LTR. In `ישר · 4y = …` the `·` sits between a Hebrew word and a **European Number**; UBA N1 resolves that neutral to RTL and I1 lifts the digit above the base level, so `4 · ישר` reorders as one unit and the rest of the equation is stranded.

**Only an equation that STARTS with a digit scrambles**, which is why the locus lane's own worked example survived the build:

| locus | equation | first char | renders |
| --- | --- | --- | --- |
| circle | `(x − 16)² + y² = 625` | `(` then `x` (strong L) | correct |
| parabola | `y² = 8x` | `y` | correct |
| line, unit `y` | `y = −3x + 4`, `x = 4` | `x`/`y` | correct |
| **line, non-unit `y`** | **`4y = −3x + 25`** | **`4` (EN)** | **scrambled** |

The whole analytic renderer contained **one** bidi call — `unicodeBidi: 'isolate'` on the circle-centre label — which could not have helped: the scramble is *inside* the string, not around it. The **panel** row for the very same value was already correct, because it goes through `analyticBidi.isolateLtrRuns`. The canvas was simply a second display surface that never adopted the kit.

### Where the fix belongs, and where it deliberately does not

**Not** by reordering the label or dropping the `·`. That hides the class and leaves the next Hebrew-carrying canvas label to break: `drawnMarks` feeds `measures[].label` from the same `Answer.value` through the same unisolated `<text>`, and today those values are bare numbers — one Hebrew word away from the identical defect.

The isolation goes in `buildScene`, which already declares (#723/#1029) that *formatting is a DISPLAY concern, so it happens here* and is the single place every canvas label — locus, measure, segment length, centre, construction mark — is produced. No call site can forget, and a label added later is isolated by construction. SVG `<text>` honours U+2066/U+2069 natively; ADR-431 Am. 1's exception is about `.docx`, not the browser.

**`crossings[].sentence` is deliberately NOT isolated.** It is not canvas `<text>` — it is a `<title>` tooltip, and the same string is submitted back as an utterance when the ring is clicked. Format controls belong in display strings, never in something that round-trips into the parser.

### The import question, answered as the issue said it could be

`scene.ts` imported nothing from `i18n/`, and that is *why* the canvas never adopted the kit: reaching one function would have dragged i18next, every locale and the post-processor chain into a pure renderer.

So the kit moves to its own module (`i18n/bidi.ts`) and `i18n/index.ts` re-exports it — every existing caller is untouched, and the renderer imports two lines instead of a bootstrap. The injection alternative (`SceneKnowledge`) was rejected: **an injected isolator is one a caller can forget, and forgetting is the entire defect.** One instance also means `extraCore` cannot drift between the panel and the canvas, which two kits would eventually do.

### Verification

A unit lock over the **composed** label string, calling `ask` and `buildScene` rather than reproducing them, and comparing the canvas label to `isolateLtrRuns` of the panel's own value rather than to a spelled-out expectation (ADR-W-053) — so the assertion is *the canvas and the panel agree*, which is the real invariant. Proven to FAIL without the fix: 5 of its 6 cases go red when `lbl` is made the identity.

And, because a bidi bug is a **visual order** bug that no string assertion can see, driven in a real browser at the operator's own figure, before and after — the two renderings quoted at the top of this entry are screenshots, not reasoning.

**Consequences.** `i18n/bidi.ts` (new, the kit); `i18n/index.ts` re-exports it; `buildScene` gains one `lbl()` seam applied at all five label channels. Lock: `issue-1191-canvas-bidi.test.ts` (6), including the class assertion that every label channel is isolated and that a pure-LTR label is left alone.

## ADR-AG-088 — A name that denotes a line denotes it to EVERY surface (#1148 + #1139)

**Requirements:** [02c](02c-requirements-analytic.md) **R95** (new). **Design:** [04c](04c-design-analytic.md) — *the ask lane*, the resolver seam. **LADDER stage:** operand resolution, ahead of evaluation; no value, solve or gate semantics change.

Both reported by the operator on 2026-09-16, on the same figure, minutes apart: *"now the line is drawn but data panel still refuses"*, and *"the line itself is not clickable in this state and it should be — allowing to show distance, equation, slope."*

### The defect was not a branch; it was FIVE resolvers

Measured on `A(0,0)` `B(6,0)` `C(3,5)` + «משולש ABC» before the fix:

```
AB                  -> 6          the measure grammar resolves a two-point line
שיפוע AB            -> 0          the slope branch resolves a two-point line
משוואת AB           -> MISSING    the equation branch does not
המרחק מ-C לישר AB   -> 5          the ask lane answers it
menu(C)             -> ["C"]      ...and the click menu never offers it
```

`AB` is one line. It existed to three resolvers, not to the fourth, and the fifth — the click menu's own enumeration of "what is there to ask about" — could not see it at all. Fixing the equation branch would have answered the operator and **guaranteed the next question kind repeats it**, which is the class and not the input (standing rule 1). #1139 was already the third sighting; the menu's copy was the fourth.

### One question, asked in two directions

There are exactly two questions here, and `app/lines.ts` is now the only place either is answered:

- **resolution** — `lineNamed(figure, name)`: which line is this, in the configuration drawn?
- **enumeration** — `lineNamesOf(construction)`: which names denote a line at all?

They are tied by an invariant the suite asserts by **calling both surfaces** rather than by listing what either should say: *every name the enumeration offers resolves, and every sentence the menu composes is one the ask lane answers.* A menu entry whose answer would be «לא הבנתי» is the menu lying about the figure, and that is now a test failure instead of a bug report.

The enumeration's three sources are the named line curves it always had, plus **every stated segment and every side of every polygon** — the half #1139 was filed about. A triangle's sides are lines the student can see, and before this they were lines to nobody.

### Why the coefficients are normalized, and why NOT by `hypot`

A line through two points is built as `a = Δy`, `b = −Δx`, so its coefficients scale with how far apart the points happen to sit. That scale is not part of the line, and it breaks two things at once: `A(0,0)`–`B(6,0)` printed «-6y = 0» instead of «y = 0», and `isKnowledge` over raw coefficients would call a perfectly determined line *unknown* merely because its points slid along it between configurations.

The obvious normal form — divide by `hypot(a, b)` — was measured and **rejected**: it makes `A(0,0)`–`C(3,5)` print «0.86x - 0.51y = 0», because 5/√34 is a surd and ADR-AG-085's `fractionClearingFactor` cannot clear what is not rational. Dividing by the **leading coefficient** keeps a rational line rational — `(5, −3, 0)` → `(1, −0.6, 0)` → cleared back to «5x - 3y = 0» — and fixes the sign for free.

Every existing consumer is unaffected by construction: the slope is `-a/b` and the point-line distance divides by `hypot(a, b)`, so both are scale-invariant.

**The property this buys, and the reason it is not cosmetic.** On «A(0,0)» + «B על הישר y=x», the *line* `AB` is `x - y = 0` in every configuration while `B`'s *position* is open. The tool now answers the equation and still refuses the length — the honesty gate at the right granularity, which raw coefficients could not express.

### One addition the fix forced, at the display chokepoint

`lineText`'s magnitude rule (ADR-AG-085 / #1119) tested `Math.abs(k) === 1` — exact equality on a float. A line through two SOLVED points carries the solve's tolerance: «B על הישר y=x» lands at `y − x ≈ 3e-8`, so `AB` has `b = -1.0000000124` and the rule printed «x - 1y = 0» for a coefficient `fmt` was about to round to `1` anyway. The rule is about the number the STUDENT sees, so it now asks `fmt`. This was unreachable before — a two-point line had no equation to print — and it is a latent defect for any solver-derived curve row, not only this one.

### Consequences

`app/lines.ts` (new — the seam); `ask.ts` loses its private `lineNamed` and its equation branch resolves through the shared path with the `isKnowledge` gate the slope branch already used; `measurable.ts` enumerates through `lineNamesOf` and grows `measurablesOfSegment`, with the three line questions extracted to ONE list both the curve and the segment paths call; `Figure.tsx` reports a third pick kind (`segment`) over a transparent-stroke hit layer, so a drawn side is clickable at all; one line in `App.tsx`'s `lineText`.

**The opposite side is offered first** on a vertex click: on a triangle, the distance from `C` to `AB` is the height — the question the student came to ask. The two sides through `C` are legitimate questions with legitimate answers (zero) and are still offered, just not ahead of it.

`issue-1148-1139-one-resolver.test.ts` (12) — **proven to fail without the fix**: making the two seams the identity turns 7 of the 12 red. Analytic lane 85 files / 1364 tests green; `smoke:visual --app analytic` passed and the screenshots were read.

## ADR-AG-089 — A measure's operands decide their own roles; word order does not (#1151)

**Requirements:** [02c](02c-requirements-analytic.md) **R96** (new). **Design:** [04c](04c-design-analytic.md) — *the measure grammar*. **LADDER stage:** parse-time operand classification, ahead of evaluation; no solve or gate change.

Reported by the operator: «המרחק בין AB ל-C» is unreadable while «המרחק בין C ל-AB» answers, and «המרחק בין A ל-B» — two points he had pinned — comes back «לא ניתן לחשב».

### Measured, and worse than reported

On `A(0,0)` `B(6,0)` `C(3,5)` + «משולש ABC»:

```
המרחק בין C ל-AB          -> 5            (point, then line)
המרחק בין AB ל-C          -> «לא הבנתי»   the SAME question, other order
המרחק בין A ל-B           -> null         two points, read as a line named «B»
המרחק בין C ל-QR          -> null         a silent statement about a figure with no QR
distance between C and AB -> null         the token missed -- and LENGTH_TOKEN then ate «AB»
```

The English row is the one that matters most and the issue did not state it: when the distance token failed, `LENGTH_TOKEN` claimed `AB` out of the same sentence, so the student asking for a **distance to a line** was answered about **a different measurement**. A wrong answer delivered confidently is the class this tool exists to avoid; the other rows are merely refusals.

### The defect: POSITION was doing the operands' job

`POINT_LINE_TOKEN` required the point first and the line second. Every spelling that inverted them fell out of the grammar, and #1134 had already had to repair the same token once for the same reason — the previous fix added a second word order as a second alternation, which widened the symptom without touching the cause.

**Roles now come from the operands, and an operand's own spelling settles it:** one letter is a point and can be nothing else; two letters or a curve name denote a line. That decision needs no figure, so `lengths.ts` keeps the layering the rest of the file is careful about — it still knows nothing about objects.

| operands | the question |
| --- | --- |
| `A`, `B` | the plain distance — **the same term «AB» produces**, so one question is one term |
| `C`, `AB` (either order) | the point-to-line distance |
| `AB`, `l1` | not read — see below |

### Frames, not one positional mega-regex

Each spelling is a small pattern with the SAME two operand slots, applied in turn, and the roles are decided once for all of them. That is what retires the shape of #1134's own bug — a four-group token where only the first pair was read, so the second word order matched and then resolved to nothing at all.

The frames are ordered most-specific-first, and the English `between … and …` joins as a frame rather than as a parallel rule, so it cannot drift from its Hebrew twin.

### Two lines is a CAPABILITY, and is deliberately NOT built here

The issue's plan lists `line + line → the parallel-lines distance`. The widened token can now reach that pair, and it is left **unconsumed** — «המרחק בין AB ל-l1» still answers «לא הבנתי», exactly as today. Two reasons, and the first is binding: CLAUDE.md forbids building a missing capability under a bug's banner. The second is that the plan's stated fallback — *"an honest refusal otherwise"* — is not obviously right, because two non-parallel lines are at distance **zero**, so refusing would itself be a small dishonesty. That is a product question and it is not this fix's to answer. Filed separately.

### Class check (standing rule 1)

The other multi-operand measures were swept and cannot carry the defect: `AREA_TOKEN` reads ONE run of vertices, and `LENGTH_TOKEN` reads two interchangeable points. Asserted rather than argued, so an edit that later gives either an asymmetric operand pair fails the lock.

The **catalog** obligation in the plan does not apply: `catalogAnalytic.ts` teaches CONSTRUCTION commands and has no ask-lane rows at all. The ask lane's teaching surface is the click menu, which ADR-AG-088 widened in this same round.

### The silent null is closed too

Only the POINT operands were checked for existence, so «המרחק בין C ל-QR» answered `null` — «לא ניתן לחשב מהנתונים», a statement ABOUT the figure, for a question naming something the figure has not got. The line operand now goes through the same check and gets #1111's missing-object message.

### Consequences

`lengths.ts`: `POINT_LINE_TOKEN` → `DISTANCE_FRAMES` + one role decision; `ask.ts`: the line operand joins the existence check. `issue-1151-operand-roles.test.ts` (16) — **proven to fail without the fix**: restoring the old token turns 9 of the 16 red.

**Found while measuring, filed not folded:** [#1201](https://github.com/dcodish/geo_builder/issues/1201) — «המרחק מ-A לישר l1 = 5» is accepted, reported satisfied, and not honoured (the figure draws 2.13). Measured identically on `origin/main`, so it is pre-existing; it is a solve defect, not a grammar one, and outside this round's composition.

## ADR-AG-090 — A curve keeps its identity when its representation changes (#1149)

**Requirements:** [02c](02c-requirements-analytic.md) **R95** (extended — a stated curve is nameable however it entered the figure). **Design:** [04c](04c-design-analytic.md) — *curve identity and the promotion path*. **LADDER stage:** object construction; no solve, gate or value change.

A line first used as a CARRIER and then stated is PROMOTED — one object, now drawn (#1076, and ADR-AG-023's content-derived ids are what make the two sentences ONE object). The promotion rebuilt that object from the carrier alone, and `words()` can name an anonymous curve only by its equation (ADR-AG-056).

### Measured — the same two lines, two behaviours

```
y=2x+1 · y=-x+15                                    -> one crossing offered at (4.667, 10.333)
«נקודה A על הישר y=-x+15» … then the same two lines -> NO crossing offered
```

Before the fix the promoted objects carried `label = { name: '' }` — no kind, no `eqSrc`. The student's own text was discarded **twice**, which is why fixing one end would have left the hole open:

1. `parseAnalytic.ts` minted the carrier with an empty label, though the equation text was in its hand one line earlier;
2. `apply.ts`'s promotion returned `{ ...prior, stated: true }`, preserving that emptiness and dropping the stated sentence's label.

### The fix, and what it is NOT

The carrier now carries `eqSrc`, and the promotion merges the incoming label over the prior — a name the prior already holds is never overwritten, since that is the student's own.

Deliberately **not** a tolerant read at `crossings.ts:122`. Making the consumer accept a missing `eqSrc` would hide a lossy mint behind a defensive branch and leave every other consumer of the label broken in silence; the defect is that the object lost its identity, not that someone noticed.

No `kind` is asserted on the carrier: the noun that reached that branch may be «ישר», but the FIT is what classifies a curve, and claiming a kind we have not established would be a second source of truth for it.

### The property, not the symptom

What is locked is stronger than "a crossing appears": **a promoted carrier is byte-identical to a curve stated outright.** Measured both ways, the curve objects now compare equal, so a future path that rebuilds objects without their labels fails the lock rather than being reported a fourth time.

The carrier-only case is unchanged and now holds for the reason we actually mean: a carrier is not drawn (#1076), so no ring belongs to it — it is excluded because it is not `stated`, rather than as a side effect of a field nobody filled in.

### Class check (standing rule 1) — swept, and one more found

`parseAnalytic.ts:1686` is the ONLY carrier mint, so the reported path is a single site. The sweep of every other transition a curve can undergo found the same symptom at a seam that never HAD text: `evaluate.ts`'s `circle-at` and `line-at` derive `stated` curves with no `eqSrc`, so «דרך P עובר ישר מקביל ל AB» is drawn, its equation is printed in the panel, and it offers no crossing ring. Measured: `y = 5` and `x = 2` genuinely meet at (2, 5) and no ring is offered.

That is the OTHER half of the issue's point 3 — synthesising an identity for a curve whose text was never written — and it is a different mechanism with an honesty gate of its own (a sampled equation must not be printed as a name). Filed as **[#1202](https://github.com/dcodish/geo_builder/issues/1202)** rather than built here.

### Consequences

`parseAnalytic.ts` (the carrier mint gains `eqSrc`), `apply.ts` (the promotion merges labels). `issue-1149-promotion-identity.test.ts` (6) — **proven to fail without the fix**: all six go red when both edits are reverted. Analytic lane 87 files / 1386 tests green.

## ADR-AG-091 — A measure term the solver cannot resolve is a FALSE GREEN, not a missing opinion (#1201)

**Requirements:** [02c](02c-requirements-analytic.md) **R97** (new). **Design:** [04c](04c-design-analytic.md) — *the resolver seam*, extended one layer down. **LADDER stage:** residual evaluation; no parse, gate or display change. **P1 — prod honesty.**

### The symptom

```
נתון הישר l1: y=0
A על הישר x=0
המרחק מ-A לישר l1 = 5
```

`A` rides `x = 0`, so it is `(0, t)` and its distance to `l1` is `|t|`. The statement asks for `|t| = 5` and is satisfiable twice over. Measured:

```
faults              []                 -- nothing refused
figure.unsatisfied  []                 -- the engine reported it SATISFIED
A                   (0, -2.130393)     -- distance 2.13, not 5
```

The tool accepted the given, built the right constraint for it, reported nothing wrong, and drew a figure contradicting it. A student reading `2.13` off that canvas was told something false, while the panel still listed the given as one that held.

### One cause, and it explains BOTH halves

`residual()` computed a `length-eq` as `evalLengthExpr(k.left, at, env)` — **three arguments**. The fourth is `lineAt`, which resolves a `point-line` term's line. Without it the term evaluated to `null`, so the whole residual came back `null`. And `null` is read two different ways, each correct on its own:

| reader | what it does with `null` | consequence here |
| --- | --- | --- |
| the SOLVE (`residual(...) ?? [0]`) | treats it as **zero — satisfied** | the constraint is never driven |
| the REPORT (`if (r === null) continue`) | treats it as **cannot be judged** | it never reaches `unsatisfied` |

`?? [0]` is not itself a bug: the least-squares residual vector must keep a constant dimension across iterates, so a term that vanishes at one parameter value has to contribute something. The defect is that a **permanent wiring gap produced the same `null` as transient vacancy**, and transient vacancy is the only thing that reading is safe for. That is why the failure was silent rather than merely wrong, and it is the class this ADR is really about.

### The fix, and why the resolver MOVED rather than being written again

`residual` gains `lineAt?: (name) => {a,b,c} | null`, supplied by `evaluate.ts` beside the `curveAt` it already builds, and threaded into both `evalLengthExpr` calls.

The tempting shortcut was to give `solve.ts` a small line resolver of its own. **That is precisely the defect ADR-AG-088 retired three commits earlier** — one object resolved several ways, so a capability added to one reader goes missing from the others in silence. So the resolution moved DOWN into `engine/lines.ts`, and `app/lines.ts` (the ask lane and the click menu) now builds on it rather than beside it. One object, one answer, now across three layers.

It resolves against a CONFIGURATION rather than a `Figure`, because the solver asks at every iterate where no figure exists yet — taking a `Figure` would have forced one to be built per iteration.

### Measured after

```
seeds 0,1,2    A = (0, ±5.000)         the given is honoured, and BOTH signs occur across seeds
A(0,0) pinned  faults: unsatisfiable   the impossible case is refused, naming the student's sentence
C on x=3, «המרחק מ-C לישר AB = 4»      C lands at |y| = 4.000 — a two-point line drives identically
```

The sign result matters as much as the magnitude: a fix that drove `|t| = 5` by pinning `t = -5` would satisfy the given and quietly delete a configuration the student is entitled to cycle to (ADR-052). The lock asserts both signs occur.

### A narrow false refusal, stated rather than hidden

Where the LINE's own endpoint is the only carrier — `A(0,0)`, `B` on `x=10`, `C(3,4)`, «המרחק מ-C לישר AB = 2» — the solve now has a live residual and **6 of 8 seeds reach it exactly** (`B = (10, 5.7)`, distance 2.000). Seeds 0 and 5 diverge (`B` runs to `y ≈ -97775`) and the step is REFUSED.

That is a false refusal on a satisfiable statement, and it is a **regression in convenience traded for a fix in honesty**: before, this case was accepted in silence with a wrong figure. A refusal keeps the prior figure (`decideSubmit` discards a faulting line), so the runaway position is never drawn. The divergence is a solve-convergence question of the same family as [#1182](https://github.com/dcodish/geo_builder/issues/1182) — whose re-seed ruling would cover exactly this — and it is not a wiring question, so it is not fixed here. Noted on that issue.

### Consequences

`engine/lines.ts` (new — the resolution, moved down from `app/`), `app/lines.ts` builds on it, `solve.ts` takes and threads `lineAt`, `evaluate.ts` gains `lineAtOf` and supplies it at all three `residual` call sites (and exports both builders, so the lock calls them instead of copying them).

`issue-1201-point-line-residual.test.ts` (6) — **proven to fail without the fix**: restoring the three-argument call turns 5 of the 6 red. Analytic lane 89 files / 1397 tests green.

## ADR-AG-092 — One position, one name: the invariant lives at the FIGURE (#1153)

**Requirements:** [02c](02c-requirements-analytic.md) **R98** (new). **Design:** [04c](04c-design-analytic.md) — *naming paths and the shared check*. **LADDER stage:** fact application, before the object is minted; no solve, display or gate change.

**Operator ruling, 2026-09-17:** the second naming REFUSES and names the holder. Renaming is an explicit action the student takes — nothing changes silently. (2-D answers the same action by renaming today; the operator ruled that 2-D comes into line, filed as [#1164](https://github.com/dcodish/geo_builder/issues/1164). This issue does not wait for it.)

### Measured

```
נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9
P מרכז המעגל I  ->  [P(3,4)]                  faults []
O מרכז המעגל I  ->  [P(3,4), O(3,4)]          faults []
T מרכז המעגל I  ->  [P(3,4), O(3,4), T(3,4)]  faults []
```

Three letters stacked on one position, nothing said, and the data panel then listed three points the student could not tell apart.

### Where the check goes, and why not in the centre rule

This class has now appeared three times — [#1113](https://github.com/dcodish/geo_builder/issues/1113) (crossings), this one (centres), and the duplicate-curve mint measured on [#1126](https://github.com/dcodish/geo_builder/issues/1126). A check inside the centre branch is the patch shape and would guarantee a fourth.

So it sits at the **one place a derived object is minted** in `applyFact`. All seven `DerivedRule` kinds pass through it — midpoint, centroid, incentre, orthocentre, circumcentre, diagonals, circle-centre — so the naming family reaches one check rather than each rule growing its own.

### The test is STRUCTURAL, and that is what keeps it honest

Two rules that define the same point ARE the same point — decidable from the rules alone, with no coordinates and no tolerance. `sameDerivation` answers it per rule, and each answer is a small statement about the geometry:

| rule | same when |
| --- | --- |
| `midpoint` | the same unordered pair — the midpoint of `AB` is the midpoint of `BA` |
| `centroid` · `incentre` · `orthocentre` · `circumcentre` | the same three vertices in any order — a triangle is a set |
| `diagonals` | the same RING up to rotation and reflection — **not** a set: `ABCD` and `ABDC` are different quadrilaterals whose diagonals meet in different places |
| `circle-centre` | the same parent curve |

The switch is **exhaustive** (`const undecided: never`): a new `DerivedRule` must decide whether two of its instances are the same point, and a compile error is how that question gets asked — rather than the new rule silently inheriting "never the same" and reopening the class.

### The sub-case that is NOT decided here

Measured in the same pass:

```
A(3,4) · B(3,4)  ->  two points at one position, faults []
```

A **positional** check would have caught this too. It is deliberately left alone: the operator ruled on *naming one object twice*, and two independently stated points that happen to coincide is a different sentence. A student may state two points a later constraint separates, and under [ADR-052](06-decisions.md#adr-052) an unstated magnitude is a free DOF — so the coincidence may be incidental rather than asserted. **Escalated on the issue rather than answered**, and locked as unchanged so a future session cannot fold it in by accident.

### The rename OFFER is not in this slice, and that is stated

The ruling sketches `[ שנה את השם ל-O ]` beside the refusal. **Analytic has no rename action at all** — that is [#1154](https://github.com/dcodish/geo_builder/issues/1154), which ports 2-D's rename family — so a button here would call nothing. The refusal therefore tells the student the concrete action available today: delete the line that named the holder and write it again. The offer lands with #1154 and is recorded there.

### A sibling that looks identical and is not

[#1167](https://github.com/dcodish/geo_builder/issues/1167) reads to a student as the same thing — *"two points on the same location"* — and this check will NOT fix it: measured, its `O` is a hardcoded string in a panel description, not an object, so no naming path ran. **#1153/#1126/#1164 are about objects sharing a position; #1167 is about descriptions inventing letters for positions.** Recorded here so the two stay deliberate siblings rather than being closed as duplicates.

### Consequences

`engine/sameDerivation.ts` (new), one guard in `applyFact`'s derived-mint, a new `already-named` error code carrying `holder` (a NAME, never a sentence — the engine stays language-free) threaded through `LineFault` → `decideSubmit` → the locale, and one He/En string pair.

`issue-1153-one-position-one-name.test.ts` (9) — **proven to fail without the fix**: disabling the guard turns 4 of the 9 red. Analytic lane 90 files / 1406 tests green.

## ADR-AG-093 — The relation's SYMBOLS are the exam's notation, and the connector is optional (#1160)

**Requirements:** [02c](02c-requirements-analytic.md) — R95's "every spelling of one question" widened to the relation family; no new numbered row. **Design:** [04c](04c-design-analytic.md) — *the relation rule's notations*. **LADDER stage:** parse; no engine, solve, gate or display change.

Not reported by the operator — surfaced by probing the neighbouring spellings of the sentence he typed for #1159.

### The capability existed; only its notation was unreadable

```
AB מקביל ל-DC        ✅        AB ∥ DC      ❌ not-handled
AB מקבילה ל-DC       ✅        AB || DC     ❌ not-handled
הצלע AB מאונכת לצלע BC ✅      AB ⊥ DC      ❌ not-handled
AB is parallel to DC ✅        AB מקביל DC  ❌ not-handled  (no connector)
```

The word forms are in good shape — the full inflection run, the `ל` variants, the `הצלע…לצלע` frame and the English all land. The gap is exactly the **symbol** row plus the connector-less word form. A student who writes what the exam prints is told the tool does not understand them, for a relation it implements and tests thoroughly.

This is the tree's recurring **one-spelling gate**: #1081 counted five, and #1128 and #1151 are the same shape. It also unblocks [#1129](https://github.com/dcodish/geo_builder/issues/1129), which may not offer a `∥` or `⊥` palette chip while the glyph does not parse.

### Deviation from the plan, and why — the chokepoint it named does not carry these lines

The issue's plan put the symbol normalisation in `engine/expr.ts`, *"the single existing normalisation chokepoint"*, reasoning that `²`≡`^2` and `√`≡`sqrt` are the same kind of fact.

**Measured, the line never goes through it.** `normalizeMath` is applied to *equation fragments* — four call sites, each on a sub-string that is already known to be an expression — and never to the whole utterance. A symbol rewritten there would never be seen by the relation rule, which matches raw text. It is also not the same kind of fact: `∥` is a relation VERB, and teaching a math-expression normaliser to rewrite Hebrew verbs would be the second normaliser the plan was trying to avoid.

So the change is at the other chokepoint the plan names — the relation rule itself.

### A second SPELLING of one rule, not a second rule

`RELATION_SYM` is its own pattern because a symbol needs no connector and no surrounding spaces («AB∥DC» is one token to a student), while the word forms require `ל`. It feeds the **same handler**, resolves both operands through the **same `direction()`**, and produces the same `relation` constraint — so every operand kind (segment, polygon side, named line, axis) arrives with nothing to wire.

The connector became optional in the same edit, which is what fixes «AB מקביל DC» and «AB parallel DC» — one change rather than two, as the plan asked.

### The counter-direction, and one symbol deliberately refused

`//` is **not** admitted. It is the one candidate that collides with real mathematics, and this rule runs BEFORE the equation parser — so a line it claimed wrongly would be refused as a *bad operand* rather than falling through to be read as the equation it is. The issue's own plan authorises this: a narrower symbol set is fine, a mis-parsed equation is not. Asserted in the lock so the exclusion is a decision on the record rather than an oversight someone later "fixes".

Both `⊥` (U+22A5) and `⟂` (U+27C2) are admitted: they are indistinguishable on screen and both get typed.

Measured unchanged: `y=2x+1`, `y = 1/2`, `(x-3)^2+(y-4)^2=9`, `נתון הישר l1: y=x`, `A(3,4)`, `משולש ABC`. An operand the figure cannot read is still the owned `bad-operand` refusal (ADR-AG-017), not a fall-through.

### Consequences

`parseAnalytic.ts`: `RELATION_SYM`, an optional connector in `RELATION_HE`/`RELATION_EN`, and the parallel test widened to the symbols. `catalogAnalytic.ts` gains the two symbol rows — the catalog is the coverage map, so the guard re-parses them in both languages and a symbol that stops parsing fails the suite instead of becoming documentation.

`issue-1160-relation-symbols.test.ts` (12) — **proven to fail without the fix**: removing the symbol pattern turns 9 of the 12 red. Analytic lane 90 files / 1410 tests green.

## ADR-AG-094 — An answer and its derivation are two rows, and the derivation folds (#1206)

**Requirements:** [02c](02c-requirements-analytic.md) **R100** (new). **Design:** [04c](04c-design-analytic.md) — the ask lane's answer row. **LADDER stage:** display only.

**Operator, 2026-09-18, playing T1:** *"having all the equations in one line doesnt look nice so we should have each line on a new row. we should be able to collapse the items so if user doesnt want to see them, only the equation is shown"*.

### What he saw

```
✕  משוואת הישר CA: 5x - 3y = 0   m = (0-5)/(0-3),  y - 5 = m(x - 3)
✕  משוואת AB: y = 0              m = (0-0)/(6-0),  y - 0 = m(x - 0)
```

### Root cause — a style that could never apply

`askRow` is `display: flex; align-items: baseline`, and the trace was a **flex sibling** of the answer. So the two shared one baseline by construction, and the `marginTop: 2` on `askTrace` was inert — the layout could not have honoured it however the trace was styled.

The trace now lives INSIDE the answer's column (`askAnswerCol`, `flex-direction: column`), which is what puts it on its own line. The row's `align-items` becomes `flex-start` so the `✕` stays beside the answer's first line rather than centring against a two-line block.

### Shown by default, and that is a decision

`<details open>`. [#1053](https://github.com/dcodish/geo_builder/issues/1053) is an operator ruling that the method is part of the answer — *"we don't just show the result — we show what to use to get to this result"* — so collapsing by default would quietly reverse it. The request is an opt-out, and `<details>` provides one for free: keyboard-reachable, and out of the accessibility tree when closed, with no state for the component to hold.

### The native marker is kept, and looking is why

`list-style: none` on the summary was written first and **removed the disclosure triangle**, leaving the label reading as inert grey text with nothing to say it could be clicked. Caught by rendering the row in a real browser and looking at it — which is the only way a layout change is actually judged, and the reason the verification for this one is a screenshot rather than a unit test.

### Why the lock is not a render test

The analytic panel's JSX lives entirely in `App.tsx`; there is no extracted row component, and extracting one to make this assertable would set a structural precedent well beyond a layout fix. So the invariant was verified by driving the real page — `details` present, `open` by default, nested inside the column, and its top edge below the answer's bottom edge — and the locale strings are locked by unit test. Stated here rather than left as a silent gap: **an extracted `AskAnswerRow` is what a unit lock would need**, and it is the right first step whenever this row is next touched.

---

## ADR-AG-095 — A menu entry whose answer can only be zero is not offered (#1207, amends ADR-AG-088)

**Requirements:** [02c](02c-requirements-analytic.md) — the measure menu's contract gains its second half. **Design:** [04c](04c-design-analytic.md) — the measure menu. **LADDER stage:** menu enumeration; no evaluation change.

**Operator, 2026-09-18, playing T2:** *"there is no need to show the distance to segments that make up that point since they will be 0 and no one would want to ask that"*.

Clicking `C` offered the distance to `AB` — the height, and the question the student came to ask — and also to `BC` and `CA`, which are distances from a point to a line **through that point**: zero by construction, at every configuration of every figure.

### This overrides a choice ADR-AG-088 made deliberately

That ADR kept them and merely ordered the height first, reasoning that the menu's contract is *«an option is offered iff the ask lane answers it»* and the lane does answer `0`. The contract holds either way, so this is a product judgement rather than a defect — and a session reading only ADR-AG-088 would have had every reason to put them back. **The contract is a floor, not a licence to offer everything that clears it**, and two dead entries buried the one worth asking.

### Structural, not positional — the boundary that matters

The exclusion is by the NAME the line is made of (`asPair` contains the clicked id), never by measuring the answer. A named line that merely *happens* to pass through the point today also answers 0, but it is not made OF the point: another configuration may move it off, and the student may genuinely want to ask. A "drop it if the answer is zero" test would have removed it wrongly, and that case is locked.

`issue-1207-no-zero-distances.test.ts` (5), and ADR-AG-088's own case was rewritten to assert the exact list — with the others gone, its `toContain` would have passed for a weaker reason than the one that is true.

## ADR-AG-096 — The view belongs to the figure it was computed for (#1209)

**Requirements:** [02c](02c-requirements-analytic.md) **R101** (new). **Design:** [04c](04c-design-analytic.md) — the canvas view's lifetime. **LADDER stage:** view state; no engine, solve or display-format change.

**Operator, 2026-09-18, playing T13:** *"after the 2nd input, the canvas is not centred in a way the points are visible"* — with a screenshot of an **empty canvas** whose banner read «טענתי את השרטוט — 2 נתונים» and whose data panel listed `A = (0, y_A)` and `l1: y = 0` perfectly.

### The engine was innocent

The figure's own box is correct at every step:

```
«נתון הישר l1: y=0»       box [-10,-10 .. 10,10]
«A על הישר x=0»           box [-1.4,-2.4 .. 1.4,0.3]    A(0, -2.1)
«המרחק מ-A לישר l1 = 5»   box [-3.3,-5.7 .. 3.2,0.7]    A(0, -5.0)
```

### Root cause — a load replaces the figure and keeps the view

Pan and zoom are a transform ON TOP of the figure's box. `onLoadFile` calls `restore(...)`, re-derives for the audit, sets the banner — and **never touches `view`**. Every other `setView` in the file is a user gesture: the wheel, a drag, the ± buttons, the reset button.

So the previous figure's transform is applied to a new figure it was never computed for. `clearSession` had the same gap.

Both now go through one `showWholeFigure()` rather than each remembering — which is the shape `clearAll`'s own comment records as having been reintroduced by a third and fourth product.

### Verified in the real app, because the defect is one of geometry on screen

Driven in a browser, counting the drawn points inside the canvas box:

```
after building a figure          6/6 points on screen
after zooming into a corner      0/6            ← the operator's blank canvas, reproduced
after «נקה הכל» + rebuilding     6/6            ← the fix
zoomed into a corner             0/4
after LOADING a save file        2/2            ← the reported path
```

That is the lock for this one: the panel's JSX and the view state live in `App.tsx` with no extracted component, so a unit test cannot reach them — the same constraint ADR-AG-094 records. Stated rather than left silent.

### Why it matters more than it looks

A loaded figure that appears empty reads as **data loss** — the student's own save looks like it failed to open, and nothing on screen says otherwise.

## ADR-AG-097 — A curve row leads with its EQUATION; the properties fold beneath it (#1212)

**Requirements:** [02c](02c-requirements-analytic.md) **R102** (new), serving R99. **Design:**
[04c](04c-design-analytic.md) — *A curve reads as an equation plus its properties*. **LADDER stage:**
display only — no engine, solve or parse change, and nothing new is computed.

**Operator, 2026-09-18, playing T18:** *"the circle equation is not an equation. under equations we should
see the equation and then we can have the center and radius. these should be collapsable like i requested
for the line equations"*.

```
משוואות
מעגל I: O(3, 4), r = 3        ← not an equation
l1: -2x + y - 1 = 0           ← an equation
```

He is right twice: the row is not an equation, and it sits under a heading ADR-AG-092 renamed to
«משוואות» hours earlier on his own report. That rename made this visible; it did not cause it.

### Measured — two of four kinds printed no equation at all

| kind | before | leads with an equation? |
| --- | --- | --- |
| line | `-2x + y - 1 = 0` | yes |
| **circle** | `O(3, 4), r = 3` | **no — none at all** |
| **ellipse** | `a = 4, b = 3, F₁(…), F₂(…)` | **no — none at all** |
| parabola | `y² = 8x, F(2, 0), x = -2` | yes, properties run on inline |

Every one of those equations was derivable from what the row already held — a circle knows `cx, cy, r`;
an ellipse knows `a, b`. Nothing had to be computed that was not computed already.

### Root cause — a stated rule that did not survive being played

`describeCurve` carried its reasoning in a comment: *"deliberately DESCRIPTIVE (centre, radius, focus)
rather than a restatement of the equation the student just typed — the memorised triple (`y²=2px` →
focus, directrix) is exactly what the formula sheet withholds."*

The instinct is sound and the premise inverts an honesty invariant. Measured against the only way this
tree lets a circle be stated — by its equation; «רדיוס» appears nowhere in the parser — the student types
«נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9» and the panel answers `O(3, 4), r = 3`.

That is not declining to restate the given. It is **replacing the given with a derived form**, under a
heading that promises equations — and *"everything the student stated is visible"* is the invariant it
trades away. «משוואת המעגל» then answered the centre and radius, which is a different question than the
one asked. The ellipse is the same trade: its equation was typed too, and the row showed only its axes
and foci.

Avoiding redundancy is a real instinct, and it was spent against the wrong thing. The derived form is the
redundant one.

So: the equation leads, and the properties become supporting detail under the same `<details>` disclosure
ADR-AG-094 gave the ask lane's working. Open by default, deliberately — for a circle given by its centre,
those properties ARE the givens, and folding them shut by default would hide what the student stated. A
line has no `details` and gets no disclosure; its row is untouched.

### The move that makes the lock possible

`describeCurve` and `lineText` were module-private component code in `App.tsx`, so the ask lane could
only reach the formatter by INJECTION — and **every test but one injected a stub** (`() => ''`,
`() => 'curve'`, `` `kind:${c.kind}` ``). A stub agrees with anything, so "«משוואת I» answers the
equation" could not have been asserted at all; `issue-1117` had already noticed the hazard and answered it
by hand-writing a faithful stub, with the comment *"a stub returning '' hides the entire defect"*. That is
the argument for the import, not for a better stub — [ADR-W-053](06w-decisions-workspace.md#adr-w-053).

`app/curveText.ts` is now the one home; `ask()` imports it and lost the parameter; thirteen test files
dropped their stubs. The shared formatting is a structural fact rather than a convention every call site
has to keep.

### Notation is a rule, not a template

The line terms' rules apply to all four kinds — a zero offset writes no bracket (`x²`, not `(x - 0)²`), a
negative one flips the sign (`(x + 2)²`, not `(x - -2)²`), a unit coefficient is suppressed (`y² = x`).
Numbers go through `fmtAnalytic` (ADR-AG-084), so fractions and exact forms (#1120) are already right.

`src-analytic/__tests__/issue-1212-curve-equation.test.ts` (8) calls `curveParts` and `ask` directly,
including the operator's own circle end to end and the #1023 guarantee that an unfixed parabola still
shows its open form rather than an invented equation.

## ADR-AG-098 — An answer can be a FACT about the figure, not only a value or an absence (#1223)

**Requirements:** [02c](02c-requirements-analytic.md) — honesty: an error message never misdescribes the givens; no new row. **Design:** [04c](04c-design-analytic.md) — the `Answer` outcomes. **LADDER stage:** display only. **Extends:** ADR-AG-0xx (#1111's `missing`).

**Operator, 2026-09-19:** *"when i ask for שיפוע PB it says it cannot be claculated which is wrong. its just that the slope is not defined"* — on `A(0,0)`, `B(3,4)`, `C(6,0)`, `P(3,0)`, where `B` and `P` share an x.

### The panel contradicted itself on one screen

```
הכול נקבע על-ידי הנתונים          "everything is determined by the givens"
שיפוע BP = לא ניתן לחשב מהנתונים   "cannot be computed from the givens"
```

Both cannot be true, and the first is the correct one. The slope of `BP` is not uncomputable — it does not **exist**, which is a fact about the geometry and a perfectly good answer.

### Root cause — the rule was written down, and the return value contradicted it

```js
// A vertical line HAS no slope, and that is an answer about the figure rather than a failure.
if (Math.abs(line.b) < 1e-12) return { question, value: null };
```

The comment states the decision exactly. The next line returns `null`, which is the **failure channel**, because `Answer` had no way to say *vertical*. So one `null` carried three situations and the component guessed between two of them:

```js
a.value ?? t(figureIsOpen(d) ? 'askOpen' : 'askNoValue')
```

| what is true | what the student was told |
| --- | --- |
| the figure is still open | «עדיין לא נקבע מהנתונים» — correct |
| genuinely not computable | «לא ניתן לחשב מהנתונים» — correct |
| **vertical: determined, no slope** | «לא ניתן לחשב מהנתונים» — **false** |

The figure is determined, so `figureIsOpen` is false and the third case landed on the "your givens are insufficient" wording. Not cosmetic: it sends a student looking for a missing given on a figure that has none.

### The shape of the fix, which this tree has made before

`Answer` gains `fact?: 'vertical'` — a fourth outcome beside `value`, `unreadable` and `missing`. That is the identical move #1111 made when it split `missing` out of `unreadable`, for the identical reason recorded there: *"a student told their sentence was not understood will rewrite the sentence for ever, because the sentence was never the problem."*

A **token**, not a sentence, per ADR-AG-085 — `ask.ts` is the lane's engine and holds no locale.

The component renders it with **`slopeVertical`, the string the «שיפועים» section already prints** for a vertical segment («אנכי (אין שיפוע)»). Reusing it is the point: two surfaces that computed the same fact would otherwise be free to word it differently, and that drift is what #1102 named.

### What the fix must not swallow

`null` legitimately means *the givens do not fix this*, and that wording is right. The bug was only that a determined-but-undefined answer borrowed it. So the lock leads with the **anti-lock**: two points on two different carriers leave `AB`'s slope genuinely free, and that case must still answer «עדיין לא נקבע מהנתונים» with no `fact` set. A horizontal slope stays `0` — a value, not an absence — for the same reason ADR-AG-0xx gave for segments.

`src-analytic/__tests__/issue-1223-vertical-slope.test.ts` (6) calls `ask` directly, and asserts `figureIsOpen` is false on the operator's figure — because that is what made the old message false rather than merely unhelpful.

### The field exists for the next one

`fact` is a union with one member today. [#1227](https://github.com/dcodish/geo_builder/issues/1227) is already queued behind it: the locus of a DETERMINED point is that point, or a finite set of points, and it currently returns the same `null` with the same false message. It joins this union rather than growing a parallel mechanism.
## ADR-AG-099 — A sweep that closes a class must match the word's other form (#1214, amends ADR-AG-092)

**Requirements:** [02c](02c-requirements-analytic.md) **R99** — a heading names what its rows ARE, in the student's own word; extended from the section heading to the labels inside it. **Design:** [04c](04c-design-analytic.md) — the curve row. **LADDER stage:** display only.

**Operator, 2026-09-19, playing T19:** *"the data panel says נתוני העקום and עקום is mathematically correct but not what a highschool student would expect so we should have נתוני המעגל and then נתוני הישר etc."*

This is **his own #1147 ruling reintroduced three commits later**, by the label ADR-AG-097 added.

### The guard that existed to prevent it had a one-letter hole

ADR-AG-092 did not merely fix the literal — it shipped a sweep over the whole locale, commented *"the class is closed rather than the instance"*:

```js
.filter((l) => /עקומ/.test(l) && …)
```

```
/עקומ/  vs  «עקומים»  (what #1147 removed)  ->  true
/עקומ/  vs  «העקום»   (what #1212 shipped)  ->  FALSE
```

The plural carries a medial mem (`מ`, U+05DE). The singular ends in a **final mem** (`ם`, U+05DD) — a different codepoint. The sweep was written against the word in front of it, and silently did not cover the singular of that same word.

**So it read as class-level while being instance-level, which is worse than no guard at all:** it is the kind of test that makes the next session confident. Widened to `/עקו[מם]/`, it went red on both strings this issue is about *before* anything else changed, and that red is the fix's first piece of evidence.

**The hole is the root cause; the wording is the symptom.** A fix that only renamed the label would have left the next singular noun free to walk through.

### The labels themselves

One whole string per kind — «נתוני המעגל», «נתוני הפרבולה», «נתוני האליפסה» — not «נתוני ה» with a noun slotted in. ADR-AG-085 settled that on this same grammar: Hebrew agreement runs through the clause, and the definite article is exactly the joint that breaks when the fifth noun arrives. The English side settles it too, holding `'a circle'` where a prefix repairs nothing.

The tooltip names no kind, so it needs no fourth string and cannot reintroduce the old noun.

`curveDetailsKey` returns a KEY and lives beside `curveParts`, because that module already decides which kinds HAVE details. The lock walks every member of the `NumCurve` union, asks `curveParts` whether it folds, and requires a real label exactly when it does — so a fifth conic cannot ship a labelled row with nothing in it, or a detail row with no label.

### The operator's own example cannot happen yet

«נתוני הישר» will not appear: a line returns no `details` and renders no disclosure (ADR-AG-097, asserted at T23). The three kinds that fold are circle, parabola and ellipse. [#1219](https://github.com/dcodish/geo_builder/issues/1219) would give a line a fold, and the table gains its fourth entry then — which is why the lock is written against `curveParts` rather than a hardcoded three.
## ADR-AG-100 — The input preview typesets what it previews, and isolates before it does (#1215)

**Requirements:** [02c](02c-requirements-analytic.md) — mathematics is typeset wherever it is shown (the #1097/#1208 rule), extended to the input preview; no new row. **Design:** [04c](04c-design-analytic.md) — the input area's preview seam. **LADDER stage:** display only.

**Operator, 2026-09-19**, typing «מעגל (x-3)^2+(y-5)^2=25»: *"note the text below the textbox isnt mathml"*.

```
the BOX        2+(y-5)^2=25^(x-3) מעגל       reordered by bidi while typing
the PREVIEW    מעגל (x-3)^2+(y-5)^2=25       right order, raw ^2      ← the report
the FACT ROW   מעגל (x - 3)² + (y - 5)² = 25 right order, typeset
```

### Nothing needed building — one product had not reached for a shared thing

`InputArea`'s `preview` prop takes a **ReactNode**, and its own comment says *"2-D's maths renderer rides the same prop at its adoption"*:

```
src/App.tsx      preview={(s) => (hasMath(s) ? <MathText text={s} /> : inputPreview(s))}    adopted
src-analytic     preview={(s) => analyticBidi.inputPreview(s)}                              not
src3d, complex   the same gap — separate products, separate issues
```

`hasMath` and `MathText` have been in `shell/math.tsx` the whole time, in the tree where equations are the entire subject.

### The order is the decision, and it was found by LOOKING

The obvious adoption — hand the raw string to `MathText` — typesets perfectly and lays it out **backwards**. `MathText` emits several `<math>` islands with text between them, and in an RTL paragraph that sequence runs right-to-left, so the preview drew with `=25` at the far LEFT: the exact defect the preview exists to prevent, reintroduced by its own fix.

Driven in a browser and measured by the islands' x-positions:

```
raw string        left-to-right:  [(y-5)², (x-3)²]      backwards
isolated first    left-to-right:  [(x-3)², (y-5)²]      correct — «מעגל» rightmost, equation LTR to its left
```

So: **isolate, then typeset** — the order the answer rows already use (#1097). A unit test cannot hold this (jsdom does no bidi layout), so the lock holds the *cause* — that `isolateLtrRuns` is still applied on this path — and the ADR records the measurement, as ADR-AG-096 did for the same reason.

The bidi previewer stays as the fallback and is not the lesser path: `hasMath` is false until an exponent or fraction completes, so every early keystroke takes it exactly as before, and no half-formed formula is ever half-typeset (ADR-W-060).

### A brittle lock, widened rather than deleted

`bidi-wiring.test.ts` matched a seam with `\{[^}]*`, which stops at the FIRST `}` — so the moment the expression contained nested JSX (`<MathText text={s} />`) it went red on a change that kept the wiring it guards. A matcher that cannot survive a legitimate edit to the thing it protects will be deleted by whoever hits it next, so it counts braces now. The rule it encodes was right and is untouched.
## ADR-AG-101 — «Another configuration» compares the whole figure, not only its points (#1220)

**Requirements:** [02c](02c-requirements-analytic.md) — «הציגו תצורה אחרת» reaches every configuration the givens allow; no new row. **Design:** [04c](04c-design-analytic.md) — the configuration search's sameness test. **LADDER stage:** configuration search; no engine or solve change.

**Operator, 2026-09-19, playing T24** on «נתונה פרבולה שמשוואתה y^2=2px»: *"p is unknown but when i ask for another config, there is no other config which is wrong"*.

### The engine was innocent

```
seed 1  p =  1.314     seed 3  p = -2.889
seed 2  p = -3.400     seed 7  p = -3.754     seed 15  p =  3.491
```

Five seeds, five genuinely different parabolas, all drawn. ADR-052 is honoured: `p` is sampled as the free DOF it is, and no default is masquerading as fixed. **Nothing false was ever on the canvas.**

### Root cause — the sameness test looked at points, and this figure has none

```js
const signature = (lines, seed) =>
  derive(lines, seed).figure.points.map(…).join('|');
```

`nPoints = 0`, `nCurves = 1`, at every seed. The signature was the empty string, `anotherConfiguration` exhausted its 24 tries, and the seed never moved.

The *message* is what makes this wrong rather than merely unhelpful. This function's own comment reads: *"when nothing differs, saying so is the honest answer. A determined figure has one configuration."* So `found: false` **means** "this figure is determined" — said about a figure with infinitely many, one of which was on screen. The reasoning was right; the signature it rested on silently excluded an entire class of figure, and the same blindness hits any curve-only one.

### A line signs NORMALISED, and that is the load-bearing part

`(a, b, c)` and `(2a, 2b, 2c)` are the same line, and a least-squares solve can land on differently scaled triples across seeds. Signing them raw would make one line look like two, and the button would announce "another configuration" while redrawing an identical picture — the failure in the opposite direction the same comment already warns about:

> two configurations differing in the sixth decimal are one picture, and offering them as "another configuration" would be the button lying in the other direction.

`normalizedLine` (#1201) is the one place that decides when two lines are the same line, so it is **called**, not reproduced ([ADR-W-053](06w-decisions-workspace.md#adr-w-053)). The other kinds sign as their own resolved parameters at the same 4 decimals the points use.

### The anti-lock matters as much as the fix

A fix that loosened this until everything differed would trade a button that never moves for one that always claims success. `src-analytic/__tests__/issue-1220-curve-configuration.test.ts` (6) therefore asserts both directions: the operator's parabola finds another configuration **and `p` actually differs there**, while a fully stated triangle still answers `found: false`, and a stated line does too — which is the normalisation guard read from the other side.
## ADR-AG-102 — The working states its intermediate, and each statement gets a row (#1221, amends ADR-AG-094)

**Requirements:** [02c](02c-requirements-analytic.md) **R100** — the working is shown and can be folded; this adds that it must be *complete*. **Design:** [04c](04c-design-analytic.md) — the technique traces. **LADDER stage:** display only.

**Operator, 2026-09-19, playing T25:** *"never include more than 2 equations in a line. the m= should have a final answer there."*

### The `m` half was not a formatting nit

Every trace this tree can produce:

| question | trace | its result was… |
| --- | --- | --- |
| «משוואת הישר AB» | `m = (4 - 0) / (3 - 0),  y - 0 = m(x - 0)` | **nowhere** |
| «AB» | `d = √((3 - 0)² + (4 - 0)²)` | the answer row: `5` |
| «המרחק מ-C לישר AB» | `d(C, AB) = |0·3 + 1·5 + 0| / √(0² + 1²)` | the answer row: `5` |

The line trace is the only one carrying an **intermediate**, and it stated its value on no surface. `d` needs no result printed — the answer row directly above says `5`. `m` is different: it is not the answer (the answer is `4x - 3y = 0`), and the second step consumes it symbolically, so the student was shown `y - 0 = m(x - 0)` and never told what `m` was. **The trace handed them the last step**, which is exactly what ADR-AG-060 (#1053) built it not to do.

### The rule, because "show more working" has no natural end

> **An intermediate the next step consumes is evaluated. A final value already shown in the answer row is not repeated.**

Under it the two distance traces are already correct and stay byte-identical — asserted, not assumed, so a later session does not "improve" them with a `= 5` the row above already carries.

### One statement, one row

#1125 had already established these are two statements — it is why `EXPR` carries no comma (*"«m = (4-0)/(3-0), y - 0 = …» is two statements, not one expression"*) — and they were rendered on one line anyway. The separator is now a newline and the component maps each part to its own row.

Split rather than `white-space: pre-line`, deliberately: each row is then typeset independently, so a fraction is found inside ITS statement rather than inside a run containing two of them.

### Two notation corrections the change forced

- **A substituted slope is bracketed when it would otherwise be ambiguous.** `4/3(x - 0)` reads as `4/(3(x - 0))` at least as readily as `(4/3)(x - 0)` — #1180's ambiguity, ruled on for the panel's line rows and applied here rather than leaving one surface ambiguous because nobody looked. An integer slope is untouched.
- **«y - (0)» is gone.** Pre-existing and surfaced by this work: the bracket around `a.y` was chosen by **`b.y`**'s sign, so `A(0,0)`, `B(3,-6)` printed `y - (0)`. A zero is never bracketed; a genuine negative still is.

`techniques.test.ts`'s #1053 assertion was updated rather than worked around — it is the lock for the behaviour this ADR changes, and it now records why (it injects `fmtNum`, so it reads `1.33` where the product reads `4/3`).
## ADR-AG-103 — A figure the student BUILDS is visible, not only one they open (#1225, amends ADR-AG-096)

**Requirements:** [02c](02c-requirements-analytic.md) **R101** — extended from *opens* to *builds*. **Design:** [04c](04c-design-analytic.md) — the canvas view's lifetime. **LADDER stage:** view state; no engine, solve or display change.

**Operator, 2026-09-19, playing T34:** *"when i put MA=5 the focus on the canvas is lost and the image is not centered. pressing the center button does the work but this should be automatic"* — the canvas framed x ≈ 12…28 while the whole figure sat at x ≈ 0…8.

### The third door on ADR-AG-096's own class

That ADR states the rule and #1209 shut two doors. Every `setView` before this:

```
showWholeFigure()      load a file        #1209
showWholeFigure()      clear all          #1209
setView(zoomedAt(…))   the wheel          user gesture
setView(panned(…))     a drag             user gesture
setView(INITIAL_VIEW)  the reset button   user gesture
setView(zoomedAt(…))   the zoom buttons   user gesture
```

**Adding a FACT is on no list.** It changes the figure while the transform computed for the previous one stays applied. It bites hardest exactly where the operator hit it: while `M` was free the sampled figure was large, so the view was wide; pinning it with «MA = 5» shrank the figure into a corner of that view.

### A predicate, not an unconditional re-fit

Re-fitting on every fact would trade this defect for a worse one — a student who deliberately zoomed into a vertex losing it on every subsequent line, the tool overriding a gesture again and again. So: **re-fit only when the figure would otherwise not be substantially visible.** A deliberate zoom survives while the figure is on screen; blank paper never survives.

The operator has not ruled on this; it is the session's recommendation, recorded here and on the issue so reversing it is cheap.

`figureIsVisible` measures per AXIS rather than by area, because a figure can be perfectly flat — three collinear points have zero height, and an area ratio is `0/0` there. A degenerate axis counts as visible when the figure's extent on it falls inside the view's. The effect keys on the figure's BOX, so it fires only when the extent actually changes, and returns the view unchanged when the figure is fine — a React no-op, which is what keeps it from looping.

### Verified by driving, because it is geometry on screen

Counting drawn points inside the canvas box, the way ADR-AG-096 did — `main` and this branch, same script:

```
                                 main      with the fix
built                            6/6       6/6
after zooming into a corner      0/6       0/6      (a deliberate gesture, respected)
after a fact changes the box     0/8       8/8      ← the defect, and the fix
```

**The operator's own figure could not be used for this.** «נקודה M» is the locus lane's sentence (#1136) and lives only on PR #1172's branch, so on `main` the whole T34 sequence is refused at line 3. The defect is not locus-specific — any fact that changes the figure's extent reaches it — so the reproduction uses a figure `main` can build. Recorded because a later session reading T34 will otherwise try the operator's lines here and conclude the bug does not exist.

A unit test cannot reach `App.tsx`'s view state (no extracted component — the constraint ADR-AG-094 and ADR-AG-096 both record), so `issue-1225-view-follows-figure.test.ts` (6) locks the PREDICATE, including the anti-lock that a zoom onto the figure's centre survives, and the ADR carries the driven measurement.

One belief this corrected on the way: a figure that merely GROWS is not a failure mode, because `viewBox` takes its half-extents from the current figure — at zoom 1 a grown figure still fits. What hides it is a stale centre or a stale zoom. A first draft of the lock asserted otherwise and would have frozen a false belief into the suite.
## ADR-AG-104 — A coordinate the student wrote is shown, even when it is not a number (#1226)

**Requirements:** [02c](02c-requirements-analytic.md) — honesty: everything the student stated is visible on the figure; no new row. **Design:** [04c](04c-design-analytic.md) — the point row's open form. **LADDER stage:** display only; nothing is computed that was not computed already.

**Operator, 2026-09-19, playing T32** on «A(-9a,0)» / «B(41a,0)»: *"9a and 41a are still not shown on the canvas or data panel which is wrong."*

### The tool held the expression and printed its own symbol instead

```
A.x                 mul(neg(num 9), sym 'a')     his own -9a, exactly
exprText(A.x)       "-9·a"                       renderable all along
the panel row       A = (x_A, 0)                 the TOOL's symbol, not the student's
```

`isKnowledge` is false because `a` is free, so the row fell through to the one-coordinate-open reading and printed `x_A`. **That is worse than the dash it replaced**: `x_A` looks like an answer while silently standing in for something the student stated.

### The same fix #1023 made for the other object kind

> A curve the givens have not FIXED still has an equation, and the student wrote it. Printing a dash threw it away — «נתונה פרבולה שמשוואתה y²=2px» read as `—` on a row that could have said `y^2 - 2·p·x = 0`.
>
> It states no VALUE, so ADR-AG-003 §2 is untouched — it names the dependency, which is more than the dash said and less than a number.

Every word applies to a point whose coordinate is `-9a`. #1023 closed this for curves and left it open for points.

### The guard was measured, not reasoned

```
A(-9a,0)          kind = 'point'    x = mul(…)     ← the new branch
A(2,5)            kind = 'point'    x = num        ← numbers still win, answered earlier
«A על הישר y=x»   kind = 'free'                    ← the (x_B, x_B) reading (#1078), untouched
«P אמצע AB»       kind = 'derived'                 ← derived rows, untouched
```

A stated point is `point`; a carrier point is `free`; a derived point is `derived`. The branch is unreachable from either neighbour, which is what makes it safe to place ahead of both. The lock asserts all four kinds rather than only the fixed one.

### What this is NOT

**Not the canvas.** The label still reads `A` there, and per #1211's ruling coordinates on the canvas are opt-in — so that half belongs to #1211's mechanism rather than becoming automatic here.

**Not the locus equation.** [#1186](https://github.com/dcodish/geo_builder/issues/1186) asks for `(x − 16a)² + y² = 625a²` and is a harder problem: recognising a symbolic dependence across sampled traces, which ADR-AG-072 §4 called the CAS boundary. This needs no inference at all — it prints what is already stored — so it lands first and independently.

## ADR-AG-105 — The canvas shows the stated expression too (#1230, completes ADR-AG-104)

**Requirements:** [02c](02c-requirements-analytic.md) — honesty: everything the student stated is visible on the figure; no new row. **Design:** [04c](04c-design-analytic.md) — the point label's open form. **LADDER stage:** display only.

**Operator, 2026-09-19, playing T44:** *"the data panel is now correct but canvas is not"*, with both surfaces in one screenshot:

```
data panel      A = (-9·a, 0)      B = (41·a, 0)      ADR-AG-104, correct
canvas label    A(x_A, 0)          B(x_B, 0)          the tool's own symbol
```

### The scoping in ADR-AG-104 was wrong, and on a premise nobody checked

That ADR wrote the canvas out of scope in as many words:

> **Not the canvas.** The label still reads `A` there, and per #1211's ruling coordinates on the canvas are opt-in — so that half belongs to #1211's mechanism rather than becoming automatic here.

**The canvas does not read `A`.** It has printed coordinates since the provenance work, through the same invented-symbol fallback the panel used. #1211's ruling is about showing *computed* coordinates for a point the student never described; it has nothing to say about a coordinate the student wrote down.

So the second surface was in scope all along, and the reasoning that excluded it was a belief about the screen that a single look would have falsified. Recorded plainly because the same habit produced ADR-AG-099's one-letter hole earlier the same day: **a claim about what the UI shows is a measurement, not an inference.**

### Cause — the same fallback, one layer down

`Component` had two cases:

```ts
| { known: true; value: number }
| { known: false }
```

so an open coordinate could only ever render `x_A`. The panel could reach past provenance to the construction and read the expression; the scene builder cannot — it is handed the figure, not the objects. And `provenanceOf` had the expression in hand at the moment it discarded it.

The open case now carries `expr?: string`, set from `exprText(e)` in the `kind === 'point'` branch — the same guard ADR-AG-104 used, measured the same way: a stated point is `point`, a carrier point is `free`, a derived point is `derived`. The scene prefers `expr` over the invented symbol, and the `any` gate that decides whether to show coordinates at all now counts a stated expression as something said.

### What stays exactly as it was

A numeric point still draws its numbers. **A carrier point still draws `x_A`** — «A על הישר y=x» is a `free` object, the student stated no expression for its x, and inventing one there would be the opposite error to the one this fixes. And no sampled number ever reaches a label for an open coordinate: the lock asserts the absence of a decimal, not merely the presence of `-9·a`.

The last lock asserts the two surfaces agree by construction rather than checking two separately-correct strings that could drift apart later.

## ADR-AG-106 — The snap may not demand precision the trace never promised (#1224)

**Requirements:** [02c](02c-requirements-analytic.md) — the locus states its equation when the givens fix it; no new row. **Design:** [04c](04c-design-analytic.md) — the locus fit and its determinacy gate. **LADDER stage:** display only; no engine or solve change.

Found while verifying PR #1172's own play cases before handing the operator a sheet. All four documented cases passed; varying the figure showed the lane's headline feature failing on the ordinary one.

```
B(8,0)   bisector x = 4         «ישר · x = 4»   ✓
B(0,8)   bisector y = 4         «ישר · y = 4»   ✓
B(6,8)   bisector 3x + 4y = 25  «ישר»           ✗   drawn correctly, no equation
B(4,4)   bisector at 45°        «ישר»           ✗
B(2,0)   bisector x = 1         «ישר»           ✗   axis-aligned, and still failing
```

`B(2,0)` is what ruled out *"slanted breaks it"*: whatever the gate measured was **scale**-sensitive.

### Neither candidate in the issue was the cause

`shapeOfTrace.curve` held the correct line in every case — `x = 1`, and `a=1, b=4/3, c=−8.327`, which is `3x + 4y = 25` to three figures. `locusEquation` discarded it at its opening `if (!shape.conic) return null`, and `conic` was absent because **`snapRational` uses an ABSOLUTE `1e−6` while the trace's accuracy is RELATIVE to how far it walks**:

```
          traced span   worst deviation from the TRUE line
B(2,0)             40   1.9e−5      19× the absolute tolerance
B(6,8)           2685   1.5e−2      four orders past it
```

The same function's **verification has always been relative** (`1e−6 × scale²`). So the two halves of `snapAndVerify` disagreed about what precision means, and the half that ran first rejected data the half that guards correctness would have accepted.

The snap now takes its tolerance from **the trace's own scatter about the fitted curve** — the precision this data actually has. Never tighter than `SNAP_TOL`, so an exact trace still snaps exactly. This is not a loosening: the verification is untouched and is what keeps a wrong snap from being printed.

### The hole that opened, and the lock that caught it

A scatter-derived tolerance can be wide, and a wide enough one snaps **every coefficient to zero** — after which `0 = 0` satisfies the verification at every point. Handed `x = 40` against a trace at `x = 4`, the scatter is 36 and the result was `{0,0,0,0,0,0}`.

`issue-1176`'s honesty lock caught it, which is the argument for writing that lock as a **direct** assertion rather than inferring the refusal from a case that happened to fail the snap. A degenerate snapped conic is now refused; a wrong-but-nonzero one the verification catches unaided, because it is false somewhere. The degenerate one is the single case it cannot catch, because it is true everywhere.

### A lock that asserted the old behaviour, updated rather than worked around

`issue-1176-locus-configuration.test.ts` asserted that seed 2 of the plain bisector prints the kind alone, with the note *"asserted so that a future change which starts printing an equation here has to say why"*.

Saying why: that seed draws its locus over ~974 units while `A` and `B` sit 8 apart, and the old premise was that `x = 4` *"cannot be re-verified against the trace"*. It was never re-verified — the absolute snap failed first, so nothing reached the check. It now reaches it and **passes**: the trace's worst deviation from `x = 4` is `1.85e−3` against a verification tolerance of `0.95`. And `x = 4` is the true locus there, at every seed. The tool is not stating something it could not check; it is now checking something it could not previously reach.

### What this unblocks

[#1191](https://github.com/dcodish/geo_builder/issues/1191) is a P1 about `4y = −3x + 25` rendering as `4 · ישר y = −3x + 25` on the canvas. While #1224 stood, that figure printed «ישר» with nothing after it — **so the P1's fix could not be play-verified at all**, and its play case was marked unplayable on the operator's sheet. That figure now produces the label, which is what makes the P1 checkable.

## ADR-AG-107 — The yud is optional, and a circle states its radius squared (#1210, #1187)

**Requirements:** [02c](02c-requirements-analytic.md) — the locus lane answers the question the student asked, in the exam's notation; no new row. **Design:** [04c](04c-design-analytic.md) — the locus question's pattern and the circle's equation. **LADDER stage:** parse + display.

The last two of the three things standing between PR #1172 and its merge, and therefore between the P1s (#1191, #1176) and production. The third was ADR-AG-106.

### #1210 — refusing a spelling answers a spelling, not a question

«המקום הגאומטרי של M» returned «לא הבנתי את השאלה» while «המקום הגיאומטרי» worked.

*Ktiv male* «גיאומטרי» and *ktiv haser* «גאומטרי** are the same word. A student who omits the yud has made no mistake, and a tool that refuses one of them is teaching orthography on a geometry question — the class #1156 and #1183 named, where the remedy offered is about the student's typing rather than their figure.

`י?` — one optional character at the one place the two forms differ, rather than a second alternation that could drift. The lock asserts eight neighbouring forms still resolve, and that the pattern did not become a wildcard: «שיפוע AB» is still not a locus question.

### #1187 — the row's job is to say what the circle IS

**Operator, playing T31:** *"the radius in equation should show as 25^2 and not 625"*.

`(x − 16)² + y² = 625` makes the student take a square root to recover a radius the tool already holds, on the one row that exists to tell them. The exam writes `= 25²`.

**Conditional on the radius being worth squaring.** The squared form is shown only when the displayed radius round-trips — `fmt(r)` parsed back and squared must equal the constant. Otherwise `= 12.25²` would be a worse row than the number it replaces, and a tidy-looking square that does not hold would misstate the figure. When it does not round-trip the plain constant stands, exactly as before.

### Three existing locks asserted the old form, and were updated with the reason

`issue-1136-1137-locus`, `issue-1176-locus-configuration` and `issue-1224-slanted-locus` all asserted `= 625` — the last of them written earlier the same day. Each now asserts `= 25²` and carries the operator's ruling inline, so the next session reads *why* the expected value changed rather than finding a bare edit. The `(x − 16)² + y²` half is asserted separately, because #1187 changes one side of the equation and must not be read as licence to restyle the other.

## ADR-AG-108 — One printer for a line, and it is the panel's (#1197)

**Requirements:** [02c](02c-requirements-analytic.md) — a line is written `Ax + By + C = 0` wherever it is shown; no new row. **Design:** [04c](04c-design-analytic.md) — the locus label's notation, and where `locusEquation` lives. **LADDER stage:** display only.

**Operator, twice.** 2026-09-18, playing round #1193 T10: *"when a line is shown - we always write it as Ax+By+C=0 and not like the image has"*. And again 2026-09-19, playing T54 on the integrated branch: *"the line needs to be in the format of Ax+By+C=0 and not like it is now"*.

### The convention was already written down; the lane had its own

```
the data panel (lineText)        3x + 4y - 25 = 0     ✅ the convention
the locus label (locusEquation)  4y = −3x + 25        ❌
```

Two printers for one object, two inches apart on the same screen. `lineText`'s own docblock is the rule — *"written the way a textbook writes it: no `1x`, no `+ 0`, no `+ -3`"* — and it already carries #1180's fraction clearing and #1119's magnitude rule. The locus lane reimplemented the notation instead of calling it, which is the failure [ADR-W-053](06w-decisions-workspace.md#adr-w-053) names, in the direction that is easiest to miss: not a test reproducing a decision, but a second *implementation* of one.

### The move that made the call possible

`lineText` lives in `app/curveText.ts`; `locusEquation` lived in `engine/locusFit.ts`. An engine module importing upward would have been the real cost of a one-line fix.

So `locusEquation` moved **up** into `app/curveText.ts` — which is the right home on its own terms, and the mirror of what #1201 did when it moved line *resolution* DOWN into the engine. The test is what the thing IS: resolution is geometry and belongs below; notation is a sentence for a student and belongs above. `ask.ts`, in `app/`, was already its only production caller.

The line branch now calls `lineText(D, E, F)` on the **snapped** coefficients — the exact ones the determinacy gate accepted — and `lineText` clears the fractions itself. Circle, parabola and ellipse keep their canonical forms: `Ax + By + C = 0` is the convention for a LINE, and `(x − 16)² + y² = 25²` is how a circle is written.

```
x = 4               →  x - 4 = 0
y = 4               →  y - 4 = 0
4y = −3x + 25       →  3x + 4y - 25 = 0
y = −x + 4          →  x + y - 4 = 0
```

### Twenty-three assertions, changed with the reason attached

Four locus test files asserted the retired notation, across 23 places. Each pair was listed explicitly in the migration rather than pattern-matched, so a wrong pair would be visible in review — `y = 2x` and `-2x + y = 0` are the same line, and a script that guessed could quietly have made them different ones. The prose in those files was updated too, so no file describes a notation it no longer asserts.

## ADR-AG-109 — A construct means every condition in its definition, not the one it is named after (#1232)

**Requirements:** [02c](02c-requirements-analytic.md) R103 (a named cevian reaches its side, and may reach the extension), R40's *"a median that does not actually end at the opposite midpoint would teach something false"*. **Design:** [04c](04c-design-analytic.md) — "A cevian lowers to its WHOLE definition". **LADDER stage:** parser lowering; no solver change.

**Found in triage, not reported.** The operator's 2026-09-19 report was about a different cevian sentence. This one is well-formed, catalogued, deployed since `prod/2026-09-19-2`, and drew a wrong figure with `faults: []`:

```
משולש ABC
AD גובה לצלע BC
```

### Measured before diagnosing

| seed | cos∠(AD,BC) | dist(D, line BC) / \|BC\| | faults |
| --- | --- | --- | --- |
| 0 | −4e−9 | 0.440 | `[]` |
| 1 | −8e−8 | 0.711 | `[]` |
| 4 | +7e−8 | 1.061 | `[]` |
| 5 | +1e−8 | 0.196 | `[]` |

Perpendicularity holds *exactly* at every seed; incidence holds at none. The foot sat up to a whole side-length away from the side it was the foot of, and there is no configuration in which it looks right. With coordinates pinned — `A(0,3)`, `B(5,0)`, `C(7,0)` — the "altitude" foot landed 17.6 units off a side 2 units long, still with no fault.

### The class

*A construct defined by a CONJUNCTION of conditions was lowered to only the condition its keyword is named after, and the incidence half was dropped — so the figure satisfies the word and not the definition.*

«גובה» is two statements: the foot is on the side, **and** the segment to it is perpendicular. The rule emitted only the second. `perpendicular` is a pure direction residual — two vectors whose dot product is driven to zero — and asserts nothing about where `D` sits.

**Why the median leg was right by accident.** `midpoint(D,B,C)` carries both halves in one kind: a midpoint is on the side by construction. So the sibling condition read correctly while stating one constraint, and the shape that worked there was copied to a role where it does not.

**Why it survived.** The cevian rule had no test for the «גובה» leg at all — a search for the word across `src-analytic/__tests__/` returned nothing. The «תיכון» leg is exercised by a real bagrut exercise ([ADR-AG-015](#adr-ag-015), image 7 #6) and is correct; its sibling shipped untested beside it.

### The sibling audit closed the class rather than assuming it

Every emitter of the point-pair `perpendicular` kind: **one**, this rule. `shapes.ts` builds `relation`, not this kind.

- The generic `relation` (#1052, «DE ⊥ BF») is **correctly** incidence-free — two independent directions sharing no point, so there is no foot to place. Confirmed by reading it, as the fix plan asked, rather than assumed.
- `rightAngleAt(v,p,q)` is likewise safe: both rays start at `v`, so incidence is structural.
- Every other parser rule that DECLARES a point was swept (intersection, circle-at, line-at, on-object, component, axis-side, ratio-divider). Each lowers its full meaning, or deliberately leaves the DOF the sentence leaves. The altitude was the sole member.

### The fix, and why NOT a compound `foot` kind

2-D lowers the same sentence to a single `foot` command — incidence and perpendicularity as one primitive — and the fix plan proposed porting that shape. **It was not ported, for three measured reasons:**

1. **The foot must stay a CONSTRAINED point, not a derived one.** [ADR-AG-015](#adr-ag-015)'s worked example — the operator's own — states `D(0,3)` *alongside* «AD תיכון לצלע BC» and solves for `B` and `C`. A derived point cannot accept a stated coordinate. This is why the median leg used the `midpoint` constraint rather than the `midpoint` derived rule that already existed, and the altitude must match it.
2. **Two constraints name which half failed.** `describeConstraint` can say «D על BC» or «AD ⊥ BC»; one compound kind reports a lump. That is [ADR-AG-017](#adr-ag-017)'s rule — a refusal names the statement.
3. **A student who already wrote «AD ⊥ BC» has that half recognised** by `canonicalConstraint`, which a new kind would not match.

Reusing `on-line-2pt` also avoids reproducing its residual, which is deliberately *not* the `parallel` relation: it stays well-defined when `D` sits exactly on an endpoint, and an endpoint is a legitimate foot.

So the rule states the incidence for **both** roles and each role adds what is left. On the median it is redundant rather than wrong, and redundancy is free here: `carrierDofOf` computes `carriers − rank(J)`, so a dependent row consumes no freedom. A count-based accounting would have reported that figure over-determined — asserted in the test rather than assumed.

### The foot is on the LINE

«לצלע BC» reads as "to the side", and the naive repair is a `between` selector. An obtuse triangle's altitude foot legitimately falls beyond an endpoint, so that bound would refuse a correct figure — the same honesty failure pointing the other way. `A(0,3)`, `B(5,0)`, `C(7,0)` puts the foot at the origin, `t = −2.5`, and it builds there.

This does not contradict [ADR-AG-032](#adr-ag-032)'s "the noun decides boundedness": that ruling is about «נקודה D על הצלע BC», where the student places a point on a side and the noun is their choice of region. Here the noun names which side the cevian drops to, and the foot's position is the geometry's to decide, not the wording's.

### The lock the fix plan proposed would have failed

The plan asked for `dist < 1e-9`. The minimiser converges to ~1.5e-8 relative off-line and ~5.6e-8 in cos over 24 seeds — measured, and a lock at 1e-9 would have gone red on correct output. The tolerance is 1e-6: clear of the noise, and still a millionth of the side.

`issue-1232-altitude-foot.test.ts` locks both halves over 8 seeds, the English sentence, the obtuse case, the median, and — the class — that the RULE emits both constraints. Verified red on the pre-change code: 4 of its 5 cases fail, the median's passes, which is exactly the shape of the defect.

## ADR-AG-110 — A role's own incidence is checked at the rule, with an owned refusal (#1231)

**Requirements:** [02c](02c-requirements-analytic.md) — the cevian forms, amended: a sentence whose letters contradict the role it names is refused, not drawn. **Design:** [04c](04c-design-analytic.md) — the cevian rule and the `ParseFailure` registry. **LADDER stage:** parse. No engine or solver change. **Extends** ADR-AG-109 (#1232); sibling of the 2-D ADR for #1233.

**Operator report, 2026-09-19** (screenshot): the tool accepted

```
משולש ABC
A(2,-5)
BD תיכון לצלע AB
```

and drew it.

### Measured, not read off the code

`derive(['משולש ABC','A(2,-5)','BD תיכון לצלע AB'], seed)`:

| seed | `\|BD\|` | `\|AB\|` | faults |
| --- | --- | --- | --- |
| 0 | 4.97 | 9.94 | `[]` |
| 1 | 5.45 | 10.90 | `[]` |
| 2 | 1.92 | 3.84 | `[]` |

`|BD|` is exactly `|AB|/2` at every seed: `D` is the midpoint of `AB`, and the segment the tool draws as a *median* is the second half of the side it was supposedly drawn to. `faults: []` — the tool asserts the figure is correct.

Measured at parse, the silently-wrong set is exactly **apex ∈ {u,v}** (both roles, both letters), **apex = foot**, and **foot ∈ {u,v}** — the last reaching the solver as `unsatisfiable` rather than being answered.

### Root cause

The `CEVIAN_HE`/`CEVIAN_EN` handler validated **only the side's own two letters**:

```ts
if (u === v) return refuse('repeated-vertex', line); // «AD תיכון לצלע BB» names no side
```

and then emitted unconditionally. It checked the letters of one operand and never the **relation between the two operands**, which is the part the word «תיכון»/«גובה» actually asserts.

**Class:** *a sentence that names a construct by the ROLE one point plays relative to another object is accepted without checking the incidence that role itself imposes — so a degenerate naming builds a figure contradicting the word the student used, with `faults: []`.*

This is the parse-time twin of ADR-AG-109 (#1232), and of #1158/#1166's *"the configuration drawn must honour the noun that declared it"*. There the noun is honoured by a **configuration** check; here the sentence is degenerate by its letters alone, so it must be refused at parse time and never reach the solver.

### The decision — the definition, not the three observed failures

```
a cevian runs apex → foot; the foot lies on side (u,v); the apex does NOT; and apex ≠ foot
```

`foot ∈ side` is refused here rather than left to the solver, because parse time is where the message can **name the student's statement** instead of reporting an unsatisfiable system — the honesty invariant that error messages name the conflicting statement, never internal state.

### An OWNED code, and why `repeated-vertex` is the wrong word

`degenerate-role` is a new `ParseFailure` code. The registry is deliberately small, so the case for adding to it has to be made: **nothing repeats inside a run here.** «AB» is a perfectly good side and «BD» a perfectly good segment; what is wrong is the relation between them. Telling the student *"the same letter appears more than once"* would send them to fix a run that is already correct — the refusal would name the wrong thing, which is the failure mode owned codes exist to prevent. «AD תיכון לצלע BB» genuinely repeats and keeps `repeated-vertex`.

The message names the statement, gives the reason in the student's own vocabulary (*a median runs from a vertex to the side opposite it*), and **teaches a spelling that works**. That last clause is asserted, not assumed: a test drives «AD תיכון לצלע BC» through `parseLine` and requires it to build, because a remedy that returns the same refusal is worse than none (the #1156/#1183 lesson).

### Never `null` — the one place this tree does NOT copy 2-D

Returning `null` would route a sentence this rule clearly *matched* to the `not-handled` seam and on to the LLM, which #1039/#1042 ruled against here: **a rule that matched owes the student an answer.**

2-D's equivalent gate escalates, and its sibling fix (#1233, landed the same day) keeps that. The split is deliberate and recorded on both sides so neither is later read as the other's precedent: 2-D has no owned-refusal vocabulary equivalent to `ParseFailure`, and building one there is a larger change split out under its own issue.

### The lock

A table over `{תיכון, גובה} × {median, altitude} × {apex=u, apex=v, apex=foot, foot=u, foot=v}`, plus the «נתון»-prefixed and triangle-tailed spellings that ride the same rule. It **calls** `parseLine` rather than re-implementing the predicate (ADR-W-053).

The negative controls are the half that matters: every well-formed spelling in both roles and both locales still builds, and — because a gate added to this rule is exactly the edit that would quietly drop a leg — the altitude is asserted to still lower to **both** halves of ADR-AG-109's conjunction, `on-line-2pt` **and** `perpendicular`. Verified to bite: **17 of the 27 assertions fail against pristine `parseAnalytic.ts`.**

### Consequences

`parser/parseAnalytic.ts` (the code + the predicate), `store/useAnalyticStore.ts` (the error union), `App.tsx` (the code → message map), `i18n/index.ts` (both locales).

`issue-1231-degenerate-role.test.ts` (27). Analytic lane green.

**Sequencing note for what follows:** #1222 and #1165 widen this same rule (the apex-fronted form, cevians by triangle, the angle bisector). They must be built **on top of** this gate — porting 2-D's cevians without it would carry 2-D's own missing altitude gate into this tree.
## ADR-AG-111 — The noun decides the extent, and a bounded one draws only the segment (#1236 + #1234)

**Requirements:** [02c](02c-requirements-analytic.md) R6 (amended) — «משוואת …» accepts every noun that names a straight object, and the noun states what is drawn. **Design:** [04c](04c-design-analytic.md) — the equation rule's noun registry, and the fold's extent resolution. **LADDER stage:** parse (recognition + extent) and the fold (the inherited extent). No solver or renderer change. **Extends** ADR-AG-019 / ADR-AG-023 / ADR-AG-060; **cites** the `stated: false` carrier convention (#1076).

Two halves of one sentence, neither observable without the other, built as one item. Escalated first (round #1244) on the design question below and re-built on the operator's answer the same day.

### The two symptoms

**#1236 — the noun was a gate.** `HE_LINE = 'ה?(?:ישר|אלכסון)'` decided whether a sentence was understood at all:

```
OK     משוואת הישר BD …      OK   משוואת האלכסון BD …   OK   משוואת BD …
FAIL   משוואת הצלע BD …      FAIL משוואת הקטע BD …      FAIL משוואת התיכון BD …
FAIL   משוואת הגובה BD …     FAIL משוואת השוק BD …      FAIL משוואת הבסיס BD …
```

Identical meaning, identical facts required, and the student had to guess a different word for the same thing. **The list had already been fixed once, one member at a time** — the comment #1070 left above it records «אלכסון» being added for exactly this reason.

**#1234 — the twin.** On the operator's own figure, «משוואת CE היא x-3y=0» minted `line-CE` **beside** the `seg-CE` the figure already held:

```
segments: poly-ABC-0..2, seg-BD, seg-CE
curves:   line-CE          <- a second object for one name
faults:   []
```

### The ruling

> **2026-09-19:** *"משוואת הישר should draw the line. משוואת הצלע or הקטע should draw a segment (in not yet draw)"*

and, asked in this round's escalation whether the infinite line still EXISTS behind a bounded noun:

> *"only draws CE"*

### The decision — a noun REGISTRY, and the extent it carries

The noun stops being a gate in a regex and becomes a registry row: `{ he, bounded }`, with `HE_LINE` **derived** from it so the two cannot drift, and one `extentOfNoun` consulted where the decision is made.

**A list is unavoidable here, and saying so plainly is part of the decision.** An unknown noun must stay `not-handled` — «משוואת הפיל BD היא …» may not mint anything — so the rule cannot simply accept any word. What it *can* stop doing is keeping the vocabulary in one rule's regex with the meaning of each noun decided somewhere else. Adding a noun is now one row, and its semantics arrive with it.

`direction()` was the plan's proposed route and is the wrong one **on its own**: it discards the noun by construction, which is exactly the information the ruling turns on. `ON_OBJECT` had already solved this shape — resolve WHICH object one way, capture the noun separately for its EXTENT — and that split is what is copied.

### The line survives as a CARRIER, which is not a new concept

A bounded noun emits the segment (minted here, idempotent when the figure already has it) and the line as an **undrawn carrier**, `stated: false`. `scene.ts` draws only `stated` curves, and «B על הישר y=x» has used this flag since #1076 for a line that exists to hold a point rather than to be drawn.

The carrier is what the two endpoints are constrained *onto*. Without it the sentence would state nothing at all — the student's equation would be accepted and then have no effect, which is the honesty failure this issue is about, arriving through a different door.

> **Correction to this round's escalation.** It asserted that *"the analytic tree has no drawn-vs-carrier concept; every curve object is drawn"*, and priced the option accordingly. That was wrong: `stated` is exactly that concept, and `apply.ts` already upgrades a carrier to drawn when a later sentence states it. The escalation's question was still the right one to ask — the ruling was needed — but its cost estimate for the alternative was too high, and a future session should not inherit that claim.

A student who later writes «משוואת הישר CE היא …» upgrades the same object to `stated: true` — the deliberate line-over-segment pair #1234 describes, reached only by asking for it and never minted behind the student's back.

### The bare form is decided at the FOLD, because the parser cannot decide it

«משוואת CE היא x-3y=0» writes no noun and so says nothing about which object it means. Per the ruling it takes the extent the object **already has** — and that is a question `parseLine(raw)` structurally cannot answer: **the analytic parser takes no figure context**, by design.

So the fact carries `inheritExtent`, and `apply.ts`'s `case 'curve'` — which already looks the figure up through `priorOf` — asks whether a segment spans the same two points. It compares ENDPOINTS, never ids: `line-CE` and `seg-CE` are different strings by design, so the twin is not something the id space can catch.

The plan placed this at the equation rule. That is one layer off, and recording it matters more than the fix: *a plan that names a chokepoint in a context-free parser for a context-dependent decision has named the wrong layer, however right the rest of it is.*

### Measured after

| sentence | segment | drawn | carrier |
| --- | --- | --- | --- |
| «משוואת הישר CE» (seg exists) | `CE` | **`line-CE`** | — |
| «משוואת הצלע CE» (seg exists) | `CE` | — | `line-CE` |
| «משוואת CE» — **the reported line** | `CE` | — | `line-CE` |
| «משוואת הצלע PQ» (nothing exists) | **`PQ` minted** | — | `line-PQ` |
| «משוואת PQ» (nothing exists) | — | `line-PQ` | — |

### Arm 2 was NOT built, and the measurement is why

#1234's plan called `crossingsOf`'s self-pairing *"load-bearing, not defence in depth"*, on the reasoning that *"without this, the noun fix converts a twin bug into a spurious-ring bug."*

**Measured, that does not happen.** `crossings.ts:275` already skips unstated curves, so a carrier never enters the search. The reported sequence now offers **exactly what the same figure without the equation offers — 1 ring at each of 8 seeds, zero self-pairs** — identical to the figure before the line was added.

The residue is the *deliberate* pair, where both objects are stated and `meet`'s **absolute** `1e-12` determinant test fails to see two spellings of one line (5 self-pairs over 8 seeds). That is not this issue's arm — it is **#1235** verbatim (*"crossings.ts decides degeneracy with ABSOLUTE thresholds — a duplicate line is 5 orders above the guard"*), which is filed, armed and describes this exact repair. Doing it here would be this round doing an unannounced issue's work, and the measurement is recorded on #1235 instead.

*The plan's "therefore" is a separate hypothesis from its diagnosis, and it was the cheapest thing to falsify.*

### The lock

The ruling's own table, driven end to end through `derive`: each noun's extent, the minting, the bare form in both directions. Recognition is locked over all nine nouns plus three unknown ones that must stay `not-handled`, and all spellings are asserted to produce the **same object id** (ADR-AG-023's identity rule). The ring assertion compares the reported figure against the same figure without the equation at 8 seeds, rather than against a hard-coded count a future change could match by accident. Verified to bite: **12 of the 19 assertions fail against pristine sources.**

### Consequences

`parser/parseAnalytic.ts` (the registry, the captured noun, the extent on `CurveHit`, the carrier + segment emit), `engine/types.ts` (`inheritExtent` on the curve fact), `engine/apply.ts` (the fold's resolution + `segmentOverSameEnds`).

`issue-1234-equation-extent.test.ts` (19). Analytic lane green.

## ADR-AG-112 — The analytic Builder gets the LLM fallback, and the proxy routes by registry (#1251)

**Requirements:** [02c](02c-requirements-analytic.md) — an unrecognised sentence is escalated rather than refused outright; the tool's promise now matches 2-D's and 3-D's. **Design:** [04c](04c-design-analytic.md) — the fallback seam; [28](28-shared-chrome.md) — the proxy's per-tool routing. **LADDER stage:** after the deterministic parse, before the refusal is shown. No engine, solver or render change.

**Operator ruling, 2026-09-19**, playing round #1244 (T19 asked whether this tool had an LLM connection):

> *"we should have an llm fallback like we have in 2d and 3d. this is true to all tools"*

Scoped by him to analytic first: *"lets do this for the analytics for now"*.

### What was missing, measured

| tree | client wiring | LLM fallback |
| --- | --- | --- |
| `src/` (2-D) | `src/parser/llm.ts` | yes |
| `src3d/` | wired | yes |
| `src-analytic/` | **no `fetch`, no network path of any kind** | **no** |

`parseLine`'s `not-handled` mapped straight to `errNotHandled` and rendered. The `ParseFailure` type calls that code *"the LLM-escalation seam"*, but the name described its role in the **other** trees; here there was nothing behind it.

**That cost more here than the same gap costs elsewhere.** In 2-D an unrecognised sentence gets a second chance, so a grammar hole costs a paid call and usually still works. In analytic every hole was a hard wall and every refusal was the student's final answer — which is why the open grammar-coverage issues (#1128, #1222, #1165, #1240) and the refusal-quality ones (#1246) are all worth more in this tree than their labels suggest.

### The model never emits facts

It normalises freeform into the **canonical command lines of `COMMAND_CATALOG_ANALYTIC`**, and every line is put back through `decideSubmit` — the same gate a student's typing meets, parser and fold included.

**That is the whole safety argument, and it is structural rather than a matter of prompt discipline.** A hallucinated line is refused exactly as a typo is; the model has no privileged route into the engine and cannot commit a figure the fold rejects. It is the `llmShared.ts` / `llmShared3.ts` pattern, third instance, and it is why adding a fallback here does not widen what the tool can be made to draw.

**All-or-nothing:** if any returned line is refused, nothing is recorded. A partial construction is the honesty failure this repo treats as cardinal — the student asked for one figure and would silently get part of one, with no indication which part went missing. `already-known` / `already-follows` are not refusals: a model restating something true has produced a valid line that adds nothing, and the rest still stand.

**The seam is `not-handled` ONLY.** Every other refusal is an *owned* answer — a degenerate role, a reserved coordinate, a name clash — where the tool understood the student and disagreed. Handing those to a model would replace a correct explanation with a guess, so they never escalate.

### The proxy's ternary becomes a registry, and this is the load-bearing half

`server/parseHandler.ts` chose its prompt with

```ts
const request = tool === '3d' ? buildLlmRequest3(utterance, context) : buildLlmRequest(utterance, context);
```

A two-way branch whose else-arm was the 2-D prompt. Correct while exactly two products called the proxy, and **silently wrong the moment a third did**: wiring this client up against it would have sent analytic sentences out with the 2-D command catalogue, and the model would have answered an analytic figure with 2-D commands. Not a refusal — a confidently wrong parse, on a paid call, looking for all the world like it had been routed.

So it is a `Record<string, builder>` with **no default**, and an unregistered tool is refused with `400 unknown-tool` **before any quota is touched** (a client bug must not be able to drain the day's budget). A fourth product that forgets to register gets a refusal and falls back to its own deterministic answer — it cannot inherit a third product's grammar by omission.

An absent `tool` still means 2-D, as it always has: that client does not send the field.

### The prompt carries rulings, not style

Four rules in it encode decisions with their own ADRs, and each is locked:

- **ADR-052** — never invent an unstated value. Emit the form that leaves it open rather than a made-up number.
- **ADR-AG-111** — the noun decides the extent: «הישר AB» is the infinite line, «הצלע AB» the segment.
- **ADR-AG-110** — a cevian's apex may not lie on the side it is drawn to, so the model is told rather than left to produce a line the re-parse will refuse.
- **#1245** — a point at coordinates is `A(3,5)`, never `A=(3,5)`; the latter is 2-D's spelling and this tool refuses it. A prompt teaching it would produce a refusal on the model's own advice.

### No live call, anywhere

`runFallback` takes its transport as an argument, so the suite never reaches the network — `docs/08` requires the fallback to be mocked, and **standing rule 2 forbids firing one without the operator**. The few-shot examples were authored by reasoning out the lines the model should emit and then **verifying every one through the real `parseLine`** (the PAR-10 contract), which is the oracle role that rule prescribes. **This ADR ships unexercised against a live model**, deliberately: the first real call is the operator's to authorise.

### Locks

`issue-1251-llm-fallback.test.ts` (31): every prompt example parses; at least one teaches the honest empty answer; none teaches the 2-D coordinate spelling; the four ruling-bearing rules are present; a line the deterministic parser refuses is refused here too; a *later* refused line discards the whole answer; a degenerate cevian is refused even though it parses; a throttle reports busy rather than a misunderstanding; a restatement is dropped rather than duplicated; and the accepted lines are asserted to actually build.

`parse-tool-registry.test.ts` (8): every tool registered, every tool mapped to a **distinct** builder, **no fallthrough** (a `??`/`||` default or a revived ternary fails it — verified by reintroducing one), the unknown-tool refusal present and **ordered before the quota counter**. The locks read the handler with **comments stripped**, because the registry's own docblock quotes the ternary it forbids and a naive scan matched the documentation.

### Consequences

New: `parser/llmSharedAnalytic.ts` (prompt + request builder), `parser/llmAnalytic.ts` (transport), `app/fallback.ts` (the decision, pure and injectable). Changed: `server/parseHandler.ts` (registry + validation), `App.tsx` (the seam, the spinner), `store/useAnalyticStore.ts` + `i18n/index.ts` (the `llm-busy` key, both locales).

**Not done here:** the complex Builder, which has the same gap. The operator scoped this to analytic; #1251 keeps the complex arm open, and it is now a smaller job — the registry work is shared and only its prompt and client remain.

## ADR-AG-113 — The panel lists a line the student MENTIONED; the canvas draws one that is STATED (#1250)

**Requirements:** none (internal) — restores the standing promise that everything the student stated is visible. **Design:** [04c](04c-design-analytic.md) — the panel's listing predicate, extracted. **LADDER stage:** presentation. No parse, engine or solver change. **Refines** the #1078 ruling; **follows** ADR-AG-111.

**Operator, 2026-09-19**, playing round #1244:

> T15 — *"משוואת הצלע CE היא x-3y=0 should appear in the data panel under lines"*
> T16 — *"משוואת הישר CE היא x-3y=0 does add it do the data panel"*

Two sentences stating **the same equation about the same object**, and only one of them put it in the panel.

### Measured

```
                          stated   label.name    panel row?
משוואת הצלע CE …  (T15)   false    "CE"          no   <- the defect
משוואת הישר CE …  (T16)   true     "CE"          yes
משוואת CE …       (T17)   false    "CE"          no   <- the operator's own reported line
B על הישר y=x     (#1078) false    ""            no   <- correct
```

### This ran into the operator's OWN earlier ruling, and refines rather than reverses it

The filter was `curves.filter((c) => c.stated)`, carrying #1078:

> *"the part where it shows -x+y=0 is meaningless since the line is not really drawn and in any case **there is no way to know what it belongs to**"*

**His objection there was not that the line was undrawn — it was that the row was ORPHANED.** An unlabelled equation, next to no point, for a line nobody asked to see. Those two properties coincided until ADR-AG-111 made a *mentioned* line *undrawn* for the first time, and the distinction had never had to be drawn before.

His ruling of the same day states it in the positive:

> *"if we say that a point is on a line, we dont draw the line but if we specifically mention a line, we should have its equation."*

### The decision — two questions, two answers

`stated` was answering both *is it drawn* and *is it listed*. They are now known to be different questions:

| | asks | of «משוואת הצלע CE» |
| --- | --- | --- |
| the canvas | `stated` — is it DRAWN? | no (his *"only draws CE"* ruling) |
| the panel | was it MENTIONED? | **yes** |

**`label.name` is "mentioned", and not by coincidence:** a line the student made the subject of a sentence is one they referred to by name, while a line minted only to hold a point has nothing to call it. So #1078's case stays unlisted for the reason #1078 gave, rather than by exception.

A second flag (`drawn` beside `listed`) was considered and **rejected**: it would have to be set correctly at every mint site, and the name already answers truthfully at all of them.

### The decision is EXTRACTED, and that is not cosmetic

`panelListsCurve` is a named function in `app/panelRows.ts` because the first draft of this fix's lock **re-implemented the filter** and would therefore have passed with or without the change — the exact failure ADR-W-053 records (*"a test that re-implements the decision it guards stays green through the change that kills the feature"*). Caught before it was committed, by asking what the test would do if the predicate were reverted. It is: 3 of the 8 assertions go red.

### Lock

`issue-1250-mentioned-line-row.test.ts` (8), driven through a real `derive` and **calling** `panelListsCurve`: all three mentioned spellings leave exactly one row naming `CE`; the drawn case gets one row and not two; **#1078's anonymous carrier still gets none** (the regression guard for the earlier ruling, and the reason the predicate is the name rather than `!stated`); and the canvas is asserted separately to be unchanged in both directions, since the whole decision rests on the two questions staying different.

### Consequences

`app/panelRows.ts` (new — the decision and its docblock), `App.tsx` (calls it).
## ADR-AG-115 — A described position is named by the point that occupies it, never by an invented letter (#1167)

**Requirements:** [02c](02c-requirements-analytic.md) — what the panel promises about the letters it prints: every letter it shows names something the student created. **Design:** [04c](04c-design-analytic.md) — the description layer asks the figure who is there. **LADDER stage:** presentation. No parse, engine or solver change. **Extends** ADR-AG-021's relative-tolerance rule; sibling of #1153 / #1126.

**Operator, 2026-09-17**, with a screenshot:

> *"i see that we now have 2 points on the same location A and O. this should not happen. if a point that we didnt name is now on a given point, it should get the point that is already there"*

The panel printed `O(0, 0), r = 4` under «עקומים» while `A = (0, 0)` sat directly above it under «נקודות». Two letters, one position, and the student had created only one of them.

### There was never a point `O`

Measured through the real `derive` → `buildScene` path: the figure holds four points and draws four points; `centresOf` correctly offers nothing; `freeLetter` returns `Q`. **`O` was a string literal in the description function** — and so were `F`, `F₁` and `F₂`, in the same `switch`. A figure holding a real point `F` and a parabola printed two different `F`s in one panel.

Fixing the circle branch alone would have been the patch shape: the defect is *the description layer names positions with invented letters*, and it had four instances.

### The rule

**A described position is named by the point that occupies it, and by nothing otherwise.**

```
circle centred where A sits      ->  A(0, 0), r = 4
circle centred where nobody sits ->   (0, 0), r = 4          <- no letter, not a new one
parabola, no point at the focus  ->   (27/2, 0), x = -27/2
parabola with the student's F    ->  F(27/2, 0), x = -27/2
```

Falling back to an invented letter when nobody is there would be the defect with a different spelling, so the coordinates stand alone.

### The occupancy question is EXTRACTED, not copied

`centresOf` has asked *"is a point already here?"* since #1024, to avoid offering a ring where one sits — with a tolerance **relative to the figure** (`apart`), which is ADR-AG-021's rule and what #1113 installed. The description layer never asked at all.

`pointAt(figure, x, y)` is now that one question, and `centresOf` calls it too. The alternative — a second `Math.hypot` test beside the first — is what the issue's own plan warned against: two ideas of "near" that drift the moment the tolerance changes, and an absolute epsilon in the copy would quietly undo the relative discipline. The panel and the centre ring can no longer disagree about whether a position is taken.

`curveParts` takes the answer as a parameter rather than computing it, because the question needs the figure and its scale and the caller already holds both.

### ⚠ Three #1212 expectations changed, and that is recorded rather than quiet

`issue-1212-curve-equation.test.ts` asserted `O(3, 4)`, `F(2, 0)` and `F₁`/`F₂` — **the invented letters that are the defect**. They call `curveParts` with no figure, so nobody occupies anything and the coordinates now stand alone, which is the correct answer for a bare call rather than a loss of coverage.

Every assertion on the **equation** — what that file exists to guard — is untouched. Changing a test to make one's own code pass is the tripwire this repo names; changing one that encoded the bug is a different act, and the difference is only visible when it is written down.

### Lock

`issue-1167-panel-names.test.ts`: the operator's own figure asserting `A(0, 0), r = 4`; a circle centred where no point sits asserting **no letter at all**; a parabola with and without a real `F` at its focus, asserting the student's letter is used and never invented; and `centresOf` asserted to still decline a taken centre, since both now depend on the one extracted predicate.

### Consequences

`engine/crossings.ts` (`pointAt` extracted, `centresOf` calls it), `app/curveText.ts` (the four sites ask instead of inventing), `App.tsx` (supplies the figure's answer).
## ADR-AG-114 — A noun gate may not claim a tail that is not an equation (#1246)

**Requirements:** none (internal) — no promise changes; a refusal stops naming the wrong thing. **Design:** [04c](04c-design-analytic.md) — `matchCurve`'s claim gate. **LADDER stage:** parse. No engine, solver or render change. **Completes** the #1059 guard; **repairs** a regression of [ADR-AG-111](#adr-ag-111).

### The defect

«הקטע BC = 10» answered **`bad-equation`** — «לא הצלחתי לקרוא את המשוואה» about an equation the student never wrote. They wrote a **length**. The message sent them to hunt for a typo in something that does not exist, which is the honesty invariant on error messages failing: *an error names the conflicting STATEMENT, never internal state.*

Measured, `parseLine`, before ADR-AG-111 and after:

| utterance | before (`18f75b7e`) | after (`33f6a08f`) |
| --- | --- | --- |
| `הקטע BC = 10` | `not-handled` | **`bad-equation`** |
| `הצלע BC = 10` | `not-handled` | **`bad-equation`** |
| `התיכון BC = 10` | `not-handled` | **`bad-equation`** |
| `הישר BC = 10` | `bad-equation` | `bad-equation` *(pre-existing)* |

**ADR-AG-111 did not create this — it enlarged it.** Widening the noun registry from two members to nine took the same defect from one noun to nine. The fix closes the older `הישר` member too, which is how it is known to be aimed at the class rather than at the nouns that happened to be added.

### Root cause — a documented class this branch never joined

The fourth instance of one shape, three of which this file already documents (#1059, #1093, #1068/#1123): **a rule recognises a PREFIX, claims the remainder unconditionally, then refuses on the student's behalf.**

`matchCurve`'s caller already held half the cure — the #1059 test that the tail contains no Hebrew, which asks *"did the sentence continue in prose?"*. It does not ask *"is this an equation at all?"*, and `10` is neither prose nor an equation.

### The discriminator is the PLANE'S OWN VARIABLES, and deliberately not a parse

*Does the tail name `x` or `y`?* `10` names neither, so the rule has no claim on it.

It does **not** require the tail to parse as an equation, and that distinction was found by measurement rather than reasoning. The first draft did require it, and it turned #1059's own case — «נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2», a **truncated** equation with no `=`, which parses as nothing — from an honest `bad-equation` into `not-handled`. The student plainly meant an equation and must be told it is unreadable. So the gate asks what was **meant**, not what the text achieves.

### Asked at the single exit, because per-branch does not work

Placed beside the #1059 guard at `matchCurve`'s caller, it covers every branch at once — they all funnel through it.

**Gating `heLineNamed` alone was tried and REJECTED, measured:** the sentence then falls through to the no-noun branch, which claims it and **mints a curve**. Worse than either refusal, and a fix that moves the failure one branch down is not a fix. Recorded so it is not re-derived.

### Lock

`issue-1246-equation-claim.test.ts` (17): every noun in the registry plus the bare «אורך» form asserting `not-handled` and never `bad-equation`; **the pre-existing `הישר` member**, which is what makes this class-level rather than per-noun; the truncated-equation row that defines the discriminator; ADR-AG-111's whole table still building; and #1059's prose guard, kept beside the new condition because the two now share one gate. 8 of 17 fail against pristine `parseAnalytic.ts`.

## ADR-AG-116 — A named crossing may not be a point the figure already names (#1175)

**Requirements:** [02c](02c-requirements-analytic.md) — a position has ONE name; the intersection sentence is held to it like every other naming. **Design:** [04c](04c-design-analytic.md) — the intersection rule's structural gate, and its stated scope. **LADDER stage:** parse. No engine, solver or render change. **Family of** #1113 / #1153 / #1167.

**Operator, playing round #1169 T4:** *"the data input should have been rejected since point B is already there"*.

### Measured

```
משולש ABC · A(2,-5) · P נקודת החיתוך של הישר AB עם הישר BC

verdict   accepted, no note      |PB| = 1.2e-8      faults: []
```

`AB` and `BC` share the vertex `B`; their intersection **is** `B`. The figure ends up with two names for one point, and «משולש ABC» had already given it one.

It **compounds**, which is what lifts it above a cosmetic duplicate: `P` is a distinct object with its own row, its own two incidences and its own entry in the DOF accounting, so every later statement about `P` is solved against a point the student believes is separate from `B`.

### The ruling, and the message it dictates

**Operator, 2026-09-17: refuse, naming `B`** — *"AB and BC meet at B"* is the information the student is missing. Refusal also cannot silently discard a given, which absorbing it as a rename could.

So the refusal carries a **`holder`**, and that is why it gets its own `ParseFailure` code rather than reusing `already-named` (#1153): that code's message tells the student to delete a line and rewrite it, which is advice for a different mistake. A code with only a `detail` could not name the letter at all.

### The test is STRUCTURAL, and that is the whole reason it is safe

Both operands are written in the sentence, so two lines named by two points each **that share exactly one letter** meet at that letter — in every configuration, with no solve, no seed and no tolerance. The check is textual and total.

### ⚠ The scope, measured rather than assumed — which the ruling required

The ruling asked the implementing round to **measure the other members of the class before deciding to stop at the structural one, and to say so rather than leave the rest silent by omission.** Three were measured:

| member | before | after |
| --- | --- | --- |
| named carriers sharing a written letter | `\|PB\| = 1.2e-8`, `faults: []` | **refused, naming `B`** |
| two EQUATIONS crossing where a point already sits | `\|PA\| = 1e-9`, `faults: []` | **unchanged — still minted** |
| a line and a circle meeting at a point already on both | `bad-operand` | `bad-operand` — that sentence does not parse at all |

**The second member is real and is NOT fixed here.** Catching it means computing the crossing and comparing it to the figure's points — a positional test with its own tolerance question, which the ruling pre-declared *"an escalation, not an expansion"*. Filed as **#1254**, with the distinction it will have to draw: an *invariant* coincidence (a pinned point, fixed equations) is the same point and should be refused; an *incidental* one that holds at one configuration and not another must still build, which is this issue's own third lock.

The third member is not reachable by that sentence and is a separate gap, not this defect.

### A second finding, filed not fixed

«הישר AB עם הישר BA» is **one line**, so its "crossing" is the whole line rather than a point. Measured, it builds an under-determined `P` floating along `AB` with `faults: []`. That is a different defect — an unconstrained point, not a duplicate name — and its honest answer may be a refusal or may be «P על הישר AB», which is the student's to decide. **#1255**; deliberately untouched here so this code never claims a sentence it cannot explain.

### Lock

`issue-1175-crossing-named.test.ts` (8): the operator's own line refused and naming `B`; **no second point at B's position, asserted as a property of the figure** rather than a fault code alone, because a refusal that still left a point behind would satisfy a code-only check; the holder asserted to survive the trip to the submit layer; both letter orders and both shared vertices; and — the whole risk — **a genuine crossing where nothing is named still builds and still names `P`**.

One row asserts the **known-incomplete** positional behaviour on purpose: if a later change starts refusing it, that is #1254 being answered, and the row is the prompt to read that ruling rather than to delete it.

Verified to bite: 5 of the 8 fail against pristine `parseAnalytic.ts`.

### Consequences

`parser/parseAnalytic.ts` (the code and the structural gate), `app/submit.ts` (the refusal now carries its context to the UI by spread, so the next code that carries some arrives intact), `store/useAnalyticStore.ts`, `App.tsx`, `i18n/index.ts` (both locales).
