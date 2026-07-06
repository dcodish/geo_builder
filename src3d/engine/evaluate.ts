/**
 * Topological evaluation: Construction3 + seed → world coordinates (docs/20 §6.1).
 *
 * Free-DOF policy (ADR-052 transplanted):
 *  - A cube's edge is the figure's SCALE — pure similarity gauge (ADR-101), so it is
 *    fixed at 1 and "show another configuration" rightly does not vary it (a resample
 *    that only rescales is invisible after the renderer's fit).
 *  - A box's two aspect ratios and a prism's base-triangle shape + height ARE shape
 *    DOFs: sampled per (seed, stable key) and varied by resample.
 *  - An on-segment point with no stated t is a free 1-DOF slider, sampled likewise.
 *
 * Samples are keyed by object identity (ids), never insertion order — the stability rule.
 */

import { sample } from './rng';
import { decompose3 } from './vecExpr';
import type { Construction3, Id, PointDef, Positions3 } from './types';
import { centroid3, dot3, lerp3, norm3, sub3, v3, type Vec3 } from './vec3';

/** Deg → rad. */
const rad = (d: number) => (d * Math.PI) / 180;

/** Base-triangle apex from base A=(0,0), B=(1,0) and the two base angles (both < 90°). */
function apexFromBaseAngles(alpha: number, beta: number): { x: number; y: number } {
  const ta = Math.tan(alpha);
  const tb = Math.tan(beta);
  const x = tb / (ta + tb);
  const y = (ta * tb) / (ta + tb);
  return { x, y };
}

/** World positions of one solid's vertices, in `ids` order. `origin` separates multiple solids. */
function solidPositions(kind: 'cube' | 'box' | 'prism3', key: string, seed: number, origin: Vec3): Vec3[] {
  const o = origin;
  if (kind === 'cube') {
    const s = 1; // scale gauge — see file header
    return [
      v3(o.x, o.y, o.z), v3(o.x + s, o.y, o.z), v3(o.x + s, o.y + s, o.z), v3(o.x, o.y + s, o.z),
      v3(o.x, o.y, o.z + s), v3(o.x + s, o.y, o.z + s), v3(o.x + s, o.y + s, o.z + s), v3(o.x, o.y + s, o.z + s),
    ];
  }
  if (kind === 'box') {
    const a = 1; // scale gauge
    const b = sample(seed, `${key}-depth`, 0.55, 1.7);
    const h = sample(seed, `${key}-height`, 0.5, 1.4);
    return [
      v3(o.x, o.y, o.z), v3(o.x + a, o.y, o.z), v3(o.x + a, o.y + b, o.z), v3(o.x, o.y + b, o.z),
      v3(o.x, o.y, o.z + h), v3(o.x + a, o.y, o.z + h), v3(o.x + a, o.y + b, o.z + h), v3(o.x, o.y + b, o.z + h),
    ];
  }
  // prism3 — right triangular prism: base ABC in the z=origin plane, tops straight up.
  const alpha = rad(sample(seed, `${key}-alpha`, 38, 72));
  const beta = rad(sample(seed, `${key}-beta`, 38, 72));
  const h = sample(seed, `${key}-height`, 0.65, 1.5);
  const c = apexFromBaseAngles(alpha, beta);
  const base = [v3(o.x, o.y, o.z), v3(o.x + 1, o.y, o.z), v3(o.x + c.x, o.y + c.y, o.z)];
  return [...base, ...base.map((p) => v3(p.x, p.y, p.z + h))];
}

/** Evaluate every point's world position. Parents always precede children (apply enforces it). */
export function evaluate3(c: Construction3, seed: number): Positions3 {
  const pos: Positions3 = new Map<Id, Vec3>();

  c.solids.forEach((solid, i) => {
    const key = `solid-${solid.kind}-${solid.ids.join('')}`;
    const origin = v3(i * 2.5, 0, 0); // side-by-side when a figure ever holds two solids
    const ps = solidPositions(solid.kind, key, seed, origin);
    solid.ids.forEach((id, j) => pos.set(id, ps[j]));
  });

  for (const [id, def] of c.points) {
    if (def.kind === 'solid-vertex') continue;
    if (def.kind === 'on-segment') {
      const a = pos.get(def.a);
      const b = pos.get(def.b);
      if (!a || !b) continue; // unreachable if apply enforced parents; stay total anyway
      const t = def.t ?? sample(seed, `t-${id}-${def.a}-${def.b}`, 0.22, 0.78);
      pos.set(id, lerp3(a, b, t));
    } else if (def.kind === 'centroid') {
      const ps = def.of.map((p) => pos.get(p));
      if (ps.some((p) => !p)) continue;
      pos.set(id, centroid3(ps as Vec3[]));
    } else if (def.kind === 'in-span') {
      pos.set(id, inSpanPosition(c, def, pos));
    }
  }

  return pos;
}

