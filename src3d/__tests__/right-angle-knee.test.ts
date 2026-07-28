/**
 * #307 (ADR-3D-093) — a STATED perpendicularity draws a right-angle knee.
 *
 * Operator (2026-07-24): «when I say that 2 lines are perpendicular, I would like to see a
 * knee, but the knee should also be 3d for viewing it.»
 *
 * The knee GEOMETRY was already three-dimensional (world-space legs, projected afterwards);
 * what was missing was the trigger — a two-item whitelist of point KINDS (`foot-plane`,
 * `foot-line`), so every stated ⊥ drew nothing, and even constructed right angles arriving as
 * `foot-face` / `foot-seg` went unmarked. Tests are in three layers:
 *   (1) every statement form now yields a knee (the class, not the reported instance);
 *   (2) the knee is genuinely 3-D — its legs track the arms as the camera orbits;
 *   (3) honesty — a SKEW ⊥ gets no knee (it has no intersection to mark), and the same
 *       corner asserted twice is marked once.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { dist3, dot3, norm3, sub3, type Vec3 } from '../engine/vec3';
import { HOME_CAMERA } from '../render/camera';
import { rightAngles3 } from '../render/rightAngles';
import { buildScene3 } from '../render/scene3';
import { derive3, useGeo3 } from '../store/store3';

const reset = () => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
};
const submit = (u: string) => useGeo3.getState().submit(u);
const derived = () => derive3(useGeo3.getState().facts, useGeo3.getState().seed);

function build(steps: string[]) {
  reset();
  for (const s of steps) submit(s);
  const d = derived();
  const st = useGeo3.getState();
  for (const f of st.facts) expect(d.status[f.id], `«${f.utterance}» → ${d.status[f.id]}`).toBe('ok');
  return d;
}
const scene = (steps: string[], cam = HOME_CAMERA) => {
  const d = build(steps);
  return buildScene3(d.construction, d.resolved, cam, { width: 640, height: 460 }, 1);
};
/** The collector's raw wedges (world space), independent of the camera. */
const wedges = (steps: string[]) => {
  const d = build(steps);
  const pts = [...d.resolved.positions.values()];
  const c0 = pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length, z: a.z + p.z / pts.length }), { x: 0, y: 0, z: 0 });
  const radius = Math.max(...pts.map((p) => dist3(p, c0)), 1e-6);
  return rightAngles3(d.construction, d.resolved, radius);
};

// ---------------------------------------------------------------------------
// (1) every form of a stated / constructed right angle gets a knee
// ---------------------------------------------------------------------------

describe('#307 — a stated ⊥ is marked on the figure', () => {
  beforeEach(reset);

  const FORMS: { name: string; steps: string[] }[] = [
    { name: 'two segments, word form (He)', steps: ["תיבה ABCDA'B'C'D'", 'AB מאונך ל-AD'] },
    { name: 'two segments, symbol form', steps: ["תיבה ABCDA'B'C'D'", 'AB ⊥ AD'] },
    { name: 'two segments (En)', steps: ["box ABCDA'B'C'D'", 'AB is perpendicular to AD'] },
    { name: 'named vectors u ⊥ v', steps: ["תיבה ABCDA'B'C'D'", "נסמן: AB = u, AD = v, AA' = w", 'u ⊥ v'] },
    { name: 'vertex angle = 90', steps: ["תיבה ABCDA'B'C'D'", 'זווית BAD = 90'] },
    { name: 'segment ⊥ plane', steps: ['קובייה ABCD', "AA' מאונך למישור ABCD"] },
  ];

  for (const { name, steps } of FORMS) {
    it(`${name} → a knee is drawn`, () => {
      const s = scene(steps);
      expect(s.marks.length, 'no knee was drawn').toBeGreaterThanOrEqual(1);
      expect(s.marks[0].pts).toHaveLength(3); // the textbook 3-point knee polyline
    });
  }

  it('the knee sits at the shared vertex, with legs along the two arms', () => {
    const ms = wedges(["תיבה ABCDA'B'C'D'", 'AB מאונך ל-AD']);
    expect(ms).toHaveLength(1);
    const d = derived();
    const A = d.resolved.positions.get('A')!;
    const B = d.resolved.positions.get('B')!;
    const D = d.resolved.positions.get('D')!;
    expect(dist3(ms[0].vertex, A)).toBeLessThan(1e-9);
    // each leg is a unit vector along one of the two arms
    const along = (u: Vec3, p: Vec3) => Math.abs(dot3(u, sub3(p, A)) / (norm3(u) * dist3(A, p)) - 1) < 1e-9;
    expect(along(ms[0].u1, B) || along(ms[0].u1, D)).toBe(true);
    expect(along(ms[0].u2, B) || along(ms[0].u2, D)).toBe(true);
    expect(Math.abs(dot3(ms[0].u1, ms[0].u2))).toBeLessThan(1e-9); // and they really are ⊥
  });

  it('a stated 90° draws the KNEE, not an arc labelled "90°"', () => {
    const s = scene(["תיבה ABCDA'B'C'D'", 'זווית BAD = 90']);
    expect(s.marks.length).toBeGreaterThanOrEqual(1);
    expect(s.angles.map((a) => a.text)).not.toContain('90°');
  });

  it('a non-right stated angle still draws its arc + value (unchanged)', () => {
    const s = scene(['פירמידה שבסיסה מקבילית', 'זווית DAB = 70']);
    expect(s.angles.map((a) => a.text)).toContain('70°');
  });
});

