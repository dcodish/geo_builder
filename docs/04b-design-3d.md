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
reads: format controls stripped, primes and minus unified, script transitions split. **The prime fold is
one set** (ADR-3D-300): `PRIME_GLYPHS3` / `foldPrimes3` in `lexicon/marks3.ts` (′ ’ ‘ \` ´ and the Hebrew geresh ׳, ʹ, ʼ → `'`),
called by `normalize3`, the ask lane's `parseQuery`, the LLM sequence gate and the rename dialog, and read by
the bidi run alphabet — no reader spells its own prime class. Lowercase labels are uplifted by
`upliftLowercaseLabels`, the ONE chokepoint, only where an anchor proves a label (the angle glyph/word,
a point/vertex noun, a `label(…)` coordinate at the head of a definition, the single-letter subject of a midpoint statement — ADR-3D-287); a solid noun is not an anchor (#353/#498).
`midpoint-auto`, the one rule in `parse3` that INVENTS a point's name, matches a full anchored frame
(`MID_HE`/`MID_EN`, shared with the anchor), so a word it does not own declines the line.

**Case is taught, never silently accepted** (ADR-3D-226). What no anchor proves goes to the #353 nudge in
`scope3.ts` (`upperCasedLabelCandidate3`, consulted by `App3` before the LLM seam). It lifts a label-shaped
run of two or more characters — never an English prose word (`NOUN_EN`/`EN_STOP`, from `parse3`) — runs
only on a failed parse, and fires only if the candidate parses.

### Relations as a disposition map

`relationTable.ts` maps each `relation × operand-kind` pair to a status and the actions it licenses
(`drive`, `claim`, or unsupported), so an undrivable relation is **claim-gated** rather than mis-driven, and
the map is enumerable ([docs/26](archive/26-3d-relations-plan.md)). `operands.ts` resolves operand
*thunks*, so a rule names what it wants without knowing how it is produced.

**A relation's lane is decided by its OPERANDS, never by its word** (#1439, ADR-3D-263). Between two
absolute objects a relation pins the figure parameter when an operand carries it **in what the relation
reads** (ADR-3D-286, #1472: ⟂ / ∥ / angle read directions; coincidence, containment, intersection and
distance read positions too), and is a claim otherwise. One list, `paramPinningRels` (`claimPinsParam`,
`operandCarriesParam`), feeds the root-find; each pin's residual is the verifier's own function on the
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
(`riderNames`, #921). A statement addressed to a letter («p = 3», «p חיובי») reaches EVERY owner. `figureSymbolsOf`, the
**display** registry for the panel and the ask lane, is **derived from the address one** (ADR-3D-230); only
the pricing differs per owner kind, and an undetermined letter reads `?` in every lane.

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
  a parallelogram), generic quad → `concyclic`; `notices.ts` derives `inscribed-constrained`;
- **the backstop** — `apply` records one `concyclic` claim per vertex past the third, so a ring nothing
  made cyclic is refuted rather than drawn.

The circle rewrites the ring's `quad-general` preference (#615) to the cyclic member, marked `right` by a
stated right angle. A right trapezoid in a circle (`cyclic.forced = rectangle`) is refused by `parse3` as
`inscribed-contradicts-noun` (#1554); a quadrilateral's incircle refuses `incircle-needs-triangle` (#1838).

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
sign tail (formerly `signGiven`) and the ask head (`componentAskOf`). The answer is `dataView`'s per-axis
decision (`pointComps`, beside `pointCoords`); a `partial` point's stated components are placed absolutely.

### Who may introduce a point: the drawing registers (#1184, [ADR-3D-253](06b-decisions-3d.md#adr-3d-253))

A **carrier** («נסמן: AB = u») never introduces its own subject (`v7-t1`); only a **drawing register** —
`segment3 {bare}` and `draw-arrow` — may introduce points. Both refuse a pair with two unknown endpoints
(the typo guard) except where `canStartFigure(c)` holds (no points, no solids), and that exception is
applied to the arrow lane only: `segment3 {bare}` feeds shape-completion and role rules that ask which
points exist (#601, #978). `canStartFigure` is the named predicate the next register asks.

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

**The #512 frame verdict is per placement COMPONENT.** `placementSampledParts` publishes translation and
rotation separately (`placementSampled` is their disjunction); a frame claim softens to
`placement-not-fixed` only when a component it READS was sampled.

### A never-positioned point is a pivot unknown (#1311, [ADR-3D-260](06b-decisions-3d.md#adr-3d-260))

A `free3` point («וקטור AB» on an empty canvas, «קטע BE» from a known B, a mixed shape run) carries three
unstated DOF that are **pivot unknowns**: each coordinate is a #820 rider-lane entry keyed
`freeCoordKey(id, axis)` in `riderTs`, anchored at its canonical sample. `evaluateSolidsAndPoints` places a
driven coordinate, and the pivot runs on a solid-less figure that holds one (`hasFreePoint3`). The apply
fork drives a scalar statement when `freeDims(c) > 0` or it names a `free3` point (`claimPointIds`);
`lengthClaim` lowers a marked «וקטור AB = 5» to the one-word form's arrow. A candidate the anchors left just
above `ACCEPT` is polished on the primary residuals alone and kept only if that closes it without collapsing
a solid (a free coordinate's anchor equilibrium sits higher than a rider's, which moves within `[0, 1]`).

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

**Which givens forced the collapse** (#1815, ADR-3D-309). `collapseIsStated` re-solves `[gauge | dims]`
without the rider rows; if the ring opens, an incidence invented the collapse, and the empty pool marked
`collapse: { ring, riderKeys }` reaches `pivot.collapse`, where `derive3` refuses `polygon-collapsed`
(`err.polygonCollapsed`).

**A declared polygon collapsed is refused, whatever forced it** (#1849, ADR-3D-310, ADR-W-115).
`settleFlatRings` (formerly `preferUncollapsed`) keeps solutions with every declared ring open, then tries
the frozen-dims retry and the **open-figure retry** (`openSolveOn(null)`, passing `degenerate`); with
nothing open, the pool is marked `collapse: { ring, riderKeys, forced }` — `forced: false` names the riders'
statements, `forced: true` the ring's own pin owners (`err.polygonForced` / `err.polygonForcedAlone`). A
polygon over existing points records a `polygon-open` claim (`given`), judged by `ringCollapsed3`; a sliver
(`ringOpenness3` < 1e-2) is released and counts as collapsed if it lands flat. A flattened SOLID keeps the
#936 notice.

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
`resolve3(c, s, { paramValue })`. `querySeeds3`, `panelSeeds3` and `claimSeeds` sample only the gauge;
branch coverage never rides seed offsets (`chooseParam` picks `pool[seed % n]`), and agreement gates read
`every` sample, never `[0]/[1]/[2]`. `paramIsKnowledge` answers only for m's own value. `openCrossings3`
asks per crossing at `Resolved3.seed`, with `openParamProbes3` for an unpinned m.

**Two configurations print as two rows ([ADR-3D-289](06b-decisions-3d.md#adr-3d-289), #1506).**
`twoConfigurations3` (`dataView.ts`) asks whether a not-fully-determined point has EXACTLY two members
(`sameConfig`) — the same two at every sample, the drawn one among them, judged beside #827's
`pivot.pointRoots` check. If so `points` carries `S₁(…)` / `S₂(…)`, each printed whole by `coordStr`,
instead of `S(?, 7/2, ?)`; `pointCoords` keeps the partial form; anything else returns `null`.

## The submit decision and refusals

### The submit decision (#1394, [ADR-3D-258](06b-decisions-3d.md#adr-3d-258))

`store3.submit` decides nothing: `decideSubmit3(state, utterance)` returns a `Verdict3` (rename ·
not-understood · refused · already-stated · record) and `submit` dispatches it. The decision is pure, so
#1358's register can ask "would you accept this line?". The statement seams share `readStatement3` (the
grammar plus the #866 repair and the #516 typed refusals), `lostGivens3` (the honesty gates) and
`decideCommands3` (gates → twin → derive → search), where the LLM lane's `submitSteps` also ends. A new
branch belongs in the decision; a parity lock replays recorded sequences.

**A part the reading never read (#1888, [ADR-3D-316](06b-decisions-3d.md#adr-3d-316)).** On the deterministic lane
(`decideSubmit3` → `decideCommands3` with `readExtent`, and the ✎ `replaceFact`) the honesty verdict
`honestyRefusal3` runs `lostGivens3` plus `unreadParts3` (`src3d/store/unreadParts3.ts`), the 3-D member over
`shell/readExtent.ts` (ADR-W-120): each label run (primes included) is substituted and re-read with `parse3`; a run
no substitution changes is unread. Exempt: a co-reference (shell) and a run right after a polygon, circle, base or face noun
(qualifiers allowed between, never a vertex noun) whose letters are on the figure or carried by the reading (3-D's scene name:
«…במשולש SBC», «פירמידה SABC שבסיסה משולש ABC»). 3-D reads no compound, so the line is one clause, cut at the
shortest prefix that reads the same (`cutAtReading`): a lost tail is `split-statements` (`err.splitStatements`,
2-D's text) or, when the read part is a bare right triangle and the tail one of its vertices, `right-angle-vertex`
(`err.rightAngleVertex`, the taught lines). An unread run with read labels after it joins `dropped-given`. The LLM
lane (`decideSteps3`) is not re-read: its commands are the model's, not a reading of the utterance.

**The App's pre-LLM lane is one function too (#1692, [ADR-3D-305](06b-decisions-3d.md#adr-3d-305)).**
`src3d/app/decideDeterministic3` wraps `decideSubmit3` with the registers App3 consults on `not-understood`
(the #353 nudge, then the ADR-3D-040 guidance register) and returns a `Verdict3` or `guided`, dispatched by
`dispatchVerdict`; the LLM lane's step decision is `decideSteps3`. `/log-triage` replays a session through
`src3d/app/triageReplay3`, which CALLS both; `refusalCategory3` sorts refusals into guided / clarify /
refused.

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
ADR-164, 3-D asks whenever the figure gives more than one reading.

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
unordered pair; not gated by `showWitnesses` or by edge visibility.

### The degeneracy notice (#936, [ADR-3D-234](06b-decisions-3d.md#adr-3d-234))

`degenerateSolids` joins `buildNotices3`, derived from the construction and the resolved sample:
`flatnessRatio(pts)` (out-of-plane deviation ÷ vertex separation, widest-spread normal); `FLAT_BY_DESIGN`
exempts `polygon3/4/5`; `causesFor(c, ids)` names the stated `scalarPins` in the solid. The threshold is
`DEGENERATE_FLAT_RATIO`.

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

`stated` comes from `c.vectors` and the `vec-eq` claims; `panelIsEmpty` counts both kinds (#296). The
composer sits in the engine (`render → engine`); a row's arrow comes from `lexicon/marks3`. `bidi3.test.ts`
asserts the section count and `dir: 'app'` on each (never a section-level `dir: 'ltr'`, #559). Every
measurement field of `DataPanel` keeps only what agrees across the samples.

**A parameter's roots: one join, two surfaces (#1591, [ADR-3D-303](06b-decisions-3d.md#adr-3d-303)).**
`formatBranches` returns the ascending per-root strings (`['±√2']` for a symmetric pair) and
`branchAnswer(sym, branches)` joins them with `, ${sym} = `. The panel's `params` row prints
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
