/**
 * #2894 part 2 C ([ADR-AG-483](../../docs/06c-decisions-analytic.md#adr-ag-483)) — STATED LENGTHS THAT NO FIGURE CAN HAVE,
 * in closed form: the analytic port of 3-D's `metricBounds3` ([ADR-3D-495](../../docs/06b-decisions-3d.md#adr-3d-495)),
 * the same two facts of the metric and the same margin, read off analytic's `length-eq` rows.
 *
 * A length the student states («AB = 5») is a `length-eq` row with one segment on one side and a number on the other; a
 * relation between two lengths («AB = AC», the sides of a «ריבוע», «AB = 2BC») is a `length-eq` row with one segment on
 * each side. Together they fix some segments' lengths exactly, whatever the rest of the figure is. Two facts hold for ANY
 * points of the plane, so when the fixed lengths break one of them no seed and no start can find a figure:
 *
 *  - **one value per segment**: two chains of stated lengths and ratios that give one segment two different lengths
 *    («ריבוע ABCD» · «AB = 3» · «BC = 4»);
 *  - **the triangle inequality**: for every three points P, Q, R, |PR| ≤ |PQ| + |QR| («AB = 3» · «BC = 4» · «AC = 10»;
 *    a square's diagonal «AC = 10» against «AB = 3», since BC = AB).
 *
 * Before, such a line was refused only after the configuration walk had run every solve of every seed of its window to
 * failure, and the drop-one probe after it. Here `evaluate` reads it off the rows before the first solve, and `derive`
 * names the rows and the reason.
 *
 * MARGIN (3-D's, for the same reason). A conflict is reported only when it exceeds {@link CONFLICT_MARGIN} of the lengths
 * involved AND {@link CONFLICT_MARGIN} in absolute terms, far beyond what a solve's tolerance can absorb, so a row set this
 * module rejects is one no solve could have met: the verdict is the one the search always reached, only reached at once.
 * The equality case («AC = 8» on 5 and 3: the triangle flat) is left to the search and keeps its own refusal (ADR-AG-247).
 */
import { evalExpr } from './expr';
import type { Constraint } from './solve';
import type { LengthExpr } from './lengths';
import type { Id } from './types';

/** See the module note: a conflict smaller than this (relative to the lengths, and absolute) is the search's to judge. */
export const CONFLICT_MARGIN = 1e-3;

/** A conflict, with the rows (by their place in `c.constraints`) it was derived from. */
export type MetricConflict =
  | {
      kind: 'triangle';
      /** the three points; `long` is the side longer than the other two together */
      p: Id; q: Id; r: Id;
      long: [Id, Id];
      longLen: number;
      /** the sum of the two other sides */
      sum: number;
      rows: number[];
    }
  | {
      kind: 'value';
      /** the segment given two lengths */
      seg: [Id, Id];
      /** its length as the other rows fix it, and as the conflicting row states it */
      forced: number;
      stated: number;
      rows: number[];
    };

/** What a `lengths-impossible` refusal says (#2894, ADR-AG-483): 3-D's `why`, its numbers formatted by the reader. */
export type LengthsWhy =
  | { kind: 'value'; seg: string; a: number; b: number }
  | { kind: 'triangle'; tri: string; long: string; longLen: number; a: string; b: string; sum: number };

/** A side of a `length-eq` read as `k · |ab|` (one segment, homogeneous linear) or as a plain number. */
type Side = { seg: [Id, Id]; k: number } | { value: number } | null;

const finite = (x: number): boolean => Number.isFinite(x);
function sideOf(e: LengthExpr): Side {
  if (e.terms.length === 0) {
    const v = evalExpr(e.expr, {});
    return finite(v) ? { value: v } : null;
  }
  if (e.terms.length !== 1) return null;
  const t = e.terms[0];
  if ((t.kind !== undefined && t.kind !== 'length') || !('a' in t) || t.a === t.b) return null;
  const sym = String.fromCharCode(0xe000);
  const at = (x: number): number => evalExpr(e.expr, { [sym]: x });
  const [f0, f1, f2] = [at(0), at(1), at(2)];
  // homogeneous and linear in the length, with no parameter in it
  if (![f0, f1, f2].every(finite) || Math.abs(f0) > 1e-12 || Math.abs(f2 - 2 * f1) > 1e-9 * Math.max(1, Math.abs(f1)) || !(f1 > 0)) return null;
  return { seg: [t.a, t.b], k: f1 };
}

