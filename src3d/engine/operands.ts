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

import type { ComponentTarget, Construction3, Id, MutualRel3, Operand3 } from './types';
import type { ResolvedLine, ResolvedPlane } from './evaluate';
import { cross3, dot3, runNormal, norm3, sub3, v3, type Vec3 } from './vec3';

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
export const isAbsolute = (op: Operand3): boolean =>
  op.kind === 'line' || op.kind === 'plane-named' || op.kind === 'plane-coord' || op.kind === 'axis';

/**
 * #512 — is this operand a PLANE? Asked by every rule that needs a plane on one side, and shared for
 * the same reason the operand set itself is: each rule spelled `plane-run || plane-named` inline, so
 * adding a third plane kind would have left the coordinate plane readable and still refused by ⟂ and
 * ∥ — one missing set member surfacing again, one layer up.
 */
export const isPlanar = (op: Operand3): boolean =>
  op.kind === 'plane-run' || op.kind === 'plane-named' || op.kind === 'plane-coord';

/**
 * #500 (ADR-3D-124 Am. 2): is the operand fixed by its OWN definition — so a relation stated about it
 * could never have driven anything? This is a STRICTLY different question from `isAbsolute`, and the
 * two coincided only until the free plane existed:
 *
 *  - `isAbsolute` — does the operand ride the gauge? (the FRAME classifier: may this relation be solved
 *    with the figure frozen). A free plane is absolute — it is named, not built from point ids.
 *  - `isSelfDetermined` — are the operand's numbers knowledge before any relation is stated? A FREE
 *    plane's are not: it is declared with no equation, and the ∥/⟂ relations stated about it are
 *    precisely what `resolveFreePlane` pins it with (engine/freePlane.ts).
 *
 * Ask this one whenever the question is "did this statement add information"; ask `isAbsolute` when the
 * question is "must the figure move to satisfy it". #552 gave `line` its free variant too, so it now
 * carries the same exception a free plane does — a relation stated about a FREE line is precisely what
 * `resolveFreeLine` pins it with, never redundant.
 */
export const isSelfDetermined = (c: Construction3, op: Operand3): boolean =>
  isAbsolute(op) &&
  !(op.kind === 'plane-named' && c.planes.get(op.name)?.free) &&
  !(op.kind === 'line' && c.lines.get(op.name)?.kind === 'free');

/** #384/#396 (ADR-3D-108): the display label of an operand — the one spelling every panel row,
 *  notice and witness label shares, so an operand can never be named two ways. */
export const operandLabel = (op: Operand3): string =>
  op.kind === 'point' ? op.id
  : op.kind === 'segment' ? `${op.a}${op.b}`
  : op.kind === 'plane-run' ? op.ids.join('')
  : op.kind === 'plane-coord' ? `[${op.axes}]` // #512: the tool's own palette spelling
  : op.kind === 'axis' ? op.axis
  : op.name;

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
        const n = runNormal(ring);
        if (norm3(n) < 1e-12) return null; // the run does not span a plane at these positions
        return { point: ring[0], normal: n, d: -(n.x * ring[0].x + n.y * ring[0].y + n.z * ring[0].z) };
      };
    // #512 — the absolute frame. These are the one operand kind whose geometry does not depend on the
    // figure at all, so unlike every other case the thunk can never return null: the xy-plane is z = 0
    // and the x-axis is the line through the origin along x̂, in every configuration.
    case 'plane-coord': {
      const n = op.axes === 'xy' ? v3(0, 0, 1) : op.axes === 'yz' ? v3(1, 0, 0) : v3(0, 1, 0);
      const geom: OperandGeom = { point: v3(0, 0, 0), normal: n, d: 0 };
      return () => geom;
    }
    case 'axis': {
      const dir = op.axis === 'x' ? v3(1, 0, 0) : op.axis === 'y' ? v3(0, 1, 0) : v3(0, 0, 1);
      const geom: OperandGeom = { point: v3(0, 0, 0), dir };
      return () => geom;
    }
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
  // #801 (ADR-3D-174): "carries THE FIGURE PARAMETER" means the ALGEBRAIC lane's letter. A plane whose
  // coefficients are in a PIN symbol carries a letter the pivot owns, so it neither pins nor is pinned
  // BY the root-find — routing it there would root-find over a value another mechanism already fixed.
  return !!def && !def.sym && (def.cx.p !== 0 || def.cy.p !== 0 || def.cz.p !== 0);
};

