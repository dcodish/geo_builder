/**
 * THE FREEDOM COUNT RANKS EQUATIONS, NEVER BOUNDS (#1556, ADR-AG-178).
 *
 * Found triaging #1554 (operator session, 2026-09-29): a quadrilateral with a circle tangent to each
 * side, one side per line. The fourth line — «מעגל M משיק לצלע DA» — answered «זה כבר נובע מהנתונים
 * שכתבתם» and was dropped, while the drawn circle sat 2.300 from DA with radius 3.249.
 *
 * Measured at seed 0 (main @ 5f6a66d3): the three-tangency figure's solved vector parks the touch point
 * on CD exactly at D (t = 1). #1503's bounded side adds two ONE-SIDED rows, `max(0, −t)·n` and
 * `max(0, t−1)·n`; the central difference straddles the kink and reads the second as a half-slope
 * equation, so `freeRank` saw rank 4 where there are three equations — 7 instead of 8 — and the fourth
 * tangency appeared to remove nothing. The fix tags each row's kind at the producer (`residualRows`),
 * and the count ranks the equation rows only.
 *
 * Solver-adjacent, so the reported figure and a control are swept at 24 seeds (ADR-AG-144).
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { figureSignature } from '../engine/evaluate';
import { SEGMENT_EXTENT_TOL } from '../engine/extent';
import { equalityResidual, freeRank, residual, type Constraint } from '../engine/solve';
import { decideSubmit } from '../app/submit';
import { anotherConfiguration } from '../app/another';

const SEEDS = 24;
const QUAD = ['מרובע ABCD', 'מעגל M משיק לצלע AB', 'מעגל M משיק לצלע BC', 'מעגל M משיק לצלע CD', 'מעגל M משיק לצלע DA'];

const whole = (d: ReturnType<typeof derive>) =>
  d.faults.length === 0 && d.figure.unsatisfied.length === 0 && d.figure.selectorsOk && d.figure.ringFaults.length === 0;

/** Distance from the circle's centre to each named side, and its radius — measured off the figure. */
const touches = (d: ReturnType<typeof derive>, sides: Array<[string, string]>) => {
  const P = (id: string) => d.figure.points.find((p) => p.id === id)!;
  const c = d.figure.curves.find((k) => k.curve.kind === 'circle')!.curve as { cx: number; cy: number; r: number };
  const dist = ([a, b]: [string, string]) => {
    const A = P(a);
    const B = P(b);
    return Math.abs((B.y - A.y) * c.cx - (B.x - A.x) * c.cy + B.x * A.y - B.y * A.x) / Math.hypot(B.x - A.x, B.y - A.y);
  };
  return { r: c.r, d: sides.map(dist) };
};

/** Drive the REAL submit path line by line, as the student types. */
const submit = (lines: string[], seed = 0) => {
  const kept: string[] = [];
  const verdicts = lines.map((line) => {
    const v = decideSubmit(line, kept, seed);
    if (v.kind === 'record') kept.push(line);
    return v.kind;
  });
  return { kept, verdicts };
};

describe('#1556 — the residual producer tags its rows, and the count ranks only the equations', () => {
  /**
   * The class, at the producer: every ONE-SIDED row the residual emits, placed exactly on its boundary.
   * A central difference there is a half-slope — the phantom rank. The equation rows alone keep the
   * count honest; the full rows (what the solve minimises) must still carry the bound.
   */
  const cases: Array<{ name: string; k: Constraint; at: (x: number[]) => Record<string, { x: number; y: number }>; env: (x: number[]) => Record<string, number>; x: number[] }> = [
    {
      name: '«משיק לצלע AB» — the touch point at the end B (#1503)',
      k: { t: 'tangent-line', centre: 'M', r: { kind: 'sym', name: 'r' }, line: { kind: 'points', a: 'A', b: 'B', bounded: true } } as Constraint,
      at: (x) => ({ A: { x: 0, y: 0 }, B: { x: 4, y: 0 }, M: { x: x[0], y: x[1] } }),
      env: (x) => ({ r: x[2] }),
      x: [4, 2, 2], // foot of M on AB is B itself (t = 1), and |M·AB| = r
    },
    {
      name: 'a bounded CROSSING on «הצלע AB» at the piece’s end (#1286)',
      k: { t: 'on-line-2pt', id: 'D', a: 'A', b: 'B', bounded: true, crossing: true } as Constraint,
      at: (x) => ({ A: { x: 0, y: 0 }, B: { x: 4, y: 0 }, D: { x: x[0], y: x[1] } }),
      env: () => ({}),
      x: [4 * (1 + SEGMENT_EXTENT_TOL), 0], // exactly on the extent bound's kink
    },
  ];

  for (const c of cases) {
    it(`${c.name}: one equation row, and it alone is ranked`, () => {
      const rowsOf = (fn: typeof residual) => (x: number[]) => {
        const pos = c.at(x);
        return fn(c.k, (id) => pos[id] ?? null, c.env(x)) ?? [];
      };
      expect(rowsOf(residual)(c.x)).toHaveLength(3);
      expect(rowsOf(equalityResidual)(c.x)).toHaveLength(1);
      // One equation over `n` unknowns leaves n − 1 — the bound removes no dimension.
      expect(freeRank(c.x, rowsOf(equalityResidual))).toBe(c.x.length - 1);
      // The mechanism the tag exists to stop, shown rather than assumed: ranked in full, the hinge
      // at its kink is counted as a second equation.
      expect(freeRank(c.x, rowsOf(residual))).toBe(c.x.length - 2);
    });
  }
});

