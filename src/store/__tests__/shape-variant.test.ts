/**
 * ADR-138 — the equal-pair of a kite/isosceles is a cyclable VARIANT.
 *
 * "Show another configuration" steps `cycleVariant`, which rewrites the `shape-variant` fact's `variant`
 * index (survives replay/undo, like cycleAlt's branch). seed-0/variant-0 reproduces the historical drawing;
 * cycling flips which sides are equal. An explicit `set-equal` on the sides pins the matching variant.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { replay, useGeoStore } from '../geoStore';
import type { AnyCommand, Id, Vec } from '@/engine';

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

describe('B2 — viewRelations samples across variants', () => {
  it('a lone kite reports NO forced segment-equality (the equal-pair is a free choice, ADR-138)', () => {
    s().execute({ type: 'shape-variant', shape: 'kite', ids: ['A', 'B', 'C', 'D'], variant: 0 } as AnyCommand, 'kite', 'g');
    s().viewRelations();
    // axis-AC's |AB|=|AD| holds in the drawn config but not axis-BD — so across the variants nothing is forced.
    expect(s().relations!.result.equalSegments).toEqual([]);
  });

  it('a rhombus (no variant) still reports its four equal sides', () => {
    // Built from primitives (parser-independent): a quad with all four sides equal.
    s().execute({ type: 'quadrilateral', ids: ['A', 'B', 'C', 'D'] } as AnyCommand, 'q', 'g');
    s().execute({ type: 'set-equal', a: 'A', b: 'B', c: 'B', d: 'C' } as AnyCommand, 'q', 'g');
    s().execute({ type: 'set-equal', a: 'B', b: 'C', c: 'C', d: 'D' } as AnyCommand, 'q', 'g');
    s().execute({ type: 'set-equal', a: 'C', b: 'D', c: 'D', d: 'A' } as AnyCommand, 'q', 'g');
    s().viewRelations();
    expect(s().relations!.result.equalSegments.length).toBeGreaterThan(0); // the equal sides ARE forced
  });
});

describe('cycleVariant — inscribed rhombus (ADR-262: the variant is the mirror placement)', () => {
  it('stays a rhombus across the cycle; the placement changes', () => {
    s().execute({ type: 'triangle', ids: ['A', 'B', 'C'] } as AnyCommand, 'tri', 'g');
    s().execute({ type: 'inscribe', shape: 'rhombus', ids: ['B', 'D', 'E', 'F'], container: ['A', 'B', 'C'], containerKind: 'triangle', variant: 0 } as AnyCommand, 'insc', 'g');
    expect(fig().lastError).toBeNull();
    const sidesEqual = () => {
      const s0 = d(P('B'), P('D'));
      return [d(P('D'), P('E')), d(P('E'), P('F')), d(P('F'), P('B'))].every((x) => Math.abs(x - s0) < 1e-3);
    };
    expect(sidesEqual(), 'rhombus at variant 0').toBe(true);
    const d0 = { ...P('D') }, f0 = { ...P('F') };
    expect(s().cycleVariant()).toBe(true); // → the mirror placement (D and F swap near-sides)
    expect(fig().lastError).toBeNull();
    expect(sidesEqual(), 'still a rhombus after the cycle').toBe(true);
    // The mirror swaps D and F across B's near sides — a genuine change (D lands where F was).
    expect(d(d0, P('D')), 'the placement changed').toBeGreaterThan(1e-6);
    expect(d(f0, P('D')), 'D moved to F’s old side').toBeLessThan(1e-3);
  });
});

describe('inscribed rhombus — drawn, detected, equal sides reported (ADR-262)', () => {
  it('detect shapes finds the rhombus and equal-segments reports its four sides', async () => {
    s().execute({ type: 'triangle', ids: ['A', 'B', 'C'] } as AnyCommand, 'tri', 'g');
    s().execute({ type: 'inscribe', shape: 'rhombus', ids: ['B', 'D', 'E', 'F'], container: ['A', 'B', 'C'], containerKind: 'triangle', variant: 0 } as AnyCommand, 'insc', 'g');
    // (1) drawn — the polygon object exists.
    expect(fig().construction.objects.some((o) => o.kind === 'polygon' && o.id === 'poly-BDEF')).toBe(true);
    // (2) detected.
    await s().detectShapes();
    expect(s().shapes!.result.shapes.some((sh) => sh.type === 'rhombus')).toBe(true);
    // (3) equal segments — the four sides in one class.
    s().viewRelations();
    const cls = s().relations!.result.equalSegments;
    expect(cls.some((c) => c.length === 4)).toBe(true);
    // (4) corresponding angle at a point ON a side: ∠B = ∠CDE (DE∥AB) must surface — an inscribe variant is a
    // placement/mirror, so it must NOT gate relation detection (ADR-262 Am.: excluded from variantConfigs).
    const eqA = s().relations!.result.equalAngles;
    const sameRef = (r: { vertex: Id; a: Id; b: Id }, v: Id, a: Id, b: Id) =>
      r.vertex === v && ((r.a === a && r.b === b) || (r.a === b && r.b === a));
    expect(
      eqA.some((c) => c.some((r) => sameRef(r, 'B', 'A', 'C')) && c.some((r) => sameRef(r, 'D', 'C', 'E'))),
      '∠ABC and ∠CDE in one equal class',
    ).toBe(true);
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