/** One length row: `|seg| = value`, or `|s1| = ratio · |s2|`. */
type Pin = { kind: 'length'; seg: [Id, Id]; value: number; row: number } | { kind: 'rel'; s1: [Id, Id]; s2: [Id, Id]; ratio: number; row: number };

/** The rows of `c` that fix a length or a ratio of two lengths, in row order. */
export function lengthPins(constraints: readonly Constraint[]): Pin[] {
  const out: Pin[] = [];
  constraints.forEach((k, row) => {
    if (k.t !== 'length-eq') return;
    const l = sideOf(k.left);
    const r = sideOf(k.right);
    if (!l || !r) return;
    if ('seg' in l && 'value' in r) out.push({ kind: 'length', seg: l.seg, value: r.value / l.k, row });
    else if ('value' in l && 'seg' in r) out.push({ kind: 'length', seg: r.seg, value: l.value / r.k, row });
    else if ('seg' in l && 'seg' in r) out.push({ kind: 'rel', s1: l.seg, s2: r.seg, ratio: r.k / l.k, row });
  });
  return out;
}

const segKey = (a: Id, b: Id): string => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);
const segOf = (k: string): [Id, Id] => k.split('\u0000') as [Id, Id];
const differ = (x: number, y: number): boolean => Math.abs(x - y) > CONFLICT_MARGIN * Math.max(Math.abs(x), Math.abs(y), 1);

/**
 * The first metric conflict among the construction's stated lengths, or null. Pure in the rows; cheap (a weighted
 * union–find over the segments the rows name, then the triples of points whose three distances are all fixed). The
 * algorithm is 3-D's `metricConflict3`, step for step, so the two builders refuse the same rows for the same reason.
 */
