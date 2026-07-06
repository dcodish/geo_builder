# 18 — Theorem Discovery v2: relevance-first replan (Phase 6b+)

_Drafted 2026-07-06 from the operator's dissatisfaction review: **"theorems that should appear don't appear, and it seems pretty random what theorems are presented."** This is the deep replan of the theorem-discovery feature on top of the Phase-6a spine ([16-theorems-plan.md](16-theorems-plan.md), ADR-208…224). Status: **ACCEPTED — decision-complete (2026-07-06). T1 BUILT ([ADR-235](06-decisions.md#adr-235), 2026-07-06): the coverage disposition map + totality guards, the measured fill order ([reports/theorem-fill-order.md](../reports/theorem-fill-order.md)), the full 22-question B-series corpus gate (membership assertions, `gaps` bucket documents today's misses), and the §9.5 feed-audit harness. Next: T2 (coverage fill) in the measured order — its evidence worklist is enumerated in ADR-235.** All §8 decision boxes were resolved by the operator one-by-one the same day (full catalog · converses as amber prompts · bands/no-percentages · default stays L1 · intent hints approved · subsumption folds with a label · principles catalog in 10-pedagogy). The §7a L2/L3 cutoff is accepted._

The operator's target, verbatim intent (2026-07-06):

1. **The user enters the inputs → the relevant theorems appear, prioritized — most relevant first.**
2. **Three levels of discovery**: level 1 uses only the user's inputs; levels 2–3 also read what *emerged* in the diagram (kites, bisectors, midsegments, similar triangles…) and offer theorems about those — as **hints**.
3. **NEW — intent inference**: from the *constellation* of givens, estimate what the question is pointing at ("three equal segments given → probably congruent triangles or the angle-bisector (חוצה זווית) theorems") and hint accordingly.

---

## 1. Diagnosis — why the current feed disappoints

The 6a architecture (pure `src/theorems/` spine, authored `THEOREM_TABLE`, coordinate-free `MatchCtx`, salience/tier axes, the ADR-219 discovery dial) is sound and stays. The dissatisfaction has four **structural** causes, none of which is "a matcher has a bug":

### R1 — Coverage: 66 of 109 catalog theorems cannot appear at all

`THEOREM_TABLE` holds **43 of the 109** numbered theorems (+201 +6 appendix). It grew corpus- and session-driven (each operator report added a family — ADR-209/211/214/215/217/218/220), so entire families a student actually solves with are absent — *including the operator's own motivating example*:

| Absent family | Ids | Why it hurts |
|---|---|---|
| **Congruent triangles** | 18, 19, 20, 21 | The operator's "3 segments → congruent triangles" example **cannot surface today** — the criteria aren't tabled. |
| **Midsegments** (triangle + trapezoid) | 62–67 | The construct exists (ADR-199/222) and the user names it explicitly ("mid sections") — zero theorems behind it. |
| **Medians / centroid** | 15, 16, 17 | A stated median (named construct since ADR-035-era) announces nothing. |
| **Right triangle** | 29, 30, **31** (median-to-hypotenuse = half), 32 | #31 is a bagrut workhorse. |
| **Isosceles converses/coincidences** | 23, 24, 25, 26, 27 | "Isosceles" surfaces only #22; the apex bisector≡median≡altitude coincidence (the D3 canonical case in [16 §3](16-theorems-plan.md)) was planned but never tabled. |
| **Thales / proportion** | 72, 73, 74, 75, 77 | Only the AA-entailed 69/71 exist (ADR-220); the proportional-segments theorems a parallel-cut announces are absent. |
| **Angle bisector / in-out-circle / concurrency** | 78–83, 85, 86, 88–90 | חוצה זווית — the other half of the operator's example. A *stated, drawn* bisector announces nothing today. |
| **Parallels converses** | 5, 7, 9 | Stated equal angles never suggest "⇒ parallel". |
| **Circle** | 93, 95, 96, 100, 101, 106 | Equal chords ↔ equal arcs/central angles, equidistant chords, converse tangent. |
| **Quad converses** | 44, 45, 47, 49, 51, 53, 54, 57–61 | Deliberately parked as "6b converse-recognition prompts" (ADR-211) — never scheduled. |
| **Angle sums (quad/polygon)** | 35, 36 | Trivial background, but their absence is visible on every quad figure. |