/** The declared basis in a stable order, or null if not exactly 3 / endpoints unplaced. */
function basisVectors(c: Construction3, pos: Positions3): { names: string[]; vecs: Vec3[] } | null {
  if (c.vectors.size !== 3) return null;
  const names: string[] = [];
  const vecs: Vec3[] = [];
  for (const [name, def] of c.vectors) {
    const a = pos.get(def.from);
    const b = pos.get(def.to);
    if (!a || !b) return null;
    names.push(name);
    vecs.push(sub3(b, a));
  }
  return { names, vecs };
}

/**
 * The closed-form in-span drive (docs/20 §6.2 — affine, no iteration): the
 * complement coefficient of decompose(vecFrom→P(t)) is affine in t, so its zero
 * is one division. Degenerate cases fall back to the midpoint; the STORE's
 * post-check flags them honestly (`no-solution`) so a silent wrong figure is
 * impossible (the fact is refused, keep-prior).
 */
function inSpanPosition(c: Construction3, def: Extract<PointDef, { kind: 'in-span' }>, pos: Positions3): Vec3 {
  const a = pos.get(def.a)!;
  const b = pos.get(def.b)!;
  const k = pos.get(def.vecFrom)!;
  const fallback = lerp3(a, b, 0.5);
  const basis = basisVectors(c, pos);
  if (!basis) return fallback;
  const compIndex = basis.names.findIndex((n) => !def.span.includes(n));
  if (compIndex < 0) return fallback;
  const d0 = decompose3(sub3(a, k), basis.vecs[0], basis.vecs[1], basis.vecs[2]);
  const d1 = decompose3(sub3(b, k), basis.vecs[0], basis.vecs[1], basis.vecs[2]);
  if (!d0 || !d1) return fallback;
  const c0 = d0[compIndex];
  const c1 = d1[compIndex];
  if (Math.abs(c0 - c1) < 1e-12) return fallback;
  const t = c0 / (c0 - c1);
  return Number.isFinite(t) ? lerp3(a, b, t) : fallback;
}

/**
 * Post-check for an in-span point at the DISPLAY seed (the store surfaces the
 * verdict): does vecFrom→P really lie in the span, and does P sit ON the stated
 * segment (`על` means the segment, not the line — the 2-D ADR-077 principle)?
 */
export function checkInSpan(
  c: Construction3,
  id: Id,
  def: Extract<PointDef, { kind: 'in-span' }>,
  pos: Positions3,
): 'ok' | 'no-solution' | 'not-on-segment' {
  const p = pos.get(id);
  const a = pos.get(def.a);
  const b = pos.get(def.b);
  const k = pos.get(def.vecFrom);
  const basis = basisVectors(c, pos);
  if (!p || !a || !b || !k || !basis) return 'no-solution';
  const compIndex = basis.names.findIndex((n) => !def.span.includes(n));
  const d = decompose3(sub3(p, k), basis.vecs[0], basis.vecs[1], basis.vecs[2]);
  if (compIndex < 0 || !d) return 'no-solution';
  if (Math.abs(d[compIndex]) > 1e-7 * (1 + Math.abs(d[0]) + Math.abs(d[1]) + Math.abs(d[2]))) return 'no-solution';
  const ab = sub3(b, a);
  const t = dot3(sub3(p, a), ab) / Math.max(dot3(ab, ab), 1e-12);
  if (norm3(ab) < 1e-12 || t < -1e-9 || t > 1 + 1e-9) return 'not-on-segment';
  return 'ok';
}
