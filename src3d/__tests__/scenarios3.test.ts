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
import { freeDofCount3 } from '../engine/evaluate';
import { dist3 } from '../engine/vec3';
import { derive3, useGeo3 } from '../store/store3';
import { dataView, panelIsEmpty } from '../engine/dataView';

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

describe('GATE — 2019 קיץ Q2 (V5: line through points cutting a point-plane, ratio + angle answers)', () => {
  beforeEach(reset);

  const HE = [
    'קובייה ABCD',
    'B(0,0,0)',
    'A(6,0,0)',
    'C(0,6,0)',
    "שיעור ה-z של B' חיובי",
    "הזווית בין A'C לבין BC' היא 90", // the א answer — verified
    "הישר A'C חותך את המישור BC'D בנקודה K",
    'K = (2, 4, 2)',
    "A'K : A'C = 2 : 3", // the ג answer — verified
  ];
  const EN = [
    'cube ABCD',
    'B(0,0,0)',
    'A(6,0,0)',
    'C(0,6,0)',
    "the z-coordinate of B' is positive",
    "the angle between A'C and BC' is 90",
    "line A'C cuts plane BC'D at K",
    'K = (2, 4, 2)',
    "A'K : A'C = 2 : 3",
  ];

  for (const [name, seq] of [['Hebrew', HE], ['English', EN]] as const) {
    it(`${name}: the full sequence builds and every answer verifies`, () => {
      seq.forEach(submit);
      expect(state().facts).toHaveLength(9);
      expectAllOk();
      const K = derived().positions.get('K')!;
      expect(K.x).toBeCloseTo(2, 4);
      expect(K.y).toBeCloseTo(4, 4);
      expect(K.z).toBeCloseTo(2, 4);
    });
  }

  it('a wrong ratio is refused', () => {
    HE.slice(0, 7).forEach(submit);
    submit("A'K : A'C = 1 : 2");
    expect(state().facts).toHaveLength(7);
    expect(state().lastError).toEqual({ code: 'claim-refuted' });
  });
});

describe('GATE — V6 solids-trig (cone / cylinder / sphere with stated sizes; formula-sheet answers verify)', () => {
  beforeEach(reset);

  it('Hebrew: the cone chain — free until sized, then V=100π and M=65π verify', () => {
    submit('חרוט שקודקודו S ומרכז בסיסו O');
    expect(state().facts).toHaveLength(1); // free-size cone builds (r,h are free DOFs)
    submit('נפח החרוט = 100π');
    expect(state().lastError).toEqual({ code: 'free-size-claim', id: 'cone' }); // honest: size the solid first
    useGeo3.getState().clear();
    submit('חרוט שקודקודו S ומרכז בסיסו O, רדיוסו 5 וגובהו 12');
    submit('נפח החרוט = 100π');
    submit('שטח המעטפת של החרוט = 65π');
    expect(state().facts).toHaveLength(3);
    expectAllOk();
    submit('נפח החרוט = 99π');
    expect(state().lastError).toEqual({ code: 'claim-refuted' });
  });

  it('English: sphere R=3 — volume and surface area both 36π', () => {
    submit('sphere with center O radius 3');
    submit('the volume of the sphere = 36π');
    submit('the surface area of the sphere = 36π');
    expect(state().facts).toHaveLength(3);
    expectAllOk();
  });

  it('the DOF cue: a sized cone reads 0, a free cone reads 2', () => {
    submit('חרוט שקודקודו S ומרכז בסיסו O');
    const d1 = derived();
    expect(freeDofCount3(d1.construction, d1.resolved)).toBe(2);
    useGeo3.getState().clear();
    submit('חרוט שקודקודו S ומרכז בסיסו O, רדיוסו 5 וגובהו 12');
    const d2 = derived();
    expect(freeDofCount3(d2.construction, d2.resolved)).toBe(0);
  });
});

