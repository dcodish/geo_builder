/**
 * The "view relations" store layer (ADR-134): viewRelations()/clearRelations(), and the facts-ref
 * auto-invalidation — the cached result is tied to the EXACT facts array it was computed from, so any fact
 * change makes it stale (the App selector hides it) while "show another configuration" (a seed change)
 * keeps it, since ground truths are invariant across configurations.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { parse } from '@/parser';
import { useGeoStore } from '../geoStore';

const s = () => useGeoStore.getState();
const enter = (u: string) => {
  const r = parse(u, {});
  if (!r.ok) throw new Error('parse failed: ' + u);
  r.commands.forEach((cmd) => s().execute(cmd, u));
};

beforeEach(() => s().clear());

describe('viewRelations / clearRelations', () => {
  it('computes the layer and caches it against the current facts array', async () => {
    enter('rhombus ABCD');
    expect(s().relations).toBeNull();
    await s().viewRelations();
    const rel = s().relations;
    expect(rel).not.toBeNull();
    expect(rel!.facts).toBe(s().facts); // cached against THIS facts ref
    // a rhombus → all four sides equal (one class)
    expect(rel!.result.equalSegments.length).toBe(1);
    expect(rel!.result.equalSegments[0].length).toBe(4);
  });

  it('clearRelations turns the layer off', async () => {
    enter('rhombus ABCD');
    await s().viewRelations();
    expect(s().relations).not.toBeNull();
    s().clearRelations();
    expect(s().relations).toBeNull();
  });

  it('a new fact makes the cached layer STALE (ref no longer matches → App hides it)', async () => {
    enter('rhombus ABCD');
    await s().viewRelations();
    const cachedFacts = s().relations!.facts;
    enter('point E on AB at 40%'); // any new fact → a fresh facts array
    expect(s().facts).not.toBe(cachedFacts); // the cached ref is now stale
    expect(s().relations!.facts).not.toBe(s().facts); // so the selector `relations.facts === facts` is false
  });

  it('"show another configuration" (a seed change) KEEPS the layer — ground truths are invariant', async () => {
    enter('quadrilateral ABCD'); // has free DOFs, so resample changes the seed
    await s().viewRelations();
    const before = s().relations;
    s().resample();
    expect(s().relations).toBe(before); // same cached object — facts unchanged, only the seed moved
    expect(s().relations!.facts).toBe(s().facts); // still valid (selector keeps it)
  });

  it('clear() resets the layer', async () => {
    enter('rhombus ABCD');
    await s().viewRelations();
    s().clear();
    expect(s().relations).toBeNull();
  });
});
