/**
 * #1188 (ADR-3D-386) — WHERE A FREE VECTOR FLOATS. Display, never geometry.
 *
 * A free vector («וקטור u», «u = (1,2,3)») has a direction and a length and NO position — that is the first thing
 * the vectors unit teaches. The operator's ruling (2026-09-20): it is DRAWN, floating and visibly unanchored, never
 * from the origin and never at a point. So its tail is chosen HERE, in the renderer, every time the scene is built,
 * from the figure as it is drawn now. Nothing this module computes is stored, is knowledge, is a basis member or is a
 * DOF: the angle-mark (ADR-3D-043) and draw-arrow (ADR-3D-039) precedents — display that drives nothing.
 *
 * The TRAY: the free vectors in declaration order, each in its own band, stacked UP (world z, which is the screen's
 * vertical at every yaw of the orbit camera) and set to the +x side of the figure's bounding box with a gap scaled by
 * their lengths. On an empty canvas the tray is centred on the origin. World space, so an arrow keeps its 3-D
 * direction as the camera turns; the scene's fit includes every tail and head, so nothing floats out of frame.
 *
 * #1188 step 3 ([ADR-3D-390](../../docs/06b-decisions-3d.md#adr-3d-390)) — THE HEAD-TO-TAIL PICTURE (operator rulings
 * 2026-10-06: a stated sum draws the triangle automatically; every linear combination follows the same rule). A
 * stated combination R = c₁x₁ + … + cₙxₙ (n ≥ 2: a free vector's definition, or an equation with one side a single
 * vector) is drawn as a chain: each term cᵢxᵢ an arrow, head to tail, starting at R's tail, and R closes it.
 * Deterministic, in statement order:
 *  - R's tail: where R already is; else x₁'s tail; else x₁ takes a band of the tray and R sits at its tail;
 *  - an unplaced x₁ with c₁ = 1 sits at R's tail and IS the first link; otherwise the first link is a COPY of c₁x₁;
 *  - x₂…xₙ are always COPIES, chained; an anchored x₁ («AB», a «נסמן» vector) anchors the chain at its tail point.
 * A COPY is display-only: not a vector, not in any engine structure, no label, never knowledge — derived here each
 * time from the values the engine resolved, so it follows u when u moves.
 */
import type { Construction3, VecAtom, VecExpr } from '../engine/types';
import { norm3, v3, type Vec3 } from '../engine/vec3';

export interface FreeVectorPlacement3 {
  name: string;
  /** Declaration order — the free-vector palette index, so u, v and w keep their hues. */
  index: number;
  tail: Vec3;
  head: Vec3;
}

/** #1188 step 3: one display-only link of a head-to-tail chain — the term `coeff·of`, drawn at `tail`. */
export interface FreeVectorCopy3 {
  /** the vector the link copies (a free name, a «נסמן» name, or a pair «AB») */
  of: string;
  /** the source's free-vector palette index, so the copy wears its hue; undefined for an anchored source */
  index?: number;
  coeff: number;
  tail: Vec3;
  head: Vec3;
}

export interface FreeVectorScene3 {
  vectors: FreeVectorPlacement3[];
  copies: FreeVectorCopy3[];
}

type Resolved = { positions: ReadonlyMap<string, Vec3>; freeVectors: ReadonlyMap<string, Vec3> };
type LayoutC = Pick<Construction3, 'freeVectors'> & Partial<Pick<Construction3, 'freeVecEqs' | 'vectors' | 'claims'>>;

/** The free vectors' placements (the tray, and the chains' vectors). */
export function layoutFreeVectors3(c: LayoutC, resolved: Resolved): FreeVectorPlacement3[] {
  return layoutFreeVectorScene3(c, resolved).vectors;
}

/** Where a vector stands before the tray is laid out: in a tray GROUP at an offset from its root, or in the world. */
type Loc = { group: number; off: Vec3 } | { group: 'world'; off: Vec3 };
const add = (a: Vec3, b: Vec3): Vec3 => v3(a.x + b.x, a.y + b.y, a.z + b.z);
const mul = (a: Vec3, k: number): Vec3 => v3(a.x * k, a.y * k, a.z * k);
const sameLoc = (a: Loc, b: Loc): boolean => a.group === b.group && Math.abs(a.off.x - b.off.x) + Math.abs(a.off.y - b.off.y) + Math.abs(a.off.z - b.off.z) < 1e-12;

