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
