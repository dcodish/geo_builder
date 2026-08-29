/**
 * #760 (ADR-464) — «<point> על <carrier> במרחק <n> מ-<endpoint>»: a 1-DOF membership whose
 * parameter the stated magnitude pins. Operator (2026-08-19, playing PR #759): «"D על AB במרחק
 * 3 מ-A" — doesn't work, the rest do.» Both halves were fully supported alone; nothing lowered
 * them together, so the membership rule claimed the utterance, the distance was never read, and
 * the ADR-250 gate honestly refused — an escalation (paid, unreliable) for ordinary bagrut
 * phrasing.
 *
 * The class, not the instance: every carrier the membership lane supports is supported here by
 * construction, because the compound parses its LEFT through the real grammar and synthesizes
 * the distance statement through the real `set-distance` lane. The hyphenated «כך ש-» spelling
 * is the same fix's second hole: the SUCH_THAT splitter admitted only whitespace/Latin after ש,
 * so «כך ש-AD = 2·DB» fell to the ratio rule, which kept the ratio and DROPPED the membership.
 */
import { describe, expect, it } from 'vitest';
import { parse } from '../parse';
import type { ParseContext } from '../parse';

const ctx = { points: ['A', 'B'], circles: ['O'] } as unknown as ParseContext;
const types = (u: string): string[] => {
  const r = parse(u, ctx);
  return r.ok ? r.commands.map((c) => c.type) : ['not-handled'];
};

describe('#760 — point on a carrier AT a stated distance composes', () => {
  it('the operator’s reported form, with and without the subject noun', () => {
    for (const u of ['D על AB במרחק 3 מ-A', 'נקודה D על AB במרחק 3 מ-A']) {
      expect(types(u), u).toEqual(['segment', 'point-on-segment', 'segment', 'set-distance']);
      const r = parse(u, ctx);
      if (r.ok) {
        const sd = r.commands.find((c) => c.type === 'set-distance') as { a: string; b: string; value: number };
        expect([sd.a, sd.b].sort()).toEqual(['A', 'D']);
        expect(sd.value).toBe(3);
      }
    }
  });

  it('the הצהרת «כך ש» spellings agree — hyphenated and spaced', () => {
    expect(types('D על AB כך ש-AD = 3')).toEqual(types('D על AB כך ש AD = 3'));
    expect(types('D על AB כך ש-AD = 3')).toEqual(['segment', 'point-on-segment', 'segment', 'set-distance']);
  });

  it('the hyphenated RATIO member keeps its membership (was: set-ratio alone, membership dropped)', () => {
    const t = types('D על AB כך ש-AD = 2·DB');
    expect(t).toContain('point-on-segment');
    expect(t).toContain('set-ratio');
  });

  it('the class: extension and circle carriers compose the same way', () => {
    expect(types('D על המשך AB במרחק 3 מ-B')).toContain('set-distance');
    expect(types('D על המשך AB במרחק 3 מ-B')).toContain('point-on-segment');
    expect(types('D על מעגל O במרחק 5 מ-A')).toEqual(['point-on-circle', 'segment', 'set-distance']);
  });

  it('English mirrors', () => {
    expect(types('D on AB at a distance of 3 from A')).toEqual(['segment', 'point-on-segment', 'segment', 'set-distance']);
    expect(types('D on AB at distance 3 from A')).toEqual(['segment', 'point-on-segment', 'segment', 'set-distance']);
  });

  it('falls through whole when the subject is not a point-on-carrier statement', () => {
    // a distance clause on an unrelated head must not be half-claimed by the compound
    const r = parse('המשיק למעגל O במרחק 3 מ-A', ctx);
    expect(r.ok ? r.commands.map((c) => c.type) : 'not-handled').not.toContain('set-distance');
  });
});
