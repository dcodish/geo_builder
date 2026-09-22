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
- **What the shape fingerprint reads ([ADR-065](06-decisions.md#adr-065), amended by [ADR-514](06-decisions.md#adr-514), #1005).** "Show another configuration" offers a candidate only when it is a genuinely DIFFERENT drawing, judged by a similarity-invariant fingerprint. That fingerprint reads **every extent the drawing has** — each pairwise distance between named points AND each drawn (non-`hidden`) circle's radius — normalised by their mean. The list is complete because only those two kinds of object carry a length of their own: a segment and a polygon edge ARE point pairs, an arc's radius is |centre − endpoint| between two named points, and a line has no extent. Reading points alone made the button answer "no other configuration" on «מעגל O» + «M מחוץ למעגל», whose only shape freedom is |OM| against the free radius.
- **The view delta ([ADR-517](06-decisions.md#adr-517), #65).** Applying a new view is the one moment BOTH views exist, so what «show another configuration» changed is a pure comparison (`replay/viewDelta.ts`), never a second search. It is judged on **similarity-invariant** quantities — a point by its distances to the other named points over the drawing's mean extent, a circle by its radius over that mean — because two seeds may differ by a whole-figure rotation and scale under which every coordinate changes and the drawing does not. Discrete choices (branch, variant) are explicit in the facts and need no measurement. The stored note carries the view it describes, so it retires itself when the session leaves that view.
- **Stability:** DOF parameters (free-point coords, on-object `t`) and branch indices **persist across steps**. A new constraint re-evaluates only what depends on it; unrelated objects keep their parameters, so the figure does not jump.
- **Over-constraint / contradiction:** before committing a step, check satisfiability. If unsatisfiable, reject the step, keep the previous figure, and surface a clear message. This is general (not triangle-only as in the old code).
- **A fact whose subject is gone ([ADR-483](06-decisions.md#adr-483), #926):** the fold asks `isSymbolBound` (in `engine/lower.ts`, beside the symbol table it reads) before applying a `set-var`; a value for a letter no statement binds is stamped into the same "no longer available" register as a point whose defining step was removed, so the row and the banner both say so. The table is whole-list, so a definition re-added anywhere binds it again. The ✎ edit seam (`app/editPipeline.ts`) compares the other rows' statuses before/after the replace and names any it orphaned, while still committing the edit.
- **Where the solve budget is consulted ([ADR-515](06-decisions.md#adr-515), #259).** The cooperative wall-clock budget (`engine/solveBudget.ts`) is armed only around VIEW searches — "show another configuration", the auto-resolve config search, the shared detection sampler, the admissible-set enumeration — never around the primary submit fold ([ADR-281](06-decisions.md#adr-281)): a solvable figure must build whatever it costs. It is consulted at two granularities: between recruit experiments (`step.ts`) AND **inside the innermost loop, `nelderMead`'s descent in `evaluate.ts`** — because one experiment's joint solve is itself unbounded, and without the inner consult a 12 s budget let the #207 ladder run 32 s without checking once. Unarmed, the consult is a null check, so the engine is bit-for-bit unchanged.
- **A refusal names what the rule matched ([ADR-528](06-decisions.md#adr-528), #1266/#1267).** A rule that recognised a construct and rejected it on the geometry answers through `Clarify` — the fifteen-member vocabulary `refusalOf` maps and `runSubmit` arms — never `not-handled`, which means "no rule owns this sentence" and costs a paid call to say nothing. A cevian's stated side («לצלע BC», «אל BC», "to side BC") has ONE reader, `statedSide`, called by the median, the altitude and the bisector; the bisector also CHECKS it, because the bisector from a vertex meets the opposite side and only that one. Its stated TRIANGLE («במשולש ABC», "in triangle ABC") has one reader too, `statedTriangle` ([ADR-540](06-decisions.md#adr-540), #1285): read before the letter hunt and removed from it, and not decoration — apex C in ring ABC IS ∠BCA, so the triangle form answers where the bare form must ask (`ambiguous-angle`), and a lone vertex letter that is not the segment's first letter is refused as `bisector-wrong-apex`, quoting both.
- **A bound’s aim is not its test ([ADR-529](06-decisions.md#adr-529), #1265).** ADR-390 aims a free bounded measure a visible gap inside its region so the drawing does not read as an equality — that aim is the residual and its tolerance, exactly as written, and the optimizer follows it. **Acceptance is a different question**, answered for the two bound kinds directly in `isSatisfied`: does the stated inequality hold, with the ≥-vs-> distinction carried from the parser through the command into the constraint (absent ⇒ strict)? A strict bound excludes its own value by more than an equality’s own tolerance can absorb, or «BC > 10» and «BC = 10» would both report satisfied. So a bound alone still draws visibly inside, and a later given pinning the measure ON its bound is honoured rather than refused. **The edge never enters the aim**: folding it into the residual moved the angle target and made «זווית ABC גדולה מ-40» unsolvable at 18 of 40 seeds (#281’s lock, measured mid-build).
- **A crossing is refused when its own letters make it an existing point ([ADR-531](06-decisions.md#adr-531), #1274).** The check sits INSIDE `cross`, the single emit point of the two-named-lines family, not at its three call sites — so a fourth spelling cannot reach `line-line-intersection` around it; the other emitters derive their pairs from a polygon and cannot produce the shape. It travels the `Clarify` road, so the refusal names the holder, quotes both carriers, keeps the student's text and spends no model call. The boundary is ADR-123's: this refuses a NEW letter at an occupied position, never two existing points the givens drive together. ADR-489's within-margin exemption is KEPT — no sentence reaches that shape now, but `rename` and `merge` still can.
- **The letter-holder question ([ADR-520](06-decisions.md#adr-520), #238).** "Who holds this letter, and can it be taken back?" is answered in ONE place (`letterHolder`, `store/geoStore.ts`) and returned with every `target-taken` refusal — from `renameFacts` and `nameCentreFacts`, the only two guards that have that reason (swap and merge REQUIRE a taken target, so neither has one). Reclaimable means dropping the holder removes the letter **and nothing else**: nothing else mentions it, and every point the holder introduces that did not exist before it is that letter. Asked as a question about the figure rather than about a command kind, it covers the undone step, the deleted-then-recreated construction and the ADR-010 auto-dropped dependent without enumerating any of them. `reclaim` re-asks it before acting, so the offer can never become a quiet delete.
- **A point-menu control declares its own colour ([ADR-520 Am. 2](06-decisions.md#adr-520), #1277).** `ctrlBtn` carries `color: var(--color-text)` rather than leaving it to the cascade: the swap offer sits inside the holder note's muted block and inherited `--color-text-muted`, so a live button read as disabled. Whether a `<button>` inherits `color` is UA behaviour this code does not control — measured both ways in the same app — so every menu control states its colour, and a future one nested in a coloured block cannot go quietly grey.
- **Fit transform:** map computed coordinates into the viewport; persist the transform so the view is stable across steps.

## 5. Input layer

A single boundary: `utterance → command[]`.

- **Primary — deterministic grammar parser.** Handles the common, bounded geometry phrasings in Hebrew and English (shapes, points-on, distances, angles, special lines). Free, offline, instant.
- **Fallback — Claude API.** Only when the parser cannot confidently parse. Model: `claude-haiku-4-5` (sufficient for short structured extraction; far cheaper than Opus/Fable). Calls go through a **server-side proxy** that holds the key (never in the browser), is gated, and is rate-limited. `max_tokens` and prompt size kept minimal.
- The engine is agnostic to which path produced the commands.
- **The input preview seam carries bidi AND maths (#997, [ADR-504](06-decisions.md#adr-504)).** The shared
  `InputArea`'s `preview` prop is fed by one previewer: the maths renderer when the line has maths, else
  `inputPreview` — the student's own mixed Hebrew+Latin line through the bidi isolator with the live-tail rule,
  shown only when isolation would change the layout. The box itself stays raw (isolates cannot live in an
  editable value; forcing LTR is what #118 reverted). The 3-D twin is `inputPreview3` (ADR-3D-123).
- **One vocabulary home (#361, [ADR-501](06-decisions.md#adr-501)).** `src/parser/lexicon.ts` holds the
  keyword and token atoms the grammar composes from — and only atoms the grammar actually consumes. A rule's
  keyword alternation (`INTERSECT_KW`, `BISECTOR_KW`, the parallel pre-test) is compiled from the lexicon
  fragment, never spelled a second time; `lexicon-consumers.test.ts` fails on any exported atom nothing
  composes from, the twin of the ratchet that fails on inline fragments growing. The 3-D grammar keeps its own
  leaf (`src3d/lexicon/nouns3.ts`); the trees never share vocabulary by import.
- **The number atom refuses a Hebrew particle's maqaf as a sign (#975, [ADR-505](06-decisions.md#adr-505)).**
  `NUM` is `(?<![א-ת])-?\d+(?:\.\d+)?`: a hyphen glued to a preceding Hebrew letter («ל-90», «מ-5») is the
  particle, so the digits match unsigned; a hyphen after a space, `=`, `(`, `,` or at line start is a sign.
  The guard is zero-width, so the atom stays capture-free and every consumer inherits it — "particle or
  sign" is answered once, in the lexicon, never per rule.
- **Contextual plurals resolve against a per-family context registry (#554, [ADR-503](06-decisions.md#adr-503)).**
  A follow-up line that names no object of its own — «המשיקים נחתכים בנקודה E» — resolves the definite
  plural against what the figure already holds, read off the construction into `ParseContext`: the
  common-tangent family through `ctx.commonTangents`, the tangents-at-points family through
  `ctx.tangentLines`. Exactly two candidates ⇒ build; more ⇒ a clarification of the ADR-490 family
  naming the candidates (`tangents-ambiguous`), never a guess; fewer ⇒ not that rule. A family's
  one-utterance form and its incremental twin emit the same commands, so the figure cannot depend on
  which spelling the student chose.

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
                 - THE COMMIT SEAMS AND THE POST-COMMIT SEARCH (ADR-518, #1041). Three store actions
                   change the fact list; the configuration search is a property of the SEAM, and the
                   list below is an assertion in `app/__tests__/issue-1041-edit-resolve.test.ts`,
                   not a comment:

                     commitCommands (submit)  → resolveAfterCommit, via submitPipeline
                     replaceGroup   (✎ edit)  → resolveAfterCommit, via editPipeline   ← was missing
                     removeGroup    (delete)  → EXEMPT, measured (see below)

                   ADR-510 moved the search off-thread into the callers and re-armed only the submit
                   one; `replaceGroup` kept a comment describing a connection that did not exist, and
                   also resets the seed to 0 (ADR-484), so an edit discarded the student's working
                   configuration and then did not search. `EditDeps.resolveAfterCommit` is REQUIRED,
                   so `tsc` names every call site — the compile-time half of the inventory.
                   `removeGroup` is exempt on measurement, not on taste: across 12 deletions, a
                   satisfiable remainder was valid at seed 0 every time and a broken one had no valid
                   seed at all, so no case exists where the search would rescue a recoverable figure.
                   Siblings: 3-D wires its edit seam synchronously inside `replaceFact`
                   (`seedForRequirements`); complex has no configuration search to wire. The general
                   mechanism — a decision reachable from no test gets reproduced — is #1132
                 - errorSubject.ts (ADR-487, #943): `utteranceForError(facts, status, raw)` — WHICH
                   sentence a refusal is about. Pure over its three inputs; it exists because
                   `humanizeError` is deliberately figure-free (ADR-228 Am.6), so the student's own
                   wording must be handed to it by the layer that has the fact list. The link needs no
                   plumbing: ADR-398 already makes the banner's `lastError` and the failing row's
                   `status` the same string, so the owning fact is found by that identity
                 - AGAINST WHAT (ADR-508, #943 half B): `otherUtteranceForError(facts, raw)` resolves
                   the structured `[vs #<index>]` tail the fold appends to an over-constrained status
                   into that earlier statement's words; `humanizeError(raw, t, said, other)` then
                   renders the `_said_vs` variant («X» סותר את «Y»). The tail is an INDEX because
                   statuses live by index and a dry-run trial shares the committed fold; the fold names
                   none when no single earlier statement's removal restores feasibility, and the
                   `_said` wording stands. The search itself runs in the fold's attribution pass (next
                   bullet), only on a refused statement, through its own memo, never nested
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

**The mode had to be added by hand to two rules — and that duplication is now retired**
(#970, [ADR-500](06-decisions.md#adr-500)). When #967 landed, `angleArms` had only two callers (the
numeric and symbolic value lanes), while `angleAcuteness` and `boundOperand` still kept their **own
copies** of the triple/single-vertex lanes — the #831 remainder, never migrated. So the new mode was added
to them explicitly and *additively*, leaving their existing lanes untouched so no reading changed, and the
duplication was recorded here rather than left implicit: a fourth naming mode would have had to be copied
three times, and the forgotten copy reproduces #831's defect exactly.

ADR-500 retired both copies. All three call sites now read through `angleArms`, and the migration was
measured rather than assumed — a 498-case differential, 132 cells changed, **0 real regressions**, of which
115 were a refusal *improving* from an escalation to a named clarification. Two things fall out that are
worth keeping in view when the next mode is added:

- **A refusal channel is part of a reader's contract.** `boundOperand` could not carry one — its return
  type had no room for it — so «הזווית בין BD ל-CA גדולה מ-40» escalated to the paid model while the
  identical naming in a *value* statement was refused by name. Widening the type enumerated the five call
  sites that had to propagate it; returning `null` would have preserved the silence and told no one.
- **The chokepoint is only real when nothing else answers the same question.** #831 declared this
  chokepoint and was still true of the code it touched; the guarantee failed because two rules that also
  answered "which angle is named" were never brought in. A declared single reader with unmigrated callers
  is not a chokepoint, it is a convention — and conventions are what #967 paid three edits for.

**The refusal is part of the capability.** Two segments that never meet have no vertex between them, and
2-D has no line-line angle constraint — *every* angle constraint here is vertex-anchored
(`set-angle`, `-bound`, `-ratio`, `-order`, `-acuteness`, `measure-angle`). So the honest answer is neither
a guessed vertex nor an escalation (which hands the model the same invention to make): it is
`angle-sides-disjoint`, quoting both segment names back — a member of the clarification family above, by
the same reasoning. 3-D accepts these because it has a direction/`claim` substrate that 2-D does not; the
parity is in the *addressing mode*, not in the constraint kinds behind it.
### The other half of the same statement: the VALUE (#969, [ADR-498](06-decisions.md#adr-498))

The section above unifies **which angle is named**. #969 was the same defect in the half it does not
cover — **what is said about it** — and it is worth reading the two together, because the second one
happened *while the first one's guarantee was true*.

The value half splits by kind: a number goes to `angle`, a symbol to `measureAngle`. Until #969 they did
not merely take different values, they **located** them differently:

| | how it finds the value | copulas it accepts |
| --- | --- | --- |
| `angle` (numeric) | **positionally** — any standalone number in the line | all of them, implicitly; it never needed one |
| `measureAngle` (symbolic) | **syntactically** — after a literal `=` | exactly one |

So «זווית ABC = 2α» bound the symbol, and «זווית ABC היא 2α» fell through to the numeric lane, whose
number scan found the **coefficient** `2` and committed 2° — the student's α gone, the line green.

The repair is not a copula list. The numeric lane has no list to copy: a list would be incomplete against
its sibling on the day it was written. Both kinds are located the same way instead —

```
stripped ──► angleValueOf ──► { kind: 'num', … } ──► angle          (set-angle)
                          └─► { kind: 'sym', … } ──► measureAngle   (measure-angle)
```

— with a symbolic value read as the **trailing expression** of the statement, exactly as a numeric one is
a standalone number in it. Two guards are what let the `=` go, and both exist because a symbol is spelled
like a label where a number is self-identifying: the symbolic read is **end-anchored** and must be
**preceded by a non-letter**. Without them «זוית abc» reads as the value `c`, and "angle ABC is acute" as
the value `e`.

Three consequences worth stating, because each is a place the old shape leaked:

- **A comparison is a region, not a value** — in *both* alphabets now. «זווית ABC גדולה מ-α» would have
  been claimed as the equality ∠ABC = α once the `=` requirement went, so `COMPARES_WITH_SYMBOL` joins
  [ADR-390](06-decisions.md#adr-390)'s numeric tripwire. Both bails live with the reader, not in one rule:
  a guard only one lane applies is the exact shape of this bug.
- **The numeric rule refuses a symbol instead of valuing it.** Reaching `angle` with a symbolic value means
  the symbolic rule could not *name* the angle; committing the coefficient there would be #969 again. It
  returns `null`, and the utterance escalates honestly.
- **The naming modes come along for free.** #967's segment-pair mode was added to `angleArms` alone, so
  «הזווית בין BD ל-BA היא 2α» binds the symbol with no new code. That is the property both halves of this
  rule pair exist to have, and it is asserted in the locks rather than assumed.

The general lesson, and the reason this is documented next to its sibling rather than in its own section:
**a chokepoint that unifies one half of a statement leaves the other half free to re-split.** #831 unified
the naming half and said so; the value half stayed split for eleven months underneath that sentence.
### The relation half: where the right-hand side starts (#976, [ADR-507](06-decisions.md#adr-507))

**The verbose LENGTH frame routes by its connective** ([ADR-524](06-decisions.md#adr-524), [ADR-539](06-decisions.md#adr-539)).
`normalizeVerboseLength` reads «אורך/הצלע/הקטע <seg> <connective> <value>» and asks one question of the
connective — not what the sentence means, but WHICH rule owns it: a copula (the closed allowlist
`LENGTH_COPULA`: nothing, «=», «הוא», «שווה ל») → `<seg> = <value>` for the equality rule; a relation
(`LENGTH_RELATION`, built from the bound rule's own atoms — the glyphs, `CMP_BIG`/`CMP_SMALL`,
`CMP_AT_LEAST`/`CMP_AT_MOST`, «בין») → the frame stripped and `<seg> <connective> <value>` handed verbatim
to `measureBound`; anything else → untouched, failing closed. The two sets are disjoint by construction and
never merged into one alternation — a relation word beside the copulas is how a bound became an equality
(#1248, the P1). `CMP_AT_LEAST`/`CMP_AT_MOST` are the non-strict words («לפחות», «לכל היותר», "at least",
"at most"): the bound rule lowers them with `minStrict: false` / `maxStrict: false`, the ADR-529 fields.

ADR-498 stopped the VALUE lanes from locating by copula. The RELATION readers — `angleEquality`,
`arcEquality`, `measureSum` — still split the line on the literal `=`, so «זווית ABC היא זווית DEF» was
`not-handled` while «= זווית DEF» and «שווה לזווית DEF» worked. The seam has ONE home: `normalizeWordEquality`
(the #185 chokepoint) rewrites a word copula to `=` when a labelled angle/arc reference follows — the bare
«היא» / «הוא» / «שווה» and "is" / "are" now join «שווה ל» / "equals" / "is equal to" there, with an optional
coefficient and article allowed in the lookahead. The **label requirement** in the lookahead is the guard:
«היא זווית ישרה / קהה / חדה» and "is a right angle" carry an adjective, not a label, and keep their lanes; a
copula before a value never reaches the seam. A copula before a bare number or a segment stays out by the
2026-07-17 ruling (word equality is narrowed to angles/arcs and degree values). No relation rule knows a
copula — a new spelling is a lookahead row here, never a regex in three rules.

**The bare copulas are ANGLES only** (#1000, [ADR-533](06-decisions.md#adr-533), operator ruling
2026-09-14). ADR-507 admitted them for angle and arc references alike, in one step. That was never wrong
for angles and never right for arcs: «זווית ABC היא זווית DEF» compares two MEASURES, while
«קשת CD היא קשת DE» says one arc IS the other, which between two differently-named arcs is not a claim.
The seam reads structure and this distinction is semantic, so it is drawn at the KEYWORD — the arc
keywords come out of the two bare-copula rules, and stay in the two explicit ones (`שווה ל` /
`equals` / `is equal to`), which are the canonical spellings.

**What the narrowed spellings meet is a refusal that TEACHES, not `not-handled`.** `not-handled` is the
LLM escalation seam, and escalating a form the tool deliberately declines asks a paid model to accept
the very spelling that was ruled out. `arcEquality` already owns *"this is an arc relation sentence"*,
so the guard sits at its head and returns an owned `arc-copula` clarification carrying the two arc
labels — the same channel as `cevian-wrong-side` and `crossing-already-named`. The offered sentence is
the student’s own line with one word changed, and it is **driven** in the lock rather than written out
beside the message, because a remedy that returns the same refusal is the #1156 failure mode.

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

## An unstated choice is SAID (#973, [ADR-502](06-decisions.md#adr-502))

The engine leaves an unstated choice free (ADR-052) and cyclable (ADR-138); this layer **names** it. One
pure derivation, one table, one text builder, two render sites:

- **`unstatedChoices(facts)`** (`engine/shapeVariants.ts`, the file that owns "which pair is unstated")
  folds the enabled facts into the choices the tool is currently making. It is a table keyed on the fact's
  commands — `equal-pair` (kite / isosceles: the drawn pairs read from the ACTIVE variant, pinned by a stated
  equality on any variant's pair), `free-endpoint` (a base-less midsegment: which side the free end rides,
  pinned by «G על PR»), `parallel-pair` (the isosceles trapezoid: the lowering assumed AB ∥ DC, pinned by a
  stated ∥ on two ring sides). A new shape is a row — `midsegment-free` (#1368, [ADR-545](06-decisions.md#adr-545)) is one: with NOTHING named the whole configuration is unstated, so the row names the side the midsegment ended up PARALLEL to, which determines both endpoints. **Derived on every render** like `hasVariant`, so the
  note appears with the fact, follows the cycle, and vanishes when a later fact pins the choice or the fact
  is disabled, removed or broken. Nothing is stored.
- **Two midsegments, two shapes, two counts (#1368, [ADR-545](06-decisions.md#adr-545)).** `midsegment` has TWO variants and `midsegment-free` THREE, and they are separate `VariantShape`s rather than one shape with a bigger count. `midsegment` is used when the student has already placed an endpoint on a side, so that side is **stated** and only the other is free; `midsegment-free` is «קטע אמצעים» with no arguments, where the choice is which of the three sides it is parallel to. Raising `midsegment` to 3 would let «show another configuration» move the student's endpoint **off the side they named** — a variant that contradicts a given, which inverts what the channel is for. **The rule the pair encodes: a variant explores what was not stated, never what was.**
- **A gate that enumerates shapes is a chokepoint.** `droppedMidsegment` tested `shape === 'midsegment'` as a literal, so a new midsegment form read as a DROPPED one and a correctly-parsed utterance was refused. Consumers now ask `MIDSEGMENT_SHAPES` (exported by `shapeVariants.ts`), so a fourth form cannot silently fail a gate written when there were two. The failure mode is worth naming: an out-of-date gate refuses CORRECT input and reads exactly like a parser bug.
- **The trapezoid's ring in force (#989, [ADR-506](06-decisions.md#adr-506)).** The `trapezoid` lowering makes
  sides 0 and 2 of the ring it receives parallel, and `trapezoidRingInForce(ids, statedParallels)` (same file)
  is the ONE reader of which ring that is: as named (AB ∥ DC for «טרפז ABCD»), rotated by one when a stated ∥
  names sides 1/3 and none names 0/2 — so a stated pair PINS the assumption instead of stacking a second
  parallel pair (a parallelogram under the morph flag). The replay pre-scan (the ADR-341 `trapRotate` seam)
  lowers the fact on that ring and re-seats the isosceles macro's leg equality (tagged `trapezoidLegs`, the
  ADR-239 `softPair` shape) onto the legs in force; the theorem spine's `parallelPairs` and `unstatedChoices`
  (pinned ⇒ no note) read the same ring. In `apply.ts` the derived vertex is whichever ring vertex is still
  missing (`trapezoidDerivedSlot`) and `trapezoidOffset` derives it so the ring's pair is parallel from every
  seat — the trapezoid's ring is never rotated by the composition normaliser, because a rotation by one is
  exactly what swapped the pair with typing order («משולש ABC» then «טרפז ABCD» drew BC ∥ AD). Not cyclable:
  #973's ruling — an assumption the tool SAYS until the student states it.
- **`unstatedChoiceText(choice, t)`** (`ui/unstatedChoice.ts`) builds the sentence in the student's
  language: what is drawn, the canonical pinning sentence (a form the i18n net types as the next line and
  asserts removes the note — measured, never assumed), and the cycle button's own label. Templates under
  `steps.unstated*` / `steps.state*` in both locales; the kind list is a runtime export the net walks.
- **Render:** on the fact's own row (persistent), plus one quiet cue beside «הציגו תצורה אחרת» with the
  same sentences as its tooltip. The plain «טרפז ABCD» was excluded at first and joined on the first play
  (#996, ADR-502 Am. 1) — the table gained a row, which is what the table is for. A suggested pin sentence is
  always a bare next line (#997): a parenthesised Latin run inside a Hebrew sentence reorders in the box while
  it is typed.

## The knowledge pool of a DETERMINED figure is its admissible set (#434, [ADR-509](06-decisions.md#adr-509))

The relations layer's definite values, the values panel and the forced crossing dots all read ONE shared
sample pool (`samplingJobs` / `sharedSamples`, `replay/core.ts` — the M3 "one sampler" law). Their
knowledge gates ask "is this the same in every configuration?", and the pool is what "every" means.

- **Under-determined figure (count > 0):** unchanged — every shape-variant config × 16 seeds, filtered by
  the validity ladder; the gates need ≥ 4 valid samples before a NUMBER prints (ADR-295/#88).
- **Determined figure (`freeDofCount === 0`, one variant):** the pool was ONE sample, on the theory that one
  configuration is every configuration. Two things break that theory. A count is arithmetic and can lie
  (the ADR-424 class — a redundancy pattern pushes it to 0 while the figure still moves with the seed:
  «AB=BC=8» read 0 and printed ∠ABC = 31°, one seed's accident). And a seed can never reach a BRANCH or a
  right-angle SEAT — the quarter-circle figure is rigid at each seat, yet the seat at B (admissible, one
  «הציגו תצורה אחרת» press away) gives |AB| = 11.18 against the printed 18.03. So the pool is now the
  **admissible set**: seeds {s, s+1, s+2} of the current facts (through the same filter ladder), × every
  discrete rewrite «הציגו תצורה אחרת» applies — every cyclable branch point's branches crossed with the seat
  (`admissibleRewrites`) — kept only where `meetsRequirements` holds (the button's own bar). Reflection masks
  are subsumed by the seed axis (measured on the corpus); the `inscribe` variant stays out (ADR-262).
- **Bounded, failing CLOSED.** The cross product is capped (`ADMISSIBLE_REWRITE_CAP`); over the cap, or when
  the sample budget cuts the enumeration short, the pool is marked **not determined** and the gates fall
  back to their ≥ 4 floor — values and dots withheld, relations still read off the samples in hand — exactly
  as an under-determined figure is treated. A partial set never prints a number the missing configuration
  refutes.
- **The gates trust a MEASUREMENT, not the count.** The pool carries `determined` (count 0 AND the set
  complete), passed to `detectRelationsAcross` (`opts.determined`), `computeValuesPanel` and
  `forcedCrossingKeys`; each keeps the count as its fallback for a hand-built pool. Nothing else changes:
  a value that disagrees across the admissible set is withheld by the "same in every sample" test that
  already existed; a genuinely determined figure's samples are identical and it prints as before.
- **Cost:** a few replays per determined figure at panel/relations time in the worker, memoized per fact
  list, never in the submit path. A rewrite that is INFEASIBLE pays the recruiter ladder to conclude it
  (the #259 class — 96 s deadline-free on the quarter-circle figure); in prod the 5 s sample budget cuts
  that and the figure falls to the not-determined branch above.
## The submit transaction: facts commit, the seed resolves after (#364, [ADR-510](06-decisions.md#adr-510))

- **The commit** (`commitCommands` / `replaceGroup`, `store/geoStore.ts`) is the facts alone, in one zundo
  entry, at the student's CURRENT seed (an ✎ edit resets to 0 first — ADR-484). No synchronous seed search
  runs inside it any more; `main-thread-sweeps.test.ts` records `firstSatisfyingSeed` at 0 on the store.
- **The resolve** is the post-commit `resolveAfterCommit` (App) → `runViewResolve` (`app/resolveView.ts`) →
  `geoWork.autoResolve` (the worker): `meetsRequirements` decides whether anything is wrong (statuses,
  violations, extension orders, segment-meets, distinctness, convexity — a superset of the old trigger), and
  `findValidConfig(facts, seed)` sweeps FROM THE CURRENT SEED (its first tier is `firstSatisfyingSeed`), so
  the view the student holds is preferred over any other valid one (M2). The found view is applied under a
  paused history, merging into the commit's entry — one undo removes the fact and restores the seed.
- **What the student sees:** the violating configuration may paint for ONE frame before the worker's answer
  lands (the flash the operator accepted, 2026-09-11) instead of a tab frozen for up to 2.5 s. While the
  search runs, the keep-prior slot (#573) holds the last good view where it exists.
## A free point's admissible region rides on the point (#556, [ADR-511](06-decisions.md#adr-511))

- **Declaration.** A construction whose success needs a free operand on one side of a circle — the apex
  of a tangent or a secant, a student's own «M מחוץ למעגל» / «M בתוך המעגל» — says so through the ADR-254
  side record (`point-circle-side`), emitted right after the operand's own placement. The rule keeps its
  default; the record is the statement's implication made explicit (ADR-052).
- **Record.** The `point-circle-side` apply case (`engine/apply.ts`) is the family's ONE chokepoint: it
  seeds a new free point on the stated side, re-seats an existing non-pinned one only when it is on the
  wrong side, and in both cases writes the region onto the point — `FreePoint.region: { circle, side }[]`,
  one entry per circle. A pinned point (the student's explicit placement) is never moved or annotated.
- **Sampling.** `applySeed` (`engine/sample.ts`) judges each region-bound point on the SAMPLED figure's own
  circle — one evaluate of the sampled construction, or of the prefix up to the point with the constraints
  it can satisfy when the full figure cannot build — and re-seats a wrong-side sample radially with the
  point's own rng (outside → [1.15, 1.8]·r, inside → [0.25, 0.7]·r). Deterministic per seed; seed 0 never
  samples, so the drawing the student first sees is unchanged.
- **Judgement stays where it was.** The verifier reports a contradicted side; `meetsRequirements` gates
  «הציגו תצורה אחרת» on it. The sampler now proposes configurations that pass that bar instead of ones the
  bar discards (the two-tangents figure lost 7 of 24 seeds that way).
## The meeting re-seat is routed by a predicate (#260, [ADR-512](06-decisions.md#adr-512))

- **The question, asked once.** `meetingCarriers(objects, cmd)` (`engine/apply.ts`) decides whether a
  command asserts that a point is the MEETING of two carriers — a named segment-meet (`onSeg`), the
  point-free crossing statement (`segments-cross`), a rider named onto a second host (a `set-collinear`
  whose one on-segment rider's host differs from the other two points). `applyCommand` asks it before its
  switch and calls `reseatLooseMeetEndpoint` (ADR-255) with the two carriers; no case calls the re-seat by
  itself. A new member of the family is a row in the predicate, never a fourth call site.
- **Which endpoint moves.** Every endpoint of both carriers is a candidate once the crossing lies off either
  segment: fewest dependents first (the point the figure leans on least), the off-segment's own endpoints
  first on a tie (so the older sites behave as before). Only a non-pinned free point that no constraint
  references and no directive drives is ever moved; the aim is the ray from its mate through the other
  carrier's midpoint, kept in general position and on the same side of every circle (ADR-253/254).
- **Anchors.** The general-position test ignores the carriers' own on-segment riders — they follow the
  endpoints, and the meeting rider is what the statement re-solves (a free rider sits at its host's
  midpoint by default, exactly on the aim line).
- **Positions ride along.** `reinterpretAsCollinear` (step.ts) passes the previous positions into
  `applyCommand`, so the second-membership path sees where the crossing lies.
## A declared polygon the givens force FLAT is said out loud (#945, [ADR-513](06-decisions.md#adr-513))

- **The channel.** `Derived.degeneracies` (`replay/core.ts`) sits beside `coincidences` and `forcedOffArc`:
  derived purely from the resolved construction on every replay, so a loaded figure and a typed one say
  the same thing, and nothing is stored. The App shows it as an ⓘ notice — never a refusal, never amber.
- **The predicate** (`engine/degeneracy.ts`, `degeneratePolygons`): for each declared polygon, the greatest
  vertex offset from the line through its two most-separated vertices, over that separation — the same
  measure the ADR-413 accept gate uses, judged against the polygon's OWN extent (a small polygon in a big
  figure is judged by its own size), with `DEGENERATE_EXTENT_RATIO` calibrated on the 2-D corpus (the
  ADR's table). The accept gate refuses a DRIVEN collapse below 1e-4; the notice covers the band above it
  where a construction the givens force flat used to draw silently. Polygons only: a segment or circle
  whose extent collapses is a coincidence of named points, which ADR-123's channel already says.
- **Naming the statements** (`nameDegeneracies`, the ADR-492 prefix rule): walk the enabled statement
  prefixes; the first that contains the polygon is its declaring statement, the first at which it is flat
  is the responsible one. Runs only when a degeneracy exists, one replay per prefix, and never nests (a
  prefix replay inside the scan reports the predicate alone). The engine carries fact ids and a number;
  the wording is the chrome's, in the student's own words (`figure.degenerate`, He + En).

## What counts as "produced": a display-only command declares itself (#1011, [ADR-519](06-decisions.md#adr-519))

`dryRunOutcome` answers one question — *did this line do anything?* — and it answers it by looking at the
FIGURE: did the construction grow, did a degree of freedom go, did the scale become fixed, did a point
move. When the answer is no everywhere, the student is told «זה כבר קיים באיור» and the line is not
committed. That is right for a genuine restatement and it is how a stated given can never be silently
swallowed.

**A display-only command breaks the assumption behind it.** Revealing a hidden centre, resolving a
hidden circle, drawing a valueless angle arc — each changes what the student sees and touches none of
the four signals. There is nothing in the figure for the gate to notice, so the gate has to be told.

It used to be told by a list written inside the gate, and the list grew one entry at a time as each
display feature was found broken in play. Membership is now a **declared property** —
`DISPLAY_ONLY` in `engine/types.ts`, beside the command union, typed against `AnyCommand['type']` so a
non-existent kind is a compile error — and `dryRunOutcome` consults it. A new display command therefore
inherits the answer at the moment it is written.

Two rules keep it honest:

- **An exact re-statement is excluded**, the same way `dataOnly` excludes one. Saying the same mark
  twice genuinely has already been done, and a second arc drawn over the first would be the opposite
  defect.
- **It asserts nothing.** A display command must leave `freeDofCount` and the constraint list
  unchanged; a command that removes freedom is a GIVEN and belongs in the ordinary lane, where the
  geometry signals already see it. The lock asserts this, because the moment a "display" command starts
  constraining, the gate is being told something false.

The membership is tested at the gate the app calls, never below it: #1011 reached a play session at all
because the feature's own lock drove the store directly and never crossed `dryRunOutcome`.

## Re-reading a role-assigned letter run ([ADR-521](06-decisions.md#adr-521))

Between the dry run and the refusal, `app/submitPipeline.ts` asks `app/roleReadings.ts` one question:
*what else could that letter run have meant?*

The answer is produced by **rewriting the utterance** and handing it back to the same parser — so no
rule grows a second convention, and the alternative is a sentence the student could have typed, which
is also what is taught back to them. The module keys off the `arc` a construct emits, so it speaks for
the whole family (`רבע מעגל`, `גזרה`) rather than for one rule.

| step | what it costs |
| --- | --- |
| no role run in the utterance | nothing — `roleReadings` returns `null` before any work |
| ordering the readings | nothing — a probe over the figure the student ALREADY has |
| a reading that builds | one dry run, because the probe put it first |
| no reading more promising than the stated one | nothing — the refusal keeps today's cost |

The probe is the construct's PINNED central angle measured across the configurations already sampled;
a construct that pins no angle (a general sector) leaves it unscored rather than inventing a target.

**`produced` is not the adoption test.** It means something was built, not that the construct's promise
holds, so an adopted reading is checked against that promise — equal radii, and the pinned angle
(`honoursConstruct`). Answering a refusal with a wrong figure would be worse than the refusal.

### The commit-seam inventory ([ADR-522](06-decisions.md#adr-522))

Six store actions reset the seed, and every one is a seam that must decide whether to launch the
post-commit configuration search. The inventory is an assertion, not prose
(`issue-1041-edit-resolve.test.ts`), because prose is what let #1041 and #1133 happen:

| action | what it does | search |
| --- | --- | --- |
| `commitCommands` | a statement is added | yes — `submitPipeline` |
| `replaceGroup` | a statement is replaced | yes — `runEditCommit` (#1041) |
| `setGroupEnabled` | a group's tick flips | yes — `runSetGroupEnabled` (#1133) |
| `toggle` | one fact's tick flips | yes — `runToggleFact` (no UI caller yet) |
| `remove` | one fact is deleted | yes — `runRemoveFact` (measured: a partial group can strand) |
| `removeGroup` | a whole statement is deleted | **exempt**, measured (ADR-518) |

The rule the table encodes: **a seam that ADDS a requirement back searches; one that only relaxes need
not.** Deleting a whole statement only relaxes. Re-enabling, and deleting one fact of a group, do not.
