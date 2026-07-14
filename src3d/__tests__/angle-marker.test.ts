/**
 * #94 — a named angle is a HIGHLIGHTABLE MARKER, not a valueless-query refusal. `∠SDB` (bare) draws the
 * arc and shows its measure in the panel when the figure is determined (seed-invariant), nothing when
 * under-determined; `∠SDB = α` labels the arc α. A NUMERIC RHS stays a driving claim; a `?`/`מצא` stays a
 * genuine question (guidance). The marker consumes no DOF and verifies nothing (a pure pedagogical mark).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { parse3 } from '../parser/parse3';
import { classifyGuidance3 } from '../parser/scope3';
import { derive3, useGeo3 } from '../store/store3';
import { dataView } from '../engine/dataView';
import { buildScene3 } from '../render/scene3';
import { resolve3 } from '../engine/evaluate';
import { HOME_CAMERA } from '../render/camera';

const reset = () => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
};
const submit = (u: string) => useGeo3.getState().submit(u);
const construction = () => derive3(useGeo3.getState().facts, useGeo3.getState().seed).construction;
const panel = () => dataView(construction(), useGeo3.getState().seed);
const scene = () => {
  const c = construction();
  return buildScene3(c, resolve3(c, 0), HOME_CAMERA, { width: 640, height: 460 });
};

describe('#94 — named-angle marker: parsing + scope routing', () => {
  it('bare ∠SDB → an angle-mark (no driver); ∠SDB = α labels it; a numeric RHS stays a claim', () => {
    const bare = parse3('∠SDB');
    expect(bare.ok && bare.commands).toEqual([{ type: 'angle-mark', vertex: 'D', p: 'S', q: 'B' }]);
    const named = parse3('∠SDB = α');
    expect(named.ok && named.commands).toEqual([{ type: 'angle-mark', vertex: 'D', p: 'S', q: 'B', label: 'α' }]);
    const claim = parse3('∠SDB = 82');
    expect(claim.ok && claim.commands.some((c) => c.type === 'claim')).toBe(true); // numeric → drives, not a marker
  });

  it('a genuine QUESTION still refuses (scope guidance), a marker does not', () => {
    for (const u of ['∠SDB', '∠SDB = α']) expect(classifyGuidance3(u), u).toBeNull(); // builds
    for (const u of ['∠SDB=?', '∠SDB?', 'מצא את הזווית D']) expect(classifyGuidance3(u)?.category, u).toBe('valueless-query');
    expect(parse3('∠SDB=?').ok).toBe(false); // the query never becomes a marker
  });
});

describe('#94 — marker builds + surfaces its value honestly', () => {
  beforeEach(reset);

  it('on a DETERMINED figure (a cube), ∠ACG draws the arc AND the panel shows the measure', () => {
    submit('cube ABCDEFGH');
    submit('∠ACG');
    expect(useGeo3.getState().lastError).toBeNull();
    expect(construction().angleMarks).toHaveLength(1);
    expect(scene().angles.length).toBeGreaterThanOrEqual(1); // the arc is drawn
    expect(panel().relations).toContain('∠ACG = 90°'); // seed-invariant → shown
  });

  it('∠ACG = α labels the marker and the panel reports α = <value>', () => {
    submit('cube ABCDEFGH');
    submit('∠ACG = α');
    expect(construction().angleMarks[0].label).toBe('α');
    expect(panel().relations).toContain('α = 90°');
  });

  it('on an UNDER-determined figure the arc draws but NO value is shown (knowledge gate)', () => {
    // a right square pyramid with a FREE height — ∠SDB varies with the (unstated) shape, so no value prints
    submit('פירמידה ABCDS שבסיסה ריבוע');
    submit('∠SDB');
    expect(useGeo3.getState().lastError).toBeNull();
    expect(construction().angleMarks).toHaveLength(1); // the marker (arc) exists
    expect(panel().relations.some((r) => r.startsWith('∠SDB'))).toBe(false); // but no seed-varying value
  });
});
