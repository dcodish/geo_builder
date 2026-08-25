/**
 * #688 — a claim over an UNDETERMINED number drives; over a determined one it still only checks.
 *
 * Operator report (2026-08-17): «z1 מדומה טהור» on its own drew z₁ at 189.12°, modulus ≈ 2.4 — nowhere
 * near the imaginary axis — while the panel honestly read `unknown`. `verifyClaim` was not the defect:
 * with `arg z1` free there is nothing to verify. The defect is that a sampled direction is not neutral —
 * placing z₁ at 189° ASSERTS `arg z1 ≈ 189°`, contradicting what the student just typed. ADR-CX-029.
 */
import { describe, expect, it } from 'vitest';
import { deriveLines } from '../app/deriveLines';

const argOf = (d: ReturnType<typeof deriveLines>, name: string): number => {
  const p = d.points.find((q) => q.name === name)!;
  return ((Math.atan2(p.z.im, p.z.re) * 180) / Math.PI + 360) % 360;
};
const modOf = (d: ReturnType<typeof deriveLines>, name: string): number => {
  const p = d.points.find((q) => q.name === name)!;
  return Math.hypot(p.z.re, p.z.im);
};
const near = (a: number, b: number, tol = 1e-6): boolean => Math.abs(a - b) < tol;
const verdict = (d: ReturnType<typeof deriveLines>): string | undefined => d.claims[0]?.verdict.status;

describe('#688 — a claim whose DOF is free lowers to a constraint', () => {
  it('«z1 מדומה טהור» alone puts z1 ON the imaginary axis, and the claim holds', () => {
    const d = deriveLines(['z1 מדומה טהור'], 0, 0);
    const a = argOf(d, 'z1');
    expect(near(a, 90) || near(a, 270), `arg z1 = ${a} must be 90° or 270°`).toBe(true);
    expect(verdict(d), 'the claim is now provable, not unknown').toBe('holds');
  });

  it('both configurations are reachable — the turn unknown gives 90° ↔ 270° for free', () => {
    const args = [0, 1].map((i) => argOf(deriveLines(['z1 מדומה טהור'], i, 0), 'z1'));
    expect(args.every((a) => near(a, 90) || near(a, 270)), `${args} must all be axial`).toBe(true);
    expect(new Set(args.map(Math.round)).size, 'the two configurations differ').toBe(2);
  });

  it('«z1 ממשי» alone puts z1 on the REAL axis', () => {
    const a = argOf(deriveLines(['z1 ממשי'], 0, 0), 'z1');
    expect(near(a, 0) || near(a, 180), `arg z1 = ${a} must be 0° or 180°`).toBe(true);
  });

  it('a stated modulus is HONOURED while the claim drives the direction: |z1| = 5 ⇒ (0, ±5)', () => {
    const d = deriveLines(['|z1| = 5', 'z1 מדומה טהור'], 0, 0);
    const a = argOf(d, 'z1');
    expect(near(a, 90) || near(a, 270), `arg z1 = ${a}`).toBe(true);
    expect(modOf(d, 'z1')).toBeCloseTo(5, 6);
  });

  it('«z1 ו-z2 צמודים זה לזה» gives equal moduli and opposite arguments', () => {
    const d = deriveLines(['z1 ו-z2 צמודים זה לזה'], 0, 0);
    expect(modOf(d, 'z2')).toBeCloseTo(modOf(d, 'z1'), 6);
    const s = (argOf(d, 'z1') + argOf(d, 'z2')) % 360;
    expect(near(s, 0) || near(s, 360), `arg z1 + arg z2 = ${s} must be ≡ 0`).toBe(true);
  });
});

describe('#688 — the guard: claims did NOT become drivers', () => {
  it('a DETERMINED subject is verified, never moved — «z1 = 3+4i» then «z1 מדומה טהור» stays refuted', () => {
    const d = deriveLines(['z1 = 3+4i', 'z1 מדומה טהור'], 0, 0);
    const p = d.points.find((q) => q.name === 'z1')!;
    expect(p.z.re, 'z1 is exactly where the given put it').toBeCloseTo(3, 9);
    expect(p.z.im).toBeCloseTo(4, 9);
    expect(verdict(d), 'and the claim lands with a ✗').toBe('refuted');
  });

  it('the acceptance-gate figure is unaffected: «z1 = 1+i» + the claim keeps z1 at 1+i, marked ✗', () => {
    const d = deriveLines(['z1 = 1+i', 'z1 מדומה טהור'], 0, 0);
    const p = d.points.find((q) => q.name === 'z1')!;
    expect(p.z.re).toBeCloseTo(1, 9);
    expect(p.z.im).toBeCloseTo(1, 9);
    expect(verdict(d)).toBe('refuted');
  });

  it('a determined subject is untouched for the conjugate family too', () => {
    const d = deriveLines(['z1 = 3+4i', 'z2 = 1+i', 'z1 ו-z2 צמודים זה לזה'], 0, 0);
    const z2 = d.points.find((q) => q.name === 'z2')!;
    expect(z2.z.re).toBeCloseTo(1, 9);
    expect(z2.z.im).toBeCloseTo(1, 9);
    expect(verdict(d)).toBe('refuted');
  });
});

/**
 * The invariant this bug violated, stated once rather than per family: nothing the figure DRAWS may
 * contradict a claim the panel has not refuted. A `holds` or `unknown` verdict beside a point sitting
 * somewhere that disproves it is the two-surfaces-disagreeing defect (#653) in its worst form.
 */
describe('#688 — the corpus-wide invariant', () => {
  it.each([
    [['z1 מדומה טהור']],
    [['z1 ממשי']],
    [['|z1| = 5', 'z1 מדומה טהור']],
    [['z1 ו-z2 צמודים זה לזה']],
    [['arg z1 = 30', 'z1 מדומה טהור']],
    [['z1 = 3+4i', 'z1 מדומה טהור']],
  ])('no plotted point sits where it refutes a non-refuted claim: %s', (lines) => {
    for (const seed of [0, 1, 2]) {
      const d = deriveLines(lines, seed, seed);
      for (const c of d.claims) {
        if (c.verdict.status === 'refuted') continue;
        if (c.claim.kind === 'imaginary') {
          const a = argOf(d, c.claim.name);
          expect(near(a, 90, 1e-4) || near(a, 270, 1e-4), `${c.verdict.status} claim, but arg = ${a}`).toBe(true);
        }
        if (c.claim.kind === 'real') {
          const a = argOf(d, c.claim.name);
          expect(near(a, 0, 1e-4) || near(a, 180, 1e-4) || near(a, 360, 1e-4), `${c.verdict.status} claim, but arg = ${a}`).toBe(true);
        }
      }
    }
  });
});
