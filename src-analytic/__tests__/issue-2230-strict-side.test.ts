/**
 * #2230 ([ADR-AG-291](../../docs/06c-decisions-analytic.md#adr-ag-291)) — a strict given is never satisfied by rounding.
 *
 * Measured before (af213bea): on the operator's rhombus with `x_A > 0`, seeds 5 and 6 drew A = (1.5·10⁻¹⁰, 5) — A on
 * the y-axis, x_A = 0, drawn green under «x_A > 0» — so the pool held A at (5, 0) and (0, 5), A and C read «—», the axes
 * note stayed and «משוואת AB» answered four lines. `מעוין ABCD · … · y_B < 0` put B ON the x-axis (y_B ≈ −1.5·10⁻¹⁰)
 * at seeds 1, 2, 3, 4, 6. Root cause: `failingSelectors` judged a coordinate comparison as a bare `lhs > rhs`, so a
 * value the givens put ON its bound was decided by the sign of the solver's rounding error.
 *
 * Every figure case runs the real path: `derive` → the admitted pool → `ask` / `unstatedChoices`, taught lines through
 * `decideSubmit`.
 */
import { describe, expect, it } from 'vitest';
import { askSettled } from '../app/ask';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';
import { circlePairQuantity, isKnowledge, selectorsHold, sideOfBound } from '../engine/evaluate';
import type { Pt } from '../engine/derived';
import operator from './fixtures/issue-2230-rhombus-strict-side.analytic.json';

const fmt = (n: number) => String(Math.round(n * 1000) / 1000);
const near = (p: { x: number; y: number } | undefined, x: number, y: number) =>
  !!p && Math.abs(p.x - x) < 1e-3 && Math.abs(p.y - y) < 1e-3;

describe('#2230 — the operator\'s rhombus: «x_A > 0» puts A on +x and C opposite it', () => {
  it('every line records and the figure builds green (fixture)', () => {
    const lines = operator.lines;
    for (let i = 0; i < lines.length; i += 1) expect(decideSubmit(lines[i], lines.slice(0, i), 0).kind, lines[i]).toBe('record');
    expect(derive(lines, operator.seed).faults).toEqual([]);
  });

  it('A = (5, 0) and C = (−5, 0) at every seed 0–11 — «הציגו תצורה אחרת» never puts A on the y-axis', () => {
    for (let seed = 0; seed < 12; seed += 1) {
      const d = derive(operator.lines, seed);
      expect(d.faults, `seed ${seed}`).toEqual([]);
      expect(near(d.figure.points.find((p) => p.id === 'A'), 5, 0), `A at seed ${seed}`).toBe(true);
      expect(near(d.figure.points.find((p) => p.id === 'C'), -5, 0), `C at seed ${seed}`).toBe(true);
    }
  });

  it('the data panel knows A and C; «משוואת AB» answers the two lines; CA has slope 0', () => {
    const d = derive(operator.lines, 0);
    const read = (id: string, axis: 'x' | 'y') => (f: { points: { id: string; x: number; y: number }[] }) =>
      f.points.find((p) => p.id === id)?.[axis] ?? null;
    for (const [id, x] of [['A', 5], ['C', -5]] as const) {
      const kx = isKnowledge(d.construction, read(id, 'x'));
      const ky = isKnowledge(d.construction, read(id, 'y'));
      expect(kx.known && Math.abs(kx.value - x) < 1e-3, `${id}.x`).toBe(true);
      expect(ky.known && Math.abs(ky.value) < 1e-3, `${id}.y`).toBe(true);
    }
    expect(askSettled(d, 'A', fmt).value).toBe('(5, 0)');
    expect(askSettled(d, 'C', fmt).value).toBe('(-5, 0)');
    expect(askSettled(d, 'משוואת AB', fmt).value).toBe('x - 2y - 5 = 0 או x + 2y - 5 = 0');
    expect(askSettled(d, 'שיפוע CA', fmt).value).toBe('0');
  });

  it('control — the axis-side spelling «A על החלק החיובי של ציר ה-x» reads the same', () => {
    const d = derive([...operator.lines.slice(0, 5), 'A על החלק החיובי של ציר ה-x'], 0);
    expect(askSettled(d, 'משוואת AB', fmt).value).toBe('x - 2y - 5 = 0 או x + 2y - 5 = 0');
  });
});

