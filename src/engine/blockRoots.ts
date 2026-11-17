/**
 * THE OTHER ROOTS OF A DETERMINED FREE POINT ARE LISTED, AND THE SEED CHOOSES ONE
 * (#2744, [ADR-856](../../docs/06-decisions.md#adr-856) — the 2-D port of ADR-AG-451 / ADR-3D-447).
 *
 * «ריבוע ABCD שצלעו 10» · «E על הישר AB» · «DE = 12» lowers E to a FREE point held by a driven collinear, and «DE = 12»
 * is a second scalar given on it: E is determined up to a discrete choice (E 6.63 from A on either side). Every seed
 * solved E by descent from a start the seed barely moves (`applySeed` spins and jitters the free cluster), so every
 * seed landed in the same basin: the pool held one root, «הציגו תצורה אחרת» found no other shape, and the values panel
 * printed BE = 3.37 as known while 16.63 is equally valid.
 *
 * So the other roots are reached FROM THE FOUND SOLUTION, never by widening the sampler's box (that would redraw every
 * free figure — the #518 lesson):
 *
 * - **Which points.** A non-pinned free point P that ADR-166's reflection does not already own
 *   ({@link reflectableFreePoints}: one owner per DOF, docs/17 M2), whose own rows FIX it: every constraint reading P or
 *   a point that moves with P (a derived point), with every other point held, has a rank-2 Jacobian over (x_P, y_P).
 * - **The listing.** First a polished descent from each of the root's MIRROR IMAGES — through each point its rows
 *   name, and across the line through two of them: a ridge between two roots (an area's |·| where the triangle
 *   flattens) holds a descent from a near start, and the image is often the other root itself. Then deflated
 *   Levenberg–Marquardt on the rows, `r(x)·Π(1 + 1/‖x − root‖²)` (distances in units of the figure's span), from
 *   `ROOT_STARTS` fixed nudges of the root (a quarter of the span), polished on the real rows; repeated in rounds while
 *   a round finds a new root (at most `ROOT_ROUNDS`), at most `ROOT_CAP` roots in all. A fence row keeps every descent
 *   within `ROOT_REACH` spans: a scale-free row (a collinear's sine) also vanishes at infinity.
 * - **Which roots count.** Every constraint of the construction holds there (bounds and orders included), no
 *   polygon is defective and no two named points coincide. A root that fails is deflated all the same, so a root past
 *   it is still reached.
 * - **The anchors' frame.** Each root is stored as affine coordinates in the frame of the points its rows read that do
 *   NOT move with P (`frameOf`: the two most separated, and a third off their line when there is one): the seed spins
 *   the figure, so an absolute position would be wrong at every other seed, and a third anchor keeps the side when a
 *   configuration is mirrored.
 *
 * Pure and deterministic: no seed enters the listing, so the replay layer memoises it once per fold. Sampled, never
 * proven: a root no deflated start reaches is not listed, and the figure is solved as before.
 */
import type { Constraint, Construction, FreePoint, Id, Vec } from './types';
import { isGeoPoint } from './types';
import { evaluate, evaluateCore, gateDefects, resolveDrivenMemo } from './evaluate';
import { constraintRefs, isSatisfied, jointCostRows } from './solve';
import { allConstraints, reflectableFreePoints, REFLECT_MAX } from './sample';
import { solveLM } from './solveLM';

/** Fixed starts per round, rounds at most, and roots at most (two values the panel may list, plus one: ADR-634). */
export const ROOT_STARTS = 4;
export const ROOT_ROUNDS = 5;
export const ROOT_CAP = 3;
/** How far a start is nudged off the root, in units of the figure's span (the analytic listing's quarter). */
const ROOT_NUDGE = 0.25;
/** At most this many mirror-image starts per point. */
const ROOT_IMAGES = 10;
/** How far from the fold's root a listed root may lie, in units of the figure's span. */
const ROOT_REACH = 2;
/** Two roots closer than this (in span units) are one. */
const ROOT_SAME = 1e-5;
/** The rank test: the smaller singular value of the span-normalised Jacobian over the larger one. */
const RANK_RATIO = 1e-4;
/** One LM solve's budget (two unknowns: a few iterations reach a root; a failing start stops early). */
const LM_ITERS = 60;
const LM_EVALS = 400;

/** Listings run so far and the LM solves they cost — the perf lock reads them (counted, never timed; docs/17 §9). */
export const blockRootStats = { listings: 0, points: 0, solves: 0 };

