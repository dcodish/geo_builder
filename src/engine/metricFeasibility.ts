/**
 * METRIC FEASIBILITY (#420, ADR-417) — a SOUND necessary condition for a system of pinned distances.
 *
 * Every point of a figure lives in the plane, so the pinned distances between them must obey the metric
 * triangle inequality: for any path u → … → v built from pinned distances, a pinned |uv| can never exceed
 * the sum along that path. If it does, NO configuration satisfies the system — not for any placement, any
 * free radius, any remaining DOF.
 *
 * Why this exists as its own check. The failure path used to answer "can this constraint still become
 * satisfiable?" with the proxy "does its residual MOVE across a few seeds?" (`constraintIsPending`). On
 * «AB = 4, BC = 4, AC = 9» the residual does move — the free radius and placement change |AC| — so the
 * contradiction was reported as a PENDING info state («הנתון נרשם אך לא משפיע בינתיים»), after 28 s of
 * ladder work, while |AC| ≤ |AB| + |BC| = 8 caps it away from 9 forever.
 *
 * Soundness is the whole point, in one direction only:
 *  - a violation PROVES impossibility ⇒ refuse honestly, and refuse instantly (docs/17 §7: the failure
 *    path must be cheaper than the success path);
 *  - passing proves NOTHING — the ordinary ladder still runs. So this can never turn a buildable figure
 *    into a refusal.
 *
 * General over n, deliberately not a triangle rule: the check is "a pinned edge longer than the shortest
 * pinned PATH between its endpoints", so a quadrilateral with four pinned sides, or any cycle in the
 * pinned-distance graph, is covered by the same code. Equality is allowed (a flat, collinear figure is a
 * real configuration; a degenerate POLYGON is ADR-413's concern, not this one) — only a strict excess
 * beyond a relative tolerance is impossible.
 */

import type { Constraint, GeoObject, Id } from './types';

export interface MetricImpossibility {
  /** the two endpoints of the pinned edge that cannot be that long */
  a: Id;
  b: Id;
  /** its stated length */
  value: number;
  /** the shortest pinned path length between a and b that does NOT use the edge itself */
  sum: number;
  /** the intermediate points of that path, in order (a and b excluded) — what to name in the message */
  via: Id[];
}

/** Relative slack, so floating-point equality (the flat/collinear case) is never called impossible. */
const TOL = 1e-9;

/**
 * The pinned-distance graph's first metric contradiction, or null when there is none.
 *
 * Only `distance` constraints (a numeric |ab| = value) are read. An `equal`/`ratio` chain could propagate
 * more pinned lengths, but every edge admitted must be certainly pinned for the verdict to stay sound, so
 * widening the source set is a separate, evidence-led step.
 */
export function metricImpossibility(constraints: Constraint[]): MetricImpossibility | null {
  /** endpoint pair → the pinned length (the tightest one, if a figure states the same edge twice) */
  const edges = new Map<string, { a: Id; b: Id; len: number }>();
  const key = (a: Id, b: Id) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  for (const con of constraints) {
    if (con.type !== 'distance' || !Number.isFinite(con.value) || con.value <= 0) continue;
    if (con.a === con.b) continue;
    const k = key(con.a, con.b);
    const prev = edges.get(k);
    // A second, SMALLER pinned value for one edge is itself a contradiction, but not this check's
    // business (the ordinary solver reports it); keep the smaller so the path bound stays valid.
    if (!prev || con.value < prev.len) edges.set(k, { a: con.a, b: con.b, len: con.value });
  }
  if (edges.size < 3) return null; // a cycle needs at least three pinned edges

  const adj = new Map<Id, { to: Id; len: number; k: string }[]>();
  for (const [k, e] of edges) {
    if (!adj.has(e.a)) adj.set(e.a, []);
    if (!adj.has(e.b)) adj.set(e.b, []);
    adj.get(e.a)!.push({ to: e.b, len: e.len, k });
    adj.get(e.b)!.push({ to: e.a, len: e.len, k });
  }

  // For each pinned edge, the shortest path between its endpoints through the OTHER pinned edges
  // (Dijkstra, tiny graphs). Polynomial and complete over cycles — no cycle enumeration needed.
  for (const [k, e] of edges) {
    const dist = new Map<Id, number>([[e.a, 0]]);
    const prevOf = new Map<Id, Id>();
    const seen = new Set<Id>();
    for (;;) {
      let cur: Id | null = null;
      let best = Infinity;
      for (const [id, d] of dist) if (!seen.has(id) && d < best) { best = d; cur = id; }
      if (cur === null) break;
      seen.add(cur);
      if (cur === e.b) break;
      for (const nb of adj.get(cur) ?? []) {
        if (nb.k === k) continue; // the edge under test may not justify itself
        const nd = best + nb.len;
        if (nd < (dist.get(nb.to) ?? Infinity)) { dist.set(nb.to, nd); prevOf.set(nb.to, cur); }
      }
    }
    const around = dist.get(e.b);
    if (around === undefined || !Number.isFinite(around)) continue; // no alternative path — nothing to bound it
    if (e.len > around * (1 + TOL) + TOL) {
      const via: Id[] = [];
      for (let at = prevOf.get(e.b); at !== undefined && at !== e.a; at = prevOf.get(at)) via.unshift(at);
      return { a: e.a, b: e.b, value: e.len, sum: around, via };
    }
  }
  return null;
}