/** S2 (#378): does this named line's DIRECTION carry the figure parameter? A parametric line's
 *  anchor alone doesn't count (∥/⟂/angle read the direction only); a plane∩plane line inherits
 *  from its planes' normals. Derived kinds (common-perp, projection, through) stay `false` —
 *  their relations live in the claim lane. */
export const lineDirCarriesParam = (c: Construction3, name: string): boolean => {
  const def = c.lines.get(name);
  if (!def) return false;
  if (def.kind === 'parametric') return !def.sym && def.dir.some((e) => e.p !== 0); // #801: the pin-symbol lane is not this one
  if (def.kind === 'plane-plane') return planeNormalCarriesParam(c, def.p1) || planeNormalCarriesParam(c, def.p2);
  return false;
};

/** #801 (ADR-3D-174): the PIN SYMBOL a named line's numbers are written in — null when the line is not
 *  pin-symbol parametric (numeric, the algebraic lane's, or a derived kind). */
export const lineSym3 = (c: Construction3, name: string): string | null => {
  const def = c.lines.get(name);
  return def?.kind === 'parametric' ? (def.sym ?? null) : null;
};

/** #801: the plane edition of {@link lineSym3}. */
export const planeSym3 = (c: Construction3, name: string): string | null => c.planes.get(name)?.sym ?? null;

/**
 * #801 (ADR-3D-174) — the stated MEMBERSHIPS whose carrier is a pin-symbol object («A on ℓ» where ℓ is
 * «x = (8,-1,-1) + t(k+1,0,k-3)» and the pivot owns k). They can only be driven INSIDE the pivot: the
 * carrier's numbers are a function of the very symbol being solved, so no apply-time lowering to fixed
 * coefficients exists — which is why the ADR-3D-031 Am. drive, gated on the coefficients being literal
 * constants, silently skipped them and the verifier then blamed the student's correct statement.
 *
 * A point that RIDES the carrier (created by this very statement) is seated on it by construction and
 * is never driven — only a point that already existed is.
 */
export function symMemberDrives(c: Construction3): { id: Id; sym: string; line?: string; plane?: string }[] {
  const out: { id: Id; sym: string; line?: string; plane?: string }[] = [];
  for (const m of c.onLines) {
    const sym = lineSym3(c, m.line);
    const def = c.points.get(m.id);
    if (!sym || !def || (def.kind === 'on-line' && def.line === m.line)) continue;
    out.push({ id: m.id, sym, line: m.line });
  }
  for (const m of c.memberships) {
    if (m.side || m.plane === 'any') continue; // a side given is an inequality (sampled + verified)
    const sym = planeSym3(c, m.plane);
    const def = c.points.get(m.id);
    if (!sym || !def || (def.kind === 'on-plane' && def.plane === m.plane)) continue;
    out.push({ id: m.id, sym, plane: m.plane });
  }
  return out;
}

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
  // a named line IS a directional operand — so this is `relDeviation` with the line as side B
  return relDeviation(rel, deg, geom, { dir: lineDir });
}

/** A side's CHARACTERISTIC VECTOR: the direction it runs along, or the normal it is perpendicular to.
 *  `planar` is what decides how the relation reads — see {@link relDeviation}. */
const characteristic = (g: OperandGeom): { v: Vec3; planar: boolean } | null =>
  g.dir ? { v: g.dir, planar: false } : g.normal ? { v: g.normal, planar: true } : null;

