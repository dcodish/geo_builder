/**
 * #1714 (ADR-AG-225) — the planar mark kit (`shell/marks.ts`) and the meta-lock that proves its checks bite
 * (docs/28 §5c, point 5): the same `markKitFaults` run against deliberately broken kits must catch each one.
 */
import { describe, expect, it } from 'vitest';
import { angleArcPoints, equalTickSegments, markFitScale, rightAngleKnee, wedgeBisector, type MarkPt } from '../marks';
import { markKitFaults, markKitSuite, type MarkKit } from './fixtures/mark-geometry-rows';

const REAL: MarkKit = { knee: rightAngleKnee, arc: (v, p1, p2, r) => angleArcPoints(v, p1, p2, r), ticks: equalTickSegments };

markKitSuite('shell/marks', REAL);

describe('#1714 — the checks bite (meta-lock)', () => {
  const broken: Array<[string, MarkKit]> = [
    // the far corner of the square dropped onto the vertex
    ['a knee with no far corner', { ...REAL, knee: (v, p1, p2, s) => { const k = rightAngleKnee(v, p1, p2, s); return [k[0], v, k[2]]; } }],
    // one leg twice the other
    ['a lopsided knee', { ...REAL, knee: (v, p1, p2, s) => { const k = rightAngleKnee(v, p1, p2, s); const k2 = rightAngleKnee(v, p1, p2, 2 * s); return [k[0], { x: k[0].x + k2[2].x - v.x, y: k[0].y + k2[2].y - v.y }, k2[2]]; } }],
    // the LONG way round — the reflex complement of the interior angle
    ['an arc the long way round', { ...REAL, arc: (v, p1, p2, r) => {
      const a1 = Math.atan2(p1.y - v.y, p1.x - v.x);
      let d = Math.atan2(p2.y - v.y, p2.x - v.x) - a1;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      const long = d > 0 ? d - 2 * Math.PI : d + 2 * Math.PI;
      return Array.from({ length: 15 }, (_, k) => ({ x: v.x + r * Math.cos(a1 + (long * k) / 14), y: v.y + r * Math.sin(a1 + (long * k) / 14) }));
    } }],
    // ticks drawn ALONG the segment instead of across it
    ['ticks along the segment', { ...REAL, ticks: (a, b, count, half, spacing) => equalTickSegments(a, b, count, half, spacing).map(([p, q]): [MarkPt, MarkPt] => {
      const mx = (p.x + q.x) / 2;
      const my = (p.y + q.y) / 2;
      const L = Math.hypot(b.x - a.x, b.y - a.y);
      const ux = ((b.x - a.x) / L) * half;
      const uy = ((b.y - a.y) / L) * half;
      return [{ x: mx - ux, y: my - uy }, { x: mx + ux, y: my + uy }];
    }) }],
    // one tick missing
    ['a tick short', { ...REAL, ticks: (a, b, count, half, spacing) => equalTickSegments(a, b, count, half, spacing).slice(1) }],
  ];
  for (const [name, kit] of broken) {
    it(`catches ${name}`, () => {
      expect(markKitFaults(kit).length, name).toBeGreaterThan(0);
    });
  }
});

describe('#1714 — the fit rule and the bisector', () => {
  it('a mark keeps full size with room, shrinks into a small corner, never to zero', () => {
    expect(markFitScale(1000, 18)).toBe(1);
    expect(markFitScale(18 / 0.35 / 2, 18)).toBeCloseTo(0.5, 9);
    expect(markFitScale(0.0001, 18)).toBeGreaterThan(0);
    expect(markFitScale(Number.NaN, 18)).toBe(1);
  });

  it('the bisector points into the angle; a straight angle answers the perpendicular', () => {
    const u = wedgeBisector({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 });
    expect(u.x).toBeCloseTo(Math.SQRT1_2, 9);
    expect(u.y).toBeCloseTo(Math.SQRT1_2, 9);
    const s = wedgeBisector({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: -1, y: 0 });
    expect(Math.abs(s.x)).toBeLessThan(1e-9);
    expect(Math.abs(s.y)).toBeCloseTo(1, 9);
  });
});
