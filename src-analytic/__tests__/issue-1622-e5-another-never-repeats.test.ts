/**
 * #1622 E5 · sr-30 — «הציגו תצורה אחרת» NEVER REPEATS THE DRAWING ON THE SCREEN
 * ([ADR-AG-379](../../docs/06c-decisions-analytic.md#adr-ag-379)).
 *
 * Operator, ADR-W-175 sr-30 (2026-11-02): *"«הציגו תצורה אחרת» never repeats the drawing on screen while another valid one
 * exists. A repeat is a bug. A numeric variety bar is the session's mechanism."* Round #2645's pictures: on «α < 30» ·
 * «משולש ABC» · «∢ABC = α» two presses showed the same drawing. The button compared configurations to the solver's noise
 * (`sameConfiguration`); a drawing that differs below what the eye can see was "another" one. It now asks `looksTheSame`
 * — the stacking ruler (`VISIBLE_FRACTION` of the frame) — and walks on.
 *
 * Every lock calls `derive` and `anotherConfiguration`, the button's own seam.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { looksTheSame, sameSolution } from '../engine/evaluate';
import { anotherConfiguration } from '../app/another';

function presses(lines: readonly string[], n: number) {
  const out = [derive(lines, 0)];
  for (let i = 0; i < n; i += 1) {
    const r = anotherConfiguration(lines, out.at(-1)!.configuration);
    if (!r.found) break;
    out.push(derive(lines, r.seed));
  }
  return out;
}

describe('sr-30 — consecutive presses never show the same drawing', () => {
  for (const lines of [
    ['α < 30', 'משולש ABC', '∢ABC = α'],
    ['משולש ABC', '∢ABC = 10'],
    ['A(0,0)', 'B(6,8)', 'נקודה M', 'MA = MB'],
    ['משולש ABC', 'AB = 5'],
  ]) {
    it(`«${lines.join(' · ')}»: 12 presses, every one a different picture from the one before`, () => {
      const ds = presses(lines, 12);
      expect(ds.length).toBe(13);
      for (let i = 1; i < ds.length; i += 1) expect(looksTheSame(ds[i - 1].figure, ds[i].figure), `press ${i}`).toBe(false);
    });
  }

  it('the stated angle still holds at every press («α < 30»)', () => {
    for (const d of presses(['α < 30', 'משולש ABC', '∢ABC = α'], 12)) expect(d.faults).toEqual([]);
  });
});

describe('sr-30 — the control: a figure with ONE drawing says so, it does not skip for ever', () => {
  it('«A(0,0) · B(4,0) · C(0,3) · משולש ABC» answers "nothing else"', () => {
    const lines = ['A(0,0)', 'B(4,0)', 'C(0,3)', 'משולש ABC'];
    expect(anotherConfiguration(lines, derive(lines, 0).configuration).found).toBe(false);
  });

  it('a drawing is the same picture as itself, and a moved point is not', () => {
    const d = derive(['משולש ABC'], 0).figure;
    expect(looksTheSame(d, d)).toBe(true);
    const moved = { ...d, points: d.points.map((p, i) => (i === 0 ? { ...p, x: p.x + 1 } : p)) };
    expect(looksTheSame(d, moved)).toBe(false);
  });
});

/**
 * #2831 ([ADR-AG-473](../../docs/06c-decisions-analytic.md#adr-ag-473), [ADR-W-206](../../docs/06w-decisions-workspace.md#adr-w-206))
 * — ONE SOLUTION, PLACED DIFFERENTLY. The operator, 2026-11-12 (*"2831 - A"*): a mirror image of a drawing is the same
 * solution placed differently, and «הציגו תצורה אחרת» shows new solutions first. `sameSolution` is the key; the cycle
 * is the button's walk on a determined figure.
 */
