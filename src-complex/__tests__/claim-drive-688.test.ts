/**
 * #688 — a claim over an UNDETERMINED number drives; over a determined one it still only checks.
 *
 * Operator report (2026-08-17): «z1 מדומה טהור» on its own drew z₁ at 189.12°, modulus ≈ 2.4 — nowhere
 * near the imaginary axis — while the panel honestly read `unknown`. `verifyClaim` was not the defect:
 * with `arg z1` free there is nothing to verify. The defect is that a sampled direction is not neutral —
 * placing z₁ at 189° ASSERTS `arg z1 ≈ 189°`, contradicting what the student just typed. ADR-CX-029.
 */
import { describe, expect, it } from 'vitest';
import { deriveLines, lowerLines } from '../app/deriveLines';
import { acceptLine } from '../app/submit';
import { lineThroughOrigin } from '../solve/claimDrive';

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

/**
 * #2802 / #2801 (ADR-CX-100, stage 1a″) — a GIVEN line through the origin is the direction it states.
 *
 * #2802: a lone «Re(z) = 0» or «|z - 1| = |z + 1|» drew z on the origin (≈1e-6·i) at every seed: the
 * descent in (|z|, θ) shrank the free modulus onto its bound. #2801: the same line typed again in another
 * spelling moved z by 1.9–2.7. The line is now lowered to the claim drive's own exact row, arg(z²) = arg(u).
 */
describe('#2802 — a lone line through the origin draws z ON it, away from 0, moving with the configuration', () => {
  const LINES: [string, (z: { re: number; im: number }) => number][] = [
    ['Re(z) = 0', (z) => z.re],
    ['|z - 1| = |z + 1|', (z) => z.re],
    ['Im(z) = 0', (z) => z.im],
    ['|z - i| = |z + i|', (z) => z.im],
    ['Re(z) = Im(z)', (z) => z.re - z.im],
    ['Re(z) + Im(z) = 0', (z) => z.re + z.im],
    ['|z - 1| = |z - i|', (z) => z.re - z.im],
    ['|z - 1 - i| = |z + 1 + i|', (z) => z.re + z.im],
    ['z + conj(z) = 0', (z) => z.re],
  ];
  it.each(LINES)('«%s» at seeds 0–7', (line, onLine) => {
    const zs = [0, 1, 2, 3, 4, 5, 6, 7].map((s) => deriveLines([line], s, s).points.find((p) => p.name === 'z')!.z);
    for (const z of zs) {
      expect(Math.hypot(z.re, z.im), `|z| at ${JSON.stringify(z)}`).toBeGreaterThanOrEqual(0.5);
      expect(Math.abs(onLine(z)), `z = ${JSON.stringify(z)} is on the line`).toBeLessThanOrEqual(1e-9);
    }
    expect(new Set(zs.map((z) => `${z.re.toFixed(3)},${z.im.toFixed(3)}`)).size, 'another configuration moves z').toBeGreaterThanOrEqual(2);
    // Q-2802a judged (a): «הציגו תצורה אחרת» alternates the two sides of the origin, as «z מדומה טהור» does
    const side = (z: { re: number; im: number }) => Math.sign(Math.abs(z.re) > 1e-9 ? z.re : z.im);
    expect(side(zs[0])).toBe(-side(zs[1]));
    expect(deriveLines([line], 0, 0).configCount, 'the two sides are its configurations').toBe(2);
  });

  it('the lift reads exactly: Re/Im/Re = Im and |z − a| = |z − b| with |a| = |b| → arg(z²) = arg(u)', () => {
    const u = (line: string) => {
      const c = lowerLines([line]).constraints[0];
      const l = lineThroughOrigin(c);
      return l && `${l.name}:${l.u.re.n}/${l.u.re.d},${l.u.im.n}/${l.u.im.d}`;
    };
    expect(u('Re(z) = 0')).toBe('z:-1/1,0/1'); // arg z² = 180° — the imaginary axis
    expect(u('|z - 1| = |z + 1|')).toBe('z:-1/1,0/1');
    expect(u('Im(z) = 0')).toBe('z:1/1,0/1'); // the real axis
    expect(u('Re(z) = Im(z)')).toBe('z:0/1,1/1'); // arg z² = 90° — the 45° line
    expect(u('|z - 1| = |z - i|')).toBe('z:0/1,1/1');
  });

  it.each(['Re(z) = 2', '|z - 1| = |z - 3|', '|z - 1 - i| = |z|', '|z - 1| = 2', 'Re(z^2) = 0', '|z - 1| = |z|', '|z - 1| = 2|z + 1|', 'Re(z1) = Re(z2)'])(
    'not a line through 0, not lifted: «%s»',
    (line) => {
      const c = lowerLines([line]).constraints[0];
      expect(lineThroughOrigin(c)).toBeNull();
    },
  );
});

