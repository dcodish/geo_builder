/**
 * V1 GATE (docs/20 §8): the two mixed corpus questions' geometric halves
 * reproduce END-TO-END — typed utterances through the REAL path
 * (parse3 → submit → derive3 → claim verification), He and En.
 *
 *  - 2020 קיץ Q2 א–ב: right prism, M mid B'C', K with AK=2KA', basis w,v,u,
 *    the AM decomposition claim, the span-defined P, the α=β=⅕ answer claim.
 *  - 2023 קיץ א Q2 א–ב: cube, basis u,v,w, CA'⊥plane BC'D, centroid E,
 *    the CE decomposition claim, E-C-A' collinearity.
 *
 * Wrong answers must be REFUSED (claim-refuted), not absorbed.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { dist3 } from '../engine/vec3';
import { derive3, useGeo3 } from '../store/store3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}

const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();
const derived = () => derive3(state().facts, state().seed);

/** Every submitted fact must have applied AND verified. */
function expectAllOk() {
  const d = derived();
  for (const f of state().facts) expect(d.status[f.id], f.utterance).toBe('ok');
  expect(state().lastError).toBeNull();
}

describe('GATE — 2020 קיץ Q2 א–ב (prism, geometric-vector lane)', () => {
  beforeEach(reset);

  const HE = [
    'מנסרה ישרה משולשת ABC',
    "M אמצע B'C'",
    "K על AA' כך ש-AK = 2KA'",
    "נסמן: AA' = w, KC = v, KB = u",
    'AM = 1/2u + 1/2v + 5/3w', // the student's answer to א — verified
    'P על AM כך ש-KP = αu + βv',
    'KP = 1/5u + 1/5v', // the student's answer to ב (α = β = ⅕) — verified
  ];
  const EN = [
    'right triangular prism ABC',
    "M is the midpoint of B'C'",
    "K on AA' such that AK = 2KA'",
    "denote AA' = w, KC = v, KB = u",
    'AM = 1/2u + 1/2v + 5/3w',
    'P on AM such that KP = αu + βv',
    'KP = 1/5u + 1/5v',
  ];

  for (const [name, seq] of [['Hebrew', HE], ['English', EN]] as const) {
    it(`${name}: the full sequence builds, P lands at t = 2/5, both answers verify`, () => {
      seq.forEach(submit);
      expect(state().facts).toHaveLength(7);
      expectAllOk();
      const pos = derived().positions;
      const t = dist3(pos.get('P')!, pos.get('A')!) / dist3(pos.get('M')!, pos.get('A')!);
      expect(t).toBeCloseTo(2 / 5, 10);
      // the answers survive "show another configuration" (the prism's free dims resample)
      useGeo3.getState().resample();
      expectAllOk();
    });
  }

  it('the WRONG decomposition is refused with claim-refuted (keep-prior)', () => {
    HE.slice(0, 4).forEach(submit);
    submit('AM = u + v + w');
    expect(state().facts).toHaveLength(4);
    expect(state().lastError).toEqual({ code: 'claim-refuted' });
  });

  it('a wrong α,β answer is refused', () => {
    HE.slice(0, 6).forEach(submit);
    submit('KP = 1/2u + 1/2v');
    expect(state().facts).toHaveLength(6);
    expect(state().lastError).toEqual({ code: 'claim-refuted' });
  });
});

describe("GATE — 2023 קיץ א Q2 א–ב (cube, perpendicular-to-plane + centroid + collinearity)", () => {
  beforeEach(reset);

  const HE = [
    'קובייה ABCD',
    "נסמן: AB = u, AD = v, AA' = w",
    "CA' מאונך למישור BC'D", // א — verified
    "E מפגש התיכונים של משולש BC'D",
    'CE = -1/3u - 1/3v + 1/3w', // ב(1) — verified
    "E, C, A' על ישר אחד", // ב(2) — verified
  ];
  const EN = [
    'cube ABCD',
    "denote AB = u, AD = v, AA' = w",
    "CA' is perpendicular to plane BC'D",
    "E is the centroid of triangle BC'D",
    'CE = -1/3u - 1/3v + 1/3w',
    "E, C, A' are collinear",
  ];

  for (const [name, seq] of [['Hebrew', HE], ['English', EN]] as const) {
    it(`${name}: the full sequence builds and every claim verifies`, () => {
      seq.forEach(submit);
      expect(state().facts).toHaveLength(6);
      expectAllOk();
      // E is the centroid of B, C', D — at the unit cube: (2/3, 2/3, 1/3)
      const pos = derived().positions;
      expect(pos.get('E')).toEqual({ x: 2 / 3, y: 2 / 3, z: 1 / 3 });
      // the auxiliary segments were auto-drawn: CA' and the plane triangle BD, BC', DC'
      const segs = derived().construction.segments.map(([a, b]) => (a < b ? `${a}|${b}` : `${b}|${a}`));
      expect(segs).toContain("A'|C");
      expect(segs).toContain('B|D');
      expect(segs).toContain("B|C'");
      expect(segs).toContain("C'|D");
    });
  }

  it('a false perpendicularity claim is refused', () => {
    HE.slice(0, 2).forEach(submit);
    submit("CA' מאונך למישור BB'C'");
    expect(state().facts).toHaveLength(2);
    expect(state().lastError).toEqual({ code: 'claim-refuted' });
  });

  it('a false collinearity claim is refused', () => {
    HE.slice(0, 4).forEach(submit);
    submit("E, B, A' על ישר אחד");
    expect(state().facts).toHaveLength(4);
    expect(state().lastError).toEqual({ code: 'claim-refuted' });
  });
});

