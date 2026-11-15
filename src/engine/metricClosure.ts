/**
 * THE METRIC CLOSURE (#2894, [ADR-833](../../docs/06-decisions.md#adr-833)) — a proof, before the failure ladder
 * climbs, that NO figure holds a construction's lengths.
 *
 * Class. A statement that contradicts lengths the figure ALREADY fixes: «ריבוע ABCD · AB = 3 · AC = 10» (the square
 * fixes |AC| = 3√2), «מלבן ABCD · AB = 3 · BC = 4 · AC = 7» (the right angle at B fixes |AC| = 5), «משולש שווה צלעות
 * ABC · AB = 3 · BC = 5», a diameter longer than 2r, a chord longer than the diameter, «המחומש משוכלל» over two sides
 * already stated unequal. The primary solve fails, and the failure ladder (`runFailureLadder`, step.ts) then climbs
 * every rung — settle, recruit, the component solve, the scale rescue, the free-vertex restart — each a full driven
 * multi-start that cannot succeed, to reach the refusal it was always going to give: 40–185× the dearest accepted
 * line of the same figure (docs/17 §7 rule 2: the failure path must be cheaper than the success path).
 *
 * How it decides — an INTERVAL closure over every length the construction speaks about, never a seed's drawing:
 *  - a length is the distance between two points; each starts as [0, ∞);
 *  - the RELATIONS every accepted figure must hold narrow them, each read with a margin wider than the solver's own
 *    acceptance (a length 2e-4 relative, an angle `ANGLE_EPS` = 0.5°), so a configuration the solver would accept
 *    is never excluded:
 *     · the obligations (the listed constraints and every solve directive's): a `distance`, an `equal`, a `ratio` and
 *       a `length-radius` without an affine part, a stated angle or a stated ⟂ corner ({@link pinnedAngleWedges});
 *     · the STRUCTURE of the objects whose definition is a metric fact with no parameter: a square's derived
 *       corners (|BC| = |AB| and a right angle at B), a parallelogram's fourth vertex (opposite sides equal), a
 *       perpendicular offset at an end of its base (a right angle), a midpoint (half the segment), a point on a circle
 *       (its radius: the stated length, or one free radius shared by all its points), an antipode (the diameter);
 *  - a stated or structural angle at V between P and Q bounds |PQ| by the law of cosines (it holds with a zero arm
 *    too, so a degenerate configuration is never excluded);
 *  - every three points obey the triangle inequality (both bounds), so a chain of pinned lengths bounds its ends
 *    (the ADR-417 metric prover's reading, now over derived lengths as well).
 * The narrowing runs to a fixed point. A length whose interval comes out EMPTY holds in no configuration.
 *
 * One-way sound, like every stage-0 prover: a proof means no rescue stage can find a solution the step evaluates as
 * holding (each stage's figure is judged by `evaluate`, whose acceptance sits inside these margins, and keeps every
 * obligation of the step: the preservation gate); no proof proves nothing and the ladder climbs as before. Reading
 * fewer relations only loses proofs, never makes one wrong.
 */
import { pinnedAngleWedges } from './metricFeasibility';
import { drivenConstraintsOf } from './evaluate';
import type { Construction, Constraint, GeoObject, Id } from './types';

export interface MetricClosureProof {
  /** the two points whose distance no configuration can take */
  a: Id;
  b: Id;
  /** the bounds that crossed (lo > hi) */
  lo: number;
  hi: number;
}

/** Relative margin on a stated length: 5× the solver's 2e-4 acceptance. */
const LEN_REL = 1e-3;
/** Absolute floor on a length's margin (the solver's own floor is 1e-6). */
const LEN_ABS = 1e-5;
/** Margin on a stated angle, in degrees: 2× `ANGLE_EPS`. */
const ANGLE_MARGIN = 1;
/** Margin on a ⟂ corner, in degrees (its tolerance is a 1e-6 sine). */
const PERP_MARGIN = 0.01;
/** Margin on an exact structural relation (floating point only). */
const EXACT_REL = 1e-9;
/** Sweeps of the closure before it stops (each only narrows; a proof needs none of the later ones). */
const MAX_SWEEPS = 40;
/** Past this many points the O(n³) triangle sweep is skipped (the other relations still run). */
const MAX_TRIANGLE_POINTS = 48;

