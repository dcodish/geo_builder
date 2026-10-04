/**
 * #1270 (ADR-AG-184) — a canonical circle's centre is the real point O, unless a letter is already there.
 *
 * Operator, 2026-09-20, playing #1252 T14: *"for canonical circles only, the center is O automatically
 * unless user mentioed a letter. user can change this later anyway"*. It AMENDS ADR-AG-115's "no letter
 * is invented" for one case, and it does so with a REAL point — #1167's defect was a printed letter with
 * nothing behind it, so every row below asserts the panel text AND whether the point exists, since the
 * whole ADR-AG-115 point is that those two cannot disagree.
 *
 * The locks CALL the shipped path (`derive` → `curveParts`/`pointAt`/`centresOf`); none re-derives the
 * decision.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { isCanonicalCircle } from '../engine/conic';
import { equationExpr } from '../parser/parseAnalytic';
import { centresOf, pointAt } from '../engine/crossings';
import { curveParts, detailsText } from '../app/curveText';

type Fig = {
  points: { id: string; x: number; y: number }[];
  curves: { id: string; stated: boolean; curve: Parameters<typeof curveParts>[0] }[];
};

const run = (seq: string[]) => {
  const d = derive(seq, 0);
  const figure = d.figure as unknown as Fig;
  const circle = figure.curves.find((c) => c.stated && (c.curve as { kind: string }).kind === 'circle');
  return {
    d,
    faults: d.faults.map((f) => f.code),
    points: figure.points.map((p) => p.id),
    at: (id: string) => figure.points.find((p) => p.id === id),
    /** Is the point at the origin? (-0 and +0 alike — the solver's sign of zero is not a claim.) */
    atOrigin: (id: string) => {
      const p = figure.points.find((q) => q.id === id);
      return !!p && Math.abs(p.x) < 1e-12 && Math.abs(p.y) < 1e-12;
    },
    // #1597: the row is labelled lines now; these locks are about the centre's NAME, so they read the texts.
    row: circle ? detailsText(curveParts(circle.curve, (x, y) => pointAt(d.figure as never, x, y)).details ?? []) : undefined,
  };
};

describe('ADR-AG-184 — the issue’s table, as the class (#1270)', () => {
  /** THE CHANGE: a canonical circle, nobody at the origin, no O anywhere. */
  it('x²+y²=16 → O(0, 0), and O is a real point', () => {
    const r = run(['x^2+y^2=16']);
    expect(r.faults).toEqual([]);
    expect(r.row).toBe('O(0, 0) · r = 4');
    expect(r.points).toEqual(['O']);
    expect(r.atOrigin('O')).toBe(true);
  });

  /** Rule 1 — a point already AT the origin keeps it (T13, unchanged), in both entry orders. */
  it.each([
    [['A(0,0)', 'x^2+y^2=16']],
    [['x^2+y^2=16', 'A(0,0)']],
  ])('%j → the point at the origin names the centre; no second point', (seq) => {
    const r = run(seq);
    expect(r.faults).toEqual([]);
    expect(r.row).toBe('A(0, 0) · r = 4');
    expect(r.points).toEqual(['A']);
  });

  /** Rule 2 — the student's own letter for the centre (unchanged), in the same sentence or a later one. */
  it.each([
    [['נתון מעגל O שמשוואתו x^2+y^2=16'], 'O'],
    [['נתון מעגל K שמשוואתו x^2+y^2=16'], 'K'],
    [['נתון מעגל 1 שמשוואתו x^2+y^2=25', 'K מרכז המעגל 1'], 'K'],
    [['the circle K whose equation is x^2+y^2=9'], 'K'],
  ])('%j → the student’s letter %s, and no O beside it', (seq, letter) => {
    const r = run(seq);
    expect(r.faults).toEqual([]);
    expect(r.points).toEqual([letter]);
    expect(r.row?.startsWith(`${letter}(0, 0)`)).toBe(true);
  });

  /** Rule 2's concentric reach: a named centre occupies the origin for a second canonical circle too. */
  it('a second canonical circle does not mint O beside the student’s K', () => {
    const r = run(['נתון מעגל K שמשוואתו x^2+y^2=16', 'x^2+y^2=25']);
    expect(r.faults).toEqual([]);
    expect(r.points).toEqual(['K']);
  });

  /** Rule 3 — not canonical: coordinates alone (his «canonical only»). */
  it.each([
    ['(x-3)^2+(y-4)^2=9', '(3, 4) · r = 3'],
    ['נתון מעגל שמשוואתו (x-3)^2+(y-4)^2=25', '(3, 4) · r = 5'],
    ['נתון מעגל 1 שמשוואתו (x-3)^2+(y-4)^2=9', '(3, 4) · r = 3'],
  ])('%s → %s, no point', (line, row) => {
    const r = run([line]);
    expect(r.faults).toEqual([]);
    expect(r.row).toBe(row);
    expect(r.points).toEqual([]);
  });

  /** Rule 4 — O is DEFINED by the student elsewhere: no second O, no invented O₁, either entry order. */
  it.each([
    [['O(5,5)', 'x^2+y^2=16']],
    [['x^2+y^2=16', 'O(5,5)']],
    [['A(-2,0)', 'B(4,6)', 'O אמצע AB', 'x^2+y^2=16']],
    [['x^2+y^2=16', 'A(-2,0)', 'B(4,6)', 'O אמצע AB']],
  ])('%j → the centre keeps its coordinates alone', (seq) => {
    const r = run(seq);
    expect(r.faults).toEqual([]);
    expect(r.row).toBe('(0, 0) · r = 4');
    expect(r.points.filter((p) => p === 'O')).toHaveLength(1);
    expect(r.atOrigin('O')).toBe(false);
    expect(r.d.minted).toEqual([]);
  });

  /** Rule 4, the fold half — an O DECLARED by an earlier sentence («משולש AOB») holds the letter. */
  it('an O declared earlier by a shape noun keeps the letter; the centre is coordinates alone', () => {
    const r = run(['משולש AOB', 'x^2+y^2=16']);
    expect(r.faults).toEqual([]);
    expect(r.row).toBe('(0, 0) · r = 4');
    expect(r.d.minted).toEqual([]);
  });

  /** Circles only — T15: a parabola's focus and an ellipse's foci keep coordinates alone. */
  it('a parabola focus stays letterless, even beside a canonical circle', () => {
    expect(run(['y^2=54x']).points).toEqual([]);
    const r = run(['x^2+y^2=16', 'y^2=54x']);
    expect(r.points).toEqual(['O']);
  });

  it('an ellipse noun over a circle’s equation mints no O (circles only)', () => {
    const r = run(['נתונה אליפסה שמשוואתה x^2+y^2=16']);
    expect(r.faults).toEqual([]);
    expect(r.points).toEqual([]);
  });

  /** A circle that can never exist has no centre to name — and the refusal is not doubled. */
  it('x²+y²+1=0 is reported once and mints nothing', () => {
    const r = run(['משוואת המעגל x^2+y^2+1=0']);
    expect(r.faults).toEqual(['does-not-exist']);
    expect(r.points).toEqual([]);
  });
});