export function layoutFreeVectorScene3(c: LayoutC, resolved: Resolved): FreeVectorScene3 {
  const names = [...c.freeVectors.keys()];
  const indexOf = new Map(names.map((n, i) => [n, i]));
  const valueOf = (n: string): Vec3 | undefined => {
    const d = resolved.freeVectors.get(n);
    return d && norm3(d) > 1e-9 ? d : undefined;
  };
  const atomValue = (a: VecAtom): Vec3 | undefined => {
    if (a.kind === 'named' && c.freeVectors.has(a.name)) return resolved.freeVectors.get(a.name);
    const pair = a.kind === 'pair' ? a : c.vectors?.get(a.name);
    const p = pair && resolved.positions.get(pair.from);
    const q = pair && resolved.positions.get(pair.to);
    return p && q ? v3(q.x - p.x, q.y - p.y, q.z - p.z) : undefined;
  };
  const atomLabel = (a: VecAtom): string => (a.kind === 'named' ? a.name : `${a.from}${a.to}`);

  // the stated combinations, in statement order: definitions, then equations with one single-vector side
  const sums: { r: VecAtom; terms: VecExpr }[] = [];
  for (const [name, fv] of c.freeVectors) if (fv.def && fv.def.length >= 2) sums.push({ r: { kind: 'named', name }, terms: fv.def });
  // ADR-3D-390 Am. 1: a line whose free vectors were eliminated to a figure relation is still the combination stated
  const statedEqs = (c.claims ?? []).flatMap((k) => (k.type === 'vec-eq' && k.stated ? [k.stated] : []));
  for (const eq of [...(c.freeVecEqs ?? []), ...statedEqs]) {
    for (const [side, other] of [[eq.lhs, eq.rhs], [eq.rhs, eq.lhs]] as const) {
      if (side.length === 1 && Math.abs(side[0].coeff - 1) < 1e-12 && other.length >= 2) {
        sums.push({ r: side[0].atom, terms: other });
        break;
      }
    }
  }

  const loc = new Map<string, Loc>();
  const roots: string[] = []; // a tray group per root, numbered by position here
  const copiesAt: { group: Loc['group']; off: Vec3; d: Vec3; of: string; index?: number; coeff: number }[] = [];
  const locOfAtom = (a: VecAtom): Loc | undefined => {
    if (a.kind === 'named' && c.freeVectors.has(a.name)) return loc.get(a.name);
    const pair = a.kind === 'pair' ? a : c.vectors?.get(a.name);
    const p = pair && resolved.positions.get(pair.from);
    return p ? { group: 'world', off: p } : undefined;
  };
  const newRoot = (n: string): Loc => {
    roots.push(n);
    const l: Loc = { group: roots.length - 1, off: v3(0, 0, 0) };
    loc.set(n, l);
    return l;
  };
  for (const { r, terms } of sums) {
    const vals = terms.map((t) => atomValue(t.atom));
    if (vals.some((v) => !v) || !atomValue(r)) continue; // nothing to draw this configuration
    const [x1] = terms;
    const x1Free = x1.atom.kind === 'named' && c.freeVectors.has(x1.atom.name);
    let rl = locOfAtom(r);
    if (!rl) {
      rl = locOfAtom(x1.atom) ?? (x1Free && valueOf((x1.atom as { name: string }).name) ? newRoot((x1.atom as { name: string }).name) : undefined);
      if (!rl) continue;
      if (r.kind === 'named') loc.set(r.name, rl);
    }
    if (x1Free && Math.abs(x1.coeff - 1) < 1e-12 && !loc.has((x1.atom as { name: string }).name)) loc.set((x1.atom as { name: string }).name, rl);
    // the first link is x₁ itself when it is DRAWN as a vector (a free one, or a «נסמן» arrow) standing at R's tail with
    // coefficient 1; a bare pair is not drawn as an arrow, so it gets a copy
    const l1 = locOfAtom(x1.atom);
    const drawnAsVector = x1Free || (x1.atom.kind === 'named' && !!c.vectors?.has(x1.atom.name));
    const firstIsItself = drawnAsVector && Math.abs(x1.coeff - 1) < 1e-12 && !!l1 && sameLoc(l1, rl);
    let cursor = rl.off;
    terms.forEach((t, i) => {
      const d = mul(vals[i]!, t.coeff);
      if (!(i === 0 && firstIsItself)) {
        const src = t.atom.kind === 'named' ? indexOf.get(t.atom.name) : undefined;
        copiesAt.push({ group: rl!.group, off: cursor, d, of: atomLabel(t.atom), ...(src !== undefined ? { index: src } : {}), coeff: t.coeff });
      }
      cursor = add(cursor, d);
    });
  }
  // every free vector no chain placed takes its own band of the tray
  for (const n of names) if (!loc.has(n) && valueOf(n)) newRoot(n);

  // ---- the tray: one band per group, its extent the union of everything drawn relative to its root's tail
  const pts = [...resolved.positions.values()];
  const hasFigure = pts.length > 0;
  const lo = (k: 'x' | 'y' | 'z') => (hasFigure ? Math.min(...pts.map((p) => p[k])) : 0);
  const hi = (k: 'x' | 'y' | 'z') => (hasFigure ? Math.max(...pts.map((p) => p[k])) : 0);
  const segsOf = (g: number): [Vec3, Vec3][] => [
    ...names.filter((n) => loc.get(n)?.group === g && valueOf(n)).map((n) => [loc.get(n)!.off, add(loc.get(n)!.off, valueOf(n)!)] as [Vec3, Vec3]),
    ...copiesAt.filter((k) => k.group === g).map((k) => [k.off, add(k.off, k.d)] as [Vec3, Vec3]),
  ];
  const ext = roots.map((_, g) => {
    const ps = segsOf(g).flat();
    const all = [v3(0, 0, 0), ...ps];
    return {
      lo: v3(Math.min(...all.map((p) => p.x)), Math.min(...all.map((p) => p.y)), Math.min(...all.map((p) => p.z))),
      hi: v3(Math.max(...all.map((p) => p.x)), Math.max(...all.map((p) => p.y)), Math.max(...all.map((p) => p.z))),
    };
  });
  const tailOf = new Map<number, Vec3>();
  if (roots.length > 0) {
    const longest = Math.max(...roots.map((_, g) => Math.max(...segsOf(g).map(([a, b]) => norm3(v3(b.x - a.x, b.y - a.y, b.z - a.z))))));
    const gap = 0.4 * Math.max(longest, 0.5);
    const x0 = hasFigure ? hi('x') + gap : 0;
    const yMid = (lo('y') + hi('y')) / 2;
    const zMid = (lo('z') + hi('z')) / 2;
    // stack the bands upward, then centre the stack on the figure's mid-height (or the origin)
    let cursor = 0;
    const bandTail: number[] = [];
    for (const e of ext) {
      bandTail.push(cursor - e.lo.z);
      cursor += e.hi.z - e.lo.z + gap;
    }
    const stackShift = zMid - (cursor - gap) / 2;
    ext.forEach((e, g) => tailOf.set(g, v3(x0 - e.lo.x, yMid - (e.lo.y + e.hi.y) / 2, stackShift + bandTail[g])));
    if (!hasFigure) {
      // nothing to sit beside: centre the tray's x-extent on the origin too
      const xs = ext.flatMap((e, g) => [tailOf.get(g)!.x + e.lo.x, tailOf.get(g)!.x + e.hi.x]);
      const shift = -(Math.min(...xs) + Math.max(...xs)) / 2;
      for (const [g, t] of tailOf) tailOf.set(g, v3(t.x + shift, t.y, t.z));
    }
  }
  const world = (l: { group: Loc['group']; off: Vec3 }): Vec3 => (l.group === 'world' ? l.off : add(tailOf.get(l.group)!, l.off));
  const vectors: FreeVectorPlacement3[] = [];
  for (const n of names) {
    const l = loc.get(n);
    const d = valueOf(n);
    if (!l || !d) continue;
    const tail = world(l);
    vectors.push({ name: n, index: indexOf.get(n)!, tail, head: add(tail, d) });
  }
  const copies: FreeVectorCopy3[] = copiesAt
    .filter((k) => norm3(k.d) > 1e-9)
    .map((k) => {
      const tail = world(k);
      return { of: k.of, ...(k.index !== undefined ? { index: k.index } : {}), coeff: k.coeff, tail, head: add(tail, k.d) };
    });
  return { vectors, copies };
}
