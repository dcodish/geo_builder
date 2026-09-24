# 04d — Design: the complex-numbers Builder (`src-complex/`)

_How the complex product is built. Registered in [`DOCS.json`](../DOCS.json) as the `complex` product's
design doc ([ADR-W-041](06w-decisions-workspace.md#adr-w-041))._

**What it must promise** is [02d](02d-requirements-complex.md). Decisions are
[06d](06d-decisions-complex.md); the plan and the authoritative grammar contract are
[docs/27](27-complex-numbers-tool.md). The ordered stage contract every mechanism inserts into is
[LADDER-CX](LADDER-CX.md) — **every mechanism ADR names its stage and updates that file.**

## The central idea: log-polar makes the corpus linear

The engine's coordinate system is **`(u, θ) = (ln|z|, arg z)`**.

Every *multiplicative* operation — product, quotient, power, root — is **linear** in those coordinates.
Since the multiplicative structure is what a bagrut Q3 is mostly made of, the corpus's core becomes an
**exact ℚ-linear system solved by elimination, not iteration**. That is what licenses
[`FR-CN-1`](02d-requirements-complex.md): a forced modulus or argument is reported exactly, with no
numerical drift to explain away.

Sums, areas, distances and series are the **numeric residue** — the part that does not linearise — and
they are handled as such rather than pretending the whole problem is exact.

This is the product's one genuinely new core, and it is why the tree could ship without a CAS
([`FR-CN-2`](02d-requirements-complex.md), bounded linear algebra over two vector spaces,
[ADR-CX-006](06d-decisions-complex.md)).

## Three consequences that fall out of the same choice

- **Branches are integer unknowns.** The `k` in an angle equation is the exam's «כל האפשרויות»; in
  log-polar it is literally an integer in a linear relation, so the solution set is *enumerable* rather
  than searched. "Show another configuration" walks that set.
- **Free DOF is the nullspace dimension** — **one** definition, read by the DOF cue, the knowledge gates
  and the sampler alike. Three consumers of one number cannot disagree with each other, which is exactly
  how a "default masquerading as fixed" hides in a system with three definitions.
- **Knowledge is decidable.** Whether a value is forced is a question about the nullspace, not a
  sampling heuristic — so [`FR-KN-1`](02d-requirements-complex.md) ("a number printed on screen is
  knowledge") has an exact test behind it.

## Shape

| Layer | Size | What it is |
|---|---|---|
| `parser/` | ~2,500 lines | Sentence-family rules; **span accounting** is the only drop-prevention mechanism |
| `replay/` | ~1,650 | The fold from ordered lines to a figure |
| `solve/` | ~1,645 | The ℚ-linear core, the knowledge gates, tiering |
| `model/` · `value/` | ~1,900 | Claims, verdicts and reason codes; the value layer |
| `scene/` · `render/` | ~1,200 | The Gauss plane |
| `app/` · `store/` · `ui/` · `formulas/` | ~1,190 | Line derivation, the Zustand store, chrome glue, the formula table |

## Design rules with teeth

- **Span accounting, and no `dropped*` gate — ever.** Every non-filler token span in a line is claimed by
  the parse, or the line is refused ([`FR-LN-1`](02d-requirements-complex.md)). The 2-D history is the
  argument: per-symptom `dropped*` gates accumulate, each one narrow, and still leave holes — one of them
  became a false positive that made a whole family unreachable in production. Verified 2026-09-05: no
  `dropped*` gate exists in this tree.
- **A second mention of a name is a GIVEN, and that decision lives at ONE seam.** Rules ask
  `existingRef()` rather than each deciding for itself
  ([ADR-CX-005](06d-decisions-complex.md), [ADR-CX-009](06d-decisions-complex.md)) — the difference
  between a rule and an enumeration of the cases someone remembered.
- **The parameter floor: a real parameter is a SINGLE letter** (`PARAM_NAME` in `exprParse.ts`;
  [ADR-CX-040](06d-decisions-complex.md#adr-cx-040)). [ADR-CX-004](06d-decisions-complex.md) rules that
  a name outside the z/w family *is* a real parameter, so `|z₁| = 9r` needs no declaration. Without a
  floor on the NAME that ruling invents a coefficient from any word the grammar does not know —
  `add z1 = 3+4i` parsed as `add · z1 = 3+4i` and reported `ok` (#1364). Two glued capitals are a
  distance (#791) and resolve before the floor; everything else multi-letter refuses.
  **This is also the limit of span accounting, and the reason the two rules are stated together:**
  the accountant guarantees every token is *claimed*, not that the claim is *meaningful*. `add` was
  claimed — as a parameter — so the line balanced perfectly while meaning something the student never
  wrote. A grammar where juxtaposition means multiplication needs both: every span claimed, and a
  floor on what a claim may invent.
- **A parameter lives in the modulus CONSTANT, and the leftover rows are read over the parameters**
  ([ADR-CX-041](06d-decisions-complex.md#adr-cx-041)). `9r` is `{3:2, r:1}` in the constant, never an
  unknown, because every parametric answer (`15r`) reads that encoding. So a given that DETERMINES `r`
  (`|z1| = 9r` beside `z1 = 3+4i`) eliminates to a `0 = c` row whose constant carries `r` — and that row
  is an equation in `r`, solved as its own small system over the parameter atoms, not a contradiction.
  A solved parameter is drawn at its value and leaves the free basis. The argument half holds the other
  end: a turn-unknown pinned to a non-whole constant is always a contradiction.
- **A solution set claims its names** ([ADR-CX-042](06d-decisions-complex.md#adr-cx-042)). `X^n = …` on a fresh
  letter lowers to X₁ pinned to the principal root and Xₖ pinned `(k−1)/n` of a turn from it — always,
  whether or not the student already holds some Xₖ. That makes claiming the name the consistency
  check: there is no fallback that steps around a taken name, because stepping around it is what hid
  the contradiction.
- **A display transform never reaches the parser or the engine.** The polar↔cartesian toggle and the `n`
  stepper are view state, outside the store and outside undo. So changing how a number is *shown* can
  never change what was *stated* — a class of bug that is otherwise very hard to see.
- **The engine states WHAT happened; the reading layer words it.** Verdicts carry structured reason codes
  (`model/why.ts`), so the same fact reads correctly in Hebrew and English and the wording can improve
  without touching the engine.

## Claims — three verdicts, and why the third is not optional

`model/claim.ts` returns **`holds` / `refuted` / `unknown`**, where `unknown` means *not decidable from
what has been stated*. It is deliberately distinct from `refuted`, and the reason is pedagogical rather
than technical: a claim about a direction the givens leave free **is not wrong, it is unanswered**, and
marking it ✗ would tell a student their correct answer was incorrect because they had not finished
entering the question.

In a product whose defining interaction is entering a problem **line by line**, that distinction is the
difference between a tool that checks a student and one that contradicts them out of its own
incompleteness. It is the design decision from this tree most worth copying — the 3-D builder collapses
`unknown` into `refuted`, which is [#909](https://github.com/dcodish/geo_builder/issues/909).

## Boundaries

`src-complex/` never imports `src/` or `src3d/`; the engine layer is **copied-never-shared, always**. It
was the **first consumer of [`shell/`](04w-design-shell.md)** — created with this tree as its only
consumer precisely so the shared chassis could be proven on a product that was not yet in production
([ADR-W-016](06w-decisions-workspace.md#adr-w-016)).

The standing sibling guarantee ([ADR-W-017](06w-decisions-workspace.md#adr-w-017)) is checked, not
promised: `npm run check:siblings` refuses any change to `src/` or `src3d/` and builds both regardless of
the diff, because a shared-surface edit can break them without touching one of their files. It takes ~10
seconds and it does **not** replace `npm run test:full` — the builds prove the siblings compile, only the
suite proves they behave.

## Known gap

- **`/complex-builder/api/*` is not reverse-proxied in production**, so the per-tool operator config is
  silently inert there. **[#903](https://github.com/dcodish/geo_builder/issues/903)** — an Apache
  conf gap, not a code one, and the "silently" is the part that matters.
