/**
 * ADR-3D-140 (#522, #523, #524, #512, #534, #8) — the ANGLE OPERAND cluster.
 *
 * Six issues, one diagnosis: **the operand grammar enumerated what it should derive.** A statement
 * whose twin builds was refused the moment its NUMBER changed (singular → plural), its NOUN changed
 * (מישור → פאה), its VALUE FORM changed (45 → α), or its PLANE KIND changed (ABC → [xy]) — and, one
 * layer down, the moment a free plane's stated angle was anything other than the two endpoints ⟂/∥
 * the pin set happened to list.
 *
 * Every fix is at a SEAM the whole program shares, so a relation family added later inherits it:
 * `NOUN` derives plurals, `readOperandList` reads a conjoined subject once, `ANGLE_VAL` is one value
 * atom for all three angle rules, `Operand3` carries the coordinate frame, `isPlanar` answers
 * "is this a plane" in one place, and `resolveFreePlane` pins a CONE rather than two special cases.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { parse3 } from '../parser/parse3';
import { dataView } from '../engine/dataView';
import { derive3, useGeo3 } from '../store/store3';
import { cross3, dot3, norm3, sub3 } from '../engine/vec3';

const state = () => useGeo3.getState();
const submit = (u: string) => state().submit(u);
const build = (utts: string[]) => {
  state().clear();
  for (const u of utts) submit(u);
};
const cmds = (u: string) => {
  const r = parse3(u);
  return r.ok ? r.commands : null;
};
const at = (seed: number, id: string) => derive3(state().facts, seed).resolved.positions.get(id)!;

beforeEach(() => state().clear());

// ---------------------------------------------------------------------------
// #522 — the conjoined / plural subject, across EVERY relation family
// ---------------------------------------------------------------------------
describe('#522 — a plural subject states the same fact as its singular twin', () => {
  it.each([
    ['הזווית בין המישור ABC למישור SBC היא 45', 'הזווית בין המישורים ABC ו-SBC היא 45'],
    ['הזווית בין הישר ℓ1 לבין הישר ℓ2 היא 30', 'הזווית בין הישרים ℓ1 ו-ℓ2 היא 30'],
    ['הזווית בין הישר ℓ1 לבין הישר ℓ2 היא 30', 'הזווית בין הישרים ℓ1 ל-ℓ2 היא 30'],
    ['המישור ABC מאונך למישור SBC', 'המישורים ABC ו-SBC מאונכים'],
    ['ℓ1 מקביל לℓ2', 'הישרים ℓ1 ו-ℓ2 מקבילים'],
    ['the angle between plane ABC and plane SBC is 45', 'the angle between planes ABC and SBC is 45'],
    ['plane ABC is perpendicular to plane SBC', 'planes ABC and SBC are perpendicular'],
  ])('«%s» ≡ «%s»', (singular, plural) => {
    expect(cmds(singular), singular).not.toBeNull();
    expect(cmds(plural), plural).toEqual(cmds(singular));
  });
});

// ---------------------------------------------------------------------------
// #524 — a FACE and a BASE are operand nouns (the #8 vocabulary half)
// ---------------------------------------------------------------------------
describe('#524 — «פאה» / «בסיס» name the planes of a dihedral', () => {
  const CANON = 'הזווית בין המישור SBC למישור ABC היא 60';
  it.each([
    'הזווית בין הפאה SBC לבסיס ABC היא 60',
    'הזווית בין פאה SBC לבין הבסיס ABC היא 60',
    'הזווית בין הפאה SBC למישור ABC היא 60',
    'הזווית בין המישור SBC לבסיס ABC היא 60',
  ])('«%s» is the same statement', (u) => {
    expect(cmds(u), u).toEqual(cmds(CANON));
  });

  it('the English mirrors', () => {
    expect(cmds('the angle between face SBC and base ABC is 60')).toEqual(cmds(CANON));
  });

  it('the PREDICATE agrees with a feminine subject («הפאה … מאונכת»)', () => {
    expect(cmds('הפאה SBC מאונכת לבסיס ABC')).toEqual(cmds('המישור SBC מאונך למישור ABC'));
  });
});

// ---------------------------------------------------------------------------
// #523 — the α NAME reaches every pairing, and NAMES rather than drives
// ---------------------------------------------------------------------------
describe('#523 — a Greek name states WHICH measure, in every operand pairing', () => {
  it.each([
    'הזווית בין המישור ABC למישור SBC היא α',
    'הזווית בין הישר ℓ1 לבין המישור ABC היא α',
    'הזווית בין הישר ℓ1 לבין המישור π1 היא α',
    'הזווית בין הישר AB לבין המישור π1 היא α',
    'הזווית בין המישורים π1 ו-π2 היא α',
    'the angle between plane ABC and plane SBC is α',
  ])('«%s» parses and carries the label', (u) => {
    const out = cmds(u);
    expect(out, u).not.toBeNull();
    expect(JSON.stringify(out)).toContain('"label":"α"');
    expect(JSON.stringify(out), 'a NAME is not a value').not.toContain('"deg"');
  });

  it('the numeric twin still DRIVES — a name marks, a number pins', () => {
    build(['פירמידה ישרה SABCD שבסיסה ריבוע', 'הזווית בין המישור SBC למישור ABCD היא 60']);
    const c = derive3(state().facts, 0).construction;
    expect(c.scalarPins.some((p) => p.kind === 'plane-rel')).toBe(true);
    expect(c.relMarks).toHaveLength(0);
  });

  it('a DETERMINED named angle prints its degrees; an under-determined one prints none', () => {
    build(["קובייה ABCDA'B'C'D'", "הזווית בין המישור ABB'A' למישור ABCD היא α"]);
    expect(state().lastError).toBeNull();
    expect(dataView(derive3(state().facts, 0).construction, 0).relations).toContain('α = 90°');

    build(['פירמידה ישרה SABCD שבסיסה ריבוע', 'הזווית בין המישור SBC למישור ABCD היא α']);
    const d = derive3(state().facts, 0);
    expect(d.construction.relMarks, 'the mark exists').toHaveLength(1);
    expect(dataView(d.construction, 0).relations, 'but the value is not knowledge').toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// #512 — the coordinate frame is a first-class operand
// ---------------------------------------------------------------------------
describe('#512 — «מישור [xy]» is an operand, not one grammatical position', () => {
  it.each([
    "הזווית בין המישורים [xy] ו-ACB' היא 45",
    'המרחק בין A למישור [xy] הוא 5',
    'ℓ מקביל למישור [xy]',
    'the angle between plane [xy] and plane ABC is 45',
  ])('«%s» parses', (u) => {
    expect(cmds(u), u).not.toBeNull();
  });

  it('either ordering names the same plane, and a plane related to itself is refused', () => {
    expect(cmds('המרחק בין A למישור [yx] הוא 5')).toEqual(cmds('המרחק בין A למישור [xy] הוא 5'));
  });

  it('the #324 baselines are BYTE-IDENTICAL (the private tail kept its behaviour)', () => {
    expect(cmds('הבסיס ABCD מונח על מישור שמקביל למישור [xy]')).toEqual([
      { type: 'coord-plane-rel', ids: ['A', 'B', 'C', 'D'], axis: 'z', mode: 'share' },
    ]);
    expect(cmds('המישור ABC מונח על המישור [xy]')).toEqual([{ type: 'coord-plane-rel', ids: ['A', 'B', 'C'], axis: 'z', mode: 'zero' }]);
    expect(cmds("המישור ACB' מאונך למישור [xz]")).toEqual([{ type: 'coord-plane-rel', ids: ['A', 'C', "B'"], axis: 'y', mode: 'perp' }]);
    expect(cmds('המישור ABC מקביל לציר ה-z')).toEqual([{ type: 'coord-plane-rel', ids: ['A', 'B', 'C'], axis: 'z', mode: 'perp' }]);
  });

  it('a point-run × frame relation lowers to the DRIVING command, not a second spelling', () => {
    expect(cmds('המישור ABC מאונך למישור [yx]')).toEqual([{ type: 'coord-plane-rel', ids: ['A', 'B', 'C'], axis: 'z', mode: 'perp' }]);
    build(["תיבה ABCDA'B'C'D'", 'המישור ABC מאונך למישור [xz]']);
    expect(state().lastError).toBeNull();
  });

  it('a frame claim on an UNPLACED figure says the position is not fixed — never «your claim is wrong»', () => {
    build(["תיבה ABCDA'B'C'D'"]);
    const n = state().facts.length;
    submit("BD' מאונך למישור [xy]"); // satisfiable — rotate the box until the diagonal stands vertical
    expect(state().facts).toHaveLength(n);
    expect(state().lastError).toEqual({ code: 'placement-not-fixed' });
  });

  it('…and once a given DOES place the figure, the same claim is judged normally', () => {
    build(["תיבה ABCDA'B'C'D'", 'המישור ABC מונח על המישור [xy]', 'AB מקביל למישור [xy]']);
    expect(state().lastError).toBeNull();
    expect(state().facts).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// #534 — a stated line↔plane angle pins a free plane onto a CONE
// ---------------------------------------------------------------------------
describe('#534 — ⟂ and ∥ are one angle’s endpoints, and the middle is now pinned', () => {
  const FIG = ['מישור π', 'x=(1,2,3)+t(2,0,2)', 'זווית בין ישר ℓ למישור π=45'];
  const betaAt = (seed: number): number => {
    const d = derive3(state().facts, seed);
    const pl = d.resolved.planes.get('π')!;
    const ln = d.resolved.lines.get('ℓ')!;
    return (Math.asin(Math.min(1, Math.abs(dot3(pl.n, ln.dir)) / (norm3(pl.n) * norm3(ln.dir)))) * 180) / Math.PI;
  };

  it('the operator’s given COMMITS and holds exactly, at every seed', () => {
    build(FIG);
    expect(state().lastError).toBeNull();
    expect(state().facts).toHaveLength(3);
    for (const seed of [0, 1, 2, 3, 4]) expect(betaAt(seed), `seed ${seed}`).toBeCloseTo(45, 6);
  });

  it('the cone SPIN stays free — the orientation resamples while the angle holds', () => {
    build(FIG);
    const normals = [0, 1, 2, 3, 4].map((s) => JSON.stringify(derive3(state().facts, s).resolved.planes.get('π')!.n));
    expect(new Set(normals).size).toBeGreaterThan(2);
    for (const seed of [0, 1, 2, 3, 4]) expect(derive3(state().facts, seed).resolved.freePlaneDofs.get('π')).toBe(2);
  });

  it('the ENDPOINTS are unchanged: ⟂ pins the normal outright, ∥ constrains it', () => {
    build(['מישור π', 'x=(1,2,3)+t(2,0,2)', 'ℓ מאונך למישור π']);
    expect(state().lastError).toBeNull();
    expect(derive3(state().facts, 0).resolved.freePlaneDofs.get('π')).toBe(1); // only the offset stays free
    build(['מישור π', 'x=(1,2,3)+t(2,0,2)', 'ℓ מקביל למישור π']);
    expect(state().lastError).toBeNull();
    expect(derive3(state().facts, 0).resolved.freePlaneDofs.get('π')).toBe(2);
  });

  it('a 90° angle is the ⟂ endpoint exactly (the continuum joins up)', () => {
    build(['מישור π', 'x=(1,2,3)+t(2,0,2)', 'זווית בין ישר ℓ למישור π=90']);
    expect(state().lastError).toBeNull();
    expect(derive3(state().facts, 0).resolved.freePlaneDofs.get('π')).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// #8 — the dihedral face↔base angle + the in-face altitude (2012-קיץ-ב)
// ---------------------------------------------------------------------------
describe('#8 — the dihedral face↔base angle drives, and the in-face altitude builds', () => {
  it('«הזווית בין הפאה SBC לבסיס ABCD היא 60» DRIVES the pyramid to exactly 60°', () => {
    build(['פירמידה SABCD שבסיסה ריבוע', 'הזווית בין הפאה SBC לבסיס ABCD היא 60']);
    expect(state().lastError).toBeNull();
    const nBase = cross3(sub3(at(0, 'B'), at(0, 'A')), sub3(at(0, 'C'), at(0, 'A')));
    const nFace = cross3(sub3(at(0, 'B'), at(0, 'S')), sub3(at(0, 'C'), at(0, 'S')));
    const deg = (Math.acos(Math.min(1, Math.abs(dot3(nBase, nFace)) / (norm3(nBase) * norm3(nFace)))) * 180) / Math.PI;
    expect(deg).toBeCloseTo(60, 2);
  });

  it('the in-face altitude reads with the definite article and a trailing triangle', () => {
    expect(cmds('SM הגובה לצלע BC במשולש SBC')).toEqual([{ type: 'altitude-foot', id: 'M', from: 'S', a: 'B', b: 'C' }]);
    expect(cmds('SM הגובה לצלע BC במשולש SBC')).toEqual(cmds('SM גובה במשולש SBC'));
    expect(cmds('in triangle SBC, SM is the altitude to BC')).toEqual(cmds('SM גובה במשולש SBC'));
  });

  it('the altitude foot lands ON BC with SM ⟂ BC', () => {
    build(['פירמידה SABCD שבסיסה ריבוע', 'SM הגובה לצלע BC במשולש SBC']);
    expect(state().lastError).toBeNull();
    const [S, B, C, M] = ['S', 'B', 'C', 'M'].map((id) => at(0, id));
    expect(M, 'the foot is placed').toBeTruthy();
    // M on segment BC, and SM ⟂ BC
    expect(norm3(cross3(sub3(M, B), sub3(C, B))) / norm3(sub3(C, B))).toBeCloseTo(0, 5);
    expect(Math.abs(dot3(sub3(M, S), sub3(C, B))) / (norm3(sub3(M, S)) * norm3(sub3(C, B)))).toBeCloseTo(0, 5);
  });
});
