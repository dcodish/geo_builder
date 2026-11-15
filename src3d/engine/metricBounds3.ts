/**
 * #2894 part 2 C ([ADR-3D-495](../../docs/06b-decisions-3d.md#adr-3d-495)) — STATED LENGTHS THAT NO FIGURE CAN HAVE, in
 * closed form.
 *
 * A length the student states («|AB| = 5») is a `length` pin; a relation between two lengths («|AB| = |BC|», the sides of
 * a «ריבוע», «|AB| = 2|CD|») is a `length-rel` pin. Together they fix some segments' lengths exactly, whatever the rest of
 * the figure is. Two facts of the metric hold for ANY points of space, so when the fixed lengths break one of them, the
 * pivot cannot find a figure at any seed and from any start:
 *
 *  - **one value per segment**: two chains of stated lengths and ratios that give one segment two different lengths
 *    («ריבוע ABCD» · «|AB| = 3» · «|BC| = 4»);
 *  - **the triangle inequality**: for every three points P, Q, R, |PR| ≤ |PQ| + |QR| («|AB| = 5» · «|BC| = 3» ·
 *    «|AC| = 9»; a square's diagonal «|AC| = 10» against «|AB| = 3», since |BC| = |AB|).
 *
 * Before, such a line was refused only after every start of the pivot's multi-start ran Levenberg–Marquardt to its
 * iteration bail, at the display seed, at every claim seed and at every seed of the seed search: 13–38 times the work of
 * the dearest accepted line of the same figure (docs/17 §7 rule 2). Here it is read off the pins before the first start.
 *
 * MARGIN. The pivot accepts a candidate whose squared primary residual is under 1e-10, so each length row may be off by
 * 1e-5 and each ratio row by 2e-5 of its lengths. A conflict is reported only when it exceeds {@link CONFLICT_MARGIN} of
 * the lengths involved AND {@link CONFLICT_MARGIN} in absolute terms — far beyond what the rows' slack can absorb — so a
 * pin set this module rejects is one no candidate could have satisfied: the pivot's verdict is the one it always reached,
 * only reached at once. Anything closer is left to the solver, as before.
 */
import type { Construction3, Id, ScalarPin } from './types';

/** See the module note: a conflict smaller than this (relative to the lengths, and absolute) is the solver's to judge. */
export const CONFLICT_MARGIN = 1e-3;

/** The pins a conflict was derived from, by their place in `c.scalarPins`, and what the metric says. */
export type MetricConflict3 =
  | {
      kind: 'triangle';
      /** the three points; `long` is the side longer than the other two together */
      p: Id; q: Id; r: Id;
      long: [Id, Id];
      longLen: number;
      /** the sum of the two other sides */
      sum: number;
      pins: number[];
    }
  | {
      kind: 'value';
      /** the segment given two lengths */
      seg: [Id, Id];
      /** its length as the other pins fix it, and as the conflicting pin states it */
      forced: number;
      stated: number;
      pins: number[];
    };

const segKey = (a: Id, b: Id): string => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);
const segOf = (k: string): [Id, Id] => k.split('\u0000') as [Id, Id];
const differ = (x: number, y: number): boolean => Math.abs(x - y) > CONFLICT_MARGIN * Math.max(Math.abs(x), Math.abs(y), 1);

/**
 * The first metric conflict among the construction's stated lengths, or null. Pure in `c.scalarPins`; cheap (a weighted
 * union–find over the segments the pins name, then the triples of points whose three distances are all fixed).
 */
export function metricConflict3(c: Pick<Construction3, 'scalarPins'>): MetricConflict3 | null {
  const pins = c.scalarPins;
  if (!pins.some((p) => p.kind === 'length')) return null;
  // weighted union–find: |s| = factor(s) · |root(s)|, with the pins each link was made from
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
  const value = new Map<string, { v: number; via: number[] }>(); // root → its length, and the pins that fixed it
  let conflict: MetricConflict3 | null = null;
  const link = (s1: string, s2: string, ratio: number, pin: number): void => {
    // |s1| = ratio · |s2|
    const a = find(s1);
    const b = find(s2);
    if (a.root === b.root) {
      if (differ(a.f, ratio * b.f)) {
        // one segment, two lengths: |s1| = a.f·|root| by one chain and ratio·b.f·|root| by the other (a scale-free ratio
        // conflict, reported against a stated value when the root has one)
        const rv = value.get(a.root);
        if (rv && !conflict) conflict = { kind: 'value', seg: segOf(s1), forced: a.f * rv.v, stated: ratio * b.f * rv.v, pins: [...new Set([...a.via, ...b.via, ...rv.via, pin])] };
      }
      return;
    }
    // root(a) = (ratio · b.f / a.f) · root(b)
    parent.set(a.root, { up: b.root, f: (ratio * b.f) / a.f, via: [...a.via, ...b.via, pin] });
    const va = value.get(a.root);
    if (va) {
      value.delete(a.root);
      const vb = value.get(b.root);
      const asB = va.v / ((ratio * b.f) / a.f);
      if (!vb) value.set(b.root, { v: asB, via: [...va.via, ...a.via, ...b.via, pin] });
      else if (differ(vb.v, asB) && !conflict) {
        conflict = { kind: 'value', seg: segOf(s2), forced: vb.v * b.f, stated: asB * b.f, pins: [...new Set([...vb.via, ...va.via, ...a.via, ...b.via, pin])] };
      }
    }
  };
  pins.forEach((p: ScalarPin, i) => {
    if (p.kind === 'length-rel' && p.c > 0 && Number.isFinite(p.c) && p.a1 !== p.b1 && p.a2 !== p.b2) {
      link(segKey(p.a1, p.b1), segKey(p.a2, p.b2), p.c, i);
    }
  });
  pins.forEach((p: ScalarPin, i) => {
    if (p.kind !== 'length' || !(p.value >= 0) || !Number.isFinite(p.value) || p.a === p.b) return;
    const s = segKey(p.a, p.b);
    if (!parent.has(s)) parent.set(s, { up: s, f: 1, via: [] });
    const { root, f, via } = find(s);
    const v = p.value / f;
    const had = value.get(root);
    if (!had) value.set(root, { v, via: [...via, i] });
    else if (differ(had.v * f, p.value) && Math.abs(had.v * f - p.value) > CONFLICT_MARGIN && !conflict) {
      conflict = { kind: 'value', seg: [p.a, p.b], forced: had.v * f, stated: p.value, pins: [...new Set([...had.via, ...via, i])] };
    }
  });
  if (conflict) return conflict;
  // every segment whose length is now fixed, with the pins that fix it
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
  // the triangle inequality on every triple whose three sides are fixed, in a fixed order (the pins' segments sorted)
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
            pins: [...new Set(sides.flatMap(([, , x]) => x.via))].sort((x, y) => x - y),
          };
        }
      }
    }
  }
  return null;
}
