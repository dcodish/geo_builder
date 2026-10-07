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
import { describeConstraint } from './solve';

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

/**
 * A BOUND AND A PINNED VALUE OF THE SAME MEASURE THAT EXCLUDE EACH OTHER (#1335, ADR-540).
 *
 * The third prover beside ADR-417's metric one and ADR-538's angle-sum one, and the same one-way
 * soundness: a violation PROVES impossibility, passing proves nothing.
 *
 * «משולש ABC» · «BC > 10» · «BC = 4» read as PENDING — «add the remaining givens» — for a pair of
 * statements no later given can reconcile. `constraintIsPending` asks whether the residual MOVES
 * across seeds, and on a free triangle it does; that is not whether it can reach zero. |BC| = 4 and
 * |BC| > 10 exclude each other in every configuration, and nothing about the rest of the figure can
 * change that — which is exactly what makes it provable here, before the ladder runs.
 *
 * Both operands are STATED: a bound is only ever a student's sentence, and a `distance`/`angle`
 * constraint is a magnitude they gave (ADR-052 — the tool states no magnitude of its own). So a
 * violation is a contradiction between two things the student said, and the message can name both.
 *
 * STRICTNESS IS RESPECTED (#1265, ADR-529). `minStrict` absent means STRICT, which is what every
 * figure written before that field meant. «BC ≥ 10» · «BC = 10» is a figure and must keep building;
 * «BC > 10» · «BC = 10» is not.
 */
export interface BoundImpossibility {
  /** the measure, as the student refers to it — `|BC|` or `∠ABC` */
  subject: string;
  /** the pinned value, already carrying its unit */
  value: string;
  /** the bound, written the way a student writes it — `|BC| > 10`, `10 < ∠ABC < 20` */
  bound: string;
}

/** Degrees and lengths print differently; everything else about the two members is identical. */
const numText = (n: number): string => String(+n.toFixed(6));

function boundText(subject: string, unit: string, c: { min?: number; max?: number; minStrict?: boolean; maxStrict?: boolean }): string {
  // Absent ⇒ strict (ADR-529): the comparison words the parser reads are strict, and so was every
  // bound saved before the field existed.
  const lo = c.minStrict === false ? '≥' : '>';
  const hi = c.maxStrict === false ? '≤' : '<';
  if (c.min !== undefined && c.max !== undefined) {
    return `${numText(c.min)}${unit} ${lo === '>' ? '<' : '≤'} ${subject} ${hi} ${numText(c.max)}${unit}`;
  }
  if (c.min !== undefined) return `${subject} ${lo} ${numText(c.min)}${unit}`;
  return `${subject} ${hi} ${numText(c.max as number)}${unit}`;
}

/** Relative slack, so a non-strict bound is never called impossible at its own value. */
const BOUND_TOL = 1e-9;

function outsideBound(value: number, c: { min?: number; max?: number; minStrict?: boolean; maxStrict?: boolean }): boolean {
  const tol = BOUND_TOL * Math.max(1, Math.abs(value));
  if (c.min !== undefined) {
    if (value < c.min - tol) return true;
    if (c.minStrict !== false && Math.abs(value - c.min) <= tol) return true;
  }
  if (c.max !== undefined) {
    if (value > c.max + tol) return true;
    if (c.maxStrict !== false && Math.abs(value - c.max) <= tol) return true;
  }
  return false;
}

/** The ray pair of an angle, order-free — «∠ABC» and «∠CBA» are one angle. */
const rayKey = (vertex: Id, ray1: Id, ray2: Id) => `${vertex}|${ray1 < ray2 ? `${ray1}|${ray2}` : `${ray2}|${ray1}`}`;

/**
 * The first bound a stated value of the same measure cannot satisfy, or null when there is none.
 *
 * Members: a length bound against a pinned length, an angle bound against a pinned angle, a
 * two-sided range that excludes a stated value, and either order of statement — the bound is read
 * from the constraint list, which carries no order, so the two orders are one case by construction.
 */
