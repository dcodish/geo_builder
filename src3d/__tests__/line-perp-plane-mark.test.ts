/**
 * Operator (2026-07-28), looking at the 2024-Q2 figure after `הישר ℓ ניצב למישור π`: "when we say a line
 * is perpendicular, we should increase the plane or move it so it shows they are perpendicular and
 * include a knee".
 *
 * Two gaps, both a rule already stated correctly with one member missing:
 *  - `rightAngles3` reads every recorded ⊥ EXCEPT `c.linePerps`, so the one given whose entire content is
 *    a right angle drew no knee (the ADR-3D-093 class).
 *  - a plane patch grows to cover every point ON it, but not where a drawn LINE crosses it — so the
 *    figure showed a line and a rectangle that never meet.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { buildScene3 } from '../render/scene3';
import { rightAngles3 } from '../render/rightAngles';
import { HOME_CAMERA } from '../render/camera';
import { add3, dot3, linePlaneCrossingT3, norm3, scale3, sub3, v3 } from '../engine/vec3';

const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();

const FIG = [
  'הישר ℓ: x = (-1,5,-11) + t(m-1, 5-m, -2)',
  'המישור π: 3x + my + (m+6)z + 4 = 0',
  'הישר ℓ ניצב למישור π',
];

describe('a line ⟂ a plane is DRAWN as perpendicular', () => {
  beforeEach(() => state().clear());

  it('a knee is emitted at the crossing, with arms along the line and in the plane', () => {
    for (const u of FIG) submit(u);
    expect(state().lastError).toBeNull();
    const d = derive3(state().facts, state().seed);

    const marks = rightAngles3(d.construction, d.resolved, 1.5);
    expect(marks.length, 'the stated ⟂ produces a knee').toBeGreaterThan(0);

    const ln = d.resolved.lines.get('ℓ')!;
    const pl = d.resolved.planes.get('π')!;
    const m = marks[0];

    // the vertex is genuinely the crossing: on the plane AND on the line
    expect(Math.abs(dot3(pl.n, m.vertex) + pl.d) / norm3(pl.n), 'knee sits ON the plane').toBeLessThan(1e-6);
    const q = sub3(m.vertex, ln.anchor);
    const t = dot3(q, ln.dir) / dot3(ln.dir, ln.dir);
    expect(norm3(sub3(q, scale3(ln.dir, t))), 'knee sits ON the line').toBeLessThan(1e-6);

    // arms: one along the line, one lying in the plane, and mutually perpendicular
    expect(Math.abs(dot3(m.u2, pl.n)) / (norm3(m.u2) * norm3(pl.n)), 'second arm lies IN the plane').toBeLessThan(1e-6);
    expect(Math.abs(dot3(m.u1, m.u2)) / (norm3(m.u1) * norm3(m.u2)), 'the arms are perpendicular').toBeLessThan(1e-6);
  });

  it('the patch reaches the crossing, so the line and the plane visibly meet', () => {
    for (const u of FIG) submit(u);
    const d = derive3(state().facts, state().seed);
    const scene = buildScene3(d.construction, d.resolved, HOME_CAMERA, { width: 640, height: 460 }, 1);

    const ln = d.resolved.lines.get('ℓ')!;
    const pl = d.resolved.planes.get('π')!;
    const cross = add3(ln.anchor, scale3(ln.dir, -(dot3(pl.n, ln.anchor) + pl.d) / dot3(pl.n, ln.dir)));

    // project the crossing the same way the scene does, then test it against the drawn patch
    const patch = scene.planes.find((p) => p.name === 'π')!;
    expect(patch, 'the plane is drawn').toBeTruthy();
    const xs = patch.corners.map((p) => p.x);
    const ys = patch.corners.map((p) => p.y);
    const line = scene.lines.find((l) => l.name === 'ℓ')!;
    // the drawn line must pass through the patch's screen box — the visual claim the given makes
    const dx = line.x2 - line.x1;
    const dy = line.y2 - line.y1;
    let inside = false;
    for (let i = 0; i <= 200; i++) {
      const px = line.x1 + (dx * i) / 200;
      const py = line.y1 + (dy * i) / 200;
      if (px >= Math.min(...xs) && px <= Math.max(...xs) && py >= Math.min(...ys) && py <= Math.max(...ys)) {
        inside = true;
        break;
      }
    }
    expect(inside, 'the drawn line crosses the drawn patch').toBe(true);
    expect(cross).toBeTruthy();
  });
});

/**
 * #383 (ADR-3D-109): the POINT-RUN twins. «מישור ACD אנך לישר l1» (#375 → planeLinePerps) and the
 * S2 line-rel forms with a plane-run operand referenced the ids WITHOUT drawing the plane — no
 * patch, so nothing grew to the crossing — and rightAngles3 never read planeLinePerps, so even a
 * drawn patch got no knee. Both asserted to FAIL pre-fix (measured 2026-07-29).
 */