export function metricConflict(constraints: readonly Constraint[]): MetricConflict | null {
  const pins = lengthPins(constraints);
  if (!pins.some((p) => p.kind === 'length')) return null;
  // weighted union–find: |s| = factor(s) · |root(s)|, with the rows each link was made from
  const parent = new Map<string, { up: string; f: number; via: number[] }>();
  const find = (s: string): { root: string; f: number; via: number[] } => {
    let f = 1;
    const via: number[] = [];
    let at = s;
    for (let e = parent.get(at); e && e.up !== at; e = parent.get(at)) {
      f *= e.f;
      via.push(...e.via);
      at = e.up;
    }
    return { root: at, f, via };
  };
  const value = new Map<string, { v: number; via: number[] }>(); // root → its length, and the rows that fixed it
  let conflict: MetricConflict | null = null;
  const link = (s1: string, s2: string, ratio: number, row: number): void => {
    // |s1| = ratio · |s2|
    const a = find(s1);
    const b = find(s2);
    if (a.root === b.root) {
      if (differ(a.f, ratio * b.f)) {
        const rv = value.get(a.root);
        if (rv && !conflict) conflict = { kind: 'value', seg: segOf(s1), forced: a.f * rv.v, stated: ratio * b.f * rv.v, rows: [...new Set([...a.via, ...b.via, ...rv.via, row])] };
      }
      return;
    }
    parent.set(a.root, { up: b.root, f: (ratio * b.f) / a.f, via: [...a.via, ...b.via, row] });
    const va = value.get(a.root);
    if (va) {
      value.delete(a.root);
      const vb = value.get(b.root);
      const asB = va.v / ((ratio * b.f) / a.f);
      if (!vb) value.set(b.root, { v: asB, via: [...va.via, ...a.via, ...b.via, row] });
      else if (differ(vb.v, asB) && !conflict) {
        conflict = { kind: 'value', seg: segOf(s2), forced: vb.v * b.f, stated: asB * b.f, rows: [...new Set([...vb.via, ...va.via, ...a.via, ...b.via, row])] };
      }
    }
  };
  const ensure = (s: string): void => {
    if (!parent.has(s)) parent.set(s, { up: s, f: 1, via: [] });
  };
  for (const p of pins) {
    if (p.kind !== 'rel' || !(p.ratio > 0) || !finite(p.ratio)) continue;
    const s1 = segKey(...p.s1);
    const s2 = segKey(...p.s2);
    ensure(s1);
    ensure(s2);
    link(s1, s2, p.ratio, p.row);
  }
  for (const p of pins) {
    if (p.kind !== 'length' || !(p.value >= 0) || !finite(p.value)) continue;
    const s = segKey(...p.seg);
    ensure(s);
    const { root, f, via } = find(s);
    const v = p.value / f;
    const had = value.get(root);
    if (!had) value.set(root, { v, via: [...via, p.row] });
    else if (differ(had.v * f, p.value) && Math.abs(had.v * f - p.value) > CONFLICT_MARGIN && !conflict) {
      conflict = { kind: 'value', seg: p.seg, forced: had.v * f, stated: p.value, rows: [...new Set([...had.via, ...via, p.row])] };
    }
  }
  if (conflict) return conflict;
  // every segment whose length is now fixed, with the rows that fix it
  const known = new Map<string, { len: number; via: number[] }>();
  for (const s of parent.keys()) {
    const { root, f, via } = find(s);
    const rv = value.get(root);
    if (rv) known.set(s, { len: f * rv.v, via: [...new Set([...via, ...rv.via])] });
  }
  const nbr = new Map<Id, Set<Id>>();
  for (const s of known.keys()) {
    const [a, b] = segOf(s);
    if (!nbr.has(a)) nbr.set(a, new Set());
    if (!nbr.has(b)) nbr.set(b, new Set());
    nbr.get(a)!.add(b);
    nbr.get(b)!.add(a);
  }
  // the triangle inequality on every triple whose three sides are fixed, in a fixed order (the segments sorted)
  for (const s of [...known.keys()].sort()) {
    const [p, q] = segOf(s);
    for (const r of [...(nbr.get(p) ?? [])].sort()) {
      if (r === q || r <= q || !nbr.get(q)?.has(r)) continue;
      const sides: [Id, Id, { len: number; via: number[] }][] = [
        [p, q, known.get(segKey(p, q))!],
        [q, r, known.get(segKey(q, r))!],
        [p, r, known.get(segKey(p, r))!],
      ];
      for (let k = 0; k < 3; k++) {
        const [a, b, L] = sides[k];
        const sum = sides[(k + 1) % 3][2].len + sides[(k + 2) % 3][2].len;
        const gap = L.len - sum;
        if (gap > CONFLICT_MARGIN * Math.max(L.len, 1) && gap > CONFLICT_MARGIN) {
          return {
            kind: 'triangle', p, q, r, long: [a, b], longLen: L.len, sum,
            rows: [...new Set(sides.flatMap(([, , x]) => x.via))].sort((x, y) => x - y),
          };
        }
      }
    }
  }
  return null;
}

/**
 * #2894 ([ADR-AG-483](../../docs/06c-decisions-analytic.md#adr-ag-483) Am. 1) — THE REASON, CHOSEN AS 2-D CHOOSES IT
 * (ADR-W-118 B1: one plane-geometry sentence, one verdict; 2-D's ADR-835 `explainLengthConflict` is the reference).
 *
 * The lengths a figure FORCES are more than the stated ones: a right angle between two fixed sides fixes the third
 * («ריבוע ABCD» · «AB = 3» gives |AC| = 3√2), and so does any stated angle between two fixed sides (the law of cosines).
 * `closeLengths` fixes them: the stated lengths, the ratios between lengths, and every angle the rows fix at a vertex —
 * a stated angle in degrees, or a right angle read off the perpendicular and parallel rows (a rectangle's sides) —
 * propagated until nothing new is fixed. A length fixed twice to values that differ, or three fixed sides against the
 * triangle inequality, is a conflict (the margin of {@link CONFLICT_MARGIN}).
 *
 * The reason, as 2-D gives it: each stated length is tried in turn (the refused line's own first, then the newest first),
 * and the closure is run WITHOUT it. When the rest already fixes that segment to another value, the reason is "two
 * lengths" with the forced value first; otherwise, when the rest fixes the two other sides of a triangle on that segment,
 * the triangle inequality. A row whose removal leaves the rest contradicting itself is not the one at fault.
 */
interface Known {
  len: number;
  via: number[];
}
interface Angle {
  v: Id;
  p: Id;
  q: Id;
  deg: number;
  via: number[];
}
interface Closed {
  known: Map<string, Known>;
  conflict: boolean;
}

const uniq = (xs: readonly number[]): number[] => [...new Set(xs)].sort((a, b) => a - b);

