# 04 — Design & Architecture

_Status: **built and in production** — everything below exists. The day-to-day working doctrine is [docs/17](17-design-rules.md); the solve-ladder contract is [docs/LADDER.md](LADDER.md). Archived history: [docs/24](archive/24-foundation-hardening-plan.md), [docs/23](archive/23-architecture-review-2026-07.md)._

## How this document is organised

§1–§9 describe the system as a whole: principles, pipeline, data model, engine, input layer, rendering,
theorems, stack and module layout. §10–§11 point at the ADR log. The rest is one section per mechanism —
what it does, where it lives, and the ADRs that decided it — grouped by subsystem: parser chokepoints and
gates; the submit gate; fold and replay; the knowledge pool; the configuration registry and searches; render
and marks. The ORDER in which mechanisms fire is [LADDER.md](LADDER.md)'s contract, not this file's; how
each mechanism came to be is in its ADR ([06](06-decisions.md)).

## 1. Guiding principles

- **One source of truth.** The engine computes the figure; everything else (rendering, theorems, history) reads from it.
- **Describe, then construct.** The user states facts; the system constructs. The construction is a *dependency graph*, not a recognized template.
- **Stability is structural.** Continuity between steps comes from persisting degrees of freedom and branch choices, not from after-the-fact smoothing heuristics.
- **The LLM is optional and replaceable.** It sits behind a narrow boundary and handles only the inputs a free local parser can't.

