/**
 * #2731 ([ADR-AG-433](../../docs/06c-decisions-analytic.md#adr-ag-433)) — A DETERMINED FIGURE WITH SEVERAL SOLUTIONS SHOWS
 * THEM, AND A GIVEN ONLY ANOTHER SOLUTION SATISFIES RECORDS.
 *
 * pipeline-lock: analytic has no scenario corpus, and these are bespoke assertions the fixtures net cannot make — the
 * value an ask prints («2 או 18»), which configuration «הציגו תצורה אחרת» reaches, a comparison that records and selects
 * another root, and the refusal of one no root satisfies. Driven through the real door, `decideSubmit` line by line then
 * `derive` and `ask`; the model is never called.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { ask } from '../app/ask';
import { anotherConfiguration } from '../app/another';
import { derive } from '../engine/derive';
import { evaluate } from '../engine/evaluate';
import { fmtAnalytic } from '../format';
import parabola from './fixtures/exam-2021-special-q1-parabola-2731.analytic.json';
import circles from './fixtures/exam-2023b-q1-four-circles-2731.analytic.json';

const PARABOLA = parabola.lines;
const CIRCLES = circles.lines;

/** Every line records through the submit door, in order. */
const recorded = (lines: readonly string[]): string[] => {
  const out: string[] = [];
  for (const line of lines) {
    const v = decideSubmit(line, out, 0);
    expect(v.kind, `«${line}»`).toBe('record');
    if (v.kind === 'record') out.push(v.line);
  }
  return out;
};
const answer = (lines: readonly string[], q: string, seed = 0) => ask(derive(lines, seed), q, fmtAnalytic).value;
const verdict = (lines: readonly string[], line: string) => decideSubmit(line, lines, 0);
/** The value of one symbol, or one point, at each of the pool's first 24 configurations. */
const poolOf = (lines: readonly string[], read: (f: ReturnType<typeof evaluate>) => string) => {
  const c = derive(lines, 0).construction;
  return new Set(Array.from({ length: 24 }, (_, s) => evaluate(c, s)).filter((f) => f.unsatisfied.length === 0 && f.selectorsOk).map(read));
};
const centre = (f: ReturnType<typeof evaluate>) => {
  const m = f.points.find((p) => p.id === 'M')!;
  return `${Math.round(m.x)},${Math.round(m.y)}`;
};

describe('#2731 — the parabola (summer special 2021, Q1): «find p (both possibilities)»', () => {
  const lines = recorded(PARABOLA);

  it('«p» answers both roots, and «K» both points; the first drawing is still p = 2', () => {
    expect(answer(lines, 'p')).toBe('2 או 18');
    expect(answer(lines, 'K')).toBe('(2, 12) או [(18, 12)]');
    expect(derive(lines, 0).figure.env.p).toBeCloseTo(2, 6);
  });

  it('«הציגו תצורה אחרת» reaches p = 18', () => {
    const next = anotherConfiguration(lines, 0);
    expect(next.found).toBe(true);
    expect(derive(lines, next.seed).figure.env.p).toBeCloseTo(18, 6);
  });

  it('«x_K = 18» is recorded (it selects p = 2), no longer «already follows»', () => {
    expect(verdict(lines, 'x_K = 18').kind).toBe('record');
    expect(answer([...lines, 'x_K = 18'], 'p')).toBe('2');
  });

  it('«x_K < 10» is recorded and draws p = 18, with K at (2, 12)', () => {
    expect(verdict(lines, 'x_K < 10').kind).toBe('record');
    const more = [...lines, 'x_K < 10'];
    expect(derive(more, 0).faults).toEqual([]);
    expect(answer(more, 'p')).toBe('18');
    expect(answer(more, 'K')).toBe('(2, 12)');
  });

  it('REFUSAL — «x_K < 1», which no root satisfies, is still refused with the same message', () => {
    const v = verdict(lines, 'x_K < 1');
    expect(v.kind).toBe('refused');
    expect(v.kind === 'refused' && v.error.key).toBe('unsatisfiable');
  });

  it('a sibling: «y_K = 8 · KF = 10» answers «2 או 8»', () => {
    const other = recorded(['נתונה פרבולה שמשוואתה y^2=4px', 'p > 0', 'K על הפרבולה', 'y_K = 8', 'F מוקד הפרבולה', 'KF = 10']);
    expect(answer(other, 'p')).toBe('2 או 8');
  });

  it('the English twin answers the same', () => {
    const en = recorded(['parabola y^2=4px', 'p > 0', 'K is on the parabola', 'y_K = 12', 'F is the focus of the parabola', 'KF = 20']);
    expect(answer(en, 'p')).toBe('2 או 18');
  });
});