export function boundImpossibility(constraints: Constraint[]): BoundImpossibility | null {
  const pairKey = (a: Id, b: Id) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  /** every STATED length, by endpoint pair; a pair stated twice is a different contradiction */
  const lengths = new Map<string, { a: Id; b: Id; value: number }>();
  const angles = new Map<string, { vertex: Id; ray1: Id; ray2: Id; value: number }>();
  for (const con of constraints) {
    if (con.type === 'distance' && Number.isFinite(con.value) && con.a !== con.b) {
      if (!lengths.has(pairKey(con.a, con.b))) lengths.set(pairKey(con.a, con.b), { a: con.a, b: con.b, value: con.value });
    }
    // An ARC measure is not the angle at a vertex of the figure — it is a measure on a circle, and a
    // bound about «∠ABC» is not about it (the ADR-538 exclusion, for the same reason).
    if (con.type === 'angle' && Number.isFinite(con.value) && !con.arcOf) {
      const k = rayKey(con.vertex, con.ray1, con.ray2);
      if (!angles.has(k)) angles.set(k, { vertex: con.vertex, ray1: con.ray1, ray2: con.ray2, value: con.value });
    }
  }
  for (const con of constraints) {
    if (con.type === 'length-bound') {
      const pinned = lengths.get(pairKey(con.a, con.b));
      if (pinned && outsideBound(pinned.value, con)) {
        const subject = `|${pinned.a}${pinned.b}|`;
        return { subject, value: `${subject} = ${numText(pinned.value)}`, bound: boundText(subject, '', con) };
      }
    }
    if (con.type === 'angle-bound') {
      const pinned = angles.get(rayKey(con.vertex, con.ray1, con.ray2));
      if (pinned && outsideBound(pinned.value, con)) {
        const subject = `∠${pinned.ray1}${pinned.vertex}${pinned.ray2}`;
        return { subject, value: `${subject} = ${numText(pinned.value)}°`, bound: boundText(subject, '°', con) };
      }
    }
  }
  return null;
}

/** The wire message. Both halves are the student's own statements, which is the point. */
export function boundImpossibilityError(m: BoundImpossibility): string {
  return `impossible: ${m.value} contradicts ${m.bound}`;
}

/**
 * OBTUSE-SIDE FEASIBILITY (#1441, ADR-551) — the fourth member: a pinned angle ≥ 90° at a vertex
 * makes the side OPPOSITE it the strictly longest side of its triangle (law of cosines with
 * cos θ ≤ 0: |PQ|² = |VP|² + |VQ|² − 2·|VP||VQ|·cos θ ≥ |VP|² + |VQ|²), so a pinned leg that
 * reaches or exceeds a pinned opposite side is impossible in the plane — no placement, no free
 * DOF. Without this the recruit ladder burned ~20 s proving «משולש ישר זווית ABC · AB=3 · BC=4»
 * numerically (the ADR-417 shape again), and a COLD worker blew its 12 s search budget.
 *
 * The pinned-angle sources are read from what the construction IS, never from coordinates:
 *  - a stated `angle` constraint whose value keeps the true inter-ray angle ≥ 90° (values are
 *    taken in [90°, 270°]: past 270° the geometric wedge is acute again; `arcOf` is excluded —
 *    a measure on a circle is not the angle at a figure vertex, the ADR-538 exclusion);
 *  - a `perpendicular` constraint whose two segments share an endpoint (the ADR-223 shape);
 *  - a structural right angle: a `perp-offset` vertex anchored at its own `from` (how
 *    `right-triangle` seats its knee), and a `foot` — the perpendicular from a point onto a line
 *    is at 90° to that line at the foot.
 *
 * Same one-way soundness as the three members above: a strict excess PROVES impossibility and
 * refuses before the ladder; passing proves nothing. Equality passes (leg = hypotenuse is the
 * degenerate zero-other-leg limit — the flat-figure rule the metric member also follows). The
 * DEFAULT right-triangle seat is deliberately NOT special-cased here: refusing the step at an
 * impossible seat is exactly what lets the ADR-445 seat search reseat in milliseconds instead of
 * after a 20 s ladder burn, while an EXPLICIT «זווית C = 90» pins the seat (ADR-445's own pin
 * set) so no reseat is tried and this refusal surfaces to the student — both plan arms fall out
 * of the existing machinery once the proof is fast.
 */
