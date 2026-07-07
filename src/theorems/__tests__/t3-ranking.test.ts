/**
 * T3 — "prioritized" as a TESTED contract (ADR-246; docs/18 §5/§9.2-9.3). The rank is a
 * lexicographic sort over NAMED, discrete keys (salience → band → level → tier → recency → id) —
 * explainable row-by-row via `rankTrace`, never a weighted score (operator D3). These lock:
 *   - pointedness beats recency (the R3 "an unrelated segment reshuffles the order" complaint);
 *   - subsumption demotes with a "covered by #X" label (D6), demote-not-remove;
 *   - the visibleFeed cap (FR-TH-6): ≤7 headline rows, bands 0-1 never capped;
 *   - `certain` sorts before `possible` within a band.
 */

import { describe, it, expect } from 'vitest';
import { parse, buildParseCtx } from '@/parser';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';
import { detectTheorems, visibleFeed } from '../detect';
import type { TheoremFeedEntry, TheoremId } from '../types';

function feedOf(utterances: string[]): TheoremFeedEntry[] {
  const facts: Fact[] = [];
  let g = 0;
  for (const u of utterances) {
    const { construction, positions } = replay(facts);
    const r = parse(u, buildParseCtx(construction, positions));
    if (!r.ok) throw new Error(`did not parse: ${u}`);
    const group = `g${g++}`;
    for (const cmd of r.commands as AnyCommand[]) facts.push({ id: `${group}.${facts.length}`, utterance: u, group, cmd, enabled: true });
  }
  const { construction } = replay(facts);
  return detectTheorems({ facts, construction });
}
const headlineIds = (feed: TheoremFeedEntry[]): TheoremId[] => feed.filter((e) => e.salience === 'headline').map((e) => e.id);
const rankOf = (feed: TheoremFeedEntry[], id: TheoremId): number => headlineIds(feed).indexOf(id);

describe('T3 ranking (ADR-246)', () => {
  it('a stated diameter ranks its announcement (103/104) at the very top (band 1: new+pointed)', () => {
    const feed = feedOf(['circle O', 'C on circle O', 'D on circle O', 'diameter AB in circle O']);
    const top2 = headlineIds(feed).slice(0, 2);
    expect(top2).toEqual(expect.arrayContaining([103, 104]));
  });

  it('an OLDER step\'s new entries may precede older pointed ones — the kept band-2 "what did my last fact buy me" contract', () => {
    // §5 places band 2 (new) above band 3 (pointed, older) BY DESIGN; this locks that deliberate
    // choice so a future "pointedness should always win" refactor is a conscious decision.
    const feed = feedOf(['circle O', 'diameter AB in circle O', 'C on circle O', 'chord AC in circle O']);
    const h = headlineIds(feed);
    const firstNew = feed.find((e) => e.salience === 'headline' && e.isNew);
    if (firstNew) expect(h.indexOf(firstNew.id)).toBeLessThanOrEqual(h.indexOf(103));
  });

  it('POINTEDNESS BEATS RECENCY: an unrelated later step does not dethrone the pointed diameter', () => {
    // The R3 complaint: "after an unrelated segment is drawn, the order reshuffles". The diameter's
    // 103/104 are pointed (band 3 once older); the unrelated crossing's #2 is generic (band 4 at
    // best via its background salience — and even a headline standard entry lands below band 3).
    const feed = feedOf([
      'circle O',
      'diameter AB in circle O',
      'triangle DEF',
      'G is the intersection of DE and AB',
    ]);
    const h = headlineIds(feed);
    expect(h.indexOf(103)).toBeLessThan(Math.max(0, h.indexOf(102) === -1 ? h.length : h.indexOf(102)));
    expect(rankOf(feed, 103)).toBeLessThan(3);
    expect(rankOf(feed, 104)).toBeLessThan(3);
  });

  it('SUBSUMPTION: 87 demotes the generic same-circle 99/102 with a "covered by" label (D6)', () => {
    const feed = feedOf(['quadrilateral ABCD inscribed in circle O']);
    const e99 = feed.find((e) => e.id === 99);
    const e102 = feed.find((e) => e.id === 102);
    const e87 = feed.find((e) => e.id === 87);
    expect(e87?.band).toBeLessThan(5);
    expect(e99?.band).toBe(5);
    expect(e99?.demotedBy).toBe(87);
    expect(e102?.band).toBe(5);
    // demote-not-remove: still present, still citable, ranked below the demoting entry.
    expect(rankOf(feed, 87)).toBeLessThan(rankOf(feed, 102));
  });

  it('the inscribed trapezoid corollary 201 demotes the co-interior 8 it covers', () => {
    const feed = feedOf(['טרפז ABCD חסום במעגל']);
    const e8 = feed.find((e) => e.id === 8);
    expect(e8?.demotedBy).toBe(201);
  });

  it('every entry carries an explainable rankTrace naming its band', () => {
    const feed = feedOf(['triangle ABC', 'AB = AC']);
    for (const e of feed) {
      expect(e.rankTrace).toContain(`band ${e.band}`);
      expect(e.rankTrace).toContain(e.pointedness);
    }
  });

  it('certain sorts before possible within a band', () => {
    // A stated bisector (78, certain, pointed... standard) vs a converse prompt of the same band.
    const feed = feedOf(['parallelogram ABCD', 'AC = BD', 'AB = 6']);
    const h = feed.filter((e) => e.salience === 'headline' && e.band === 4);
    for (let i = 1; i < h.length; i++) {
      if (h[i - 1].level === h[i].level) {
        expect(h[i - 1].tier === 'possible' && h[i].tier === 'certain').toBe(false);
      }
    }
  });

  it('the visibleFeed cap holds at 7, with the fold carrying the rest (FR-TH-6)', () => {
    // A busy figure: an inscribed quad + tangent + equalities fires well over 7 headliners.
    const feed = feedOf([
      'quadrilateral ABCD inscribed in circle O',
      'the tangent at C meets the extension of AB at E',
      'AB = CB',
      'AC bisects angle ECD',
    ]);
    const { visible, folded } = visibleFeed(feed);
    expect(visible.length).toBeLessThanOrEqual(7);
    expect(visible.length + folded.length).toBe(feed.filter((e) => e.salience === 'headline').length);
    // Nothing folded may outrank (lower band than) anything visible.
    if (folded.length) {
      const maxVisibleBand = Math.max(...visible.map((e) => e.band));
      expect(Math.min(...folded.map((e) => e.band))).toBeGreaterThanOrEqual(maxVisibleBand);
    }
  });

  it('bands 0-1 are never capped: many new+pointed entries all stay visible', () => {
    // One step that completes MANY pointed premises at once (an inscribed quad + a diameter in the
    // same utterance sequence, all attributed to the latest steps).
    const feed = feedOf(['quadrilateral ABCD inscribed in circle O', 'diameter AC in circle O']);
    const newPointed = feed.filter((e) => e.salience === 'headline' && e.band === 1);
    const { visible } = visibleFeed(feed, 2); // absurdly small cap to force the rule
    for (const e of newPointed) expect(visible.some((v) => v.id === e.id)).toBe(true);
  });
});
