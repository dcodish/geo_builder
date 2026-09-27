/**
 * #1475 (ADR-3D-264) — THE ONE DIHEDRAL GEOMETRY.
 *
 * Everything the canvas draws about the angle between two PLANES hangs on the same three facts: where on
 * the seam the mark sits (`foot`), and the two in-plane arms perpendicular to the seam (`u1` in the first
 * plane, `u2` in the second). Before #1475 two lanes computed them, differently — the named-plane arc put
 * the foot at the seam point nearest the figure's centre, the object-angle arc at the midpoint of the
 * shared edge — and the right-angle knee computed them not at all, so «π1 ניצב ל-π2» drew nothing. One
 * function now answers for the arc lanes (`scene3.ts`), the knee (`rightAngles.ts`), and any later
 * dihedral construction (#1476).
 *
 * Pure and operand-level: it takes resolved {@link OperandGeom}s, so a named plane, a point run and a
 * coordinate plane all arrive the same way; which record produced the pair is not its business.
 */

import { intersectPlanes } from '../engine/evaluate';
import type { OperandGeom } from '../engine/operands';
import type { Id, Operand3 } from '../engine/types';
import { centroid3, cross3, dot3, norm3, normalize3, scale3, sub3, type Vec3 } from '../engine/vec3';
import { projectOntoLine } from './planeGeom';

/** The dihedral between two planes, in WORLD space. */
export interface DihedralGeometry {
  /** The point ON the seam the mark is drawn at. */
  foot: Vec3;
  /** Unit arm lying in the FIRST plane, perpendicular to the seam. */
  u1: Vec3;
  /** Unit arm lying in the SECOND plane, perpendicular to the seam. */
  u2: Vec3;
  /** Unit direction of the seam (the planes' line of intersection). */
  seamDir: Vec3;
  /** A point on the seam other than the foot is `foot + t·seamDir`; the seam's own anchor, for callers that draw it. */
  seamAnchor: Vec3;
}

/** Where to put the foot and which way to point the arms — see {@link dihedralAnchors}. */
export interface DihedralOpts {
  /**
   * Points the two planes SHARE (the common vertices of two point runs, e.g. A and B for ABC and ABB').
   * When present the foot is the seam point nearest their centroid — the shared edge's midpoint, where a
   * textbook draws the mark. Empty ⇒ the seam point nearest `center`.
   */
  shared?: Vec3[];
  /** The fallback anchor for the foot — normally the figure's centroid. */
  center: Vec3;
  /**
   * Each plane's own material (a point-run's centroid): the arm is flipped to point INTO it, so the mark
   * sits on the angle the student can see rather than its vertical opposite. `null` ⇒ left as computed.
   */
  toward?: { a: Vec3 | null; b: Vec3 | null };
}

/**
 * The dihedral geometry of two planar operands, or null when either is not a plane or the two are
 * parallel / coincident (no seam, no dihedral).
 *
 * `u1`/`u2` are the two half-planes' directions away from the seam; the angle between them is the
 * dihedral (or its supplement — a caller drawing a STATED value picks between them; a right angle is
 * the same either way).
 */
export function dihedralGeometry(ga: OperandGeom, gb: OperandGeom, opts: DihedralOpts): DihedralGeometry | null {
  if (!ga.normal || !gb.normal || ga.d === undefined || gb.d === undefined) return null;
  if (ga.dir || gb.dir) return null; // a line-ish operand is not a plane
  const seam = intersectPlanes({ n: ga.normal, d: ga.d }, { n: gb.normal, d: gb.d });
  if (!seam) return null; // parallel or coincident — there is no dihedral
  const seamDir = normalize3(seam.dir);
  const shared = opts.shared ?? [];
  const foot = projectOntoLine(shared.length ? centroid3(shared) : opts.center, seam);
  const c1 = cross3(normalize3(ga.normal), seamDir);
  const c2 = cross3(normalize3(gb.normal), seamDir);
  if (norm3(c1) < 1e-9 || norm3(c2) < 1e-9) return null;
  const orient = (u: Vec3, mat: Vec3 | null | undefined): Vec3 => (mat && dot3(u, sub3(mat, foot)) < 0 ? scale3(u, -1) : u);
  return {
    foot,
    u1: orient(normalize3(c1), opts.toward?.a),
    u2: orient(normalize3(c2), opts.toward?.b),
    seamDir,
    seamAnchor: seam.anchor,
  };
}

/**
 * The {@link DihedralOpts} anchors an OPERAND pair supplies: the vertices two point runs share, and each
 * point run's centroid as its material. A named or coordinate plane has neither (its geometry is the
 * equation alone), so it contributes nothing and the foot falls back to the seam point nearest `center`.
 */
export function dihedralAnchors(
  a: Operand3,
  b: Operand3,
  at: (id: Id) => Vec3 | null,
): { shared: Vec3[]; toward: { a: Vec3 | null; b: Vec3 | null } } {
  const runOf = (op: Operand3): Id[] => (op.kind === 'plane-run' ? op.ids : []);
  const pts = (ids: Id[]) => ids.map(at).filter((p): p is Vec3 => !!p);
  const ra = runOf(a);
  const rb = runOf(b);
  const material = (ids: Id[]) => {
    const p = pts(ids);
    return p.length ? centroid3(p) : null;
  };
  return { shared: pts(ra.filter((id) => rb.includes(id))), toward: { a: material(ra), b: material(rb) } };
}
