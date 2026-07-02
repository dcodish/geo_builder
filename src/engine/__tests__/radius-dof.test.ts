/**
 * Free circle radius as a solver DOF (ADR-051).
 *
 * "two circles intersect at A and B" states no radius, so freezing them at 5 / 3.6 can't hold an
 * arbitrary problem's givens. The radii are now free DOFs: the solver sizes them to satisfy a
 * constraint (and the renderer draws the driven size), while a STATED radius ("circle O radius 5")
 * stays fixed.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '@/parser';
import { build, evaluate } from '@/engine';
import { buildScene } from '@/render/scene';
import { useGeoStore, replay, pointsDistinct } from '@/store/geoStore';
import type { AnyCommand, Circle, Construction, Id, Vec } from '@/engine';

const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

/** The two-circles figure (radii free, seeded 5 / 3.6), plus a point C on circle O. */
const twoCircles = (): AnyCommand[] => [
  { type: 'circle', id: 'circle-O', center: 'O', radius: 5, freeRadius: true, autoCenter: true },
  { type: 'circle', id: 'circle-P', center: 'P', radius: 3.6, freeRadius: true, autoCenter: true },
  { type: 'circle-circle-intersection', id: 'A', circle1: 'circle-O', circle2: 'circle-P', branch: 0 },
  { type: 'circle-circle-intersection', id: 'B', circle1: 'circle-O', circle2: 'circle-P', branch: 1 },
  { type: 'point-on-circle', id: 'C', circle: 'circle-O' },
];

describe('parser — "two circles intersect" gives FREE radii', () => {
  it('emits freeRadius on both circles (no stated size)', () => {
    const r = parse('two circles intersect at A and B');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const circles = r.commands.filter((c): c is Extract<AnyCommand, { type: 'circle' }> => c.type === 'circle');
    expect(circles).toHaveLength(2);
    expect(circles.every((c) => c.freeRadius === true)).toBe(true);
  });

  it('a STATED radius stays fixed (not free)', () => {
    const r = parse('circle O radius 5');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const circle = r.commands.find((c): c is Extract<AnyCommand, { type: 'circle' }> => c.type === 'circle');
    expect(circle?.freeRadius).toBeFalsy();
  });
});

describe('engine — a free radius flexes to a constraint', () => {
  it('|OC| = 9 sizes circle O (a point on it is 9 from the centre)', () => {
    const { positions } = build([...twoCircles(), { type: 'set-distance', a: 'O', b: 'C', value: 9 }]);
    expect(dist(positions.get('O')!, positions.get('C')!)).toBeCloseTo(9, 3); // |OC| = radius(O)
    // A,B (on circle O) are now 9 from O too — the whole circle grew, not just C.
    expect(dist(positions.get('O')!, positions.get('A')!)).toBeCloseTo(9, 3);
  });

  it('an unconstrained free radius keeps its seed (figure looks the same until something sizes it)', () => {
    const { positions } = build(twoCircles());
    expect(dist(positions.get('O')!, positions.get('C')!)).toBeCloseTo(5, 3); // seed 5
    expect(dist(positions.get('O')!, positions.get('A')!)).toBeCloseTo(5, 3);
  });

  it('the RENDERER draws the driven radius, not the stored seed', () => {
    const { construction, positions } = build([...twoCircles(), { type: 'set-distance', a: 'O', b: 'C', value: 9 }]);
    // Since ADR-200/D2 the renderer draws the radius `evaluate` PUBLISHES (no reconstruction from a point).
    const ev = evaluate(construction);
    if (!ev.ok) throw new Error(ev.error);
    const scene = buildScene(construction, positions, undefined, undefined, { circles: ev.circles });
    const circO = scene.circles.find((x: { id: Id }) => x.id === 'circle-O');
    expect(circO?.r).toBeCloseTo(9, 3); // the drawn circle matches its points
  });
});

describe('store — "show another configuration" varies the radii (and can flip which is bigger)', () => {
  const radiusOf = (fig: { construction: Construction }, center: Id) => {
    const circ = fig.construction.objects.find((o) => o.kind === 'circle' && o.center === center) as Circle;
    return 'value' in circ.radius ? circ.radius.value : NaN;
  };

  it('resampling produces differently-sized circles, every view clean (no collapsed points)', () => {
    const st = useGeoStore.getState();
    st.clear();
    for (const u of ['two circles intersect at A and B', 'C על מעגל O', 'D על מעגל P']) {
      const r = parse(u);
      expect(r.ok, u).toBe(true);
      if (!r.ok) return;
      for (const cmd of r.commands) st.execute(cmd, u);
    }
    const seen = new Set<number>();
    let pBigger = 0;
    for (let press = 0; press <= 12; press++) {
      if (press > 0) st.resample();
      const fig = replay(useGeoStore.getState().facts, useGeoStore.getState().seed);
      expect(evaluate(fig.construction).ok, `view ${press} evaluates`).toBe(true);
      expect(pointsDistinct(fig.construction, fig.positions), `view ${press} keeps points apart`).toBe(true);
      const rO = radiusOf(fig, 'O');
      const rP = radiusOf(fig, 'P');
      seen.add(Math.round(rO * 10));
      if (rP > rO) pBigger++;
    }
    expect(seen.size, 'radii actually vary across views').toBeGreaterThan(3);
    expect(pBigger, 'some view has circle P larger than circle O').toBeGreaterThan(0);
    st.clear();
  });

  it('replay PUBLISHES the solver-driven radius in `circles` (the D2 contract the renderer consumes)', () => {
    // ADR-200/D2: `replay` carries `evaluate`'s resolved circles so the renderer reads a solved free radius
    // instead of reconstructing it. The construction object still holds the SEED (5) for a solver-driven
    // radius, so `circles` is the only place the true value is published.
    const st = useGeoStore.getState();
    st.clear();
    for (const u of ['two circles intersect at A and B', 'C על מעגל O', 'OC = 9']) {
      const r = parse(u);
      expect(r.ok, u).toBe(true);
      if (!r.ok) return;
      for (const cmd of r.commands) st.execute(cmd, u);
    }
    const fig = replay(useGeoStore.getState().facts, useGeoStore.getState().seed);
    expect(fig.circles.get('circle-O')?.r).toBeCloseTo(9, 3); // published solved radius, not the seed 5
    const objRadius = (fig.construction.objects.find((o) => o.id === 'circle-O') as Circle).radius;
    expect('value' in objRadius ? objRadius.value : NaN).toBeCloseTo(5, 3); // object keeps the seed
    st.clear();
  });
});