/**
 * S3 (#378) — the scalar MISALIGNMENT of a DIRECTION relation (⟂ / ∥ / a stated angle) between ANY
 * two operands, planar or directional. 0 ⟺ the relation holds; `null` when unanswerable.
 *
 * Every such relation reduces to the angle between the two sides' characteristic vectors — a
 * direction for a segment/vector/line, a normal for a plane — with ONE twist: the reading INVERTS
 * exactly when the sides are of different types.
 *
 *  | sides | ⟂ means | ∥ means |
 *  | --- | --- | --- |
 *  | dir × dir | the directions are ⟂ ⇒ \|cos\| = 0 | the directions align ⇒ \|sin\| = 0 |
 *  | plane × plane | the NORMALS are ⟂ ⇒ \|cos\| = 0 | the normals align ⇒ \|sin\| = 0 |
 *  | dir × plane | the line runs ALONG the normal ⇒ \|sin\| = 0 | the line avoids it ⇒ \|cos\| = 0 |
 *
 * So same-type pairs read alike and only the MIXED pair flips — which is why one function serves the
 * whole matrix instead of a rule per cell (`lineRelDeviation` is now literally this with a bare
 * direction as side B). The stated ANGLE follows the same split: between two lines or two planes it
 * is the ordinary \|cos\|, between a line and a plane it is the formula sheet's sin β = \|n·u\|/(\|n\|\|u\|).
 */
export function relDeviation(
  rel: 'perp' | 'parallel' | 'angle',
  deg: number | undefined,
  a: OperandGeom,
  b: OperandGeom,
): number | null {
  const ca = characteristic(a);
  const cb = characteristic(b);
  if (!ca || !cb) return null;
  const den = norm3(ca.v) * norm3(cb.v);
  if (den < 1e-12) return null;
  const cos = Math.abs(dot3(ca.v, cb.v)) / den;
  const sin = norm3(cross3(ca.v, cb.v)) / den;
  const mixed = ca.planar !== cb.planar; // one plane, one direction — the relation reads inverted
  if (rel === 'perp') return mixed ? sin : cos;
  if (rel === 'parallel') return mixed ? cos : sin;
  const target = ((deg ?? 0) * Math.PI) / 180;
  return Math.abs(cos - (mixed ? Math.sin(target) : Math.cos(target)));
}

/**
 * #523 — the MEASURED angle between any two operands, in degrees, by the same reading
 * {@link relDeviation} checks against. Extracted rather than re-derived so a value the panel PRINTS
 * and a value the verifier TESTS can never disagree — the `memberHolds3` / `paramIsKnowledge`
 * precedent. The mixed line×plane pair reads `asin`, the same-type pairs `acos`, exactly as the
 * deviation does; both are the undirected reading (≤ 90°), which is the textbook convention.
 */
export function angleBetweenOperands(a: OperandGeom, b: OperandGeom): number | null {
  const ca = characteristic(a);
  const cb = characteristic(b);
  if (!ca || !cb) return null;
  const den = norm3(ca.v) * norm3(cb.v);
  if (den < 1e-12) return null;
  const cos = Math.min(1, Math.abs(dot3(ca.v, cb.v)) / den);
  const mixed = ca.planar !== cb.planar;
  return ((mixed ? Math.asin(cos) : Math.acos(cos)) * 180) / Math.PI;
}

/**
 * S5 (#378) — the DISTANCE between any two operands, in world units. `null` when either side is
 * unresolvable.
 *
 * Distance is the shortest gap, so it is **0 whenever the objects meet** — two intersecting lines,
 * a line crossing a plane, two non-parallel planes. That is the honest answer, not a special case:
 * the interesting distances are exactly the ones between objects that DON'T meet, which is why the
 * curriculum's four cases are point–plane, point–line, SKEW lines and PARALLEL planes.
 *
 * Unlike every other relation in this program, a distance carries UNITS — so a stated one pins the
 * figure's scale (`PIN_FIXES_SCALE`), and a derived one may only be reported when the scale is
 * already pinned ([ADR-3D-054](../../docs/06b-decisions-3d.md#adr-3d-054)).
 */