describe('#2802 — the lift gives way where the figure needs the origin or a deferred given pins z (drive by solvability)', () => {
  it('«Re(z) = 0» · «Im(z) = 0» is accepted with z at the origin', () => {
    expect(acceptLine(['Re(z) = 0'], 'Im(z) = 0', 0).ok).toBe(true);
    const z = deriveLines(['Re(z) = 0', 'Im(z) = 0'], 0, 0).points.find((p) => p.name === 'z')!.z;
    expect(Math.hypot(z.re, z.im)).toBeLessThan(1e-3);
  });
  it('«z = 0» · «Re(z) = 0» is accepted', () => expect(acceptLine(['z = 0'], 'Re(z) = 0', 0).ok).toBe(true));
  it('«z = 3+4i» · «Re(z) = 0» is still refused as incompatible', () => {
    const v = acceptLine(['z = 3+4i'], 'Re(z) = 0', 0);
    expect(v.ok).toBe(false);
    expect(!v.ok && 'error' in v ? v.error.key : null).toBe('incompatible');
  });
  it('«|z| = 2» · «Re(z) = 0» draws z = ±2i', () => {
    for (const s of [0, 1]) {
      const z = deriveLines(['|z| = 2', 'Re(z) = 0'], s, s).points.find((p) => p.name === 'z')!.z;
      expect(Math.abs(z.re)).toBeLessThan(1e-9);
      expect(Math.abs(Math.abs(z.im) - 2)).toBeLessThan(1e-9);
    }
  });
});

/** #2801 — the class matrix of the direction family: a restated line through 0 moves nothing, in both orders, at seeds 0–7. */
describe('#2801 — a line through the origin restated in another spelling leaves z where it was', () => {
  it.each([
    ['|z - 1| = |z + 1|', 'Re(z) = 0'],
    ['Im(z) = 0', '|z - i| = |z + i|'],
    ['z מדומה טהור', 'Re(z) = 0'],
    ['z ממשי', 'Im(z) = 0'],
    ['Re(z) = 0', 'Re(z) = 0'],
    ['Re(z) = Im(z)', '|z - 1| = |z - i|'],
  ])('«%s» · «%s», both orders', (a, b) => {
    for (const [first, second] of [[a, b], [b, a]]) {
      for (const s of [0, 1, 2, 3, 4, 5, 6, 7]) {
        const before = deriveLines([first], s, s).points.find((p) => p.name === 'z')!.z;
        const after = deriveLines([first, second], s, s).points.find((p) => p.name === 'z')!.z;
        expect(Math.hypot(after.re - before.re, after.im - before.im), `${first} · ${second} @ ${s}`).toBeLessThanOrEqual(1e-9);
      }
    }
  });

  it('«arg(z) = 90» · «Re(z) = 0»: the line restates the direction (the other order picks a side, a real cut)', () => {
    for (const s of [0, 1, 2, 3, 4, 5, 6, 7]) {
      const before = deriveLines(['arg(z) = 90'], s, s).points.find((p) => p.name === 'z')!.z;
      const after = deriveLines(['arg(z) = 90', 'Re(z) = 0'], s, s).points.find((p) => p.name === 'z')!.z;
      expect(Math.hypot(after.re - before.re, after.im - before.im)).toBeLessThanOrEqual(1e-9);
    }
  });

  it('the claim restating a given still lands ✓ (ADR-CX-084), with z on the axis', () => {
    const d = deriveLines(['Re(z) = 0', 'z מדומה טהור'], 0, 0);
    expect(verdict(d)).toBe('holds');
    expect(Math.abs(d.points.find((p) => p.name === 'z')!.z.re)).toBeLessThan(1e-9);
  });
});