interface Ratio { p: number; q: number; k1: number; k2: number; abs: number } // |p| ∈ [k1, k2]·|q| ± abs (pair indices)
interface Wedge { v: number; p: number; q: number; t1: number; t2: number } // angle at v between p and q ∈ [t1, t2]°

/**
 * The first length no configuration of `c` can take, or null. Reads the obligations (`constraints` and every solve
 * directive's) and the parameter-free structure of `c.objects`.
 */
export function metricClosureImpossibility(c: Construction): MetricClosureProof | null {
  return closeLengths(c).proof;
}

/** The closure's result: the proof (or null), and each pair's final interval (null for a pair it never read). */
interface Closed {
  proof: MetricClosureProof | null;
  interval: (a: Id, b: Id) => [number, number] | null;
}

/** The closure itself; `skip` leaves one stated obligation out (the explanation asks what the OTHERS force). */
function closeLengths(c: Construction, skip?: Constraint, exact = false): Closed {
  // `exact`: the explanation's reading — the givens' own values with no acceptance margin, so a length the rest FORCES
  // comes out as one number (3√2, never 4.2426 ± 0.004). Never a proof: only `metricClosureImpossibility`'s margins are.
  const lenRel = exact ? EXACT_REL : LEN_REL;
  const lenAbs = exact ? 0 : LEN_ABS;
  const angleMargin = exact ? 0 : ANGLE_MARGIN;
  const perpMargin = exact ? 0 : PERP_MARGIN;
  const ptIndex = new Map<Id, number>();
  const pts: Id[] = [];
  const pt = (id: Id): number => {
    let i = ptIndex.get(id);
    if (i === undefined) {
      i = pts.length;
      ptIndex.set(id, i);
      pts.push(id);
    }
    return i;
  };
  const pairKey = (a: Id, b: Id): string => {
    const i = pt(a);
    const j = pt(b);
    return i < j ? `${i}|${j}` : `${j}|${i}`;
  };
  const pairIndex = new Map<string, number>();
  const lo: number[] = [];
  const hi: number[] = [];
  const pair = (a: Id, b: Id): number => {
    const k = pairKey(a, b);
    let i = pairIndex.get(k);
    if (i === undefined) {
      i = lo.length;
      pairIndex.set(k, i);
      lo.push(0);
      hi.push(Infinity);
    }
    return i;
  };
  const ratios: Ratio[] = [];
  const wedges: Wedge[] = [];
  const pinned: { i: number; lo: number; hi: number }[] = [];
  const pin = (a: Id, b: Id, value: number, rel: number): void => {
    if (a === b || !Number.isFinite(value) || value < 0) return;
    const m = Math.max(lenAbs, rel * value);
    pinned.push({ i: pair(a, b), lo: Math.max(0, value - m), hi: value + m });
  };
  const ratio = (a: Id, b: Id, c2: Id, d: Id, k: number, rel: number): void => {
    if (a === b || c2 === d || !(k > 0) || !Number.isFinite(k)) return;
    ratios.push({ p: pair(a, b), q: pair(c2, d), k1: k * (1 - rel), k2: k * (1 + rel), abs: rel > EXACT_REL ? lenAbs : 0 });
  };
  const wedge = (v: Id, p: Id, q: Id, deg: number, margin: number): void => {
    if (v === p || v === q || p === q || !Number.isFinite(deg) || deg <= 0 || deg >= 180) return;
    pair(v, p);
    pair(v, q);
    pair(p, q);
    wedges.push({ v: pt(v), p: pt(p), q: pt(q), t1: Math.max(0, deg - margin), t2: Math.min(180, deg + margin) });
  };

  // ── the obligations ──
  const obligations: Constraint[] = [...c.constraints, ...drivenConstraintsOf(c)];
  const skipKey = skip ? JSON.stringify(skip) : null;
  for (const con of obligations) {
    if (skipKey !== null && JSON.stringify(con) === skipKey) continue; // every copy (listed and driven) of the one left out
    if (con.type === 'distance') pin(con.a, con.b, con.value, lenRel);
    else if (con.type === 'equal') ratio(con.a, con.b, con.c, con.d, 1, lenRel);
    else if (con.type === 'ratio' && !con.add) ratio(con.a, con.b, con.c, con.d, con.k, lenRel);
    else if (con.type === 'length-radius' && !con.add) ratio(con.a, con.b, con.center, con.witness, con.k, lenRel);
  }
  for (const con of obligations) {
    if (con.type !== 'angle' && con.type !== 'perpendicular') continue;
    for (const w of pinnedAngleWedges([con])) wedge(w.v, w.p, w.q, w.deg, con.type === 'perpendicular' ? perpMargin : angleMargin);
  }

  // ── the structure ──
  const byId = new Map<Id, GeoObject>(c.objects.map((o) => [o.id, o] as const));
  for (const o of c.objects) {
    switch (o.kind) {
      case 'derived': {
        // square-c: C = B ± R90(B − A); square-d: D = A ± R90(B − A)
        const [corner, other] = o.rule === 'square-c' ? [o.b, o.a] : [o.a, o.b];
        ratio(corner, o.id, o.a, o.b, 1, EXACT_REL);
        wedge(corner, other, o.id, 90, 0);
        break;
      }
      case 'parallelogram-vertex': // D = a + c − b
        ratio(o.c, o.id, o.a, o.b, 1, EXACT_REL);
        ratio(o.a, o.id, o.b, o.c, 1, EXACT_REL);
        break;
      case 'perp-offset': // anchor ± n̂·dist, n̂ ⟂ (to − from): a right angle only when the anchor is an end of the base
        if (o.anchor === o.to && o.from !== o.to) wedge(o.to, o.from, o.id, 90, 0);
        else if (o.anchor === o.from && o.from !== o.to) wedge(o.from, o.to, o.id, 90, 0);
        break;
      case 'midpoint':
        if (o.a !== o.b) {
          ratio(o.a, o.id, o.a, o.b, 0.5, EXACT_REL);
          ratio(o.b, o.id, o.a, o.b, 0.5, EXACT_REL);
        }
        break;
      default:
        break;
    }
  }
  // A circle's points all sit its radius from its centre: one shared length per circle (its first point stands for
  // it), pinned when the radius is a stated length. `through` puts its point on the circle too.
  const members = new Map<Id, Id[]>();
  const addMember = (circle: Id, p: Id): void => {
    const list = members.get(circle) ?? [];
    if (!list.includes(p)) list.push(p);
    members.set(circle, list);
  };
  for (const o of c.objects) {
    if (o.kind === 'on-circle' || o.kind === 'antipode') addMember(o.circle, o.id);
    if (o.kind === 'circle' && o.radius.via === 'through') addMember(o.id, o.radius.point);
  }
  for (const [circleId, list] of members) {
    const circ = byId.get(circleId);
    if (!circ || circ.kind !== 'circle') continue;
    const centre = circ.center;
    const own = list.filter((p) => p !== centre);
    if (!own.length) continue;
    const first = own[0]!;
    for (const p of own.slice(1)) ratio(centre, p, centre, first, 1, EXACT_REL);
    if (circ.radius.via === 'length') for (const p of own) pin(centre, p, circ.radius.value, EXACT_REL);
  }
  for (const o of c.objects) {
    if (o.kind !== 'antipode') continue;
    const circ = byId.get(o.circle);
    if (!circ || circ.kind !== 'circle' || o.of === o.id) continue;
    ratio(o.of, o.id, circ.center, o.of, 2, EXACT_REL); // |of → antipode| = 2·|centre → of|
  }
  const interval = (a: Id, b: Id): [number, number] | null => {
    const i = ptIndex.get(a);
    const j = ptIndex.get(b);
    if (i === undefined || j === undefined) return null;
    const k = pairIndex.get(i < j ? `${i}|${j}` : `${j}|${i}`);
    return k === undefined ? null : [lo[k]!, hi[k]!];
  };
  if (!lo.length) return { proof: null, interval };

  // ── the closure ──
  for (const p of pinned) {
    lo[p.i] = Math.max(lo[p.i]!, p.lo);
    hi[p.i] = Math.min(hi[p.i]!, p.hi);
  }
  const n = pts.length;
  const idx = (i: number, j: number): number | undefined => pairIndex.get(i < j ? `${i}|${j}` : `${j}|${i}`);
  // the triangle sweep needs every pair among the points it reads
  const triangles = n <= MAX_TRIANGLE_POINTS;
  if (triangles) for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) pair(pts[i]!, pts[j]!);
  let scale = 0;
  for (const p of pinned) scale = Math.max(scale, p.hi);
  const tiny = 1e-12 * Math.max(1, scale);
  const narrow = (i: number, l: number, h: number): boolean => {
    let moved = false;
    if (l > lo[i]! + tiny) {
      lo[i] = l;
      moved = true;
    }
    if (h < hi[i]! - tiny) {
      hi[i] = h;
      moved = true;
    }
    return moved;
  };
  const empty = (): MetricClosureProof | null => {
    for (const [k, i] of pairIndex) {
      if (lo[i]! > hi[i]! + Math.max(tiny, 1e-9 * hi[i]!)) {
        const [a, b] = k.split('|').map(Number);
        return { a: pts[a!]!, b: pts[b!]!, lo: lo[i]!, hi: hi[i]! };
      }
    }
    return null;
  };
  for (let sweep = 0; sweep < MAX_SWEEPS; sweep++) {
    let moved = false;
    for (const r of ratios) {
      moved = narrow(r.p, r.k1 * lo[r.q]! - r.abs, r.k2 * hi[r.q]! + r.abs) || moved;
      moved = narrow(r.q, (lo[r.p]! - r.abs) / r.k2, (hi[r.p]! + r.abs) / r.k1) || moved;
    }
    for (const w of wedges) {
      const x = idx(w.v, w.p)!;
      const y = idx(w.v, w.q)!;
      const z = idx(w.p, w.q)!;
      const zMin = Math.sqrt(Math.max(0, minLawOfCosines(lo[x]!, hi[x]!, lo[y]!, hi[y]!, Math.cos((w.t1 * Math.PI) / 180))));
      const zMax = Math.sqrt(Math.max(0, maxLawOfCosines(hi[x]!, hi[y]!, lo[x]!, lo[y]!, Math.cos((w.t2 * Math.PI) / 180))));
      moved = narrow(z, zMin * (1 - EXACT_REL), zMax * (1 + EXACT_REL)) || moved;
    }
    if (triangles) {
      for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++) {
          const ij = idx(i, j)!;
          let l = lo[ij]!;
          let h = hi[ij]!;
          for (let k = 0; k < n; k++) {
            if (k === i || k === j) continue;
            const ik = idx(i, k)!;
            const kj = idx(k, j)!;
            h = Math.min(h, hi[ik]! + hi[kj]!);
            l = Math.max(l, lo[ik]! - hi[kj]!, lo[kj]! - hi[ik]!);
          }
          moved = narrow(ij, l, h) || moved;
        }
    }
    const proof = empty();
    if (proof) return { proof, interval };
    if (!moved) break;
  }
  return { proof: empty(), interval };
}

