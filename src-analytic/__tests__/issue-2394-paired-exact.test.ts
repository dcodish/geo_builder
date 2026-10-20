/**
 * #2394 ([ADR-AG-304](../../docs/06c-decisions-analytic.md#adr-ag-304)) — tied parameters read as one row, and a
 * standalone value prints its radical (operator ruling 2026-10-20, option (a): exact forms everywhere, amending
 * ADR-AG-084).
 *
 * Measured before (fe494926, #2380's tip): after «הישר mx-y+n=0 משיק למעגל M» · «… למעגל N» the parameter rows read
 * «m = ±0.35» and «n = ±1.77» apart — which m goes with which n hidden — while the joint read held exactly two
 * options, (−√2/4, −5√2/4) and (√2/4, 5√2/4). The tree had no surd tier (`fmtAnalytic(√2)` was `1.41`).
 *
 * The rows are asked of `paramRows`, the decision `App.tsx` renders (ADR-W-053); the numbers of `fmtAnalytic`.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { ask } from '../app/ask';
import { lineText, curveParts } from '../app/curveText';
import { pointText } from '../app/pointText';
import { panelKnowledge, paramRows } from '../app/panelRows';
import { derive } from '../engine/derive';
import { fmtAnalytic, fmtCoefficient } from '../format';
import q2d from './fixtures/issue-2394-q2-d-paired.analytic.json';

const WORDS = { checking: 'בודק…', unused: 'לא בשימוש' };
const rows = (lines: readonly string[], seed = 0) => {
  const d = derive(lines, seed);
  expect(d.faults, lines.join(' · ')).toEqual([]);
  return paramRows(d, panelKnowledge(d), fmtAnalytic, WORDS).map((r) => r.text);
};
const TANGENTS = ['הישר mx-y+n=0 משיק למעגל M', 'הישר mx-y+n=0 משיק למעגל N'];
const PAIRED = (drawnPositive: boolean) =>
  drawnPositive ? '(m, n) = (-√2/4, -5√2/4) או [(√2/4, 5√2/4)]' : '(m, n) = [(-√2/4, -5√2/4)] או (√2/4, 5√2/4)';

describe('#2394 — Q2 ד: m and n read as one paired row, exactly', () => {
  it('the canonical route (fixture) records and reads «a = 4», «r = 3», and the (m, n) pair, the drawn one bracketed', () => {
    for (let i = 0; i < q2d.lines.length; i += 1) expect(decideSubmit(q2d.lines[i], q2d.lines.slice(0, i), 0).kind, q2d.lines[i]).toBe('record');
    for (const seed of [0, 1, 2, 3]) {
      const d = derive(q2d.lines, seed);
      expect(rows(q2d.lines, seed), `seed ${seed}`).toEqual(['a = 4', 'r = 3', PAIRED(d.figure.env.m > 0)]);
    }
  });

  it.each([
    ['centres and radii', ['M(4,0)', 'N(13,0)', 'נתון מעגל M שרדיוסו 3', 'נתון מעגל N שרדיוסו 6', ...TANGENTS]],
    ['the circles by their equations', ['מעגל M: (x-4)²+y²=9', 'מעגל N: (x-13)²+y²=36', ...TANGENTS]],
  ])('%s: the same paired row', (_, lines) => {
    const d = derive(lines, 0);
    expect(rows(lines)).toEqual([PAIRED(d.figure.env.m > 0)]);
  });
});

describe('#2394 — controls', () => {
  it('two INDEPENDENT two-valued parameters (all four combinations) keep separate rows', () => {
    expect(rows(['A(a,0)', 'B(0,b)', 'O(0,0)', 'OA = 2', 'OB = 3'])).toEqual(['a = ±2', 'b = ±3']);
  });

  it('a known value keeps its row; an open one its domain; an unused one says so', () => {
    expect(rows(['a הוא פרמטר חיובי', 'M(a,0)', 'N(13,0)', 'MN = 9', 'a < 13'])).toEqual(['a = 4']);
    expect(rows(['k הוא פרמטר', 'M(k,0)'])).toEqual(['k']);
    expect(rows(['k הוא פרמטר'])).toEqual(['k לא בשימוש']);
  });

  it('a single two-valued parameter keeps W1\'s scalar spelling', () => {
    expect(rows(['a הוא פרמטר חיובי', 'M(a,0)', 'N(13,0)', 'MN = 9'])).toEqual(['a = 4 או a = 22']);
  });
});

describe('#2394 — the surd tier: standalone values only', () => {
  it.each([
    [Math.SQRT2 / 4, '√2/4'],
    [(-5 * Math.SQRT2) / 4, '-5√2/4'],
    [Math.sqrt(20), '2√5'],
    [Math.sqrt(10), '√10'],
    [12 * Math.sqrt(3), '12√3'],
    [Math.sqrt(12), '2√3'],
    [Math.SQRT2, '√2'],
  ])('fmtAnalytic(%d) is %s, 2-D\'s string', (v, s) => {
    expect(fmtAnalytic(v)).toBe(s);
  });

  it('the counter-direction (ADR-AG-084\'s load-bearing case): 1.4142 typed stays 1.41, 7.34 stays 7.34; fractions and integers unchanged', () => {
    expect(fmtAnalytic(1.4142)).toBe('1.41');
    expect(fmtAnalytic(7.34)).toBe('7.34');
    expect(fmtAnalytic(4 / 3)).toBe('4/3');
    expect(fmtAnalytic(5)).toBe('5');
    expect(fmtAnalytic(0)).toBe('0');
  });

  it('an equation\'s coefficients never take the tier (ADR-AG-085): «1.41x + y = 0» stays', () => {
    expect(fmtCoefficient(Math.SQRT2)).toBe('1.41');
    expect(lineText(Math.SQRT2, 1, 0)).toBe('1.41x + y = 0');
  });

  it('a LENGTH through the ask lane, with the real formatter: #1433\'s «AC» reads «√10 או √34»', () => {
    const d = derive(['A(4,0)', 'B(0,-2)', 'C נמצאת על הישר 4x-y-9=0', 'שטח המשולש ABC הוא 7'], 0);
    expect(ask(d, 'AC', fmtAnalytic).value).toBe('√10 או √34');
  });

  it('a COORDINATE in the panel: C on y = x at distance 2 from the origin reads (±√2, ±√2)', () => {
    const lines = ['A(0,0)', 'C נמצאת על הישר y=x', 'AC = 2'];
    const d = derive(lines, 0);
    expect(d.faults).toEqual([]);
    const p = panelKnowledge(d).points.find((q) => q.id === 'C')!;
    const text = pointText(d, 'C', p.x, p.y, fmtAnalytic).replace(/[[\]]/g, '');
    expect(text).toBe('(-√2, -√2) או (√2, √2)');
  });

  it('a circle\'s equation keeps its numbers; its radius detail, a standalone value, reads exactly', () => {
    const parts = curveParts({ kind: 'circle', cx: 0, cy: 0, r: Math.sqrt(10) });
    expect(parts.equation).toBe('x² + y² = 10');
    expect(parts.details?.map((x) => x.text)).toContain('r = √10');
  });
});
