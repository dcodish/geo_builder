/**
 * #1999 + #1685 ([ADR-AG-278](../../docs/06c-decisions-analytic.md#adr-ag-278)) — either end of a named cevian may be
 * written first, for all three roles; the vertex is decided by the triangle the sentence names, else at M1 by the figure.
 *
 * Measured on d7b31e0a through `decideSubmit`: on «משולש CMD», «AM תיכון לצלע CD» / «AM גובה לצלע CD» refused
 * `polygon-collapsed`; «AM תיכון במשולש CMD» `apex-not-a-vertex`; «AM תיכון» `cevian-no-triangle`; the English
 * "MA median to CD", "MA is the height to CD", "MA is the median of triangle CMD", «הקטע MA הוא תיכון לצלע CD»,
 * «MA חוצה זווית CMD במשולש CMD» `not-handled`; «MA חוצה זווית CMD לצלע CD» and «MA גובה לצלע CD במשולש CMD»
 * `split-statements`. Operator ruling 2026-10-13 (card 15): *"all cevians, both letter orders, in 2-D and analytic,
 * plus the English form"*.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { decideSubmit } from '../app/submit';

const kept = (lines: string[]): { kinds: string[]; lines: string[] } => {
  const out: string[] = [];
  const kinds = lines.map((line) => {
    const v = decideSubmit(line, out, 0);
    if (v.kind === 'record') out.push(v.line);
    return v.kind === 'refused' ? `refused:${v.error.key}` : v.kind;
  });
  return { kinds, lines: out };
};
type P = { x: number; y: number };
const d = (p: P, q: P) => Math.hypot(p.x - q.x, p.y - q.y);
const ang = (p: P, v: P, q: P) => Math.acos(((p.x - v.x) * (q.x - v.x) + (p.y - v.y) * (q.y - v.y)) / (d(p, v) * d(q, v)));

/** The drawn points of `lines` at `seed` (every line recorded, the figure fault-free). */
function points(lines: string[], seed: number): Record<string, P> {
  const k = kept(lines);
  expect(k.kinds, lines.join(' · ')).toEqual(lines.map(() => 'record'));
  const dv = derive(k.lines, seed);
  expect(dv.faults, `seed ${seed}`).toEqual([]);
  return Object.fromEntries(dv.figure.points.map((p) => [p.id, p as P]));
}

const T = 'משולש CMD';
const TE = 'triangle CMD';
type Role = 'median' | 'altitude' | 'bisector';
const roleOf = (line: string): Role => (/תיכון|median/i.test(line) ? 'median' : /גובה|altitude|height/i.test(line) ? 'altitude' : 'bisector');

/** A on CD, the role's own property at M, and the same A as the vertex-first twin — seeds 0–3 (analytic solves its midpoints and
 *  feet numerically, to ~1e-6: the tolerances are the solver's, and the twin carries the same error). */
function sameFigure(prefix: string, line: string, twin: string) {
  const role = roleOf(twin);
  for (let s = 0; s <= 3; s++) {
    const p = points([prefix, line], s);
    const q = points([prefix, twin], s);
    const { C, M, D, A } = p;
    // On the LINE CD (#1687, ADR-AG-348): the triangle CMD stays as drawn, so on an obtuse one an altitude's foot falls on
    // the side's extension, as in 2-D (measured at 216cf8bb: «משולש CMD» · «MA גובה לצלע CD», foot outside CD at 11/24
    // seeds, the triangle unmoved). A median's foot and a bisector's foot are inside by construction.
    const onLine = Math.abs((D.x - C.x) * (A.y - C.y) - (D.y - C.y) * (A.x - C.x)) / d(C, D);
    expect(onLine, `seed ${s}: A on the line CD`).toBeLessThan(1e-5);
    if (role !== 'altitude') expect(Math.abs(d(C, A) + d(A, D) - d(C, D)), `seed ${s}: A on CD`).toBeLessThan(1e-5);
    if (role === 'median') expect(d(C, A)).toBeCloseTo(d(A, D), 4);
    if (role === 'altitude') expect(Math.abs((A.x - M.x) * (D.x - C.x) + (A.y - M.y) * (D.y - C.y)) / (d(A, M) * d(C, D))).toBeLessThan(1e-5);
    if (role === 'bisector') expect(ang(C, M, A)).toBeCloseTo(ang(A, M, D), 4);
    expect(d(A, q.A), `seed ${s}: the same A as «${twin}»`).toBeLessThan(1e-5);
  }
}

