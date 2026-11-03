/**
 * #2533 (ADR-774) — a PLURAL line-kind noun before a crossing's operand pair reads both operands as lines.
 *
 * The crossing rule tested its operand spans with an inline `\bline\b|הישר|הקו|\bray\b|קרן`, which misses "lines",
 * "rays" and «הקרניים» (medial nun), so those operands fell back to bare segments (`onSeg`) and the crossing was held
 * inside both — «מרובע ABCD» · "M is the intersection of lines AB and CD" re-seated the quadrilateral into a crossed
 * one. The noun now comes from the lexicon's `LINE_NOUN`, singular and plural, in the noun AND the verb frame.
 */
import { describe, expect, it } from 'vitest';
import { parse } from '../parse';
import { LINE_NOUN, rx } from '../lexicon';
import { factsOf, replayFacts } from '../../__tests__/scenario-pipeline';

const crossing = (u: string) => {
  const r = parse(u) as { commands?: Array<Record<string, unknown>> };
  const c = (r.commands ?? []).find((x) => x.type === 'line-line-intersection');
  expect(c, u).toBeTruthy();
  return c!;
};
const unbounded = (u: string) => {
  const c = crossing(u);
  expect([c.onSeg, c.onSeg1, c.onSeg2], u).toEqual([undefined, undefined, undefined]);
  expect([c.a, c.b, c.c, c.d, c.id], u).toEqual(['A', 'B', 'C', 'D', 'M']);
};

describe('#2533 — plural line nouns read the operands as lines', () => {
  // The rows the plan measured `onSeg: true` at 3225756c.
  const PLURAL = [
    'M is the intersection of lines AB and CD',
    'the lines AB and CD meet at M',
    'lines AB and CD intersect at M',
    'M is the intersection of rays AB and CD',
    'the rays AB and CD meet at M',
    'M נקודת החיתוך של הקרניים AB ו-CD',
    'הקרניים AB ו-CD נחתכים בנקודה M',
    'קרניים AB ו-CD נפגשים בנקודה M',
  ];
  for (const u of PLURAL) it(`no within-segment default: ${u}`, () => unbounded(u));

  // Controls: the forms that already read as lines stay so.
  const ALREADY = [
    'M נקודת החיתוך של הישרים AB ו-CD',
    'הישרים AB ו-CD נחתכים בנקודה M',
    'M is the intersection of line AB and line CD',
    'M is the intersection of ray AB and ray CD',
    'M נקודת החיתוך של הקרן AB והקרן CD',
    'M נקודת החיתוך של הישר AB והישר CD',
  ];
  for (const u of ALREADY) it(`unchanged (lines): ${u}`, () => unbounded(u));

  it('segments stay segments: the plural «הקטעים» and the bare pair keep the joint onSeg', () => {
    expect(crossing('M נקודת החיתוך של הקטעים AB ו-CD').onSeg).toBe(true);
    expect(crossing('M is the intersection of AB and CD').onSeg).toBe(true);
  });

  it('a plural noun on the SECOND operand marks only it (issue #22): a bare first operand keeps its within default', () => {
    for (const u of ['AB and the rays CD meet at M', 'AB והקרן CD נפגשים בנקודה M']) {
      const c = crossing(u);
      expect([c.onSeg, c.onSeg1, c.onSeg2], u).toEqual([undefined, true, undefined]);
    }
  });

  it('the atom is word-bounded in English and in the ray stem', () => {
    const re = rx(LINE_NOUN);
    for (const w of ['lines', 'line', 'rays', 'ray', 'הקרניים', 'קרן', 'הישרים', 'הקווים']) expect(re.test(w), w).toBe(true);
    for (const w of ['linear', 'outline', 'array', 'rayon', 'קרנף']) expect(re.test(w), w).toBe(false);
  });

  it('the reported figure: the quadrilateral stays convex and M lands on the extensions, verifier-clean', () => {
    const d = replayFacts(factsOf(['מרובע ABCD', 'M is the intersection of lines AB and CD'])) as unknown as {
      positions: Map<string, { x: number; y: number }>;
      violations: unknown[];
      lastError: unknown;
    };
    expect(d.lastError).toBeNull();
    expect(d.violations).toEqual([]);
    const P = (k: string) => d.positions.get(k)!;
    const [A, B, C, D, M] = ['A', 'B', 'C', 'D', 'M'].map(P);
    // Convex ABCD: every turn has one sign.
    const cr = (o: typeof A, p: typeof A, q: typeof A) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
    const turns = [cr(A, B, C), cr(B, C, D), cr(C, D, A), cr(D, A, B)];
    expect(turns.every((t) => t > 0) || turns.every((t) => t < 0)).toBe(true);
    // M on line AB, outside segment AB (the sides of a convex quadrilateral do not cross).
    expect(Math.abs(cr(A, B, M))).toBeLessThan(1e-6);
    const t = ((M.x - A.x) * (B.x - A.x) + (M.y - A.y) * (B.y - A.y)) / ((B.x - A.x) ** 2 + (B.y - A.y) ** 2);
    expect(t < 0 || t > 1).toBe(true);
  });
});