export interface ObtuseSideImpossibility {
  /** the vertex carrying the pinned ≥ 90° angle */
  vertex: Id;
  /** that angle, in degrees, as stated (90 for the structural sources) */
  deg: number;
  /** the side opposite the angle — the one that must be strictly longest — in the STATED letter order */
  hypA: Id;
  hypB: Id;
  hypLen: number;
  /** the offending leg (vertex to an arm end), in the STATED letter order */
  legA: Id;
  legB: Id;
  legLen: number;
}

export function obtuseSideImpossibility(
  objects: readonly GeoObject[],
  constraints: Constraint[],
): ObtuseSideImpossibility | null {
  // Pinned lengths — the same admission rule as the metric member: numeric `distance` only, the
  // tightest value when an edge is stated twice (a second, smaller value is its own contradiction,
  // reported by the ordinary solver; the smaller keeps this verdict sound). The stated letter order
  // rides along so the refusal names the segments the way the student wrote them.
  const key = (a: Id, b: Id) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const len = new Map<string, { a: Id; b: Id; len: number }>();
  for (const con of constraints) {
    if (con.type !== 'distance' || !Number.isFinite(con.value) || con.value <= 0 || con.a === con.b) continue;
    const k = key(con.a, con.b);
    const prev = len.get(k);
    if (prev === undefined || con.value < prev.len) len.set(k, { a: con.a, b: con.b, len: con.value });
  }
  if (len.size < 2) return null; // a leg and its opposite side need two pinned lengths

  const wedges: { v: Id; p: Id; q: Id; deg: number }[] = [];
  for (const con of constraints) {
    if (con.type === 'angle' && !con.arcOf && Number.isFinite(con.value) && con.value >= 90 - TOL && con.value <= 270 + TOL) {
      wedges.push({ v: con.vertex, p: con.ray1, q: con.ray2, deg: con.value });
    } else if (con.type === 'perpendicular') {
      // a→b ⊥ c→d sharing an endpoint: the right angle sits at the shared point, between the others.
      for (const [v, p, v2, q] of [
        [con.a, con.b, con.c, con.d],
        [con.a, con.b, con.d, con.c],
        [con.b, con.a, con.c, con.d],
        [con.b, con.a, con.d, con.c],
      ] as [Id, Id, Id, Id][]) {
        if (v === v2) wedges.push({ v, p, q, deg: 90 });
      }
    }
  }
  for (const o of objects) {
    if (o.kind === 'perp-offset' && o.from === o.anchor) wedges.push({ v: o.anchor, p: o.to, q: o.id, deg: 90 });
    if (o.kind === 'foot') {
      wedges.push({ v: o.id, p: o.from, q: o.a, deg: 90 });
      wedges.push({ v: o.id, p: o.from, q: o.b, deg: 90 });
    }
  }

  for (const w of wedges) {
    if (w.v === w.p || w.v === w.q || w.p === w.q) continue;
    const hyp = len.get(key(w.p, w.q));
    if (hyp === undefined) continue;
    for (const legEnd of [w.p, w.q]) {
      const leg = len.get(key(w.v, legEnd));
      if (leg !== undefined && leg.len > hyp.len * (1 + TOL) + TOL) {
        return { vertex: w.v, deg: w.deg, hypA: hyp.a, hypB: hyp.b, hypLen: hyp.len, legA: leg.a, legB: leg.b, legLen: leg.len };
      }
    }
  }
  return null;
}