/**
 * #2894 ([ADR-835](../../docs/06-decisions.md#adr-835)) — WHY no figure holds the lengths, in the student's terms: the
 * shapes of 3-D's `lengths-impossible` (ADR-3D-495), so the two builders say one sentence.
 *  - `value`: one STATED length, against what the rest of the figure forces on that same segment (one value);
 *  - `triangle`: a stated length and two lengths the rest forces, against the triangle inequality.
 * Each stated `distance` is tried in turn (`prefer` first: the refused line's own; then newest first), the closure run without it; null
 * when no such reading exists (the refusal then keeps its plain over-constraint). Only the student's own point letters
 * are named: a third point the engine named (`@ctr-…`) is never offered.
 */
export type LengthConflict =
  | { kind: 'value'; seg: [Id, Id]; forced: number; stated: number }
  | { kind: 'triangle'; tri: [Id, Id, Id]; long: [Id, Id]; longLen: number; a: [Id, Id]; b: [Id, Id]; sum: number };
const STUDENT_LETTER = /^[A-Z][0-9]*'*$/;
export function explainLengthConflict(c: Construction, prefer: readonly Constraint[] = []): LengthConflict | null {
  const obligations: Constraint[] = [...c.constraints, ...drivenConstraintsOf(c)];
  const stated = obligations.filter((k): k is Extract<Constraint, { type: 'distance' }> => k.type === 'distance' && !k.derived && Number.isFinite(k.value) && k.value > 0 && k.a !== k.b && STUDENT_LETTER.test(k.a) && STUDENT_LETTER.test(k.b));
  const key = (k: Constraint) => JSON.stringify(k);
  const preferred = new Set(prefer.map(key));
  // the refused line's own lengths first, then the newest: the statement the fold's drop-one search names is the latest
  // that resolves the conflict, so the sentence speaks of ITS segment
  const order = [...stated.filter((k) => preferred.has(key(k))), ...stated.filter((k) => !preferred.has(key(k))).reverse()];
  const pts = new Set<Id>();
  for (const o of c.objects) if (STUDENT_LETTER.test(o.id) && 'kind' in o && (o.kind === 'free-point' || o.kind === 'derived' || o.kind === 'on-circle' || o.kind === 'antipode' || o.kind === 'midpoint' || o.kind === 'perp-offset' || o.kind === 'parallelogram-vertex' || o.kind === 'on-segment' || o.kind === 'on-segment-solved')) pts.add(o.id);
  const fixed = (iv: [number, number] | null): number | null => (iv && Number.isFinite(iv[1]) && iv[1] - iv[0] <= 1e-6 * Math.max(1, iv[1]) ? (iv[0] + iv[1]) / 2 : null);
  const apart = (x: number, y: number) => Math.abs(x - y) > 4 * LEN_REL * Math.max(1, x, y);
  for (const k of order) {
    const rest = closeLengths(c, k, true);
    if (rest.proof) continue; // the others contradict each other already: this length is not the one at fault
    const forced = fixed(rest.interval(k.a, k.b));
    if (forced !== null && apart(forced, k.value)) return { kind: 'value', seg: [k.a, k.b], forced, stated: k.value };
    for (const p of pts) {
      if (p === k.a || p === k.b) continue;
      const pa = fixed(rest.interval(p, k.a));
      const pb = fixed(rest.interval(p, k.b));
      if (pa === null || pb === null) continue;
      const tri: [Id, Id, Id] = [p, k.a, k.b];
      if (k.value > pa + pb && apart(k.value, pa + pb)) return { kind: 'triangle', tri, long: [k.a, k.b], longLen: k.value, a: [p, k.a], b: [p, k.b], sum: pa + pb };
      if (pa > k.value + pb && apart(pa, k.value + pb)) return { kind: 'triangle', tri, long: [p, k.a], longLen: pa, a: [k.a, k.b], b: [p, k.b], sum: k.value + pb };
      if (pb > k.value + pa && apart(pb, k.value + pa)) return { kind: 'triangle', tri, long: [p, k.b], longLen: pb, a: [k.a, k.b], b: [p, k.a], sum: k.value + pa };
    }
  }
  return null;
}

/** min over x ∈ [xl, xh], y ∈ [yl, yh] of x² + y² − 2·c·x·y (convex: on the box's edges; no infinite edge). */
function minLawOfCosines(xl: number, xh: number, yl: number, yh: number, c: number): number {
  const q = (x: number, y: number): number => x * x + y * y - 2 * c * x * y;
  const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
  let m = Infinity;
  for (const x of [xl, xh]) if (Number.isFinite(x)) m = Math.min(m, q(x, clamp(c * x, yl, yh)));
  for (const y of [yl, yh]) if (Number.isFinite(y)) m = Math.min(m, q(clamp(c * y, xl, xh), y));
  return Number.isFinite(m) ? m : 0;
}

/** max over the box of x² + y² − 2·c·x·y (convex: at a corner; ∞ with an unbounded side). */
function maxLawOfCosines(xh: number, yh: number, xl: number, yl: number, c: number): number {
  if (!Number.isFinite(xh) || !Number.isFinite(yh)) return Infinity;
  const q = (x: number, y: number): number => x * x + y * y - 2 * c * x * y;
  return Math.max(q(xl, yl), q(xl, yh), q(xh, yl), q(xh, yh));
}
