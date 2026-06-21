/**
 * No-fixed-assumptions principle (ADR-052): an unstated magnitude is a FREE DOF (a default the student
 * can vary / a constraint can force), never a fixed value. Here: a point placed on a segment with NO
 * stated ratio slides along it on "show another configuration"; one with a stated ratio stays put.
 * (The circle-radius instance of the same principle is covered by radius-dof.test.ts.)
 */

import { describe, it, expect } from 'vitest';
import { parse } from '@/parser';
import { freeDofs } from '@/engine';
import { useGeoStore, replay } from '@/store/geoStore';

const tAlong = (fig: { positions: Map<string, { x: number; y: number }> }, a: string, b: string, p: string) => {
  const A = fig.positions.get(a)!;
  const B = fig.positions.get(b)!;
  const P = fig.positions.get(p)!;
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  return ((P.x - A.x) * dx + (P.y - A.y) * dy) / (dx * dx + dy * dy);
};

const enter = (utterances: string[]) => {
  const st = useGeoStore.getState();
  st.clear();
  for (const u of utterances) {
    const r = parse(u);
    expect(r.ok, u).toBe(true);
    if (!r.ok) return;
    for (const cmd of r.commands) st.execute(cmd, u);
  }
};

describe('ADR-052 — a point on a segment with no stated ratio is a free DOF', () => {
  it('"point G on AB" is free (in freeDofs) and slides to different spots across views', () => {
    enter(['triangle ABC', 'point G on AB']);
    const facts = useGeoStore.getState().facts;
    expect(freeDofs(replay(facts).construction)).toContain('G');
    const ts = new Set<number>();
    for (let press = 0; press <= 8; press++) {
      if (press > 0) useGeoStore.getState().resample();
      const fig = replay(facts, useGeoStore.getState().seed); // read the seed fresh — the store mutated it
      const t = tAlong(fig, 'A', 'B', 'G');
      expect(t, `view ${press}: G between A and B`).toBeGreaterThan(0.02);
      expect(t, `view ${press}: G between A and B`).toBeLessThan(0.98);
      ts.add(Math.round(t * 20)); // bucket to ~5% resolution
    }
    expect(ts.size, 'G occupies several distinct positions along AB across views').toBeGreaterThan(2);
    useGeoStore.getState().clear();
  });

  it('"point G on AB at 40%" is a STATED position — fixed, not a free DOF', () => {
    enter(['triangle ABC', 'point G on AB at 40%']);
    const facts = useGeoStore.getState().facts;
    expect(freeDofs(replay(facts).construction)).not.toContain('G');
    expect(tAlong(replay(facts), 'A', 'B', 'G')).toBeCloseTo(0.4, 6);
    useGeoStore.getState().clear();
  });

  // ADR-074 / ADR-052: an EXTENSION point's distance beyond the segment is unstated, so it is a free DOF
  // the sampler varies — even though it is NOT eagerly driven (the ADR-074 distinction). At seed 0 it sits
  // at its default; "show another configuration" slides it, always staying past the far end (t > 1).
  it('"point G on the extension of AB" is samplable — varies across views, stays beyond B (t>1)', () => {
    enter(['triangle ABC', 'point G on the extension of AB']);
    const facts = useGeoStore.getState().facts;
    expect(freeDofs(replay(facts).construction), 'extension point is a samplable free DOF').toContain('G');
    expect(tAlong(replay(facts, 0), 'A', 'B', 'G'), 'seed 0 = default extension t').toBeCloseTo(1.3, 6);
    const ts = new Set<number>();
    for (let press = 1; press <= 8; press++) {
      useGeoStore.getState().resample();
      const t = tAlong(replay(facts, useGeoStore.getState().seed), 'A', 'B', 'G');
      expect(t, `view ${press}: G stays on the extension (beyond B)`).toBeGreaterThan(1);
      ts.add(Math.round(t * 10));
    }
    expect(ts.size, 'G occupies several distinct positions along the extension across views').toBeGreaterThan(2);
    useGeoStore.getState().clear();
  });
});