describe('ADR-AG-184 — every canonical-circle declaration path, both locales', () => {
  it.each([
    ['anonymous', 'x^2+y^2=16'],
    ['he noun', 'משוואת המעגל x^2+y^2=16'],
    ['he digit numeral', 'נתון מעגל 1 שמשוואתו x^2+y^2=25'],
    ['he Roman numeral', 'נתון מעגל I שמשוואתו x^2+y^2=25'],
    ['he colon', 'נתון מעגל 2: x^2+y^2=25'],
    ['en Roman', 'The circle I: x^2+y^2=25'],
    ['en digit', 'circle 1 is x^2+y^2=25'],
    ['a parameter radius', 'x^2+y^2=r^2'],
    ['unicode squares', 'x²+y²=16'],
  ])('%s — «%s» declares O at the origin, and the list says the tool named it', (_what, line) => {
    const r = run([line]);
    expect(r.faults).toEqual([]);
    expect(r.points).toEqual(['O']);
    expect(r.atOrigin('O')).toBe(true);
    expect(r.d.minted).toEqual([{ index: 0, id: 'O' }]);
  });

  it('a centre that yielded is not claimed on the row', () => {
    expect(run(['A(0,0)', 'x^2+y^2=16']).d.minted).toEqual([]);
    expect(run(['נתון מעגל O שמשוואתו x^2+y^2=16']).d.minted).toEqual([]);
  });
});

describe('ADR-AG-184 — O is an object the student can use ("user can change this later")', () => {
  it.each([
    [['x^2+y^2=16', 'A(4,0)', 'הקטע OA']],
    [['x^2+y^2=16', 'A(4,0)', 'OA = 4']],
    [['x^2+y^2=16', 'A(4,0)', 'B(0,4)', 'משולש AOB']],
    [['x^2+y^2=16', 'M אמצע OA', 'A(4,0)']],
  ])('%j — a later sentence referring to O binds to the centre', (seq) => {
    const r = run(seq);
    expect(r.faults).toEqual([]);
    expect(r.d.outcomes.every((o) => o !== 'faulted')).toBe(true);
    expect(r.atOrigin('O')).toBe(true);
    expect(r.points.filter((p) => p === 'O')).toHaveLength(1);
  });

  it('stability: adding lines never moves O', () => {
    const before = run(['x^2+y^2=16']).at('O');
    const after = run(['x^2+y^2=16', 'A(4,0)', 'B(0,4)', 'משולש AOB']).at('O');
    expect(after).toEqual(before);
  });
});

describe('ADR-AG-184 — the centre ring and the panel agree (#1167’s invariant)', () => {
  it('a canonical numeral circle offers no centre ring: its centre is taken by O', () => {
    const d = derive(['נתון מעגל 1 שמשוואתו x^2+y^2=25'], 0);
    expect(pointAt(d.figure, 0, 0)).toBe('O');
    expect(centresOf(d.figure, 'Q')).toEqual([]);
  });

  it('a translated numeral circle still offers it', () => {
    const d = derive(['נתון מעגל 1 שמשוואתו (x-3)^2+(y-4)^2=9'], 0);
    expect(pointAt(d.figure, 3, 4)).toBeNull();
    expect(centresOf(d.figure, 'Q')).toHaveLength(1);
  });
});

describe('isCanonicalCircle — a property of the EQUATION, at every parameter value', () => {
  const eq = (s: string) => {
    const e = equationExpr(s);
    if (!e) throw new Error(`unparsed ${s}`);
    return e;
  };
  it.each([
    ['x^2+y^2=16', true],
    ['2x^2+2y^2=18', true],
    ['x^2+y^2=r^2', true],
    ['x^2+y^2=4k^2', true],
    ['(x-3)^2+(y-4)^2=9', false],
    ['x^2+y^2-2ax=0', false],
    ['x^2+y^2+1=0', false],
    ['x^2/9+y^2/4=1', false],
    ['y^2=54x', false],
    ['y=2x', false],
  ])('%s → %s', (s, want) => {
    expect(isCanonicalCircle(eq(s))).toBe(want);
  });
});
