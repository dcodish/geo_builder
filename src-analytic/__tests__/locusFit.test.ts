/**
 * `engine/locusFit.ts` — the locus snap's vocabulary and its self-check, as a unit (#2734,
 * [ADR-AG-429](../../docs/06c-decisions-analytic.md#adr-ag-429)).
 *
 * The fit → snap → re-verify pipeline (ADR-AG-072 §7) snapped to rationals only, so a locus whose exact equation has a
 * (p/q)·√n coefficient — חורף 2023 Q1's circle about (−3√2/2, 0) — printed its kind alone. The snap now reads the tree's
 * exact-form vocabulary: a small rational first, then a surd from `format.ts`'s one recogniser (`surdOf`), at the tight
 * bar and only on data precise enough for it. These locks pin both directions: the surds snap, and a typed decimal, a
 * value merely NEAR a surd, and a noisy trace do not.
 *
 * Synthetic traces only: the figure itself is locked through the real ask lane in `issue-1224-slanted-locus.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import {
  parametricShape,
  shapeOfTrace,
  snapAndVerify,
  snapExact,
  verifySymbolic,
  fitTrace,
  type LocusPt,
  type LocusSample,
} from '../engine/locusFit';
import { surdOf, surdText, surdValue } from '../format';

const SNAP_TOL = 1e-6; // locusFit's own; restated so a change to it is a decision this file sees
const R2 = Math.SQRT2;

/** `n` points on the circle about (cx, cy) of radius r, each pushed radially by `noise(i)`. */
function circle(cx: number, cy: number, r: number, n = 120, noise: (i: number) => number = () => 0): LocusPt[] {
  return Array.from({ length: n }, (_, i) => {
    const t = (2 * Math.PI * i) / n;
    const rr = r + noise(i);
    return { x: cx + rr * Math.cos(t), y: cy + rr * Math.sin(t) };
  });
}

/** Points along the vertical line x = c. */
const vertical = (c: number, n = 60): LocusPt[] => Array.from({ length: n }, (_, i) => ({ x: c, y: -15 + (30 * i) / (n - 1) }));

describe('#2734 — the recogniser is one, and the display tier spells it unchanged', () => {
  it('surdText still prints ADR-AG-304’s strings', () => {
    expect(surdText(R2 / 4)).toBe('√2/4');
    expect(surdText((-5 * R2) / 4)).toBe('-5√2/4');
    expect(surdText(2 * Math.sqrt(5))).toBe('2√5');
    expect(surdText(Math.sqrt(10))).toBe('√10');
    expect(surdText(Math.sqrt(12))).toBe('2√3');
    expect(surdText(1.4142)).toBeNull();
    expect(surdText(7.34)).toBeNull();
  });

  it('surdOf returns what surdText spells, and surdValue is the number it stands for', () => {
    const s = surdOf((3 * R2) / 2);
    expect(s).toEqual({ sign: 1, num: 3, den: 2, n: 2 });
    expect(surdValue(s!)).toBeCloseTo((3 * R2) / 2, 15);
    expect(surdOf(-Math.sqrt(3))).toEqual({ sign: -1, num: 1, den: 1, n: 3 });
  });
});

describe('#2734 — snapExact: the tree’s exact forms, rational first', () => {
  it('a surd coefficient snaps on precise data: 3√2, −√2/2, 2√6', () => {
    expect(snapExact(4.242640692, SNAP_TOL, true)).toBe(surdValue({ sign: 1, num: 3, den: 1, n: 2 }));
    expect(snapExact(-R2 / 2 + 1e-10, SNAP_TOL, true)).toBe(surdValue({ sign: -1, num: 1, den: 2, n: 2 }));
    expect(snapExact(2 * Math.sqrt(6) * (1 + 3e-9), SNAP_TOL, true)).toBe(surdValue({ sign: 1, num: 2, den: 1, n: 6 }));
  });

  it('a rational keeps its place — −63/2, −84, 8, 1/2 snap to themselves, never to a surd', () => {
    for (const v of [-63 / 2, -84, 8, 1 / 2, 33 / 32]) {
      expect(snapExact(v * (1 + 2e-9), SNAP_TOL, true), String(v)).toBe(v);
      expect(snapExact(v * (1 + 2e-9), 1e-4, true), String(v)).toBe(v);
    }
  });

  it('COUNTER-DIRECTION: a typed decimal is not a surd — 1.4142, 1.732, 3.14159265, 0.7071, 2.1213', () => {
    // 0.7071 is the one the display tier's bar WOULD take (as √50/10: its bar floors at √n). The snap's is relative to v.
    for (const v of [1.4142, 1.732, 3.14159265, 0.7071, 2.1213, -2.8284]) {
      expect(snapExact(v, SNAP_TOL, true), String(v)).toBeNull();
    }
  });

  it('COUNTER-DIRECTION: a value merely NEAR √2 is not √2', () => {
    expect(snapExact(R2 * (1 + 1e-5), SNAP_TOL, true)).toBeNull();
    expect(snapExact(R2 * (1 + 3e-6), SNAP_TOL, true)).toBeNull();
  });

  it('COUNTER-DIRECTION: data that does not hold to the tight bar never reaches the surd arm', () => {
    // √2 itself, but the caller's data is noisy: the rational at the caller's bar decides, exactly as before #2734.
    expect(snapExact(R2, 1e-5, false)).toBeNull();
    // 3√2 at a wide bar is whatever rational that bar admits (140/33), as before #2734 — and the self-check judges it.
    expect(snapExact(3 * R2, 1e-4, false)).toBeCloseTo(140 / 33, 12);
  });
});

