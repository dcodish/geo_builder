/**
 * Pure R³ vector math for the 3-D tool (docs/20 §6.1).
 *
 * NOTE ON THE CROSS PRODUCT: the Israeli curriculum has NO cross product (docs/20 §3),
 * so it must never surface in anything student-facing. It is used here strictly as an
 * internal computational device (face normals for hidden-edge classification, camera
 * frames) — the same way the 2-D engine uses linear algebra the student never sees.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const v3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

export const add3 = (a: Vec3, b: Vec3): Vec3 => v3(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub3 = (a: Vec3, b: Vec3): Vec3 => v3(a.x - b.x, a.y - b.y, a.z - b.z);
export const scale3 = (a: Vec3, k: number): Vec3 => v3(a.x * k, a.y * k, a.z * k);
export const dot3 = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
/** Internal-only (see file header): never student-facing. */
export const cross3 = (a: Vec3, b: Vec3): Vec3 =>
  v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
export const norm3 = (a: Vec3): number => Math.sqrt(dot3(a, a));
export const dist3 = (a: Vec3, b: Vec3): number => norm3(sub3(a, b));

export function normalize3(a: Vec3): Vec3 {
  const n = norm3(a);
  if (n < 1e-12) throw new Error('normalize3: zero vector');
  return scale3(a, 1 / n);
}

/** Linear interpolation a + t·(b−a) — the on-segment point. */
export const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => add3(a, scale3(sub3(b, a), t));

/** Centroid of a non-empty list of points. */
export function centroid3(ps: Vec3[]): Vec3 {
  const s = ps.reduce(add3, v3(0, 0, 0));
  return scale3(s, 1 / ps.length);
}
