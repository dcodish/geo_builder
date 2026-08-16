/**
 * S5 gate (#622): the polar substrate — a complex number drawn as a LENGTH and a DIRECTION.
 *
 * The operator's first requirement for this product was that students see the polar coordinates. A dot
 * on a grid does not show them; a radius vector, a swept arc and a modulus ring do.
 */
import { describe, expect, it } from 'vitest';

import { deriveLines } from '../../app/deriveLines';
import { buildScene, prettyName } from '../scene';

const scene = (...lines: string[]) => buildScene(deriveLines(lines).points);

describe('every number is drawn as a length and a direction', () => {
  const s = scene('z1 ברביע הראשון', 'z1^3 = z3', '-2z1 = conj(z3)');

  it('carries a radius vector per number, labelled with the EXACT magnitude', () => {
    expect(s.radii.map((r) => [r.name, r.label])).toEqual([
      ['z1', '√2'],
      ['z3', '2√2'],
    ]);
    expect(s.radii.every((r) => r.known)).toBe(true);
  });

  it('carries an argument arc per number, swept from the +Re axis', () => {
    expect(s.arcs.map((a) => [a.name, a.toDeg, a.label])).toEqual([
      ['z1', 45, '45°'],
      ['z3', 135, '135°'],
    ]);
    expect(s.arcs.every((a) => a.fromDeg === 0)).toBe(true);
  });

  it('staggers the arc radii so two arcs from 0° do not draw on top of each other', () => {
    expect(new Set(s.arcs.map((a) => a.radius)).size).toBe(s.arcs.length);
  });

  it('carries the exact polar reading on the point itself', () => {
    expect(s.points.map((p) => p.exact)).toEqual(['√2·cis45°', '2√2·cis135°']);
  });
});

describe('the polar substrate is readable', () => {
  const s = scene('z1 = 1+i');

  it('has concentric rings at nice steps and rays every 30°', () => {
    expect(s.grid.rayStepDeg).toBe(30);
    expect(s.grid.rays).toContain(30);
    expect(s.grid.rays).toContain(45 + 45); // 90 is on the grid
    expect(s.grid.rays).toHaveLength(12);
    expect(s.grid.rings.length).toBeGreaterThan(2);
  });

  it('covers every point with padding', () => {
    for (const p of s.points) expect(Math.hypot(p.z.re, p.z.im)).toBeLessThan(s.extent);
  });
});

describe('equal magnitudes share ONE ring — the picture that makes the fact one fact', () => {
  it('the three cube roots of 8 sit on a single ring', () => {
    // all three roots have modulus 2; drawn as three rings it reads as three facts
    const all = [0, 1, 2].map((i) => deriveLines(['z^3 = 8'], i).points[0]);
    const s = buildScene(all);
    expect(s.rings).toHaveLength(1);
    expect(s.rings[0].r).toBeCloseTo(2, 9);
    expect(s.rings[0].names).toHaveLength(3);
  });
});

describe('honesty travels with the geometry, not with the consumer', () => {
  const s = scene('z1 ברביע הראשון', 'z1^3 = z3');

  it('a sampled magnitude is marked on the PRIMITIVE, so no consumer must remember to ask', () => {
    expect(s.radii.every((r) => !r.known)).toBe(true);
    expect(s.radii.every((r) => r.label.startsWith('~'))).toBe(true);
  });

  it('a sampled direction is marked the same way', () => {
    expect(s.arcs.every((a) => !a.known)).toBe(true);
    expect(s.arcs.every((a) => a.label.startsWith('~'))).toBe(true);
  });

  it('...and the figure is still DRAWN (ADR-CX-001 D3, always visualise)', () => {
    expect(s.points).toHaveLength(2);
    expect(s.radii).toHaveLength(2);
  });

  it('an exact reading is withheld when the givens do not force one', () => {
    expect(s.points.every((p) => p.exact === null)).toBe(true);
  });
});

describe('names print the way the exam prints them', () => {
  it('subscripts the trailing digits', () => {
    expect(prettyName('z1')).toBe('z₁');
    expect(prettyName('z10')).toBe('z₁₀');
    expect(prettyName('w')).toBe('w');
  });
});