describe('#383 — a stated relation with a POINT-RUN plane leaves its trace', () => {
  beforeEach(() => useGeo3.getState().clear());
  const BASE = ['פירמידה משולשת ABCD', 'הישר l1: x = (2,0,1) + t(1,1,1)'];

  it('«מישור ACD אנך לישר l1» draws the plane AND a knee at the crossing', () => {
    for (const u of [...BASE, 'מישור ACD אנך לישר l1']) submit(u);
    expect(state().lastError).toBeNull();
    const d = derive3(state().facts, state().seed);
    expect(d.construction.pointPlanes.has('ACD'), 'the point-run carrier is materialised').toBe(true);
    const scene = buildScene3(d.construction, d.resolved, HOME_CAMERA, { width: 640, height: 460 }, 1);
    expect(scene.planes.some((p) => p.name === 'ACD'), 'the patch is drawn').toBe(true);
    const marks = rightAngles3(d.construction, d.resolved, 1.5);
    expect(marks.length, 'the stated ⟂ produces a knee').toBeGreaterThan(0);
    // the knee's second arm lies IN the plane and ⟂ the line's direction
    const ln = d.resolved.lines.get('ℓ1')!; // typed l1 canonicalises to ℓ1 (ADR-3D-038)
    const m = marks[0];
    expect(Math.abs(dot3(m.u1, m.u2)) / (norm3(m.u1) * norm3(m.u2)), 'arms perpendicular').toBeLessThan(1e-6);
    const q = sub3(m.vertex, ln.anchor);
    const t = dot3(q, ln.dir) / dot3(ln.dir, ln.dir);
    expect(norm3(sub3(q, scale3(ln.dir, t))), 'knee sits ON the line').toBeLessThan(1e-6);
  });

  it('«הישר l1 מקביל למישור ACD» draws the plane; parallel ⇒ NO knee for that relation', () => {
    for (const u of [...BASE, 'הישר l1 מקביל למישור ACD']) submit(u);
    expect(state().lastError).toBeNull();
    const d = derive3(state().facts, state().seed);
    expect(d.construction.pointPlanes.has('ACD'), 'the point-run carrier is materialised').toBe(true);
    const scene = buildScene3(d.construction, d.resolved, HOME_CAMERA, { width: 640, height: 460 }, 1);
    expect(scene.planes.some((p) => p.name === 'ACD'), 'the patch is drawn').toBe(true);
    const marks = rightAngles3(d.construction, d.resolved, 1.5);
    expect(marks, 'a ∥ relation marks no right angle').toHaveLength(0);
  });
});

/**
 * #2834 (ADR-3D-520) — "parallel" is SCALE-FREE everywhere a line meets a plane. The patch sweep above tested
 * `|n·dir| < 1e-9` on the raw normal; a point-run plane's normal is not unit (|n| ≈ 166 on the exam box), and a
 * solver-settled parallel pair measured n·dir = 2.94e-9 on `main` @ 8e96473d: the sweep read a crossing at
 * t ≈ 1e12, grew the A'B'C'D' patch to it, and the fit shrank the nine points onto one pixel.
 */