export function distanceBetween(a: OperandGeom, b: OperandGeom): number | null {
  const planeDist = (p: Vec3, pl: OperandGeom): number | null => {
    if (!pl.normal || pl.d === undefined) return null;
    const n = norm3(pl.normal);
    return n < 1e-12 ? null : Math.abs(dot3(pl.normal, p) + pl.d) / n;
  };
  const lineDist = (p: Vec3, ln: OperandGeom): number | null => {
    if (!ln.dir || !ln.point) return null;
    const n = norm3(ln.dir);
    return n < 1e-12 ? null : norm3(cross3(sub3(p, ln.point), ln.dir)) / n;
  };
  const isPlane = (g: OperandGeom) => !!g.normal && !g.dir;
  const isLine = (g: OperandGeom) => !!g.dir;
  const isPoint = (g: OperandGeom) => !g.dir && !g.normal && !!g.point;

  // point × anything
  if (isPoint(a)) return isPlane(b) ? planeDist(a.point!, b) : isLine(b) ? lineDist(a.point!, b) : b.point ? norm3(sub3(b.point, a.point!)) : null;
  if (isPoint(b)) return distanceBetween(b, a);

  // line × line — parallel ⇒ point-to-line; skew ⇒ the common-perpendicular gap; crossing ⇒ 0
  if (isLine(a) && isLine(b)) {
    const cx = cross3(a.dir!, b.dir!);
    const cn = norm3(cx);
    if (cn < 1e-12 * norm3(a.dir!) * norm3(b.dir!)) return lineDist(b.point!, a); // parallel
    return Math.abs(dot3(sub3(b.point!, a.point!), cx)) / cn; // 0 exactly when they intersect
  }

  // line × plane — a gap only while the line misses the plane (i.e. runs parallel to it)
  if (isLine(a) && isPlane(b)) {
    return Math.abs(dot3(a.dir!, b.normal!)) > 1e-12 * norm3(a.dir!) * norm3(b.normal!) ? 0 : planeDist(a.point!, b);
  }
  if (isPlane(a) && isLine(b)) return distanceBetween(b, a);

  // plane × plane — a gap only while they are parallel
  if (isPlane(a) && isPlane(b)) {
    const na = norm3(a.normal!);
    const nb = norm3(b.normal!);
    if (na < 1e-12 || nb < 1e-12) return null;
    if (norm3(cross3(a.normal!, b.normal!)) > 1e-12 * na * nb) return 0; // they intersect
    const flip = dot3(a.normal!, b.normal!) < 0 ? -1 : 1;
    return Math.abs(a.d! / na - (flip * b.d!) / nb);
  }
  return null;
}

/**
 * #397 (ADR-3D-108) — the WITNESS of a distance: the pair of closest points [on a, on b], i.e. the
 * segment whose length IS `distanceBetween(a, b)`. The educational realisation of the height/gap the
 * student stated. Case structure mirrors `distanceBetween` exactly (the two must never disagree —
 * a unit lock asserts |witness| = distance on every case). `null` where the distance is (or where
 * the objects meet — a zero gap draws nothing useful).
 */