describe('GATE — 2022 חורף Q2 (the algebraic lane: planes, parameter, feet, ℓ, area)', () => {
  beforeEach(reset);

  const HE = [
    'המישור π1: z - 3 = 0',
    'המישור π2: ay + z - 8 = 0',
    'הזווית בין המישורים π1 ו-π2 היא 45',
    'A(2,-2,6) נמצאת על אחד המישורים', // selects the branch a = −1
    'מ-A מורידים אנך למישור π1 החותך אותו בנקודה B',
    'AB = 3', // the student's answer to ב — verified
    'ℓ ישר החיתוך בין המישורים π1 ו-π2',
    'מ-B מעבירים אנך לישר ℓ החותך אותו בנקודה C',
    'שטח המשולש ABC = 4.5', // the student's answer to ד — verified
  ];
  const EN = [
    'plane π1: z - 3 = 0',
    'plane π2: ay + z - 8 = 0',
    'the angle between planes π1 and π2 is 45',
    'A(2,-2,6) is on one of the planes',
    'from A drop a perpendicular to plane π1, it cuts it at B',
    'AB = 3',
    'ℓ is the intersection line of π1 and π2',
    'from B drop a perpendicular to line ℓ, it cuts it at C',
    'the area of triangle ABC = 4.5',
  ];

  for (const [name, seq] of [['Hebrew', HE], ['English', EN]] as const) {
    it(`${name}: the full constructive chain builds, a = −1 selected, both answers verify`, () => {
      seq.forEach(submit);
      expect(state().facts).toHaveLength(9);
      expectAllOk();
      const d = derived();
      expect(d.resolved.param).toMatchObject({ name: 'a', value: -1, roots: [-1, 1] });
      expect(d.positions.get('B')).toEqual({ x: 2, y: -2, z: 3 });
      expect(d.positions.get('C')).toEqual({ x: 2, y: -5, z: 3 });
      // ℓ is echoed in parametric form via the resolved line
      const ln = d.resolved.lines.get('ℓ')!;
      expect(ln.anchor).toEqual({ x: 0, y: -5, z: 3 });
      expect(Math.abs(ln.dir.x)).toBeCloseTo(1, 12);
    });
  }

  it('a wrong |AB| answer is refused (keep-prior)', () => {
    HE.slice(0, 5).forEach(submit);
    submit('AB = 2');
    expect(state().facts).toHaveLength(5);
    expect(state().lastError).toEqual({ code: 'claim-refuted' });
  });

  it('a membership that holds on NO plane in any branch is refused', () => {
    HE.slice(0, 3).forEach(submit);
    submit('P(1,1,1) נמצאת על אחד המישורים');
    expect(state().facts).toHaveLength(3);
    expect(state().lastError).toEqual({ code: 'not-on-plane', id: 'P' });
  });

  it('an impossible stated angle is refused honestly (no parameter value satisfies it)', () => {
    HE.slice(0, 2).forEach(submit);
    submit('הזווית בין המישורים π1 ו-π2 היא 95');
    expect(state().facts).toHaveLength(2);
    expect(state().lastError).toEqual({ code: 'no-roots' });
  });

  it('without the membership given, "show another configuration" cycles the a = ±1 branches', () => {
    [HE[0], HE[1], HE[2]].forEach(submit);
    expect(derived().resolved.param?.value).toBe(-1);
    useGeo3.getState().resample();
    expect(derived().resolved.param?.value).toBe(1);
  });

  it('a numeric size claim on a free-dim SOLID figure is refused with a clear boundary message', () => {
    submit('קובייה ABCD');
    submit('AB = 3');
    expect(state().facts).toHaveLength(1);
    expect(state().lastError).toEqual({ code: 'size-on-solid' });
  });
});

