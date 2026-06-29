import { describe, it, expect } from 'vitest';
import { parse } from '../parse';
import type { AnyCommand } from '@/engine';

/**
 * Regression locks for the gaps surfaced by the FIRST production usage log (2026-06-29, 57 students).
 * Analytics showed ~31% of real submits escalated to the LLM and ~19% failed outright; the failures
 * clustered into a handful of phrasings the deterministic grammar didn't cover. Each `it` below is one
 * of those clusters, asserted from the EXACT utterances students typed (the dominant end-to-end session
 * is locked separately in `src/__tests__/scenarios.test.ts` → `bagrut-chord-diameter-perp-session`).
 */
const types = (u: string, ctx: { points?: string[]; circles?: string[] } = {}) => {
  const r = parse(u, { points: [], circles: [], circleMembers: [], ...ctx } as never);
  return r.ok ? (r.commands as AnyCommand[]).map((c) => c.type) : null;
};

describe('production feedback — definite-article chord "המיתר" (#1)', () => {
  // The #1 failure (11×): the DEFINITE article was missing from CARRIER_NOUN, so "המיתר" missed while
  // "מיתר"/"הצלע"/"הקטע" matched. With a circle in context the point lands on the chord (A,C on the circle).
  const ctx = { circles: ['O'], points: ['A', 'C'] };
  for (const u of ['E על המיתר AC', 'נקודה E על המיתר AC', 'E נקודה על המיתר AC', 'E נמצאת על המיתר AC']) {
    it(`"${u}" places the rider on the chord (point-on-segment, not dropped)`, () => {
      expect(types(u, ctx), u).toContain('point-on-segment');
    });
  }
  it('the indefinite "E על מיתר AC" still works (unchanged)', () => {
    expect(types('E על מיתר AC', ctx)).toContain('point-on-segment');
  });
});

describe('production feedback — perpendicular as the noun "אנך" (#5)', () => {
  // LLM-rescued 8×: the ⟂ CONSTRAINT matched "מאונך"/"⊥" but not the noun "אנך ל".
  for (const u of ['EF אנך ל AB', 'AB אנך ל-EF', 'AB אנך לEF']) {
    it(`"${u}" → set-perpendicular`, () => {
      expect(types(u, { points: ['A', 'B', 'E', 'F'] }), u).toContain('set-perpendicular');
    });
  }
});

describe('production feedback — "AB קוטר במעגל" defines a circle from its diameter (#3)', () => {
  // not-understood as an opener: A,B new, no circle yet → must DEFINE a circle whose diameter is AB.
  for (const u of ['AB קוטר במעגל', 'קוטר במעגל AB', 'AB קוטר במעגל O']) {
    it(`"${u}" → segment + midpoint(centre) + circle-through`, () => {
      expect(types(u), u).toEqual(['segment', 'midpoint', 'circle-through']);
    });
  }
  it('the ADD phrasing "diameter DE in circle O" is unchanged (routes to `diameter`)', () => {
    expect(types('diameter DE in circle O')).not.toContain('midpoint');
    expect(types('diameter DE in circle O')).toContain('diameter');
  });
});

describe('production feedback — perpendicular / altitude FROM a point (#6)', () => {
  // LLM-rescued: the from-apex gate required a hyphen ("מ-"), and the descriptor nouns ("מנקודה"/"לצלע")
  // broke the apex/side regexes. Both now tolerated → foot + the segment to it.
  const ctx = { points: ['A', 'B', 'D'] };
  for (const u of ['אנך מD ל AB', 'אנך מD לAB', 'גובה מנקודה D לצלע AB', 'אנך מנקודה D ל AB']) {
    it(`"${u}" → foot + segment`, () => {
      expect(types(u, ctx), u).toEqual(['foot', 'segment']);
    });
  }
  it('the 2-segment ⟂ constraint is NOT mistaken for a from-point altitude', () => {
    expect(types('EF אנך ל AB', { points: ['A', 'B', 'E', 'F'] })).toContain('set-perpendicular');
  });
});

describe('production feedback — divide a segment in a ratio (#7)', () => {
  const ctx = { points: ['C', 'D', 'G'] };
  for (const u of ['G מחלקת את DC ביחס 1:2', 'נקודה G מחלקת את DC ביחס 1:2', 'G divides DC in ratio 1:2', 'היחס בין DG ל-GC הוא 1:2']) {
    it(`"${u}" → point-on-segment at the ratio`, () => {
      const r = parse(u, { points: ['C', 'D', 'G'], circles: [], circleMembers: [] } as never);
      expect(r.ok, u).toBe(true);
      if (!r.ok) return;
      const pos = (r.commands as AnyCommand[]).find((c) => c.type === 'point-on-segment') as { t?: number } | undefined;
      expect(pos, u).toBeDefined();
      expect(pos!.t, `${u} → t = 1/3`).toBeCloseTo(1 / 3, 5);
    });
  }
  it('does not hijack a segment-ratio "AE/ED = 2/3" or an equality "AB = CD"', () => {
    expect(types('AE/ED = 2/3', ctx)).toContain('set-ratio');
    expect(types('AB = CD', ctx)).toContain('set-equal');
  });
});

describe('production feedback — name/draw a radius "OB רדיוס" (#8)', () => {
  const ctx = { circles: ['O'], points: ['A', 'B', 'O'] };
  for (const u of ['OB רדיוס', 'רדיוס OB', 'הוסף רדיוס OB']) {
    it(`"${u}" → rim point on the circle + centre→rim segment`, () => {
      expect(types(u, ctx), u).toEqual(['point-on-circle', 'segment']);
    });
  }
  it('does not hijack "D אמצע הרדיוס OB" (a midpoint) or a numeric radius', () => {
    expect(types('D אמצע הרדיוס OB', { circles: ['O'], points: ['A', 'B', 'O', 'D'] })).toContain('midpoint');
    expect(types('OB רדיוס = 5', ctx)).not.toContain('point-on-circle');
  });
});
