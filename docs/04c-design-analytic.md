# 04c — Design: the analytic Builder (`src-analytic/`)

_How the analytic product is built. Registered in [`DOCS.json`](../DOCS.json) as the `analytic` product's
design doc ([ADR-W-041](06w-decisions-workspace.md#adr-w-041))._

**What it must promise** is [02c](02c-requirements-analytic.md) — the V1 pedagogy and requirements
captured live from the operator. Decisions are [06c](06c-decisions-analytic.md); the plan of record is
[docs/19](19-analytic-geometry-tool.md).

> **Status: DEPLOYED since `prod/2026-09-16`** at `/analytic-builder/` (`products.json` `enabled: true`; the
> [ADR-AG-007](06c-decisions-analytic.md) hold was lifted by the operator — [DEPLOY-LOG](DEPLOY-LOG.md)
> 2026-09-16). Requirements 02c are still marked IN PROGRESS; that is a doc status, not a deploy status.

## What is different about this product

The siblings **reproduce** a printed figure. This one **produces the figure the exam withheld** — 17 of
20 sampled שאלון 572 Q1s print no drawing, and two instruct the student to draw one
([docs/19 §2](19-analytic-geometry-tool.md)). Every design choice below follows from that asymmetry, and
from the ruling that **text is the only source of givens**: where an exam leans on its picture to carry a
given, that is a defect in the exam, not a gap the tool should paper over
([02c](02c-requirements-analytic.md) P2/P3).

## Shape — the smallest of the four trees

| Layer | Size | What it is |
|---|---|---|
| `engine/` | ~1,200 lines | `expr` (the numeric expression layer), `conic`, `curves`, `apply`, `carriers` (the DOF contract), `evaluate`, `derive`, `types` |
| `parser/` | ~400 | `parseAnalytic.ts` + `catalogAnalytic.ts` |
| `render/` | ~215 | `scene.ts` (pure) + `Figure.tsx` |
| `store/` | ~120 | Zustand, the ordered fact list as source of truth |

Roughly 2,350 source lines against `src/`'s 42,000 — this is a V0, not a peer.

## The image carries no chrome ([ADR-AG-151](06c-decisions-analytic.md#adr-ag-151))

`render/Figure.tsx` paints three things that exist only to be clicked: the crossing and centre OFFERS (one
list, #1025/#1109), the transparent hit layer over curves and segments (#1048/#1139), and each point's hit
ring. All three sit inside `data-noexport`, the shared strip's contract (FR-EX-3), so «הורידו תמונה» exports
the figure and nothing else. `render/__tests__/clean-export.test.tsx` switches every affordance on and
asserts the stripped ink is the chrome-free render. A new affordance joins that lock with its prop ON.

## The panel's knowledge has one home ([ADR-AG-152](06c-decisions-analytic.md#adr-ag-152))

`panelKnowledge(d)` (`app/panelRows.ts`) decides, once, which parameters, coordinates and listed equations
the data panel prints as KNOWN. `App.tsx` renders those rows from it, and the corpus invariant
"`reportedDof > 0` ⇒ something is unknown" asks the same function over every figure the analytic suite
builds. A new panel row that prints a value belongs in that function, or the invariant cannot see it.

## A line's angle has one decision ([ADR-AG-154](06c-decisions-analytic.md#adr-ag-154))

`app/lineAngle.ts` answers "what angle does this direction make with the positive x-axis, and is it known?"
for every surface: the «שיפועים» panel row reads a segment's direction, the ask lane a named line's, and both
call `lineAngleOf` (fold to [0°, 180°), vertical = 90°, gated by `isKnowledge`, printed by `angleText`).
Both ENDS of the fold are the scale-free predicates of `engine/lines.ts` — `isVertical` → 90°, `isHorizontal` → 0°, one
tolerance (`VERTICAL_TOL`, relative to the direction's length) — never an absolute epsilon in degrees: a solved
horizontal side carries the solver's residual and must never print «180°» ([ADR-AG-202](06c-decisions-analytic.md#adr-ag-202), #1648).

## The model — objects, and the register that makes them free

The primitive is the **geometric object** ([ADR-AG-009](06c-decisions-analytic.md#adr-ag-009),
ratifying [02c](02c-requirements-analytic.md) R1): a `Construction` is `{ params, objects }`, and
`GeoObject` is a discriminated union — `point` and `curve` are the two *stated* members V0 built, and
the shape nouns and derived points of [02c §5](02c-requirements-analytic.md) join them as further
members rather than as a parallel model. An equation, a shape noun and a coordinate pair are three
ways to *state* an object; the exact conic fit is how an equation identifies **which** object it names.

The object kinds are `point` and `curve` (stated), `derived` (a midpoint, a centroid, an incentre —
a pure function of parents already stated), and `segment` / `polygon` (drawn from their endpoints).

**The register is also the solve's.** Since [ADR-AG-144](06c-decisions-analytic.md#adr-ag-144) every symbol of
`paramRegister` is an entry of the solve vector (after the free vertices), so a given that determines a
parameter pins it and the freedom cue is rank over vertices and parameters together — see [the solve
vector](#the-solve-vector-holds-every-unknown-adr-ag-144). A `line-at` with a FREE direction («דרך N עובר
ישר») contributes its angle to the register the same way, through `symbolDeps`.

`engine/carriers.ts` holds the **degree-of-freedom contract**, and two things live there:

- **The register of free parameters is derived from the objects' own expressions**, never from the F11
  declarations. A declaration *narrows* a symbol's domain; it does not bring the symbol into
  existence. Reading declarations alone is what made `y²=2ax` — an entry on the tool's own reference
  card — evaluate to `NaN` and reach the honest "not at this parameter value" path by accident,
  drawing nothing and saying nothing (#1014).
- **`carrierOf` / `symbolDeps` / `objectDeps` are exhaustive switches** over `GeoObject`, so a new
  object kind is a compile error until it declares its freedom, its symbols and its dependencies. The
  2-D tree learned this the expensive way — the same kind-sets hand-listed across ~7 sites, where a
  forgotten one was a silent dropped DOF rather than a type error (ADR-043). The pattern is **copied,
  never imported**, before the vocabulary grew.

**There is deliberately no topological sort, and since #1028 that is a finding rather than a
deferral.** Derived points made the object→object relation non-empty — and a sort is still the wrong
shape, because `apply` refuses a statement naming an object that does not exist yet. A parent is
therefore always already in the list when its dependent is appended: declaration order is provably a
valid evaluation order and a cycle is unreachable. The invariant is asserted by
`depsPrecedeDependents` rather than re-established by a sort that could never find anything out of
place. A kind that can forward-reference is what would earn one.

## The solve vector holds every unknown ([ADR-AG-144](06c-decisions-analytic.md#adr-ag-144))

`carrierSystem(c, env, { params })` builds the vector the solve moves: the free vertices first (two entries
each, `ids`), then **every parameter of the register** (`syms`, one entry each). `envAt(x)` writes the
vector's parameter entries over the sampled environment, and every residual — the solve's, the rank
count's, the thin-ring re-solve's — is evaluated at `envAt(x)`. Before this the vector was the vertices
alone and a parameter was a constant the seed had drawn, so a given that determined one («N על הישר l3»
on `(k+1)x+2y−12+5k=0`) was `unsatisfiable` at every seed: the solve had never been given the unknown.

**Two stages, and the order is the design.** A parameter in the vector is a knob, and a least-squares
descent reaches for every knob it has — measured, a one-stage joint solve of «A(0,0)» · «B(8a,0)» ·
«נקודה M» · «MA = MB» drove `a` to 0 (B onto A, where the given holds for every M) and drew the collapse.
So:

| stage | vector | when | what it preserves |
| --- | --- | --- | --- |
| one | vertices only, parameters at their sample | always, when there are free vertices | the solve as it always was; an unpinned parameter stays the seed's and still moves on «הציגו תצורה אחרת» |
| two | vertices AND parameters | only when stage one does not converge | the case the old solve could never reach — a given that determines a parameter. Walked IN THE STUDENT'S ORDER from stage one's effort, one constraint at a time, each solve warm-started from the last, then polished against the whole system; repeated from the parameters re-sampled at other seeds (a sign folded into each, a wrong-sign root re-seeded inside its half); the joint multi-start is the fallback |

Stage two's starts are stage one's plus the parameters re-sampled at other seeds (so a root the first sample
cannot reach is still reachable — a two-root pin is walked by the seed, ADR-AG-047's rule), and it takes an
`accept` predicate: a converged solve that drove a parameter outside its declared domain is a start that did
not converge (D7 kind 1 — the domain filters the roots silently). **The freedom cue is rank over the joint
vector** (`figureDofOf`): a pinned parameter is subtracted exactly as a coordinate is, and `reportedDof` no
longer adds the register's length. **The locus tracer asks for `params: 'fixed'`** — a locus is a named
point's freedom at one configuration of the parameters; a locus that sweeps its parameter is #1186.

**Three things the solve depends on that are not the solve.** The curve membership residual (`curves.ts`) is SIGNED — an absolute value differentiates to zero within a Jacobian step of the curve and starved the descent of every incidence row near the answer. `solveLM` exits after eight steps that each improve the cost by less than a millionth: a stall, not convergence. `evaluate` is memoised per (construction, seed), so the drawable walk and the knowledge gates evaluate a seed once, and a determined figure that is whole but narrow walks 8 seeds for a prettier root rather than 24. `figureSignature` signs the parameters the figure USES beside its points and curves (#1343) — `usedSymbols` is objects ∪ constraints, walked structurally — so a value that lives only in the environment is a configuration too, and a symbol nothing reads is never asked of the gate.

**What rides on the vector.** A FREE DIRECTION (`Direction.free`, «דרך N עובר ישר») is a `line-at` whose
angle is a symbol in the register — `symbolDeps` reports it, so it is sampled like any unstated magnitude
and solved like any parameter; the emitted line is normalised (θ and θ + π are one line). A DERIVATION
RESTATED about an existing point («M אמצע AB» when M is a crossing) is a `derived-at` constraint whose
residual is the rule's own closed form, for every `DerivedRule` at once. A SIGN («שיפוע הישר l5 שלילי») is a
selector inside validity, and a sign about a free direction also SEEDS the angle into the half it names — the
#818 lesson, that a filter which only rejects can be left with nothing but configurations contradicting the
given. `curveByName` (types.ts) is the one by-name lookup, and `curveAtOf` resolves a `line-at` too, so a
constructed line can be crossed and measured against like a stated one.

## The three cores

- **`expr.ts` — the numeric expression layer.** Its docblock states the design intent exactly: *"the
  smallest thing that lets a coefficient carry a PARAMETER."* Analytic geometry's questions are full of
  half-specified equations (`y = mx + 8`, a circle with unknown radius), so a coefficient must be able to
  be an unknown without dragging in a symbolic algebra system. The scoping — *smallest thing* — is the
  design decision.
- **`conic.ts` — equation → curve, plus the canonicity gate.** An exact conic fit, with a gate deciding
  whether the result is in canonical form. The gate matters because a student's equation and the
  canonical one must be recognised as the same object.
- **`curves.ts` — curve geometry.** Resolution to numbers, membership residuals, and the polylines the
  renderer draws. **Pure**, so the renderer stays a consumer rather than a second geometry implementation
  — the same split every sibling uses.

## The configuration search: validity, then preference ([ADR-AG-128](06c-decisions-analytic.md#adr-ag-128))

`drawableAt` is the one place that chooses which configuration the tool shows, so canvas, data panel,
«הציגו תצורה אחרת» and the honesty gates are all corrected there rather than per consumer. Its sweep
has four tiers, strongest first:

| tier | predicate | added by |
| --- | --- | --- |
| preferred | whole **and** every declared ring at least `SPREAD_MIN_DEG` open **and** no two named points at one place (`separated` = `stackedPairs(f)` empty: closer than `VISIBLE_FRACTION` (1/100) of the unpadded `viewBox` — the SEEING ruler, not `crossings.apart()`'s identity tolerance, ADR-AG-181) | #1174, #1273, #1526 |
| whole, separated | whole and separated but narrow — remembered above a stacked whole one (the ADR-486 ranking, ported) | #1273 |
| whole | selectors hold · nothing vacant · no ring contradicts its noun · **every given holds** (an unsatisfied constraint is a validity failure, not a preference — a point the solve parked on neither of its curves is not a configuration) · **and no declared ring holds only by the tolerance's slack**: a thin ring (`thinRingsOf`, min |sin θ| < `THIN_SIN_TOL`) is re-solved under `withToleranceFactor(TIGHT_TOLERANCE_FACTOR)` from the converged point, and a ring that collapses there is reported as unsatisfied on the last given touching it ([ADR-AG-143](06c-decisions-analytic.md#adr-ag-143), the ADR-537 port) | #1083, #1158/#1166, #1287 |
| second best | the selectors hold, something named is missing | #1083 |
| fallback | the raw figure at this seed | — |

**The top tier is opt-in and defaults to OFF.** Spread is a display preference; `isKnowledge`,
`knownOptions` and the locus determinacy gate ask what holds across the configurations the tool would
ADMIT, and narrowing that pool to the pretty ones would let the tool claim knowledge it does not have.
Defaulting to off means a caller added later inherits the honest behaviour and must ask for the other;
only `derive` asks. The drawable cache is keyed by mode as well as by seed, because the two modes
answer differently for the same seed and one shared cache would let whichever caller ran first decide
what the other sees.

**Validity and preference are separate predicates on purpose.** `ringViolation` rejects a ring that
contradicts its noun and its tolerance sits two orders of magnitude under the ugly band, because a
3° triangle is ugly but true. `minInteriorAngleOf` measures how open the rings are and decides
nothing. Folding them into one number would turn a preference into a refusal and assert a given the
student never gave.

**The best effort stays inside the declared domains ([ADR-AG-162](06c-decisions-analytic.md#adr-ag-162), #1493).** When stage two accepts nothing, the figure is its best EFFORT — chosen among ADMISSIBLE results only (the domains and sign selectors, `admissible`), with the attempt's own in-domain start as the baseline. An out-of-domain effort is never drawn: outside a domain a contradiction can hide (a negative radius makes the circle vacant and its incidences judge nothing; `a > 0` silently becomes −3). Inside the domains the check measures the givens and names the ones that fail.

**The solve prefers what the selectors accept, one level below the sweep ([ADR-AG-159](06c-decisions-analytic.md#adr-ag-159), #1463).**
Inside one seed, `evaluate`'s multi-start (`solvePreferring`) keeps a converged solution the selectors
reject as a *fallback* and goes on: first from `separationMoves` — the free member of each collapsed
`distinct` / `crossing-distinct` pair restarted at its position mirrored through the centroid of the rest
of the figure, the other root of a pair that shares its incidences — then from the remaining starts. The
first solution the selectors accept wins; with none, the fallback is exactly what the old first-converged
multi-start returned, so the preference can change WHICH valid configuration a seed draws and can never
turn a drawn figure into a refused one. Stage two (the parameter walk) takes the same preference with one
extra solve, never another walk, so its cost on a figure whose selectors cannot hold is unchanged. This is
2-D's `solutionAccepted`-inside-`multiStartSolve` shape; without it the sweep above was the only repair,
and a figure whose raw solve mostly collapsed reached ONE configuration in the whole window.
## Where a fault is raised, and why ORDER matters there ([ADR-AG-129](06c-decisions-analytic.md#adr-ag-129))

`derive` raises its faults in a fixed order, and the order is load-bearing rather than incidental: a
line that already carries a message does not get a second one, so an arm that must defer to a truer
message has to run BELOW it.

The ring-fault arm (#1170) is the case that made this explicit. «P מפגש האנכים האמצעיים במשולש ABC»
on three collinear points declares the triangle and asks for its circumcentre, so one line carries both
a ring fault and ADR-AG-008’s `does-not-exist`. The latter names what the student actually asked for
and is the better answer, so the ring arm sits after the vacancy loop — the only position from which it
can see what has already been said — and skips any line already in `faults`.

**A fault is also the refusal.** `decideSubmit` dry-runs the whole list with the new line appended and
refuses when a fault lands on that line, so raising a fault in `derive` is what makes a line not be
recorded. There is no second refusal mechanism to keep in step, which is why an operator ruling of
“refuse the line” lands as one arm here rather than as a change in the app layer.
## The crossing module’s tolerances ([ADR-AG-130](06c-decisions-analytic.md#adr-ag-130))

Three named constants, each answering one question, each relative to the figure’s own scale
(ADR-AG-021 — *never an absolute magnitude*). They are registry-shaped in the docs/17 §3b sense:
changing one changes what the tool offers, so each carries its measurement in its own docblock.

| constant | the question | measured against |
| --- | --- | --- |
| `apart(figure)` = span · 1e-6 | is there already a point there? | the solve leaves ~2e-10 relative on a satisfied incidence, so this has 3–4 orders of margin |
| `CROSS_MIN_SINE` = 1e-6 | are these two straights the same line? | two representations of one line measured 6.65e-8 apart by this reading |

`occupied()` and `angleSine()` are the predicates; both loops call the first and `meet()` calls the
second. The point of naming them is that there is **one** answer per question: the two loops used to
ask the occupancy question differently — one relative, one with a hard-coded `1e-6` — and the same
figure came out two ways.

**`CROSS_MIN_SINE` is not an extent test.** Two genuinely different lines meeting at a shallow angle
cross far outside the drawing; that is `within`’s question. Widening the angular bar to cover it would
start calling distinct lines identical, which is the defect it was introduced to remove.

**The extent is ONE ruler ([ADR-AG-135](06c-decisions-analytic.md#adr-ag-135), #1286).** `extent.ts` owns `segmentParam` / `withinSegment` (the ring filter's tolerance) and `drawnPieceOver`, and three readers share it so they cannot disagree: the click-path rings (`within`), the solver's bounded-crossing residual (two rows — the distance beyond each end — that make an out-of-piece root UNSATISFIED and therefore, by ADR-AG-134's validity term, not a configuration), and the figure-is-the-authority promotion in `evaluate` (a crossing's incidence on a pair the figure draws as a segment or a polygon side is `bounded` whatever noun the sentence used). The extent binds **crossings only** (`crossing` on the incidence, set by `parseIntersection`): a cevian's foot (#1232) and a point «על הישר» (#1069) keep the infinite-line reading their own rulings gave them.

**A pair's crossings have ONE order ([ADR-AG-157](06c-decisions-analytic.md#adr-ag-157), #1268).** `crossing-order.ts` owns it and three readers share it: the rings' `nth` (`crossingsOf`), the `crossing-nth` selector that judges a configuration, and the seeding that starts a named crossing on its root. A straight is a `Walk` — a point and a direction: `walkThrough(from, to)` for a straight named by two points (the letters' order), `walkOfCoefficients` for one given by coefficients (left to right, bottom to top when vertical). `conicMeet` substitutes the walk into the canonical conic and returns EVERY root, `t` ascending, plus whether it is a touch. The order is taken before the extent: `crossingsOf` numbers the unfiltered roots and only then applies `within` and the occupancy test, so a side's single ring carries its line's number and a taken ring never renumbers its sibling. An ordinal sentence lowers to `crossing-nth {id, nth, pair}` (its own two incidences, carried, because the point may gain others); a sentence without one keeps `crossing-distinct`. Validity is where the choice is enforced, so «הציגו תצורה אחרת» — which walks valid configurations — cannot reach the other root.

**Both crossings in one sentence are the two ordinal sentences ([ADR-AG-185](06c-decisions-analytic.md#adr-ag-185), #1512).** `bothCrossings` (`parseAnalytic.ts`, inside `intersectionSpellings`) reads «X חותך את Y בנקודות A ו-B», «X ו-Y נחתכים בנקודות A ו-B», «A ו-B נקודות החיתוך של X עם Y» and their English forms, and lowers each to «A נקודת החיתוך הראשונה של X עם Y» + «B נקודת החיתוך השנייה של X עם Y», re-parsed by the one crossing rule — so it cannot drift from the form it abbreviates. The only thing it adds is `both: true` on the two `crossing-nth` selectors: the sentence states that the pair HAS two crossings, which `meetsTwice` (`crossing-order.ts`) judges — a straight and a conic, not touching, roots apart by more than `SOLVE_RESOLUTION` × the conic's size (the `openBoundFloor` rule; an exact test lets a solve that drifted near a double root through). A seed that fails it is not a configuration; a figure with no freedom left gets `unsatisfiable` on the sentence. A single ordinal carries no `both` and keeps ADR-AG-157's reading. A sub-sentence's owned refusal (`bad-operand` for the contextual «המעגל», whose ordinal ADR-AG-157 already refuses) is returned with the whole sentence as its detail.


## The parser's rule contract ([ADR-AG-017](06c-decisions-analytic.md#adr-ag-017))

A rule in `parseAnalytic.ts` answers one of **three** ways, and the third is the one round #1056 added:

| answer | meaning | who gets the last word |
| --- | --- | --- |
| `made(facts)` | the sentence lowered | this rule |
| `refuse(code, line)` | the sentence was RECOGNISED and is wrong | this rule |
| `null` | not my sentence | the next rule in the chain |

Before this, a rule had only the first and the third, so every "recognised and wrong" case had to be
spelled `null` — which means `not-handled`, which means *"I did not understand you"*. That is a false
statement about a sentence the rule matched, and `not-handled` is also the **LLM escalation seam**, so
well-formed givens were being routed to the model instead of answered. Two of the three defects behind
this contract were worse than a mis-worded refusal: the rule did not refuse at all and built a figure
contradicting the student's own words.

The chain in `parseLine` therefore reads `parseConstraint(line) ?? parseDerived(line) ?? parseShape(line)
?? parsePoints(line)` and returns whatever it gets — `??` falls through on `null` only, which is exactly
the semantics the three-way answer needs, with no extra plumbing.

**A noun is spelled ONCE per language, glyphs included** ([ADR-AG-142](06c-decisions-analytic.md#adr-ag-142)).
`ANGLE_NOUN_HE` / `ANGLE_NOUN_EN` carry «זווית» / «angle» and both angle glyphs (`∠`, `∡`), so every
angle rule that reads the noun reads every spelling of it — the 2-D lexicon's `ANGLE_WORD` shape. A
glyph-only sibling pattern is how one spelling drifts from the others in silence (`∡` parsed while `∠`,
the glyph the 2-D palette teaches, did not); the catalog lists the glyph row beside the word row so the
coverage map and the guide teach it.

**The word itself has two spellings, and one stem carries both** ([ADR-AG-155](06c-decisions-analytic.md#adr-ag-155)).
`ANGLE_STEM_HE` (`זו?וי`, in `engine/shapes.ts`, the 2-D lexicon's vav class) is what every Hebrew angle
pattern composes: the noun atom above, the incentre role «חוצי הזוויות», the question «הזווית בין … לציר
ה-x», and the shape-noun key. A pattern that re-spells the word as a literal is how the defective «זוית»
fell out of every rule at once. The shape table is keyed by string, so its one normaliser,
`normalizeShapeNoun`, folds the variants onto the key: «זוית» → «זווית», and the 2-D ADR-405 plene
folds «מעויין» → «מעוין» and «שוה» → «שווה», word-bounded.

**The refusal codes are OWNED, one per class**, each rendered by a locale string that names the
student's own statement: `reserved-coordinate`, `bad-arity`, `repeated-vertex` alongside the existing
`bad-equation` and `out-of-scope`. A code per class rather than a message per site is what keeps the
same wrong input answered the same way whichever rule caught it.

**A clash carries its collision.** `ApplyError.existing` is a stable TOKEN (`derived:centroid`,
`curve:ellipse`) minted by `existingKindOf` in the engine and rendered into the student's language in
`App.tsx`. The engine stays language-free and the message can still say *what* the name already holds
— the split that lets a refusal name a construct without the engine knowing any Hebrew.

**A rule owns only what it parsed** ([ADR-AG-139](06c-decisions-analytic.md#adr-ag-139), R104). `refuse`
is honest only about a tail the rule READ, and a rule that matched its noun and then refused the
remainder unread produced owned codes about fragments the student never wrote — terminal at the LLM seam.
`claimable(tail)` in `parseAnalytic.ts` is the one discriminator, asked at every claiming site (the
diagonal, slope, area and component values, and `matchCurve`'s single exit, where it absorbs
ADR-AG-114's Hebrew test): a tail with Hebrew letters, one opening with a connective dash (a spaced
hyphen or any en/em dash), or one opening with an unread name followed by a connective («I:», «AB -»)
is not the rule's — it answers `null`, the chain moves on, and the sentence ends at `not-handled`.
The plane's own variables are excepted so «y - 2x = 0» stays an equation, and a hyphen glued to its
term is a sign. The seam itself keys on `reachesFallback(verdict)` in `app/submit.ts` — refused ∧
`not-handled` — the one predicate `App.tsx` and the locks share; its width never changed.

**A value never mentions the plane ([ADR-AG-163](06c-decisions-analytic.md#adr-ag-163), #1496).** Every slot that reads a student's VALUE — a length (`parseLengthExpr`, `constantLengthExpr`), a slope, an area, an angle and its ratio, a coordinate and a comparison — reads it through one check, `mentionsPlane` (`carriers.ts`): `x` and `y` are the plane's variables, so a value that uses one is an equation and the slot declines (lengths) or refuses (`valueExpr`, `bad-equation`). And `equationExpr` refuses a capital as a symbol: a capital is a point's name, never a parameter. Together they close what the ≥3-letter word test (#1068, #1321) cannot see — «side AB is y=x-4» after the noun is stripped leaves the two-letter «is».

## A given’s connective, and who gets the sentence ([ADR-AG-127](06c-decisions-analytic.md#adr-ag-127))

**One vocabulary for "is".** `COPULA_WORDS` — «הוא/היא/הם/הן/שווה [ל-]» — is the single source in
`parseAnalytic.ts`, and `HE_IS` is derived from it. Every rule that admits a Hebrew copula reads it from
there. The set was previously spelled inline per rule, and the drift that invites is not hypothetical:
`LENGTH_EQ` admitted a literal `=` and no words, while `AREA_HE` immediately beside it admitted the words
and no `=`. One sentence shape, two answers, decided by which rule happened to spell what.

**The connective is an ALLOWLIST, so it fails closed.** Whether a sentence is an equality is decided by
recognising a copula, never by failing to recognise a relation. The ways to say "is" are a closed set; the
ways to relate two things are not. 2-D learned this as a P1 ([ADR-524 Am. 1](06-decisions.md#adr-524)) and
the discipline is ported rather than re-derived. The two trees keep their own copy — the `lexicon` layer’s
cross-product sharing is UNDECIDED in `BOUNDARIES.json` (ADR-W-003) and `shell/` may not import a product
tree — so `shell/__tests__/length-copula-parity.test.ts` reads both real patterns out of source and runs
them, and a tree that changes its mind about what "is" means fails there.

**When two rules can both read a sentence, the one that records MORE wins.** «שטח המשולש ABC הוא 24»
is readable by the length rule (`parseLengthExpr` carries an `area` term, giving a correct area
constraint) and by the area rule — but only the area rule also DECLARES the triangle the student named.
The length rule therefore yields when the area rule will really claim the line, calling `AREA_HE`/`AREA_EN`
rather than restating them. Dropping a stated object because another rule got to the sentence first is an
honesty failure, not a parsing preference.

**Why precedence is a guard and not a reordering.** The table above says `null` means *"not my sentence,
try the next rule"* — and that is true of the four top-level rules `parseLine` chains with `??`. It is NOT
true of the rule blocks INSIDE `parseConstraint`: there, `return null` returns from the whole function, so
a block cannot decline in favour of the block below it. Hoisting the area rule above the length rule — the
shape the relation and slope rules use — therefore took #1075’s area-as-a-term («שטח ABC = שטח CEF + 4»)
away, measured as seven failing locks. Giving the blocks a real fall-through means reworking the decline
contract for every rule in the function; until that is worth doing, precedence inside `parseConstraint` is
expressed as an explicit guard at the rule that must yield.
## A display name in an LTR row ([ADR-AG-149](06c-decisions-analytic.md#adr-ag-149))

The equations section is laid out `ltr` because an equation is a left-to-right object. A display NAME
in it may not be: «ישר 3» and «מעגל 1» mix a Hebrew noun with a digit, and a European number adjacent
to a right-to-left run joins it, so the name, the colon and the equation's leading digit render as one
reversed run.

| helper | protects | emits | direction |
| --- | --- | --- | --- |
| `isolateLtrRuns` | a technical run inside an RTL paragraph | LRI … PDI | the fact list, the input preview |
| `isolateRtlName` | a display NAME inside an LTR row | FSI … PDI | the panel's equations row, the ask lane |

FSI rather than RLI: first-strong reads the direction off the name's own first letter, so one call is
correct for a Hebrew name and harmless for any other, and no caller has to classify a name's script.

**One composer.** `namedRow(name, body)` in `curveText.ts` is the only place `name: equation` is built.
The panel row and `describeCurve` both call it, so a surface added later inherits the isolate. That is
the half that makes the fix hold — the isolate itself is two characters.

**It is DISPLAY only.** `stripFormatControls` covers U+2066–2069 at the parser and the store
boundaries, so an isolate can never reach the grammar, the saved fact list, the logs or the .docx
export, whose run renderer draws these code points as missing-glyph boxes (ADR-431 Am. 1).

## Notation has one owner ([ADR-AG-148](06c-decisions-analytic.md#adr-ag-148))

`app/curveText.ts` is this tree's equation-NOTATION module, the way `format.ts` is its number module.
`engine/expr.ts`'s `exprText` is the ALGEBRAIC printer: precedence and minimal parenthesisation, and
nothing about how a student reads an equation. The two are not interchangeable, and the panel calling
the algebraic one is how a line printed a `- 0` the student never wrote.

| the equation | printed by | why |
| --- | --- | --- |
| all coefficients numeric | `lineText`, **via** `curveEquationText` | one owner; #1180's fraction clearing lives there |
| a coefficient carries a parameter | `curveEquationText` | the same three rules, applied where the expression lets them be |
| a coefficient BODY | `exprText` | algebra inside a coefficient is algebra |
| not linear in x and y | `exprText`, as a fallback | there is no notation decision to make |

**The three rules**, stated once in `lineText`'s docblock and applied by both paths: a term that reads
as zero is not printed · a unit coefficient is suppressed · the sign is folded into the connective
(never `+ -3`). Terms are carried as a LIST with their signs rather than summed, because the sign
belongs to the term — summing them printed `+ -12 + 5·k`.

**A stated `LHS = RHS` is held as `LHS - RHS`.** When `RHS` is zero the subtraction is not BUILT into
the printed form. Doing it structurally rather than by stripping `- 0` from a string is what makes it
hold for the conic fallback too.

**The delegation is the lock.** Because the numeric case calls `lineText` rather than re-deciding, a
determined line's row and a parametric line's row cannot drift apart — the test asserts equality of the
two paths, which would be a re-implementation if they were two independent printers
([ADR-W-053](06w-decisions-workspace.md)).

## Curve identity at the M1 boundary ([ADR-AG-147](06c-decisions-analytic.md#adr-ag-147))

Two predicates answer two different questions about two curves, and they are deliberately not the same
function:

| predicate | question | test | asked of |
| --- | --- | --- | --- |
| `sameCurve` | *does this restatement CONTRADICT what this id holds?* | `\|cos\|` between coefficient vectors, 1e-9 | a curve whose **id already matched** |
| `identicalCurve` | *is this the SAME OBJECT as that one?* | normalized coefficients component-wise, sign resolved, 1e-12 | **every** curve in the figure |

The second is the stronger question and needs the stronger instrument. `|cos|` is quadratic near 1, so it
squashes a real 1e-6 difference in slope down to 1e-13 — inside the noise band — and
[#1235](https://github.com/dcodish/geo_builder/issues/1235) has already ruled that lines that close are
DISTINCT and must offer a crossing ring. A component-wise comparison is linear in the difference and
separates the two cases by nine orders of magnitude instead of three.

**The scan is over STATED declarations only.** A carrier — the curve a membership sentence mints so it has
something to hold — is invisible (not drawn, no panel row, no ring), and **the next fact of its own line
references it by id**, so absorbing one deletes the id that membership is about. The incoming side is what
is tested; a stated line absorbed into a carrier is [#1076](https://github.com/dcodish/geo_builder/issues/1076)'s
promotion, and references to a stated line go by name.

**An absorbed statement's id is never rewritten.** The surviving object keeps the id its constraints
already hold and gains the incoming `label.name`; `curveByName` matches a curve by `label.name` as well
as by id, so every by-name reference resolves either way.

**Identity by READING — the name axis** ([ADR-AG-183](06c-decisions-analytic.md#adr-ag-183), #1350). The two
predicates above compare EQUATIONS; names are compared by what a student reads. `nameReading` (`names.ts`)
maps a line name to its notation-free numeral («l3», «ℓ3», «ישר 3», «III» → `III`; «AB», «m3» → null), and
`readingTwin` (`apply.ts`) asks, for a fact naming a line with a name NEW to the figure, whether another
line's name reads the same. It runs in `applyFact` around `applyStatement` (so every arm that mints a named
line — a stated equation, a line through a point — is covered once) and only on a statement that landed
(`created`/`narrowed`). Its answer is an `ApplyNotice`, not an error: `fold` carries it per fact, `derive`
per line (`Derivation.notices`), `decideSubmit`'s `record` verdict per new line, and the store's
`recordLine(line, notice)` / `recordLlmLines(…, notice)` set it **in the same commit** — the record clears
transient surfaces, so a notice set before it would be erased by the line that earned it. `commitRecord` /
`noticeText` (`app/submit.ts`) are the one wording, called by `App.tsx` and by the lock.

## A letter run is not automatically a product ([ADR-AG-145](06c-decisions-analytic.md#adr-ag-145))

`expr.ts` multiplies by JUXTAPOSITION — that is the whole reason it is hand-written rather than a one-line
eval, because `2a`, `4√5`, `25k²` and `2ax` are all products in the notation the exam prints. Its atom
grammar has exactly one function, `√`, and `normalizeMath` maps `sqrt` onto it before the tokenizer runs.
Everything else that looks like a function is a run of letters — so `tan(30)` was `t·a·n·30`, and because
the parameter register is built from the symbols expressions USE, those three letters became free DOF that
could satisfy any residual.

**Where the decision lives.** *Which letter runs are symbols* is answered in `tokenize`, and nowhere else.
Every value slot in the grammar reaches a number through `parseExpr`, so the tokenizer is the chokepoint;
putting the test in a calling rule would fix one sentence and leave the class alive in every other slot,
which is what happened when [ADR-AG-144](06c-decisions-analytic.md#adr-ag-144) fixed the slope-sign sentence.

**Two rules, both about the RUN and neither about a name:**

| the run | verdict | why |
| --- | --- | --- |
| ≥3 Latin letters, SPACE-DELIMITED | refused — a word | [#1068](https://github.com/dcodish/geo_builder/issues/1068)'s ruled boundary, moved here from `HAS_A_WORD` |
| ≥2 Latin letters immediately before `(` | refused — a function application | `√` is the only function; a space cannot delimit `tan(30)` |
| 1 letter before `(` | kept | `k(x+1)` is a product, and the corpus writes it |
| ≥3 letters NOT space-delimited | kept | `x²+y²-2abc=0` — juxtaposed parameters, ruled legal by #1068 |
| the private-use range | never a run | `lengths.ts` encodes a length term (`AB`) as one character; it cannot appear in student input |

**No list of function names appears anywhere in the fix or its lock.** A list catches `tan` and misses
`arctan`; the run test catches both, and the one after them.

**The noun must be consumed by the rule that claims it.** The corollary this fix surfaced: a leftover word
from the tool's OWN vocabulary is the same defect. `DISTANCE` in `lengths.ts` matched `ה?מרחק` (Hebrew's
article is a prefix) and `[Dd]istance` (English's is a separate word, and was not matched), so
«the distance between A and B = 10» lowered to `t·h·e·|AB| = 10` and pinned nothing. `NOUN` beside it
already spelled `(?:the\s+)?line\s+`; the measure noun now spells its article the same way. The general
rule for any new frame: **if the frame does not consume the whole noun phrase, the remainder becomes free
parameters and the given silently stops constraining.**

## The parser's last branch: a bare equation ([ADR-AG-019](06c-decisions-analytic.md#adr-ag-019))

`parseLine` ends with a branch that accepts an equation carrying no noun at all — `x-y+2=0`,
`y^2=54x`, `(x-3)^2+(y-4)^2=9`. It is the shortest thing a student can type and the way the corpus
writes figures, and [02c R6](02c-requirements-analytic.md) ruled it in 2026-09-04.

**Two design properties carry it, and both are the point:**

**It runs absolutely last.** Every named form, parameter declaration, inequality, shape noun, derived
point and coordinate gets first refusal. Position is half the safety.

**The discriminator is the PARSED expression's symbol set, not the text.** The branch accepts only an
equation in the plane's own variables — `symbolsOf(eq)` containing `x` or `y`. Reading the text for an
`x` is the `[IVX]` Roman-numeral defect ([ADR-AG-006](06c-decisions-analytic.md#adr-ag-006)) waiting to
happen again: `AB = 4√5` is a metric given whose symbols are `A` and `B`, and `x_A = 5` is the component
form. The set was **measured against those corpus lines before the branch was written**, which is the
standard this tree holds itself to after being bitten twice.

**The circle numeral is one token, used by four rules** ([ADR-AG-118](06c-decisions-analytic.md#adr-ag-118)).
`CIRCLE_NUMERALS` (the lookahead that keeps a centre NAME from eating a numeral) and
`CIRCLE_NUMERAL_RUN` (the capture that becomes the circle's id and name) are the whole of it, and the
Hebrew/English × centre/numeral rules take them. Widening the token to admit `[1-5]` is therefore the
entire digit feature — «מעגל 1» falls out of the existing id and label construction, and no rule learned
a digit case of its own.

**The numeral becomes an id in ONE function, and an id becomes a noun in ONE table**
([ADR-AG-170 Am. 1 + Am. 2](06c-decisions-analytic.md)). `engine/names.ts`: ONE numeral table (1–9 ↔ I–IX)
builds every numeral token of the grammar, for lines, circles, parabolas and ellipses alike;
`numeralCurveId(kind, n)` is the id of every numeral-named curve and KEEPS the student's notation
(`line-1`, `circle-I`), used by the naming clauses, the operand resolver, `curveByName` and every
circle lookup in `apply.ts`; `numeralKey` is the notation-free identity («1» and «I» are one NAME), and
`numeralTwin` finds an object named by the same numeral in the other notation. `lineIdOf(name)` is the id of
every NAMED line (a numeral, `l3`, a two-point `AB`), so no site spells a curve-name prefix itself — a guard
in `issue-1529-numeral-ids.test.ts` holds every `line-`/`circle-`/`parabola-`/`ellipse-` id construction to
`names.ts` ([ADR-AG-179](06c-decisions-analytic.md#adr-ag-179)). The REVERSE direction goes through the same
file: `crossings.ts` words a numeral-named curve from its id (`refKindOf` + `statedName`, «הפרבולה I»), never
from its label, which carries the noun in the language it was typed in; and the centre rule's circle slot
reads the numeral table (a numeral after the noun, a single capital as before). `apply.ts` asks it at
the two places a numeral name meets the figure — where a new id is minted (top of `applyFact`) and
where a reference fails to resolve (`unknownRef`) — and refuses `numeral-notation` (the operator's
2026-09-29 ruling: never a second object, never a silent merge; the ask lane's `missingCurve` says
the same; #1511's circle SUBJECT reader reads a numeral as the circle's name, never a centre — Am. 3). A contextual reference that finds none or several of its host is ONE refusal, `ambiguous-shape` + `HostRef` (#1432), whose `candidates` carry how to call each named curve found; `hostKey` picks the message. `refKindOf`/`statedName` read one prefix table, `refKindOf`/`statedName` read one prefix table,
and `app/errorText.ts` turns a refusal into a sentence through tables typed exhaustive over `RefKind`.
Circle, parabola and ellipse share ONE naming clause per language, and every naming clause (lines and
centre letters too) shares one connective grammar, `NAMING_TAIL_HE`/`_EN` — comma, dash, «שמשוואתו»,
copula, colon.

The range is **1–9 and I–IX, one table** (Am. 2 — it was 1–5 for circles and 1–9/I–V for lines), so
every digit a name slot accepts has its Roman twin. And the `(?=[\s:])` separator lookahead, which #1059 added
to stop `[IVX]` swallowing the `x` of «המעגל x²+y²−2ax−2x=0», is what now also keeps «המעגל
4x²+4y²=1» anonymous: the `x` after the digit is not a separator, so the numeral branch cannot claim
the coefficient. One device, two traps.

**`Curve.kind` is therefore an EXPECTATION, not an answer**, and optional. `classify` fits six
coefficients and names the family; the expectation only lets a refusal be specific ("you wrote «אליפסה»
and this is a hyperbola" — R7). Since ADR-AG-170 Am. 1 it is also CHECKED there: a fitted family other
than the stated one is `kind-mismatch` (with the actual family), reported by `derive` as its own fault,
so a circle is never drawn under the label «פרבולה I». The one exception is ruled (Am. 2): a circle
under the ELLIPSE noun is the a = b ellipse — `classify` returns `{kind: 'ellipse', a: r, b: r}` for a
circle centred at the origin (off-centre it is a translated ellipse, out of scope), so it resolves,
is referred to and crossed as the student's ellipse, and its foci coincide at the centre. Two consequences follow, and the second is the subtle one:

- an unnamed curve is identified by its equation alone (`curve-<hash>`, [R44](02c-requirements-analytic.md)),
  so the noun form and the bare form of one curve are one object;
- **absence of a claim must not read as a conflicting claim** — the M1 absorb and the clash test each
  require *two* claimed kinds before they disagree. Comparing `undefined` with `'line'` reported a
  student's own restatement as a contradiction while drawing the figure correctly, which is the shape
  of defect that ships silently.

## The submit path's three answers ([ADR-AG-020](06c-decisions-analytic.md#adr-ag-020))

`App.submit` dry-runs the whole line list with the new line appended, and the result is one of
**three** things, not two:

| outcome | recorded? | shown |
| --- | --- | --- |
| `faulted` | no | the refusal, naming the student's own statement |
| `created` / `narrowed` | yes | the figure updates |
| `known` | **no** | an informational notice — «זה כבר ידוע…» |

The third row is the one that was missing. `applyFact` had answered it since V0 as a boolean
`absorbed`, `derive` did not carry it, and the submit path therefore asked only *"is there a fault?"*
and recorded the line on every `no`. The student saw their sentence listed twice and was told nothing.

**The effect is decided once, at the apply boundary**, and carried out through `fold` (per fact,
positionally beside `errors`) and `derive` (rolled up per line). That is what makes the fact list, the
counter and the notice agree: they read one answer rather than each re-deriving one.

**`narrowed` exists because `absorbed` was hiding two events.** «a הוא פרמטר» then «a<13» merges into
the existing declaration — absorbed — but adds information, so it is a real given and belongs in the
list. Collapsing it into "already known" would silently drop a stated given.

## The fold defers, and the LINE is its unit of application ([ADR-AG-133](06c-decisions-analytic.md#adr-ag-133))

`fold(facts, groupOf)` is no longer a single forward pass. Two things happen after the in-order pass,
and both are the operator's one sentence — *the diagram should either respect all input or refuse to
build* — made mechanical:

**Deferral, to a fixpoint.** Every fact that failed at its position is retried against the completed
construction until a pass lands nothing, and it lands iff its re-apply now succeeds. «AD גובה לצלע BC»
typed before «משולש ABC» fails only because `B` and `C` do not exist YET; once the triangle declares
them the two constraints hold exactly as in the other order. Until #1340 the retry took only the kinds
that create nothing (a `NON_CREATING` set — ADR-104's limit); [ADR-AG-156](06c-decisions-analytic.md#adr-ag-156)
removed the set, so «M אמצע AB» typed above «A(0,0)» · «B(4,0)» lands too. The limit belonged to the
IN-ORDER pass: here a fact that referenced the new object before it existed is itself failed and is
retried after it, in list order, so nothing is stranded ([ADR-W-089](06w-decisions-workspace.md#adr-w-089)).
Evaluation still needs no topological sort ([ADR-AG-013](06c-decisions-analytic.md#adr-ag-013)): an
object can only land once every object it references exists, so the construction stays in dependency
order even when an object lands later than it was typed. A genuinely unresolvable reference keeps
failing and keeps its error.

**The line is the unit.** `derive` hands `fold` each fact's line index (`owner`). If any fact of a line
still fails after the fixpoint, NONE of that line's facts survive: the fold re-runs without that line
and every one of its facts carries the line's error, positionally, so `derive`'s per-line rollup sees one
refusal and no fragment reads as accepted. Removing a line can strand a later line that leaned on its
partial objects, so this too runs to a fixpoint (the 2-D fold's atomic-group poisoning). A clean list
pays exactly one pass; a list with k faulted lines pays at most k+1.

**What the submit gate does with a forward reference** is unchanged: `decideSubmit` dry-runs the list
with the new line appended and refuses on a fault at that index, so «AD גובה לצלע BC» typed on a canvas
with no `B` is refused by name ([ADR-AG-015](06c-decisions-analytic.md#adr-ag-015) — a reference may not
invent a point). The reversed order is reached by EDITING — deleting or rewording an earlier line — and
that is where the fold now honours it instead of drawing a fragment.

`errors`, `effects` and `constraintFact` stay positional per fact: `derive`'s rollup and #1079's
constraint blame read them unchanged; only whether a partial line survives changed.

## Relations, and the direction resolver ([ADR-AG-024](06c-decisions-analytic.md#adr-ag-024))

*Angles ([ADR-AG-153](06c-decisions-analytic.md#adr-ag-153)).* An angle by SIZE and an angle in RATIO are two
rows of the solve (`angle`, `angle-ratio`), each the unsigned angle difference over π, beside the
`perpendicular` row a right angle lowers to. They are not directions and never reach the resolver below.
*A lone vertex* ([ADR-AG-158](06c-decisions-analytic.md#adr-ag-158)) is an `AngleName` without rays. The parser
never lowers it: a line with a lone vertex on either side becomes a `vertex-angle` fact, and at M1 the one
vertex resolver `resolveAngleName` (also behind `right-angle`) reads the vertex's DISTINCT EDGES (`edgesAt`:
every segment and shape side through it, deduplicated, sorted — the port of 2-D's `pointNeighbors`); exactly
two are the rays, and the same `angle` / `angle-ratio` row the three-letter twin lowers to applies. More than
two is `ambiguous-angle` with an `example` three-letter name (the first shape's angle there, else the first
two edges); fewer than two, `ambiguous-angle` with none. The number of shapes holding the vertex is not read.
`canonicalConstraint` sorts each angle's rays, so either ray order is one given.

Four things in this grammar have a direction:

| operand | written | resolves to |
| --- | --- | --- |
| a segment / a polygon side | `DE`, `הצלע AB` | `B − A`, from the placed points |
| a named line | `ℓ1`, `הישר l1` | `(−b, a)` from its resolved `ax + by + c = 0` |
| an axis | `ציר ה-x` | a fixed unit vector — needs no figure at all |
| a FREE direction | «דרך N עובר ישר» (never written as an operand) | `(cos θ, sin θ)` from the register's angle — sampled, then solved ([ADR-AG-144](06c-decisions-analytic.md#adr-ag-144)) |

`direction(phrase)` produces one of these in the parser; a `relation` constraint carries two of them;
the residual relates them. **Sixteen operand pairs, one implementation** — and the relation never
learns what kind of phrase produced its operands.

**The vectors are normalised.** A relation between a 3-unit segment and a 3000-unit one must converge
alike; an un-normalised cross product lets the longer operand dominate the minimisation for no
geometric reason.

**A slope is `dy = m·dx`.** The quotient form has a pole at a vertical segment, and a residual that
blows up is a residual the minimiser cannot cross — the solution path would be unreachable through it.
This way a vertical segment simply fails the given.

**A named line is resolved by the CALLER.** `solve.ts` resolves points by id and knows nothing about
curves; `evaluate` hands it `lineDirOf(c, env)`. That keeps the classifier out of the solver, and an
operand that cannot be resolved reports "cannot be judged" exactly as an absent point does.

**The check is not the solve** ([#1062](https://github.com/dcodish/geo_builder/issues/1062)). Residuals
are measured against the configuration that was reached, whether or not a solve ran — a figure with no
free carriers has nothing to *move* and still has givens that must *hold*. The solve is an attempt to
reach a configuration; the check is the report on the one reached.

**A noun gate declines a tail that is not an equation** ([#1059](https://github.com/dcodish/geo_builder/issues/1059)).
Every `matchCurve` branch ends in `(.+)`, which is right for «נתון הישר ℓ1: 4y-3x-20=0» and wrong for
«הישר DE מקביל לישר BF». The discriminator is that the tail contains **no Hebrew** — not that it
contains an `=`, because a truncated equation has no `=` either and that student needs the opposite
answer.

## Lengths as values ([ADR-AG-025](06c-decisions-analytic.md#adr-ag-025))

`engine/lengths.ts` is a **thin adapter, not a second expression language**. `AB + BC = DE` needs
precedence, juxtaposition, `√` and powers — all of which `expr.ts` already has and is tested for. The
one thing it lacks is a token for `AB`: its symbols are single Latin letters, so `AB` reads as `A·B`.

So each `|PQ|` is rewritten to a single **private-use character** before parsing, and bound to the
measured distance at evaluation:

```
AB + BC = DE     →      +   =  
                       {A,B}   {B,C}       {D,E}
```

Private-use precisely because no student can type one and no corpus phrasing contains one — an
encoding that could collide with real input would repeat ADR-AG-006's `[IVX]` defect, where an internal
token class swallowed an equation. `SYMBOL_RE` widens by that range and nothing else.

**Three rules, three disjoint conditions, one ordering.** `AB` is a length, a line's name, and part of
a bare equation, depending on the sentence:

| sentence | claimed by | because |
| --- | --- | --- |
| «משוואת הישר AB היא y=2x» | `matchCurve` | it carries a curve NOUN, and runs first |
| `AB + BC = 10` | `parseConstraint` | a length token on at least one side |
| `x-y+2=0` | the bare-equation branch | symbols are the PLANE's, and it runs last |

The guard is position, not tokens — and it is asserted in the suite, because the ordering is the whole
of it.

## The shape registry ([ADR-AG-035](06c-decisions-analytic.md#adr-ag-035))

`engine/shapes.ts` is a table from a noun to the constraints it asserts, and the point of it is the
operator's own requirement — *"I don't want to mention each one"*. A noun is a row:

```ts
מקבילית: { arity: 4, givens: ([a, b, c, d]) => [parallel(a, b, d, c), parallel(a, d, b, c)] },
דלתון:   { arity: 4, givens: ([a, b, c, d]) => [equal(a, b, a, d), equal(c, b, c, d)],
           principalDiagonal: ([a, , c]) => [a, c] },
```

Three helpers are the whole vocabulary — `parallel`, `equal`, `rightAngleAt` — and that is a
deliberate limit: **a row that needs a fourth helper means the constraint layer is missing a kind**,
not that the table needs an exception. A shape lowers to one `polygon` fact plus its constraints, in
that order, because the ring is what introduces the vertices and a constraint may not name a point
the figure does not have yet.

The ring is `ABCD` in order, so `AB` and `DC` are opposite sides and `AC` and `BD` are the diagonals.
Every row reads its vertices that way and none of them says so.

**The polygon remembers its noun.** Not decoration: «האלכסון הראשי» is meaningless until the figure
knows it is a kite, and «שטח הדלתון הוא 24» names a shape without naming its vertices. A generic noun
is promoted by a specific one — «מרובע ABCD» then «דלתון ABCD» is one ring that learns what it is —
and never demoted.

### Discrete freedom

| the student writes | freedom | how it is drawn |
| --- | --- | --- |
| `משולש ABC` | 6, continuous | sampled; resampled by «הציגו תצורה אחרת» |
| `משולש ישר-זווית ABC` | 5 + a DISCRETE choice of 3 | `options[seed % 3]` — the seats CYCLE |
| `+ זווית B ישרה` | 5 | the choice is replaced by the option named |

`choice` is a constraint kind, and `resolveChoices(constraints, seed)` runs at the top of `evaluate`,
before anything measures anything. So the solve, the rank count, the satisfaction check and the
provenance all see ordinary constraints — and `residual` throws on an unresolved choice rather than
quietly measuring the first option, which would draw one seat and call it the only one.

A stated constraint that matches one of a choice's options collapses it at the M1 boundary and reports
`narrowed`: the constraint count is unchanged, and what moved is the freedom.

### Contextual references

Two forms name something without naming its parts, and both are resolved at M1 because both are
questions about the construction rather than about the sentence:

- «זווית B ישרה» — the rays come from the shape `B` belongs to;
- «שטח הדלתון הוא 24» — the ring is the one shape answering to that noun;
- «M מפגש האלכסונים» / «האלכסונים נפגשים בנקודה M» — the ring is the one shape with the
  construct's arity (`meet-of`). Both spellings hand their SUBJECT to ONE reader, `concurrencyOf`
  (`parseAnalytic.ts`): letters → the derived point on that ring; a noun alone or nothing → `meet-of`.
  A noun without letters is still checked against the construct's arity in the parser
  ([ADR-AG-182](06c-decisions-analytic.md#adr-ag-182)).

Each is unambiguous when exactly one object answers, and refused by name (`ambiguous-angle`,
`ambiguous-shape`) when none or several do. Refusing the ambiguous case is what makes the
unambiguous one safe to resolve at all.
## A point on an object, and the carrier that holds it ([ADR-AG-029](06c-decisions-analytic.md#adr-ag-029), [ADR-AG-032](06c-decisions-analytic.md#adr-ag-032))

«נקודה D על הצלע BC» is the product's defining sentence: the point is neither free (2 DOF) nor
derived (0), it rides a **carrier** with exactly one. The rule lowers to three pieces, and which
pieces it emits is decided by the NOUN:

| the student writes | incidence | selector |
| --- | --- | --- |
| `D על הצלע BC` / `על הקטע BC` | `on-line-2pt` | `between D B C` |
| `D על הישר BC` | `on-line-2pt` | — |
| `B על הישר y=x` | `on-curve` against a minted curve | — |

The operator's ruling is that **the noun decides boundedness**, so `bounded` tests for
`צלע|קטע|side|segment` by name. It does not test "has a noun" — the alternation also carries
`ישר|מעגל|פרבולה|אליפסה`, and a circle bounds nothing.

**Where the curve comes from matters as much as the curve.** A line the student named is part of
their figure; a line minted so a point has something to sit on is not. The object carries `stated`
to tell them apart, set at the M1 boundary; `evaluate` keeps both, because the solve measures
`on-curve` against the carrier and the data panel names it as the point's provenance; the RENDERER
draws only the stated ones. Restating a carrier's equation on its own line **promotes** it — one
object, now drawn, reported as a change rather than as a restatement.

### Incidence in every order ([ADR-AG-164](06c-decisions-analytic.md#adr-ag-164), #1281, #1495)

`parseIncidence` is a NORMALISER, not a rule with its own lowering: it classifies the subject (a point name, a coordinate pair, or a two-point side with its noun) and the object (a two-point line, an equation, a named line, «ישר העובר דרך P», or a curve) and rewrites the sentence into the one the grammar reads — «P על הישר CD», «משוואת הצלע BC היא …», «דרך P עובר ישר l3» — parsed by the rule that owns it (`viaCanonical`). Two spellings therefore produce the same facts by construction. Whether «דרך P עובר ישר l3» creates the line or states an incidence on an existing one is M1's (`line-at` in apply.ts). A coordinate point leaves the parser as a `MINT_PREFIX` placeholder and is named in `derive.resolveMints` over the whole list — the student's own letter at those coordinates first, else the next free `P₁`, `P₂` — and `Derivation.minted` feeds the row note.

**The OPERAND vocabulary is one resolver** ([ADR-AG-168](06c-decisions-analytic.md#adr-ag-168), #1429):
`incidenceOn` answers "which curve does this operand name" for the crossing sentence AND the point-on
handler, which delegates to it — axis, named line, numeral circle (digits and Romans on one id), the
two-point pair with its noun, an inline equation, and the contextual kind noun («המעגל»), which lowers to
the same fold-resolved `on-kind` everywhere. What stays per-sentence is what the rulings split: a bounded
noun is a `between` selector in a point-on sentence and the hard extent in a crossing. An EQUATION operand
carries `eqSrc`/`eq` on the `on-curve` constraint (spelling only — stripped at apply, outside the canonical
key), and the apply boundary resolves it to the existing curve carrying that equation (`resolveCurveByEq`,
probe-environment identity) or mints `stated: false`; `curve-anon` ids therefore never reach a refusal. The
crossing's other spellings — the clitic as written, the distributive and bare plurals (`crossing-kind`,
exactly-two at M1), both verb orders — normalise onto the canonical sentence through `intersectionSpellings`.

## A cevian lowers to its WHOLE definition ([ADR-AG-109](06c-decisions-analytic.md#adr-ag-109))

«AD תיכון לצלע BC» and «AD גובה לצלע BC» are conjunctions, and the rule emits every half:

| the student writes | incidence | the role's own condition |
| --- | --- | --- |
| `AD תיכון לצלע BC` | `on-line-2pt D B C` | `midpoint D B C` |
| `AD גובה לצלע BC` | `on-line-2pt D B C` | `perpendicular A D B C` |

The incidence column is the one that was missing (#1232). `perpendicular` is a pure DIRECTION
residual — two vectors whose dot product is driven to zero — so emitting it alone placed no foot, and
the tool drew a height that missed `BC` at every seed with no fault reported. `midpoint` implies its
own incidence, which is why the median leg read correctly while stating one constraint; the incidence
is stated for both roles anyway, so the conjunction lives in one place and the legs cannot drift.

**Not a compound `foot` kind**, which is what 2-D uses. Here the two halves stay separate constraints
so a refusal can name WHICH one failed, and so a student who already wrote «AD ⊥ BC» has that half
recognised as known by `canonicalConstraint`. The redundancy on the median costs no freedom:
`carrierDofOf` measures `carriers − rank(J)`, and a dependent row adds no rank.

**No `between` selector**, unlike the table above — the foot is on the LINE. See R103.

### The TARGET is an alternation, and the apex resolves it ([ADR-AG-117](06c-decisions-analytic.md#adr-ag-117))

The side used to be a mandatory run with «במשולש ABC» as an optional trailing decoration *after* it,
so the triangle was matched as text and could never be the thing that identifies the target.
`CEVIAN_TARGET_HE` / `CEVIAN_TARGET_EN` make it an alternative instead, and the lowering resolves
whichever branch matched into the same two letters:

| the student writes | `u`, `v` come from | refusal when it will not resolve |
| --- | --- | --- |
| `AD תיכון לצלע BC` | the run, verbatim | — |
| `AD תיכון ל-BC` | the run, verbatim (maqaf allowed) | — |
| `AD תיכון במשולש ABC` | the ring minus the apex | `apex-not-a-vertex` · `bad-arity` |

Everything downstream is untouched: the same four facts, the same gates, the same messages — which
is what the lock asserts, as a PARITY between the two spellings rather than as expectations of its
own ([ADR-W-053](06w-decisions-workspace.md#adr-w-053)).

Two refusals, not one, because one message cannot be true of both failures: «במשולש ABCD» is a noun
disagreeing with its own vertex count (`bad-arity`), while «XD … במשולש ABC» is a perfectly good
triangle the apex is not part of (`apex-not-a-vertex`). Reusing `degenerate-role` there would have
told the student their apex "lies on the side itself", which it does not.

## The ask lane ([ADR-AG-044](06c-decisions-analytic.md#adr-ag-044))

Two surfaces, one grammar. The main input CONSTRUCTS; the data panel's own box ASKS, and an ask is
evaluated against the current derivation and discarded — it never becomes a fact.

| the student types | into the input | into the ask lane |
| --- | --- | --- |
| `שטח ABC` | (with a value) a GIVEN that shapes the figure | the area, if the givens fix it |
| `AB` | the segment, drawn | its length |
| `משוואת הישר ℓ1` | (with an equation) the line | its equation |
| `משוואת המקום הגיאומטרי של P` · `המקום הגיאומטרי של P` · `מהו המקום הגיאומטרי של P` | — | one question: P's locus, as an equation when known ([ADR-AG-141](06c-decisions-analytic.md#adr-ag-141)) |

The locus question's lead-ins (the equation-of prefix, the enumerated imperative/interrogative openers)
are admitted INTO `LOCUS_OF`, which sits above `EQUATION_OF` — a second branch or a pre-strip would give
one question two code paths. An anti-widening lock keeps the greedier pattern from swallowing its
neighbours («משוואת הישר l1», «שיפוע AB», «A» answer exactly as before).

That table is the design: **a thing is askable because it was sayable.** `app/ask.ts` runs the
question through `parseLengthExpr` — the same measure grammar the constraint rules use — so a
vocabulary added on one surface arrives on the other with nothing to wire.

The answer passes `isKnowledge`, exactly as an inventory row does, and an unanswerable question is
worded from the FIGURE's freedom: *not fixed yet* when it still has some, *cannot be computed* when
it does not, and *I did not understand* when the question named nothing the figure has.

### The resolver seam ([ADR-AG-088](06c-decisions-analytic.md#adr-ag-088))

Each question branch used to resolve its own operand its own way, so a referencing capability added
to one was missing from the others in silence — «שיפוע AB» answered on a triangle while «משוואת AB»
reported the name missing, and the click menu could not see the side at all.

`app/lines.ts` is the one place either direction of that question is answered:

| | asks | answers |
| --- | --- | --- |
| `lineNamed(figure, name)` | which line is this, as drawn? | the coefficients, **normalized by the leading one** |
| `lineNamesOf(construction)` | which names denote a line? | named line curves · stated segments · every polygon side |
| `segmentName(construction, id)` | what is the drawn side the student clicked called? | its two-letter name |

The two halves are tied by an invariant the suite asserts by calling both: **everything the
enumeration offers resolves, and every sentence the menu composes is one the lane answers.** The
implication runs one way only — an anonymous curve resolves but is deliberately not enumerated,
because it is named by its equation (ADR-AG-056) and that is a poor menu entry.

Normalizing is by the LEADING coefficient, not by `hypot(a, b)`: the latter is the textbook normal
form and makes a rational line irrational, which ADR-AG-085's fraction clearing then cannot undo.

### The measure grammar's operands ([ADR-AG-089](06c-decisions-analytic.md#adr-ag-089))

`parseLengthExpr` reads a distance as a set of **frames** — one small pattern per spelling, each
handing over exactly two operands — and then decides the roles **once**, from the operand names:

| the name | what it can be |
| --- | --- |
| `A`, `A1` | a point, and nothing else |
| `AB`, `l1`, `ℓ₁` | a line — a pair of vertices, or a named curve |

So `point + point` is a plain distance (the same term `AB` produces), and `point + line` is the
distance to that line **in either order**. The classification is purely syntactic, which is what lets
this module keep knowing nothing about objects — the layering the rest of the file maintains.

A pair of LINE operands is left unconsumed: the parallel-lines distance is a capability rather than a
spelling, and it is not built here.

### Curve identity and the promotion path ([ADR-AG-090](06c-decisions-analytic.md#adr-ag-090))

Because ids are content-derived, «נקודה B על הישר y=x» and a later «y=x» are ONE object: the second
sentence PROMOTES the first from carrier to stated (#1076). The promotion carries the label — an
anonymous curve's identity is its equation (ADR-AG-056), so an object that loses `eqSrc` becomes one
nobody can name, and the crossing rings vanish for a line the student can see.

Two rules hold the seam shut: the carrier is minted WITH its `eqSrc` (the parser has the text), and
the promotion merges the incoming label over the prior, never overwriting a name the student gave.
The invariant to test against is equality, not appearance — **a promoted carrier and a curve stated
outright are the same object.**

A curve the tool DERIVES has no text to carry, and naming it from its computed coefficients is a
separate question with an honesty gate of its own (#1202).

### The resolver reaches the SOLVER too ([ADR-AG-091](06c-decisions-analytic.md#adr-ag-091))

`app/lines.ts` was the first home of "what line does this name denote", because the ask lane and the
click menu were the callers. #1201 found a third, one layer below: the **residual** of
«המרחק מ-A לישר l1 = 5» cannot be computed without that same answer.

So the resolution lives in `engine/lines.ts` and everything builds on it — the surfaces through
`app/lines.ts`, the solver through `lineAtOf`, which `evaluate.ts` constructs beside `curveAtOf` and
hands to `residual`. It resolves against a CONFIGURATION (a point-by-id lookup plus a curve-by-name
lookup) rather than a `Figure`, because the solver asks at every iterate.

**`null` from a residual means "cannot be judged at this iterate", and the solve turns it into `0`** so
the residual vector keeps its dimension. That is safe only while `null` is transient. A term that can
never be resolved returns `null` forever and is then a permanent false green — which is what #1201 was.

### Naming paths and the shared check ([ADR-AG-092](06c-decisions-analytic.md#adr-ag-092))

A figure has several routes that give something a letter — the centre of a circle (#1109), a crossing
(#1025), a midpoint or a triangle centre, and the rename family still to come (#1154). Each of them
ends at the same place: a `derived` object is minted in `applyFact`.

That mint is where "one position, one name" is enforced, and putting it anywhere else is the patch
shape — the class had already been reported for crossings (#1113) and measured again on curves (#1126)
before it was reported for centres.

```
P מרכז המעגל I   →  ● P
O מרכז המעגל I   →  refused: «כבר יש שם לנקודה הזו: P»
```

**The test is structural, not positional.** `engine/sameDerivation.ts` asks whether two `DerivedRule`s
define the same point — the same unordered pair for a midpoint, the same three vertices for a triangle
centre, the same RING (not set) for a quadrilateral's diagonal meet, the same parent for a circle
centre. No coordinates, no tolerance, and its switch is exhaustive so a new rule must answer the
question rather than inherit "never the same".

Structural scoping is also what keeps the check inside what was ruled: two independently stated points
that merely coincide are a different sentence, and are deliberately untouched.

### The relation rule's notations ([ADR-AG-093](06c-decisions-analytic.md#adr-ag-093))

One relation, three ways to write it, one handler:

| pattern | admits | connector |
| --- | --- | --- |
| `RELATION_HE` | «AB מקביל DC», «הצלע AB מאונכת לצלע BC» — the full inflection run | optional |
| `RELATION_EN` | «AB is parallel to DC», «AB perpendicular DC» | optional |
| `RELATION_SYM` | «AB ∥ DC», «AB||DC», «AB ⊥ DC», «AB ⟂ DC» | none — and no spaces required |

All three resolve their operands through the same `direction()` and emit the same `relation`
constraint, so a segment, a polygon side, a named line and an axis mean the same thing in every
notation. A symbol is a second SPELLING of one rule, never a second rule.

**`//` is excluded on purpose.** The relation rule runs before the equation parser, so a symbol that
also appears in real mathematics would let it claim a division and refuse it as a bad operand instead
of letting it fall through. The narrower symbol set is the deliberate trade.

The catalog carries the symbol rows, which is what keeps them alive: the guard re-parses every row in
both languages, so a notation that stops parsing fails the suite rather than becoming documentation.


### A determined point's locus is a point set ([ADR-AG-136](06c-decisions-analytic.md#adr-ag-136), #1227 on #1259)

The `LOCUS_OF` branch's "no curve" case is not one absence but three, and #1223's `fact` seam carries the third: `fact: 'points'` with the point set — `knownOptions`' resolution-aware set when there is one, else the single point both of whose coordinates `isKnowledge` fixes — which the component words in the lane's own grammar («נקודה · (4, 3)», «שתי נקודות · …», He/En keys `askPointOne/Two/Many`). An open figure and a genuinely uncomputable one keep `value: null` and their two wordings. The count is the set's and never a sample length: at a tangency the twenty-four solves cluster inside `SOLVE_RESOLUTION` (`solve.ts`, `10·√SOLVE_TOL` of scale — derived from the quadratic residual at a double root, k = 10 by the operator's ruling), `knownOptions` answers "not a set", and `isKnowledge` — now no tighter than that resolution either — reports the cluster's midpoint. Three thresholds, three questions: `SAME_VALUE_EPS` and `apart()` ask whether two values are one value; `SOLVE_RESOLUTION` asks whether two solves could have told them apart.


## A circle on a point ([ADR-AG-045](06c-decisions-analytic.md#adr-ag-045))

Every curve in this product is an equation over `x` and `y` whose coefficients are expressions in
parameters — resolvable from the environment alone. `circle-at` is the exception and the reason is
exact: **its shape depends on a point**, so it cannot be resolved until the figure is placed.

```
נתון מעגל O          →  declare O        (a free vertex, 2 DOF)
                        param r_O > 0    (the radius, 1 DOF)
                        circle-at O r_O  (no freedom of its own)
```

The object carries no freedom itself; counting it would count the centre and the radius twice.
`evaluate` turns it into the same `NumCurve` every other circle becomes, which is why nothing
downstream — the renderer, the centre mark, the panel row, the `on-curve` carrier — needed to learn
about it.

**Tangency is one equation**: the distance from the centre to the axis is the radius. Unsigned, so the
circle may sit on either side of the axis — the student said which axis, not which side.

### Tangent to a line ([ADR-AG-165](06c-decisions-analytic.md#adr-ag-165))

`tangent-line {centre, r, line}` is the general member of the same equation — the formula sheet's
|a·x₀ + b·y₀ + c| / √(a² + b²) = r — and keeps the axis member's disciplines unchanged: unsigned
(which side is a selector's business, ADR-052), one equation, one degree consumed.

`line` is a `TangentLineRef`: a **curve** in the figure (a named line `line-l1`, a constructed
`line-at`, or one the tangency sentence itself minted from an inline equation — the «A על הישר
y=2x» precedent, `stated: false`, content id) or the line through two named **points** («משיק לישר
AB», the `on-line-2pt` reading). The residual resolves the curve member through `curveAt` at every
iterate, so a line whose own coefficients still carry parameters is touched wherever this
configuration put it.

The points member carries the NOUN's extent (#1503, the #1168 class — the noun decides the
extent): `tangentTargets` reads `BOUNDED_NOUN` (the one list incidence uses — «צלע»/«קטע»/«בסיס»,
side/segment/base) before stripping it, and a bounded pair sets `bounded: true` on the ref. The
residual then adds the `on-line-2pt` crossing-arm extent rows applied to the tangency FOOT — with
`t` the centre's projection parameter onto A→B, rows `max(0, −t)·|AB|` and `max(0, t−1)·|AB|` pull
the touch point inside the side. The rows are HARD: for tangency the bound restricts the solution
set (a circle tangent to the extension is not tangent to the side), unlike the basin-only bounded
readings of a cevian's foot or «על הצלע». `canonicalConstraint` keys `bounded`, because «משיק לישר
AB» and «משיק לצלע AB» are different givens, and keeps the pair undirected.

**The extent rows are BOUNDS, and the freedom count does not rank them** ([ADR-AG-178](06c-decisions-analytic.md#adr-ag-178), #1556).
`residualRows` returns each constraint's rows tagged `{ eq, bound }`: the two hinge rows above (and
the bounded crossing's two) are `bound`, everything else is `eq`. The solve minimises both
(`residual` concatenates them); `carrierDofOf` ranks `eq` alone (`CarrierSystem.equalitiesAt` →
`freeRank`). A bound removes no dimension, and a hinge differentiated exactly at its kink — where the
solve likes to park a touch point, at a side's end — reads as a half-slope equation and would remove
one. The locus walk keeps the full rows: there a boundary is where the trace ends.

One target parser (`tangentTargets`) serves every sentence shape, so orders cannot drift — the
ADR-AG-164 rule applied to tangency: the circle first («מעגל M משיק לישרים l1 ו-l2»), the
contextual circle («המעגל משיק לישר l1»), the line first («הישר l1 משיק למעגל M», the plural
subject), axes and lines mixed in one list.

A CIRCLE piece (#1504, ADR-AG-167) makes the target list's third member: «מעגל M משיק למעגל K»
lowers to `tangent-circles {a, b, branch?}` — the names as the sentence spelled them, resolved at
the apply boundary through the `tangent-of`/`diameter-of` lookup chain, both required to be
`circle-at` (an equation circle or `circle-thru` refuses `out-of-scope` by name). The constraint
`tangent-circle {centre, r, other, otherR, branch}` is one row — |MK| − (r+R) or |MK| − |r−R| —
and the sentence without «מבחוץ»/«מבפנים» lowers to `choice[external, internal]` (#1049), so the
two touches cycle under «הציגו תצורה אחרת» and a branch word collapses the choice.
`canonicalConstraint` keys the undirected pair plus the branch. A target the grammar cannot read declines the whole
sentence to the escalation seam.

**One reader per role (ADR-AG-167 amendment 1).** `parseCircleAt` splits a tangency sentence at its verb and reads each
part ONCE: `readCircleSubject` answers which circle(s) the sentence is about — `one` (named «מעגל M», «מעגל שמרכזו M»,
"circle M"; contextual «המעגל») or `pair` (conjoined «מעגל O ומעגל M», plural-named «המעגלים O ו-M» / «O וM», unnamed
«(שני) המעגלים», and the English twins); `tangentTargets` reads every target list AND the line-first order's object (an
unnamed «למעגל» is the contextual circle); `TANGENT_BRANCH` is the one branch-word table (מבחוץ/חיצונית/externally,
מבפנים/פנימית/internally), and `peelMods` takes a branch word, «זה לזה» or «בנקודה T» off either end of the sentence or
straight after the verb, in any order. A modifier must land on a circle-to-circle relation (a sentence-level branch
distributes to the circle targets; «בנקודה T» needs exactly one relation; «זה לזה» needs a pair subject) — one with
nothing to land on declines the sentence rather than vanish. A named subject introduces its circle(s), exactly as the
singular always did; a pair with a target list makes EACH circle tangent to it.

**The touch point** («…בנקודה T») is a `touch-point {a, b}` derived rule whose parents are the two CIRCLES
(`curveParentsOf`): `K ± r_K·û`, the candidate whose distance to M is r_M — so it follows whichever touch the
configuration drew. 0 DOF; a letter that already exists becomes a condition on it (`derived-at`, #1320).

**Open bounds are judged at the solver's resolution.** `inDomain(d, v, floor)`: the stage-two admissibility test passes
`openBoundFloor` = `SOLVE_RESOLUTION` × the figure's scale (point spread, or the largest parameter magnitude when
larger), so a radius the givens force to zero (it converges to ~1e-10) reads as ON the bound `r > 0`, the attempt is
inadmissible, and the best admissible effort leaves the contradicting given unsatisfied — refused on its sentence.
Sampling and display keep the exact judgement (`floor = 0`). The tangency residual carries its own precondition the same
way: centres closer than the resolution (relative to the radii) report the gap, so concentric circles are never
tangent (operator ruling 2026-09-29).
Honesty is held at the apply boundary: a named line that does not exist is `unknown-reference`
(the ADR-AG-083 check, which `constraintCurveRefs` feeds), a minted equation that fits a circle is
`out-of-scope` by name, and tangency about a circle with no centre point or radius parameter — an
equation circle, a computed `circle-thru` — is `out-of-scope`, never dropped.

### A circle computed from points ([ADR-AG-160](06c-decisions-analytic.md#adr-ag-160))

`circle-thru` is the third constructive curve, after `circle-at` and `line-at`, and the simplest: **no freedom
and no parameter at all.**

```
מעגל ABD / המעגל העובר דרך A, B ו-D   →  circle-thru {through: [A, B, D]}     (circumcentre, closed form)
BD קוטר במעגל / נתון מעגל שקוטרו BD    →  diameter-of → circle-thru {diameter: B, D}   (midpoint, |BD|/2)
```

`circleThruCurve` (evaluate.ts) is the one resolver, used by `curveAtOf` — so incidences, crossings,
«O מרכז המעגל» and the ask lane see the circle — and by the object walk that draws it; it calls `derived.ts`'s
`circumcentre`, so this circle and «מפגש האנכים האמצעיים» cannot disagree. Unplaced points, three collinear
points or coinciding diameter ends are a vacancy, reported as `does-not-exist` once the figure has no freedom
left (the ADR-AG-008 predicate). `carrierOf` answers `null`, `symbolDeps` nothing, `objectDeps` the defining
points. Operator ruling (2026-09-27, #1464): computed rather than lowered to «נתון מעגל O» plus three incidences,
because that lowering is a SOLVED circle (ADR-AG-159 measured its cost) and needs a centre letter nobody wrote.

**Which circle «BD קוטר» means is an M1 question** (`diameter-of`, apply.ts) — 2-D's `circleOnDiameter` /
`diameter` split, ported as a decision. A defining phrase, or no circle to attach to: create. A named circle, or
the figure's one circle (by the FIT's kind — `curveKindOf`, the one kind test `on-kind` also uses): a statement
about it — a `circle-at` gets both ends on it and `derived-at(centre, midpoint)`; a three-point `circle-thru`
through both ends gets `rightAngleAt` the third (Thales, exact both ways); the same diameter is `known`; a circle
known only by its equation has no centre point to state, and is `out-of-scope`. Several circles and none
named: `ambiguous-shape`.

### A coordinate compared ([ADR-AG-161](06c-decisions-analytic.md#adr-ag-161))

`coord-compare {id, axis, greater, rhs: {point} | {value: Expr}}` is a selector (D7 kind 2). `axis-side` is the
same comparison against 0: `compareOf` reads both kinds, and the judge (`failingSelectors`) and the seeding go
through it — one mechanism, two spellings in the data. Seeding: against a value the coordinate is folded to the
named side keeping its distance (exactly #1071's fold at 0); between two free points in the wrong order their
seeded positions are SWAPPED. After the solve, a converged solution with the pair the wrong way round gets a
swapped restart (`swappedStarts`) beside the deflation restarts of ADR-AG-159 — the kite's B and D are
interchangeable roots, so the swap is one polish away. The post-hoc judge keeps the last word.

## Born after the chassis

This is the **first builder created after `shell/` existed**, and the difference shows in what it did
*not* have to do: it mounts the shared frame from its first line rather than re-deriving chrome and being
retrofitted later. Suite conformance is **half of its V0 acceptance gate**
([ADR-AG-004](06c-decisions-analytic.md)), not a follow-up.

It also inherited the bidi discipline from day one — `shell/bidi` rides as a post-processor over every
rendered message, so `y = -2x + 8` cannot reverse inside a Hebrew refusal. The three siblings each
learned that separately, twice as a bug.

## Boundaries

`src-analytic/` never imports `src/`, `src3d/` or `src-complex/`; its only allowed edge is `shell/`, and
it posts to the proxy over HTTP rather than importing `server/`. These edges were declared in
[`BOUNDARIES.json`](../BOUNDARIES.json) **on arrival** rather than after a bug — the third tree had
shipped with a *vacuous* guard because it was registered with no edges at all, and that lesson was
applied to the fourth.

## Known gaps

- **Test coverage is still thin by the workspace's standards, though less so** — 3 test files and ~713
  test lines against ~2,650 source lines (110 tests), where the mature trees run better than 1:1. B1
  added the DOF-contract suite and a second catalog guard. Appropriate for a V0 in build, and worth
  stating plainly so it is a known position rather than an oversight discovered later.
- **`02c` is still marked IN PROGRESS**, though less of it is open than was. It was captured live from an
  operator session and its decisions are not all ratified as `ADR-AG-NNN` yet; where it and
  [docs/19](19-analytic-geometry-tool.md) disagree, docs/19 is authoritative until they are. **Ratified
  since:** R1/R2/R5 — the object-first model and the tier-3 solve
  ([ADR-AG-009](06c-decisions-analytic.md#adr-ag-009)) — and the teacher lane, 02c §7
  ([ADR-AG-010](06c-decisions-analytic.md#adr-ag-010)).
- **The equation-first descriptions above have been rewritten** for the object model
  ([ADR-AG-009](06c-decisions-analytic.md#adr-ag-009) B1). What has *not* changed is the tree's
  vocabulary: B1 re-founded the model without adding a single new statement form, so the families this
  product can express are still V0's. B2 (the joint solve) and B3 (the shape vocabulary) are where that
  moves.
- **Deployed** since `prod/2026-09-16` (above); the registry's `enabled`/`devOnly` pair remains the mechanism for
  whichever builder is held back next.


## The session, and the panel that shows it ([ADR-AG-055](06c-decisions-analytic.md#adr-ag-055))

**A save holds the LINES.** No position, no parameter value, no seed-dependent number — the session
is the ordered list of sentences the student typed, and `restore` hands them back to `derive`. Three
things fall out of that one choice, and they are the reason it is worth stating as design rather than
as a serialization detail:

- a load is a **replay through the real parser**, so a saved figure doubles as a parser-drift net;
- a load can be **audited by line** — the failure the audit reports is a sentence the student wrote,
  which is the only kind of failure worth showing them ([ADR-242](06-decisions.md)'s rule, made
  answerable);
- nothing in the file can contradict the engine, because the file holds no engine output.

`shell/save` supplies the envelope, the naming and the `LoadAudit` shape; this product supplies the
lines. Envelope REFUSALS are not audit entries — they are errors, and they name which of the three
reasons applies (another builder's file, a newer format, not a save file at all), because those send
the student to three different places.

**The bidi seams.** `shell/bidi` decides where an LTR run begins and ends; this product's job is to
pass that decision to every surface that shows a line. There are five — the input box, its live
preview, the example chips on the empty canvas, the quick strip above the box, and the fact list with
its editor — and the strip is the one that had no seam to pass to, because `InputArea` rendered the
raw command where its sibling `QuickChips` had carried a `display` hook since #751. That gap is fixed
in the shared component, not here: a second consumer would have hit it too.

**Provenance and the curve-parented point.** `provenanceOf` answers "what do the givens that name
this point ALONE say about it?" — deliberately a different question from `isKnowledge`, which asks
whether the solve pins a value. A derived point normally inherits nothing, because its parents are
points that the solve places. `circle-centre` is the exception the model already knew about
(`parentsOf` returns none for it; `curveParentOf` answers instead): its parent is a CURVE, and a curve
written out in full is read rather than solved. The test is syntactic — do the equation's symbols
reduce to the reserved ones? — and it must stay syntactic, because `knownCurve` runs `evaluate` over
three seeds and `provenanceOf` is called from inside `evaluate`. It is conservative on a parametric
circle (both components open, where `y` is really given): under-claiming is safe, and attributing a
free symbol to one coordinate of a FITTED centre needs algebra the fit discards.

## Measuring by clicking

The click surface and the typing surface answer through **one** path. `app/measurable.ts` composes
TEXT and measures nothing — a second route to a number is how two halves of one panel start
disagreeing — and everything it produces is fed to `app/ask.ts`, the same function the «שאלו» box
calls.

```
click a point / a curve
        │
        ▼
measurablesOf(construction, what)        app/measurable.ts   ← composes SENTENCES, never values
        │   [ «A», «המרחק מ-A לישר l1» ]
        ▼
      ask(d, sentence, fmt, describeCurve)          app/ask.ts
        │
        ├── value   → the answer row
        ├── trace   → the substituted formula (#1053)
        └── mark    → { from, foot }  in WORLD coordinates
                          │
                          ▼
            buildScene(…, { marks })      render/scene.ts     ← projects; builds the right-angle tick
                          │                                     in SCREEN space so it stays square
                          ▼
                    scene.measures  →  <g data-testid="analytic-measures">   render/Figure.tsx
```

### The app layer decides; the component dispatches (ADR-AG-068)

`src-analytic/app/` holds the decisions the component used to carry inline. Three modules, one rule:

| module | answers |
| --- | --- |
| `app/submit.ts` | what a newly typed line DOES — refuse, notice, or record |
| `app/ask.ts` | what a question's answer IS — value, trace, mark |
| `app/answers.ts` | what the ask lane's row list BECOMES — ask, show, hide, retire |

**The rule is that the component and the locks call the same function.** It is written down because
violating it produced a defect that no gate could see: #1063's entailment notice was live, green and
unreachable for a day, because the submit decision sat in `App.tsx` and its test *reproduced* that
decision rather than calling it. The copy had no `created` arm, so it went on testing a submit path that
no longer existed — a test that re-implements its subject can only agree with itself.

```
        the student types a line
                  │
                  ▼
   decideSubmit(raw, lines, seed, current)      app/submit.ts   ← pure; no store, no t(), no render
                  │
   ┌──────────────┼───────────────┬────────────────────┬──────────────┐
   ▼              ▼               ▼                    ▼              ▼
'ignored'     'refused'    'already-known'      'already-follows'  'record'
  (blank)     setError      notice #1045          notice #1063     recordLine
```

`current` is the caller's already-memoized derivation of `lines`, so the submit path still folds exactly
once more than it must; a test passes `derive(lines, seed)` and needs nothing else.

**The ordering inside it is load-bearing.** The promotion arm (#1076) must precede the entailment test
(#1063) — a promoted carrier changes the canvas while changing no count — but it must be stated as
*created AND no constraint appended*, because `applyFact` also reports `created` for a bare constraint
append. Measured: an entailed given adds a constraint and gains nothing; a promotion gains nothing and
adds no constraint. That single number is what keeps the two classes apart, and it is a property of the
construction rather than of any particular sentence.


**Why the mark rides on the answer.** A perpendicular exists for exactly as long as its question does.
Putting it in the figure would make it an object — something with an id that survives, that undo must
account for, that a save must carry — and 02c R24 says an ask never mutates the figure. Carrying it on
the `Answer` means it appears when asked, disappears when the row is dropped, and needs no lifecycle of
its own.

**Two gates on drawing it**, and they are different questions. The distance must be **knowledge**, or a
height would assert a magnitude the givens never fixed (R25, ADR-052). And the foot must be far enough
from the point in *screen* space for a right-angle tick to read at all — below that the tick is omitted
and the dashed drop is still drawn.

**Where a measurable option comes from** is the object's own shape, not a fixed list: a line's length
is offered only when `asPair` finds its name really is two points the construction holds. The lock
asserts the stronger property — every sentence the menu offers is one `ask` understands — so the menu
cannot drift away from the grammar as either side grows.

## The locus lane ([ADR-AG-072](06c-decisions-analytic.md#adr-ag-072))

**Planned — #1136 → #1137 → #1138. Nothing below is built yet.** It is written here because the
design's whole claim is that the mechanism already exists, and a reader who does not know that will
build a second one.

### The definition is a number the engine already prints

> A locus is a named point whose residual `carrierDof` is **1**.

`carrierDofOf` computes it as `carriers − rank(J)` (see "The model — objects, and the register that
makes them free"), and it is already right on locus figures: `משולש ABM` + `MA = MB` reports 1 and
puts M on `x=4` at every seed; adding `MA = 5` reports 0 and pins it. So the detector is `carrierDof`,
the point sampler is `solveLM` under `sampleEnv`, and «הציגו תצורה אחרת» is already walking the locus
one point at a time. **Do not write a locus solver.**

### What is genuinely new: an ORDERED sweep

Seeds are a sampler, not a sweep — two seeds of the bisector gave `y = 317` and `y = 1.23`, so seed
order is not trace order and no sort fixes it in general (angle about a centroid works for the circle
and fails for the line and the parabola). The tracer is **continuation**: solve once, take a fixed
arclength step along the null space of the residual Jacobian, re-correct with `solveLM`, repeat until
the view box or closure. Two properties earn it:

- it is **ordered by construction**, so the output is a polyline rather than a cloud;
- it works when the traced point is **downstream** of the free one (#1138's `G = midpoint(E,K)` with E
  sweeping), which is why a marching-squares contour of a residual field was rejected — G has no
  residual in its own `(x,y)`.

### The honesty gate is at the level of the SET

`isKnowledge` asks whether a **value** is invariant across every admissible parameter. A locus point is
never invariant — that is what makes it a locus — so the value-level gate answers "no" on every locus
and would suppress the feature. The locus's gate asks the same question one level up:

| swept at two seeds | kind | equation |
| --- | --- | --- |
| same set | shown | **shown** |
| same kind, different set | shown | **not shown** |
| different kind | not shown | not shown |

`A(−9a,0)`, `B(41a,0)`, `∠APB = 90°` is row 2: a circle for every `a`, r=25 at `a=1` and r=50 at
`a=2`. The student gets the drawn circle and the word «מעגל» and no equation — no `hasParameter` test
anywhere, which is the point. A rule written as "if the figure has a free parameter" would be a patch
wearing a rule's clothes, and would also be wrong on a parameter the locus happens not to depend on.

### The set can be a UNION, and the tracer covers every component ([ADR-AG-166](06c-decisions-analytic.md#adr-ag-166), #1500)

Continuation can only ever cover the connected component its start is on — the two tangent lines
through O meet only at the degenerate G=O, so no walk crosses over. So `locusOf` DISCOVERS the other
components from the configurations the lane already samples: each sample's free positions are
**corrected onto the shown configuration's system** (`solveLM` under the shown env and resolved
choices — #1176's rule: the canvas may not draw a curve belonging to a figure nobody is looking at),
and a corrected sample landing off every held polyline (distance relative to the walk box) seeds one
more walk. Bounded — `2·COMPARE_TRIES` probes, a walk only on a new landing, an overlapping re-trace
dropped — never an open sweep (docs/17 §7; measured ≤ ~20ms per ask against ~10ms before). `LocusResult`
is a list of components, `Answer.locus` carries one drawn curve per component (each labelled with its
own equation on a union), and the determinacy gate compares **unions**: components matched order-free
by snapped equation first and kind second (`agreeingUnion`), any mismatch → kinds only, kind
multisets that do not pair → nothing. The row is ordered canonically so it reads the same at every
seed, and a union's equations go one per line (#1508 — `\n` in the value, split and typeset per line
at the answer row, the #1221 rule). For a single component all of this reduces byte-for-byte to the
previous behaviour.

The fit itself may not out-claim its data (#1500 defect 2, #1224's class): `fitLine` zeroes a normal
component below its own angular noise (`√(lo/hi)` of the two spread eigenvalues), and `normalized`'s
"is this coefficient present" bar is `1e-6` of scale, not `1e-9` — least squares over a few hundred
sampled points never resolves nine orders, and believing noise as the monic lead printed
`x + 64029472y = 0` for `y = 0` (a big integer snaps — denominator 1).

### The fit is a claim, so it is checked — against the trace, not against a student

`sweep → least-squares fit over the four kinds → snap to rationals → RE-VERIFY the snapped equation
against the traced points → print, or print nothing`. The re-verify step is **not** the student-side
validation ADR-AG-072 §6 withdrew; it is the tool refusing to print arithmetic it cannot confirm, and
it is the only thing standing between an over-eager rational snap and a confident wrong equation. Note
also that this fit is **not** `conic.ts`'s exact six-coefficient solve, which takes seven lattice
probes of a *known* equation; a cloud needs least squares plus a canonicity check, and a traced ray
will fit happily as a full line.

### It rides the ask lane, and widens one field

«המקום הגיאומטרי של P» is an ask sentence, so the lane of "The ask lane" and the record/view
lifetimes of "Measuring by clicking" carry it unchanged — row added on ask, drawing toggled by the
menu entry, ✕ discards both. The one change below the surface: `Answer.mark` is shaped for a distance
(`{from, foot}`) and `drawnMarks` filters on it, so it must also be able to carry a **polyline**.

Its drawing gate inverts the one beside it, and this is the trap to expect: a height is drawn only
when the distance is **knowledge**, because on an open figure it would assert a magnitude nobody gave;
a trace is drawn only when the figure is **open**, because it shows every position the givens allow
rather than one. Same module, opposite precondition — a second arm, never a bypass.

## A noun's unstated choice is the TOOL's ([ADR-AG-082](06c-decisions-analytic.md#adr-ag-082))

A shape noun lowers to constraints, and some of what it lowers to was never in the sentence. «טרפז
ABCD» promises that *one* pair of opposite sides is parallel; it does not say which. The registry picks
one by ring order so the figure can be drawn at all — and that pick belongs to the tool.

Constraints that the noun **gives** and constraints the tool **assumed** were indistinguishable once
emitted, and three defects followed from the one gap: the tool kept its guess alongside a student's
contradicting statement (drawing a parallelogram on a declared trapezoid), it declined their statement
as *"already follows from what you wrote"*, and the same statement got two answers depending on letter
order.

### The mark

`assumedParallel` in `engine/shapes.ts` sets `assumed: true` on the constraint. `evaluate` ignores it
entirely — an assumed constraint solves exactly like any other, which is what makes the figure drawable
before the student has chosen. Only the **apply boundary** and the **submit verdict** read it:

| the student states | what happens | effect |
| --- | --- | --- |
| the assumed pair | the mark is dropped; the constraint becomes theirs | `narrowed` |
| the other opposite-side pair of the same ring | the assumption is removed, theirs is added | `created` |
| both | the first pins, the second records — a parallelogram they asked for | — |
| a pair of a noun that GAVE it («מקבילית») | ordinary restatement | `known` |

`displacedAssumption` reads the **ring**, not the letters: the stated pair must be an opposite-side pair
of the same declared polygon as the assumed one, so it cannot fire on two segments that merely share
names with a polygon's sides, and a quadrilateral noun added later inherits the behaviour.

**It is not a `choice`.** A `choice` constraint is walked by «הציגו תצורה אחרת», which would flip the
parallel pair under the student between one press and the next. The default is stable and moves only
when a statement moves it.

### Why the submit verdict needed its own arm

Pinning an assumption changes neither the constraint count nor the figure's freedom, so every condition
of the entailment gate still holds and it still answered «זה כבר נובע מהנתונים שכתבתם». The honest
signal is not in the figure — it is that **an assumption stopped being one**, so `decideSubmit` counts
assumed relations before and after and records when the count drops.

### One key for "the same statement"

Every comparison site — the choice collapse, the duplicate absorb, the assumption match — calls
`canonicalConstraint` (`engine/solve.ts`): each point pair sorted, then the two operands of a symmetric
relation sorted. A segment is undirected and so are ∥ and ⊥.

The `JSON.stringify` compare it replaces was justified, in `shapes.ts`'s own words, by *"there is no
second way to spell a right angle at B"* — true of a seat that file builds, and false of a constraint
the parser built from a student's sentence. The lesson generalises: **a structural compare is only as
honest as the set of writers that can produce the structure.**

`assumed` is outside the key on purpose — an assumed `AB ∥ DC` and a stated one are the same statement,
which is precisely what lets the stated one recognise and pin the assumed one.
## The apply boundary's reference check, both halves ([ADR-AG-083](06c-decisions-analytic.md#adr-ag-083))

A constraint names things, and creates none of them. «שטח המשולש ABC הוא 20» before `ABC` exists is a
statement about nothing, so the apply boundary refuses it — that half has been there since #1028.

**A constraint can also name a CURVE**, and that half was missing. `constraintRefs` answers *which
points does this touch*, which is what its two callers want: `carriers.ts` needs the carriers a
constraint can move, and the apply boundary needs the points a statement presumes. So `on-curve`
returns only its point, and a `curve` direction returns nothing at all.

The result was a given that vanished between two layers. «נקודה D היא חיתוך של l7 ו- l8» parsed
correctly into two `on-curve` constraints, passed the apply boundary because its *points* were fine,
and then could not be measured at evaluation because the curves were not there — so `D` became an
ordinary free point at a sampled position, drawn on a canvas while the panel called it undetermined.

`constraintCurveRefs` is the sibling, and the boundary now checks both lists:

| ref kind | must resolve to | asked by |
| --- | --- | --- |
| point | something positional | `constraintRefs` |
| curve | something with a shape — `curve`, `circle-at`, `line-at`, `circle-thru` | `constraintCurveRefs` |

They stay **separate functions**. Merging them would have made the point check reject every curve
reference as "not a point" — the opposite defect, and a worse one.

### Naming what the student wrote

A curve's id carries a prefix so a circle and a point may both be called `I` (`circle-I`, `line-l7`).
`statedName` strips it, and is applied at **every** `unknown-reference` site rather than at the ones
that were reported: it is the identity on an unprefixed id, so a uniform call cannot be wrong, and the
next site handed a curve id inherits the fix instead of repeating the defect.

An anonymous curve (`curve-<hash>`) is left whole — there is no student name to recover, and the
hash's tail would be a different wrong word rather than the right one.

## The tree's display formatter ([ADR-AG-084](06c-decisions-analytic.md#adr-ag-084))

`shell/format.ts` owns decimal EXPANSIONS for every product — two places after the point, one
chokepoint, no private rounders. Its docblock is equally explicit about what it does *not* own:
*"Exact symbolic forms (5, 1/2, √2, cis120°) never pass through here … Each keeps its own
product-specific tiers ABOVE the decimal fallback."*

This tree had no tier, and called `fmtNum` directly — so the slope of «y=(4/3)x» read `1.33`. 2-D has
`exactFormOf` (rational · √ · π), 3-D has `cleanNum` (integer · `p/q` · surd), and the complex tree
carries exactness structurally. Analytic was the gap, not the shared formatter.

`src-analytic/format.ts` is now the tree's **one** display formatter — panel and canvas both — with a
single tier above the fallback:

```
fmtAnalytic(v) = fractionText(v) ?? fmtNum(v)
```

### Recognition is honest only while it stays recognition

The number reaching display is a `number`; the exactness of `4/3` lives in the equation the student
typed, layers above. So the form is RECOGNISED, exactly as both siblings do, and two limits keep that
from becoming invention:

- **a relative tolerance (`1e-6`) and a denominator capped at 12.** With a loose bar or a large
  denominator, every float is "rational" and the tier always succeeds — which in a tool about
  exactness is its own kind of lie. `1.3333` typed by a student stays `1.33`; π is not printed as 22/7.
- **the caller has already gated on invariance.** A value is displayed at all only where it passed
  `isKnowledge` — the same number in every admissible configuration — so a sampled coincidence never
  reaches the formatter.

The counter-direction is the load-bearing test, not the reported case.

**No surd tier**: no witness in this tree's corpus, and a tier with no witness has no test that could
fail. It is added when an exam asks for it.

## Position decides notation ([ADR-AG-085](06c-decisions-analytic.md#adr-ag-085))

`fmtAnalytic` answers *how is this number written* and is the tree's one formatter, so the panel and the
canvas cannot disagree ([ADR-AG-084](06c-decisions-analytic.md#adr-ag-084)). It is not the whole
question. **The same number is written differently depending on where it sits:**

| position | `4/3` | why |
| --- | --- | --- |
| a standalone value — a slope row, a length, a coordinate | `4/3` | exact, and nothing follows it |
| a COEFFICIENT inside an equation | never | `4/3x` reads as `4/(3x)` |

For an equation the fractions are cleared from the whole row instead —
`fractionClearingFactor` returns the LCM of the denominators and `lineText` scales every term by it, so
`-4/3x + y = 0` prints as `-4x + 3y = 0`. A surd coefficient cannot be cleared and the row stays in
decimals; integers are untouched.

This does **not** rewrite the student: measured before building, a line stated by equation carries
`eqSrc = null` and the row is already rendered from its classified coefficients into `ax + by + c = 0`.
The row has never been an echo, so clearing fractions is the same act it was already performing.

## A refusal names the KIND it expected ([ADR-AG-085](06c-decisions-analytic.md#adr-ag-085))

`unknown-reference` carries `expected: RefKind` beside its detail — a token, like `existing` (#1046), so
the engine holds no language. The kind is read from the id the parser minted: curves are prefixed
(`line-l7`, `circle-Z`) and points are bare, so `refKindOf` answers it at every refusal site and **no
call site has to declare it**. That is the property that matters: the next site handed a curve id
inherits the right noun instead of repeating the defect.

The locale holds four whole sentences, not one with a noun slotted in — Hebrew gender runs through the
clause («הנקודה … הוגדרה» vs «הישר … הוגדר»). An anonymous curve has no name the student wrote, so it
gets the kind-free wording rather than a guessed noun.

## The canvas's bidi chokepoint ([ADR-AG-087](06c-decisions-analytic.md#adr-ag-087))

The renderer has **one** place where a label's text is decided: `buildScene`. Every channel that can
carry text — a locus label, a measure label, a segment's pinned length, a circle's centre, a
construction mark — is produced there, and every one now passes through a single `lbl()` seam that
isolates the LTR technical runs inside it.

This is the same argument the module already made for *formatting* (#723/#1029): a value's on-screen
form is a display concern, so it is decided at the display boundary rather than at each caller. Bidi
isolation is the same kind of decision and belongs in the same place. The property it buys is the one
that matters — **a label channel added later is isolated by construction**, because it cannot be added
anywhere else.

### Why not inject it

`SceneKnowledge` already carries caller-owned data (`marks`, `loci`, `crossings`), so an `isolate`
callback would have fitted the existing seam. It was rejected: an injected isolator is one a caller can
forget, and forgetting is precisely the defect — the panel remembered, the canvas did not. A second
consideration settles it even where the caller is careful: two kit instances can be built with
different `extraCore` alphabets, and then the panel and the canvas isolate the same string two
different ways.

So the kit lives in `i18n/bidi.ts`, a module with no i18next in it, and `i18n/index.ts` re-exports it.
The renderer stays a pure consumer — it imports two lines, not a bootstrap — which is the constraint
that kept it out of `i18n/` in the first place.

### What is deliberately left raw

`crossings[].sentence` is not a label. It renders as an SVG `<title>` (a tooltip, laid out by the
browser's own bidi) and the same string is **submitted back as an utterance** when the student clicks
the ring. Format controls belong in strings that are displayed, never in one that round-trips into the
parser.

Axis ticks and point names do not pass through it either, and that is a narrower claim than it
sounds: they are not composed strings. A tick is `String(r)` for a number the axis chose and a point
carries its own id — single-script by construction, with no Hebrew to mix and nothing to reorder. The
seam covers every channel whose text is BUILT from parts, which is every channel where the defect can
occur.
## A curve reads as an equation plus its properties ([ADR-AG-097](06c-decisions-analytic.md#adr-ag-097))

`curveParts(c: NumCurve) → { equation, details? }` is the tree's ONE curve-text decision, in
`src-analytic/app/curveText.ts` beside `lineText`, which moved there with it.

| kind | `equation` | `details` |
| --- | --- | --- |
| line | `ax + by + c = 0` | — (it was already nothing but its equation) |
| circle | `(x − h)² + (y − k)² = r²` | `O(h, k), r` |
| parabola | `y² = 2p·x` | `F(p/2, 0)`, directrix `x = −p/2` |
| ellipse | `x²/a² + y²/b² = 1` | `a`, `b`, `F₁`, `F₂` |

Notation, not arithmetic, so the same rules the line terms follow apply throughout: a zero offset writes
no bracket (`x²`, not `(x - 0)²`), a negative one flips the sign (`(x + 2)²`, not `(x - -2)²`), and a unit
coefficient is suppressed (`y² = x`, not `y² = 1x`). Every number goes through `fmtAnalytic`, this tree's
one display formatter, so the panel, the canvas and the ask lane cannot round differently.

**Two callers, one import.** The panel renders `equation` on the row and `details` inside the same
`<details>` disclosure the ask lane's working uses (ADR-AG-094) — open by default, because for a circle
given by its centre those properties ARE the givens. The ask lane answers `«משוואת …»` with `equation`.
It used to take the formatter as a PARAMETER; it imports it now, which is what makes "one formatting for
both surfaces" a fact rather than a convention every call site has to keep.

## A display decision is measured in the figure's units ([ADR-AG-123](06c-decisions-analytic.md#adr-ag-123))

Two questions every printer in this tree asks — *is this coefficient zero* and *is this line vertical* —
were each answered against an absolute `1e-12`. A **solved** point does not produce numbers that small:
the foot of an altitude to a horizontal side carries the solver's residual, measured at `3.6e-9`, so the
guards let it through and the panel printed «x + 0y - 1 = 0» with a working that divided `-6` by a printed
zero. The same functions are correct on typed coordinates, which is why the class was invisible to every
hand-written lock.

**Zero is a question about the OUTPUT.** `term()` prints nothing when `fmt(|k|) === fmt(0)` — whatever it
is about to show, if it reads as zero it is not a term. The bracketed offset of a translated conic follows
the same rule, and always did (`shifted`); the general form is what had drifted.

**Verticality is asked relatively, and once.** `verticality(dx, dy) = |dx| / ‖(dx, dy)‖` is `0` for an
exactly vertical direction and `1` for a horizontal one, so `VERTICAL_TOL` means the same thing at every
scale — ADR-AG-021's rule, which this layer had not inherited. It lives in `engine/lines.ts` with
`isVertical` (a direction) and `isVerticalLine(a, b)` (a line, whose direction is `(−b, a)`), and the
trace, the explicit form, the slope number, the slope ask and the slopes panel all call it. The panel's
own predicate was the one that was right; moving it out is what makes the five surfaces agreeing a
property of the code rather than a coincidence anyone can break.

## The noun decides the root, and a ring offers the sentence that denotes it ([ADR-AG-124](06c-decisions-analytic.md#adr-ag-124))

A line meets a circle twice and both roots are real, so «which one» is a question about what comes up
FIRST. The operator ruled it by the noun: «הצלע CA» opens on the root inside the drawn piece, «הישר CA»
on the first root as before. The incidence carries the answer (`bounded` on `on-line-2pt`), and it acts
on the **start** of the search rather than on the residual — a least-squares descent goes to the basin it
starts in, so seeding the point on the drawn piece is what chooses the root. Only even seeds are pulled
in, so «הציגו תצורה אחרת» still reaches the other root: a preference, never a filter.

A crossing RING is offered only where the crossing lies on the drawn piece, so the sentence it commits
says «הצלע»/«הקטע» — it must denote the dot the student is looking at, which is ADR-AG-048’s rule
applied to the thing the click writes down. With that true, **nothing moves the figure’s configuration to
make a click look right**: the seed is figure-wide, and using it to record one point’s root re-rolled every
other point named before it.

## A forced coincidence is refused; a configuration-dependent one is not ([ADR-AG-125](06c-decisions-analytic.md#adr-ag-125))

A crossing that lands on a point the figure already has is refused **by position**, naming the holder —
the member [#1175](https://github.com/dcodish/geo_builder/issues/1175) answered structurally and left as
an escalation. The two branches are the operator’s ruling: refuse when no configuration can separate
them, stay silent while the figure can still move.

**The predicate is the vacancy pass’s, one block above it in `derive`, and for the same reason** —
silent while the figure can still move, reported once it cannot. A coincidence in a figure with freedom
left is a fact about THIS configuration; one in a fully determined figure is a fact about the givens, and
«הציגו תצורה אחרת» can never help. That is why it lives in `derive` rather than in the parser: whether a
coincidence is FORCED is a question about the figure, not about the words.

The nearness epsilon is relative to the figure with a floor tied to `SOLVE_TOL` — a figure whose points
all sit at the origin has no span, and the solver leaves its crossing ~1e-9 from the point it coincides
with, so an absolute floor below that decides nothing.

**The structural member has two arms, both in `parseIntersection`** ([ADR-AG-116](06c-decisions-analytic.md#adr-ag-116),
[ADR-AG-140](06c-decisions-analytic.md#adr-ag-140)). Two carriers named by two points each share exactly
ONE letter → they meet there → `crossing-already-named`, carrying the holder. They share BOTH letters → they
are one line → `self-crossing`, an owned refusal with no holder (there is no point to name). Neither arm
needs a figure, a seed or a tolerance: the operands are written in the sentence. `self-crossing` is owned
rather than `not-handled` for ADR-AG-130's reason — the grammar read the sentence, and the LLM seam would
ask a model to accept the spelling the ruling declined. The OFFER half (the click surface never authoring
this sentence) is `meet()`'s normalised determinant, ADR-AG-130.

## The knowledge gate samples CONFIGURATIONS, not seeds ([ADR-AG-126](06c-decisions-analytic.md#adr-ag-126))

`isKnowledge` decides whether a printed value is determined by reading it at several configurations and
asking whether it moved. Those configurations must be **distinct pictures**, not consecutive seeds:
`drawableAt` repairs a seed whose figure is not whole by walking forward to the next whole one, so
consecutive seeds routinely resolve to one figure — and a value read three times from one picture has zero
spread whatever the figure's freedom.

`figureSignature` is what makes two configurations the same picture (points and resolved curves at four
decimals, lines through `normalizedLine`), and `distinctConfigSeeds` walks until the signature differs.
Both live in `engine/evaluate.ts`, beside the walk that causes the collapse, and **both consumers call
them**: the knowledge gate and «הציגו תצורה אחרת». The button had its own copy until #1282, and that is
precisely why the correction #1084 made for the button never reached the gate.

The tolerance is untouched: the defect was never that the spread was measured too finely, it was that
there was no spread to measure.

### One configuration pool, completed after the render ([ADR-AG-180](06c-decisions-analytic.md#adr-ag-180), #1473)

**Distinct configurations are still not the knowledge sample.** "The first three configurations that differ"
answers *does it vary?*: with any continuous DOF every seed is distinct, all three samples go to the
continuous family, and a discrete root (which side of AB an area puts C) is never varied. So every gate —
`isKnowledge`, `knownCurve`, `knownOptions` — reads **`configurationPool(c)`**: the drawable figures at seeds
0..23, one object per construction (WeakMap), filled lazily through `drawableAt`'s own per-seed cache.
`distinctConfigSeeds` remains what «הציגו תצורה אחרת» walks.

**Two modes, one verdict.** Off the page the first gate fills the pool. On the page `App.tsx` calls
`configurationPool(d.construction).defer()`: a deferred gate pays only the floor the render always paid (the
distinct walk), then reads what is already evaluated — differing ⇒ open now; invariant so far ⇒
**pending** (`{ known: false, pending: true }`). `knownOptions` fills the pool only for a value already seen
to take two values (the walk the render paid before #1473). Pending is reported to `settled(fn)`, the probe
every multi-gate row composes under (`askSettled` wraps the whole ask lane once), and the row prints «בודק…».
`app/poolScheduler.ts` completes the pool one seed per slice — a plain macrotask (`scheduler.postTask`, else
`MessageChannel`, else `setTimeout(0)`), never `requestIdleCallback`: Chromium grants no idle period while the
loop keeps posting work, so every seed waited out the idle timeout (ADR-AG-180 Am. 1) — and re-renders; it runs from a **layout**
effect keyed on the derivation, so a pool the render's own walk completed settles before paint, and its
cleanup abandons the old figure's pool. Verdicts never depend on the machine — only when they appear does.
The perf lock counts `evaluateStats.uncached` (memo misses), never milliseconds.

**The resolution arm reads the figure's scale.** `spread ≤ SOLVE_RESOLUTION · max(|value|, smallest span of the
figures read)` — `SOLVE_RESOLUTION` is a fraction of the figure's extent (the residuals are scale-normalised);
the smallest span, so one flung free point cannot widen it.

**The conic memo.** `curveFromEquation` is memoised per `Expr` (WeakMap) by the exact values of the symbols
the equation reads (`-0` ≠ `0`) and the expected kind, capped at 512 keys; results are frozen because they
are shared. `__setConicMemo(false)` is the identity lock's seam. It removed ~45% of evaluation time on the
heaviest line (a parameter-free equation refitted in every Jacobian column).

## The session trace ([ADR-AG-131](06c-decisions-analytic.md#adr-ag-131))

`src-analytic/debug/sessionLogAnalytic.ts` fire-and-forgets one JSON line per event to the shared Vite dev
plugin (`server/logProxy.ts`) at `${BASE_URL}api/log`, tagged `tool:'analytic'`, which routes it to
`logs/debug-log-analytic.jsonl`. **Dev only by its own gate** — the tool IS deployed (`prod/2026-09-16`), but unlike its 2-D and 3-D
siblings this module has no production analytics sink (the `/analytic-builder/api/…` Apache directives were
never applied — DEPLOY-LOG 2026-09-16), and the `import.meta.env.DEV` early return is the whole of that posture.

**What it records, and why that set is a complete reconstruction.** The session here IS the line list — the
store's source of truth is `(lines, seed)` and the figure is replayed from it — so nothing derived needs
storing:

| kind | carries |
| --- | --- |
| `input` | the utterance, the locale, `source: 'parser' \| 'llm'`, the verdict as `result`, `intermediate` on a parser step that is about to escalate, and on the LLM path the **steps the model returned** |
| `figure` | `seed`, `lines`, `disabled` when any line is muted, the per-line `faults` and `outcomes` (indexed in the ACTIVE lines) |
| `action` | `clear`, `undo`, `redo`, `show-another` (with the resulting seed), `edit`, `delete`, `toggle` (`index:on\|off`, with the refusal's key when an un-mute is refused), `load` (with the audit's result) |

A blank submit writes nothing — there is no utterance to reconstruct, and a stray Enter is not an event.

One submitted utterance that escalates produces a joinable PAIR — the `intermediate` parser refusal and the
`llm` outcome — so a reader never counts it twice and can always see what the model actually said.

**The figure snapshot is deduped by CONTENT**, in `logAnalyticFigure`, not by the effect's dependency list:
`StrictMode`'s double-invoke, a remount and a discarded `useMemo` cache each re-fire the effect without the
figure changing, and the first version wrote three identical snapshots per change on the operator's own
session. The log's question is *"is this the same figure I last recorded?"*, and it is answered once.

**The sink routes by registry.** `logFileFor` maps a tool tag to its file; an **unknown tag is refused** and
written nowhere, because the previous two-way branch fell back to `debug-log.jsonl` — the corpus the 2-D
scenario suite, the theorem audit and the log-triage skill all read as real user data. An ABSENT tag still
means 2-D: `src/debug/sessionLog.ts` has never tagged its events, and that is back-compat rather than a
default.

Logging is best-effort throughout: it never throws and never blocks a submit. A logger that can break the
app is worse than no logger.

## An imperative wrapper is TAUGHT ([ADR-AG-150](06c-decisions-analytic.md#adr-ag-150))

The tree's first **guidance register**. 2-D has `src/parser/scope.ts` and 3-D has
`src3d/parser/scope3.ts`; analytic had none, so every family it could not build got the same
`not-handled` and an input the tool could have taught was indistinguishable from one it had never
heard of.

```
raw ──▶ imperativeCandidates()            scopeAnalytic.ts — a closed verb lexicon, no parsing
          │  []  ─────────────────────▶ ordinary path (parse · fold · refuse · LLM seam)
          │  [{verb, remainder}, …]        most-stripped first
          ▼
        parseLine(remainder).ok ?          submit.ts — the cheap filter
          │  no  ──────────────────────▶ ordinary path, untouched
          ▼ yes
        decideSubmit(remainder) records ?  the REAL gate: would this be accepted, here, now?
          │  no  ──────────────────────▶ ordinary path — the honest refusal about the real problem
          ▼ yes
        { kind: 'teach', verb, canonical } ──▶ App.tsx: setDraft(canonical) + the note
                                                          the ONE branch that does not clear the box
```

### Three properties, and where each one lives

**The taught sentence is one the gate ACCEPTS** — not merely one that parses, and the difference is
the whole design. The register produces candidates and no text of its own, so there is no renderer, no
table and nothing to drift; the string shown is a string the tool has just run through its own front
door. This is what #778's 2-D half buys by deriving the sentence from the lowered commands, and it
gets it one step further: grammatical *and* acceptable.

The first cut checked only the parser, and walking the case is what exposed it — «C מחלקת את AB ביחס
3:2» parses on an empty canvas and the fold refuses it, so the tool would have pre-filled a sentence,
said «press Enter», and refused the Enter. A feature that teaches a student to do something and then
punishes them for it is worse than the silent acceptance it replaces.

The cost of taking the remainder as-is: an INCOMPLETE remainder cannot be repaired into a whole
sentence the way a renderer could, so it is simply not taught.

**Input the tool does not understand is never dismembered.** The strip applies only when the remainder
parses. A verb-initial sentence with nothing real underneath it takes its ordinary path, including the
LLM seam — the register cannot turn an unknown sentence into a worse one.

**The order of the check is load-bearing.** It runs BEFORE `parseLine(line)`. The defect is that the
wrapped form *succeeds*; a check placed after the parse would leave exactly the succeeding cases
untouched.

### Why the verdict, and not a boolean

`decideSubmit` returns one verdict per submitted line and `App.tsx` switches on it exhaustively. A new
kind therefore breaks compilation everywhere the decision is read — which is how the existing lock in
`__tests__/engine.test.ts` caught this change the moment it was made, exactly as its docblock says it
will (#1102: *"the component and the locks call the SAME decision"*). A boolean beside the verdict
would have been silently ignorable.

### Not here

The **LLM suggest lane** of ADR-W-030 (a model phrasing offered click-to-insert at lower weight when
no sentence can be derived) is held: it contradicts the operator's 2026-09-20 ruling on
[#1297](https://github.com/dcodish/geo_builder/issues/1297), where the fallback RECORDS the model's
step re-serialised into the UI locale. The two rulings describe the same lane and disagree; the ADR
records the conflict rather than a session's choice between them.

The lexicon is **not** in `shell/` yet. One implementation is not a pattern, and `shell/` carries no
product strings ([ADR-W-016](06w-decisions-workspace.md#adr-w-016)) — the second slice (#778 (b)/(c))
is where the shared shape becomes visible.

## Measure roles: one reader, one ask normaliser, one substitution seam ([ADR-AG-169](06c-decisions-analytic.md#adr-ag-169) Am. 1)

A measure ROLE — a circle's radius, a parabola's focus and directrix, an ellipse's foci, a polygon's
perimeter — is a noun phrase the student uses on both surfaces. It is read **once**, by `readRoleRef`
(`parser/parseAnalytic.ts`), and composed:

- **the given** is `<role> <copula>? <value>`, in either order (`roleSplits`: the one `COPULA_WORDS`
  set, `=`/`:`, or a value as the first/last token — «רדיוס המעגל 5», «F מוקד הפרבולה»);
- **the ask** is the role phrase alone, after `normaliseAsk` (`app/ask.ts`) strips the enumerated
  openers («מהו», «מצא את», "what is" …) and the closer («?», «= ?»). The normaliser runs before EVERY
  ask rule, so no rule enumerates openers of its own.

Which OBJECT a contextual role means is M1's question (the «O מרכז המעגל» pattern): `radius-of`,
`focus-of`, `directrix-eq`, `perimeter-of`. A reference that finds no host, or several, refuses
`ambiguous-shape` carrying `host: {kind, found, need?}`; `app/hostKey.ts` turns it into the refusal's
and the ask row's remedy (`errHost.*`, `askHost.*`). The polygon-noun sites without a host keep the
kite example.

**The substitution seam.** A stated value that REPLACES a domained symbol — the free radius `r_O`
(> 0) — passes `admitStated` (`engine/apply.ts`) first: a constant outside the domain refuses
`out-of-domain` with the domain for the locale to word; a lone parameter inherits the domain through
the one `param` merge; any other parametric value is refused only when no probe admits it. The
substitution replaces the symbol in objects AND constraints (`substituteSym`), so a tangency stated
with the circle solves the stated radius. The creation tail («שרדיוסו 5», «ברדיוס 5», «שאורך רדיוסו
5») lowers to the same `radius-of`, applied last to its own circle by id.

**Derived, never assumed.** The directrix prints through `roleLineText`/`directrixText`
(`app/curveText.ts`) from the directrix LINE — the ask and the panel row share it — and the directrix
given is judged line against line. The perimeter ask delegates to the side sum; the perimeter given
lowers to the same `length-eq`; `ringsNamed` (`engine/shapes.ts`) resolves a noun-only perimeter for
both.

## A canonical circle's centre is the tool's O ([ADR-AG-184](06c-decisions-analytic.md#adr-ag-184), #1270)

A DEFAULT name, decided where `resolveMints` decides the tool's other names: in `derive`, over the whole
resolved fact list, because only the list knows what is taken in both entry orders.
`nameCanonicalCentres` inserts, right after each stated curve fact whose equation `isCanonicalCircle`
(`engine/conic.ts` — structurally `A(x²+y²)+F=0` at two parameter probes, and real at one), a
`{ t: 'derived', id: 'O', rule: circle-centre, auto: true }` owned by the circle's line — the route a
student-named centre already takes. It inserts nothing when the list states a constant point at the
origin, names a canonical circle's centre itself, or DEFINES `O` (a `point` or `derived` fact).
An `O` only DECLARED earlier («משולש AOB») is the fold's to see: `applyFact`'s derived arm absorbs an
`auto` fact whose id is held as `known` — never lowered to #1320's `derived-at` condition. `minted`
records `O` only when the fold CREATED it, which is what the row's `mintedNote` reads.

## The LLM lane's prompt: derive, never invent; never prose ([ADR-AG-186](06c-decisions-analytic.md#adr-ag-186))

The fallback prompt (`parser/llmSharedAnalytic.ts`) states **both halves of ADR-052**. A value nothing
the student said determines is never supplied; a value their own data DETERMINES is not an invention and
may be written into a line. The canonical case is a line by a point and a slope, written in point-slope
form with the stated numbers copied (`הישר y-3=4(x-2)`) — the equation layer evaluates that form as it
stands, so neither the model nor the student does arithmetic, and the line reads back as what was
typed. Every step must be a catalogue command; prose is refused as if the answer were empty.

The catalogue is the model's vocabulary, so a construct with no row has no pattern: the point-and-slope
line has one (F3), and so does the named-point form (F19: a free-direction line through the point,
then its slope).

**What the student reads when nothing recorded** is one pure decision, `fallbackRefusal`
(`app/fallback.ts`): a throttle is «busy»; a completion the tool READ and declined is «understood, not
supported» (ADR-AG-170); a completion that is not a command at all (`not-handled`), or no answer, keeps
the student's ORIGINAL refusal — nothing was understood, and the move may well be supported.

## A rename rewrites history, proven line by line ([ADR-AG-191](06c-decisions-analytic.md#adr-ag-191), #1154)

The session is the student's LINES, so a rename is not a fact: `decideSubmit` reads it first
(`parseRenameAnalytic`) and returns a `rename` verdict, and `app/rename.ts` rewrites the history — every
stored line, every ask row (`queries`) and every AI display sentence (`spokenFor`) — which `applyRename`
commits in one store `set` (one undo step, seed and muted set untouched). The rewrite is a token
substitution, but text alone cannot tell a point from a parameter or an English article, so each line is
PROVEN: `rewriteLine` accepts a rewrite only if the new line parses to the old line's facts with the point id
renamed (raw-text fields and expression symbols excluded, minted ids compared as letter multisets), trying
occurrence subsets largest-first when the full substitution is unfaithful, and refusing the line otherwise.
`decideRename` then folds the rewritten session once and compares its object and fault sets to the current
figure, renamed — so a rename can never shift a name the TOOL chooses from the free letters (the canonical
centre O). The refusals (`rename-bad-name`, `-same`, `-unknown`, `-taken` with the holder's line,
`-not-typed`, `-unsafe`) are InputError kinds worded in `errorText`. The click menu's «שנה אות»
(`renameDraftOf`) is offered only for a point the lines letter, and composes the same sentence into the
input box — one grammar, one gate. The catalog row carries `lane: 'rewrite'` (3-D's field): shown in the
guide, excluded from the LLM vocabulary and the figure corpus, read by the catalog guard through
`parseRenameAnalytic` + `decideRename`. Known limit: a FREE vertex's default sample is keyed by its letter
(`freeCoord`), so its drawn position may change on a rename while every given and the freedom stay equal.

*Amended 2026-10-02 ([ADR-AG-205](06c-decisions-analytic.md#adr-ag-205), #1667):* the compared shape is
invariant under the letter map. (1) A symbol spelled from an id — `r_<centre>`, `θ_<line>`, `θ_<object>.<part>`
— is spelled by `engine/carriers.ts` (`radiusSymbol`, `directionSymbol`, `toolSymbol`) and mapped by the one
inverse `relabelSymbol`, in a parameter declaration and in every expression node alike; a student's own
symbol is left alone. (2) A constraint is compared as `canonicalConstraint` (the engine's statement identity,
now also over a `choice`'s options), so operands the lowering orders by letter do not read as a different
statement. (3) Line and figure shapes are compared up to a consistent renaming of anonymous ids
(`ANON_ID_RE`, beside `anonIndex`), because «דרך P עובר ישר» hashes its anchor letter.

## The sentence frame ([ADR-AG-187](06c-decisions-analytic.md#adr-ag-187), #1618)

`parseLine` is the one boundary every rule reads, and it reads the exam's textbook frame **once**:

```
raw → orthography → proof-target? → readLine(depth 0) → parseClause
                                          │
                                          ├─ structural readings: origin · shape · distribution · point · side
                                          ├─ parseClause (the rule chain, unchanged)
                                          └─ if no rule owns it (not-handled / bad-operand): comma / «ו» partitions
```

- **`parseClause`** is the old `parseLine`. The parser's own internal calls (the canonical sentences of `viaCanonical`, the crossing pair, the placed subject) call it directly, so the frame never changes what they mean.
- **`frameAnalytic.ts` is text → clauses and decides nothing.** A reading is taken only when every clause parses through `readLine` again, one level deeper (`MAX_FRAME_DEPTH = 2`). So the frame cannot accept what the grammar rejects, and a line is never half-accepted.
- **Order matters, and it is chosen.** The structural readings run *before* `parseClause`, because a rule can half-claim a framed line («טרפז ישר זווית ABCD (AB ∥ CD, …)» used to answer `bad-operand`). The partitions run *after*, and only on `not-handled` / `bad-operand`, so a comma can never override a rule's owned refusal.
- **Partitions** keep each segment's original separator (`Segment.sep`), so a group is always a substring of the line. They are tried fewest-groups first, and a group that only names a point (`isBareName`) disqualifies the partition: cutting «A» off «A, B ו-C נמצאות על …» would leave A unconstrained.
- **Shape nouns come from `SHAPES` / `EN_SHAPE`**, longest first, through `normalizeShapeNoun`. A new row in the registry is understood in every frame with no change here.
- **`unwrap` runs to a fixpoint** (bounded), because frames nest: «וידוע כי …», «נתון בנוסף: … (ראה ציור)».

**Not here:** the imperative wrapper («הוסף …») is still taught by `decideSubmit` before `parseLine` runs (ADR-AG-150). A proof target is refused inside `parseLine` (`proof-target`), so the teaching path's parse of «כי …» fails, and «הראו כי …» reaches the refusal rather than a lesson. A role noun («השוק BC») is not folded; that boundary belongs to ADR-AG-119.

*Amended 2026-10-01 (#1626, #1628):* `shapeClauses` tries the predicate with the copula first, then without it, and the copula-less form requires a subject noun. `originClauses` rewrites an unnamed «(ב)ראשית הצירים» to the slot `(0,0)` («בנקודה (0,0)»); the name comes from `resolveMints`, which prefers O for the origin when no point holds the letter.

**The entailment test is judged over CONFIGURATIONS, not over the trial ([ADR-AG-188](06c-decisions-analytic.md#adr-ag-188), #1629).** The trial derivation re-searches seeds until the new line holds, so "the given holds in the trial" is true for any given that merely *selects* among discrete configurations. The "freedom did not drop" condition cannot catch this, because mirror images at 0 DOF have no freedom to lose. The gate therefore has a fourth condition, checked last because it is the only one that costs evaluations. The constraints the new line stated (`Derivation.constraintLine`, the fold's own `constraintFact` attribution carried to the line) must hold in every figure of the CURRENT construction's configuration pool (`evaluate.holdsInEveryConfiguration`). That is the same pool, the same residual and the same `SATISFIED_EPS` that `isKnowledge`, `knownOptions`, `knownCurve` and `unsatisfied` use. A residual that cannot be judged reads as "not entailed", so the line records. The pool is filled on demand. On the page, `poolScheduler` has usually completed it already, and if it has not, one submit pays the at most 24 cached evaluations the idle loop would have spent.

## One decision for the view after any change ([ADR-AG-190](06c-decisions-analytic.md#adr-ag-190), #1624)

The App's box effect (keyed on the drawn box and the seed) makes one call, `viewAfterChange(from, view, to,
change, surface)` in `render/view.ts`, whatever changed the figure: `change` is `'configuration'` when the
«הציגו תצורה אחרת» button set `carryFrameRef`, else `'figure'`. The function is pure box arithmetic.
Its candidate is the carried window for a press (`carryWindow`, ADR-AG-137) and the current relative view
otherwise; it returns the candidate itself when `boxContains(viewBox(to, candidate, surface), to)` — the
drawn box is already padded (`engine/evaluate.ts` `viewBox`, plus shown traces via `app/drawnBox.ts`), so
containment includes the margin. Otherwise it returns `viewShowing(union, to, surface)`, the view whose
window contains the union of the candidate window and the drawn box: centre = the union's centre, and the
zoom solved from `max(halfY, halfX / aspect)` exactly as `carryWindow` inverts `viewBox`'s aspect step —
the window only grows, the scale stays one isotropic number. The single non-union branch is #1225's: for
`'figure'`, a candidate through which `figureIsVisible` (≥ 50% per axis) fails returns `INITIAL_VIEW`.
`figureIsVisible` is therefore now only the "has it left" test; the "is it shown" test is containment.
The decision is in `render/view.ts` rather than inline in `App.tsx` so the locks call it (ADR-W-053).

## A noun's exclusive condition is part of its ring ([ADR-AG-189](06c-decisions-analytic.md#adr-ag-189), #1627)

A shape noun asserts two kinds of thing. **Relations** are equations over its vertices («AB ∥ DC», «AD = BC»): they are its `SHAPES` row, and the solve meets them. **Ring promises** are properties of the drawn configuration that no equation can hold: simple (not crossed), open (not collapsed), and, for the trapezoid family, *not a parallelogram*. `engine/rings.ts` `ringViolation(vertices, noun)` is the one predicate for all of them. It is pure over positions the caller already has, and it runs in a fixed order: degenerate, then crossed, then the noun's exclusion. Each answer describes a simple, open ring correctly. A noun opts into an exclusion by membership in `shapes.ts` `ONE_PARALLEL_PAIR_NOUNS`. That set is kept outside the rows, so editing a row's seats cannot disarm it, and the predicate names no noun itself. Both pairs of opposite sides are "parallel" below `PARALLEL_SIN_TOL`, which equals `COLLAPSED_SIN_TOL` (|sin θ| < 1e-3, relative and scale-free). The violation is consumed exactly as the other two are. In `evaluate`, `ringFaultsOf` records it on the figure, and `drawableAt`'s `whole()` rejects the configuration, so the seed sweep moves on. Unlike the other two it is never refused (ADR-AG-189 Amendment 1, operator ruling 2026-10-01, 2-D ADR-165): `derive`'s ADR-AG-129 arm skips it, so a figure whose givens leave no true trapezoid (determined or still movable) is drawn from `drawableAt`'s fallback tier and recorded. `app/shapeWarnings.ts` `shapeWarningsOf(lines, d)` then reads the fault off the DRAWN figure (`d.figure.ringFaults`, computed on the positions the canvas draws), so it states what is on screen and never "the search found none" (#1071). It names the forcing line by walking the active list backwards and re-deriving each prefix at the same seed and seed names until the drawing is no longer a parallelogram. This is paid only when the fault is present, and it is usually one re-derivation. `App.tsx` renders each warning as a shared `Banner kind="notice"` (amber, not dismissable) above the fact list, with the spoken sentence for a fallback-built row. It is derived per render, so deleting or muting the line, or another configuration, clears it with no state.

Extend the section "A rename rewrites history, proven line by line" (retitle: "A letter change rewrites history, proven line by line ([ADR-AG-191](06c-decisions-analytic.md#adr-ag-191), [ADR-AG-192](06c-decisions-analytic.md#adr-ag-192), #1154, #1631)"), replacing its last sentence ("Known limit: …") with:

**One core, a letter map.** Rename and swap are one operation over a letter map — `{A: G}`, or `{A: B, B: A}`
for a swap — applied SIMULTANEOUSLY by one regex pass (`relabelMap`), which is what 2-D's NUL-sentinel triple
achieves with sequential replaces. `relabelSession` rewrites every line (`rewriteLineMap`, the same
faithfulness proof, ids mapped), every ask row and every display sentence, then re-folds the session and
compares objects, constraints, selectors and faults, mapped. `decideRename` and `decideSwap` are its two
entry points; `decideSubmit` reads the typed swap (`parseSwapAnalytic`, «בין» marks it) before the rename.

**The holder is data.** A `rename-taken` verdict carries `holder: { text, index }` — the line as typed and its
row in the full list — which the shared letter popover quotes and highlights before offering the swap;
`letterHolder` answers it standalone, falling back to the derivation's `minted` row for a letter the tool gave.

**Materializing a tool letter.** A point the figure has but no line names (`minted`: the canonical centre,
a coordinate point's `P₁`/origin `O`) is first written into its own sentence — the letter inserted after the
circle noun or before the coordinate pair — and accepted only if the session folds to the identical
construction; the ordinary rewrite then runs. No faithful insertion ⇒ that case alone is `*-not-typed`.

**Seed names.** `Construction.seedNames` (`letter → seed name`) decides which name `evaluate` hashes to place
a free vertex's default sample (`freeCoord`). `derive(lines, seed, seedNames)` puts it on the construction, so
every evaluation of the figure — canvas, gates, pool — agrees; the submit, toggle and edit trials take it from
`current`. A letter change TRANSPOSES the map (`transposeSeedNames`), keeping it a permutation, so a renamed
vertex starts where it started and a freed letter, reused, can never share its seed. The store keeps it beside
the lines (undo slice, save file, share link, restored session); empty means absent, so a figure no letter
change touched folds exactly as before.

**One commit.** `applyRename` / `applySwap` write `{ lines, queries, spokenFor, seedNames }` in one `set`, and
the undo slice carries all four (plus seed and muted set). The surface is the shared `shell/frame/LetterPopover`,
wired by the integrator to `decideRename` / `dispatchRename` / `dispatchSwap`; the typed forms remain.

## The circle the figure has ([ADR-AG-193](06c-decisions-analytic.md#adr-ag-193), #1619 B1, #1598)

Sentences about "the circle" divide into **spellings** and **references**, and each has one home.

**Spellings are lowered onto the sentence that owns the meaning, in the parser.** The frame (`frameAnalytic.ts`) gains three readings — `centreClauses`, `sharedSubjectClauses`, `elidedSubjectClauses` — and two text folds (the «הנתון» adjective after a definite noun; «M נמצא בנקודה (x,y)» → `M(x,y)` in `pointClauses`). Like every reading they are taken only when each clause parses through `readLine`. Inside `parseClause`: the converse of incidence accepts a curve subject («המעגל עובר דרך P» → «P על המעגל», via `viaCanonical`); the crossing head admits «אחת מ…» (`ONE_OF_HE`); a crossing operand may name a half-axis, which becomes the `axis-side` selector beside the incidence; `bothCrossings` emits the two un-ordinaled crossings when an operand is contextual (`incidenceOn(…).t === 'kind'`); `THRU_HE` admits the comma before «העובר»; the circle-noun gate refuses to claim a tail with an English word (`HAS_A_WORD`).

**References are facts M1 resolves**, because only the construction knows which circle «המעגל» is:

```
on-kind {id, kind, circle?}       → on-curve on circleByName(circle) or the one circle
centre-of {id, eq?, create?}      → host = curve with eq (resolveCurveByEq) | the one circle | none
                                      curve       → derived circle-centre        (ADR-AG-184 yields intact)
                                      circle-thru → derived circumcentre | midpoint (centreRuleOf)
                                      circle-at   → known (same letter) | already-named (holder)
                                      none        → applyAll(create)   (the parser's canonical creation)
via-centre {facts, phrase}        → facts with CENTRE_SENTINEL → centreIdOf(the one circle) | unknown-reference(phrase)
circle-region {id, region, a?, b?, circle?} → sign selector over Quantity power | arc-side (+ on-curve for an arc's E, A, B)
radius-length {length, circle?}   → length-eq(length, radius expr of the host)
```

- **`circleByName`** is the one name → circle chain (numeral id, `circle-at-<letter>`, `curveByName`, then a circle whose centre point carries the letter — `centreIdOf`). `tangent-of`, `radius-of`, `diameter-of` and `tangent-circles` call it; none spells the chain.
- **`centreRuleOf` / `centreIdOf`** answer "which point is this circle's centre" for every way a circle is stated; `centreIdOf` finds a held point structurally (`sameDerivation`), never by position.
- **`create`** carries the facts of the canonical creation sentence («נתון מעגל שמרכזו P», «נתון מעגל P שמשוואתו …»), lowered by the rule that owns it; a creation that would not name the centre (a numeral letter) is not carried, and the sentence is refused `out-of-scope` rather than absorbed.
- **The regions are `sign` selectors** (D7 kind 2). `evaluate.ts circleQuantity` computes the power |PC|² − r², or the product of the point's and the centre's sides of the chord, from the configuration's own positions and resolved circle; a value within `SOLVE_RESOLUTION`·max(1, r²) of zero is zero (on the boundary is neither side). `freeAngleOf` ignores them (no direction to seed).
- **Selector attribution.** `foldPass` records `selectorFact` exactly as `constraintFact` (before/after comparison of `c.selectors`), and `derive`'s 0-DOF selector arm blames a failing M1-built selector on that fact's line.
- **`derive.nameCanonicalCentres` rule 2** counts a `centre-of` fact: with an equation, when that equation is a canonical circle; without one, when the list states exactly one circle-bearing fact and it is the canonical one.
- **`centresOf`** offers an unnamed equation circle's centre with «‹letter› מרכז המעגל ‹eqSrc›», and a sole computed circle's with «‹letter› מרכז המעגל»; a centre a point already occupies (`pointAt`) is offered nothing.

**The other root of a circle and a straight.** In stage two's selector preference, `separatedFrom` tries `chordStarts` before `deflatedStarts`: for each collapsed pair (`collapsedPairs`) whose mover lies on one circle (`on-curve`) and one straight (`on-line`, `on-curve` line, `on-line-2pt`), the mover is placed at the partner reflected through the foot of the centre on the straight — the chord's other end, on the circle the collapsed solve found. Each point is moved at most once (a pair is listed from both crossings' selectors). It proposes a start only; the polish and `selectorsHoldAt` judge it, and deflation follows unchanged when it proposes nothing.

## Inscribed and circumscribed: the sentence is the sentences it is made of ([ADR-AG-194](06c-decisions-analytic.md#adr-ag-194), #1619 B2, #1554)

**One rule family, two directions.** `parseInscribed` reads the polygon-in-circle voices (polygon subject, «בר
חסימה», circle subject with «חוסם», container-first «במעגל … חסום …») and the circle-in-polygon voices (circle
subject «… חסום ב<noun>», container-first «ב<noun> … חסום מעגל», polygon subject «… חוסם מעגל»), He and En. The
container marker «ב» and the verb decide the direction (2-D #31/#38), so neither direction can read as the
other. It runs in `parseClause` before `parseCircleAt`, whose subject reader would otherwise take «מעגל שמרכזו
C» off the front of «מעגל שמרכזו C חסום במשולש AOB».

**Lowering by composition.** Nothing in the rule is geometry. The polygon is `parseShape(«<noun> RUN»)` (the
noun's givens, its `distinct`, and the `acute` selector when the adjective is present). The circle is
`parseClause(«מעגל <tail>»)`, filtered to exactly one circle-introducing fact (`circle-at`, a circle `curve`,
`circle-thru`, a defining `diameter-of`), whose id the incidences name — so a circle phrasing any later stream
teaches the circle rules is inscribable for free. No tail is `circle-thru` over the first three vertices. The
vertices not on the circle by definition each get `on-curve`. All facts carry the student's line as `src`.

**The incircle** is a fourth `CircleDef`, `incircle`, evaluated in `circleThruCurve` (centre
`incircleCentre`, radius the distance to the first side; vacancy for a degenerate or non-convex ring). It
carries no freedom, so `carriers.ts` needed no new row (the `circle-thru` rows read `circleDefPoints`). A
quadrilateral's Pitot condition is a stated `length-eq`, not a property of the circle.

**Side touch points** are the M1 fact `touch-at` (one per side) and the derived rule `side-touch` (foot of the
circle's centre on the side; curve parent). The host decides: incircle of a ring with that side — the point
only; `circle-at` — `tangent-line` (bounded for «צלעות/קטעים») plus the point; otherwise `out-of-scope`.

**«חד זוויות»** is the selector `acute` (D7 kind 2), judged in `failingSelectors` beside `distinct`.

**Diameter on a through-circle** accepts an end that is on the circle by an `on-curve` incidence: the right
angle at a defining point that is neither end.

**Frame readings.** `diameterClauses` (the «הקטע AB הוא קוטר …» and «קוטר המעגל AC נמצא על …» forms) runs with
the structural readings; `parenClauses` («<sentence> (<givens>)») runs last, after the comma split, and only
when every clause parses.

### Not here
Binding an undescribed «חסום במעגל» to a circle already in the figure; the circle-subject side list «מעגל M
משיק לצלעות …»; a centre letter on a computed circle (stream B1); tangency to an equation circle (stream B3's
`tangent-curve`); the right-trapezoid ruling (#1554 vs #1627).

## Tangency at a point, the tangent object, chords ([ADR-AG-195](06c-decisions-analytic.md#adr-ag-195), #1619 B3, #1430)

**The radius is a direction.** `Direction` has a fifth member, `{ k: 'radius', circle, at }`. `dirVector` resolves it from the circle's `NumCurve` (`curveAt`), so it needs no centre POINT, and every circle kind — `circle-at`, an equation `curve`, `circle-thru` — works the same way. `dirRefs` reports `at`, and `constraintCurveRefs` reports the circle through the `relation` arm, so the apply boundary's existence checks cover it unchanged.

**A touch is lowered, not modelled.** `tangent-of { …, at }` is applied by `applyTouchAt`, which emits `on-curve(at, circle)`, the touch point on its target, and `relation ⊥ (radius, target)`. No residual is new, the solver learns nothing, and the DOF count is the three rows' rank. Selectors that must be blamed on the student's line (`distinct` ends, `between` for a bounded noun) are emitted by the parser, because `derive` attributes a failing selector only to a parsed `selector` fact.

**The touch reader.** `peelTouchList` takes the plural list off the end of the sentence. `peelMods` takes the singular «בנקודה A». `tangentTargets` keeps `ordered`, the axes and lines in the student's order, so the touch points pair with the targets in order. `touchFacts` builds the declares, the selectors and one `tangent-of` per target. It is reached from the circle-first order (`circleSubjectFacts`) and the line-first order (`parseCircleAt`), so the two orders cannot drift.

**The tangent object.** `tangent-line-at { at, circle? }` → `line-at { id: tangentLineId(at), through: at, dir: radius, perp: true }` plus `on-curve(at, circle)`. `isTangentObject` (a `line-at` on a radius direction, perpendicular) is the one predicate behind contextual «המשיק» (`on-kind` kind `tangent`) and `tangent-eq`'s resolution. `readTangentNoun` is the one phrase reader for the sentence, the crossing operand (`incidenceOn`; the building facts lead the crossing's) and the equation (`parseTangentObject`).

**Tangency to a determined circle.** `tangent-curve { circle, line }` and `tangent-line` share `lineTangencyRows(centre, radius, line, pair)`. One reads the centre and radius from the resolved circle, the other from the centre point and radius symbol. `tangent-of` picks by host: `circle-at` → `tangent-axis`/`tangent-line`, anything else → `tangent-curve` (axes refused by name).

**Chords.** A chord is lowered only to existing facts: `declare` both ends, `on-curve` or `on-kind` on the circle, and the segment. Two chords that meet use the bounded crossing of the two segments. Equal chords use `length-eq`. `parseChord` runs with `parseTangentObject` before `parseCircleAt`, whose verb split would otherwise read «משוואת המשיק» as a subject before the verb.

## The contextual circle: one binding for every sentence about «המעגל» ([ADR-AG-196](06c-decisions-analytic.md#adr-ag-196), #1633, #1619)

**One fact, one resolver.** A sentence about THE circle lowers to `the-circle { create, about, match? }`. `create` is the sentence's own creation (the curve, the computed circle, the circle on a centre, with their incidences); `about` is the statement about an existing circle, with `CIRCLE_SENTINEL` where the circle's id goes. M1's `theCircle(c, match)` decides: `match.centre` (a centre-described circle, also «מעגל M שמשוואתו …») → `circleByName`; `match.eq` → `resolveCurveByEq`; no match → the figure's circles (0 create, 1 bind, ≥2 `ambiguous-shape`). The bound branch substitutes the id into `about` and applies it with `applyAll`, so its effect and its refusals are the spelled-out statements' own.

**The equation about a circle.** `circle-eq { circleId, eq }` reads the stated circle at the probes (`resolveCurve`, constant centre and radius required). An equation `curve` host compares by `resolveCurveByEq`. A `circle-at` host lowers to `point(centre, cx, cy)` — substitution for a free centre (#1046's anchoring), a constraint otherwise, pre-checked against a centre already at constant coordinates — and `radius-of(circleId, r)`, the substitution seam that also judges a stated radius. Nothing is solved that was not before.

**Pre-M1 passes.** `factsWithin(f)` yields a `the-circle`'s creation, for `derive`'s line-of-object map (vacancies of a created circle are blamed on its line) and `submit`'s restated-centre set. `nameCanonicalCentres` predicts statically whether a `the-circle` will create (no circle before it, or no same-equation curve before it) and puts the offered O inside that creation.

**The touch.** `tangent-of { at }` is the only touch fact. `applyTouchAt`'s first branch is the incircle's own side: the `side-touch` derived point, written in place of a point the same sentence just declared (no constraint on it yet), else as `derived-at`. Everything else is B3's three statements.

## Only valid configurations are evidence ([ADR-AG-197](06c-decisions-analytic.md#adr-ag-197), #1642, #1638, #1635, #1634, #1539)

Four seams, one rule: a configuration the givens contradict, or one the search failed to vary, is never read as knowledge.

**Configuration choice — `evaluate`.** Discrete freedom is still resolved before the solve, but the seed's resolution is a preference: `evaluateTryingChoices` evaluates the seed's `choice` options first and, when that figure is not admitted, the options at `seed + 1 … seed + n − 1` at the SAME samples, returning the first admitted figure (else the seed's own). `Figure.choiceSeed` records which, and `choiceSeedOf(c, seed)` is how `locus.ts` resolves the same options. `cycledPairs` treats the two ordinals of a pair named in one sentence (`crossing-nth { both }`) as one more discrete choice — bit k of the seed swaps the k-th pair; configuration 0 is the stated order — and the figure reports failing selectors as the stated objects so `derive`'s blame map still matches. Each uncached option counts in `evaluateStats.uncached`.

**The solve's stage two — `resampledInside`.** After stage two accepts a converged solution, if a parameter moved from its sample and `figureDofOf > 0`, the moved parameters are pushed past the stop point (`at + (at − sample)·(0.25 + 1.5u)`, two seed-drawn tries), the vertices re-solved with the parameters fixed (`carrierSystem(…, { params: 'fixed' })`), and the result kept only if it converges, stays admissible (domains, signs) and the selectors hold. Otherwise the descent's answer stands.

**Pool admission — the gates.** `admittedToPool(f)` = no `unsatisfied`, `selectorsOk`, no `hardRingFaults` (the trapezoid warning excepted). `judge`, `knownOptions` and `holdsInEveryConfiguration` read `admittedOf(c, seeds)`; `drawableAt` itself is unchanged, so the canvas, `derive`'s reporting and «הציגו תצורה אחרת» see what they saw. `starved(figs)` — freedom left and fewer than `MIN_WITNESSES` (2) different pictures — makes an invariant value `{ known: false, starved }` (pending on a partial pool), and a `knownOptions` member with fewer witnesses than that makes the answer "not a set". "Different picture" is `sameConfiguration`: `signatureParts` (points, curves with lines normalised, used non-direction parameters) compared within `SAME_VALUE_EPS`, relative. `figureSignature` prints the same parts, zero spelled once (`zeroFree`); `distinctConfigSeeds` and `anotherConfiguration` compare with `sameConfiguration`. The deferred pool's synchronous floor is `PENDING_FLOOR = 3` seeds.

**Reporting — `derive`.** A figure whose selectors fail after `drawableAt`'s search (its window, every live option per seed) is refused on the failing selectors' lines at any freedom, unless a given already fails in that figure (then the unsatisfied arm blames the line that completed the contradiction). A chord carries `distinct` over its ends and the chord-pair sentence over all its letters (`parseChord`), so the selector-steered solve separates them and this arm reports the case where nothing can.

### Not here
- Seeding a DERIVED point's region (the incircle centre's quadrant) through its parents — the remaining invalid seeds of #1642's figure are walked past, not repaired.
- A per-object exact enumeration of roots; the pool stays sampled (ADR-AG-180).

## What a sentence draws, and whose extent it is ([ADR-AG-198](06c-decisions-analytic.md#adr-ag-198), #1639, #1640, #1636, #1641, #1643)

**The piece a sentence names.** `pieceFacts(noun, a, b)` (parser) is the one declaration: the line noun → `line-2pt { a, b }`, any other noun or none → `segment { …, ref: true }`. It is emitted after the sentence's own facts by the touch readers (`TangentTargets.pieces`, one entry per two-point target with its noun), the non-defining diameter, the relation handler (each `points` operand, its own noun), `sideClauses` (side on an axis; «הישרים»/«הישר» carried into the relation), and the converse incidence. `ref` makes M1's segment case treat the ends as references (no `free` minting), so a sentence that refers to absent points still fails on them, deferral included. M1: a `segment` over an existing polygon side is `known`; `line-2pt` checks its ends exist, then — an existing `line-AB`/`line-BA` curve is promoted to `stated` or known, an existing `line-at` is known, a drawn piece over the pair is known (ruling (a)), otherwise the `line-at { through: a, dir: points a→b, name: 'AB' }`. The `curve` case replaces a drawn `line-at` whose id is the same pair's line id, in its position in `objects` (declaration order is kept).

**The extent is the statement's.** Two decisions moved to M1, against the construction BEFORE the statement: the crossing's bounded promotion (`on-line-2pt` with `crossing`, over `drawnPieceOver`) — removed from `evaluate`, so the constraints arrive already bounded — and the bare pair's `extent-of { id, a, b }`, which becomes the `between` selector when a piece is drawn over a–b, and nothing otherwise. The parser keeps a bare pair bare (`lineObject` no longer defaults its noun to «הישר»; `pairText`).

**The frame.** `orthography`: `stripFormatControls` (shell/bidi) first, then a leading bullet, then the maqaf/NBSP folds, then «ה- x» → «ה-x». `NAME_LIST` admits comma lists with an optional final «ו-»; `distributeClauses`' location reading takes the verb OR a predicate opening with «על». `centreClauses` accepts the copula before the centre letter, in both languages.

**The created circle.** `tangent-of` with no circle in the figure (and a touch point, or no axis target) applies `touchedCircleFacts` — `param θ_circle-touched.r > 0` and the stated equation circle `circle-touched` over `θ_circle-touched.{a,b,r}` (`toolSymbol`, carriers.ts; hidden from the parameter rows and the figure signature by the existing `θ_` test) — then the tangency with `circleId`. `the-circle`'s `match` gains `{ inscribed: ring }` (`theCircle`: bind the one circle `statedTangentToSide` finds for every side — the touch lowering's radius-perpendicular mark or a touch-free `tangent-curve` over the pair; else create); bound to `circle-touched`, the incircle sentence redefines it as the computed `incircle` under the same id and drops its tool parameter, then applies `about` (`centre-of { circleId }` names the centre).

**The created circle starts fitted** ([ADR-AG-202](06c-decisions-analytic.md#adr-ag-202), #1647). `evaluateUncached` calls `fitCreatedShapes` before the solve when the construction has shape symbols (`θ_<object>.<part>`, `shapedObjectOf`): the construction without the shape, its touch points and everything defined through them is evaluated (memoised per construction, seed and choice); the circle and its touch points are fitted to that figure over the constraints that mention them (touch points on their bounded pieces, the circle started through them); the fit seeds the solve. When that prior figure admits no configuration at the seed, the joint search is skipped and the post-hoc check judges the prior's effort with the fitted circle.

**The refusal.** `ShapeRow.notCyclic` (registry) → `cyclicFacts` → `inscribed-contradicts-noun { shape, forced }` → `errInscribedContradictsNoun` with `shapeHe/forcedHe` and `shapeEn/forcedEn` (English by reverse `EN_SHAPE` lookup in `errorText`).

**Into the bidi section (the helper table and the paragraph after it), add a row and a paragraph:**

| helper | protects | emits | direction |
| --- | --- | --- | --- |
| `panelRowText` (`app/panelRows.ts`) | every Hebrew phrase in a composed data-panel row | FSI … PDI per phrase (via `isolateRtlName`) | every `ValueRow`, the curve-details line |

**One panel-row composer** ([ADR-AG-199](06c-decisions-analytic.md#adr-ag-199), #1644). The data panel's sections are laid out `ltr`, and a row the tree composes may contain a Hebrew word: the #1036 option set's «או», or «לא בשימוש» on an unused parameter. A number after a right-to-left word takes that word's direction, so without an isolate `A = [(3/5, 4/5)] או (4, -2)` rendered as `… (2- ,4) או`. Every panel row therefore goes through `panelRowText`, which adds the `x_{B}` braces and wraps each Hebrew phrase in `isolateRtlName`. Two rules: a row with no Hebrew letter comes back unchanged, and a row that already carries an isolate (`namedRow`'s equations row, a `t()` string) is left alone, never nested. The data strings stay plain. `pointText` and `scalarText` return no isolates, because the ask lane isolates its own answer row and the #1433 locks read the text.

The canvas needs no counterpart. Every `<text>` inherits `direction: ltr` from the `<svg>` (#1191). A coordinate label is printed by `fmtAnalytic` (a number) or `exprText` (a stated expression), and both emit the ASCII «-», so a U+2212 typed by the student never reaches the label.

**Into the save/load section (or after "The panel's knowledge has one home"), add:**

### A load restores every field the save writes ([ADR-AG-199](06c-decisions-analytic.md#adr-ag-199), #1632)

`serialize()` writes the envelope `app · version · lines · seed · name? · spokenFor? · disabled? · seedNames?`. `loadAnalyticSession` is the one entry for file, link and restored session (#1238), and it passes every one of those fields to `restore`. `restore` sanitises what a hand-edited file could break: `disabled` and `spokenFor` keep only integer indexes of a line in the file (and `spokenFor` only non-empty strings), and `seedNames` keeps only letter → letter pairs. The lock is a whole-envelope round trip with every optional field set, and its key list is pinned, so a field added to `serialize` has to join the fixture and is then checked on the way back in. `spokenFor` was the field that slipped: it was saved since #1297 and never loaded.

---

Add a row to the helper table:

| helper | protects | emits | direction |
| --- | --- | --- | --- |
| `slopeRowText` (`app/panelRows.ts`) | the «שיפועים» row: its `t()` parts that already carry isolates | FSI … PDI around each WHOLE Hebrew part | the slope rows |

**A part that already carries isolates is wrapped whole, never re-scanned** (#1646). The rule "never nest" in `panelRowText` is about re-isolating runs INSIDE a string that has isolates: an LRI opened across an existing PDI is closed by it. Wrapping a complete, balanced `t()` string in one FSI … PDI is safe, and it is the only way such a part becomes a single island in an LTR row. So a row built from `t()` parts gets a composer that wraps each part (`slopeRowText`), not a run scanner.

## A role noun is a claim; a length draws what it names ([ADR-AG-200](06c-decisions-analytic.md#adr-ag-200), #1651, #1652, #1620 item 2)

**One vocabulary.** `STRAIGHT_NOUNS` (parser) is the only list of nouns that name a straight piece — `{ he, en[], bounded, claim? }`. `HE_LINE`, `HE_LINE_PLAIN` (no claim: the anonymous «הישר y=…»), `PIECE_NOUN` (He + En, article optional), `BOUNDED_NOUN` and the side-as-subject nouns are derived from it; `readPiece(text)` reads «<noun>? XY» and `nounRow` resolves a noun by the whole word. A rule that re-spells the nouns inline is the defect this section exists to prevent.

**One claim lowering.** `claimFacts(row, a, b, src)` → the facts the role's canonical sentence carries, minus its introductions: chord → `on-kind circle` ×2 + `distinct`; diameter → `diameter-of { define: false }`; tangent → `tangent-of` over the pair; radius / leg / base / hypotenuse → `role-of { role, a, b }`; median / altitude → `null` (no lowering). `[]` for a noun with no claim.

**State it or do not read it.** `direction(phrase, sink?)` accepts a claiming noun only with a `ClaimSink` and pushes the claim into it (`stateClaim`); without one, or with a `null` lowering, the phrase is not a direction. Callers that pass a sink — relation, slope, slope sign, line through a point, incidence (`incidenceOn`), crossing — emit `sink.out` after their own facts and pieces. The equation rule appends `claimFacts` to the curve's facts; the side-as-subject and converse rules keep the role noun in their canonical sentence (`eqNounOf`, `heNoun`); `parseShape` declares «<role> XY» (segment or line by `bounded`) and its claim; `lengthRoles` strips «(אורך) <bounded role> XY (של <shape>)» to the pair inside a length and states the claim.

**M1: `applyRoleOf`.** `role-of` is resolved against the construction as it stands: radius → the one circle, the non-centre end `on-curve` (neither end the centre: `conflicting-restatement`; unnamed centre: `out-of-scope`); leg / base → the polygons holding a–b as a side where the role has content (a one-parallel-pair quadrilateral: a stated `parallel` of the right pair, pinning or displacing the assumed pair through the `constraint` case; a triangle: leg → `choice` of apex, isosceles base → the apex `length-eq`); hypotenuse → `rightAngleAt(third)`. The other pair already stated parallel → `conflicting-restatement`; no polygon → `ambiguous-shape { host: polygon, found: 0 }` (a base with none adds nothing).

**A length draws the pairs it names.** `readLength(src, named?)` (engine/lengths.ts) is `parseLengthExpr`'s body with one addition: the `LENGTH_TOKEN` stage adds the index of each term it reaches to `named`. `namedLengthPairs(src)` returns those pairs; a distance spelling never reaches that stage (the distance frames, the symbolic notations rewritten into them, and `DISTANCE_NOUN` for «המרחק AB» — run before `LENGTH_NOUN`). `lengthPieces(sides, src)` (parser) draws each named pair once through `pieceFacts('segment', …)`; called by the length rule, `parseRatioColon` and the `radius-length` reading.

## The canvas's click menus: a segment's display, a centre's letter ([ADR-AG-201](06c-decisions-analytic.md#adr-ag-201), #1653, #1598)

**A segment.** The store keeps `segStyle` (`{hidden?, dashed?}` per endpoint pair, `render/scene.ts` `segKey`). It is in the undo slice, the save envelope (an optional key: `serialize` writes it when non-empty, and `restore` cleans it through `shell`'s `cleanSegDisplay`) and the session-persist trigger. `relabelSession` re-keys it in a rename's or swap's single commit. `buildScene` takes it as `knows.segStyle` and gives each `SceneSegment` its `key` and `ink` (`shell`'s `segInk`). `Figure` draws `solid`/`dashed` ink, or for `ghost` a faint dashed line (`data-noexport`) only while picks are wired. The hit layer is unchanged, so a hidden segment is still clickable. App opens the shared `SegmentMenu` for a segment pick, with `measurablesOf`'s entries as its children.

**A centre.** `centresOf` marks each centre offer with `centreOf` (the circle id), and the scene carries it onto the crossing. `Figure`'s `onCentre(offerId, screen)` fires for those instead of `onCrossing`. App opens the shared `LetterPopover` with `app/centreName.ts` `centrePopoverOps(offerId, state, actions, d)`:
- `decideCentreName` refuses a bad letter, and refuses a taken letter WITH its holder (`nameInUse`, `letterHolder` from `app/rename.ts`). Otherwise it composes `centreSentenceOf(figure, offerId, letter)`, which is `centresOf` with that letter, so the form is the one the grammar reads back. `decideSubmit` then decides it, and `commitRecord` records it.
- `decideCentreSwap` records the centre under `centreLabelOf` (the automatic letter, which is also the popover's `label`), runs `decideSwap(auto, taken)` on that session, and commits the result through `applySwap` as one step.


## A circle named by its ring; a diameter on any circle; the panel prints no tool symbol ([ADR-AG-203](06c-decisions-analytic.md#adr-ag-203), #1659, #1665, #1663)

**The described-circle name.** `engine/names.ts` owns a third kind of circle name beside the centre letter and the numeral: `⊙<ring>` (the circle through every vertex) and `○<ring>` (the circle inscribed in the ring) — `describedCircleName` / `readDescribedCircle` / `DESCRIBED_CIRCLE_ALT`, spelled the way `openCurveText` already prints computed circles. The frame (`frameAnalytic.ts` `describedCircles`, applied by `readLine` after `unwrap`) folds «מעגל החוסם (את) (ה<shape>) ABC» → «מעגל ⊙ABC», «מעגל החסום ב(ה)<shape> ABC» → «מעגל ○ABC» (the shape noun from the registry, English "circumcircle of / circle circumscribing / incircle of / circle inscribed in"), and «<prep> המעגל שמרכזו M» → «<prep> המעגל M» after «על / של / בתוך / ל- / רדיוס» only. A line that is nothing but the description is not folded — it is the inscription statement. The parser's reference slots read one atom, `CIRCLE_NAME` (letter | numeral | described), so every circle sentence reaches every naming; `centreOfCircle` lowers a described tail to `centre-of { circle }`, and `chordFacts` sends a described name through `on-kind { circle }` rather than minting an id. M1's `circleByName` decodes a described name with `describedCircle`: `⊙` = the circle every vertex is ON (a defining point of a non-incircle `circle-thru`, or an `on-curve` incidence), `○` = the `incircle` `circle-thru` of that ring (`ringId`) or the circle stated tangent to every side (`statedTangentToSide`). `centresOf` offers a computed circle among several with the described sentence.

**A diameter on any circle.** `diameter-of`'s M1 case keeps its exact lowerings (a centre point: the midpoint; a circle on this diameter: known; a three-point circle through both ends: Thales) and lowers every other circle to both ends `on-curve`, `distinct`, and `relation parallel (points a b) (radius host a)` — the line AB runs along the radius at A, i.e. through the resolved circle's centre.

**The open curve row.** `openCurveText(construction, id)` moved from `App.tsx` to `app/panelRows.ts`; an expression that reads a `θ_` symbol (`readsToolSymbol`, the `isDirectionSymbol` test the parameter rows already use) prints `—`.

## A role sentence introduces its ends ([ADR-AG-204](06c-decisions-analytic.md#adr-ag-204), #1669)

**One place.** `parseClause` wraps the grammar's rules (`parseClauseRules`) and passes every clause's facts through `withRoleIntroductions`, so every direct, framed and split reading gets the same treatment. It reads the clause's role facts: a `diameter-of`'s two ends, a radius `role-of`'s two ends and an `on-kind` circle's subject. Any end the clause does not already define (`POINT_MAKERS`) or declare gets a `declare` placed FIRST. The claim facts a `ClaimSink` emits come after the rule's own facts, and those facts reference the ends. An existing point absorbs its `declare`, so placement is never disturbed. `RADIUS_PREDICATE` routes «OA רדיוס» to the radius role in `parseShape`, so `applyRoleOf` decides which end is the centre. It refuses an absent centre, and on an unnamed centre it names it with the new end (#1670, below).

**The created circle.** A chord's `on-kind` carries `create` (set by `claimFacts` and the contextual `chordFacts`). With no circle, M1 applies `touchedCircleFacts`, the ADR-AG-198 creation (an equation circle over the tool's free symbols, centre unnamed), and puts the end on it. A diameter with no circle already states the `circle-thru` diameter circle. A `circle-eq` bound to the created circle replaces its expression under the same id and drops its free symbols, the way the incircle sentence redefines it. This is how a later «משוואת המעגל היא …» fixes the circle that the chords or a tangency created.

## New letters and circles a reference names ([ADR-AG-210](06c-decisions-analytic.md#adr-ag-210), #1670, #1686)

**The radius names the centre.** This is `applyRoleOf`'s radius arm, for a circle whose centre has no point (`centreIdOf` is null).
- The end NOT already on the circle (`onCircleAlready`: a defining point, or an `on-curve` to it) becomes the centre the circle already has (`centreRuleOf`: the diameter's midpoint, an equation circle's `circle-centre`).
- If that end was just introduced (`nameCentreAs`: free, unconstrained, nothing built on it but a drawn segment), it is replaced in place.
- If it already stands (minted free by «BO = 5»), it is placed: the derivation restated about an existing point lowers to `derived-at`, so no second point is created. «O מרכז המעגל» takes the same path through `centre-of`.
- The other end goes on the circle.
- Refused as `out-of-scope`, as before: both ends off the circle, neither end off it, or a centre with no closed form.

**A circle the reference names.**
- `on-kind` circle with no circle in the figure always creates one (`touchedCircleFacts`). The `create` flag ADR-AG-204 added for chords is retired: every incidence creates, as 2-D's does.
- A NAMED circle that the name chain (`circleByName`) cannot find is stated by `statingNamedCircle`, using exactly «מעגל M»'s facts: `declare`, `param radiusSymbol(M)` > 0, `circle-at-M`. The fact is then re-applied against it.
- `statingNamedCircle` is called where a sentence REFERS to a named circle: `on-kind`, `diameter-of`, `tangent-of`, `tangent-line-at`, `circle-region`.
- A numeral, a ring description, or a name already holding a non-point is not stated; the caller's refusal stands.
- `chordFacts` now emits `on-kind { circle }` for a letter too. It used to write `circle-at-<letter>` directly, which skipped the name chain.

**New letters, last.** `foldPass` runs the in-order pass and the deferral fixpoint first, so every figure that built before builds identically. Then it goes line by line, in list order. A line mints when every fact of it still failing is an `unknown-reference` to a point, and each such fact is one of:
- a minting form (`mintedByReference`): a two-pair `relation`, a plain `length-eq` with no coefficient, an `angle`, an `on-line-2pt`, a midpoint `derived`, or a `tangent-of` pair;
- a companion: `segment`, `line-2pt`, `extent-of`, `selector`, `declare`, or a `length-eq` riding beside a minting fact.

The missing points are added as `free` objects and the line's facts are re-applied; then the fixpoint runs again. This applies beside an unnamed centre too (#1686). A `perpendicular` (the cevian's own half) is not a minting form, so «AD גובה לצלע BC» stays refused. The cevian's triangle form states «משולש ABC» first (`clauseFacts`).
