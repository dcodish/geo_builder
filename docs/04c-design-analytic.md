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

*Identifiers:* `y²=2ax` · `NaN`

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
A length admits the radius `R` (2-D ADR-034, `LENGTH_CAPITALS`).

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

### Measure roles: one reader, one ask normaliser, one substitution seam ([ADR-AG-169](06c-decisions-analytic.md#adr-ag-169) Am. 1)

`readRoleRef` (`parser/parseAnalytic.ts`) reads a role once: the given is `<role> <copula>? <value>` (`roleSplits`),
the ask is the phrase after `normaliseAsk` (`app/ask.ts`) strips openers. M1 resolves `radius-of`, `focus-of`,
`directrix-eq`, `perimeter-of`; a missing or ambiguous host refuses with `host: {kind, found, need?}`
(`app/hostKey.ts`, `errHost.*`, `askHost.*`). A stated value replacing a domained symbol (`r_O`) passes `admitStated`
(`out-of-domain`) and `substituteSym`; the directrix prints through `roleLineText`/`directrixText`; `ringsNamed`
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

## The sentence frame

### The sentence frame ([ADR-AG-187](06c-decisions-analytic.md#adr-ag-187), #1618)

`parseLine` reads the exam's frame **once** (orthography → proof target → `readLine` → `parseClause`).
`frameAnalytic.ts` is text → clauses and decides nothing: a reading counts only when every clause parses one level
deeper (`MAX_FRAME_DEPTH = 2`). Structural readings run before `parseClause`, partitions after (on `not-handled` /
`bad-operand`), keeping separators (`Segment.sep`) and rejecting a bare-name group (`isBareName`); shape nouns come
from `SHAPES` / `EN_SHAPE`; `unwrap`, `shapeClauses` and `originClauses` (`(0,0)`, named by `resolveMints`) fill the
rest; `viaCanonical` calls `parseClause` directly; a proof target is `proof-target`.