So a large part of "theorems that should appear don't appear" is not detection failure at all — **they were never candidates**. No amount of matcher tuning fixes this; it needs a scheduled coverage completion with an explicit per-id disposition (§3).

### R2 — Evidence is matcher-local, not systematic (the case-by-case treadmill)

Each matcher hand-rolls its own premise reading, and each manual session has found the next miss (the ADR-209→224 trail; the operator: *"we are chasing case by case"*, *"we need architectural solutions"*). The three ways-of-knowing (Declared / Entailed / Observed, ADR-219) exist **per-helper, opportunistically**: isosceles has all three paths, kite has declared+entailed, parallels have declared only, bisector/midsegment/median have nothing. And the **Observed lane reads only `detectShapes.shapes`**: `detectRelations` (equal-segment/angle classes, forced right angles/parallels), the ADR-224 similar/congruent **classes**, and emergent special-line facts (a segment that *is* a bisector/midsegment in every sample) are not inputs to the theorem spine at all — the very things the operator lists for levels 2–3 ("bisectors, midsegments, whatever images emerge").

### R3 — "Prioritized" was never designed or tested: the ranking is salience → recency → **id**

`detectTheorems` sorts by headline-before-background, then latest-attribution-first, then **numeric id** as tiebreak. Consequences, each an observed "randomness" symptom:

