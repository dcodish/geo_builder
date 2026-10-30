# 04b — Design: the 3-D Space Builder (`src3d/`)

_How the 3-D product is built. Registered in [`DOCS.json`](../DOCS.json) as the `3d` product's design doc
([ADR-W-041](06w-decisions-workspace.md#adr-w-041))._

**What it must promise** is [02b](02b-requirements-3d.md). Decisions are [06b](06b-decisions-3d.md);
the build plan and its corpus reading, [docs/20](archive/20-space-vectors-tool.md), are archived history. This is the *how*.

**How this document is organised.** After the layer map (*Shape*), the chapters follow a statement through
the product: reading and applying it, solving the figure and judging claims, the submit decision, and what
the student sees (canvas, data panel, input preview); the known gaps close it. Each section states the
current mechanism, where it lives, and the ADRs that hold its history (`ADR-3D-NNN` ids resolve in
[06b](06b-decisions-3d.md), bare `ADR-NNN` in [06](06-decisions.md); `#NNN` is the issue).

## Shape

| Layer | What it is |
|---|---|
| `engine/` | `Vec3` core, solids, the apply reducer, `derive3`/`resolve3`, the solver, the relation disposition map, the operand resolver |
| `parser/` | `parse3.ts` (context-free rules), `catalog3.ts` (the coverage map), `llmShared3.ts` (the 3-D prompt) |
| `render/` | Orthographic-orbit SVG: `scene3.ts` (pure) + `Figure3.tsx`, plus vector notation |
| `store/` | Zustand + `zundo`, derive-on-demand, keep-prior-on-error, `.geo3.json` save/load |

The tree **copies patterns from `src/`, it never imports them** — 2-D and 3-D geometry differ in kind, so
an abstraction over both would leak ([`BOUNDARIES.json`](../BOUNDARIES.json), operator authority). The
shared chrome ([04w](04w-design-shell.md)) is the one sanctioned shared code.

## Reading and applying a statement

### The parser is context-free — deliberately, and it is the better architecture

`parse3.ts` has **no `ParseContext`** (no `ParseContext`/`ctx.` reference in the file): rules match text,
and *resolution happens at apply*, where the figure is known — the opposite of 2-D, by design
([docs/17 §3b](17-design-rules.md)). That seam is what makes [`FR-SP-5`](02b-requirements-3d.md)'s M1
duality possible. **Reach for M1 duality before adding a construct.**

**The normalisation seam and case (ADR-3D-039, ADR-3D-223).** `normalize3` is the one boundary every rule
reads: format controls stripped, primes and minus unified, look-alike glyphs folded, script transitions
split. **The look-alike glyph fold is the SHARED table** ([ADR-3D-329](06b-decisions-3d.md#adr-3d-329)):
`shell/glyphFold.ts` `foldGlyphs` (⟂ → ⊥, ∡/∢ → ∠, the guarded `<` → ∠, ⁰/º/˚ → °, «שורש N» → √, the infix «‖» / «||» → ∥), called by
`normalize3` right after `foldPrimes3` and by the ask lane's `parseQuery` — 3-D folded none of them, which is
why «AC ⟂ AB» was not-understood while «AC ⊥ AB» built (#1912); 2-D's and analytic's boundaries call the same
table (docs/04w, *Look-alike glyphs*). **The fraction glyphs are spelled by the SHARED reader**
([ADR-3D-374](06b-decisions-3d.md#adr-3d-374), #2255): `shell/vulgarFractions.ts` `spellVulgarFractions` (2-D's
ADR-635 reader, moved by ADR-W-147) wraps the fold chain in `normalize3`, after the glyph, √ and axis-letter folds,
so a mixed number is one number («2½» → `2.5`, «2⅓» → `7/3`), a radical's glyph coefficient moves below it («½√3»
→ `√3/2`), and a lone glyph is `a/b`. No reader below the boundary keeps a glyph branch: `parseCoeff`, the vector
`TERM`, `SYM_TERM`, `VAL` and `VALUE_START` read digits only. **The magnitude atom `MAG`** (ADR-3D-337) admits `ROOT_PRODUCT`, a `*` or
`·` between the coefficient and √ only (#2069, [ADR-3D-369](06b-decisions-3d.md#adr-3d-369)); `evalRadical`'s
`RADICAL_RE` reads the same token, so the atom and its reader stay paired. The triangle noun is the lexicon's
`TRIANGLE_RE` (`lexicon/shapePhrase3.ts`, `isTriangleNoun3`), which reads «△»/«▲» before a label run. **The prime fold is
one set** (ADR-3D-300): `PRIME_GLYPHS3` / `foldPrimes3` in `lexicon/marks3.ts` (′ ’ ‘ \` ´ and the Hebrew geresh ׳, ʹ, ʼ → `'`),
called by `normalize3`, the ask lane's `parseQuery`, the LLM sequence gate and the rename dialog, and read by
the bidi run alphabet — no reader spells its own prime class. Lowercase labels are uplifted by
`upliftLowercaseLabels`, the ONE chokepoint, only where an anchor proves a label (the angle glyph/word,
a point/vertex noun, a `label(…)` coordinate at the head of a definition, the single-letter subject of a midpoint statement — ADR-3D-287); a solid noun is not an anchor (#353/#498).
`midpoint-auto`, the one rule in `parse3` that INVENTS a point's name, matches a full anchored frame
(`MID_HE`/`MID_EN`, shared with the anchor), so a word it does not own declines the line.

**One magnitude atom** (#1827, [ADR-3D-337](06b-decisions-3d.md#adr-3d-337)). A slot that states a
magnitude (a length, an area, a height's length) matches `MAG` and reads the capture with `magValue`. These
are the lexical half and the reader of `evalRadical`, defined side by side, so a spelling the atom admits is
one the reader values. Never `+m[n]`: the decimal-only `NUM`/`UNUM` in a magnitude slot is how «AD = √7»
refused while «|AD| = √7» built. `normalize3` folds `sqrt` / `\sqrt{…}` to `√`, so the atom only ever sees
the glyph. The honesty gate (`droppedGivenNumbers3`) values a radical with the same exported `RADICAND` and
`evalRadical`, and keeps a radicand's own parentheses. The distance slot (`distanceGiven`) matches `MAG` and
reads it with `magValue` too, and the `A = (…)` claim (`coordsClaim`) composes from the tuple-component atom
`VAL` and reads it with `literalValue`, the pair `A(…)` reads with (#2081,
[ADR-3D-362](06b-decisions-3d.md#adr-3d-362)). The ratio and solid-size slots still take decimals until the
operator rules on them. Angles are degrees and stay `ANGLE_VAL`.
The revolution solid's size slots (`RADIUS_SLOT` / `HEIGHT_SLOT`, #2079,
[ADR-3D-340](06b-decisions-3d.md#adr-3d-340)) match the whole `MAG` value, anchored (`SIZE_VALUE`), so no
prefix of a number is ever taken, and `readSizeSlot` reads only a plain decimal. A fraction or root there is
UNREAD: the rule declines and flags it, and after every rule has declined `parse3` returns
`solid-size-unread`, which the store words as apply's own `given-not-drivable` size refusal. Every other size
form reaches the same refusal (#2076, [ADR-3D-363](06b-decisions-3d.md#adr-3d-363)). The size nouns are one
vocabulary, `lexicon/revolutionSize3.ts`: inside a declaration, a size clause whose noun is not a slot
(`UNREAD_SIZE_CLAUSE`: «שקוטרו», «ויוצרו», «ונפחו», "slant height") flags the solid before the slots are read; on its
own line, `revolutionSizeLine` (after the volume/area claim rules) reads «<size noun> (של)? ה<solid> (הוא|=)?
<value>» and its English mirror and only RECORDS the solid, so it never claims a line another rule reads. A
volume/area claim on a free-size solid is apply's same size refusal; `free-size-claim` is retired. The gate values a
fraction by its value, or by numerator AND denominator together (the ratio's `p`/`q`), never by one part alone.

**An angle written in radians is refused** (#1837, [ADR-W-142](06w-decisions-workspace.md#adr-w-142)). `readStatement3` asks `findRadianAngle` (`shell/radianAngle.ts`) right after `findProofTarget` and answers `{ code: 'radian-angle' }` — `guided` in `STORE_CATEGORY3`, worded `err.radianAngle` (2-D's sentence) — so «∠ABC = π» is no longer an angle mark labelled π and the other spellings never reach the model.

**A letter the tool cannot read is refused by name** (#1919, [ADR-3D-328](06b-decisions-3d.md#adr-3d-328)).
`readStatement3` — the one reader submit and the ✎ edit share — asks `unreadScript` (`shell/inputScript.ts`,
the shared rule all four builders call) right after `findProofTarget`, and answers
`{ code: 'unread-name' | 'unread-word', detail }` with the student's own letters quoted, typed so it never
escalates. The look-alike LETTERS are folded by the rule itself, so «משולש КМО» records K, M, O while
«משולש ДЖФ» is refused. One gate was also made total: `declLeftover` tokenizes Latin and Hebrew only, so a
GREEK vertex name was invisible to it and «משולש ΓΔΘ» recorded A, B, C — a Greek letter left in a
declaration now makes the gate decline, which hands the line to the model, 2-D's verdict for it. The
measure rules read Greek as they did, so «α < β» keeps its own typed refusal.

**Case is taught, never silently accepted** (ADR-3D-226). What no anchor proves goes to the #353 nudge in
`scope3.ts` (`upperCasedLabelCandidate3`, consulted by `App3` before the LLM seam). It lifts a label-shaped
run of two or more characters — never an English prose word (`NOUN_EN`/`EN_STOP`, from `parse3`) — runs
only on a failed parse, and fires only if the candidate parses.

### An unnamed shape noun is a reference, resolved at apply (#2235, [ADR-3D-351](06b-decisions-3d.md#adr-3d-351))

A triangle / quad / pentagon sentence with no letters («המשולש ישר זווית», «משולש», «הריבוע») cannot name its ring
in a context-free parser, and the old default letters A, B, C… made M1's existing-id idempotency pick whatever was
called that. `rightTriangle` and `planarPolygon` now emit **`shape-ref3`** `{ article, arity, body }`: the article from
`shapeNounArticle3` (`lexicon/shapePhrase3.ts`, the copy of 2-D's ADR-654 / #2205 reader), and `body` the named form's
own lowering over the reserved placeholders `#1…#n`. Labelled sentences are untouched.

`resolveShapeRef3` (`engine/apply.ts`) picks the ring against the figure: **definite** — the one ring of
`declaredFlatRings3` (flat polygon solids, M1 polygon statements over existing points — their `polygon-open`
claim — and quad shapes), `ambiguous-definite-shape` naming them when there are two or more, the default letters
when there is none; **indefinite / prefixed** — `freeVertexRun3` (`engine/freeLetter.ts`, 2-D's `autoVertexLabels`
rule). The fact KEEPS the reference (the fixture parser-drift net, undo and edits re-resolve it). `derive3` expands it
per fact against the figure before that fact (so `droppedSoft` / `seated` see real letters), exposes the result as
`Derived3.resolvedCmds`, and from the end of the fold on reads each fact as the ring it was applied to (blame,
crossing, collapse and narrowing passes). `decideCommands3` resolves the line the same way before the honesty gates
and the twin rule, and words the refusal with the sentence and its taught remedy (`definiteShapeExample3`).

### Relations as a disposition map

`relationTable.ts` maps each `relation × operand-kind` pair to a status and the actions it licenses
(`drive`, `claim`, or unsupported), so an undrivable relation is **claim-gated** rather than mis-driven, and
the map is enumerable ([docs/26](archive/26-3d-relations-plan.md)). `operands.ts` resolves operand
*thunks*, so a rule names what it wants without knowing how it is produced.

**A relation's lane is decided by its OPERANDS, never by its word** (#1439, ADR-3D-263). Between two
absolute objects a relation pins the figure parameter when an operand carries it **in what the relation
reads** (ADR-3D-286, #1472: ⟂ / ∥ / angle read directions; coincidence, containment, intersection and
distance read positions too), and is a claim otherwise. One list, `paramPinningRels` (`claimPinsParam`,
`operandCarriesParam`), feeds the root-find. A coordinate point's stated membership on such a plane or line
is the same position relation at distance 0, so the list reads `c.memberships` / `c.onLines` too, through the
same admission rule (`memberPinsParam`, ADR-3D-396, #1528); the #815 membership door asks that list with the
membership already recorded, so only a member the pivot can move (a figure point) hands the letter over; each pin's residual is the verifier's own function on the
operands rebuilt at the candidate value (`operandAtParam`). A residual that vanishes at every scan sample
is **not** a pin (the identity guard). The claim is always recorded, and a number drawn from it shows only
when it holds (`DIRECTION_REL_TOL`).

**A pin is a driver; the claim beside it is the arbiter** (ADR-3D-282, #1546). A pin acts only where the
pivot owns something that moves its object (a solid's gauge and dims, a pin symbol, a free rider), so
every pin family that can land elsewhere records its claim: `coords-eq` for the existing-id `point3` pin,
`vec-val` for `inject-vector` and `inject-pair` (one `VecAtom` form), `dot-val` for `dot-given`
(ADR-3D-284, #1560); and (ADR-3D-285, #1567) `length` → `length-eq`, `seg-angle` → `angle-seg-eq`,
`vangle` → `vertex-angle-eq`, `length-rel` → `length-rel`, `seg-perp/par-plane` → `perp-plane`/`par-plane`.
A given's claim carries `given: true`; **the placed-figure rule is claim-level**, at the head of
`holdsAt`: a `given` claim is judged on a placed figure only, and at the displayed seed the pin-owner guard
answers (`injection-unsatisfiable` for a coordinate pin, `givens-contradict` otherwise). So
`freeDims(c) > 0` decides only whether a pin is ADDED, and the store's `size-on-solid` boundary exempts a
magnitude recorded as a pin's arbiter.

**Two angle claims, chosen by the parser, never by apply** (ADR-3D-290, #1573). A vertex-named angle
(«∠BAD», «זווית A», a valued angle mark) lowers to `vertex-angle-eq
{vertex, p, q, deg}`; «הזווית בין … לבין …» over two point pairs lowers to `angle-seg-eq`. Apply routes by
the kind — `vertex-angle-eq` → `vangle`, `angle-seg-eq` → `seg-angle` — and the claim, the coord-sym
root-find (`paramGivens`), the wedges and the knees each read their kind's quantity. `vertexAngleDeg` /
`lineAngleDeg` / `ANGLE_TOL_DEG` in `claims.ts` are the one measure and tolerance for verifier and canvas.

**One mechanism places a point from a coordinate given, whatever it sits on** (ADR-3D-293, #1615;
generalising ADR-3D-292). Beside the `point3` pin and its arbiter, a point with `solvable` entries in
`carrierParams3` records the stated components in `c.coordDeterminations`. Where the pivot owns nothing (no
solid, no `free3` point), `resolve3` runs `solveCoordDeterminations` after the free-carrier fixpoint: it
probes the point at parameter 0 and each unit parameter (placements are linear), solves by the normal
equations, and publishes `Resolved3.coordDetermined` — `determined` (placed through `riderTOverride`),
`contradicts`, or `open`. A coord-sym point keeps `readCoordGiven` → `symbol-value`.

**A declared action must hold for every spelling of its row** (ADR-3D-217). `'angle|segment|segment'`
declares `drive-dims`, so `apply.ts` drives it through its own pin kind rather than only when
`claim.a1 === claim.a2` (the shape of `vangle`). A statement that fits no pin may need its own pin kind;
reuse is judged on the residual's MEANING (`cos-angle` has the right operands and a signed quantity).

**A frame's operand coverage is part of the relation** (#963, ADR-3D-238). The containment frame (#614)
serves a point as membership (`on-planes`, ADR-3D-015); the "a point has no direction" bail applies to
perp, parallel and angle only. **The verb is optional; the plane noun is not** (#1608, ADR-3D-298):
beside `membership`/`pointRelPlane` («על»), the verbless «ב-» / "in plane" is admitted in
`CONTAINED_SPLIT`, the frame `planeRelGiven` and `lineRelGiven` share, only before an explicit plane noun
(held in a lookahead).

**Vocabulary is not a rule's private property** (#977, ADR-3D-241). The angle noun and the copula are shared
constants, so `angle ABC`, `the angle ABC` and «שווה» read alike in every angle rule (2-D: #969, ADR-498).
**A field that is both an identity and a display string will be read as the wrong one** (#986, ADR-3D-242):
the angle mark keeps `label` (the binding letter `symbolOwnersOf` matches) apart from `coef`; display text
is composed once (`angleMarkText`), and carriers keep the split — `Wedge.label` is shown, `Wedge.sym` is
matched — so the panel never prints `α = 60°` beside an `α = 30°`.
**An angle carries one name** (#2054/#2061, ADR-3D-344): `apply`'s `angle-mark` arm refuses a different letter on an
angle that already wears one (`angle-name-taken`, unless the letter already names another angle — the ADR-3D-052
equality) and the same letter with another coefficient (`angle-coef-conflict`), instead of relabelling or absorbing.
`derive3` names the line that put the letter there (the first enabled green fact marking that angle with that letter
and coefficient) — in the fold and in both retry passes — and reports the coefficient conflict as `givens-contradict`.

#### Adding a relation: the registration surfaces and the non-negotiables (moved from docs/26 §5 and §7, #1861)

A relation, or a new operand kind for one, touches fifteen surfaces. Its PR checks each one or says why
it does not apply:

1. **The parser rule**, or a thin wrapper over the shared relation frame, plus the **shadow matrix**
   (`parser/__tests__/shadow-matrix3.test.ts`): the snapshot changes by addition only.
2. **`catalog3.ts` entries in Hebrew and English.** The guard test covers parseability.
3. **`COMMAND_SAVEABLE`** (`store/figureFile3.ts`), an exhaustive record.
4. **The apply case and `claimRefsError`** (`engine/apply.ts`), compile-guarded.
5. **Engine routing.** A new pin family is a row of `pivotFamilies3` (`evaluate.ts`; totality locked by
   `issue-1550.test.ts`, ADR-3D-281). It also passes the `invariantOnly` and `planeDrive` gates and
   `solvePivot`'s early return (`solve3.ts`).
6. **`scalePinned`** if the relation carries units. Distances do; angles never do.
7. **`freeDofCount3`** accounting.
8. **The landing funnel.** A relation that fixes the placement must be seen by `translationGaugeFree3`
   and the rotation question (`evaluate.ts`); one that fixes nothing leaves the placement sampled.
9. **Marks and surfacing.** A new source of a 90° angle gets its knee. The relation surfaces in the data
   view and the query lane (`dataView.ts`, `queries.ts`): the operator's *"and show that"*.
10. **The parameter pin.** When either operand can carry the figure parameter, `paramPinningRels`
    (`operands.ts`, through `claimPinsParam` and `operandCarriesParam`) must admit the relation, with
    what it reads declared: direction or position. `pinningGivens` and `paramRoots` read that one list
    (ADR-3D-286).
11. **The `fixtures3/` drift net** stays green.
12. **The LLM lane.** Prompt few-shots (`PROMPT_EXAMPLES_3D` in `parser/llm3.ts`, each re-parsed by a
    contract test) and `scope3.ts` guidance for the neighbouring unsupported forms. The log-triage replay
    calls the app's own decision (`app/triageReplay3.ts`, ADR-3D-305).
13. **i18n** for every new notice or refusal, in both locales.
14. **Budget.** Each drive states its worst-case multiplier ([docs/17](17-design-rules.md) §7).
15. **`RELATION_TABLE` totality** (`relationTable.ts`) stays green. Cells flip in the same PR as their
    battery rows (`src3d/__tests__/relation-battery.test.ts`).

**The non-negotiables.**
- A new relation changes no existing lowering, and it changes the shadow snapshot by addition only.
- **M1 duality per relation.** A relation that only verifies is not finished: with a sampled placement
  its claim is refused on nearly every seed (ADR-3D-095).
- Every drive path lands through the landing funnel. **No new per-path guards, ever.**
- Both locales and both orders are read, and a noun never decides the reading.
- **The chokepoint registry shrinks.** The lexical and semantic logic lives once; a rule's *name* may
  persist as a thin wrapper for the shadow matrix's diagnostic value.
- **Corpus-driven, not speculative.** A cell no exam or session needs stays `planned`, and an
  `out-of-scope` cell says why.

### The symbol registries — one address, one display, derived from each other

`symbolOwnersOf` (`types.ts`) is the **address** registry (#902, ADR-3D-219): a letter's owners — a vec-def's
ratio («SN = k·SC»), a pivot pin symbol (`pinSymsOf`), the algebraic lane's parameter (`c.param`), a
labelled angle, a named free component (`partialNames`, #814, ADR-3D-175), or a named rider parameter
(`riderNames`, #921), or a **length letter** (`lengthMarks`, «|AB| = k», #2092, ADR-3D-381 — the length twin of the
angle mark: `label` the binding letter, `coef` the multiplier; a shared letter lowers to `length-rel`, a value to the
ordinary `length-eq` claim). A statement addressed to a letter («p = 3», «p חיובי») reaches EVERY owner.
**One meaning per letter; a number letter, many equations** (#2580/#2581, ADR-3D-384/385). `settleLetters3` (`apply.ts`) runs on
the outermost apply after every command. It refuses a clash in `LETTER_MEANING_CLASHES` over `letterMeanings3` (vector ×
length, vector × parameter, angle × length; `letter-meaning-taken`, the first meaning's line filled by `derive3`), and ties
every length mark whose letter has a NUMBER owner by recording one `length-letter` claim (|ab| = coef·sym), whichever line
came first. `lowerLengthLetter3` hands the tie to the owner's lane: the parameter root-find (`lengthLetterProbes`, both ends
typed) or the post-pivot `paramGivens`; the vec-def symbol pin `length-sym`; the pivot residual `letter-tie` for a pin
symbol, a named component or a rider (`pivotLetterValue3`). The claim is the arbiter in every lane (`letterNumbersAt3`). `figureSymbolsOf`, the
**display** registry for the panel and the ask lane, is **derived from the address one** (ADR-3D-230); only
the pricing differs per owner kind, and an undetermined letter reads `?` in every lane. **A length letter takes the length's
scale gate** (#2594, ADR-3D-389): `letterIsGaugeLength3` (`evaluate.ts`, beside `scaleKnown3`) — a letter with a
`lengthMarks` entry on a figure whose scale is not knowledge — is asked before any owner arm by the panel's params loop
(the row reads `?`) and by the ask lane (note `scale`), so no lane prices a gauge length as a value.

`symbolPins` is keyed by the symbol's **name**: the relation pins drive a symbol-defined point; the `value`
pin is read by each lane on its own terms — the vec-def lane as the point's k, the **pivot as a
substitution** (`openPinSymsOf` is the unknown layout; a value-pinned symbol holds no slot), the parameter
lane as its one admissible root (`pinningGivens` counts it; `paramRoots` returns it only if every pinning
given admits it, else the honest `no-roots`). A named component takes a value through the injection that
bound the name. **A refusal names a cause the figure does not contradict** (ADR-3D-225, #922):
`unknown-symbol` for a letter the figure lacks, `sign-not-selectable` for what the lane cannot expose.

**The ask lane reads a measure question WITH THE STATEMENT GRAMMAR** (ADR-3D-279, #1449).
`angleAskOperands` and `revolutionAskOf` (parse3.ts) parse the question plus a placeholder `= 1` and keep
the relation it lowers to; `parseQuery` turns those into `angle-ops` (measured by `angleBetweenOperands`)
and `rev` (measured by `revolutionMeasure` in claims.ts) — the verifier's own geometry, so a spelling the
statement lane learns is askable the same day.

### A stated quad shape has three arms, and the middle one always CREATES the corner (#587/#601/#985)

`quad-shape` dispatches on **how many corners already exist** — in `apply`, because `parse3` is
context-free:

| unknown corners | arm | what it means |
| --- | --- | --- |
| 2+ | **declaration** — the flat `polygon4` carries the free dims and the constraint set takes some away |
| 1 | **completion** — the corner is CREATED; the family only decides *how* (derived, or minted carrying the freedom the shape leaves open) |
| 0 | **statement** about existing points — the constraints M1-route to claims, so a false one is refused |

`quadCornerDef` in `baseShapes.ts`, beside `quadShapeConstraints` (what each family *states*), says how
each family's missing corner is *created* (ADR-3D-244): the **parallelogram family** — the parallelogram
point (`parallelogram-point`, ADR-3D-152); the **kite** — the reflection of the opposite corner across the
neighbours' diagonal, read from the ring (`reflect-line`, ADR-3D-240); the **trapezoid** — a
`scaled-offset` point, `anchor + k·(to − from)`, with **k free**, so `DC ∥ AB` holds by construction and k
resamples and is driven by the rider lane (#820); a general **quad** — a plane rider on the known three
(2 DOF, as #774's mixed run).

**A relation that must PLACE a point is absorbed into the point's construction**: a rider's position is
sampled, so a ∥ pin on it could only verify, turning `unknown-point` into `claim-refuted` (ADR-3D-191).
`scaled-offset` keeps k a real DOF — counted, sampled, and driven like an `on-segment`
point's `t`. The two `PointDef` twins say it in one line:
`parallelogram-point` is `scaled-offset` with k = 1. **A helper-needing derived point is a KIND**, so no
helper ink appears: a `vec-rel` command would draw its carrier segment (a diagonal `BD`; #984, ADR-3D-256).

#### One shape phrase, and a circle through a ring (#1792, [ADR-3D-307](06b-decisions-3d.md#adr-3d-307))

`src3d/lexicon/shapePhrase3.ts` holds the noun and adjective spelling and which pairs exist: **the noun
decides the arity, and an adjective is consumed only where `parse3` has a lowering**; an unconsumed one
declines the rule, never dropped. `statedQuadBase` and the triangle qualifiers read it. The right trapezoid
lowers to `quad-shape trapezoid` plus a **soft** AD ⟂ AB carrying its `ring`, which derive3 retires when a
right angle is stated at any corner of that ring (M4; the #116 default, ring-scoped).

**A circle through a ring is a claim about the ring.** `circle3 {circum}` fits its centre to the ring, and:
- **the lowering** — `polygonCircle3` emits the noun's `CYCLIC_MEMBER` fix (the #305 registry): rhombus →
  square, parallelogram → rectangle, kite → right kite, trapezoid → equal diagonals (equal legs also hold on
  a parallelogram), generic quad → `concyclic`; the note that the shape was narrowed is #1996's `narrowed` notice (below);
- **the backstop** — `apply` records one `concyclic` claim per vertex past the third, so a ring nothing
  made cyclic is refuted rather than drawn.

The circle rewrites the ring's `quad-general` preference (#615) to the cyclic member, marked `right` by a
stated right angle. A right trapezoid in a circle (`cyclic.forced = rectangle`) is refused by `parse3` as
`inscribed-contradicts-noun` (#1554); a quadrilateral's incircle refuses `incircle-needs-triangle` (#1838).

**One noun list, and an incircle the engine does not draw (#1891, [ADR-3D-311](06b-decisions-3d.md#adr-3d-311)).**
The inscription's container marker reads the lexicon's `POLY_NOUN_HE3/EN3` (triangle, every quad noun, pentagon,
hexagon, «מצולע»); in English it takes every word between "in" and the noun as the phrase ("the given", "this",
"regular"). `parse3` asks `uninscribableIncircle3` before any rule: a circle inside a ring whose size is not in
`INCIRCLE_RING_ARITIES3` (engine/types, the one constant apply's `circle3` check reads) → `incircle-not-drawn`,
worded by `incircleRefusal3` (a quad: `incircle-needs-triangle`; five or more: `incircle-known-limit`). «משוכלל» /
"regular" is the lexicon's `regular` adjective, scoped to a flat polygon noun, consumed on `square` only;
`droppedShapeAdjective3` accounts for it by a square or an equal-sides lowering on the ring.

**What a ring was DECLARED to be, and the trapezoid's identity (#1918, [ADR-3D-313](06b-decisions-3d.md#adr-3d-313)).**
- **The declared adjective.** A quad declaration records the adjective its phrase consumed: `quad-shape.adj`
  for a flat ring, `solid.baseAdj` (→ `SolidObj.baseAdj`) for a quad pyramid's base. `declaredQuads3(c)`
  (`baseShapes.ts`) is the ONE reader of "what was this ring declared to be" — `knownQuadShape`, the
  circle-through-a-ring refusal, the build notices and the warning all ask it.
- **The two-line circle refusal.** `notCyclic3(noun, adj)` (`lexicon/shapePhrase3.ts`) is the lookup
  `readShapePhrase3` uses too. `apply` refuses `circle3 {circum}` through a declared ring the lookup rejects
  (`against: 'noun'`), and a declaration of such a ring that a circum circle already passes through
  (`against: 'circle'`). `derive3` fills `sentence` (the refused line) and `other` (the first enabled fact that
  declared the ring, or stated its circle), so `err.inscribedContradictsNounVs` — 2-D's over-constrained frame —
  names both statements. The one-line form keeps `err.inscribedContradictsNoun`.
- **The disjoint re-declaration.** ARM 3 reads `kindRelation(known, declaredKind3(cmd))` (the shared lattice,
  [ADR-3D-345](06b-decisions-3d.md#adr-3d-345)): `known` is the meet of every noun on the ring (`knownQuadKind`, a
  narrowing recorded on the `quadShapes` entry's `kind`); `implies` → redundant, `excludes` → `shape-disjoint` with both
  KINDS (worded by `err.shapeLessSpecific` over `notice.narrowed.shape.*`, so the adjective is named), an adjective-only
  narrowing records the kind and leaves the figure, anything else lowers. The store twin (`ringRestatementTwin3`)
  judges a restatement against the meet of every ENABLED noun (ADR-3D-346).
- **A CROSSING ORDER of the same letters** (#1991, [ADR-3D-327](06b-decisions-3d.md#adr-3d-327)). `convexWhenSimple(base)`
  — read off `quadShapeConstraints`' relation set: a parallel pair, a right angle, or four equal sides; false for the
  kite and the bare quadrilateral — makes the crossing STRUCTURAL. `derive3` groups the declared rings by letter SET
  after the retry fixpoint and BEFORE the claim pass: a group with two cyclic orders, one of them convex-when-simple,
  refuses the LATEST declaring fact `ring-crossed`. Running first is why no verdict has to be overridden; ADR-3D-322's
  sample-based pass stays where it is, for the rings whose figure the pivot can still place.
- **The IMPLIED re-declaration** (#1988, [ADR-3D-326](06b-decisions-3d.md#adr-3d-326)). The same split's other arm
  has ONE outcome: `quadImplies(known, cmd.base)` records the statement in `redundantShapes` and returns the figure
  untouched, so `buildNotices3` says it added nothing. `shape-less-specific` is gone from `EngineError3`. The store's
  `ringRestatementTwin3` reads the SAME `quadImplies` so no row is added, and in a reading other than the declared
  spelling the stricter `quadImpliesInEveryReading` (a noun that names one pair of sides does not survive an
  arbitrary reading).
- **The pair in force.** `trapezoidRingInForce3(ring, stated)`: sides 0/2 of the ring as named, unless the
  student stated sides 1/3 parallel and not 0/2. `derive3`'s order-free pre-scan reads the stated ∥ (segment
  `mutual-rel parallel`, never `origin: 'shape'`) and SEATS the declaration: `quad-shape.seat` reads the family's
  relation and its missing corner on the ring one place round (ink, declaration and record keep the student's
  ring), and `solid.baseSeat` → `SolidObj.seat` maps the generator's base ring one place round in
  `evaluateSolidsAndPoints` (the one id ← generated-vertex mapping). Never saved: a load re-reads it.
- **The warning.** `shapeWarnings3(c, positions)` (`notices.ts`) lists every declared trapezoid whose DRAWN ring
  has both pairs parallel at |sin| < sin 1° (`quadShapeDrawn('parallelogram')`). `derive3` returns it as
  `shapeWarnings`; `App3` renders it as an amber `Banner kind="notice"` (`role="status"`) with 2-D's
  `figure.mismatch` / `figure.v.trapezoidMorph` words copied into 3-D's `warn.*` keys. `buildNotices3` drops a
  warned ring's `narrowed` notice.

**A declared ring the givens force narrower is said ([ADR-3D-343](06b-decisions-3d.md#adr-3d-343), #1996).** `store/narrowing3.ts`
`narrowingNotes3` runs at the end of `derive3`'s fold (`deriveCore3(…, narrow = true)`; its subset trials fold through
the same function with `narrow = false`, so no recursion and no `deriveStats3` count). Declared kind: a `quad-shape`'s
base + `adj` (`declaredKind3`), `rect-complete`, a `QUAD_PYRAMIDS` solid's base (its ring `ids[0..3]`), a flat
triangle's `readShapePhrase3` adjectives. Forced kinds: `ringKinds` over `knowledgeSamples3(c, claimSeeds(seed))`
(placed samples only), widened by one more claim-bar group when the declared kind shows in only one or two samples.
The cause search is capped at `NARROW_TRIALS_3D` subset trials (a COUNT — past it «בגלל הנתונים, …»). `buildNotices3`
turns the result into `{ kind: 'narrowed', ids, note }`, rendered by `i18n/narrowingText3.ts` (`notice.narrowed.*`).
`CYCLIC_MEMBER` is the solver's fix table only; the one pair the lattice cannot name — a right pyramid over a plain
«מרובע» — keeps ADR-3D-090's `base-constrained` sentence.
**Both voices: the subject decides, and the ring is read past the circle's name (#1975, [ADR-3D-341](06b-decisions-3d.md#adr-3d-341)).**
`circleContains3`'s fallback (no container marker) asks `circleEnclosesByVoice3` — the copy of 2-D's voice reader:
the subject of «חוסם» / "circumscribe" is the outer figure, and a ring between the circle noun and the verb («מעגל
ש-ABC חוסם») is that subject. `inscriptionRing3` is the first label run once `CIRCLE_NAME3` («מעגל O», "circle O")
and the centre clause are set aside, so a circle named first no longer reads its own letter as the ring.

**An unnamed circle of a ring is keyed by (kind, ring) (#2125, [ADR-3D-342](06b-decisions-3d.md#adr-3d-342)).**
`ringCircleId3` (engine/types) is the one place an unnamed inscription circle gets its id: the circle through the
vertices is `circle-<ring>`, the circle inside is `circle-in-<ring>` (analytic's `incircleId` spelling). A named
circle keeps `circle-<letter>`. apply's `circle3` duplicate-id check is unchanged, so a same-kind restatement still
collides on its id, and saved files replay their stored commands, so an old incircle holding `circle-<ring>` loads
as it was. `studentLetters3` reads `circle-in-ABC` as «ABC», so a refusal naming the incircle names the ring.

**The inscription accounts for every word (#1902, [ADR-3D-312](06b-decisions-3d.md#adr-3d-312)).** `polygonCircle3`
removes its own spans, each marked: the ring, a named circle's letter, the verb, the circle noun, the container
marker and `phrase.strip` (the noun and the adjectives it consumed, 2-D's `ShapePhrase.strip`). What is left goes
through `unreadWords3`, the closure ADR-3D-125's `declLeftover` shares: a prefix letter counts as filler only glued
to a removed span. The words go out as `parse3`'s `unread` (a per-rule slot, `UNREAD3`). The declaration gate
reads a qualifier only as a phrase a reader lowers (`SHAPE_ADJ_WORDS3` + nouns3's `SOLID_QUALIFIER_HE`: a solid's
rightness and equal edges), never word by word. `normalize3` folds «שוה» → «שווה».

**A shape's own condition carries its provenance (#1844, [ADR-3D-308](06b-decisions-3d.md#adr-3d-308)).**
Every shape lowering — `quadShapeConstraints`, the `CYCLIC_MEMBER` fix, the adjectives, a base noun,
«שווה מקצועות», a pentagon's circle — emits its relation commands (`length-rel`, `cos-angle`, `mutual-rel`,
`concyclic`) through ONE seam, `shapeInternal3` in `baseShapes.ts`, stamped `origin: 'shape'`. They drive
and are judged as typed relations are (pin, `given: true` arbiter, claim); apply skips only a sentence's
side effects — the auto-drawn segment and a `mutual-rel` plane-run's patch. Persisted in a fact's `cmds`;
locked by `issue-1844-shape-internal-origin.test.ts`.

### A point placement keeps its tail (#1730, [ADR-3D-296](06b-decisions-3d.md#adr-3d-296))

`onSegment` («X על YZ») is anchored: after the carrier comes nothing, a distance tail, or a connector
(`PLACEMENT_CONNECTOR`) and a condition. A whole ratio of the rider (`WHOLE_RATIO`) keeps the ratio lane
(a baked `t`, or the #921 letter); any other is read by `readCondition3` —
the ordinary rule list, all or nothing, where a bare pair equation is a LENGTH (`CONDITION_LENGTHS`). The
rider stays free and the condition drives it; an unread tail declines the line. The net is
`droppedGivenRelations3` in `lostGivens3`: a stated pair relation must be carried by a command that states
something, and the number gate ignores the digit in a command's `type` name.

### One coordinate of a point (#1547, [ADR-3D-299](06b-decisions-3d.md#adr-3d-299))

«x_B = 3» is «B(3, ·, ·)» (analytic's ADR-AG-042 identity): `componentGiven` lowers it to a `point3` whose
other components are null with no `syms` — an existing id takes the M1 pin and the `coords-eq` claim, a new
id is the ADR-3D-094 `partial` point. One frame table, `COMPONENT_FRAMES`, is read by the value tail, the
sign tail (formerly `signGiven`) and the ask head (`componentAskOf`). Its axis letter is lowercase; an
uppercase one is folded once in `normalize3` (`SUB_AXIS_FIRST3` / `SUB_AXIS_LAST3`, the ADR-AG-274 shape:
a label after the `_`, or the axis after a label's `_`; a digit subscript is a label and stays), #2081,
[ADR-3D-362](06b-decisions-3d.md#adr-3d-362). The answer is `dataView`'s per-axis
decision (`pointComps`, beside `pointCoords`); a `partial` point's stated components are placed absolutely.

**The translation anchor is per axis** (#2340, [ADR-3D-373](06b-decisions-3d.md#adr-3d-373)).
`translationAnchoredAxes3` (`engine/evaluate.ts`) answers which axes of the figure's translation the givens
anchor: all three for a coordinate point or the #639/#803 frame reasons, otherwise the union of the axes each
point pin gives a value (a null component, lettered or not, anchors nothing). `translationKnown3` is its
`size === 3` and `vectorFramePinned3` its `size > 0`. Every translation-dependent knowledge surface reads it:
the points loop judges an axis only when it is anchored or the point's own stated component, the two-configuration
row needs all three, and a plane's d-term needs every axis its normal has a
component along (`planeOffsetAnchored3`, shared by the panel and the query lane). The resolver does not read it:
the figure is unchanged.

**A plane's two forms are one derivation from its equation** (#2367, [ADR-3D-376](06b-decisions-3d.md#adr-3d-376)).
`parametricPlaneForm(eq, { run, positions, pointKnown }, symbol)` (`dataView.ts`) returns a row whenever the
canonical equation `eq` is knowledge: the base point is `run[0]` when the panel's own `pointComps` call it fully
known and it is stable, else `planePointAndSpan(eq)`'s point (two coordinates 0, the third solved on the axis
whose value is an integer, then the largest |coefficient|); the directions are the run's two edges when stable,
else the two smallest gcd-reduced members of (b, −a, 0), (c, 0, −a), (0, c, −b) over `planeIntCoefs(eq)` (the
integer scaling `planeEqStr` prints). Every piece is checked (on the plane, in it, independent) or the row is
withheld. The panel's planes block and the query lane's plane branch call it wherever they print the equation —
no other gate — and the panel also lists every non-free equation-given plane on the equation's agreement alone
(absolute, so no translation anchor).

**The read-back samples the placement's leftover rigid freedom** (#2368, [ADR-3D-375](06b-decisions-3d.md#adr-3d-375)).
Every knowledge gate decides "fixed" by agreement across resolves, so it sees only what the resolver varies; the
funnel freezes rotation about a pinned point or axis (the ADR-3D-101 deferral) and the pivot's eight starts are
seed-independent, so a turn the givens leave free landed in the same few basins at every seed. Stage 6 of the
pivot block (`resolve3`) publishes `pivot.placementFreedom()`: lazily, `solvePivot`'s measuring probe takes the
central-difference Jacobian of the primary residuals — the full construction, plane pins and member pins included,
over a snapshot of the resolved planes and lines — with respect to the six rigid unknowns in `rigidChart`'s
coordinates (a world translation in figure scales, a world rotation about the origin; regular everywhere, unlike
raw axis-angle at |w| = 2π), and returns `6 − numericRank` with the null space (`symmetricEigen` of JᵀJ). Scale is
excluded from `dim` (#518 samples it) and dims are held (seed-sampled); a seventh column, the size, gives `counted` (turn + size, a pure slide excluded), `rotation` and `scaleFree`, which the cue and the drawn walks read (ADR-3D-379). `resolve3(c, s, { placementImage: true })` replays the
plain resolve's pivot pools (`pivotStageMemo3`, read by the image only) and then walks the chosen solution along a
seeded unit combination of the generators — the #803 slide pattern: hard-pin the projection, release on the primary
residuals, keep it only if exact, non-degenerate and moved; transactional on signs and the parameter. The image
carries a one-entry pool, so `twoConfigurations3` and `branchAgrees` never read a moved point as a second
configuration. `knowledgeSamples3(c, seeds, { readback: true })` adds one image per sample whose freedom is
non-zero; `dataView` and every `answerQuery` lane read back, claims and narrowing keep the plain samples, and the
drawing never walks.

### Who may introduce a point: the drawing registers (#1184, [ADR-3D-253](06b-decisions-3d.md#adr-3d-253))

A **carrier** («נסמן: AB = u») never introduces its own subject (`v7-t1`); only a **drawing register** —
`segment3 {bare}` and `draw-arrow` — may introduce points. Both refuse a pair with two unknown endpoints
(the typo guard) except where `canStartFigure(c)` holds (no points, no solids), and that exception is
applied to the arrow lane only: `segment3 {bare}` feeds shape-completion and role rules that ask which
points exist (#601, #978). `canStartFigure` is the named predicate the next register asks.

### The mint pass ([ADR-3D-382](06b-decisions-3d.md#adr-3d-382), #1467)

`deriveCore3`, after the post-pass fixpoint and the stale-message refresh: each still-red row (list order) whose latest
dry run (`dryRunOn`) reports `unknown-point` / `two-unknowns` on a `mintableId3` id has that id minted `free3`
(`mintFree`) and is dry-run again until it applies — then applied, recorded in `created[factId]` (unless
`declaresOnly3`), and the fixpoint re-runs. A row still failing keeps nothing and takes the post-mint status. When
anything was minted, `deriveCore3` folds AGAIN with those points placed first (`premint`), so every row applies in list
order; a row that fails there is dropped from `premint` and reports its reason (`postMint`).
`mintEligible3` (`engine/mintable.ts`) excludes a statement about a solid's own element (`solidElement3`: a diagonal,
the solid's height, a height to a named base face, a tetrahedron's altitude; #978). **Lines** ([ADR-3D-383](06b-decisions-3d.md#adr-3d-383),
#2489): an `unknown-line` for a name in `lineSlotNames3` is minted by applying `free-line` (its refusal is the line's), and
is placed by `premint` like a point; lines are never in `created` (no notice). `withFreeLines` is gone. **Planes** ([ADR-3D-388](06b-decisions-3d.md#adr-3d-388),
#2484): an `unknown-plane` for a π-token in `planeSlotNames3` (a `plane-named` operand, a `plane` / `p1` / `p2` name) that
names nothing (`mintablePlane3`) is minted by applying `free-plane`, placed by `preplanes`, never in `created`; the
`on-planes` case no longer creates inline, so a membership creates through the pass too. The bare-segment apply branch declares
both fresh ends. `Derived3.created` → the store's `lastCreated` on `record` → `App3`'s `CreatedNotice`; ✕ is `remove`.
**A name clash found by the pass is not final** ([ADR-3D-387](06b-decisions-3d.md#adr-3d-387), #1188): the dry run reads
the WHOLE fold, so a later row may already own the name an earlier row introduces («נסמן: AB = u» · «וקטור u» on a
blank page). A post-mint `already-defined` therefore keeps the row's created points as a `premint` candidate and lets
the in-order refold judge; a clash that is real in list order is dropped by the refold exactly as any failing row is.
**Slot keys are type-checked** ([ADR-3D-399](06b-decisions-3d.md#adr-3d-399), #1566): the walks read
`LINE_SLOT_KEYS3` (`line`, `line1`, `line2`) and `PLANE_SLOT_KEYS3` (`plane`, `p1`, `p2`), and a compile-time
assertion over every key of `Command3` (any depth) fails `tsc` when a `line…` or `plane…`/`pN` field is not in its list.
**Solids** (ADR-3D-399): a `no-such-solid` whose id is a letter run carried with its noun by an operand
(`mintableSolid3`: a `{noun, ids}` object, noun ≠ `any`) is minted by applying the commands of that noun's bare
declaration (`solidDeclaration3`, the parser reading «פירמידה ABCDS»); its refusal is the line's. The declaration is
not placed before the refold (its letters may belong to an earlier row): `presolids` prepends it to the row's own
commands in `expandFact`, so it applies at the row, in list order. Its new points are in `created`. **A row red only
because of a LATER row keeps what it created:** the refold drops a minted row only if it also fails in the fold of the
rows up to it (`ownFailure`), so a contradiction between two statements is reported as one, never as a missing object.

### Guide prerequisites ([ADR-3D-398](06b-decisions-3d.md#adr-3d-398), #1566)

`CatalogEntry3.needs?: { he: string[]; en: string[] }` holds the lines an example needs on an empty canvas.
`guideTryLines3(entry, lang, factCount)` (`src3d/app/guideTry3.ts`) is the one answer: the needs then the example when
`factCount === 0`, else the example alone. `App3`'s manual `onTry` submits the needs lines through `submitSentence3`
(stopping on the first one not taken) and the example through `submitText`. `ManualScreen`'s props are unchanged; the
shell knows nothing of it. `catalog-blank-canvas-1566.test.ts` folds every construction-lane entry this way, in both
languages, with a shrink-only allowlist naming the owning issue of each remaining failure.

### Free vectors ([ADR-3D-386](06b-decisions-3d.md#adr-3d-386), #1188)

A **free vector** has components and no position. It lives in a sibling store, `Construction3.freeVectors`
(`name → FreeVec3 { comps, stated? }`), never in `vectors` (anchored: a point pair), and never in `points`,
`segments`, `arrows` or `positions`. A name lives in exactly one store; `declare-vector`, `inject-vector`,
`name-vector` and `free-line` refuse `already-defined` across them (`vectorNameTaken3` also asks lines, planes and
`symbolOwnersOf`). **The accessor:** `namedVector3(c, n)` (anchored | free | undefined) and `vectorValue3(c, at, atom)`
in `vecExpr.ts` are how a VALUE reader asks; position readers keep reading `c.vectors`, because a free vector has
nothing for them to read. The remaining direct `c.vectors.has/get` reads are counted by a ratchet
(`issue-1188-free-vector.test.ts`) that may only go down.

- **Apply.** `declare-vector` (parsed from a vector-MARKED bare name list, or the plural noun «וקטורים») is idempotent
  on a free name. `inject-vector` on a name that is not anchored is the M1 duality (`injectFreeVector3`): an unknown
  name is declared with the tuple; a free one has each component SET (was free) or VERIFIED (equal: redundant;
  different: `free-vector-conflict`, which `derive3` reports as `givens-contradict` naming both lines). A bare letter
  names a free component through #814's `partialNames`; an affine component is a linear relation (step 2). On an
  anchored name it is the pivot pin, unchanged. **The reference check** is ONE function, `vectorRefsError3(c, names,
  use)`: every command that names a vector states its use — `'metric'` (magnitude, angle, ⟂, ∥, dot: refused
  `free-vector-metric` on a free name until step 4) or `'combination'` (a vector equation, a vec-rel, a span point:
  `free-vector-combination` until step 2). A free name is checked before an unknown one, so «w = u + v» is the honest
  "not yet", never `unknown-vector` about w.
- **Evaluate.** `resolveFreeVectors3(c, seed)` is a pure post-pivot stage of `resolve3` (`Resolved3.freeVectors`): it
  reads nothing positional, so a figure without free vectors resolves bit-identically. A stated component is kept; an
  unstated one is sampled in ±`FREE_VEC_RANGE` from the structural key `fvec-<name>-<axis>` (inside the half-range a
  stated component sign allows), and a draw under `FREE_VEC_FLOOR × FREE_VEC_RANGE` re-draws its sampled components
  from `…#k` (the norm floor: never a dot). A sign on a free component is honoured here, so the pivot's sign readers
  ask `positionalComponentSigns3` and never see it. `freeDofCount3` adds the unstated components.
- **Need-basis (Q5).** `point-in-span` counts `c.vectors` only — a floating p beside the cube's u, v, w must not turn a
  buildable span point into `need-basis`.
- **Panel and ask.** `statedVectorRows` prints a stated tuple as typed and a never-stated free vector as
  `u = (?, ?, ?)`; the measures rows carry `u = (1, 2, 3)`, `|u|`, `u²` only when the value agrees across
  `knowledgeSamples3`. A free vector's value is absolute, so no frame or scale gate applies to it. The ask lane's
  `atomOf` admits a free name; «u» answers its components when seed-invariant, and a quantity read off free vectors
  alone (`|u|`, `u·v`, `∠(u,v)`) skips the scale gate.
- **Render** (display, never geometry: the angle-mark ADR-3D-043 / draw-arrow ADR-3D-039 precedents).
  `render/freeVectorLayout.ts` places each free vector's world tail, every build, from the figure as drawn: the
  TRAY, declaration order, one band per vector stacked up world z (the screen's vertical at every yaw), set past
  the figure's +x bounding box by a gap scaled to the longest vector; on an empty canvas centred on the origin.
  `buildScene3` adds the tails and heads to the fit and emits a `SceneVector3` with `free: index`; `Figure3` inks it
  from `FREE_VECTOR_COLORS` (distinct from `VECTOR_COLOR` and the plane patches). No point exists, so no dot and no
  letter is drawn.
- **Save/load.** `declare-vector` is a saveable command; the store holds facts only, so a reload re-derives the
  free vectors from the lines that stated them.

### Free objects: one operand seam ([ADR-3D-388](06b-decisions-3d.md#adr-3d-388), #2484)

A free line (`resolveFreeLine`) and a free plane (`resolveFreePlane`) read the operand a relation names through the same
two functions in `operands.ts`: `operandDirection3` (segment, vector, determined line, axis) and `operandNormal3` (named,
point-run, coordinate plane). For a free plane, every `plane-rel` claim naming it is read that way. Against a normal m:
∥ → n ∥ m, ⟂ → n ⊥ m. Against a direction d: ⟂ → n ∥ d, ∥ → n ⊥ d, an angle β → the #534 cone about d, ⊂ → n ⊥ d plus
the segment's ends as members. A contained `lineRels` line adds its anchor (`lineAnchors`) as a member. A plane × plane
angle stays on its #1439 lane. The DOF is still counted by the code that pins. The placement funnel's predicates
(`freePlaneFigurePinned3`, `freePlaneOffsetPinned3`) are unchanged: `reresolveFreeObjects3` re-resolves the plane after
the funnel, and the relations hold at every seed. Outright pins combine last-writer-wins (#2487 owns the ordered fit).

## Solving the figure and judging claims

### The solver — a coordinate-injection pivot, not a general CAS

`solve3.ts` handles what the corpus asks for: a gauge-free figure built in the geometric lane receives
**absolute givens mid-session** (a point coordinate, a vector value), and the engine solves for the
**similarity** — translate, rotate, scale — *plus* the free shape dimensions that realise them:
least-squares over the dims, Levenberg–Marquardt with a central-difference Jacobian, seed-rotated
multi-start. It is the concrete meaning of [`FR-VC-3`](02b-requirements-3d.md)'s NO CAS: a numeric
root-find, a closed form, or a linear solve, nothing more.

**The sampling law inside the solve (#863, [ADR-3D-245](06b-decisions-3d.md#adr-3d-245)).** A quantity that
depends only on `(construction, seed)` — a solid's seeded dims, any `sample(seed, key, …)` — is derived once
per resolve and threaded into the residual (`sampledSolidDims`). `rng.ts` exports `sampleStats` (2-D's
`sampleStats.sweeps` twin), so a lock asserts O(distinct keys) calls — a count ceiling, never a wall clock.
The free-line / free-plane resolvers still sample inside the residual.

**One solve per configuration (#863, [ADR-3D-304](06b-decisions-3d.md#adr-3d-304)).** `resolve3` is a pure
function of `(construction, seed, paramValue)`, memoized at that chokepoint (a WeakMap on the construction's
identity — `apply` clones, never mutates). Every consumer shares it through `knowledgeSamples3`;
`resolveStats3` counts resolves and hits.

**A pin symbol's admissible roots are one set (#1769, [ADR-3D-395](06b-decisions-3d.md#adr-3d-395)).** One
root predicate decides whether a candidate joins the pool: `collect` admits it only when it is exact on the primary
residuals, not collapsed, and every member pin holds by the verifier's own bar (`membersHold`, which reads
`onLineHolds3` / `memberHolds3` from `operands.ts`). A candidate exact on `ACCEPT` but outside that bar gets the #1311
release and is judged again; the #803 slide's acceptance asks the same predicate. The #797 walk (`symbolWalk`) closes
the pool over every source of a root: the cold starts, the #816 widening and the #1735 re-seat, each base walked once
(`pinRootKey`, the one root key the walk, the round-robin interleave and stage 4 share). A collapsed pinned stage is
no evidence of continuity, and is retried once with the shape held (retry-only). Stage 4 keeps one validated
representative per root and applies them as the pool; the slide and the read-back image carry the pool's `symRoots`
when their own symbol values are among them (`rootsDescribe`). The panel prints the set
(`branchAnswer`) when every sampled seed's pool carries the same ≥ 2 roots (`rootSetsAgree`, shared with the
algebraic lane's branch row); any disagreement reads «k = ?».

**A symbolic coordinate lives in one of two lanes** (ADR-3D-218, #898): with a solid, a pivot **pin**
carrying the full affine form, exponents included; with none, a `coord-sym` point stored as a degree-1
`{k, p}`. The narrower lane **refuses what it cannot hold rather than narrowing it silently**.

**A rider's ratio clause is read by the RIDER** (ADR-3D-224, #921). An on-segment
point carries a parameter `t`, and a statement relating its host's parts *determines* `t` in closed form
— no solving. `onSegmentRatio.ts` reads the two **halves** (`|aR| = k·|Rb|`, `riderPairsT`) and a half
against the **whole** (`|aR| = k·|ab|`, `riderWholeSide`/`riderWholeT`), pairs as SETS, with `t` confined
to the open interval — an endpoint-or-beyond coefficient is refused, never clamped. A LETTER coefficient
binds the name only (`riderNames`). **One chokepoint** (ADR-3D-231, #932): `riderRatioRetarget`, at
`applyCommand3Inner`'s entry, rewrites a ratio statement into its `point-on-segment3` given, so `vec-rel`,
`length-rel` and the `length-ratio` claim share one semantics; a letter is read in the stated orientation
only (`1/t` is not a name).

### Gauge, and why the landing funnel exists

A figure's placement, rotation and scale are a **gauge**. An unanchored figure (no absolute object, solid,
revolution or circle) is normalised onto the floor at the end of `resolve3` (ADR-3D-272). The **landing
funnel** classifies which gauge components are *provably* free, which licenses
[`FR-SP-4`](02b-requirements-3d.md): a number is drawn only if it survives the gauge being resampled.

**The pivot's residual families are ONE list (#1550, [ADR-3D-281](06b-decisions-3d.md#adr-3d-281)).**
`pivotFamilies3(c)` (evaluate.ts) names every residual family `solvePivot` consumes and its solve LANE:
`anchor` (step 1, the normal solve), `plane-eq` (step 3), `frame` (step 3b — against the ABSOLUTE frame,
satisfied by turning the figure), `membership` (step 4, the transactional membership drive). The entry gate
and every trigger read that list, so no family (`coordPlanePins` among them) lacks a lane. `drivesAlone`
says whether presence alone triggers the lane; `false` means FAILURE PATH ONLY. The coordinate-frame row's
unmet test is the claim's own predicate (`coordPlaneRelHolds`) at `CLAIM_REL_TOL`. `issue-1550.test.ts`
locks totality: every `c.*Pins` / `figure*(c)` family `solve3.ts` reads is a row.

**The leftover turn and size are measured, then drawn (#2378, #2504, [ADR-3D-379](06b-decisions-3d.md#adr-3d-379)).**
The funnel still decides what the SOLVE may move and freezes a partial rotation (a turn about a pinned point or
axis). After the solve, resolve stage 6 reads the rank probe (`pivot.placementFreedom()`, below) for any solid whose
rotation is anchored (`rotationAnchored3`: an absolute-frame object or a stated vector) and whose placement is not
already sampled: it parks a free size at the seed's target (`freedom: 'size'`), then turns the figure by a seeded
angle over the full turn about a seeded axis of the leftover turn (`freedom: 'turn'`), both in `originChart` (about
the figure's gauge origin), kept only when as exact as the base solution and every sign given holds. The cue adds
the same probe's `counted` (`leftoverPlacement3`): one source for the count and the drawing. A pure slide is
neither counted nor walked here (stage 5 owns the slide).

**The #512 frame verdict is per placement COMPONENT.** `placementSampledParts` publishes translation and
rotation separately (`placementSampled` is their disjunction); a frame claim softens to
`placement-not-fixed` only when a component it READS was sampled.

**A figure that shares no point with another carries its own similarity (#1855, [ADR-3D-355](06b-decisions-3d.md#adr-3d-355)).**
Two solids never share a vertex (`apply` refuses a solid over existing ids), so every solid is its own connected
component. Solid 0 rides the construction's gauge; every further solid appends seven dims, `[ln s, w, t]`
(`componentSimilarityDims`, applied about its canonical centroid by `evaluateSolidsAndPoints`), read through
`solidDimsAt` by the sampler, the pivot's `perSolidDims` and `freeDofCount3`, and counted by `freeDims`. They are
ordinary dims: a length on each figure, or a relation between them («AB ∥ DE»), is driven, and with nothing
stated they resample. A one-solid figure appends nothing and is bit-identical.

### A never-positioned point is a pivot unknown (#1311, [ADR-3D-260](06b-decisions-3d.md#adr-3d-260))

A `free3` point («וקטור AB» on an empty canvas, «קטע BE» from a known B, a mixed shape run) carries three
unstated DOF that are **pivot unknowns**: each coordinate is a #820 rider-lane entry keyed
`freeCoordKey(id, axis)` in `riderTs`, anchored at its canonical sample. `evaluateSolidsAndPoints` places a
driven coordinate, and the pivot runs on a solid-less figure that holds one (`hasFreePoint3`). The apply
fork drives a scalar statement when **its reach includes a free DOF** (`statementReachesFreeDof3`, [ADR-3D-393](06b-decisions-3d.md#adr-3d-393)):
the solids have free dims, or a point it names — or a point one of those is built from (`pointParents3`, a total
switch over `PointDef`) — carries a `drivable` entry of the carrier table (`reachesFreeCarrier3`, `carriers.ts`). The
carrier reach is read only on a figure with a solid; on a solid-free figure #1311's clause (a NAMED `free3` point)
stays the claim arm's second condition. Every
drive-or-claim site in `apply.ts` asks it (the claim arm and its magnitude demotion, `cos-angle`, `mag-rel`,
`mag-val`, `concyclic`, `dot-eq`, `cos-eq`, the angle-letter pair, `bisector-dir`, `line-plane-angle`, ⟂/∥-to-plane);
`freeDims` stays a count. On a rigid figure the FIRST magnitude is still the #754 scale given; a later magnitude
that reads a free carrier, or arrives while the scale given does, **demotes** it to a pin recorded as its own
arbiter (`given: true`), and its fact joins the pin owners so a later contradiction names it. A later magnitude
that reads no free carrier is then checked exactly (`magnitudeSizeStated3`, `scaleGiven.ts`).
`lengthClaim` lowers a marked «וקטור AB = 5» to the one-word form's arrow. A candidate the anchors left just
above `ACCEPT` is polished on the primary residuals alone and kept only if that closes it without collapsing
a solid (a free coordinate's anchor equilibrium sits higher than a rider's, which moves within `[0, 1]`).

**A free shape dim is SLID to the seed's sample** (#1854, [ADR-3D-332](06b-decisions-3d.md#adr-3d-332)).
The dims pull toward `dims0` rides only a plane drive (ADR-3D-030) and the `invariantOnly` lane, so on the
ordinary gauge-solving path a dim the givens leave free used to park wherever LM's null-space walk ended —
reliably the EDGE of the admissible set (`משולש ABC · AC = 8 · BC = 3` came back AB = 5, the degenerate
|AC − BC|, at 18 of 24 seeds). `settleFreeDims` therefore runs AFTER acceptance, beside `parkScale`: pull the
dims toward `dims0` at 1e-2, RELEASE on the primary residuals, and keep the result only if it is exact, not
degenerate and nearer the sample than the start — so a determined dim is structurally unreachable and the
anchor never decides whether the givens hold. Not on a plane drive (already anchored) and **not on the pooled
path** (`collectAll`), where a slide would move a discrete branch the sign/root filters read. In-solve REG
rows were measured and rejected: the 1e-4 gradient sits under LM's improvement floor (#518's lesson), so the
dim crawls and the stalled iterations cost 2.9 s against 11 ms.

**The not-determined rule** (`sampledCarrierVerdict`, `store3.ts`): a failing claim that reads a sampled
carrier (a free plane, a free line, the frame placement, a free point) is refused naming it, never
`claim-refuted`. Two rows read only a `given: true` arbiter and answer `given-not-drivable`, the tool's limit
(ADR-3D-291, #1590): a point whose free parameter stayed sampled (`carrierParams3` keys the pivot did not
drive, or a coord-sym letter with no root) unless `Resolved3.coordDetermined` answered `contradicts` or
`determined` (ADR-3D-293) or `statedDataAdmits` finds a contradiction; and the apex of a cone or cylinder
of unstated height.

### The sampled-carrier table and the one frame rule (#1498, [ADR-3D-267](06b-decisions-3d.md#adr-3d-267))

**The frame rule.** `gaugeFramePoint3` (types.ts, beside `GAUGE_KINDS`) is the one answer to whether the
pivot's similarity applies to a point; the final placement and every residual (`laneAt` in `residualsFor`)
read it, so a residual sees the drawn figure's frame.

**The carrier table.** `carrierParams3` (`engine/carriers.ts`) enumerates every sampled point-DOF — keys,
bounds, anchor seeding, drivability — and both `freeDofCount3` and the pivot's rider lane fold it, so a
carrier cannot be counted yet undrivable (the ADR-052 smell): `on-plane`, `on-line`, `bisector-ray` and
`partial` riders enroll in the drive. Plane/line riders enroll as offsets from their sampled seat;
not-drivable rows: a side-point's height and riders of free planes/lines (#557).

**A host bound is restored, not only enforced** (#1735, ADR-3D-306). `offHost` (in `degenerate()`) rejects a
converged candidate outside `[lo, hi]`; when the pool is otherwise empty, an acceptance site re-seats the
discarded off-host riders (`reseatOffHost`) and re-solves the rest, judged by the site's own acceptance —
the cold-start loop, the dims widening, `collect()` and the `invariantOnly` loop.

**The ⟂-from-an-in-plane-point disposition** (#1499, ADR-3D-268). `seg-plane-rel`'s one-new-letter funnel
asks `structurallyOnRun3`: off-plane keeps ADR-3D-146's foot; in-plane mints a `free3` letter driven by the
⟂. `degenerate()` rejects a NON-flat solid's ring at zero area (2-D ADR-413's rule in R³); a FLAT ring's
collapse goes to a **frozen-dims retry** with the shape fixed at the seed's sample.

**The base sentinel names a solid's base; a flat polygon has none** (#1907, ADR-3D-315). `seg-plane-rel`
with `plane: []` resolves to the single solid's base ring — unless that solid is a `FLAT_SOLID_KINDS`
polygon, where `flatHeightReading3` (apply.ts) reads the line as 2-D does: first letter the apex (a ring
vertex), the foot on the opposite side (the unique ∥ partner of an edge through the apex among the
figure's `mutual` ∥ requirements, else the ring's first side not touching the apex). A new foot lowers to
`altitude-foot`; an existing point structurally on that side lowers to the M1 `cos-angle` 0 given. No
reading ⇒ the reducer refuses (`unknown-plane` `base`), and `readStatement3` answers `not-understood`
(the AI lane) for that and for every height sentence that is not a bare altitude (`isBareAltitude3`:
not «אנך», no named solid, no value). The parse is unchanged, so saved figures do not drift.

**…and the dropped-perpendicular imperative reads the same base** (#1944, ADR-3D-321). `perp-to-base`
(«מ-A מורידים אנך לבסיס», «גובה מנקודה A לבסיס») resolved the base the same wrong way — `c.solids[0]`'s
first three ids, the flat host's OWN plane — so `height-to-face` minted the foot on the apex itself
(|EA| = 0, a zero-length altitude drawn green). The side rule is now **one function, `flatBaseSide3`**,
which both lanes call, so the sentinel height and the imperative cannot answer the same question twice;
`flatHost3` is the shared premise (the figure's one `FLAT_SOLID_KINDS` solid) and `oppositeSides3` the
ring walk. The gate asks the **degeneracy, not the spelling**: it fires when the face being dropped onto
lies wholly in the flat host's ring (the unstated sentinel, and a face named from it), lowers to
`altitude-foot`, and still appends the `len` claim; an apex that is not a ring vertex refuses
(`unknown-plane` `base`). A ⟂ from a point off the ring, and every solid's base, keep their reading.

**An altitude onto an existing foot is M1** (#1942, [ADR-3D-367](06b-decisions-3d.md#adr-3d-367)). The
`altitude-foot` arm, with `cmd.id` already a point, lowers instead of refusing `already-defined`: a free
`on-segment` rider of that very side (no `t`, no named parameter) is **re-defined** as the `foot-seg` (the #748 /
#343 definition-update pattern — D slides, nothing else moves); any other point gets the foot's two defining
incidences as the givens 3-D already has, `point-on-segment3` on the existing id (its M1 arm: a bisector ray settles,
else a `collinear3` claim) and the «⊥» spelling's `cos-angle` 0, then the segment. They drive what is free and are
verified where nothing moves. A letter that is the apex, an end of the side, or a vertex of any declared solid keeps
`already-defined`. No new solver term.

**Which givens forced the collapse** (#1815, ADR-3D-309). `collapseIsStated` re-solves `[gauge | dims]`
without the rider rows; if the ring opens, an incidence invented the collapse, and the empty pool marked
`collapse: { ring, riderKeys }` reaches `pivot.collapse`, where `derive3` refuses `polygon-collapsed`
(`err.polygonCollapsed`).

**The same conflict stated about an existing point** (#1847, [ADR-3D-361](06b-decisions-3d.md#adr-3d-361)). When the incidence is stated last, about a point that already exists («M אמצע BC · M על AB»), it is a `collinear3` claim, not a rider. A refuted `collinear3` claim on a figure with a `FLAT_SOLID_KINDS` solid and free dims (`membershipCollapse` in `derive3`, after `sampledCarrierVerdict`) is re-resolved once with the pin it states (`mutual` coincident lines a–b, a–c); if that pivot comes back empty with a non-solid `collapse` record, the claim is refused `polygon-collapsed` (not forced), naming the statements that first placed the claim's points off the ring. Otherwise it stays `claim-refuted`.

**A declared polygon collapsed is refused, whatever forced it** (#1849, ADR-3D-310, ADR-W-115).
`settleFlatRings` (formerly `preferUncollapsed`) keeps solutions with every declared ring open, then tries
the frozen-dims retry and the **open-figure retry** (`openSolveOn(null)`, passing `degenerate`); with
nothing open, the pool is marked `collapse: { ring, riderKeys, forced }` — `forced: false` names the riders'
statements, `forced: true` the ring's own pin owners (`err.polygonForced` / `err.polygonForcedAlone`). A
polygon over existing points records a `polygon-open` claim (`given`), judged by `ringCollapsed3`; a sliver
(`ringOpenness3` < 1e-2) is released and counts as collapsed if it lands flat.
**The release is a tightened re-solve** (#2292, [ADR-3D-372](06b-decisions-3d.md#adr-3d-372), ADR-W-146). `tightResolve` re-solves the
thin candidate on its own residuals (the gauge frozen where its path froze it). `limitRoot` judges it against `TIGHT_FLOOR`
(`TIGHT_TOLERANCE_FACTOR`² × 1e-12 = 4e-16 on the squared residual, 2-D's 0.02). The candidate is collapsed when the
re-solved ring is collapsed, or when the re-solve misses the floor while the ring thins to ≤ `LIMIT_THINNING` (0.9) of
its openness: a limit (tangent) root, approached sublinearly, such as «|BA| = |BC| · ∠ACB = 90°». A genuine thin ring
re-solves exact where it stands. The re-solve replaces the old "exact AND collapsed" release one for one.
**The release has two triggers and two verdicts** (#2503, [ADR-3D-378](06b-decisions-3d.md#adr-3d-378)). Besides a thin declared ring
or solid, `pairSliver` asks the same re-solve of a candidate whose driving relations' operand pairs (`pinOperandPairs3`, a
`Record` over every `ScalarPin` kind, each pair tagged `arm` when it carries a direction) come within `SLIVER_BAND` of the
figure's extent — two vertices of a quadrilateral meeting leave the ring open. The verdict is `limitRoot` on that pair, or an
**emptied angle**: after the re-solve an `arm` pair sits at or below the 1e-4 collapse line. With no ring collapsed and no
solid flat, the pool is marked `limit` (not `collapse`), `isCollapse` reads both, and the store's zero-solution path refuses
the line `givens-contradict`, naming the statements.

**A declared solid forced flat is refused the same way** (#1860, [ADR-3D-358](06b-decisions-3d.md#adr-3d-358)).
`settleFlatRings` judges every solid, not only the flat kinds: `closedFigure(r)` adds `solidSliver(r)` — a non-flat
solid whose `flatnessRatio` is under `SOLID_THIN_RATIO` (1e-2, #936's calibration, moved into `solve3.ts`) is
released on its own residuals and counts as flat if the re-solved solid is flat (`flatSolidAt`, the #872
off-plane test, 1e-4 of span), or a limit root by the same `limitRoot` verdict on its `flatnessRatio` (ADR-3D-372). An EXACT candidate the #872 hard gate discards records `flatSolidSeen`
(`noteFlatSolid`, at every acceptance site); an empty pool with one runs the open-figure retry and otherwise
comes back `collapse: { ring: solid ids, forced: true, solid: kind }`. `derive3` names it as a solid
(`polygon-collapsed` with `solid: nounOfKind(kind)`, the letters as the declaring statement wrote them) and
`errorText3` words it with `err.solidForced` / `err.solidForcedAlone` over `err.solidShape.*` / `err.solidKind.*`.
A newest pin owner whose recorded claim has no `given` (a claim-arbitered answer, ADR-3D-030) keeps `claim-refuted`:
the store ignores a SOLID collapse record for it.
The #936 notice (`degenerateSolids`, `solid-degenerate`) is deleted.

**A declared polygon over fixed points must be a simple ring** (#1923, [ADR-3D-314](06b-decisions-3d.md#adr-3d-314)).
`ringSelfCrossing3` (vec3.ts, beside `ringCollapsed3`) asks whether two non-adjacent sides properly cross in the
plane their endpoints share (touching, collapsed and skew are not crossings). `derive3`, after the claim pass, asks
it of every declared ring in its declared order — flat `polygon4/5` solids, bound `polygon-open` rings and
`declaredQuads3`'s flat rings — but only when every vertex is coordinate-fixed (`coordinateFixers3`: a `coord`
point, a full `coords-eq` given, or a 0-DOF derived point of `DERIVED_POINT_KINDS3` over fixed points). The latest
of the declaring fact and the facts that fixed its vertices is refused `ring-crossed` (`err.ringContradictsNoun`,
analytic's text); a row already red keeps its own message.

**…and over points a shape placed, when nothing can save it** (#1927, [ADR-3D-322](06b-decisions-3d.md#adr-3d-322)).
When some vertex is not coordinate-fixed, the same loop widens the scope to `placementFixers3(…, solidVertex, flatSolid)`
— any solid's vertex, a flat one included — and asks two things before refusing: the ring is crossed at EVERY claim
sample (`knowledgeSamples3(c, claimSeeds(seed))`, unplaced samples skipped, none placed fails open), and every OTHER
declared ring over a superset of its letters that orders them differently (the "partner" whose convexity forces the
crossing) is a quadrilateral with a pair of opposite sides parallel at every sample — convex whenever simple. A partner
that could be a dart (a kite, a general quadrilateral) fails the check open: a valid drawing exists that 3-D does not
draw. The blame is the latest of the ring's ordered declaration, its placers and its partners' declarations, so the
ring-first order refuses the shape line. **One ring is one cyclic order** (`ringKeyIds3`, apply.ts): a polygon bound
over existing points, `recordShape` and `knownQuadShape` all match rings by cyclic order, never by letter set — a
square's letters in another order are another ring.

**And it must lie in ONE PLANE** (#1928, [ADR-3D-319](06b-decisions-3d.md#adr-3d-319)). `ringSkew3` (vec3.ts, the
third ring predicate) measures the spread of a ring's vertices along the normal of its best-spanning triple
(`runNormal`) over its greatest pairwise distance — 0 for a flat ring, scale-free, and 0 for a ring with no plane
at all, which is the collapse predicate's business. `derive3` asks it of the same `declaredRings3` enumeration,
against `CLAIM_REL_TOL`, under a WIDER scope than the crossing check: `placementFixers3(…, solidVertex: true)`
also counts a vertex of a NON-FLAT solid as placed, because that solid's shape fixes it up to similarity
(`coordinateFixers3` is the same walk with the solid arm off, which keeps ADR-3D-314's narrower ruled scope). The
ring must additionally be skew at EVERY claim sample (`knowledgeSamples3(c, claimSeeds(seed))`, skipping an
unplaced sample per ADR-3D-284 and failing open with none), so a free magnitude that could flatten it is never
called a contradiction. The completing line is refused `ring-not-flat` (`err.ringNotFlat`, [ADR-3D-325](06b-decisions-3d.md#adr-3d-325),
#1978) — the same `stated`/`others` as the general `givens-contradict` it first reused, plus the vertex count (the
noun, `err.polygonKind`) and the vertices, so the sentence says the shape is flat and these corners are not; with no
other statement to name it falls back to `givensContradictAlone`. Never `ringContradictsNoun`, since reordering
the letters cannot flatten four non-coplanar points. **Order at the site: collapse → skew → crossing**; a skew ring
has no plane in which to judge a crossing.

**A ring over a FREE vertex is made flat at apply** (#1935, [ADR-3D-356](06b-decisions-3d.md#adr-3d-356)). The skew check
above only judges rings whose every vertex is placed; a ring that still has a placeholder vertex (`free3`, or a #841
`implied` rider) is flattened where it is declared. `flattenRingFreeVertices3` (apply.ts) takes the ring's placed
vertices as anchors (promoting the earliest-minted free ones up to three), materialises their plane run and re-homes
every other free vertex onto it as an `implied` rider — the corner kind ADR-3D-172 mints. It runs in the all-existing
flat-polygon arm, in the mixed run when a known corner is itself free, and in `quad-shape`'s all-known arm; there a
ring with exactly ONE placeholder corner first yields it to ARM 2 (the family's own corner: closed form for the
parallelogram family and the kite, a plane rider otherwise), keeping the point's original slot in the order
(`keepPointSlot3`) so its dependents still follow it.

### Claims

Recorded on `Construction3.claims` at apply and verified in `derive3`, so **a claim cannot escape inside a
composite command**; `claims.ts` checks each against four deterministic seeds (`claimSeeds`).

**The diagonal claim's two layers ([ADR-3D-203](06b-decisions-3d.md#adr-3d-203), [ADR-3D-246](06b-decisions-3d.md#adr-3d-246), #978).**
One predicate, `diagonalClaimVerdict` (`baseShapes.ts`), judges «אלכסון AB» over the solids holding both
letters (`null`: none can judge yet). The `segment3` apply arm refuses on `false`; `derive3` re-asks over the
final figure and reports `not-a-diagonal { a, b, kind }`, which `submit` refuses through the fold.

**A named meeting point is a crossing, judged on the figure ([ADR-3D-297](06b-decisions-3d.md#adr-3d-297), #1728).**
«האלכסונים AC ו-BD נפגשים בנקודה E» lowers to two claimed `segment3 {diagonal}` and `seg-crossing3`, whose
`seg-cross` point is closed-form (`lineCrossing3`), as is `diag-intersection`; `derive3` checks
`mutualHolds('intersecting')` and refuses `segments-do-not-meet { id, s1, s2 }`.

**A change that orphans a row, and the symbol retry pass ([ADR-3D-220](06b-decisions-3d.md#adr-3d-220), #926).**
`derive3` applies each fact through `applyFact`, then re-applies to a fixpoint every red row a dry run
(`retryWouldSucceed`, on a scratch copy — `applyCommand3` is pure) shows would succeed (ADR-3D-257, #1327;
ADR-3D-259, #1339); red rows only, so ADR-104's stranding hazard cannot occur (ADR-W-089). `remove` /
`toggle` / `replaceFact` report every other row they turned red as `dependents-broken { items, cause }`;
`replaceFact` still returns `true`, with the report in `lastError`.

**Knowledge samples — seeds cover the gauge, enumeration covers the branches ([ADR-3D-283](06b-decisions-3d.md#adr-3d-283), #1474).**
`answerQuery`, `dataView` and `verifyClaim` all sample through `knowledgeSamples3(c, baseSeeds)`
(`evaluate.ts`): each base seed × every value of `paramConfigValues3`, via
`resolve3(c, s, { paramValue })`; with `{ readback: true }` (the panel and the ask lane) also the image along a
measured leftover placement freedom (#2368, see *The read-back samples the placement's leftover rigid freedom*).
`querySeeds3`, `panelSeeds3` and `claimSeeds` sample only the gauge;
branch coverage never rides seed offsets (`chooseParam` picks `pool[seed % n]`), and agreement gates read
`every` sample, never `[0]/[1]/[2]`. `paramIsKnowledge` answers only for m's own value. `openCrossings3`
asks per crossing at `Resolved3.seed`, with `openParamProbes3` for an unpinned m.

**Two configurations print as one «או» row ([ADR-3D-289](06b-decisions-3d.md#adr-3d-289), #1506; [ADR-3D-336](06b-decisions-3d.md#adr-3d-336), #1867).**
`twoConfigurations3` (`dataView.ts`) asks whether a not-fully-determined point has EXACTLY two members
(`sameConfig`) — the same two at every sample, the drawn one among them, judged beside #827's
`pivot.pointRoots` check. If so `points` carries one row `S(…) או (…)`, each configuration printed whole by
`coordStr`, instead of `S(?, 7/2, ?)`, and `pointOptions[id]` carries the same text for the ask lane's point
answer; `pointCoords` keeps the partial form; anything else returns `null`. The ask lane answers either text
WITHOUT the label: App3's row prints «<question> = <answer>», so every `QueryResult.answer` is the bare value,
and a `params` row carries `value` beside `text` for the same reason ([ADR-3D-339](06b-decisions-3d.md#adr-3d-339), #1746).
The vector answer (`vectorForms`, `queries.ts`) skips the decomposition when a NAMED atom decomposes to the unit
vector on its own name (`isUnitOn`): a basis vector asked by its name answers only its coordinates, or nothing
(the undetermined note) without a frame; a pair keeps its decomposition ([ADR-3D-371](06b-decisions-3d.md#adr-3d-371), #2072).

## The submit decision and refusals

### The submit decision (#1394, [ADR-3D-258](06b-decisions-3d.md#adr-3d-258))

`store3.submit` decides nothing: `decideSubmit3(state, utterance)` returns a `Verdict3` (rename ·
not-understood · refused · already-stated · record) and `submit` dispatches it. The decision is pure, so
#1358's register can ask "would you accept this line?". The statement seams share `readStatement3` (the
grammar plus the #866 repair and the #516 typed refusals), `lostGivens3` (the honesty gates) and
`decideCommands3` (gates → twin → derive → search), where the LLM lane's `submitSteps` also ends. The twin is
`sameStatement` (spelling), else `ringRestatementTwin3` (#1953, [ADR-3D-324](06b-decisions-3d.md#adr-3d-324)): a single
ring declaration over a ring an enabled fact declares, up to rotation and reversal (`ringKey3`), whose noun that
fact's noun already IMPLIES (#1988, `quadImplies` / `quadImpliesInEveryReading` — the generic word is that
predicate's `quad` row, no longer a kind test). A parse's
`unread` words (#1902) flow through `lostGivens3`, reported as `dropped-given` only when no other gate fired; the
LLM lane collects them from every model line. A new
branch belongs in the decision; a parity lock replays recorded sequences.

**The model lane keeps every shape and role word (#1906, [ADR-3D-364](06b-decisions-3d.md#adr-3d-364)).**
`decideSteps3` passes `lane: 'model'` through `decideCommands3` and `honestyRefusal3` to `lostGivens3`, which then adds
`droppedPropertyWords3` (`src3d/parser/propertyWords3.ts`) and merges its items first (`mergeWordItems`, shared). The
member finds the student's property words with the shared reader (`shell/llm/honestyCore.ts` `propertyWords`,
[ADR-W-144](06w-decisions-workspace.md#adr-w-144)), vetoed by `readsWord3` (the declaration vocabulary, qualifiers,
construct and neutral words), and asks per occurrence: a SHAPE word asks the owning gates (`droppedShapeNoun3`,
`droppedShapeAdjective3`) of the line spelt right against the same line without the word; a role word needs its own
family (altitude: `altitude-foot`, `tetra-altitude`, `height-to-face`, a ⟂ to a plane, `cos-angle` 0, a `height` field;
median: `point-on-segment3` at ½, `centroid3`, `midpoint-auto`, an equal pair; bisector: `bisector-ray` / `-dir` /
`-point` or an angle equality); an inscription verb needs the `circle3` kind `statedCircleDirection3` (the grammar's
`circleContains3`) gives the student's line. The deterministic lane is unchanged.

**A part the reading never read (#1888, [ADR-3D-316](06b-decisions-3d.md#adr-3d-316)).** On the deterministic lane
(`decideSubmit3` → `decideCommands3` with `readExtent`, and the ✎ `replaceFact`) the honesty verdict
`honestyRefusal3` runs `lostGivens3` plus `unreadParts3` (`src3d/store/unreadParts3.ts`), the 3-D member over
`shell/readExtent.ts` (ADR-W-120): each label run (primes included) is substituted and re-read with `parse3`; a run
no substitution changes is unread. Exempt: a co-reference (shell) and a run right after a polygon, circle, base or face noun
(qualifiers allowed between, never a vertex noun) whose letters are on the figure or carried by the reading (3-D's scene name:
«…במשולש SBC», «פירמידה SABC שבסיסה משולש ABC»). 3-D reads no compound, so the line is one clause, cut at the
shortest prefix that reads the same (`cutAtReading`): a lost tail is `split-statements` (`err.splitStatements`,
2-D's text) or, when the read part is a bare right triangle and the tail one of its vertices, `right-angle-vertex`
(`err.rightAngleVertex`, the taught lines). An unread run with read labels after it joins `dropped-given`.
A line `parse3` FAILS on whole (#2088, [ADR-3D-370](06b-decisions-3d.md#adr-3d-370)) reaches it through
`readStatement3`'s `not-understood` branch (`compoundLostPart3`): the line is cut into clauses (`clausesOf3`, 2-D's
`clausesOf` ported, after the shared `foldConjunctionSpacing`), and when every trailing clause reads alone and the head's
own submit decision is exactly its lost-part note, that note is re-issued over the head's cut with the trailing
clauses appended (`withTrailing3` → `lostPart3`): the taught list continues from (3), the parts list after the head's parts. The LLM
lane (`decideSteps3`) is not re-read: its commands are the model's, not a reading of the utterance.

**A role word the reading never read (#1904, [ADR-3D-317](06b-decisions-3d.md#adr-3d-317)).** `honestyRefusal3` asks
`unreadRoles3` (`src3d/store/unreadRoles3.ts`) FIRST: the shell's word class (`readWords`) deletes each cevian noun
(`CEVIAN_NOUNS3_HE/_EN`, composed into `CONSTRUCT_NOUNS`), bisect verb stem or ⟂ word (`PERP_WORDS3`, composed into
`PERP_SPLIT`; «ניצב» left out, it is the leg noun) with its clitics and re-reads with `parse3`. An unread one refuses
`split-roles` (`err.splitRoles`, 2-D's W22 text) when the line states two noun roles, the reading names the side, and
the two taught lines both RECORD through `decideSubmit3` on the figure in turn; else `split-statements` with the line
cut before the later role word (back over its connective; a «ו-AD» / "and AD" subject goes with the second part).

**The App's pre-LLM lane is one function too (#1692, [ADR-3D-305](06b-decisions-3d.md#adr-3d-305)).**
`src3d/app/decideDeterministic3` wraps `decideSubmit3` with the registers App3 consults on `not-understood`
(the #353 nudge, then the ADR-3D-040 guidance register) and returns a `Verdict3` or `guided`, dispatched by
`dispatchVerdict`; the LLM lane's step decision is `decideSteps3`. `/log-triage` replays a session through
`src3d/app/triageReplay3`, which CALLS both; `refusalCategory3` sorts refusals into guided / clarify /
refused.

**The wrong-tool families in that register** are `cross-app` (a bare 2-D noun → the 2-D Geo Builder) and,
since #1954 ([ADR-3D-330](06b-decisions-3d.md#adr-3d-330)), `coordinate-point` — a point given with
exactly TWO coordinates → the analytic Builder, in 2-D's own sentence (ADR-W-118 B1; the byte-equality lock
is `shell/__tests__/coordinate-point-parity-1954.test.ts`, since neither tree may import the other). The
**arity is carried by the pattern, not by a count**: `COORD_PAIR3` closes its bracket after the second
coordinate and the bracket-less form refuses a third, so «A(0,0,0)», a vector component, a plane equation
and a parametric direction can never reach it. It sits beside `component-arithmetic` (#509), the register's
other coordinate-tuple rule, whose own patterns require a 3-tuple — the two are disjoint by construction.

### The clarification family: under-specified is not unsupported (#866, [ADR-3D-239](06b-decisions-3d.md#adr-3d-239))

| | what it is | what the student needs to hear |
| --- | --- | --- |
| **unsupported** | the tool does not implement this | say so — the scope register's voice |
| **under-specified** | understood, but it does not pin one figure | which detail to add |
| **unknown** | the grammar does not own the sentence | escalate (the LLM lane) |

`parse3`, being context-free, returns a *typed* refusal carrying what the sentence supplied; the **store**
derives the candidates from the construction and composes the message. `ambiguous-main-diagonal` (#836)
and `ambiguous-angle-vertex` (#866) share that shape. Where the figure yields one reading, the store rebuilds
the canonical sentence and runs it through `parse3`, so the grammar stays the only authority. Unlike 2-D's
ADR-164, 3-D asks whenever the figure gives more than one reading — **except** (#1942,
[ADR-3D-367](06b-decisions-3d.md#adr-3d-367)) a bisector's «זווית V» at a vertex of exactly one polygon of the figure
(a flat ring or a solid face, one per vertex set), which is that polygon's angle, as 2-D's ADR-590 reads it. The one
resolver is `vertexAngleAt3` (`src3d/engine/vertexAngle3.ts`: one angle → silent; one polygon → its ring neighbours,
the bisector's own foot excluded as an arm; else the candidates, `angleCandidates3`). A polygon reading travels as
`readAs` on the `record` verdict and `dispatchVerdict` sets `lastNotice` `vertex-angle-read-as`, shown with
`notice.vertexAngleReadAs` — 2-D's `input.vertexAngleReadAs` sentence (locked in `shell/__tests__/suite-vocabulary.test.ts`).

## What the student sees

### Rendering

Orthographic orbit, hidden edges dashed by **numeric outward normals**, not a painter's algorithm.
`scene3.ts` is pure and React-free; `Figure3.tsx` mounts it. Vector notation is `notation.ts`; math text is
the shared [`shell/math.tsx`](04w-design-shell.md). **Every annotation is sized in pixels.**

**The stated-angle arc lane ([ADR-3D-221](06b-decisions-3d.md#adr-3d-221), [ADR-3D-222](06b-decisions-3d.md#adr-3d-222),
[ADR-3D-227](06b-decisions-3d.md#adr-3d-227)).**
Vertex arcs are ONE map keyed by wedge — the vertex plus its two ray DIRECTIONS, matched order-free within
±1.5° — fed by `vangle` pins, `vertex-angle-eq` claims and `angleMarks`, emitting once per wedge and reading
`degText` (the value once stated, the letter until then). An `angle-seg-eq` arc sits on `meetingPoint`
(`rightAngles.ts`, the knee's own answer), on its ≤ 90° side, and is absent for skew or off-ink pairs. A
stated value is painted only where the verifier's measure holds (ADR-3D-290, #1592). `wedgeArc` is the one
arc geometry; its radius is `min(ARC_PX, ARM_FRAC × shortest PROJECTED arm) / k` (ADR-3D-229).

**The knee lane's vertex ([ADR-3D-360](06b-decisions-3d.md#adr-3d-360)).** A stated segment pair's knee
needs both `meetingPoint` (the arms genuinely meet — honesty) and `namedVertexOf` (the facts name the
meeting: a shared endpoint, or a `seg-cross` point defined on exactly those two segments, read from
`c.points`, never from positions). An unnamed crossing draws no knee; the arc lane keeps `meetingPoint`
alone. A pair recorded from two named vectors (`SegPair.viaVectors`) keeps the crossing knee (#2093).
`namedKneeOf` ([ADR-3D-366](06b-decisions-3d.md#adr-3d-366)) answers the vertex AND the corner: a shared
endpoint (`armDir`, as before); an endpoint whose definition puts it on the other segment's line (`on-segment`,
`foot-seg`, `plane-cut`, `bisector-seg`, `seg-cross`) — the vertex is that point, with no `meetingPoint`
crossing required, arms toward the far end and the other segment's second-named letter; or a `seg-cross`, arms
toward `seg.b` and `seg.d`. Those two arms are relation knees: after the wedge dedup, one yields to another knee
at the same vertex whose arms are parallel to its own. A `foot-seg` knee's in-line arm points at the side's
second letter (`def.b`), the far end only when the foot sits on it. In `buildScene3` a knee at a named point adds its corner's screen direction to that point's incident list, so `labelDir` places the letter outside the mark.

**One dihedral geometry ([ADR-3D-264](06b-decisions-3d.md#adr-3d-264)).** `dihedralGeometry`
(`render/dihedral.ts`) gives the foot on the seam and two unit arms ⟂ to it, oriented by
`dihedralAnchors`. `rightAngles3` draws every `plane-rel` ⟂ / 90° claim's knee through `operandPairKnee`,
gated on `relDeviation` ≤ `DIRECTION_REL_TOL`, never on the panel; a dihedral knee carries no `planeN`.

**Line × plane construction ([ADR-3D-280](06b-decisions-3d.md#adr-3d-280)).** `dihedralsStatedBy` also yields
`line-rel` angles over a planar operand and `line-plane-angle`, normalised for the `pairKey` cede;
`buildScene3` sends them to `linePlaneConstruction`: P on the line (else `fallbackLen` along it), H its foot,
X the crossing, with H as `SceneDihedral3.extra`. Only pairs actually drawn cede their knee (`drawnConstr`).

**Dihedral construction ([ADR-3D-265](06b-decisions-3d.md#adr-3d-265)).** `dihedralConstruction` picks the
foot from a meaningful point (a run's vertex off the seam, preferring the face over the base via
`solidBaseRings`; else a named point on a non-run plane; else the geometry's own foot with
`legLen: null`). Chip state is `dihedralShown: Record<factId, true>` (`store/dihedralChips.ts`, the
`displayMode` shape, saved by fact index), owned per `dihedralChipsByFact` (including the legacy `plane-angle`). `buildScene3` takes
`dihedralShown` and emits `Scene3.constructions`; other lanes cede via `constructed` and `pairKey`. The
foot's letter comes from `engine/freeLetter.ts` (shared with `midpoint-auto`) — a display label, never a fact.

**The object-angle lane is not panel-gated ([ADR-3D-266](06b-decisions-3d.md#adr-3d-266)).** `objectAngleArc`
(ADR-3D-185) reads only stated records — `plane-rel` / `line-rel` claims, `relMarks`, `linePlaneMarks` —
and draws unconditionally; there is no `showObjectAngles` flag in `buildScene3`, `Figure3` or `App3`. Only
`coordLabels` depend on the panel.

**A VALUED parameter's two forms compete on one surface, and the student picks** (ADR-3D-233, #925/#937;
ADR-W-047). A symbol whose valuing row is set to `letter` reads its letter in `degText`. `collectWedges`
yields the wedges, `competingArcSymbols` the symbols with both a label and a value, and
`store/paramChips.ts` puts the chip on the fact whose `symbol-value` named one. The choice is `displayMode`,
keyed by fact id (by INDEX in the save file), carried on `App3 → Figure3 → buildScene3` beside `planeDisplay`.

**Which row carries a plane's chip is DERIVED, not stored** (#1550, ADR-3D-281, amending ADR-3D-197).
`store/planeChips.ts`: the first `ok` fact naming a drawn plane carries its chip; later mentions carry none
and inherit it when that row goes, and `App3` passes row status (#847: an amber row owns nothing).
`planesNamedBy` is the one structural reader — `plane-run` / `plane-named` operands at any depth, a field `plane`, a declaration's
`name`, and the `ids` of the four plane kinds.

**The plane map is the student's planes** ([ADR-3D-350](06b-decisions-3d.md#adr-3d-350), #2126). `Resolved3.planes`
holds only stated planes and the ones a relation materialises from a typed point run; every plane surface (patch,
label, fold framing, «מישורים» rows and chips, crossing offers) reads it. A circle carries its plane in
`Resolved3.circles3` (centre + normal) and never publishes it under its id.

**A plane's display default is DERIVED, not stored** (ADR-3D-278, #1485). `planeDisplay` holds only toggles;
`defaultPlaneDisplay3(c, name)` reads `Construction3.faceNamed`, recorded by `materializePlaneRun` from an
operand's `face: true`, so the default re-derives on load.

**Row direction (ADR-3D-228).** A row's base direction comes from `textDir3` (the seam shared with 2-D and
`InputArea`), never `dir="auto"`, which is banned in `src3d/` and `src-complex/` outside editable fields;
the decision is `factRowDir3` (`render/FactRow3.tsx`). `VecMath` emits each expression as a
`<math dir="ltr">` island inside the row.

### The stated-magnitude lane (#918, [ADR-3D-235](06b-decisions-3d.md#adr-3d-235))

| kind | scene record | shape |
| --- | --- | --- |
| distance | `SceneWitness3` | dashed closest-point segment **+** value |
| angle | `SceneAngle3` | arc **+** value |
| **length** | **`SceneMeasure3`** | **value only** — the segment is already drawn |

The lengths come from `statedLengths` (`engine/dataView.ts`), shared with the panel and keyed by the
unordered pair; not gated by `showWitnesses` or by edge visibility. A **length letter** (`lengthMarks`, «|AB| = k»,
ADR-3D-381) draws in the same lane with its text (`lengthMarkText`: «k», «2k») until a value is stated on the pair,
when the value wins.

**A bare vector naming is said aloud** (ADR-3D-381). `vec-rel`'s bare arm (`AB = <new letter>`, no «נסמן») lowers to
`name-vector` with `bare: true`; the flag rides the vector record, and `buildNotices3` emits `vector-named-bare` for
each such vector — derived from the construction like every notice, so undo, the ✎ edit and load show the right thing.

### The degeneracy notice (#936, [ADR-3D-234](06b-decisions-3d.md#adr-3d-234)) — retired

Deleted by #1860 ([ADR-3D-358](06b-decisions-3d.md#adr-3d-358)): a solid the givens force flat is refused at the
pivot (see *A declared solid forced flat is refused the same way*). `flatnessRatio` and its calibrated band
(`SOLID_THIN_RATIO`) live in `solve3.ts`.

### The DOF cue: measured, not inferred (#370, #990 — [ADR-3D-247](06b-decisions-3d.md#adr-3d-247), [ADR-3D-248](06b-decisions-3d.md#adr-3d-248))

`freeDofCount3` («דרגות חופש שטרם נקבעו») reads the resolution, never a second opinion (ADR-3D-124). When
the placement is sampled (`placementSampled3`) the six placement DOFs are counted and the gauge allowance
drops from 7 to 1 (ADR-3D-060). Scalar pins consume what `scalarConsumed` measures — the `numericRank` of
their residuals' response to each shape dim, lazily on the display path — with `− scalarPins.length` as
the fallback.

### The data panel has two kinds of row (#1196, [ADR-3D-254](06b-decisions-3d.md#adr-3d-254))

| kind | source | needs a determined figure |
| --- | --- | --- |
| measurement (`points`, `vectors`, `planes`, `params`, `relations`, `mutual`) | three sampled configurations, intersected | yes |
| given (`stated`) | the construction | no |

`stated` comes from `c.vectors`, the `vec-eq` claims and, since #2077 ([ADR-3D-368](06b-decisions-3d.md#adr-3d-368)),
every pair / named-vector pin that carries a `stated` record; `panelIsEmpty` counts both kinds (#296).

**The typed-text channel (#2077).** Every component reader in `parse3.ts` (`pairInjection`, `vectorInjection`,
`coordPoint`'s symbolic arm, `injectionList`) attaches `srcs`, the three components as typed with only whitespace
trimmed, through one helper (`compSrcs`). `apply.ts` copies it, with each component's letters and an ordinal across
the pin families, onto the pin (`pins` / `vectorPins` / `pairPins`) or the `coord-sym` point as `stated:
StatedComps`. Nothing solves from it. `dataView` prints a component as typed until every letter in it is in
`known`, the map the `params` loop fills at the same `paramRow` decision that prints «k = 2» (one decision, the
#481 rule), and then as `cleanMag(evalAffine(…))`. The points loop's free axis prints the stated letter
(`statedLetterText`) in `points` / `pointCoords`, while `pointComps` keeps «?». A command without `srcs` (an
internal lowering such as `componentGiven`, or a figure saved before #2077) records no row. The
composer sits in the engine (`render → engine`); a row's arrow comes from `lexicon/marks3`. `bidi3.test.ts`
asserts the section count and `dir: 'app'` on each (never a section-level `dir: 'ltr'`, #559). Every
measurement field of `DataPanel` keeps only what agrees across the samples.

**A parameter's roots: one join, two surfaces (#1591, [ADR-3D-303](06b-decisions-3d.md#adr-3d-303); [ADR-3D-336](06b-decisions-3d.md#adr-3d-336), #1867).**
`branchAnswer(sym, branches)` classifies the roots through `shell/valueOptions`: «±√2» for a symmetric pair,
«-2 או m = 4» for any other pair, `null` for none or three and more (the open «m = ?» row). The panel's `params` row prints
`${sym} = ${answer}` and App3's ask row `${question} = ${answer}`, both through `branchAnswer` (#480, #1746).

### The input preview composes, and who may import whom (#1195, [ADR-3D-255](06b-decisions-3d.md#adr-3d-255))

The strip under the input box returns a NODE — `inputPreviewNode3` in `render/FactRow3.tsx`, beside
`FactRowText3` (Am. 1, #1312) — because `VecMath` replaces the `U+20D7` marker with a `<mover>` spanning the
pair:

| branch | gate | prepared how |
| --- | --- | --- |
| mathematics (#1152) | `hasMath` | isolated, then `MathText` |
| vector (#1195) | `isVectorMarked3` | `vectorNotation` on **raw** text, then `VecMath` |
| plain | — | isolated, `null` when isolation changes nothing |

**Every `VecMath` caller gates it, and the gate is the caller's** ([ADR-3D-301](06b-decisions-3d.md#adr-3d-301), #1543).
`VecMath`'s `PAIR` regex arrows any two-label run, so each surface in `FactRow3.tsx` decides: the step row
by its commands (`isVectorFact3`), the preview by the typed text (`isVectorMarked3`), the ask echo
(`askEchoNode3`) by `QueryResult.echo` — `'vector'` iff `parseQuery` bound a vector atom (`|AB|`, `AB·CD`,
`∠(AB,CD)`, bare `AB`), else `'plain'`.

**The vector branch must NOT pre-isolate**: `VecMath` isolates itself (ADR-3D-184) and would read LRI/PDI as
`op` tokens (`op ⁦ · pair AB · … · op ⁩`). The routing never lives in an `App3.tsx` callback (#900). Box and
preview both take their direction from `textDir3` on the raw text (#868; ADR-3D-255 Am. 2).

**`vectorNotation` stays in `render/notation.ts`, not in `i18n/bidi.ts`**, which imports only the
`lexicon/` leaf (ADR-3D-300) so that `parser/`, `engine/` and `render/` can all depend on it; `render`
depends on `i18n` and `lexicon`, and `factDisplay3` is its lock's reference.

| layer | imports | why |
| --- | --- | --- |
| `lexicon/marks3` | nothing | the marking vocabulary, readable by grammar and display alike (#1194) |
| `i18n/bidi` | nothing | the isolation transform, a leaf for the same reason |
| `render/notation` | `lexicon`, `i18n` | the notation transform; the display layer is the consumer |
| `render/FactRow3` | `lexicon`, `i18n`, `render/*` | the ROUTING — which renderer a surface uses, for both surfaces |

| surface | what it can ask | gate |
| --- | --- | --- |
| step row (`factDisplay3`) | the COMMANDS exist | `isVectorFact3` |
| input preview (`inputPreviewNode3`) | only the RAW TEXT — no command yet | `isVectorMarked3` |
| `vectorNotation` itself | — | **none; it is unconditional** |

`vectorNotation` would arrow «אורך AB = 5» or a bare `DC=3AB`; every caller supplies the honesty gate.

## Known gaps

- **A symbolic line-equation given resolves in ~12 s**, and the *canonical* spelling is the slowest path.
  **[#863](https://github.com/dcodish/geo_builder/issues/863).**
- A revolution's size driven by a stated length (#1569, parked).
- A length on a free point after a solid's scale given is not driven (#754 owns the size; the not-determined
  rule makes it honest), and the DOF cue still counts a driven free vector's six coordinates as free
  (fail-open). The three-valued verdict #909 deferred is not built.
- A vector given by its COMPONENTS with no points at all («נתון: v = (10,-5,0)») cannot start a figure:
  `Construction3.vectors` is `Map<name, {from, to}>` — a vector IS a point pair — so this needs the
  positionless-vector design in [#1188](https://github.com/dcodish/geo_builder/issues/1188).
