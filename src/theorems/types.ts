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
import type { DetectedShape } from '../engine/detectShapes';

/** The families theorems group into — drives the collapsed "background" family rows (plan §5). */
export type TheoremFamily =
  | 'angles'
  | 'parallels'
  | 'triangle'
  | 'congruence'
  | 'isosceles'
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
  /** Each drawn/hidden circle: its centre id and the point ids stated to lie on it (`circleMembers`). */
  circles: { id: Id; center: Id; members: Id[]; hidden: boolean }[];
  /** Undirected point adjacency over drawn segments/polygon edges (`pointNeighbors`). */
  neighbors: Record<Id, Id[]>;
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
}

/** One theorem in the table: its citable identity + the authored trigger. */
export interface TheoremDef {
  /** Official bagrut number (1–109) — the citable identity. */
  id: number;
  /** property / converse-characterization. `O` (appendix) never enters the table. */
  type: 'P' | 'C';
  salience: Salience;
  family: TheoremFamily;
  /** The EXACT catalog statements ([07](docs/07-theorem-reference.md)) — no interpolation slots, by design. */
  en: string;
  he: string;
  /** Premise-side matcher: returns a match or null. Pure over `ctx` (no coordinates). */
  match: (ctx: MatchCtx) => TheoremMatch | null;
}

/** A surfaced feed entry — a matched {@link TheoremDef} plus the run-specific attribution/ordering. */
export interface TheoremFeedEntry {
  id: number;
  type: 'P' | 'C';
  tier: Tier;
  salience: Salience;
  family: TheoremFamily;
  en: string;
  he: string;
  triggerFactIds: string[];
  triggerObjectIds: Id[];
  /** The highest fact index among the premise facts (FR-TH-2's "the fact that completed it"). */
  attributionIndex: number;
  /** group key of the attributing step (for the "appeared with step N" chip + highlight). */
  attributionGroup: string | null;
  /** True when this entry's attributing step IS the latest step — drives the ● marker. */
  isNew: boolean;
}

export type DetectInput = { facts: Fact[]; construction: Construction; shapes?: DetectedShape[] };
