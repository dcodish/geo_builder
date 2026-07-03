/**
 * `detectTheorems` — the pure entry point (plan §6). Folds {@link THEOREM_TABLE} over a
 * {@link MatchCtx} into a ranked {@link TheoremFeedEntry}[]: each matched theorem is attributed to the
 * LATEST stated fact that completed its premise, tagged ●-new when that fact is the current step, and
 * ordered headline-before-background, recency-first (plan §3).
 *
 * Read-only over engine output. Coordinate-free — emergent-shape triggers ride the caller-supplied
 * `shapes` (plan §10 B1). Re-run whole from scratch each step (non-monotonic relevancy, plan §3 B0).
 */

import { buildMatchCtx } from './context';
import { THEOREM_TABLE } from './table';
import type { DetectInput, TheoremFeedEntry } from './types';
import { groupKey, type Fact } from '../store/geoStore';

/** Salience order: headline entries rank above the collapsed background family rows. */
const salienceRank = (s: TheoremFeedEntry['salience']): number => (s === 'headline' ? 0 : 1);

export function detectTheorems(input: DetectInput): TheoremFeedEntry[] {
  const { facts, construction, shapes = [] } = input;
  const ctx = buildMatchCtx(facts, construction, shapes);
  if (ctx.facts.length === 0) return [];

  // Index each enabled fact by id → its entry position + group, for attribution.
  const posOf = new Map<string, number>();
  const groupOf = new Map<string, string>();
  ctx.facts.forEach((f: Fact, i) => {
    posOf.set(f.id, i);
    groupOf.set(f.id, groupKey(f));
  });

  const entries: TheoremFeedEntry[] = [];
  for (const def of THEOREM_TABLE) {
    const m = def.match(ctx);
    if (!m) continue;

    // Attribution: the latest stated fact among the trigger set (FR-TH-2). A matcher may fire off
    // derived objects with no trigger facts (e.g. 84/91 read `circles`); those attribute to the
    // last step so they still surface at the right moment and never claim to be "new" spuriously.
    let attributionIndex = -1;
    let attributionGroup: string | null = null;
    for (const fid of m.triggerFactIds) {
      const p = posOf.get(fid);
      if (p !== undefined && p > attributionIndex) {
        attributionIndex = p;
        attributionGroup = groupOf.get(fid) ?? null;
      }
    }
    if (attributionIndex === -1) {
      attributionIndex = ctx.facts.length - 1;
      attributionGroup = ctx.lastGroup;
    }

    entries.push({
      id: def.id,
      type: def.type,
      tier: m.tier,
      salience: def.salience,
      family: def.family,
      en: def.en,
      he: def.he,
      triggerFactIds: m.triggerFactIds,
      triggerObjectIds: m.triggerObjectIds,
      attributionIndex,
      attributionGroup,
      isNew: attributionGroup !== null && attributionGroup === ctx.lastGroup,
    });
  }

  // Rank: headline before background, then most-recent attribution first, then id for stability.
  entries.sort(
    (a, b) =>
      salienceRank(a.salience) - salienceRank(b.salience) ||
      b.attributionIndex - a.attributionIndex ||
      a.id - b.id,
  );
  return entries;
}