/** One listed point: its anchors and every admitted root, each in the anchors' affine frame. */
export interface FreePointRoots {
  id: Id;
  /**
   * The frame: [a0, a1] or [a0, a1, a2] — a0 the origin, a1 − a0 the first axis, the second a2 − a0 or, with two
   * anchors, the left perpendicular of the first. Three anchors keep the root on its side of them when a seed MIRRORS
   * the figure; two (all a row names) when the rows read no third point off their line.
   */
  frame: Id[];
  /** The admitted roots as frame coordinates (u, v). Index 0 is the fold's own root. */
  roots: Array<{ u: number; v: number }>;
}

const withPoint = (c: Construction, id: Id, p: Vec): Construction => ({
  ...c,
  objects: c.objects.map((o) => (o.id === id && o.kind === 'free-point' ? { ...o, x: p.x, y: p.y, solve: undefined } : o)),
});

/** The frame's two axes: a1 − a0, then a2 − a0 or the left perpendicular of the first. */
const axes = (f: readonly Vec[]): [Vec, Vec] => {
  const e1 = { x: f[1].x - f[0].x, y: f[1].y - f[0].y };
  return [e1, f.length > 2 ? { x: f[2].x - f[0].x, y: f[2].y - f[0].y } : { x: -e1.y, y: e1.x }];
};
/** A point as coordinates in the frame `f` (anchor positions); null when the frame is degenerate. */
export const toFrame = (p: Vec, f: readonly Vec[]): { u: number; v: number } | null => {
  const [e1, e2] = axes(f);
  const det = e1.x * e2.y - e1.y * e2.x;
  if (!(Math.abs(det) > 1e-12)) return null;
  const px = p.x - f[0].x, py = p.y - f[0].y;
  return { u: (px * e2.y - py * e2.x) / det, v: (e1.x * py - e1.y * px) / det };
};
/** The inverse of {@link toFrame}: a stored root placed in a frame the seed has moved. */
export const fromFrame = (r: { u: number; v: number }, f: readonly Vec[]): Vec => {
  const [e1, e2] = axes(f);
  return { x: f[0].x + r.u * e1.x + r.v * e2.x, y: f[0].y + r.u * e1.y + r.v * e2.y };
};
/**
 * The frame of a point's anchors: the two most separated, then the one farthest off their line when it is off by more
 * than a hundredth of the span. Null when no two anchors are apart.
 */
export function frameOf(anchors: readonly string[], at: (id: string) => Vec, span: number): string[] | null {
  let a0: string | null = null, a1: string | null = null, best = 0;
  for (let i = 0; i < anchors.length; i++)
    for (let j = i + 1; j < anchors.length; j++) {
      const p = at(anchors[i]), q = at(anchors[j]);
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      if (d > best) { best = d; a0 = anchors[i]; a1 = anchors[j]; }
    }
  if (!a0 || !a1 || best < span * 1e-6) return null;
  const P = at(a0), Q = at(a1);
  let a2: string | null = null, off = span * 1e-2;
  for (const r of anchors) {
    if (r === a0 || r === a1) continue;
    const R = at(r);
    const h = Math.abs((Q.x - P.x) * (R.y - P.y) - (Q.y - P.y) * (R.x - P.x)) / best;
    if (h > off) { off = h; a2 = r; }
  }
  return a2 ? [a0, a1, a2] : [a0, a1];
}

/** A start direction per start: fixed, so the list depends on the construction alone (the analytic `nudgeAt`). */
const nudgeAt = (k: number, i: number): number => Math.sin(12.9898 * (i + 1) * (k + 1) + 78.233 * (k + 1));

/**
 * Every listed point of the construction `c` (the fold's committed construction), with its admitted roots — only the
 * points with two or more, at most {@link REFLECT_MAX}. Empty when `c` does not evaluate.
 */
export function enumerateFreePointRoots(c: Construction): FreePointRoots[] {
  const e = evaluate(c);
  if (!e.ok) return [];
  const baked = resolveDrivenMemo(c);
  const reflectable = new Set(reflectableFreePoints(c));
  const candidates = c.objects.filter((o): o is FreePoint => o.kind === 'free-point' && !o.pinned && !reflectable.has(o.id));
  if (candidates.length === 0) return [];
  const cons = [...allConstraints(c)];
  if (cons.length === 0) return [];
  const pts = [...e.positions.entries()];
  let span = 0;
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++) span = Math.max(span, Math.hypot(pts[i][1].x - pts[j][1].x, pts[i][1].y - pts[j][1].y));
  if (!(span > 0)) return [];
  blockRootStats.listings += 1;
  const named = c.objects.filter(isGeoPoint).map((o) => o.id).filter((id) => !id.startsWith('~'));
  const out: FreePointRoots[] = [];
  for (const P of candidates) {
    if (out.length >= REFLECT_MAX) break;
    const listed = listPoint(baked, cons, P.id, e.positions, span, named);
    if (listed) out.push(listed);
  }
  return out;
}

