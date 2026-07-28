/**
 * The OPERAND RESOLVER — S1 of the relations program (docs/26 v2 §3.2, #378).
 *
 * One seam answering "what does this operand mean geometrically", for every consumer: the solver's
 * residual builders, the claim checker, apply's existence checks, and (through them) the marks
 * collector. An operand resolves to a THUNK, because drive residuals evaluate at CANDIDATE positions
 * inside the LM loop, not final ones:
 *
 *  - ABSOLUTE operands (a parametric line, an equation plane) ignore `at` and close over their
 *    resolved geometry — the figure moves around them, never they around the figure;
 *  - GAUGE operands (a segment of a solid, a point-run plane) recompute from `at` on every call —
 *    the `planeLinePerps` pattern ([ADR-3D-100]).
 *
 * The same distinction is the FRAME CLASSIFIER (docs/26 §2.3): whether a relation instance may be
 * solved with the gauge frozen is decided by `isAbsolute` over its operands, never by its pin kind.
 */

import type { Construction3, Id, Operand3 } from './types';
import type { ResolvedLine, ResolvedPlane } from './evaluate';
import { cross3, dot3, newellNormal, norm3, sub3, type Vec3 } from './vec3';

/** What an operand contributes to a residual: a location, a direction, and/or an oriented plane. */
export interface OperandGeom {
  /** A representative point ON the operand (a point itself, a segment endpoint, a line anchor…). */
  point?: Vec3;
  /** A direction ALONG the operand (segment/vector/line) — unnormalized; callers normalize. */
  dir?: Vec3;
  /** The operand's plane, when it is one: unnormalized normal + offset (n·x + d = 0). */
  normal?: Vec3;
  d?: number;
}

export type OperandThunk = (at: (id: Id) => Vec3 | null) => OperandGeom | null;

/** Context the resolver needs for the ABSOLUTE operand kinds (resolved once, closed over). */
export interface AbsoluteCtx {
  lines: ReadonlyMap<string, ResolvedLine>;
  planes: ReadonlyMap<string, ResolvedPlane>;
}

/**
 * Is the operand stated in absolute coordinates — i.e. does relating a gauge object to it require the
 * figure to MOVE ([ADR-3D-095]/[ADR-3D-100])? A named line/plane is absolute; everything named by
 * point ids rides the gauge.
 */
export const isAbsolute = (op: Operand3): boolean => op.kind === 'line' || op.kind === 'plane-named';

/** Resolve an operand to its geometry thunk. Null geometry (missing point, unknown name) at call time
 *  means "not answerable at these positions" — callers treat it exactly like a missing reference. */
export function resolveOperand(op: Operand3, c: Construction3, abs: AbsoluteCtx): OperandThunk {
  switch (op.kind) {
    case 'point':
      return (at) => {
        const p = at(op.id);
        return p ? { point: p } : null;
      };
    case 'segment':
      return (at) => {
        const a = at(op.a);
        const b = at(op.b);
        return a && b ? { point: a, dir: sub3(b, a) } : null;
      };
    case 'vector': {
      const def = c.vectors.get(op.name);
      if (!def) return () => null;
      const { from, to } = def;
      return (at) => {
        const a = at(from);
        const b = at(to);
        return a && b ? { point: a, dir: sub3(b, a) } : null;
      };
    }
    case 'line': {
      const ln = abs.lines.get(op.name);
      if (!ln) return () => null;
      const geom: OperandGeom = { point: ln.anchor, dir: ln.dir };
      return () => geom;
    }
    case 'plane-run':
      return (at) => {
        const pts = op.ids.map(at);
        if (pts.some((p) => !p)) return null;
        const ring = pts as Vec3[];
        const n = newellNormal(ring);
        if (norm3(n) < 1e-12) return null; // the run does not span a plane at these positions
        return { point: ring[0], normal: n, d: -(n.x * ring[0].x + n.y * ring[0].y + n.z * ring[0].z) };
      };
    case 'plane-named': {
      const pl = abs.planes.get(op.name);
      if (!pl) return () => null;
      const geom: OperandGeom = { normal: pl.n, d: pl.d };
      return () => geom;
    }
  }
}

/** S2 (#378): does this equation plane's NORMAL carry the figure parameter? (The offset `d` alone
 *  cannot change a direction relation, so it deliberately does not count.) */
export const planeNormalCarriesParam = (c: Construction3, name: string): boolean => {
  const def = c.planes.get(name);
  return !!def && (def.cx.p !== 0 || def.cy.p !== 0 || def.cz.p !== 0);
};

/** S2 (#378): does this named line's DIRECTION carry the figure parameter? A parametric line's
 *  anchor alone doesn't count (∥/⟂/angle read the direction only); a plane∩plane line inherits
 *  from its planes' normals. Derived kinds (common-perp, projection, through) stay `false` —
 *  their relations live in the claim lane. */
export const lineDirCarriesParam = (c: Construction3, name: string): boolean => {
  const def = c.lines.get(name);
  if (!def) return false;
  if (def.kind === 'parametric') return def.dir.some((e) => e.p !== 0);
  if (def.kind === 'plane-plane') return planeNormalCarriesParam(c, def.p1) || planeNormalCarriesParam(c, def.p2);
  return false;
};

/**
 * S2 (#378, ADR-3D-103): the scalar MISALIGNMENT of a line-rel instance — 0 ⟺ the relation holds
 * exactly, `null` when the geometry is degenerate/unresolvable. ONE answer for every consumer
 * (the drive's unmet trigger, the claim checker, tests), so the drive and the verify can never
 * disagree about what the relation means.
 *
 * A DIRECTIONAL operand (segment/vector/line — `geom.dir`) relates its direction to the line's:
 * ⟂ ⇒ |cos|, ∥ ⇒ |sin|, angle ⇒ ||cos| − cos(deg)| (angles between lines are undirected, ≤ 90°).
 * A PLANAR operand (`geom.normal`) relates the LINE to the PLANE through the normal:
 * plane ⟂ line ⇒ normal ∥ dir ⇒ |sin|; line ∥ plane ⇒ dir ⟂ normal ⇒ |cos|; and the line↔plane
 * angle is the formula sheet's sin β = |n·u|/(|n||u|) ⇒ ||cos(n,u)| − sin(deg)|.
 */
export function lineRelDeviation(
  rel: 'perp' | 'parallel' | 'angle',
  deg: number | undefined,
  geom: OperandGeom,
  lineDir: Vec3,
): number | null {
  const planar = !geom.dir && !!geom.normal;
  const d = geom.dir ?? geom.normal;
  if (!d) return null;
  const den = norm3(d) * norm3(lineDir);
  if (den < 1e-12) return null;
  const cos = Math.abs(dot3(d, lineDir)) / den;
  const sin = norm3(cross3(d, lineDir)) / den;
  if (rel === 'perp') return planar ? sin : cos;
  if (rel === 'parallel') return planar ? cos : sin;
  const target = ((deg ?? 0) * Math.PI) / 180;
  return Math.abs(cos - (planar ? Math.sin(target) : Math.cos(target)));
}
