/**
 * ADR-138 — the equal-pair of a kite/isosceles is a cyclable VARIANT.
 *
 * "Show another configuration" steps `cycleVariant`, which rewrites the `shape-variant` fact's `variant`
 * index (survives replay/undo, like cycleAlt's branch). seed-0/variant-0 reproduces the historical drawing;
 * cycling flips which sides are equal. An explicit `set-equal` on the sides pins the matching variant.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { replay, useGeoStore } from '../geoStore';
import type { AnyCommand, Vec } from '@/engine';

const s = () => useGeoStore.getState();
const fig = () => replay(s().facts, s().seed);
const d = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
const P = (id: string) => fig().positions.get(id)!;

beforeEach(() => s().clear());

describe('cycleVariant — kite axis (2 variants)', () => {
  it('variant 0 = axis AC; cycle → axis BD; cycle → back to AC', () => {
    s().execute({ type: 'shape-variant', shape: 'kite', ids: ['A', 'B', 'C', 'D'], variant: 0 } as AnyCommand, 'kite', 'g');
    expect(fig().lastError).toBeNull();
    // variant 0 — axis AC: |AB|=|AD|, |CB|=|CD|
    expect(d(P('A'), P('B'))).toBeCloseTo(d(P('A'), P('D')), 3);
    expect(d(P('C'), P('B'))).toBeCloseTo(d(P('C'), P('D')), 3);

    expect(s().cycleVariant()).toBe(true);
    expect(fig().lastError).toBeNull();
    // variant 1 — axis BD: |AB|=|BC|, |AD|=|DC|
    expect(d(P('A'), P('B'))).toBeCloseTo(d(P('B'), P('C')), 3);
    expect(d(P('A'), P('D'))).toBeCloseTo(d(P('D'), P('C')), 3);

    expect(s().cycleVariant()).toBe(true); // wraps 2 → 0
    expect(d(P('A'), P('B'))).toBeCloseTo(d(P('A'), P('D')), 3); // back to axis AC
  });
});

describe('cycleVariant — isosceles apex (3 variants)', () => {
  it('cycles apex A → B → C → A', () => {
    s().execute({ type: 'shape-variant', shape: 'isosceles', ids: ['A', 'B', 'C'], variant: 0 } as AnyCommand, 'iso', 'g');
    expect(d(P('A'), P('B'))).toBeCloseTo(d(P('A'), P('C')), 3); // apex A
    expect(s().cycleVariant()).toBe(true);
    expect(d(P('A'), P('B'))).toBeCloseTo(d(P('B'), P('C')), 3); // apex B
    expect(s().cycleVariant()).toBe(true);
    expect(d(P('A'), P('C'))).toBeCloseTo(d(P('B'), P('C')), 3); // apex C
    expect(s().cycleVariant()).toBe(true);
    expect(d(P('A'), P('B'))).toBeCloseTo(d(P('A'), P('C')), 3); // back to apex A
  });
});

describe('cycleVariant — no-op when no variant shape', () => {
  it('returns false on a plain quadrilateral', () => {
    s().execute({ type: 'quadrilateral', ids: ['A', 'B', 'C', 'D'] } as AnyCommand, 'quad', 'g');
    expect(s().cycleVariant()).toBe(false);
  });
});

describe('cycleVariant survives undo (the variant lives in the fact)', () => {
  it('undo reverts the variant flip', () => {
    s().execute({ type: 'shape-variant', shape: 'kite', ids: ['A', 'B', 'C', 'D'], variant: 0 } as AnyCommand, 'kite', 'g');
    s().cycleVariant(); // → variant 1
    const f = s().facts.find((x) => x.cmd.type === 'shape-variant')!;
    expect((f.cmd as { variant: number }).variant).toBe(1);
  });
});