export function distanceWitness(a: OperandGeom, b: OperandGeom): [Vec3, Vec3] | null {
  const scaleV = (v: Vec3, k: number): Vec3 => v3(v.x * k, v.y * k, v.z * k);
  const addV = (p: Vec3, q: Vec3): Vec3 => v3(p.x + q.x, p.y + q.y, p.z + q.z);
  const planeFoot = (p: Vec3, pl: OperandGeom): Vec3 | null => {
    if (!pl.normal || pl.d === undefined) return null;
    const n2 = dot3(pl.normal, pl.normal);
    if (n2 < 1e-24) return null;
    return addV(p, scaleV(pl.normal, -(dot3(pl.normal, p) + pl.d) / n2));
  };
  const lineFoot = (p: Vec3, ln: OperandGeom): Vec3 | null => {
    if (!ln.dir || !ln.point) return null;
    const d2 = dot3(ln.dir, ln.dir);
    if (d2 < 1e-24) return null;
    return addV(ln.point, scaleV(ln.dir, dot3(sub3(p, ln.point), ln.dir) / d2));
  };
  const isPlane = (g: OperandGeom) => !!g.normal && !g.dir;
  const isLine = (g: OperandGeom) => !!g.dir;
  const isPoint = (g: OperandGeom) => !g.dir && !g.normal && !!g.point;

  if (isPoint(a)) {
    const p = a.point!;
    const q = isPlane(b) ? planeFoot(p, b) : isLine(b) ? lineFoot(p, b) : (b.point ?? null);
    return q ? [p, q] : null;
  }
  if (isPoint(b)) {
    const w = distanceWitness(b, a);
    return w ? [w[1], w[0]] : null;
  }
  if (isLine(a) && isLine(b)) {
    // skew: the common-perpendicular feet (closed form); parallel: any foot pair
    const d1 = a.dir!;
    const d2 = b.dir!;
    const cx = cross3(d1, d2);
    const cn2 = dot3(cx, cx);
    if (cn2 < 1e-24 * dot3(d1, d1) * dot3(d2, d2)) {
      const q = lineFoot(a.point!, b);
      return q ? [a.point!, q] : null;
    }
    const w = sub3(b.point!, a.point!);
    const t1 = dot3(cross3(w, d2), cx) / cn2;
    const t2 = dot3(cross3(w, d1), cx) / cn2;
    return [addV(a.point!, scaleV(d1, t1)), addV(b.point!, scaleV(d2, t2))];
  }
  if (isLine(a) && isPlane(b)) {
    if (Math.abs(dot3(a.dir!, b.normal!)) > 1e-12 * norm3(a.dir!) * norm3(b.normal!)) return null; // they meet — no gap
    const q = planeFoot(a.point!, b);
    return q ? [a.point!, q] : null;
  }
  if (isPlane(a) && isLine(b)) {
    const w = distanceWitness(b, a);
    return w ? [w[1], w[0]] : null;
  }
  if (isPlane(a) && isPlane(b)) {
    if (!a.point) return null;
    const q = planeFoot(a.point, b);
    return q ? [a.point, q] : null;
  }
  return null;
}

/** The figure's size — the yardstick an OFFSET must be measured against to stay scale-free (a gap of
 *  0.01 means something different on a unit cube than on a 100-unit one). Min 1 so an empty or
 *  degenerate figure can never divide by ~0. */
export function figureExtent(pos: ReadonlyMap<Id, Vec3>): number {
  const ps = [...pos.values()];
  if (ps.length === 0) return 1;
  let cx = 0, cy = 0, cz = 0;
  for (const p of ps) { cx += p.x; cy += p.y; cz += p.z; }
  const c = { x: cx / ps.length, y: cy / ps.length, z: cz / ps.length };
  let e = 1;
  for (const p of ps) e = Math.max(e, norm3(sub3(p, c)));
  return e;
}

/**
 * S3 (#378) — how far two PLANES are from being the same plane. Null unless both sides are planar.
 * Coincidence is parallelism PLUS a shared offset, measured relative to the figure's own size so the
 * residual stays scale-free (an offset gap of 0.01 means something different on a unit cube than on
 * a 100-unit one).
 */
