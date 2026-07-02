/**
 * Plural carrier nouns for N-points-on-N-segments ([docs/15-hardening-plan.md] C7 / PAR-8).
 *
 * `pointsOnSegments` (ADR-076) reads UPPERCASE labels only and correctly ignores the noun word, so
 * "F, G, H on sides AB, AC, CB" already worked. But when the plural noun contains a `segment`-rule keyword
 * ("segments" ⊃ "segment", "הקטעים" ⊃ "קטע", "diagonals" ⊃ "diagonal"), the `segment` DEFINITION rule (which
 * runs first) fired and its POINT_ON_CARRIER guard — singular-only — didn't recognise the plural, so it
 * grabbed the first two-label run and dropped F,G,H. Fix: pluralise CARRIER_NOUN (segments?/הקטעים/diagonals?/
 * אלכסונים/…) so the guard recognises the plural and `segment` defers to `pointsOnSegments`.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '../parse';

const ctx = { points: ['A', 'B', 'C', 'F', 'G', 'H'] } as const;
const placements = (u: string) => {
  const r = parse(u, ctx as never);
  if (!r.ok) throw new Error(`did not parse: ${JSON.stringify(u)} → ${JSON.stringify(r)}`);
  const pos = r.commands.filter((x) => x.type === 'point-on-segment') as { id: string; a: string; b: string }[];
  return pos.map((p) => `${p.id}:${[p.a, p.b].sort().join('')}`).sort();
};

describe('PAR-8 — N points pairwise on N segments, with a PLURAL carrier noun', () => {
  it('EN "points F, G, H on segments AB, AC, CB" → F,G,H each on its segment (was dropped)', () => {
    expect(placements('points F, G, H on segments AB, AC, CB')).toEqual(['F:AB', 'G:AC', 'H:BC']);
  });

  it('EN without the "points" word: "F, G, H on segments AB, AC, CB"', () => {
    expect(placements('F, G, H on segments AB, AC, CB')).toEqual(['F:AB', 'G:AC', 'H:BC']);
  });

  it('HE "נקודות F, G, H על הקטעים AB, AC, CB" (the segment-keyword plural that used to fail)', () => {
    expect(placements('נקודות F, G, H על הקטעים AB, AC, CB')).toEqual(['F:AB', 'G:AC', 'H:BC']);
  });

  it('HE "נקודות F, G, H על הצלעות AB, AC, CB" (sides — still works)', () => {
    expect(placements('נקודות F, G, H על הצלעות AB, AC, CB')).toEqual(['F:AB', 'G:AC', 'H:BC']);
  });

  it('EN "points F, G, H on sides AB, AC, CB" (sides — still works)', () => {
    expect(placements('points F, G, H on sides AB, AC, CB')).toEqual(['F:AB', 'G:AC', 'H:BC']);
  });
});

describe('PAR-8 — the singular carrier still parses (no regression from pluralising)', () => {
  it('"E on segment AC" is still a single point on the carrier', () => {
    const r = parse('E on segment AC', { points: ['A', 'C'] } as never);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.commands.some((x) => x.type === 'point-on-segment')).toBe(true);
  });

  it('"E על האלכסון AC" (singular diagonal, final nun) still parses', () => {
    const r = parse('E על האלכסון AC', { points: ['A', 'C'] } as never);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.commands.some((x) => x.type === 'point-on-segment')).toBe(true);
  });
});