describe("#1556 — the operator's tangential quadrilateral, one side per line", () => {
  it('the fourth tangency RECORDS at every one of 24 seeds (it was «already follows» at 11)', () => {
    for (let seed = 0; seed < SEEDS; seed += 1) {
      const v = decideSubmit(QUAD[4], QUAD.slice(0, 4), seed);
      expect(v.kind, `seed ${seed}`).toBe('record');
    }
  });

  it('typed line by line through the real gate, all five lines are kept', () => {
    const { kept, verdicts } = submit(QUAD);
    expect(verdicts).toEqual(['record', 'record', 'record', 'record', 'record']);
    expect(kept).toEqual(QUAD);
  });

  it('carrierDof reads 8, 10, 9, 8, 7 — each tangency removes exactly one', () => {
    const dofs = [1, 2, 3, 4, 5].map((n) => derive(QUAD.slice(0, n), 0).figure.carrierDof);
    expect(dofs).toEqual([8, 10, 9, 8, 7]);
  });

  it('entry order does not matter: the sides in reverse count the same and the last still records', () => {
    const reversed = [QUAD[0], QUAD[4], QUAD[3], QUAD[2], QUAD[1]];
    const dofs = [1, 2, 3, 4, 5].map((n) => derive(reversed.slice(0, n), 0).figure.carrierDof);
    expect(dofs).toEqual([8, 10, 9, 8, 7]);
    expect(submit(reversed).verdicts).toEqual(['record', 'record', 'record', 'record', 'record']);
  });

  it('with all five lines, DA is tangent — and the whole figure holds — at every one of 24 seeds', () => {
    const sides: Array<[string, string]> = [['A', 'B'], ['B', 'C'], ['C', 'D'], ['D', 'A']];
    for (let seed = 0; seed < SEEDS; seed += 1) {
      const d = derive(QUAD, seed);
      expect(whole(d), `seed ${seed}`).toBe(true);
      const t = touches(d, sides);
      for (const [i, dist] of t.d.entries()) expect(Math.abs(dist - t.r), `seed ${seed} side ${sides[i].join('')}`).toBeLessThan(1e-5 * Math.max(1, t.r));
    }
  });

  it('the four-tangency figure is NOT one configuration at every seed, and «הציגו תצורה אחרת» moves it', () => {
    const sigs = new Set<string>();
    for (let seed = 0; seed < SEEDS; seed += 1) sigs.add(figureSignature(derive(QUAD, seed).figure));
    expect(sigs.size).toBeGreaterThanOrEqual(2);
    const next = anotherConfiguration(QUAD, 0);
    expect(next.found).toBe(true);
    expect(figureSignature(derive(QUAD, next.seed).figure)).not.toBe(figureSignature(derive(QUAD, 0).figure));
  });

  it('the control — a triangle’s incircle side by side — is unchanged: 6 free, whole at 24 seeds', () => {
    const TRI = ['משולש ABC', 'מעגל M משיק לצלע AB', 'מעגל M משיק לצלע BC', 'מעגל M משיק לצלע CA'];
    expect([1, 2, 3, 4].map((n) => derive(TRI.slice(0, n), 0).figure.carrierDof)).toEqual([6, 8, 7, 6]);
    for (let seed = 0; seed < SEEDS; seed += 1) expect(whole(derive(TRI, seed)), `seed ${seed}`).toBe(true);
  });
});

describe('#1556 — the entailment gate still says so when a given really follows', () => {
  const PINNED = ['A(0,0)', 'B(4,0)', 'C(0,3)'];

  it('#1063: the area of a determined, stated triangle is «already follows»', () => {
    expect(decideSubmit('שטח המשולש ABC הוא 6', [...PINNED, 'משולש ABC'], 0).kind).toBe('already-follows');
  });

  it('a bounded tangency the figure already satisfies is still «already follows», not a new given', () => {
    // The incircle of a pinned triangle is determined by its three sides; stating one of them again in
    // the other letter order adds no equation — the bound rows must not make it look like one.
    const lines = [...PINNED, 'משולש ABC', 'מעגל M משיק לצלע AB', 'מעגל M משיק לצלע BC', 'מעגל M משיק לצלע CA'];
    expect(derive(lines, 0).figure.carrierDof).toBe(0);
    expect(['already-follows', 'already-known']).toContain(decideSubmit('מעגל M משיק לצלע BA', lines, 0).kind);
  });
});