/** The wire message; `humanizeError` maps it to the student's language (#413/ADR-416). */
export function obtuseSideImpossibilityError(m: ObtuseSideImpossibility): string {
  return (
    `impossible: the angle at ${m.vertex} is ${numText(m.deg)}°, so |${m.hypA}${m.hypB}| must be the longest side, ` +
    `but |${m.hypA}${m.hypB}| = ${numText(m.hypLen)} and |${m.legA}${m.legB}| = ${numText(m.legLen)}`
  );
}

/**
 * A STATED MEASURE OUTSIDE THE RANGE ANY CONFIGURATION CAN GIVE IT (#1712, ADR-587) — the fifth member.
 *
 * «∢ABC = -2» committed: the residual ∠ABC − (−2) moves as the triangle flexes, so the ADR-104 flex
 * probe (`constraintIsPending`) filed it as a PENDING given waiting for the rest of the figure — for a
 * value no figure can ever reach. Every angle measures between 0° and 180° and every length is ≥ 0, so
 * a statement whose stated number lies outside that range is impossible ON ITS OWN — no other given, no
 * placement and no free DOF is involved. That is what makes it provable here, one-way sound like its
 * siblings: a hit PROVES impossibility, a miss proves nothing.
 *
 * Read on the CONSTRAINT, not on the parser's sentence: every spelling («∢ABC = -2», «זווית ABC = -30»,
 * "angle ABC = 200", a value reached through a variable «∢ABC = 0.5x» · «x = -10») lowers to the one
 * `angle` constraint, so the gate is the one place all of them pass.
 *
 * Members:
 *  - `angle` (not an ARC measure — the arc reader keeps its own (0°, 360°) window): value ∉ [0°, 180°];
 *  - `angle-bound`: a window that misses [0°, 180°] («∢ABC > 200», «∢ABC < -5»), strictness respected;
 *  - `distance` / `length-bound`: the same against [0, ∞);
 *  - `measure-sum`: by SIGN only — every term is ≥ 0, so a combination whose coefficients all share a sign
 *    cannot reach a target of the other sign («∠A + ∠B = -10»). Its UPPER bound is deliberately NOT read:
 *    the parser lowers an ARC term to its central angle, so «arc + arc = 380» and «∠A + ∠B = 380» are the
 *    same constraint and only one of them is impossible.
 * The endpoints are reachable (a flat 180° or a 0° angle is a degenerate figure, not an impossible one —
 * the solver and the degeneracy gates own those), so only a value strictly outside is refused.
 */
export interface MeasureRangeImpossibility {
  /** the statement, as `describeConstraint` writes it */
  statement: string;
  unit: 'angle' | 'length';
}

const ANGLE_RANGE = { lo: 0, hi: 180 } as const;

/** Does a bound window miss the closed range [lo, hi] entirely? */
function windowMissesRange(c: { min?: number; max?: number; minStrict?: boolean; maxStrict?: boolean }, lo: number, hi: number): boolean {
  const tol = BOUND_TOL * Math.max(1, ...[hi, lo].filter(Number.isFinite).map(Math.abs)); // [0, ∞) has no finite top
  if (c.min !== undefined && Number.isFinite(c.min)) {
    if (c.min > hi + tol) return true;
    if (c.minStrict !== false && c.min >= hi - tol) return true; // «> 180» — nothing above the top
  }
  if (c.max !== undefined && Number.isFinite(c.max)) {
    if (c.max < lo - tol) return true;
    if (c.maxStrict !== false && c.max <= lo + tol) return true; // «< 0» — nothing below the bottom
  }
  return false;
}

