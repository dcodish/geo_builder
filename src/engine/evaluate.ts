/**
 * evaluate: compute positions for every point by resolving the dependency
 * graph in topological order (a fixed-point sweep), then check constraints.
 * Returns positions, or an error (unresolvable deps, impossible construction,
 * non-finite coords, or a contradicted constraint = over-constraint, FR-EN-8).
 */

import type { Construction, GeoPoint, Id, Vec } from './types';
import { ANGLE_EPS, isGeoPoint } from './types';
import { add, angleDeg, circleCircleIntersect, lineLineIntersect, rot90, rotate, scale, sub, unit } from './geometry';

export interface EvalOk {
  ok: true;
  positions: Map<Id, Vec>;
}
export interface EvalErr {
  ok: false;
  error: string;
}
export type EvalResult = EvalOk | EvalErr;

export function evaluate(c: Construction): EvalResult {
  const pos = new Map<Id, Vec>();
  const points = c.objects.filter(isGeoPoint);
  const remaining = new Set(points.map((p) => p.id));

  let progressed = true;
  while (remaining.size > 0 && progressed) {
    progressed = false;
    for (const p of points) {
      if (!remaining.has(p.id)) continue;
      const r = tryEval(p, pos);
      if (r === 'pending') continue;
      if (typeof r === 'string') return { ok: false, error: r };
      pos.set(p.id, r);
      remaining.delete(p.id);
      progressed = true;
    }
  }
  if (remaining.size > 0) {
    return { ok: false, error: `unresolved dependencies for: ${[...remaining].join(', ')}` };
  }

  for (const v of pos.values()) {
    if (!isFinite(v.x) || !isFinite(v.y)) return { ok: false, error: 'non-finite position computed' };
  }

  for (const con of c.constraints) {
    const pv = pos.get(con.vertex);
    const p1 = pos.get(con.ray1);
    const p2 = pos.get(con.ray2);
    if (!pv || !p1 || !p2) {
      return { ok: false, error: `angle constraint references an unknown point` };
    }
    const measured = angleDeg(pv, p1, p2);
    if (Math.abs(measured - con.value) > ANGLE_EPS) {
      return {
        ok: false,
        error: `over-constrained: angle ${con.ray1}${con.vertex}${con.ray2} is ${measured.toFixed(1)}°, but was set to ${con.value}°`,
      };
    }
  }

  return { ok: true, positions: pos };
}

/** Resolve one point: a Vec, 'pending' (deps not ready yet), or an error string. */
function tryEval(p: GeoPoint, pos: Map<Id, Vec>): Vec | 'pending' | string {
  switch (p.kind) {
    case 'free-point':
      return { x: p.x, y: p.y };

    case 'on-segment': {
      const a = pos.get(p.a);
      const b = pos.get(p.b);
      if (!a || !b) return 'pending';
      return add(a, scale(sub(b, a), p.t));
    }

    case 'derived': {
      const a = pos.get(p.a);
      const b = pos.get(p.b);
      if (!a || !b) return 'pending';
      const perp = rot90(sub(b, a)); // R90(B − A)
      return p.rule === 'square-c' ? add(b, perp) : add(a, perp);
    }

    case 'intersection': {
      const c1 = pos.get(p.center1);
      const c2 = pos.get(p.center2);
      if (!c1 || !c2) return 'pending';
      const sols = circleCircleIntersect(c1, p.radius1, c2, p.radius2);
      if (sols.length === 0) {
        return `cannot construct ${p.id}: the two distance circles do not intersect`;
      }
      return sols[p.branch % sols.length];
    }

    case 'parallelogram-vertex': {
      const a = pos.get(p.a);
      const b = pos.get(p.b);
      const c = pos.get(p.c);
      if (!a || !b || !c) return 'pending';
      return { x: a.x + c.x - b.x, y: a.y + c.y - b.y }; // a + c − b
    }

    case 'line-line-intersection': {
      const a = pos.get(p.a);
      const b = pos.get(p.b);
      const c = pos.get(p.c);
      const d = pos.get(p.d);
      if (!a || !b || !c || !d) return 'pending';
      const hit = lineLineIntersect(a, b, c, d);
      if (!hit) return `cannot construct ${p.id}: lines ${p.a}${p.b} and ${p.c}${p.d} are parallel`;
      return hit;
    }

    case 'perp-offset': {
      const anchor = pos.get(p.anchor);
      const from = pos.get(p.from);
      const to = pos.get(p.to);
      if (!anchor || !from || !to) return 'pending';
      return add(anchor, scale(unit(rot90(sub(to, from))), p.dist)); // anchor + n̂·dist
    }

    case 'rotated': {
      const pivot = pos.get(p.pivot);
      const from = pos.get(p.from);
      const to = pos.get(p.to);
      if (!pivot || !from || !to) return 'pending';
      return add(pivot, scale(rotate(sub(to, from), p.angleDeg), p.scale)); // pivot + s·Rot(θ)(to−from)
    }

    case 'scaled-offset': {
      const anchor = pos.get(p.anchor);
      const from = pos.get(p.from);
      const to = pos.get(p.to);
      if (!anchor || !from || !to) return 'pending';
      return add(anchor, scale(sub(to, from), p.k)); // anchor + k·(to−from)
    }
  }
}
