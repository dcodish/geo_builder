/**
 * #2814 (ADR-3D-461) — WHAT IS ONE CONFIGURATION, and in which order are a figure's configurations shown.
 *
 * Two readers ask "are these pool entries the same configuration?": the pivot's pick (`applySolutions` in
 * `evaluate.ts`, which chooses `distinct[seed % n]`) and the panel's two-configuration row
 * (`twoConfigurations3` in `dataView.ts`, #1506). They answer with ONE predicate, defined here, so the drawing
 * and the «או» row can never disagree on how many configurations a figure has.
 *
 * The order is a function of the configurations alone, never of the solver's start order or copy counts:
 *  - exact repeats are dropped (the pool holds one configuration found by both mirrors, or by several starts);
 *  - the rest are GROUPED by discrete root — the configuration's intrinsic shape (every point in the frame of its
 *    first three non-collinear points) plus its pin-symbol values, which a proper rigid motion leaves alone and a
 *    reflection of a non-flat figure does not. Two placements of one flat triangle (SSA's two mirrors) are one
 *    group; the #827 pyramid's D at y = +4 and −4 are two;
 *  - groups are ordered canonically (larger on the first differing component) and interleaved round-robin,
 *    keeping found order within a group — the #797 interleave (ADR-3D-168 Am. 1), keyed on the shape.
 * So consecutive configuration indices alternate the discrete roots, and an internal solver change that only
 * moves start noise cannot move which configuration a seed draws.
 */
import type { Id } from './types';
import type { Vec3 } from './vec3';

/**
 * #1506 (ADR-3D-289) — the dedup tolerance for "are these two pool entries the SAME configuration?". Wider than the
 * panel's root agreement on purpose: two genuinely different configurations are separated by far more than 1e-3 of
 * the point's size, and the pool holds byte-identical and solver-scattered repeats.
 */
export const CONFIG_DEDUP_REL = 1e-3;

const pointScale = (q: Vec3): number => Math.max(Math.abs(q.x), Math.abs(q.y), Math.abs(q.z), 1);

/** One point, the same position in two configurations (relative to the point's own size). */
export const samePointConfig3 = (a: Vec3, b: Vec3): boolean => {
  const tol = CONFIG_DEDUP_REL * Math.max(pointScale(a), pointScale(b));
  return Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol && Math.abs(a.z - b.z) <= tol;
};

/** One pool entry, as the pick sees it: its drawn positions and its pin-symbol values. */
export interface PoolConfig3 {
  pos: ReadonlyMap<Id, Vec3>;
  pinSymbols?: Readonly<Record<string, number>>;
}

const sameNum = (a: number, b: number): boolean => Math.abs(a - b) <= CONFIG_DEDUP_REL * Math.max(1, Math.abs(a), Math.abs(b));

/** Two pool entries are ONE configuration: every point, and every pin symbol, the same. */
export function sameConfiguration3(a: PoolConfig3, b: PoolConfig3): boolean {
  if (a.pos.size !== b.pos.size) return false;
  for (const [id, p] of a.pos) {
    const q = b.pos.get(id);
    if (!q || !samePointConfig3(p, q)) return false;
  }
  const sa = a.pinSymbols ?? {}, sb = b.pinSymbols ?? {};
  const keys = Object.keys(sa);
  if (keys.length !== Object.keys(sb).length) return false;
  return keys.every((k) => sb[k] !== undefined && sameNum(sa[k], sb[k]));
}

/**
 * The configuration's discrete root: every point (ids in sorted order) in the right-handed frame of its first three
 * non-collinear points, then the pin-symbol values (names sorted). Invariant under a proper rigid motion.
 */
export function intrinsicShape3(cfg: PoolConfig3): number[] {
  const ids = [...cfg.pos.keys()].sort();
  const P = ids.map((id) => cfg.pos.get(id)!);
  const syms = Object.keys(cfg.pinSymbols ?? {}).sort().map((k) => cfg.pinSymbols![k]);
  if (P.length === 0) return syms;
  let ext = 0;
  for (const p of P) ext = Math.max(ext, pointScale(p));
  const eps = 1e-6 * ext;
  const sub = (a: Vec3, b: Vec3): number[] => [a.x - b.x, a.y - b.y, a.z - b.z];
  const dt = (a: number[], b: number[]): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const len = (a: number[]): number => Math.hypot(a[0], a[1], a[2]);
  const o = P[0];
  const b = P.find((p) => len(sub(p, o)) > eps);
  if (!b) return syms;
  const u = sub(b, o);
  const e1 = u.map((v) => v / len(u));
  const perp = (p: Vec3): number[] => {
    const v = sub(p, o);
    const k = dt(v, e1);
    return v.map((x, i) => x - k * e1[i]);
  };
  const c = P.find((p) => len(perp(p)) > eps);
  const w = c ? perp(c) : [0, 0, 0];
  const e2 = c ? w.map((v) => v / len(w)) : [0, 0, 0];
  const e3 = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  return [...P.flatMap((p) => { const v = sub(p, o); return [dt(v, e1), dt(v, e2), dt(v, e3)]; }), ...syms];
}

/**
 * Are two labelled point sets the same shape up to ANY rigid motion, a reflection included? The intrinsic shape's
 * third coordinate is the only one a reflection flips, so the second set's key is compared as is and turned over.
 * The driven-dims fan (`solve3.ts`, ADR-3D-461) asks this of a reflected start before solving it: a start
 * congruent to the found root is that root's mirror twin, which the mirror pass already owns.
 */
export function congruentShapes3(a: ReadonlyMap<Id, Vec3>, b: ReadonlyMap<Id, Vec3>): boolean {
  const ka = intrinsicShape3({ pos: a }), kb = intrinsicShape3({ pos: b });
  if (ka.length !== kb.length) return false;
  const same = (flip: boolean): boolean => ka.every((v, i) => sameNum(v, flip && i % 3 === 2 ? -kb[i] : kb[i]));
  return same(false) || same(true);
}

/** Canonical comparison: 0 when the same within tolerance, else negative when `a` sorts first (larger on the first differing component). */
const compareShapes = (a: readonly number[], b: readonly number[]): number => {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (!sameNum(a[i], b[i])) return b[i] - a[i];
  return a.length - b.length;
};

/**
 * The pick's order over a pool: the indices of its DISTINCT configurations, grouped by discrete root, groups in
 * canonical order, interleaved round-robin (found order within a group). A pool of one is returned as is.
 */
export function configurationOrder3(cfgs: readonly PoolConfig3[]): number[] {
  if (cfgs.length <= 1) return cfgs.map((_, i) => i);
  const distinct: number[] = [];
  for (let i = 0; i < cfgs.length; i++) if (!distinct.some((j) => sameConfiguration3(cfgs[j], cfgs[i]))) distinct.push(i);
  const groups: { shape: number[]; list: number[] }[] = [];
  for (const i of distinct) {
    const shape = intrinsicShape3(cfgs[i]);
    const g = groups.find((x) => compareShapes(x.shape, shape) === 0);
    if (g) g.list.push(i);
    else groups.push({ shape, list: [i] });
  }
  groups.sort((a, b) => compareShapes(a.shape, b.shape));
  const out: number[] = [];
  for (let k = 0; out.length < distinct.length; k++) for (const g of groups) if (k < g.list.length) out.push(g.list[k]);
  return out;
}
