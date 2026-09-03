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