describe('#307 — CONSTRUCTED right angles: every foot kind, not a whitelist of two', () => {
  beforeEach(reset);

  it('foot on a plane (the kind that already worked) is unchanged', () => {
    const s = scene(['המישור π1: z - 3 = 0', 'A(1,2,7)', 'מ-A מורידים אנך למישור π1 החותך אותו בנקודה B']);
    expect(s.marks).toHaveLength(1);
  });

  it('foot on a line (the other pre-#307 kind) is unchanged', () => {
    const s = scene(['הישר ℓ: x = (0,0,0) + t(1,0,0)', 'A(1,2,7)', 'מ-A מעבירים אנך לישר ℓ החותך אותו בנקודה B']);
    expect(s.marks).toHaveLength(1);
  });

  it('foot on a FACE (`גובה בטטראדר`) — pre-#307 this drew nothing', () => {
    const s = scene(['טטראדר ABCD', 'DE גובה בטטראדר']);
    expect(s.marks.length).toBeGreaterThanOrEqual(1);
  });

  it('the foot knee really is at the foot, ⟂ to the carrier', () => {
    const ms = wedges(['טטראדר ABCD', 'DE גובה בטטראדר']);
    expect(ms.length).toBeGreaterThanOrEqual(1);
    const m = ms[0];
    const d = derived();
    const E = d.resolved.positions.get('E')!;
    expect(dist3(m.vertex, E)).toBeLessThan(1e-9);
    expect(Math.abs(dot3(m.u1, m.u2))).toBeLessThan(1e-6);
  });
});

// ---------------------------------------------------------------------------
// (2) the knee is 3-D: its legs track the arms under the projection
// ---------------------------------------------------------------------------

