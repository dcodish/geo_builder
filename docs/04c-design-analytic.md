# 04c — Design: the analytic Builder (`src-analytic/`)

_How the analytic product is built. Registered in [`DOCS.json`](../DOCS.json) as the `analytic` product's
design doc ([ADR-W-041](06w-decisions-workspace.md#adr-w-041))._

**What it must promise** is [02c](02c-requirements-analytic.md) — the V1 pedagogy and requirements
captured live from the operator. Decisions are [06c](06c-decisions-analytic.md); the plan of record is
[docs/19](19-analytic-geometry-tool.md).

> **Status: V0 in build, and deliberately NOT DEPLOYED**
> ([ADR-AG-007](06c-decisions-analytic.md)). Its `products.json` entry carries `enabled: false` plus
> `devOnly: true`, so no shipped builder can render a chip pointing at a 404 while the app is still
> reachable in its own dev switcher. This document describes a tree that is smaller and younger than its
> three siblings, and says so rather than describing an aspiration.

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

## The model — objects, and the register that makes them free

The primitive is the **geometric object** ([ADR-AG-009](06c-decisions-analytic.md#adr-ag-009),
ratifying [02c](02c-requirements-analytic.md) R1): a `Construction` is `{ params, objects }`, and
`GeoObject` is a discriminated union — `point` and `curve` are the two *stated* members V0 built, and
the shape nouns and derived points of [02c §5](02c-requirements-analytic.md) join them as further
members rather than as a parallel model. An equation, a shape noun and a coordinate pair are three
ways to *state* an object; the exact conic fit is how an equation identifies **which** object it names.

The object kinds are `point` and `curve` (stated), `derived` (a midpoint, a centroid, an incentre —
a pure function of parents already stated), and `segment` / `polygon` (drawn from their endpoints).

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

**The refusal codes are OWNED, one per class**, each rendered by a locale string that names the
student's own statement: `reserved-coordinate`, `bad-arity`, `repeated-vertex` alongside the existing
`bad-equation` and `out-of-scope`. A code per class rather than a message per site is what keeps the
same wrong input answered the same way whichever rule caught it.

**A clash carries its collision.** `ApplyError.existing` is a stable TOKEN (`derived:centroid`,
`curve:ellipse`) minted by `existingKindOf` in the engine and rendered into the student's language in
`App.tsx`. The engine stays language-free and the message can still say *what* the name already holds
— the split that lets a refusal name a construct without the engine knowing any Hebrew.

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

**`Curve.kind` is therefore an EXPECTATION, not an answer**, and optional. `classify` fits six
coefficients and names the family; the expectation only lets a refusal be specific ("you wrote «אליפסה»
and this is a hyperbola" — R7). Two consequences follow, and the second is the subtle one:

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

## Relations, and the direction resolver ([ADR-AG-024](06c-decisions-analytic.md#adr-ag-024))

Four things in this grammar have a direction:

| operand | written | resolves to |
| --- | --- | --- |
| a segment / a polygon side | `DE`, `הצלע AB` | `B − A`, from the placed points |
| a named line | `ℓ1`, `הישר l1` | `(−b, a)` from its resolved `ax + by + c = 0` |
| an axis | `ציר ה-x` | a fixed unit vector — needs no figure at all |

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
- «שטח הדלתון הוא 24» — the ring is the one shape answering to that noun.

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

## The ask lane ([ADR-AG-044](06c-decisions-analytic.md#adr-ag-044))

Two surfaces, one grammar. The main input CONSTRUCTS; the data panel's own box ASKS, and an ask is
evaluated against the current derivation and discarded — it never becomes a fact.

| the student types | into the input | into the ask lane |
| --- | --- | --- |
| `שטח ABC` | (with a value) a GIVEN that shapes the figure | the area, if the givens fix it |
| `AB` | the segment, drawn | its length |
| `משוואת הישר ℓ1` | (with an equation) the line | its equation |

That table is the design: **a thing is askable because it was sayable.** `app/ask.ts` runs the
question through `parseLengthExpr` — the same measure grammar the constraint rules use — so a
vocabulary added on one surface arrives on the other with nothing to wire.

The answer passes `isKnowledge`, exactly as an inventory row does, and an unanswerable question is
worded from the FIGURE's freedom: *not fixed yet* when it still has some, *cannot be computed* when
it does not, and *I did not understand* when the question named nothing the figure has.

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
- **Not deployed** (above). The readmission path is mechanical: flip `enabled` to `true` and drop
  `devOnly` in [`products.json`](../products.json), and add its RUNBOOK row.


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