describe('#2230 — the second spelling: «y_B < 0» never draws B on the x-axis', () => {
  it('seeds 0–7', () => {
    const lines = ['מעוין ABCD', 'שכל קודקודיו מונחים על הצירים', 'AC=10', 'y_B < 0'];
    for (let seed = 0; seed < 8; seed += 1) {
      const d = derive(lines, seed);
      expect(d.faults, `seed ${seed}`).toEqual([]);
      const B = d.figure.points.find((p) => p.id === 'B')!;
      expect(B.y, `B.y at seed ${seed}`).toBeLessThan(-1e-3);
    }
  });
});

describe('#2230 — the class: every strict arm of the judge, at its bound', () => {
  const pos = (entries: Array<[string, number, number]>) => new Map<string, Pt>(entries.map(([id, x, y]) => [id, { x, y }]));
  const holds = (lines: string[], at: Map<string, Pt>) => selectorsHold(derive(lines, 0).construction, at, {});

  it('sideOfBound: within the solver\'s resolution of the bound is ON it, relative to the scale', () => {
    expect(sideOfBound(1.5e-10, 0, 10)).toBe(0);
    expect(sideOfBound(-1.5e-10, 0, 10)).toBe(0);
    expect(sideOfBound(0.5, 0, 10)).toBe(1);
    expect(sideOfBound(-0.5, 0, 10)).toBe(-1);
    expect(sideOfBound(3 + 1e-9, 3, 10)).toBe(0);
  });

  it('a coordinate against a value: on the bound fails both strict readings', () => {
    const gt = ['A(a,1)', 'D(d,1)', 'x_A > 0'];
    const lt = ['A(a,1)', 'D(d,1)', 'x_A < 0'];
    expect(holds(gt, pos([['A', 1.5e-10, 0], ['D', 10, 0]]))).toBe(false);
    expect(holds(lt, pos([['A', -1.5e-10, 0], ['D', 10, 0]]))).toBe(false);
    expect(holds(gt, pos([['A', 0.5, 0], ['D', 10, 0]]))).toBe(true);
    expect(holds(lt, pos([['A', -0.5, 0], ['D', 10, 0]]))).toBe(true);
  });

  it('a coordinate against a point: level with it is neither order', () => {
    const lines = ['A(a,1)', 'D(d,1)', 'x_A > x_D'];
    expect(holds(lines, pos([['A', 4 + 1e-10, 0], ['D', 4, 5]]))).toBe(false);
    expect(holds(lines, pos([['A', 5, 0], ['D', 4, 5]]))).toBe(true);
  });

  it('an order: strict fails at equality, closed holds there', () => {
    const at = pos([['A', 0, 0], ['B', 3, 4 + 1e-11], ['C', 6, 0]]); // AB = BC up to rounding
    expect(holds(['A(0,0)', 'B(p,q)', 'C(5,0)', 'AB < BC'], at)).toBe(false);
    expect(holds(['A(0,0)', 'B(p,q)', 'C(5,0)', 'AB ≤ BC'], at)).toBe(true);
  });

  it('a slope sign: a horizontal or vertical direction has neither sign', () => {
    const lines = ['A(0,0)', 'B(p,q)', 'שיפוע AB חיובי'];
    expect(holds(lines, pos([['A', 0, 0], ['B', 5, 1e-10]]))).toBe(false); // slope 0 up to rounding
    expect(holds(lines, pos([['A', 0, 0], ['B', 1e-10, 5]]))).toBe(false); // vertical up to rounding
    expect(holds(lines, pos([['A', 0, 0], ['B', 5, 2]]))).toBe(true);
  });

  it('two circles: touching up to rounding is not apart (the band lives where the quantity is measured)', () => {
    const curves = new Map([
      ['K', { kind: 'circle' as const, cx: 0, cy: 0, r: 2 }],
      ['M', { kind: 'circle' as const, cx: 5 + 1e-10, cy: 0, r: 3 }],
    ]);
    const q = circlePairQuantity({ k: 'circles', a: 'K', b: 'M', rel: 'apart' }, () => null, (id) => curves.get(id) ?? null);
    expect(q).toBe(0);
  });
});
