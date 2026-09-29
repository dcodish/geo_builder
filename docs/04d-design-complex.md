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
- **A free polygon starts as a shape** ([ADR-CX-052](06d-decisions-complex.md#adr-cx-052)). The tier-2
  start for a polygon whose every vertex is fully free (both halves, no quadrant window, not the origin) is
  `polygonShapeStart`: a jittered regular n-gon with a per-seed centre, size and rotation. Only the start
  changes: the free basis, the DOF count and the solve are untouched, so a given still moves a vertex.

- **The region count excludes a polygon's own corners** ([ADR-CX-053](06d-decisions-complex.md#adr-cx-053)).
  `resolveObjects` publishes a polygon's `cornerNames` (its vertex names minus the members of any
  enumerated solution set), and `regionsOf` leaves those out of `members`. The region still shades; the App
  strip renders only when `members` is non-empty.

- **The grid is the renderer's, sized to the visible window** ([ADR-W-094](06w-decisions-workspace.md#adr-w-094)).
  The scene has no W, H or zoom, so it publishes only the ray angles. `render/visibleGrid(W, H, k)` computes
  the cartesian step and lines, the rings out to the visible corner, and the ray reach, through the shared
  `shell/ticks` rule.
- **Knowledge is decidable.** Whether a value is forced is a question about the nullspace and the
  configuration set, not a sampling heuristic — so [`FR-KN-1`](02d-requirements-complex.md) ("a number
  printed on screen is knowledge") has an exact test behind it: `knowledgeOf` evaluates the value in
  every configuration and prints iff the set is complete and they agree
  ([ADR-CX-049](06d-decisions-complex.md#adr-cx-049)).
- **The configuration set** is tier 1's kept branches × each branch's numeric solutions
  ([ADR-CX-049](06d-decisions-complex.md#adr-cx-049)). `foldConstraints` solves every kept branch
  (`systemFor`); stage 3b's census (`solve/census.ts`) reports each system's distinct solutions and
  whether they are all of them. A polynomial read structurally off the AST in the one complex unknown
  (or its conjugate) is a completeness certificate. A deterministic multi-start is only a floor. The
  list has a seed-free canonical order, so the configuration index walks every drawing, and
  `configCount` feeds `canCycle`.

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
- **A solved parameter has ONE exact value** ([ADR-CX-043](06d-decisions-complex.md#adr-cx-043)). Tier 1
  publishes `paramValues` (each determined parameter as an exact `ExpVec`), and `substituteSolvedParams` is the
  only way a solved atom leaves a modulus: `knownModulus`, the drawn reading, the «פרמטרים» panel section
  (`Derived2.params`) and the ask lane all read it, so none can print `18r` for a number the givens made
  10. The class net `accepted-line-visible-1390.test.ts` fails any accepted given whose numbers and
  parameters appear on no surface.
- **A parameter's sign follows its use** ([ADR-CX-045](06d-decisions-complex.md#adr-cx-045)). ONE reading,
  `paramSigns` (`model/paramSign.ts`), splits the parameters into SIZES (under `|…|`, a `mod` row, a
  radius, a measure, or one product with a complex name) and SIGN-FREE (everything else; any size use
  wins). Both tiers read it. Tier 1 keeps a sign-free parameter's magnitude in the modulus constant,
  exactly as a size's, and adds its sign as an argument unknown `#s:p` pinned by `2·s − k = 0`, so the
  enumeration decides it: `u^5 = -32` has one integral sign (½), `u^4 = -16` has none and refuses
  through the existing integrality check. Tier 2 bounds a size `> 0`, holds a tier-1 sign to its branch,
  and leaves a tier-2-only sign-free parameter (`a + b·i`) unbounded, with a per-seed starting sign.
  Stage 5d prints the sign (`-2`, `±2`) and reads a free sign-free magnitude as `|u|`.
- **A declaration is a type, read before any line** ([ADR-CX-047](06d-decisions-complex.md#adr-cx-047)).
  `isComplexName` takes a SCOPE, the letter families the figure declared complex, and the per-line
  parser is handed it by `lowerLines`, which reads every declaration first (`complexScopeOf`). That is
  what makes a declaration order-independent without making the parser stateful. A declaration reports
  `typed`, never `declares`: it types a letter and creates no number, so it neither grounds nor clashes
  with an enumeration of the same letter. A line that reads without the scope and fails with it is a
  declared letter in a real slot, and it is reported against the declaration (`declared-complex-real`)
  and refused by the gate with the statement named (`complex-as-real`). The teaching note on a solved
  parameter (`app/paramNote.ts`) is offered only when the declaration it teaches passes that same gate.
- **A solution set claims its names** ([ADR-CX-042](06d-decisions-complex.md#adr-cx-042)). `X^n = …` on a fresh
  letter lowers to X₁ pinned to the principal root and Xₖ pinned `(k−1)/n` of a turn from it — always,
  whether or not the student already holds some Xₖ. That makes claiming the name the consistency
  check: there is no fallback that steps around a taken name, because stepping around it is what hid
  the contradiction. **Which root a stated member claims is decided by the member, not its index**
  ([ADR-CX-044](06d-decisions-complex.md#adr-cx-044)): `lowerLines` holds each set's rows back, tier 1
  solves the rest of the figure once, and a DETERMINED member off its index root keeps its own root while
  the unstated names take the rest. In every other case the index pins above are emitted unchanged.
- **An equation is about its letter in every spelling** ([ADR-CX-050](06d-decisions-complex.md#adr-cx-050)).
  The roots SHAPE is read off the syntax tree by one function, `asRootsEquation` in
  `model/solutionSet.ts`, in three forms: `X^n = expr`; the same equation spelled `c·X^n + rest = 0`
  (lowered to `X^n = −rest/c`, so it IS the power shape and every ADR-CX-005 reading applies); and a
  polynomial in X of degree 2..4 (`PolyEquation`, G1). A fresh, un-indexed letter over a polynomial with
  CLOSED coefficients enumerates: `solve/polySet.ts` takes every root from the census's root finder
  (`allRoots`, one root finder in the tree), orders them seed-free by direction then modulus, and lifts
  each into the exact carriers when some power |r|ᵏ (k ≤ 4) is rational (direction: a nice turn, or an
  angle atom shared ± with a mirror root). `Xₖ = root` is then an ordinary definition. A root no carrier
  holds is a numeric definition, which stage 3a **places** rather than searches (a name a closed number
  defines is not a free coordinate). A stated member claims its root by set membership. An indexed
  letter never enumerates (no z₁₁). Anything else keeps the ordinary equation, and ADR-CX-049's census.
- **A question about a set's letter is asked of every member** ([ADR-CX-050](06d-decisions-complex.md#adr-cx-050)).
  `lowerLines` publishes each enumerated set (`FoldInput.solutionSets`, letter → members), and stage 5d
  substitutes each member into the asked expression and hands every value, in every configuration, to
  the one predicate `knowledgeOf`. Values that differ inside one drawing are the set's own spread and
  read `multi-solution`, naming the first member.
- **A line's names are read by ONE helper** ([ADR-CX-048](06d-decisions-complex.md#adr-cx-048)).
  `declares` lists only the names a line CREATES. `X^n = …` carries its letter in `roots` alone, so a
  check that read `declares` let a second equation on a reserved letter through as a phantom point.
  Any question of the form *does this line touch name N?* (the reserved-letter clash, the `mentioned` set
  `rootsMode` asks) reads `namesUsed(line)` in `app/deriveLines.ts`, never `declares`.
- **A display transform never reaches the parser or the engine.** The polar↔cartesian toggle and the `n`
  stepper are view state, outside the store and outside undo. So changing how a number is *shown* can
  never change what was *stated* — a class of bug that is otherwise very hard to see.
- **The cartesian spelling is the value layer's, and it is exact by TABLE, never by recognition**
  ([ADR-CX-046](06d-decisions-complex.md#adr-cx-046)). `value/cartesian.ts` computes `r·cos θ` and
  `r·sin θ` from the exact carriers (modulus exponent vector, argument in turns) for the turns whose
  cosine has a real-radical form — multiples of 15°, 18° and 22.5° — splitting the modulus into a
  rational factor, a square-root factor folded into the terms, and a residual higher root spelled by
  the one modulus formatter. A float is never "recognised" as a radical. The table decides whether a
  part is EXACT; a separate printing policy, `readableCartesianParts`, decides whether it is PRINTED —
  at most one root sign per part, and if either part fails the whole reading is the `≈` decimal. Every
  surface (the stage-5d reading shared by canvas and panel, `value.formatCartesian`) asks the policy,
  never the table directly. ONE composer (`composeCartesian`) spells every `a+bi` in the product, exact
  or decimal, and drops a zero part.
- **The engine states WHAT happened; the reading layer words it.** Verdicts carry structured reason codes
  (`model/why.ts`), so the same fact reads correctly in Hebrew and English and the wording can improve
  without touching the engine. **A refusal carries its reason too** ([ADR-CX-048](06d-decisions-complex.md#adr-cx-048)):
  a line the fold set aside reaches the strip with its `why` (`refusalWhy` → `InputError` `refused`,
  worded by `app/errorText.ts`), never as the generic «אינו מתיישב עם», which asserts a contradiction.

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
