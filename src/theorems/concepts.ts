/**
 * Phase 6a — GUIDING PRINCIPLES ("concepts"), a sibling feed to the theorem feed (operator 2026-07-04).
 *
 * A concept is NOT a bagrut theorem: it is a problem-solving heuristic the configuration invites — a way
 * to *set up* the algebra, not a fact to cite. So concepts live OUTSIDE {@link THEOREM_TABLE} (they carry
 * no bagrut number and are NOT sourced from [07](docs/07-theorem-reference.md); the integrity byte-check
 * only governs theorems). Same coordinate-free `MatchCtx` and the same attribution/●-new machinery, so
 * they surface live per step exactly like theorems, but the App renders them in their own labelled
 * section (💡), visually distinct from the theorems they sit beside.
 *
 * First concept: a right triangle invites naming one acute angle α and reading the other as 90°−α.
 */

import { buildMatchCtx } from './context';
import { makeAttributor } from './detect';
import { rightAngleFacts, parallelFacts } from './table';
import type { Id } from '../engine/types';
import type { DetectInput, MatchCtx, TheoremMatch } from './types';

/** One guiding-principle entry: a slug identity + the bilingual text + a premise-side matcher. */
export interface ConceptDef {
  /** Stable string slug (concepts have no bagrut number). */
  id: string;
  en: string;
  he: string;
  /** Pure over `ctx` (no coordinates), like a theorem matcher. */
  match: (ctx: MatchCtx) => TheoremMatch | null;
}

/** A surfaced concept — a matched {@link ConceptDef} plus run-specific attribution/●-new. */
export interface ConceptFeedEntry {
  id: string;
  en: string;
  he: string;
  triggerFactIds: string[];
  triggerObjectIds: Id[];
  attributionIndex: number;
  attributionGroup: string | null;
  isNew: boolean;
}

export const CONCEPT_TABLE: ConceptDef[] = [
  {
    // Wherever a right angle exists (a right triangle, a stated 90°, a ⟂, a dropped height) the two acute
    // angles are complementary — the canonical setup move is to call one α and read the other as 90°−α.
    // Same premise set as Pythagoras (#28) — the two guidances go together for a right triangle.
    id: 'right-triangle-complementary',
    en: 'Right triangle: name one acute angle α and the other is 90°−α (the two acute angles are complementary).',
    he: 'משולש ישר-זווית: נסמן זווית חדה אחת ב-α, והשנייה היא 90°−α (שתי הזוויות החדות משלימות ל-90°).',
    match: (ctx) => {
      const fs = rightAngleFacts(ctx);
      // Concepts are a separate feed, not graded by the discovery dial — `level: 1` satisfies the shared
      // {@link TheoremMatch} shape (the concept feed never filters on it).
      return fs.length ? { tier: 'certain', triggerFactIds: fs.map((f) => f.id), triggerObjectIds: [], level: 1 } : null;
    },
  },
  {
    // Wherever the figure states a parallel — a `set-parallel` or a parallel-sided shape (trapezoid /
    // parallelogram / …) — the canonical setup move is to hunt for a pair of similar triangles: a line
    // parallel to a triangle side cuts off a smaller similar copy (Thales / AA), which turns the geometry
    // into a proportion. Operator 2026-07-04 (ADR-220); a heuristic, not a bagrut theorem, so it lives here.
    id: 'parallels-seek-similar-triangles',
    en: 'If the figure has parallel lines, look for similar triangles.',
    he: 'אם יש ישרים מקבילים, חפשו משולשים דומים.',
    match: (ctx) => {
      const fs = parallelFacts(ctx);
      return fs.length ? { tier: 'certain', triggerFactIds: fs.map((f) => f.id), triggerObjectIds: [], level: 1 } : null;
    },
  },
];

/**
 * `detectConcepts` — the concept feed's entry point. Same shape as {@link detectTheorems}: folds
 * {@link CONCEPT_TABLE} over the coordinate-free `MatchCtx`, attributes each match to the latest stated
 * fact that completed it, and marks ●-new on the current step. Ordered most-recent-first, then id.
 */
export function detectConcepts(input: DetectInput): ConceptFeedEntry[] {
  const { facts, construction, shapes = [] } = input;
  const ctx = buildMatchCtx(facts, construction, shapes);
  if (ctx.facts.length === 0) return [];

  const attribute = makeAttributor(ctx);
  const entries: ConceptFeedEntry[] = [];
  for (const def of CONCEPT_TABLE) {
    const m = def.match(ctx);
    if (!m) continue;
    const { attributionIndex, attributionGroup, isNew } = attribute(m.triggerFactIds);
    entries.push({
      id: def.id,
      en: def.en,
      he: def.he,
      triggerFactIds: m.triggerFactIds,
      triggerObjectIds: m.triggerObjectIds,
      attributionIndex,
      attributionGroup,
      isNew,
    });
  }
  entries.sort((a, b) => b.attributionIndex - a.attributionIndex || a.id.localeCompare(b.id));
  return entries;
}
