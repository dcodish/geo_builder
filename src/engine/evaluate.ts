/**
 * evaluate: compute positions for every point by resolving the dependency
 * graph in topological order (a fixed-point sweep), then check constraints.
 * Returns positions, or an error (unresolvable deps, impossible construction,
 * non-finite coords, or a contradicted constraint = over-constraint, FR-EN-8).
 */

import type { Circle, Construction, GeoPoint, Id, Line, Vec } from './types';
import { LEN_EPS, isGeoPoint } from './types';
import {
  add,
  circleCircleIntersect,
  footOnLine,
  len,
  lineCircleIntersect,
  lineLineIntersect,
  rot90,
  rotate,
  scale,
  sub,
  unit,
} from './geometry';
import { constraintRefs, describeConstraint, residual, residualTolerance, solvedOnSegmentCandidates } from './solve';

/** A resolved line: a point on it (`anchor`) and a unit direction (`dir`). */
interface ResolvedLine {
  anchor: Vec;
  dir: Vec;
}

/** A resolved circle: its centre position and radius. */
interface ResolvedCircle {
  center: Vec;
  r: number;
}

export interface EvalOk {
  ok: true;
  positions: Map<Id, Vec>;
}
export interface EvalErr {
  ok: false;
  error: string;
  /** True when the failure is two distinct points sharing a location. */
  coincide?: boolean;
}
export type EvalResult = EvalOk | EvalErr;

export function evaluate(c: Construction): EvalResult {
  const pos = new Map<Id, Vec>();
  const lines = new Map<Id, ResolvedLine>();
  const circles = new Map<Id, ResolvedCircle>();
  const points = c.objects.filter(isGeoPoint);
  const lineObjs = c.objects.filter((o): o is Line => o.kind === 'line');
  const circleObjs = c.objects.filter((o): o is Circle => o.kind === 'circle');
  const remaining = new Set(points.map((p) => p.id));
  const remainingLines = new Set(lineObjs.map((l) => l.id));
  const remainingCircles = new Set(circleObjs.map((o) => o.id));

  // One fixed-point sweep resolves circles, lines, and points together: a circle
  // needs its centre point; a tangent line needs its circle; an on-circle /
  // line∩circle point needs its circle (and line). They interleave until nothing
  // new resolves.
  let progressed = true;
  while ((remaining.size > 0 || remainingLines.size > 0 || remainingCircles.size > 0) && progressed) {
    progressed = false;
    for (const o of circleObjs) {
      if (!remainingCircles.has(o.id)) continue;
      const r = resolveCircle(o, pos);
      if (r === 'pending') continue;
      if (typeof r === 'string') return { ok: false, error: r };
      circles.set(o.id, r);
      remainingCircles.delete(o.id);
      progressed = true;
    }
    for (const l of lineObjs) {
      if (!remainingLines.has(l.id)) continue;
      const r = resolveLine(l, pos, circles);
      if (r === 'pending') continue;
      if (typeof r === 'string') return { ok: false, error: r };
      lines.set(l.id, r);
      remainingLines.delete(l.id);
      progressed = true;
    }
    for (const p of points) {
      if (!remaining.has(p.id)) continue;
      const r = tryEval(p, pos, lines, circles);
      if (r === 'pending') continue;
      if (typeof r === 'string') return { ok: false, error: r };
      pos.set(p.id, r);
      remaining.delete(p.id);
      progressed = true;
    }
  }
  if (remaining.size > 0 || remainingLines.size > 0 || remainingCircles.size > 0) {
    const stuck = [...remaining, ...remainingLines, ...remainingCircles];
    return { ok: false, error: `unresolved dependencies for: ${stuck.join(', ')}` };
  }

  for (const v of pos.values()) {
    if (!isFinite(v.x) || !isFinite(v.y)) return { ok: false, error: 'non-finite position computed' };
  }

  // No two distinct points may share a location — that is a degenerate figure
  // (two labels on one spot). Flagged so the step can try to reposition, or fail.
  const placed = [...pos.entries()];
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const [idA, a] = placed[i];
      const [idB, b] = placed[j];
      if (Math.hypot(a.x - b.x, a.y - b.y) < LEN_EPS) {
        return { ok: false, error: `${idA} and ${idB} would be at the same point`, coincide: true };
      }
    }
  }

  for (const con of c.constraints) {
    for (const id of constraintRefs(con)) {
      if (!pos.get(id)) return { ok: false, error: `${describeConstraint(con)} references an unknown point` };
    }
    if (Math.abs(residual(con, (id) => pos.get(id)!)) > residualTolerance(con)) {
      return { ok: false, error: `over-constrained: ${describeConstraint(con)} cannot hold` };
    }
  }

  return { ok: true, positions: pos };
}

