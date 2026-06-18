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

describe('line/extension meets circle — phrasing matrix', () => {
  const phrasings = [
    'AC extended meets circle P at E',
    'the extension of AC cuts circle P at E',
    'line AC meets circle P at E',
    'המשך AC חותך את מעגל P בנקודה E',
    'הישר AC פוגש את מעגל P בנקודה E',
  ];
  for (const u of phrasings) {
    it(`"${u}" → a line ∩ circle crossing`, () => {
      const ts = types(u);
      expect(ts).toContain('line-circle-intersection');
      expect(ts).not.toContain('circles-tangent');
    });
  }
});
