/**
 * Phase 6 — theorem surfacing: the data model.
 *
 * A pure, read-only consumer of the engine (the [Phase-6 plan](docs/16-theorems-plan.md), sibling to
 * `detectRelations`/`detectShapes`). `detectTheorems(facts, construction, shapes)` re-derives, from the
 * student's STATED givens, the bagrut theorems those givens *announce* — never anything the engine
 * DERIVED (the stated-vs-derived principle, plan §2). The match path is symbolic: no `replay`/`evaluate`
 * inside it (plan §7.5). Emergent-shape triggers (plan §10 B1, operator 2026-07-04: purely emergent
 * shapes DO trigger) ride the `shapes` input the caller precomputes once — so no coordinates enter here.
 */

import type { Construction, Id } from '../engine/types';
import type { Fact } from '../store/geoStore';
import type { DetectedShape, SimilarClass } from '../engine/detectShapes';
import type { RelationsResult } from '../engine/relations';

/**
 * The OBSERVED lane's inputs (T4, docs/18 §3): what the SAMPLED layers noticed — forced across every
 * valid configuration, but with no symbolic derivation behind it (§7a: L3 by nature). Supplied by the
 * caller (the App's relations/shapes layers ride the store's shared budgeted sample core, ADR-231 M3);
 * the spine itself stays coordinate-free. Absent ⇒ the observed evidence paths simply don't fire.
 */
export interface ObservedInputs {
  /** Equal-segment/angle classes + forced definite angles (`detectRelations`). */
  relations?: RelationsResult;
  /** Similar/congruent triangle classes forced in every sample (ADR-224). */
  similar?: SimilarClass[];
}

/** The families theorems group into — drives the collapsed "background" family rows (plan §5). */
export type TheoremFamily =
  | 'angles'
  | 'parallels'
  | 'triangle'
  | 'congruence'
  | 'isosceles'
  | 'kite'
  | 'similarity'
  | 'quad'
  | 'midsegment'
  | 'circle'
  | 'tangent';

/**
 * Salience is the anti-flood axis (plan §3 D3):
 * - `headline` — a specific configuration the student had to state (circle theorems, tangent pairs, …).
 *   Capped at ≤3 surfaced per step; the rest are visible on scroll.
 * - `background` — true of essentially every figure of a family (triangle angle-sum, the parallelogram
 *   property bundle). Folds into ONE collapsed family row so it is present but never noise.
 */
export type Salience = 'headline' | 'background';

/** A theorem's tier (plan §3 D3): green announces it now; amber is a sparing secondary condition. */
export type Tier = 'certain' | 'possible';

/**
 * How POINTED a theorem's premise is (T3, docs/18 §5 — authored, discrete, NO runtime score per the
 * operator's D3 ruling):
 *  - `pointed`  — the premise is stated *for a reason*; in real bagrut practice this given announces
 *    this theorem (a diameter → 103/104, two tangents → 108/109, a midsegment → 62…).
 *  - `standard` — a real configuration, commonly but not pointedly present.
 *  - `generic`  — true of almost every figure of its family (vertical angles, angle sums).
 * The offline corpus-frequency sheet (reports/theorem-fill-order.md) is the calibration aid; the
 * field stays authored.
 */
export type Pointedness = 'pointed' | 'standard' | 'generic';

/**
 * Discovery level (ADR-219) — HOW the tool came to know a surfaced theorem's premise. The levels are
 * NESTED: a "show level N" dial surfaces every entry with `level ≤ N`.
 *  - **1 Declared** — the premise is instantiated by a *stated fact* the student entered (a `set-equal`,
 *    a shape command, `set-angle`, a declared circle's membership). Pure "help from what you said".
 *  - **2 Entailed** — a *coordinate-free structural derivation* the student never typed: two radii ⇒ an
 *    isosceles triangle, two intersecting circles ⇒ a kite (ADR-218). Certain, no coordinates.
 *  - **3 Observed** — only the *evaluated coordinates* reveal it: a purely-emergent detected shape /
 *    relation. This is where the tool "notices for you", so it is opt-in and never the L1 default.
 * A matcher with several evidence paths reports the STRONGEST (lowest) level that fired.
 */
export type DiscoveryLevel = 1 | 2 | 3;

/**
 * A theorem's citable identity: an official bagrut number (1–109) or a 200-band cyclic corollary
 * ({@link TheoremDef}), OR — for the practice-only / removed-curriculum Appendix theorems (ADR-217) —
 * their 07 label string (`A2`…`A6`, `B3`). The appendix ids are strings so they never collide with the
 * numbered space and are visibly "not a citable bagrut number" wherever they surface.
 */
export type TheoremId = number | string;

/**
 * Everything premise-side, precomputed once per `detectTheorems` run (the parser-`ctx` shape).
 * Matchers read these; they never sample or evaluate. See {@link buildMatchCtx}.
 */
export interface MatchCtx {
  /** The enabled, lowered fact list in entry order (the stated givens, incl. macro output). */
  facts: Fact[];
  /** The dependency graph (typed constructs + parents). */
  construction: Construction;
  /**
   * Detected named shapes — constructed AND purely emergent (plan §10 B1). Supplied by the caller
   * (the store computes it once for the shape-badge layer). Empty when the caller didn't supply it;
   * matchers that need a shape then simply don't fire.
   */
  shapes: DetectedShape[];
  /** group key of the most-recent enabled step, for the ● "new this step" marker / recency (plan §3). */
  lastGroup: string | null;

