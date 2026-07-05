/**
 * The store's "detect shapes" slice (FR-SH) — mirrors the relations slice's facts-keyed cache: the
 * detected shapes are cached with the exact `facts` array, so any fact change makes the cache stale
 * (selector `shapes.facts === facts` fails) and `clearShapes` drops it. Not part of undo history.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useGeoStore } from '../geoStore';
import type { AnyCommand } from '@/engine';

const s = () => useGeoStore.getState();
beforeEach(() => s().clear());

const square = (): AnyCommand => ({ type: 'square', ids: ['A', 'B', 'C', 'D'] }) as AnyCommand;

describe('detectShapes / clearShapes', () => {
  it('caches the result keyed to the current facts array', async () => {
    s().execute(square(), 'square ABCD', 'g1');
    const factsAtDetect = s().facts;
    await s().detectShapes();
    const shapes = s().shapes!;
    expect(shapes).not.toBeNull();
    expect(shapes.facts).toBe(factsAtDetect); // same ref → layer is "live"
    expect(shapes.result.shapes.map((x) => x.type)).toContain('square');
  });

  it('a new fact makes the cached layer stale (facts ref differs)', async () => {
    s().execute(square(), 'square ABCD', 'g1');
    await s().detectShapes();
    const cachedFacts = s().shapes!.facts;
    s().execute({ type: 'point-on-segment', id: 'G', a: 'A', b: 'D', t: 0.5 } as AnyCommand, 'G on AD', 'g2');
    // The cache still holds its OLD facts ref; the live selector (shapes.facts === facts) would now miss.
    expect(s().shapes!.facts).toBe(cachedFacts);
    expect(s().shapes!.facts).not.toBe(s().facts);
  });

  it('clearShapes resets the layer to null', async () => {
    s().execute(square(), 'square ABCD', 'g1');
    await s().detectShapes();
    expect(s().shapes).not.toBeNull();
    s().clearShapes();
    expect(s().shapes).toBeNull();
  });

  it('clear() also drops the shapes layer', async () => {
    s().execute(square(), 'square ABCD', 'g1');
    await s().detectShapes();
    s().clear();
    expect(s().shapes).toBeNull();
  });
});