describe("#116 (ADR-3D-042) — a right-triangle qualifier on a prism base (prod session 38t9c7lv)", () => {
  beforeEach(reset);

  const angleAt = (V: string, P: string, Q: string) => {
    const pos = derived().resolved.positions;
    const v = pos.get(V)!, p = pos.get(P)!, q = pos.get(Q)!;
    const a = { x: p.x - v.x, y: p.y - v.y, z: p.z - v.z };
    const b = { x: q.x - v.x, y: q.y - v.y, z: q.z - v.z };
    const d = a.x * b.x + a.y * b.y + a.z * b.z;
    return (Math.acos(Math.max(-1, Math.min(1, d / (Math.hypot(a.x, a.y, a.z) * Math.hypot(b.x, b.y, b.z))))) * 180) / Math.PI;
  };

  it("the exact prod sequence: right prism, then AOB is a right triangle — no already-defined, ∠ at the middle vertex drives to 90", () => {
    submit("מנסרה ישרה AOBA'O'B'");
    submit('AOB משולש ישר זוית');
    expectAllOk(); // the qualifier is NOT dropped and NOT an already-defined re-build (M1 idempotency)
    expect(angleAt('O', 'A', 'B')).toBeCloseTo(90, 0); // default = middle vertex O
  });

  it('an explicit ∠OAB = 90 overrides the soft middle-vertex default (M4 defaults-yield)', () => {
    submit("מנסרה ישרה AOBA'O'B'");
    submit('AOB משולש ישר זוית');
    submit('∠OAB = 90');
    expectAllOk(); // one right angle, not two (the soft O-default was dropped) → never over-constrained
    expect(angleAt('A', 'O', 'B')).toBeCloseTo(90, 0);
  });

  it('a fresh "right triangle ABC" (new points, both locales) builds a right-angled triangle', () => {
    submit('right triangle ABC');
    expectAllOk();
    expect(angleAt('B', 'A', 'C')).toBeCloseTo(90, 0); // middle vertex B
    reset();
    submit('משולש DEF ישר זווית');
    expectAllOk();
    expect(angleAt('E', 'D', 'F')).toBeCloseTo(90, 0);
  });
});

// #94 — prod session 23mxaquw (right square pyramid ABCDS): the student typed ∠SDB three times + ∠SDB=α
// trying to SEE/NAME the angle; the tool refused it as a valueless query. Now a bare ∠XYZ is a pedagogical
// MARKER — it draws the arc and (if determined) surfaces its measure — never a refusal.
describe('#94 — a named angle is a highlightable marker (session 23mxaquw)', () => {
  beforeEach(reset);
  it('∠SDB on the right square pyramid builds the arc (repeatable, idempotent); ∠SDB=α labels it', () => {
    submit('פירמידה ABCDS שבסיסה ריבוע');
    submit('∠SDB');
    submit('∠SDB'); // typed again — idempotent, still one marker
    expect(state().lastError).toBeNull();
    const marks = derived().construction.angleMarks;
    expect(marks).toHaveLength(1);
    expect(marks[0]).toMatchObject({ vertex: 'D', p: 'S', q: 'B' });
    // under-determined (free height) → the arc shows, but no seed-varying value is printed
    expect(dataView(derived().construction, state().seed).relations.some((r) => r.startsWith('∠SDB'))).toBe(false);
    submit('∠SDB = α'); // naming it α upgrades the marker's label
    expect(derived().construction.angleMarks.find((m) => m.vertex === 'D')?.label).toBe('α');
  });
});