/** The angles the rows fix at a vertex: stated ones (degrees), and right angles read off ⊥ and ∥ between point pairs. */
function fixedAngles(constraints: readonly Constraint[], skip: number | null): Angle[] {
  const out: Angle[] = [];
  // ∥ classes of point-pair lines, and ⊥ between classes
  const up = new Map<string, { to: string; via: number[] }>();
  const root = (s: string): { r: string; via: number[] } => {
    const via: number[] = [];
    let at = s;
    for (let e = up.get(at); e && e.to !== at; e = up.get(at)) {
      via.push(...e.via);
      at = e.to;
    }
    return { r: at, via };
  };
  const line = (a: Id, b: Id): string | null => (a === b ? null : segKey(a, b));
  const lines = new Set<string>();
  const perps: { x: string; y: string; row: number }[] = [];
  constraints.forEach((k, row) => {
    if (row === skip) return;
    if (k.t === 'angle' && k.measure === undefined && k.at.v !== k.at.a && k.at.v !== k.at.b && k.at.a !== k.at.b) {
      const deg = evalExpr(k.value, {});
      if (Number.isFinite(deg) && deg > 0 && deg < 180) out.push({ v: k.at.v, p: k.at.a, q: k.at.b, deg, via: [row] });
      return;
    }
    let pair: [string | null, string | null] | null = null;
    let rel: 'parallel' | 'perpendicular' | null = null;
    if (k.t === 'relation' && k.u.k === 'points' && k.v.k === 'points') {
      pair = [line(k.u.a, k.u.b), line(k.v.a, k.v.b)];
      rel = k.rel;
    } else if (k.t === 'perpendicular') {
      pair = [line(k.a, k.b), line(k.c, k.d)];
      rel = 'perpendicular';
    }
    if (!pair || !pair[0] || !pair[1]) return;
    const [x, y] = pair as [string, string];
    lines.add(x);
    lines.add(y);
    if (rel === 'parallel') {
      const a = root(x);
      const b = root(y);
      if (a.r !== b.r) up.set(a.r, { to: b.r, via: [...a.via, ...b.via, row] });
    } else perps.push({ x, y, row });
  });
  const perpOf = new Map<string, number[]>(); // "rootX|rootY" → rows
  for (const { x, y, row } of perps) {
    const a = root(x);
    const b = root(y);
    const via = uniq([...a.via, ...b.via, row]);
    perpOf.set(`${a.r}|${b.r}`, via);
    perpOf.set(`${b.r}|${a.r}`, via);
  }
  if (perpOf.size === 0) return out;
  const all = [...lines].sort();
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const [a1, b1] = segOf(all[i]);
      const [a2, b2] = segOf(all[j]);
      const v = a1 === a2 || a1 === b2 ? a1 : b1 === a2 || b1 === b2 ? b1 : null;
      if (v === null) continue;
      const p = a1 === v ? b1 : a1;
      const q = a2 === v ? b2 : a2;
      if (p === q) continue;
      const x = root(all[i]);
      const y = root(all[j]);
      const via = perpOf.get(`${x.r}|${y.r}`);
      if (via) out.push({ v, p, q, deg: 90, via: uniq([...via, ...x.via, ...y.via]) });
    }
  }
  return out;
}

/** The lengths the rows fix (all but `skip`), and whether they conflict. */
function closeLengths(constraints: readonly Constraint[], skip: number | null): Closed {
  const pins = lengthPins(constraints).filter((p) => p.row !== skip);
  const angles = fixedAngles(constraints, skip);
  const known = new Map<string, Known>();
  let conflict = false;
  const set = (s: string, len: number, via: number[]): boolean => {
    if (!(len >= 0) || !Number.isFinite(len)) return false;
    const had = known.get(s);
    if (!had) {
      known.set(s, { len, via: uniq(via) });
      return true;
    }
    if (differ(had.len, len) && Math.abs(had.len - len) > CONFLICT_MARGIN) conflict = true;
    return false;
  };
  for (const p of pins) if (p.kind === 'length') set(segKey(...p.seg), p.value, [p.row]);
  for (let round = 0; round < 64; round++) {
    let moved = false;
    for (const p of pins) {
      if (p.kind !== 'rel' || !(p.ratio > 0) || !Number.isFinite(p.ratio)) continue;
      const s1 = segKey(...p.s1);
      const s2 = segKey(...p.s2);
      const k1 = known.get(s1);
      const k2 = known.get(s2);
      if (k2) moved = set(s1, p.ratio * k2.len, [...k2.via, p.row]) || moved;
      if (k1) moved = set(s2, k1.len / p.ratio, [...k1.via, p.row]) || moved;
    }
    for (const w of angles) {
      const a = known.get(segKey(w.v, w.p));
      const b = known.get(segKey(w.v, w.q));
      if (!a || !b) continue;
      const c = Math.sqrt(Math.max(0, a.len * a.len + b.len * b.len - 2 * a.len * b.len * Math.cos((w.deg * Math.PI) / 180)));
      moved = set(segKey(w.p, w.q), c, [...a.via, ...b.via, ...w.via]) || moved;
    }
    if (!moved) break;
  }
  if (!conflict && triangleBreak(known, null)) conflict = true;
  return { known, conflict };
}

