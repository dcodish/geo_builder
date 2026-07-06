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
import type { Construction3, Id, Positions3, VecAtom, VecExpr } from './types';

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