// #296 — prod figure "dd" (square-base pyramid, E on AS, EO⊥AS): the data panel showed nothing although
// the square base yields the scale-free relations |u|=|v| and u·v=0. Root cause: the App's empty-panel
// guard checked vectors/points/planes but OMITTED relations, so a relations-only panel rendered "empty",
// hiding real knowledge. `panelIsEmpty` now includes relations; the guard and render read emptiness alike.
describe('#296 — a relations-only data panel is NOT empty', () => {
  beforeEach(reset);
  it('the "dd" figure surfaces |u|=|v| and u·v=0 (panel not empty)', () => {
    [
      'פירמידה שבסיסה ריבוע',
      'אלכסוני הריבוע נחתכים בנקודה O',
      'AD=u',
      'AB=v',
      'AS=w',
      'AE=t*AS',
      'EO',
      '∠SAD=∠SAB=α',
      '60<α<90',
      'EO⊥AS',
    ].forEach(submit);
    expectAllOk();
    const p = dataView(derived().construction, state().seed);
    expect(p.vectors.every((v) => v.mag === null)).toBe(true); // free scale ⇒ no magnitude is knowledge…
    expect(p.relations).toEqual(expect.arrayContaining(['|u| = |v|', 'u·v = 0'])); // …but the square base still yields these
    expect(panelIsEmpty(p)).toBe(false); // so the panel must NOT read as empty (the bug)
  });
});

// #297 — the same "dd" figure: parametric vectors for a DRIVEN parameter (EO = ½u+½v−t·w, AE = t·w) and the
// forced angle equality (∠SAD = ∠SAB). t is pinned by EO⊥AS (seg-perp), so its VALUE roams with the free
// apex — the parametric form is the only stable representation, exactly what the panel should surface.
describe('#297 — parametric vectors (driven t) + angle equality', () => {
  beforeEach(reset);
  it('EO = ½u + ½v − t·w, AE = t·w, and ∠SAD = ∠SAB all surface', () => {
    ['פירמידה שבסיסה ריבוע', 'אלכסוני הריבוע נחתכים בנקודה O', 'AD=u', 'AB=v', 'AS=w', 'AE=t*AS', 'EO', '∠SAD=∠SAB=α', '60<α<90', 'EO⊥AS'].forEach(submit);
    expectAllOk();
    const p = dataView(derived().construction, state().seed);
    const eo = p.vectors.find((v) => v.label === 'EO');
    const ae = p.vectors.find((v) => v.label === 'AE');
    expect(eo?.decomp).toBe('1/2·u + 1/2·v − t·w'); // the parametric form of a driven-t vector
    expect(ae?.decomp).toBe('t·w');
    expect(p.relations).toContain('∠SAD = ∠SAB'); // the forced (cos-eq) equality, value-free
  });
});

// #117 — right prisms over more bases (parallelogram / square / regular n-gon) + the oblique parallelepiped
// (מקבילון). Each slots into the dims-sampler + pivot with no new solver code; the DOF cue reads the base's
// free shape dims (modulo the similarity gauge).
describe('#117 — generalized prism bases + parallelepiped', () => {
  beforeEach(reset);
  const dof = () => freeDofCount3(derived().construction, derived().resolved);

  it('a parallelogram-base right prism builds (3 shape DOF)', () => {
    submit("מנסרה ישרה שבסיסה מקבילית ABCDA'B'C'D'");
    expect(state().lastError).toBeNull();
    expect(dof()).toBe(3); // dx, dy, height
  });
  it('a square-base right prism builds (1 shape DOF — only the height)', () => {
    submit("מנסרה ישרה שבסיסה ריבוע ABCDA'B'C'D'");
    expect(state().lastError).toBeNull();
    expect(dof()).toBe(1);
  });
  it('a regular pentagon prism builds (1 shape DOF)', () => {
    submit('מנסרה ישרה שבסיסה מחומש');
    expect(state().lastError).toBeNull();
    expect(dof()).toBe(1);
  });
  it('a מקבילון (oblique) builds (5 shape DOF) and a size given on an edge verifies', () => {
    submit("מקבילון ABCDA'B'C'D'");
    expect(state().lastError).toBeNull();
    expect(dof()).toBe(5); // dx, dy + the free lateral vector w=(wx,wy,wz)
    submit('|AB| = 3');
    expect(state().lastError).toBeNull(); // the size is accepted (verifies), never refused
  });
});