describe('GATE — 2024 חורף Q2 (parameters in lines: the parametric ℓ, the ⟂ pin, the cut point, the ד investigation)', () => {
  beforeEach(reset);

  const HE = [
    'הישר ℓ: x = (-1,5,-11) + t(m-1, 5-m, -2)',
    'המישור π: 3x + my + (m+6)z + 4 = 0',
    'ℓ אינו מקביל ל-π לכל m', // א — the probe, verified as a claim
    'הישר ℓ ניצב למישור π', // pins m = −5 (ב)
    'ℓ חותך את π בנקודה A',
    'A = (2, 0, -10)', // the student's answer to ג — verified
    'B(5,-5,-9) על הישר ℓ', // ד's investigation: the special point turns out to lie ON ℓ
  ];
  const EN = [
    'line ℓ: x = (-1,5,-11) + t(m-1, 5-m, -2)',
    'plane π: 3x + my + (m+6)z + 4 = 0',
    'ℓ is not parallel to plane π for every m',
    'line ℓ is perpendicular to plane π',
    'ℓ cuts plane π at A',
    'A = (2, 0, -10)',
    'B(5,-5,-9) is on line ℓ',
  ];

  for (const [name, seq] of [['Hebrew', HE], ['English', EN]] as const) {
    it(`${name}: the full sequence builds, m = −5 pinned, the answer verifies, B lands on ℓ`, () => {
      seq.forEach(submit);
      expect(state().facts).toHaveLength(7);
      expectAllOk();
      const d = derived();
      expect(d.resolved.param).toMatchObject({ name: 'm', value: -5, roots: [-5] });
      expect(d.positions.get('A')!.x).toBeCloseTo(2, 9);
      expect(d.positions.get('A')!.z).toBeCloseTo(-10, 9);
    });
  }

  it('a wrong coordinates answer is refused (keep-prior)', () => {
    HE.slice(0, 5).forEach(submit);
    submit('A = (2, 0, -9)');
    expect(state().facts).toHaveLength(5);
    expect(state().lastError).toEqual({ code: 'claim-refuted' });
  });

  it('a point NOT on ℓ is refused with not-on-line', () => {
    HE.slice(0, 4).forEach(submit);
    submit('C(1,1,1) על הישר ℓ');
    expect(state().facts).toHaveLength(4);
    expect(state().lastError).toEqual({ code: 'not-on-line', id: 'C' });
  });

  it('a never-parallel probe against a plane that CAN be parallel is refused', () => {
    submit(HE[0]);
    submit('המישור π2: my + z = 0');
    submit('ℓ אינו מקביל ל-π2 לכל m');
    expect(state().facts).toHaveLength(2);
    expect(state().lastError).toEqual({ code: 'claim-refuted' });
  });

  it('a cut point when the line is parallel to the plane is refused honestly', () => {
    submit('l: x = (0,0,0) + t(1,0,0)');
    submit('המישור π1: z - 3 = 0');
    submit('ℓ חותך את π1 בנקודה A');
    expect(state().facts).toHaveLength(2);
    expect(state().lastError).toEqual({ code: 'line-misses-plane', id: 'A' });
  });
});

