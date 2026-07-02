/**
 * Hebrew final-letter inflection of the perpendicular keywords ([docs/15-hardening-plan.md] C2 / PAR-3).
 *
 * מאונך / אנך end in kaf-sofit (ך); their plurals swap it for a regular kaf — מאונכים / אנכים — a
 * DIFFERENT code point, so the singular-only keyword sets matched none of them. The exact ADR-119 scenario
 * in its plural flavour ("המיתרים AB ו-CD מאונכים זה לזה") silently dropped BOTH the ⟂ relation and chord
 * CD. Fix: a shared `מאונ[כך]|אנ[כך]` stem at every perpendicular-keyword site. (מקביל/parallel ends in a
 * non-final letter, so its plurals already matched — no change needed there.)
 */

import { describe, it, expect } from 'vitest';
import { parse } from '../parse';

const perp = (u: string, ctx = { points: ['A', 'B', 'C', 'D'] }) => {
  const r = parse(u, ctx);
  if (!r.ok) throw new Error(`did not parse: ${JSON.stringify(u)}`);
  return r.commands;
};

describe('PAR-3 — plural ⟂ keywords (מאונכים / אנכים) parse', () => {
  it('singular "AB מאונך ל-CD" still yields set-perpendicular', () => {
    const c = perp('AB מאונך ל-CD');
    expect(c.some((x) => x.type === 'set-perpendicular')).toBe(true);
  });

  it('plural "AB ו-CD מאונכים זה לזה" yields the SAME ⟂ constraint (was dropped)', () => {
    const c = perp('AB ו-CD מאונכים זה לזה');
    const p = c.find((x) => x.type === 'set-perpendicular') as { a: string; b: string; c: string; d: string } | undefined;
    expect(p, 'a set-perpendicular command').toBeTruthy();
    expect([p!.a, p!.b, p!.c, p!.d].sort()).toEqual(['A', 'B', 'C', 'D']);
  });

  it('plural noun-form "אנכיים" / "אנכים" is caught by the stem too', () => {
    // the ⊥-bisector aside, the bare noun אנך pluralises the same way; the stem matches it in the ⟂ paths
    expect(parse('AB אנך ל-CD', { points: ['A', 'B', 'C', 'D'] }).ok).toBe(true);
    expect(parse('AB אנכים ל-CD', { points: ['A', 'B', 'C', 'D'] }).ok).toBe(true);
  });
});

describe('PAR-3 — plural perpendicular CHORDS keep circle membership (ADR-119 plural flavour)', () => {
  it('"המיתרים AB ו-CD מאונכים זה לזה" → ⟂ constraint + A,B,C,D on the circle', () => {
    const c = perp('המיתרים AB ו-CD מאונכים זה לזה', { points: ['A', 'B', 'C', 'D'], circles: ['O'] } as never);
    expect(c.some((x) => x.type === 'set-perpendicular'), 'the ⟂ relation is kept').toBe(true);
    const onCircle = c.filter((x) => x.type === 'point-on-circle').map((x) => (x as { id: string }).id).sort();
    expect(onCircle, 'chord endpoints asserted on the circle (membership not dropped)').toEqual(['A', 'B', 'C', 'D']);
  });
});