/** The constraint's out-of-range verdict, or null. Pure in the one constraint — no figure is read. */
export function measureOutOfRange(con: Constraint): MeasureRangeImpossibility | null {
  const tolOf = (v: number) => BOUND_TOL * Math.max(1, Math.abs(v));
  switch (con.type) {
    case 'angle':
      if (con.arcOf || !Number.isFinite(con.value)) return null;
      return con.value < ANGLE_RANGE.lo - tolOf(con.value) || con.value > ANGLE_RANGE.hi + tolOf(con.value)
        ? { statement: describeConstraint(con), unit: 'angle' }
        : null;
    case 'angle-bound':
      return windowMissesRange(con, ANGLE_RANGE.lo, ANGLE_RANGE.hi) ? { statement: describeConstraint(con), unit: 'angle' } : null;
    case 'distance':
      return Number.isFinite(con.value) && con.value < -tolOf(con.value) ? { statement: describeConstraint(con), unit: 'length' } : null;
    case 'length-bound':
      return windowMissesRange(con, 0, Infinity) ? { statement: describeConstraint(con), unit: 'length' } : null;
    case 'measure-sum': {
      if (!Number.isFinite(con.target) || !con.coefs.length) return null;
      const tol = tolOf(con.target);
      const allPos = con.coefs.every((k) => k >= 0);
      const allNeg = con.coefs.every((k) => k <= 0);
      const impossible = (allPos && con.target < -tol) || (allNeg && con.target > tol);
      return impossible ? { statement: describeConstraint(con), unit: con.unit } : null;
    }
    default:
      return null;
  }
}

/** The first constraint of the list whose stated measure no configuration can take, or null. */
export function measureRangeImpossibility(constraints: readonly Constraint[]): MeasureRangeImpossibility | null {
  for (const con of constraints) {
    const hit = measureOutOfRange(con);
    if (hit) return hit;
  }
  return null;
}

/** The wire message; `humanizeError` maps it to the student's language. The statement is the student's own. */
export function measureRangeImpossibilityError(m: MeasureRangeImpossibility): string {
  return m.unit === 'angle'
    ? `impossible: ${m.statement} — an angle measures between 0° and 180°`
    : `impossible: ${m.statement} — a length is never negative`;
}

/**
 * A DECLARED POLYGON THE LENGTH GIVENS FORCE FLAT (#1849, [ADR-602](../../docs/06-decisions.md#adr-602)).
 *
 * The operator's ruling (2026-10-07, [ADR-W-115](../../docs/06w-decisions-workspace.md#adr-w-115)): when the givens
 * force «משולש ABC» flat, the line that completes the collapse is REFUSED — a flat line is not a triangle. The
 * equality case the metric prover above deliberately lets through («AB = 5 · BC = 3 · AC = 8») is exactly that
 * member, and it is a THEOREM, not a measurement: |AC| = |AB| + |BC| holds only with B on segment AC.
 *
 * Why a prover and not the accept gate alone. The gate judges the drawing (`collapsedPolygon`, step.ts), and a
 * drawing of a forced-flat figure is only as flat as the solver polished it: every length meets its tolerance
 * (2e-4 of the scale) on a bent path whose sag is second order, so «AB = BC = CD = 1 · AD = 3» drew a
 * «quadrilateral» at flatness 1.6e-3 — three times the gate — with every row green (measured, 2026-10-07). The
 * proof does not depend on where the solver stopped.
 *
 * **The mechanism — a linear implication over segment lengths.** Every LINEAR length statement is a row in the
 * unknowns x_PQ = |PQ|: a pinned length, an equality, a ratio (with its affine `add`), a signed sum («AC = AB +
 * BC»), a perimeter, a perimeter ratio. A relation c·x = 0 FOLLOWS from a consistent system iff the row (c | 0)
 * lies in the row space of [A | b] — one Gaussian elimination, scale-free, so a ratio form («AB : BC = 5 : 3 ·
 * AB : AC = 5 : 8») is the same proof as the pinned one. The candidate relations are a polygon's own straightness
 * equalities: |uv| = the length of a ring arc from u to v (every vertex of that arc then lies on segment uv, in
 * order), and |uv| = |uw| + |wv| for any third vertex w. Proven collinear sets that share two points lie on one
 * line and merge; a polygon whose every vertex lands in one merged set is flat in EVERY configuration.
 *
 * Sound one way, like its siblings: a proof refuses; no proof proves nothing, and the accept gate still judges
 * the drawing. An inconsistent system proves anything, so it proves nothing here (the solver reports it). Only
 * lengths are read — an angle-forced collapse is the angle-sum prover's and ADR-537's, an incidence-forced one
 * the gate's (it lands far below the floor).
 */
