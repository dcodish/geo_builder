/**
 * #1859 (ADR-3D-357) — A STATED ANGLE NEAR 0° OR 180° IS A REAL, THIN FIGURE: it builds and verifies.
 *
 * Before, measured at b0e9dbea through `decideDeterministic3` ×24 seeds: «משולש ABC · ∠ABC = 1°» was refused
 * `claim-refuted` at 19/24 (0.5° at 24/24), «∠ABC = 170°» at 24/24 (15 of them the false «… מתקיים רק אם המשולש
 * ABC שטוח»), 175°–179.5° `givens-contradict` at 24/24, and «פירמידה SABCD · ∠ASB = 1° / 2° / 3°» at 21–17 of 24.
 * 2-D builds every one of them (the `[2-D]` contract). Two mechanisms, one class — *a stated angle is solved in a
 * coordinate that loses resolution at the ends of its range*:
 *
 *  1. the `vangle` / `seg-angle` residuals were cosines, whose sensitivity sin θ vanishes at 0° and 180°, so an
 *     accepted 1° solve sat further off than the claim verifier's 0.001° (`ANGLE_TOL_DEG`). They are now the
 *     ANGLE itself, in radians;
 *  2. a stated obtuse angle admits C anywhere on a ray from B, and the solver's "nearest the seed's sample" is
 *     measured in dims space, where the nearest admissible point is B itself — a side driven to zero. The
 *     open-figure retry now has a last attempt that measures nearness in log pairwise distances, where a
 *     collapse is infinitely far; a flatness the givens FORCE still has no open figure and stays refused.
 *
 * Plus the #817 face preference stops sweeping 200 seeds for a face a stated angle makes thin. Everything runs
 * through the App's real pre-LLM decision.
 */
import { describe, expect, it } from 'vitest';
import { decideDeterministic3 } from '../app/decideDeterministic3';
import { derive3, type Fact3 } from '../store/store3';
import { ANGLE_TOL_DEG } from '../engine/claims';

type P3 = { x: number; y: number; z: number };
const SEEDS_24 = Array.from({ length: 24 }, (_, i) => i);

function run(lines: readonly string[], seed: number) {
  let st: { facts: Fact3[]; seed: number } = { facts: [], seed };
  let n = 0;
  for (let i = 0; i < lines.length; i++) {
    const v = decideDeterministic3(st, lines[i], () => `f${++n}`);
    if (v.kind !== 'record') return { st, refusedAt: i, verdict: v };
    st = { facts: v.facts, seed: v.seed };
  }
  return { st, refusedAt: -1, verdict: null };
}