describe('#1999 — vertex-last, the copula and the targets build the same figure as «MA …»', () => {
  it.each([
    ['AM תיכון לצלע CD', 'MA תיכון לצלע CD'],
    ['AM הוא תיכון לצלע CD', 'MA תיכון לצלע CD'],
    ['AM היא תיכון לצלע CD', 'MA תיכון לצלע CD'],
    ['AM הינו תיכון לצלע CD', 'MA תיכון לצלע CD'],
    ['AM הוא התיכון לצלע CD', 'MA תיכון לצלע CD'],
    ['הקטע AM הוא תיכון לצלע CD', 'MA תיכון לצלע CD'],
    ['הקטע MA הוא תיכון לצלע CD', 'MA תיכון לצלע CD'],
    ['AM גובה לצלע CD', 'MA גובה לצלע CD'],
    ['AM הוא גובה לצלע CD', 'MA גובה לצלע CD'],
    ['AM היא גובה לצלע CD', 'MA גובה לצלע CD'],
    ['AM חוצה זווית CMD', 'MA חוצה זווית CMD'],
    ['AM הוא חוצה זווית CMD', 'MA חוצה זווית CMD'],
    ['AM תיכון במשולש CMD', 'MA תיכון במשולש CMD'],
    ['AM הוא תיכון במשולש CMD', 'MA תיכון במשולש CMD'],
    ['AM גובה במשולש CMD', 'MA גובה במשולש CMD'],
    ['AM גובה לצלע CD במשולש CMD', 'MA גובה לצלע CD'],
    ['MA גובה לצלע CD במשולש CMD', 'MA גובה לצלע CD'],
    ['MA חוצה זווית CMD במשולש CMD', 'MA חוצה זווית CMD'],
    ['AM חוצה זווית CMD במשולש CMD', 'MA חוצה זווית CMD'],
    ['AM חוצה את זווית M במשולש CMD', 'MA חוצה זווית CMD'],
    ['MA חוצה זווית CMD לצלע CD', 'MA חוצה זווית CMD'],
    ['AM חוצה זווית CMD לצלע CD', 'MA חוצה זווית CMD'],
    ['AM תיכון', 'MA תיכון'],
    ['AM גובה', 'MA גובה'],
    ['AM הוא גובה', 'MA גובה'],
  ])('«%s» = «%s»', (line, twin) => sameFigure(T, line, twin));

  it.each([
    ['MA median to CD', 'MA is the median to side CD'],
    ['MA is a median to CD', 'MA is the median to side CD'],
    ['MA is the median of triangle CMD', 'MA is the median to side CD'],
    ['AM median to CD', 'MA is the median to side CD'],
    ['AM is a median to CD', 'MA is the median to side CD'],
    ['AM is the median to side CD', 'MA is the median to side CD'],
    ['AM is the median in triangle CMD', 'MA is the median to side CD'],
    ['AM is the median of triangle CMD', 'MA is the median to side CD'],
    ['AM is a median', 'MA is the median to side CD'],
    ['MA altitude to CD', 'MA is the altitude to CD'],
    ['MA is the height to CD', 'MA is the altitude to CD'],
    ['MA height to CD', 'MA is the altitude to CD'],
    ['MA is the height in triangle CMD', 'MA is the altitude to CD'],
    ['MA is an altitude to CD', 'MA is the altitude to CD'],
    ['MA is a height to CD', 'MA is the altitude to CD'],
    ['MA is an altitude of triangle CMD', 'MA is the altitude to CD'],
    ['AM altitude to CD', 'MA is the altitude to CD'],
    ['AM is the altitude to CD', 'MA is the altitude to CD'],
    ['AM is the height to side CD', 'MA is the altitude to CD'],
    ['AM is the altitude in triangle CMD', 'MA is the altitude to CD'],
    ['AM is the altitude', 'MA is the altitude to CD'],
    ['AM is an altitude to CD', 'MA is the altitude to CD'],
    ['AM is the bisector of angle CMD', 'MA bisects angle CMD'],
    ['MA is a bisector of angle CMD', 'MA bisects angle CMD'],
    ['MA is the angle bisector of CMD', 'MA bisects angle CMD'],
    ['AM is the angle bisector of CMD', 'MA bisects angle CMD'],
    ['MA bisects angle CMD to side CD', 'MA bisects angle CMD'],
    ['MA bisects angle CMD in triangle CMD', 'MA bisects angle CMD'],
    ['MA is the bisector of angle CMD in triangle CMD', 'MA bisects angle CMD'],
    ['MA is the bisector of angle CMD to side CD', 'MA bisects angle CMD'],
    ['AM bisects angle CMD in triangle CMD', 'MA bisects angle CMD'],
  ])('English: "%s" = "%s"', (line, twin) => sameFigure(TE, line, twin));
});

describe('#1999 — the far end already exists', () => {
  it.each([
    ['AM תיכון לצלע CD', 'MA תיכון לצלע CD'],
    ['AM גובה לצלע CD', 'MA גובה לצלע CD'],
    ['AM חוצה זווית CMD', 'MA חוצה זווית CMD'],
  ])('«A על CD» · «%s» records, A where «%s» puts it', (line, twin) => {
    for (let s = 0; s <= 2; s++) {
      const p = points([T, 'A על CD', line], s);
      const q = points([T, 'A על CD', twin], s);
      expect(d(p.A, q.A), `seed ${s}`).toBeLessThan(1e-5);
    }
  });

  it('«משולש ABC» · «P על BC» · «PA תיכון לצלע BC» records', () => {
    expect(kept(['משולש ABC', 'P על BC', 'PA תיכון לצלע BC']).kinds).toEqual(['record', 'record', 'record']);
  });
});

describe('#1999 — the refusals that stay', () => {
  it.each([
    ['AM חוצה זווית C', 'refused:bisector-wrong-apex'],
    ['AM הוא חוצה זווית C', 'refused:bisector-wrong-apex'],
    ['MA תיכון לצלע CM', 'refused:degenerate-role'],
    ['AM תיכון לצלע CM', 'refused:degenerate-role'],
    ['AM תיכון לצלע MD', 'refused:degenerate-role'],
    ['MA גובה לצלע CM', 'refused:degenerate-role'],
    ['AM גובה לצלע CM', 'refused:degenerate-role'],
    // the wrong side for the bisector: the vertex M is on CM — the existing message, now read instead of split
    ['AM חוצה זווית CMD לצלע CM', 'refused:degenerate-role'],
  ])('«%s» → %s', (line, want) => {
    expect(kept([T, line]).kinds).toEqual(['record', want]);
  });
});