export interface ForcedFlatPolygon {
  /** the polygon's vertex run */
  polygon: Id[];
  /** one straightness equality the givens imply, as |uv| = |…| + |…| (for the record and the lock) */
  relation: string;
}

/** Relative tolerance of the elimination — far below any length a student types differently («7.99» vs 8). */
const LIN_TOL = 1e-9;

/** The rows of the linear length system: coefficients over segment keys, and the right-hand side. */
function lengthRows(constraints: readonly Constraint[]): { coefs: Map<string, number>; rhs: number }[] {
  const key = (a: Id, b: Id) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const rows: { coefs: Map<string, number>; rhs: number }[] = [];
  const row = (terms: [Id, Id, number][], rhs: number) => {
    if (!Number.isFinite(rhs)) return;
    const coefs = new Map<string, number>();
    for (const [a, b, k] of terms) {
      if (a === b || !Number.isFinite(k)) return; // a zero-length operand is the degenerate-operand gate's business
      const kk = key(a, b);
      coefs.set(kk, (coefs.get(kk) ?? 0) + k);
    }
    for (const [kk, v] of coefs) if (v === 0) coefs.delete(kk);
    if (coefs.size) rows.push({ coefs, rhs });
  };
  const ring = (ids: readonly Id[], k: number): [Id, Id, number][] => ids.map((id, i) => [id, ids[(i + 1) % ids.length]!, k]);
  for (const c of constraints) {
    switch (c.type) {
      case 'distance': row([[c.a, c.b, 1]], c.value); break;
      case 'equal': row([[c.a, c.b, 1], [c.c, c.d, -1]], 0); break;
      case 'ratio': row([[c.a, c.b, 1], [c.c, c.d, -c.k]], c.add ?? 0); break;
      case 'perimeter': if (c.ids.length >= 3) row(ring(c.ids, 1), c.value); break;
      case 'perimeter-ratio': if (c.ids1.length >= 3 && c.ids2.length >= 3) row([...ring(c.ids1, 1), ...ring(c.ids2, -c.k)], 0); break;
      case 'measure-sum':
        if (c.unit === 'length' && c.points.length === 2 * c.coefs.length) row(c.coefs.map((k, i) => [c.points[2 * i]!, c.points[2 * i + 1]!, k]), c.target);
        break;
      default: break;
    }
  }
  return rows;
}

