# CLAUDE.md — the analytic-geometry Builder (`src-analytic/`)

Guidance for Claude Code in the **analytic** product tree. The workspace-wide rules (standing rules,
workflow, commands) are in the [root CLAUDE.md](../CLAUDE.md) and apply here unchanged; this file
adds only what is specific to this tree.

**This is an orientation file, not a session log.** No history, no status — those live in
[`docs/06c-decisions-analytic.md`](../docs/06c-decisions-analytic.md) (the tail is the most recent
work) and `gh issue list --label analytic`. A guard test rejects dated progress entries here.

## What this is

The **fourth** app in this repo, for the bagrut **analytic-geometry** question (שאלון 572 Q1): the
coordinate plane, with points, lines, circles and canonical conics as objects carrying equations.
Plan: [docs/19](../docs/19-analytic-geometry-tool.md). Decisions: `ADR-AG-NNN` in
[06c](../docs/06c-decisions-analytic.md). Issue label `analytic`.

**DEPLOYED** since `prod/2026-09-16` at `/analytic-builder/` — the registry entry carries `enabled: true`
(the [ADR-AG-007](../docs/06c-decisions-analytic.md#adr-ag-007) hold was lifted by the operator; see
[DEPLOY-LOG](../docs/DEPLOY-LOG.md) 2026-09-16). A change in this tree reaches students on the next deploy
and pays the RUNBOOK's analytic row. Holding a builder back is one registry line (`enabled: false` plus
`devOnly: true`, which the roster filter still honours).

**Its distinguishing fact: the exam prints no figure.** 17 of the 20 sampled Q1s carry no drawing at
all and two of them instruct the student to draw one. The siblings *reproduce* a printed figure;
this tool *supplies* the one the exam withholds.

## Hard boundaries (operator authority)

1. **`src-analytic/` never imports another product tree.** Patterns are COPIED, not shared. A stray
   `@/` would typecheck (the alias is repo-wide) while silently coupling the products;
   `server/__tests__/isolation.test.ts` reads `BOUNDARIES.json` and rejects it. `vite.config.analytic.ts`
   deliberately defines no alias.
