/**
 * The bounded symbolic vector layer (docs/20 §6.2) — "linear algebra lite".
 *
 * A vector expression is a linear combination over atoms (declared names or
 * point pairs). Everything here is NUMERIC evaluation at sampled configurations
 * — decomposition in a basis is one 3×3 Cramer solve. Explicitly NO CAS
 * (operator hard boundary, docs/20 D3): no symbolic manipulation, no equation
 * solving beyond what is closed-form here.
 */

import { cross3, dot3, sub3, v3, type Vec3 } from './vec3';
import type { Construction3, FreeVec3, Id, Positions3, VecAtom, VecExpr } from './types';

/** The world vector an atom denotes at these positions, or null if unresolvable. */
export function atomVec(atom: VecAtom, c: Construction3, pos: Positions3): Vec3 | null {
  if (atom.kind === 'named') {
    const def = c.vectors.get(atom.name);
    if (!def) return null;
    const a = pos.get(def.from);
    const b = pos.get(def.to);
    return a && b ? sub3(b, a) : null;
  }
  const a = pos.get(atom.from);
  const b = pos.get(atom.to);
  return a && b ? sub3(b, a) : null;
}

/** Evaluate Σ coeff·atom, or null if any atom is unresolvable. */
export function evalExpr(expr: VecExpr, c: Construction3, pos: Positions3): Vec3 | null {
  let acc = v3(0, 0, 0);
  for (const { coeff, atom } of expr) {
    const w = atomVec(atom, c, pos);
    if (!w) return null;
    acc = v3(acc.x + coeff * w.x, acc.y + coeff * w.y, acc.z + coeff * w.z);
  }
  return acc;
}

/** The triple product a·(b×c) — the 3×3 determinant. Internal device (never student-facing). */
const det3 = (a: Vec3, b: Vec3, c: Vec3): number => dot3(a, cross3(b, c));

/**
 * Decompose `target` over the basis (b1,b2,b3) by Cramer's rule.
 * Returns null when the three vectors are (numerically) dependent — not a basis.
 */
export function decompose3(target: Vec3, b1: Vec3, b2: Vec3, b3: Vec3): [number, number, number] | null {
  const d = det3(b1, b2, b3);
  const scale = Math.abs(det3(
    v3(Math.hypot(b1.x, b2.x, b3.x), 0, 0),
    v3(0, Math.hypot(b1.y, b2.y, b3.y), 0),
    v3(0, 0, Math.hypot(b1.z, b2.z, b3.z)),
  ));
  if (Math.abs(d) < 1e-9 * Math.max(scale, 1e-12)) return null;
  return [det3(target, b2, b3) / d, det3(b1, target, b3) / d, det3(b1, b2, target) / d];
}

/** All ids a vector expression references (for apply-time validation). */
export function exprPointIds(expr: VecExpr): Id[] {
  return expr.flatMap((t) => (t.atom.kind === 'pair' ? [t.atom.from, t.atom.to] : []));
}

/** All declared-vector names an expression references. */
export function exprVectorNames(expr: VecExpr): string[] {
  return expr.flatMap((t) => (t.atom.kind === 'named' ? [t.atom.name] : []));
}

/**
 * #1188 (ADR-3D-386) — WHAT IS THE VECTOR NAMED `name`? Asked here, and only here, by every VALUE reader.
 *
 * A name lives in one of two sibling stores: `c.vectors` (anchored — a point pair, «נסמן: AB = u») or
 * `c.freeVectors` (free — components and no position, «וקטור u»). Position readers (the renderer's shafts, the
 * pivot's pair residuals, right-angle marks, segment carriers) keep reading `c.vectors`, because a free vector has
 * no position for them to read; a reader that wants the VALUE asks here, so a free vector cannot fall through a
 * `c.vectors.has` check into "unknown". The direct reads that remain are counted by the ratchet in
 * `issue-1188-free-vector.test.ts`, which may only go down.
 */
export function namedVector3(
  c: Pick<Construction3, 'vectors' | 'freeVectors'>,
  name: string,
): { kind: 'anchored'; from: Id; to: Id } | { kind: 'free'; def: FreeVec3 } | undefined {
  const pair = c.vectors.get(name);
  if (pair) return { kind: 'anchored', from: pair.from, to: pair.to };
  const def = c.freeVectors.get(name);
  return def ? { kind: 'free', def } : undefined;
}

/** #1188: is `name` a FREE vector (no position)? */
export const isFreeVector3 = (c: Pick<Construction3, 'freeVectors'>, name: string): boolean => c.freeVectors.has(name);

/** #1188: every declared vector name — anchored first, then free, each in declaration order. */
export const vectorNames3 = (c: Pick<Construction3, 'vectors' | 'freeVectors'>): string[] => [...c.vectors.keys(), ...c.freeVectors.keys()];

/**
 * #1188 (ADR-3D-386) — the VALUE an atom denotes in one configuration: a pair's or an anchored name's tail→head,
 * or a free vector's components at this seed (`Resolved3.freeVectors`). Undefined when unresolvable.
 */
export function vectorValue3(
  c: Pick<Construction3, 'vectors' | 'freeVectors'>,
  at: { positions: Positions3; freeVectors: ReadonlyMap<string, Vec3> },
  atom: VecAtom,
): Vec3 | undefined {
  if (atom.kind === 'named') {
    const nv = namedVector3(c, atom.name);
    if (!nv) return undefined;
    if (nv.kind === 'free') return at.freeVectors.get(atom.name);
    const a = at.positions.get(nv.from);
    const b = at.positions.get(nv.to);
    return a && b ? sub3(b, a) : undefined;
  }
  const a = at.positions.get(atom.from);
  const b = at.positions.get(atom.to);
  return a && b ? sub3(b, a) : undefined;
}
