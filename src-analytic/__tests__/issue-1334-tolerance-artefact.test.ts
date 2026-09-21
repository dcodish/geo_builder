/**
 * #1334 ([ADR-AG-143](../../docs/06c-decisions-analytic.md#adr-ag-143)) — A RING THINNER THAN ITS
 * TOLERANCE IS NOT A SOLUTION. The analytic port of 2-D's ADR-537 (#1328, P1).
 *
 * «משולש ABC» · «AB = AC» · «∠ABC = 90» has no triangle in it — the givens hold only in the limit B = C.
 * Measured before: the solve met both residuals within tolerance with |BC| ≈ 0.005 on 7-unit sides,
 * and the configuration search found seeds (0, 2, 3) where the needle sat just above the ring collapse
 * floor and was shown whole, every row green; `decideSubmit` accepted the third line.
 *
 * The gate: a declared ring that is THIN triggers a re-solve of the same system under a tightened
 * tolerance; a needle bought with slack collapses there and is reported as unsatisfied, blamed on the
 * last given that touches the ring. A genuine thin triangle is an exact solution and keeps its shape.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { decideSubmit } from '../app/submit';
import { minCornerSin, THIN_SIN_TOL, thinRingsOf, COLLAPSED_SIN_TOL } from '../engine/rings';
import { withToleranceFactor, toleranceFactor, TIGHT_TOLERANCE_FACTOR } from '../engine/solve';

const NEEDLE = ['משולש ABC', 'AB = AC', '∠ABC = 90'];
const codes = (lines: string[], seed: number) => derive(lines, seed).faults.map((f) => `${f.code}@${f.index}`);
const side = (lines: string[], seed: number, a: string, b: string) => {
  const d = derive(lines, seed);
  const p = (id: string) => d.figure.points.find((q) => q.id === id)!;
  return Math.hypot(p(a).x - p(b).x, p(a).y - p(b).y);
};

describe('#1334 — the needle is refused at EVERY seed, never drawn green', () => {
  it('every seed 0–7 reports the figure as unsatisfiable — none shows it whole', () => {
    for (let seed = 0; seed < 8; seed++) {
      const faults = codes(NEEDLE, seed);
      expect(faults.some((f) => f.startsWith('unsatisfiable@')), `seed ${seed}: ${JSON.stringify(faults)}`).toBe(true);
    }
  });

  it('the seeds that accepted the needle before (0, 2, 3) now blame the statement that completed the contradiction — «∠ABC = 90»', () => {
    for (const seed of [0, 2, 3]) {
      expect(codes(NEEDLE, seed), `seed ${seed}`).toContain('unsatisfiable@2');
      // and the figure they hold IS a needle — the report is about a real collapse, not a false positive
      expect(side(NEEDLE, seed, 'B', 'C') / side(NEEDLE, seed, 'A', 'B'), `seed ${seed}: |BC|/|AB|`).toBeLessThan(2e-3);
    }
  });

  it('the submit gate refuses the third line at EVERY seed — including the seeds where the solver blames «AB = AC», because a line that turns a green figure red is the line to refuse', () => {
    for (let seed = 0; seed < 8; seed++) {
      const v = decideSubmit('∠ABC = 90', ['משולש ABC', 'AB = AC'], seed);
      expect(v.kind, `seed ${seed}`).toBe('refused');
      expect(v.kind === 'refused' && v.error.key, `seed ${seed}`).toBe('unsatisfiable');
      expect(v.kind === 'refused' && v.error.detail, `seed ${seed}: names the student's sentence`).toBe('∠ABC = 90');
    }
  });
});

describe('#1334 — passing proves nothing: genuine thin figures and ordinary ones still build', () => {
  it.each([
    [['משולש ABC', '∠ABC = 90'], 'a plain right angle'],
    [['משולש ABC', '∠ABC = 90', 'AB = 10', 'BC = 0.2'], 'a SOLVED 1.15° apex — thin, exact, kept'],
    [['A(0,0)', 'B(10,0)', 'C(10,0.1745)', 'משולש ABC'], 'a PINNED 1° apex'],
    [['A(3,4)', 'B(0,4)', 'משוואת המעגל x^2+y^2=25', 'P נקודת החיתוך של הישר AB עם המעגל x^2+y^2=25'], '#1273’s figure'],
  ])('%j — %s', (lines) => {
    for (const seed of [0, 1, 2]) expect(codes(lines as string[], seed), `seed ${seed}`).toEqual([]);
  });

  it('the solved thin triangle IS inside the trigger band — so the re-solve ran and kept it', () => {
    const d = derive(['משולש ABC', '∠ABC = 90', 'AB = 10', 'BC = 0.2'], 0);
    const at = (id: string) => { const p = d.figure.points.find((q) => q.id === id); return p ? { x: p.x, y: p.y } : undefined; };
    expect(thinRingsOf(d.construction, at).map((r) => r.id)).toEqual(['poly-ABC']);
    const ring = ['A', 'B', 'C'].map((id) => at(id)!);
    expect(minCornerSin(ring)).toBeLessThan(THIN_SIN_TOL);
    expect(minCornerSin(ring)).toBeGreaterThan(COLLAPSED_SIN_TOL);
  });

  it('two right angles in one triangle are still refused, as before', () => {
    for (const seed of [0, 1]) expect(codes(['משולש ABC', '∠ABC = 90', '∠ACB = 90'], seed).length).toBeGreaterThan(0);
  });
});

describe('#1334 — the tolerance factor is scoped and always restored', () => {
  it('withToleranceFactor tightens inside and restores outside, even when the body throws', () => {
    expect(toleranceFactor()).toBe(1);
    const seen = withToleranceFactor(TIGHT_TOLERANCE_FACTOR, () => toleranceFactor());
    expect(seen).toBe(TIGHT_TOLERANCE_FACTOR);
    expect(toleranceFactor()).toBe(1);
    expect(() => withToleranceFactor(0.5, () => { throw new Error('boom'); })).toThrow('boom');
    expect(toleranceFactor()).toBe(1);
  });
});
