# 16 — Phase 6 Plan: Theorem Surfacing (pedagogy-first)

_Drafted 2026-07-03 from the operator's design session. This is the detailed pre-dev plan for [Phase 6](09-implementation-plan.md#phase-6--theorems); it builds on the settled foundations — [ADR-038](06-decisions.md#adr-038) (structural-first detection), FR-TH-1..6 ([02-requirements](02-requirements.md#theorems)), and the [pedagogy charter §3–5](10-pedagogy.md) — and makes the remaining product decisions. **Nothing here touches figure-building behaviour: detection is a pure, read-only consumer of the engine's output, exactly like `detectRelations`/`detectShapes`. Any engine bug it surfaces during testing is pre-existing and gets the usual root-cause treatment.**_

---

## 1. The operator's constraints (2026-07-03, verbatim intent)

1. Maybe a button, maybe a **live list updated as the figure is built step by step**.
2. **Sorted by relevancy.**
3. **Never reveal the answer** — the tool must not say "use this theorem, the engine worked it out." Not a solver.
4. But the student **should understand which theorems are relevant *given the inputs they provided***.
5. **Not every possible theorem** — the student's actual question lives outside the system; listing everything derivable is noise and confusion.
6. Think like a **student** (what actually helps when stuck) and a **teacher** (the tool's goal is reading the givens, not solving).

## 2. The one principle that resolves the tension

> **A theorem surfaces because of what the student STATED, and shows only what the student already knows — restated in the exam's citable vocabulary. Anything the engine DERIVED stays behind opt-in Reveal (Phase 9).**

This "stated-vs-derived" line was already drawn by ADR-038 (structural matching on the typed construct + its dependency parents; coordinate coincidences → Phase 9) — this plan extends it to every surface of the feature:

| Surface | Stated (premise-side) — Phase 6, allowed | Derived (conclusion-side) — Phase 9 Reveal, forbidden here |
|---|---|---|
| **Trigger** | The theorem's *hypothesis* is instantiated by facts the student typed (incl. the decomposition of a shape word they typed — "דלתון" states equal adjacent sides). | The hypothesis holds only because of computed geometry (an *emergent* kite from `detectShapes`, a chord that numerically passes through the centre). |
| **Text** | Bagrut number + the catalog's **general statement** (He/En, [07](07-theorem-reference.md)) — **no student letters in the statement**. | An instantiated conclusion ("so ∠ACB = 90°"). Never shown. |
| **Highlight** | Click an entry → highlight the **triggering objects** — the diameter, the circle, the inscribed vertex *the student created*. | Highlighting/marking the **conclusion** objects (drawing the right-angle knee at C). Never done — surfacing must not add a single mark to the figure. |
| **Ordering** | Tier + recency + salience (below). | "Usefulness for the answer." The engine doesn't know the question and must not pretend to. |

Why this answers the reveal worry precisely: the feed is a **translation service between the student's own givens and the theorem book**, not an oracle. When a student types "AB is a diameter" and "C on the circle", telling them *"Theorem 103: an inscribed angle subtending a diameter is a right angle"* teaches the exam skill — *scan your givens for the theorems they activate* — while the reasoning step (spotting that ∠ACB is such an angle, and using it) remains entirely theirs. What would cross the line is naming ∠ACB, drawing its mark, or surfacing a theorem whose premise the student never stated.

**The student lens.** A stuck student's productive question is not "what's the answer?" but *"which of my givens am I not using?"* — the classic teacher nudge. A feed where every entry is pinned to the given that earned it answers exactly that, and nothing more. Entries the student already recognises cost one glance; the one entry attached to the given they forgot is the unlock.

**The teacher lens.** The tool models the read-the-givens discipline (charter §1): every datum you type visibly *does* something — geometrically on the canvas, and now theoretically in the feed. A teacher can build a problem live and ask the class "why did theorem 97 just appear?" That is teaching the habit, not handing out steps. And because the statement text is general (no letters), copying it into a proof still requires the student to perform the instantiation — the actual skill the exam grades.

## 3. Decisions this plan makes (new, on top of ADR-038 / FR-TH)

### D1 — Live feed, not a button (with a hide toggle)

The charter and FR-TH-1/2 specify a live, delta-updated feed; the operator floated a button. **Recommendation: live feed.** The opt-in-button pedigree ("view relations", "detect shapes") exists because those layers reveal **derived** facts — equalities and classifications the engine computed. Under §2's principle the theorem feed reveals **nothing derived**, so the reason for the opt-in gate does not apply; and the live per-step update is itself the payload (the *moment* a given lands is when its theorem is teachable — charter §3 "a theorem appears *because of* a fact just added"). Two guardrails keep it calm:
- **Quiet presentation** — a side panel; new entries slide in with a small ● marker; no popups, no sounds, no interruption of the input flow.
- **A display toggle** (like `showMeasures`) so a teacher can hide the panel for an exercise, and a student who finds it distracting can too. Hidden ≠ off: re-showing shows the current state (it's a pure derivation, below).

### D2 — The no-reveal ladder (what an entry shows, in order)

1. **In the feed row:** tier colour · bagrut **number** · the shape/family icon · the catalog **name/short statement** in the UI language. General wording only — *never* instantiated with the student's labels.
2. **On click (expand):** the full catalog statement (He + En), the **trigger attribution** ("appeared with step 4: 'AB קוטר'"), and the canvas **highlight of the triggering objects** (FR-TH-4 — the premise side by definition, since matching is premise-side).
3. **Never, at any level:** an instantiated conclusion, a conclusion-object highlight, an auto-drawn mark, a "use this" ranking, a next-step suggestion (charter §7 explicitly parks that as risky).
4. **Later (6c):** a "read more" link to the theorem's page in the site's geometry book (FR-REF-1) — deepening is allowed; solving is not.

### D3 — Relevancy = tier → recency → salience (and the anti-flood model)

The operator's two asks — "sorted by relevancy" and "not everything possible" — are met by one model:

- **Tier** (FR-TH-3, ordinal): **certain** (premise fully stated) → **possible** (exactly one stated-fact short — e.g. two equal sides stated ⇒ isosceles theorems certain, equilateral's possible) → *recall* stays **suppressed in v1** (the charter already marks it optional; it is the flood risk).
- **Recency:** entries whose attribution is the **latest step** float to the top with the ● marker — the feed answers "what did the fact I just typed buy me?" first.
- **Salience** (new, the anti-flood mechanism): every `TheoremDef` carries `salience: 'headline' | 'background'`.
  - **Headline** = a *specific configuration* the student had to state: circle theorems (97–109), midsegment, centroid 2:1, tangent pairs, Thales/proportionality, congruence/similarity criteria when two triangles are stated, the quad characterizations.
  - **Background** = true of essentially *every* figure of a family (triangle angle-sum 10, exterior angle 11, triangle inequality 12, side-angle order 13/14, the parallelogram property bundle for a *stated* parallelogram…). These would otherwise appear on every single figure and teach nothing by their presence. They fold into **one collapsed row per family** — "משפטי בסיס למשולש (5) ▸" — expandable on demand. Present (citable, discoverable) but never noise.
- **Caps** (FR-TH-6): at most **3 headline entries surface per step**; overflow goes into the feed unmarked (visible on scroll, not announced). Steps that trigger nothing show nothing — expected, per FR-TH-1.

### D4 — Detection is a pure derivation; the feed has no stored state

`detectTheorems(facts, construction)` is a **pure function** re-run when the fact list changes (cheap: symbolic pattern-matching over commands + the dependency graph — no solving, no sampling, no coordinates in the match path). Everything the UI needs derives from it deterministically:
- **Attribution** = the highest fact index among the facts instantiating the premise (FR-TH-2's "the fact that completed it").
- **"New this step"** = attribution index === last step.
- **Removal/undo** = free: disable or delete a fact and the recompute drops or re-tiers entries (mirrors dependent-drop semantics, no bookkeeping).
- The only React state is UI-local (panel hidden, row expanded). This matches the store's architecture (facts are the source of truth; everything else derives) and makes the feature trivially undo-safe.

### D5 — Code home: `src/theorems/`, engine untouched

A sibling module to `src/render/` — a pure consumer importing engine *types and read-only helpers* (`circleMembers`, `pointNeighbors`, `parallelEdgePairs`, `polyEdges`…). If a matcher needs a derived reading the engine doesn't expose, add a **pure helper** to the engine (the `parallelEdgePairs` precedent) — new code, zero behaviour change, guarded by the existing 1862-test wall. `detectShapes` output is **not** an input to matchers (it is conclusion-side); the only shape triggers are shape words the student **typed** (their macro decomposition is stated-by-definition, ADR-110).

## 4. Data model

```ts
// src/theorems/types.ts
export interface TheoremDef {
  id: number;                     // official bagrut number (1–109) — the citable identity
  type: 'P' | 'C';               // property / converse-characterization (O never enters the table)
  salience: 'headline' | 'background';
  family: 'angles' | 'parallels' | 'triangle' | 'congruence' | 'isosceles' | 'similarity'
        | 'quad' | 'midsegment' | 'circle' | 'tangent';
  en: string; he: string;         // the EXACT catalog statements (07) — no interpolation slots, by design
  match: (ctx: MatchCtx) => TheoremMatch | null;
}
export interface MatchCtx {       // everything premise-side, precomputed once per detect run
  facts: Fact[];                  // the enabled, lowered fact list (stated givens incl. macro output)
  construction: Construction;     // the dependency graph (typed constructs + parents)
  // derived read-only hints, same category as the parser's ctx: circleMembers, neighbors,
  // parallels (stated ∥ constraints + polygon-implied ones), statedAngles, statedEquals, …
}
export interface TheoremMatch {
  tier: 'certain' | 'possible';
  triggerFactIds: string[];       // the stated facts instantiating the premise → attribution + highlight
  triggerObjectIds: Id[];         // premise objects to highlight on canvas (never conclusion objects)
}
```

One `THEOREM_TABLE: TheoremDef[]`; `detectTheorems` folds it into a sorted `TheoremFeedEntry[]`. A guard test asserts every table id exists in [07](07-theorem-reference.md) with a matching P/C tag, and that no O-tagged id ever enters the table.

## 5. The v1 matcher set (~40 theorems, corpus-driven)

Grow the pedagogy §4 starter map to full families, in this order (each family = a work slice with its own tests; the **circle block is first** — it is the corpus's and the bagrut's centre of gravity):

| Family | IDs (P/C) | Trigger key (all stated-side) |
|---|---|---|
| **Circle — chords/arcs/centre** | 97, 98, 99, 100, 101, 102 | stated chord/diameter/central-radius constructs; ⟂-from-centre-to-chord; two inscribed angles on a stated chord |
| **Circle — diameter/Thales** | 103 (P), 104 (C) | stated diameter + stated on-circle vertex; stated inscribed 90° |
| **Circle — tangents** | 105, 106 (C), 108, 109 | stated tangent at a point; two stated tangents from an external point |
| **Parallels & transversal** | 4, 6, 8 (P); 5, 7, 9 (C) | stated ∥ + a stated transversal segment crossing both; converses when the angle equality is the stated fact |
| **Triangle basics** *(background)* | 10, 11, 12, 13, 14 | any stated triangle — collapsed family row |
| **Medians/centroid** | 15, 16, 17 | stated median(s); all three → 15 |
| **Isosceles/equilateral** | 26–31 (P+C as catalogued) | stated equal sides / stated shape word / stated equal base angles (converse) |
| **Midsegment** | 72 + related | the stated midsegment construct (ADR-196/199) |
| **Proportionality/Thales ext.** | 73 + converse | stated ∥-to-a-side through the others |
| **Congruence criteria** | 18, 19, 20, 21 | two stated triangles + stated equalities matching a criterion; the stated `≅` (ADR-032) makes them certain |
| **Similarity criteria** | as catalogued | stated `~` / stated AA input |
| **Quad characterizations** | 48–60 slice (e.g. 54) | a stated parallelogram/rect/rhombus word (property Ps as its background bundle); a stated property set matching a characterization (C, tier per completeness) |
| **Angle bisectors/incenter** | 80, 81 | stated bisector(s); all three → 80 |

Exclusions in v1, on purpose: **O-tagged** (hard requirement), definitions/formulas (hard requirement), *recall* tier, emergent-shape triggers (Phase 9), any coordinate-derived trigger (Phase 9).

## 6. UI spec (App sidebar panel)

- New collapsible section **"משפטים רלוונטיים"** under the steps list, RTL-first, with the display toggle (D1) beside "show measures".
- Row anatomy: tier dot (green/amber) · `#103` · short name · ● if new-this-step. Background families as collapsed count rows. Click → expand (full He/En statement, "appeared with step N" chip, canvas highlight via the existing `highlight`/`highlightEdges` props — the same plumbing shape badges use).
- Empty state: a single quiet line ("משפטים יופיעו כשנתונים יפעילו אותם") — teaches that *nothing yet* is meaningful.
- i18n: all strings through `t()`; statements come verbatim from the catalog module (single source with 07).

## 7. Testing & gates (per repo rules)

1. **Per-matcher unit tests** (`src/theorems/__tests__/`): minimal stated-fact lists → exact `{id, tier, triggerFactIds}`; negative twins (premise one fact short → `possible` or absent; premise via *emergent* geometry → **absent**).
2. **Catalog-integrity guard**: table ids ⊆ 07's P/C set; O/definition ids structurally unrepresentable; statements byte-equal to the catalog.
3. **Corpus gate** (the phase's acceptance): for each of Q1–Q7's scenario fact lists, assert the surfaced id set contains the theorems the official solution actually cites (ground truth from the question PDFs) and **does not** contain conclusion-side ids the givens alone don't state. This is the strongest honest test: the tool surfaces what a well-taught student should *notice*, on real exam input.
4. **No-reveal invariants**: (a) `buildScene` output is byte-identical with detection on/off — surfacing adds zero marks; (b) no feed string contains a student point label; (c) `triggerObjectIds` ⊆ objects reachable from the premise facts' parents (a structural "no conclusion highlight" check).
5. **Perf canary**: `detectTheorems` over the heaviest corpus figure < a few ms (symbolic only); assert zero `replay`/`evaluate` calls inside the match path (spy on `replayStats.computes`).
6. **Scenario rule**: operator-reported misses/false-surfaces during manual testing become scenarios in `scenarios.test.ts` + the doc index, as always.

## 8. Phasing & effort

| Slice | Content | Gate | Effort |
|---|---|---|---|
| **6a — spine + circle** | types, table, `detectTheorems`, feed UI + toggle + highlight; families: circle (97–109), parallels, triangle-basics (background fold) | unit + integrity + no-reveal invariants green; Q4/Q7 corpus assertions pass; full suite + build clean | ~2–3 days |
| **6b — full v1 set** | remaining §5 families; salience/caps tuning on real corpus output; tier transitions (possible→certain) exercised | full corpus gate Q1–Q7; per-family units | ~2–3 days |
| **6c — polish** | book links (FR-REF-1), teacher toggle persistence, feed a11y (aria-live consistent with F6), He microcopy pass with the operator | manual operator pass — **the pedagogy acceptance is human**: the operator plays 2–3 real bagrut questions as a student and judges "helpful, not revealing" | ~1 day |

Each slice: ADR + tests + gates before "ready", per the standing rules. Phase 9 (Reveal) remains untouched and independent.

## 9. Open questions for the operator (before 6a starts)

1. **D1 sign-off** — live feed with a hide toggle (recommended above), or do you want it opt-in-per-press like shape badges despite the stated-vs-derived argument?
2. **`possible` tier in v1?** It is premise-side ("one stated fact short") but it *names a direction* ("equilateral is one given away") — a mild nudge. Options: ship certain-only in 6a and add `possible` in 6b after you've felt the feed; or include from the start per FR-TH-3. Recommendation: **certain-only in 6a**, decide on `possible` with real feed experience.
3. **Converses (C) tiering** — surface C theorems at the same footing as P (the charter says both are first-class), or one salience notch lower? Recommendation: same footing; they carry the "name and justify" skill.
4. **Ground truth for the corpus gate** — I need the official solutions (or your read) of Q1–Q7 to fix the expected id sets. A short session where you list "the theorems this question wants" per question is enough.
