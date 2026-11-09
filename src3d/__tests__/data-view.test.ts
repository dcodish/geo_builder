/**
 * The "organize your data" panel (ADR-3D-014): derived presentations, stability-
 * gated across 3 seeds. On the 2026-ב exam figure: EN⃗ decomposes in the u,v,w basis
 * AND shows coordinates (both, per the operator); a stated magnitude prints with its
 * square; an under-determined figure prints NO coordinates (gauge is not data).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { dataView, panelIsEmpty, type DataPanel } from '../engine/dataView';
import { derive3, useGeo3 } from '../store/store3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const submit = (u: string) => useGeo3.getState().submit(u);
const panel = () => {
  const st = useGeo3.getState();
  return dataView(derive3(st.facts, st.seed).construction, st.seed);
};

describe('dataView — organize your data', () => {
  beforeEach(reset);

  it('the exam figure: EN in the basis AND in coordinates; points print stable coords', () => {
    [
      'פירמידה ABCDS שבסיסה ריבוע',
      'המקצוע AS הוא גובה בפירמידה',
      'אורך המקצוע AS שווה לאורך צלע הריבוע ABCD',
      'SE = 3/4 SD',
      'נסמן: AD = u, AB = v, AS = w',
      'SN = k·SC',
      '|EN| = (√6/4)·|w|',
      'נתון: A(0,0,0), B(0,12,0)',
      'הקודקוד D נמצא על החלק החיובי של ציר ה-x',
      'S נמצא על החלק החיובי של ציר ה-z',
    ].forEach(submit);
    expect(useGeo3.getState().lastError).toBeNull();
    const p = panel();
    const en = p.vectors.find((v) => v.label === 'EN');
    expect(en).toBeTruthy();
    // EN = N−E = (−3,6,3) = −1/4·u + 1/2·v + 1/4·w  (u=AD, v=AB, w=AS, side 12)
    expect(en!.decomp).toBe('−1/4·u + 1/2·v + 1/4·w');
    expect(en!.coords).toBe('(-3, 6, 3)');
    expect(p.points).toContain('N(6, 6, 6)');
    expect(p.pointCoords.N).toEqual({ text: '(6, 6, 6)', kind: 'fact' }); // feeds the on-canvas labels
    expect(p.points).toContain('E(9, 0, 3)');
    // the declared basis vectors print their coordinate form
    const w = p.vectors.find((v) => v.label === 'w');
    expect(w?.coords).toBe('(0, 0, 12)');
  });

  it("the operator's session: |u| = |v| = |w| surfaces, and EN shows SYMBOLICALLY in k", () => {
    [
      'פירמידה ABCDS שבסיסה ריבוע',
      'AS גובה',
      '|AS|=|AD|',
      'SE = 3/4 SD',
      'SN = k·SC',
      'נסמן: AD = u, AB = v, AS = w',
      'EN',
    ].forEach(submit);
    expect(useGeo3.getState().lastError).toBeNull();
    const p = panel();
    // square base gives |u| = |v|; the stated |AS| = |AD| joins w — all three equal
    expect(p.relations).toContain('|u| = |v| = |w|');
    // EN depends on the FREE k — not hidden as unstable, shown in the exam's symbolic form
    const en = p.vectors.find((v) => v.label === 'EN');
    expect(en?.decomp).toBe('(k − 3/4)·u + k·v + (3/4 − k)·w');
    // SE is k-free and numeric
    const se = p.vectors.find((v) => v.label === 'SE');
    expect(se?.decomp).toBe('3/4·u − 3/4·w');
    // the |EN| given pins k = ½ at the TANGENCY (a double root — the numerically split
    // crossings must not leave EN "unstable"): the decomposition turns numeric
    submit('|EN|=√6/4*|w|');
    expect(useGeo3.getState().lastError).toBeNull();
    const p2 = panel();
    const en2 = p2.vectors.find((v) => v.label === 'EN');
    expect(en2?.decomp).toBe('−1/4·u + 1/2·v + 1/4·w');
  });

  it('#296 panelIsEmpty: a relations-only panel is NOT empty', () => {
    const empty: DataPanel = { radii: [], stated: [], relations: [], mutual: [], vectors: [], points: [], planes: [], pointCoords: {}, pointComps: {}, pointOptions: {}, params: [] };
    expect(panelIsEmpty(empty)).toBe(true);
    // the bug: only relations present → the App used to render "empty" and hide them
    expect(panelIsEmpty({ ...empty, relations: ['|u| = |v|', 'u·v = 0'] })).toBe(false);
    expect(panelIsEmpty({ ...empty, points: ['N(6, 6, 6)'] })).toBe(false);
    // S4 (#378): the same trap for the mutual rows — guard and render must read emptiness alike
    expect(panelIsEmpty({ ...empty, mutual: [{ a: 'AB', b: 'CD', rel: 'skew' }] })).toBe(false);
    // #1196: and for the STATED rows, which are the case that reported a false "nothing to show" on a
    // figure whose only knowledge was the two vector givens the student had just written down.
    expect(panelIsEmpty({ ...empty, stated: ['u = AB⃗'] })).toBe(false);
    expect(panelIsEmpty({ ...empty, radii: [{ circle: null, text: '3' }] })).toBe(false); // #2611 (ADR-3D-420)
  });

  it('perpendicular declared vectors surface as u·v = 0 (operator, 2026-07-08)', () => {
    // a cube's three edge-vectors from A are mutually perpendicular by construction
    ['קובייה ABCD', "נסמן: AB = u, AD = v, AA' = w"].forEach(submit);
    expect(useGeo3.getState().lastError).toBeNull();
    const p = panel();
    expect(p.relations).toContain('u·v = 0');
    expect(p.relations).toContain('u·w = 0');
    expect(p.relations).toContain('v·w = 0');
  });

  it('non-perpendicular declared vectors do NOT report a dot = 0', () => {
    // a square-base pyramid: AS (height) ⊥ AD and ⊥ AB, but AD and AB are the base edges
    // (perpendicular too) — a slanted lateral edge is the non-⊥ control
    ['פירמידה ABCDS שבסיסה ריבוע', 'המקצוע AS הוא גובה בפירמידה', "נסמן: AD = u, AB = v, AS = w, SC = s"].forEach(submit);
    expect(useGeo3.getState().lastError).toBeNull();
    const p = panel();
    expect(p.relations).toContain('u·w = 0'); // AD ⊥ AS (height)
    expect(p.relations).toContain('v·w = 0'); // AB ⊥ AS (height)
    // SC (a lateral edge direction) is perpendicular to none of the axis edges
    expect(p.relations.some((r) => r.includes('s·') || r.includes('·s'))).toBe(false);
  });

  it('a stated magnitude prints with its square; nothing prints for an unstated one', () => {
    submit('פירמידה ABCDS שבסיסה ריבוע');
    submit('AS = w');
    submit('|w| = 2');
    const p = panel();
    const w = p.vectors.find((v) => v.label === 'w');
    expect(w?.mag).toBe('|w| = 2');
    expect(w?.sq).toBe('w² = 4');
    // no frame injected → no coordinates anywhere (gauge is not data)
    expect(w?.coords).toBeNull();
    expect(p.points).toEqual([]);
  });

  it('an under-determined quantity never prints (varies across seeds)', () => {
    submit('פירמידה ABCDS'); // free-aspect base, free apex — nothing stable, no frame
    const p = panel();
    expect(p.points).toEqual([]);
    expect(p.vectors.every((v) => v.coords === null)).toBe(true);
    expect(p.pointCoords).toEqual({}); // no frame → no canvas labels at all
  });

  it('a frame WITHOUT full determination: S is PARTIAL — y = 0 is knowledge, x/z stay ?', () => {
    ['פירמידה ABCDS שבסיסה ריבוע', 'AS גובה', '|AS|=|AD|', 'נסמן: AD = u, AB = v, AS = w', 'נתון: A(0,0,0), B(0,12,0)'].forEach(submit);
    const p = panel();
    expect(p.pointCoords.A).toEqual({ text: '(0, 0, 0)', kind: 'fact' });
    // S rotates about the AB axis: |AS| = 12 and S·y = 0 are facts, the direction is not
    expect(p.pointCoords.S).toEqual({ text: '(?, 0, ?)', kind: 'partial' });
    expect(p.points).toContain('S(?, 0, ?)'); // partial knowledge IS knowledge — listed
    // and the equal-magnitudes row now carries the DERIVED length (scale pinned by A,B)
    expect(p.relations).toContain('|u| = |v| = |w| = 12');
  });
  it('a sign given upgrades the free component: on the positive z-axis reads (0, 0, +?)', () => {
    // WITHOUT |AS|=|AD| the height stays free — the axis placement pins x=0, y=0 and the SIGN
    ['פירמידה ABCDS שבסיסה ריבוע', 'AS גובה', 'נתון: A(0,0,0), B(0,12,0)', 'S נמצא על החלק החיובי של ציר ה-z'].forEach(submit);
    expect(useGeo3.getState().lastError).toBeNull();
    const p = panel();
    expect(p.pointCoords.S).toEqual({ text: '(0, 0, +?)', kind: 'partial' });
  });

  it('axis given + length given determine S fully: (0, 0, +?) collapses to (0, 0, 12)', () => {
    // the operator's chain: S on +z gives (0,0,+?); |AS|=|AD| (⇒ =|AB|=12) pins the +? to 12
    ['פירמידה ABCDS שבסיסה ריבוע', 'AS גובה', '|AS|=|AD|', 'נתון: A(0,0,0), B(0,12,0)', 'S נמצא על החלק החיובי של ציר ה-z'].forEach(submit);
    expect(useGeo3.getState().lastError).toBeNull();
    const p = panel();
    expect(p.pointCoords.S).toEqual({ text: '(0, 0, 12)', kind: 'fact' });
    // S on the z-axis flattens the base, so D's z = 0 becomes a fact too — only its ± sign waits for the D placement
    expect(p.pointCoords.D).toEqual({ text: '(?, 0, 0)', kind: 'partial' });
  });

  // #517 — the knowledge gates must SEE bare coordinate points. A fresh `C(2,1,0)` lands in
  // `c.points` as kind 'coord', never in `c.pins`; the gates' private `c.pins.length > 0`
  // enumerations suppressed every knowledge family for a figure of injected points (operator,
  // 2026-08-11: no canvas labels, an empty panel, and «CB — לא נקבע על ידי הנתונים» on two fully
  // pinned points). The gates now derive from the construction (translationPinned3 / scaleKnown3).
  it('#517 — two bare injected points ARE a frame: labels print as facts', () => {
    ['C(2,1,0)', 'B(1,1,0)'].forEach(submit);
    expect(useGeo3.getState().lastError).toBeNull();
    const p = panel();
    expect(p.pointCoords.C).toEqual({ text: '(2, 1, 0)', kind: 'fact' });
    expect(p.pointCoords.B).toEqual({ text: '(1, 1, 0)', kind: 'fact' });
    expect(p.points).toContain('C(2, 1, 0)');
    expect(p.points).toContain('B(1, 1, 0)');
  });

  it('#517 — a DETACHED solid beside absolute points stays honest: its gauge never prints', () => {
    // The solid's placement is sampled (landing funnel) and its first dim is the frozen similarity
    // gauge — neither is knowledge. The points print; the cube's vertices and |AB| must not.
    ["קובייה ABCDA'B'C'D'", 'P(0,0,9)', 'Q(0,0,3)'].forEach(submit);
    expect(useGeo3.getState().lastError).toBeNull();
    const p = panel();
    expect(p.pointCoords.P).toEqual({ text: '(0, 0, 9)', kind: 'fact' });
    expect(p.pointCoords.Q).toEqual({ text: '(0, 0, 3)', kind: 'fact' });
    expect(p.pointCoords.A).toBeUndefined(); // sampled placement — a sample is not knowledge
    expect(p.points.some((s) => s.startsWith('A'))).toBe(false);
  });
});

// #517 × #510 — the operator's EXACT utterances (2026-08-11): value literals in bare injected points,
// with the knowledge gates now deriving from the construction. The √/½ grammar lives on this branch
// (ADR-3D-130); the decimal twin of this lock lives with ADR-3D-132.
describe('#517 — the operator’s exact literal points print as facts', () => {
  beforeEach(reset);

  it('C(√2,1,0) and B(½,1,0): canvas labels and panel rows, surd/fraction tiers', () => {
    ['C(√2,1,0)', 'B(½,1,0)'].forEach(submit);
    expect(useGeo3.getState().lastError).toBeNull();
    const p = panel();
    expect(p.pointCoords.C).toEqual({ text: '(√2, 1, 0)', kind: 'fact' });
    expect(p.pointCoords.B).toEqual({ text: '(1/2, 1, 0)', kind: 'fact' });
  });
});

/**
 * #2703 ([ADR-3D-443](../../docs/06b-decisions-3d.md#adr-3d-443)) — a dot product or a letter's value typed as a decimal
 * prints as typed (#1497's ruling, 2026-09-28: a given is printed as the student typed it; a derived value goes through
 * the tiers). Before: «u · v = 5/2», «k = 2/5», and «k = ?» on a vec-defined point that runs no pivot.
 */
