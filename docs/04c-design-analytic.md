# 04c — Design: the analytic Builder (`src-analytic/`)

_How the analytic product is built. Registered in [`DOCS.json`](../DOCS.json) as the `analytic` product's
design doc ([ADR-W-041](06w-decisions-workspace.md#adr-w-041))._ What it must promise is
[02c](02c-requirements-analytic.md); decisions are [06c](06c-decisions-analytic.md); 02c and this doc are the
contract, and [docs/19](archive/19-analytic-geometry-tool.md) is the finished build plan. Deployed at
`/analytic-builder/` (`products.json` `enabled: true`; [ADR-AG-007](06c-decisions-analytic.md) hold lifted).

**How this document is organised.** Chapters follow the pipeline a line travels: parse → the sentence frame → fold
and apply → what each construct lowers to → solve → evaluate and the configuration pool → the knowledge gates → text,
scene and marks → the app (submit, ask, locus) → persistence. Each section is the current mechanism and its ADRs; the
history is in [06c](06c-decisions-analytic.md). Headings keep their wording so links resolve. An *Identifiers:* line
lists names the section's code uses that its prose does not mention.

*Identifiers:* `prod/2026-09-16`

## Overview

### What is different about this product

The siblings reproduce a printed figure; this one **produces the figure the exam withheld**, and **text is the only
source of givens** ([02c](02c-requirements-analytic.md) P2/P3).

### Shape

| Layer | What it is |
|---|---|
| `engine/` | `expr` (the numeric expression layer), `conic`, `curves`, `apply`, `carriers` (the DOF contract), `evaluate`, `derive`, `types` |
| `parser/` | `parseAnalytic.ts` + `catalogAnalytic.ts` |
| `render/` | `scene.ts` (pure) + `Figure.tsx` |
| `store/` | Zustand, the ordered fact list as source of truth |

### The three cores

**`expr.ts` — the numeric expression layer**: *"the smallest thing that lets a coefficient carry a PARAMETER"*
(`y = mx + 8`), with no symbolic algebra. **`conic.ts` — equation → curve, plus the canonicity gate.** **`curves.ts` —
curve geometry**: resolution, membership residuals and the renderer's polylines, pure.

### The model — objects, and the register that makes them free

The primitive is the **geometric object** ([ADR-AG-009](06c-decisions-analytic.md#adr-ag-009)): a `Construction` is
`{ params, objects }`, `GeoObject` a union of `point`, `curve`, `derived`, `segment` / `polygon`. `engine/carriers.ts`
is the DOF contract: the free-parameter register (`paramRegister`) is derived from the objects' own expressions,
never from F11 declarations (#1014); `carrierOf` / `symbolDeps` / `objectDeps` are exhaustive switches over
`GeoObject` (2-D's ADR-043, copied). Every register symbol is in the solve vector
([ADR-AG-144](06c-decisions-analytic.md#adr-ag-144)). **There is deliberately no topological sort**: `apply` refuses a
reference to a missing object, so declaration order is evaluation order (`depsPrecedeDependents`, #1028).

**A letter's role can give it a domain** ([ADR-AG-323](06c-decisions-analytic.md#adr-ag-323), #2419): `sizeLetters(c)`
reads which letters stand for a size, numerically and without a CAS — `linear` (a circle-at radius `m·t`, m > 0, or a
length / distance / perimeter / area constraint valued by `m·t`, the `impliedRange` three-evaluation test) and `even`
(an equation circle whose radius is `m·|t|` at t ∈ {1, 2, −1.5} with the centre fixed). `paramRegister` intersects the
stated domain with (0, ∞) **in place** (`sizeDomain`), so the register's order, and with it every sampler salt, is
unchanged; an `even` letter whose stated domain has no positive value keeps it. The domain is derived, never stored, so
roles only grow as facts are added. The apply boundary asks one question of the construction after every statement,
beside `radiusLetterClash`: `sizeContradiction` (a `linear` letter whose stated domain has no positive value) refuses
the statement `out-of-domain`, and a declaration the role already implies is `known`. `emptyDomain` is the one
emptiness test, shared with `admitStated`.

**The sampler works in the figure's units** ([ADR-AG-324](06c-decisions-analytic.md#adr-ag-324), #2426): `statedScale`
(`pinRoots.ts`, the largest stated literal, ≥ 1; `pinReach` is 64× it) sets the half-bounded / unbounded magnitude of
`sampleParam` to [1, max(4, 1.5·S)) and the free-vertex seeding box to at least 1.5·S a side — only for what
`reachedByGivens` (`carriers.ts`: every symbol and object a constraint touches, through `inputsOf`) leaves
unreached; a solved parameter or vertex keeps the old start. Configuration 0 never widens: `evaluate(c, seed, reach,
wide)` carries the flag through the choice walk, the created-shape fit, the restarts and `drawableAt`'s walk from 0.
`residualScale` keeps the ruled span.

**The freedom count has one rank** ([ADR-AG-309](06c-decisions-analytic.md#adr-ag-309), #2383): `solve.ts`
`jacobianRank` — the central-difference Jacobian, rows equilibrated to unit length, a one-sided Jacobi SVD, a singular
value counted above `RANK_REL_TOL · σ_max` (`10 · SOLVE_TOL`, the residue a dependent row keeps at an accepted solve).
`freeRank` (the DOF cue, the entailment gate, `freedomOf`), the locus tracer's `nullDirection` and
`tangentFreedomOf`'s equation null space all read it; a given implied by the others only through the construction is
dependent at every seed.

*Identifiers:* `y²=2ax` · `NaN` · `jacobianRank` · `RANK_REL_TOL`

### Boundaries

`src-analytic/` never imports `src/`, `src3d/` or `src-complex/`; its only edge is `shell/`, and it reaches `server/`
over HTTP ([`BOUNDARIES.json`](../BOUNDARIES.json)).

### Born after the chassis

It mounts `shell/` from its first line (suite conformance is half its V0 gate, [ADR-AG-004](06c-decisions-analytic.md)),
and `shell/bidi` post-processes every message so `y = -2x + 8` cannot reverse in a Hebrew refusal.

### Known gaps

Ratified: R1/R2/R5 ([ADR-AG-009](06c-decisions-analytic.md#adr-ag-009)) and the teacher lane
([ADR-AG-010](06c-decisions-analytic.md#adr-ag-010)). The registry's `enabled`/`devOnly` pair holds a builder back.

*Identifiers:* `02c`

## Parse

### The parser's rule contract ([ADR-AG-017](06c-decisions-analytic.md#adr-ag-017))

A rule in `parseAnalytic.ts` answers `made(facts)`, `refuse(code, line)` (recognised and wrong) or `null` (not my
sentence), so `not-handled` — the LLM escalation seam — means only "I did not understand".
The chain in `parseLine` reads `parseConstraint(line) ?? parseDerived(line) ?? parseShape(line)
?? parsePoints(line)` and returns whatever it gets — `??` falls through on `null` only.

**A noun is spelled once per language, glyphs included** ([ADR-AG-142](06c-decisions-analytic.md#adr-ag-142)):
`ANGLE_NOUN_HE` / `ANGLE_NOUN_EN` carry the word and both glyphs (`∠`, `∡`), 2-D's `ANGLE_WORD` shape.
A glyph-only sibling pattern is how one spelling drifts in silence (`∡` parsed while `∠` did not).
`ANGLE_STEM_HE` (`זו?וי`, `engine/shapes.ts`) is composed by every Hebrew angle pattern, and `normalizeShapeNoun`
folds noun variants ([ADR-AG-155](06c-decisions-analytic.md#adr-ag-155), ADR-405).

**An equation operand is read only where a sink asks for it** ([ADR-AG-328](06c-decisions-analytic.md#adr-ag-328)).
`direction()` reads «(ה)ישר <eq>» / "the line <eq>" / a bare equation of a LINE (`lineEquationOperand`: the
reserved-symbol guard, and `isLinearInPlane`, a numeric first-degree check at probe values) only for a caller that
passes `EQ_LINES` (an `EqSink`, the `ClaimSink` pattern): the relation handler (both operands),
`parseThroughLine` and the slope-value rule (ADR-AG-328 Am. 1). The slope sign, position words and the foot pass none. A distance given lifts each
«ישר <eq>» into a token before `LENGTH_EQ` splits on «=» (`liftDistanceLines`); `parseLengthExpr(src, lines)` reads
a token only as the line of a point-to-line frame, and a caller with no `lines` (the ask lane) leaves it unread.

**Refusal codes are owned, one per class** (`reserved-coordinate`, `bad-arity`, `repeated-vertex`, `bad-equation`,
`out-of-scope`). **A clash carries its collision** as a language-free token, `ApplyError.existing`
(`derived:centroid`, `curve:ellipse`, from `existingKindOf`). **A rule owns only what it parsed**
([ADR-AG-139](06c-decisions-analytic.md#adr-ag-139)): `claimable(tail)` declines a tail with Hebrew, a connective dash
or an unread name, at every claiming site including `matchCurve` (ADR-AG-114); the seam keys on
`reachesFallback(verdict)` (`app/submit.ts`).

**A value never mentions the plane** ([ADR-AG-163](06c-decisions-analytic.md#adr-ag-163)): every value slot reads
through `mentionsPlane` (`carriers.ts`), and `equationExpr` refuses a capital as a symbol. A measure value naming a
point DECLINES ([ADR-AG-238](06c-decisions-analytic.md#adr-ag-238): `mentionsPointName`, `measureValue`,
`POINT_TOKEN`), and an indexed name declines on `INDEXED_TOKEN` ([ADR-AG-244](06c-decisions-analytic.md#adr-ag-244)).
The radius capital `R` is the one exception, in every reader that takes a size or an equation — a length (2-D ADR-034),
`equationExpr`, `roleScalar`, `radiusOfSize` — through one set, `RADIUS_CAPITALS` ([ADR-AG-307](06c-decisions-analytic.md#adr-ag-307));
a radius naming any other capital declines. A point R beside a used symbol R is refused at `applyFact`
(`radiusLetterClash`, `letterReadings`; `radius-letter-taken`, its first reading's line found by `derive`).
**A capital used as a size is refused, owned** ([ADR-AG-325](06c-decisions-analytic.md#adr-ag-325)): `app/capitalSize.ts`,
asked by `decideOnce` and `decideEdit` because both readings need the figure (a capital that is a point of the figure is
left as it was). A `not-handled` line is read again with one lone capital lowercased (`capitalSizeRetry`, 2-D's
lowercase-labels pattern); a parsed line is asked whether it ADDED a capital to the parameter register (`capitalParamOf`,
`paramRegister` before and after the trial fold). R, and S inside the fact that states an area (`AREA_CAPITALS`, ADR-AG-325 Am. 1), are sizes. Either answer is `capital-magnitude`
`{ letter, corrected }`, never `not-handled`, so it never reaches the model.

**A parameter is never a plane coordinate** ([ADR-AG-246](06c-decisions-analytic.md#adr-ag-246)):
A `param` fact (an F11 domain) that names `x` or `y` (`RESERVED_SYMBOLS`) is refused at the apply boundary (`applyStatement`, `engine/apply.ts`) with `coordinate-restriction`, whatever produced it.
The fold then refuses the whole line (ADR-AG-133); drawing part of a curve is #1846.

*Identifiers:* `ANGLE_WORD` · `refuse` · `constantLengthExpr` · `valueExpr` · `readLength` · `unreadable` · `parseParamHe` · `parseParamEn` · `parseInequality`

### A given’s connective, and who gets the sentence ([ADR-AG-127](06c-decisions-analytic.md#adr-ag-127))

**One vocabulary for "is"**: `COPULA_WORDS` is the single source and `HE_IS` derives from it.
Before, one sentence shape had two answers (`LENGTH_EQ` admitted a literal `=` and no words, while `AREA_HE` admitted the words).
The connective is an ALLOWLIST and fails closed (2-D [ADR-524 Am. 1](06-decisions.md#adr-524)); the `lexicon` layer's
sharing is undecided (ADR-W-003), so `shell/__tests__/length-copula-parity.test.ts` runs both trees' patterns. **The
rule that records MORE wins**: the length rule (`parseLengthExpr`) yields to the area rule (`AREA_HE`/`AREA_EN`),
which also declares the triangle; inside `parseConstraint` precedence is a guard, not a reordering.

*Identifiers:* `??` · `return null`

### A letter run is not automatically a product ([ADR-AG-145](06c-decisions-analytic.md#adr-ag-145))

`expr.ts` multiplies by juxtaposition (`2a`, `4√5`, `25k²`, `2ax`).
Its atom grammar has exactly one function, `√`, and `normalizeMath` maps `sqrt` onto it before the tokenizer runs.
*Which letter runs are symbols* is decided in `tokenize` alone, because every value slot reaches `parseExpr`:

| the run | verdict | why |
| --- | --- | --- |
| ≥3 Latin letters, SPACE-DELIMITED | refused — a word | [#1068](https://github.com/dcodish/geo_builder/issues/1068)'s ruled boundary, moved here from `HAS_A_WORD` |
| ≥2 Latin letters immediately before `(` | refused — a function application | `√` is the only function; a space cannot delimit `tan(30)` |
| 1 letter before `(` | kept | `k(x+1)` is a product, and the corpus writes it |
| ≥3 letters NOT space-delimited | kept | `x²+y²-2abc=0` — juxtaposed parameters, ruled legal by #1068 |
| a letter (Latin or Greek) IMMEDIATELY before a digit, `_` or a subscript digit | refused — an indexed name ([ADR-AG-244](06c-decisions-analytic.md#adr-ag-244), #1785) | «S1», «a2», «α1» are ONE name each; juxtaposition read `S·1`, so «S1» and «S2» shared one parameter and asserted a 1 : 2 ratio. Number-then-letter (`2a`) is unchanged |
| an integer, whitespace, then `int/int` («5 1/2») | refused — an ASCII mixed number ([ADR-AG-284](06c-decisions-analytic.md#adr-ag-284), #2222) | ambiguous as written (5.5 or 5·½); `findMixedNumber` is the one detector, and `parseLine` asks it before every rule and the model (`mixed-number`, teaching the decimal, `5+1/2`, `5*1/2`). The glyph «5½» is spelled 5.5 upstream (`orthography`) |
| the private-use range | never a run | `lengths.ts` encodes a length term (`AB`) as one character; it cannot appear in student input |

The noun must be consumed by the rule that claims it: `DISTANCE` spells its English article as `NOUN` does
(`(?:the\s+)?line\s+`), or the remainder becomes free parameters.

*Identifiers:* `tan(30)` · `t·a·n·30` · `arctan` · `ה?מרחק` · `[Dd]istance` · `t·h·e·|AB| = 10`

### The parser's last branch: a bare equation ([ADR-AG-019](06c-decisions-analytic.md#adr-ag-019))

`parseLine` ends with a branch that accepts an equation with no noun (`x-y+2=0`, `y^2=54x`), **absolutely last**,
and accepts only when `symbolsOf(eq)` contains the plane's variables.
Reading the text for an `x` is the `[IVX]` Roman-numeral defect ([ADR-AG-006](06c-decisions-analytic.md#adr-ag-006)) waiting to happen again (`AB = 4√5`, `x_A = 5`).
`CIRCLE_NUMERALS` / `CIRCLE_NUMERAL_RUN` are the circle numeral token ([ADR-AG-118](06c-decisions-analytic.md#adr-ag-118)).

**One numeral table** ([ADR-AG-170 Am. 1 + Am. 2](06c-decisions-analytic.md)): `engine/names.ts` (1–9 ↔ I–IX) gives
`numeralCurveId(kind, n)` (`line-1`, `circle-I`), `numeralKey`, `numeralTwin` and `lineIdOf(name)`; every
`line-`/`circle-`/`parabola-`/`ellipse-` id is built there (`issue-1529-numeral-ids.test.ts`,
[ADR-AG-179](06c-decisions-analytic.md#adr-ag-179)), and `refKindOf` + `statedName` word an id back. `apply.ts` refuses
`numeral-notation`; a host refusal is `ambiguous-shape` + `HostRef` (#1432), worded via `hostKey` and
`app/errorText.ts` (exhaustive over `RefKind`); naming clauses share `NAMING_TAIL_HE`/`_EN`, and `(?=[\s:])` keeps a
numeral off a coefficient (#1059).

**`Curve.kind` is an expectation, checked**: `classify` names the family and a different stated noun is
`kind-mismatch`, except the ruled a = b ellipse. An unnamed curve's id is its equation (`curve-<hash>`), and the
absence of a claim never conflicts with a claim (`undefined` vs `'line'`).

*Identifiers:* `crossings.ts` · `(x-3)^2+(y-4)^2=9` · `[1-5]` · `l3` · `unknownRef` · `missingCurve` · `candidates` · `[IVX]` · `{kind: 'ellipse', a: r, b: r}`

### Lengths as values ([ADR-AG-025](06c-decisions-analytic.md#adr-ag-025))

`engine/lengths.ts` is a **thin adapter, not a second expression language**: `AB + BC = DE` needs precedence, juxtaposition, `√` and powers — all of which `expr.ts` already has.
Each length is one private-use character, bound at evaluation; `SYMBOL_RE` widens by that range only. Which rule
claims `AB` is by position: `matchCurve` (a curve noun, first), `parseConstraint` (a length token), the bare-equation
branch (last).

*Identifiers:* `A·B` · `|PQ|` · `AB + BC = 10`

### Measure roles: one reader, one ask normaliser, one substitution seam ([ADR-AG-169](06c-decisions-analytic.md#adr-ag-169) Am. 1, [ADR-AG-332](06c-decisions-analytic.md#adr-ag-332))

`readRoleRef` (`parser/parseAnalytic.ts`) reads a role once: the given is `<role> <copula>? <value>` (`roleSplits`),
the ask is the phrase after `normaliseAsk` (`app/ask.ts`) strips openers. M1 resolves `radius-of`, `focus-of`,
`directrix-eq`, `perimeter-of`; a missing or ambiguous host refuses with `host: {kind, found, need?}`
(`app/hostKey.ts`, `errHost.*`, `askHost.*`). A stated value replacing a free symbol (`r_O`, a student's radius letter
`r`, a tool symbol) goes through ONE seam, `bindSymbol` (ADR-AG-332): `admitStated` (`out-of-domain`), then one
structural substitution over every expression-bearing field of the construction (all but `params` / `seedNames` /
`bound`), retirement of the parameter when no `{kind:'sym'}` node of it remains (a structural scan, never a text
search), the record `Construction.bound[sym] = value`, and `normalizeParamOrder` on each `sign / params` selector it
rewrote (no symbol left: judged now, `unsatisfiable` when false; one linear symbol: also lowered to that symbol's domain
through the `param` merge). `applyFact` reads `bound` at its entry (`readBound`), so a later fact naming a bound letter
reads the value, and a `param` fact on a bound letter is judged against it (`judgeBoundParam`). `substituteSym` is
private to those two functions (a guard test holds it); the directrix prints through `roleLineText`/`directrixText`; `ringsNamed`
resolves a noun-only perimeter.

*Identifiers:* `engine/apply.ts`

### A role noun is a claim; a length draws what it names ([ADR-AG-200](06c-decisions-analytic.md#adr-ag-200), #1651, #1652, #1620 item 2)

`STRAIGHT_NOUNS` is the only list of straight-piece nouns; `HE_LINE`, `HE_LINE_PLAIN`, `PIECE_NOUN`,
`BOUNDED_NOUN` derive from it (`readPiece(text)`, `nounRow`). `claimFacts(row, a, b, src)` is the one claim
lowering (chord, diameter, tangent, `role-of { role, a, b }`; median and altitude `null`), and
`direction(phrase, sink?)` reads a claiming noun only into a `ClaimSink` (`stateClaim`, `sink.out`). M1's
`applyRoleOf` honours the role or refuses (`conflicting-restatement`, `ambiguous-shape { host: polygon, found: 0 }`).
`readLength(src, named?)` records the pairs a length names (`LENGTH_TOKEN`, `namedLengthPairs(src)`), and
`lengthPieces(sides, src)` draws each through `pieceFacts('segment', …)`; a distance spelling (`DISTANCE_NOUN`) draws
nothing.

*Identifiers:* `distinct` · `tangent-of` · `lengthRoles` · `{ he, en[], bounded, claim? }` · `on-kind circle` · `diameter-of { define: false }` · `[]` · `claimFacts` · `eqNounOf` · `heNoun` · `role-of` · `constraint` · `rightAngleAt(third)` · `LENGTH_NOUN` · `parseRatioColon`

### The LLM lane's prompt: derive, never invent; never prose ([ADR-AG-186](06c-decisions-analytic.md#adr-ag-186))

`parser/llmSharedAnalytic.ts` states both halves of ADR-052: never supply an undetermined value; a determined one may
be written (`הישר y-3=4(x-2)`). Steps must be catalogue commands. `fallbackRefusal` (`app/fallback.ts`) words a
non-recording answer (ADR-AG-170).

### The LLM lane's faithfulness gates ([ADR-AG-279](06c-decisions-analytic.md#adr-ag-279))

`runFallback` runs `faithfulnessAnalytic` (`parser/honestyAnalytic.ts`) after the all-or-nothing re-decide and
before recording, on the whole answer after the sequence gate (`gated.lines`), with the figure's names from
`existingNamesAnalytic(derive(lines, seed).construction)`. A stated name (point, letter line, numeral curve,
lowercase symbol) must appear in a model line or its parsed facts, existing names included; a stated number must be
paid, as a multiset, by a line's numbers or facts (value, square, square root, 90 for a right angle); a point, line
or numeral name the model writes must be stated or existing. Names are read with the grammar's atoms
(`POINT_NAME_ATOM`, `LETTER_LINE_NAME_ATOM`, `NUMERAL_ALT`, `HE_NUM_UNITS`); exponents, subscripts, numeral names and
counts are blanked before numbers are read. A trip is `{ kind: 'unfaithful', dropped, invented, answer }`, which
`fallbackRefusal` words as `llm-dropped` (the student's tokens) or `llm-invented` (no interpolation); the App logs
`result: 'unfaithful'` and every refusal's whole answer. A name the model writes that the figure holds but the
sentence never wrote is `inventedExisting` ([ADR-AG-281](06c-decisions-analytic.md#adr-ag-281)), refused as
`llm-invented-existing`, which names it (the figure shows it). The algebra is `shell/llm/honestyCore.ts`
([ADR-AG-280](06c-decisions-analytic.md#adr-ag-280)).

*Identifiers:* `faithfulnessAnalytic` · `existingNamesAnalytic` · `unfaithful` · `llm-dropped` · `llm-invented` · `errLlmDropped` · `errLlmInvented` · `inventedExisting` · `llm-invented-existing` · `errLlmInventedExisting`

## The sentence frame

### The sentence frame ([ADR-AG-187](06c-decisions-analytic.md#adr-ag-187), #1618)

`parseLine` reads the exam's frame **once** (orthography → proof target → `readLine` → `parseClause`).
`frameAnalytic.ts` is text → clauses and decides nothing: a reading counts only when every clause parses one level
deeper (`MAX_FRAME_DEPTH = 2`). Structural readings run before `parseClause`, partitions after (on `not-handled` /
`bad-operand`), keeping separators (`Segment.sep`) and rejecting a bare-name group (`isBareName`); shape nouns come
from `SHAPES` / `EN_SHAPE`; `unwrap`, `shapeClauses` and `originClauses` (`(0,0)`, named by `resolveMints`) fill the
rest; `viaCanonical` calls `parseClause` directly; a proof target is `proof-target`.
A letter the tool cannot read is
`unread-name` / `unread-word` (#1919, [ADR-626](06-decisions.md#adr-626)): `unreadScript`
(`shell/inputScript.ts`) is asked right after the proof target, so the line never reaches a rule and never
reaches the model, and the two refusals are worded from `errRenameBadName` and `errUnreadWord`. The
look-alike letters fold first, in `orthography`'s `foldGlyphs`, so «משולש КМО» now reads as KMO and records.
An angle measure written in radians is `radian-angle` (#1837, [ADR-W-142](06w-decisions-workspace.md#adr-w-142)): `findRadianAngle` (`shell/radianAngle.ts`) is asked right after the proof target, before every rule and the model, worded from `errRadianAngle` (2-D's sentence); `detail` is the π value. The angle readers it covers are the ones analytic has — the angle given and the sector's «בזווית»; measured at b0e9dbea, an inclination, an angle between two lines and a trig argument are not read even in degrees.

**Entailment is judged over configurations** ([ADR-AG-188](06c-decisions-analytic.md#adr-ag-188)): the line's
constraints (`Derivation.constraintLine`) must hold across the pool (`evaluate.holdsInEveryConfiguration`, with
`SATISFIED_EPS`, as `isKnowledge`, `knownOptions`, `knownCurve`, `unsatisfied`), or the line records.

*Identifiers:* `poolScheduler`
*ADRs:* ADR-AG-119.

**The exam's circle-and-centre sentences** ([ADR-AG-315](06c-decisions-analytic.md#adr-ag-315), #2391) are frame readings
that rewrite to the twin's own text, so no second lowering exists: `circleCentreClauses` (a circle with its centre, or
named by its centre with an equation), `centresRespectivelyClauses` (two namings paired by the shared `respectively`
helper), `namedCirclesClauses` (a plural subject distributed over its named members), the copula/construct forms in
`centreClauses` and `diameterClauses`, and `satisfiesClause` (taken in `readLine` only when the statement's facts name
the point; the point is then declared). `circleCentreClauses` keeps the A2 ordinal («M מרכז המעגל האחד EQ»; English "one of
the circles" / "the other circle"), which `centreOfCircle` reads off the tail (`PAIR_ORDINAL`) as `centre-of { ofPair }`
([ADR-AG-322](06c-decisions-analytic.md#adr-ag-322), #2397). `orthography` folds a capital's underscored digit index into the subscript
glyph (`SUB_INDEX`), and `unwrap`'s glued «ש-» after a given-word never takes the first letter of a cardinal
(`CARDINAL_SHIN`). Two forms are not text: «… מרכזי המעגלים …» is the `centres-distance` fact (`parseCentresDistance`,
its lettered twin over `CENTRES_SENTINELS`), which M1 resolves through `circlePairOf` — the pair resolver
`tangent-circles` uses — writing the two centres in (`centreIdOf`; a centre with no letter is `unknown-reference`, as
`via-centre`); and «דרך P עובר משיק למעגל» is `tangent-through`, which M1 lowers to `tangent-line-at` when the figure
puts P on that circle (`onCurveByConstruction`) and to the #1430 from-point construction otherwise. The trailing
«דרך …» of the construction register is `TRAILING_THROUGH` in `constructionCandidates`, which also splits conjoined
tangent phrases and pairs «משיקים למעגלים … בנקודות … בהתאמה», joining the canonicals with the top-level «;».

### An imperative wrapper is TAUGHT ([ADR-AG-150](06c-decisions-analytic.md#adr-ag-150))

`imperativeCandidates()` (`scopeAnalytic.ts`) proposes `{verb, remainder}` from a closed verb lexicon (2-D
`src/parser/scope.ts`, 3-D `src3d/parser/scope3.ts`); a remainder that parses and that `decideSubmit(remainder)`
records becomes `{ kind: 'teach', verb, canonical }`, pre-filled by `setDraft(canonical)`.

#### Three properties, and where each one lives

The taught sentence is one the gate accepts; unknown input is never dismembered; the check runs before
`parseLine(line)`.

#### Why the verdict, and not a boolean

`decideSubmit` returns one verdict and `App.tsx` switches exhaustively (`__tests__/engine.test.ts`).

#### Not here

The LLM suggest lane (ADR-W-030) is held against #1297; the lexicon stays out of `shell/`
([ADR-W-016](06w-decisions-workspace.md#adr-w-016)).

### The exam's construction register ([ADR-AG-206](06c-decisions-analytic.md#adr-ag-206), #1620)

`constructionCandidates` (`parser/scopeAnalytic.ts`) reads the closed grammar `ADVERBIAL* VERB ADVERBIAL* NOUN NAMES? REST`
(`CONSTRUCTION_VERBS_HE`); its candidates are flagged `exam` and kept only when parser and fold accept them.
`confirmTaught(lines, seed)` (`app/submit.ts`) is what the 471 ratchet calls.

*Identifiers:* `record` · `imperativeCandidates` · `already-known` · `already-follows`

A restatement is `known` when every fact of the line is absorbed in `applyFact`; a selector is compared by
`selectorIdentity`, which reads a `distinct` selector as the SET it is, so a ring restated in another order is
absorbed like its polygon (whose id is already canonical over rotations and reversals) ([ADR-AG-259](06c-decisions-analytic.md#adr-ag-259)).

**A ring already declared is read in its declared spelling** ([ADR-AG-262](06c-decisions-analytic.md#adr-ag-262), #1989;
2-D's [ADR-618](06-decisions.md#adr-618) over this tree's model). A noun's `givens` seat its right angle and its equal
pair by ring ORDER, so «ריבוע BCDA» stated constraints the figure held but had never been given, and the line recorded.
`declaredRingSpelling(facts, group)` at the head of `fold` re-spells a `polygon` fact over a ring an earlier fact
declares, and regenerates that line's `definition` constraints from the row over the declared ring — positionally, so
every index `fold` reports still names the student's own fact. Whether the noun says the same thing in the new reading is
`sameStatementUnder` (`engine/shapes.ts`), read off the registry: generic (`isGenericNoun`), `regular`, or
`assertsBothParallelPairs` ⇒ every reading; `promisesOneParallelPair` ⇒ only the readings that keep sides 0 and 2
opposite (2-D's parity test on `(r, dir)`); any other noun's vertex order is semantic and is never re-spelled.

### A line that loses a part ([ADR-AG-251](06c-decisions-analytic.md#adr-ag-251), #1888, #1889; [ADR-W-120](06w-decisions-workspace.md#adr-w-120))

`app/lostPart.ts`, asked by `decideOnce` (`app/submit.ts`) and by `decideEdit` through `lostPartOf`: one question for both typed seams.

- **Arm 1, a parsed line.** `unreadPart` runs the shared probe (`shell/readExtent.ts` `readLabelRuns`) with `parseLine` as the reader and the facts without `src` as the lowering. The frame is context-free, so one reader serves every clause; the whole line is the one clause `cutAtReading` cuts. A tail gives `split-statements`; an unread run with read labels after it gives `not-handled` (the model, as in 2-D). Asked before the fold: it is a question about the reading.
- **Arm 2, a declined line.** `declinedPart`: the LONGEST word-boundary prefix that the same decision would record (or answer as already known). Its rest must carry at least one label, only labels the prefix's facts carry, and nothing else with a construction signal (`hasConstructionSignal` over `VOCABULARY_ANALYTIC`, no digit). No word list is added. When the rest fails that test whole, it is cut at its conjunctions (`conjunctionPieces`: «ו-» after `shell/conjunction`'s `foldConjunctionSpacing`, and "and"; [ADR-AG-301](06c-decisions-analytic.md#adr-ag-301), #1947): the first piece must pass the same test and every further piece must record after the prefix and the pieces before it (the caller's `records(piece, before)`, which derives that figure). Then the parts are `[prefix, lost, ...further]`; any further piece that does not record keeps the old answer.
- **Arm 3, the incidence phrase** ([ADR-AG-334](06c-decisions-analytic.md#adr-ag-334), #2547). `declinedThrough`, asked at the same `not-handled` seam AFTER `declinedPart` (so a co-reference arm 2 refuses keeps its parts). The head is the text before the line's first incidence opener (`shell/incidencePhrase.ts`'s `firstIncidenceOpener`, the atoms 2-D's `unreadThrough` reads; [ADR-W-161](06w-decisions-workspace.md#adr-w-161)), a trailing comma dropped as 2-D's cut drops it (the comma rule lives here, never in arm 2's shared walk). The head must record and READ AS a segment: its `parseLine` facts hold a `segment` or `cevian-of` fact (chord, segment, diameter, tangent, altitude, median; a line «ישר AB» and «מעגל העובר דרך A» never qualify). The rest must be one incidence phrase within one clause (`incidencePhraseAtStart`: no `,` `;` `.`). The X-test is ADR-765's "no fresh letter": the phrase's point (in the first conjunction piece) has every label carried by the head, or, with its labels and a point noun right before one removed (`POINT_NOUN_HE_ATOM` / `POINT_NOUN_EN_ATOM`, the subject noun `HE_POINT` composes), still has a construction signal over `VOCABULARY_ANALYTIC`. Parts: `[head, phrase, ...further]` when the rest's further «ו-» / "and" pieces each record after the head (ADR-AG-301's cut), else `[head, rest]`.
- **The taught form.** `rightAngleTeach`: the read part is a triangle whose right angle the reading left open (a three-way `choice` of perpendiculars) and the lost part is one of its vertices, whatever follows it. The refusal carries `teach: { triangle, angle }`, the angle named with the vertex in the middle.
- **Text.** `errSplitStatements` and `errRightAngleVertex` (`i18n/index.ts`) carry 2-D's text byte for byte (ADR-W-118 B1; `shell/__tests__/one-fact-per-line-parity-1962.test.ts` reads analytic's key off disk). `errorText` fills `{{more}}` with the parts after the taught pair, numbered from (3) in 2-D's `numbered` format.

*Identifiers:* `split-statements` · `unreadPart` · `declinedPart` · `declinedThrough` · `lostPartOf`

### What a sentence draws, and whose extent it is ([ADR-AG-198](06c-decisions-analytic.md#adr-ag-198), #1639, #1640, #1636, #1641, #1643)

`pieceFacts(noun, a, b)` is the one piece declaration (`line-2pt { a, b }` or `segment { …, ref: true }`), emitted
after a sentence's facts (`TangentTargets.pieces`, `sideClauses`, and `ON_OBJECT`'s `on-line-2pt` arm — the carrier a
point-on sentence names, [ADR-AG-264](06c-decisions-analytic.md#adr-ag-264), #1900: the segment reading only, and not
when the subject is an end of its own pair). The extent is decided at M1 against the prior
construction: the crossing's bounded promotion (`drawnPieceOver`). A bare pair in a point-on sentence is decided in
the parser, not at M1: it carries the `between` selector «הקטע AB» carries, except when the subject is one of its ends
([ADR-AG-248](06c-decisions-analytic.md#adr-ag-248), #1892; `lineObject` and `pairText` lower the converse to that
bare «P על CD»). `orthography` folds format controls (`stripFormatControls`), bullets, the case of a subscripted
coordinate's axis letter (`X_B`, `B_{X}` → `x_B`, `B_{x}`; a letter subscript only, so the label `X_1` is untouched,
[ADR-AG-274](06c-decisions-analytic.md#adr-ag-274)), the spaced
conjunction (`shell/conjunction`, [ADR-AG-239](06c-decisions-analytic.md#adr-ag-239)) and the look-alike
glyphs (`shell/glyphFold`, [ADR-3D-329](06b-decisions-3d.md#adr-3d-329)): its own ∢/∡ and ⁰ rows moved into
that shared table, which also brings ⟂ → ⊥, the guarded `<` → ∠, º/˚ → ° and «שורש N» → √. A tangency with no circle
applies `touchedCircleFacts` (tool symbols, `toolSymbol`), and `theCircle` binds `{ inscribed: ring }`; created
shapes start fitted ([ADR-AG-202](06c-decisions-analytic.md#adr-ag-202): `fitCreatedShapes`, `shapedObjectOf`). A
non-cyclic noun refuses `inscribed-contradicts-noun { shape, forced }` (`ShapeRow.notCyclic`, `cyclicFacts`,
`errInscribedContradictsNoun`). The same pair in TWO sentences, either order, is refused at M1
([ADR-AG-252](06c-decisions-analytic.md#adr-ag-252), #1918): `cyclicFacts` marks the ring's polygon fact `cyclic`, the
polygon object carries `cyclic` and `circleless` (the declared `notCyclic` noun), and the statement that would make
both true fails `inscribed-contradicts-declared { shape, forced, ring }`; `derive` adds the other sentence as
`declared` (`errInscribedContradictsDeclared`).

**Carriers distribute as subjects do** ([ADR-AG-282](06c-decisions-analytic.md#adr-ag-282), #2199). `distributeClauses` reads a CARRIER list with `carriersOf` (every member opens with «על», joined by a comma, «ו» or «וגם»; two or more) and `carriersOfEn` ("on K₁ and (also) on K₂"): with no «בהתאמה» every subject gets every carrier (`eachOnEach`) — one subject («A על מעגל O ועל מעגל P», «הנקודה A נמצאת …», «A נקודה על …») or a list; «בהתאמה» / "respectively" still pairs. The English verb is optional ("A and B on circle O"), and the English per-point incidence "A on circle O and B on circle P" is cut into its two clauses — the twin of ADR-AG-222's Hebrew cut, scoped to that shape. A member that opens with a point's name is not a carrier, so the per-point Hebrew form keeps ADR-AG-222's reading.

*Identifiers:* `carriersOf` · `carriersOfEn` · `eachOnEach` · `errorText` · `θ_<object>.<part>` · `tangent-curve` · `about` · `the-circle` · `ref` · `line-AB` · `line-BA` · `line-at { through: a, dir: points a→b, name: 'AB' }` · `objects` · `NAME_LIST` · `distributeClauses` · `param θ_circle-touched.r > 0` · `circle-touched` · `θ_circle-touched.{a,b,r}` · `θ_` · `circleId` · `match` · `centre-of { circleId }` · `evaluateUncached` · `shapeHe/forcedHe` · `shapeEn/forcedEn` · `A = [(3/5, 4/5)] או (4, -2)` · `… (2- ,4) או` · `x_{B}` · `namedRow` · `pointText` · `scalarText` · `<text>` · `direction: ltr` · `<svg>`

## Fold and apply

### The fold defers, and the LINE is its unit of application ([ADR-AG-133](06c-decisions-analytic.md#adr-ag-133))

`fold(facts, groupOf)` runs the in-order pass and two fixpoints. **Deferral**: a failed fact is retried against the
completed construction until nothing lands ([ADR-AG-156](06c-decisions-analytic.md#adr-ag-156); the `NON_CREATING`
limit is gone; [ADR-W-089](06w-decisions-workspace.md#adr-w-089)); objects still land in dependency order
([ADR-AG-013](06c-decisions-analytic.md#adr-ag-013)). **The line is the unit**: by each fact's `owner`, a line with a
still-failing fact is removed whole, to a fixpoint. `decideSubmit` still refuses a forward reference
([ADR-AG-015](06c-decisions-analytic.md#adr-ag-015)); `errors`, `effects` and `constraintFact` stay positional.

*ADRs:* ADR-104.

### Curve identity at the M1 boundary ([ADR-AG-147](06c-decisions-analytic.md#adr-ag-147))

`sameCurve` asks whether a restatement CONTRADICTS the id it matched (`|cos|` of coefficient vectors);
`identicalCurve` whether two curves are the SAME OBJECT (normalised coefficients, component-wise, over every curve —
lines that close stay distinct, [#1235](https://github.com/dcodish/geo_builder/issues/1235)). Only stated
declarations are scanned; an absorbed statement's id is never rewritten (`label.name`, `curveByName`). **Identity by
reading** ([ADR-AG-183](06c-decisions-analytic.md#adr-ag-183)): `nameReading` (`names.ts`) and `readingTwin`
(`apply.ts`, around `applyStatement` in `applyFact`) raise an `ApplyNotice`, carried by `fold`, `derive`
(`Derivation.notices`) and the record verdict, and set with the line (`recordLine(line, notice)`,
`recordLlmLines(…, notice)`; `commitRecord` / `noticeText`).

*Identifiers:* `\|cos\|` · `III`

**A line referred to by its name** ([ADR-AG-317](06c-decisions-analytic.md#adr-ag-317)). A narrowed line keeps its
id, so `applyFact` first runs `resolveLineRefs`: every line-id reference in the fact (never the id the fact introduces)
that names no object, while a line carries that name (`curveByName`), is re-pointed at that line's id. Every slot that
holds a line id reads it through this one step, and a reference to no line is left for the slot's `unknownRef`.
`line-at` holds its `dir` to the same reference check as a relation (`dirRefs` + `dirCurveRefs`). `derive` blames a
failing selector by the selector AS APPLIED (`selectorFact`), not as written.

**The equation operand** ([ADR-AG-318](06c-decisions-analytic.md#adr-ag-318)). An equation written inside another
sentence reaches M1 as an `EqOperand` (`{ kind: 'eq', id, eqSrc, eq, role }`), never as a `curve` fact the parser
minted. `equationOperand` is the one resolver: the figure's own curve with that equation (`resolveCurveByEq`) is the
operand (a `stated` role promotes a carrier it finds); otherwise the curve is minted in its role (`stated` drawn,
`carrier` per ADR-AG-032), and a stated mint absorbed by the twin scan resolves to its absorber. `tangent-of`
resolves its `eq` lines first; `tangent-eq` and the #1429 `on-curve` arm call the same function.

**A line operand given by its equation** ([ADR-AG-328](06c-decisions-analytic.md#adr-ag-328)). Four more slots carry
an equation to M1, each in the `stated` role through `lineOperand` (→ `equationOperand`, `line: true`): a relation's
`u`/`v`, a `slope`'s `u` (the relation arm, one operand; Am. 1) and a `line-at`'s `dir` as `Direction` `{ k: 'curve', id, eqSrc, eq }`, and a `length-eq`'s `point-line`
term as `{ line: eqSrc, eq, curve: id }`. Each is resolved in written order (a second new line is l2), the spelling
stripped, the resolved id written back, and the statement re-applied; a statement that minted or promoted its line is
never `known` (`mintedEffect`). `lineAtOf` finds a term's line by name, then by id, so a resolved term survives a
rename.

### Curve identity and the promotion path ([ADR-AG-090](06c-decisions-analytic.md#adr-ag-090))

Content-derived ids make a later «y=x» PROMOTE the carrier of «נקודה B על הישר y=x» (#1076): the carrier is minted
with its `eqSrc`, and a promoted carrier equals a curve stated outright. Naming a derived curve is #1202.

*ADRs:* ADR-AG-056.

### The apply boundary's reference check, both halves ([ADR-AG-083](06c-decisions-analytic.md#adr-ag-083))

`constraintRefs` gives the points a constraint touches; its sibling `constraintCurveRefs` the curves, which must
resolve to a `curve`, `circle-at`, `line-at` or `circle-thru`. They stay separate functions.

*Identifiers:* `ABC`

#### Naming what the student wrote

`statedName` strips a curve id's prefix (`circle-I`, `line-l7`) at every `unknown-reference` site; an anonymous
`curve-<hash>` stays whole.

### Naming paths and the shared check ([ADR-AG-092](06c-decisions-analytic.md#adr-ag-092))

Every route that letters a point mints a `derived` object in `applyFact`, and that mint enforces one name per
position, by structure: `engine/sameDerivation.ts` compares `DerivedRule`s (exhaustive switch). Coincident stated
points are a different question.

### A noun's unstated choice is the TOOL's ([ADR-AG-082](06c-decisions-analytic.md#adr-ag-082))

«טרפז ABCD»'s parallel pair is the tool's pick by ring order, not a given.

#### The mark

`assumedParallel` (`engine/shapes.ts`) sets `assumed: true`, read only by the apply boundary and the submit verdict:
stating the assumed pair makes it the student's (`narrowed`), the other pair displaces it (`created`), a noun that
gave the pair answers `known`. `displacedAssumption` reads the ring; it is not a `choice`.

#### Why the submit verdict needed its own arm

`decideSubmit` counts assumed relations before and after and records when the count drops.

#### One key for "the same statement"

`canonicalConstraint` (`engine/solve.ts`) is the one statement key (pairs and symmetric operands sorted, `assumed`
outside it), replacing a `JSON.stringify` compare.

*Identifiers:* `shapes.ts` · `AB ∥ DC`

### The tool's choices are SAID ([ADR-AG-267](06c-decisions-analytic.md#adr-ag-267), #1864)

`engine/unstatedChoices.ts` reads a `Derivation` and returns one entry per choice the tool still holds, on the line
that opened it (`constraintLine`, and its selector twin `selectorLine`). It classifies a choice by WHAT ITS OPTIONS
ARE, never by the sentence: equalities between two segments → `equal-pair`; each vertex on an axis → `axes`; one angle
over 90° (a region `choice`) → `obtuse-vertex`; an `assumed` parallel on a one-parallel-pair ring → `parallel-pair`
(legs when an equality between the other two sides holds). Every other choice — a right-angle seat, a tangency, a
sine's two roots, an inscribed square — is not said. Which option is drawn is read off the drawn figure (`holdsOn`,
`selectorsHold`), as `statedMeasures` reads it.

#### "Until stated" is the apply step's structure

- A statement naming a whole option replaces the choice (#1049); one naming PART of an `all` option NARROWS the
  choice to the options containing it, in place — the fold keeps the slot's attribution to the opener.
- A selector naming an option of a region `choice` replaces it (`selectorIdentity` sorts an order's angle rays).
- `canonicalConstraint` sorts a `length-eq`'s segment points and its two sides, so «AC=AB» pins «AB = AC».
- «זווית A קהה» is a `vertex-angle` fact whose `order` right side M1 resolves to the three-letter selector.

#### "Unstated" is judged on the pool ([ADR-AG-290](06c-decisions-analytic.md#adr-ag-290), #2233)

The apply step's narrowing is syntactic, so a sign, a coordinate or the geometry can leave one option drawable while
several stay written. `unstatedChoices` therefore also reads `admittedPool(c)` (`engine/evaluate.ts`, the set `isKnowledge`
judges): a constraint or region `choice` is said only while no option holds in every admitted configuration, and the axes
note's `open` is the vertices whose axis differs across them. `admittedPool` answers `null` while it cannot tell (deferred and
incomplete — reported pending —, none admitted, starved); the note then stays as written, and `App.tsx` re-reads it on
`poolTick`. An `assumed` parallel pair is imposed in every configuration, so the pool cannot judge it (#2284).

#### Wording

`app/unstatedChoice.ts` mirrors 2-D's `src/ui/unstatedChoice.ts`; the templates are 2-D's `steps.*` verbatim,
held equal by `shell/__tests__/suite-vocabulary.test.ts`. `App.tsx` shows each note in its row's `notes` slot and
the `unstatedTitle` cue beside «הציגו תצורה אחרת».

*Identifiers:* `unstatedChoices.ts` · `unstatedChoice.ts` · `selectorLine` · `admittedPool`

### The shape registry ([ADR-AG-035](06c-decisions-analytic.md#adr-ag-035))

`engine/shapes.ts` maps a noun to its constraints with three helpers — `parallel`, `equal`, `rightAngleAt` — and lowers
a shape to one `polygon` plus its constraints, the ring `ABCD` in order; the polygon remembers its noun, promoted,
never demoted.

*Identifiers:* `DC` · `AC` · `BD`

#### Discrete freedom

`choice` is a constraint kind: `options[seed % 3]` cycles the right-angle seat, `resolveChoices(constraints, seed)`
runs first in `evaluate`, `residual` throws on an unresolved choice, and a stated option collapses it (`narrowed`).

*Identifiers:* `משולש ABC` · `משולש ישר-זווית ABC` · `+ זווית B ישרה`

#### Contextual references

Contextual references («זווית B ישרה», «שטח הדלתון», `meet-of` via `concurrencyOf`,
[ADR-AG-182](06c-decisions-analytic.md#adr-ag-182)) resolve at M1 when exactly one object answers, else
`ambiguous-angle` / `ambiguous-shape`.

### A canonical circle's centre is the tool's O ([ADR-AG-184](06c-decisions-analytic.md#adr-ag-184), #1270)

`nameCanonicalCentres` (in `derive`) inserts `{ t: 'derived', id: 'O', rule: circle-centre, auto: true }` after a
circle whose equation `isCanonicalCircle` (`engine/conic.ts`).
It inserts nothing when the list states a constant point at the origin, names a canonical circle's centre itself, or DEFINES `O` (a `point` or `derived` fact).
An `O` only DECLARED earlier («משולש AOB») is the fold's to see: `applyFact`'s derived arm absorbs an
`auto` fact held as `known`, never lowered to `derived-at`; `minted`
records `O` only when the fold CREATED it, which is what the row's `mintedNote` reads.

*Identifiers:* `A(x²+y²)+F=0`

### The tool's letters: one table, one resolver ([ADR-AG-211](06c-decisions-analytic.md#adr-ag-211), #1620 S6, #1222)

`toolPoint(role, key)` (`engine/toolLetters.ts`) is the placeholder for an unlettered point; `resolveToolLetters`
(before `resolveMints`) gives it an earlier same-derivation name (`sameDerivation`), else the first free letter of
`TOOL_LETTERS[role]` (`MNPQ`, `NPQS`, `HGP`), else 2-D's `freeLabel` pool `MNPQRSTUVWXYZKLGHIJ`. The cevian's tool
foot is derived (`toolFootFacts`, `engine/cevian.ts`), named after the fact through `FOOT_TAIL_HE/EN` and
`cevianNamingCandidates`; `TO_HYP_*` emit `cevian-of { hypotenuse }`, resolved from the STATED right angle
(`sameConstraint`, `rightAngleAt(v, …)`) or asked (`ambiguous-hypotenuse`, `ambiguous-no-right-angle`).

**A helper point** ([ADR-AG-345](06c-decisions-analytic.md#adr-ag-345), #2583). A role in `HELPER_ROLES` (`bisector-mid`, the
perpendicular bisector's midpoint: no end of the drawn line) resolves to `helperId(key)` (`~mid:E,K`), never a letter,
and is not minted. M1 marks the derived object `helper`; `evaluate` places it (`placed`) but leaves it out of
`figure.points`, and `positionalOf` (the enumerator every student list reads: the panel, the rename) leaves it out of
the construction's points, so nothing downstream draws, labels, crosses or lists it; M1 reads `isPositional`. The first LETTERED derivation of the same
point (`sameDerivation`) renames it at M1's one-position-one-name check (`replaceId`), and `resolveToolLetters` re-points
the helper's later placeholders to that letter.

*Identifiers:* `P₁` · `@fresh:<role>|<key>` · `mid:B,C` · `HELPER_ROLES` · `helperId` · `~mid:E,K` · `foot(A|BC)` · `median:A` · `toolPoint` · `derived midpoint(u, v)` · `derived foot(apex → uv)` · `cevian-of { toolFoot }` · `cevian-of { side }`

### New letters and circles a reference names ([ADR-AG-210](06c-decisions-analytic.md#adr-ag-210), #1670, #1686)

`applyRoleOf`'s radius arm names an unlettered centre (`centreIdOf` null) with the end not already on the circle
(`onCircleAlready`, `centreRuleOf`, `nameCentreAs`). A named circle the chain (`circleByName`) cannot find is stated by
`statingNamedCircle` (`declare`, `param radiusSymbol(M)` > 0, `circle-at-M`); an `on-kind` circle with no circle
creates one (`touchedCircleFacts`). **New letters, last**: after the fixpoints, `foldPass` adds `free` points for a
line whose failures are all `unknown-reference`s to point letters, a round at a time (a further missing letter a fact
names is minted too) until the line lands, or the line keeps nothing ([ADR-AG-342](06c-decisions-analytic.md#adr-ag-342),
#1467: every reference, as 2-D; the 2026-10 `mintedByReference` form gate is gone). The ids land in
`FoldResult.created` on the line's first fact, `Derivation.created` by line, and `decideSubmit`'s `record.created` —
the shared `CreatedNotice` in `App.tsx`, shown while that line is last; ✕ is `removeLine`. The triangle form states its
triangle first (`clauseFacts`).

**A new circle by its centre ([ADR-AG-344](06c-decisions-analytic.md#adr-ag-344), #2552 D9).** `centreOfCircle` keeps
the article: «X מרכז מעגל» (no «ה») lowers to `centre-of { indefinite: true, create }`. In M1's no-equation arm, an
`indefinite` fact on a figure whose every circle has a centre letter (`centreIdOf`), none of them X, applies its
`create` («נתון מעגל שמרכזו X»: `declare` + `circle-at-X`, `stateCircleOn`) and returns `createdCircle: X`. It travels
`FoldResult.createdCircles` (per fact) → `Derivation.createdCircles` (by line) → `record.createdCircle`, which replaces
`record.created` on that line; `App.tsx` renders it through `createdNoticeTextOf` (`suite.notice.createdCircle`,
ADR-W-164).

*Identifiers:* `centre-of.indefinite` · `createdCircle` · `createdCircles` · `record.createdCircle` · `createdNoticeTextOf`

*Identifiers:* `circle-at-<letter>` · `create` · `chordFacts` · `on-kind { circle }` · `tangent-line-at`

### A role sentence introduces its ends ([ADR-AG-204](06c-decisions-analytic.md#adr-ag-204), #1669)

`parseClause` (`parseClauseRules`) passes every clause through `withRoleIntroductions`, declaring role ends first
unless defined (`POINT_MAKERS`); `RADIUS_PREDICATE` routes «OA רדיוס»; a later `circle-eq` replaces a created
circle's expression under its id — every circle the tool drew (`isCreatedCircle`, not the id), through
`describeDrawnCircle`: the parts a statement already set are carried (a constant radius as `radius-of`, a symbolic one as
`param-rel`, a placed centre as `coord` on its centre point), the circle's own bare symbols still read elsewhere are
substituted by the stated parts (`standardCircleParts`, a structural reader; a constant circle at the probes), and its
unread own params leave ([ADR-AG-322](06c-decisions-analytic.md#adr-ag-322), #2397).

## Constructs — what each family lowers to

### Relations, and the direction resolver ([ADR-AG-024](06c-decisions-analytic.md#adr-ag-024))

A size and a ratio are the `angle` and `angle-ratio` rows ([ADR-AG-153](06c-decisions-analytic.md#adr-ag-153)). A lone
vertex is a `vertex-angle` fact ([ADR-AG-158](06c-decisions-analytic.md#adr-ag-158)), resolved by `resolveAngleName`
from the vertex's distinct edges (`edgesAt`, 2-D's `pointNeighbors`); with more than two, a vertex of one shape names
its interior angle (`angle-read-as`, `withReadAs`; [ADR-AG-243](06c-decisions-analytic.md#adr-ag-243), ADR-590), else
`ambiguous-angle` with `options` (`errAmbiguousAngleOptions`).

`direction(phrase)` resolves a segment (`B − A`), a named line (`(−b, a)`), an axis, or a free direction
(`(cos θ, sin θ)`); a `relation` relates two, normalised. A slope is `dy = m·dx`. `evaluate` hands the solver
`lineDirOf(c, env)`. The check is not the solve ([#1062](https://github.com/dcodish/geo_builder/issues/1062)).
**Residual scale and blame** ([ADR-AG-231](06c-decisions-analytic.md#adr-ag-231)): `length-eq` rows are normalised,
capped by `residualScale`; `completingStatement` is the drop-one blame for the whole admission verdict (ADR-AG-240).
**A noun gate declines a tail that is not an equation** ([#1059](https://github.com/dcodish/geo_builder/issues/1059)): the discriminator is that the tail contains no Hebrew — not that it contains an `=`, because a truncated equation has no `=` either.

*Identifiers:* `unsatisfiable` · `AngleName` · `right-angle` · `example` · `DE` · `הצלע AB` · `ℓ1` · `הישר l1` · `ax + by + c = 0` · `ציר ה-x` · `(.+)`

#### The relation rule's notations ([ADR-AG-093](06c-decisions-analytic.md#adr-ag-093))

`RELATION_HE`, `RELATION_EN` and `RELATION_SYM` («AB ∥ DC», «AB ⊥ DC») share one handler through `direction()`;
`//` is excluded.

### A point on an object, and the carrier that holds it ([ADR-AG-029](06c-decisions-analytic.md#adr-ag-029), [ADR-AG-032](06c-decisions-analytic.md#adr-ag-032))

A point on an object rides a carrier with one DOF; «על הצלע BC» emits `on-line-2pt` and `between D B C`, «על הישר»
the incidence alone, «על הישר y=x» an `on-curve` on a minted curve. `bounded` reads the noun. The curve's `stated`
flag decides whether the renderer draws it; restating the equation promotes it.

**The role of an inline curve, and the tool's l-number** ([ADR-AG-319](06c-decisions-analytic.md#adr-ag-319)). The
parser gives every equation operand its role and M1 applies it (`equationOperand`): a tangency's line
(`tangentTargets`) and the subject of «<eq> עובר דרך A» (`statedOperands` marks the `on-curve` `stated`) are `stated`;
«P על <eq>» stays a carrier. A curve that becomes stated as a LINE with no name — minted, or a carrier promoted — gets
`freeLineNames(c, 1)[0]` with `label.auto` (`toolNamed`, in the `curve` arm, the one place every stated line passes).
The twin scan lets a student's name replace an `auto` one (Q3); a new curve whose name another curve carries is a
`conflicting-restatement`. `submit.ts` `objectsGained` counts a curve newly drawn, so a promotion that also states a
constraint records.

*Identifiers:* `D על הצלע BC` · `על הקטע BC` · `D על הישר BC` · `B על הישר y=x` · `צלע|קטע|side|segment` · `ישר|מעגל|פרבולה|אליפסה`

#### Incidence in every order ([ADR-AG-164](06c-decisions-analytic.md#adr-ag-164), #1281, #1495)

`parseIncidence` normalises any order into the canonical sentence (`viaCanonical`); a coordinate point is a
`MINT_PREFIX` placeholder named by `derive.resolveMints` (`Derivation.minted`). `incidenceOn` is the one operand
resolver ([ADR-AG-168](06c-decisions-analytic.md#adr-ag-168)); an equation operand (`eqSrc`/`eq`) resolves by
`resolveCurveByEq`, so `curve-anon` ids never reach a refusal. Crossing spellings go through
`intersectionSpellings` and `meetingSpelling` ([ADR-AG-230](06c-decisions-analytic.md#adr-ag-230); `CONCURRENCY_HE`);
plurals through `distributedLines` ([ADR-AG-235](06c-decisions-analytic.md#adr-ag-235)).

*Identifiers:* `P₂`

### A cevian lowers to its WHOLE definition ([ADR-AG-109](06c-decisions-analytic.md#adr-ag-109))

«AD תיכון/גובה לצלע BC» emits `on-line-2pt D B C` plus `midpoint D B C` or `perpendicular A D B C` — separate
constraints, so a refusal names which failed; `carrierDofOf` ranks out the redundancy; no `between`.

*Identifiers:* `AD תיכון לצלע BC` · `AD גובה לצלע BC` · `BC` · `midpoint` · `foot` · `carriers − rank(J)`

#### The TARGET is an alternation, and the apex resolves it ([ADR-AG-117](06c-decisions-analytic.md#adr-ag-117))

`CEVIAN_TARGET_HE` / `CEVIAN_TARGET_EN` read the side or «במשולש ABC» (the ring minus the apex);
`apex-not-a-vertex` and `bad-arity` are distinct refusals; the lock asserts parity
([ADR-W-053](06w-decisions-workspace.md#adr-w-053)).

*Identifiers:* `AD תיכון ל-BC` · `AD תיכון במשולש ABC` · `degenerate-role`

### The cevian family: one lowering, three roles, the target or the foot from the figure ([ADR-AG-209](06c-decisions-analytic.md#adr-ag-209), #1284, #1222, #1240)

`engine/cevian.ts` `cevianFacts(role, apex, foot, u, v)` is the one lowering (the bisector an `angle-ratio`, k = 1);
`onBisectorFacts(at, p)` adds the `angle-side` selector (`angleSideOf`). Named forms lower in the parser
(`cevianWithTarget`); the rest in `parseCevianFamily` as `bisects { at: AngleName, p? }` or
`cevian-of { role, apex?, side?, foot }`.

**M1.** `bisects`: the angle through `resolveAngleName`; its three points must exist; no `p` → a `line-at` through the vertex along the new `Direction` `{ k: 'bisector', v, a, b }` (the sum of the unit rays; id `line-bisector-<a><v><b>`); a `p` the figure lacks → `cevianFacts('bisector', …)` (the foot on the line through the ray points — 2-D's `line-intersection`); an existing `p` → `onBisectorFacts`. `cevian-of`: the shapes holding the apex, or the triangles holding both ends of the side, give the candidate targets — one builds through `cevianFacts`, several `ambiguous-cevian`, none `cevian-no-triangle`. A HEIGHT named from its apex is hosted by a ring of ANY arity ([ADR-AG-253](06c-decisions-analytic.md#adr-ag-253), #1945): `oppositeRingEdges` returns the ring edges that do not touch the apex (never a diagonal), and the one the height means is the foot's own side if the figure already placed it (ADR-AG-222), else the ring's unique opposite parallel base (`ringParallelBase`, the trapezoid's — 2-D's ADR-169), else the union's first side (2-D's ADR-263 draw-one steer); two SHAPES giving the apex different sides ask. Every other cevian — the median included, because 2-D defers it on a ring — keeps the 3-vertex host. **Either end may be the vertex** ([ADR-AG-278](06c-decisions-analytic.md#adr-ag-278), #1999): a named cevian whose sentence carries its triangle is oriented at parse time (the ring's third vertex on the stated side, else a letter of the ring); the side form and the bare form emit `cevian-of { apex, foot, side?, either: true }`, and M1 swaps the two letters first when only the second is a vertex — the third vertex of a figure triangle on `side`, or a vertex of a figure polygon — so a vertex-first sentence resolves as before. The bisector-with-target reads a one- or three-letter angle (`BIS_ANGLE`) and is oriented by the angle's vertex. **A side is not a bisector** ([ADR-AG-299](06c-decisions-analytic.md#adr-ag-299), #2115; 2-D's ADR-643 §4): when `bisects`' far end is an arm of the resolved angle, `bisectorOnArm` asks `polygonSideKind` whether the pair is consecutive in a declared ring (the other arm's ring preferred) and refuses `bisector-is-side { pair, vertex, polygonKind }`, else `degenerate-role`; a three-letter angle is asked before the existence check. The parser feeds it three ways: the vertex-less verb (`BISECTS_NO_ANGLE_*`) is rewritten to «XY חוצה את זווית X»; a bisector-with-target whose foot is an end of the side becomes `bisects` over the angle the side subtends; the role-noun spellings (`BISECTOR_ROLE_NOUN`) are `bisects { roleNoun }`, which M1 answers only with the side refusal and otherwise declines (`not-handled`). `bisects.seg` is the segment as typed, for the sentence.

*Identifiers:* `uv` · `angle-ratio ∠(u,apex,foot) = ∠(foot,apex,v)` · `p − v` · `∠ = ½∠` · `CEVIAN_HE/EN` · `BISECTOR_CEVIAN_*` · `namedShapeFacts` · `BISECTS_*` · `BISECTS_NO_ANGLE_*` · `BISECTOR_ROLE_NOUN` · `polygonSideKind` · `bisectorOnArm` · `bisector-is-side` · `NAMED_ONLY_*` · `TO_SIDE_*` · `FROM_APEX_*` · `NOUN_FIRST_HE` · `NOUN_NAMED_HE` · `PLURAL_CEVIAN_HE/EN` · `viaSentences`

### A role noun before a length; a height stated as a number ([ADR-AG-265](06c-decisions-analytic.md#adr-ag-265), #1737)

The line is COMPOSED, never rewritten (2-D's ADR-574/575 shape). `parseRoleLength` reads «[אורך] <אלכסון|תיכון|גובה> XY <connective> <value>» and the phrase form «<תיכון|גובה> <phrase> <connective> <value>» (He + En); the role half goes through the real grammar as its own sentence («האלכסון XY», «XY תיכון», «הגובה לצלע BC»), the length half through the length lane over the two sentinels `CEVIAN_MEASURE_SENTINELS` (`measureTemplate`: a copula or nothing → `= value`, anything else verbatim, kept only when every fact is a length of that pair). `composeRoleLength` writes the apex and foot in at once when the role half names them (`measureFacts`), and otherwise hangs the template on the open `cevian-of` as `measure`, which M1 applies on the segment it draws once the apex is resolved. `parseShapeHeight` lowers «גובה ה<טרפז|מקבילית|משולש> [letters] <connective> <value>» / «הגובה הוא N» to `height-of { noun?, ring?, declare?, foot, measure, said }`; M1's `applyHeightOf` picks the polygon (noun, letters, or the one polygon), introduces a lettered trapezoid none of whose letters exist, ASKS for a triangle or a parallelogram (`ambiguous-height`, the options built from `said`), and on a trapezoid with one parallel pair lowers to `cevian-of { altitude, apex: the vertex before the pair's first ring edge, side: that edge, toolFoot, measure }`. «האלכסון XY» carries the `role-of { role: 'diagonal' }` claim: `applyRoleOf` refuses a pair that is a side of every polygon holding it (`diagonal-is-side`, `diagonal-none-here` for a triangle) and claims nothing where no polygon holds it.

*Identifiers:* `ROLE_LENGTH_HE/EN` · `ROLE_PHRASE_HE/EN` · `ROLE_COPULA` · `measureTemplate` · `composeRoleLength` · `HEIGHT_SHAPE_HE/EN` · `parseShapeHeight` · `height-of` · `applyHeightOf` · `CEVIAN_MEASURE_SENTINELS` · `measureFacts` · `ambiguous-height` · `shape-not-found` · `diagonal-is-side` · `diagonal-none-here`

### A side named by its role alone ([ADR-AG-266](06c-decisions-analytic.md#adr-ag-266), #1807)

`parseClause`'s last resort before `not-handled`: `parseRoleSide` writes a bare «הבסיס» / «השוק» / «היתר» (En "the base / leg / hypotenuse") as «<noun> Z₄Z₅» (`ROLE_SIDE_SENTINELS`) and reads the line through the real grammar, so the reading is the lettered twin's. It keeps the reading only when it puts that side on a stated LINE (a `curve` over the sentinels: the equation and incidence forms) and lowers it to `role-side { role, facts }`. M1's `applyRoleSide` finds the one polygon where the role has a content (an isosceles noun's apex choice, a triangle's right-angle seat, a trapezoid's parallel pair; none or several → `noHost`). A SETTLED role (a stated equal pair or right angle, `seatOver`'s `fixed`) applies the facts with the side's letters written in. An OPEN one replaces the noun's choice IN PLACE with `choice(all(option, the statement's constraints on that option's side))`: the line is drawn once, anonymous (`curve-<role>-<hash>`), and the declarations, sides and role claims (a trapezoid's pair excepted, stated once) are left to the ring. A statement naming PART of exactly one joint option («AB=AC» later) collapses the choice to that whole option, at the same seat the plain collapse uses.

*Identifiers:* `BARE_ROLE_HE/EN` · `parseRoleSide` · `role-side` · `ROLE_SIDE_SENTINELS` · `applyRoleSide` · `seatOver` · `readingOf` · `anonOf` · the joint-option collapse in `applyFact`'s constraint arm

### A cevian to a side named by its role ([ADR-AG-298](06c-decisions-analytic.md#adr-ag-298), #2018)

A cevian MINTS a point whose definition differs per option of the isosceles `choice`, and an object cannot sit in an option, so the role is kept on the OBJECT and resolved where the constraints are. `parseRoleCevian` (first in `parseRoleSide`) writes «ל-בסיס» / «לשוק» / "to the base / leg" as «לצלע Z₄Z₅» / "to side Z₄Z₅" and keeps the reading only when it is a tool-completed cevian (no typed apex, a tool-letter foot) → `role-side { role, facts: [cevian-of] }`; a lettered base («תיכון לבסיס BC») is the claim «הבסיס BC» plus «תיכון לצלע BC». M1's `applyRoleCevian` reads the role on the one isosceles triangle: a STATED apex (`roleVertexOf` over the raw constraints) applies the lettered twin; an OPEN one builds `toolFootFacts` at the letters of choice seed 0's option, the segment role-anonymous (`seg-<role>-<hash>`), both carrying `follows: RoleBinding { role, ring, at }`. A second leg cevian takes the leg no bound cevian of its kind holds; none left → `known`. No single host → `ambiguous-role-side` (2-D's `input.roleSideUnresolved`).

**`resolvedAt` resolves OBJECTS too.** After `resolveChoices`, `followObjects` re-letters every bound object against the configuration's constraints: `roleVertexOf` answers the vertex carrying the role there; if it is one other vertex than `at`, the ring letters inside the object rotate by the step between them and `at` moves with them (canonical, so re-resolving is the identity); otherwise unchanged. A list with no bound object is returned as the same array. `derive` returns its `construction` with the objects of the configuration DRAWN (the option that holds on the figure, `drawnOption`), so every reader of a derivation — the panel rows, the stated measures, the tool letters, the question export — agrees with the canvas; the constraints keep their choices. A bound point never holds, nor is held by, a lettered derivation of the same rule.

*Identifiers:* `parseRoleCevian` · `ROLE_CEVIAN_HE/EN` · `applyRoleCevian` · `RoleBinding` · `follows` · `engine/roles.ts` (`isoscelesKeys`, `roleVertexOf`, `followObjects`) · `resolvedAt` · `drawnOption` · `ambiguous-role-side` · `errRoleSideUnresolved`

### The perpendicular from a point, and the line through a point that cuts a side ([ADR-AG-207](06c-decisions-analytic.md#adr-ag-207), #1620)

The foot is `DerivedRule { t: 'foot'; from; onto: FootLine }` (`engine/derived.ts`, `footOn`, `curveParentsOf`).
`parsePerpendicular` and `perpendicularFacts` build it (placeholders `@mint:foot(…)`, `@mint:mid(…)`, renamed via
`namingCandidates`); «האנך» as an operand is `perpendicularRef` → `on-kind` (or `noHost(…, 'perpendicular', n)`);
`THROUGH_CUT_HE` / `_EN` build a `drawn: false` line that cuts a side.

*Identifiers:* `curveAt` · `FootLine` · `evalRule` · `from` · `parseThroughLine` · `footLineOf` · `P₁…` · `seg-` · `{ t: 'kind', kind: 'perpendicular', foot?: { from, onto? } }` · `on-line-2pt(id, from, foot)` · `errHost.{none,many}.perpendicular` · `THROUGH_LINE_FIRST_HE` · `parseIntersectionPlain` · `on-curve(F, line)` · `incidenceOn(target)` · `PIECE_SUBJECT` · `PIECE_VERB`

### Extensions, named diagonals, the midsegment, a condition after a placement ([ADR-AG-208](06c-decisions-analytic.md#adr-ag-208), #1620)

`Selector.beyond { id, a, b }` is `between`'s complement on the same line: the point is past `b`, away from `a`, judged by the projection parameter (`t > 1`) and the figure's visible resolution (`apartOf`, as `distinct`). The collinearity beside it (`on-line-2pt`, unbounded) consumes the one DOF; the selector consumes none.
`extensionFacts` lowers «על המשך …»; `conditionClauses` reads «כך ש-»; `meet-of` gains `noun` and `named`
(`ringsNamed`, `not-a-diagonal`); midsegment points use `FRESH_PREFIX` (`resolveFresh`); `vertices-on-axes` is one
`choice` over 2ⁿ assignments (`Constraint.all`).

*Identifiers:* `diagonals` · `area-of` · `@fresh:MNPQ|mid:A,B` · `resolveChoices`

### A circle on a point ([ADR-AG-045](06c-decisions-analytic.md#adr-ag-045))

«נתון מעגל O» → declare O, `circle-at O` (no radius): a curve whose shape depends on a point, evaluated
into the same `NumCurve`. Tangency to an axis is one unsigned equation.

**The radius is minted where the circle is created, once** ([ADR-AG-305](06c-decisions-analytic.md#adr-ag-305), #2382). A
`circle-at` fact with no `r` is a REFERENCE: M1 (`apply.ts`) looks the circle up by its id, else through `circleByName`
(so a centre named «M מרכז מעגל I» is circle I), and creates nothing when one exists. Only a centre with no circle
reaches `stateCircleOn(c, X, id)`, which adds the object and `param r_X > 0` in one step; `statingNamedCircle` and a
sector's hidden circle go through the same fact. A `circle-at` with an explicit `r` (the concentric `circle-at-O-2`)
is a creation with its own id and never looks anything up. `circleAtFacts` therefore emits `declare X · circle-at X`
and then the sentence's relations BY NAME — `tangent-of {circle: X}` for axes and lines, `tangent-circles {a: X}` for a
circle, a stated radius as `radius-of {circle: X}` last — each read off the resolved circle. `radiusSymbolsRead`
(`carriers.ts`) is the lock-facing invariant: every `r_X` in the register is read by something.

#### Tangent to a line ([ADR-AG-165](06c-decisions-analytic.md#adr-ag-165))

`tangent-line {centre, r, line}` is |a·x₀ + b·y₀ + c| / √(a² + b²) = r, with `line` a `TangentLineRef` (a curve or two
points). A bounded noun (`tangentTargets`, `BOUNDED_NOUN`) adds hinge rows on the foot:
With `t` the centre's projection parameter onto A→B, rows `max(0, −t)·|AB|` and `max(0, t−1)·|AB|` pull the touch point inside the side.
They are BOUNDS ([ADR-AG-178](06c-decisions-analytic.md#adr-ag-178)): `residualRows` tags `{ eq, bound }` and
`carrierDofOf` ranks `eq` alone (`CarrierSystem.equalitiesAt`, `freeRank`). Circle to circle is
`tangent-circle {a, b: CircleSide, branch}` behind `choice[external, internal]`, a side being `{centre, r}` (a centred
circle's point and radius) or `{circle}` (an equation circle, its centre and radius read off `curveAt` as `tangent-curve`
does; `constraintCurveRefs` lists it, `constraintRefs` only the point sides — [ADR-AG-306](06c-decisions-analytic.md#adr-ag-306)).
With an equation side, concentric is judged structurally at M1 (`centresAlwaysCoincide` over the probe environments); `readCircleSubject`,
`TANGENT_BRANCH` and `peelMods` read the sentence; `touch-point {a, b}` names the touch; `inDomain(d, v, floor)` with
`openBoundFloor` keeps a forced-zero radius off the bound.

**A second ring around one circle starts on the dual** ([ADR-AG-333](06c-decisions-analytic.md#adr-ag-333), #2512). In
`evaluateUncached`'s seeding, a triangle or quadrilateral every side of which is a bounded `tangent-line` to one centre,
stated after another such ring around that centre, seeds its free vertices at 2-D's construction: uneven touch angles
turned by the touches already on the circle × the golden angle (varied per configuration past 0), each vertex at the meet
of its two sides' tangents — an exact solution, so the joint descent does not depend on where the letters were sampled.
A lone ring keeps its sampled start. A start, never a verdict.

*Identifiers:* `line-l1` · `bounded: true` · `bound` · `tangent-circles {a, b, branch?}` · `parseCircleAt` · `one` · `pair` · `K ± r_K·û` · `r > 0` · `floor = 0`
*ADRs:* ADR-AG-167.

#### A circle computed from points ([ADR-AG-160](06c-decisions-analytic.md#adr-ag-160))

`circle-thru` has no freedom: `circleThruCurve` resolves it (through `circumcentre`), vacant when degenerate. Which
circle «BD קוטר» means is M1's `diameter-of` (`curveKindOf`; Thales on a three-point circle).

*Identifiers:* `does-not-exist` · `derived.ts` · `circleOnDiameter` · `diameter` · `derived-at(centre, midpoint)`
*ADRs:* ADR-AG-008.

#### A coordinate compared ([ADR-AG-161](06c-decisions-analytic.md#adr-ag-161))

`coord-compare {id, axis, greater, rhs: {point} | {value: Expr}}` and `axis-side` are selectors read by `compareOf`,
with `swappedStarts` restarts.

**A strict side is judged at the solver's resolution** ([ADR-AG-291](06c-decisions-analytic.md#adr-ag-291), #2230).
Every strict arm of `failingSelectors` reads one predicate, `sideOfBound(v, bound, scale)`: a value within
`SOLVE_RESOLUTION × scale` of its bound is ON it (`0`), so a strict comparison fails there and a closed one holds. The
scale is the quantity's own size: the figure's span (`spanOf`) for a coordinate, `max(1, |v|)` for a parameter order,
the sides for `acute`'s dot product, the direction's length for a slope sign (within it of horizontal or vertical,
no sign). The region quantities (`circleQuantity`, `circlePairQuantity`, `orderQuantity`) band where they are
measured, and `signHolds` reads their sign.

*Identifiers:* `failingSelectors` · `sideOfBound` · `signHolds`

**A point's side of a straight line** ([ADR-AG-310](06c-decisions-analytic.md#adr-ag-310), #2386) is `coord-compare`'s
family with the line's value at the point as the bound: `line-compare {id, line: points | curve, axis, greater}`.
`parseCompare` reads it after the point and axis forms (`POSITION_LINE_HE` / `_EN`, the operand through `direction()`).
`lineCompareLine` resolves the line in the configuration (two points, or `curveAtOf` for a named line); the judge
compares y_P with −(a·x_P + c)/b (axis `y`) or x_P with −(b·y_P + c)/a (axis `x`) through `sideOfBound` at `spanOf`.
`lineHasNoSide` (on `isVerticalLine` / `isHorizontal`) makes a y-side selector false on a vertical line and an x-side one
false on a horizontal line. The seeding loop folds a free subject to the named side, keeping its offset. In `derive`'s
selector arm, a failing `line-compare` whose line has no such side IN THE DRAWN FIGURE (`lineCompareNoSide`) is refused
`side-of-vertical` / `side-of-horizontal`, carrying the word (`side`); the parser refuses the same for an axis. M1
checks the subject, the line's points, and that a named operand is a straight line (`curveKindOf`); `selectorIdentity`
sorts a two-letter line's ends.

**A stated distinctness** ([ADR-AG-311](06c-decisions-analytic.md#adr-ag-311), #2395). `parseDistinct` (after the
parameter domains, before `parseCompare`) emits `distinct-of {names, noun?}`; M1 (`case 'distinct-of'`) resolves the
names: a written noun decides, else a name that is a point reads them all as points, else the first curve's kind.
Points lower to the existing `distinct`; circles and lines to `distinct-curves {ids}`, judged in `failingSelectors` by
`curvesCoincide` at `apartOf` (lines: unit normals within `SOLVE_RESOLUTION` and the figure centre's foot on one within
`apart` of the other; circles: centres and radii within `apart`). No mover: `drawableAt`'s walk finds the other roots.
`selectorIdentity` sorts both kinds' ids.

*Identifiers:* `distinct-of` · `distinct-curves` · `parseDistinct` · `curvesCoincide`

*Identifiers:* `line-compare` · `lineCompareLine` · `lineHasNoSide` · `lineCompareNoSide` · `POSITION_LINE_HE` · `side-of-vertical` · `side-of-horizontal` · `SideWord`

#### An order between measures ([ADR-AG-216](06c-decisions-analytic.md#adr-ag-216), #1621 D3)

An order lowers to `sign {q: {k: 'order', left, right}, positive, closed?}` (`OrderSide`); `parseOrder` reads it,
`orderQuantity` judges it (`evalLengthExpr`, `angleAt`, `signHolds`), `seedOrder` seeds it. `HE_POINT` reads
`ה?(?:נקוד(?:ה|ות)|קו?דקוד)`.

*Identifiers:* `evaluate.ts` · `left − right` · `length` · `LengthExpr` · `value` · `positive` · `closed` · `parseCompare` · `u ∈ [0.15, 0.65]` · `orderMints` · `lengthRefs` · `HE_COORD` · `HE_RHS_COORD` · `COMPONENT_HE` · `BISECTORS_MEET_HE` · `PERP_FOOT_HE`

### The circle the figure has ([ADR-AG-193](06c-decisions-analytic.md#adr-ag-193), #1619 B1, #1598)

Spellings lower in the parser (the frame's `centreClauses`, `sharedSubjectClauses`, `elidedSubjectClauses`,
`pointClauses`); references are M1 facts — `on-kind`, `centre-of`, `via-centre`, `circle-region`, `radius-length` —
resolved through `circleByName`, `centreRuleOf` / `centreIdOf`, with regions as `sign` selectors
(`evaluate.ts circleQuantity`). `separatedFrom` tries `chordStarts` for the other root.

`centresOf` offers a centre only with a sentence the grammar reads back: the equation, the numeral, the ring form, or — for the figure's ONLY circle with neither numeral nor equation, of any kind — the contextual «P מרכז המעגל» (a lone `circle-thru` takes it first, every other kind after the ring forms, so no existing offer changes; [ADR-AG-338](06c-decisions-analytic.md#adr-ag-338), #2554). A sentence-drawn pair (`circle-pair<k>-1/2`) has no such sentence (D8 = B on #2552) and is the class guard's one declared exception.

*Identifiers:* `M(x,y)` · `ONE_OF_HE` · `incidenceOn(…).t === 'kind'` · `THRU_HE` · `tangent-circles` · `freeAngleOf` · `selectorFact` · `c.selectors` · `derive.nameCanonicalCentres` · `centresOf` · `pointAt` · `deflatedStarts` · `collapsedPairs` · `on-line` · `selectorsHoldAt`

### Inscribed and circumscribed: the sentence is the sentences it is made of ([ADR-AG-194](06c-decisions-analytic.md#adr-ag-194), #1619 B2, #1554)

`parseInscribed` reads both directions; the lowering composes `parseShape` and `parseClause(«מעגל <tail>»)`. The
incircle is a `CircleDef` (`incircle`, `incircleCentre`); side touches are `touch-at` / `side-touch`.
Both voices (#1975, [ADR-AG-275](06c-decisions-analytic.md#adr-ag-275)): `CYCLIC_ACTIVE_EN` and `INCIRCLE_ACTIVE_EN` read
the English active voice into `cyclicFacts` / `incircleFacts` (the circle's letter is the tail, as in «מעגל O»);
`CIRCUMSCRIBING_VERB_HE` takes the relative «שחוסם»; `INCIRCLE_RELATIVE_HE` reads «מעגל ש-ABC חוסם», whose subject
is the ring, into `incircleFacts`.

*Identifiers:* `parseShape(«<noun> RUN»)` · `acute` · `src` · `circleDefPoints` · `tangent-line` · `diameterClauses` · `parenClauses`

#### Not here

Binding «חסום במעגל» to an existing circle; the right-trapezoid ruling.

#### The quadrilateral's incircle centre, the side list, the sentence with no letters ([ADR-AG-242](06c-decisions-analytic.md#adr-ag-242), #1554)

`incircleCore(v, centre?)` is the only incircle lowering (`incentre`, `incircle-centre`), wrapped in
`the-circle { match: { centre } }`; side lists close a ring (`touchedRing`); `unletteredInscribed` letters a
letterless sentence.

*Identifiers:* `the-circle { match: inscribed }` · `incircleFacts` · `circleSubjectFacts` · `incircleCore` · `VERTEX_SENTINELS` · `lowered`

#### Not here (ADR-AG-242)

Four one-side lines stay a solved `circle-at`.

### Tangency at a point, the tangent object, chords ([ADR-AG-195](06c-decisions-analytic.md#adr-ag-195), #1619 B3, #1430)

`Direction` gains `{ k: 'radius', circle, at }`; `applyTouchAt` lowers a touch to `on-curve` plus `⊥`;
`tangent-line-at { at, circle? }` builds the tangent object (`isTangentObject`, `readTangentNoun`);
`tangent-curve { circle, line }` shares `lineTangencyRows(centre, radius, line, pair)`; chords use existing facts
(`parseChord`); tangents from a point add `fromPointVerb` ([ADR-AG-233](06c-decisions-analytic.md#adr-ag-233)).

*Identifiers:* `dirVector` · `dirRefs` · `at` · `tangent-of { …, at }` · `on-curve(at, circle)` · `relation ⊥ (radius, target)` · `peelTouchList` · `ordered` · `touchFacts` · `line-at { id: tangentLineId(at), through: at, dir: radius, perp: true }` · `tangent` · `tangent-eq` · `parseTangentObject` · `tangent-axis` · `parseCircleFamilies` · `touchAt` · `toolPoint('touch', 'from-P…')`

### The contextual circle: one binding for every sentence about «המעגל» ([ADR-AG-196](06c-decisions-analytic.md#adr-ag-196), #1633, #1619)

`the-circle { create, about, match? }` is the one contextual-circle fact; M1's `theCircle(c, match)` binds, creates or
refuses; `circle-eq { circleId, eq }` states an equation about it.

*Identifiers:* `CIRCLE_SENTINEL` · `match.centre` · `match.eq` · `applyAll` · `resolveCurve` · `point(centre, cx, cy)` · `radius-of(circleId, r)` · `factsWithin(f)` · `submit` · `tangent-of { at }`

### A circle named by its ring; a diameter on any circle; the panel prints no tool symbol ([ADR-AG-203](06c-decisions-analytic.md#adr-ag-203), #1659, #1665, #1663)

`engine/names.ts` owns `⊙<ring>` / `○<ring>` (`describedCircleName`); the frame folds the prose (`describedCircles`)
and slots read `CIRCLE_NAME`.
M1's `circleByName` decodes a described name with `describedCircle`: `⊙` = the circle every vertex is ON (a defining point of a non-incircle `circle-thru`, or an `on-curve` incidence), `○` = the `incircle` `circle-thru` of that ring (`ringId`) or the circle stated tangent to every side (`statedTangentToSide`).
A diameter works on any circle (`diameter-of` → both ends `on-curve` plus a radius `relation`); `openCurveText` prints
`—` for a `θ_` symbol (`readsToolSymbol`).

**No ring typed ([ADR-AG-335](06c-decisions-analytic.md#adr-ag-335), #2545):** the frame folds an argument-position «במעגל החוסם [את המשולש]» / "of the circumcircle" to the letterless name «⊙◌» / «○◌» (+ the noun's size, `letterlessCircleName`); `describedCircle` reads it as the figure's one polygon's circle, bound only when it is the figure's one circle, and `statingNamedCircle` never creates it. `submit.ts` answers a letterless name the figure cannot bind with the not-handled verdict it gave before.

*Identifiers:* `readDescribedCircle` · `DESCRIBED_CIRCLE_ALT` · `RING_OF_FIGURE` · `letterlessCircleName` · `centreOfCircle` · `centre-of { circle }` · `relation parallel (points a b) (radius host a)` · `openCurveText(construction, id)` · `readsToolSymbol` · `isDirectionSymbol`

### Circles a sentence draws; two circles named by order ([ADR-AG-219](06c-decisions-analytic.md#adr-ag-219), #1622 E3, #1693)

`circles-about { slots, about }` resolves `new` / `named` / `the` slots at M1; position relations are `Quantity`
`circles { a, b, rel }` selectors, drawn by `relateCircles`; two fresh circles are named by order (`namingByOrder`).
Every two-circle crossing sentence lowers through one helper, `twoCircleCrossing(slots, a, b)`; the plural subject
(«המעגלים O ו-P נחתכים …», `pluralCircleCrossing`) is read by `readCircleSubject`, the tangency family's subject reader
([ADR-AG-300](06c-decisions-analytic.md#adr-ag-300), #2108). The plural tangency with no names («(שני) המעגלים משיקים …»)
lowers the same way: `circles-about { slots: [the, the] }` over `tangent-circles { circles }` (the pair by id), so none
draws the pair and any other count asks. `normaliseSymmetric` reads an external `tangent-circle`, a tangency `choice` of
both branches and a `touch-point` as symmetric (an internal tangency is not), so `interchangeable` names a tangent pair
by order. `centre-of { eq, ofPair }` with no curve of that equation names the centre on `circleToName`'s circle
(`namingByOrder`) and gives it the equation, asks on `ask`, and creates on none
([ADR-AG-322](06c-decisions-analytic.md#adr-ag-322), #2397).

A common tangent is the fact `common-tangent { a, b, circles, onLine?, kind? }`; M1 decides where it touches. When the
circles' stated touch point (`touchPointOf`, the `touch-point` derived point) is a letter of the pair, lies on the pair's
line (`footOnPair`), the pair has only the touch tangent of the stated kind (`pairPositionOf` is `int-tangent` and the
kind is not internal, or `ext-tangent` and the kind is internal), or another line puts it there (`onLine`), it lowers
as the tangent at that point; otherwise `a` touches the first circle and `b` the second
([ADR-AG-312](06c-decisions-analytic.md#adr-ag-312), #2385). `onLine` is written by `statedOnCommonTangents` in `fold`
from EVERY other admitted line, in any order: the `on-line-2pt` incidence and the `at` of a `tangent-of` over the
pair's points (an earlier «T על AB» lands after the line that declares A and B in the deferral fixpoint; a later one
pins the drawn tangent). When `onLine` alone decided the touch, M1 says so (`touchByOnLine`), and `reDecidedBy` records
each later contributing line whose facts came out `known` as `narrowed`, so it records instead of «already known»
([ADR-AG-321](06c-decisions-analytic.md#adr-ag-321), #2418).
The common tangent is a LINE: M1 draws it through `name-line { a, b, name }` (the sentence's name, «הישר l משיק …»
`namedCommonTangent`, or the pair's), the `line-at` through a along a→b, listed by its name. `name-line` («נסמן את הישר
PQ ב-l», `parseNameLine`) re-names the figure's line over the pair (`lineOverPair`), re-identifying it as `lineIdOf(name)`
with its references (`replaceId`), or draws the line on a segment. The `axis-cut { line, axis, greater }` selector
(`parseAxisCut`) is judged in `failingSelectors` from the line's triple (`lineTriple`): −c/b on the y-axis, −c/a on the
x-axis, strict through `sideOfBound` ([ADR-AG-313](06c-decisions-analytic.md#adr-ag-313), #2392).

*Identifiers:* `types.ts` · `CIRCLE_SLOT_SENTINELS` · `touchedCircleFacts(src, id, r?)` · `circle-new<k>` · `circle-pair<k>-1` · `-2` · `tangent-of { circleId, at }` · `beyond` · `toolLetters.ts` · `apart` · `inside` · `larger` · `cross` · `centres-side { a, b, p, q }` · `params { e }` · `circlePairQuantity` · `coord` · `θ_<id>.k/s/g/m` · `θ_<id>.r` · `circleToName` · `interchangeable` · `twoCircleCrossing` · `pluralCircleCrossing` · `readCircleSubject` · `common-tangent` · `touchPointOf` · `statedOnCommonTangents` · `onLine` · `touchByOnLine` · `reDecidedBy` · `describeDrawnCircle` · `standardCircleParts` · `ofPair` · `PAIR_ORDINAL` · `normaliseSymmetric` · `name-line` · `lineOverPair` · `replaceId` · `axis-cut` · `lineTriple` · `namedCommonTangent` · `parseNameLine` · `parseAxisCut`

### Common tangents ([ADR-AG-314](06c-decisions-analytic.md#adr-ag-314), #2390)

`common-tangent { circles, family, name }` is a closed-form line from two circles (`engine/commonTangents.ts`,
`commonTangentLine`): unit normal n with n·u = (r₂ − r₁)/d (external) or −(r₁ + r₂)/d (internal), family `a` the tangent left
of the directed line of centres, `b` the right; `touch` the double root of a tangent pair within `TOUCH_TOLERANCE` (1e-6,
relative). 0 DOF, deps the two circles; a family a configuration lacks is a vacancy. M1 reads how the pair sits
(`pairPositionOf`: the stated `circles` selectors and `tangent-circle` branches, else two determined circles measured by
`positionOfCircles`, else `null`) and lowers `common-tangents` to `FAMILIES_OF[position]` and `common-touch-tangent` to
one `touch` (`statedTangent` admits a tangency of unstated kind). Names: the student's or `freeLineNames` (l1, l2, …, a
numeral taken in any notation by `nameReading`). The ask lane resolves the touch tangent by `touchTangentNoun`; the exam's
sketch line is `SKETCH_FRAME` in `scopeAnalytic.ts`.

*Identifiers:* `commonTangents.ts` · `common-tangent` · `CommonTangentFamily` · `commonTangentLine` · `TOUCH_TOLERANCE` · `FAMILIES_OF` · `PairPosition` · `positionOfCircles` · `pairPositionOf` · `statedTangent` · `circleAtProbe` · `freeLineNames` · `common-tangents` · `common-touch-tangent` · `commonTangentSet` · `touchTangentNoun` · `SKETCH_FRAME` · `no-common-tangent` · `errNoCommonTangent`

**The unlettered common tangent, the kind as its definition, the named touch ([ADR-AG-337](06c-decisions-analytic.md#adr-ag-337), #2553).**
`unnamedCommonTangent` reads «(ה)משיק (משותף)? (חיצוני|פנימי|אלכסוני)? (משותף)? <two circles>», optionally led by «הישר l»,
and lowers to the same `commonTangentFacts` as «AB משיק משותף …» (ADR-AG-313) with the touches as `toolPoint('vertex', …)`
placeholders (line-scoped, so a second sentence mints C, D). «משותף» or a kind word is required. `NAMED_TANGENT_HE/EN` take
an optional kind. The definition clause «ש(שני) המעגלים נמצאים באותו צד / מצדדים שונים שלו» is folded into the kind word by
`foldTangentSide` at `orthography` (`frameAnalytic.ts`, copied from 2-D's `src/parser/tangentSide.ts`, which `normalizeUtterance` calls). `namedTouchPoint` reads
«X נקודת ההשקה של <line> עם (ה)מעגל <ref>» through `viaCanonical` as «הישר <line> משיק למעגל <ref> בנקודה X».

*Identifiers:* `unnamedCommonTangent` · `UNNAMED_TANGENT_HE` · `UNNAMED_TANGENT_EN` · `namedTouchPoint` · `TOUCH_NAME_HE` · `TOUCH_NAME_HE_LAST` · `TOUCH_NAME_EN` · `foldTangentSide`

**The exam's pair sentences ([ADR-AG-336](06c-decisions-analytic.md#adr-ag-336), #2552).** «שני מעגלים שרדיוס כל
אחד מהם r» is the `שני מעגלים` rule's pair with both slots `{ k: 'new', r }` (`radiusOfSize`'s value slot). «מרכז המעגל
הראשון / השני הוא X(a,b)» (`pairCentreAt`) lowers to `centre-of { id: X, ordinal: 1 | 2, create }` and the point
sentence «X(a,b)»; M1 names the unnamed `circle-pair<k>-<ordinal>` member's centre by `namingByOrder`, answers `known`
for a member already centred on X and `already-named` for one centred on another letter, and with no pair reads the
fact as without the ordinal. `segmentsOf` and the `UNWRAP` table take «ו» before «מרכז» as a sentence opener, so the
exam's joined sentence is cut and read as the two.

*Identifiers:* `pairCentreAt` · `PAIR_CENTRE_HE` · `PAIR_CENTRE_EN` · `centre-of.ordinal` · `segmentsOf` · `UNWRAP`

### The two tangents meet; the meet verbs; a floor that does not collapse with the figure ([ADR-AG-213](06c-decisions-analytic.md#adr-ag-213), #1620 S7)

Every spelling lowers to the canonical crossing of two tangent nouns (`readTangentNoun`, `tangentsMeet`,
`crossing-kind`). `openBoundFloor(at, env, syms, sampled)` keeps the sampled scale; a whole-figure collapse after the
solve reports the last constraint unsatisfied (Amendment 1).

*Identifiers:* `submit.ts` · `on-curve(D, tangent-<at>)` · `TANGENT_CIRCLE_HE` · `MEET_VERB_HE` · `AT_POINT_HE` · `sharedCircle` · `crossing-kind { kind: 'tangent', pieces: true }` · `kind: 'tangent'` · `through` · `noHost(…, 'line', n, 2)` · `SOLVE_RESOLUTION × max(figureScale(at, env, syms), sampled)` · `figureScale` · `figureScale(solved) < SOLVE_RESOLUTION × figureScale(sampled)` · `sampledEnv` · `seeded` · `subjectIdsOf`

### One meet frame; a line-object as an operand ([ADR-AG-224](06c-decisions-analytic.md#adr-ag-224), #1715)

- `meetFrame` reads «… נפגשים בנקודה E» through the canonical crossing; the verb draws its operands
  (`operandPieces`, [ADR-AG-241](06c-decisions-analytic.md#adr-ag-241)).

- **`lineObjectOperand`** reads a line-object noun phrase through `parseClause`, the same rule that reads it as a sentence. It puts the point on the line that sentence built, using one table: `bisects` → `p`; `cevian-of` → apex–foot; a piece ending at a derived point → that piece's line; `line-at` → `on-curve`.

- «האנך» named in full builds when absent ([ADR-AG-229](06c-decisions-analytic.md#adr-ag-229)).

*Identifiers:* `pieceFacts` · `draw: true` · `{ t: 'object', facts }` · `on-kind perpendicular` · `foot.mint`

### Lengths, angles, crossings and congruence at 2-D's verdict; the length variable ([ADR-AG-218](06c-decisions-analytic.md#adr-ag-218), #1622 E2)

A letter in a length is a free length, never x or y (`planeLetterLength` → `length-xy`,
[ADR-AG-222](06c-decisions-analytic.md#adr-ag-222)); congruence and similarity lower to `length-eq` / `angle-ratio`
(`parseCongruence`); crossing segments are `segments-cross`.

*Identifiers:* `AB ∥ CD` · `chainClauses` · `restatedClauses` · `bare`

### A Greek angle name is a parameter; tan and cos are measures of the angle ([ADR-AG-215](06c-decisions-analytic.md#adr-ag-215), #1621)

A Greek letter is a `SYMBOL_RE` symbol, free through `paramRegister`, its sample narrowed by `impliedRange`; «α = 30» is
`param-eq`. A relation between parameters the figure uses («R = 2r», «k = 2t», «r:R = 1:2» as q·X = p·Y) is `param-rel
{left, right}`, evaluated (L − R)/max(1, |L|, |R|), read by `parseParamRelation` after the Greek pin; a symbol nothing
uses is `not-handled` at M1 ([ADR-AG-307](06c-decisions-analytic.md#adr-ag-307)); tan and cos ride the `angle` row as `measure?: 'tan' | 'cos'`.

*Identifiers:* `sampleEnv` · `value: α` · `measure-angle` · `narrowedDomain` · `(env[sym] − value)` · `parseParamValue` · `vertex-angle.rhs.measure` · `(sin θ − t·cos θ)/√(1+t²)` · `(cos θ − c)/2` · `frameAnalytic` · `UNWRAP`

### Measures as givens: the ratio of two measures and the area notation ([ADR-AG-214](06c-decisions-analytic.md#adr-ag-214), #1621)

Every form lowers to `length-eq`: `areaNotation` rewrites `S_{ABC}`, and `ratioAsEquation` rewrites the prose ratio.
A value `p:q` becomes `q·X = p·Y`; any other value `r` becomes `X = r·Y`. The divider spelling «היחס בין AC ל-CB הוא 3:2» is `parseDividesInRatio`'s and is read earlier.

*Identifiers:* `S_ABC` · `parser/frameAnalytic.ts` · `d_{AB}` · `asEquation` · `AREA_TOKEN`

### Arcs, sectors and the diameter from a point ([ADR-AG-220](06c-decisions-analytic.md#adr-ag-220), #1622 E4)

`arc-sum` (`engine/solve.ts`) is one constraint for every arc measure, Σ kᵢ·⌢(aᵢbᵢ) = value, on the RESOLVED circle.
The second reader of a resolved circle's radius is `radius-ratio {a, b, k}` — r(a) − k·r(b), «היחס בין רדיוסי המעגלים … הוא
p:q» ([ADR-AG-307](06c-decisions-analytic.md#adr-ag-307)): a circle by centre, by equation or by points is one operand; the
unnamed «המעגלים» is a `choice` over both orders.
The parser's `arc-of { circle?, terms, value }` (`parseArcMeasure`) reads a copula as `=`, each side split into `k·arc` terms and at most one number.
**A drawn arc is an object.** `GeoObject` `arc { def: ArcDef }`, `ArcDef = { circle, from, to, pick: 'ccw' | 'minor' | 'major', away?, toward?, radii? }`. No freedom (`carrierOf` null, `symbolDeps` []), `objectDeps` its circle, ends and side point. `evaluate`'s `arcOf` reads the resolved `NumCurve` and the placed ends: `start` the angle of `from`, `sweep` the counter-clockwise turn to `to`, or the shorter / longer one, or — with `away` / `toward` — the half whose middle is on the far / near side of the chord from that point.
Circles under arcs are `hidden` (`stated: false`).

- Sector (`sector` fact, M1): the centre letter of a 3-run comes from 2-D's one reader, `arcRunRoles` (`shell/arcRun.ts`, ADR-AG-331), for the quarter circle and the sector alike. With a centre letter `v`, the circle `circleByName(v)` or a new hidden `circle-at-v` (free radius `r_v` > 0); the ends declared and put on it, `distinct`, `angle { v, a, b }` (the value, or 360 − value with `pick: 'major'`), the segments `va`, `vb`, the minor/major arc. With none (the bare quarter circle), `createdCircleFacts('circle-sector-<ab>', hidden)`, the ends on it, `relation perpendicular` between their radius directions (any other value: `arc-sum`), the arc with `radii`.

*Identifiers:* `curveAt(circle)` · `arcHost` · `noHost` · `onCircle` · `Figure.arcs` · `Scene.arcs` · `radii` · `<path>` · `createdCircleFacts(id, src, hidden)` · `unhidden` · `semicircleFacts` · `circle-thru diameter` · `diameterCircleId` · `arc { ccw from b to a }` · `away` · `toward` · `arc-mid` · `arc-side` · `toolPoint('diameter-end', F)` · `TOOL_LETTERS` · `end` · `ABCDEGHIJKLMNPQRSTUVWXYZ` · `diameter-end` · `DEGHIJKLMNPQRSTUVWXYZ` · `diameterNamingCandidates` · `materialize` · `declare E` · `on-line-2pt(E; F, centre)` · `on-line-2pt(E; a, b; bounded, crossing)` · `CENTRE_SENTINEL` · `parseCircleByDiameter` · `parseArcFamily`

### Shapes and points 2-D reads ([ADR-AG-217](06c-decisions-analytic.md#adr-ag-217), #1622 E1)

`parseShapesAndPoints` copies 2-D's rules, each lowered (`lowered(line, sentences, toolVertices)`) to canonical
sentences; unlettered shapes take `toolPoint('vertex', …)`; regular polygons are `regular-vertex` derivations
(`ShapeRow.regular`); `line-side` and `in-polygon` are regions; `engine/inscribe.ts` is 2-D's
`inscribePlacements`.

*Identifiers:* `Y₀…Y₉` · `NAME` · `toolPoint('vertex', 'v<i>')` · `vertex` · `autoVertexLabels` · `owner[i]` · `letteringCandidates` · `ShapeRow.regular = n` · `shapeDeclaration` · `derived regular-vertex { a: v0, b: v1, n, k }` · `givens` · `isGenericNoun` · `line-side { ids, a, b, same }` · `in-polygon { id, ring, inside, closed? }` · `ringRegion` · `ORDER_BETWEEN` · `windowFacts` · `all(on-line-2pt { bounded })` · `⊙ABC` · `○ABC` · `circle-thru-<sorted>` · `incircleId(ring)`

### An order between angle names; an angle named by a label; an area label introduces its region ([ADR-AG-221](06c-decisions-analytic.md#adr-ag-221), #1622 E5)

- `orderFacts` makes an order between Greek aliases a D3 `order` selector, seeded by `seedOrderParams`.

- **The angle label is D2's alias under a non-expression name.** `parseAngleLabel` reads the line WITH its verb in `parseLine`, before `unwrap` strips «נסמן». It lowers to the `angle` constraint with `value: sym ∠A1` (`angleLabelSymbol`, `engine/lengths.ts`) and the two arm segments (`ref: true`). The symbol carries `∠` because `A1` is a point's shape in this tree (`NAME`, `mentionsAny`). A Greek name goes through `parseClause('∠XYZ = α')`, so it is byte-identical to D2's reading.

- `alias-taken` refuses a taken label; `areaLabelRing` mints an area label's ring.

- **Its dual: one angle or segment, two letters ([ADR-AG-277](06c-decisions-analytic.md#adr-ag-277), #2054/#2061).** `measureRestatement` (`engine/statedMeasures.ts`, reading the stated value through `plainMeasure` / `isValueSide`, the canvas's own definition) compares a new `angle` / plain-segment `length-eq` value with the earlier stated values of the same target (vertex + unordered rays; unordered pair). It runs in `applyFact`'s `constraint` arm before the duplicate absorb: a fresh letter on a target whose letters all differ → `name-taken`; the same single letter with another coefficient → `measure-contradicts`. The error carries the earlier constraint (`against`); `derive` maps it to its line (`constraintFact` → `owner`) as `declared`, and `errorText` renders 2-D's sentences (`errAngleNameTaken[_vs]`, `errLengthNameTaken[_vs]`, `errMeasureContradicts`, held equal to 2-D's by `suite-vocabulary.test.ts`). **Two more members ([ADR-AG-295](06c-decisions-analytic.md#adr-ag-295), #2105):** a value with no symbol against an earlier NUMBER on the same target that differs (relative 10⁻⁹) → `measure-contradicts` (`value-conflict`); and the letter is read affinely (`affineIn`: `k·s + c` by evaluation at s = 0…3, so any spelling of one affine value is one reading) — exactly one of k, c changed → `measure-contradicts`, both changed → the solve. One `reasonText` gives 2-D's clause («|AB| = 5», «∠ABC = 50°», «∠ABC = 3α»). A stated right angle is a perpendicular relation, not an `angle` value, and is outside this reader.
- **A second radius ([ADR-684](06-decisions.md#adr-684), #2119).** The `radius-of` restatement on a centred circle (`applyFact`) returns `radius-contradicts { circle }` instead of `conflicting-restatement`; `derive`'s `radiusAgainst` names the latest earlier accepted line that sized that circle (a `circle-at` with a stated radius, or a `radius-of` resolving to it through `circleByName`) as `declared`, and `errorText` renders `errRadiusContradicts` — 2-D's `errors.restatedSize_said_vs`, byte for byte — or `errConflict` with no line to name.

*Identifiers:* `GREEK_ALIAS` · `evalExpr` · `foldSignSelectors` · `narrowedDomain(declared, impliedRange)` · `poly-<ring>`

### The equation of a cevian keeps its claim; position words are coordinate comparisons; an obtuse triangle is a region choice ([ADR-AG-222](06c-decisions-analytic.md#adr-ag-222), #1662 #1706 #1708)

`equationClaimFacts` keeps a cevian equation's claim; `POSITION_WORD_HE` / `POSITION_WORD_EN` lower position words
to `coord-compare`; `Selector` gains `{ kind: 'choice'; options: Selector[] }` for «משולש קהה זווית ABC»
(`obtuseChoice(ring)`); `asideClauses` reads asides.

*Identifiers:* `cevian-of` · `?? []` · `footOnPair` · `positionMeaning` · `assignmentAt` · `CHOICE_TRIES` · `OBTUSE_HE` · `OBTUSE_EN` · `ANGLE_ADJECTIVE_HE` · `POSITION_AXIS_HE` · `segmentsOf` · `errLengthXY`

### A trig given is an angle; sin is a choice between two roots ([ADR-AG-227](06c-decisions-analytic.md#adr-ag-227), #1719)

`sineAngle(at, value)` is a `choice` of two `angle` rows (`measure: 'sin'`); `drawableAt` keeps the drawn option
(`choiceOptions(c, choiceSeed)`); `statedMeasures` labels the option that holds (`holdsOn`); `trigAngles(constraints)`
feeds the panel's «זוויות».

*Identifiers:* `knownValue` · `obtuse` · `sin θ − v` · `resolve` · `panelKnowledge.angles`

## Solve

### The solve vector holds every unknown ([ADR-AG-144](06c-decisions-analytic.md#adr-ag-144))

`carrierSystem(c, env, { params })` builds the vector the solve moves — the free vertices (`ids`), then every register
parameter (`syms`) — and every residual is evaluated at `envAt(x)`, so a given can pin a parameter
(`(k+1)x+2y−12+5k=0`). **Two stages**: vertices with parameters at their sample first; parameters join only when that
does not converge, walked in the student's order, with an `accept` predicate for declared domains. The freedom cue is
rank over the joint vector (`figureDofOf`, `reportedDof`); the locus tracer asks for `params: 'fixed'`. The membership
residual (`curves.ts`) is signed; `solveLM` stops on a stall; `evaluate` is memoised per (construction, seed);
`figureSignature` signs used parameters (`usedSymbols`). A free direction (`Direction.free`) is a `line-at` angle; a
derivation about an existing point is `derived-at` for every `DerivedRule`; `curveByName` and `curveAtOf` resolve
curves and `line-at`s.

*ADRs:* ADR-AG-047.

### The resolver reaches the SOLVER too ([ADR-AG-091](06c-decisions-analytic.md#adr-ag-091))

"What line does this name denote" lives in `engine/lines.ts`, reached by the surfaces via `app/lines.ts` and by the
solver via `lineAtOf` (beside `curveAtOf`, handed to `residual`). A `null` residual is "cannot be judged at this
iterate", turned into `0` — safe only while transient (#1201).

### The crossing module’s tolerances ([ADR-AG-130](06c-decisions-analytic.md#adr-ag-130))

Three constants, each relative to the figure's scale (ADR-AG-021): `apart(figure)` = span · 1e-6 (is a point
there?), `CROSS_MIN_SINE` = 1e-6 (are two straights one line?), each with its measurement; `occupied()` and
`angleSine()` are the predicates, `meet()` calls the second; extent is `within`'s question.

**The extent is ONE ruler** ([ADR-AG-135](06c-decisions-analytic.md#adr-ag-135)): `extent.ts` owns `segmentParam` /
`withinSegment` and `drawnPieceOver`, shared by the rings, the bounded-crossing residual (ADR-AG-134) and the
promotion; it binds crossings only (`crossing`, `parseIntersection`).

**A pair's crossings have ONE order** ([ADR-AG-157](06c-decisions-analytic.md#adr-ag-157)): `crossing-order.ts`, read
by `nth` (`crossingsOf`), the `crossing-nth` selector and the seeding. A straight is a `Walk` (`walkThrough(from, to)`,
`walkOfCoefficients`).
`conicMeet` substitutes the walk into the canonical conic and returns EVERY root, `t` ascending, plus whether it is a touch. The order is taken before the extent: `crossingsOf` numbers the unfiltered roots and only then applies `within` and the occupancy test, so a side's single ring carries its line's number and a taken ring never renumbers its sibling.
**A SECOND READER of the seeding** ([ADR-AG-263](06c-decisions-analytic.md#adr-ag-263), #1917): the block after the
ordinal's reads the same `orderedCrossings` for every point with exactly TWO incidences and no ordinal, and starts it
on the root no EARLIER point holds — 2-D's `otherCrossing` ([ADR-045](06-decisions.md#adr-045) R8), ported as a start.
A root is taken when a point declared before it sits there within `apartOf`; a root the point's own statement excludes
is dropped by `withinSegment` (a bounded crossing) or by `failingSelectors` over its own `between` / `beyond`. It moves
the start only when a root was dropped and exactly one admissible root is left — otherwise the seed still chooses and
«הציגו תצורה אחרת» cycles.
An ordinal lowers to `crossing-nth {id, nth, pair}`, otherwise `crossing-distinct`. Two conics are ordered by the
reading direction ([ADR-AG-236](06c-decisions-analytic.md#adr-ag-236): `orderedCrossings`, `conicsMeet`), and the
duplicate fault names its operands (`incidenceWords`, `errCrossingAlreadyNamedOperands`). **Both crossings in one
sentence** ([ADR-AG-185](06c-decisions-analytic.md#adr-ag-185)): `bothCrossings` lowers to the two ordinal sentences
with `both: true`, judged by `meetsTwice`.

*Identifiers:* `operands` · `both`

### The noun decides the root, and a ring offers the sentence that denotes it ([ADR-AG-124](06c-decisions-analytic.md#adr-ag-124))

`bounded` on `on-line-2pt` seeds a side's crossing on the drawn piece (even seeds only), so the button still reaches
the other root, and a ring is offered only on the piece, its sentence saying «הצלע» (ADR-AG-048).

## Evaluate and the configuration pool

### The configuration search: validity, then preference ([ADR-AG-128](06c-decisions-analytic.md#adr-ag-128))

`drawableAt` alone chooses the shown configuration, sweeping four tiers: **preferred** (whole, every ring at least
`SPREAD_MIN_DEG` open, no stacked names — `separated`, `stackedPairs(f)`, `VISIBLE_FRACTION` of the `viewBox`,
ADR-AG-181), **whole** (selectors hold, nothing vacant, `ringViolation` clean, every given holds, and a thin ring
(`thinRingsOf`, `THIN_SIN_TOL`) survives a re-solve under `withToleranceFactor(TIGHT_TOLERANCE_FACTOR)` —
[ADR-AG-143](06c-decisions-analytic.md#adr-ag-143), ADR-537), **second best**, **fallback**. The top tier is opt-in
(only `derive`), so `isKnowledge` and `knownOptions` read what the tool would admit; `minInteriorAngleOf` decides
nothing. The best effort stays inside the domains ([ADR-AG-162](06c-decisions-analytic.md#adr-ag-162), `admissible`),
and `solvePreferring` prefers what the selectors accept ([ADR-AG-159](06c-decisions-analytic.md#adr-ag-159):
`separationMoves`, 2-D's `solutionAccepted` in `multiStartSolve`). The walk compares candidates' discrete assignments
(`choiceOptions`, the `assignmentAt` key): a preference never crosses one (ADR-AG-227), except that a whole first figure
which stacks two named points may open on a whole, separated candidate of another assignment (`crossSeparated`, below
the same-assignment separated tier; [ADR-AG-302](06c-decisions-analytic.md#adr-ag-302)).

*Identifiers:* `crossings.apart()` · `a > 0`
*ADRs:* ADR-486.

### A noun's exclusive condition is part of its ring ([ADR-AG-189](06c-decisions-analytic.md#adr-ag-189), #1627)

Ring promises — simple, open, and not-a-parallelogram for the trapezoid family (`ONE_PARALLEL_PAIR_NOUNS`,
`PARALLEL_SIN_TOL` = `COLLAPSED_SIN_TOL`) — are `engine/rings.ts` `ringViolation(vertices, noun)`. `ringFaultsOf`
records them and `drawableAt`'s `whole()` rejects them, but the exclusion is never refused (Amendment 1, 2-D ADR-165):
`app/shapeWarnings.ts` `shapeWarningsOf(lines, d)` reads `d.figure.ringFaults` and `App.tsx` shows a shared
`Banner kind="notice"`. A second NOUN is not a given (ADR-AG-260, #1926): `engine/shapes.ts` `nounsExclude(a, b)` —
`kindRelation` over each row's `kind`, the shared lattice ([ADR-W-131](06w-decisions-workspace.md#adr-w-131)); the ring is
the meet of its `noun` and every later narrowing noun (`also`); an implied noun returns `restates` and the fold takes that
line's `definition` constraints as held (ADR-W-133) —
and `applyFact`'s polygon arm refuses the later declaration `shape-excluded { actual, stated }` before M1 absorbs it
(`errShapeExcluded`).

*Identifiers:* `current` · `freeCoord` · `{A: G}` · `{A: B, B: A}` · `rewriteLineMap` · `*-not-typed` · `letter → seed name` · `derive(lines, seed, seedNames)` · `dispatchRename` · `dispatchSwap`

### A declared shape the givens force narrower is said ([ADR-AG-276](06c-decisions-analytic.md#adr-ag-276), #1996)

`app/narrowing.ts` `narrowingNotesOf(lines, d)` is the analytic adapter of `shell/narrowing.ts` (ADR-W-129). The declared
kind is `SHAPES[…].kind` of a polygon whose noun the line's OWN text names (`normalizeShapeNoun` / `EN_SHAPE`) — so
«ABCD חסום במעגל», which lowers its ring under the default «מרובע», declares nothing. Forced kinds are read over the
admitted figures of `drawableAt(c, 0..POOL_SIZE-1)`, only once `configurationPool(c).complete()`; a deferred pool
reports pending and returns nothing, so `poolScheduler`'s re-render brings the note. Subset trials re-derive the
anchors plus the chosen lines, settled "not forced" at the first counterexample. `App.tsx` computes it in a passive
effect after paint (never in render) and shows one `Banner kind="notice"` per note under the shape warnings; the
given text is the line as the page shows it (`rowShownText`, below).

**A row's shown text** ([ADR-AG-326](06c-decisions-analytic.md#adr-ag-326), #2424). `rowShownText(line, spokenFor[i])` in
`store/useAnalyticStore.ts`, beside the marker's writer `spokenPart` and reader `spokenSentence`: the stored sentence
when it carries no part marker (a one-line fallback answer, #1297), else the machine line itself. The givens list, the
shape warning and the narrowing note all read it; the marker stays stored for the export, rename and saves.

### Only valid configurations are evidence ([ADR-AG-197](06c-decisions-analytic.md#adr-ag-197), #1642, #1638, #1635, #1634, #1539)

A configuration the givens contradict is never knowledge. Every static discrete axis is one digit of one odometer
(`engine/discreteAxes.ts` `assignmentAt`, [ADR-AG-302](06c-decisions-analytic.md#adr-ag-302)): constraint `choice`s in
construction order (nested ones depth first on the chosen branch), then region `choice`s, then the `crossing-nth { both }`
pairs, radix 2 and slowest; `resolvedAt` resolves all three from it. `evaluateTryingChoices` walks the next
combinations at the same samples (`Figure.choiceSeed`, `choiceSeedOf(c, seed)`; `max(min(total, CHOICE_TRIES), largest n)`
of them). A parameter pin's roots are a DYNAMIC axis ([ADR-AG-303](06c-decisions-analytic.md#adr-ag-303)): `engine/pinRoots.ts`
`walkPins` finds each vertex-free 1-DOF pin in application order (triangular), `scanRoots` brackets its residual over
the sampler's domain clipped to ±`pinReach` (`GRID` points uniform in asinh; sign change or touching minimum, kept at
`ROOT_EPS`), and `evaluateUncached`'s `seedPinRoots` seeds the chosen root before stage one — seed 0 the root nearest
its sample, other seeds `ROOT_STREAM`; `Figure.rootKey` joins `drawableAt`'s assignment comparison; `resampledInside` frees a
stalled parameter; `admittedToPool(f)` (`selectorsOk`, no `hardRingFaults`) feeds `admittedOf(c, seeds)`, and
`starved(figs)` (fewer than `MIN_WITNESSES` pictures, `sameConfiguration`, `signatureParts`) withholds a value;
`derive` refuses failing selectors after the search.

*Identifiers:* `seed + 1 … seed + n − 1` · `locus.ts` · `figureDofOf > 0` · `at + (at − sample)·(0.25 + 1.5u)` · `carrierSystem(…, { params: 'fixed' })` · `judge` · `holdsInEveryConfiguration` · `{ known: false, starved }` · `zeroFree` · `anotherConfiguration` · `PENDING_FLOOR = 3`

#### Not here

Seeding a derived point's region through its parents; exact root enumeration.

### Where a fault is raised, and why ORDER matters there ([ADR-AG-129](06c-decisions-analytic.md#adr-ag-129))

`derive` raises faults in a fixed order and gives a line one message, so the ring arm (#1170) runs after the vacancy
loop and skips lines already in `faults`. A collapse the givens force is `polygon-collapsed`
([ADR-AG-247](06c-decisions-analytic.md#adr-ag-247): `Figure.collapsedRings`, `collapsedByGivens(c, seed)`,
`errPolygonCollapsed`). A fault is also the refusal: `decideSubmit` refuses when one lands on the new line.

**The vacancy arm reads the OBJECT's freedom, and a stated collinearity is a proof** ([ADR-AG-296](06c-decisions-analytic.md#adr-ag-296), #1963).
A `vacant` object is refused `does-not-exist` when `Figure.freedomOfRead` over its inputs (`inputsOf`, `carriers.ts`:
the points it is transitively built from and the symbols on that walk) is `0`; unmeasured falls back to the whole
figure's `reportedDof`. Beside it, every `circle-thru` through three points asks `forcedCollinear` (`collinear.ts`), a
proof read off the construction alone: carriers from `on-line-2pt`, the `midpoint` constraint, `on-line`, `on-curve` on
a line, `derived-at`, and the derived `midpoint` / `side-touch` / `foot` / `diagonals` rules. A proof refuses the line
that completes it `forced-collinear` (`declaredLines`, `collinear`, `errForcedCollinear`), vacant or not; a line another
arm refuses keeps that refusal alone.

**The pinned-ring arm reads the RING'S freedom, never the figure's** ([ADR-AG-249](06c-decisions-analytic.md#adr-ag-249), #1929).
`evaluate` gives each HARD ring fault `RingFault.ringDof` = `freedomOf(c, sys, x, read)` with `read` = the ring's vertex
coordinates: `figureDofOf` − `freeRank` over the equations plus `read`'s rows, so freedom elsewhere cancels and a derived
or line-pinned vertex counts as what it is. It is a lazy, non-enumerable getter (only the figure `derive` keeps is
ranked; a discarded walk candidate pays nothing). The arm fires on `hardRingFaults(figure)` with `ringDof === 0`.

**…or with the walk's evidence that the ring is crossed wherever the givens hold** ([ADR-AG-250](06c-decisions-analytic.md#adr-ag-250), #1927).
`drawableAt`'s walk reads every candidate it already evaluates: one whose givens, selectors and named objects hold is
*valid but for its rings*; per declared ring it counts the candidates drawing it crossed and notes any drawing it simple
(a flat one answers neither way). When nothing is whole, a ring crossed in at least `FORCED_RING_FLOOR` (4) and simple
in none is `Figure.forcedCrossed`, and the figure returned is a copy of the first valid candidate drawing it crossed
(never a fallback whose solve stopped short). **Search first** ([ADR-AG-256](06c-decisions-analytic.md#adr-ag-256), #1939): before a
ring is called forced, a ring whose shape is not affinely fixed (`shapeDof !== 0`) in a figure with a free parameter
sends the walk round again with the parameters' reach widened (`evaluate(c, seed, reach)`, `RING_REACHES` 4/16/64 ×
`RING_REACH_TRIES` 8 — a deterministic work budget): a whole figure found there is the one drawn, and a ring drawn simple
anywhere is not forced. Once that search has failed, `forcedCrossed` is refused whatever the ring's `shapeDof` (the
superseded gate below required the affine proof). Samples are not proof, so the arm also needed `RingFault.shapeDof === 0`:
the freedom of the ring's affine coordinates over its own widest vertex triangle, by `tangentFreedomOf` (projection onto
the constraints' tangent space, tolerance relative to the read's own scale — a stacked `freeRank` read round-off as
freedom). An affine map keeps every proper crossing, so 0 proves it. The arm adds those `crossed` faults; `decideSubmit`
re-attributes a fault that appeared to the submitted line, so the ring-first order refuses the shape line.

**…or STRUCTURALLY, with no figure at all** ([ADR-AG-261](06c-decisions-analytic.md#adr-ag-261), #1991). The walk's evidence
needs a candidate whose GIVENS hold, and a second ring's own noun can be exactly what cannot hold — «ריבוע ABCD» ·
«מקבילית ACBD» leaves `forcedCrossed` empty and the crossed ring's `ringDof` at 4, so both arms above are silent and
«לא נמצאה תצורה» spoke for an order mistake. `derive`'s `ringOrderFault`, computed before the drop-one probe's arms,
groups the DECLARED polygons by their letter SET — the polygon id is canonical over rotations and reversals
(ADR-AG-259), so two ids over the same letters are two cyclic orders — and when any of them carries a noun that is
convex whenever simple (`convexWhenSimple`, read off the row's givens: a parallel pair, a right angle, or
`equalSides`; false for «מרובע» and «דלתון») the others cross in every configuration, because four points in convex
position admit exactly one simple cyclic order. The LATEST declaring line is faulted `ring-contradicts-noun`, and the
given-attribution arms stay silent on ADR-AG-240's rule, so the earlier shape line is not blamed for the other ring's
order. Search first is kept by the predicate, not by a budget: a dart-capable partner is never refused here.

*Identifiers:* `seed … seed + DRAWABLE_TRIES` · `shape` · `declared` · `degenerate` · `crossed` · `ring-contradicts-noun` · `convexWhenSimple` · `ringOrderFault` · `InputError`

### A forced coincidence is refused; a configuration-dependent one is not ([ADR-AG-125](06c-decisions-analytic.md#adr-ag-125))

A crossing on an existing point is refused by position only when no configuration separates them. Structurally, in
`parseIntersection` ([ADR-AG-116](06c-decisions-analytic.md#adr-ag-116),
[ADR-AG-140](06c-decisions-analytic.md#adr-ag-140)): one shared letter is `crossing-already-named`, both letters
`self-crossing`.

**The positional arm reads the PAIR's freedom, never the figure's** ([ADR-AG-254](06c-decisions-analytic.md#adr-ag-254), #1938).
It used to borrow the vacancy pass's whole-figure predicate (`reportedDof === 0`), which leaked exactly as the ring arm's
copy did (#1929): one unrelated free point left the figure 1–2 DOF and a second name was minted onto an existing point,
green. `evaluate` gives every figure `Figure.separationDof(a, b)` = `freedomOf(c, sys, x, read)` with `read` = the
separation `b − a` — lazy, memoised per unordered pair, non-enumerable, like `RingFault.ringDof` — and `derive` asks it
only of a pair it has already found within `near`, so a figure with no coincidence ranks nothing. `0` is "forced
together"; `> 0` and `undefined` (unplaceable) both keep the silence, because a false refusal is the worse defect.
On a determined figure it is 0 for every pair, so every figure this already refused is refused identically.

**The arm had a FALSE member, and the START is what removed it** ([ADR-AG-263](06c-decisions-analytic.md#adr-ag-263), #1917).
A crossing whose pair also passes through an existing point was seeded wherever its letter hashed, the descent landed on
that point, and the arm then called a coincidence forced that the other root disproved. The arm is unchanged; the
seeding above now starts such a crossing on the root no earlier point holds, so the arm sees the coincidence only when
no other admissible root exists (a tangency, a bounded piece holding only the named point, a chord whose both roots are
named) — and there its refusal is true.

**The STRUCTURAL member: a third crossing of a chord** ([ADR-AG-271](06c-decisions-analytic.md#adr-ag-271), #1893).
A point P carrying `on-line-2pt(P; a, b)` (any extent) and `on-curve(P, K)` with `curveKindOf(K) === 'circle'`, P neither a
nor b, where a and b are each on K **in every configuration**, is refused `third-crossing { line, a, b }` — #1834's ruled
sentence. "On K in every configuration" is one of two ways: `onCurveByConstruction` (`apply.ts`; a defining point of a
`circle-thru` that is not an incircle, or a stated `on-curve` incidence — the one predicate `describedCircle` also reads), or
`noFreedomReaches` (`carriers.ts`; no carrier, no symbol, no movable parent) for both the point and K **and** the point on K
at the drawn figure (`holdsOn`). No freedom gate: the predicate is a proof, not a sample — the rank cannot see it (the circle
can move, so `separationDof` is 1–2), yet no configuration separates the pair. Blamed on the latest of the four statements it
is made of; the line carrying it gets no `unsatisfiable` or `crossing-already-named` beside it, and the positional arm skips P.

**…and the tangent member** ([ADR-AG-272](06c-decisions-analytic.md#adr-ag-272), #1924). A point P carrying a straight
incidence ℓ (`on-line-2pt`, `on-line`, or `on-curve` on a line-kind curve) and `on-curve(P, K)`, K a circle, is refused
`tangent-no-second-crossing { point }` (2-D's `errors.tangentNoSecondCrossing`) when ℓ touches K only at a point Q declared
before P. Two ways, mirroring the chord member: **nothing can move** (`noFreedomReaches` for ℓ's objects, K and Q) and
`touchPointOf` (`crossing-order.ts`; the chord ℓ would cut is within `meetsTwice`'s `SOLVE_RESOLUTION` floor) puts the touch
within that floor of Q; or **by construction** — Q on K for good, Q on ℓ, and a stated `relation perpendicular` between ℓ
and K's radius at Q (`{radius, K, Q}` or K's centre and Q, via `centreIdOf`), or ℓ is K's tangent object at Q, or runs
through Q and a point on it. Same blame, one-fault-per-line filter and positional skip as the chord member.

**Both members reach every curve a line meets at most twice** ([ADR-AG-292](06c-decisions-analytic.md#adr-ag-292), #1909,
#1932). The gate is `maxCrossings('line', curveKindOf(K)) === 2` (`apply.ts`, the Bézout bound #1114 counts by) — a circle, a
parabola, an ellipse — and each fault carries the curve's kind (`curve`), which picks the noun: «המעגל / הפרבולה / האליפסה»
(`THE_NOUN_KEY`) in the chord sentence, «למעגל / לפרבולה / לאליפסה» (`TO_THE_NOUN_KEY`) in the tangent one. Three readings
the widening needs, all generic: `touchPointOf` on a conic reads the quadratic ℓ leaves in it (`lineQuadratic`, shared with
`conicMeet`) — the chord `√|disc|/|A|` under the same floor, scaled by `conicSize` — so it is TANGENCY, not "meets once": the
line parallel to a parabola's axis leaves no `t²` term and is never a touch. The touch is read first; K and Q stay
structurally fixed (`noFreedomReaches` — a plural's sibling letter the constraints pin is not "already there"), and ℓ is fixed
structurally **or** by the rank of its own position (unit normal and offset, via `straightWalkOf`) — `Figure.freedomOfRead`,
`freedomOf` over the solved configuration — so a point riding a fixed tangent («P על הישר l1») leaves ℓ fixed and the row is
refused, on a circle too. The by-construction tangency (⊥ the radius) stays circle-only by
nature: a conic has no radius, and analytic has no conic-tangency sentence.

*Identifiers:* `SOLVE_TOL` · `separationDof` · `freedomOf` · `freedomOfRead` · `onCurveByConstruction` · `noFreedomReaches` · `maxCrossings` · `third-crossing` · `touchPointOf` · `straightWalkOf` · `tangent-no-second-crossing`

## Knowledge gates

### The knowledge gate samples CONFIGURATIONS, not seeds ([ADR-AG-126](06c-decisions-analytic.md#adr-ag-126))

`figureSignature` and `distinctConfigSeeds` (`engine/evaluate.ts`) make configurations distinct pictures, called by
`isKnowledge` and by «הציגו תצורה אחרת».

*Identifiers:* `normalizedLine`

#### One configuration pool, completed after the render ([ADR-AG-180](06c-decisions-analytic.md#adr-ag-180), #1473)

Every gate reads **`configurationPool(c)`** — seeds 0..23, one per construction. On the page,
`configurationPool(d.construction).defer()` makes an unconfirmed value **pending** (`settled(fn)`, `askSettled`,
«בודק…»), and `app/poolScheduler.ts` completes the pool one seed per macrotask (never `requestIdleCallback`). The perf
lock counts `evaluateStats.uncached`; `curveFromEquation` is memoised (`__setConicMemo(false)`).

**The resolution arm reads the figure's scale.** `spread ≤ SOLVE_RESOLUTION · max(|value|, smallest span of the
figures read)` — `SOLVE_RESOLUTION` is a fraction of the figure's extent (the residuals are scale-normalised);
the smallest span, so one flung free point cannot widen it.

*Identifiers:* `{ known: false, pending: true }` · `scheduler.postTask` · `MessageChannel` · `setTimeout(0)` · `Expr` · `-0`

### One value gate; up to two values ([ADR-AG-226](06c-decisions-analytic.md#adr-ag-226), #1716)

`knownValues(c, read, size, { fillPool? })` answers known, pending, `options` (at most `MAX_LISTED_VALUES = 2`) or
open; `valueText` (`app/panelRows.ts`) prints a value or two through `shell/valueOptions` — «±2» for opposites,
else ascending, the row's name repeated before the second value when the caller passes it («AB = 2 או AB = 4»;
[ADR-AG-270](06c-decisions-analytic.md#adr-ag-270), #1867). The parameter rows are `paramRows(d, pk, fmt, words)`
(`app/panelRows.ts`, rendered by `App.tsx`): two-valued parameters whose pairwise joint `knownValues` read is again
two options are TIED, grouped by transitive closure and confirmed by one joint read, and print one vector row in the
point rows' form, the drawn option bracketed ([ADR-AG-304](06c-decisions-analytic.md#adr-ag-304)).

*Identifiers:* `Knowledge` · `knownCurveOptions` · `panelKnowledge` · `segmentKnowledge` · `fillPool: true`

### The panel's knowledge has one home ([ADR-AG-152](06c-decisions-analytic.md#adr-ag-152))

`panelKnowledge(d)` (`app/panelRows.ts`) decides once which values the panel prints as known, and the corpus
invariant "`reportedDof > 0` ⇒ something is unknown" asks it.

### A line's angle has one decision ([ADR-AG-154](06c-decisions-analytic.md#adr-ag-154))

`app/lineAngle.ts` `lineAngleOf` folds a direction to [0°, 180°), gated by `isKnowledge`, printed by `angleText`;
its ends are `engine/lines.ts`'s `isVertical` / `isHorizontal` with `VERTICAL_TOL`
([ADR-AG-202](06c-decisions-analytic.md#adr-ag-202)).

## Text, scene, labels and marks

### The diagonals are lines; an off-ink point's dashed extension ([ADR-AG-255](06c-decisions-analytic.md#adr-ag-255), [ADR-W-124](06w-decisions-workspace.md#adr-w-124), #1937, #1971)

- **The meet.** `diagonalMeet` (`engine/derived.ts`) is the crossing of the diagonal LINES. It is vacant only when the
  diagonals are parallel. ADR-AG-021's segment interval survives as a **preference** in `drawableAt`: a configuration
  whose meet is on both diagonals beats one whose meet needs an extension. That is the strength the old vacancy had,
  so a figure that can be drawn crossed still opens crossed and is judged as before.
- **Ruled 2026-10-10: the noun spelling draws the diagonals when the meet is off them.** `evaluate` asks `offInkExtensions` over the two diagonal spans alone. When a stretch is owed, it adds the diagonals the figure does not draw yet, under `segmentIdOf`, the verb spelling's ids, so the two spellings' figures are identical. Inside, #1751 stands.
- **The attribution.** A `meet-of` names its point on its own line in `derive`'s `lineOf`, so a vacancy of it is
  reported like any other named point and is never recorded silently.
- **The extension.** Decoration, like `constructionOf`: `evaluate` computes `Figure.extensions` from
  `engine/carryingLines.ts`, which covers the derived rules (exhaustive over `DerivedRule`) and the `on-line-2pt`
  incidences. It then applies `shell/offInk.ts` `offInkExtensions` over the figure's segments and stated lines.
  `buildScene` projects it to `Scene.extensions`, and `Figure.tsx` paints it dashed in the segment colour, always on
  and with no hit-target. 2-D's half is the same decision over its own graph (04 § "An off-ink construction point's
  dashed extension").

*Identifiers:* `diagonalMeet` · `diagonalMeetsCross` · `carryingLines` · `offInkExtensions` · `Figure.extensions`

### Notation has one owner ([ADR-AG-148](06c-decisions-analytic.md#adr-ag-148))

`app/curveText.ts` is the equation-notation module; `engine/expr.ts`'s `exprText` is the algebraic printer. Numeric
lines print through `lineText` via `curveEquationText` (zero terms dropped, unit coefficients suppressed, signs folded
— never `+ -3`); a stated `LHS = RHS` is held as `LHS - RHS` with no `- 0`
([ADR-W-053](06w-decisions-workspace.md)).

*Identifiers:* `format.ts` · `+ -12 + 5·k` · `RHS`

### A curve reads as an equation plus its properties ([ADR-AG-097](06c-decisions-analytic.md#adr-ag-097))

`curveParts(c: NumCurve) → { equation, details? }` (`src-analytic/app/curveText.ts`) is the one curve-text
decision: a circle `(x − h)² + (y − k)² = r²`, a parabola `y² = 2p·x`, an ellipse `x²/a² + y²/b² = 1`, each with
`details` (`DetailLine = { label?: DetailLabelKey; text }`, [ADR-AG-232](06c-decisions-analytic.md#adr-ag-232))
shown in the `<details>` disclosure (ADR-AG-094); numbers go through `fmtAnalytic`.

*Identifiers:* `describeCurve` · `equation` · `O(h, k), r` · `F(p/2, 0)` · `x = −p/2` · `x²` · `(x - 0)²` · `(x + 2)²` · `(x - -2)²` · `y² = x` · `y² = 1x` · `«משוואת …»` · `curveCentreLabel` · `curveFocusLabel` · `curveDirectrixLabel` · `curveFociLabel` · `r = …` · `a = …, b = …` · `<div>` · `detailRowText` · ` · ` · `detailsText`

### The tree's display formatter ([ADR-AG-084](06c-decisions-analytic.md#adr-ag-084))

`src-analytic/format.ts` is the one display formatter: `fmtAnalytic(v) = fractionText(v) ?? surdText(v) ?? fmtNum(v)`,
above `shell/format.ts`. `surdText` is 2-D's `exactFormOf` rational·√n search, copied (q ≤ 12, p ≤ 999, n ≤ 50
ascending; [ADR-AG-304](06c-decisions-analytic.md#adr-ag-304)). A number inside an equation goes through
`fmtCoefficient` (fraction, then `fmtNum`, never a surd): `curveText.ts`'s `fmt` and the locus equation; a curve's
details (centre, radius, slope, focus) are standalone and use `fmtAnalytic` (`val`).

*Identifiers:* `fmtNum` · `1.33` · `exactFormOf` · `cleanNum` · `p/q`

#### Recognition is honest only while it stays recognition

A fraction is RECOGNISED (relative `1e-6`, denominator ≤ 12) only for a value that passed `isKnowledge`.

*Identifiers:* `number` · `4/3` · `1.3333`

### Position decides notation ([ADR-AG-085](06c-decisions-analytic.md#adr-ag-085))

A coefficient is never printed as a fraction: `fractionClearingFactor` and `lineText` clear the row
(`-4/3x + y = 0` → `-4x + 3y = 0`). The conics have one printer per kind, `ellipseEquationText` and
`parabolaEquationText`, which both the panel (`curveParts`) and the locus row (`locusEquation`) call: a fractional
ellipse clears to whole numbers (`4x² + 9y² = 45`), a fractional parabola to `2y² = 5x`; whole-number conics keep the
canonical form ([ADR-AG-357](06c-decisions-analytic.md#adr-ag-357)).

*Identifiers:* `4/3x` · `4/(3x)` · `eqSrc = null`

### A display decision is measured in the figure's units ([ADR-AG-123](06c-decisions-analytic.md#adr-ag-123))

`term()` prints nothing when `fmt(|k|) === fmt(0)`.

**Verticality is asked relatively, and once.** `verticality(dx, dy) = |dx| / ‖(dx, dy)‖` is `0` for an
exactly vertical direction and `1` for a horizontal one, so `VERTICAL_TOL` means the same thing at every
scale — ADR-AG-021's rule, which this layer had not inherited. It lives in `engine/lines.ts` with
`isVertical` (a direction) and `isVerticalLine(a, b)` (a line, whose direction is `(−b, a)`), and the
trace, the explicit form, the slope number, the slope ask and the slopes panel all call it. The panel's
own predicate was the one that was right; moving it out is what makes the five surfaces agreeing a
property of the code rather than a coincidence anyone can break.

*Identifiers:* `1e-12` · `3.6e-9` · `-6` · `shifted`

### A display name in an LTR row ([ADR-AG-149](06c-decisions-analytic.md#adr-ag-149))

A display name mixing a Hebrew noun and a digit is isolated in the `ltr` equations row:

| helper | protects | emits | direction |
| --- | --- | --- | --- |
| `isolateLtrRuns` | a technical run inside an RTL paragraph | LRI … PDI | the fact list, the input preview |
| `isolateRtlName` | a display NAME inside an LTR row | FSI … PDI | the panel's equations row, the ask lane |
| `panelRowText` (`app/panelRows.ts`) | every Hebrew phrase in a composed data-panel row | FSI … PDI per phrase (via `isolateRtlName`) | every `ValueRow`, the curve-details line |
| `slopeRowText` (`app/panelRows.ts`) | the «שיפועים» row: its `t()` parts that already carry isolates | FSI … PDI around each WHOLE Hebrew part | the slope rows |

`namedRow(name, body)` (`curveText.ts`) is the one `name: equation` composer; `stripFormatControls` keeps isolates out
of the grammar and the store. Every panel row goes through `panelRowText` ([ADR-AG-199](06c-decisions-analytic.md#adr-ag-199)),
never nesting isolates.

*ADRs:* ADR-431.

### The canvas's bidi chokepoint ([ADR-AG-087](06c-decisions-analytic.md#adr-ag-087))

`buildScene` decides every label's text, and each channel passes one `lbl()` seam that isolates LTR runs.

#### Why not inject it

An injected isolator can be forgotten, so the kit lives in `i18n/bidi.ts`, re-exported by `i18n/index.ts`.

*Identifiers:* `SceneKnowledge` · `marks` · `loci` · `crossings` · `isolate` · `extraCore` · `i18n/`

#### What is deliberately left raw

`crossings[].sentence` round-trips into the parser and stays raw; ticks and point names are not composed.

*Identifiers:* `<title>` · `String(r)`

#### Where a stated length is written ([ADR-AG-223](06c-decisions-analytic.md#adr-ag-223), #1717)

`placeLengthLabels` places each stated length outward from its midpoint until clear (2-D's rule, copied), sharing
`POINT_LABEL`, `LENGTH_LABEL_FONT`, `TICK_LABEL`.

### The stated-measure layer ([ADR-AG-225](06c-decisions-analytic.md#adr-ag-225), #1714)

- **⚠ Ruled to change (2026-10-07, ADR-W-118 B2 · #1805):** a stated equality (two plain lengths, an `angle-ratio` with k = 1) draws no tick or arc at rest; it stays in the givens list, drawn only in an opt-in relations layer. The text below describes the code until that ships.

`engine/statedMeasures.ts` `statedMeasures(construction, origin, choiceSeed)` reads what a SENTENCE stated — a plain
length or an equality, an `angle` (or a `tan` / `cos` angle), a ⊥ knee (the cevian's at its FOOT, #1241,
ADR-AG-237), an `area`, an arc — and never a noun's definition (`Fact.definition`). It travels `derive` →
`Derivation.stated` → `buildScene(…, { stated })` → `Scene.stated`; `shell/marks.ts` (`rightAngleKnee`,
`angleArcPoints`, `markFitScale`) is the shared mark geometry ([04w](04w-design-shell.md)); `statedScene` places every
value in one `placeSceneLabels` call, each value bounded to its mark (ADR-AG-228).

**An area has two representations, one reader** ([ADR-AG-273](06c-decisions-analytic.md#adr-ag-273), #2031): the copula's
`area` and the measure equation's `length-eq` with one area term («שטח ABC = 12», and «נסמן את שטח ABC ב-S» restated as
«שטח ABC = S»). `plainMeasure` reads a side's single coefficient-1 length **or** area term; an area against a value side is
an `areas` entry, an area against an area or a length is a relation and writes nothing. Areas are keyed by the ring
(`ringKey`, rotation- and direction-free) through the same `keep` as lengths and angles; an entry whose value is one
free letter is marked `bare`, and the renderer writes it alone («S»), every other value as «S=…».

*Identifiers:* `render/scene.ts` · `alt` · `origin` · `{ num }` · `{ text }` · `statedText` · `App` · `ticks` · `labels` · `SceneSegment.label` · `FigureSegment.pinnedLength` · `pinnedLengths` · `wedgeBisector` · `equalTickSegments` · `unitOf` · `shell/__tests__/fixtures/mark-geometry-rows.ts` · `LabelRequest`

### The image carries no chrome ([ADR-AG-151](06c-decisions-analytic.md#adr-ag-151))

`render/Figure.tsx`'s click-only affordances sit inside `data-noexport` (FR-EX-3), locked by
`render/__tests__/clean-export.test.tsx`.

### The question export ([ADR-AG-269](06c-decisions-analytic.md#adr-ag-269), #1872)

`app/questionLines.ts` is the «נתון:» list «הורידו שאלה» hands the shared composer (`shell/export/questionDoc`): 2-D's
ADR-252 rules over this tree's facts — one line per submission (a fallback sentence's rows are one, read back through
the store's `spokenPart`/`spokenSentence` pair), muted rows out, scaffolding (`segment`, `line-2pt`, `declare`, a NEW
point's `on-line-2pt`/`on-curve` + `between`) omitted unless a later kept given refers to what it introduced. References
are every string a fact carries ∩ the active figure's object ids, so an over-read keeps a line and never drops one.
The App computes it once (`questionGivens`) for the button's gate and the document alike.

### One decision for the view after any change ([ADR-AG-190](06c-decisions-analytic.md#adr-ag-190), #1624)

The App's box effect (keyed on the drawn box and the seed) makes one call, `viewAfterChange(from, view, to,
change, surface)` in `render/view.ts`, whatever changed the figure: `change` is `'configuration'` when the
«הציגו תצורה אחרת» button set `carryFrameRef`, else `'figure'`. The function is pure box arithmetic.
It keeps the candidate (`carryWindow` after a press) when `boxContains(viewBox(to, candidate, surface), to)`, else grow it with
`viewShowing(union, to, surface)`; a figure that left the view returns `INITIAL_VIEW` (`figureIsVisible`).

*Identifiers:* `app/drawnBox.ts` · `max(halfY, halfX / aspect)` · `render/view.ts`
*ADRs:* ADR-AG-137.

### The canvas's click menus: a segment's display, a centre's letter ([ADR-AG-201](06c-decisions-analytic.md#adr-ag-201), #1653, #1598)

The store keeps `segStyle` per pair (`segKey`), saved and undoable, drawn by `Figure` through `segInk`; the shared
`SegmentMenu` and `LetterPopover` (`app/centreName.ts` `centrePopoverOps(offerId, state, actions, d)`,
`decideCentreName`, `decideCentreSwap`) handle a segment and an unlettered centre.

**Curves too** ([ADR-AG-297](06c-decisions-analytic.md#adr-ag-297), #2238). The store keeps `curveStyle` beside `segStyle` — the same
`{hidden?, dashed?}` map and the same `toggleSegFlag` / `cleanSegDisplay`, keyed by the curve's id — in the undo slice, the save
envelope and the persist trigger. A curve click resolves through `app/curveDisplay.ts` `curveMenuOf(figure, id)` (read off
`figure.curves`, so every curve-producing object kind is one target) and opens `SegmentMenu` with dashed wired only when
`curveDashable(kind)` (not a circle). `render/scene.ts` `curveInk(kind, display)` is the ink decision: `segInk` for a line or
conic, `solid` / `none` for a circle (a hidden circle also drops its centre cross). A letter change re-keys it by POSITION
(`relabelCurveStyle(style, before, after)` over the two derivations' drawn curves), because a curve id may carry letters or a hash.

*Identifiers:* `serialize` · `{hidden?, dashed?}` · `shell` · `cleanSegDisplay` · `knows.segStyle` · `SceneSegment` · `key` · `ink` · `solid` · `dashed` · `ghost` · `measurablesOf` · `centreOf` · `onCentre(offerId, screen)` · `onCrossing` · `nameInUse` · `centreSentenceOf(figure, offerId, letter)` · `centreLabelOf` · `label` · `decideSwap(auto, taken)`

## The app: submit, ask, locus

### The submit path's three answers ([ADR-AG-020](06c-decisions-analytic.md#adr-ag-020))

`App.submit` dry-runs the list with the new line: `faulted` refuses, `created` / `narrowed` record, `known` gives a
notice. The effect is decided once, at the apply boundary, and carried by `fold` and `derive`; `narrowed` exists
because `absorbed` hid two events.

*Identifiers:* `no`

### A refusal names the KIND it expected ([ADR-AG-085](06c-decisions-analytic.md#adr-ag-085))

`unknown-reference` carries `expected: RefKind` from the id (`refKindOf`). A near miss is named when it builds
([ADR-AG-234](06c-decisions-analytic.md#adr-ag-234)): `app/nearMiss.ts` rewrites the sentence (`withName`, `nameKey`),
and only a rewrite that records attaches `nearMiss: { suggest, existing }` (`errNearMiss`).

*Identifiers:* `existing` · `circle-Z`

### The ask lane ([ADR-AG-044](06c-decisions-analytic.md#adr-ag-044))

The panel's box asks; an ask is evaluated and discarded. **A thing is askable because it was sayable**: `app/ask.ts`
runs `parseLengthExpr`, the locus lead-ins live in `LOCUS_OF` above `EQUATION_OF`, and the answer passes
`isKnowledge`.

*Identifiers:* `שטח ABC` · `משוואת הישר ℓ1` · `משוואת המקום הגיאומטרי של P` · `המקום הגיאומטרי של P` · `מהו המקום הגיאומטרי של P`
*ADRs:* ADR-AG-141.

#### The resolver seam ([ADR-AG-088](06c-decisions-analytic.md#adr-ag-088))

`app/lines.ts`: `lineNamed(figure, name)`, `lineNamesOf(construction)`, `segmentName(construction, id)`; everything
enumerated resolves, normalised by the leading coefficient (not `hypot(a, b)`).

#### The measure grammar's operands ([ADR-AG-089](06c-decisions-analytic.md#adr-ag-089))

`parseLengthExpr` reads distance frames and decides roles from names: `A`, `A1` a point; `AB`, `l1`, `ℓ₁` a line.

*Identifiers:* `l1` · `ℓ₁` · `point + point` · `point + line`

#### A determined point's locus is a point set ([ADR-AG-136](06c-decisions-analytic.md#adr-ag-136), #1227 on #1259)

`LOCUS_OF` on a determined point answers `fact: 'points'` («נקודה · (4, 3)», `askPointOne/Two/Many`); a tangency's
cluster within `SOLVE_RESOLUTION` (`solve.ts`) is one point (`knownOptions`, `isKnowledge`); `SAME_VALUE_EPS` and
`apart()` ask a different question.

*Identifiers:* `fact` · `value: null` · `10·√SOLVE_TOL`

#### The exam's questions ([ADR-AG-316](06c-decisions-analytic.md#adr-ag-316), #2393)

The exam's question forms are read in front of the existing arms. Each new spelling resolves to the arm that already answered its twin:
- `COORDS_OF` (a point by «שיעורי») rewrites to the bare name;
- `PARAM_ASK` answers a symbol the register holds and reads, through `knownValue` → `valueText` (the panel's parameter row);
- `CIRCLE_CENTRED_AT` finds the circle whose centre is X (`centreIdOf`);
- `THE_CURVE` takes the one host of its kind (`hostsOf`, the radius role's rule);
- `EQUATION_OF` admits the English noun;
- a tangent is read by the parser's own `readTangentNoun`.

Every arm that resolves a curve object answers through `curveAnswer` → `curveEquationOf` (`app/curveText.ts`): the known equation, else the options, else null. The panel's curve row (`panelKnowledge`) calls the same function, so «משוואת l1» and the row cannot disagree.

`ask` wraps `askOne`. A question that did not read whole is split by `splitAsk` (enumerated joiners, and a plural noun over named members) into `Answer.parts`. `App.tsx` renders each part through the extracted `answerBody`.

`SET_FORMER` reads «כל הנקודות M (המקיימות S)». With S, the trial `derive([...d.lines, S])` is traced (`Derivation.lines`, carried like `seed`), and a fault there is `Answer.refused`, worded by `errorText`. A measure of the locus (`LOCUS_PHRASE`) is `Answer.unsupported`, worded by `errOutOfScope`. Yes/no questions are not read (the operator's ruling of 2026-10-20).

*Identifiers:* `curveEquationOf` · `askOne` · `splitAsk` · `answerBody` · `Answer.parts` · `Answer.refused` · `Answer.unsupported`

### Measuring by clicking

`app/measurable.ts` composes sentences (`measurablesOf(construction, what)`) and `ask(d, sentence, fmt, describeCurve)`
answers them with a value, a trace and a `mark` `{ from, foot }`, drawn by `buildScene(…, { marks })` into
`scene.measures`.

#### The app layer decides; the component dispatches (ADR-AG-068)

`app/submit.ts` (what a line DOES), `app/ask.ts` (what an answer IS), `app/answers.ts` (what the row list BECOMES): the
component and the locks call the same pure function, `decideSubmit(raw, lines, seed, current)` →
`'ignored'` / `'refused'` / `'already-known'` / `'already-follows'` / `'record'`. The mark rides on the `Answer` and is
drawn only when the distance is knowledge; `asPair` gates a length offer.

*Identifiers:* `src-analytic/app/` · `lines` · `derive(lines, seed)` · `ask`

### The locus lane ([ADR-AG-072](06c-decisions-analytic.md#adr-ag-072))

A locus is asked and drawn, named and equated by the lane below.

#### The definition is a number the engine already prints

> A locus is a named point whose residual `carrierDof` is **1**.

`carrierDofOf` already computes it; «הציגו תצורה אחרת» walks it. **Do not write a locus solver.**

*Identifiers:* `משולש ABM` · `MA = MB` · `x=4` · `MA = 5`

#### What is genuinely new: an ORDERED sweep

The tracer is **continuation** along the residual Jacobian's null space, re-corrected with `solveLM`: ordered, and
valid downstream of the free point.

*Identifiers:* `y = 317` · `y = 1.23` · `G = midpoint(E,K)` · `(x,y)`

#### The honesty gate is at the level of the SET

The gate asks about the SET: the same set at two seeds shows kind and equation; the same kind, the kind only; else
nothing.

`A(−9a,0)`, `B(41a,0)`, `∠APB = 90°` is row 2: a circle for every `a`, r=25 at `a=1` and r=50 at
`a=2`. The student gets the drawn circle and the word «מעגל» and no equation — no `hasParameter` test
anywhere, which is the point. A rule written as "if the figure has a free parameter" would be a patch
wearing a rule's clothes, and would also be wrong on a parameter the locus happens not to depend on.

#### The set can be a UNION, and the tracer covers every component ([ADR-AG-166](06c-decisions-analytic.md#adr-ag-166), #1500)

`locusOf` discovers every component in CARRIER space, never only through the sampler
([ADR-AG-308](06c-decisions-analytic.md#adr-ag-308), #2384): the sampled configurations (`2·COMPARE_TRIES` probes), then
`SCATTER_PROBES` deterministic carrier-space starts, then `CURVE_PROBES` per held curve on the stretch of its fitted
curve (`curveOfTrace`, `conicPointsIn`) no walk covers — a `solveLM` each, a walk only off every held walk. A walk
closes when its carrier vector returns, not its image. A component is ONE carrier curve: a walk on a held curve
(`distToConic`) joins it as more pieces. `LocusResult` is a list, `Answer.locus` one curve each, the gate compares
unions (`agreeingUnion`), and `fitLine` / `normalized` do not out-claim the data.

*Identifiers:* `\n` · `√(lo/hi)` · `1e-9` · `x + 64029472y = 0` · `y = 0` · `SCATTER_PROBES` · `CURVE_PROBES`

#### The fit is a claim, so it is checked — against the trace, not against a student

`sweep → least-squares fit over the four kinds → snap to rationals → RE-VERIFY the snapped equation against the
traced points → print, or print nothing`.

#### The trace honours the givens: the walk is judged, the pieces are drawn ([ADR-AG-245](06c-decisions-analytic.md#adr-ag-245), #1817)

The walk passes each step through `resolvedAt` and `admissibleAt` (`selectorsHold`, `ringFaultsOf`); `LocusTrace`
holds `points` and `pieces`, and only the pieces are drawn.

*Identifiers:* `starts`

#### A sweep range is two selectors ([ADR-AG-340](06c-decisions-analytic.md#adr-ag-340), #1138)

D7's kinds 2 and 3 are one lowering on a point coordinate: `compareSymbolic` reads `atom op value`, `value op atom`
and the window, and each end is a `coord-compare` selector (`closed` for ≤ / ≥). No DOF is consumed; the judged walk
above clips the trace. `parseCarrierPoint` lowers «A נקודה (כלשהי) על …» through the incidence, with an optional
range tail read here only when it is selectors (any other tail is the condition frame's).

*Identifiers:* `coordSide` · `closed`

#### The exam's own questions, and its named lines ([ADR-AG-341](06c-decisions-analytic.md#adr-ag-341), #1138)

The ask lane rewrites «… שעליו נמצאות כל הנקודות X», «הביעו באמצעות a את …» and «הראו כי … הוא <kind> …» to the
locus phrase before reading it (`EXPRESS_IN`, `SHOW_THAT_LOCUS`, `SET_FORMER`). A line through a point and a
perpendicular bisector take an optional line name (the name is the id, `lineIdOf`); «הישר המקביל» / «האנך האמצעי»
are `on-kind` references M1 resolves to the one such `line-at` (`isParallelLine`, `isPerpBisector`), refusing none
or several.

**A line stated again** ([ADR-AG-346](06c-decisions-analytic.md#adr-ag-346), #2584): both twin arms of `applyStatement` (the
equation twin, `identicalCurve`; the construction twin, `lineAtTwin`) ask one verdict, `restatedLine`: known · rename
(over the tool's l-number, or a carrier) · `already-named` (`holderKind: 'line'`) · `line-exists` (a new name for a drawn,
unnamed line). `line-exists` reaches the submit path with the twin's id; `derive` adds the row that drew it
(`declared`), and `parser/lineOffer.ts` writes «נסמן את <description> ב-<name>» from the `line-at`, kept only when
`decideSubmit` would record it; `sentenceOutcome` pre-fills it. `name-line-object` (`parseNameLineObject`) is that
sentence: its operand is any clause the grammar reads as one `line-at`; M1 builds or restates it and names it as
`name-line` does.

*Identifiers:* `roleLineRef` · `perp-bisector` · `restatedLine` · `lineAtTwin` · `line-exists` · `name-line-object` · `lineOfferCandidate`

#### It rides the ask lane, and widens one field

The ask lane carries it; `Answer.mark` / `drawnMarks` also carry a polyline, drawn only when the figure is open.

*Identifiers:* `{from, foot}`

## Persistence

### The session, and the panel that shows it ([ADR-AG-055](06c-decisions-analytic.md#adr-ag-055))

**A save holds the LINES** and `restore` replays them through `derive` — a parser-drift net, audited by line
([ADR-242](06-decisions.md)) through `shell/save`'s `LoadAudit`. Every surface showing a line passes `shell/bidi`'s
runs on (`InputArea`, `QuickChips`). `provenanceOf` asks what the givens naming a point alone say; `circle-centre` is
curve-parented (`curveParentOf`).

*Identifiers:* `display` · `parentsOf`

### A load restores every field the save writes ([ADR-AG-199](06c-decisions-analytic.md#adr-ag-199), #1632)

`serialize()` writes `app · version · lines · seed · name? · spokenFor? · disabled? · seedNames?`, and
`loadAnalyticSession` passes every field to `restore`, which sanitises them; the round-trip lock pins the key list.

*Identifiers:* `disabled` · `seedNames`

### A rename rewrites history, proven line by line ([ADR-AG-191](06c-decisions-analytic.md#adr-ag-191), #1154)

A rename is not a fact: `decideSubmit` reads it (`parseRenameAnalytic`) and `app/rename.ts` rewrites the lines, ask rows
(`queries`) and display sentences (`spokenFor`), each line PROVEN by `rewriteLine` and the whole by `decideRename`,
committed by `applyRename` in one `set`. Ids map through `relabelSymbol` ([ADR-AG-205](06c-decisions-analytic.md#adr-ag-205)).
**Swap shares the core** ([ADR-AG-192](06c-decisions-analytic.md#adr-ag-192)): one letter map (`relabelMap`,
`relabelSession`, `decideSwap`, `parseSwapAnalytic`); a `rename-taken` verdict carries `holder: { text, index }`
(`letterHolder`); a tool letter is materialised into its sentence first; `Construction.seedNames` keeps a renamed
vertex's sample (`transposeSeedNames`); `applySwap` commits `{ lines, queries, spokenFor, seedNames }` in one `set`,
through the shared `shell/frame/LetterPopover`.

*Identifiers:* `rename` · `rename-bad-name` · `-same` · `-unknown` · `-taken` · `-not-typed` · `-unsafe` · `renameDraftOf` · `lane: 'rewrite'` · `r_<centre>` · `θ_<line>` · `radiusSymbol` · `directionSymbol` · `ANON_ID_RE` · `anonIndex`

### The session trace ([ADR-AG-131](06c-decisions-analytic.md#adr-ag-131))

`src-analytic/debug/sessionLogAnalytic.ts` posts one JSON line per event (`input`, `figure`, `action`) to
`server/logProxy.ts` → `logs/debug-log-analytic.jsonl`, dual-sink with `shell/usageLog.ts` in PROD
([ADR-W-077](06w-decisions-workspace.md#adr-w-077)); `logAnalyticFigure` dedupes by content, `logFileFor` refuses an
unknown tag, and logging never throws.

*Identifiers:* `${BASE_URL}api/log` · `tool:'analytic'` · `(lines, seed)` · `source: 'parser' \| 'llm'` · `result` · `intermediate` · `seed` · `outcomes` · `clear` · `undo` · `redo` · `show-another` · `edit` · `delete` · `toggle` · `index:on\|off` · `load` · `llm` · `StrictMode` · `useMemo` · `debug-log.jsonl` · `src/debug/sessionLog.ts`
