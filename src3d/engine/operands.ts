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
import { newellNormal, norm3, sub3, type Vec3 } from './vec3';

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