**The compiler lens.** The pipeline reads like a compiler (utterance → commands → evaluation → SVG), but the
system is an **incremental, order-normalizing constraint interpreter**: a statement's position in the list is
presentation, not meaning; a relation is true when it holds in every valid configuration; and the front end
resolves references against the current model (its nearest relatives are a parametric-CAD kernel and SMT model
enumeration). Four corrections to the plain compiler reading hold:
1. **Re-mention is assertion, never redefinition.** A second mention of an id is a given about the existing
   object; it lowers to constraints on it in one place at the apply boundary (M1, [docs/17](17-design-rules.md)
   §4), and `commandConflict` refuses only what cannot be lowered. The lowering reads the ring's STRUCTURE: a
   parallelogram-family noun over four points already on one circle (`ringOnOneCircle`, `src/engine/structure.ts`)
   asserts its cyclic member — the rectangle, or the square — because that is what the sentence says on a circle
   ([ADR-628](06-decisions.md#adr-628)); a kite there is bound in the fold to the right kite's definition (`cyclicKiteCommands`:
   a right angle at an off-axis vertex and the axis ⟂ the other diagonal, in place of the two equal pairs —
   [ADR-657](06-decisions.md#adr-657)). A second shape NOUN over a declared ring is judged by one four-valued relation
   (`quadRelation`, `engine/shapeKinds.ts`): an implied noun restates, an excluding one is refused, and a noun that
   narrows the ring or meets it in a third kind is lowered onto it through `refinesDeclaredRing` — the predicate
   `shapeLowersToConstraints` and `commandConflict`'s polygon arm both read — and the ring's polygon takes the
   narrower kind (`refineRingKind`) ([ADR-656](06-decisions.md#adr-656)). A membership of an existing point on a second circle reads the same
   structure: a point already on one circle of a STATED tangency (`circles-tangent`'s record) is the touch point,
   and takes the touch point's own definition (`tangentTouchCopy`, so ADR-123's coincidence records X = M); a
   residual membership is held through a witness that is any point the construction puts on the circle — a
   `radial-toward` and a stated touch point included ([ADR-647](06-decisions.md#adr-647), #2084). «XP ⟂ CD» about a
   point P already riding segment CD is the foot statement «XP גובה לצלע CD» (`riderPerpendicularAsFoot`,
   `engine/apply.ts`): when the ⟂ form and its failure ladder have no figure, `applyStep` re-reads it as P's `foot`
   placement through the redefinition arm's own solve (`solveReinterpreted`), so the free vertex X may yield; where
   the ⟂ form builds it is kept ([ADR-728](06-decisions.md#adr-728), #2089).
2. **The parser may read the drawing, but only to resolve a pointing reference** («המעגל הגדול», «הימני»,
   «נקודת ההשקה»), through `ParseContext`'s deictic fields, each read emitting a locking assertion
   ([docs/17](17-design-rules.md) §3b).
3. **The stored artifact is source plus lowering.** A fact carries its utterance and its lowered commands; an
   edited step re-lowers against its own prefix (ADR-241); on load a deterministic step adopts the current
   lowering and an LLM step keeps its saved commands (`refreshLoadedFigure`, ADR-314), compared up to its configuration —
   a cycled choice is kept, or carried onto the re-lowered command (`lowersAsSaved`, ADR-697) — audited for drift and
   dropped labels (ADR-242, ADR-321).
4. **The solve ladder is part of the semantics** ([docs/LADDER.md](LADDER.md)): the stage that fired is
   observable (`StepResult.ladder`) and contract-tested (`ladder-contract.test.ts`).

## 2. Pipeline overview

```
  user utterance (He/En)
        │
        ▼
  ┌───────────────┐   parser-first; LLM only on miss
  │  Input layer  │  grammar parser ──(can't handle)──▶ Claude API (Haiku, via proxy)
  └───────────────┘
        │  command[]
        ▼
  ┌───────────────┐   pure reducer: command → new graph (immutable)
  │ Apply command │
  └───────────────┘
        │  dependency graph (objects + constraints + branch choices)
        ▼
  ┌───────────────┐   validate → topological evaluate → positions
  │    Engine     │   (over-constraint check; branch selection)
  └───────────────┘
        │  computed figure (positions + derived measures)
        ├───────────────▶  Theorem detection  ──▶ theorem panel
        ▼
  ┌───────────────┐   declarative SVG from figure
  │   Renderer    │   (React; swappable)
  └───────────────┘
```

A step runs apply → validate → evaluate → recompute, is appended to history, and is und/redoable.

## 3. Data model — the dependency graph

The figure is a set of **objects**, each with a *definition* referencing earlier objects, classified by degrees of freedom (DOF):

| Kind | DOF | Examples | Notes |
|------|-----|----------|-------|
| Free point | 2 | A, B placed to start a shape | Draggable anywhere |
| On-object point | 1 | "G on AD" (parameter `t` along AD); point on a circle | The construct the old engine could not express |
| Derived point | 0 | intersection, midpoint, foot of perpendicular | Fully determined by parents |

- **Constraints** (distance, angle, right-angle, parallel, perpendicular, equal-segments) are relations attached to the definitions.
- **Branch index** — derived objects with multiple solutions (line∩circle, circle∩circle) store which solution is chosen. This is the substrate for the alternatives feature.
- IDs are deterministic (e.g. `seg-AB`, `poly-ABC`) so repeated commands are idempotent.

## 4. Engine

- **Topological evaluation:** order objects by dependency, compute each from its parents → coordinates. No template/shape recognition.
- **Branches = alternatives:** when an object has N≥2 solutions, the branch index selects one. "Show another configuration" re-samples the unstated magnitudes and steps the discrete choices (every cyclable branch among them), keeping a candidate that meets every given (FR-ALT-2; #1861).
- **What the shape fingerprint reads (ADR-065, ADR-514, #1005).** A candidate is offered only when it is a different drawing under a similarity-invariant fingerprint: every pairwise distance between named points and each drawn (non-`hidden`) circle's radius, over their mean — the only objects with an extent of their own.
- **Stability:** DOF parameters (free-point coords, on-object `t`) and branch indices **persist across steps**. A new constraint re-evaluates only what depends on it; unrelated objects keep their parameters, so the figure does not jump.
- **The re-stated given yields ([ADR-623](06-decisions.md#adr-623), #1943/#1819).** `driveOrCheck` picks a constraint's carrier EAGERLY, before anything is solved. For a row the figure is already FORCED to satisfy that pick both re-opens the configuration choice (the driven re-solve lands in another valid drawing — the jump) and removes the carrier from `freeDofs` (a freedom the figure never lost stops being sampled — the ADR-052 smell). `releaseImpliedOwnership` (`engine/step.ts`) wraps every ladder exit of `applyStep`/`applyCoupledStep` and gives the claim back when, on the prior figure, the row already holds (`isSatisfied`) **and** is forced — `impliedByFigure` (`engine/dofRank.ts`), ADR-536's own rank Jacobian, so the DOF count and the ownership decision read one definition of "this row adds nothing". The mirror of ADR-399's `ensureOwnership`, which states the same rule for the branch the eager pick did not claim. Try-and-verify, failing open at every rung: the released figure must evaluate (which checks the re-stated row), be a figure, sit exactly where it sat, and survive re-sampling. The constraint is never dropped — it stays a listed check the evaluator, the verifier, the givens list and the DOF count all read. Ladder token `implied:release`.
- **Over-constraint / contradiction:** before committing a step, check satisfiability. If unsatisfiable, reject the step, keep the previous figure, and surface a clear message.
- **A fact whose subject is gone (ADR-483, #926):** the fold asks `isSymbolBound` (`engine/lower.ts`) before applying a `set-var`; a value for an unbound letter is stamped into the "no longer available" register, and a definition re-added anywhere binds it again. The ✎ edit seam (`app/editPipeline.ts`) names the rows an edit orphaned while committing it.
- **A second letter, or another coefficient, for a measured angle or segment (ADR-661, #2023/#2061).** `measureRestatement` (`engine/lower.ts`) reads a symbolic `measure-angle`/`measure-length` against the EARLIER statements: the target is the angle as its vertex plus an unordered ray pair, the segment as an unordered pair. The same letter in the same form with another coefficient is `coef-conflict`; a fresh letter (no value, not a radius letter, bound to no other quantity earlier) on a target whose earlier letters all differ is `name-taken`; the identical measure is `same`. The fold pre-scans the list in order (`computeFoldInScope`, beside the soft-equal pre-scan) and stamps a refused restatement with `measureRestatementStatus` — the over-constrained frame, or `name-taken: angle|segment <name> is already named <letter>` — plus a `[vs #i]` tail naming the earlier statement's first row by provenance (the drop-one search could never find it: a representative measure owns no constraint). The stamped fact is skipped as `prior`, never retried and never waits. `lowerOne` reads the representative's target unordered too, so «∠CBA = 3α» no longer lowers to a self-ratio. `humanizeError` renders `name-taken` with `errors.angleNameTaken`/`errors.lengthNameTaken` (`_vs` with the earlier line — the `namesOtherLine` family, not #943's `namesOther`). **The alias arm (ADR-720, #2191):** an `angle-alias` is judged by the same predicate against the EARLIER `angle-alias` commands only, on the same vertex + unordered ray key — another name is `name-taken` at the first alias (status `name-taken: angle <ray1><vertex><ray2> is already named <name>`, the same render path), the identical name `same`; a measure letter and an alias never compare (ruling #2113 B). The alias line's two idempotent segment facts stay green, so the door's dry run refuses the line on its alias fact alone.
- **One affine tail for every symbolic value (ADR-662, #1851).** `AFFINE_TAIL` / `affineTailOf` (`parser/parse.ts`) read «± c» or «± c/d» after the letter, for `measureLength` and for `angleValueOf` (so `measureAngle` emits `expr.const` + its faithful `text`). `lowerOne`'s `measure-angle` lowers the constant as `measure-length` does: `coef·value + const` once the letter has a value; else an affine `set-angle-ratio` (`add`, degrees — the `angle-ratio` residual `∠1 − (k·∠2 + add)`) against the letter's first PURE binding (an affine binding is marked `affine` in the symbol table and never anchors a ratio). On the representative's own angle only the identical measure lowers to nothing; another form there is the equation it states (∠ABC = ½∠ABC + 40). `measureRestatement` treats the same letter and coefficient with another constant as `coef-conflict`.
- **A letter's value lowers at its binding (ADR-648, #2101).** `lowerOne` resolves a `set-var` at the row that binds the letter, never at the value row itself: a measure (`measure-length`, …) lowers to its value; a radius binding (`radius-symbol`) lowers to the naming plus `set-radius` on its circle, the stated-radius path (ADR-087). `symbolsConsumedBy` lists the binding, so ADR-492 blames a value that breaks the figure on the value row. The parser's `setVar` reads an uppercase letter only when `ParseContext.radiusSymbols` binds it; an unbound capital is a point name. The reserved R/r on a FREE-radius circle (no `radius-symbol`, no fixed-radius circle — `SymTab.radiusCircle`) is bound by its measure row: `buildSymTab` records the fallback circle whether or not the letter has a stated value, and a valued letter's `measure-length` lowers to `set-length-radius` plus `set-radius{circle, value}` (ADR-699, #2111) — ADR-071's "no value" gate guards the default only, never a stated value.
- **The letter system (ADR-681/682, #2165/#2135/#2133).** `buildSymTab` builds the table through `letterSystem(cmds, radiusOf)` (`engine/lower.ts`): the linear single-letter equations every statement states, keyed by target — a segment (unordered pair), an angle (vertex + unordered ray pair) or `radius(circle)` — judged in LIST ORDER. Sources: `set-var`; two expressions on one target, or an expression against a number (`measure-length/-angle`, `set-distance`, `set-angle`, a sized `circle`, `set-radius`); `radius-symbol`; the reserved R/r when exactly one circle has a stated size (`statedSizeCircles`). Before any of that, `reservedAmbiguity(cmds, i, radiusOf)` refuses a row that values or uses an unbound R/r while two or more circles, at least one sized, precede it (ADR-733, #2177): the raw `reserved radius ambiguous: r names no one circle of O, P (stated sizes|circles)` lands in `SymTab.refused` with `at` = the row itself (no `[vs]` tail) and renders `errors.reservedRadiusAmbiguous[Sized]_said`, a sentence that ends with its own next step, so `explainError` appends no retry hint (`Pattern.nextStep`). A consistent row adds nothing or determines a letter with an admissible value, stored as `derived` (`SymTab.vars[x].derived`; `value` is a STATED value only); an inconsistent row (`0 = c`, the same constant with another coefficient, a second value, an inadmissible value) lands in `SymTab.refused` keyed by its index, with `at` = the statement that supplied the earlier value, and its equations are dropped for the rows after it. Two numbers on one length or angle are left to the solve (a residual), a value for an unbound letter waits (#926), and multi-letter equations, powers and area/perimeter targets add nothing. `lowerOne` reads `value ?? derived` (a determined letter lowers to a pin); `measureLabelForms` reads `value` only, so the labels stay as typed. The fold's restatement pre-scan reads `symtab.refused` beside `measureRestatement` with the same `[vs #i]` tail; `dryRunOutcome`'s `bindsLetter` counts a symbolic measure binding a letter to a target in a new form as produced. A radius target renders `errors.restatedSize` (the #2119 frame, no reason clause). On a radius target two NUMBERS are judged too (a stated radius is a size, not a constraint, so no residual sees it — ADR-683): the latest earlier sizing statement is the `at`; and `foldCommand` resizes a re-stated standalone circle in place only when the earlier fact states no size or the same size, appending a different one so the pre-scan judges it.
- **A ratio between two radii (ADR-649, #2100).** The parser's `radiusReferences` reads «רדיוס (של)? (ה)?מעגל X» / "radius of (the)? circle X"; `radiusRatio` (before `setRadius`) turns two references and a «פי k» / "k times" factor into `set-radius-ratio` — the relation «R = 2r» already lowers to (a `ratio` over centre/witness pairs in `apply.ts`). The comparative is read wherever it sits, a smaller-word inverts k, and the leftover must be ratio connectives (`onlyRatioWords`). `setRadius` does not read a sentence naming two radii. The factor slot is the one #2068's word-factor atom composes into. **A pair's circle by its role ([ADR-754](06-decisions.md#adr-754), #2459):** `radiusReferences(s, ctx)` returns each reference RESOLVED where it stands — the letter form; the role form «רדיוס (של)? (ה)?מעגל החיצוני/הפנימי/הגדול/הקטן» / "the radius of the outer/inner circle" (since [ADR-760](06-decisions.md#adr-760) a role reference reaches `radiusReferences` already in its letter form, rewritten at the parse boundary by `resolvePairRoles`; the role branch and `pairCircle` are retired); and a letter that is a pair's shared centre as `ambiguous` (asked, `ambiguous-circle`). The emitted `c1`/`c2` stay outside the post-pass's `CIRCLE_REF_KEYS`: that post-pass holds one role per utterance, so a relation between two circles is resolved per span by its reader. The pair's two circles at k = 1 are refused with ADR-713's `equal-circles-nested` sentence.
- **A factor is paid only by a ratio coefficient ([ADR-754](06-decisions.md#adr-754), #2459).** `FACTOR_PI` / `FACTOR_TIMES` (`parse.ts`, over NUMEXPR) are the one spelling of «פי N» / «N פעמים» / "N times"; `measureRatioK` and `radiusRatio` compose them and `factorSpans` exports them. In `accountUtterance` a factor is paid only by a command's ratio coefficient (`k`, a measure's `coef` / `coefs`) or a declared `consumed.numbers`, never by a size `value`; an unpaid factor is a hard `number` span (its number as text), so the grammar seam escalates and the LLM seam refuses. This narrows what pays for a number (ADR-566), never widens it.
- **Where the solve budget is consulted (ADR-515, #259).** The cooperative wall-clock budget (`engine/solveBudget.ts`) is armed only around view searches (the configuration searches, the submit gate's «כבר קיים» test), never the primary submit fold (ADR-281). It is consulted between recruit experiments (`step.ts`) and inside `nelderMead`'s descent (`evaluate.ts`); unarmed it is a null check. The knowledge pool is bounded by work, never seconds (`POOL_WORK_CAP`, ADR-558; see the knowledge pool).
- **A refusal names what the rule matched (ADR-528, #1266/#1267).** A rule that recognised a construct and rejected it answers through `Clarify` (mapped by `refusalOf`, armed by `runSubmit`), never `not-handled`. A cevian's stated side has one reader, `statedSide`, shared by median, altitude and bisector (the bisector also checks it); its stated triangle has one, `statedTriangle` (ADR-540, #1285), so the triangle form answers where the bare form asks `ambiguous-angle`, and a wrong lone vertex is `bisector-wrong-apex`. `cevianTriangle` wraps every cevian rule and prepends `triangle` when the sentence names one the figure lacks (ADR-571, #1720). The bisector's vertex has one reader for both forms (ADR-568, #1684). A cevian with no stated side or triangle resolves through `cevianShapeEdges`: one shape answers; shapes giving the apex different opposite sides ask (`ambiguous-cevian`). A NAMED foot is excluded as a base vertex while another opposite side remains; when that exclusion leaves none and the shape has exactly one opposite side holding the foot («משולש ABC» · «התיכון AB»), the foot names that side and `cevianFault` judges it as the long form ([ADR-642](06-decisions.md#adr-642), #1742). The altitude with no stated side picks its side in analytic's order of authority ([ADR-665](06-decisions.md#adr-665), #1965/#1966): `footNarrowedSide` (the opposite side the figure already puts the named foot on — the one reading `cevianShapeEdges` also calls), then `ringParallelBase` (the partner of the apex's base among the apex's OWN ring's parallel pairs, `ringParallelPairs`), then the stated triangle and `cevianShapeEdges`. `ringParallelPairs` is the one reader of a ring's parallel bases: the trapezoid midsegment, «… מקביל לבסיסים» (via `trapezoidBasePair`) and the valueless «גובה הטרפז» read it, never the whole `ctx.parallels`.
A height named by TWO EXISTING polygon vertices ([ADR-643](06-decisions.md#adr-643), #2064) is the right angle the
pair names: with a stated side through one letter, that letter is the foot and the other the apex
(`altitudeAtVertex`); the altitude rule never emits `foot{id: Y}` over a declared vertex Y (it answers
`cevian-redefines-vertex` unless Y already is exactly that foot). With no side, `cevianPairReadings` lists the long
forms «X E גובה לצלע E Z» for each endpoint E and each declared side at E (second letter first, ring order; with no
side stated and none already true, the rule builds them as the cyclable `altitude-choice`, ADR-644), and the
app seam `vertexPairVerdict` (`src/app/vertexPairCevian.ts`, called by the submit decision and the ✎ edit seam)
dry-runs the bare ones under the #1012 cap: one already true → «כבר קיים»; with a tail («= 5») → the long form
that carries it is decided instead. The bisector joins `cevianFault`'s family: a pair that is a side of a declared
polygon at the angle's vertex is `bisector-is-side` (with `host`, the polygon's kind or vertex count), asked at
`bisectorPlacesPoint`'s one emit for every way the angle resolved, and for the role-noun spellings
(`bisectorRoleNounOnSide`); the door words it `input.cevianBisectorIsSide` (a triangle) or
`input.cevianBisectorIsPolygonSide` with `input.shapeNounDefinite.<host>`.
- **A bound’s aim is not its test (ADR-529, #1265).** ADR-390's visible gap is the residual the optimizer follows; acceptance is `isSatisfied`'s direct test of the stated inequality, with ≥ vs > carried from the parser (absent ⇒ strict). The edge never enters the aim. **The aim yields (ADR-547, #1351):** when the ladder with the aim accepts nothing and a bound is present, it runs again with `jointCostTerm(…, aim = false)`, where a bound costs only `boundShortfall` (the region `boundHolds` reads) — retry-only, below every given (ADR-097/ADR-238).
- **A crossing is refused when its own letters make it an existing point (ADR-531, #1274).** The check sits inside `cross`, the single emit point of the two-named-lines family, so no spelling reaches `line-line-intersection` around it; it travels the `Clarify` road. ADR-123's boundary holds, and ADR-489's within-margin exemption stays for `rename` and `merge`.
- **The letter-holder question (ADR-520, #238).** `letterHolder` (`store/geoStore.ts`) answers who holds a letter and whether it can be taken back, returned with every `target-taken` refusal from `renameFacts` and `nameCentreFacts`. Reclaimable means dropping the holder removes that letter and nothing else; `reclaim` re-asks before acting.
- **A point-menu control declares its own colour (ADR-520 Am. 2, #1277).** `ctrlBtn` carries `color: var(--color-text)` instead of inheriting `--color-text-muted`; whether a `<button>` inherits `color` is UA behaviour, so every menu control states it.
- **Driven parameters are solved as jointly as they are coupled — no more (ADR-557, #1602).** `resolveDriven` sends driven carriers to the joint Nelder–Mead only when coupled (a parent of another's constraint refs, a cycle, or `also`); independent carriers take the exact ADR-028 1-D root path in dependency order, checked by the joint solver's accept. An `on-segment-solved` rider driven by ⟂ / ∥ / collinear takes the exact roots of its polynomial in t; a root that puts the rider ON a point its constraint references is kept only where the constraint is defined there (its residual a finite number within tolerance — a collapsed direction or angle term is NaN) and only when the carrier has no clean root, the coincident roots read off the referenced points on the carrier rather than the root scan ([ADR-725](06-decisions.md#adr-725), #1820); a relation holding by construction claims no carrier (`driveOrCheck`). Locked by `drivenSolveStats.joint`. An unbounded driven shape scalar (k, dist, angle) whose root lies beyond the joint solve's restarts gets a bracket on the failure path only — the ADR-071 radius bracket, extended ([ADR-717](06-decisions.md#adr-717), #2118; `drivenSolveStats.shapeRescue`).
- **A measure operand is a polygon or a round figure ([ADR-632](06-decisions.md#adr-632), #172).** The ADR-118 area and ADR-228 perimeter constraints, commands and the `measure-area` / `measure-perimeter` symbolic layer carry an optional `RoundOperand` per side: `ids` = [centre, from, to] names a sector (area ½·θ·r²) or its arc (length θ·r), `whole` with [centre, P] the circle (π·r², 2π·r). `engine/roundMeasure.ts` is the one formula seam every consumer calls (residual, scale, verifier, label check), and the arc's identity (`spanDeg`/`minor`, copied from the drawn `arc` by the parser through the semantic `ctx.arcs`) goes through the shared `orientArc`, so the measured sector is the drawn one. `driveOrCheck`'s `driveRoundMeasure` routes by meaning: an absolute size drives the circle's free RADIUS (scale — a lone size resizes, never reshapes), a ratio or a size over a pinned radius drives the arc's free end (the central angle). A polygon over the same letters is another operand (labels key apart, a shared letter relates them). Labels print inside the drawn wedge (its centroid) or on the drawn arc (`render/scene.ts` `roundLabelPlacement`).
- **Fit transform:** map computed coordinates into the viewport; persist the transform so the view is stable across steps.

## 5. Input layer

A single boundary: `utterance → command[]`.

- **Primary — deterministic grammar parser.** Handles the common, bounded geometry phrasings in Hebrew and English (shapes, points-on, distances, angles, special lines). Free, offline, instant.
- **Fallback — Claude API.** Only when the parser cannot confidently parse. Model: `claude-haiku-4-5`. Calls go through a **server-side proxy** that holds the key (never in the browser), is gated, and is rate-limited. `max_tokens` and prompt size kept minimal.
- The engine is agnostic to which path produced the commands.
- **The input preview seam carries bidi AND maths (#997, ADR-504).** The shared `InputArea`'s `preview` prop
  shows the maths renderer when the line has maths, else `inputPreview` (the bidi isolator with the live-tail
  rule), only when isolation would change the layout; the box stays raw. The 3-D twin is `inputPreview3` (ADR-3D-123).
- **English keywords are whole words ([ADR-738](06-decisions.md#adr-738), #2195).** `enWord` guards both sides
  (`EN_START` / `EN_END`), and every angle-family rule tests and strips `ANGLE_KW` (compiled without `/i`: its English
  half `ANGLE_EN` spells its case, so a following lowercase letter — «angled» — is refused while a glued uppercase
  label — «angleABC» — is not); its Hebrew half is the singular the rules always spelled inline. The `the` / `of` /
  bisector-word strips are `\b`-bounded. `angleArms` refuses three letters that are not three points («ALL»).
- **One vocabulary home (#361, ADR-501).** `src/parser/lexicon.ts` holds the keyword and token atoms the grammar
  consumes; a rule's alternation (`INTERSECT_KW`, `BISECTOR_KW`) is compiled from it, and
  `lexicon-consumers.test.ts` fails on an atom nothing composes from. 3-D keeps its own leaf (`src3d/lexicon/nouns3.ts`).
- **The number atom refuses a Hebrew particle's maqaf as a sign (#975, ADR-505).**
  `NUM` is `(?<![א-ת])-?\d+(?:\.\d+)?`: a hyphen glued to a preceding Hebrew letter («ל-90», «מ-5») is the
  particle, so the digits match unsigned; a hyphen after a space, `=`, `(`, `,` or at line start is a sign.
  The guard is zero-width, so every consumer inherits it.
- **A name glyph is defined once, and a number never starts inside one (#1814, ADR-600).**
  `shell/indexedName.ts` holds `NAME_LETTER`, `INDEX` (`_1`, `_{1}`, glued and subscript digits),
  `INDEXED_NAME`, and `UNGLUED` — the zero-width guard
  "a number never begins glued to a name letter, an `_`, or inside another number". `lexicon.ts` re-exports
  them; analytic's `INDEXED_TOKEN` is the same atom. The angle value reader composes `UNGLUED + num` and
  declines a value symbol left beside its number (ADR-024's leftover guard). `normalizePointSubscript` folds
  `α_1` like `O_1`; `droppedGivenNumbers` blanks indexed names before extracting numbers. The span
  accountant's `symbol` kind requires every Greek glyph with its index (and in Latin-only text a lone lowercase
  letter beside an operator) to be carried as a whole value (`expr.var`, a measure name); `π` is paid for only
  by a rule declaring `consumed.symbols: ['π']` (ADR-462) — `measurePi`, `setRadius`'s size read.
- **A tangent verb is evidenced by its own circle (#2197, ADR-736).** In `droppedGivenVerbs`, when the line names
  the circle the tangent word governs («משיק ל[ה]מעגל X», "tangent to [the] circle X"), the `VERB_TANGENT` evidence
  must include a command about X (`evidenceAboutCircle`): one naming `circle-X` / `circle-X-n` / `@ctr-X`, a
  radius-⟂ or a foot whose source is X's centre, or a declared tangency (ADR-462). A tangent to another circle no
  longer pays. `tangentChord` reads its statement without a named touch — the touch is the ⟂ foot from the target
  centre on the target circle within AB, the `tangentLine` no-touch group (ADR-369) — and with the diameter noun
  (the host lowered as `diameter`).
- **Contextual plurals resolve against a per-family context registry (#554, ADR-503).** A line naming no
  object of its own («המשיקים נחתכים בנקודה E») resolves against `ParseContext` — `ctx.commonTangents`,
  `ctx.tangentLines`: two candidates build, more ask (`tangents-ambiguous`), fewer are not that rule. A
  family's one-utterance and incremental forms emit the same commands.

## 6. Rendering

- **Hand-rolled SVG via React**, drawn declaratively from the engine's computed figure. No imperative reconciler (that existed only because the old JSXGraph API was imperative).
- Visual vocabulary: points, segments, polygons, circles, angle arcs, right-angle marks, equal-side ticks, labels, dashed special lines; pan/zoom/fit. Equal-side ticks appear only in the opt-in relations layer, never at rest (FR-RN-1, ADR-W-118 B2). Smooth animation of moved points (FR-RN-3) is not built.
- **The at-rest angle marks** (`Derived.angleMarks`, FR-RN-7) come from `angleMarkFor(cmd, figure)` in `src/replay/core.ts`, per applied fact, from the command's intent — never from a measured 90°. The `set-perpendicular` arm marks a shared endpoint, else (`namedPerpendicularMark`, [ADR-731](06-decisions.md#adr-731)) an endpoint the construction puts on the other segment's line (`Structure.onLineBy`: a rider, a foot, a crossing, a lowered collinearity), or a `line-line-intersection` of exactly the two segments' lines; the corner is the statement's letters (the other segment's second id; at a crossing, each segment's second id). A `foot` command marks only when the parser set `named` (the student wrote the letter). The honesty gate (the realised angle within 1° of 90) applies to every knee; a knee reached through a named foot or crossing then yields to another knee at the same vertex between the same two lines. `relationMarks` takes the at-rest right knees and skips a forced 90° between the same lines at the same vertex. `buildScene` adds each right knee's diagonal to its vertex's incident directions, so the point's label (`outwardDir`) avoids the mark.
- **Swappable:** consumes engine output only, so it can be replaced (e.g. with a library like Mafs) without engine changes.
- **Export-friendly:** because the figure is already SVG, exporting it as an image (SVG/PNG) for the authoring use-case (Vision G6 / FR-HS-5) is straightforward — serialize the rendered SVG, or rasterize it to PNG.

## 7. Theorems

**The theorem surface is switched off by the operator** (#740, 2026-08-18; ruling B4 keeps it off). The engine below and its tests stay; students see nothing.

`detect(figure)` is now `detectTheorems`: it folds the theorem table over a coordinate-free `MatchCtx` (the construction and the stated facts, never coordinates) and returns matches (certain vs possible), attributed to the stated fact that completed each premise, shown bilingually. Grouped by figure type (triangle, quadrilateral, circle). The canonical catalog is [`07-theorem-reference.md`](07-theorem-reference.md) (the official bagrut list); **theorem IDs are the official bagrut numbers** (so surfaced theorems are citable), and detection targets the entries tagged _property_ / _converse_ — not definitions, area formulas, or the out-of-scope appendices.

## 8. Tech stack

- React + Vite + Zustand (+ `zundo` for temporal undo/redo) + TypeScript.
- Hand-rolled SVG renderer.
- Path alias `@/` → `src/` (kept in sync between `tsconfig.json` and `vite.config.ts`).
- Vitest for tests (notably the stability regression test).

## 9. Module layout (`src/`) — as built (2026-07-24)

```
src/
  engine/      the constructive core: types (dependency-graph model), geometry, solve (constraints +
               constraintKey identity), apply (applyCommand reducer), evaluate (topological sweep + the
               driven solvers), step (applyStep/applyCoupledStep + the failure ladder, docs/LADDER.md),
               sample, verify (givens verifier), relations/detectShapes, inscribe/variants, solveBudget,
               valuesPanel (the derived-values rows + the ask lane, over the ONE shared sample pool)
  parser/      parse.ts (bilingual grammar: ordered rules + post-pass chokepoints + honesty gates), catalog,
               context (buildParseCtx — the docs/17 §3b registry), scope, llm/llmShared (the LLM-fallback seam)
  app/         submitPipeline.ts (the text→command orchestration), decideDeterministic.ts (the whole pre-LLM
               lane as one pure verdict), errorSubject.ts
  replay/      core.ts — the pure replay layer: fold memo + deferral + HOIST + seed/config searches + the
               shared sample core; naming.ts; engine ← replay ← store enforced by test
  store/       geoStore.ts (Zustand + zundo: the fact list as source of truth, rename/swap/merge),
               figureFile (save/load), loadAudit, geoWork/geoWorker (the Web-Worker seam)
  render/      transform + scene (pure figure→primitives) + Figure.tsx (declarative SVG, pan/zoom, hover)
  theorems/    the authored theorem table + coverage disposition map + rank bands + audit harness
  validation/  the differential coordinate oracle (engine-import-free; dev/CI only)
  export/      question export (.docx)
  i18n/        locales (he/en)
server/        the shared LLM proxy + admin dashboards (parameterized by tool:)
src3d/         the sibling 3-D product (pattern-copied, never imported)
```

Seams recorded against the layout:

- **valuesPanel's symbol lane (ADR-485, #929)** reads the ADR-031 symbol table: every letter the student named
  gets a row (natun when valued, nigzar when forced) and is askable through the `var` query. Circles are named
  through `circleRef` (ADR-552, #1442) — drawn circles only, a visible centre by its letter, an unnamed one as
  "the circle" or its ADR-342 token; two drawn circles on one centre, ordered by `innerOf`, by their role
  (`via: 'role'`, ADR-714, #2264); `render/valueRowText` words every row label.
- **A circle in a sentence (ADR-755, #2305)** is worded by `src/i18n/circleText.ts`, `circleRef`'s twin for text: a
  template's circle slot takes a noun phrase (`{{circle}}` «מעגל O», `{{circleThe}}` «המעגל O», `{{circleTo}}` «למעגל O»,
  `{{circlePair}}` «המעגלים O ו-P»), a role reads «המעגל הפנימי», and every other circle keeps its letter. Circle slots
  carry IDS to the display: `GivenViolation.circleSlots` (rendered by `i18n/violationText`), a `humanizeError`
  wording's declared `circleParams` (resolved by the figure's `circleResolver`), the menu title (`circleMenuTitle`);
  `inkCrossings.crossingUtterance` reads `circleRef` itself (the parser's canonical «המעגל הפנימי»). A LIST of circles
  (ADR-760, #2305 M2/M3) is `circleList`: a `humanizeError` wording's `circleListParams` (the reserved-radius question,
  whose engine error now carries circle ids), and a decide note's `{ circleList }` / `{ circle }` params, which
  `renderNote` words with the figure's `circleRefs` (`candidateCircles` expands the parser's centre token to every
  circle centred there).
- **A pair's circle by its role, per span (ADR-760, #2464).** `src/parser/pairRoles.ts` `resolvePairRoles`, called in
  `parseEntry` beside #102's size qualifier and #192's ordinal (the rewrite chokepoint): when the figure has exactly
  one concentric pair and the line a role span (the lexicon's `CIRCLE_ROLE_REF_HE/EN`), the pair gets two fresh
  parse-local tokens (ADR-342's manner — a letter whose `centrePoint` is the real centre), every role span is rewritten
  to «מעגל <token>», and the line is parsed over `withPairTokens(ctx)`, which re-keys every circle-bearing field
  (`PAIR_ALIAS_FIELDS`, a mapped type total over `ParseContext`: a new field fails `tsc` until classified). The
  pair stays in `concentric`, marked `resolved` so the ADR-244 post-pass skips it. The commands are mapped back
  (`circle-<token>` → the real circle id, a token in centre geometry such as `tanaux-`, `@tang-` → the centre letter).
  A refusal naming a token, a command relating the pair's own two circles (other than `set-radius-ratio` /
  `set-radius-order`), two pairs, or the shared centre letter beside a role (ADR-244's ask) never commit. The
  one-qualifier-per-sentence branch of the post-pass and ADR-754's role branch of `radiusReferences` are retired.
  The commit gate's tangent-kind member blanks the same role spans before it reads «חיצוני/פנימי».
- **The clarification family (ADR-490, ADR-494).** A rule may return a `Clarify`, which `refusalOf` maps to a
  refusal reason of the same name and `submitPipeline` renders as a note that keeps the text; `not-handled` is the
  escalation seam. `isAmbiguityQuestion` is the explicit whitelist `parseResolved` may not turn back into an
  escalation (a member consumed the shape noun; `ambiguous-angle` is excluded, ADR-264 Am. 1).
- **`decideDeterministic`** is dispatched by `runSubmit` and called by log-triage; its auto-binds are simulated on a
  copy and committed as the line's own `name-by-use` facts by `commitVerdict` (ADR-588).
- **The commit seams and the post-commit search (ADR-518, #1041).** The search is a property of the seam, asserted
  in `app/__tests__/issue-1041-edit-resolve.test.ts`: `replaceGroup` searches like submit; `removeGroup` is exempt
  on measurement. `EditDeps.resolveAfterCommit` is required, so `tsc` names every call site. 3-D wires its edit seam
  inside `replaceFact` (`seedForRequirements`). The full inventory is ADR-522 (the submit gate, below); the general
  mechanism is #1132.
- **errorSubject.ts (ADR-487, #943).** `utteranceForError(facts, status, raw)` finds the sentence a refusal is
  about for the figure-free `humanizeError` (ADR-228 Am.6), through ADR-398's identity of the banner's `lastError`
  and the failing row's `status`. **Against what (ADR-508):** `otherUtteranceForError(facts, raw)` resolves the
  fold's `[vs #<index>]` tail into the earlier statement's words, and `humanizeError(raw, t, said, other)` renders
  `_said_vs` («X» סותר את «Y»), else `_said`. The search runs in the fold's attribution pass on a refused statement
  only, later statements first, latest first (ADR-554, #1203). **A radius relation (ADR-698, #2112):** `set-radius-ratio`'s
  `ratio` carries `radii: { c1, c2 }` (display only), so `describeConstraint` writes `radius(circle-O) = 2 · radius(circle-P)`
  and `translateConstraintWords` renders «רדיוס מעגל O» (a `DESC_WORDS` entry whose capture group is a param); when the
  drop-one search names no other side, the fold tags the latest statement that sized c₁ (else c₂) by provenance
  (`statedSizeCircles` over the fact's lowering) — a stated radius owns no constraint, so the search never tries it.
- **The 2-D error bank (ADR-756, #2201 phase 3a).** Every refusal the engine or the fold writes is an `EngineError`
  variant (`src/engine/errors.ts`): `engineErrorDebugText` writes its English wire (the status string, the debug log),
  `parseEngineError` is the one inverse, `withAttribution` the one writer of the `[vs #i]` tail, and `PARAM_KINDS` declares
  each field's kind (`id`, `composite`, `fragment`, …). `humanizeError`'s `wordingOf` is a `switch (e.code)` over a static
  `WORDINGS` table; a variant with no ruled sentence is the floor. Locks: `humanize-golden.test.ts`, `engine-error-total.test.ts`.
- **Which row owns a refusal (ADR-492, #956).** `computeFold`'s attribution pass moves a refusal from the row that
  shaped a constraint to a later row that valued its symbol — attribution only. `symbolsConsumedBy`
  (`engine/lower.ts`) is derived from `lowerOne`'s own call sites.
- **Which constraint a refusal names (ADR-493, #920).** `addedConstraints(prev, next)` (engine/step.ts) is
  listed-added ∪ driven-added and feeds the blame sites in `runFailureLadder`, because `driveOrCheck` can embed an
  obligation without listing it in `next.constraints`, and `blameNewStatement` bails on an empty list. Acceptance
  still reads the listed slice.
- **replay/naming.ts (ADR-588, #1697)** holds the naming cores (rename / name-centre / step-aside) and
  `resolveBinds`, applied at the head of every replay.
- **The fold's attempt scope (ADR-583, #1675/#1584).** Every per-fact apply goes through `attemptFact`; a
  re-attempt is answered from the failure memo when its `solveSignature` is unchanged, else capped by
  `REATTEMPT_WORK_CAP` (the first attempt never is, ADR-281). A role re-reading's dry run (`decideDeterministic`)
  is capped by `ROLE_READING_WORK_CAP`. A fold whose re-attempt was cut carries `reattemptCut` (ADR-586, #1770);
  `observeReattemptCuts` reports it, and a check that concludes from failures (the pool's and the seat sweep's
  `complete`) reads a cut as unfinished.
- **The fold's retry pass and claim rule (ADR-577, #1411).** One lowering (`engineCmdsOf`) and one all-or-nothing
  apply (`tryApplyFact`) serve the in-order pass and the ADR-104 retry, which takes every red, enabled, non-forced,
  non-futile row (creating rows too — ADR-W-089) to a fixpoint, except a row re-introducing a point another
  statement claims. A failed row claims only the points it defines (`introducedDefinedPointIds`); a node where a
  creating row landed on the retry carries `retriedCreating` and is never a #365 resume point. `evaluate`'s stuck
  branch names an absent operand («undefined point: A, B»).
- **The config searches rank (ADR-486, #942).** A view stacking two named points is legal (ADR-123) but the last
  tier; `separatedView` is consulted by searchAnotherView / firstSatisfyingSeed / findValidConfig. The renderer
  draws such points as one label («B=D»), merged by label only.
- **The drawn figure is `(facts, seed)` (ADR-484, #938).** A structural edit (remove/removeGroup/replaceGroup/
  toggle/setGroupEnabled) resets the seed to 0; undo/load/rename keep it. The satisfying-seed search runs whenever
  the figure does not build at the current seed (`Derived.sampledFailure`).

## 10. Build order (de-risk the core first) — *historical: all steps complete*

Historical: the phased plan is the archived [`09-implementation-plan.md`](archive/09-implementation-plan.md), and what was built is recorded in the ADR log ([06](06-decisions.md)).

## 11. Key risks

Historical: current risks and the decisions that answer them live in the ADR log ([06](06-decisions.md)).

## Parser chokepoints and gates

### The clarification family, and where an ASK beats an escalation (#777, [ADR-490](06-decisions.md#adr-490))

`not-handled` is the escalation seam: whatever reaches it becomes a paid LLM call — right for a sentence the
grammar cannot *read*, wrong for one it reads but which is **missing a given**. A known phrasing with an operand
genuinely absent returns a `Clarify` and asks, keeping the student's text: anything the tool supplied would be a
given never stated (ADR-052). Members: `incompleteComparative` (#777) and the role-side ask (#775). A new member is
registered **after** the rule that owns the complete form, and its absence is **structural** (an end-of-line
anchor), never inferred from another rule failing.

### The AI answer keeps every shape and role word (#1906, [ADR-722](06-decisions.md#adr-722))

The AI second attempt in `submitPipeline.ts` runs one more member beside ADR-430's object gate:
`droppedPropertyWords(utterance, llmCmds, ctx)` (`src/parser/propertyWords.ts`). It finds the student's property words
with the shared reader (`shell/llm/honestyCore.ts` `propertyWords`, [ADR-W-144](06w-decisions-workspace.md#adr-w-144))
over `PROPERTY_VOCABULARY2` — a canonical-spelling projection of `SHAPE_ADJ_WORDS`, `SHAPE_NOUN_WORDS`,
`POLYGON_NAME_ARITY` (the n-gon tables), `CEVIAN_NOUNS_*` and the inscription verbs, folded as the span accountant
folds and vetoed by its `KEYWORD_STEMS` / `FILLER` — and asks, PER OCCURRENCE, whether the answer's commands carry the
property: ADR-595's `shapeAdjectiveAccounts` (extracted from `droppedShapeAdjective`), the shared `quadImplies` lattice
for a quadrilateral noun (a ring's command type, `declaredAs`, a trapezoid's `kind`, the kite variant, `inscribe`, a
Thales ring), `materialisedArities` for a polygon name, an even ring on one circle for «משוכלל», a foot / ⟂ / 90° for an
altitude, a midpoint / equal pair / ratio for a median, `bisector` / an angle ratio / an arc midpoint for «חוצה זווית»
(ADR-292's whole bisect family for an English "bisects"), and for «חסום» / «חוסם» the circle `statedCircleDirection`
gives the student's line spelt right (`inscriptionVoice`, else `isCircleInPolygon`). Shape words are exempt when every
polygon noun is a reference (`polygonNounsAllReferences`, ADR-595's exemption); a definite «המעגל החוסם» over a drawn
circle is a reference too. When ADR-292's verb gate already names «חוצה/bisect», the bisector words are skipped, and
`mergeWordItems` names a word once. The grammar seam is unchanged. Nets: `issue-1906-ai-answer-words-net.test.ts`
(every committed corpus step, every catalog example, the recorded AI answers).

### An incircle 2-D does not draw, and a bare n-gon in the object gate (#1891, [ADR-606](06-decisions.md#adr-606))

The inscription noun lists (`POLY_WORDS_HE/EN`) compose the n-gon lane's own tables (`POLY_NAME_N`,
`HE_POLY_NAME_N`), so `isCircleInPolygon` decides the direction for «מחומש/משושה/מתומן» too. The `incircle` rule
first asks `uninscribableIncircle`: an n ≥ 5 polygon (from the noun, from «מצולע» plus its run, or a bare run of five
or more labels) with the circle inside → the `incircle-not-drawn` clarify, refused at the pre-LLM decision with
`input.incircleKnownLimit`. It joins `inscribed-contradicts-noun` in `NOUN_REFUSALS`, the refusals the dropped-noun
gate must not overrule. In `droppedConstructNoun`, `BARE_SHAPE_KEYS` holds `place`: #835's bare n-gon flag is the
shape's identity, not payload, so a model answer of a bare n-gon accounts for no stated construct.

### The voice of «חוסם»: one reader decides which noun encloses (#2098, [ADR-650](06-decisions.md#adr-650))

The passive «חסום ב-» is read by `isCircleInPolygon` (the ב / "in" marker names the container). The active
«חוסם» / "circumscribe" has no marker: its **subject** is the outer figure, and `inscriptionVoice(s)` reads it —
`{ container: 'circle' | 'shape', run }`. A circle noun before the verb with no ring between them is the subject
(«מעגל חוסם את ABC», «המעגל O החוסם…», «מעגל שחוסם את ABC») → `circle`; a ring before the verb, or a ring between
the circle noun and the verb (the relative clause «מעגל ש-ABC חוסם») → `shape`. The participle "circumscribed"
names the outer figure: "the circumscribed circle", "… circumscribed by a circle" → `circle`. Every rule that takes
the verb as a cue consults it: `circumcircle` and `circumcircleMeetsSegment` read «חוסם» as the circumcircle only
when the reader does not say `shape`; the `incircle` rule reads the `shape` verdict — a polygon noun and its run,
or a bare run, whose arity `bareRingPhrase` infers from its length exactly as for «מעגל חסום ב-ABC». The
ADR-291 reference spelling `CIRCUM_REF_SRC` puts the verb directly after the circle noun, so it is circle-subject
by construction. The «חוסם ב-» slip is normalised to the passive before any rule runs (ADR-283).

**The circle as the subject is the passive sentence said the other way (#1975, [ADR-652](06-decisions.md#adr-652)).**
`activeCircumscription` runs right after `incircle`: when the reader says `circle` and the WHOLE line is «circle
phrase · verb · (את) shape phrase» (`ACTIVE_CIRCUM_HE` / `_EN`; the circle phrase may carry a name or «שמרכזו O»),
it restates the line as «<shape phrase> חסום במעגל <circle phrase>» and returns what `parse` makes of that — so the two
voices share every lowering and every refusal (the ruled `inscribed-contradicts-noun` is passed through), with no
second lowering. Precedence: a bare run or the triangle with no named circle stays the 3-point `circumcircle`
rule's sentence. `inscribedNgon` takes a bare run of five or more as its arity when no polygon noun is said, and
`uninscribableIncircle` reads the shape-as-subject verdict from the reader. The inscription predicates' gender is
folded at the utterance boundary (`normalizeInscriptionSlip`: «חסומה» → «חסום», «חוסמת» → «חוסם»).

### The n ≥ 5 ring scaffold states regularity as constraints (#2265, [ADR-739](06-decisions.md#adr-739))

`ringOnCircle` (parse.ts) is the one emitter of the n-gon-on-a-circle scaffold (ADR-610): the circle (or an
`existing` one), one `point-on-circle` per vertex, the ring. With `regular` it also emits
`regularRingSides(ids)` — the n−1 consecutive `set-equal`s |AB| = |BC|, …, |(n−1)th side| = |nth side|. The pinned
θ (90 + 360·i/n) are only the SEED that places NEW vertices; over existing ids a `point-on-circle` lowers to
membership (M1) and the θ say nothing, so the equalities are the statement the solver holds and the givens
verifier checks. Concyclic + equal consecutive chords + the simple-ring floor of a declared `polygon` (ADR-616)
is exactly the convex regular n-gon; the pentagram (equal chords, crossed) fails the floor and is never shown.
The two regular lowerings that do not mint the scaffold call the same helper: `inscribedNgon`'s re-entry
branch (the ring already on the circle, ADR-156) appends `regularRingSides`, and `regularPolygon` puts a ring that
already rides one circle onto that circle (`reusedInscribeCircle` → `existing`) instead of minting a second
hidden one whose auto-centre the equal sides leave undetermined; a stated radius keeps the minted circle.

### The inscribed 3-/4-gon states its shape by the standalone lowering (#2355, [ADR-753](06-decisions.md#adr-753))

`inscribedPolygon` (parse.ts) pins the vertex θ of a RIGID kind (square, rectangle, rhombus, right triangle — the
kinds `freeAngles` leaves pinned) and, for exactly those kinds, states the noun's shape by the ONE standalone
lowering, `lowerShape(phrase.kind, ids)` (shapePhrase.ts, ADR-595): the typed `square` / `rectangle` / `rhombus` /
`right-triangle` replaces the labelled `quadrilateral {declaredAs}` / `triangle` row on every branch (fresh circle,
bound circle, the ADR-156 re-entry, the all-exist circumcircle, «בר חסימה»). The θ are only the SEED that places new
vertices on the rule's own fresh circle; on every other branch the vertices already exist when the typed shape
applies, so M1 lowers it to constraints the solver holds and the verifier checks. On the all-exist quad branch the
typed shape comes BEFORE the circumcircle and `set-concyclic`, so a contradicting given is judged in the noun's own
frame (the standalone's refusal). The free kinds (general, equilateral, isosceles, kite, trapezoid) keep their own
relations (`shapeCmds` / the kite `shape-variant`) and order: they already hold on every branch, and the typed
lowering would cost the trapezoid displayable seeds and change the isosceles's variant reading.

### Addressing an angle: one reader, many value kinds (#967, [ADR-496](06-decisions.md#adr-496))

An angle statement has two halves: **which angle** is named and **what is said about it**. **`angleArms` is the
one place that answers which angle is named** (ADR-468, #831); every value rule reads through it — the numeric and
symbolic lanes, `angleAcuteness` and `boundOperand` (ADR-500, #970). Naming by two sides is a mode of that reader:

```
«הזווית בין BD ל-BA»  ──►  angleBetweenSides  ──►  { ray1: D, vertex: B, ray2: A }  ──►  the existing family
```

Two segments sharing exactly one endpoint resolve to the ordinary triple, so constraint, arc, value chip and
verifier are untouched. `boundOperand` carries a refusal channel rather than returning `null`, so a bound refuses
by name as a value does.

**A lone vertex** is resolved by `resolveVertexAngle(v, ctx, exclude?)` (ADR-590, #1445) for every single-letter
site — `angleArms`, the bare `B = 30`, the equality sides, the measure-sum terms, the bisector's forms — in place
of their `nb.length !== 2` tests. Exactly two edges → that angle; else exactly one declared polygon
(`ctx.polygons`) holding the vertex → its interior angle; else `ambiguous-angle` with `options` (every edge pair,
less a straight pair stated via `onSegment`/`midpointOf`), kept even when only ONE remains (ADR-641). The submit door
(`decideDeterministic.ts`) answers any listed candidate with `input.ambiguousAngleOptions`, and an empty list — fewer than two
edges, no angle at the vertex — with `input.noAngleYet` («בקודקוד A עדיין אין זווית…»). A polygon-default reading goes to a reading sink owned
by the outermost `parse`, which reports the winning commands' `angleReadings`; the submit path shows
`input.vertexAngleReadAs` («הובן כ-∠ABC»). The parser stays a pure function of `(utterance, ctx)`.

**Disjoint sides are refused.** Every 2-D angle constraint is vertex-anchored (`set-angle`, `-bound`, `-ratio`,
`-order`, `-acuteness`, `measure-angle`), so two segments that never meet answer `angle-sides-disjoint`, quoting
both — a clarification-family member. 3-D accepts them through its direction/`claim` substrate.

#### The other half of the same statement: the VALUE (#969, [ADR-498](06-decisions.md#adr-498))

Both value kinds are located the same way:

```
stripped ──► angleValueOf ──► { kind: 'num', … } ──► angle          (set-angle)
                          └─► { kind: 'sym', … } ──► measureAngle   (measure-angle)
```

A number goes to `angle` and a symbol to `measureAngle`, each read as the **trailing expression** of the
statement, so no copula list exists. The symbolic read is **end-anchored** and **preceded by a non-letter**, so a
label is never read as a value. A comparison is a region, not a value, in both alphabets: «זווית ABC גדולה מ-α» would have
  been claimed as the equality ∠ABC = α once the `=` requirement went, so `COMPARES_WITH_SYMBOL` joins
ADR-390's numeric tripwire, both bails living with the reader. The numeric rule returns `null` on a symbolic value
instead of committing its coefficient, so the line escalates; naming modes come free through `angleArms`.

#### The relation half: where the right-hand side starts (#976, [ADR-507](06-decisions.md#adr-507))

**The verbose LENGTH frame routes by its connective** (ADR-524, ADR-539). `normalizeVerboseLength` reads
«אורך/הצלע/הקטע <seg> <connective> <value>» and asks which rule owns the connective: a copula (`LENGTH_COPULA`:
nothing, «=», «הוא», «שווה ל») → `<seg> = <value>` for the equality rule; a relation (`LENGTH_RELATION`, built from
the bound rule's atoms — the glyphs, `CMP_BIG`/`CMP_SMALL`, `CMP_AT_LEAST`/`CMP_AT_MOST`, «בין») →
`<seg> <connective> <value>` handed to `measureBound`; anything else → untouched. The two sets are disjoint by
construction. `CMP_AT_LEAST`/`CMP_AT_MOST` lower with `minStrict: false` / `maxStrict: false` (ADR-529).

**A role noun in front composes** (ADR-574, #1607): `roleLength` parses the role half «<noun> XY» as the role rule
reads it alone, and the length half through the same `routeLength` decision; either half unreadable → it bows out.
**A height as a magnitude** (ADR-575, #1443): a cevian phrase naming a side or apex but no segment is read by the
cevian rule and the length lands on the segment it drew; a trapezoid's shape height is rewritten to the cevian
phrase between its bases (`ctx.parallels`, ADR-169), while a parallelogram's or triangle's asks through
`ambiguous-construct` with side-naming sentences carrying the value.

**Word copulas.** The relation readers — `angleEquality`, `arcEquality`, `measureSum` — split on `=`;
`normalizeWordEquality` (the #185 chokepoint) rewrites a word copula to `=` when a labelled angle reference follows
— the bare «היא» / «הוא» / «שווה» and "is" / "are" beside «שווה ל» / "equals" / "is equal to". The label in the
lookahead is the guard («היא זווית ישרה» keeps its lane); a copula before a bare number or a segment stays out.
**Arcs take only the explicit spellings** (ADR-533, #1000): the arc keywords stay only in `שווה ל` / `equals` /
`is equal to`, and `arcEquality` answers the bare form with an owned `arc-copula` clarification carrying the two
labels — the channel of `cevian-wrong-side` and `crossing-already-named` — whose offered sentence is driven in the lock.

### A role noun is a claim: «אלכסון» (#966, [ADR-499](06-decisions.md#adr-499))

A role noun assigns a role, and a role is an assertion: «אלכסון AB» says *AB is a diagonal*. The claim is carried
as a command and checked, never stripped as filler (the class of #536 and #859).

#### One predicate, two layers

`isRingDiagonal(ring, a, b)` in `geometry.ts` is the only test of *is this pair a diagonal of this ring*
(non-adjacent, wrap included). Two layers consult it:

| layer | judges | because |
| --- | --- | --- |
| `applyStep` | claims the figure can ALREADY contradict — some polygon holds both labels and none makes them a diagonal | an immediate refusal teaches (3-D's #859 guard) |
| the givens verifier | claims only the FINISHED figure can settle — no ring holds both labels | the shape is not yet known, so the claim is not yet false |

This is ADR-104's deferral applied to a structural claim: «אלכסון AC · מלבן ABCD» stays green.

#### The refusals teach

Two messages for two mistakes: *AB is not a diagonal of ABCD — it is a side*, and *ABC has no diagonals* (n = 3
falls out of the same predicate). Both quote the statement.

#### What carries a claim, and what does not

The derived plural («אלכסונים», «אלכסוני ABCD») computes its pairs from the ring and is right by construction; the
named pair form («AC ו-BD אלכסוני הריבוע») carries the claim.

### An arc names its circle and its endpoints ([ADR-663](06-decisions.md#adr-663))

The three arc-measure readers (`arcValue`, `arcEquality`, `measureSum`'s arc terms) lower an arc to its central angle
and create nothing. Each marks the arc: `set-angle` and `set-angle-ratio` carry `arcOf` (the circle), `set-measure-sum`
carries `arcOf` plus `arcTerms` (the indices of its arc terms, since a sum may mix «∠» and «קשת»). The engine ignores
the markers. Two parse seams read them: `consumedCircleId` (so `withImplicitCircles` creates a named circle the arc
names and the figure lacks), and the post-pass `withArcEndpoints`, run in `runRules` after `withOnCircleMembership`
and before `withImplicitCircles`, which prepends `point-on-circle` for every endpoint the figure does not already know
on that circle — a new point is created on it, an existing one is lowered onto it (M1). The membership predicate is
one helper, `circleMembership(ctx, centre, id)`, which `diameterCutsSegment` and `diameterFromPoint` call for a
diameter's from-point too.

### A role noun is a claim, lowered once ([ADR-563](06-decisions.md#adr-563))

`src/parser/roleNouns.ts` is the one vocabulary of role nouns (chord, diameter, radius, tangent, leg, base,
hypotenuse; Hebrew as whole words with clitics, English with uppercase labels). `roleOperands(s)` returns each noun
with the pair(s) the words attach it to. `withRoleClaims` (`src/parser/parse.ts`) runs after the winning rule in
`runRules`, before the circle post-passes (it replaced ADR-119's `withCarrierMembership`):

- **chord** — both ends `point-on-circle`; **diameter** — plus `set-collinear` through the centre; the circle from
  `circumscribingRef` / `directionalCircleRef` / `resolveOrIntroduceCircle({ implied })` or the winner's own;
  several → `ambiguous-circle-ref`; an end at the centre → `centre-end`; a pair the rule defined a circle by
  (`diameter`, a midpoint centre, a semicircle) is left to it.
- **radius** — the other end on the circle whose centre is an end (else the sentence's circle); no circle →
  `no-circle`, no centre end → `no-centre-end`.
- **diagonal** (ADR-569) — `segment {diagonal: true}`, judged at apply (`diagonalClaimRefusal`) and by the
  verifier; «אלכסוני» stays the `diagonals` rule's. That rule reads the PLURAL only, in both languages
  («אלכסונים»/«אלכסוני», "diagonals"): a singular noun names one diagonal and is `segment`'s (ADR-638).
- **tangent** — `'unread'` when the winner touched no circle, so `runRules` tries the next rule.
- **hypotenuse / leg / base** — over the polygons holding the pair as a side: hypotenuse → `set-angle` 90 at the
  third vertex; isosceles base → `set-equal` of the other two sides; trapezoid base or leg → `set-parallel`; a
  triangle leg `ctx.roleSides` already makes one → nothing, else `leg-apex`; none → `no-polygon`, several →
  `several-polygons`.

Refusals are `ParseResult` `role-claim` (`why`, noun, pair), mapped in `decideDeterministic.ts` to
`input.roleClaim.<why>`. **Lines named by letters belong to the rule that reads them** (ADR-569):
`specialPointMeet` derives a centre's lines from the shape only when no pair list follows
(`letteredCentreLines`); named diagonals go to the lettered meet rule, named medians, altitudes and bisectors
through their own rule, all or nothing.

### Telling a LABEL from a WORD in Hebrew (#968, [ADR-497](06-decisions.md#adr-497))

The convention nudge (#779) lifts `abcd` to `ABCD`, checks the corrected sentence parses, and shows it without
committing.

The commit-seam half (`lowercaseLabelFold`) proves a fold from the COMMANDS: a lowercase run whose upper-cased letters
are all labels the commands reference. A run the commands carry as a **symbol** is exempt — the engine's own
`symbolsConsumedBy` (a measure's `expr.var`, a radius letter, an order or bound operand) plus a `set-var` name — so
«AB=b» (b coinciding with the endpoint B) is a measure, never the folded label B ([ADR-668](06-decisions.md#adr-668), #2024).

Hebrew-alphabet labels are told from words by the alphabet **range** — labels come from its start
(א-ט ⇒ A-I), and geometry words carry a later letter:

| token | letters | verdict |
| --- | --- | --- |
| `אבגד` | א1 ב2 ג3 ד4 | **label** → `ABCD` |
| `בד` | ב2 ד4 | **label** → `BD` |
| `מלבן` | **מ13** ל12 ב2 ן(נ14) | word |
| `אלכסון` | א1 **ל12 כ11 ס15** ו6 ן14 | word |
| `זווית` | ז7 ו6 ו6 **י10 ת22** | word |
| `בין` | ב2 **י10** ן14 | word |

Final forms fold first (ך→כ, ם→מ, ן→נ, ף→פ, ץ→צ — the lexicon's ADR-3D-035 trap one layer down), and only «ל» is stripped as a leading particle. The proof gate
makes a misread harmless: a candidate that does not parse produces no suggestion. The alphabet itself is not
supported (operator ruling): it would reach labels, RTL direction, export and every element id (`seg-AB`).

### An indefinite shape is a new shape ([ADR-654](06-decisions.md#adr-654))

The inscription rules (`inscribedPolygon`, `incircle`) resolve an unnamed shape noun through `referencedPolygon`:
ADR-029's `existingPolygon` (the figure's one polygon of that size), recorded in a parse-wide sink when
`shapeNounIsDefinite` (`parser/shapePhrase.ts`) says the noun is indefinite — no glued ה, no preposition prefix,
no English "the". The outermost `parse` returns the binding as `indefiniteShape` when the winning commands name it.
`indefiniteShapeReading` (`store/indefiniteShape.ts`), called by submit, the ✎ edit seam, the load refresh and audit (`loadAudit.ts`) and the scenario harness,
keeps the bound reading only when it restates the shape (dry run empty or implied, and no new violation from the
givens verifier); otherwise it re-parses with that polygon left out of `ctx.polygons`, so the rule mints fresh letters.

**The definite half** ([ADR-685](06-decisions.md#adr-685)). `shapeNounSpan` / `shapeNounArticle` (`parser/shapePhrase.ts`)
read the first shape noun's article three ways — `definite` (glued ה, also behind ו/ש; English "the"), `prefixed`
(ב/ל/כ/מ, the article unwritten), `indefinite` — plus where the noun's word ends and its arity (the n-gon words
passed in by parse.ts); `shapeNounIsDefinite` is the ADR-654 two-way view of it. `definiteShapeVertices`
(`parse.ts`) is asked by every rule that would auto-name a polygon for an unnamed noun — `shapeMacro`'s no-label
branch, `inscribedNgon`, `regularPolygon`, `inscribedPolygon` and `incircle` (before `referencedPolygon`), and the
polygon-in-polygon container (reading from the container phrase): a `definite` noun of the rule's arity over
ADR-029's candidate set returns the one polygon's vertices (the labelled branch's lowering follows), or with two or
more the `ambiguous-definite-shape` clarify (`shapes`, `sides`, `example` — the sentence with the first ring's
letters after the noun). It is an ambiguity question (`isAmbiguityQuestion`), so neither the dropped-noun gate nor
the model sees it; `ambiguousDefiniteShapeNote` (`app/decideDeterministic.ts`) renders it for the submit and ✎ edit
seams (`input.ambiguousDefiniteShape`, the plural from `input.shapePlural` by arity).

### A through- or size-statement about a drawn circle is a reference ([ADR-548](06-decisions.md#adr-548), [ADR-690](06-decisions.md#adr-690))

The circle definition rules (`circle`, `circumcircle` in `src/parser/parse.ts`) ask ADR-029's introduce-vs-resolve
question through `definiteCircleReference`: a reference when its named centre's circle exists, or when it says
«המעגל» and a circle is drawn. It resolves through `circumscribingRef` → `directionalCircleRef` →
`existingCircleRef` (ADR-443's tie-break); unbindable → `ambiguous-circle-ref`. It lowers to one `point-on-circle`
per label (the M1 membership shared), a stated size as `set-radius`, and defers on any residue. `throughClause` is
the one reader of the through list; a definition lowers one through point, a longer list is the circumcircle.

**A size statement asks the same predicate** (ADR-690). `circleSizeExisting` («שטח/היקף המעגל הוא …», "the area of
the circle is …") asks it when no named circle or bare circle label is read, and lowers the resolved circle to the
`set-radius` its named form emits (or returns the ask). The `circle` definition rule asks it for an unnamed definite
noun with a size and no through clause (`lowerSizeReference`: «המעגל ששטחו 9π», «המעגל ברדיוס 3»): a numeric size
is `set-radius`, a radius letter is `radius-symbol` (its twin «רדיוס המעגל R»'s command), the same residue guard
applies, and a reference it cannot read whole defers — never a definition. A named centre keeps its own path
(ADR-683's restatement).

**The membership seats the circle, not the point** ([ADR-576](06-decisions.md#adr-576)): before apply branch (c2)
converts an existing free vertex to an `on-circle` rider, `reseatFreeCircle` moves the circle's unstated seat
through it (one member: the centre slides along the ray; two: to the perpendicular bisector or the R-circles'
crossing; three with a free radius: the circumcircle), re-deriving every member's θ. Guard: the centre is an
unpinned, un-driven free point, the circle carries no `solve` or radius order, and nothing else names or depends on
them; otherwise a colliding bearing takes the `nextTheta` slot (ADR-123).

### A tangency about the circle asks the shared resolver ([ADR-560](06-decisions.md#adr-560))

`cornerTangentCircle` (`src/parser/parse.ts`) asks the shared seam: `existingCircleRef` binds a named-and-drawn
circle, the one circle, or by ADR-443's tie-break; an unbindable unnamed reference asks through
`ambiguousCircleAsk`; otherwise the sentence creates the circle — the corner construction when the touch points are
free (a missing corner minted by its side's `segment`), else `resolveOrIntroduceCircle`. A created circle with no
named centre carries `autoCenter` (ADR-342's anonymiser hides it until `name-center`), and its auto letter avoids
the sentence's labels.

### A touch list is one sentence: the ring's incircle, else the shared seam ([ADR-631](06-decisions.md#adr-631))

`touchListCircle` (`src/parser/parse.ts`) runs before `cornerTangentCircle`. It reads three or more sides, the tangency verb, the circle and the optional in-order touch list as ONE sentence.

**No circle to bind, sides closing one ring** (`closedRing`): the rule emits the `incircle` rule's own construction (`incircleConstruction`, shared), with the named letters as the feet. A ring that `INCIRCLE_ARITIES` does not hold returns ADR-606's `incircle-not-drawn`.

**Every other case** asks the ADR-560 seam: `existingCircleRef`, then `resolveOrIntroduceCircle`, or a decline to `ambiguousCircleAsk`. Each side is then stated one of two ways:
- as `tangentLine` states a single side: the foot from the centre, on the circle, `set-line` within the side;
- for a placed touch point, as `cornerTangentCircle` does: on the circle, radius ⟂ side.

### The hidden centre letter steps aside ([ADR-565](06-decisions.md#adr-565))

An unnamed circle still carries an internal reference token (`O`, then `P`, `Q`, `K` — ADR-342): its id is
`circle-O` and its anonymous centre `@ctr-O`. Every seam that parses a student sentence — `decideFromParse`, the ✎
edit seam, the scenario mirror — first calls `stepAsideFacts(facts, typedLabels(utterance))` (`store/geoStore.ts`),
re-lettering each hidden token the sentence types to an unused letter as a `step-aside` bind applied with
`reletterHidden`. The student's letter is then an ordinary new letter: a reference («BO = 5») mints a free point,
«מעגל O» declares a circle, «C על מעגל O» names an unnamed circle by use (ADR-347). Circles `autosInterchangeable`
finds interchangeable (a crossing read as an unordered pair whose `branch` is seed, #1688; requirement records
compared, ADR-567, #1709; an equality of two lengths — a `ratio` with k = 1 and no offset — read as an unordered pair, ADR-691, #2217) are named in order; otherwise it asks.

`nameCentreFacts` absorbs a target letter nothing places (a bare `free-point`, no vertex, first used after the
circle), exposed through `ctx.freePoints` to `parseNameCenter`, the `nameCenter` rule and `impliedCircleBinding`; a
radius sentence whose centre end is such a letter emits the implied circle (`radiusNamesCentre`).

**A circle drawn through drawn points carries its centre's provenance** ([ADR-748](06-decisions.md#adr-748), #2362 / #2369).
A `circumcircle` keeps its real centre letter (`O`), so the hidden-token form does not cover it. Every parser emitter
sets `autoCenter`: `true` when it minted the letter, `false` when the student typed it; the engine reads it
(`autoCenter: cmd.autoCenter !== false`), so a named centre is drawn (FR-RN-8). A fact saved without the field is
migrated at load (`figureFile.ts` `withCentreProvenance`: the letter is the student's when their own sentence typed it).
`mintedCentreLetters` (`replay/naming.ts`) is the one list the naming core asks: the hidden tokens plus the minted
circumcircle letters not promoted, not adopted and typed in no line; `isCircleCreation` is the one creation predicate.
**Visibility is read at the seam, never at replay.** `DecideState.centresShown` (filled from the store's `showCenters`
by `SubmitDeps.centresShown`; `EditDeps.centresShown` for the ✎ seam, read at edit time) and `lettersOnScreen` — the
scene's own `drawnPointIds` rule — decide each typed minted letter: one the student could not see steps aside
(`renameInCommand` across the commands; the utterances never hold it), one on screen is **adopted**: a
`name-by-use {op: 'adopt'}` row in the line's group sets `autoCenter: false`. Both rows carry the `@ctr-` form (a
token and a real letter never share a circle id) and apply only while the letter is still minted, so undo, mute, edit
and save carry the decision with the line. The binding (`bindingFor`) intersects the unnamed circles the sentence's
subjects ride; an empty intersection over a non-empty union asks. `arcMidpoint` emits the by-member candidate for a
fresh circle letter beside an arc whose ends ride an unnamed circle.

**A centre given a second letter is refused at the door** ([ADR-747](06-decisions.md#adr-747), #2398). `circleWithOtherCentre`
(`parse.ts`, beside `circleCenter`) is the one two-slot reader of «מרכז המעגל O הוא K» and its spellings (the whole
sentence is the pattern; non-null only for two different letters). `decidePreParse` calls `doubleCentreNaming` before
every naming and before the step-aside, with the circle letters the student can see as names — a non-auto centre, or a
minted one `lettersOnScreen` shows (`centresShown` reaches `decidePreParse` too): the holder is named
(`input.centreAlreadyNamed`), any other letter is `errors.unknownCircle`. The `circle` rule bows out on the same reader,
so no re-parse (the AI lane, ✎, the load refresh) builds `circle O` from it. The scenario mirror calls `decidePreParse`.

**A rule's own circle for a fresh letter is a naming candidate** (ADR-599, #1694): when the sentence names a point
riding an unnamed circle (`namesUnnamedCircleMember`), the circle a rule introduces carries `implied: 'by-member'`
beside `withImplicitCircles`' `implied: true` — `resolveOrIntroduceCircle`'s named branch and `circleOnDiameter`,
which also states `set-collinear [A, X, B]`. `impliedCircleBinding` binds a by-member candidate only on a
membership signal, with no sole-circle fallback. The #184 option is `presupposes`.

**A naming by use is a fact of its line** ([ADR-588](06-decisions.md#adr-588), #1697): the decision's binds are
committed as `name-by-use` facts at the head of the line's group (`commitVerdict`); `resolveBinds`
(`replay/naming.ts`) applies each enabled one to the facts before it, so deleting, muting, editing or undoing the
line removes the name. The naming core never collides: `nameCentreFacts` and `renameFacts` step a hidden token
aside, `withAnonymousAutoCentres` re-picks a held token; `withMetricCentreBinding` is gone.

**The point naming has a general criterion** ([ADR-653](06-decisions.md#adr-653), #2122): beside ADR-440's line-slot
arm, `impliedIdentityBinding` (`replay/core.ts`) trial-applies the line and names by use an auto-named point M that the
line leaves with the same definition (`definitionKey`: kind, parents, parameters; never a free DOF) as exactly one
student point L — the touch point M that `tangentTouchCopy` copies into X. A fresh L is the `point` rename; an existing
L is a `merge` naming (`mergeFacts`): M takes L's letter in the facts before the line, valid only while M is defined
before L first appears. A merge makes the line's statement true by construction, so both commit seams commit it as a
plain success (no «כבר קיים»). Submit, the ✎ edit seam and the scenario harness call the same two arms.

### A foreign given is refused by the grammar, before any rule ([ADR-562](06-decisions.md#adr-562))

`classifyOutOfScope` (`parser/scope.ts`) holds the vocabulary of the families another tool owns — `analytic` (axes,
coordinates, slope, line equations, a quadrant) and `cross-app` (the solids, and a plane as an object via
`planeObject`, which exempts «במישור …»). `foreignGiven` asks the same rules of the whole utterance at the top of
`parse()`, beside the LaTeX and negation guards — and `parse` returns `{ ok: false, reason: 'foreign-given', category,
phrase }`. Because it is `parse`, every seam inherits it: the submit lane (`decideFromParse` answers with
`input.scope.foreign-given`, quoting `phrase` ahead of the family's pointer, logged as `scope:<category>`), the ✎
edit seam, the scenario harness (`refusedSteps`) and log-triage. The pre-parse guard and the post-failure register
read the same `RULES` entries.

**An angle written in radians** (#1837, [ADR-710](06-decisions.md#adr-710)) takes the same positions: `findRadianAngle` (`shell/radianAngle.ts`, [04w](04w-design-shell.md)) is asked in `decidePreParse` right after the proof target — `refuse`, `guided`, logged `scope:radian-angle`, note `input.scope.radian-angle` — in `runEditCommit`, and at the top of `parseEntry` (`{ ok: false, reason: 'radian-angle', value }`), so no caller of `parse` can draw «∠ABC = pi/2» as 2°.

**A letter the tool cannot read** (#1919, [ADR-626](06-decisions.md#adr-626)) takes the same two positions.
`unreadScript` (`shell/inputScript.ts`, the shared rule all four builders call) is asked in
`decidePreParse` — refusing with `input.scope.unread-name` or `input.scope.unread-word`, the student's own
letters quoted, logged `scope:unread-*` — in `runEditCommit`, and at the top of `parseEntry`, which returns
`{ ok: false, reason: 'unread-script', kind, detail }` so no caller of `parse` can draw them. It runs on the
NORMALIZED text, so the look-alike letters (the glyph table's last row,
[04w](04w-design-shell.md#the-input-script-rule-adr-626-adr-3d-328)) are already Latin: «משולש КМО» builds
KMO, «משולש ДЖФ» is refused. Before it, a letter outside `[A-Z]` was invisible to `namesVertices`,
`shapeLeftover`, `statedLabelTokens` and the span accountant at once, so the shape read as unlabelled and
`autoVertexLabels` drew A, B, C.

### A trig function of an angle is decided whole, before any rule ([ADR-566](06-decisions.md#adr-566))

`trigGiven` (`parser/parse.ts`) runs at the top of `parse()`, after the angle-alias rewrite, beside the proof-target
and foreign-given guards: a line in which tan / tg / cot / ctg / sin / cos (or the Hebrew names, with a clitic) is
applied to an angle belongs to it whole. The canonical shape (`trigLine`) — its value read by `NUMEXPR` — lowers to
the arms' `segment`s plus a `measure-angle` whose `expr` is `{ value: <the angle in degrees> }` with no `text`: the
literal path (`lowerOne` → `set-angle`), labelled by `measureLabelForms`' number branch, `fmtNum(value) + '°'`
([ADR-572](06-decisions.md#adr-572), #1718; ADR-566 had `text: 'tan=2'`). cos goes through `acos`; the ratio is
declared in `consumed.numbers` (ADR-462). Anything else returns `{ ok: false, reason: 'trig-given', why, fn, sentence }`
— `sine-out-of-range`, `out-of-range` or `form` — answered by `decideFromParse` as `input.trigGiven.<why>`, never
escalated. `NOTATION_WORDS` is the one list of Latin words the label-counting gates (`statedLabelTokens`, the span
accountant) never read as labels.

### One shape-phrase reader ([ADR-595](06-decisions.md#adr-595))

`src/parser/shapePhrase.ts`: `readShapePhrase(s)` → `{ noun, kind, arity, stated, consumed, unconsumed, strip, lower, cyclic }`.
The noun decides the arity; an adjective is consumed only when the (noun, adjective) pair has a lowering, otherwise
it stays in `unconsumed` for the leftover gate. `lowerShape(kind, ids)` is the standalone lowering;
`inscribedPolygon`, `incircle` and `inscribedInPolygon` read through the same reader. `cyclic` carries analytic's
`notCyclic` (a right trapezoid → rectangle), which `inscribedPolygon` turns into `inscribed-contradicts-noun`.
Gates: `droppedShapeNoun` (a noun accounted only by a ring of its arity) and `droppedShapeAdjective`.
`commandConflict` treats a generic `quadrilateral` / `triangle` over a declared ring as a supertype restatement.
A ring is compared by `ringKey` (`engine/geometry.ts`, the one definition; ADR-W-121): `normalizeShapeComposition`
re-spells a ring command over a ring the figure already declares to the declared spelling whenever the word is
symmetric under that reading (`RING_SYMMETRIC`; the trapezoid only under the readings that keep its named pair,
`sameStatementUnder`), so a rotated or reversed restatement takes its declared spelling's verdict ([ADR-618](06-decisions.md#adr-618)).

### The exam's sentence frame, read at the normalize boundary ([ADR-630](06-decisions.md#adr-630))

`src/parser/frame.ts`: `readFrame(s)` — pure text → text, called LAST in `normalizeUtterance`, so every rule and every
honesty gate (which normalize the student's line themselves) read the canonical sentence. Two families: the
wrapper that states nothing (`UNWRAP`: «בסרטוט שלפניך מתואר …», the name–dash «O – …») and the shape as a
predicate (`shapePredicate`: «(ה)<noun>? LETTERS (הוא)? <phrase>[ (…)]» → «<phrase> LETTERS[ (…)]»), where the phrase
must be one `readShapePhrase` lowers whole, its arity must match the letters and the subject noun must be the
phrase's own or the generic «מרובע». Anything else is returned unchanged. It is the second copy of analytic's
`frameAnalytic.ts` (copied, BOUNDARIES.json); a third copy (3-D, #1679/#1888) moves the pure part to `shell/`.

### The bar spelling of a length, folded at the normalize boundary ([ADR-719](06-decisions.md#adr-719))

`normalizeUtterance` folds a **two-label** absolute-value pair to the pair — `|AB|` → `AB`, `| A1B1 |` → `A1B1` — right
after the look-alike glyph fold (`foldGlyphs`) and the ן-connective fold, so every length rule and every honesty gate
reads one spelling. Uppercase labels only, guarded against a doubled bar on either side (`AB || CD || EF` is not
`|CD|`); `|z|`, `|ABC|` and anything else pass through untouched. The four older per-rule strips (`parseMeasureSide`,
`parseProductSide`, the product-term reader, `lengthOrder`'s `SEG`) stay as written: they also accept a lowercase pair
(and the sum and product readers any bar) the fold does not, and removing them would change those readings. No catalog row: the panel teaches
«AB = 4»; the bar is a tolerated variant, like the «מעויין» fold.

### A second shape noun over a declared ring ([ADR-619](06-decisions.md#adr-619))

`engine/shapeKinds.ts` reads the quadrilateral hierarchy from the ONE shared lattice (`shell/narrowing.ts`
`NARROW_IMPLIES`; [ADR-W-131](06w-decisions-workspace.md#adr-w-131)): `QUAD_IMPLIES` is a derived view and `quadRelation` is
`kindRelation` — the function 3-D and analytic read too — keyed by the kinds 2-D stamps on `polygon.declaredAs`. The
trapezoid arm stamps the phrase its command carries in `kind` (`isosceles-trapezoid` / `right-trapezoid`, both stamped
by `lowerShape` since #2169) and a later adjective narrows the ring (`refineRingKind`); the parser's noun selectors read
the ring's kind through `nounOfKind` (an adjective trapezoid is «הטרפז»). The trapezoid
rows are the curriculum's EXCLUSIVE reading (exactly one parallel pair), which `shapeConstraints` already assumes.
Three derived readers, three directions, no list of pairs:

- `quadRelation(declared, stated) === 'implies'` → `impliedShapeRestatement` (apply.ts) re-spells the line to the GENERIC ring
  command over the declared spelling, so it takes ADR-595's path and the submit pipeline answers «כבר קיים» with no
  row. A rewrite, not a new `commandConflict` carve-out. The implication is REFLEXIVE ([ADR-711](06-decisions.md#adr-711)):
  the noun the ring already is restates it too, so a kind a sibling merge stamped (`refineRingKind`), which no command
  of that noun built, is never re-applied as a fresh shape. Only the noun is re-spelled: a command carrying a stated
  field beyond its vertices and kind (the square's `side`) keeps its own path (`RESTATEMENT_FIELDS`).
- `quadsExclude(declared, stated)` → `shapeExclusion` / `shapeExclusionError`, a stage-0 prover beside ADR-607's,
  rendered by `humanizeError`'s `errors.shapeExcluded` with both nouns read from `shapes.name.*` (`paramKeys`: a
  param whose value is a translation key).
- neither → ADR-157's refusal, unchanged.

`declaredQuadKind` reads what the ring is already known to be (by `ringKey`, so any reading), `statedQuadKind` reads
what the line says (one reader for every spelling the parser emits). A reading other than the declared spelling
passes only `quadImpliesInEveryReading`, which excludes a noun naming one particular pair of sides.

### A point placement keeps its tail ([ADR-570](06-decisions.md#adr-570))

The point-on-carrier rules (`pointOnExtension`, `pointOnSegment`) match a prefix, so three seams carry the tail:

- **The condition clause** — `compoundSuchThat` splits on «כך ש» / "such that" and, after a point-placement subject
  (`POINT_PLACEMENT`), on `GIVEN_AND` («ונתון כי / ש», «וידוע כי / ש»); each half parses through the real grammar,
  all or nothing. A shape subject is not split (#108).
- **The end qualifier** — `pointOnExtension` reads «מעבר ל(-)(נקודה) X» / "beyond X": the far end keeps the
  carrier, the near end reverses it, another letter escalates.
- **The net** — `droppedGivenRelations`'s exemption (b) holds only when the command introducing one of the
  relation's labels carries every label of it (`K על המשך AB כך ש AB=BK`), so the clause fallback (ADR-264) and the
  LLM lane are held to the same gate.

### An existing label is context only through a reference ([ADR-597](06-decisions.md#adr-597))

The span accountant's label pass lives in `src/parser/labelAccounting.ts` (`spanAccounting.ts` imports `parse.ts`,
so the parser cannot import the accountant). Every stated label is **carried** by a command value, **masked** as
notation, or an **existing label the lowering refers to**: a member or the centre of a referenced circle
(`circle-X`, `ParseContext.circleMembers`); a circle's name when the lowering touches THAT circle (`circle-X`, a
concentric `circle-X-2`, `@ctr-X`, the centre X — [ADR-735](06-decisions.md#adr-735) narrowed it from "a circle at all"); a vertex of a
polygon the sentence names with its noun (`ParseContext.polygons`). Callers: `honestyGateReport` (commit and ✎
seams; `GateCtx` carries `circleMembers` and `polygons`), the LLM second attempt in `submitPipeline`, and
`parseResolved`, where an unaccounted existing label routes to the clause split (`splitStatements`, ADR-264; a new
label stays `droppedNewLabels`'s question), whose `parseClause` asks again. `augmentParseCtx` registers a clause's
anonymous centre (`@ctr-O`) with `centrePoint`, as `buildParseCtx` does. Widening the reference closure is the
sanctioned direction; re-widening the exemption is not.

**The invented direction** ([ADR-695](06-decisions.md#adr-695), #2228). `introducedNewLabels` (the LLM second attempt's mirror gate, #255) asks the converse: is each label the model WROTE the student's? An existing label is the student's only by name or through `nounReferencedLabels` (same module). A polygon / circle / segment noun in the sentence reaches the figure's polygons, circles (centre and members) and drawn segments, narrowed to the objects holding a point the sentence names. The set difference is `nameAccounting` from `shell/llm/honestyCore.ts` with existing names not exempt, the call analytic's #2225 gate makes.

### A point stated on several carriers is on each ([ADR-735](06-decisions.md#adr-735))

`src/parser/incidenceList.ts` is the one incidence-list distributor: a subject run, «על»/"on" before each of two or more
carrier references (an optional carrier noun and one or two labels), and an optional «בהתאמה»/"respectively"
(`RESPECTIVELY`, `lexicon.ts`). It returns one clause per incidence — every subject on every carrier, or subject i
on carrier i when paired (a count mismatch is null). Two readers share it, never a fork: `parseResolved` reads a
line it distributes as that distribution through the ADR-264 clause path (`parseClauses` / `parseClause`), ahead of
the whole-line rules and all or nothing (a clause that does not read gives `not-handled`); `clausesOf` returns it,
so the coverage gate sees each incidence. `withOnCircleMembership` binds each «X על [ה]מעגל K» to its own named
circle K («A על מעגל O ו-B על מעגל P» puts B on P), and an unnamed «X על המעגל» to the resolved definite circle.

**A relation stated to a list of objects holds for each** ([ADR-744](06-decisions.md#adr-744), #2211, #2219). The same module's
second shape, `objectListShape`: one subject at the sentence opening (a circle «(ה)מעגל X» / "(the) circle X", a label
pair with an optional segment noun, or one label), a predicate that names no label, and an object list of two or more
objects of ONE kind to the end of the line — circle names (only after a circle subject: a circle list after a segment or
point subject is another sentence, «AB משיק משותף למעגלים O ו-P», «A נמצאת על המעגלים O ו-P») or two-letter segment
names — as a plural head («למעגלים O ו-P», «לקטעים BC ו-AB», "circles O and P", "to both BC and AB") or one object per
item («ל-BC ו-AB», «ול-», «וגם ל-», «,», "and (to/segment)"). The list head's preposition rides every clause and a plural
head becomes its singular. `distributedClauses(s, ctx)` (parse.ts) is the one entry both readers call: the incidence
list first, then the object list, which is kept only when its first two clauses each read ALONE through `parseClause`
(every net) and their lowering names the subject and that clause's object — so a collective predicate whose head says
nothing alone («O חיתוך של AC ו-BD») keeps its own reader. A recognised list is final: its clauses go through the clause
path all or nothing, and no `splitStatements` fallback turns its objects into draws. No tail is read after the list (a
tail means the line is not this shape). `namedCircleRefs` returns the UNION of the per-circle and plural-list names in
order of appearance, and `resolveCirclePair` resolves exactly two names (more than two → no pair).

**An arc named on a circle lives on that circle.** `arcMidpoint` (both the fixed midpoint and the free point on the
arc): when the sentence names a circle, that circle is the arc's; if an end is a member of another circle and not of
the named one, the rule returns null (the line is `not-handled` and goes to the model). With no circle named, the
circle holding both ends (`circleContaining`) is the arc's, else the single circle. The named circle is never
replaced by membership (operator ruling 2026-10-18; ADR-042's override withdrawn).

### A crossing draws what its subject is ([ADR-592](06-decisions.md#adr-592))

Only the frame decides whether a crossing's operand lines are drawn. The verb frame — `lineLineIntersection`'s
lines-first and cut branches, and a role meet whose `crossingSubjectOf` is `'lines'` — inks its operands (the
diagonals of «האלכסונים נפגשים בנקודה M» as plain segments). The noun frame — the point-first branch,
`cross(…, 'point')`, a role meet with a noun head — inks nothing and ensures the endpoints as `ifAbsent` free
points. Analytic reads the same rule (ADR-AG-241).

**A tangent has no second crossing** ([ADR-640](06-decisions.md#adr-640), #1931). `tangentAt(line, circle, Q)` (`evaluate.ts`) is
the one test: Q on both, and |cos∠(line, radius)| ≤ `TANGENT_COS` = 10 × `DIRECTION_EPS` — an angle held to the ⟂
tolerance, never to `LEN_EPS`, which a relation-held tangency can game. `tangentTouch` asks it of every placed point.
Callers: the line∩circle point in `tryEval` (a solve's trial seats it on the touch point; the drawn figure refuses,
tagged `EvalErr.tangent`), the on-circle carrier driven by `collinear` (post-solve), `crossingBranchCount`, and the
step ladder twice — `newCrossingTangency` judges a NEW crossing on the prior figure (stage 0j), and
`runFailureLadder` carries a rescue stage's tangent refusal as the refusal's reason (`tangentSeen`, stage 2i).

**Two circles with one common point have no second crossing** ([ADR-645](06-decisions.md#adr-645), #2080, #2083). A
`circles-tangent` statement leaves a `circle-position` record with `relation: 'tangent'` (and its touch point `at`) in
`requirements`, whichever way apply realised the tangency; `circlesStatedTangent` (`structure.ts`) reads it, never
coordinates. `circlesTouch` (`evaluate.ts`) is the lengths twin: |d − (r₁ + r₂)| or |d − |r₁ − r₂|| within
`CIRCLES_TOUCH_REL` = 2·10⁻⁴ of the pair's scale, the ruler a stated length is held to. A second crossing — a
`circle-circle` point whose `avoid` is the first crossing of the same pair — of a pair with one common point is
refused with `oneCommonPointError` («X coincides with Y», the over-constrained coincide shape): at stage 0j on the
prior figure (`circlesCrossingTangentError`: stated tangent, or touching at every sampled configuration of the prior
figure), a tangency stated over a pair with two named crossings likewise, and in `tryEval` as the backstop (a trial
seats the second crossing on the first; the drawn figure refuses, tagged `EvalErr.tangent`, so the ladder carries
it). The fold names the other side: the drop-one search finds the tangency or the length; for the other order the
crossing's own statement is read from `ownerByObjId`.

**A stated radius is never rewritten** ([ADR-692](06-decisions.md#adr-692), #2239). Over two stated (`length`) radii
`circles-tangent` pins the centre distance (r₁ + r₂, or |r₁ − r₂| > 0) and never touches a radius; the ADR-037 Am. 2
`tangent-inner` radius variant, which made the second of two equal circles the largest one inside the first, is gone.
Since [ADR-713](06-decisions.md#adr-713) (#2206) the predicate is `equalNestedPair` and its message
`over-constrained: equal circles <circle> nested <contained|int-tangent|concentric> cannot hold`, humanized in the
over-constrained frame with the relation's reason (`errors.equalNestedReason.*`, #2200's sentence); its nestings are the
internal-tangency and containment records plus the incoming commands, and two circles of the applied construction on one
centre; "equal" is both radii stated equal or a radius ratio k = 1 on the pair (`ratio` with `radii`). The fold's
`tagEqualNested` names the other side for each relation (the nesting's statement, or the latest size / equality). The
words half is the parser's: `circlesTangent` (internal) and `concentricCircles` return the owned `equal-circles-nested`
clarify with its `relation`, as `twoCirclesPosition` does for the contained pair (ADR-712). As ADR-692 built it:
equal stated radii stated internally tangent are refused at stage 0a by `equalInternalTangency`
(`radiusFeasibility.ts`, beside `circlesTangentError`), in either order: over every internal tangency the construction
states (its `circle-position` records) and the incoming commands state, a pair whose radii are both stated and equal
(#2119's 1e-9 relative tolerance) after the step and was not before is refused in #2119's restated-size shape
(`radius of <circle> = <v> cannot hold`, `errors.restatedSize`). The fold names the other side by provenance: a refused
size names the tangency's statement (before the drop-one search, which would name the other circle's size); a refused
tangency is left to the drop-one search first (a later statement that completed it, ADR-554 — a radius letter's value),
then names the latest statement that sized either circle. The backstop is the givens verifier: the latest stated size
of every circle (a sized `circle`, a `set-radius`) must equal its resolved radius to the length tolerance
(`figure.v.radius`), so a future route that changes a stated radius can never draw green.

### The two-circle family's pair modifiers ([ADR-455](06-decisions.md#adr-455), [ADR-677](06-decisions.md#adr-677))

A modifier stated for the PAIR lands on the pair the rule resolved (`resolveCirclePair`, the #215 chokepoint), through
one helper per modifier in `parse.ts`: `withEqualRadii` (EQUAL_SIZE → `set-radius-ratio k = 1`) and, since ADR-677,
`withStatedRadius` (one singular «ברדיוס N» / «רדיוס כל אחד N» / "with radius N" — `STATED_PAIR_RADIUS`, read only when
exactly one such phrase governs the pair and it is not a named circle's own «מעגל O ברדיוס 5»): a circle the rule
creates is created PINNED at N (`freeRadius` dropped), a drawn one gets `set-radius N`. `withStatedRadius`'s consumers
are `twoCirclesMeet` (all three branches), `twoCirclesPosition` (the disjoint pair only), `circlesTangent` (external
only; its #757 leftover guard strips the phrase only then) and `commonTangent` (the two-touch construction). A pair
that cannot be equal (contained, internally tangent, concentric) does not read it. Since [ADR-702](06-decisions.md#adr-702)
(#2263) those rules ask the same reader through `nestedPairRadius` and return the owned `nested-pair-radius` refusal
(parts: the pair, then the radius phrase, the student's own words); `decideDeterministic2D` shows it in FR-IN-4g's
one-given-per-line frame (`input.scope.split-statements`) and the ✎ seam as `steps.editDropped` naming the phrase —
never escalated, because the model picked a circle for the number in silence. The consumers: `concentricCircles`,
`twoCirclesPosition` (the contained pair) and `circlesTangent` (internal; its #757 leftover guard now strips the phrase
for either kind, so the internal refusal is reached only once the rest of the sentence is read).

`withEqualRadii`'s consumers ([ADR-679](06-decisions.md#adr-679), #2186): `circlesTangent`, `twoCirclesPosition`,
`twoCirclesBare` (ADR-455), and `twoCirclesMeet` (all three branches), `circleCircleIntersection`, `commonTangent` (every
construction it returns). `concentricCircles` and `containedNewInExisting` do not read it — equal circles cannot share
a centre or nest. The net under every rule (and the LLM lane): `droppedWordRelations`' **equal-size member** — in a
two-circle context, or one circle noun with a plural size noun («מעגל מוכל ברדיוסים שווים»), an EQUAL_SIZE word or
the equal-circle noun phrase («מעגלים שווים», "equal circles") must land in a lowering that makes two radii equal
(`set-radius-ratio` k = 1, or two radii pinned at one value — `radiiMadeEqual`), or the gate reports «שווים» and the
line escalates.

Since [ADR-712](06-decisions.md#adr-712) (#2200) `twoCirclesBare`'s leftover strips the EQUAL_SIZE vocabulary it reads
(ADR-455's bare reading was dead code before), and an equal bare pair writes `admits: ['meet', 'disjoint']` on its
`set-circle-position any`: the **configuration set comes from what was stated** (M4). `admits` is the cases the
sentence leaves open, in variant order (absent = all three); `variantCountOf` returns its length and `apply.ts` seats
the default of the case the variant indexes, so «הציגו תצורה אחרת» on an equal pair cycles crossing ↔ apart and never
seats a "contained" pair it cannot be. A **contained pair stated equal is refused from the words** — a circle strictly
inside another is smaller: `twoCirclesPosition` (the contained branch, before `nestedPairRadius`) and
`containedNewInExisting` (after its subject test) return the owned `equal-circles-nested` clarify, which
`decideDeterministic2D` refuses as `input.equalCirclesNested.contained`, quoting the line, with one next step.

### A circle pair's tangency kind: stated or defaulted ([ADR-704](06-decisions.md#adr-704))

`circles-tangent.kindStated: false` marks a tangency whose line named no kind and inherited none (`circlesTangent`,
`namedTouchPoint`, `commonTangent`'s at-new-point branch): its `external: true` is only the default. The replay fold's
pre-scan (`tangentKind`, `replay/core.ts`, beside the other M4 pre-scans) resolves each such fact over the enabled list:
the first kind-stated `circles-tangent` on the same unordered pair, else internal when the pair carries a
`set-circle-position contained`, else the default. `lowerFact` lowers the resolved kind (the stored command never
changes, so the source of truth stays `(facts, seed)`), and the memo signature carries the map. The tangency record
(`requirementOf`) keeps `kindStated`, so the parser's `statedTangencies` inherits only a stated kind, while its touch
point and operand order come from the first record (ADR-703). The verifier's containment check is closed
(`d + r_b ≤ r_a + tol`) when the same pair is stated internally tangent, and strict otherwise.

The free-radius device encodes its KIND ([ADR-743](06-decisions.md#adr-743), #2339). External: the touch M on circle 1
toward circle 2's centre and a witness on circle 2 toward circle 1's centre. Internal: M on the outer circle (larger by
seed) toward the inner centre and a witness on the inner circle AWAY from the outer centre (`radial-toward` with
`away: true`), so the coincidence holds only at |c₁c₂| = r_out − r_in and never at an external touch. The witness id
carries the kind (`~touch-M-ext` / `~touch-M-int`), so a second line stating the other kind at the same touch point adds
its own device and the existing over-constrained path refuses it before commit; a restated kind (or an unkinded line
the fold resolves to the same kind) reuses the device.

### Which circle of a pair moves: the newer one ([ADR-742](06-decisions.md#adr-742))

Every circle-pair relation's apply-time seat (LADDER stage 2a) asks one chooser, `seatMover(objects, a, b)` in
`engine/apply.ts`: the mover is the circle created LATER in `objects` when its centre is a movable free point (not
pinned, not rigid), else the older one when its centre can move, else none (the solver and the verifier decide). The
seats that read it: the free-radius `circles-tangent` (the mover's centre is placed at the touching distance from the
anchor), `set-circle-position` (`contained`, `disjoint`, the unstated `any`), and the stated-crossing re-seat of
`circle-circle-intersection` (ADR-358). The command's slot order is the sentence's grammar and never decides which
circle moves. For `contained`, the radius re-seed follows the mover (a newer inner shrinks to `ra·0.45`, a newer
container grows to `rb/0.45`); an internal tangency whose radius seeds are equal re-seeds the mover's free seed by the
`0.55` split on the side the tie gives it (slot 1 is the outer circle), so the default is never two coincident circles. The free-radius tangency is carried by the
MOVER's own DOF only (M2 least ownership, ADR-281): its free radius if unclaimed, else its free centre; the anchor's
free radius only when the mover has none left. So «מעגל Q משיק למעגל O» · «מעגל Q משיק למעגל P» puts both tangencies
on Q (radius, then centre) and never moves or resizes O or P.

**Sampling a one-carrier tangency** (ADR-742 Am. 1). With one radius carrying the tangency, the other circle's free
radius stays a sampled DOF, so ADR-476's precondition clamp (`clampToPlacementPreconditions`, `engine/sample.ts`) has a
second clause, read off the `coincide` of two `radial-toward` witnesses: when exactly one circle's radius carries it
and the other's free radius is unconsumed, an external device caps that radius at `0.95·d` (the carrier is `d − r`),
and an internal device whose INNER circle carries it floors the outer radius at `d / 0.95` (the carrier is `r − d`); an
outer or centre carrier imposes nothing. A floor above a cap leaves the sample as drawn (the honest refusal).

### The common tangent at the touch ([ADR-740](06-decisions.md#adr-740))

`commonTangent` asks one resolver before its two-touch path, in this order: (a) a named «בנקודה X»; (b) the touch by
ROLE (`ROLE_TOUCH`: «(ה)עובר ב/דרך הנקודה המשותפת…», «בנקודה המשותפת…», «בנקודת ההשקה/המגע», "through/at the common
point", "at the touch/tangency/contact point"); (c) the line's own letters reach the touch — T is one of them, or both
exist and `ctx.collinearWith[T]` holds the pair. T comes from `statedTangencies`; Am. 5's deictic `circlePairTouches`
answers (b) only for a pair with no stated record that is drawn tangent. (b) with no touch, or with a kind the touch
tangent is not (internal for an externally tangent pair, external for an internally tangent one), is `'stop'`; (c)
then falls to the two-touch path. `collinearWith` is a semantic field: `collinear` / `collinear-order` constraints and
on-segment / on-line riders, never coordinates.

Every exit — (a), (b), (c) and the capacity overflow (Am. 7/8) — lowers through `touchTangent`: the stated touch's two
memberships, the drawn `tangent tan-T`, fresh letters as `lineMarkers`, and existing letters through T as the seat
record `common-tangent { a, b, circle1, circle2, at: T }` (a seated line drops the stated touch's memberships — the record
names both circles; (a) keeps its own). The record's apply arm makes each free letter (a free point, or one solved only by
the collinearity through T) an `on-line` rider of `tan-T` at its signed distance from T along the stated line (so the
radius ⟂ holds by construction at every sample), and re-seeds the circles' free radii at the drawn touch. A letter
something else places is not moved; the radius ⟂ (centre1·T ⟂ a·b) is then the plain statement (`driveOrCheck`). An `at` record has one configuration (`variantCountOf`), no kind and no
`avoid`, and is not a two-touch entry of `ctx.commonTangents`. The rule's creations of named circles carry
`implied: true`, so `impliedCircleBinding` names a drawn unnamed pair by them (ADR-347, ADR-565 d7).

The capacity exit calls `touchTangent` with `only` ([ADR-741](06-decisions.md#adr-741)): the tangent at T is then the only
common tangent the sentence can name, so two existing letters that are both in `ctx.freePoints` are seated by the same
`at` record even with no stated collinearity (`freeSeat`). A placed letter is not seated. Stage 0a″
(`commonTangentCapacityError`, `engine/radiusFeasibility.ts`) is the engine's half: a `common-tangent` without `at` over a
pair whose `circle-position` records state it internally tangent, externally tangent with kind internal, or contained is
refused before the solve; `tangentsExhaustedKey` (`i18n/humanizeError.ts`) gives it the parser's sentence.

**The whole set** ([ADR-751](06-decisions.md#adr-751)). `ALL_COMMON_TANGENTS` («כל המשיקים המשותפים», the definite plural with
no count word, "(all) the common tangents") is matched before the fixed-count `plural`, and only with no `at` or apex; a stated
kind narrows the set to that kind (#2447: the touch tangent is internal for an outside touch, external for an inside one;
an empty set is the position's `tangents-exhausted` clarify). `allCommonTangents` reads `ctx.statedPairPositions[pairKey]` — filled by `buildParseCtx` from the engine's
`statedCirclePosition(construction, c1, c2)` (`engine/requirements.ts`: a `circle-position` contained / tangent / disjoint
record, in that precedence, the tangent's kind from its first STATED record else external; else a `circle-circle` point of
the pair → crossing; else undefined) — and lowers the set: two-touch tangents by kind (apart: 2 external + 2 internal;
crossing and touching outside: 2 external), each the ordinary two-touch group with `kind` stated and the earlier touches
of its kind as `avoid`, plus `touchTangent(T, [], …, true)` when the pair touches. Prior members (`ctx.commonTangents` by
kind, `tan-T` in `ctx.lines`) are subtracted; none missing → the position's `tangents-exhausted` clarify. Letters: none →
`autoVertexLabels`; exactly two per missing two-touch tangent → in order; otherwise `'stop'`. An undefined position →
`ambiguous-construct` with the three statements that settle it (letters from `freeLabel`). `commonTangentCapacityError`
reads the same `statedCirclePosition`, so the parser's count and the engine's guard share one reader.

**Either order** ([ADR-752](06-decisions.md#adr-752)). Exit (c) reads only the lines typed before the tangent. The fold's
pre-pass `statedOnCommonTangents` (`src/replay/statedOnCommonTangents.ts`, called from `replay/core.ts` beside the ADR-704
and ADR-239 pre-scans) closes the other order: for each two-touch `common-tangent` record (no `at`) it collects the points
the OTHER enabled facts put on line AB (`set-collinear`, `set-line`, `point-on-segment`); when the pair's stated touch
(its `circles-tangent` `at`, kind resolved by ADR-704) is among them, `pinnedLowering` re-decides the record's group:
`tangent tan-T` on circle 1, each letter the group introduces a `point-on-line` marker at ±5 from T (the at-variant's
markers), an existing letter seated by the `at` record, the soft memberships and radius ⟂s retired, the segment kept.
Excluded (today's refusal stands): a stated kind that is not the touch tangent's, and a `tangent` at T already drawn.
The re-decision is part of the fold's pre-scan signature (`pin`), so a prefix memo is reused only when it agrees.

### The AI lane's context ([ADR-741](06-decisions.md#adr-741))

`llmParse` re-parses each canonical line through `parse(step, ctxFor(built))`, where `built` is the commands of the lines
before it, and builds no `ParseContext` itself (a source guard in `issue-2428-internal-pair-tangent-at-t.test.ts`). The
pipeline passes `laneContext(first, now)` (`src/app/laneContext.ts`): `first` is the context the deterministic path read
(`parseCtxNow()`, or the bound view's), so a line the model echoes decides exactly as the typed one; a later line gets
`buildParseCtx` of `replay(trialFacts(facts, built), seed)` with the store read after the model answered, memoised by the
built count. The trial is the same `trialFacts` the post-model dry run folds, so the context and the judged figure agree.

### A fixed-run rule consumes the whole label body ([ADR-601](06-decisions.md#adr-601))

`labelRun(body, n)` returns the first run of exactly n labels and nothing about the rest of the body, so a rule
whose operand is such a run therefore owes the ADR-024 leftover guard **at the run**: `unclaimedLabels(body, run,
also)` (`parse.ts`) strips the run and every other label the rule accounted for (the crossing it names, the circle's
centre, a through point); a non-empty answer returns `null`. The gates cannot backstop this because they exempt
existing labels (the gate arm is #1833). Members: `lineMeetsCircle`, `extendOntoCircle`, `lineCutsCircleTwice`,
`secantFarPoint`, and both spans of `circumcircleMeetsSegment`. `circleIsOnlyLocative(s)` is true when every circle
mention is a sentence-opening «ב+מעגל [O]», so the circle is the scene, not an operand (docs/17 §3).
`lineLineIntersection` reads with the En `FILLER` stripped. A locative that names its circle is accounted context
(rule 5 of `labelAccounting.ts`) only when the figure already holds what it says.

## The submit gate and `decideDeterministic`

### The pre-LLM decision ([ADR-546](06-decisions.md#adr-546))

Everything up to the model call — store operations, the pre-parse guards, the parse and its #186/#539 auto-binds,
every typed refusal, the scope register, the honesty battery, the dry run, the role re-readings, deferral and the
seam guards — is `decideDeterministic2D` in `app/decideDeterministic.ts`, a pure function of
`(facts, seed, view, utterance, locale)` returning a `Verdict2D` (store-op · refuse · commit · noop · escalate) with
its binds, log events and note. `runSubmit` applies the verdict and `log-triage` calls the same function; the mirror
test fails if `runSubmit` parses or refuses on its own, and the parity shards (`decide-parity-1395-*`) hold the corpus.

- **Two tips on one step** ([ADR-726](06-decisions.md#adr-726)): a commit's `note` is a chain — `DecideNote.also` is a
  second note shown after the first on the same line (`appendNote`; `runSubmit`'s `noteText` joins them). The
  Greek-letter suggestion (`latinAngleLetters`, once per letter against the figure's earlier commands) is appended
  to whatever ADR-428 note the step already has, never in its place.
- **An incircle 2-D does not draw** ([ADR-606](06-decisions.md#adr-606)): `incircle-not-drawn` → `refuse('guided')`,
  logged `incircle-not-drawn:<sides>` so log-triage counts the demand; never escalated.
- **An unresolved operand** ([ADR-571](06-decisions.md#adr-571)): a dry run failing in the topological evaluator
  answers `input.missingOperands` — the sentence and `missingOperandLetters`, the labels neither the figure nor the
  batch defines — or `input.unresolvedSentence`; internal ids never reach the student.
- **A word fraction or a wish** ([ADR-591](06-decisions.md#adr-591)): at the escalation seam
  `parser/fractionTeach.ts` (`fractionTeachCandidate`) proposes the canonical line (word fraction as `p/q`, a side
  resolved through `declaredPolygons` + `onSegment`/`midpointOf`); the decision proves it with
  `decideFromParse(…, { teaching: true })` and adopts it only on a non-deferred `commit`, as a `refuse` carrying
  `prefill` applied through `SubmitUi.setText`. #1358 hoists this seat into `shell/`.
- **Deferral reads the fold's per-fact verdict** ([ADR-564](06-decisions.md#adr-564)): `deferralWorthwhile` decides
  "waiting for givens" (ADR-104) vs refuse from the fold's per-fact classifier (`waits` in `computeFold`), recorded
  before atomic poisoning (`FoldNode.concludedByIndex` → `Derived.concluded`). A line with a concluded member is
  refused unless the figure has an unpinned right-angle seat (`unpinnedSeats`, shared with `seatRescue`; ADR-551
  Am. 1) — and even then it is refused when the dry run's seat sweep finished and cured nothing (`StepOutcome.seatsExhausted`,
  [ADR-584](06-decisions.md#adr-584), #1671). `seatSweep` is bounded by `SEAT_SWEEP_WORK_CAP` charged units; the
  worker warms the rotated folds first (`seatSweepWarmup`; a transplanted fold carries `FoldNode.work`).
- **The gate's budgets are work, never the clock** ([ADR-709](06-decisions.md#adr-709), #1857). After the seat
  sweep, the dry run's unstated-choice rescue (`choiceRescue(all, { workCap: choiceRescueConfig.cap })`) decides
  whether another variant / side / reflex assignment cures an erroring step; it runs under
  `CHOICE_RESCUE_WORK_CAP` charged units (`withWorkBudget`, every memo hit charged, ADR-582), so a line's verdict
  is the same cold and warm on every device. A fold the cap cuts ends the rescue uncured. `findValidConfig`'s
  variant tier keeps its wall-clock deadline (`{ deadline }`) — an interactive view search, ADR-558's split.

### A one-line compound is all or nothing: the clause-coverage gate ([ADR-598](06-decisions.md#adr-598))

`src/app/clauseCoverage.ts`, called from `decideFromParse` (`decideDeterministic.ts`):

- **Commit path** (`droppedClause`, after a clean honesty battery, before the dry run): the clauses from `clausesOf`
  (`independence.ts`, the one splitter) are each lowered alone in the figure's context plus the earlier clauses
  (`augmentParseCtx`). A clause is **covered** when a significant command of it (1) has a same-type whole-line
  command naming all its labels, (2) defines an object the whole line defines (same `id`) with a definition that
  names every label of the clause's command — the same carrier, never another incidence on the same point
  ([ADR-735](06-decisions.md#adr-735)), (3) only declares an
  existing object, or (4) is **entailed** — dry-run after the line, `empty` or `implied` (ADR-156 / ADR-542). An
  uncovered clause refuses the line, `guided`, with `input.scope.split-statements`.
- **Both seams** ([ADR-736](06-decisions.md#adr-736)): the commit-path check is one function, `clauseCoverageVerdict(utterance, cmds, ctx, facts, seed)` (the entailment dry run included), called by `decideFromParse` and by `runEditCommit` (`editPipeline.ts`, against the edited row's prefix; refused inline with `steps.editDropped`).
- **Weak path** (`compoundNotHonoured`, after an honesty gate fired): a compound whose every clause lowers alone is
  refused with the same message instead of escalating.

`clausesOf` cuts at punctuation (not a decimal point), the explicit connectives, and «ו» before a Hebrew word or a
label, never leaving a piece that only names points (a label run closed by «בהתאמה» / "respectively" is such a
piece, the closing half of a pairing: «AB ו-BC משיקים למעגל בנקודות A ו-C בהתאמה» is one clause, ADR-735), never cutting a
label list «O ו-P» whose right piece does not read alone («AB משיק משותף למעגלים O ו-P בנקודה X», ADR-735), and keeps
a subject-less piece with the clause before it when the two read as a statement. An incidence list is returned as
its distribution (`incidenceList`, the parser's own helper).

**A reference-only piece is the co-subject of the next** ([ADR-703](06-decisions.md#adr-703), #2209). Inside the
gate's reading (`readClauses`, never in `clausesOf`), a piece whose lowering only declares ids the figure already
has (`refersOnly`, the same test as coverage rule (3)) is re-joined to the next piece with the line's own separator
text, and the joined text is read as one clause, provided it reads. «מעגל O ומעגל P משיקים» on two drawn circles is
therefore one clause, and «מעגל P משיקים» is never read without its co-subject. On an empty figure «מעגל O»
declares a new id, so nothing is joined.

**Angle givens, relatives and joined subjects** ([ADR-730](06-decisions.md#adr-730), #2096). `SEPARATORS` also cuts at
«ו» before an angle sign («ו-∠», «ו-∢»), at «ו-» before a Hebrew word («ו-זווית»), and at the relatives «שבו» / «שבה»;
the connective and relative words are one list (`CLAUSE_CONNECTIVES` / `CLAUSE_RELATIVES`, `src/parser/scope.ts`) that
`splitGuidance`'s fallback cut also reads. That cut moves an angle marker («∠», «∢», «[ה]זווית») ending its head into
the tail, so the operand keeps its angle, and trims a connective left dangling on the head. ADR-460's commit-path
advisory is skipped when the line's subject is JOINED (`joinedSubject`, `clauseCoverage.ts`): a piece that only
declares objects, whose text through the next piece reads as a relation over them («מעגל O ומעגל P משיקים»).

#### A part the reading never read ([ADR-603](06-decisions.md#adr-603), [ADR-W-120](06w-decisions-workspace.md#adr-w-120))

The clause gate sees only the pieces `clausesOf` cuts, and every token gate counts a label read wherever a command
carries it, so «משולש ABC ישר זווית ב-B» and «…בנקודה E שהיא אמצע BD» committed with the part gone. The battery
member `unreadParts` (`src/app/unreadParts.ts`, in `honestyGateReport`, so both seams) MEASURES the reading:

- **The probe** (`shell/readExtent.ts` `readLabelRuns`): each label run has one letter at a time replaced (a letter of
  the line, else a fresh one on neither the line nor the figure) and the line re-read in the seam's context; a run no substitution
  changes was not read. Exempt: a co-reference (a single letter also read as a single-letter run) and a scene name
  (the run after a polygon or circle noun — `endsWithSceneNoun` — whose letters `referencedContextLabels` reads).
- **The parts** (`cutAtReading`): the clauses, each read alone in the figure plus the clauses before it; an offending
  clause is cut at the shortest word-boundary prefix that holds every read run and lowers byte-identically. A clause
  that has no cut alone (a statement the splitter cut in two, a fragment such as «ואת AB») is read with the clauses
  before it, as typed. A clause that reads alone and lost everything is listed whole. An unread run with read runs
  after it in its statement has no cut: the weak path.
- **The verdict** (`decideFromParse`, the `!gates.clean` branch, only when no older gate fired — `GateReport.onlyReadExtent`; otherwise the line keeps its weak path): parts → refuse `guided`,
  `scope:split-statements:unread-part`, never escalated. `lostPartNote` answers `input.scope.split-statements`;
  since [ADR-737](06-decisions.md#adr-737) it no longer picks `input.scope.right-angle-vertex` — "right-angled at X" is
  refused by its words before any reading (below), so the reading-decided branch was deleted.
  **One format, both keys** ([ADR-611](06-decisions.md#adr-611)): every part of the line is ONE numbered list from (1).
  The taught pair is items (1) and (2) — their nouns are localized vocabulary, so the locale string carries those two
  numbers and `{{more}}` continues the same list from `TAUGHT_LINES + 1`; the taught branch is taken only when the
  right-triangle clause OPENS the line, so nothing the student typed can precede item (1). The ✎ seam refuses with `steps.editDropped`, the lost parts as its items.

#### "Right-angled at X" is never a given ([ADR-737](06-decisions.md#adr-737))

The phrase is decided by its WORDS, at the parse boundary, before any rule reads the line. Two lexicon atoms,
`RIGHT_ANGLED` (the adjective: «ישר[הת]? [ה]זווית», `right[- ]?angled`, `right` before the triangle noun — never the
noun «זווית ישרה» / "right angle") and `AT_VERTEX` («ב-X», «בקודקוד X», "at [the] [vertex] X"), compose the recognizer
`rightAngledAtVertex` (`src/parser/scope.ts`): the adjective, then at most a triangle noun, a three-label run and a
copula, then the locative, in one clause; a non-triangle polygon noun before it («טרפז/מלבן ABCD …») is not its.
`parseResolved` asks `rightAngleVertexRefusal` FIRST and returns `{ reason: 'right-angle-vertex', triangle, angle, rest }`:
the triangle the line names, else the definite noun's (ADR-685's `definiteShapeVertices`; two or more is its
`ambiguous-definite-shape`), else the angle at X by the one lone-vertex resolver (`ambiguous-angle` for none or
several; one angle held by a figure triangle → that triangle; held by none → no triangle). Every caller of `parse` gets
the same answer: the submit seam refuses `guided` (`scope:right-angle-vertex`) with `rightAngleVertexNote`
(`src/app/unreadParts.ts` — the two lines, `rest` cut by `clausesOf` and numbered from (3); `suite.refusal.notUnderstood` with no
triangle); the ✎ seam shows the same note; the LLM lane's re-parse drops a model step carrying the phrase; the clause
readers see a clause that does not read.

#### Letters read out of English prose ([ADR-738](06-decisions.md#adr-738))

The battery member `latinProseLabels` (`src/parser/parse.ts`, in `honestyGateReport`, so both seams): a label the commands
reference is STATED when the student typed it as a capital (not the capital that merely starts a word), when the
figure has it, or when the line defines it by name (`definedLabels`: a shape's `ids`, a point's `id`/`id1`/`id2`, a
circle's `center`, a two-circle tangency's minted touch points; a compound object id such as `circle-O` is not a point label and `@`/`~` scaffolding never). One that is none of these, whose letter occurs in the line only inside a
lowercase Latin word, makes the line weak `dropped` (it escalates); the item is the word. The #779 teaching uses the
same criterion (`teachableLetters`): any run on an empty figure, else only letters that exist or the line defines —
`lowercaseLabelFold` (both seams and the LLM lane) and the failed-parse lift (`liftTeachable`).

#### A role word the reading never read ([ADR-604](06-decisions.md#adr-604))

The word sibling, `unreadRoles` (`src/app/unreadRoles.ts`, in the battery): each cevian role word (`CEVIAN_NOUNS_HE` /
`_EN` in `lexicon.ts`, composed into ADR-430's `CONSTRUCT_NOUNS`, plus `BISECT_KW`'s stem) is DELETED with its clitics
and the line re-read (`readWords`); a word whose deletion changes nothing was not read; the same role twice read
together is a co-reference. At submit, when only the read-extent members fired (`GateReport.onlyReadExtent`),
`lostRoleNote` teaches `input.scope.split-roles` — one line per role, the side from the lowering, every line proved to
parse in turn — else the parts cut before the later role word. Where an older gate fired too, the line keeps its
weak path (W21). The ⟂ verb row reads «אנך»; the existing-segment ⊥-bisector declares `VERB_PERPENDICULAR`.

#### A number the reading never read ([ADR-677](06-decisions.md#adr-677), [ADR-678](06-decisions.md#adr-678))

The number gate (`droppedGivenNumbers`, ADR-250 / ADR-437) accounts a stated number by VALUE, so any equal payload
used to pay for it — a default radius 5 for «ברדיוס 5», a line marker's ±5 for «ואורכו 5», an apex's free x = 12, the
k = 1 of «שווים» for «שווים ל-1». Two layers now:

- **The accountant skips seeds** (ADR-677): the walk over the commands' payloads leaves out every field
  `seedFields(cmd)` (`src/engine/types.ts`, beside the command kinds) declares — a `circle`'s `radius` when
  `freeRadius`, a `free-point`'s `x`/`y` when `free`, a `point-on-line` marker's `offset`, a free `point-on-circle`'s
  `theta`. A DOF's starting value is not a given. The LLM lane's second attempt uses the same accountant, so it has
  this too. A new free-DOF command kind declares its seeds there.
- **The number class of the read-extent probe** (ADR-678): `unreadNumbers` (`src/app/unreadNumbers.ts`, in
  `honestyGateReport`, so both seams) runs only when the accountant found nothing. Each number the gate's own scanner
  sees (`statedNumberOccurrences` — `statedNumberText` blanks counts and name indices, the scan `droppedGivenNumbers`
  itself uses) is replaced by a same-kind value not in the line (`shell/readExtent.ts` `readNumbers`: the next free
  integer, a decimal keeping its places) and the line re-read in the seam's context; an occurrence whose replacement
  leaves the lowering identical was not read, and its value joins `droppedNums` — the verdict is the one the same line
  with an unaccounted number gets (`escalate`, `weak: dropped`; the ✎ seam's `steps.editDropped`). It closes the
  structural-constant member no field predicate can foresee. Cost: one parse per stated number on lines every older
  number check passed.

#### A fraction is paid whole, and «p ל-q» is one pair ([ADR-700](06-decisions.md#adr-700))

- **Fraction parts** (the 2-D port of ADR-3D-340 §4): the gate's radical-aware pass accounts a `TERM / TERM`
  occurrence by its value, or by its numerator AND denominator together (one of each spent, `okPair`); a lone radical
  (`√2`, `5√2`, `√(2/3)`) by its value only. One part never pays for the whole, and the implied `/1` is no candidate.
- **The ratio pair atom** `RATIO_SEP` (`src/parser/lexicon.ts`: «:» or «ל-?») has three consumers: the similarity
  reader (`statedSimilarityRatio`, `RATIO_PQ`, value p/q), the gate's pair pass and the span accountant's colon pass.
  A «ל» pair is claimed whole only when a ratio account pays for it (it is also the "to" of a range); a colon pair is
  claimed always, as before. The divider keeps the colon-only `RATPQ`.

#### An unread item is named ONCE, on every seam ([ADR-627](06-decisions.md#adr-627))

The battery is a SUPERSET of overlapping gates by design — the label gate and the span accountant both account a
label, and the accountant reports one span per OCCURRENCE — so the gate outputs concatenate to a list that repeats a
name. `unreadItems(...lists)` (`src/app/honestyGates.ts`) is the one merge that list is assembled through: each item
stringified, blanks dropped, the first occurrence kept, the order of distinct items untouched. `honestyGateReport`
builds `items` with it (so the ✎ seam's `steps.editDropped` is merged), and the **AI second attempt** in
`submitPipeline.ts` — which runs its own deliberate superset (`droppedRadiusSymbol`, `droppedRegionSubject`,
`droppedMidsegment`) and so cannot take `items` — builds `stillDropped` with the same function, for both
`input.labelsDropped` and the `dropped-labels:` debug line. A gate added to either seam is merged the day it is
written. The other name lists are Set-built and were never members: `introducedNewLabels` (`input.labelsInvented`)
and `missingOperandLetters` (`input.missingOperands`).

### A ring over placed points that crosses everywhere is refused before the dry run ([ADR-608](06-decisions.md#adr-608))

`forcedCrossedRing` (`replay/core.ts`, beside `impliedByPrior`) is called from `decideFromParse` (after the
clause-coverage gate, before the prefold and the first `dryRunOutcome`) and from `runEditCommit` (beside
`impliedByPrior`, against the prefix facts). It reads the rings the line declares — `declaredRings(cmd)`, which since
[ADR-616](06-decisions.md#adr-616) includes a top-level `polygon` of 4 or more ids — keeps those whose every vertex is already placed, drops any that is simple in
the figure on screen (one test, no pool), and asks the prior figure's `sharedSamples` pool (the UI-thread narrow
gate, as `impliedByPrior`) whether the ring **properly** crosses in every sample: two non-adjacent sides meeting at a
point interior to both, with a tolerance relative to the ring's extent (a touching vertex is not a crossing, unlike
`ringSimple`). The floor is `forcedCrossingKeys`'s: a determined pool, or at least 4 samples. Reading the prior pool
is sound because the line's own constraints only narrow the configurations. A hit refuses `conflict`, log
`ring-contradicts-noun`, note `input.ringContradictsNoun` with `detail` = the line (analytic's
`errRingContradictsNoun` text, verbatim), and never escalates; it precedes ADR-157's redefinition refusal. The test
helper `gateVerdict` mirrors it (reason `crossed-ring`). The predicate is 2-D's own: `BOUNDARIES.json` keeps engine
layers `copied-never-shared`.

**Search first, refuse last** ([ADR-613](06-decisions.md#adr-613), the operator's ruling of 2026-10-09). The prior pool
is filtered by `meetsRequirements`, and so by FR-EN-16's convexity DEFAULT. A second declared ring over some of a
ring's points in another order is a statement that default yields to (points in convex position have one simple
order), so `convexityYields(facts)` names every declared ring that another declared ring re-orders, and
`polygonsConvex` holds those to simplicity only — the stated-concave rule of #441. A stated «קמור» never yields. When
the ring the line declares would make such a ring yield, the prior pool never held that branch, so `forcedCrossedRing`
asks `findValidConfig` of the trial facts before refusing; a configuration found there commits, and the post-commit
search draws it («דלתון ABCD · מרובע ABDC» → the dart). A square, rectangle, rhombus, parallelogram or trapezoid is
convex whenever simple, so the search finds nothing for them in a few milliseconds and the refusal stands.

A yielded default also needs a yielded SEAT ([ADR-622](06-decisions.md#adr-622), #1987). The quadrilateral macro
seats its four free vertices convex and the seed jitter almost never leaves convex position (2 of 200 raw seeds), so
for a FREE quadrilateral the search above had nothing new to try and the refusal stood — the kite row was carried by
the reflection tier, which only exists because a kite apex is tied to anchors by equalities. Which vertex is the
REFLEX one is therefore registered as a configuration axis of its own: `reflexAxes` (the `reflex` kind of the #1600
`configurationAxes` registry) offers, for every `quadrilateral` fact whose ring `convexityYields` names, the convex
seat plus one digit per vertex; `quadrilateral.reflex` carries the digit (the `right-triangle.rot` shape — internal,
never a step row) and `seatReflexVertex` (`engine/apply.ts`) seats that vertex at the centroid of the others, the
canonical point strictly inside their hull. Four points not in convex position have THREE simple rings, not one, so
one interior vertex makes every declared order simple at once. `choiceRescue` steps the axis alongside `variant` and
`side`, so the post-commit search and «הציגו תצורה אחרת» reach the same drawings; a fact that still carries a
`reflex` keeps its axis after the second ring is deleted, so the search can put the figure back.
### What counts as "produced": a display-only command declares itself (#1011, [ADR-519](06-decisions.md#adr-519))

`dryRunOutcome` asks whether a line did anything — the construction grew, a DOF went, the scale was fixed, a point
moved — and otherwise answers «זה כבר קיים באיור» without committing. A display-only command (revealing a hidden
centre, resolving a hidden circle, a valueless angle arc) moves none of those signals, so membership is declared:
`DISPLAY_ONLY` in `engine/types.ts`, typed against `AnyCommand['type']`. An exact restatement is excluded (as
`dataOnly` excludes one), and a display command must leave `freeDofCount` and the constraint list unchanged. The
lock tests at `dryRunOutcome`, the gate the app calls.

The «כבר קיים» arm ahead of the change-signals (`impliedByPrior`, ADR-542) asks whether every added constraint holds
in every configuration of the prior figure. Since [ADR-605](06-decisions.md#adr-605) (#1922) that includes the other
answers of the tool's unstated choices the shared pool does not vary — `choiceAlternatives`: the registry's
branch/side/seat rewrites when the pool is not `determined`, and each open trapezoid parallel pair as the facts with
the other pair stated. Each alternative is replayed at the current seed, skipped if it fails `meetsRequirements`, and
a failing residual makes the line not implied. Only a line the pool already judged implied pays for it; over the
registry cap, past the clock or on a throw it fails open.

### One fold rule: the dry run judges the list the commit saves ([ADR-578](06-decisions.md#adr-578))

`foldCommand` (`replay/core.ts`) decides how one command enters the fact list: an exact duplicate of an enabled fact
is a no-op, of an unticked fact re-enables it, a re-stated free point moves in place, a circle statement that states
no size (`freeRadius` / `ifAbsent`) over a circle an enabled fact defines is a **reference** and changes nothing
(`referencesCircle` in `engine/lower.ts`, read over the named list; apply's `circle` case reads the same predicate —
[ADR-646](06-decisions.md#adr-646), #2083), a re-stated standalone circle with a stated radius resizes in place,
anything else appends. The commit (`foldFact`) and the dry run (`trialFacts`) fold through it, and
the dry run judges `trialChanges` (by object identity), never `all.slice(facts.length)`; a second copy of the rule
is the ADR-320 class. The load refresh
and audit compare `committedStepCommands(prefix, …)` on both sides and write refreshed steps as those rows
([ADR-579](06-decisions.md#adr-579), #1604); `fixtures.test.ts` asks the same. A **new** differently spelled
statement over an unticked row's letters is refused naming that row (`errors.mutedRowOwns`, ADR-010) — the row and the
action only, never the points the row holds: the humaniser matches the engine's point list and drops it ([ADR-667](06-decisions.md#adr-667)) — and that
reservation is a commit-seam rule only: `mutedRowHolding` answers it for `dryRunOutcome`, over the trial list
(an identical re-type sees its own twin enabled) and only for rows unticked above the step's own facts, with
letters already on the figure free. The fold reserves nothing ([ADR-625](06-decisions.md#adr-625), #1952): an
unticked row drops only its own objects, so a row below it that defines the letters itself keeps building,
exactly as deleting the row leaves it building. The cascade muting must produce (ADR-015) arrives through the
row's own red riders, which claim what they define (`introducedDefinedPointIds`).

### Re-reading a role-assigned letter run ([ADR-521](06-decisions.md#adr-521))

Between the dry run and the refusal, the decision (`app/decideDeterministic.ts`) asks `app/roleReadings.ts` what
else the letter run could mean, by **rewriting the utterance** and re-parsing it, so no rule grows a second
convention and the alternative is a sentence the student could type. It keys off the `arc` a construct emits,
covering the family (`רבע מעגל`, `גזרה`). `roleReadings` returns `null` with no role run; readings are ordered by a
probe of the construct's pinned central angle over configurations already sampled, so a reading that builds costs
one dry run. `produced` is not the adoption test: `honoursConstruct` checks equal radii and the pinned angle.

**A semicircle through three vertices** ([ADR-589](06-decisions.md#adr-589)) is decided before the first dry run:
the `semicircle` rule reads all three ON it (a `point-on-circle` for the third), and `thalesReadings` rewrites the
run to «חצי מעגל שקוטרו XY העובר דרך Z» for each side, ordered by Thales' probe and tried best first under the
role-reading cap; `honoursConstruct` also checks every other `point-on-circle` of the circle. An explicit diameter
is never re-read.

### The submit transaction: facts commit, the seed resolves after (#364, [ADR-510](06-decisions.md#adr-510))

- **The commit** (`commitCommands` / `replaceGroup`, `store/geoStore.ts`) is the facts alone, in one zundo entry, at
  the current seed (an ✎ edit resets to 0 first, ADR-484); no seed search runs inside it
  (`main-thread-sweeps.test.ts` records `firstSatisfyingSeed` at 0).
- **The resolve** is `resolveAfterCommit` (App) → `runViewResolve` (`app/resolveView.ts`) → `geoWork.autoResolve`
  (the worker): `meetsRequirements` decides whether anything is wrong, and `findValidConfig(facts, seed)` sweeps
  from the current seed (M2). The found view merges into the commit's history entry, so one undo removes both.
- The violating configuration may paint for one frame before the answer lands (operator-accepted); the keep-prior
  slot (#573) holds the last good view meanwhile.

#### The commit-seam inventory ([ADR-522](06-decisions.md#adr-522))

Every store action that resets the seed decides whether to launch the post-commit search; the table is asserted in
`issue-1041-edit-resolve.test.ts`:

| action | what it does | search |
| --- | --- | --- |
| `commitCommands` | a statement is added | yes — `submitPipeline` |
| `replaceGroup` | a statement is replaced | yes — `runEditCommit` (#1041) |
| `setGroupEnabled` | a group's tick flips | yes — `runSetGroupEnabled` (#1133) |
| `toggle` | one fact's tick flips | yes — `runToggleFact` (no UI caller yet) |
| `remove` | one fact is deleted | yes — `runRemoveFact` (a partial group can strand) |
| `removeGroup` | a whole statement is deleted | **exempt**, measured (ADR-518) |

A seam that adds a requirement back searches; one that only relaxes need not.

### The dev step-through panel ([ADR-581](06-decisions.md#adr-581))

A DEV-only panel over `validation/replaySession.ts`, opened with `?steps` (`http://localhost:5173/?steps`): it
replays a pasted utterance list through the real `parse → dryRun → commit → replay` path, lists each step's
category, and draws the figure as of any step; "Load into the builder" loads that step's facts and seed. The harness
reports `factsAfter[k]`; `figureAtStep` re-derives the figure with the `(facts, seed) → figure` model; the panel only
reads `replaySession`. `main.tsx` mounts it under `import.meta.env.DEV`, which production folds to `false`.

## Fold and replay

### The within-segment gate and its structural exemption (#944, [ADR-489](06-decisions.md#adr-489))

`intersectionsWithinSegments` catches a crossing that wandered off its segment (a wrong configuration the
reflection sampler fixes). When the two carriers share a vertex the crossing can only be that vertex, so
`shareEndpoint` exempts it structurally — a wider `WITHIN_MARGIN` would re-admit #569's near-collapse basin. The
gate, `segmentsCrossWithin` (ADR-383) and `reflectMaskForFailing` all take the exemption.

### A variable statement waits for its letter ([ADR-562](06-decisions.md#adr-562))

`isVariableStatement` (`set-var`, `measure-bound`, `measure-order`) and `unboundSubjectOf` (`engine/lower.ts`) let
the fold stamp any variable statement whose letter nothing binds into the waiting register; `classify` counts it
pending and `dryRunOutcome` commits it as data. A bound-but-unfollowable relation (`unenforceableRelation`) errors
and is refused at submit; `lowerOne` scales a bound by a positive linear coefficient. `factsWaitingForLetter` is
read by `meetsRequirements` (a waiting row fails no view) and by the step list (⧗ waiting).

### A side named by its role follows the configuration ([ADR-596](06-decisions.md#adr-596))

`roleSideLine` (ADR-465) resolves «הבסיס» / «השוק» / «היתר» at the configuration showing, and its commands carry
`roleSide: { role, ring, at }` (optional on `AnyCommand`, like `consumed`; the engine ignores it) — `ring` the
triangle, `at` its apex or right-angle vertex — unless the sentence names a vertex. `roleSidesOf(construction)`
(`src/engine/roleSides.ts`) is the one definition of the roles; the fold's `boundCmdsOf` passes each role-bound
command through `resolveRoleSide` against the construction at that fact's apply: same vertex → unchanged; one other →
the letters rotate along the ring; several, none the bound one → unchanged; none → the fact waits. The theorem context and the rename core follow the binding.

**Only a stated right angle makes a hypotenuse ([ADR-639](06-decisions.md#adr-639)).** `roleSidesOf` reads the
hypotenuse off a ⟂ / 90° constraint at a triangle vertex that a STATEMENT lowered; the right-triangle macro's own
right angle — its perp-offset (`anchor === from`, which no other build makes) and, in the shared-hypotenuse build,
its ⟂ marked `seat: true` — is the noun's default seat and is skipped. `openRightTriangles(construction)` lists the
triangles that carry such a seat and no stated right angle; `buildParseCtx` carries it as
`ParseContext.openRightTriangles`. Letters after the noun naming one of its sides are the rewrite's, and the role claim (ADR-563) states the right
angle opposite them.

**The noun's seat is an unstated hypotenuse a statement may bind to ([ADR-659](06-decisions.md#adr-659), #2074; reverses
ADR-639's question).** For an open triangle `roleSidesOf` also yields the hypotenuse at the noun's EFFECTIVE seat (the
perp-offset's anchor or the `seat` ⟂'s corner, after any reseat or `rot`), marked `unstated: true`. `roleSideLine`
never lets typed letters SELECT it (a stated `cands` list excludes it) and reads an open triangle three ways: no ring
letter typed (the noun alone, or a foot outside the ring) → the commands BIND to the unstated entry, and the fold's
`resolveRoleSide` rotates them with `rot` as it rotates the isosceles base with its apex; exactly one ring vertex
typed («CM תיכון ליתר», «גובה ליתר מ-C») → the cevian to the opposite side plus `set-angle` 90° at that vertex,
unbound (the claim «תיכון ליתר AB» states); more than one host (another right triangle, open or stated) →
`role-side-unresolved`. `ambiguous-hypotenuse` is left only for a pair after the noun that is no side of the
triangle («תיכון ליתר AD»). The Thales reader keeps reading only a STATED hypotenuse.

**A role stated about typed letters is a claim, in every spelling ([ADR-708](06-decisions.md#adr-708), #1839).** Typed
letters stay literal (no binding), and the sentence also states its role through one lowering, `isoscelesRoleClaim`
(`parser/parse.ts`): a base → the equality making the opposite vertex the apex (ADR-563's claim, which pins the
variant, ADR-138); a leg → the requirement record `set-side-role { role: 'leg', a, b, ids }` when the apex shown is
one of its ends, else the `leg-apex` question. Its callers: `withRoleClaims` («לבסיס BC», «לשוק AC»);
`roleSideLine` when ONE ring vertex is typed with an unlettered base / leg («AD גובה לבסיס», «BE גובה לשוק» — the
side is the one opposite the typed apex); `withApexAngleClaim` («זווית הראש» / "apex angle" with a winning
`bisector` at a vertex of an isosceles-declared triangle). The leg requirement is ADR-244's shape: `applyCommand`
records nothing, `checkGivens` flags a construction whose declared roles (`roleSidesOf`) make the pair the base
and not a leg (`figure.v.legIsBase`), and `meetsRequirements` keeps every configuration search off that variant.

### A stated side is a requirement record, checked at stage 0g′ and read wherever a point is placed ([ADR-549](06-decisions.md#adr-549), [ADR-594](06-decisions.md#adr-594))

- **Record.** `Construction.requirements?: SideRequirement[]` (`engine/types.ts`): `circle-side`, `polygon-side`,
  `line-side`, and `circle-position` ([ADR-567](06-decisions.md#adr-567), #1709: stated containment or
  disjointness, `set-circle-position`), which `autosInterchangeable` reads. `recordRequirement`
  (`engine/requirements.ts`) is the one definition of which commands state a side, called by `applyCommand` and by
  `applyStep` / `applyCoupledStep`'s `withRequirements` stamp, so a record survives every ladder rebuild.
- **Prover.** `sideImpossibility(probed, cmd)` (`engine/sideFeasibility.ts`) at stage 0g′ and in
  `constraintIsPending`, structural: what a point is (rider, crossing, midpoint, foot, vertex), a circle's defining
  points, `coincide` classes, M1 constraints (`length-radius`, `|OE| = r`, an `equal` radius pair, `collinear` /
  `collinear-order`); the incoming claim is read off an empty-construction probe (the `introducedPointIds` idiom),
  so `point-on-segment` on an existing id is seen.
- **Message.** `impossible: «X» contradicts «Y»`, new statement first, rendered by `errors.boundImpossible`; the
  side words (`on circle`, `outside triangle`, `on different sides of`) are translated by `STATEMENT_WORDS`
  (`i18n/humanizeError.ts`, `errors.stmt.*`).
- **Strict outside** (#1487): `pointOutsidePolygon(p, verts, margin)` (`engine/geometry.ts`), used by the
  verifier and apply's seeding. `regionSideFallback` parses a region's own vertex so the prover can refuse it.
- **Read wherever a point is placed** (#1739): `sideShortfall(req, positions, circles, aim)`
  (`engine/requirements.ts`, 0 iff `sideHolds`, which `checkGivens` calls) steers the 1-D root pick, a retry-only
  rung of both driven solvers, the sampler's `seatStatedSides` in `applySeed`, and the knowledge pool
  (`sideSamples`). `FreePoint.region` (ADR-511) is retired.

### The meeting re-seat is routed by a predicate (#260, [ADR-512](06-decisions.md#adr-512))

`meetingCarriers(objects, cmd)` (`engine/apply.ts`) decides whether a command asserts a point is the meeting of two
carriers — `onSeg`, `segments-cross`, or a `set-collinear` whose rider is named onto a second host. `applyCommand`
asks it before its switch and calls `reseatLooseMeetEndpoint` (ADR-255); a new member is a row in the predicate.
The endpoint moved is a non-pinned, unreferenced, undriven free point, fewest dependents first, aimed through the
other carrier's midpoint in general position and on the same side of every circle (ADR-253/254).

**Bare points and a flattened ring ([ADR-660](06-decisions.md#adr-660), #1934).** Every bare «נקודה X» hands the canned
spot (3, 2). When that spot sits on an existing point, the `free-point` arm probes around the existing points'
CENTROID at their span (a centre that is no point, so the general-position line test is defined), preferring a
candidate that keeps the points in convex position in the order placed (`convexInOrder`), else any general-position
one; the first two points keep their places. A declared polygon that a step's solution still flattens, with UNSTATED
free vertices (no constraint, no directive, not pinned), tries the sampler's positions for those vertices before the
refusal (`freeVertexRestart`, LADDER 2h″); forced flatness is refused earlier (0h) and incidence-forced flatness
finds no start.
`reinterpretAsCollinear` (step.ts) passes previous positions into `applyCommand`.

### A declared polygon the givens force flat is refused (#1849, [ADR-602](06-decisions.md#adr-602))

The line completing the collapse is refused before it becomes a fact ([ADR-W-115](06w-decisions-workspace.md#adr-w-115)
amends ADR-W-048).

- **The proof** — stage 0h, `forcedFlatPolygon` (`engine/metricFeasibility.ts`): linear length statements are rows
  in the unknowns |PQ|; a straightness equality follows when its row lies in the row space of [A | b]; proven
  collinear sets sharing two points merge; a polygon inside one is flat in every configuration. **The
  observation** — stage 2d, the accept gate's `collapsedPolygon`, floor `DEGENERATE_EXTENT_RATIO` (5e-4).
- **One message**, `collapsed: polygon A, B, C would be flat — <statement> cannot hold`, from both seams; the fold
  reads the declaring statement from `ownerByObjId` and appends `[vs #i]`, resolved by `otherUtteranceForError`.
- **Defaults yield**: a collapse only an unstated default forces is cured by the variant rescue (ADR-573).
- **Two more members, one gate** ([ADR-643](06-decisions.md#adr-643), #2064 / #2085). The accept gate asks
  `polygonDefects` (`engine/degeneracy.ts`) instead of the flatness ruler alone, in the order a figure degenerates:
  `collapsedToPoint` (B1 — every vertex within `LEN_EPS`, the ADR-123 coincidence floor; the scale-free ruler reads
  a ring 1e-8 across as healthy), then flat, then `straightCorner` (B2 — a 4+-gon corner whose |sin| is below
  `DEGENERATE_EXTENT_RATIO`, 180° and 0° alike). A rejecting accept routes into the failure ladder, which hunts a
  real configuration first. Wording: a point collapse whose step M1-lowered a derived point over one of the ring's
  vertices (`coincide` with a `~` helper) is `commandConflict`'s own `'B' is already defined…` («B כבר מוגדרת…»);
  a stage that found the ring genuinely flat keeps ADR-602's text; a straight corner is `… would be flat at B, C, D
  …` — the quadrilateral's existing flat sentence with the triple as its points, and for n ≥ 5
  `errors.polygonCornerStraight` (the n-gon would become an (n−1)-gon, nouns from `errors.ngonDefinite` /
  `errors.ngonIndefinite`). The corner wire form carries no `[vs #i]` (`COLLAPSED_VS` does not read it), so the
  student reads the ruled «עם «…»» sentence.

### A diagonal called a height of a shape whose diagonals are perpendicular to no side (#2117, [ADR-718](06-decisions.md#adr-718))

- **The table** — `DIAGONAL_NEVER_PERPENDICULAR` (`engine/shapeKinds.ts`): every quadrilateral kind that implies `rectangle`
  or `rhombus` in the shared lattice (square, rectangle, rhombus). A diagonal of any of them makes an angle strictly
  inside (0°, 90°) with every side.
- **The proof** — stage 0, `diagonalHeightImpossibility` (`engine/heightFeasibility.ts`): an `altitude-choice` (ADR-644)
  every option of which is a diagonal of a ring declared a table kind against an edge of that ring. Called by the fold
  (`replay/core.ts`, the in-order pass and the ADR-104 retry) on the FACT's command, because `applyStep` sees only the
  selected option's lowering; a hit is filed rigid (never pending).
- **One message**, `over-constrained: diagonal AC of square ABCD is perpendicular to no side cannot hold`; the fold
  tags `[vs #i]` with the ring's declaring statement (`ownerByObjId`, ADR-602's provenance); humanised as
  `errors.overConstrained` with the nested reason `errors.diagonalNoSideReason` (`shape` from `input.shapeNounDefinite`).

### A circle through three points the givens put on one line is refused (#2099, [ADR-651](06-decisions.md#adr-651))

- **The proof** — stage 0g‴, `collinearCircleImpossibility` (`engine/cyclicFeasibility.ts`): for every `circumcenter`
  centre in the probed figure (plus the incoming command's asserted objects), `threeOnOneLine` (`engine/structure.ts`)
  asks whether one named line carries all three points by what the construction says — an endpoint, a rider, a
  midpoint, a crossing, a lowered collinearity (`Structure.onLineBy`, which also returns the witness) — over the
  candidate lines `carryingLines` and the stated collinearities name; failing that, ADR-602's `forcedFlatPolygon` is
  asked about the three points as a ring (the length givens). Only a circle that is NEW-degenerate with this step is
  refused. Run by `applyStep`, `applyCoupledStep` and `constraintIsPending`.
- **One message**, `over-constrained: a circle through A, D, B on one line cannot hold`: the over-constrained wire
  family, so the fold's drop-one search (ADR-508/554) appends `[vs #i]`; humanised as `errors.overConstrained` with the
  nested reason `errors.collinearCircleReason` (letters interpolated as-is, the `letters` field of `nested`).
- **The backstop** — `circumcenter` (`engine/geometry.ts`) answers null below a scale-free flatness
  (`CIRCUMCIRCLE_FLATNESS_FLOOR` = 1e-6), replacing the absolute `|d| < 1e-12`; its evaluator message
  (`cannot construct O: A, D, B are collinear …`) renders the same reason in the `_said` frame.

### A declared polygon the givens force FLAT is said out loud (#945, [ADR-513](06-decisions.md#adr-513))

The net below ADR-602, for a polygon not forced flat but drawn below the floor at a sampled configuration.
`Derived.degeneracies` (`replay/core.ts`), beside `coincidences` and `forcedOffArc`, is derived on every replay and
shown as an ⓘ notice. `degeneratePolygons` (`engine/degeneracy.ts`) measures each declared polygon's greatest vertex
offset from the line through its two most-separated vertices, over that separation (the ADR-413 accept gate's
measure), against `DEGENERATE_EXTENT_RATIO`. `nameDegeneracies` walks the statement prefixes (the ADR-492 rule) for the declaring and
responsible statements; the wording is `figure.degenerate`.

### A declared ring the givens force NARROWER is said (#1996, [ADR-655](06-decisions.md#adr-655), [ADR-W-129](06w-decisions-workspace.md#adr-w-129))

A derived layer of the always-on detect sweep, not of replay: `detectAll(facts, nouns)` returns `narrowed`
(`replay/narrowing.ts` over `shell/narrowing.ts`). `nouns` is each row's noun as typed, read in the STORE layer
(`store/rowNouns.ts`, the parser's `readShapePhrase` on the row's utterance) because replay may not import the parser;
`geoWork.detect` carries it to the worker. Per declared ring: `ringKinds` on every sample of the shared pool (a complete
pool only), `forcedUnder` the declared kind, `narrowingOf`; then the cause, over per-subset pools (`sampleSubset` —
the shared memo saved and restored; a "not forced" subset settled by its first strict counterexample). Memoized on the
fold key. The store keeps `narrowed: { list, facts }` beside `determinacy`; App.tsx renders it in the ⓘ strip through
`app/narrowingText.ts` and the `figure.narrowed.*` keys.

## The knowledge pool

### The knowledge pool of a DETERMINED figure is its admissible set (#434, [ADR-509](06-decisions.md#adr-509))

The relations layer's definite values, the values panel and the forced crossing dots read one shared pool
(`samplingJobs` / `sharedSamples`, `replay/core.ts` — M3's one sampler).

- **Under-determined (count > 0):** every shape-variant config × 16 seeds through the validity ladder; ≥ 4 valid
  samples before a number prints (ADR-295, #88).
- **Determined (`freeDofCount === 0`, one variant):** a count can lie (the ADR-424 class) and a seed never reaches a branch or a seat, so the pool is the **admissible set** — the current facts at every seed
  «הציגו תצורה אחרת» resamples (`CONFIG_SEEDS` = 24, [ADR-558](06-decisions.md#adr-558), #1599) plus seeds
  {s, s+1, s+2} × every discrete rewrite (`admissibleRewrites`), kept where `meetsRequirements` holds; the
  `inscribe` variant stays out (ADR-262).
- **Bounded, failing CLOSED.** Over `ADMISSIBLE_REWRITE_CAP`, or when the work cap (`POOL_WORK_CAP` `evaluateCore`
  calls) cuts the enumeration, the pool is **not determined** with `complete: false`, and the gates fall back to
  the ≥ 4 floor.
- **The gates trust a measurement, not the count:** `determined` (count 0 and complete) passes to
  `detectRelationsAcross` (`opts.determined`), `computeValuesPanel` and `forcedCrossingKeys`.
- **Work is a function of the input** ([ADR-582](06-decisions.md#adr-582), #1605): every memo entry (replay cache,
  fold memo, drop-one memo, the `evaluate` / `resolveDriven` / DOF memos) carries a work ledger
  (`engine/solveBudget.ts`), charged once per work epoch (the `sharedSamples` call), cold or warm; a budget-cut
  computation is never memoized. The UI-thread «כבר קיים» test (`impliedByPrior`) keeps its fail-open wall-clock
  bound (`sharedSamples(facts, { deadlineMs })`) on three seeds. The pool is memoized whether complete or not;
  while values compute, an asked row reads `waitingNote`.
- **The status cue reads the same pool** (#1444, [ADR-556](06-decisions.md#adr-556)): `figureDeterminacy`
  (`replay/core.ts`) returns `determined`, the number of distinct shapes (pairwise distances equal up to one
  scale), and `stable` (every sampled seed, via `seedOfSample` and the `circlesOfSample` discipline, sees that
  number). It rides `detectAll` into the store's `determinacy` slot (facts-keyed, like `crossings`), and
  `figureStatus` (`app/figureStatus.ts`) maps it to the status line (FR-ALT-6). The values panel reads the same
  `complete` flag.
- **The values panel's one value gate** ([ADR-634](06-decisions.md#adr-634), #1867): every row and every question in
  `computeValuesPanel` asks `optionsOf` — one value when the pool agrees; the quantity's TWO values (classified by
  `shell/valueOptions`, at `REL_TOL`) when the pool is `determined` and `complete` and each value is seen at two
  or more seeds (`computeValues` passes `seedOfSample` per sample); nothing otherwise. Not `stable`: that stays the
  condition for a configuration COUNT. A row carries the second value in `or`, or `pm` for opposites; `MathValues`
  (`render/MathValue.tsx`) typesets «±v» or «a או label = b», and `valueText(row, words)` is the text twin.

## The configuration registry and searches

### One registry of unstated discrete choices ([ADR-593](06-decisions.md#adr-593))

An unstated discrete choice is reachable by «הציגו תצורה אחרת», counted by the status line and judged by the values
panel only if registered in `configurationAxes(facts, construction)` (`replay/core.ts`). Each axis is
`{ kind, i, n, cur, set(cmd, digit) }`; kinds in odometer order (first turns fastest):

| Kind | Where it comes from | Stored as |
|---|---|---|
| `branch` | every `cyclableBranch` point, counted by `branchCount` | `branch` on the crossing's fact |
| `side` | the construction's `sideChoices` (LADDER stage 2c) | `edgeSide: 'toward'` on the composing fact |
| `variant` | `variantAxes` (ADR-573) | `variant` (via `withVariant`) |
| `seat` | `cyclableSeat` (ADR-481) | `rot` on the right triangle |

Consumers: `searchAnotherView` walks one odometer over every axis (step k advances by k, at most 63 steps per
press); `admissibleRewrites` enumerates every axis but `variant` (sampled by `variantConfigs`), failing closed over
`ADMISSIBLE_REWRITE_CAP`; `choiceRescue` (`findValidConfig`'s tier after the seat, and `dryRunOutcome`'s curable
test) tries the `variant` and `side` axes, fewest changes first; `App.tsx` enables the button when any axis or free
DOF exists.

The seat is **pinned** by the student's own right angle, read from one set, `explicitRightAngleVerts` (ADR-445), that the ADR-163 reseat pre-scan, `cyclableSeat` and `unpinnedSeats` all consult: a 90° `set-angle`, and since [ADR-658](06-decisions.md#adr-658) (#2082) a `set-perpendicular` whose two segments meet at one vertex V of an enabled right triangle with their other ends its other two vertices (every ⟂ spelling and every height that lowers to one; structure only, never positions). The set is in fact order, so of two right angles stated on one right triangle the earlier keeps the seat, and the later line meets the angle-sum prover's `no-room` verdict (LADDER stage 0f) and is refused at the door, naming the earlier statement through the fold's drop-one search ([ADR-508](06-decisions.md#adr-508)). A noun's default seat (`seat: true` ⟂ or perp-offset knee) is never read as a stated angle by that prover.

**The crossing count is evaluate's own selection:** `crossingChoice` (`engine/evaluate.ts`) returns the roots and
the pick, `tryEval` draws it, and `crossingBranchCount` (behind `branchCount`) counts; an `avoid` that is a
crossing, a single in-segment root or a tangent is 1, an `avoid` that is not a crossing is an ordinary pick
(ADR-470). **The composition side is stored:** `chooseComposition` keeps the away default, reads
`edgeSide: 'toward'`, and records `SideChoice { type, ids, toward }`, carried by `withSideChoices` (the
`withRequirements` discipline); `expandShapeVariant` carries `edgeSide`. A stated side wins through
`meetsRequirements` and `choiceRescue`.

### The side of a two-vertex height is a variant command ([ADR-644](06-decisions.md#adr-644))

«מרובע ABCD» · «AC גובה» names a height whose side the sentence did not state. The altitude rule emits
`altitude-choice { options: {apex, foot, side}[], variant }` (`engine/altitudeChoice.ts`), the options from the parser's
`vertexPairOptions` — the same list `cevianPairReadings` reads, the second letter's sides first. It is one more member
of the variant family (`variants.ts`: count = options, cyclable, `withVariant`, `variantVertices`), so the store, the
registry's `variant` axis, `choiceRescue`, `settleVariantDefaults` and the save file need no new branch. It lowers to
`rightAngleAtFoot` (the long form's lowering, shared with the parser's `altitudeAtVertex`). M4: `replay`'s pre-scan
reads the right angles the student stated elsewhere (`statedRightAngles`: a ⟂ between two segments sharing an end, a
90° angle) into `explicitRightAngles` (in the prefix signature), and `expandAltitudeChoice` pins the matching option
and drops its own ⟂; `dryRunOutcome` commits a right angle that pins a still-soft option, ahead of the implied test.

### A sine is a two-root angle choice; the configuration searches walk every variant ([ADR-573](06-decisions.md#adr-573))

A sine in (0, 1) lowers through `trigGiven` to the same `measure-angle`, with `expr: { value: θ, roots: [θ,
180° − θ] }` and `variant: 0`. A multi-root literal angle is a **variant command** (`engine/variants.ts`):
`variantCountOf` is the root count, and `withVariant` sets `variant` AND rewrites `expr.value` to
`roots[variant]`, so every reader of the value (the lowering to `set-angle`, the label's `fmtNum`, the verifier)
sees the drawn angle. `variantConfigs` samples across the roots, so a relation true at one root is never reported
forced. `variantAxes` (`replay/core.ts`) lists every enabled cyclable variant fact (at most four).
`variantRescue(facts, deadline)` tries the other assignments,
fewest changed facts first, for `findValidConfig`'s variant tier and `dryRunOutcome`'s curable test; a new fact's
choice settles in `settleVariantDefaults`, an earlier fact's in `autoResolve`. ADR-593 (#1600) folded `variantRescue` into `choiceRescue`, and
`searchAnotherView` walks the axes:
the
  variant step `v` advances the mixed-radix assignment by `v`, so successive presses reach every combination.

### The order of points on a circle is a sampled DOF ([ADR-601](06-decisions.md#adr-601))

Free riders on a circle take golden-angle slots (`nextTheta`), and the sampler holds a cluster to a ±30° jitter.
`statedCyclicOrderSeat` (`engine/sample.ts`, called by `applySeed` for every seed but 0) deals a cluster of four or
more tight riders its own slots in a seeded cyclic order drawn from the orders the records allow: a declared polygon
keeps its vertex order; chords stated to meet within a segment (`line-line-intersection` with `onSeg`) alternate
their ends; otherwise, or when unsatisfiable, the default stays. It runs before the jitter, adds no evaluate, and is
reached by every view search's seed sweep (ADR-106) — the counterpart of the stated-side seat (ADR-594).

### A free point's admissible region rides on the point (#556, [ADR-511](06-decisions.md#adr-511))

A construction needing a free operand on one side of a circle (a tangent's or secant's apex, «M מחוץ למעגל») emits
the ADR-254 side record `point-circle-side` after the operand's placement; its apply case (`engine/apply.ts`) seeds
or re-seats a non-pinned point on that side. The sampling half — `applySeed` (`engine/sample.ts`) re-seating
wrong-side samples, seed 0 never sampled — now reads the requirement record (ADR-594), which retired
`FreePoint.region: { circle, side }[]`. A circle or polygon seat is **confirmed on the figure it makes** (ADR-742
Am. 1): the move is re-judged (one evaluate) and must pass the verifier's own `sideShortfall`, because the region can
be driven by a solve that reads the subject (a circle centre carrying «ישר ADB» through the apex re-solves when the apex
moves); a move the re-solved figure breaks asks for the next seeded proposal (`SEAT_ATTEMPTS` = 12), and the first
proposal stands when none holds. A line-side seat is not confirmed. The verifier reports a contradicted side and `meetsRequirements` gates the
button on it.

### An unstated choice is SAID (#973, [ADR-502](06-decisions.md#adr-502))

The engine leaves an unstated choice free (ADR-052) and cyclable (ADR-138); this layer **names** it.

- **`unstatedChoices(facts)`** (`engine/shapeVariants.ts`) folds the enabled facts into the choices the tool is
  making, a table keyed on the fact's commands: `equal-pair` (kite / isosceles, pinned by a stated equality),
  `free-endpoint` (a base-less midsegment's free end, pinned by «G על PR»), `parallel-pair` (the isosceles
  trapezoid's assumed AB ∥ DC), `midsegment-free` ([ADR-545](06-decisions.md#adr-545), #1368: nothing named — the
  side it is parallel to). Derived on every render like `hasVariant`; nothing is stored.
- **Midsegment shapes.** `midsegment` (two variants: one endpoint stated) and `midsegment-free` (three) are separate
  `VariantShape`s: a variant explores what was not stated, never what was. Gates ask `MIDSEGMENT_SHAPES` (from
  `shapeVariants.ts`), never `shape === 'midsegment'` (`droppedMidsegment`).
- **The trapezoid's ring in force** (#989, [ADR-506](06-decisions.md#adr-506)): the `trapezoid` lowering makes ring
  sides 0 and 2 parallel, and `trapezoidRingInForce(ids, statedParallels)` is the one reader of which ring — as
  named, rotated by one when a stated ∥ names sides 1/3 and none names 0/2. The replay pre-scan (`trapRotate`,
  ADR-341) lowers on that ring and re-seats the leg equality (`trapezoidLegs`, the ADR-239 `softPair` shape);
  `parallelPairs` and `unstatedChoices` read the same ring. In `apply.ts`, `trapezoidDerivedSlot` picks the missing
  vertex and `trapezoidOffset` derives it; the composition normaliser never rotates the trapezoid's ring. Not
  cyclable (#973's ruling).
- **`unstatedChoiceText(choice, t)`** (`ui/unstatedChoice.ts`) builds the note — what is drawn, the pinning sentence
  (a bare next line, #997), the cycle button's label — from `steps.unstated*` / `steps.state*`.
- **Render:** on the fact's row, plus one cue beside «הציגו תצורה אחרת» (ADR-502 Am. 1, #996).

## Render and marks

### An off-ink construction point's dashed extension ([ADR-612](06-decisions.md#adr-612), [ADR-W-124](06w-decisions-workspace.md#adr-w-124), #1971, #1937)

The extension is render-time **decoration**, not a dependency-graph object. It has no id and no letter, it is never
a fact, and it is recomputed for every configuration, because whether a foot lands beyond its side depends on the
configuration. Two halves:

- **Which lines.** `carryingLines` (`src/engine/carryingLines.ts`) reads, from the construction alone, every line
  through two named points that a point is DEFINED to lie on: a foot's side, a segment point's segment, both lines
  of a crossing, a `through` line under a line-object crossing. It is an exhaustive switch over `GeoPointKind`, so a
  new point kind must answer it. A point on a line by accident has no carrier.
- **When.** `shell/offInk.ts` `offInkExtensions` is the shared planar geometry. A point inside its carrier's span
  gets nothing. A point beyond it gets the stretch from the span's nearer end, minus any ink already drawn on that
  line. A point not on its carrier in this configuration gets nothing.

`buildScene` publishes the result as `Scene.extensions` from the drawn points, segments and lines (a polygon is
never stroked, so its sides count through their segments). `Figure.tsx` paints it dashed in the segment colour, with
no hit-target.

*Identifiers:* `carryingLines` · `offInkExtensions` · `Scene.extensions` · `data-role="extension"`

### An angle's value fits its corner: side length and opening ([ADR-544](06-decisions.md#adr-544), [ADR-715](06-decisions.md#adr-715), #1337, #2175)

A stated angle's arc and value are sized by the corner (`markScale`, the shorter adjacent side, ADR-544), and the
value is then PLACED to fit the wedge's opening (`placeAngleValue`, `src/render/scene.ts`). It works in screen px
on the label's ink box, which `src/render/mathMetrics.ts` (`mathLabelBox`) computes from the same widths `MathSvg`
lays the label out with. In order:

1. Today's spot (`angleValueOffset`, just outside the arc) when the box clears both rays (a ray may cut the estimated box's edge by `INK_TOLERANCE`).
2. Further out along the bisector, at the nearest distance where the box clears both rays and the arc, while it
   stays on the vertex's side of the chord between the two ray ends and within the nearer half of the shorter
   ray (past it, the value reads as another corner's).
3. Smaller, down to `MIN_MEASURE_FONT_PX`, at the distance that fits.
4. Beside the arc, just outside the wedge, across the ray whose outer side faces away from the figure's centre.

The label is never dropped. Analytic places its stated values through its own candidate search
(`src-analytic/render/scene.ts`), not this function.

*Identifiers:* `placeAngleValue` · `mathLabelBox` · `INK_TOLERANCE` · `angleValueOffset` · `markScale`

### Every measure label is placed in one function, and none covers another ([ADR-732](06-decisions.md#adr-732), #2172)

`placeMeasureLabels` (`src/render/scene.ts`) places every 2-D measure label; `Figure.tsx` only draws its result.

1. **Each label's own spot**, the arithmetic the renderer used inline before: an angle through `placeAngleValue`
   (above), a length at its midpoint nudged outward and shrunk to its side (`labelScale`), an arc's value on the arc
   nudged inward, an area at its centroid.
2. **A collision pass** over the labels' ink boxes (`mathLabelBox`, grown by `LABEL_AIR` on every side, the halo),
   in a fixed order by kind, `MEASURE_LABEL_PRIORITY`: angle > arc > area > length (within a kind, by the anchor's
   screen position, so the typing order never changes the drawing). An angle, arc or area value keeps its spot. A
   length whose box meets an earlier label yields: it tries the mirror across its segment, then both sides at
   `off + k·boxHeight` (k = 1..4), the side away from the label it hit first, and takes the first spot that meets
   nothing, else the least-covered one. It is never dropped.
3. A label that meets nothing is exactly where it was (`moved: false`).

Analytic places its labels through its own priority search (`placeSceneLabels` in `src-analytic/render/scene.ts`,
#1717/#1733), which already makes a later label yield to an earlier one.

*Identifiers:* `placeMeasureLabels` · `MEASURE_LABEL_PRIORITY` · `LABEL_AIR` · `MeasureLabelPlacement`

### The measure-label seam and the display choice (#948, [ADR-488](06-decisions.md#adr-488))

A symbolic measure becomes figure text at one place, `measureLabelForms` (`src/engine/lower.ts`), reached from the
fold's symbolic-measure branch in `src/replay/core.ts`; `measureLabelText` is its `text` half. It yields `text`
(the resolved number), `letter` (the student's expression) and the `sym` they differ over.

- The competing predicate is `letter !== undefined`, so no list of label kinds exists.
- The swap happens at the render seam (`applyDisplayMode`, in `App.tsx`), so `displayMode` never enters the replay
  memo key.
- The choice is state, not geometry: beside `seed` in `geoStore` (`partialize`, the temporal `equality`, cleared by
  `clear`), outside the fact list, so `(facts, seed)` stays the source of truth.
- In the save file it is keyed by fact position (`FigureFileDisplay.displayMode`), because `sanitizeFactIn` keeps
  ids only when the file carries them; the converters are shared with 3-D in `shell/displayMode.ts`.

### The three label sources, and the rule they all obey (#955, [ADR-491](06-decisions.md#adr-491))

| source | when it runs | gate |
| --- | --- | --- |
| the fact seam — a symbolic measure's forms, an angle-alias name (`labelFrom` in `computeFold`) | inside the fold, from the fact's success branch — in-order pass and ADR-104 retry alike | the fact HELD |
| #474's stated-magnitude pass | `runTail`, post-fold | `status[f.id] === 'ok'` |
| the surviving-constraint fill | `runTail`, post-fold | the constraint survived |

**A label is written from a fact only once the fact held** — after `applyStep`, so a refused «∠ABC = α» never
prints the `70°` another line supplied. Labels are fold state like `applied` and ride the fold memo (ADR-280);
fact identity does not, so no provenance is stored on a label. `checkLabels` (`engine/verify.ts`) then holds every
decimal label to the drawn measure at the verifier's tolerance plus the print rounding, reporting `figure.v.label`
whatever the source. A new label source states which of these three shapes it is.

**The surviving-constraint fill reads provenance, never guesses** ([ADR-693](06-decisions.md#adr-693), #2262). A
constraint the engine builds to realise ANOTHER statement carries it on the constraint: `DistanceConstraint.derived`
(`'tangency'` — `circles-tangent` over two stated radii pins |c₁c₂| = r₁ ± r₂). The fill and the values panel's
«נתון» marker skip a `derived` distance; the solver, the verifier and every geometric reader treat it as any distance.
A stated length on the same pair («OP = 10») is its own undecorated constraint and the #474 fact pass, so it still
prints. Audited: the other engine-built distances are a stated value already (a `through` circle's stated radius, a
membership on a stated-radius circle, `set-distance`).