export function planeCoincidenceDeviation(a: OperandGeom, b: OperandGeom, extent = 1): number | null {
  if (!a.normal || !b.normal || a.d === undefined || b.d === undefined) return null;
  const na = norm3(a.normal);
  const nb = norm3(b.normal);
  if (na < 1e-12 || nb < 1e-12) return null;
  const par = relDeviation('parallel', undefined, a, b);
  if (par === null) return null;
  // signed offsets of the two unit-normalized planes; the sign of one is flipped when the normals
  // point opposite ways, so an anti-parallel pair of the SAME plane still reads as coincident
  const flip = dot3(a.normal, b.normal) < 0 ? -1 : 1;
  const gap = Math.abs(a.d / na - (flip * b.d) / nb) / Math.max(extent, 1e-12);
  return Math.hypot(par, gap);
}

// ---------------------------------------------------------------------------
// S4 (#378) — MUTUAL POSITION: the complete classification of two located directions
// ---------------------------------------------------------------------------

/** The four mutually exclusive positions two lines can occupy in R³ — a total classification.
 *  Declared in engine/types (commands/claims/requirements name it); this module owns its GEOMETRY. */
export type MutualRel = MutualRel3;

/** The CLOSED members — an equality holds, so they carry a residual and can DRIVE a figure.
 *  `skew` is deliberately absent: it is an OPEN condition (two ≠), gated by sampling, never
 *  least-squared (docs/26 §6 — the requirement lane). */
export type ClosedMutualRel = Exclude<MutualRel, 'skew'>;

/**
 * One side of a mutual-position relation: its geometry plus whether it is BOUNDED.
 *
 * A segment is bounded — «AB ו-CD נחתכים» says the crossing is ON the segments, not somewhere out
 * on their continuations (the 2-D [ADR-166](../../docs/06-decisions.md#adr-166) lesson, R³ edition).
 * A named line is unbounded. The distinction changes only the OPEN half of the verdict (where the
 * crossing falls), never the closed residual, so a drive is unaffected by it.
 */
export interface MutualSide {
  geom: OperandGeom;
  bounded: boolean;
}

/** `bounded` follows from the operand KIND alone — a segment is the only bounded carrier. */
export const isBoundedOperand = (op: Operand3): boolean => op.kind === 'segment';

/** Structural identity of two operands — `AB` and `BA` are the same segment. Used to refuse a
 *  relation stated between an object and itself, which asserts nothing. */
export function sameOperand(a: Operand3, b: Operand3): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'point':
      return a.id === (b as typeof a).id;
    case 'segment': {
      const o = b as typeof a;
      return (a.a === o.a && a.b === o.b) || (a.a === o.b && a.b === o.a);
    }
    case 'vector':
    case 'line':
    case 'plane-named':
      return a.name === (b as typeof a).name;
    case 'plane-run': {
      const o = b as typeof a;
      return a.ids.length === o.ids.length && [...a.ids].sort().join() === [...o.ids].sort().join();
    }
    // #512: `axes` is stored normalised, so structural identity is plain equality — «[yx]» and «[xy]»
    // are the same operand and a relation stated between them is correctly refused as vacuous.
    case 'plane-coord':
      return a.axes === (b as typeof a).axes;
    case 'axis':
      return a.axis === (b as typeof a).axis;
  }
}

/**
 * Build the two sides of a mutual-position question from an operand pair, at given positions —
 * the ONE place the operand→side conversion happens, so the drive residual, the claim checker and
 * the requirement gate cannot differ about what «AB» means. Null when either side is unresolvable
 * or carries no direction (a point, a plane — neither has a mutual position with a line).
 */
export function mutualSides(
  a: Operand3,
  b: Operand3,
  c: Construction3,
  abs: AbsoluteCtx,
  at: (id: Id) => Vec3 | null,
): [MutualSide, MutualSide] | null {
  const ga = resolveOperand(a, c, abs)(at);
  const gb = resolveOperand(b, c, abs)(at);
  if (!ga?.dir || !ga.point || !gb?.dir || !gb.point) return null;
  return [
    { geom: ga, bounded: isBoundedOperand(a) },
    { geom: gb, bounded: isBoundedOperand(b) },
  ];
}

