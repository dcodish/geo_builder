/**
 * LADDER-CX stage 2b — a filter's window survives the change of basis, or it is REPORTED (#690).
 *
 * The defect this locks was silent, which is what made it serious: «z₃ ברביע הראשון» with
 * «arg z₃ + arg z₂ = 0» drew z₃ at 219.52°, outside the quadrant it was stated to be in, with every
 * honesty signal clean. Whether a stated given survived depended on which name Gaussian elimination
 * happened to pivot on — invisible from the line the student typed, so the tests below are written per
 * ROLE (pivot / dependent / branch-fixed) rather than per utterance.
 */
import { describe, expect, it } from 'vitest';

import { deriveLines } from '../../app/deriveLines';
import { argAbove, argBelow, quadrant } from '../filter';
import { type AffineArg, projectWindow, statedWindow, violatesDeg } from '../window';

const fig = (lines: string[], seed = 0) => deriveLines(lines, seed, seed);
const argOf = (lines: string[], name: string, seed = 0): number =>
  fig(lines, seed).points.find((p) => p.name === name)!.argumentDeg;

describe('the window a filter states', () => {
  it('a quadrant is the open sector the exam numbers', () => {
    expect(statedWindow(quadrant('z', 1))).toEqual({ min: 0, max: 90 });
    expect(statedWindow(quadrant('z', 3))).toEqual({ min: 180, max: 270 });
  });

  it('a ONE-SIDED range is bounded at its turn, not a half-line', () => {
    // the property the change of basis depends on: an unbounded end has no turn to be a
    // representative of, and shifting it by one silently admits different directions
    expect(statedWindow(argBelow('z', 45))).toEqual({ min: 0, max: 45 });
    expect(statedWindow(argAbove('z', 100))).toEqual({ min: 100, max: 360 });
  });
});

describe('projecting a window onto the basis coordinate that carries it', () => {
  const affine = (konstDeg: number, terms: Record<string, number>): AffineArg => ({
    konstDeg,
    terms: new Map(Object.entries(terms)),
  });

  it('inverts a negated dependency, swapping the ends', () => {
    // arg z3 = -arg z2, so z3 ∈ (0°, 90°) means arg z2 ∈ (270°, 360°) — the representative that
    // overlaps the unconstrained turn
    const p = projectWindow({ min: 0, max: 90 }, affine(0, { z2: -1 }))!;
    expect(p.name).toBe('z2');
    expect(p.min).toBeCloseTo(270);
    expect(p.max).toBeCloseTo(360);
  });

  it('carries the constant across', () => {
    // arg z1 = arg z2 + 90  ⟹  z1 ∈ (90°, 180°) means arg z2 ∈ (0°, 90°)
    const p = projectWindow({ min: 90, max: 180 }, affine(90, { z2: 1 }))!;
    expect(p.min).toBeCloseTo(0);
    expect(p.max).toBeCloseTo(90);
  });

  it('picks the turn representative that keeps an ACCUMULATED window non-empty', () => {
    // a second filter must land in the same turn as the first, or the intersection is empty or wrong
    const p = projectWindow({ min: 0, max: 45 }, affine(0, { z2: -1 }), () => ({ min: 270, max: 360 }))!;
    expect(p.min).toBeCloseTo(315);
    expect(p.max).toBeCloseTo(360);
  });

  it('scales the period by the coefficient', () => {
    const p = projectWindow({ min: 0, max: 90 }, affine(0, { t: 2 }))!;
    expect(p.max - p.min).toBeCloseTo(45);
  });

  it('DECLINES when the name rides two coordinates — a half-plane is not an interval', () => {
    expect(projectWindow({ min: 0, max: 90 }, affine(0, { a: 1, b: 1 }))).toBeNull();
  });

  it('declines when nothing free carries it — the value is already fixed', () => {
    expect(projectWindow({ min: 0, max: 90 }, affine(30, {}))).toBeNull();
  });
});

describe('the stage-3e backstop reads the DRAWN direction', () => {
  it('accepts a direction inside the stated sector, modulo a turn', () => {
    expect(violatesDeg(quadrant('z', 1), 45)).toBe(false);
    expect(violatesDeg(quadrant('z', 1), -315)).toBe(false); // ≡ 45°
  });

  it('catches one outside it', () => {
    expect(violatesDeg(quadrant('z', 1), 219.52)).toBe(true);
    expect(violatesDeg(argBelow('z', 45), 66.28)).toBe(true);
  });

  it('a filter always carries the statement that made it — src is required, so a refusal quotes it (#716)', () => {
    // the parser sets src from the typed line; the code-built constructors carry math notation
    expect(quadrant('z2', 1).src).toBe('arg z2 ∈ (0°, 90°)');
    expect(argBelow('z2', 45).src).toContain('45');
  });
});

describe('#690 — a filter holds whatever ROLE elimination gives its name', () => {
  it('on the PIVOT — the case that always worked', () => {
    expect(argOf(['z2 ברביע הראשון'], 'z2')).toBeGreaterThan(0);
    expect(argOf(['z2 ברביע הראשון'], 'z2')).toBeLessThan(90);
  });

  it('on a DEPENDENT name — the case that was silently dropped', () => {
    const lines = ['z3 ברביע הראשון', 'arg z3 + arg z2 = 0'];
    for (const seed of [0, 1, 2]) {
      const a = argOf(lines, 'z3', seed);
      expect(a, `seed ${seed}`).toBeGreaterThan(0);
      expect(a, `seed ${seed}`).toBeLessThan(90);
    }
    expect(fig(lines).unsatisfied).toEqual([]);
  });

  it('TWO filters on a dependent name intersect instead of fighting over the turn', () => {
    const lines = ['z2 ברביע הראשון', 'arg z2 < 45', 'arg z3 + arg z2 = 0'];
    for (const seed of [0, 1, 2]) {
      const a = argOf(lines, 'z2', seed);
      expect(a, `seed ${seed}`).toBeGreaterThan(0);
      expect(a, `seed ${seed}`).toBeLessThan(45);
    }
  });

  it('the given still holds after the NUMERIC tier has driven — §2b part ב', () => {
    const lines = ['arg z1 - arg z2 = 90', '|z1| = 9r', '|z2| = 12r', 'z2 ברביע הראשון',
      'arg z2 < 45', '|z3| = 20r', 'arg z3 + arg z2 = 0', 'המרובע Oz1z2z3',
      'שטח Oz1z2z3 הוא 150r^2', 'היקף Oz1z2z3'];
    const d = fig(lines);
    // the area given pins the free direction to arctan ½ — and it lands inside the stated window
    expect(d.points.find((p) => p.name === 'z2')!.argumentDeg).toBeCloseTo(26.565, 1);
    expect(d.unsatisfied).toEqual([]);
    // …so part ב's answer is the exam's, expressed in r
    expect(d.knowledge.find((k) => k.label.includes('היקף'))!.value).toBe('60r');
  });

  it('a filter that CANNOT hold is reported by the student’s own line, never drawn in silence', () => {
    const d = fig(['z1 = 3+4i', 'z1 ברביע השני']);
    expect(d.unsatisfied).toEqual(['z1 ברביע השני']);
  });

  it('…and the acceptance gate therefore BLAMES that line instead of accepting it', async () => {
    const { acceptLine } = await import('../../app/submit');
    const verdict = acceptLine(['z1 = 3+4i'], 'z1 ברביע השני', 0);
    expect(verdict.ok).toBe(false);
  });
});
