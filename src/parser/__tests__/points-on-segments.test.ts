/**
 * A LIST of points placed PAIRWISE on a LIST of segments — "F, G, H on AB, AC, CB" → F on AB,
 * G on AC, H on CB (ADR-076). Both "הצלעות" (sides) and "הישרים" (lines) read as point-on-segment.
 * Previously this had no deterministic rule and escalated to the LLM, which built nothing on the
 * "הישרים" wording (operator session svjp9x5e). The rule must NOT steal the two-on-one-segment
 * (`pointsOnSegment`) or singular (`pointOnSegment`) cases.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '@/parser';

const ctx = { points: ['A', 'B', 'C'], circles: [] as string[] };
// ADR-250: each stated carrier is DRAWN before its rider.
const FGH = [
  { type: 'segment', a: 'A', b: 'B' },
  { type: 'point-on-segment', id: 'F', a: 'A', b: 'B' },
  { type: 'segment', a: 'A', b: 'C' },
  { type: 'point-on-segment', id: 'G', a: 'A', b: 'C' },
  { type: 'segment', a: 'C', b: 'B' },
  { type: 'point-on-segment', id: 'H', a: 'C', b: 'B' },
];

describe('parse — N points pairwise on N segments', () => {
  for (const u of [
    'נקודות F, G, H נמצאות על הישרים AB, AC, CB', // the reported (lines) wording
    'נקודות F, G, H נמצאות על הצלעות AB, AC, CB', // sides
    'נקודות F, G, H על הישרים AB, AC, CB', // no "נמצאות"
    'points F, G, H are on the sides AB, AC, CB',
    'points F, G, H on lines AB, AC, CB',
  ]) {
    it(`parses pairwise: ${u}`, () => {
      const r = parse(u, ctx);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.commands).toEqual(FGH);
    });
  }

  it('two points on ONE segment is still pointsOnSegment (both on AC), not pairwise', () => {
    const r = parse('L ו-K נקודות על AC', { points: ['A', 'C'], circles: [] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.commands).toEqual([
      { type: 'segment', a: 'A', b: 'C' }, // the stated carrier is drawn once (ADR-250)
      { type: 'point-on-segment', id: 'L', a: 'A', b: 'C' },
      { type: 'point-on-segment', id: 'K', a: 'A', b: 'C' },
    ]);
  });

  it('a single "F on AB" is still the singular rule', () => {
    const r = parse('F on AB', { points: ['A', 'B'], circles: [] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.commands).toEqual([
      { type: 'segment', a: 'A', b: 'B' },
      { type: 'point-on-segment', id: 'F', a: 'A', b: 'B' },
    ]);
  });

  it('defers points on a CIRCLE (not segments)', () => {
    // "A and B on circle O" must reach the circle rules, not be read as pairwise segments.
    const r = parse('F, G on circle O', { points: [], circles: ['O'] });
    if (r.ok) expect(r.commands.every((c) => c.type !== 'point-on-segment')).toBe(true);
  });

  it('a mismatched count (2 points, 1 segment-pair worth of labels) is not pairwise', () => {
    // "F, G on AB" — 2 points but only one 2-letter segment → not 2·N labels → not this rule.
    const r = parse('F, G on AB', { points: ['A', 'B'], circles: [] });
    // pointsOnSegment handles "F, G on AB" (two points on segment AB)
    if (r.ok) expect(r.commands).toEqual([
      { type: 'segment', a: 'A', b: 'B' },
      { type: 'point-on-segment', id: 'F', a: 'A', b: 'B' },
      { type: 'point-on-segment', id: 'G', a: 'A', b: 'B' },
    ]);
  });
});
