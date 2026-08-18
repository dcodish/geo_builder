/**
 * #724 — orbit feel is CANVAS-RELATIVE: a full-width drag is one full turn, whatever the width.
 * The fixed rad/px constant felt right at ~700px and went "jumpy" when the unified layout made
 * the canvas full-width (operator report) — per-pixel speed must fall as the canvas grows.
 */
import { describe, expect, it } from 'vitest';
import { orbitStep } from '../Figure3';

describe('orbitStep', () => {
  it('a full-width drag is one full turn at ANY width', () => {
    for (const w of [500, 700, 1100, 1600]) {
      expect(orbitStep(w) * w).toBeCloseTo(2 * Math.PI, 9);
    }
  });

  it('per-pixel speed FALLS as the canvas grows (the jumpiness fix)', () => {
    expect(orbitStep(1100)).toBeLessThan(orbitStep(700));
  });

  it('a degenerate tiny width is floored, so the speed never explodes', () => {
    expect(orbitStep(10)).toBe(orbitStep(400));
  });
});
