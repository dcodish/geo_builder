/**
 * Geometric invariant predicates for the validation campaign (not a test file).
 *
 * Validation is **property-based**: for each generated diagram we assert the
 * geometric facts that must hold for *any* valid drawing of it (a square has
 * four equal sides and right angles; an on-segment point is collinear and
 * between; |AB| = 6 holds) — not exact coordinates, which are placement- and
 * default-dependent. A failed predicate throws, so the harness reports it.
 */

import type { Id, Vec } from '../types';
import { cross, dist, sub } from '../geometry';

const dot = (u: Vec, v: Vec) => u.x * v.x + u.y * v.y;
const unit = (v: Vec): Vec => {
  const l = Math.hypot(v.x, v.y);
  return l < 1e-12 ? { x: 0, y: 0 } : { x: v.x / l, y: v.y / l };
};

// Tolerances: coordinates here stay within ±~40, and derived points are computed
// exactly while solved points converge to ~1e-10, so these are comfortably loose.
const LEN = 1e-4; // length / coordinate closeness
const COLL = 1e-4; // collinearity (signed area)
const UNIT = 1e-5; // unit-vector dot/cross (∥ / ⟂)

/** A bundle of invariant assertions over a computed positions map. */
export function inv(pos: Map<Id, Vec>) {
  const g = (id: Id): Vec => {
    const p = pos.get(id);
    if (!p) throw new Error(`invariant: point "${id}" was not computed`);
    if (!isFinite(p.x) || !isFinite(p.y)) throw new Error(`invariant: point "${id}" is non-finite`);
    return p;
  };
  const fail = (msg: string) => {
    throw new Error(`invariant failed: ${msg}`);
  };

  const api = {
    /** |ab| = value. */
    length(a: Id, b: Id, value: number) {
      const d = dist(g(a), g(b));
      if (Math.abs(d - value) > LEN) fail(`|${a}${b}| = ${d.toFixed(6)}, expected ${value}`);
      return api;
    },
    /** |ab| = |cd|. */
    equalLen(a: Id, b: Id, c: Id, d: Id) {
      const x = dist(g(a), g(b));
      const y = dist(g(c), g(d));
      if (Math.abs(x - y) > LEN) fail(`|${a}${b}| (${x.toFixed(6)}) ≠ |${c}${d}| (${y.toFixed(6)})`);
      return api;
    },
    /** a, b, c are collinear. */
    collinear(a: Id, b: Id, c: Id) {
      if (Math.abs(cross(g(a), g(b), g(c))) > COLL) fail(`${a}, ${b}, ${c} are not collinear`);
      return api;
    },
    /** c lies on segment ab, strictly between a and b. */
    between(a: Id, c: Id, b: Id) {
      api.collinear(a, c, b);
      const ac = dist(g(a), g(c));
      const cb = dist(g(c), g(b));
      const ab = dist(g(a), g(b));
      if (Math.abs(ac + cb - ab) > LEN) fail(`${c} is not between ${a} and ${b}`);
      if (ac < 1e-3 || cb < 1e-3) fail(`${c} coincides with an endpoint of ${a}${b}`);
      return api;
    },
    /** ab ⟂ cd. */
    perp(a: Id, b: Id, c: Id, d: Id) {
      const x = Math.abs(dot(unit(sub(g(b), g(a))), unit(sub(g(d), g(c)))));
      if (x > UNIT) fail(`${a}${b} not ⟂ ${c}${d} (cos = ${x.toExponential(2)})`);
      return api;
    },
    /** ab ∥ cd. */
    parallel(a: Id, b: Id, c: Id, d: Id) {
      const u = unit(sub(g(b), g(a)));
      const v = unit(sub(g(d), g(c)));
      const x = Math.abs(u.x * v.y - u.y * v.x);
      if (x > UNIT) fail(`${a}${b} not ∥ ${c}${d} (sin = ${x.toExponential(2)})`);
      return api;
    },
    /** Right angle at vertex v, between rays v→p and v→q. */
    rightAngle(v: Id, p: Id, q: Id) {
      return api.perp(v, p, v, q);
    },
    /** ∠(p–v–q) = value degrees. */
    angle(v: Id, p: Id, q: Id, value: number) {
      const u = sub(g(p), g(v));
      const w = sub(g(q), g(v));
      const c = Math.max(-1, Math.min(1, dot(u, w) / (Math.hypot(u.x, u.y) * Math.hypot(w.x, w.y))));
      const deg = (Math.acos(c) * 180) / Math.PI;
      if (Math.abs(deg - value) > 1e-2) fail(`∠${p}${v}${q} = ${deg.toFixed(3)}°, expected ${value}°`);
      return api;
    },
    /** ∠(p1–v1–q1) = ∠(p2–v2–q2). */
    equalAngle(v1: Id, p1: Id, q1: Id, v2: Id, p2: Id, q2: Id) {
      const ang = (v: Id, p: Id, q: Id) => {
        const u = sub(g(p), g(v));
        const w = sub(g(q), g(v));
        const c = Math.max(-1, Math.min(1, dot(u, w) / (Math.hypot(u.x, u.y) * Math.hypot(w.x, w.y))));
        return Math.acos(c);
      };
      const a = ang(v1, p1, q1);
      const b = ang(v2, p2, q2);
      if (Math.abs(a - b) > 1e-4) fail(`∠${p1}${v1}${q1} ≠ ∠${p2}${v2}${q2}`);
      return api;
    },
    /** point p is at distance r from centre. */
    onCircle(center: Id, r: number, p: Id) {
      const d = dist(g(center), g(p));
      if (Math.abs(d - r) > LEN) fail(`${p} is ${d.toFixed(6)} from ${center}, expected radius ${r}`);
      return api;
    },
    /** m is the midpoint of a, b. */
    midpoint(m: Id, a: Id, b: Id) {
      const A = g(a);
      const B = g(b);
      const M = g(m);
      if (Math.abs(M.x - (A.x + B.x) / 2) > LEN || Math.abs(M.y - (A.y + B.y) / 2) > LEN) {
        fail(`${m} is not the midpoint of ${a}${b}`);
      }
      return api;
    },
    /** No two of the given points coincide. */
    distinct(...ids: Id[]) {
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          if (dist(g(ids[i]), g(ids[j])) < 1e-3) fail(`${ids[i]} and ${ids[j]} coincide`);
        }
      }
      return api;
    },
    /** Raw access to a computed point. */
    get: g,
  };
  return api;
}

export type Inv = ReturnType<typeof inv>;
