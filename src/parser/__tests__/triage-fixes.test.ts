/**
 * 2-D prod-triage fixes (from /log-triage, 2026-07-09). The triage's single-utterance
 * verification (no figure context) over-reported gaps — most "altitude/median from a
 * vertex", radius, on-circle and outside-circle phrasings already work WITH a figure.
 * The genuine remaining gaps, replayed here as the exact prod utterances (with the
 * figure context a real user has):
 *   - altitude/median apex DESCRIPTORS `מקודקוד`/`מהנקודה` + an explicit-side median
 *   - the QUAD DIAGONALS `אלכסונים` / `AC ו-BD אלכסוני הריבוע`
 */

import { describe, expect, it } from 'vitest';
import { parse } from '../parse';
import type { ParseContext } from '../parse';

const ctx = (over: Partial<ParseContext> = {}): ParseContext =>
  ({ points: ['A', 'B', 'C', 'D'], segments: [], circles: [], polygons: [['A', 'B', 'C', 'D']], ...over }) as ParseContext;
const ok = (u: string, c = ctx()) => {
  const r = parse(u, c);
  if (!r.ok) throw new Error(`not parsed: ${u} → ${r.reason}`);
  return r.commands;
};
const types = (u: string, c = ctx()) => ok(u, c).map((x) => x.type);
const segs = (u: string, c = ctx()) => ok(u, c).filter((x): x is Extract<typeof x, { type: 'segment' }> => x.type === 'segment').map((x) => `${x.a}${x.b}`);

describe('2-D triage — altitude / median apex descriptors', () => {
  it('altitude from a VERTEX / point descriptor', () => {
    expect(types('גובה מקודקוד D לצלע AB')).toContain('foot');
    expect(types('height from vertex D to AB')).toContain('foot');
    expect(types('גובה מ B')).toContain('foot'); // regression (bare "from B")
  });
  it('median from a point with an explicit side (no named segment, no triangle)', () => {
    expect(types('מהנקודה C הורידו תיכון לצלע AB')).toEqual(['midpoint', 'segment']);
    expect(types('AD תיכון במשולש ABC')).toEqual(['midpoint', 'segment']); // regression
  });
});

describe('2-D triage — quad diagonals', () => {
  it('named diagonals AC ו-BD', () => {
    expect(segs('AC ו-BD אלכסוני הריבוע')).toEqual(['AC', 'BD']);
  });
  it('the diagonals of a named / the current quad', () => {
    expect(segs('אלכסוני ABCD')).toEqual(['AC', 'BD']);
    expect(segs('אלכסונים')).toEqual(['AC', 'BD']); // uses the figure's single polygon
    expect(segs('the diagonals of ABCD')).toEqual(['AC', 'BD']);
  });
  it('singular אלכסון AC is still a lone segment', () => {
    expect(segs('אלכסון AC')).toEqual(['AC']);
  });
});
