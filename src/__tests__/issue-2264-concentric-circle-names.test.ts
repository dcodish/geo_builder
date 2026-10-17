/**
 * #2264 ([ADR-714](../../docs/06-decisions.md#adr-714)) — TWO CIRCLES ON ONE CENTRE ARE NAMED BY THEIR ROLE.
 *
 * Operator report (round #2245, T21): «שני מעגלים בעלי מרכז משותף O» · «רדיוס מעגל חיצוני הוא 10» ·
 * «רדיוס מעגל פנימי 9» built right, but the values panel printed «רדיוס O = 10», «רדיוס O = 9», «שטח (O)»
 * twice — two circles under one name. Root cause: `circleRefs` (the one circle-naming seam, ADR-552) named a
 * circle by its centre letter even when that letter is shared. The concentric pair's own record
 * (`innerOf`, stamped by `set-radius-order`, ADR-244) tells them apart; the operator ruled (2026-10-16,
 * option A) that they read «המעגל החיצוני» / «המעגל הפנימי».
 */
import { describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import { computeValues } from '@/replay/core';
import { circleRefs, emptyConstruction, applyCommand } from '@/engine';
import type { Construction, ValueRow } from '@/engine';
import { valueRowText } from '@/render/valueRowText';
import { factsOf } from './scenarios-harness';

const tHe = i18n.getFixedT('he');
const tEn = i18n.getFixedT('en');
const strip = (s: string) => s.replace(/[⁦-⁩]/g, '');
const CIRCLE_KINDS = new Set(['radius', 'area', 'perimeter']);
/** `[label, value]` of every circle row, worded in `lng`. */
function circleRows(steps: string[], lng: 'he' | 'en'): [string, number][] {
  const t = lng === 'he' ? tHe : tEn;
  return computeValues(factsOf(steps)).rows
    .filter((r: ValueRow) => CIRCLE_KINDS.has(r.kind) && r.circle)
    .map((r) => [strip(valueRowText(r, (k, p) => t(k, p) as string)), Math.round(r.value * 1e6) / 1e6]);
}
const build = (cmds: Parameters<typeof applyCommand>[1][]): Construction =>
  cmds.reduce((c, cmd) => applyCommand(c, cmd), emptyConstruction());

const OPERATOR = ['שני מעגלים בעלי מרכז משותף O', 'רדיוס מעגל חיצוני הוא 10', 'רדיוס מעגל פנימי 9'];
const r6 = (x: number) => Math.round(x * 1e6) / 1e6;

describe('#2264 — the values panel names a concentric pair by role', () => {
  it("the operator's three lines, Hebrew: every row names its circle's role", () => {
    expect(circleRows(OPERATOR, 'he')).toEqual([
      ['רדיוס המעגל החיצוני', 10],
      ['שטח המעגל החיצוני', r6(100 * Math.PI)],
      ['היקף המעגל החיצוני', r6(20 * Math.PI)],
      ['רדיוס המעגל הפנימי', 9],
      ['שטח המעגל הפנימי', r6(81 * Math.PI)],
      ['היקף המעגל הפנימי', r6(18 * Math.PI)],
    ]);
  });
  it("the operator's three lines, English locale", () => {
    expect(circleRows(OPERATOR, 'en').map(([l]) => l)).toEqual([
      'radius of the outer circle', 'area of the outer circle', 'circumference of the outer circle',
      'radius of the inner circle', 'area of the inner circle', 'circumference of the inner circle',
    ]);
  });
  it('English input builds the same named rows', () => {
    const rows = circleRows(['two concentric circles with centre O', 'the radius of the outer circle is 10', 'the radius of the inner circle is 9'], 'he');
    expect(rows.find(([l]) => l === 'רדיוס המעגל החיצוני')?.[1]).toBe(10);
    expect(rows.find(([l]) => l === 'רדיוס המעגל הפנימי')?.[1]).toBe(9);
  });
  it('an unnamed shared centre (ADR-342 token on both) is told apart the same way', () => {
    const rows = circleRows(['שני מעגלים בעלי מרכז משותף', 'רדיוס מעגל חיצוני הוא 10', 'רדיוס מעגל פנימי 9'], 'he');
    expect(rows.filter(([l]) => l.startsWith('רדיוס')).map(([l]) => l)).toEqual(['רדיוס המעגל החיצוני', 'רדיוס המעגל הפנימי']);
  });
  it('control: a single circle O keeps its letter', () => {
    expect(circleRows(['מעגל O ברדיוס 5'], 'he').map(([l]) => l)).toEqual(['רדיוס O', 'שטח (O)', 'היקף (O)']);
  });
  it('control: two circles with different centres keep their letters', () => {
    expect(circleRows(['מעגל O ברדיוס 3', 'מעגל P ברדיוס 2'], 'he').map(([l]) => l)).toEqual([
      'רדיוס O', 'שטח (O)', 'היקף (O)', 'רדיוס P', 'שטח (P)', 'היקף (P)',
    ]);
  });
});

describe('#2264 — circleRefs: a role only where the construction records one', () => {
  it('two circles on one centre, ordered by innerOf → outer / inner', () => {
    const c = build([
      { type: 'circle', id: 'circle-O', center: 'O', radius: 10 },
      { type: 'circle', id: 'circle-O-2', center: 'O', radius: 9 },
      { type: 'set-radius-order', outer: 'circle-O', inner: 'circle-O-2' },
    ]);
    const refs = circleRefs(c);
    expect(refs.get('circle-O')).toEqual({ via: 'role', role: 'outer' });
    expect(refs.get('circle-O-2')).toEqual({ via: 'role', role: 'inner' });
  });
  it('a size order between circles on DIFFERENT centres is not a role (orderedBelow only)', () => {
    const c = build([
      { type: 'circle', id: 'circle-O', center: 'O', radius: 5 },
      { type: 'circle', id: 'circle-P', center: 'P', radius: 2 },
      { type: 'set-radius-order', outer: 'circle-O', inner: 'circle-P' },
    ]);
    expect(circleRefs(c).get('circle-O')).toEqual({ via: 'centre', name: 'O' });
    expect(circleRefs(c).get('circle-P')).toEqual({ via: 'centre', name: 'P' });
  });
  it('three circles on one centre: no pair role is invented', () => {
    const c = build([
      { type: 'circle', id: 'circle-O', center: 'O', radius: 10 },
      { type: 'circle', id: 'circle-O-2', center: 'O', radius: 9 },
      { type: 'circle', id: 'circle-O-3', center: 'O', radius: 8 },
      { type: 'set-radius-order', outer: 'circle-O', inner: 'circle-O-2' },
    ]);
    for (const id of ['circle-O', 'circle-O-2', 'circle-O-3']) expect(circleRefs(c).get(id)?.via).toBe('centre');
  });
  it('a hidden circle on the same centre does not break the pair', () => {
    const c = build([
      { type: 'circle', id: 'circle-O', center: 'O', radius: 10 },
      { type: 'circle', id: 'circle-O-2', center: 'O', radius: 9 },
      { type: 'circle', id: 'tanaux-OE', center: 'O', radius: 2, hidden: true },
      { type: 'set-radius-order', outer: 'circle-O', inner: 'circle-O-2' },
    ]);
    expect(circleRefs(c).get('circle-O')).toEqual({ via: 'role', role: 'outer' });
    expect(circleRefs(c).has('tanaux-OE')).toBe(false);
  });
});