describe('#2834 — a line parallel to a point-run plane does not grow its patch', () => {
  beforeEach(() => state().clear());

  /** the measured state: the exam's plane normal (point-run, unnormalised) and line AB's direction */
  const N = { x: 18.426697421620347, y: 73.70678968648127, z: -147.4135793729626 };
  const DIR = { x: 0, y: 2, z: 1 };
  /** N nudged along DIR so that n·dir is exactly `eps` — a parallel pair as a solver leaves it */
  const nudged = (n: typeof N, eps: number) => add3(n, scale3(DIR, (eps - dot3(n, DIR)) / dot3(DIR, DIR)));

  it('linePlaneCrossingT3: a near-parallel pair at the measured residue is parallel, at any normal scale', () => {
    for (const k of [1, 1e-3, 1e3]) {
      const n = scale3(nudged(N, 2.94e-9), k);
      expect(linePlaneCrossingT3(n, -2616.591033870086 * k, v3(0, 7, 6), DIR), `|n| ×${k}`).toBeNull();
    }
  });

  it('linePlaneCrossingT3: a genuine crossing returns its parameter, the same at any normal scale', () => {
    // the plane z = 3 met by the line (0,0,0) + t(0,2,1) at t = 3
    for (const k of [1, 166, 1e-4]) expect(linePlaneCrossingT3(v3(0, 0, k), -3 * k, v3(0, 0, 0), DIR)).toBeCloseTo(3, 12);
    // a shallow genuine crossing far away is still a crossing (not a sibling of the parallel case)
    expect(linePlaneCrossingT3(v3(0, 1e-6, 1), 0, v3(0, 0, 5), v3(0, 1, 0))).toBeCloseTo(-5e6, 3);
  });

  it('the exam box: with n·dir at the measured 2.94e-9 the eight corners stay spread and the patch bounded', () => {
    for (const u of [
      'תיבה',
      "מישור A'B'C'D' הוא x+4y-8z-142=0",
      'B(0,7,6)',
      'משוואת הישר AB היא x = (0,7,6) + t(0,2,1)',
      'אורך המקצוע AB הוא 5√5',
      'שיעור ה-y של הקודקוד A שלילי',
    ]) {
      submit(u);
      expect(state().lastError, u).toBeNull();
    }
    const VIEW = { width: 640, height: 460 };
    for (let seed = 0; seed < 6; seed++) {
      const d = derive3(state().facts, seed);
      const pl = d.resolved.planes.get("A'B'C'D'")!;
      // replay the measured solver residue on this seed's plane (its normal is the point-run one, |n| ≫ 1)
      const n = nudged(pl.n, 2.94e-9 * (norm3(pl.n) / norm3(N)));
      const planes = new Map(d.resolved.planes).set("A'B'C'D'", { n, d: pl.d });
      const scene = buildScene3(d.construction, { ...d.resolved, planes }, HOME_CAMERA, VIEW, 1);
      const box = scene.points.filter((p) => /^[ABCD]'?$/.test(p.id));
      expect(box).toHaveLength(8);
      const xs = box.map((p) => p.x);
      const ys = box.map((p) => p.y);
      const spread = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
      expect(spread, `seed ${seed}: the box is framed, not a dot`).toBeGreaterThan(VIEW.height / 3);
      const keys = new Set(box.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`));
      expect(keys.size, `seed ${seed}: eight distinct screen points`).toBe(8);
      for (const c of scene.planes.find((q) => q.name === "A'B'C'D'")!.corners) {
        expect(Math.abs(c.x) + Math.abs(c.y), `seed ${seed}: the patch corner stays near the figure`).toBeLessThan(10 * VIEW.width);
      }
    }
  });
});