  // ---- derived read-only premise hints (same category as the parser's ctx) ----
  /**
   * Each drawn/hidden circle: its centre id, the point ids stated to lie on it (`circleMembers`), the
   * `hidden` flag, and `autoCenter` — true when the centre is auto-hidden (the student never named it,
   * e.g. an inscribed figure's implicit circumscribing circle). `autoCenter` is the coordinate-free
   * "is the centre GIVEN?" signal that gates the central-angle theorems (see `centerGiven`, ADR-210).
   */
  circles: { id: Id; center: Id; members: Id[]; hidden: boolean; autoCenter: boolean }[];
  /** Undirected point adjacency over drawn segments/polygon edges (`pointNeighbors`). */
  neighbors: Record<Id, Id[]>;
  /** The observed (sampled) lane's inputs — see {@link ObservedInputs}. Optional; caller-supplied. */
  observed?: ObservedInputs;
  /**
   * Tangencies present in the figure, structurally (coordinate-free): a first-class `tangent` line
   * spec, OR the Thales external-tangent construction (a hidden through-circle passing through the
   * target's centre, intersected with the target). `circle` = the target circle id; `at` = the
   * tangency point; `from` = the external point when the construction names one. See `tangentPoints`.
   */
  tangents: { circle: Id; at: Id; from?: Id }[];
}

/** A single matcher's verdict for a theorem: fired, at which tier, from which stated facts/objects. */
export interface TheoremMatch {
  tier: Tier;
  /** The stated facts instantiating the premise → attribution (latest index) + the highlight source. */
  triggerFactIds: string[];
  /** Premise objects to highlight on the canvas (NEVER conclusion objects — plan §2). */
  triggerObjectIds: Id[];
  /** How the premise was known — the {@link DiscoveryLevel} the dial filters on (ADR-219). */
  level: DiscoveryLevel;
}

/** One theorem in the table: its citable identity + the authored trigger. */
export interface TheoremDef {
  /** Citable identity: an official bagrut number (1–109), a geo-builder cyclic-configuration corollary
   *  in the 200 band (Appendix C of 07 — composed teaching statements, not atomic bagrut numbers; e.g.
   *  201 = an inscribed trapezoid is isosceles; ADR-209), or an Appendix A/B label string (`A2`…`B3`;
   *  ADR-217). See {@link TheoremId}. */
  id: TheoremId;
  /** property / converse-characterization / `O` = Appendix (practice-only or removed-curriculum). An `O`
   *  entry is SUPPORTING-ONLY — it MUST carry `salience: 'background'` (never a headline); the
   *  integrity guard enforces the invariant (ADR-217). */
  type: 'P' | 'C' | 'O';
  salience: Salience;
  /** The authored T3 rank input (docs/18 §5) — see {@link Pointedness}. */
  pointedness: Pointedness;
  /**
   * Subsumption edges (the resolved ADR-209 knob, D6): when THIS theorem fires, each listed id that
   * also fired is demoted to the folded band and labelled "covered by #this" — demote-not-remove
   * (it stays citable; non-monotonic relevancy keeps changes local and explained).
   */
  subsumes?: TheoremId[];
  family: TheoremFamily;
  /** The EXACT catalog statements ([07](docs/07-theorem-reference.md)) — no interpolation slots, by design. */
  en: string;
  he: string;
  /** Premise-side matcher: returns a match or null. Pure over `ctx` (no coordinates). */
  match: (ctx: MatchCtx) => TheoremMatch | null;
}

/** A surfaced feed entry — a matched {@link TheoremDef} plus the run-specific attribution/ordering. */
export interface TheoremFeedEntry {
  id: TheoremId;
  type: 'P' | 'C' | 'O';
  tier: Tier;
  salience: Salience;
  family: TheoremFamily;
  en: string;
  he: string;
  /** The discovery level this entry surfaced at (ADR-219) — the dial shows entries with `level ≤ selected`. */
  level: DiscoveryLevel;
  triggerFactIds: string[];
  triggerObjectIds: Id[];
  /** The highest fact index among the premise facts (FR-TH-2's "the fact that completed it"). */
  attributionIndex: number;
  /** group key of the attributing step (for the "appeared with step N" chip + highlight). */
  attributionGroup: string | null;
  /** True when this entry's attributing step IS the latest step — drives the ● marker. */
  isNew: boolean;
  /** The authored rank input this entry carries (T3). */
  pointedness: Pointedness;
  /**
   * The named rank BAND this entry sorted into (docs/18 §5 — lexicographic over discrete keys, no
   * opaque score): 0 intent-aligned (T5 boosts) · 1 new+pointed · 2 new · 3 pointed · 4 standard ·
   * 5 demoted (subsumption-folded). Background entries keep band for the trace but rank by the
   * family fold as before.
   */
  band: 0 | 1 | 2 | 3 | 4 | 5;
  /** The id that subsumption-demoted this entry ("covered by #X"), when band 5. */
  demotedBy?: TheoremId;
  /** Row-by-row explainability (dev tooltip): band name + the rules that placed it. */
  rankTrace: string;
}

export type DetectInput = { facts: Fact[]; construction: Construction; shapes?: DetectedShape[]; observed?: ObservedInputs; boosts?: TheoremId[] };