/** Resolve one circle to its centre and radius: a {@link ResolvedCircle}, 'pending', or an error string. */
function resolveCircle(c: Circle, pos: Map<Id, Vec>): ResolvedCircle | 'pending' | string {
  const center = pos.get(c.center);
  if (!center) return 'pending';
  if (c.radius.via === 'length') {
    if (c.radius.value <= 0) return `circle ${c.id}: radius must be positive`;
    return { center, r: c.radius.value };
  }
  const p = pos.get(c.radius.point);
  if (!p) return 'pending';
  const r = len(sub(p, center));
  if (r < 1e-9) return `circle ${c.id}: the point on it coincides with the centre`;
  return { center, r };
}

/** Resolve one line to an (anchor, dir): a {@link ResolvedLine}, 'pending', or an error string. */
function resolveLine(l: Line, pos: Map<Id, Vec>, circles: Map<Id, ResolvedCircle>): ResolvedLine | 'pending' | string {
  const s = l.spec;
  switch (s.via) {
    case 'through': {
      const a = pos.get(s.a);
      const b = pos.get(s.b);
      if (!a || !b) return 'pending';
      const dir = sub(b, a);
      if (len(dir) < 1e-9) return `cannot build line ${l.id}: ${s.a} and ${s.b} coincide`;
      return { anchor: a, dir: unit(dir) };
    }
    case 'bisector': {
      const v = pos.get(s.vertex);
      const p = pos.get(s.p);
      const q = pos.get(s.q);
      if (!v || !p || !q) return 'pending';
      const u1 = unit(sub(p, v));
      const u2 = unit(sub(q, v));
      const bis = add(u1, u2); // the internal-bisector direction
      if (len(bis) < 1e-9) return `cannot bisect ∠${s.p}${s.vertex}${s.q}: the rays are opposite`;
      return { anchor: v, dir: unit(bis) };
    }
    case 'perpendicular':
    case 'parallel': {
      const t = pos.get(s.through);
      const a = pos.get(s.a);
      const b = pos.get(s.b);
      if (!t || !a || !b) return 'pending';
      const base = sub(b, a);
      if (len(base) < 1e-9) return `cannot build line ${l.id}: ${s.a} and ${s.b} coincide`;
      const dir = unit(base);
      return { anchor: t, dir: s.via === 'perpendicular' ? rot90(dir) : dir };
    }
    case 'tangent': {
      const c = circles.get(s.circle);
      const at = pos.get(s.at);
      if (!c || !at) return 'pending';
      const radial = sub(at, c.center);
      if (len(radial) < 1e-9) return `cannot take a tangent at the centre of ${s.circle}`;
      return { anchor: at, dir: unit(rot90(radial)) }; // ⟂ to the radius at `at`
    }
  }
}

