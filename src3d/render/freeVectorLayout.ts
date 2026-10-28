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
 */
import type { Construction3 } from '../engine/types';
import { norm3, v3, type Vec3 } from '../engine/vec3';

export interface FreeVectorPlacement3 {
  name: string;
  /** Declaration order — the free-vector palette index, so u, v and w keep their hues. */
  index: number;
  tail: Vec3;
  head: Vec3;
}

export function layoutFreeVectors3(
  c: Pick<Construction3, 'freeVectors'>,
  resolved: { positions: ReadonlyMap<string, Vec3>; freeVectors: ReadonlyMap<string, Vec3> },
): FreeVectorPlacement3[] {
  const items = [...c.freeVectors.keys()]
    .map((name, index) => ({ name, index, d: resolved.freeVectors.get(name) }))
    .filter((it): it is { name: string; index: number; d: Vec3 } => !!it.d && norm3(it.d) > 1e-9);
  if (items.length === 0) return [];

  const pts = [...resolved.positions.values()];
  const hasFigure = pts.length > 0;
  const lo = (k: 'x' | 'y' | 'z') => (hasFigure ? Math.min(...pts.map((p) => p[k])) : 0);
  const hi = (k: 'x' | 'y' | 'z') => (hasFigure ? Math.max(...pts.map((p) => p[k])) : 0);
  const longest = Math.max(...items.map((it) => norm3(it.d)));
  const gap = 0.4 * Math.max(longest, 0.5);

  // each vector's own extent relative to its tail: [min(0, d), max(0, d)] per axis
  const ext = items.map(({ d }) => ({
    lo: v3(Math.min(0, d.x), Math.min(0, d.y), Math.min(0, d.z)),
    hi: v3(Math.max(0, d.x), Math.max(0, d.y), Math.max(0, d.z)),
  }));
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
  let out = items.map((it, i) => {
    const e = ext[i];
    const tail = v3(x0 - e.lo.x, yMid - (e.lo.y + e.hi.y) / 2, stackShift + bandTail[i]);
    return { name: it.name, index: it.index, tail, head: v3(tail.x + it.d.x, tail.y + it.d.y, tail.z + it.d.z) };
  });
  if (!hasFigure) {
    // nothing to sit beside: centre the tray's x-extent on the origin too
    const xs = out.flatMap((p) => [p.tail.x, p.head.x]);
    const shift = -(Math.min(...xs) + Math.max(...xs)) / 2;
    out = out.map((p) => ({ ...p, tail: v3(p.tail.x + shift, p.tail.y, p.tail.z), head: v3(p.head.x + shift, p.head.y, p.head.z) }));
  }
  return out;
}
