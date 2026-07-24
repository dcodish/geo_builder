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
import { groupKey, type Fact } from '../replay/core';

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
  const { facts, construction, shapes = [], observed, boosts = [] } = input;
  const boosted = new Set<TheoremId>(boosts);
  const ctx = buildMatchCtx(facts, construction, shapes, observed);
  if (ctx.facts.length === 0) return [];

  const attribute = makeAttributor(ctx);

  const matched: { def: (typeof THEOREM_TABLE)[number]; m: ReturnType<(typeof THEOREM_TABLE)[number]['match']> & object }[] = [];
  for (const def of THEOREM_TABLE) {
    const m = def.match(ctx);
    if (m) matched.push({ def, m });
  }

  // Subsumption (T3, operator D6): when X fires, each Y in X.subsumes that ALSO fired is demoted to
  // the folded band and labelled "covered by #X" — demote-not-remove (non-monotonic relevancy keeps
  // the movement local and explained).
  const firedIds = new Set(matched.map((e) => e.def.id));
  const demotedBy = new Map<TheoremId, TheoremId>();
  for (const { def } of matched) {
    for (const y of def.subsumes ?? []) if (firedIds.has(y)) demotedBy.set(y, def.id);
  }

  const entries: TheoremFeedEntry[] = [];
  for (const { def, m } of matched) {
    // Attribution: the latest stated fact among the trigger set (FR-TH-2). A matcher may fire off
    // derived objects with no trigger facts (e.g. 84/91 read `circles`); those attribute to the
    // last step so they still surface at the right moment and never claim to be "new" spuriously.
    const { attributionIndex, attributionGroup, isNew } = attribute(m.triggerFactIds);

    // The named rank BANDS (docs/18 §5) — lexicographic, discrete, explainable row-by-row; NO
    // weighted score (the operator's D3: "ballpark importance-first", no percentages). Band 0 is
    // reserved for T5 intent boosts.
    const demoter = demotedBy.get(def.id);
    // Band 0 (T5): an id boosted by an active intent archetype outranks everything — including its
    // own demotion (the boost is the more specific signal).
    const band: TheoremFeedEntry['band'] = boosted.has(def.id)
      ? 0
      : demoter !== undefined ? 5 : isNew && def.pointedness === 'pointed' ? 1 : isNew ? 2 : def.pointedness === 'pointed' ? 3 : 4;
    const bandName =
      band === 0 ? 'intent-aligned' :
      band === 5 ? `demoted (covered by #${demoter})` : band === 1 ? 'new+pointed' : band === 2 ? 'new' : band === 3 ? 'pointed' : 'standard';
    const rankTrace = `band ${band} (${bandName}); ${def.pointedness}; L${m.level}; ${m.tier}${isNew ? '; ● new' : ''}`;

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
      pointedness: def.pointedness,
      band,
      ...(demoter !== undefined ? { demotedBy: demoter } : {}),
      rankTrace,
    });
  }

  // Rank (T3): headline before background (the fold contract, unchanged), then BAND, then higher
  // discovery certainty (L1 < L2 < L3), then `certain` before `possible`, then recency, then id —
  // the id tiebreak drops to LAST, so its arbitrariness stops mattering (docs/18 R3).
  entries.sort(
    (a, b) =>
      salienceRank(a.salience) - salienceRank(b.salience) ||
      a.band - b.band ||
      a.level - b.level ||
      (a.tier === b.tier ? 0 : a.tier === 'certain' ? -1 : 1) ||
      b.attributionIndex - a.attributionIndex ||
      idRank(a.id, b.id),
  );
  return entries;
}

/**
 * The DISPLAY contract for the headline section (FR-TH-6, docs/18 §5 caps): at most `cap` visible
 * rows before the expandable "more theorems apply" fold — except bands 0–1 (intent-aligned /
 * new+pointed), which are NEVER capped. Background entries are not this function's business (they
 * live in the per-family fold). Pure; shared by the App and the flood-budget tests so the cap is a
 * tested contract, not a vibe.
 */
export function visibleFeed(entries: TheoremFeedEntry[], cap = 7): { visible: TheoremFeedEntry[]; folded: TheoremFeedEntry[] } {
  const headline = entries.filter((e) => e.salience === 'headline');
  const uncappable = headline.filter((e) => e.band <= 1).length;
  const limit = Math.max(cap, uncappable);
  return { visible: headline.slice(0, limit), folded: headline.slice(limit) };
}