describe('#307 — the knee is three-dimensional, not a screen-space square', () => {
  beforeEach(reset);

  it('the projected legs stay parallel to the projected arms as the camera orbits', () => {
    const steps = ["תיבה ABCDA'B'C'D'", 'AB מאונך ל-AD'];
    for (const cam of [HOME_CAMERA, { yaw: 0.2, pitch: 0.15 }, { yaw: 2.1, pitch: 0.9 }, { yaw: -1.3, pitch: -0.4 }]) {
      const s = scene(steps, cam);
      expect(s.marks).toHaveLength(1);
      const [p, q, r] = s.marks[0].pts;
      const ptOf = (id: string) => s.points.find((pt) => pt.id === id)!;
      const A = ptOf('A');
      // leg 1: A→p must be parallel to the projected A→(B or D); same for A→r
      const dirTo = (id: string) => ({ x: ptOf(id).x - A.x, y: ptOf(id).y - A.y });
      const par = (u: { x: number; y: number }, v: { x: number; y: number }) =>
        Math.abs(u.x * v.y - u.y * v.x) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y)) < 1e-6;
      const legA = { x: p.x - A.x, y: p.y - A.y };
      const legB = { x: r.x - A.x, y: r.y - A.y };
      const arms = [dirTo('B'), dirTo('D')];
      expect(arms.some((a) => par(legA, a)), `yaw ${cam.yaw}: leg 1 is not along an arm`).toBe(true);
      expect(arms.some((a) => par(legB, a)), `yaw ${cam.yaw}: leg 2 is not along an arm`).toBe(true);
      // and the knee CLOSES: the corner is leg1 + leg2 (a parallelogram, foreshortened)
      expect(Math.abs(q.x - (p.x + r.x - A.x))).toBeLessThan(1e-6);
      expect(Math.abs(q.y - (p.y + r.y - A.y))).toBeLessThan(1e-6);
    }
  });

  it('a foreshortened right angle is NOT drawn as a square on screen (it is a real projection)', () => {
    // at the home camera the box's base corner projects obliquely — the two legs must NOT be
    // axis-aligned/equal-length on screen, which is what a fake 2-D knee would give
    const s = scene(["תיבה ABCDA'B'C'D'", 'AB מאונך ל-AD']);
    const [p, q, r] = s.marks[0].pts;
    const l1 = Math.hypot(q.x - r.x, q.y - r.y);
    const l2 = Math.hypot(q.x - p.x, q.y - p.y);
    const cos = ((p.x - q.x) * (r.x - q.x) + (p.y - q.y) * (r.y - q.y)) / (l1 * l2);
    expect(Math.abs(cos), 'the knee projects as a perfect right angle — it is not foreshortened').toBeGreaterThan(1e-6);
  });
});

// ---------------------------------------------------------------------------
// (3) honesty — never mark an intersection the figure does not have
// ---------------------------------------------------------------------------

describe('#307 — honesty: no knee where the arms do not meet', () => {
  beforeEach(reset);

  it("SKEW ⊥ gets NO knee (perpendicular directions, no intersection)", () => {
    // on a cube, AB (bottom front edge) and CC' (a far vertical edge) are perpendicular and SKEW
    const s = scene(['קובייה ABCD', "AB מאונך ל-CC'"]);
    expect(s.marks, 'a knee was drawn at an intersection that does not exist').toHaveLength(0);
  });

  it('the skew pair is genuinely perpendicular — the relation held, only the MARK is withheld', () => {
    const d = build(['קובייה ABCD', "AB מאונך ל-CC'"]);
    const p = (id: string) => d.resolved.positions.get(id)!;
    const u = sub3(p('B'), p('A'));
    const v = sub3(p("C'"), p('C'));
    expect(Math.abs(dot3(u, v)) / (norm3(u) * norm3(v))).toBeLessThan(1e-9);
  });

  it('perpendicular diagonals that DO cross are marked at the crossing', () => {
    const ms = wedges(['פירמידה SABCD שבסיסה ריבוע', 'AC מאונך ל-BD']);
    expect(ms).toHaveLength(1);
    const d = derived();
    const p = (id: string) => d.resolved.positions.get(id)!;
    const mid = { x: (p('A').x + p('C').x) / 2, y: (p('A').y + p('C').y) / 2, z: (p('A').z + p('C').z) / 2 };
    expect(dist3(ms[0].vertex, mid)).toBeLessThan(1e-9); // the square's centre, not an endpoint
  });

  it('the SAME corner asserted twice (stated + stated again) is marked once', () => {
    expect(wedges(["תיבה ABCDA'B'C'D'", 'AB מאונך ל-AD', 'AD מאונך ל-AB'])).toHaveLength(1);
  });

  it('a figure with no perpendicularity statement draws no knees', () => {
    expect(scene(['פירמידה SABCD שבסיסה מקבילית']).marks).toHaveLength(0);
  });
});
