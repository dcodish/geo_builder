/**
 * THE CONCURRENCY VERB IS AN ALTERNATION (#1081).
 *
 * Operator, 2026-09-15: «אלכסוני הדלתון **נחתכים** בנקודה O» — not supported. Measured, «נפגשים» on
 * the same figure worked perfectly: the shape resolved, the point was placed, and the only
 * difference was one verb.
 *
 * That is the FIFTH one-spelling gate in this parser (#1069 the point-on-object nouns, #1072
 * «משוואת» without its noun, #1074 the segment noun, #1070 the construct state, and this one). So
 * this test asserts the FORMS — every verb over every role — rather than the sentence that was
 * reported, and a sixth spelling has a place to be added.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';

const VERBS_HE = ['נפגשים', 'נחתכים', 'מצטלבים'];
const VERBS_EN = ['meet', 'intersect', 'cross'];

/** Every concurrency role, with the figure it needs and the point it names. */
const ROLES: Array<{ subject: string; shape: string; id: string }> = [
  { subject: 'אלכסוני המרובע', shape: 'מרובע ABCD', id: 'O' },
  { subject: 'האלכסונים', shape: 'דלתון ABCD', id: 'O' },
  { subject: 'התיכונים', shape: 'משולש ABC', id: 'M' },
  { subject: 'הגבהים', shape: 'משולש ABC', id: 'H' },
  { subject: 'חוצי הזוויות', shape: 'משולש ABC', id: 'I' },
];

describe('#1081 — every verb, over every role', () => {
  for (const role of ROLES) {
    for (const verb of VERBS_HE) {
      it(`«${role.subject} ${verb}»`, () => {
        const lines = [role.shape, `${role.subject} ${verb} בנקודה ${role.id}`];
        const d = derive(lines, 0);
        expect(d.faults).toEqual([]);
        expect(d.figure.points.some((p) => p.id === role.id)).toBe(true);
      });
    }
  }

  it('and they build the SAME figure, not merely a figure', () => {
    // Compared as constructions rather than parses: what must agree is what was built.
    const canonical = derive(['מרובע ABCD', 'אלכסוני המרובע נפגשים בנקודה O'], 0);
    for (const verb of VERBS_HE.slice(1)) {
      const other = derive(['מרובע ABCD', `אלכסוני המרובע ${verb} בנקודה O`], 0);
      expect(JSON.stringify(other.construction), verb).toBe(JSON.stringify(canonical.construction));
    }
  });

  it('the English verbs likewise', () => {
    for (const verb of VERBS_EN) {
      const d = derive(['quadrilateral ABCD', `the diagonals ${verb} at point O`], 0);
      expect(d.faults, verb).toEqual([]);
      expect(d.figure.points.some((p) => p.id === 'O')).toBe(true);
    }
  });

  it('the operator’s own sentence, with the kite it was about', () => {
    const d = derive(['דלתון ABCD', 'אלכסוני הדלתון נחתכים בנקודה O'], 0);
    expect(d.faults).toEqual([]);
    const o = d.figure.points.find((p) => p.id === 'O')!;
    // It really is the crossing: on both diagonals.
    const p = Object.fromEntries(d.figure.points.map((q) => [q.id, q]));
    const cross = (a: string, b: string) =>
      (o.x - p[a].x) * (p[b].y - p[a].y) - (o.y - p[a].y) * (p[b].x - p[a].x);
    expect(cross('A', 'C')).toBeCloseTo(0, 4);
    expect(cross('B', 'D')).toBeCloseTo(0, 4);
  });
});