describe('GATE — 2020 קיץ Q2 ג (the coordinate-injection pivot on the prism)', () => {
  beforeEach(reset);

  const HE = [
    'מנסרה ישרה משולשת ABC',
    "M אמצע B'C'",
    "K על AA' כך ש-AK = 2KA'",
    "נסמן: AA' = w, KC = v, KB = u",
    'P על AM כך ש-KP = αu + βv',
    'נתון: v = (10,-5,0), u = (5,5,-5), P(0,4,6)', // the exam's mid-question injection
    'K = (-3, 4, 7)', // the student's answer to ג(3) — verified
    'המישור KBC: x + 2y + 3z - 26 = 0', // the answer to ג(2) — verified
  ];
  const EN = [
    'right triangular prism ABC',
    "M is the midpoint of B'C'",
    "K on AA' such that AK = 2KA'",
    "denote AA' = w, KC = v, KB = u",
    'P on AM such that KP = αu + βv',
    'given: v = (10,-5,0), u = (5,5,-5), P(0,4,6)',
    'K = (-3, 4, 7)',
    'plane KBC: x + 2y + 3z - 26 = 0',
  ];

  for (const [name, seq] of [['Hebrew', HE], ['English', EN]] as const) {
    it(`${name}: the injection pins the figure, K and the KBC plane equation verify`, () => {
      seq.forEach(submit);
      expect(state().facts).toHaveLength(8);
      expectAllOk();
      const d = derived();
      expect(d.resolved.pivot?.solutions).toBeGreaterThan(0);
      const K = d.positions.get('K')!;
      expect(K.x).toBeCloseTo(-3, 4);
      expect(K.y).toBeCloseTo(4, 4);
      expect(K.z).toBeCloseTo(7, 4);
    });
  }

  it('the prism height stays FREE after the injection — resample varies it, K does not move', () => {
    HE.slice(0, 6).forEach(submit);
    const h = () => {
      const d = derived();
      return Math.abs(d.positions.get("A'")!.z - d.positions.get('A')!.z) + Math.abs(d.positions.get("A'")!.x - d.positions.get('A')!.x);
    };
    const K0 = derived().positions.get('K')!;
    const h0 = h();
    useGeo3.getState().resample();
    const K1 = derived().positions.get('K')!;
    expect(Math.abs(h() - h0)).toBeGreaterThan(1e-4); // the uninjected DOF varies (ADR-052)
    expect(K1.x).toBeCloseTo(K0.x, 4); // the determined answer does not
    expect(K1.y).toBeCloseTo(K0.y, 4);
  });

  it('a wrong K is refused', () => {
    HE.slice(0, 6).forEach(submit);
    submit('K = (-3, 4, 6)');
    expect(state().facts).toHaveLength(6);
    expect(state().lastError).toEqual({ code: 'claim-refuted' });
  });

  it('an impossible injection is refused (no placement matches)', () => {
    HE.slice(0, 6).forEach(submit);
    submit('K(0, 0, 0)'); // contradicts K = P − (u+v)/5
    expect(state().facts).toHaveLength(6);
    expect(state().lastError).toEqual({ code: 'injection-unsatisfiable' });
  });
});

describe("GATE — 2023 קיץ א Q2 ג–ד (partial injection, the sign branch, point-planes ℓ)", () => {
  beforeEach(reset);

  const HE = [
    'קובייה ABCD',
    "נסמן: AB = u, AD = v, AA' = w",
    'D(0,0,0)',
    'C(4,3,0)',
    'A(3,n,p)', // the exam's parameters n, p — only x constrains
    "שיעור ה-z של C' חיובי", // the branch given
    'A = (3, -4, 0)', // the answer to ג(1) — verified
    "C' = (4, 3, 5)", // the answer to ג(2) — verified
    "ℓ ישר החיתוך בין המישור BC'D ובין המישור BCC'B'", // ד — echoed in parametric form
  ];
  const EN = [
    'cube ABCD',
    "denote AB = u, AD = v, AA' = w",
    'D(0,0,0)',
    'C(4,3,0)',
    'A(3,n,p)',
    "the z-coordinate of C' is positive",
    'A = (3, -4, 0)',
    "C' = (4, 3, 5)",
    "ℓ is the intersection line of plane BC'D and plane BCC'B'",
  ];

  for (const [name, seq] of [['Hebrew', HE], ['English', EN]] as const) {
    it(`${name}: the partial injection resolves n,p, the sign given selects C′, ℓ resolves through B and C′`, () => {
      seq.forEach(submit);
      expect(state().facts).toHaveLength(9);
      expectAllOk();
      const d = derived();
      const A = d.positions.get('A')!;
      expect(A.y).toBeCloseTo(-4, 4);
      expect(A.z).toBeCloseTo(0, 4);
      expect(d.positions.get("C'")!.z).toBeCloseTo(5, 4);
      const ln = d.resolved.lines.get('ℓ')!;
      const k = ln.dir.x / -3; // dir ∥ BC' = (−3, 4, 5)
      expect(ln.dir.y).toBeCloseTo(4 * k, 4);
      expect(ln.dir.z).toBeCloseTo(5 * k, 4);
    });
  }

  it('WITHOUT the sign given, "show another configuration" flips the mirror branch', () => {
    HE.slice(0, 5).forEach(submit);
    const z0 = derived().positions.get("C'")!.z;
    useGeo3.getState().resample();
    const z1 = derived().positions.get("C'")!.z;
    expect(Math.sign(z0) * Math.sign(z1)).toBe(-1);
  });

  it('a sign given no solution satisfies is refused', () => {
    HE.slice(0, 5).forEach(submit);
    submit('שיעור ה-x של C שלילי'); // C is PINNED at x=4 — no branch can flip it
    expect(state().facts).toHaveLength(5);
    expect(state().lastError).toEqual({ code: 'sign-unsatisfiable', id: 'C' });
  });
});
