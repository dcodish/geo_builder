/**
 * The V4 coordinate-injection PIVOT (docs/20 §4, §6.1; ADR-3D-007): a gauge-free
 * Lane-G figure receives absolute givens mid-session — point coordinates
 * (`P(0,4,6)`, partial `A(3,n,p)`) and vector values (`נתון: v = (10,-5,0)`) —
 * and the engine solves for the SIMILARITY (translate + rotate + scale) plus the
 * figure's free shape dims that realises them.
 *
 * Numeric least-squares (Levenberg–Marquardt with a numeric Jacobian) — the same
 * numeric-solving category the 2-D engine lives on; NOT symbolic (D3 holds).
 * Under-determination is welcome, not fought: an uninjected dimension (2020's
 * prism height) stays free — LM's damping converges to a nearby manifold point,
 * and different seeds start elsewhere, so "show another configuration" still
 * varies what the givens never fixed (ADR-052).
 *
 * REFLECTION is a discrete branch: both orientations are solved; sign givens
 * (`שיעור ה-z של C' חיובי`) select among the surviving solutions, else the seed.
 */

import type { Construction3, Positions3 } from './types';
import { add3, cross3, dot3, norm3, scale3, sub3, v3, type Vec3 } from './vec3';

export interface GaugeParams {
  /** [tx, ty, tz, rx, ry, rz (axis-angle), logScale, ...dims] */
  x: number[];
  dimCount: number;
  mirror: boolean;
}

/** Rodrigues rotation of p by axis-angle w. */
function rotate(p: Vec3, w: Vec3): Vec3 {
  const th = norm3(w);
  if (th < 1e-12) return p;
  const k = scale3(w, 1 / th);
  const c = Math.cos(th);
  const s = Math.sin(th);
  return add3(add3(scale3(p, c), scale3(cross3(k, p), s)), scale3(k, dot3(k, p) * (1 - c)));
}

/** Apply mirror (y → −y, pre-transform) + similarity to a canonical point. */
export function applyGauge(p: Vec3, g: { t: Vec3; w: Vec3; s: number; mirror: boolean }): Vec3 {
  const q = g.mirror ? v3(p.x, -p.y, p.z) : p;
  return add3(scale3(rotate(q, g.w), g.s), g.t);
}

const unpack = (x: number[]) => ({ t: v3(x[0], x[1], x[2]), w: v3(x[3], x[4], x[5]), s: Math.exp(x[6]) });

/**
 * Solve min ‖r(x)‖² by Levenberg–Marquardt with a central-difference Jacobian.
 * Small n (≤ ~10), tiny residual functions — exactness comes from the quadratic
 * convergence near the solution, polished to ~1e-12.
 */
export function leastSquares(residuals: (x: number[]) => number[], x0: number[], iterations = 120): { x: number[]; err: number } {
  let x = [...x0];
  let r = residuals(x);
  let err = r.reduce((s, v) => s + v * v, 0);
  let lambda = 1e-3;
  const n = x.length;

  for (let iter = 0; iter < iterations; iter++) {
    // numeric Jacobian (central differences)
    const m = r.length;
    const J: number[][] = [];
    for (let j = 0; j < n; j++) {
      const h = 1e-6 * Math.max(1, Math.abs(x[j]));
      const xp = [...x];
      const xm = [...x];
      xp[j] += h;
      xm[j] -= h;
      const rp = residuals(xp);
      const rm = residuals(xm);
      J.push(rp.map((v, i) => (v - rm[i]) / (2 * h)));
    }
    // normal equations (JᵀJ + λ·diag) δ = −Jᵀr
    const A: number[][] = [];
    const b: number[] = [];
    for (let i = 0; i < n; i++) {
      A.push([]);
      let bi = 0;
      for (let j = 0; j < n; j++) {
        let s = 0;
        for (let k = 0; k < m; k++) s += J[i][k] * J[j][k];
        A[i].push(s);
      }
      for (let k = 0; k < m; k++) bi -= J[i][k] * r[k];
      b.push(bi);
    }
    for (let i = 0; i < n; i++) A[i][i] += lambda * (A[i][i] || 1);
    const delta = solveLinear(A, b);
    if (!delta) {
      lambda *= 10;
      continue;
    }
    const xNew = x.map((v, i) => v + delta[i]);
    const rNew = residuals(xNew);
    const errNew = rNew.reduce((s, v) => s + v * v, 0);
    if (errNew < err) {
      x = xNew;
      r = rNew;
      err = errNew;
      lambda = Math.max(lambda / 3, 1e-12);
      if (err < 1e-24) break;
    } else {
      lambda *= 10;
      if (lambda > 1e12) break;
    }
  }
  return { x, err };
}

