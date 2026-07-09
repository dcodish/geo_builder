import { describe, it, expect } from 'vitest';
import { inscribePlacements, inscribeVariantCount, expandInscribe } from '../inscribe';

describe('inscribe placement algorithm', () => {
  it('rhombus BDEF in triangle ABC: 2 mirror variants, shared B, one vertex per side', () => {
    const variants = inscribePlacements(['B', 'D', 'E', 'F'], ['A', 'B', 'C']);
    expect(variants).toHaveLength(2);
    // Both variants: B at its vertex; D,E,F each on a distinct side.
    for (const v of variants) {
      expect(v[0]).toEqual({ at: 'vertex', v: 'B' });
      const sides = v.slice(1).map((p) => (p.at === 'side' ? `${p.a}${p.b}` : p.v));
      expect(new Set(sides).size).toBe(3); // one per side
    }
    // The two variants are mirrors (different side maps).
    expect(JSON.stringify(variants[0])).not.toEqual(JSON.stringify(variants[1]));
  });

  it('one variant is the bagrut figure: D on AB, E on AC, F on BC', () => {
    const variants = inscribePlacements(['B', 'D', 'E', 'F'], ['A', 'B', 'C']);
    const sideOf = (place: any, id: string) => {
      const i = ['B', 'D', 'E', 'F'].indexOf(id);
      const p = place[i];
      return p.at === 'side' ? [p.a, p.b].sort().join('') : p.v;
    };
    const matchesFigure = variants.some(
      (v) => sideOf(v, 'D') === 'AB' && sideOf(v, 'E') === 'AC' && sideOf(v, 'F') === 'BC',
    );
    expect(matchesFigure).toBe(true);
  });

  it('rectangle DEFG in triangle ABC: 3 base-side variants, no shared vertex', () => {
    const variants = inscribePlacements(['D', 'E', 'F', 'G'], ['A', 'B', 'C']);
    expect(variants.length).toBeGreaterThanOrEqual(3);
    // Each variant puts exactly two consecutive vertices on one side (the base) and one on each other side.
    for (const v of variants) {
      const sides = v.map((p) => (p.at === 'side' ? [p.a, p.b].sort().join('') : '@'));
      const counts = new Map<string, number>();
      for (const s of sides) counts.set(s, (counts.get(s) ?? 0) + 1);
      expect([...counts.values()].sort()).toEqual([1, 1, 2]);
    }
  });

  it('rhombus expands to 3 equal-side constraints + 3 riders + the drawn boundary', () => {
    const cmds = expandInscribe({ shape: 'rhombus', ids: ['B', 'D', 'E', 'F'], container: ['A', 'B', 'C'], variant: 0 });
    expect(cmds.filter((c) => c.type === 'point-on-segment')).toHaveLength(3);
    expect(cmds.filter((c) => c.type === 'set-equal')).toHaveLength(3);
    expect(cmds.filter((c) => c.type === 'set-perpendicular')).toHaveLength(0);
    // The boundary MUST be drawn (a `polygon` command), or the figure has no lines / no detectable shape /
    // no reportable equal sides — the exact bug the operator hit.
    const poly = cmds.find((c) => c.type === 'polygon') as { ids: string[] } | undefined;
    expect(poly, 'a polygon command draws the rhombus').toBeTruthy();
    expect(poly!.ids).toEqual(['B', 'D', 'E', 'F']);
  });

  it('rectangle expands to 3 right angles + 4 riders (1-DOF family)', () => {
    const cmds = expandInscribe({ shape: 'rectangle', ids: ['D', 'E', 'F', 'G'], container: ['A', 'B', 'C'], variant: 0 });
    expect(cmds.filter((c) => c.type === 'point-on-segment')).toHaveLength(4);
    expect(cmds.filter((c) => c.type === 'set-perpendicular')).toHaveLength(3);
  });

  it('square expands to 3 equal sides + 1 right angle', () => {
    const cmds = expandInscribe({ shape: 'square', ids: ['D', 'E', 'F', 'G'], container: ['A', 'B', 'C'], variant: 0 });
    expect(cmds.filter((c) => c.type === 'set-equal')).toHaveLength(3);
    expect(cmds.filter((c) => c.type === 'set-perpendicular')).toHaveLength(1);
  });

  it('explicit on-segment given pins the matching variant', () => {
    // Pin D onto AB — pick whichever variant agrees.
    const cmds = expandInscribe(
      { shape: 'rhombus', ids: ['B', 'D', 'E', 'F'], container: ['A', 'B', 'C'], variant: 0 },
      [{ id: 'D', a: 'A', b: 'B' }],
    );
    const dRider = cmds.find((c) => c.type === 'point-on-segment' && (c as any).id === 'D') as any;
    expect([dRider.a, dRider.b].sort().join('')).toBe('AB');
  });

  it('variant count is stable', () => {
    expect(inscribeVariantCount({ shape: 'rhombus', ids: ['B', 'D', 'E', 'F'], container: ['A', 'B', 'C'], variant: 0 })).toBe(2);
    expect(inscribeVariantCount({ shape: 'rectangle', ids: ['D', 'E', 'F', 'G'], container: ['A', 'B', 'C'], variant: 0 })).toBeGreaterThanOrEqual(3);
  });
});