function listPoint(
  baked: Construction,
  allCons: Constraint[],
  id: Id,
  at: Map<Id, Vec>,
  span: number,
  named: Id[],
): FreePointRoots | null {
  const root = at.get(id);
  if (!root) return null;
  const place = (p: Vec): Map<Id, Vec> | null => {
    const r = evaluateCore(withPoint(baked, id, p), { skipConstraints: true });
    return r.ok ? r.positions : null;
  };
  // The points that move WITH P (P and what is derived from it): read by a nudge, so no dependency walk is restated.
  const h = span * 1e-4;
  const moved = new Set<Id>([id]);
  for (const d of [{ x: h, y: 0 }, { x: 0, y: h }]) {
    const q = place({ x: root.x + d.x, y: root.y + d.y });
    if (!q) return null;
    for (const [k, v] of q) {
      const w = at.get(k);
      if (w && Math.hypot(v.x - w.x, v.y - w.y) > span * 1e-9) moved.add(k);
    }
  }
  const rows = allCons.filter((k) => constraintRefs(k).some((r) => moved.has(r)));
  if (rows.length < 2 && !rows.some((k) => k.type === 'coincide')) return null;
  // The anchors: what the rows read that does not move with P — they make the frame.
  const anchors = [...new Set(rows.flatMap(constraintRefs))].filter((r) => !moved.has(r) && at.has(r));
  const frame = frameOf(anchors, (r) => at.get(r)!, span);
  if (!frame) return null;
  const residuals = (x: number[]): number[] => {
    const q = place({ x: x[0], y: x[1] });
    const n = rows.reduce((s, k) => s + (k.type === 'coincide' ? 2 : 1), 0);
    if (!q) return new Array<number>(n).fill(NaN);
    const res: number[] = [];
    for (const k of rows) {
      if (constraintRefs(k).some((r) => !q.has(r))) return new Array<number>(n).fill(NaN);
      res.push(...jointCostRows(k, (r) => q.get(r)!));
    }
    return res;
  };
  // The rank test: do these rows FIX P (two independent directions), every other point held?
  const col = (dx: number, dy: number) => {
    const plus = residuals([root.x + dx, root.y + dy]);
    const minus = residuals([root.x - dx, root.y - dy]);
    return plus.map((v, i) => ((v - minus[i]) / 2) * (span / h));
  };
  const jx = col(h, 0), jy = col(0, h);
  if ([...jx, ...jy].some((v) => !Number.isFinite(v))) return null;
  let sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < jx.length; i++) { sxx += jx[i] * jx[i]; syy += jy[i] * jy[i]; sxy += jx[i] * jy[i]; }
  const tr = sxx + syy, det = sxx * syy - sxy * sxy;
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const big = tr / 2 + disc, small = tr / 2 - disc;
  if (!(big > 0) || !(small > 0) || Math.sqrt(small / big) < RANK_RATIO) return null;
  blockRootStats.points += 1;

  const admit = (p: Vec): boolean => {
    const placed = withPoint(baked, id, p);
    const r = evaluateCore(placed, { skipConstraints: true });
    if (!r.ok) return false;
    for (const k of allCons) {
      if (constraintRefs(k).some((x) => !r.positions.has(x))) return false;
      if (!isSatisfied(k, (x) => r.positions.get(x)!)) return false;
    }
    if (gateDefects(placed, r.positions).length > 0) return false;
    const ps = named.map((n) => r.positions.get(n)).filter((v): v is Vec => !!v);
    for (let i = 0; i < ps.length; i++)
      for (let j = i + 1; j < ps.length; j++) if (Math.hypot(ps[i].x - ps[j].x, ps[i].y - ps[j].y) <= span * 1e-6) return false;
    return true;
  };
  const roots: number[][] = [[root.x, root.y]];
  const admitted: boolean[] = [true];
  const d2 = (a: readonly number[], b: readonly number[]) => ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) / (span * span);
  const known = (x: readonly number[]) => roots.some((q) => d2(x, q) <= ROOT_SAME * ROOT_SAME);
  const opts = { scale: [span, span], maxIter: LM_ITERS, maxEvals: LM_EVALS };
  // The rows and a FENCE: 0 within ROOT_REACH spans of the root, growing past it. A scale-free row (a collinear's sine,
  // a parallel's) also vanishes at infinity, and a descent that follows it there finds no root of the figure.
  const held = (x: number[]) => [...residuals(x), Math.max(0, Math.sqrt(d2(x, [root.x, root.y])) - ROOT_REACH)];
  // The root's MIRROR IMAGES first — through each anchor, and across the line through each pair of anchors. A row a
  // point's anchors define (a distance, an angle, an area, a line through two of them) is symmetric under one of
  // them often enough that the image is the other root itself, and a ridge between the roots (an area's |·| where
  // the triangle flattens) never holds a descent that starts past it. Polished on the rows, never taken as is.
  const anchorPts = anchors.map((r) => at.get(r)!);
  const images: number[][] = [];
  for (const q of anchorPts) images.push([2 * q.x - root.x, 2 * q.y - root.y]);
  for (let i = 0; i < anchorPts.length; i++)
    for (let j = i + 1; j < anchorPts.length; j++) {
      const p0 = anchorPts[i], p1 = anchorPts[j];
      const dx = p1.x - p0.x, dy = p1.y - p0.y, L = dx * dx + dy * dy;
      if (L < span * span * 1e-12) continue;
      const t = ((root.x - p0.x) * dx + (root.y - p0.y) * dy) / L;
      images.push([2 * (p0.x + t * dx) - root.x, 2 * (p0.y + t * dy) - root.y]);
    }
  for (const x0 of images.slice(0, ROOT_IMAGES)) {
    if (roots.length >= ROOT_CAP) break;
    if (known(x0)) continue;
    const b = solveLM(held, x0, opts);
    blockRootStats.solves += 1;
    if (!b.converged || b.x.some((v) => !Number.isFinite(v)) || known(b.x)) continue;
    roots.push(b.x);
    admitted.push(admit({ x: b.x[0], y: b.x[1] }));
  }
  for (let round = 0; round < ROOT_ROUNDS && roots.length < ROOT_CAP; round++) {
    let found = false;
    for (let k = 0; k < ROOT_STARTS && roots.length < ROOT_CAP; k++) {
      const dir = [nudgeAt(k, 0), nudgeAt(k, 1)];
      const norm = Math.hypot(dir[0], dir[1]) || 1;
      const reach = ROOT_NUDGE * span;
      const x0 = [root.x + (reach * dir[0]) / norm, root.y + (reach * dir[1]) / norm];
      const fixedRoots = roots.map((q) => [...q]);
      const deflated = (x: number[]): number[] => {
        let m = 1;
        for (const q of fixedRoots) m *= 1 + 1 / Math.max(d2(x, q), 1e-24);
        return held(x).map((r) => r * m);
      };
      const b = solveLM(held, solveLM(deflated, x0, opts).x, opts);
      blockRootStats.solves += 2;
      if (!b.converged || b.x.some((v) => !Number.isFinite(v)) || known(b.x)) continue;
      // a root that fails the judge is still a root: deflated too, so the next start is carried past it
      roots.push(b.x);
      admitted.push(admit({ x: b.x[0], y: b.x[1] }));
      found = true;
    }
    if (!found) break;
  }
  const kept = roots.filter((_, i) => admitted[i]);
  if (kept.length < 2) return null;
  const F = frame.map((r) => at.get(r)!);
  const coords = kept.map((x) => toFrame({ x: x[0], y: x[1] }, F));
  if (coords.some((r) => r === null)) return null;
  return { id, frame, roots: coords as Array<{ u: number; v: number }> };
}

