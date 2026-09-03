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