/** Row-reduce [A | b] once; `reduces(c)` answers whether (c | 0) lies in its row space. Null when inconsistent. */
function rowSpace(rows: { coefs: Map<string, number>; rhs: number }[]): ((target: Map<string, number>) => boolean) | null {
  const vars = [...new Set(rows.flatMap((r) => [...r.coefs.keys()]))];
  const col = new Map(vars.map((v, i) => [v, i]));
  const n = vars.length;
  // each row: n coefficients + the rhs, normalised so its largest entry is 1 (scale-free tolerance)
  const norm = (r: number[]) => {
    const m = Math.max(...r.map(Math.abs));
    return m > 0 ? r.map((x) => x / m) : r;
  };
  const basis: { pivot: number; r: number[] }[] = [];
  const reduce = (r: number[]): number[] => {
    let out = [...r];
    for (const { pivot, r: b } of basis) {
      const f = out[pivot]!;
      if (f !== 0) out = out.map((x, i) => x - f * b[i]!);
    }
    return out.map((x) => (Math.abs(x) < LIN_TOL ? 0 : x));
  };
  for (const r of rows) {
    const dense = new Array<number>(n + 1).fill(0);
    for (const [k, v] of r.coefs) dense[col.get(k)!] = v;
    dense[n] = r.rhs;
    const red = norm(reduce(norm(dense)));
    let pivot = -1;
    for (let i = 0; i < n; i++) if (Math.abs(red[i]!) > LIN_TOL && (pivot < 0 || Math.abs(red[i]!) > Math.abs(red[pivot]!))) pivot = i;
    if (pivot < 0) {
      if (Math.abs(red[n]!) > LIN_TOL) return null; // 0 = b ≠ 0: inconsistent — proves anything, so nothing
      continue;
    }
    const p = red[pivot]!;
    const unit = red.map((x) => x / p);
    for (const bRow of basis) {
      const f = bRow.r[pivot]!;
      if (f !== 0) bRow.r = bRow.r.map((x, i) => x - f * unit[i]!);
    }
    basis.push({ pivot, r: unit });
  }
  return (target) => {
    const dense = new Array<number>(n + 1).fill(0);
    for (const [k, v] of target) {
      const i = col.get(k);
      if (i === undefined) return false; // a length no given mentions is free — nothing can force it
      dense[i] = v;
    }
    return reduce(norm(dense)).every((x) => x === 0);
  };
}

/** The first declared polygon the linear length givens force flat, or null. */
export function forcedFlatPolygon(objects: readonly GeoObject[], constraints: readonly Constraint[]): ForcedFlatPolygon | null {
  const polys = objects.filter((o): o is Extract<GeoObject, { kind: 'polygon' }> => o.kind === 'polygon' && o.vertices.length >= 3);
  if (!polys.length) return null;
  const rows = lengthRows(constraints);
  if (rows.length === 0) return null;
  const implied = rowSpace(rows);
  if (!implied) return null;
  const key = (a: Id, b: Id) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  for (const o of polys) {
    const V = o.vertices;
    const n = V.length;
    if (new Set(V).size !== n) continue;
    const lines: Set<Id>[] = [];
    let relation = '';
    /** |u v| = Σ over the chain's consecutive pairs ⇒ the chain is collinear, in order. */
    const tryChain = (chain: Id[]) => {
      const u = chain[0]!, v = chain[chain.length - 1]!;
      const c = new Map<string, number>([[key(u, v), 1]]);
      for (let i = 0; i + 1 < chain.length; i++) {
        const k = key(chain[i]!, chain[i + 1]!);
        c.set(k, (c.get(k) ?? 0) - 1);
      }
      if (!implied(c)) return;
      lines.push(new Set(chain));
      if (!relation) relation = `|${u}${v}| = ${chain.slice(0, -1).map((p, i) => `|${p}${chain[i + 1]}|`).join(' + ')}`;
    };
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        // both ring arcs between V[i] and V[j]
        const fwd = V.slice(i, j + 1);
        const back = [...V.slice(j), ...V.slice(0, i + 1)].reverse();
        if (fwd.length >= 3) tryChain(fwd);
        if (back.length >= 3) tryChain(back);
        // any third vertex as the middle of a straight angle
        for (let w = 0; w < n; w++) if (w !== i && w !== j && !(j - i === 2 && w === i + 1)) tryChain([V[i]!, V[w]!, V[j]!]);
      }
    if (!lines.length) continue;
    // two collinear sets that share two points lie on ONE line
    let merged = true;
    while (merged) {
      merged = false;
      for (let a = 0; a < lines.length && !merged; a++)
        for (let b = a + 1; b < lines.length && !merged; b++) {
          const shared = [...lines[a]!].filter((p) => lines[b]!.has(p)).length;
          if (shared >= 2) {
            for (const p of lines[b]!) lines[a]!.add(p);
            lines.splice(b, 1);
            merged = true;
          }
        }
    }
    if (lines.some((L) => V.every((p) => L.has(p)))) return { polygon: [...V], relation };
  }
  return null;
}
