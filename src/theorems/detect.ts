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
import type { DetectInput, MatchCtx, TheoremFeedEntry, TheoremId } from './types';
import { groupKey, type Fact } from '../store/geoStore';

/** Salience order: headline entries rank above the collapsed background family rows. */
const salienceRank = (s: TheoremFeedEntry['salience']): number => (s === 'headline' ? 0 : 1);

/** Stable id tiebreak: numbered bagrut ids ascending and BEFORE the Appendix string ids (`A2`…`B3`),
 *  which sort alphabetically among themselves (ADR-217). */
const idRank = (a: TheoremId, b: TheoremId): number => {
  const an = typeof a === 'number';
  const bn = typeof b === 'number';
  if (an && bn) return a - b;
  if (an) return -1;
  if (bn) return 1;
  return String(a).localeCompare(String(b));
};

/** Run-specific attribution for one match's `triggerFactIds` — the latest stated fact that completed
 *  the premise (FR-TH-2) + the ●-new flag. Shared by the theorem and concept feeds so both attribute
 *  identically. A match with no trigger facts attributes to the last step (so it never claims to be
 *  spuriously new). */
export function makeAttributor(ctx: MatchCtx) {
  const posOf = new Map<string, number>();
  const groupOf = new Map<string, string>();
  ctx.facts.forEach((f: Fact, i) => {
    posOf.set(f.id, i);
    groupOf.set(f.id, groupKey(f));
  });
  return (triggerFactIds: string[]) => {
    let attributionIndex = -1;
    let attributionGroup: string | null = null;
    for (const fid of triggerFactIds) {
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
    return {
      attributionIndex,
      attributionGroup,
      isNew: attributionGroup !== null && attributionGroup === ctx.lastGroup,
    };
  };
}

export function detectTheorems(input: DetectInput): TheoremFeedEntry[] {
  const { facts, construction, shapes = [] } = input;
  const ctx = buildMatchCtx(facts, construction, shapes);
  if (ctx.facts.length === 0) return [];

  const attribute = makeAttributor(ctx);

  const entries: TheoremFeedEntry[] = [];
  for (const def of THEOREM_TABLE) {
    const m = def.match(ctx);
    if (!m) continue;

    // Attribution: the latest stated fact among the trigger set (FR-TH-2). A matcher may fire off
    // derived objects with no trigger facts (e.g. 84/91 read `circles`); those attribute to the
    // last step so they still surface at the right moment and never claim to be "new" spuriously.
    const { attributionIndex, attributionGroup, isNew } = attribute(m.triggerFactIds);

    entries.push({
      id: def.id,
      type: def.type,
      tier: m.tier,
      salience: def.salience,
      family: def.family,
      en: def.en,
      he: def.he,
      level: m.level,
      triggerFactIds: m.triggerFactIds,
      triggerObjectIds: m.triggerObjectIds,
      attributionIndex,
      attributionGroup,
      isNew,
    });
  }

  // Rank: headline before background, then most-recent attribution first, then id for stability.
  entries.sort(
    (a, b) =>
      salienceRank(a.salience) - salienceRank(b.salience) ||
      b.attributionIndex - a.attributionIndex ||
      idRank(a.id, b.id),
  );
  return entries;
}
