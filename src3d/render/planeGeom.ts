/**
 * Small plane/line geometry shared by the renderer's layers (`scene3` and the
 * right-angle collector). Split out of `scene3.ts` so both can use it without an
 * import cycle; the definitions are unchanged.
 */

import type { ResolvedLine, ResolvedPlane } from '../engine/evaluate';
import { add3, cross3, dot3, normalize3, scale3, sub3, v3, type Vec3 } from '../engine/vec3';

/** A stable in-plane orthonormal basis for a plane's patch. */
export function planeBasis(n: Vec3): { e1: Vec3; e2: Vec3 } {
  const nn = normalize3(n);
  const seed = Math.abs(nn.x) < 0.9 ? v3(1, 0, 0) : v3(0, 1, 0);
  const e1 = normalize3(cross3(nn, seed));
  return { e1, e2: normalize3(cross3(nn, e1)) };
}

export const projectOntoPlane = (p: Vec3, pl: ResolvedPlane): Vec3 =>
  sub3(p, scale3(pl.n, (dot3(pl.n, p) + pl.d) / dot3(pl.n, pl.n)));

export const projectOntoLine = (p: Vec3, ln: ResolvedLine): Vec3 =>
  add3(ln.anchor, scale3(ln.dir, dot3(sub3(p, ln.anchor), ln.dir) / Math.max(dot3(ln.dir, ln.dir), 1e-12)));