/** Gaussian elimination with partial pivoting; null when singular. */
function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let row = col + 1; row < n; row++) if (Math.abs(M[row][col]) > Math.abs(M[piv][col])) piv = row;
    if (Math.abs(M[piv][col]) < 1e-14) return null;
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let row = col + 1; row < n; row++) {
      const f = M[row][col] / M[col][col];
      for (let k = col; k <= n; k++) M[row][k] -= f * M[col][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n];
    for (let k = i + 1; k < n; k++) s -= M[i][k] * x[k];
    x[i] = s / M[i][i];
  }
  return x;
}

export interface PivotResult {
  /** Canonical → absolute transform to apply to every position. */
  transform: (p: Vec3) => Vec3;
  mirror: boolean;
  dims: number[];
  err: number;
}

/**
 * Solve the pivot: find gauge (+ dims) such that every pin lands on its target.
 * `evalCanonical(dims)` re-derives the canonical positions for a dim vector.
 * Returns every converged solution (both mirrors when both converge).
 */
export function solvePivot(
  c: Construction3,
  evalCanonical: (dims: number[]) => Positions3,
  dims0: number[],
  seed: number,
): PivotResult[] {
  const pointPins = c.pins;
  const vecPins = c.vectorPins;
  if (pointPins.length === 0 && vecPins.length === 0 && c.pairPins.length === 0 && c.scalarPins.length === 0) return [];

  const residualsFor = (mirror: boolean) => (x: number[]): number[] => {
    const g = { ...unpack(x), mirror };
    const dims = x.slice(7);
    const pos = evalCanonical(dims);
    const out: number[] = [];
    for (const pin of pointPins) {
      const p = pos.get(pin.id);
      if (!p) {
        out.push(10, 10, 10);
        continue;
      }
      const q = applyGauge(p, g);
      if (pin.x !== null) out.push(q.x - pin.x);
      if (pin.y !== null) out.push(q.y - pin.y);
      if (pin.z !== null) out.push(q.z - pin.z);
    }
    for (const pin of vecPins) {
      const def = c.vectors.get(pin.name);
      const a = def && pos.get(def.from);
      const b = def && pos.get(def.to);
      if (!a || !b) {
        out.push(10, 10, 10);
        continue;
      }
      // a vector transforms without the translation
      const w = sub3(applyGauge(b, g), applyGauge(a, g));
      out.push(w.x - pin.x, w.y - pin.y, w.z - pin.z);
    }
    for (const pin of c.pairPins) {
      const a = pos.get(pin.a);
      const b = pos.get(pin.b);
      if (!a || !b) {
        out.push(10, 10, 10);
        continue;
      }
      const w = sub3(applyGauge(b, g), applyGauge(a, g));
      out.push(w.x - pin.x, w.y - pin.y, w.z - pin.z);
    }
    // scalar givens (V7 T2): lengths / vertex angles / dot products / seg-⟂/∥-plane
    const at = (id: string): Vec3 | null => {
      const p = pos.get(id);
      return p ? applyGauge(p, g) : null;
    };
    for (const pin of c.scalarPins) {
      if (pin.kind === 'length') {
        const a = at(pin.a);
        const b = at(pin.b);
        out.push(a && b ? norm3(sub3(b, a)) - pin.value : 10);
      } else if (pin.kind === 'vangle') {
        const vtx = at(pin.vertex);
        const p = at(pin.p);
        const q = at(pin.q);
        if (!vtx || !p || !q) {
          out.push(10);
          continue;
        }
        const d1 = sub3(p, vtx);
        const d2 = sub3(q, vtx);
        const den = Math.max(norm3(d1) * norm3(d2), 1e-12);
        out.push(dot3(d1, d2) / den - Math.cos((pin.deg * Math.PI) / 180));
      } else if (pin.kind === 'dot') {
        const d1v = c.vectors.get(pin.v1);
        const d2v = c.vectors.get(pin.v2);
        const a1 = d1v && at(d1v.from);
        const b1 = d1v && at(d1v.to);
        const a2 = d2v && at(d2v.from);
        const b2 = d2v && at(d2v.to);
        out.push(a1 && b1 && a2 && b2 ? dot3(sub3(b1, a1), sub3(b2, a2)) - pin.value : 10);
      } else {
        const a = at(pin.a);
        const b = at(pin.b);
        const ring = pin.plane.map(at);
        if (!a || !b || ring.some((p) => !p)) {
          out.push(10, 10);
          continue;
        }
        const d = sub3(b, a);
        const e1 = sub3(ring[1]!, ring[0]!);
        const e2 = sub3(ring[2]!, ring[0]!);
        if (pin.kind === 'seg-perp-plane') {
          const s1 = Math.max(norm3(d) * norm3(e1), 1e-12);
          const s2 = Math.max(norm3(d) * norm3(e2), 1e-12);
          out.push(dot3(d, e1) / s1, dot3(d, e2) / s2);
        } else {
          const n = cross3(e1, e2);
          out.push(dot3(d, n) / Math.max(norm3(d) * norm3(n), 1e-12), 0);
        }
      }
    }
    return out;
  };

  // deterministic multi-start: several initial rotations, seed-rotated so "show
  // another configuration" explores different manifold points when under-determined
  const starts: number[][] = [];
  const angles = [0, 1.1, 2.3, 4.1, 0.6, 3.1, 5.2, 1.9];
  const axes = [
    v3(0, 0, 1), v3(1, 0, 0), v3(0, 1, 0), v3(0.6, 0.6, 0.5),
    v3(0.7, -0.7, 0), v3(0, 0.7, -0.7), v3(-0.5, 0.5, 0.7), v3(0.9, 0.3, -0.3),
  ];
  for (let i = 0; i < 8; i++) {
    const k = (i + seed) % 8;
    starts.push([0, 0, 0, axes[k].x * angles[k], axes[k].y * angles[k], axes[k].z * angles[k], 0, ...dims0]);
  }

  const results: PivotResult[] = [];
  for (const mirror of [false, true]) {
    const f = residualsFor(mirror);
    let best: { x: number[]; err: number } | null = null;
    for (const x0 of starts) {
      let r = leastSquares(f, x0);
      // polish: restart LM (fresh damping) from the found point until it stops improving
      for (let polish = 0; polish < 3 && r.err > 1e-24 && r.err < 1e-4; polish++) {
        const r2 = leastSquares(f, r.x);
        if (r2.err >= r.err * 0.99) break;
        r = r2;
      }
      if (!best || r.err < best.err) best = r;
      if (best.err < 1e-22) break;
    }
        // acceptance: per-residual ~1e-6 — far under the 2e-5 claim tolerance (the numeric-
    // Jacobian floor rises with mixed scalar residuals; 1e-16 was V4-era point-pins-only)
    if (best && best.err < 1e-12) {
      const g = { ...unpack(best.x), mirror };
      const dims = best.x.slice(7);
      results.push({ transform: (p) => applyGauge(p, g), mirror, dims, err: best.err });
    }
  }
  return results;
}