/** Tolerance for "these directions are the same" / "these lines meet" — all residuals below are
 *  normalized to be scale-free, so one dimensionless tolerance serves every figure size. */
const MUTUAL_TOL = 1e-7;

interface MutualParts {
  /** sin of the angle between the directions — 0 ⟺ parallel. */
  sin: number;
  /** normalized triple product — 0 ⟺ the two lines are coplanar (they meet, or are parallel). */
  coplanar: number;
  /** normalized distance of side 2's anchor from side 1's line — 0 ⟺ the anchor lies on it. */
  anchorOff: number;
  /** the crossing's parameter along each side, in units of that side's `dir` (null when parallel). */
  t1: number | null;
  t2: number | null;
}

/** The scale-free scalars every mutual-position question is answered from. */
function mutualParts(g1: OperandGeom, g2: OperandGeom): MutualParts | null {
  const d1 = g1.dir;
  const d2 = g2.dir;
  const p1 = g1.point;
  const p2 = g2.point;
  if (!d1 || !d2 || !p1 || !p2) return null;
  const n1 = norm3(d1);
  const n2 = norm3(d2);
  if (n1 < 1e-12 || n2 < 1e-12) return null;

  const w = sub3(p2, p1);
  const cx = cross3(d1, d2);
  const sin = norm3(cx) / (n1 * n2);
  // Normalizing the triple product by |w| too keeps it dimensionless AND makes it a *relative*
  // coplanarity — the same criterion `claims.ts` has used since V7-T3.
  const wn = norm3(w);
  const coplanar = wn < 1e-12 ? 0 : Math.abs(dot3(w, cx)) / (n1 * n2 * wn);
  const anchorOff = wn < 1e-12 ? 0 : norm3(cross3(w, d1)) / (n1 * wn);

  // The closest-approach parameters (the classic two-line solve). Meaningless when parallel.
  let t1: number | null = null;
  let t2: number | null = null;
  const cxn2 = dot3(cx, cx);
  if (cxn2 > 1e-24 && sin > MUTUAL_TOL) {
    t1 = dot3(cross3(w, d2), cx) / cxn2;
    t2 = dot3(cross3(w, d1), cx) / cxn2;
  }
  return { sin, coplanar, anchorOff, t1, t2 };
}

/** Does a crossing parameter fall inside the side's extent? An unbounded side always accepts. */
const withinSide = (t: number | null, bounded: boolean, tol: number): boolean =>
  !bounded ? true : t !== null && t >= -tol && t <= 1 + tol;

/**
 * Classify the mutual position of the two LINES through the operands — `null` when the geometry
 * cannot answer (a missing point, a degenerate direction).
 *
 * This classification is TOTAL and mutually exclusive because it is about LINES: parallel directions
 * ⇒ `coincident` (same line) or `parallel` (distinct); otherwise ⇒ `intersecting` (coplanar) or
 * `skew` (not coplanar).
 *
 * It deliberately ignores the operands' EXTENTS. Two coplanar segments whose lines cross beyond
 * their endpoints do not meet — but they are not `skew` either: skew means *not coplanar*, and
 * calling them skew would report a false property of the drawing. Where the crossing falls is a
 * separate question, asked by {@link mutualHolds}, which is what a STATEMENT is judged by.
 */
export function mutualPosition(s1: MutualSide, s2: MutualSide, tol = MUTUAL_TOL): MutualRel | null {
  const parts = mutualParts(s1.geom, s2.geom);
  if (!parts) return null;
  if (parts.sin <= tol) return parts.anchorOff <= tol ? 'coincident' : 'parallel';
  return parts.coplanar > tol ? 'skew' : 'intersecting';
}

