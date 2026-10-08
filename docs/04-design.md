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
   §4), and `commandConflict` refuses only what cannot be lowered.
2. **The parser may read the drawing, but only to resolve a pointing reference** («המעגל הגדול», «הימני»,
   «נקודת ההשקה»), through `ParseContext`'s deictic fields, each read emitting a locking assertion
   ([docs/17](17-design-rules.md) §3b).
3. **The stored artifact is source plus lowering.** A fact carries its utterance and its lowered commands; an
   edited step re-lowers against its own prefix (ADR-241); on load a deterministic step adopts the current
   lowering and an LLM step keeps its saved commands (`refreshLoadedFigure`, ADR-314), audited for drift and
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
- **The view delta (ADR-517, #65).** What «show another configuration» changed is a pure comparison of the two views (`replay/viewDelta.ts`) on similarity-invariant quantities; discrete choices are explicit in the facts. The note carries the view it describes and retires when the session leaves it.
- **Stability:** DOF parameters (free-point coords, on-object `t`) and branch indices **persist across steps**. A new constraint re-evaluates only what depends on it; unrelated objects keep their parameters, so the figure does not jump.
- **Over-constraint / contradiction:** before committing a step, check satisfiability. If unsatisfiable, reject the step, keep the previous figure, and surface a clear message.
- **A fact whose subject is gone (ADR-483, #926):** the fold asks `isSymbolBound` (`engine/lower.ts`) before applying a `set-var`; a value for an unbound letter is stamped into the "no longer available" register, and a definition re-added anywhere binds it again. The ✎ edit seam (`app/editPipeline.ts`) names the rows an edit orphaned while committing it.
- **Where the solve budget is consulted (ADR-515, #259).** The cooperative wall-clock budget (`engine/solveBudget.ts`) is armed only around view searches (the configuration searches, the submit gate's «כבר קיים» test), never the primary submit fold (ADR-281). It is consulted between recruit experiments (`step.ts`) and inside `nelderMead`'s descent (`evaluate.ts`); unarmed it is a null check. The knowledge pool is bounded by work, never seconds (`POOL_WORK_CAP`, ADR-558; see the knowledge pool).
- **A refusal names what the rule matched (ADR-528, #1266/#1267).** A rule that recognised a construct and rejected it answers through `Clarify` (mapped by `refusalOf`, armed by `runSubmit`), never `not-handled`. A cevian's stated side has one reader, `statedSide`, shared by median, altitude and bisector (the bisector also checks it); its stated triangle has one, `statedTriangle` (ADR-540, #1285), so the triangle form answers where the bare form asks `ambiguous-angle`, and a wrong lone vertex is `bisector-wrong-apex`. `cevianTriangle` wraps every cevian rule and prepends `triangle` when the sentence names one the figure lacks (ADR-571, #1720). The bisector's vertex has one reader for both forms (ADR-568, #1684). A cevian with no stated side or triangle resolves through `cevianShapeEdges`: one shape answers; shapes giving the apex different opposite sides ask (`ambiguous-cevian`).
- **A bound’s aim is not its test (ADR-529, #1265).** ADR-390's visible gap is the residual the optimizer follows; acceptance is `isSatisfied`'s direct test of the stated inequality, with ≥ vs > carried from the parser (absent ⇒ strict). The edge never enters the aim. **The aim yields (ADR-547, #1351):** when the ladder with the aim accepts nothing and a bound is present, it runs again with `jointCostTerm(…, aim = false)`, where a bound costs only `boundShortfall` (the region `boundHolds` reads) — retry-only, below every given (ADR-097/ADR-238).
- **A crossing is refused when its own letters make it an existing point (ADR-531, #1274).** The check sits inside `cross`, the single emit point of the two-named-lines family, so no spelling reaches `line-line-intersection` around it; it travels the `Clarify` road. ADR-123's boundary holds, and ADR-489's within-margin exemption stays for `rename` and `merge`.
- **The letter-holder question (ADR-520, #238).** `letterHolder` (`store/geoStore.ts`) answers who holds a letter and whether it can be taken back, returned with every `target-taken` refusal from `renameFacts` and `nameCentreFacts`. Reclaimable means dropping the holder removes that letter and nothing else; `reclaim` re-asks before acting.
- **A point-menu control declares its own colour (ADR-520 Am. 2, #1277).** `ctrlBtn` carries `color: var(--color-text)` instead of inheriting `--color-text-muted`; whether a `<button>` inherits `color` is UA behaviour, so every menu control states it.
- **Driven parameters are solved as jointly as they are coupled — no more (ADR-557, #1602).** `resolveDriven` sends driven carriers to the joint Nelder–Mead only when coupled (a parent of another's constraint refs, a cycle, or `also`); independent carriers take the exact ADR-028 1-D root path in dependency order, checked by the joint solver's accept. An `on-segment-solved` rider driven by ⟂ / ∥ / collinear takes the exact roots of its polynomial in t; a relation holding by construction claims no carrier (`driveOrCheck`). Locked by `drivenSolveStats.joint`.
- **Fit transform:** map computed coordinates into the viewport; persist the transform so the view is stable across steps.

## 5. Input layer

A single boundary: `utterance → command[]`.

- **Primary — deterministic grammar parser.** Handles the common, bounded geometry phrasings in Hebrew and English (shapes, points-on, distances, angles, special lines). Free, offline, instant.
- **Fallback — Claude API.** Only when the parser cannot confidently parse. Model: `claude-haiku-4-5`. Calls go through a **server-side proxy** that holds the key (never in the browser), is gated, and is rate-limited. `max_tokens` and prompt size kept minimal.
- The engine is agnostic to which path produced the commands.
- **The input preview seam carries bidi AND maths (#997, ADR-504).** The shared `InputArea`'s `preview` prop
  shows the maths renderer when the line has maths, else `inputPreview` (the bidi isolator with the live-tail
  rule), only when isolation would change the layout; the box stays raw. The 3-D twin is `inputPreview3` (ADR-3D-123).
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
- **Contextual plurals resolve against a per-family context registry (#554, ADR-503).** A line naming no
  object of its own («המשיקים נחתכים בנקודה E») resolves against `ParseContext` — `ctx.commonTangents`,
  `ctx.tangentLines`: two candidates build, more ask (`tangents-ambiguous`), fewer are not that rule. A
  family's one-utterance and incremental forms emit the same commands.

## 6. Rendering

- **Hand-rolled SVG via React**, drawn declaratively from the engine's computed figure. No imperative reconciler (that existed only because the old JSXGraph API was imperative).
- Visual vocabulary: points, segments, polygons, circles, angle arcs, right-angle marks, equal-side ticks, labels, dashed special lines; pan/zoom/fit. Equal-side ticks appear only in the opt-in relations layer, never at rest (FR-RN-1, ADR-W-118 B2). Smooth animation of moved points (FR-RN-3) is not built.
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
  "the circle" or its ADR-342 token; `render/valueRowText` words every row label.
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
  only, later statements first, latest first (ADR-554, #1203).
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
less a straight pair stated via `onSegment`/`midpointOf`). A polygon-default reading goes to a reading sink owned
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
  verifier; «אלכסוני» stays the `diagonals` rule's.
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
committing. Hebrew-alphabet labels are told from words by the alphabet **range** — labels come from its start
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

### A through-statement about a drawn circle is a reference ([ADR-548](06-decisions.md#adr-548))

The circle definition rules (`circle`, `circumcircle` in `src/parser/parse.ts`) ask ADR-029's introduce-vs-resolve
question through `circleThroughReference`: a reference when its named centre's circle exists, or when it says
«המעגל» and a circle is drawn. It resolves through `circumscribingRef` → `directionalCircleRef` →
`existingCircleRef` (ADR-443's tie-break); unbindable → `ambiguous-circle-ref`. It lowers to one `point-on-circle`
per label (the M1 membership shared), a stated size as `set-radius`, and defers on any residue. `throughClause` is
the one reader of the through list; a definition lowers one through point, a longer list is the circumcircle.

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

### The hidden centre letter steps aside ([ADR-565](06-decisions.md#adr-565))

An unnamed circle still carries an internal reference token (`O`, then `P`, `Q`, `K` — ADR-342): its id is
`circle-O` and its anonymous centre `@ctr-O`. Every seam that parses a student sentence — `decideFromParse`, the ✎
edit seam, the scenario mirror — first calls `stepAsideFacts(facts, typedLabels(utterance))` (`store/geoStore.ts`),
re-lettering each hidden token the sentence types to an unused letter as a `step-aside` bind applied with
`reletterHidden`. The student's letter is then an ordinary new letter: a reference («BO = 5») mints a free point,
«מעגל O» declares a circle, «C על מעגל O» names an unnamed circle by use (ADR-347). Circles `autosInterchangeable`
finds interchangeable (a crossing read as an unordered pair whose `branch` is seed, #1688; requirement records
compared, ADR-567, #1709) are named in order; otherwise it asks.

`nameCentreFacts` absorbs a target letter nothing places (a bare `free-point`, no vertex, first used after the
circle), exposed through `ctx.freePoints` to `parseNameCenter`, the `nameCenter` rule and `impliedCircleBinding`; a
radius sentence whose centre end is such a letter emits the implied circle (`radiusNamesCentre`).

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

### A foreign given is refused by the grammar, before any rule ([ADR-562](06-decisions.md#adr-562))

`classifyOutOfScope` (`parser/scope.ts`) holds the vocabulary of the families another tool owns — `analytic` (axes,
coordinates, slope, line equations, a quadrant) and `cross-app` (the solids, and a plane as an object via
`planeObject`, which exempts «במישור …»). `foreignGiven` asks the same rules of the whole utterance at the top of
`parse()`, beside the LaTeX and negation guards — and `parse` returns `{ ok: false, reason: 'foreign-given', category,
phrase }`. Because it is `parse`, every seam inherits it: the submit lane (`decideFromParse` answers with
`input.scope.foreign-given`, quoting `phrase` ahead of the family's pointer, logged as `scope:<category>`), the ✎
edit seam, the scenario harness (`refusedSteps`) and log-triage. The pre-parse guard and the post-failure register
read the same `RULES` entries.

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
(`circle-X`, `ParseContext.circleMembers`); a circle's name when the lowering touches a circle; a vertex of a
polygon the sentence names with its noun (`ParseContext.polygons`). Callers: `honestyGateReport` (commit and ✎
seams; `GateCtx` carries `circleMembers` and `polygons`), the LLM second attempt in `submitPipeline`, and
`parseResolved`, where an unaccounted existing label routes to the clause split (`splitStatements`, ADR-264; a new
label stays `droppedNewLabels`'s question), whose `parseClause` asks again. `augmentParseCtx` registers a clause's
anonymous centre (`@ctr-O`) with `centrePoint`, as `buildParseCtx` does. Widening the reference closure is the
sanctioned direction; re-widening the exemption is not.

### A crossing draws what its subject is ([ADR-592](06-decisions.md#adr-592))

Only the frame decides whether a crossing's operand lines are drawn. The verb frame — `lineLineIntersection`'s
lines-first and cut branches, and a role meet whose `crossingSubjectOf` is `'lines'` — inks its operands (the
diagonals of «האלכסונים נפגשים בנקודה M» as plain segments). The noun frame — the point-first branch,
`cross(…, 'point')`, a role meet with a noun head — inks nothing and ensures the endpoints as `ifAbsent` free
points. Analytic reads the same rule (ADR-AG-241).

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

### A one-line compound is all or nothing: the clause-coverage gate ([ADR-598](06-decisions.md#adr-598))

`src/app/clauseCoverage.ts`, called from `decideFromParse` (`decideDeterministic.ts`):

- **Commit path** (`droppedClause`, after a clean honesty battery, before the dry run): the clauses from `clausesOf`
  (`independence.ts`, the one splitter) are each lowered alone in the figure's context plus the earlier clauses
  (`augmentParseCtx`). A clause is **covered** when a significant command of it (1) has a same-type whole-line
  command naming all its labels, (2) defines an object the whole line defines (same `id`), (3) only declares an
  existing object, or (4) is **entailed** — dry-run after the line, `empty` or `implied` (ADR-156 / ADR-542). An
  uncovered clause refuses the line, `guided`, with `input.scope.split-statements`.
- **Weak path** (`compoundNotHonoured`, after an honesty gate fired): a compound whose every clause lowers alone is
  refused with the same message instead of escalating.

`clausesOf` cuts at punctuation (not a decimal point), the explicit connectives, and «ו» before a Hebrew word or a
label, never leaving a piece that only names points, and keeps a subject-less piece with the clause before it when
the two read as a statement.

### A ring over placed points that crosses everywhere is refused before the dry run ([ADR-608](06-decisions.md#adr-608))

`forcedCrossedRing` (`replay/core.ts`, beside `impliedByPrior`) is called from `decideFromParse` (after the
clause-coverage gate, before the prefold and the first `dryRunOutcome`) and from `runEditCommit` (beside
`impliedByPrior`, against the prefix facts). It reads the rings the line declares — `declaredRings(cmd)` plus a
top-level `polygon` of 4 or more ids — keeps those whose every vertex is already placed, drops any that is simple in
the figure on screen (one test, no pool), and asks the prior figure's `sharedSamples` pool (the UI-thread narrow
gate, as `impliedByPrior`) whether the ring **properly** crosses in every sample: two non-adjacent sides meeting at a
point interior to both, with a tolerance relative to the ring's extent (a touching vertex is not a crossing, unlike
`ringSimple`). The floor is `forcedCrossingKeys`'s: a determined pool, or at least 4 samples. Reading the prior pool
is sound because the line's own constraints only narrow the configurations. A hit refuses `conflict`, log
`ring-contradicts-noun`, note `input.ringContradictsNoun` with `detail` = the line (analytic's
`errRingContradictsNoun` text, verbatim), and never escalates; it precedes ADR-157's redefinition refusal. The test
helper `gateVerdict` mirrors it (reason `crossed-ring`). The predicate is 2-D's own: `BOUNDARIES.json` keeps engine
layers `copied-never-shared`.

### What counts as "produced": a display-only command declares itself (#1011, [ADR-519](06-decisions.md#adr-519))

`dryRunOutcome` asks whether a line did anything — the construction grew, a DOF went, the scale was fixed, a point
moved — and otherwise answers «זה כבר קיים באיור» without committing. A display-only command (revealing a hidden
centre, resolving a hidden circle, a valueless angle arc) moves none of those signals, so membership is declared:
`DISPLAY_ONLY` in `engine/types.ts`, typed against `AnyCommand['type']`. An exact restatement is excluded (as
`dataOnly` excludes one), and a display command must leave `freeDofCount` and the constraint list unchanged. The
lock tests at `dryRunOutcome`, the gate the app calls.

### One fold rule: the dry run judges the list the commit saves ([ADR-578](06-decisions.md#adr-578))

`foldCommand` (`replay/core.ts`) decides how one command enters the fact list: an exact duplicate of an enabled fact
is a no-op, of an unticked fact re-enables it, a re-stated free point moves in place, a re-stated standalone circle
resizes in place, anything else appends. The commit (`foldFact`) and the dry run (`trialFacts`) fold through it, and
the dry run judges `trialChanges` (by object identity), never `all.slice(facts.length)`; a second copy of the rule
is the ADR-320 class. The load refresh
and audit compare `committedStepCommands(prefix, …)` on both sides and write refreshed steps as those rows
([ADR-579](06-decisions.md#adr-579), #1604); `fixtures.test.ts` asks the same. A differently spelled statement over
an unticked row's letters is refused naming that row (`errors.mutedRowOwns`, ADR-010).

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

### A declared polygon the givens force FLAT is said out loud (#945, [ADR-513](06-decisions.md#adr-513))

The net below ADR-602, for a polygon not forced flat but drawn below the floor at a sampled configuration.
`Derived.degeneracies` (`replay/core.ts`), beside `coincidences` and `forcedOffArc`, is derived on every replay and
shown as an ⓘ notice. `degeneratePolygons` (`engine/degeneracy.ts`) measures each declared polygon's greatest vertex
offset from the line through its two most-separated vertices, over that separation (the ADR-413 accept gate's
measure), against `DEGENERATE_EXTENT_RATIO`. `nameDegeneracies` walks the statement prefixes (the ADR-492 rule) for the declaring and
responsible statements; the wording is `figure.degenerate`.

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

**The crossing count is evaluate's own selection:** `crossingChoice` (`engine/evaluate.ts`) returns the roots and
the pick, `tryEval` draws it, and `crossingBranchCount` (behind `branchCount`) counts; an `avoid` that is a
crossing, a single in-segment root or a tangent is 1, an `avoid` that is not a crossing is an ordinary pick
(ADR-470). **The composition side is stored:** `chooseComposition` keeps the away default, reads
`edgeSide: 'toward'`, and records `SideChoice { type, ids, toward }`, carried by `withSideChoices` (the
`withRequirements` discipline); `expandShapeVariant` carries `edgeSide`. A stated side wins through
`meetsRequirements` and `choiceRescue`.

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
`FreePoint.region: { circle, side }[]`. The verifier reports a contradicted side and `meetsRequirements` gates the
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
