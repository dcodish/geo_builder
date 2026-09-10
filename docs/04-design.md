# 04 — Design & Architecture

_Last updated: 2026-07-24 (S4.3 of [docs/24](24-foundation-hardening-plan.md) — the layer map truthed-up to the built system; the original 2026-06-10 design text is kept where it still describes reality). Status: **built and in production** — everything below exists. The day-to-day working doctrine is [docs/17](17-design-rules.md); the solve-ladder contract is [docs/LADDER.md](LADDER.md); the current architectural assessment is [docs/23](23-architecture-review-2026-07.md)._

## 1. Guiding principles

- **One source of truth.** The engine computes the figure; everything else (rendering, theorems, history) reads from it.
- **Describe, then construct.** The user states facts; the system constructs. The construction is a *dependency graph*, not a recognized template.
- **Stability is structural.** Continuity between steps comes from persisting degrees of freedom and branch choices, not from after-the-fact smoothing heuristics.
- **The LLM is optional and replaceable.** It sits behind a narrow boundary and handles only the inputs a free local parser can't.

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
- **Branches = alternatives:** when an object has N≥2 solutions, the branch index selects one. The "show another configuration" action increments it and re-evaluates. Enumerating branches is how alternatives are produced — for free, not as a special case.
- **Stability:** DOF parameters (free-point coords, on-object `t`) and branch indices **persist across steps**. A new constraint re-evaluates only what depends on it; unrelated objects keep their parameters, so the figure does not jump.
- **Over-constraint / contradiction:** before committing a step, check satisfiability. If unsatisfiable, reject the step, keep the previous figure, and surface a clear message. This is general (not triangle-only as in the old code).
- **A fact whose subject is gone ([ADR-483](06-decisions.md#adr-483), #926):** the fold asks `isSymbolBound` (in `engine/lower.ts`, beside the symbol table it reads) before applying a `set-var`; a value for a letter no statement binds is stamped into the same "no longer available" register as a point whose defining step was removed, so the row and the banner both say so. The table is whole-list, so a definition re-added anywhere binds it again. The ✎ edit seam (`app/editPipeline.ts`) compares the other rows' statuses before/after the replace and names any it orphaned, while still committing the edit.
- **Fit transform:** map computed coordinates into the viewport; persist the transform so the view is stable across steps.

## 5. Input layer

A single boundary: `utterance → command[]`.

- **Primary — deterministic grammar parser.** Handles the common, bounded geometry phrasings in Hebrew and English (shapes, points-on, distances, angles, special lines). Free, offline, instant.
- **Fallback — Claude API.** Only when the parser cannot confidently parse. Model: `claude-haiku-4-5` (sufficient for short structured extraction; far cheaper than Opus/Fable). Calls go through a **server-side proxy** that holds the key (never in the browser), is gated, and is rate-limited. `max_tokens` and prompt size kept minimal.
- The engine is agnostic to which path produced the commands.

## 6. Rendering

- **Hand-rolled SVG via React**, drawn declaratively from the engine's computed figure. No imperative reconciler (that existed only because the old JSXGraph API was imperative).
- Visual vocabulary: points, segments, polygons, circles, angle arcs, right-angle marks, equal-side ticks, labels, dashed special lines; smooth animation of moved points; pan/zoom/fit.
- **Swappable:** consumes engine output only, so it can be replaced (e.g. with a library like Mafs) without engine changes.
- **Export-friendly:** because the figure is already SVG, exporting it as an image (SVG/PNG) for the authoring use-case (Vision G6 / FR-HS-5) is straightforward — serialize the rendered SVG, or rasterize it to PNG.

## 7. Theorems

`detect(figure)` predicates evaluate the computed figure and return matches (definite vs possible), sorted definite-first, shown bilingually. Grouped by figure type (triangle, quadrilateral, circle). The canonical catalog is [`07-theorem-reference.md`](07-theorem-reference.md) (the official bagrut list); **theorem IDs are the official bagrut numbers** (so surfaced theorems are citable), and detection targets the entries tagged _property_ / _converse_ — not definitions, area formulas, or the out-of-scope appendices.

## 8. Tech stack

- React + Vite + Zustand (+ `zundo` for temporal undo/redo) + TypeScript.
- Hand-rolled SVG renderer.
- Path alias `@/` → `src/` (kept in sync between `tsconfig.json` and `vite.config.ts`).
- Vitest for tests (notably the stability regression test).

## 9. Module layout (`src/`) — as built (2026-07-24)

```
src/
  engine/        the constructive core: types (dependency-graph model), geometry, solve (constraints:
                 refs/residual/describe + constraintKey identity), apply (applyCommand reducer + eager
                 carrier pick), evaluate (topological sweep + the numeric driven solvers), step
                 (applyStep/applyCoupledStep + the failure ladder — contract in docs/LADDER.md, trace on
                 StepResult.ladder), sample, verify (givens verifier), relations/detectShapes (read-only
                 detection over the shared sample core), inscribe/variants, solveBudget,
                 valuesPanel (the derived-values rows + the ask lane, over the ONE shared sample pool)
                 - its SYMBOL lane (ADR-485, #929) reads the ADR-031 symbol table the #427 unit lane
                   FILTERS, enumerated instead: every letter the student named is a quantity, so it gets
                   a row (natun when valued, nigzar when the figure forces it) and is askable by name
                   through the `var` query. One lane feeds both seams - never a second enumeration.
  parser/        parse.ts (deterministic bilingual grammar, ordered rules + post-pass chokepoints +
                 honesty gates), catalog, context (buildParseCtx — the docs/17 §3b registry), scope,
                 llm/llmShared (the LLM-fallback seam; re-parse + gate battery)
                 - THE CLARIFICATION FAMILY (ADR-490, ADR-494): a rule may return a `Clarify` instead
                   of commands, which `refusalOf` maps to a refusal reason of the SAME NAME and
                   `submitPipeline` renders as an input note that keeps the text. `not-handled` is the
                   escalation seam — right for a phrasing the grammar cannot READ, wrong for one it
                   reads perfectly well that is missing a given. `isAmbiguityQuestion` is the explicit
                   whitelist of clarifications `parseResolved` may not second-guess back into an
                   escalation. It is deliberate, NOT derivable from the `Clarify` union: a member
                   belongs when the asking rule CONSUMED the shape noun, and `ambiguous-angle` is
                   excluded because that question can be the symptom of a dropped noun, which the
                   ADR-264 Am. 1 split rescues (deriving it was tried in round #961 and refuted)
  app/           submitPipeline.ts — the text→command orchestration, extracted from App.tsx and
                 directly tested (S0.4)
                 - errorSubject.ts (ADR-487, #943): `utteranceForError(facts, status, raw)` — WHICH
                   sentence a refusal is about. Pure over its three inputs; it exists because
                   `humanizeError` is deliberately figure-free (ADR-228 Am.6), so the student's own
                   wording must be handed to it by the layer that has the fact list. The link needs no
                   plumbing: ADR-398 already makes the banner's `lastError` and the failing row's
                   `status` the same string, so the owning fact is found by that identity
                 - WHICH row owns it is decided one layer down (ADR-492, #956): `computeFold` runs an
                   attribution pass after the deferral/poisoning/HOIST have settled, moving a refusal
                   from the row that SHAPED a constraint to the row that VALUED its symbol when that
                   row is later in the list — "the last statement that turned the figure infeasible".
                   Attribution only: it changes no applied constraint and no drawn figure, and it is
                   the fold-time twin of ADR-398's per-seed override. `symbolsConsumedBy` (engine/
                   lower.ts) is the shared list of what reads the symbol table, derived from
                   `lowerOne`'s own call sites so the two cannot drift
                 - WHICH CONSTRAINT a refusal names (ADR-493, #920): `addedConstraints(prev, next)`
                   in engine/step.ts is listed-added ∪ driven-added, and it feeds the two blame sites
                   in `runFailureLadder`. `driveOrCheck` case (1) embeds an obligation in a carrier
                   WITHOUT listing it, so a macro whose constraints all go that way adds nothing to
                   `next.constraints` — and `blameNewStatement`, which bails on an empty list, then
                   silently no-ops and the primary solve's violated set (an earlier given of the
                   student's) reaches them verbatim. Blame only: the acceptance paths keep reading
                   the listed slice, since what counts as "new" for ACCEPTANCE is a different question
  replay/        core.ts — the PURE replay layer (S1.2): fold memo + deferral + HOIST + seed/config
                 searches + the shared sample core; engine ← replay ← store enforced by test
                 — the config searches RANK rather than merely accept (ADR-486, #942): a view that
                   stacks two named points is legal (ADR-123 — a forced coincidence must still draw)
                   but is the LAST tier, below every separated one. `separatedView` is that predicate,
                   consulted once each by searchAnotherView / firstSatisfyingSeed / findValidConfig
  store/         geoStore.ts (Zustand + zundo: the fact list as source of truth, actions,
                 rename/swap/merge; re-exports the replay layer), figureFile (save/load), loadAudit,
                 geoWork/geoWorker (the Web-Worker seam)
                 — the drawn figure is `(facts, seed)`: a STRUCTURAL edit (remove/removeGroup/
                   replaceGroup/toggle/setGroupEnabled) resets the seed to 0 so re-entering a line
                   reproduces its first result, while undo/load/rename keep it (ADR-484, #938). The
                   satisfying-seed search runs whenever the figure does not build at the current seed
                   (`Derived.sampledFailure`), not only when it builds and looks bad.
  render/        transform + scene (pure figure→primitives) + Figure.tsx (declarative SVG, pan/zoom,
                 hover picks); a pure consumer of engine output
                 — #942 (ADR-486): points the geometry drove onto one spot are drawn as ONE label
                   («B=D»); the merge is by label only, so ids, positions and hover targets are intact
  theorems/      the authored theorem table + coverage disposition map + rank bands + audit harness
  validation/    the differential coordinate oracle (engine-import-free; dev/CI only)
  export/        question export (.docx)
  i18n/          locales (he/en)
server/          the shared LLM proxy + admin dashboards (parameterized by tool:, serves 2-D and 3-D)
src3d/           the sibling 3-D product (pattern-copied, never imported — see CLAUDE.md §multi-product)
```

## 10. Build order (de-risk the core first) — *historical: all steps complete*

> The full phased plan (scope, dependencies, requirement coverage, per-phase gates, milestones) is in [`09-implementation-plan.md`](09-implementation-plan.md). The list below is the summary.

1. **Engine core slice** — dependency graph + topological eval + free/on-segment/intersection points + branch cycle. Prove it on fixtures (build + stability; a genuine two-branch construction; a contradiction) from hardcoded command lists. *Make-or-break.*
2. **SVG renderer** for that slice.
3. **Grammar parser** → commands (replaces the hardcoded list).
4. **Expand** objects/constraints/special-lines to the full v1 scope.
5. **Theorem detection.**
6. **API fallback + proxy** + cost controls.
7. **Polish + deploy.**

## 11. Key risks

- **R1 — Engine expressiveness.** Does the constructive/branch model cover the v1 figure vocabulary cleanly? Mitigation: prove the slice (step 1) before building outward.
- **R2 — Parser coverage vs. fallback rate.** If the grammar parser is too narrow, API usage (and cost) rises. Mitigation: design the grammar from real bagrut phrasings; measure fallback rate.
- **R3 — Stability under attachment.** Keeping shared/derived geometry stable as constraints accumulate. Mitigation: persistent DOF/branch indices + the stability test.

## The within-segment gate and its structural exemption (#944, [ADR-489](06-decisions.md#adr-489))

`intersectionsWithinSegments` exists to catch a crossing that has wandered off the end of its segment —
the signature of a wrong configuration, which the reflection sampler is meant to fix. It therefore
assumes the crossing *could* be interior.

That assumption fails for exactly one construction shape: **the two carriers share a vertex**. «D = חיתוך
AB ו-BC» names the crossing of AB and BC, and two segments meeting at B cross only at B — so "strictly
inside both spans" is not a tight tolerance, it is unsatisfiable. `shareEndpoint` is the guard, and it is
structural (does the construction give the carriers a common endpoint?) rather than numeric, because a
wider `WITHIN_MARGIN` would re-admit the near-collapse basin #569 exists to catch.

The question is asked at **three** sites and all three take the exemption: the gate itself,
`segmentsCrossWithin` (the point-free sibling from ADR-383), and `reflectMaskForFailing`, which picks
reflection culprits from the same test — an exempt meet is not failing, so it must not be blamed.
## The measure-label seam and the display choice (#948, [ADR-488](06-decisions.md#adr-488))

A symbolic measure becomes figure text at exactly one place — `measureLabelForms` in
`src/engine/lower.ts`, reached from the fold's symbolic-measure branch in `src/replay/core.ts`.
`measureLabelText` is now that function's `text` half, so the printed string and the switchable one
cannot drift.

The seam produces BOTH forms when they differ: `text` (the resolved number) and `letter` (the
student's own expression), plus the `sym` they differ over. Three consequences, and each is the reason
for a design choice rather than an incidental effect:

- **The competing predicate is `letter !== undefined`**, derived from the builder itself. There is no
  list of label kinds to keep in sync, so a future fourth kind starts offering the display chip with no
  change to the chip code (docs/17 §3 — no second enumeration).
- **The swap happens at the RENDER seam** (`applyDisplayMode`, called in `App.tsx` on the built
  labels), never inside the fold. So `displayMode` never enters the replay memo's key: toggling is
  instant even on a figure whose cold fold costs seconds, and the fold-memo rule (docs/08) is untouched.
- **The choice is state, not geometry.** It lives beside `seed` in `geoStore` — in `partialize`, in
  the temporal `equality`, cleared by `clear`, pruned on remove/replace — and never enters the ordered
  fact list, so CLAUDE.md's `(facts, seed)` source-of-truth rule stands.

In the save file the map is keyed by fact **position**, not fact id (`FigureFileDisplay.displayMode`).
Fact ids DO survive a round trip here — `sanitizeFactIn` keeps them — but only when the file carries
them; a hand-written or id-less file gets fresh nanoids and an id-keyed choice would then attach to the
wrong row. Position is a property of the file itself and cannot drift, and it matches 3-D so the shared
converters in `shell/displayMode.ts` have one usage shape.

## The three label sources, and the rule they all obey (#955, [ADR-491](06-decisions.md#adr-491))

A measure label on the 2-D canvas comes from one of three places:

| source | when it runs | gate |
| --- | --- | --- |
| the fact seam — a symbolic measure's forms, an angle-alias name (`labelFrom` in `computeFold`) | inside the fold, **from the fact's success branch** — the in-order pass and the ADR-104 retry alike | the fact HELD |
| #474's stated-magnitude pass | `runTail`, post-fold | `status[f.id] === 'ok'` |
| the surviving-constraint fill | `runTail`, post-fold | the constraint survived |

One rule: **a label is written from a fact only once the fact held.** Until ADR-491 the first source ran at
the top of the per-fact loop, before `applyStep`, which is how a refused «∠ABC = α» came to print the `70°`
that «α = 70» supplied on another line. A refused fact now writes nothing, and the key stays free for a
surviving constraint to fill.

The seam stays *inside* the fold on purpose: labels are fold state like `applied`, content-determined, so
the fold memo (ADR-280) carries them correctly for every fact list sharing a node, and the #365 resume
copies a prefix's maps verbatim. What may **not** ride the memo is fact identity — statuses are stored by
index for exactly that reason — so no provenance field is stored on a label (the first attempt did, and a
same-content replay under fresh ids lost its labels).

**The verifier's last word.** After the labels are assembled, `checkLabels` (`engine/verify.ts`) holds
every label that asserts a decimal to the drawn length / angle / area, at the verifier's own tolerance plus
the half-unit the 2-dp print rounds away, and reports a disagreement as a violation (`figure.v.label`).
Symbolic, exact and alias texts are the student's writing and are not measured; a measure already reported
as a violated given is not reported twice. This runs on the assembled labels **whatever source produced
them**, so a future fourth source that forgets the rule is caught on the first figure it lies about.

**The rule to carry forward:** a new label source states which of these three shapes it is, and emits only
from a fact that held or a constraint that survived. If it cannot know the outcome where it runs, it is in
the wrong place.
## The clarification family, and where an ASK beats an escalation (#777, [ADR-490](06-decisions.md#adr-490))

`not-handled` is the escalation seam: whatever reaches it becomes a paid LLM call. That is the right
destination for a sentence the grammar cannot *read* — and the wrong one for a sentence it reads
perfectly well but which is **missing a given**.

The distinction is worth stating because it decides the routing:

| the utterance | destination |
| --- | --- |
| a phrasing the grammar does not know | `not-handled` → the LLM can legitimately try |
| a phrasing the grammar knows, with an operand genuinely ABSENT | a `Clarify` → ask the student |

In the second case anything the tool supplies is a given the student never stated (ADR-052), and asking
the model to supply it only moves the invention one layer down — where it also becomes something the
tool *teaches*. `incompleteComparative` (#777) and the role-side ask (#775) are the two members so far;
both keep the student's text so the sentence is completed in place rather than retyped.

The scoping discipline is the same for any future member: register the ask **after** the rule that owns
the complete form, and make the absence **structural** (here, an end-of-line anchor after the factor, so
a line carrying «מ…» cannot match) rather than inferred from the other rule having failed.

## Addressing an angle: one reader, many value kinds (#967, [ADR-496](06-decisions.md#adr-496))

An angle statement has two independent halves: **which angle** is named, and **what is said about it**.
The value half is a family — a number, a Greek symbol, a word-number, a right-angle word, an acuteness, a
bound, a range. The naming half was, until #967, a single spelling: the three-letter vertex triple.

That asymmetry is a defect generator, and #831/[ADR-468](06-decisions.md#adr-468) had already named it
once: when each value rule resolved the vertex for itself, only one of them ever grew the single-vertex
lane, so «זווית A = α» fell between two rules that each handled half of it. The answer then was to make
**`angleArms` the one place that answers "which angle is being named"**, so a rule decides only what its
value *means*.

#967 is the same shape one axis over — the naming half had one spelling where it should have had two —
and it gets the same answer rather than a new rule per phrasing:

```
«הזווית בין BD ל-BA»  ──►  angleBetweenSides  ──►  { ray1: D, vertex: B, ray2: A }  ──►  the existing family
```

Two segments that share exactly one endpoint **are** a vertex angle, so the mode resolves to the ordinary
triple and every downstream layer — constraint, arc, value chip, verifier — is untouched. That equivalence
is the whole fix; there is no new constraint kind and no new rendering path.

**Where the mode had to be added by hand, and why that is recorded rather than tidied.** `angleArms` has
two callers (the numeric and symbolic value lanes). `angleAcuteness` and `boundOperand` still keep their
**own copies** of the triple/single-vertex lanes — the #831 remainder, never migrated — so the new mode was
added to them explicitly, *additively*, leaving their existing lanes untouched so no reading changes. The
duplication is the standing hazard: a fourth naming mode would have to be copied three times. Retiring
those copies in favour of `angleArms` is filed separately; it is a behaviour-preserving refactor, and doing
it inside a feature slice would have hidden a regression surface inside a feature's locks.

**The refusal is part of the capability.** Two segments that never meet have no vertex between them, and
2-D has no line-line angle constraint — *every* angle constraint here is vertex-anchored
(`set-angle`, `-bound`, `-ratio`, `-order`, `-acuteness`, `measure-angle`). So the honest answer is neither
a guessed vertex nor an escalation (which hands the model the same invention to make): it is
`angle-sides-disjoint`, quoting both segment names back — a member of the clarification family above, by
the same reasoning. 3-D accepts these because it has a direction/`claim` substrate that 2-D does not; the
parity is in the *addressing mode*, not in the constraint kinds behind it.
## A role noun is a claim: «אלכסון» (#966, [ADR-499](06-decisions.md#adr-499))

Most nouns in this grammar NAME a thing: «קטע AB» says "the segment AB". A few instead assign a **role**,
and a role is an assertion — «אלכסון AB» says *AB is a diagonal*, which is either true of the figure or
not. The parser used to strip «אלכסון» as filler beside «קטע», so the claim never survived to be checked,
and the tool drew the segment either way.

That is a defect **generator**, not one bug: the same shape produced #536 (a stated collinear ORDER is
neither enforced nor verified) and #859 (this noun's 3-D twin). Whenever a word carries an assertion and
the pipeline treats it as a pointer, the assertion is silently dropped — and the failures are invisible in
the prod logs by construction, because the student is told it worked.

### One predicate, two layers

`isRingDiagonal(ring, a, b)` in `geometry.ts` is the only place that answers *is this pair a diagonal of
this ring* — a pair non-adjacent along it, wrap included. Two layers consult it, and the division of labour
is not stylistic:

| layer | judges | because |
| --- | --- | --- |
| `applyStep` | claims the figure can ALREADY contradict — some polygon holds both labels and none makes them a diagonal | an immediate refusal is what teaches; this is 3-D's #859 guard |
| the givens verifier | claims only the FINISHED figure can settle — no ring holds both labels | the shape is not yet known, so the claim is not yet false |

The second row exists because of a measurement, not a preference. These two sequences are the *same shape*
at the moment the diagonal is typed — no polygon holds both labels:

```
משולש ABC · משולש DEF · אלכסון AD     ← fresh ink called a diagonal of nothing   (must be caught)
אלכסון AC · מלבן ABCD                 ← by the end, AC really IS a diagonal      (must stay green)
```

A single apply-time rule cannot separate them, and tightening the guard to refuse both rejects a correct
order. Deferring separates them for free, because by verification time the figure has stopped changing.
This is [ADR-104](06-decisions.md#adr-104)'s deferral principle applied to a **structural** claim rather
than a metric one: a claim that is not yet checkable is not yet false.

### The refusals teach

Two sentences, because they are two different mistakes: *"AB is not a diagonal of ABCD — it is a side"* and
*"AB is not a diagonal — ABC has no diagonals"*. The second is not a special case in the code — with n = 3
every pair of vertices is adjacent, so it falls out of the same predicate — but it is a special case in the
*explanation*, and telling a student who drew it on a triangle that "AB is a side" would teach nothing.
Both quote the statement, never internal state.

### What carries a claim, and what does not

The DERIVED plural («אלכסונים», «אלכסוני ABCD») computes its pairs from the ring and is right by
construction — checking it would only re-verify our own arithmetic. The explicitly NAMED pair form
(«AC ו-BD אלכסוני הריבוע») makes the same claim the singular does, and carries it.

## Telling a LABEL from a WORD in Hebrew (#968, [ADR-497](06-decisions.md#adr-497))

The convention nudge (#779) lifts `abcd` to `ABCD`, checks the corrected sentence parses, and shows it
without committing. #968 is the same mechanism one **alphabet** over — Israeli textbooks name vertices
א-ב-ג-ד — and it runs into a problem the Latin half never had: **every construct noun in this grammar is
also made of Hebrew letters.** «מלבן», «אלכסון», «זווית» and a label run like «אבגד» are the same script,
so the detector cannot key on script at all.

It keys on the alphabet **range** instead. Vertex labels are drawn from the START of the alphabet —
א-ט ⇒ A-I, nine letters, more vertices than any figure here needs — exactly as Latin labels come from
A-H. The geometry vocabulary essentially all carries a later letter:

| token | letters | verdict |
| --- | --- | --- |
| `אבגד` | א1 ב2 ג3 ד4 | **label** → `ABCD` |
| `בד` | ב2 ד4 | **label** → `BD` |
| `מלבן` | **מ13** ל12 ב2 ן(נ14) | word |
| `אלכסון` | א1 **ל12 כ11 ס15** ו6 ן14 | word |
| `זווית` | ז7 ו6 ו6 **י10 ת22** | word |
| `בין` | ב2 **י10** ן14 | word |

Two narrowings, both measured rather than assumed:

- **Final forms fold first** (ך→כ, ם→מ, ן→נ, ף→פ, ץ→צ). They sit past ת in the code block, so an
  unfolded read would place every one of them out of range by accident — right answer, wrong reason,
  and it would break the moment a label used one. This is the lexicon's ADR-3D-035 final-letter trap
  one layer down.
- **Only «ל» is stripped as a leading particle.** The real input needs it («לבא» = "to בא"), and the
  unstripped reading is preferred so «בד» stays the label BD. Widening the set to ב/ה/ו/מ/ש/כ was tried
  and **rejected on measurement**: it rewrites «שווה» to «ש-FFE», forfeiting the nudge on any sentence
  carrying that very common word, and buying nothing the real input needs.

**The proof gate is what makes the heuristic safe to be wrong.** A misread token simply produces a
candidate that does not parse, and the caller then says nothing at all — the student gets today's
escalation. So the failure mode of a bad guess is a *missed suggestion*, never a wrong one, and never a
rewritten sentence: nothing here is ever committed on the student's behalf.

Support for the alphabet itself is deliberately **not** built (operator ruling, 2026-09-10). It would
have to reach labels, RTL text direction (the #549 class), export, and every deterministic element id
(`seg-AB`) — a wide blast radius for a convention the notice can redirect in one line.
