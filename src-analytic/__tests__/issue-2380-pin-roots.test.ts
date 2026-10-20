/**
 * #2380 ([ADR-AG-303](../../docs/06c-decisions-analytic.md#adr-ag-303)) — the roots of a parameter pin are enumerated
 * and the seed chooses one; a root is a discrete axis.
 *
 * Measured before (2928436a, #2381's tip): «a הוא פרמטר חיובי · M(a,0) · N(13,0) · MN = 9» drew a = 4 in all 24
 * configurations and the panel printed «a = 4» as KNOWN (a = 22 holds too); with N(5,0) the only admissible root (14)
 * lay outside the sampler's window and «MN = 9» was refused `unsatisfiable`. The bounded `0 < a < 30` control
 * already listed both — the panel needed no change, only the pool.
 *
 * Every case runs the real path: `decideSubmit` per line → `derive` → `panelKnowledge` / `valueText` / `pointText`.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { panelKnowledge, valueText } from '../app/panelRows';
import { pointText } from '../app/pointText';
import { derive } from '../engine/derive';
import { drawableAt, evaluateStats, knownCurveOptions, POOL_SIZE } from '../engine/evaluate';
import { scanRoots } from '../engine/pinRoots';
import { fmtAnalytic } from '../format';
import q2 from './fixtures/issue-2380-q2-two-tangent-circles.analytic.json';

const plain = (s: string | null) => (s ?? '').replace(/[⁦-⁩‎‏]/g, '');
const Q2A = q2.lines.slice(0, 4);
const recordsEveryLine = (lines: readonly string[]) => {
  for (let i = 0; i < lines.length; i += 1) expect(decideSubmit(lines[i], lines.slice(0, i), 0).kind, lines[i]).toBe('record');
};
/** The values a symbol takes across the pool's admitted configurations, ascending. */
const poolValues = (lines: readonly string[], sym: string) => {
  const d = derive(lines, 0);
  const seen: number[] = [];
  for (let s = 0; s < POOL_SIZE; s += 1) {
    const f = drawableAt(d.construction, s);
    if (f.unsatisfied.length > 0 || !f.selectorsOk) continue;
    const v = Math.round(f.env[sym] * 1e6) / 1e6;
    if (!seen.includes(v)) seen.push(v);
  }
  return seen.sort((x, y) => x - y);
};
const paramRow = (lines: readonly string[], sym: string) => {
  const d = derive(lines, 0);
  const p = panelKnowledge(d).params.find((q) => q.sym === sym)!;
  return plain(valueText(p.k, fmtAnalytic, sym));
};
const pointRow = (lines: readonly string[], id: string) => {
  const d = derive(lines, 0);
  const p = panelKnowledge(d).points.find((q) => q.id === id)!;
  return plain(pointText(d, id, p.x, p.y, fmtAnalytic));
};

describe('#2380 — Q2 א: both roots of «MN = 9»', () => {
  it('the exam\'s 8 lines (fixture) record; the pool holds a ∈ {4, 22}, and r = 3 stays known', () => {
    recordsEveryLine(q2.lines);
    expect(poolValues(q2.lines, 'a')).toEqual([4, 22]);
    expect(poolValues(q2.lines, 'r')).toEqual([3]);
    expect(paramRow(q2.lines, 'a')).toBe('4 או a = 22');
    expect(paramRow(q2.lines, 'r')).toBe('3');
  });

  it('the panel reads M «(4, 0) או (22, 0)», the drawn one bracketed, and circle M has both equations', () => {
    expect(pointRow(q2.lines, 'M')).toBe('[(4, 0)] או (22, 0)');
    const d = derive(q2.lines, 0);
    const circle = d.figure.curves.find((cu) => cu.curve.kind === 'circle' && Math.abs((cu.curve as { r: number }).r - 3) < 1e-6)!;
    const options = knownCurveOptions(d.construction, circle.id)!;
    expect(options.map((o) => (o.kind === 'circle' ? [Math.round(o.cx), Math.round(o.cy), Math.round(o.r)] : null))).toEqual([
      [4, 0, 3],
      [22, 0, 3],
    ]);
  });

  it('seed 0 draws a = 4 — the root the descent reached before (stability)', () => {
    expect(derive(q2.lines, 0).figure.env.a).toBeCloseTo(4, 9);
  });

  it('«a < 13» (Q2 ב\'s premise): the domain filters the roots, a = 4 known', () => {
    expect(paramRow([...Q2A, 'a < 13'], 'a')).toBe('4');
  });
});