describe('#2734 — snapAndVerify: a surd locus states its equation, and the self-check still guards it', () => {
  it('the circle about (−3√2/2, 0) of radius 6 (חורף 2023 Q1’s locus) snaps to D = 3√2, F = −63/2', () => {
    const pts = circle((-3 * R2) / 2, 0, 6);
    const k = snapAndVerify(fitTrace(pts)!, pts);
    expect(k).not.toBeNull();
    expect(k!.A).toBe(1);
    expect(k!.C).toBe(1);
    expect(k!.D).toBe(surdValue({ sign: 1, num: 3, den: 1, n: 2 }));
    expect(k!.E).toBe(0);
    expect(k!.F).toBe(-63 / 2);
  });

  it('shapeOfTrace attaches the conic and names the circle', () => {
    const s = shapeOfTrace(circle(R2, 0, 3));
    expect(s?.curve.kind).toBe('circle');
    expect(s?.conic?.D).toBe(-2 * R2);
  });

  it('the line x = √2/2 snaps', () => {
    const s = shapeOfTrace(vertical(R2 / 2));
    expect(s?.curve.kind).toBe('line');
    expect(s?.conic).toMatchObject({ D: 1, E: 0, F: surdValue({ sign: -1, num: 1, den: 2, n: 2 }) });
  });

  it('COUNTER-DIRECTION: a trace about a typed 1.4142, 1.732 or 3.14159265 stays the kind alone', () => {
    for (const c of [1.4142, 1.732, 3.14159265]) {
      const s = shapeOfTrace(circle(c, 0, 3));
      expect(s?.curve.kind, String(c)).toBe('circle');
      expect(s?.conic, String(c)).toBeUndefined();
    }
    expect(shapeOfTrace(vertical(0.7071))?.conic).toBeUndefined();
  });

  it('COUNTER-DIRECTION: a NOISY trace about (√2, 0) does not snap to the surd', () => {
    // Alternating radial noise: the fit's centre stays at √2 to ~1e-10, but the trace scatters by ~6e-6 — past the
    // tight bar, so the surd arm is closed to it and the kind is all it says.
    const pts = circle(R2, 0, 3, 120, (i) => (i % 2 ? 1e-6 : -1e-6));
    const fit = fitTrace(pts)!;
    expect(Math.abs(fit.D / fit.A + 2 * R2)).toBeLessThan(1e-8);
    expect(snapAndVerify(fit, pts)).toBeNull();
    expect(shapeOfTrace(pts)?.conic).toBeUndefined();
  });

  it('the x = 40 refusal holds for a surd trace too: a conic that does not describe the trace is refused', () => {
    expect(snapAndVerify({ A: 0, B: 0, C: 0, D: 1, E: 0, F: -40 }, vertical(R2 / 2))).toBeNull();
    expect(snapAndVerify({ A: 0, B: 0, C: 0, D: 1, E: 0, F: -40 }, vertical(4))).toBeNull();
  });
});

describe('#2734 — fitMonomial: the third verdict reads a surd ratio (`√2·a`, `3√2a/2`)', () => {
  const samples = (k: number, cy: number, noise: (i: number) => number = () => 0): LocusSample[] =>
    [1, 2, 3.5, 5].map((a) => ({ env: { a }, points: circle(k * a, cy, 3, 80, noise) }));

  it('a centre at (√2·a, 0) is the monomial √2·a; r² stays 9', () => {
    const s = parametricShape(samples(R2, 0), ['a']);
    expect(s?.kind).toBe('circle');
    if (s?.kind !== 'circle') return;
    expect(s.cx).toEqual({ c: surdValue({ sign: 1, num: 1, den: 1, n: 2 }), pow: { a: 1 } });
    expect(s.cy).toEqual({ c: 0, pow: {} });
    expect(s.r2).toEqual({ c: 9, pow: {} });
  });

  it('a centre at (3√2/2·a, √3) — a ratio the loose rational bar alone read as 70/33, and a constant it read as 97/56', () => {
    const s = parametricShape(samples((3 * R2) / 2, Math.sqrt(3)), ['a']);
    expect(s?.kind).toBe('circle');
    if (s?.kind !== 'circle') return;
    expect(s.cx.c).toBe(surdValue({ sign: 1, num: 3, den: 2, n: 2 }));
    expect(s.cy).toEqual({ c: surdValue({ sign: 1, num: 1, den: 1, n: 3 }), pow: {} });
  });

  it('a rational dependence is unchanged: (16a, 0) is 16a', () => {
    const s = parametricShape(samples(16, 0), ['a']);
    expect(s?.kind === 'circle' && s.cx).toEqual({ c: 16, pow: { a: 1 } });
  });

  it('the self-check still runs on a surd monomial: a wrong one is refused', () => {
    const smp = samples(R2, 0);
    expect(verifySymbolic({ kind: 'circle', cx: { c: 1.41, pow: { a: 1 } }, cy: { c: 0, pow: {} }, r2: { c: 9, pow: {} } }, smp)).toBe(false);
  });
});
