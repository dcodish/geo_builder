/**
 * #157 ([ADR-401](docs/06-decisions.md#adr-401)) — the shared detection lane.
 *
 * The three detection layers (relations / shapes / crossings) are one sample sweep, now expressed across
 * the worker boundary: `geoWork.detect` shares the in-flight promise per fact list, and the sample memo is
 * keyed by fact-list CONTENT rather than array identity (identity misses on every worker message, since
 * the facts arrive as a fresh structured clone — which would have made each layer re-sample the figure).
 *
 * Under vitest there is no `Worker`, so the seam runs its synchronous fallback: the threading differs, the
 * SEMANTICS asserted here — one sweep, content-keyed reuse, no stale layer — are the ones that ship.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useGeoStore, sampleStats } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import { parse } from '@/parser';

const s = () => useGeoStore.getState();

function build(...utterances: string[]): Fact[] {
  s().clear();
  for (const u of utterances) {
    const r = parse(u, {} as never);
    if ('ok' in r && r.ok) s().executeMany(r.commands, u);
  }
  return s().facts;
}

describe('the detection layers share ONE sample sweep (M3 across the thread boundary)', () => {
  beforeEach(() => {
    s().clear();
  });

  it('all three layers over one figure cost exactly one sweep', async () => {
    build('ריבוע ABCD', 'AC', 'BD');
    const before = sampleStats.sweeps;
    await s().viewRelations();
    await s().detectShapes();
    await s().detectCrossings();
    expect(sampleStats.sweeps - before, 'relations + shapes + crossings = one sweep').toBe(1);
    expect(s().relations, 'the relations layer landed').not.toBeNull();
    expect(s().shapes, 'the shapes layer landed').not.toBeNull();
    expect(s().crossings, 'the crossings layer landed').not.toBeNull();
  });

  it('the memo is keyed by CONTENT, so an equal fact list does not re-sample', async () => {
    const facts = build('משולש ABC', 'AB=AC');
    await s().viewRelations();
    const before = sampleStats.sweeps;
    // the same content in a DIFFERENT array — what a worker message (a structured clone) looks like
    useGeoStore.setState({ facts: facts.map((f) => ({ ...f })), relations: null });
    await s().viewRelations();
    expect(sampleStats.sweeps - before, 'same content ⇒ memo hit, no second sweep').toBe(0);
    expect(s().relations, 'the layer is still computed for the new array').not.toBeNull();
  });

  it('a layer computed for a superseded figure is never written', async () => {
    build('ריבוע ABCD');
    const pending = s().viewRelations(); // in flight…
    build('משולש ABC', 'AB=AC'); // …the student adds a step; the answer is for a figure that is gone
    await pending;
    expect(s().relations, 'no layer from the superseded figure').toBeNull();
  });
});