/** The first triple of fixed sides against the triangle inequality (sorted order), optionally through one segment. */
function triangleBreak(known: ReadonlyMap<string, Known>, through: string | null): MetricConflict | null {
  const nbr = new Map<Id, Set<Id>>();
  for (const s of known.keys()) {
    const [a, b] = segOf(s);
    if (!nbr.has(a)) nbr.set(a, new Set());
    if (!nbr.has(b)) nbr.set(b, new Set());
    nbr.get(a)!.add(b);
    nbr.get(b)!.add(a);
  }
  for (const s of [...known.keys()].sort()) {
    const [p, q] = segOf(s);
    for (const r of [...(nbr.get(p) ?? [])].sort()) {
      if (r === q || r <= q || !nbr.get(q)?.has(r)) continue;
      const sides: [Id, Id, Known][] = [
        [p, q, known.get(segKey(p, q))!],
        [q, r, known.get(segKey(q, r))!],
        [p, r, known.get(segKey(p, r))!],
      ];
      for (let k = 0; k < 3; k++) {
        const [a, b, L] = sides[k];
        if (through !== null && segKey(a, b) !== through) continue;
        const sum = sides[(k + 1) % 3][2].len + sides[(k + 2) % 3][2].len;
        const gap = L.len - sum;
        if (gap > CONFLICT_MARGIN * Math.max(L.len, 1) && gap > CONFLICT_MARGIN) {
          return { kind: 'triangle', p, q, r, long: [a, b], longLen: L.len, sum, rows: uniq(sides.flatMap(([, , x]) => x.via)) };
        }
      }
    }
  }
  return null;
}

/** Do the rows (all of them) fix lengths no figure can have, with the forced lengths included? */
export function lengthsImpossible(constraints: readonly Constraint[]): boolean {
  return metricConflict(constraints) !== null || closeLengths(constraints, null).conflict;
}

/**
 * The reason, chosen as 2-D's `explainLengthConflict` chooses it (see the note above): the stated lengths tried in turn —
 * the rows in `prefer` (the refused line's) first, then the newest first — each with the closure of the others. Null when
 * the rows hold no conflict.
 */
export function explainLengths(constraints: readonly Constraint[], prefer: ReadonlySet<number>): MetricConflict | null {
  if (!lengthsImpossible(constraints)) return null;
  const stated = lengthPins(constraints).filter((p): p is Extract<Pin, { kind: 'length' }> => p.kind === 'length' && p.value > 0 && p.seg[0] !== p.seg[1]);
  const order = [...stated.filter((p) => prefer.has(p.row)), ...stated.filter((p) => !prefer.has(p.row)).reverse()];
  for (const k of order) {
    const rest = closeLengths(constraints, k.row);
    if (rest.conflict) continue; // the others contradict each other already: this length is not the one at fault
    const s = segKey(...k.seg);
    const forced = rest.known.get(s);
    if (forced && differ(forced.len, k.value) && Math.abs(forced.len - k.value) > CONFLICT_MARGIN) {
      return { kind: 'value', seg: segOf(s), forced: forced.len, stated: k.value, rows: uniq([...forced.via, k.row]) };
    }
    const withIt = new Map(rest.known);
    withIt.set(s, { len: k.value, via: [k.row] });
    const t = triangleBreak(withIt, s) ?? triangleBreak(withIt, null);
    if (t) return t;
  }
  return metricConflict(constraints);
}