describe('#2831 — sameSolution: a mirror is the same solution, another shape or letter value is not', () => {
  const p215 = [
    'נתונה אליפסה שציריה הם צירי השיעורים',
    'F1 ו-F2 מוקדי האליפסה',
    'נתון ישר l המקביל לציר ה-x',
    'הישר l חותך את האליפסה בנקודות A ו-B',
    'AB=8',
    'AF1=6',
    'AF2=10',
  ];
  const fig = (lines: readonly string[], seed: number) => derive(lines, seed).figure;
  const point = (f: ReturnType<typeof fig>, id: string) => f.points.find((p) => p.id === id)!;

  it('the x-axis mirror (l: y = 6 against y = −6) is the same solution', () => {
    const [a, b] = [fig(p215, 0), fig(p215, 6)];
    expect(point(a, 'A').y).toBeCloseTo(6, 3);
    expect(point(b, 'A').y).toBeCloseTo(-6, 3);
    expect(looksTheSame(a, b)).toBe(false);
    expect(sameSolution(a, b)).toBe(true);
  });

  it('the y-axis mirror (A at (4, 6) against (−4, 6)) is the same solution', () => {
    const [a, b] = [fig(p215, 0), fig(p215, 1)];
    expect(point(a, 'A').x).toBeCloseTo(4, 3);
    expect(point(b, 'A').x).toBeCloseTo(-4, 3);
    expect(sameSolution(a, b)).toBe(true);
  });

  it('another ellipse is another solution', () => {
    expect(sameSolution(fig(p215, 0), fig(p215, 2))).toBe(false);
  });

  it('a letter with another value is another solution, even when the drawing is a mirror (M(a,0) · N(13,0) · MN = 9)', () => {
    const lines = ['M(a,0)', 'N(13,0)', 'MN = 9'];
    const [a, b] = [fig(lines, 0), derive(lines, anotherConfiguration(lines, 0).seed).figure];
    expect(new Set([a.env.a, b.env.a].map((v) => Math.round(v)))).toEqual(new Set([4, 22]));
    expect(sameSolution(a, b)).toBe(false);
  });

  it('a figure is the same solution as itself', () => {
    expect(sameSolution(fig(p215, 0), fig(p215, 0))).toBe(true);
  });
});

describe('#2831 — the solution cycle of a determined figure', () => {
  it('a figure whose only alternative is a mirror still reaches it, and comes back (A = (3, ±4) on x² + y² = 25)', () => {
    const lines = ['נתון מעגל שמשוואתו x^2+y^2=25', 'A על המעגל', 'x_A = 3'];
    const ys = presses(lines, 4).map((d) => Math.round(d.figure.points.find((p) => p.id === 'A')!.y));
    expect(ys).toHaveLength(5);
    expect(new Set(ys)).toEqual(new Set([4, -4]));
    for (let i = 1; i < ys.length; i += 1) expect(ys[i]).not.toBe(ys[i - 1]);
  });

  it('two solutions alternate press by press (M(a,0) · N(13,0) · MN = 9: a = 4, 22, 4, 22)', () => {
    const as = presses(['M(a,0)', 'N(13,0)', 'MN = 9'], 3).map((d) => Math.round(d.figure.env.a));
    expect(as).toEqual([4, 22, 4, 22]);
  });

  it('a press from a drawing outside the cycle starts it, and the first drawing is unchanged', () => {
    const lines = ['M(a,0)', 'N(13,0)', 'MN = 9'];
    expect(Math.round(derive(lines, 0).figure.env.a)).toBe(4);
    const r = anotherConfiguration(lines, 97);
    expect(r.found).toBe(true);
  });

  it('a figure with freedom left keeps the seed walk: a free triangle draws a new shape every press', () => {
    const ds = presses(['משולש ABC', 'AB = 5'], 4);
    expect(ds).toHaveLength(5);
    for (let i = 1; i < ds.length; i += 1) expect(looksTheSame(ds[i].figure, ds[i - 1].figure)).toBe(false);
  });
});