/** A tiny deterministic PRNG in [0, 1) — the sampler's `mulberry32`, copied so this module owns its stream. */
function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** The root stream: independent of the sampler's spin and jitter streams. */
const ROOT_STREAM = 300043;
const hashId = (id: string): number => {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
};

/** Which listed root base seed `seed` takes for point `id`: ⌊u·n⌋ of an independent stream. Seed 0 is never steered. */
export function rootChoice(seed: number, id: Id, n: number): number {
  return Math.min(n - 1, Math.floor(mulberry32((((seed + ROOT_STREAM) * 2654435761) ^ hashId(id)) >>> 0)() * n));
}

/**
 * The sampled construction `c` with each listed point's START at the root base seed `seed` chooses, placed in the
 * frame of its anchors as `c` places them (no solve: the anchors' sampled positions). A start, never a verdict:
 * `evaluate` converges from it and the givens verifier keeps the last word. Seed 0, or nothing listed: `c` itself.
 */
export function applyRootChoice(c: Construction, list: readonly FreePointRoots[], seed: number): Construction {
  if (!seed || list.length === 0) return c;
  const r = evaluateCore(c, { skipConstraints: true });
  if (!r.ok) return c;
  const starts = new Map<Id, Vec>();
  for (const p of list) {
    const F = p.frame.map((id) => r.positions.get(id));
    if (F.some((v) => !v) || !toFrame(F[0]!, F as Vec[])) continue;
    starts.set(p.id, fromFrame(p.roots[rootChoice(seed, p.id, p.roots.length)], F as Vec[]));
  }
  if (starts.size === 0) return c;
  return { ...c, objects: c.objects.map((o) => (o.kind === 'free-point' && starts.has(o.id) ? { ...o, x: starts.get(o.id)!.x, y: starts.get(o.id)!.y } : o)) };
}
