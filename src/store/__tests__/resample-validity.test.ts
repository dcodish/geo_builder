import { describe, it, expect } from 'vitest';
import { parse, buildParseCtx } from '@/parser';
import { replay, meetsRequirements, useGeoStore } from '@/store/geoStore';

/**
 * "Show another configuration" (`resample`) must only offer views the initial display would also accept —
 * i.e. every alternative MEETS EVERY REQUIREMENT (`meetsRequirements`: builds, verifier-clean, every
 * "המשך" reaches its far side, every on-segment crossing lands WITHIN its segments, points distinct,
 * polygons convex). Before this was unified with the initial-display gate, `resample` used a weaker test
 * that omitted the on-segment and givens-verifier checks, so it could cycle to configs the student's input
 * forbids — e.g. two right triangles sharing a hypotenuse whose legs meet at E: a seed where C,D sit on
 * OPPOSITE sides of AB leaves E off its segments (E can't be where instructed), and that view must not be
 * offered (bagrut Q8, ADR-223 Am.).
 */
describe('resample only offers valid alternative configurations', () => {
  it('Q8: every "show another" view keeps E on both segments (and both right angles)', () => {
    const st = useGeoStore.getState();
    st.clear();
    const steps = ['משולש ABC ישר זוית', 'משולש ABD ישר זוית', 'AC ו BD נחתכים בנקודה E'];
    for (const s of steps) {
      const { construction, positions } = replay(useGeoStore.getState().facts);
      const r = parse(s, buildParseCtx(construction, positions));
      if (!r.ok) throw new Error('scenario step did not parse: ' + s);
      useGeoStore.getState().executeMany(r.commands, s);
    }
    useGeoStore.getState().autoResolve(); // the initial display auto-resolves to a valid config, as App does
    expect(meetsRequirements(useGeoStore.getState().facts, useGeoStore.getState().seed), 'initial config valid').toBe(true);

    let offered = 0;
    for (let i = 0; i < 30; i++) {
      if (!useGeoStore.getState().resample()) continue;
      offered++;
      const { facts, seed } = useGeoStore.getState();
      expect(meetsRequirements(facts, seed), `resample view #${offered} (seed ${seed}) must meet requirements`).toBe(true);
    }
    expect(offered, 'resample offered at least one genuinely different valid view').toBeGreaterThan(0);
    st.clear();
  });
});