- **Recency dominates pointedness.** A generic entry attributed to the last step outranks the figure's defining theorem from two steps ago. After an unrelated segment is drawn, the order reshuffles.
- **The id tiebreak is pedagogically arbitrary.** When one step completes several premises (common — a single "inscribed quad" step fires 87/94/99/102/…), their order is catalog numbering, i.e. noise.
- **No specific-over-generic subsumption.** The ADR-209 open knob ("should generic 99/102 demote once cyclic-quad 87 fires?") was never resolved; pointed and generic siblings sit side by side with equal standing.
- **No notion of how pointed a premise is.** A stated diameter (announces 103/104 *for a reason*) and "any two segments cross" (#2) carry the same rank weight.
- **Nothing asserts order.** The corpus gate checks membership (`expectSurfaced ⊆ feed`) and absence — never position. "Most relevant first" (FR-TH-1) has no test, so ordering regressions are invisible and tuning is blind.

### R4 — There is no intent layer

The feed answers *"which theorems do my stated givens instantiate?"* It never answers the teacher-question the operator now asks for: *"what is this constellation of givens **for**?"* The concepts feed (ADR-214 — 2 entries) is the embryo of exactly this, but it has no archetype model, no link into ranking, and no growth plan. Note: [16 §10 B1](16-theorems-plan.md) ruled "there is NO question-target concept" — that ruling rejected *knowing the actual question*; the operator now asks for **probabilistic direction-hints from the givens alone**, which is a different, weaker thing — but it is a pedagogy-boundary change that needs its own ADR (§8, D5).

---

## 2. The target model — four layers, one sentence each

1. **Evidence layer** (§3): every geometric relation gets ONE predicate that reports *present / level (1|2|3) / tier / trigger facts / objects* across all three ways-of-knowing; matchers compose predicates, never re-derive.
2. **Coverage layer** (§4): every id in [07](07-theorem-reference.md) has an explicit machine-checked disposition; the table is completed family-by-family, priority ordered by measured student value.
3. **Relevance layer** (§5): a small set of named, explainable rank bands + subsumption edges replaces recency-then-id; order becomes a tested contract per corpus step. *(Operator 2026-07-06: ballpark importance-first is the target — "not critical if one is higher than the other, but the important ones first"; no percentages.)*
4. **Principles layer** (§6): the operator-authored teacher-tips lane (💡) — "whenever X is given, or emerges from the diagram, think about Y" — with intent archetypes (givens-constellation → question-direction hints + rank boosts) as a subspecies.

The 6a invariants that do **not** change: the spine stays pure/read-only and engine-untouched; match stays coordinate-free with observations injected by the caller; the no-reveal boundary stays structural (68/70/76 and the conclusion-side rules); statements stay byte-exact from 07; salience headline/background and the background family fold stay; attribution/●-new stays.

---

## 3. Layer 1 — the evidence-predicate library (`src/theorems/evidence.ts`)

**Problem being solved:** R2 — evidence forms live scattered inside matchers, so every new phrasing/construction path is a new gap, found one operator session at a time.

**Design.** Extract the existing helpers into a uniform library where each geometric relation has exactly one predicate:

```ts
// The uniform shape every premise question answers with:
export interface Evidence {
  level: DiscoveryLevel;        // 1 declared | 2 entailed | 3 observed — the STRONGEST path that fired
  tier: Tier;                   // certain | possible
  facts: Fact[];                // trigger facts (attribution + highlight)
  objects: Id[];                // premise objects (highlight)
  // relation-specific payload (vertices, the circle, the pair, …)
}
```

Predicate inventory (the target set; ✓ = exists today in some form, ○ = new):

| Predicate | Declared (L1) | Entailed (L2) | Observed (L3) |
|---|---|---|---|
| `triangle` ✓ | typed triangle/3-polygon | drawn-edge 3-cycle (`structuralTriangles`) | detected |
| `rightAngle` ✓ | right-triangle / 90° / ⟂ / `foot` | ⟂-bisector, tangent-radius construction | measured-90° class from relations |
| `isosceles` ✓ | `set-equal` / shape word | two radii (ADR-218) | detected iso triangle |
| `parallelPair` ✓/○ | `set-parallel` / parallel-sided shape | midsegment construct ⇒ ∥ base | forced-parallel class from relations |
| `equalSegments` ○ | `set-equal` | radii, tangents-from-a-point, midpoint halves | equal-length class from relations |
| `equalAngles` ○ | `set-angle-ratio` k=1 / stated equal | vertical angles, base angles of entailed isosceles | equal-angle class from relations |
| `bisector` ○ | `bisector` line spec / קטע חוצה זווית | — | an emergent segment splitting an angle equally in every sample |
| `median` ○ | named median construct | segment to a stated midpoint | — |
| `midsegment` ○ | midsegment construct (ADR-199/222) | segment joining two stated midpoints | emergent midpoint-joining segment |
| `altitude` ✓/○ | `foot` / גובה | — | forced-⟂ through a vertex |
| `kite` ✓ | shape word | two intersecting circles, sides drawn | detected kite |
| `cyclicQuad` ✓ | stated quad + concyclic | ≥4 concyclic members (B2c) | — |
| `diameter` ✓ | `diameter` cmd / collinear-through-centre | antipode construct | — |
| `tangent` ✓ | tangent spec / Thales fingerprint | — | — |
| `similarTriangles` ○ | stated `~` (ADR-032) | parallel-cut (ADR-220 `similarityEvidence`) | ADR-224 similar classes |
| `congruentTriangles` ○ | stated `≅` (ADR-032) | — | ADR-224 congruent classes |
| `quadClass` ✓ | shape command | — | detected/emergent shape |

**The Observed feed.** `MatchCtx` gains one caller-supplied input:

```ts
observed?: {
  relations: DetectedRelations;   // equal seg/angle classes, forced right angles, forced parallels
  shapes: DetectedShape[];        // (moves in from the current top-level `shapes`)
  similar: SimilarClass[];        // ADR-224 classes (similar/congruent)
}
```

The spine stays coordinate-free — sampling happens **outside**, in the store's existing shared budgeted sample core (ADR-231 M3). Perf home: the Web-Worker split already on the backlog ([14-backlog.md](14-backlog.md); prerequisites noted in ADR-231 — geoStore pure-function extraction + the `theorems→store` import inversion). Until the worker lands, L3 stays what it is today: computed when the dial (or the detect-shapes layer) turns it on, budgeted, chunked-async.

**Honesty guardrails carried over:** the ADR-218 DRAWN gate (an entailed sub-figure surfaces only when its sides are on the canvas) and the forced-in-every-sample discipline for anything observed (never one drawing's coincidence).

**Gate for this layer:** every predicate has a three-row test block (declared / entailed / observed each fire at their level, weaker paths shadowed by stronger); the existing matcher tests stay green through the refactor (pure extraction first, new predicates second).

---

## 4. Layer 2 — full-catalog coverage with a disposition map

**Problem being solved:** R1 — 66 absent ids, invisible because nothing tracks "absent."

**Design — the `catalog.ts` pattern applied to theorems** (the parser already solves exactly this problem: a single source of truth that is both user-facing reference and machine-checked coverage map). A new `src/theorems/coverage.ts`:

```ts
export type Disposition =
  | { kind: 'tabled' }                                  // in THEOREM_TABLE
  | { kind: 'no-reveal' }                               // 68, 70, 76 — structurally excluded (ADR-208)
  | { kind: 'supplemental' }                            // Appendix O policy (ADR-217)
  | { kind: 'planned'; slice: 'T2a' | 'T2b' | …  }      // scheduled, not yet built
  | { kind: 'needs-construct'; what: string }           // premise not expressible yet (e.g. incenter concurrency)
  | { kind: 'out-of-scope'; why: string };              // formulas/definitions per the standing rule
export const THEOREM_COVERAGE: Record<TheoremId, Disposition>;
```

`integrity.test.ts` gains **totality**: every id in 07 must have a disposition; `tabled` ⇔ present in `THEOREM_TABLE`; `no-reveal` ⇔ the forbidden list. From then on, "theorems that should appear don't appear" is answerable in one lookup, and the remaining work is enumerable instead of anecdotal.

**Priority order is measured, not guessed.** The ground-truth corpus already encodes student value: count each absent id's appearances in the 25 questions' `solutionUses` + `expectSurfaced` lists — that frequency ranks the fill order. (From the B-series examples already visible: congruence 18–21, similarity/Thales 72–77 band, bisector 78–81, midsegment 62–67, right-triangle 31, parallels-converses 5/7/9, circle 93/100/101 will top the list.) A tiny dev script produces the ranked list once; the plan slices follow it.

**The P/C pedagogy split stays the guide:** properties of what the student stated/drew surface freely; **converses surface as recognition prompts** — a converse (type C) is tabled with tier `possible` and fires when its *property side* is stated ("equal alternate angles stated → possible: the lines are parallel, #5"). This realises the parked ADR-211 "converse-recognition prompts" slice with the existing tier axis, no new machinery.

---

## 5. Layer 3 — relevance as named rank bands (explainable, tested)

**Problem being solved:** R3 — "seems pretty random."

**Design principle:** no opaque weighted score. Ranking must be **explainable to the operator row-by-row** ("this is first *because*…"), which means a lexicographic sort over a small set of **named, discrete keys** — the same philosophy as the engine's named mechanisms. (A float score with tuned weights is the rejected alternative — see §8 D3 — because "random" is precisely what un-inspectable weights feel like.)

**Operator ruling (2026-07-06):** exact order between neighbours is *not* critical — the target is **ballpark: the important ones first**. No percentages or fabricated confidence numbers, at runtime or on screen (consistent with ADR-038's "confidence tiers, not a fabricated percentage"). The discrete bands below are the accepted mechanism; the only "calculation" is offline — the corpus-frequency script as an *authoring aid* for the 3-value `pointedness` field, never a runtime score.

Each `TheoremDef` gains one authored field:

```ts
pointedness: 'pointed' | 'standard' | 'generic';
```

- **pointed** — the premise is stated *for a reason*; in real bagrut practice this given announces this theorem (diameter→103/104, two tangents→108/109, arc-midpoint→92/94, midsegment→62/63, stated ≅→18–21…). The D3 "Key/green activator" idea, finally made a first-class rank input.
- **standard** — a real configuration, commonly but not pointedly present (chord theorems on a busy circle figure, quad property bundles).
- **generic** — true of almost every figure of its family (vertical angles #2, angle sums, triangle basics). Most `generic` entries are already `background` salience; a headline `generic` is rare.

Optional calibration aid (dev-only, not runtime): fire the completed table over the 25-question corpus + fixtures; a theorem firing on >⅔ of figures is presumptively `generic`, <⅙ presumptively `pointed` — the script's output is a *review sheet* for authoring, the field stays authored.

**Subsumption edges** (the ADR-209 knob, resolved): `subsumes?: TheoremId[]` on a def — when X fires, each Y in its list that also fired is **demoted one band and marked "folded under #X"** (not removed — it stays citable in place, consistent with non-monotonic relevancy, [16 §3 D3](16-theorems-plan.md)). First edges: 87 ⊐ {99, 102} on the same circle; 201 ⊐ {8} on the same trapezoid; 33/34 ⊐ 28's concept-row prominence on the same triangle; the special-quad diagonal properties already lead by the ADR-213 attribution rule (unchanged).

**The sort, top to bottom (within the headline section):**

| Band | Name | Membership |
|---|---|---|
| 0 | **Intent-aligned** | boosted by an active intent archetype (§6) — at most the top 2 intents boost |
| 1 | **New + pointed** | `pointedness='pointed'` AND attributed to the latest step |
| 2 | **New** | attributed to the latest step (the "what did my last fact buy me" contract, kept) |
| 3 | **Pointed** | pointed, from earlier steps |
| 4 | **Standard** | everything else surfaced at headline |
| 5 | **Demoted** | subsumption-demoted entries, folded row "covered by #X" |
| — | Background | the per-family fold, unchanged |

Within a band: higher discovery certainty first (L1 < L2 < L3), then `certain` before `possible`, then attribution recency, then id (id is now a 5th-order tiebreak instead of 3rd — its arbitrariness stops mattering).

**Explainability requirement (dev + operator review):** every feed entry carries its `rankTrace` (band name + which rules placed it) — surfaced as a dev-mode tooltip. Ranking bugs become readable, exactly like the verifier made figure-correctness readable.

**Caps** (FR-TH-6, finally enforced): bands 0–1 are never capped; the headline section shows at most ~7 rows before an expandable "עוד משפטים שחלים" fold (band count, not a hidden scroll).

---

## 6. Layer 4 — the PRINCIPLES lane (teacher tips), with intent archetypes as a subspecies

**Problem being solved:** R4 — plus the operator's elevation of principles to a design element (2026-07-06, verbatim intent): *"Principles are things that I, as a teacher, can tell you: whenever something is given — or whenever something emerges from the diagram — you should think about something. Tips on how to approach the problem, not theorems. That is also in the code, but I want it part of this design."*

**What exists:** the concepts feed (ADR-214, `src/theorems/concepts.ts`) — the right machinery (own 💡 lane beside the theorems, same coordinate-free `MatchCtx`, same attribution/●-new), with 2 entries. This section makes it first-class.

**Design.** Rename concepts → **principles** (`src/theorems/principles.ts`, `PRINCIPLE_TABLE`, UI section "עקרונות" 💡 — final He microcopy in the 6c pass):

```ts
export interface PrincipleDef {
  id: string;                              // slug — principles have no bagrut number
  he: string; en: string;                  // the tip, in the teacher's voice
  match: (ctx: MatchCtx) => TheoremMatch | null;   // composes the §3 evidence predicates
  // level rides the match result: a principle triggered by a stated given is L1; by a structural
  // entailment L2; by an emergent observation L3 — the SAME dial filters principles and theorems,
  // realising "whenever something is given OR emerges from the diagram" with no extra machinery.
  boosts?: TheoremId[];                    // theorems lifted to band 0 while this principle is active
}
```

**Authorship model — principles are the operator's voice.** They grow by operator direction (the ADR-209 working mode: named in a session → becomes a permanent entry). Source of truth: a **principles catalog** the operator can read and edit as a teacher — proposal: a new section appended to [10-pedagogy.md](10-pedagogy.md) (or a standalone `docs/19-principles-catalog.md`, §8 D7) listing each principle's trigger ("whenever…") + He/En tip; an integrity test asserts `PRINCIPLE_TABLE` matches the catalog (the 07 byte-check pattern, applied to the operator's own text). Dictating a principle in a session then lands it in both places, tested.

**Intent archetypes are a subspecies of principle**, not a separate lane: an intent archetype is simply a principle whose trigger is a givens-*constellation* and whose tip names the question's likely direction ("שלושה קטעים שווים בין שני משולשים — אולי חפיפת משולשים?"). Same table, same machinery; what distinguishes them is that they typically carry `boosts` (band 0, §5) and their text is phrased as a direction-question. This collapses what would have been three sibling lanes (theorems / concepts / intents) back to two: **theorems (cite this)** and **principles (think this way)**.

**Anti-flood:** at most 2–3 principles visible at once — most recent attribution first, ties by specificity of trigger; overflow folds like background theorems.

Starter set (the 2 existing entries migrate; the archetypes below are the first operator-review batch, each an authored pattern over the §3 evidence predicates):

| Archetype (slug) | Trigger constellation | Hint (He) | Boosts |
|---|---|---|---|
| `congruence-hunt` | ≥3 stated equalities/shared elements distributed over two structural triangles | "נתונים כמה קטעים/זוויות שווים בין שני משולשים — אולי חפיפת משולשים?" | 18–21 |
| `bisector-setup` | stated bisector, or equal angles at one vertex toward a cut side | "זווית שחוצים אותה — בדקו את משפטי חוצה הזווית" | 75, 77, 78, 79 |
| `midsegment-setup` | two stated midpoints on two sides of one triangle/trapezoid | "שתי אמצעי צלעות — קטע אמצעים?" | 62–67 |
| `thales-chain` | diameter + any inscribed vertex | "קוטר נתון — איזו זווית היקפית נשענת עליו?" | 103, 104, 31 |
| `similar-by-parallel` | (exists — the ADR-220 concept, migrated) | "יש מקבילים — חפשו משולשים דומים" | 69, 71, 72, 73 |
| `power-of-a-point` | secant/tangent hub from an external point | "שני חותכים/משיק מנקודה חיצונית — המשפטים התומכים (נספח)" | A3, A4 (supplemental) |
| `right-triangle-algebra` | (exists — the ADR-214 concept, migrated) | α / 90°−α setup | 28, 33, 34 |

**Pedagogy guardrails** (the intent subspecies is the §10-B1 revision — needs the D5 sign-off; plain principles are already-accepted ADR-214 territory):

- An intent-flavoured principle is **derived from the stated givens' shape only** — the tool still never sees the question text; it names a *family direction*, never an instantiated pair/conclusion (it may say "אולי חפיפת משולשים", never "△ABE ≅ △DCE").
- Intent tips are phrased as **questions/directions**, tier amber.
- The forbidden derived-premise theorems (68/70/76) can be **named by family** in a principle ("דמיון משולשים") but stay un-tabled and never instantiated — the boundary between *pointing at a toolbox* and *revealing the aha* is that no objects are named and no premise is asserted.

---

## 7. The three discovery levels — mapping the operator's framing onto ADR-219

The operator's levels map 1:1 onto the existing dial — no rebuild, but two refinements:

| Operator's words | Existing | Refinement |
|---|---|---|
| "Level 1 — only the user inputs" | **L1 Declared** | unchanged |
| "Levels 2–3 — what was created in the diagram… kites, bisectors, midsegments… as hints" | **L2 Entailed** (structural, certain) + **L3 Observed** (sampled) | (a) systematic L2/L3 evidence for *all* relations via §3 (today only isosceles/kite have it); (b) L3 entries render in a visually distinct "hints" dress (💡-tinted row + "נראה בשרטוט:" prefix), tier `possible` — making "the tool noticed for you" legible |
| (default) | dial defaults **L1** | **RESOLVED (D4): L1 stays the default** — the strict worksheet view; L2/L3 are the student's deliberate opt-in via the dial. Follow-through: the dial's *visibility/affordance* carries the weight (a legible "there is more here" cue), since a louder default was declined. |

### 7a. The L2/L3 cutoff (proposed and **ACCEPTED by the operator, 2026-07-06**)

L1 is clear-cut (the fact was typed, or is the direct macro decomposition of a typed shape word). The L2/L3 line is drawn by **how the tool knows the premise, not what the premise is**:

> **L2 — Entailed:** true by pure logic from the construction itself — provable from the *definitions* of the constructs the student used, reading only the dependency graph. No coordinates; would hold in **every** drawing by reasoning.
> **L3 — Observed:** known only by *measuring the sampled drawings* — forced numerically across every valid configuration, but with no symbolic derivation behind it.

**Litmus test** for any candidate: *"Would the tool still know this if the engine never computed a single coordinate?"* Yes → L2 (a one-sentence definitional reason always exists: "OA and OB are both radii"). No → L3 (the only reason is "it measures so in every drawing").

The level grades how a theorem's **premise** became known, so one relation sorts differently by provenance — isosceles: typed `AB=AC` → L1 · two radii → L2 · measured-equal → L3; kite: typed → L1 · two intersecting circles with sides drawn → L2 · numerically equal-adjacent sides → L3; midsegment: typed → L1 · a drawn segment between two *stated* midpoints → L2 · a segment that happens to join midpoints → L3; the forced 30-60-90 and every emergent-shape/similar-class discovery are L3 by nature (only coordinates reveal them).

**Why this line (users won't see it, so its value is discipline + trust + cost):** (1) *mechanically checkable, zero per-matcher judgment* — does the evidence path read sampled positions? then L3; the classifier is the code path itself, so it cannot drift; (2) *coincides with certainty* — L2 may render green/always-on, L3 renders as the 💡 amber hint dress with no extra rule needed; (3) *coincides with cost* — L2 is symbolic and live per keystroke, L3 rides the budgeted sampling layer, so the dial doubles as the perf switch.

**Two guardrails inside the line:** (i) the ADR-218 **DRAWN gate** stays on L2 — an entailment surfaces only when its sub-figure is actually on the canvas; (ii) **theorem-chained entailments are exception-only**: a coordinate-free derivation that uses a *theorem step* rather than a definition (e.g. rhombus ⇒ diagonal bisects its angles) is the tool performing a move of the student's derivation — definitional entailment is L2 by default, a theorem-step entailment enters L2 only by explicit operator approval per case (the ADR-220 parallel-cut-similarity precedent); anything else that "follows by a theorem" is simply not matched at L2, and if it shows up numerically it arrives as L3 like any other observation.

---

## 8. Decision boxes for the operator

**ALL RESOLVED (operator, 2026-07-06 — asked and answered one by one):**

- **D1 — Coverage scope: FULL CATALOG.** Every 07 theorem whose premise the engine can express gets a matcher, filled family-by-family in measured priority order; the rest carry `needs-construct` dispositions and wait. No permanent blind spots.
- **D2 — Converse policy: AMBER RECOGNITION PROMPTS.** A converse surfaces as an amber `possible` entry the moment its *property side* is stated (equal alternate angles typed → amber "⇒ the lines are parallel, #5") — the parked ADR-211 design, confirmed.
- **D3 — Ranking: ballpark importance-first, discrete bands, NO percentages** (runtime or on screen); the corpus-frequency script is an offline authoring aid only.
- **D4 — Default discovery level: L1 STAYS.** The operator overrode the L2 recommendation — the fresh-session view stays the strict "worksheet" (typed givens only); the dial is the student's deliberate opt-in to L2/L3. (Consequence: making the dial *visible/legible* matters more — the empty-feed experience is answered by the dial's affordance, not a louder default.)
- **D5 — Intent hints: APPROVED** as a subspecies of principles under the §6 guardrails (family-direction questions only, no instantiated objects, amber, ≤2 at once). The [16 §10 B1](16-theorems-plan.md) "no question-target" ruling is formally amended by ADR when T5 is built.
- **D6 — Subsumption presentation: FOLD WITH A LABEL.** Subsumed generic entries drop to a compact expandable row labelled "מכוסה על ידי #X" — citable, discoverable, and the movement is explained.
- **D7 — Principles catalog home: a section in [10-pedagogy.md](10-pedagogy.md)** (the declared home for "everything we want the tool to teach"), integrity-tested against `PRINCIPLE_TABLE`.

Also resolved earlier the same day: **§7a L2/L3 cutoff — ACCEPTED**; **principles elevated to a first-class design layer** (§6). The plan is **decision-complete**; T1 starts on operator go.

---

## 9. Evaluation — "prioritized" becomes a tested contract

1. **Wire the full ground-truth corpus.** `corpus.test.ts` today runs Q5–Q7 (14 steps) of the **25 reviewed questions** in [theorem-ground-truth.md](sample%20questions/theorem-ground-truth.md). Extend to all (B1–B4, B6–B23): each becomes a step-gated block exactly like Q5–Q7. Where a question's utterances need constructs that parse today, wire now; genuinely unparseable steps get the canonical-commands treatment (LLM mocked, per the standing rule).
2. **Ranking assertions.** The ground-truth doc gains, per step, two optional fields the test asserts:
   - `top: TheoremId[]` — must all appear within the first `max(3, top.length)` headline rows;
   - `before: [TheoremId, TheoremId][]` — X must rank above Y.
   Authoring effort is bounded: only steps where order *matters pedagogically* get entries (the diameter step must put 103/104 first; nobody cares whether #12 precedes #13).
3. **Flood/precision budgets.** Per step: ≤ K new-this-step headline rows (K=3), total headline ≤ 7 before the fold; asserted over the whole corpus, so anti-flood stops being a vibe.
4. **Principles gate.** Per corpus question, `expectPrinciples` (⊆ active principles at the final step) + `neverPrinciples`; plus the catalog↔table integrity guard (§6). The operator's 3-equal-segments example becomes the first scenario.
5. **Session-replay audit harness** (the ADR-115 log-class audit, applied to theorems): a dev script replays `logs/debug-log.jsonl` sessions + all `fixtures/*.geo.json` through `detectTheorems` and emits a per-step surfaced/ranked report → the operator reviews misses/noise in bulk instead of one live session at a time; confirmed verdicts land as ground-truth entries or scenarios. This is how "I'm not happy" turns into labeled data.
6. **Integrity totality** (§4) + all existing integrity/no-reveal/byte-exactness guards stay.

---

## 10. Phasing

| Slice | Content | Gate |
|---|---|---|
| **T1 — measure & map** | disposition map + totality test; corpus-frequency script → ranked fill list; wire the full B-series corpus (membership assertions only); session-replay audit harness | totality green; full corpus green on today's table (documents today's misses as `planned` dispositions, not failures) |
| **T2 — coverage fill** | families by measured priority (expect ≈ congruence → midsegment/median → bisector → right-triangle 29–32 → isosceles 23–27 → Thales 72–75/77 → parallels-converses → circle remainder → quad converses → 35/36), each family = predicates (§3) + table rows + tests | per-family matcher tests; corpus `expectSurfaced` upgraded per the ground-truth doc; no `mustNotSurface` regressions |
| **T3 — relevance** | `pointedness` authoring pass + subsumption edges + band sort + `rankTrace`; UI: band-aware headline section, demoted rows, caps | ranking assertions (§9.2–9.3) green over the full corpus; operator plays 2–3 questions and judges order |
| **T4 — observed lane** | `observed` input (relations + similar classes + special-line detection); L2/L3 columns of the §3 predicate table; L3 hint dress; the dial-affordance pass (default stays L1 per D4) | L2/L3 scenario set (kite, radii-isosceles, emergent midsegment, similar classes → 18–21/69-family hints at L3); perf budget respected (shared sample core; worker when its prerequisites land) |
| **T5 — principles lane** | concepts → principles rename + the operator-editable catalog (D7) + its integrity guard; the §6 archetype starter set + band-0 boosts; ADR for the D5 pedagogy revision | intent gate (§9.4); catalog↔table integrity green; operator pedagogy pass ("helpful, not revealing") + operator authors ≥3 principles through the catalog path to prove the workflow |

Each slice: ADR + tests-before-"ready", per the standing rules ([17-design-rules.md](17-design-rules.md) applies to any bug found on the way). T1 is small and pure bookkeeping-plus-harness; T2 is the bulk; T3/T4/T5 are each independently shippable behind the existing dev flag (`THEOREMS_ENABLED` — the feed is not live in prod, so this whole replan can land incrementally without student exposure).

---

## 11. Risks & boundaries

- **No-reveal erosion.** T2 adds many converses and T5 adds hints — every addition passes the same two structural guards (forbidden set untouched; corpus `mustNotSurface` per question) and the operator's human pass stays the final gate (16 §8, 6c).
- **Perf.** L3 depends on sampling; everything rides the ADR-231 M3 shared budgeted core, and the Worker split is the designated home (backlog, with named prerequisites). No new sampling loops (design-rules chokepoint registry).
- **Ranking churn.** Non-monotonic relevancy (B0) means order changes between steps by design; the band model + demote-not-remove keeps changes local and explained. The flood budgets are the regression net.
- **Ground-truth authoring load.** Ranking fields are opt-in per step; the audit harness (§9.5) grows truth from real sessions instead of hand-authoring everything.