**Entailment is judged over configurations** ([ADR-AG-188](06c-decisions-analytic.md#adr-ag-188)): the line's
constraints (`Derivation.constraintLine`) must hold across the pool (`evaluate.holdsInEveryConfiguration`, with
`SATISFIED_EPS`, as `isKnowledge`, `knownOptions`, `knownCurve`, `unsatisfied`), or the line records.

*Identifiers:* `poolScheduler`
*ADRs:* ADR-AG-119.

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

### A line that loses a part ([ADR-AG-251](06c-decisions-analytic.md#adr-ag-251), #1888, #1889; [ADR-W-120](06w-decisions-workspace.md#adr-w-120))

`app/lostPart.ts`, asked by `decideOnce` (`app/submit.ts`) and by `decideEdit` through `lostPartOf`: one question for both typed seams.

- **Arm 1, a parsed line.** `unreadPart` runs the shared probe (`shell/readExtent.ts` `readLabelRuns`) with `parseLine` as the reader and the facts without `src` as the lowering. The frame is context-free, so one reader serves every clause; the whole line is the one clause `cutAtReading` cuts. A tail gives `split-statements`; an unread run with read labels after it gives `not-handled` (the model, as in 2-D). Asked before the fold: it is a question about the reading.
- **Arm 2, a declined line.** `declinedPart`: the LONGEST word-boundary prefix that the same decision would record (or answer as already known). Its rest must carry at least one label, only labels the prefix's facts carry, and nothing else with a construction signal (`hasConstructionSignal` over `VOCABULARY_ANALYTIC`, no digit). No word list is added.
- **The taught form.** `rightAngleTeach`: the read part is a triangle whose right angle the reading left open (a three-way `choice` of perpendiculars) and the lost part is one of its vertices. The refusal carries `teach: { triangle, angle }`, the angle named with the vertex in the middle.
- **Text.** `errSplitStatements` and `errRightAngleVertex` (`i18n/index.ts`) carry 2-D's text (ADR-W-118 B1).

*Identifiers:* `split-statements` · `unreadPart` · `declinedPart` · `lostPartOf`

### What a sentence draws, and whose extent it is ([ADR-AG-198](06c-decisions-analytic.md#adr-ag-198), #1639, #1640, #1636, #1641, #1643)

`pieceFacts(noun, a, b)` is the one piece declaration (`line-2pt { a, b }` or `segment { …, ref: true }`), emitted
after a sentence's facts (`TangentTargets.pieces`, `sideClauses`). The extent is decided at M1 against the prior
construction: the crossing's bounded promotion (`drawnPieceOver`). A bare pair in a point-on sentence is decided in
the parser, not at M1: it carries the `between` selector «הקטע AB» carries, except when the subject is one of its ends
([ADR-AG-248](06c-decisions-analytic.md#adr-ag-248), #1892; `lineObject` and `pairText` lower the converse to that
bare «P על CD»). `orthography` folds format controls (`stripFormatControls`), bullets and the spaced
conjunction (`shell/conjunction`, [ADR-AG-239](06c-decisions-analytic.md#adr-ag-239)). A tangency with no circle
applies `touchedCircleFacts` (tool symbols, `toolSymbol`), and `theCircle` binds `{ inscribed: ring }`; created
shapes start fitted ([ADR-AG-202](06c-decisions-analytic.md#adr-ag-202): `fitCreatedShapes`, `shapedObjectOf`). A
non-cyclic noun refuses `inscribed-contradicts-noun { shape, forced }` (`ShapeRow.notCyclic`, `cyclicFacts`,
`errInscribedContradictsNoun`). The same pair in TWO sentences, either order, is refused at M1
([ADR-AG-252](06c-decisions-analytic.md#adr-ag-252), #1918): `cyclicFacts` marks the ring's polygon fact `cyclic`, the
polygon object carries `cyclic` and `circleless` (the declared `notCyclic` noun), and the statement that would make
both true fails `inscribed-contradicts-declared { shape, forced, ring }`; `derive` adds the other sentence as
`declared` (`errInscribedContradictsDeclared`).

*Identifiers:* `errorText` · `θ_<object>.<part>` · `tangent-curve` · `about` · `the-circle` · `ref` · `line-AB` · `line-BA` · `line-at { through: a, dir: points a→b, name: 'AB' }` · `objects` · `NAME_LIST` · `distributeClauses` · `param θ_circle-touched.r > 0` · `circle-touched` · `θ_circle-touched.{a,b,r}` · `θ_` · `circleId` · `match` · `centre-of { circleId }` · `evaluateUncached` · `shapeHe/forcedHe` · `shapeEn/forcedEn` · `A = [(3/5, 4/5)] או (4, -2)` · `… (2- ,4) או` · `x_{B}` · `namedRow` · `pointText` · `scalarText` · `<text>` · `direction: ltr` · `<svg>`

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

*Identifiers:* `P₁` · `@fresh:<role>|<key>` · `mid:B,C` · `foot(A|BC)` · `median:A` · `toolPoint` · `derived midpoint(u, v)` · `derived foot(apex → uv)` · `cevian-of { toolFoot }` · `cevian-of { side }`

### New letters and circles a reference names ([ADR-AG-210](06c-decisions-analytic.md#adr-ag-210), #1670, #1686)

`applyRoleOf`'s radius arm names an unlettered centre (`centreIdOf` null) with the end not already on the circle
(`onCircleAlready`, `centreRuleOf`, `nameCentreAs`). A named circle the chain (`circleByName`) cannot find is stated by
`statingNamedCircle` (`declare`, `param radiusSymbol(M)` > 0, `circle-at-M`); an `on-kind` circle with no circle
creates one (`touchedCircleFacts`). **New letters, last**: after the fixpoints, `foldPass` adds `free` points for a
line whose failures are all point references in minting forms (`mintedByReference`) or companions (`segment`,
`line-2pt`, `selector`, `declare`); a `perpendicular` is not one, and the triangle form states its
triangle first (`clauseFacts`).

*Identifiers:* `circle-at-<letter>` · `create` · `chordFacts` · `on-kind { circle }` · `tangent-line-at`

### A role sentence introduces its ends ([ADR-AG-204](06c-decisions-analytic.md#adr-ag-204), #1669)

`parseClause` (`parseClauseRules`) passes every clause through `withRoleIntroductions`, declaring role ends first
unless defined (`POINT_MAKERS`); `RADIUS_PREDICATE` routes «OA רדיוס»; a later `circle-eq` replaces a created
circle's expression under its id.

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

**M1.** `bisects`: the angle through `resolveAngleName`; its three points must exist; no `p` → a `line-at` through the vertex along the new `Direction` `{ k: 'bisector', v, a, b }` (the sum of the unit rays; id `line-bisector-<a><v><b>`); a `p` the figure lacks → `cevianFacts('bisector', …)` (the foot on the line through the ray points — 2-D's `line-intersection`); an existing `p` → `onBisectorFacts`. `cevian-of`: the shapes holding the apex, or the triangles holding both ends of the side, give the candidate targets — one builds through `cevianFacts`, several `ambiguous-cevian`, none `cevian-no-triangle`. A HEIGHT named from its apex is hosted by a ring of ANY arity ([ADR-AG-253](06c-decisions-analytic.md#adr-ag-253), #1945): `oppositeRingEdges` returns the ring edges that do not touch the apex (never a diagonal), and the one the height means is the foot's own side if the figure already placed it (ADR-AG-222), else the ring's unique opposite parallel base (`ringParallelBase`, the trapezoid's — 2-D's ADR-169), else the union's first side (2-D's ADR-263 draw-one steer); two SHAPES giving the apex different sides ask. Every other cevian — the median included, because 2-D defers it on a ring — keeps the 3-vertex host.

*Identifiers:* `uv` · `angle-ratio ∠(u,apex,foot) = ∠(foot,apex,v)` · `p − v` · `∠ = ½∠` · `CEVIAN_HE/EN` · `BISECTOR_CEVIAN_*` · `namedShapeFacts` · `BISECTS_*` · `NAMED_ONLY_*` · `TO_SIDE_*` · `FROM_APEX_*` · `NOUN_FIRST_HE` · `NOUN_NAMED_HE` · `PLURAL_CEVIAN_HE/EN` · `viaSentences`

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

«נתון מעגל O» → declare O, `param r_O > 0`, `circle-at O r_O`: a curve whose shape depends on a point, evaluated
into the same `NumCurve`. Tangency to an axis is one unsigned equation.

#### Tangent to a line ([ADR-AG-165](06c-decisions-analytic.md#adr-ag-165))

`tangent-line {centre, r, line}` is |a·x₀ + b·y₀ + c| / √(a² + b²) = r, with `line` a `TangentLineRef` (a curve or two
points). A bounded noun (`tangentTargets`, `BOUNDED_NOUN`) adds hinge rows on the foot:
With `t` the centre's projection parameter onto A→B, rows `max(0, −t)·|AB|` and `max(0, t−1)·|AB|` pull the touch point inside the side.
They are BOUNDS ([ADR-AG-178](06c-decisions-analytic.md#adr-ag-178)): `residualRows` tags `{ eq, bound }` and
`carrierDofOf` ranks `eq` alone (`CarrierSystem.equalitiesAt`, `freeRank`). Circle to circle is
`tangent-circle {centre, r, other, otherR, branch}` behind `choice[external, internal]`; `readCircleSubject`,
`TANGENT_BRANCH` and `peelMods` read the sentence; `touch-point {a, b}` names the touch; `inDomain(d, v, floor)` with
`openBoundFloor` keeps a forced-zero radius off the bound.

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

*Identifiers:* `failingSelectors`

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

*Identifiers:* `M(x,y)` · `ONE_OF_HE` · `incidenceOn(…).t === 'kind'` · `THRU_HE` · `tangent-circles` · `freeAngleOf` · `selectorFact` · `c.selectors` · `derive.nameCanonicalCentres` · `centresOf` · `pointAt` · `deflatedStarts` · `collapsedPairs` · `on-line` · `selectorsHoldAt`

### Inscribed and circumscribed: the sentence is the sentences it is made of ([ADR-AG-194](06c-decisions-analytic.md#adr-ag-194), #1619 B2, #1554)

`parseInscribed` reads both directions; the lowering composes `parseShape` and `parseClause(«מעגל <tail>»)`. The
incircle is a `CircleDef` (`incircle`, `incircleCentre`); side touches are `touch-at` / `side-touch`.

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

*Identifiers:* `readDescribedCircle` · `DESCRIBED_CIRCLE_ALT` · `centreOfCircle` · `centre-of { circle }` · `relation parallel (points a b) (radius host a)` · `openCurveText(construction, id)` · `readsToolSymbol` · `isDirectionSymbol`

### Circles a sentence draws; two circles named by order ([ADR-AG-219](06c-decisions-analytic.md#adr-ag-219), #1622 E3, #1693)

`circles-about { slots, about }` resolves `new` / `named` / `the` slots at M1; position relations are `Quantity`
`circles { a, b, rel }` selectors, drawn by `relateCircles`; two fresh circles are named by order (`namingByOrder`).

*Identifiers:* `types.ts` · `CIRCLE_SLOT_SENTINELS` · `touchedCircleFacts(src, id, r?)` · `circle-new<k>` · `circle-pair<k>-1` · `-2` · `tangent-of { circleId, at }` · `beyond` · `toolLetters.ts` · `apart` · `inside` · `larger` · `cross` · `centres-side { a, b, p, q }` · `params { e }` · `circlePairQuantity` · `coord` · `θ_<id>.k/s/g/m` · `θ_<id>.r` · `circleToName` · `interchangeable`

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
`param-eq`; tan and cos ride the `angle` row as `measure?: 'tan' | 'cos'`.

*Identifiers:* `sampleEnv` · `value: α` · `measure-angle` · `narrowedDomain` · `(env[sym] − value)` · `parseParamValue` · `vertex-angle.rhs.measure` · `(sin θ − t·cos θ)/√(1+t²)` · `(cos θ − c)/2` · `frameAnalytic` · `UNWRAP`

### Measures as givens: the ratio of two measures and the area notation ([ADR-AG-214](06c-decisions-analytic.md#adr-ag-214), #1621)

Every form lowers to `length-eq`: `areaNotation` rewrites `S_{ABC}`, and `ratioAsEquation` rewrites the prose ratio.
A value `p:q` becomes `q·X = p·Y`; any other value `r` becomes `X = r·Y`. The divider spelling «היחס בין AC ל-CB הוא 3:2» is `parseDividesInRatio`'s and is read earlier.

*Identifiers:* `S_ABC` · `parser/frameAnalytic.ts` · `d_{AB}` · `asEquation` · `AREA_TOKEN`

### Arcs, sectors and the diameter from a point ([ADR-AG-220](06c-decisions-analytic.md#adr-ag-220), #1622 E4)

`arc-sum` (`engine/solve.ts`) is one constraint for every arc measure, Σ kᵢ·⌢(aᵢbᵢ) = value, on the RESOLVED circle.
The parser's `arc-of { circle?, terms, value }` (`parseArcMeasure`) reads a copula as `=`, each side split into `k·arc` terms and at most one number.
**A drawn arc is an object.** `GeoObject` `arc { def: ArcDef }`, `ArcDef = { circle, from, to, pick: 'ccw' | 'minor' | 'major', away?, toward?, radii? }`. No freedom (`carrierOf` null, `symbolDeps` []), `objectDeps` its circle, ends and side point. `evaluate`'s `arcOf` reads the resolved `NumCurve` and the placed ends: `start` the angle of `from`, `sweep` the counter-clockwise turn to `to`, or the shorter / longer one, or — with `away` / `toward` — the half whose middle is on the far / near side of the chord from that point.
Circles under arcs are `hidden` (`stated: false`).

- Sector (`sector` fact, M1): with a centre letter `v`, the circle `circleByName(v)` or a new hidden `circle-at-v` (free radius `r_v` > 0); the ends declared and put on it, `distinct`, `angle { v, a, b }` (the value, or 360 − value with `pick: 'major'`), the segments `va`, `vb`, the minor/major arc. With none (the bare quarter circle), `createdCircleFacts('circle-sector-<ab>', hidden)`, the ends on it, `relation perpendicular` between their radius directions (any other value: `arc-sum`), the arc with `radii`.

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

*Identifiers:* `GREEK_ALIAS` · `evalExpr` · `foldSignSelectors` · `narrowedDomain(declared, impliedRange)` · `poly-<ring>`

### The equation of a cevian keeps its claim; position words are coordinate comparisons; an obtuse triangle is a region choice ([ADR-AG-222](06c-decisions-analytic.md#adr-ag-222), #1662 #1706 #1708)

`equationClaimFacts` keeps a cevian equation's claim; `POSITION_WORD_HE` / `POSITION_WORD_EN` lower position words
to `coord-compare`; `Selector` gains `{ kind: 'choice'; options: Selector[] }` for «משולש קהה זווית ABC»
(`obtuseChoice(ring)`); `asideClauses` reads asides.

*Identifiers:* `cevian-of` · `?? []` · `footOnPair` · `positionMeaning` · `resolveSelectorChoices` · `choiceCount` · `OBTUSE_HE` · `OBTUSE_EN` · `ANGLE_ADJECTIVE_HE` · `POSITION_AXIS_HE` · `segmentsOf` · `errLengthXY`

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
`separationMoves`, 2-D's `solutionAccepted` in `multiStartSolve`).

*Identifiers:* `crossings.apart()` · `a > 0`
*ADRs:* ADR-486.

### A noun's exclusive condition is part of its ring ([ADR-AG-189](06c-decisions-analytic.md#adr-ag-189), #1627)

Ring promises — simple, open, and not-a-parallelogram for the trapezoid family (`ONE_PARALLEL_PAIR_NOUNS`,
`PARALLEL_SIN_TOL` = `COLLAPSED_SIN_TOL`) — are `engine/rings.ts` `ringViolation(vertices, noun)`. `ringFaultsOf`
records them and `drawableAt`'s `whole()` rejects them, but the exclusion is never refused (Amendment 1, 2-D ADR-165):
`app/shapeWarnings.ts` `shapeWarningsOf(lines, d)` reads `d.figure.ringFaults` and `App.tsx` shows a shared
`Banner kind="notice"`. A second NOUN is not a given (ADR-AG-260, #1926): `engine/shapes.ts` `nounsExclude(a, b)` —
one noun `promisesOneParallelPair`, the other's row `assertsBothParallelPairs` (read off its givens, never listed) —
and `applyFact`'s polygon arm refuses the later declaration `shape-excluded { actual, stated }` before M1 absorbs it
(`errShapeExcluded`).

*Identifiers:* `current` · `freeCoord` · `{A: G}` · `{A: B, B: A}` · `rewriteLineMap` · `*-not-typed` · `letter → seed name` · `derive(lines, seed, seedNames)` · `dispatchRename` · `dispatchSwap`

### Only valid configurations are evidence ([ADR-AG-197](06c-decisions-analytic.md#adr-ag-197), #1642, #1638, #1635, #1634, #1539)

A configuration the givens contradict is never knowledge. `evaluateTryingChoices` tries a seed's `choice` options
(`Figure.choiceSeed`, `choiceSeedOf(c, seed)`; `cycledPairs` for `crossing-nth { both }`); `resampledInside` frees a
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
(never a fallback whose solve stopped short). Samples are not proof, so the arm also needs `RingFault.shapeDof === 0`:
the freedom of the ring's affine coordinates over its own widest vertex triangle, by `tangentFreedomOf` (projection onto
the constraints' tangent space, tolerance relative to the read's own scale — a stacked `freeRank` read round-off as
freedom). An affine map keeps every proper crossing, so 0 proves it. The arm adds those `crossed` faults; `decideSubmit`
re-attributes a fault that appeared to the submitted line, so the ring-first order refuses the shape line.

*Identifiers:* `seed … seed + DRAWABLE_TRIES` · `shape` · `declared` · `degenerate` · `crossed` · `ring-contradicts-noun` · `InputError`

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

*Identifiers:* `SOLVE_TOL` · `separationDof` · `freedomOf`

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
open; `valueText` (`app/panelRows.ts`) prints a value or two joined by «או».

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

`src-analytic/format.ts` is the one display formatter: `fmtAnalytic(v) = fractionText(v) ?? fmtNum(v)`, above
`shell/format.ts`.

*Identifiers:* `fmtNum` · `1.33` · `exactFormOf` · `cleanNum` · `p/q`

#### Recognition is honest only while it stays recognition

A fraction is RECOGNISED (relative `1e-6`, denominator ≤ 12) only for a value that passed `isKnowledge`.

*Identifiers:* `number` · `4/3` · `1.3333`

### Position decides notation ([ADR-AG-085](06c-decisions-analytic.md#adr-ag-085))

A coefficient is never printed as a fraction: `fractionClearingFactor` and `lineText` clear the row
(`-4/3x + y = 0` → `-4x + 3y = 0`).

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

*Identifiers:* `render/scene.ts` · `alt` · `origin` · `{ num }` · `{ text }` · `statedText` · `App` · `ticks` · `labels` · `SceneSegment.label` · `FigureSegment.pinnedLength` · `pinnedLengths` · `wedgeBisector` · `equalTickSegments` · `unitOf` · `shell/__tests__/fixtures/mark-geometry-rows.ts` · `LabelRequest`

### The image carries no chrome ([ADR-AG-151](06c-decisions-analytic.md#adr-ag-151))

`render/Figure.tsx`'s click-only affordances sit inside `data-noexport` (FR-EX-3), locked by
`render/__tests__/clean-export.test.tsx`.

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

`locusOf` discovers every component from the sampled configurations (`2·COMPARE_TRIES` probes); `LocusResult` is a list,
`Answer.locus` one curve each, the gate compares unions (`agreeingUnion`), and `fitLine` / `normalized` do not
out-claim the data.

*Identifiers:* `\n` · `√(lo/hi)` · `1e-9` · `x + 64029472y = 0` · `y = 0`

#### The fit is a claim, so it is checked — against the trace, not against a student

`sweep → least-squares fit over the four kinds → snap to rationals → RE-VERIFY the snapped equation against the
traced points → print, or print nothing`.

#### The trace honours the givens: the walk is judged, the pieces are drawn ([ADR-AG-245](06c-decisions-analytic.md#adr-ag-245), #1817)

The walk passes each step through `resolvedAt` and `admissibleAt` (`selectorsHold`, `ringFaultsOf`); `LocusTrace`
holds `points` and `pieces`, and only the pieces are drawn.

*Identifiers:* `starts`

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