/**
 * The engine-side English diagnostic; `humanizeError` maps it to the student's language (#413/ADR-416).
 * The intermediates are COMMA-separated so the humaniser can tell the triangle case (exactly one) from a
 * longer cycle and pick the wording the curriculum uses for each.
 */
export function metricImpossibilityError(m: MetricImpossibility): string {
  return `impossible: |${m.a}${m.b}| = ${m.value} exceeds ${m.sum}, the distance from ${m.a} to ${m.b} via ${m.via.join(', ')}`;
}

/**
 * ANGLE-SUM FEASIBILITY (#1329, ADR-538) — the angle twin of the metric check above.
 *
 * A polygon's interior angles sum to (n − 2)·180°, so the stated interior angles of one declared polygon
 * can never sum past that. If they do, NO configuration satisfies the system — not for any placement,
 * any free radius, any remaining DOF. «∠ABC = 100» · «∠ACB = 100» on «משולש ABC» is the reported
 * member: the solver finds nothing (the apex would have to be negative), the step fails, and the fold's
 * classifier filed the failure as PENDING — "add the remaining givens" — because the figure still had
 * freedom and the flex probe saw the residual move. ADR-537 did not take it: its gate fires when a
 * solution EXISTS and is not a figure; here none exists at all.
 *
 * The same one-way soundness as the metric check: a strict excess PROVES impossibility and is refused
 * instantly, before the ladder; passing proves nothing and the ordinary ladder still runs. Equality is
 * allowed — the remaining angles at zero is a FLAT polygon, which is ADR-413/ADR-513's concern, exactly
 * the metric prover's equality rule. Only INTERIOR angles are read: the angle at vertex v between v's two
 * polygon neighbours, in either ray order. «∠ABD» on ABCD is a diagonal's angle and says nothing about
 * the sum; an ARC measure (`arcOf`) sits at a centre and is not a polygon angle. Where one vertex has
 * several stated values the smallest is taken, so the verdict stays sound (two different values for one
 * angle is a contradiction the ordinary solver reports).
 *
 * Not a triangle rule: any declared ring is bounded by its own (n − 2)·180°, so a quadrilateral with
 * four stated angles past 360° is covered by the same code. A single reflex angle in a quadrilateral
 * («∠ABC = 200» on ABCD) is NOT refused — a non-convex quadrilateral is a real figure.
 */
export interface AngleSumImpossibility {
  /** the polygon, as its vertex run */
  polygon: Id[];
  /** the stated interior angles that were summed, in polygon order, as the student wrote them */
  angles: { vertex: Id; ray1: Id; ray2: Id; value: number }[];
  /** their sum, in degrees */
  sum: number;
  /** (n − 2)·180 */
  bound: number;
}

export function angleSumImpossibility(
  objects: readonly GeoObject[],
  constraints: readonly Constraint[],
): AngleSumImpossibility | null {
  for (const o of objects) {
    if (o.kind !== 'polygon' || o.vertices.length < 3) continue;
    const n = o.vertices.length;
    const bound = (n - 2) * 180;
    const angles: AngleSumImpossibility['angles'] = [];
    for (let i = 0; i < n; i++) {
      const v = o.vertices[i]!;
      const prev = o.vertices[(i + n - 1) % n]!;
      const next = o.vertices[(i + 1) % n]!;
      let stated: AngleSumImpossibility['angles'][number] | null = null;
      for (const c of constraints) {
        if (c.type !== 'angle' || c.arcOf || c.vertex !== v || !Number.isFinite(c.value)) continue;
        const interior = (c.ray1 === prev && c.ray2 === next) || (c.ray1 === next && c.ray2 === prev);
        if (!interior) continue;
        if (!stated || c.value < stated.value) stated = { vertex: v, ray1: c.ray1, ray2: c.ray2, value: c.value };
      }
      if (stated) angles.push(stated);
    }
    if (!angles.length) continue;
    const sum = angles.reduce((s, a) => s + a.value, 0);
    if (sum > bound * (1 + TOL) + TOL) return { polygon: [...o.vertices], angles, sum, bound };
  }
  return null;
}

/**
 * The engine-side English diagnostic; `humanizeError` maps it to the student's language. The bound is
 * printed so the humaniser can tell the triangle case (180°, the curriculum's own sentence) from a
 * longer ring, exactly as the metric message's comma does.
 */
export function angleSumImpossibilityError(m: AngleSumImpossibility): string {
  const deg = (v: number) => `${Number(v.toFixed(2))}°`;
  const list = m.angles.map((a) => `∠${a.ray1}${a.vertex}${a.ray2} = ${deg(a.value)}`).join(', ');
  return `impossible: the angles of ${m.polygon.join('')} sum to ${deg(m.sum)}, exceeding ${deg(m.bound)}: ${list}`;
}
