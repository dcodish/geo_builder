/**
 * #1424 (ADR-CX-052) — «משולש ABC» drew a thin sliver at 10 of 24 configurations: a free polygon's
 * vertices were sampled one by one. A free polygon now STARTS as a shape (a jittered regular n-gon), so
 * it reads as what it names, while every vertex stays a free coordinate.
 */
import { describe, expect, it } from 'vitest';
import { deriveLines } from '../app/deriveLines';
import type { Cx } from '../value/value';

const SEEDS = Array.from({ length: 24 }, (_, i) => i);
const at = (lines: string[], seed: number) => {
  const d = deriveLines(lines, seed, seed);
  return { d, z: (n: string) => d.points.find((p) => p.name === n)?.z };
};
const angleAt = (v: Cx, a: Cx, b: Cx) => {
  const u = { re: a.re - v.re, im: a.im - v.im };
  const w = { re: b.re - v.re, im: b.im - v.im };
  const c = (u.re * w.re + u.im * w.im) / (Math.hypot(u.re, u.im) * Math.hypot(w.re, w.im));
  return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
};
const cross = (o: Cx, a: Cx, b: Cx) => (a.re - o.re) * (b.im - o.im) - (a.im - o.im) * (b.re - o.re);

describe('#1424 — the free polygon reads as its shape', () => {
  it('«משולש ABC»: the smallest corner is ≥ 20° at 24/24 configurations', () => {
    const mins = SEEDS.map((s) => {
      const { z } = at(['משולש ABC'], s);
      const [A, B, C] = ['A', 'B', 'C'].map((n) => z(n)!);
      return Math.min(angleAt(A, B, C), angleAt(B, C, A), angleAt(C, A, B));
    });
    expect(Math.min(...mins), mins.map((m) => m.toFixed(0)).join(' ')).toBeGreaterThanOrEqual(20);
  });

  it('«מרובע ABCD»: convex and not degenerate at 24/24', () => {
    for (const s of SEEDS) {
      const { z } = at(['מרובע ABCD'], s);
      const P = ['A', 'B', 'C', 'D'].map((n) => z(n)!);
      const turns = P.map((p, i) => cross(p, P[(i + 1) % 4], P[(i + 2) % 4]));
      expect(turns.every((t) => t > 0) || turns.every((t) => t < 0), `seed ${s} convex`).toBe(true);
      for (let i = 0; i < 4; i++) expect(angleAt(P[i], P[(i + 3) % 4], P[(i + 1) % 4]), `seed ${s} corner ${i}`).toBeGreaterThan(20);
    }
  });

  it('the vertices stay FREE: the DOF count is unchanged, and «show another configuration» moves them', () => {
    expect(at(['משולש ABC'], 0).d.freeDof).toHaveLength(6);
    expect(at(['מרובע ABCD'], 0).d.freeDof).toHaveLength(8);
    const a0 = at(['משולש ABC'], 0).z('A')!;
    const a1 = at(['משולש ABC'], 1).z('A')!;
    expect(Math.hypot(a0.re - a1.re, a0.im - a1.im)).toBeGreaterThan(1e-3);
  });

  it('a given still decides: A = 0 · B = 4 then «משולש ABC» honours A and B', () => {
    for (const s of SEEDS.slice(0, 6)) {
      const { z } = at(['A = 0', 'B = 4', 'משולש ABC'], s);
      expect(Math.hypot(z('A')!.re, z('A')!.im), `seed ${s}`).toBeLessThan(1e-9);
      expect(Math.hypot(z('B')!.re - 4, z('B')!.im), `seed ${s}`).toBeLessThan(1e-9);
    }
  });
});
