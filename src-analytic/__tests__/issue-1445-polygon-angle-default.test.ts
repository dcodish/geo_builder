/**
 * #1445 ([ADR-AG-243](../../docs/06c-decisions-analytic.md#adr-ag-243), operator ruling 2026-09-27; 2-D's
 * [ADR-590](../../docs/06-decisions.md#adr-590)) — «זווית B» in a triangle means the TRIANGLE's angle, said
 * aloud, however many segments leave B. One sentence, one verdict (ADR-W-108): the same table as 2-D.
 *
 * Measured at pickup (9d1b0b1f, the real `decideSubmit`): after «משולש ABC» and any cevian at B («BD חוצה
 * זווית B», «BD גובה», «BD תיכון», «D על AC» · «הקטע BD»), «זווית B = 2 זווית C», «זווית B = 30», «זווית B
 * ישרה» and «זווית B = זווית C» were all refused `ambiguous-angle` (example «ABC»), while 2-D refused them too.
 * Both builders now read ∠ABC and say so; with 0 or ≥ 2 shapes at the vertex both ask, listing the candidates.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit, noticeText, reachesFallback } from '../app/submit';
import { derive } from '../engine/derive';
import { canonicalConstraint } from '../engine/solve';
import { errorText } from '../app/errorText';
import { analyticI18n } from '../i18n';

const plain = (s: string) => s.replace(/[⁦-⁩]/g, '');
const CEVIANS = [
  ['משולש ABC', 'BD חוצה זווית B'],
  ['משולש ABC', 'BD גובה'],
  ['משולש ABC', 'BD תיכון'],
  ['משולש ABC', 'D על AC', 'הקטע BD'],
];
const meaning = (lines: string[]) => {
  const d = derive(lines, 0);
  expect(d.faults, lines.join(' · ')).toEqual([]);
  return canonicalConstraint(d.construction.constraints[d.construction.constraints.length - 1]);
};
const angleDeg = (lines: string[], v: string, a: string, b: string, seed = 0) => {
  const d = derive(lines, seed);
  const P = (id: string) => d.figure.points.find((q) => q.id === id)!;
  const V = P(v), A = P(a), B = P(b);
  const ux = A.x - V.x, uy = A.y - V.y, wx = B.x - V.x, wy = B.y - V.y;
  return (Math.atan2(Math.abs(ux * wy - uy * wx), ux * wx + uy * wy) * 180) / Math.PI;
};

describe('#1445 — a cevian at B no longer makes «זווית B» ambiguous in △ABC', () => {
  for (const prefix of CEVIANS)
    it.each([
      ['זווית B = 2 זווית C', 'זווית ABC = 2 זווית ACB'],
      ['זווית B = 30', 'זווית ABC = 30'],
      ['זווית B = זווית C', 'זווית ABC = זווית ACB'],
      ['זווית B ישרה', 'זווית ABC ישרה'],
    ])(`after «${prefix.join(' · ')}»: «%s» records, says «הובן כ-∠ABC», and means «%s»`, (lone, three) => {
      const v = decideSubmit(lone, prefix, 0);
      if (v.kind !== 'record') throw new Error(JSON.stringify(v));
      expect(v.notice).toEqual({ code: 'angle-read-as', detail: lone, holder: 'ABC' });
      expect(reachesFallback(v)).toBe(false);
      expect(meaning([...prefix, lone])).toBe(meaning([...prefix, three]));
    });

  it('the notice reads «הובן כ-∠ABC» (and "Read as ∠ABC")', () => {
    const v = decideSubmit('זווית B = 30', CEVIANS[1], 0);
    if (v.kind !== 'record') throw new Error(JSON.stringify(v));
    const he = plain(noticeText(v.notice, (k, o) => analyticI18n.t(k, { ...o, lng: 'he' }) as string) ?? '');
    const en = plain(noticeText(v.notice, (k, o) => analyticI18n.t(k, { ...o, lng: 'en' }) as string) ?? '');
    expect(he).toContain('הובן כ-∠ABC');
    expect(en).toContain('Read as ∠ABC');
  });

  it('two edges at the vertex: no announcement (there was never a choice)', () => {
    const v = decideSubmit('זווית B = 30', ['משולש ABC'], 0);
    expect(v.kind === 'record' && v.notice).toBeFalsy();
  });

  it('the figure holds ∠ABC = 2∠ACB with the bisector drawn, at several seeds', () => {
    const lines = [...CEVIANS[0], 'זווית B = 2 זווית C'];
    for (const seed of [0, 1, 2, 3]) {
      expect(angleDeg(lines, 'B', 'A', 'C', seed), `seed ${seed}`).toBeCloseTo(2 * angleDeg(lines, 'C', 'A', 'B', seed), 3);
    }
  });
});

describe('#1445 — with 0 or ≥ 2 shapes at the vertex it still asks, LISTING the angles', () => {
  it('REFUSAL — two triangles at B (a sub-triangle): every angle at B is listed, and the taught line builds', () => {
    const lines = ['משולש ABC', 'D על AC', 'הקטע BD', 'משולש ABD'];
    const v = decideSubmit('זווית B = 30', lines, 0);
    if (v.kind !== 'refused' || v.error.key !== 'ambiguous-angle') throw new Error(JSON.stringify(v));
    expect(v.error.options).toEqual(['ABC', 'ABD', 'CBD']);
    expect(reachesFallback(v)).toBe(false);
    for (const lng of ['he', 'en']) {
      const text = plain(errorText(v.error, (k, o) => analyticI18n.t(k, { ...o, lng }) as string));
      expect(text, lng).toContain('∠ABC, ∠ABD, ∠CBD');
    }
    expect(decideSubmit(`זווית ${v.error.example} = 30`, lines, 0).kind).toBe('record');
  });

  it('REFUSAL — three segments and no shape: listed too', () => {
    const v = decideSubmit('זווית A = 60', ['A(0,0)', 'B(4,0)', 'C(0,3)', 'D(-2,-2)', 'הקטע AB', 'הקטע AC', 'הקטע AD'], 0);
    if (v.kind !== 'refused' || v.error.key !== 'ambiguous-angle') throw new Error(JSON.stringify(v));
    expect(v.error.options).toHaveLength(3);
  });

  it('the #1407 ruling\'s figure is unchanged: C in a triangle AND a quadrilateral is ambiguous', () => {
    const v = decideSubmit('זווית C = 30', ['משולש ABC', 'מרובע ABCD'], 0);
    expect(v.kind === 'refused' && v.error.key).toBe('ambiguous-angle');
    expect(decideSubmit('זווית B = 60', ['משולש ABC', 'מרובע ABCD'], 0).kind).toBe('record');
  });
});
