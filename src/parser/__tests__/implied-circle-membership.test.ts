/**
 * #362 (ADR-409): an on-circle MEMBERSHIP / SIDE statement on a circle-LESS figure introduces the
 * circle it presupposes (the ADR-367 `implied` discipline — the chord/diameter/tangent siblings'
 * behaviour, finally adopted by `pointOnCircle` and `pointVsCircle`). The 2+-circle ambiguity bail
 * (ADR-244) and the on-carrier defer (ADR-119/240) are locked unchanged.
 */
import { describe, expect, it } from 'vitest';
import { parse } from '@/parser/parse';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';

const empty = { circles: [] as string[] };
const factsOf = (cmds: AnyCommand[]): Fact[] => cmds.map((cmd, i) => ({ id: `f${i}`, cmd, enabled: true, group: 'g0' }));

describe('membership presupposes its circle (#362, ADR-409)', () => {
  it('«A ו-C נמצאות על המעגל» on a circle-less figure INTRODUCES one + both memberships', () => {
    const r = parse('A ו-C נמצאות על המעגל', empty);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.commands.some((c) => c.type === 'circle'), 'a free circle is minted').toBe(true);
    const on = r.commands.filter((c) => c.type === 'point-on-circle');
    expect(on.map((c) => (c as { id: string }).id).sort()).toEqual(['A', 'C']);
    // and it BUILDS: both points genuinely ride the circle
    const d = replay(factsOf(r.commands), 0);
    expect(d.lastError).toBeNull();
    const circle = [...d.circles.values()][0];
    expect(circle, 'the circle resolved').toBeTruthy();
    for (const id of ['A', 'C']) {
      const p = d.positions.get(id)!;
      expect(Math.abs(Math.hypot(p.x - circle.center.x, p.y - circle.center.y) - circle.r), `${id} on the circle`).toBeLessThan(1e-6);
    }
  });

  it('English mirror: "A is on the circle" mints and lands A on it', () => {
    const r = parse('A is on the circle', empty);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.commands.some((c) => c.type === 'circle')).toBe(true);
    expect(r.commands.some((c) => c.type === 'point-on-circle' && (c as { id: string }).id === 'A')).toBe(true);
  });

  it('«M מחוץ למעגל» (side form) mints the circle and seeds M OUTSIDE in every displayed config', () => {
    const r = parse('M מחוץ למעגל', empty);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.commands.some((c) => c.type === 'circle')).toBe(true);
    expect(r.commands.some((c) => c.type === 'point-circle-side' && (c as { side: string }).side === 'outside')).toBe(true);
    // the side is a REQUIREMENT (ADR-254): the default seeding honours it, and any raw seed that
    // violates it must be FLAGGED (amber) — never silently inside. The app's display layer
    // (firstSatisfyingSeed/meetsRequirements) only ever shows satisfying configs.
    const d0 = replay(factsOf(r.commands), 0);
    expect(d0.lastError).toBeNull();
    const c0 = [...d0.circles.values()][0];
    const p0 = d0.positions.get('M')!;
    expect(Math.hypot(p0.x - c0.center.x, p0.y - c0.center.y), 'default seeding lands M outside').toBeGreaterThan(c0.r);
    expect(d0.violations, 'seed 0 satisfies the stated side').toEqual([]);
    for (const seed of [1, 2]) {
      const d = replay(factsOf(r.commands), seed);
      const c = [...d.circles.values()][0];
      const p = d.positions.get('M')!;
      const outside = Math.hypot(p.x - c.center.x, p.y - c.center.y) > c.r;
      if (!outside) expect(d.violations.length, `seed ${seed}: a violated side must be FLAGGED`).toBeGreaterThan(0);
    }
  });

  it('«M ו-N בתוך המעגל» — the inside list form', () => {
    const r = parse('M ו-N בתוך המעגל', empty);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const sides = r.commands.filter((c) => c.type === 'point-circle-side');
    expect(sides).toHaveLength(2);
    expect(sides.every((c) => (c as { side: string }).side === 'inside')).toBe(true);
  });

  it('a NAMED unknown circle keeps the #186 seam: withImplicitCircles invents it TAGGED implied', () => {
    // the introduce fallback fires ONLY for unnamed circle-less references — a named one must keep
    // flowing through resolveCenter so the naming-by-use machinery (implied tag → binding) owns it
    const r = parse('A על מעגל Q', empty);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const minted = r.commands.filter((c) => c.type === 'circle');
    expect(minted.length, 'exactly the withImplicitCircles invention').toBe(1);
    expect((minted[0] as { implied?: boolean }).implied, 'carries the #186 implied tag').toBe(true);
  });

  it('an EXISTING single circle binds as before (no second circle minted)', () => {
    const r = parse('A על המעגל', { circles: ['O'] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.commands.some((c) => c.type === 'circle'), 'no new circle').toBe(false);
    expect(r.commands.some((c) => c.type === 'point-on-circle' && (c as { circle: string }).circle === 'circle-O')).toBe(true);
  });

  it('2+ unnamed circles still DEFER (the ADR-244 ambiguity bail survives)', () => {
    const r = parse('A על המעגל', { circles: ['O', 'P'] });
    expect(r.ok).toBe(false);
  });

  it('the on-CARRIER defer is untouched: «D על המיתר AB במעגל O» stays with the chord reading', () => {
    const r = parse('D על המיתר AB במעגל O', { circles: ['O'] });
    // whatever rule owns it, it must NOT be a bare point-on-circle for D
    if (r.ok) {
      expect(r.commands.some((c) => c.type === 'point-on-circle' && (c as { id: string }).id === 'D')).toBe(false);
    }
  });

  it('no theft: the tangents-from-external compound keeps its owner on a circle-less figure', () => {
    const r = parse('מנקודה E מחוץ למעגל יוצאים שני משיקים למעגל', empty);
    // must not be swallowed by pointVsCircle's side reading (its anchored $ guard) — the
    // compound has content after the circle ref and belongs to the tangent rules.
    if (r.ok) {
      expect(r.commands.some((c) => c.type === 'point-circle-side')).toBe(false);
    }
  });
});