/** Resolve one point: a Vec, 'pending' (deps not ready yet), or an error string. */
function tryEval(
  p: GeoPoint,
  pos: Map<Id, Vec>,
  lines: Map<Id, ResolvedLine>,
  circles: Map<Id, ResolvedCircle>,
): Vec | 'pending' | string {
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
      const perp = scale(rot90(sub(b, a)), p.flip ? -1 : 1); // ±R90(B − A)
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
      return add(anchor, scale(unit(rot90(sub(to, from))), p.flip ? -p.dist : p.dist)); // anchor ± n̂·dist
    }

    case 'rotated': {
      const pivot = pos.get(p.pivot);
      const from = pos.get(p.from);
      const to = pos.get(p.to);
      if (!pivot || !from || !to) return 'pending';
      return add(pivot, scale(rotate(sub(to, from), p.flip ? -p.angleDeg : p.angleDeg), p.scale)); // pivot + s·Rot(±θ)(to−from)
    }

    case 'scaled-offset': {
      const anchor = pos.get(p.anchor);
      const from = pos.get(p.from);
      const to = pos.get(p.to);
      if (!anchor || !from || !to) return 'pending';
      return add(anchor, scale(sub(to, from), p.k)); // anchor + k·(to−from)
    }

    case 'on-segment-solved': {
      const ts = solvedOnSegmentCandidates(p, pos);
      if (ts === 'pending') return 'pending';
      if (ts.length === 0) {
        return `cannot place ${p.id} on segment ${p.a}${p.b} so that ${describeConstraint(p.constraint)}`;
      }
      const t = ts[p.branch % ts.length];
      const a = pos.get(p.a)!;
      const b = pos.get(p.b)!;
      return add(a, scale(sub(b, a), t));
    }

    case 'line-intersection': {
      const l1 = lines.get(p.line1);
      const l2 = lines.get(p.line2);
      if (!l1 || !l2) return 'pending';
      const hit = lineLineIntersect(l1.anchor, add(l1.anchor, l1.dir), l2.anchor, add(l2.anchor, l2.dir));
      if (!hit) return `cannot construct ${p.id}: lines ${p.line1} and ${p.line2} are parallel`;
      return hit;
    }

    case 'foot': {
      const from = pos.get(p.from);
      const a = pos.get(p.a);
      const b = pos.get(p.b);
      if (!from || !a || !b) return 'pending';
      if (len(sub(b, a)) < 1e-9) return `cannot drop a perpendicular to ${p.a}${p.b}: they coincide`;
      return footOnLine(from, a, b);
    }

    case 'midpoint': {
      const a = pos.get(p.a);
      const b = pos.get(p.b);
      if (!a || !b) return 'pending';
      return scale(add(a, b), 0.5);
    }

    case 'on-circle': {
      const c = circles.get(p.circle);
      if (!c) return 'pending';
      return add(c.center, { x: c.r * Math.cos(p.theta), y: c.r * Math.sin(p.theta) });
    }

    case 'antipode': {
      const c = circles.get(p.circle);
      const of = pos.get(p.of);
      if (!c || !of) return 'pending';
      return sub(scale(c.center, 2), of); // 2·centre − of
    }

    case 'arc-midpoint': {
      const c = circles.get(p.circle);
      const from = pos.get(p.from);
      const to = pos.get(p.to);
      if (!c || !from || !to) return 'pending';
      const u1 = unit(sub(from, c.center));
      const u2 = unit(sub(to, c.center));
      let bis = add(u1, u2); // points to the midpoint of the arc between from→to
      if (len(bis) < 1e-9) bis = rot90(u1); // from/to antipodal → arc midpoint is perpendicular
      const dir = unit(bis);
      const sign = p.branch % 2 === 1 ? -1 : 1; // the other arc's midpoint is antipodal
      return add(c.center, scale(dir, sign * c.r));
    }

    case 'line-circle': {
      const l = lines.get(p.line);
      const c = circles.get(p.circle);
      if (!l || !c) return 'pending';
      const sols = lineCircleIntersect(l.anchor, l.dir, c.center, c.r);
      if (sols.length === 0) return `cannot construct ${p.id}: line ${p.line} does not meet circle ${p.circle}`;
      return sols[p.branch % sols.length];
    }
  }
}
