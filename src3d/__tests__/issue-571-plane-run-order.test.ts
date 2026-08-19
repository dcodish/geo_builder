/**
 * Issue #571 (ADR-3D-162): a plane named by POINTS is a SET, so any stated order names the same plane.
 *
 * «מישור BB'DD'» — the cube's diagonal plane, named the natural way (the two vertical edges BB' and
 * DD') — was refused `not-coplanar` on four points that are perfectly coplanar. `planeFromPointRun`
 * took `newellNormal` over the STATED order, and the Newell normal is twice the polygon's SIGNED-AREA
 * vector: B→B'→D→D' traces a self-crossing bowtie whose two triangles cancel exactly, so the normal
 * came out 0, resolution returned null, and the store's verifier reported a geometric falsehood.
 *
 * The class: an ORDER-SENSITIVE computation answering an ORDER-FREE question. The fix is one shared
 * order-free run normal in `vec3.ts` consumed by every student-run call site — not a per-site patch.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { resolve3 } from '../engine/evaluate';
import { runNormal, runRingOrder, newellNormal, norm3, cross3, dot3, v3, type Vec3 } from '../engine/vec3';
import { buildScene3 } from '../render/scene3';
type P = { x: number; y: number };
import { HOME_CAMERA } from '../render/camera';

const reset = () => {
  useGeo3.setState({ facts: [], seed: 0, queries: [], lastError: null });
  useGeo3.temporal.getState().clear();
};
const build = (steps: string[]) => {
  reset();
  for (const u of steps) useGeo3.getState().submit(u);
  const st = useGeo3.getState();
  return { st, d: derive3(st.facts, st.seed) };
};
/** The plane as an ORIENTATION-FREE identity: the unit normal up to sign, plus its offset. */
const identity = (pl: { n: Vec3; d: number }) => {
  const m = norm3(pl.n);
  const s = pl.n.x + pl.n.y + pl.n.z < 0 ? -1 : 1;
  return [(s * pl.n.x) / m, (s * pl.n.y) / m, (s * pl.n.z) / m, (s * pl.d) / m].map((x) => Number(x.toFixed(9)));
};

describe("#571 — «מישור BB'DD'» builds, and every order names one plane", () => {
  beforeEach(reset);

  it("the operator's exact sequence builds — the refusal was a false statement", () => {
    const { st, d } = build(["קובייה ABCDA'B'C'D'", "מישור BB'DD'"]);
    expect(st.lastError).toBeNull();
    expect(st.facts).toHaveLength(2);
    for (const [id, s] of Object.entries(d.status)) expect(s, id).toBe('ok');
    expect(resolve3(d.construction, 0).planes.get("BB'DD'")).toBeTruthy();
  });

  it('stated-order INVARIANCE: every ordering of a coplanar run resolves to the SAME plane', () => {
    const orders = ["BB'DD'", "BB'D'D", "BDD'B'", "BD'DB'", "DD'BB'", "D'DB'B"];
    const ids = orders.map((run) => {
      const { st, d } = build(["קובייה ABCDA'B'C'D'", `מישור ${run}`]);
      expect(st.lastError, run).toBeNull();
      const pl = resolve3(d.construction, 0).planes.get(run);
      expect(pl, run).toBeTruthy();
      return identity(pl!);
    });
    for (const got of ids) expect(got).toEqual(ids[0]);
  });

  it('the honest refusals SURVIVE — a genuinely non-coplanar run still refuses', () => {
    const { st } = build(["קובייה ABCDA'B'C'D'", "מישור ABCA'"]);
    expect(st.lastError).not.toBeNull();
    expect(st.facts).toHaveLength(1); // the refused statement never entered the fact list
  });

  it('a canonical face is untouched — same plane, same orientation as before', () => {
    const { d } = build(["קובייה ABCDA'B'C'D'", 'מישור ABCD']);
    const pl = resolve3(d.construction, 0).planes.get('ABCD')!;
    const pos = resolve3(d.construction, 0).positions;
    const pts = ['A', 'B', 'C', 'D'].map((id) => pos.get(id)!);
    // the stated order still decides the sign (the right-hand rule), byte-identical to the old reading
    expect(dot3(pl.n, newellNormal(pts))).toBeGreaterThan(0);
  });
});

describe('#571 — the shared primitives', () => {
  const square = [v3(0, 0, 0), v3(1, 0, 0), v3(1, 1, 0), v3(0, 1, 0)];
  const bowtie = [square[0], square[1], square[3], square[2]]; // the crossing order

  it('the bowtie order has a ZERO Newell normal and a good run normal', () => {
    expect(norm3(newellNormal(bowtie))).toBeLessThan(1e-12);
    expect(norm3(runNormal(bowtie))).toBeGreaterThan(0.5);
    expect(norm3(cross3(runNormal(bowtie), v3(0, 0, 1)))).toBeLessThan(1e-12);
  });

  it('a non-crossing order keeps the stated ORIENTATION', () => {
    expect(dot3(runNormal(square), newellNormal(square))).toBeGreaterThan(0);
    const reversed = [...square].reverse();
    expect(dot3(runNormal(reversed), newellNormal(reversed))).toBeGreaterThan(0);
    // and the two readings are genuinely opposite — the order still means something
    expect(dot3(runNormal(square), runNormal(reversed))).toBeLessThan(0);
  });

  it('collinear and coincident runs still return ZERO, so every caller refuses as before', () => {
    expect(norm3(runNormal([v3(0, 0, 0), v3(1, 1, 1), v3(2, 2, 2)]))).toBe(0);
    expect(norm3(runNormal([v3(1, 1, 1), v3(1, 1, 1), v3(1, 1, 1)]))).toBe(0);
  });

  it('the DRAWN ring is reordered non-crossing, and an already-good order is untouched', () => {
    expect(runRingOrder(square)).toEqual(square);
    const drawn = runRingOrder(bowtie);
    // consecutive corners of the drawn ring are edges of the square — never a diagonal
    for (let i = 0; i < drawn.length; i++) {
      const a = drawn[i];
      const b = drawn[(i + 1) % drawn.length];
      expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeCloseTo(1, 9);
    }
  });

  it("the 'face' patch draws a SIMPLE ring — the stated order would have drawn a bowtie", () => {
    // the scene's corners are PROJECTED (x, y), so the property to assert is the drawn one: the ring
    // does not cross itself. The same check on the STATED order fails, which is what gives this teeth.
    const cross = (o: P, a: P, b: P) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const segsCross = (a: P, b: P, c: P, d: P) =>
      cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0;
    const selfCrossing = (r: P[]) => segsCross(r[0], r[1], r[2], r[3]) || segsCross(r[1], r[2], r[3], r[0]);

    const { d } = build(["קובייה ABCDA'B'C'D'", "מישור BB'DD'"]);
    const r = resolve3(d.construction, 0);
    const scene = buildScene3(d.construction, r, HOME_CAMERA, { width: 640, height: 460 }, 1, { "BB'DD'": 'face' });
    const patch = scene.planes.find((p) => p.name === "BB'DD'");
    expect(patch?.corners).toHaveLength(4);
    expect(selfCrossing(patch!.corners)).toBe(false);

    // the same four corners in the order the student STATED them do cross — the reorder is load-bearing
    const byId = new Map(scene.points.map((p) => [p.id, { x: p.x, y: p.y }]));
    const stated = ['B', "B'", 'D', "D'"].map((id) => byId.get(id)!);
    expect(stated.every(Boolean)).toBe(true);
    expect(selfCrossing(stated)).toBe(true);
  });

});
