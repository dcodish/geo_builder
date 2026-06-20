/**
 * Phrasing matrix for the two-circle "meet" constructs (ADR-053 process rule): a construct isn't
 * covered until SEVERAL natural He/En phrasings parse — synonyms (פוגש / חותך / נחתך / meets / cuts),
 * word order, with/without "line". The missing synonym "פוגש" is exactly what shipped the original bug.
 */
import { describe, it, expect } from 'vitest';
import { parse } from '@/parser';

const types = (u: string): string[] => {
  const r = parse(u);
  expect(r.ok, `should parse: ${u}`).toBe(true);
  return r.ok ? r.commands.map((c) => c.type) : [];
};

describe('tangent-to-circle-meets-other-circle — phrasing matrix', () => {
  const phrasings = [
    'the tangent to circle O at A meets circle P at D',
    'tangent to circle O at A cuts circle P at D',
    'המשיק למעגל O בנקודה A פוגש את מעגל P בנקודה D',
    'המשיק למעגל O בנקודה A חותך את מעגל P בנקודה D',
  ];
  for (const u of phrasings) {
    it(`"${u}" → tangent ∩ the other circle (never circles-tangent)`, () => {
      const ts = types(u);
      expect(ts).toContain('tangent');
      expect(ts).toContain('line-circle-intersection');
      expect(ts).not.toContain('circles-tangent'); // the misparse this guards
    });
  }
});

// A DIRECTIONAL extension (המשך / extension / extended) routes to `extend-onto-circle` (D beyond the
// 2nd letter, ADR-054); a plain "line AC meets circle P" stays the order-agnostic chord (lineMeetsCircle).
describe('DIRECTIONAL extension onto circle — phrasing matrix', () => {
  const phrasings = [
    'AC extended meets circle P at E',
    'the extension of AC cuts circle P at E',
    'המשך AC חותך את מעגל P בנקודה E',
    'המשך AC פוגש את מעגל P בנקודה E',
  ];
  for (const u of phrasings) {
    it(`"${u}" → extend-onto-circle (directional, D beyond the 2nd letter)`, () => {
      const ts = types(u);
      expect(ts).toContain('extend-onto-circle');
      expect(ts).not.toContain('circles-tangent');
    });
  }
});

// A cuts/meets keyword means a tangent LINE meeting the other circle — never mutual tangency between
// two circles. A near-miss of `tangentMeetsOtherCircle` (e.g. a typo in the "at" connector) must NOT
// fall through to `circles-tangent` (which silently repositions the circles and draws no line).
describe('a "cuts/meets" phrasing never becomes mutual tangency (circles-tangent guard)', () => {
  const phrasings = [
    'tangent to circle O at A cuts circle P at C',
    'המשיק למעגל O בנקודה A חותך את מעגל P בנקודה C',
    'המשיק למעגל O שנקודה A חותך את מעגל P בנקודה C', // the operator's typo (שנקודה): must still not mutual-tangent
  ];
  for (const u of phrasings) {
    it(`"${u}" → not circles-tangent`, () => {
      const r = parse(u);
      // Either it parses (to the tangent-meets construct) or it escalates — but it is NEVER read as the
      // two circles being tangent to each other (the silent, line-less misparse this guards).
      if (r.ok) expect(r.commands.map((c) => c.type)).not.toContain('circles-tangent');
    });
  }
});

describe('directional extension — exact command (order beyond the 2nd letter)', () => {
  it('"המשך AC חותך מעגל P בנקודה D" → extend-onto-circle {a:A, b:C, id:D} (D beyond C)', () => {
    const r = parse('המשך AC חותך את מעגל P בנקודה D');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.commands).toContainEqual({ type: 'extend-onto-circle', id: 'D', a: 'A', b: 'C', circle: 'circle-P' });
  });
  it('English "CA extended meets circle P at D" → {a:C, b:A} (D beyond A — the 2nd letter)', () => {
    const r = parse('CA extended meets circle P at D');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.commands).toContainEqual({ type: 'extend-onto-circle', id: 'D', a: 'C', b: 'A', circle: 'circle-P' });
  });
});

describe('order-agnostic line meets circle — phrasing matrix', () => {
  const phrasings = ['line AC meets circle P at E', 'הישר AC פוגש את מעגל P בנקודה E'];
  for (const u of phrasings) {
    it(`"${u}" → line-circle-intersection (a chord, no extension word)`, () => {
      const ts = types(u);
      expect(ts).toContain('line-circle-intersection');
      expect(ts).not.toContain('extend-onto-circle');
    });
  }
});