describe('#2380 — the class: every pin of a parameter by a measure', () => {
  it.each([
    ['unbounded «a הוא פרמטר»', ['a הוא פרמטר', 'M(a,0)', 'N(13,0)', 'MN = 9'], 'a', [4, 22]],
    ['the y-coordinate', ['a הוא פרמטר חיובי', 'M(2,a)', 'N(2,13)', 'MN = 9'], 'a', [4, 22]],
    ['N(10,0)', ['a הוא פרמטר חיובי', 'M(a,0)', 'N(10,0)', 'MN = 9'], 'a', [1, 19]],
    ['a circle of radius 3 through (13,0)', ['a הוא פרמטר חיובי', 'נתון מעגל שמרכזו M(a,0) ורדיוסו 3', 'הנקודה (13,0) נמצאת על המעגל'], 'a', [10, 16]],
    ['a pin beside a free vertex', ['a הוא פרמטר חיובי', 'A(a,0)', 'B(13,0)', 'AB = 9', 'נקודה C', 'AC = BC'], 'a', [4, 22]],
  ])('%s', (_, lines, sym, roots) => {
    recordsEveryLine(lines);
    expect(poolValues(lines, sym)).toEqual(roots);
  });

  it('a pin beside a free vertex: x_C is not known (it is 8.5 or 17.5)', () => {
    const lines = ['a הוא פרמטר חיובי', 'A(a,0)', 'B(13,0)', 'AB = 9', 'נקודה C', 'AC = BC'];
    const p = panelKnowledge(derive(lines, 0)).points.find((q) => q.id === 'C')!;
    expect(p.x.known).toBe(false);
  });

  it.each([
    ['N(5,0)', 5, 14],
    ['N(8,0)', 8, 17],
  ])('the refusal that should not happen: %s with a > 0 records, a = %s → %s only', (_, n, root) => {
    const lines = ['a הוא פרמטר חיובי', 'M(a,0)', `N(${n},0)`, 'MN = 9'];
    recordsEveryLine(lines);
    expect(poolValues(lines, 'a')).toEqual([root]);
  });

  it('REFUSAL — «a > 30» filters both roots, so it is refused', () => {
    expect(decideSubmit('a > 30', Q2A, 0).kind).toBe('refused');
  });
});

describe('#2380 — controls, unchanged', () => {
  it.each([
    ['a slope through (1,20)', ['הישר y = mx', 'הנקודה (1,20) נמצאת על הישר y = mx'], 'm', '20'],
    ['a parabola through (2,12)', ['y^2 = 2px', 'הנקודה (2,12) נמצאת על הפרבולה'], 'p', '36'],
    ['N(0,0), unbounded', ['a הוא פרמטר', 'M(a,0)', 'N(0,0)', 'MN = 9'], 'a', '±9'],
    ['bounded 0 < a < 30', ['0 < a < 30', 'M(a,0)', 'N(13,0)', 'MN = 9'], 'a', '4 או a = 22'],
  ])('%s', (_, lines, sym, row) => {
    expect(paramRow(lines, sym)).toBe(row);
  });

  it('a free unpinned parameter still varies with the seed', () => {
    expect(poolValues(['a הוא פרמטר חיובי', 'M(a,0)'], 'a').length).toBeGreaterThan(3);
  });

  it('the pins add no evaluation: the pool of Q2 א costs what a pool costs', () => {
    const d = derive(q2.lines, 0);
    const before = evaluateStats.uncached;
    for (let s = 0; s < POOL_SIZE; s += 1) drawableAt(d.construction, s);
    // one evaluation per seed at most, plus the walk's own: never a scan-driven solve
    expect(evaluateStats.uncached - before).toBeLessThanOrEqual(2 * POOL_SIZE);
  });
});

describe('#2380 — the scan itself', () => {
  const roots = (r: number[] | 'identity'): number[] => {
    if (r === 'identity') throw new Error('identity');
    return r;
  };
  it('finds a sign-change root and a touching root, ascending, inside the domain', () => {
    expect(roots(scanRoots((v) => [Math.abs(v - 13) - 9], {}, 832)).map((x) => Math.round(x * 1e9) / 1e9)).toEqual([4, 22]);
    expect(roots(scanRoots((v) => [(v - 3) ** 2], {}, 64)).map((x) => Math.round(x * 1e4) / 1e4)).toEqual([3]);
    expect(roots(scanRoots((v) => [Math.abs(v - 5) - 9], { min: 0, minOpen: true }, 832)).map((x) => Math.round(x))).toEqual([14]);
  });

  it('an identity is no pin; no root is no root', () => {
    expect(scanRoots(() => [0], {}, 64)).toBe('identity');
    expect(scanRoots((v) => [v * v + 1], {}, 64)).toEqual([]);
  });

  it('a pole is not a root', () => {
    expect(scanRoots((v) => [1 / (v - 2)], {}, 64)).toEqual([]);
  });
});