describe('#2703 — a typed decimal prints as typed in the dot and letter rows', () => {
  beforeEach(reset);
  const build = (us: string[]) => {
    us.forEach(submit);
    expect(useGeo3.getState().lastError, us.join(' · ')).toBeNull();
    return panel();
  };
  const param = (p: DataPanel, sym: string) => p.params?.find((r) => r.sym === sym)?.text;
  const CUBE = "קובייה ABCDA'B'C'D'";

  it('the dot product: «u·v = 2.5», «0.75», «-2.5»; an integer unchanged', () => {
    expect(build(['הווקטורים u ו-v', 'u·v = 2.5']).stated).toContain('u · v = 2.5');
    reset();
    expect(build(['וקטור u', 'וקטור v', 'u·v = 0.75']).stated).toContain('u · v = 0.75');
    reset();
    expect(build(['הווקטורים u ו-v', 'u·v = -2.5']).stated).toContain('u · v = -2.5');
    reset();
    expect(build(['הווקטורים u ו-v', 'u·v = 3']).stated).toContain('u · v = 3');
  });

  it('the letter value, on every owner: vec-def, vec-defined (was «?»), length, angle, component, rider', () => {
    expect(param(build([CUBE, 'E על AC כך ש-AE = k·AC', 'k = 0.4']), 'k')).toBe('k = 0.4');
    reset();
    expect(param(build([CUBE, 'AE = k·AC', 'k = 2.5']), 'k')).toBe('k = 2.5');
    reset();
    expect(param(build(["תיבה ABCDA'B'C'D'", '|AB| = k', 'k = 2.5']), 'k')).toBe('k = 2.5');
    reset();
    const ang = build(['פירמידה ABCDS שבסיסה ריבוע', '∠SAB = α', 'α = 62.5']);
    expect(param(ang, 'α')).toBe('α = 62.5');
    expect(ang.relations).toContain('α = 62.5°'); // found in round: the mark's measure is the letter's given
    reset();
    expect(param(build(['C(p,1,0)', 'p = 2.5']), 'p')).toBe('p = 2.5');
    reset();
    expect(param(build(['A(0,0,0)', 'B(4,0,0)', 'E על AB', 'AE = t·AB', 't = 0.25']), 't')).toBe('t = 0.25');
    reset();
    expect(param(build(['B(2t,t,1)', 't = 1.5']), 't')).toBe('t = 1.5');
  });

  it('controls: a fraction and an integer keep their form; a long decimal reads the house two decimals (sr-22)', () => {
    expect(param(build([CUBE, 'E על AC כך ש-AE = k·AC', 'k = 1/2']), 'k')).toBe('k = 1/2');
    reset();
    expect(param(build([CUBE, 'AE = k·AC', 'k = 2']), 'k')).toBe('k = 2');
    reset();
    expect(param(build([CUBE, 'AE = k·AC', 'k = 2.125']), 'k')).toBe('k = 2.13');
  });

  it('a DERIVED row beside a typed decimal stays computed: |AD| = 5/2 (#1497 ruling, 2026-09-28)', () => {
    const p = build([CUBE, 'AB = 2.5', 'קטע AD']);
    const row = (l: string) => p.vectors.find((v) => v.label === l)?.mag;
    expect(row('AB')).toBe('|AB| = 2.5');
    expect(row('AD')).toBe('|AD| = 5/2');
  });
});
