# 04d — Design: the complex-numbers Builder (`src-complex/`)

_How the complex product is built. Registered in [`DOCS.json`](../DOCS.json) as the `complex` product's
design doc ([ADR-W-041](06w-decisions-workspace.md#adr-w-041))._

**What it must promise** is [02d](02d-requirements-complex.md). Decisions are
[06d](06d-decisions-complex.md); the grammar contract is the [02d](02d-requirements-complex.md) appendix "Grammar families",
and the build plan, [docs/27](archive/27-complex-numbers-tool.md), is archived history. The ordered stage contract every mechanism inserts into is
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

**The argument space has a basis that really is independent** ([ADR-CX-057](06d-decisions-complex.md#adr-cx-057),
[`FR-CN-9`](02d-requirements-complex.md)). An angle is rational turns plus a ℚ-combination of atoms,
and "carries an atom, so it is not a whole number of turns" is only sound when the atoms are
independent. So every Gaussian-rational literal is minted in the basis of the **canonical Gaussian
primes** (`value/gaussian.ts`): `arg(a+bi) = k/4 + m/8 + Σ (eₚ − ēₚ)·∠πₚ`, read off the factorisation of
`a+bi` in ℤ[i] — bounded trial division, no CAS. These **certified** atoms are ℚ-independent modulo
rational turns (unique factorisation), so relations between literals (`(2+3i)(−2+3i) = −13`) are exact
equalities and a surviving certified atom is nonzero by theorem. Every other atom is **opaque** (a
radical literal, a non-Gaussian polynomial root, an over-budget literal), and ONE three-valued test,
`zeroness` in `value/angle.ts`, decides it numerically at the atom's fixed degrees or answers
`unknown` — which the tier-1 leftover reports as undecided and the claim verifiers read as `unknown`,
never as a contradiction or a refutation.

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
  ([ADR-CX-049](06d-decisions-complex.md#adr-cx-049)). Over a complete set whose values number exactly TWO the
  verdict carries the pair (`two`, classified by `shell/valueOptions`); each stage-5d row prints it as
  `KnowledgeRow.pm` («±3») or `KnowledgeRow.or` («-1 או Re(z1) = 2»), an argument pair as two directions, and the
  ask lane reads `knowledgeAnswerText` ([ADR-CX-066](06d-decisions-complex.md#adr-cx-066), #1867).
- **The configuration set** is tier 1's kept branches × each branch's numeric solutions
  ([ADR-CX-049](06d-decisions-complex.md#adr-cx-049)). `foldConstraints` solves every kept branch
  (`systemFor`); stage 3b's census (`solve/census.ts`) reports each system's distinct solutions and
  whether they are all of them. A polynomial read structurally off the AST in the one complex unknown
  (or its conjugate) is a completeness certificate. A deterministic multi-start is only a floor. The
  list has a seed-free canonical order, so the configuration index walks every drawing, and
  `configCount` feeds `canCycle`.

## Shape

| Layer | What it is |
|---|---|
| `parser/` | Sentence-family rules; **span accounting** is the only drop-prevention mechanism |
| `replay/` | The fold from ordered lines to a figure |
| `solve/` | The ℚ-linear core, the knowledge gates, tiering |
| `model/` · `value/` | Claims, verdicts and reason codes; the value layer |
| `scene/` · `render/` | The Gauss plane |
| `app/` · `store/` · `ui/` · `formulas/` | Line derivation, the Zustand store, chrome glue, the formula table |

## Design rules with teeth

- **Span accounting, and no `dropped*` gate — ever.** Every non-filler token span in a line is claimed by
  the parse, or the line is refused ([`FR-LN-1`](02d-requirements-complex.md)). The 2-D history is the
  argument: per-symptom `dropped*` gates accumulate, each one narrow, and still leave holes.
  **A rule that searches for a keyword claims only the spans it read — never `claimAll` after a search**
  ([ADR-CX-060](06d-decisions-complex.md#adr-cx-060)). `quadrantGiven` is the pattern: claim the name, the
  noun, the ordinal. The property sentences (type, «לכל n», minimal n) read their property through ONE
  reader, `readProperty`, which claims one property word plus the meaning-free structure around it
  (number noun, «על הציר», «הינו»). Which sentence a refusal is worded with is decided after the
  accounting, from the unread spans (`negationAmong` → `errNegation`); it never makes a rule read more.
- **A stated object is drawn or refused, never dropped** ([ADR-CX-069](06d-decisions-complex.md#adr-cx-069)).
  `resolveObjects` runs at stage 3e beside the backstop and returns `{ drawn, undrawn }`; every undrawn
  object's `src` joins `unsatisfied`, the channel stage 0e's gate already reads — so the gate tries the
  other configurations, then names the blocking line or quotes the object's own. **One evaluator:** a
  radius is read by `evalReal` over the final environment, never by a private copy and never by its
  modulus; null or ≤ 0 is undrawable. **One name map:** an object's names (centre, vertices, the names
  inside the radius) are read label → number through `allAliases` (the #791 bindings and #694
  selections) before any lookup. The circle rule declares `refNames(radius)` with its centre.
  **Collinearity is a shape verdict** ([ADR-CX-072](06d-decisions-complex.md#adr-cx-072)): `circumcircle` has no circle when
  |d|/2 ≤ `FLATNESS_FLOOR` (asked through `flatPoints`) · span², span² the widest chord squared and the floor 1e-9
  (the operator's #2109 ruling, equal to analytic's `isDegenerate`), never an absolute epsilon. **One flatness predicate** ([ADR-CX-073](06d-decisions-complex.md#adr-cx-073)): `flatPoints` (the widest chord as the base, every point within the floor of it) is asked by `circumcircle` and by the polygon branch, so a polygon is undrawn when `flatPoints` holds and a triangle and its circle can never disagree; a segment is never flat-tested.
- **The marked origin is an OBJECT, never a number** ([ADR-CX-085](06d-decisions-complex.md#adr-cx-085), #2021).
  `originMarker` (`parser/rules.ts`, after `named-shape`, before `bare-expression`) reads «O», «נקודה O»,
  «O ראשית הצירים», «ראשית הצירים» … from the lexicon atoms `ORIGIN_KW` / `ORIGIN_LETTER_KW` / `POINT_KW`
  and lowers to `{ kind: 'origin' }` (`model/figure.ts`): it declares nothing, so `o` never becomes an
  unknown and the reserved-constant refusal is untouched. `resolveObjects` turns it into a `point`
  object at (0,0), known; `buildScene` lifts point objects out of `shapes` into `marks` (one per label),
  and the renderer draws a mark in the point layer's ink and drops the axis letter O while one is shown.
  Because a bare «O» now parses as a statement, the ask lane (#789) never sees it — no routing change.
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
- **A glued `i` is a coefficient times i, decided in the LEXER** (`gluedI` in `exprParse.ts`;
  [ADR-CX-058](06d-decisions-complex.md#adr-cx-058)). A two-letter run of a parameter letter and `i`
  (`bi`, `ib`) at the END of a term lexes as two tokens, so `a+bi` reads `a + b·i` — the floor
  above is untouched, because it never sees the run. The run stays one name (and the floor refuses it)
  when the reading is ambiguous: the other letter is complex (`zi`, `wi`, a declared family, a point
  label), a constant (`ii`, `oi`), or the run is glued to a following operand (`ib z1`); `pi` and `im`
  are words and never split. For a complex letter the submit path offers the explicit product
  (`z*i`) as a clarification, only once the grammar has read it.
- **Two numbers side by side are refused, decided ONCE** (`findJuxtaposedNumbers` in `exprParse.ts`;
  [ADR-CX-081](06d-decisions-complex.md#adr-cx-081)). A digit run standing alone (no letter, digit, `_` or
  `.` before it — exactly the runs the lexer reads as a `num` token), whitespace, then another such run is
  not a product: `lex` returns null on it, so no reader of a value can multiply it, and `parseLineV2` asks
  the same detector before every rule and returns `juxtaposed-numbers` with what it found. An integer then
  `a/b` is the mixed number, with analytic's regex copied verbatim (a text lock keeps them equal); the
  submit seam words it with analytic's sentence, and any other pair with the glued-`i` clarification,
  offering `2*3` only once the grammar has read it. The glyphs `½ ¼ ¾` are spelled as decimals at the
  orthography chokepoint (`normalize.ts`), whole part standing alone, so «2½» lexes as the exact 5/2.
- **The trigonometric form is a SPELLING of cis, fixed at the orthography chokepoint** (`trigToCis` in
  `parser/normalize.ts`; [ADR-CX-059](06d-decisions-complex.md#adr-cx-059)). `(cos θ + i sin θ)` becomes
  `cis(θ)` before any rule reads the line, so `2(…)`, `√2(…)`, `r(…)`, `|z1|(…)` attach a modulus
  exactly as they do to `cis` and the line lowers to the facts `r cis θ` lowers to — one polar path,
  not two that must agree. Only when the reading is unambiguous: the same angle in both slots; a group
  raised to a power keeps its parentheses (`2(cis45)^2`, never `(2cis45)^2`); an unparenthesised sum
  only as a whole additive term. A form with two different angles is left as typed, refuses, and the
  submit path names both angles (`trigAngleMismatch`, `trig-mismatch`).
- **One angle reader for every cis spelling** (`angleDegrees` in `parser/angleText.ts`;
  [ADR-CX-064](06d-decisions-complex.md#adr-cx-064)). A cis angle's TEXT becomes an exact rational number
  of degrees: a signed decimal as before, or a rational multiple of π (`π/4` → 45, `pi` the same as `π`).
  The expression lexer's `pi` token is read only by `readCisAngle`, which hands a span holding π to
  `angleDegrees` (parenthesised, or bare without a slash); `genericPolar`'s angle half and the trig
  rewrite's same-angle key ask the same function. π is never a value — the atom refuses anywhere else.
- **Which rule owns which polar shape** ([ADR-CX-068](06d-decisions-complex.md#adr-cx-068), #2029). A polar
  form the expression grammar can read is read by it alone: a numeric pair, and a real-letter modulus at a
  closed angle (`r cis 30`, `rcis30`, `(rcis30)`, the trig form, radians), where the letter is a parameter
  exactly as in `r·cis(30°)`. `genericPolar` keeps only what that grammar cannot read: a symbolic ANGLE
  (`2cis(θ)`, `r cis θ`) and an absent modulus with one. The expression lexer's letter run stops before a
  `cis` token, so a glued `rcis30` lexes as `r`, `cis`, `30`; no declarable name contains `cis`.
- **A number DEFINED by real parameters reads as its definition** (`model/cartesianForm.ts`;
  [ADR-CX-058](06d-decisions-complex.md#adr-cx-058)). `z1 = a+bi` is carried as a free unknown plus a
  numeric relation (making it a function of a and b in the solver is #1410, closed and parked in the icebox), so its exact carriers
  know nothing. Stage 5d reads the student's own definition instead — any `name = E` with E free of
  complex names and affine in its parameters over the Gaussian rationals — substitutes every parameter
  whose value is a known exact rational, and prints «z₁ = a+bi» / «z₁ = 3+bi» in the cartesian view
  (the polar view stays bare, FR-KN-1). With no parameter left the number is closed and reads exactly as
  the literal would, in both views. `DerivedPoint.defined` tells the panel rows the reading has
  something to say. That is the PANEL's reading.
- **A definition whose parameters are known is the number they make it** (stage 1a′,
  `closeKnownDefinitions` in `replay/derive2.ts`; [ADR-CX-082](06d-decisions-complex.md#adr-cx-082)). Before
  any reading, the fold solves tier 1 once, takes every parameter that solve makes an exact rational with a
  known sign (`knownRationalParams`: the parameters section's predicate, every enumerated branch agreeing on
  the sign), substitutes them into each deferred `name = E` with no complex name in E, and closes E with
  `closedUnder` (`model/fold.ts`). That file is the parser's value core (`radicalValue` / `constValue` /
  `foldConstants`), moved below both layers so replay calls the same code the parser does; its `pow` case
  reads an integer power, which the parser's fold never reaches. A closed row is replaced by `name = literal`
  and tier 1 is re-solved (a fixpoint, bounded by the row count), so the number takes exactly the path a
  typed literal takes: exact carriers, the reading, knowledge, the DOF list, the claim verifiers. The claim
  drive rows (ADR-CX-029) are computed after it. The student's own rows (`given`) stay what the canvas,
  the formulas and the rotations read; a closed zero stays the numeric residue (the log-polar carrier has
  no zero).
- **A restatement the exact solve already entails adds no row** (stage 0e′, `entailedBy` in
  `replay/derive2.ts`, asked by `submitLine` through `lineEntailed`; [ADR-CX-084](06d-decisions-complex.md#adr-cx-084)).
  The fold's exact half (`exactSolve`: parameter signs, stage 1a′, the claim drive rows) is one function that
  `foldConstraints` and `entailedBy` share. A typed line is entailed when its lowering adds only constraint
  rows (no name, object, claim, measure, filter, sequence, selection or unread line), none of them deferred,
  and tier 1 after it is consistent with the same free directions, exact moduli, parameter values and
  enumerated branches (`sameDirection`) as before. Tier 1 is linear over ℚ, so such a row lies in the span of
  the earlier ones. Seed-free; a sampled agreement never counts. The store carries the answer as `lastNote`
  (a notice banner, outside undo), never as a refusal. `hydrateSession` replays with `replaying` set, so a
  saved restatement stays a row.
- **A DETERMINED number with no exact form reads ≈ decimals** (stage 5d, `determinedReadings` in
  `replay/derive2.ts`; [ADR-CX-080](06d-decisions-complex.md#adr-cx-080)). After the exact carriers and a
  closed definition, a number defined by no parameter (`definitionOf` null) is asked through the ask
  lane's own predicate (`judge` → `knowledgeOf` over every configuration's value of the number); known →
  «z₁ ≈ 14.51+6.51i» / «z₁ ≈ 15.91·cis24.15°» through the same `readingOf` / `readingCartOf` composers
  (`exactParts: null`, so an integer pair keeps `=` and anything else `≈`), with `defined: 'determined'`
  for the panel rows. Not known → the bare name, unchanged. A parameter-free typed number's canvas label
  is its reading (ADR-CX-065), so the canvas shows the same text.
- **The canvas prints its own label** (`DerivedPoint.canvas` / `canvasCart`, stage 5d;
  [ADR-CX-065](06d-decisions-complex.md#adr-cx-065)). `statedAs` (`model/cartesianForm.ts`) reads how
  the student stated each number off the constraint shapes the lines themselves wrote (`FoldInput.stated`,
  without an enumeration's member placements): typed (`name = E`, E naming no other number), polar
  (its own `|name| = E` and `arg name = θ`, W7) or computed. Computed → the display name; polar or a
  parameter-free typed number → the reading; a typed number in parameters → its definition with only the
  letters the student VALUED substituted (`valuedParamOf`: `a = 3`), and only while the chip shows the
  value — closed, in each view's own form; open, the typed form in both views (W8). `lowerLines`
  records the valuing line per letter (`valuedBy`); the fold reports `paramChips` for a valued letter
  that appears in a typed form; `deriveLines` takes the letter-mode lines (`letterLines`), mapped by
  the App from the store's `display` map (keyed by store line index, shifted on removal, in the undo
  slice and the save file).
- **A radical is a token, and a radical LITERAL is a value** ([ADR-CX-056](06d-decisions-complex.md#adr-cx-056)).
  «√» / «∛» / «∜» / «ⁿ√» / «sqrt(» lex as one root token; a root of a rational literal becomes an exact
  value on the modulus exponent vector (so «√2cis45» stays a tier-1 literal), and any other radicand is
  the power the grammar already has (`pow(x, 1/n)` — no new AST kind). A constant with RADICAL parts
  («√3 + i») folds through the Gaussian-radical walk and the angle table, **verified symbolically**
  against the candidate turn before any exact value is claimed — the fold never invents exactness the
  table cannot prove. **Only the exact walk folds** (amendment 1; [ADR-CX-071](06d-decisions-complex.md#adr-cx-071)): a pair it
  recognises is a Gaussian rational (`fromCartesian`) or a radical literal (`radicalLiteral` — the
  table's turn, else a LITERAL ATOM carrying the exact pair in the one literal-atom registry, as
  `3+4i` is carried). There is no float read-back: a closed subtree the exact walk does not read
  (`15cis(π/7)`, `5cis(π/7) + 1`) stays as written — the exact tier carries the product, the sum is
  the numeric residue — and a float is never taken for the fraction it lands near. The cartesian reading of a
  literal atom comes from that registry (`literalAtomTerms`), not from the polar label. `cis`
  attaches after any operand at one point (`withCis`); a closed negative radicand refuses at the root
  atom; the orthography chokepoint reads an opening superscript before √ as the index and the word
  «שורש» before a number as √, and the submit seam teaches «שורש של N».
- **A parameter lives in the modulus CONSTANT, and the leftover rows are read over the parameters**
  ([ADR-CX-041](06d-decisions-complex.md#adr-cx-041)). `9r` is `{3:2, r:1}` in the constant, never an
  unknown, because every parametric answer (`15r`) reads that encoding. So a given that DETERMINES `r`
  (`|z1| = 9r` beside `z1 = 3+4i`) eliminates to a `0 = c` row whose constant carries `r` — and that row
  is an equation in `r`, solved as its own small system over the parameter atoms, not a contradiction.
  A solved parameter is drawn at its value and leaves the free basis. The argument half holds the other
  end: a turn-unknown pinned to a non-whole constant is always a contradiction.
- **A solved parameter has ONE exact value** ([ADR-CX-043](06d-decisions-complex.md#adr-cx-043)).
  The canvas keeps the student's `18r`; the substituted value is the panel's (ADR-CX-065). Tier 1
  publishes `paramValues` (each determined parameter as an exact `ExpVec`), and `substituteSolvedParams` is the
  only way a solved atom leaves a modulus: `knownModulus`, the panel's reading, the «פרמטרים» panel section
  (`Derived2.params`) and the ask lane all read it, so none can print `18r` for a number the givens made
  10. The class net `accepted-line-visible-1390.test.ts` fails any accepted given whose numbers and
  parameters appear on no surface.
- **A parameter's sign follows its use** ([ADR-CX-045](06d-decisions-complex.md#adr-cx-045)). ONE reading,
  `paramSigns` (`model/paramSign.ts`), splits the parameters into SIZES (under `|…|`, a `mod` row, a
  radius, a measure, or one product with a complex name or a written `cis θ` — the polar mark the parser
  puts on that unit literal, since `r cis 90` and `r·i` lower to the same value,
  [ADR-CX-070](06d-decisions-complex.md#adr-cx-070)) and SIGN-FREE (everything else; any size use
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
  **Every rule that would bring a name into the figure asks its type first** (`isRealLetter`, i.e.
  `isComplexName(name, scope)`; [ADR-CX-061](06d-decisions-complex.md#adr-cx-061)): a real-parameter letter
  is never declared. «a ממשי» reports `realTyped`, which the fold samples as a parameter and whose claim
  holds by type and never drives; the quadrant, argument and conjugates sentences decline a real letter.
  **And there is one subject reader, `readSubjects(scope, …)`** ([ADR-CX-062](06d-decisions-complex.md#adr-cx-062)):
  every rule that takes a `NAME` as its subject — `typeClaim`, `quadrantGiven`, `argumentRelation`,
  `argumentInequality`, `conjugatesClaim`, `solutionSelection`, `argumentQuery` — goes through it before
  it does anything with that name, and it declines the line unless every captured name clears the
  `isDeclarableName` floor `declaration` applies, widened by the declared families. The test is POSITIVE
  for a reason: `isRealLetter` is two negatives, so a word that is not a name («foo»), a glued pair
  («AB») and the reserved constants (`i`, `o`) failed both halves and fell through into the figure as
  free points. Length is never the question; the floor is, and asking it once is what keeps the
  one-letter and multi-letter forms from drifting apart.
  **There is one shape phrase, `shapePhrase()`**: the noun, and after «מצולע» the polygon-name slot
  (`POLYGON_NAME_KW`), recognised so a name is never a vertex and left unclaimed (`shapeClaims`) until
  G5-1 reads it.
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
  the one predicate `knowledgeOf`. Exactly two values print both (ADR-CX-066); more that differ inside one
  drawing are the set's own spread and read `multi-solution`, naming the first member.
- **A line is read as a QUESTION by ONE reader** ([ADR-CX-055](06d-decisions-complex.md#adr-cx-055) A1).
  `parseAsk` in `app/deriveLines.ts` is called by `readAsk`, the lane lowering and the panel row model;
  it removes the question frame (`questionBody`, `parser/normalize.ts`) once, before any ask rule runs,
  and keeps the stripped reading only when it is a pure question. The frame is not an orthography
  transform, because a transform reaches statements too.
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
incompleteness. The 3-D builder refuses a claim its givens do not determine
([02b FR-CL-1](02b-requirements-3d.md), [ADR-3D-260](06b-decisions-3d.md#adr-3d-260)); the operator deferred
a three-valued verdict for 3-D ([#909](https://github.com/dcodish/geo_builder/issues/909)).

## The question export ([ADR-CX-067](06d-decisions-complex.md#adr-cx-067), #1872)

`app/questionLines.ts` is the «נתון:» list «הורידו שאלה» hands the shared composer (`shell/export/questionDoc`): the
active lines as typed, minus a line whose `parseLineV2` reading states a claim and no given. The channels of
`ParsedLine` are classified in one exhaustive `Record<keyof ParsedLine, 'given' | 'claim' | 'meta'>`, so a new channel
cannot reach the export unclassified. The App computes it once (`questionGivens`) for the button's gate and the
document alike.

## Boundaries

**A claim to prove** (#1870, [ADR-CX-083](06d-decisions-complex.md#adr-cx-083)) is refused FIRST in `submitLine` and
in `editLine` (a muted row too), before the ask routing and before the grammar, by the shared rule `findProofTarget`
(`shell/proofTarget.ts`, [ADR-W-107](06w-decisions-workspace.md#adr-w-107)) — the error `proof-target`, worded by
`errProofTarget` in 2-D's sentence, quoting the proof sentence. Nothing of the line is recorded, the mixed line
«נתון … . הוכיחו כי …» included. The load path replays through `submitLine`, so a saved proof line lands in the
load audit. A bare statement has no proof verb and reaches the claim pipeline unchanged.

**The submit decision is pure** (#2241, [ADR-W-150](06w-decisions-workspace.md#adr-w-150)): `decideSubmitCx({ lines,
disabled, seed }, raw)` in `app/submit.ts` returns `record` / `ask` / `known` / `refuse`, and `submitLine` only
dispatches on it into the store (the analytic shape of #1102). The proof-target, unread-script, ask-lane and parse
refusals below all live in it. `/log-triage` replays a production session through the same function
(`app/triageReplayCx.ts`), so it mirrors nothing; the App logs the list actions that replay follows (`App.tsx`,
beside `submitCounted`; an undo/redo carries `app/stateFingerprint.ts`'s fingerprint of the state it landed on).

**A letter this tool cannot read** (#1919, [ADR-626](06-decisions.md#adr-626)) is refused in `submitLine`,
before the ask routing and before the grammar, by the shared rule `unreadScript` (`shell/inputScript.ts`) —
with the same two sentences the other builders use (`errUnreadName`, `errUnreadWord`), quoting the letters as
typed, where the generic `not-handled` sentence used to answer. This tree still calls NO glyph fold (a
superscript digit is an exponent here, #1912) and does not need to: the rule folds the look-alike LETTERS
itself and never judges a modifier letter, so «zⁿ» and «Xₖ» reach the grammar untouched.

`src-complex/` never imports `src/` or `src3d/`; the engine layer is **copied-never-shared, always**. It
consumes the shared chrome in [`shell/`](04w-design-shell.md)
([ADR-W-016](06w-decisions-workspace.md#adr-w-016)).

The standing sibling guarantee ([ADR-W-017](06w-decisions-workspace.md#adr-w-017)) is checked, not
promised: `npm run check:siblings` refuses any change to `src/` or `src3d/` and builds both regardless of
the diff, because a shared-surface edit can break them without touching one of their files. It does
**not** replace `npm run test:full` — the builds prove the siblings compile, only the suite proves they
behave.

## Known gap

- **`/complex-builder/api/*` is reverse-proxied in production** by the directives in
  `deploy/apache-complex-builder.conf`; the gap [#903](https://github.com/dcodish/geo_builder/issues/903)
  recorded is closed.
