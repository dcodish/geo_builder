/**
 * Geometric segment splitting ([ADR-167](docs/06-decisions.md#adr-167)) — the implicit-edge universe is
 * derived from GEOMETRY, not from an enumerated whitelist of point kinds. These tests pin the two load-bearing
 * properties directly on `collinearSplits`, independent of the parser:
 *   1. a point that LANDS on a drawn segment splits it REGARDLESS of its construction kind (the old
 *      `onHostEdges` only split on-segment/midpoint/foot/onSeg-intersection — a plain free point was invisible);
 *   2. a point collinear only by COINCIDENCE of one drawing (not in every sample) does NOT split it, so the
 *      universe still reflects forced geometry (the ground-truth philosophy), never a drawing accident.
 */
import { describe, it, expect } from 'vitest';
import type { Construction, Id, Vec } from '@/engine/types';
import { collinearSplits, figureEdges } from '@/engine/relations';

const keyOf = (es: [Id, Id][]) => es.map(([a, b]) => [a, b].sort().join('-')).sort();

/** A minimal figure: a drawn segment A–B and a third point M, its kind and per-sample positions given. */
function fig(mKind: string, mSamples: Vec[]): { c: Construction; samples: Map<Id, Vec>[] } {
  const c: Construction = {
    objects: [
      { id: 'A', kind: 'free-point' },
      { id: 'B', kind: 'free-point' },
      { id: 'M', kind: mKind },
      { id: 'seg-AB', kind: 'segment', a: 'A', b: 'B' },
    ] as unknown as Construction['objects'],
    constraints: [],
  };
  const samples = mSamples.map((m) => new Map<Id, Vec>([['A', { x: 0, y: 0 }], ['B', { x: 10, y: 0 }], ['M', m]]));
  return { c, samples };
}

describe('collinearSplits — geometric & kind-independent (ADR-167)', () => {
  it('splits a segment at a point ON it whose kind is NOT in the old whitelist (a plain free point)', () => {
    // M is a `free-point` — never on-segment/midpoint/foot/onSeg-intersection, so the old `onHostEdges` missed it.
    const { c, samples } = fig('free-point', [{ x: 5, y: 0 }, { x: 4, y: 0 }, { x: 6, y: 0 }]);
    const splits = keyOf(collinearSplits(c, samples));
    expect(splits).toContain('A-M'); // the two sub-segments now exist as first-class edges
    expect(splits).toContain('B-M');
    // …and they flow through to the shared implicit-edge universe both detectors consume.
    expect(keyOf(figureEdges(c, samples))).toEqual(expect.arrayContaining(['A-M', 'B-M', 'A-B']));
  });

  it('does NOT split when the point is collinear only by coincidence of one drawing', () => {
    // On the segment in sample 0, but OFF it in the others → not forced → no split (avoids reading an accident).
    const { c, samples } = fig('free-point', [{ x: 5, y: 0 }, { x: 5, y: 3 }, { x: 5, y: -2 }]);
    const splits = keyOf(collinearSplits(c, samples));
    expect(splits).not.toContain('A-M');
    expect(splits).not.toContain('B-M');
  });

  it('does NOT split at an endpoint (a point coincident with A or B is not an interior split)', () => {
    const { c, samples } = fig('free-point', [{ x: 0, y: 0 }, { x: 0, y: 0 }]);
    const splits = keyOf(collinearSplits(c, samples));
    expect(splits).not.toContain('A-M');
    expect(splits).not.toContain('B-M');
  });
});