const angleAt = (pos: ReadonlyMap<string, P3>, v: string, p: string, q: string): number => {
  const V = pos.get(v)!, P = pos.get(p)!, Q = pos.get(q)!;
  const a = { x: P.x - V.x, y: P.y - V.y, z: P.z - V.z };
  const b = { x: Q.x - V.x, y: Q.y - V.y, z: Q.z - V.z };
  const cr = Math.hypot(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
  return (Math.atan2(cr, a.x * b.x + a.y * b.y + a.z * b.z) * 180) / Math.PI;
};

/** Every line records at `seed`, every fact is ok, and the drawn angle at `v` meets the claim tolerance. */
function builds(lines: readonly string[], seed: number, angle?: { v: string; p: string; q: string; deg: number; line?: true }): void {
  const r = run(lines, seed);
  expect(r.refusedAt, `seed ${seed}: «${lines[r.refusedAt]}» → ${JSON.stringify(r.verdict)}`).toBe(-1);
  const d = derive3(r.st.facts, r.st.seed);
  for (const f of r.st.facts) expect(d.status[f.id], `seed ${seed}: «${f.utterance}»`).toBe('ok');
  if (angle) {
    const raw = angleAt(d.positions, angle.v, angle.p, angle.q);
    const drawn = angle.line ? Math.min(raw, 180 - raw) : raw; // a LINE angle is undirected, ≤ 90°
    expect(Math.abs(drawn - angle.deg), `seed ${seed}: drawn ${drawn}°`).toBeLessThanOrEqual(ANGLE_TOL_DEG);
  }
}

describe('#1859 — a thin real triangle builds at every seed, its drawn angle within the claim tolerance', () => {
  it.each([0.5, 1, 2, 3, 150, 170, 175, 179, 179.5])('«משולש ABC · ∠ABC = %s°» builds at all 24 seeds', (deg) => {
    for (const seed of SEEDS_24) builds(['משולש ABC', `∠ABC = ${deg}°`], seed, { v: 'B', p: 'A', q: 'C', deg });
  }, 120_000);

  it('the degree sign is optional («∠ABC = 1»)', () => {
    for (const seed of SEEDS_24) builds(['משולש ABC', '∠ABC = 1'], seed, { v: 'B', p: 'A', q: 'C', deg: 1 });
  }, 60_000);

  it('a near-straight angle with stated sides builds (the gauge-solving path)', () => {
    for (const seed of SEEDS_24) builds(['משולש ABC', 'AB = 5', 'BC = 3', '∠ABC = 179°'], seed, { v: 'B', p: 'A', q: 'C', deg: 179 });
  }, 60_000);

  it('a thin LINE angle (the `seg-angle` residual) builds: «הזווית בין AC לבין AB היא 1» / 0.5', () => {
    for (const seed of SEEDS_24) {
      builds(['משולש ABC', 'הזווית בין AC לבין AB היא 1'], seed, { v: 'A', p: 'B', q: 'C', deg: 1, line: true });
      builds(['משולש ABC', 'הזווית בין AC לבין AB היא 0.5'], seed, { v: 'A', p: 'B', q: 'C', deg: 0.5, line: true });
    }
  }, 120_000);

  it('the same vertex-angle sentence on a solid builds: «פירמידה SABCD · ∠ASB = 1°»', () => {
    for (const seed of SEEDS_24) builds(['פירמידה SABCD', '∠ASB = 1°'], seed, { v: 'S', p: 'A', q: 'B', deg: 1 });
  }, 120_000);

  it('…and at 2° and 3° (sampled seeds — each submit pays the #817 preference sweep, #2301)', () => {
    for (const seed of [0, 7, 13]) {
      builds(['פירמידה SABCD', '∠ASB = 2°'], seed, { v: 'S', p: 'A', q: 'B', deg: 2 });
      builds(['פירמידה SABCD', '∠ASB = 3°'], seed, { v: 'S', p: 'A', q: 'B', deg: 3 });
    }
  }, 120_000);

  it('the stated angle is not a fixed figure: the free sides still vary with the seed', () => {
    const ratios = new Set<string>();
    for (const seed of SEEDS_24) {
      const r = run(['משולש ABC', '∠ABC = 170°'], seed);
      const pos = derive3(r.st.facts, r.st.seed).positions;
      const d = (a: string, b: string) => Math.hypot(pos.get(a)!.x - pos.get(b)!.x, pos.get(a)!.y - pos.get(b)!.y, pos.get(a)!.z - pos.get(b)!.z);
      ratios.add((d('B', 'C') / d('A', 'B')).toFixed(2));
    }
    expect(ratios.size).toBeGreaterThanOrEqual(6);
  }, 60_000);
});

describe('#1859 — what the givens force flat stays refused (#1849 / ADR-3D-310)', () => {
  it.each<[string, string[]]>([
    ['5 · 3 · 8', ['משולש ABC', 'AB = 5', 'BC = 3', 'AC = 8']],
    ['a coincidence of two sides of a quadrilateral', ['מרובע ABCD', 'AB מתלכד עם CD']],
    ['a straight angle', ['משולש ABC', '∠ABC = 180°']],
  ])('%s is refused on its last line at all 24 seeds', (_n, lines) => {
    for (const seed of SEEDS_24) {
      const r = run(lines, seed);
      expect(r.refusedAt, `seed ${seed}`).toBe(lines.length - 1);
      expect(r.verdict, `seed ${seed}`).toMatchObject({ kind: 'refused', error: { code: 'polygon-collapsed' } });
    }
  }, 120_000);
});
