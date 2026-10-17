/**
 * #1946 + #2103 (ADR-3D-366) — a stated ⟂ whose right angle sits at a NAMED point is marked at rest, once, in the
 * corner the STATEMENT names: toward the other segment's second-named letter at a named foot («AD ⟂ BC» → ∠ADC),
 * toward each segment's second-named letter at a named crossing («AC ⟂ BD» at O → ∠COD). The 3-D half of ADR-731
 * (operator rulings 2026-10-10, 2026-10-14 card d14b-1946-side A, 2026-10-15 #2103 card 7 A; ADR-W-118 B1).
 *
 * Measured on `main` @ 688dfb96 through the store's real `submit` → `derive3` → `rightAngles3`: no knee at D (the
 * `meetingPoint` gate wants a crossing strictly inside both segments), and the knee at a named O on ∠AOB (square, an
 * `armDir` tie) or ∠COB (rhombus, the farther ends) — never ∠COD.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { dist3, type Vec3 } from '../engine/vec3';
import { rightAngles3 } from '../render/rightAngles';
import { HOME_CAMERA } from '../render/camera';
import { buildScene3 } from '../render/scene3';
import { derive3, useGeo3 } from '../store/store3';

const reset = () => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
};

function build(steps: string[]) {
  reset();
  for (const s of steps) useGeo3.getState().submit(s);
  const st = useGeo3.getState();
  expect(st.lastError, `${steps.join(' · ')}`).toBeNull();
  expect(st.facts).toHaveLength(steps.length);
  return st.facts;
}

/** The knees as `V:r1r2`: the vertex's id and the ids each arm points EXACTLY at (rays sorted). */
function knees(facts: ReturnType<typeof build>, seed = 0): string[] {
  const d = derive3(facts, seed);
  for (const f of facts) expect(d.status[f.id], `«${f.utterance}» → ${d.status[f.id]}`).toBe('ok');
  const pts = [...d.resolved.positions.values()];
  const c0 = pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length, z: a.z + p.z / pts.length }), { x: 0, y: 0, z: 0 });
  const radius = Math.max(...pts.map((p) => dist3(p, c0)), 1e-6);
  const at = (v: Vec3) => [...d.resolved.positions].find(([, p]) => dist3(p, v) < 1e-6)?.[0] ?? '@';
  const toward = (v: Vec3, u: Vec3) => {
    let best = '?', bd = 1 - 1e-6;
    for (const [id, p] of d.resolved.positions) {
      const w = { x: p.x - v.x, y: p.y - v.y, z: p.z - v.z };
      const n = Math.hypot(w.x, w.y, w.z);
      if (n < 1e-9) continue;
      const c = (w.x * u.x + w.y * u.y + w.z * u.z) / n;
      if (c > bd) [best, bd] = [id, c];
    }
    return best;
  };
  return rightAngles3(d.construction, d.resolved, radius)
    .map((m) => `${at(m.vertex)}:${[toward(m.vertex, m.u1), toward(m.vertex, m.u2)].sort().join('')}`)
    .sort();
}

beforeEach(reset);

const TRI = ['משולש ABC', 'D על BC'];

describe('#1946 (3-D) — a named foot on the other segment: one knee, toward its second-named letter', () => {
  const ROWS: [string[], string[]][] = [
    [[...TRI, 'AD ⟂ BC'], ['D:AC']],
    [[...TRI, 'AD ⊥ BC'], ['D:AC']],
    [[...TRI, 'AD מאונך ל-BC'], ['D:AC']],
    [[...TRI, 'AD ⊥ CB'], ['D:AB']],
    [[...TRI, 'AD גובה'], ['D:AC']],
    [['משולש ABC', 'AD גובה'], ['D:AC']],
    [['משולש ABC', 'AD גובה לצלע CB'], ['D:AB']],
  ];
  for (const [steps, want] of ROWS) {
    it(`${steps.join(' · ')} → ${JSON.stringify(want)}`, () => {
      expect(knees(build(steps))).toEqual(want);
    });
  }

  it('the side never flips across seeds 0–5', () => {
    const facts = build([...TRI, 'AD ⊥ CB']);
    for (let seed = 0; seed <= 5; seed++) expect(knees(facts, seed), `seed ${seed}`).toEqual(['D:AB']);
  });

  it('a wedge already carrying a value is not marked twice: «זווית ADB = 90» keeps its knee', () => {
    expect(knees(build([...TRI, 'AD ⊥ BC', 'זווית ADB = 90']))).toEqual(['D:AB']);
  });

  it('a stated non-right angle between the same segments draws no knee (the arc lane is untouched)', () => {
    expect(knees(build([...TRI, 'הזווית בין AD לבין BC היא 55']))).toEqual([]);
  });

  it('the shared-endpoint control is unchanged: «AB ⟂ AC» → A', () => {
    expect(knees(build(['משולש ABC', 'AB ⟂ AC']))).toEqual(['A:BC']);
  });
});