2. **NO CAS** ([ADR-AG-001](../docs/06c-decisions-analytic.md#adr-ag-001) D1). The equation layer
   parses and EVALUATES; it never simplifies, solves or manipulates symbolically. Pinning a
   parameter is a numeric root-find. Anything beyond a 1–2-DOF root-find goes back to the operator.
3. **Canonical conics only.** No hyperbola, no rotated conic, no translated conic — absent from
   twenty exams and from the formula sheet. `engine/conic.ts` refuses each **by name**; adding one
   is a decision, not a fix.
4. **Suite conformance is part of the acceptance gate**, not polish
   ([ADR-AG-004](../docs/06c-decisions-analytic.md#adr-ag-004)): the chrome is mounted from `shell/`,
   never re-implemented, and the roster/locale/parity checklist is green before a slice is "done".

## Where things live

| Module | What it is |
| --- | --- |
| `engine/expr.ts` | The numeric expression layer. Hand-written because the exam's notation multiplies by JUXTAPOSITION (`2a`, `4√5`, `25k²`). Also the single normalization chokepoint (`²`≡`^2`, `−`≡`-`, `√`≡`sqrt`) |
| `engine/conic.ts` | Equation → curve: the **exact** six-coefficient fit (seven lattice probes, no least squares) and the canonicity gate |
| `engine/types.ts` | Facts, construction, `Domain`. **The primitive is the OBJECT** ([ADR-AG-009](../docs/06c-decisions-analytic.md#adr-ag-009)): `Construction` is `{ params, objects }`, and `GeoObject` is a discriminated union whose two stated members are `point` and `curve`. A curve is ONE thing *as a curve* — an implicit `f(x,y;params)=0` plus its classified kind |
| `engine/derived.ts` | The closed forms for points DERIVED from stated parents — midpoint, centroid, incentre, orthocentre, circumcentre, diagonal meet. 0-DOF and solver-free; a degenerate configuration answers `null`, never a guess |
| `engine/carriers.ts` | **The DOF contract.** The free-parameter **register**, derived from what the objects' expressions actually use rather than from F11 declarations (a declaration *narrows*, it does not create — #1014); `carrierOf` / `symbolDeps` / `objectDeps`, exhaustive switches so a new object kind cannot be added without declaring its freedom |
| `engine/curves.ts` | Residuals (scale-normalized), conic roles (focus/directrix/foci), extents, the polylines the renderer draws |
| `engine/apply.ts` | **The M1 boundary** — the one place that decides new-object vs statement-about-an-existing-one. Here on day one because questions arrive in SECTIONS |
| `engine/evaluate.ts` | Construction + seed → figure; `sampleParam`, and `isKnowledge` — the honesty gate |
| `engine/derive.ts` | `parse → fold → evaluate`, written once so app and tests take the same route |
| `parser/` | `parseAnalytic.ts` (the docs/19 §10 families) + `catalogAnalytic.ts`, the coverage map with a guard test asserting every entry parses in He **and** En |
| `render/` | `scene.ts` (pure: isotropic, Y-flipped transform + axes) + `Figure.tsx` |
| `store/`, `App.tsx`, `i18n/` | Lines as the source of truth; the shared frame mounted; He/En resources |

## The model in one page

- **The gauge is PINNED.** Unlike the synthetic tool, a coordinate here is knowledge, not one
  sample's accident. So the honesty question changes from "is this position meaningful" to "is this
  value invariant across every admissible parameter value" — `isKnowledge`, and it is the function
  that most deserves its tests, because with values shown in the data panel it carries the whole
  honesty boundary.
- **An unpinned parameter is a FREE DOF sampled inside its domain**, never a fixed default
  ([ADR-052](../docs/06-decisions.md#adr-052)) — it must move when «הציגו תצורה אחרת» advances the seed.
  **Including one nobody declared:** the register comes from the objects' own expressions
  (`carriers.ts`), so a symbol is free because it is *used* and unpinned, not because a sentence
  announced it (#1014).
- **Evaluation needs NO topological sort.** `apply` refuses a statement naming an object that does
  not exist, so a parent always precedes its dependent and declaration order is provably valid. The
  invariant is asserted (`depsPrecedeDependents`), never re-established by a sort. A kind that can
  forward-reference would earn one ([ADR-AG-013](../docs/06c-decisions-analytic.md#adr-ag-013)).
- **A derived point can SHOW ITS CONSTRUCTION** (`constructionOf`, behind «הצג בנייה») — the medians,
  altitudes or bisectors that define it, with each median's parts labelled `2x`/`x`. It is
  **decoration**: no id, no letter, never in the fact list. It must be drawn from the REAL geometry,
  so its tests assert geometry, not pixels ([ADR-AG-014](../docs/06c-decisions-analytic.md#adr-ag-014)).
- **A shape noun that carries a GIVEN may not be drawn as a plain ring of sides.** «מקבילית» asserts
  AB ∥ DC; until the constraint layer can honour it, it is refused BY NAME (`out-of-scope`) — never
  flattened (a stated given may not vanish), never escalated to the LLM (we understand it).
- **A shape noun also promises a RING** no constraint can keep: `engine/rings.ts` is the predicate,
  `drawableAt`'s `whole()` its only consumer; **simple not convex, collapsed not narrow**
  ([ADR-AG-080](../docs/06c-decisions-analytic.md#adr-ag-080)). **A locus is KNOWLEDGE AS A SET** —
  that gate's second arm, honest *because* the figure is under-determined; its equation prints only
  when two configurations trace the same set ([ADR-AG-081](../docs/06c-decisions-analytic.md#adr-ag-081)).
- **Every surface that prints a number is gated**, and remembering only one is the recurring failure:
  a coordinate through `isKnowledge`, a curve equation through `knownCurve`. The curve half was
  missing until #1020 while the suite stayed green. **A row that prints a number is a claim; find its
  gate before you add it.**
- **An inequality is one of THREE things** ([ADR-AG-005](../docs/06c-decisions-analytic.md#adr-ag-005)
  D7), and they are not interchangeable: a **parameter domain** (declaration; filters a pin's roots,
  silently), a **branch selector** (post-solve; picks among branches), a **sweep range** (sampling;
  bounds a free DOF). Treat a domain as a selector and `a>0` wrongly reports "no valid
  configuration"; treat a sweep range as a constraint and a free point becomes determined.
- **The student types the exam's own sentence.** Catalog entries are corpus phrasings, never an
  invented command language.

## Recurring traps

- **This tree has no private display rounder.** Numbers go through `shell/format.ts` `fmtNum` — the
  operator's two-decimal ruling (#723) is a CHOKEPOINT, not a precision. A local `toPrecision` here
  printed a centroid as `-1.666666667` and stayed invisible until the tool computed its first
  non-terminating coordinate (#1029).

- **Hebrew morphology: write out the alternation.** «נתון» ends in FINAL nun (ן) and «נתונה /
  נתונים / נתונות» in medial nun (נ), so `נתונ(ה|ים|ות)?` silently drops the commonest form. This is
  the `מאונ[ךכ]` class from the 3-D tree on a different letter. Same for the optional definite
  article (`ה?מעגל`) and the optional subject noun (`הנקודה A` ≡ `A`).
- **`ℓ` is not a `\w` character** — never `\b` after a line name; use an explicit class or lookahead.
- **A case-insensitive Roman-numeral class eats real input.** `[IVX]{1,3}` with the `i` flag read the
  `x` of «the circle x²+y²−2ax−2x=0» as a numeral and swallowed the equation. Numerals are matched
  case-sensitively with a following-separator lookahead.
- **Adding this product changed SIBLING tests.** `products.json` feeds the admin form and the docs/22
  table, so a fourth entry moved fixtures in `server/__tests__/admin-config.test.ts` and required the
  §9 column. Expect roster-shaped changes to surface outside this tree.