describe('#2731 — four circles tangent to 4x + 3y = 60 and to both axes (2023 B, Q1)', () => {
  const lines = recorded(CIRCLES);

  it('«M» and the radius print no single value; the pool reaches all four circles', () => {
    expect(answer(lines, 'M')).toBeNull();
    expect(answer(lines, 'r_M')).toBeNull();
    expect([...poolOf(lines, centre)].sort()).toEqual(['-15,15', '10,-10', '30,30', '5,5']);
    expect(centre(derive(lines, 0).figure)).toBe('5,5');
  });

  it('with «x_M > 0 · y_M > 0», «M» answers the two first-quadrant circles', () => {
    const q1 = recorded([...CIRCLES, 'x_M > 0', 'y_M > 0']);
    expect(answer(q1, 'M')).toBe('[(5, 5)] או (30, 30)');
  });

  it('«x_M < 0» is recorded and draws (−15, 15)', () => {
    expect(verdict(lines, 'x_M < 0').kind).toBe('record');
    const more = [...lines, 'x_M < 0'];
    expect(centre(derive(more, 0).figure)).toBe('-15,15');
    expect(answer(more, 'M')).toBe('(-15, 15)');
  });

  it('the entry order does not change the answer: tangency to the axes first reaches all four too', () => {
    const swapped = recorded([CIRCLES[0], CIRCLES[1], CIRCLES[3], CIRCLES[2]]);
    expect(answer(swapped, 'M')).toBeNull();
    expect([...poolOf(swapped, centre)].sort()).toEqual(['-15,15', '10,-10', '30,30', '5,5']);
  });

  it('a sibling: a centre on y = x tangent to the x-axis and to 3x + 4y = 48 answers both centres', () => {
    const onDiagonal = recorded(['נתון הישר l: 3x+4y=48', 'נתון מעגל שמרכזו M', 'M על הישר y=x', 'מעגל M משיק לציר ה-x', 'מעגל M משיק לישר l']);
    expect(answer(onDiagonal, 'M')).toMatch(/^\[?\(4, 4\)\]? או \[?\(24, 24\)\]?$/);
  });
});

describe('#2731 — controls: a pin already listed its roots, a free figure is untouched', () => {
  it('«P(2,3) · k · y = kx · distance 1» still answers «0.85 או 3.15»', () => {
    expect(answer(recorded(['P(2,3)', 'k הוא פרמטר', 'נתון הישר l: y=kx', 'המרחק של P מהישר l הוא 1']), 'k')).toBe('0.85 או 3.15');
  });

  it('«M(a,0) · N(13,0) · MN = 9» still answers «4 או 22»', () => {
    expect(answer(recorded(['M(a,0)', 'N(13,0)', 'MN = 9']), 'a')).toBe('4 או 22');
  });

  it('a figure with freedom left is not listed: a free triangle still moves with the seed', () => {
    const tri = recorded(['משולש ABC', 'AB = 5']);
    const c = derive(tri, 0).construction;
    const xs = new Set(Array.from({ length: 6 }, (_, s) => evaluate(c, s).points.find((p) => p.id === 'C')!.x.toFixed(3)));
    expect(xs.size).toBeGreaterThan(1);
    expect(evaluate(c, 1).rootKey).toBeUndefined();
  });
});