describe('#2103 (3-D) — a named crossing: one knee, toward each segment’s second-named letter', () => {
  const O = 'O נקודת חיתוך האלכסונים';
  const ROWS: [string[], string[]][] = [
    [['ריבוע ABCD', O, 'AC ⟂ BD'], ['B:AC', 'O:CD']],
    [['ריבוע ABCD', O, 'CA ⊥ BD'], ['B:AC', 'O:AD']],
    [['ריבוע ABCD', O, 'BD מאונך ל-AC'], ['B:AC', 'O:CD']],
    [['ריבוע ABCD', O, 'הזווית בין AC ל-BD היא 90'], ['B:AC', 'O:CD']],
    [['מעוין ABCD', O, 'AC ⟂ BD'], ['O:CD']],
  ];
  for (const [steps, want] of ROWS) {
    it(`${steps.join(' · ')} → ${JSON.stringify(want)}`, () => {
      expect(knees(build(steps))).toEqual(want);
    });
  }

  it('the corner never flips across seeds 0–5', () => {
    const facts = build(['מעוין ABCD', O, 'AC ⟂ BD']);
    for (let seed = 0; seed <= 5; seed++) expect(knees(facts, seed), `seed ${seed}`).toEqual(['O:CD']);
  });

  it('with «זווית AOB = 90» also stated, O carries one knee', () => {
    expect(knees(build(['ריבוע ABCD', O, 'AC ⟂ BD', 'זווית AOB = 90']))).toEqual(['B:AC', 'O:AB']);
  });

  it('an unnamed crossing stays unmarked (#2091): «ריבוע ABCD» · «AC ⟂ BD»', () => {
    expect(knees(build(['ריבוע ABCD', 'AC ⟂ BD']))).toEqual(['B:AC']);
  });
});

describe('#1946 (3-D) — a knee at a named point is not covered by that point’s letter', () => {
  for (const steps of [
    ['מעוין ABCD', 'O נקודת חיתוך האלכסונים', 'AC ⟂ BD'],
    ['ריבוע ABCD', 'O נקודת חיתוך האלכסונים', 'AC ⟂ BD'],
    [...TRI, 'AD ⊥ BC'],
  ]) {
    it(`${steps.join(' · ')}: the letter sits outside the knee's corner`, () => {
      const facts = build(steps);
      const d = derive3(facts, 0);
      const scene = buildScene3(d.construction, d.resolved, HOME_CAMERA, { width: 640, height: 460 }, 1);
      const v = steps.at(-1)!.startsWith('AC') ? 'O' : 'D';
      const p = scene.points.find((q) => q.id === v)!;
      const knee = scene.marks.find((m) => Math.hypot(m.pts[0].x + m.pts[2].x - m.pts[1].x - p.x, m.pts[0].y + m.pts[2].y - m.pts[1].y - p.y) < 1e-6);
      expect(knee, 'a knee whose corner square closes on the point').toBeDefined();
      const corner = { x: knee!.pts[1].x - p.x, y: knee!.pts[1].y - p.y };
      const cos = (corner.x * p.labelDx + corner.y * p.labelDy) / Math.hypot(corner.x, corner.y) / Math.hypot(p.labelDx, p.labelDy);
      expect(cos, 'the label points away from the knee (more than 45° off its diagonal)').toBeLessThan(Math.SQRT1_2);
    });
  }
});
