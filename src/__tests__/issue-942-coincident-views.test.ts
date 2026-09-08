/**
 * #942 (ADR-486) — TWO NAMED POINTS NEVER COLLIDE WHILE ANOTHER CONFIGURATION EXISTS; WHEN ONE MUST,
 * THE CANVAS SAYS SO.
 *
 * Operator's rule, 2026-09-08: *"we have a rule that nodes never collide if there is an option to show
 * them in a different way. only when there is no other config, we should do that and write that they
 * collide."*
 *
 * He hit it playing round #940 T3: the FIRST press of «הציגו תצורה אחרת» put D on B. Measured, that
 * figure is not broken at all — it is a perfect square (sides 2.2980 ×4, equal diagonals, four exact
 * 90°, E on AB, G on BC, F on AC, `violations: []`), the classical square seated in the right-angle
 * corner. It is legal, and ADR-123 is right that such a figure must still draw. What was wrong is that
 * it was OFFERED while seatings that separate the labels were available — presses 5 and 6 give them.
 *
 * So the fix is a PREFERENCE, not a prohibition, and these locks are written on that distinction:
 * legality is unchanged, ranking is not.
 *
 *   before   4 coincident views in 25 presses (presses 1, 2 and 4) — byte-identical at 3ebdfdb2 and
 *            68e4a3d9, i.e. this was never a round-#940 regression
 *   after    0 in 25
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useGeoStore, replay, separatedView, meetsRequirements } from '@/store/geoStore';
import { parse } from '@/parser';
import { ctxOf } from './scenario-pipeline';
import { buildScene } from '@/render/scene';

const SEQ = ['משולש ABC', 'זוית B ישרה', 'ריבוע DEFG חסום במשולש ABC'];

function submit(u: string) {
  const r = parse(u, ctxOf(useGeoStore.getState().facts));
  if (!r.ok) throw new Error(`parse failed «${u}»`);
  useGeoStore.getState().executeMany(r.commands, u);
}
const build = (steps: string[]) => {
  useGeoStore.setState({ facts: [], seed: 0, selectedId: null });
  useGeoStore.temporal.getState().clear();
  for (const u of steps) submit(u);
};
const fig = () => {
  const st = useGeoStore.getState();
  return replay(st.facts, st.seed);
};

beforeEach(() => {
  useGeoStore.setState({ facts: [], seed: 0, selectedId: null });
  useGeoStore.temporal.getState().clear();
});

describe('#942 — cycling never offers a collision while a separated seating exists', () => {
  it('25 presses of «הציגו תצורה אחרת» yield NO coincident view', () => {
    build(SEQ);
    const offending: string[] = [];
    for (let i = 1; i <= 25; i++) {
      useGeoStore.getState().resample();
      const f = fig();
      if (f.coincidences.length) offending.push(`press ${i}: ${JSON.stringify(f.coincidences)}`);
    }
    // Fails on the pre-fix tree at presses 1, 2 and 4.
    expect(offending, offending.join('\n')).toEqual([]);
  }, 900000);

  it('and every view it DOES offer still meets every requirement', () => {
    // The guard that the preference did not buy separation by relaxing something else.
    build(SEQ);
    for (let i = 0; i < 12; i++) {
      useGeoStore.getState().resample();
      const st = useGeoStore.getState();
      expect(meetsRequirements(st.facts, st.seed), `press ${i + 1}`).toBe(true);
    }
  }, 900000);
});

describe('#942 — a coincidence stays LEGAL; only its ranking changed', () => {
  it('`separatedView` is a preference predicate, not a validity one', () => {
    build(SEQ);
    const f = fig();
    // The first drawing separates the labels, and it meets requirements. Both true, independently.
    expect(separatedView(f)).toBe(true);
    expect(meetsRequirements(useGeoStore.getState().facts, useGeoStore.getState().seed)).toBe(true);
  }, 900000);

  it('ADR-123’s own kite still builds, still meets requirements, still records N=O', () => {
    // The canonical FORCED coincidence: N (the diagonal intersection) lands on the circle's centre, and
    // no configuration separates them. It must still draw, and `meetsRequirements` must stay true or the
    // auto-resolver loops forever hunting a separation that does not exist — the property
    // `store/__tests__/coincidence.test.ts` froze on the operator's instruction.
    //
    // This is the case that keeps the ruling a PREFERENCE. If it ever refuses, the preference has become
    // a prohibition, which is the one thing the ruling did not ask for.
    build([
      'ABCD דלתון חסום במעגל',
      'AB=AD',
      'CB=CD',
      'E על DC',
      'BE⊥DC',
      'AC',
      'N = חיתוך BE ו-AC',
      'שטח משולש NCE= רבע שטח משולש ACD',
    ]);
    const st = useGeoStore.getState();
    const f = replay(st.facts, 0);
    expect(f.lastError).toBeNull();
    expect(f.positions.size).toBeGreaterThan(0);
    expect(f.coincidences.length, 'the forced coincidence is recorded, not suppressed').toBeGreaterThan(0);
    expect(separatedView(f), 'and it is honestly reported as NOT separated').toBe(false);
    expect(meetsRequirements(st.facts, 0), 'still legal — no futile auto-resolve search').toBe(true);
  }, 900000);
});

describe('#942 — the canvas writes the collision', () => {
  it('two points at one spot get ONE label, «B=D», not two stacked', () => {
    build(SEQ);
    const st = useGeoStore.getState();
    const f = replay(st.facts, st.seed);
    // Drive the renderer with an explicit coincidence, so the label lane is asserted directly rather
    // than through whichever seating the search happens to pick.
    const scene = buildScene(f.construction, f.positions, undefined, undefined, { coincidences: [['B', 'D']] });
    const labels = scene.points.filter((p) => p.id === 'B' || p.id === 'D').map((p) => p.label);
    expect(labels.sort()).toEqual(['', 'B=D']);
    // Both points keep their ids and positions — the merge is by LABEL only, so hover/picking is intact.
    expect(scene.points.filter((p) => p.id === 'B' || p.id === 'D')).toHaveLength(2);
  }, 900000);

  it('with no coincidence the labels are untouched — this is an addition, not a rewrite', () => {
    build(SEQ);
    const f = fig();
    const scene = buildScene(f.construction, f.positions, undefined, undefined, {});
    for (const id of ['A', 'B', 'C', 'D', 'E', 'F', 'G']) {
      const pt = scene.points.find((p) => p.id === id);
      if (pt) expect(pt.label, `${id} keeps its own label`).toBe(id);
    }
  }, 900000);
});
