/**
 * #44 — named special-point meets (the NOUN form of a triangle/quad centre): «X מפגש האלכסונים /
 * התיכונים / חוצי הזוויות / הגבהים / האנכים האמצעיים», «ה<noun> נפגשים/נחתכים בנקודה X», En «X is the
 * intersection of the diagonals/medians/…». An ADR-110 macro — two special lines + their intersection.
 * (Prod log-triage 2026-07-11: ~5-6 users named the diagonal crossing by noun.)
 */
import { describe, it, expect } from 'vitest';
import { parse } from '@/parser';
import type { AnyCommand } from '@/engine';

const QUAD = { polygons: [['A', 'B', 'C', 'D']] } as never;
const TRI = { polygons: [['A', 'B', 'C']] } as never;
const types = (u: string, ctx: never): string[] => {
  const r = parse(u, ctx);
  expect(r.ok, u).toBe(true);
  return r.ok ? r.commands.map((c) => c.type) : [];
};
const idOf = (u: string, ctx: never, t: AnyCommand['type']): string | undefined => {
  const r = parse(u, ctx);
  return r.ok ? (r.commands.find((c) => c.type === t) as { id?: string } | undefined)?.id : undefined;
};

describe('#44 — special-point meets (noun form)', () => {
  // Only the CENTRE point is drawn — the construction (diagonals/medians/altitudes/⊥-bisectors and their
  // helper feet/midpoints) is invisible scaffolding (operator, 2026-07-14): no `segment` commands, helper
  // points are `~`-prefixed (unrendered), ⊥-bisector lines are `visible:false`.
  it('diagonals meet — the quad crossing, no drawn diagonals (several phrasings, He/En)', () => {
    for (const u of [
      'G נקודת מפגש האלכסונים',
      'האלכסונים נחתכים בנקודה O',
      'E נקודת חיתוך האלכסונים',
      'הנקודה O היא מפגש אלכסוני הטרפז',
      'M is the intersection of the diagonals',
    ]) {
      expect(types(u, QUAD)).toEqual(['line-line-intersection']); // only the point, no segments
    }
    expect(idOf('G נקודת מפגש האלכסונים', QUAD, 'line-line-intersection')).toBe('G');
  });

  it('medians meet — centroid (hidden midpoints + crossing, no drawn medians)', () => {
    expect(types('M מפגש התיכונים', TRI)).toEqual(['midpoint', 'midpoint', 'line-line-intersection']);
    // the median midpoints are hidden scaffolding (`~`-prefixed → not rendered)
    const cmds = parse('M מפגש התיכונים', TRI);
    if (cmds.ok) expect(cmds.commands.filter((c) => c.type === 'midpoint').every((c) => (c as { id: string }).id.startsWith('~'))).toBe(true);
    expect(idOf('M מפגש התיכונים במשולש ABC', {} as never, 'line-line-intersection')).toBe('M');
  });

  it('angle bisectors meet — incentre (two invisible bisector lines + intersection)', () => {
    expect(types('O מפגש חוצי הזוויות', TRI)).toEqual(['bisector', 'bisector', 'line-intersection']);
  });

  it('altitudes meet — orthocentre (hidden feet + crossing, no drawn altitudes)', () => {
    expect(types('H מפגש הגבהים', TRI)).toEqual(['foot', 'foot', 'line-line-intersection']);
  });

  it('perpendicular bisectors meet — circumcentre (two ⊥-bisector lines + intersection)', () => {
    expect(types('O מפגש האנכים האמצעיים', TRI)).toEqual([
      'midpoint', 'perpendicular-line', 'midpoint', 'perpendicular-line', 'line-intersection',
    ]);
    expect(types('O is the intersection of the perpendicular bisectors', TRI)[1]).toBe('perpendicular-line');
  });

  it('DEFERS on an ambiguous / unknown shape (no single polygon of the right size)', () => {
    expect(parse('M מפגש התיכונים', {} as never).ok).toBe(false); // no triangle in context
    expect(parse('G מפגש האלכסונים', { polygons: [['A', 'B', 'C'], ['E', 'F', 'G', 'H']] } as never).ok).toBe(true); // one quad → ok
    // two quads → ambiguous → defer
    expect(parse('G מפגש האלכסונים', { polygons: [['A', 'B', 'C', 'D'], ['E', 'F', 'G', 'H']] } as never).ok).toBe(false);
  });

  it('NO THEFT: the explicitly-lettered diagonal meet stays with its own rule', () => {
    // "E חיתוך AC ו-BD" has a meet cue but no centre-NOUN → this rule declines, line-line-intersection owns it
    const r = parse('E חיתוך AC ו-BD', {} as never);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.commands.some((c) => c.type === 'line-line-intersection')).toBe(true);
  });
});