/**
 * Does the STATED relation hold between these two operands? This is the predicate a given, a claim
 * and the requirement gate are all judged by — {@link mutualPosition} plus the extent question.
 *
 * Only `intersecting` consults the extents: «AB ו-CD נחתכים» asserts the segments themselves cross,
 * not that their continuations would (the 2-D [ADR-166](../../docs/06-decisions.md#adr-166) reading,
 * R³ edition). `skew`/`parallel`/`coincident` are properties of the lines, unaffected by where the
 * drawn portion starts and stops.
 */
export function mutualHolds(rel: MutualRel, s1: MutualSide, s2: MutualSide, tol = MUTUAL_TOL): boolean {
  const verdict = mutualPosition(s1, s2, tol);
  if (verdict !== rel) return false;
  if (rel !== 'intersecting') return true;
  const parts = mutualParts(s1.geom, s2.geom);
  return !!parts && withinSide(parts.t1, s1.bounded, tol) && withinSide(parts.t2, s2.bounded, tol);
}

/**
 * The tolerance a VERIFIED mutual position is judged at. It is the numeric DRIVE's floor, not the
 * exact-geometry one: a figure the LM solver placed satisfies its residual to ~1e-6, and judging it
 * at 1e-7 would let a figure the drive accepted flap to `claim-refuted` (the `memberHolds3` /
 * line-rel reasoning). A genuinely wrong relation misses by ≥ ~1e-2, far above this.
 */
export const MUTUAL_VERIFY_TOL = 1e-4;

/**
 * The scale-free residual of a CLOSED mutual relation — 0 ⟺ it holds, `null` when unanswerable.
 * This is the drive's cost function; `mutualPosition` is the verdict. They read the same scalars,
 * so a driven figure and its claim can never disagree (the `lineRelDeviation` discipline).
 *
 * The OPEN half of each relation (non-parallelism for `intersecting`, within-extent for a bounded
 * side, and the whole of `skew`) is NOT in this residual — least-squares cannot express an
 * inequality, and pretending otherwise is how a solver settles in a degenerate basin. Those are
 * gated by {@link mutualPosition} through the requirement lane.
 */
export function mutualDeviation(rel: ClosedMutualRel, s1: MutualSide, s2: MutualSide): number | null {
  const parts = mutualParts(s1.geom, s2.geom);
  if (!parts) return null;
  if (rel === 'parallel') return parts.sin;
  if (rel === 'coincident') return Math.hypot(parts.sin, parts.anchorOff);
  return parts.coplanar; // intersecting: coplanarity is the equality; ¬parallel is the open gate
}

/**
 * #814 (ADR-3D-175) — the value of ONE component of an injected object, for the three target kinds a
 * letter can name. A named vector is a point pair (`c.vectors`), so the pair and vector cases are the
 * same computation — written once here so the sign check below is not three enumerated cases (and so a
 * fourth injection lane cannot answer it differently). `undefined` = not placeable yet.
 */
export function componentValue(
  c: Construction3,
  target: ComponentTarget,
  axis: 'x' | 'y' | 'z',
  at: (id: Id) => Vec3 | undefined,
): number | undefined {
  if (target.kind === 'point') return at(target.id)?.[axis];
  const seg = target.kind === 'pair' ? { from: target.a, to: target.b } : c.vectors.get(target.name);
  if (!seg) return undefined;
  const from = at(seg.from);
  const to = at(seg.to);
  return from && to ? to[axis] - from[axis] : undefined;
}

/** #814 — do the stated component signs hold under a given placement? Shared by the pivot's solution
 *  filter and the drive's rollback check, so one statement cannot be enforced in one and not the other. */
export const componentSignsHold = (c: Construction3, at: (id: Id) => Vec3 | undefined): boolean =>
  c.componentSigns.every((g) => {
    const v = componentValue(c, g.target, g.axis, at);
    return v === undefined ? false : g.positive ? v > 1e-9 : v < -1e-9;
  });

