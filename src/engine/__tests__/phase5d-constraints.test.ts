/**
 * Phase-5d — the constraint family beyond `angle` (ADR-014 generic mechanism):
 * distance, equal-segments, parallel, perpendicular. Each *drives* an on-segment
 * point's parameter t when one is referenced (the constraint places it), and is
 * an over-constraint *check* when every referenced point is already determined.
 */

import { describe, it, expect } from 'vitest';
import type { Vec } from '../types';
import { build, applyStep, emptyConstruction } from '../step';
import { dist, sub } from '../geometry';
import { parse } from '@/parser';

const dot = (u: Vec, v: Vec) => u.x * v.x + u.y * v.y;
const crossp = (u: Vec, v: Vec) => u.x * v.y - u.y * v.x;

/** A,B on the x-axis with an on-segment point E between them. */
const onAB = (bx: number) => [
  { type: 'free-point', id: 'A', x: 0, y: 0 } as const,
  { type: 'free-point', id: 'B', x: bx, y: 0 } as const,
  { type: 'point-on-segment', id: 'E', a: 'A', b: 'B' } as const,
];

describe('distance constraint', () => {
  it('drives an on-segment point to the given distance', () => {
    const { positions } = build([...onAB(10), { type: 'set-distance', a: 'E', b: 'A', value: 3 }]);
    expect(dist(positions.get('A')!, positions.get('E')!)).toBeCloseTo(3, 6);
  });

  it('is an over-constraint check when both points are fixed (keeps prior figure)', () => {
    const sq = build([{ type: 'square', ids: ['A', 'B', 'C', 'D'], side: 5 }]);
    const r = applyStep(sq.construction, { type: 'set-distance', a: 'A', b: 'B', value: 7 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/over-constrained/i);
  });
});

describe('equal-segments constraint', () => {
  it('drives an on-segment point to make two segments equal (here: the midpoint)', () => {
    const { positions } = build([...onAB(10), { type: 'set-equal', a: 'E', b: 'A', c: 'E', d: 'B' }]);
    const A = positions.get('A')!, B = positions.get('B')!, E = positions.get('E')!;
    expect(dist(E, A)).toBeCloseTo(dist(E, B), 6);
    expect(E.x).toBeCloseTo(5, 6); // midpoint of A(0,0)–B(10,0)
  });
});

describe('ratio constraint (a proportion |AB| = k·|CD|)', () => {
  it('drives an on-segment point so |AE| = 2·|EB| (E at the 2:1 point)', () => {
    const { positions } = build([...onAB(6), { type: 'set-ratio', a: 'E', b: 'A', c: 'E', d: 'B', k: 2 }]);
    const A = positions.get('A')!, B = positions.get('B')!, E = positions.get('E')!;
    expect(dist(E, A)).toBeCloseTo(2 * dist(E, B), 6);
    expect(E.x).toBeCloseTo(4, 6); // |AE|=4, |EB|=2 on A(0,0)–B(6,0)
  });

  it('parses "AE = 2 EB" and drives the same point (end to end)', () => {
    const r = parse('AE = 2 EB');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { positions } = build([...onAB(6), ...r.commands]);
    expect(positions.get('E')!.x).toBeCloseTo(4, 6);
  });

  it('is an over-constraint check when both segments are fixed (keeps prior figure)', () => {
    const sq = build([{ type: 'square', ids: ['A', 'B', 'C', 'D'], side: 5 }]); // |AB| = |BC|
    const r = applyStep(sq.construction, { type: 'set-ratio', a: 'A', b: 'B', c: 'B', d: 'C', k: 2 }); // demands |AB| = 2|BC|
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/over-constrained/i);
  });
});

describe('perpendicular constraint', () => {
  it('drives an on-segment point so AE ⟂ AB', () => {
    const { positions } = build([
      { type: 'free-point', id: 'A', x: 0, y: 0 },
      { type: 'free-point', id: 'B', x: 4, y: 0 },
      { type: 'free-point', id: 'P', x: -2, y: 4 },
      { type: 'free-point', id: 'Q', x: 2, y: 4 },
      { type: 'point-on-segment', id: 'E', a: 'P', b: 'Q' },
      { type: 'set-perpendicular', a: 'A', b: 'E', c: 'A', d: 'B' },
    ]);
    const A = positions.get('A')!, B = positions.get('B')!, E = positions.get('E')!;
    expect(dot(sub(E, A), sub(B, A))).toBeCloseTo(0, 5);
  });
});

describe('parallel constraint', () => {
  it('drives an on-segment point so AE ∥ AB', () => {
    const { positions } = build([
      { type: 'free-point', id: 'A', x: 0, y: 0 },
      { type: 'free-point', id: 'B', x: 4, y: 0 },
      { type: 'free-point', id: 'P', x: 3, y: -2 },
      { type: 'free-point', id: 'Q', x: 3, y: 2 },
      { type: 'point-on-segment', id: 'E', a: 'P', b: 'Q' },
      { type: 'set-parallel', a: 'A', b: 'E', c: 'A', d: 'B' },
    ]);
    const A = positions.get('A')!, B = positions.get('B')!, E = positions.get('E')!;
    expect(crossp(sub(E, A), sub(B, A))).toBeCloseTo(0, 5);
  });

  it('is an over-constraint check when the segments are fixed and not parallel', () => {
    // square ABCD: AB ⟂ BC, so declaring AB ∥ BC contradicts the figure.
    const sq = build([{ type: 'square', ids: ['A', 'B', 'C', 'D'] }]);
    const r = applyStep(sq.construction, { type: 'set-parallel', a: 'A', b: 'B', c: 'B', d: 'C' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/over-constrained/i);
  });
});

describe('parser → constraint commands', () => {
  it('parses the four constraint phrasings (He + En)', () => {
    const cases: [string, object][] = [
      ['AB = 6', { type: 'set-distance', a: 'A', b: 'B', value: 6 }],
      ['AB = CD', { type: 'set-equal', a: 'A', b: 'B', c: 'C', d: 'D' }],
      ['BC parallel to AD', { type: 'set-parallel', a: 'B', b: 'C', c: 'A', d: 'D' }],
      ['BC מקביל ל-AD', { type: 'set-parallel', a: 'B', b: 'C', c: 'A', d: 'D' }],
      ['AB perpendicular to CD', { type: 'set-perpendicular', a: 'A', b: 'B', c: 'C', d: 'D' }],
      ['AB מאונך ל-CD', { type: 'set-perpendicular', a: 'A', b: 'B', c: 'C', d: 'D' }],
    ];
    for (const [utterance, expected] of cases) {
      const r = parse(utterance);
      expect(r.ok, `"${utterance}" should parse`).toBe(true);
      if (r.ok) expect(r.commands[0]).toEqual(expected);
    }
  });

  it('the unnamed-foot phrasing "perpendicular from A to BC" now builds an altitude (foot + segment)', () => {
    const r = parse('perpendicular from A to BC');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.commands.map((c) => c.type)).toContain('foot');
  });
});

// guard: a constraint that drives a point keeps existing points stable
describe('stability', () => {
  it('driving E does not move A or B', () => {
    const r1 = build(onAB(10));
    const r2 = applyStep(r1.construction, { type: 'set-distance', a: 'E', b: 'A', value: 3 });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.positions.get('A')).toEqual(r1.positions.get('A'));
    expect(r2.positions.get('B')).toEqual(r1.positions.get('B'));
  });
});

// keep the empty-import-free check honest
it('emptyConstruction is the zero figure', () => {
  expect(emptyConstruction()).toEqual({ objects: [], constraints: [] });
});
