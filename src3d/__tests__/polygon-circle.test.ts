/**
 * #442 (ADR-3D-112): a circle INSCRIBED IN / CIRCUMSCRIBED ABOUT a polygon, in R³.
 *
 * Operator, 2026-08-08: "I still want to be able to have מעגל חוסם וחסום in the 3d tool." The capability
 * half of #440, where the parse SILENTLY DROPPED the circle: every inscription phrasing committed a bare
 * triangle byte-identical to `משולש ABC`, and on a pyramid (the operator's real context, ABC being the
 * base) it added a green step row that changed nothing at all.
 *
 * Roles are assigned by the CONTAINER MARKER — the noun carrying ב / "in" — never by word order
 * ([ADR-245](docs/06-decisions.md#adr-245) ported verbatim, because 2-D's order test silently built the
 * CONVERSE figure in production for months). That is also what settles the operator's own mixed phrasing
 * `משולש ABC חוסם במעגל`: circumscribe VERB, but the ב marker sits on מעגל, so the circle contains.
 *
 * Everything here is asserted GEOMETRICALLY on the resolved figure — a circumcircle by every vertex being
 * equidistant from the centre and coplanar with it, an incircle by being TANGENT to all three sides —
 * never by "a circle3 command was emitted".
 */
import { describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { cross3, dot3, norm3, sub3, type Vec3 } from '../engine/vec3';
import { buildScene3 } from '../render/scene3';
import { HOME_CAMERA } from '../render/camera';

function build(lines: string[], seed = 0) {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
  for (const l of lines) useGeo3.getState().submit(l);
  const st = useGeo3.getState();
  const d = derive3(st.facts, seed);
  return { st, d, circles: d.resolved?.circles3 ?? [], pos: d.positions };
}

/** Distance from a point to the infinite line through a,b — an incircle's tangency test. */
const distToLine = (p: Vec3, a: Vec3, b: Vec3) => norm3(cross3(sub3(p, a), sub3(b, a))) / norm3(sub3(b, a));
const distTo = (p: Vec3, q: Vec3) => norm3(sub3(p, q));

const SEEDS = [0, 1, 2, 3];

describe('#442 — a CIRCUMSCRIBED circle passes through every vertex', () => {
  it.each([
    ['inscribed-in form', ['משולש ABC', 'משולש ABC חסום במעגל']],
    ['the operator mixed marker — ב wins over the verb', ['משולש ABC', 'משולש ABC חוסם במעגל']],
    ['circumscribes form', ['משולש ABC', 'מעגל חוסם את משולש ABC']],
    ['English', ['triangle ABC', 'triangle ABC inscribed in a circle']],
  ])('%s', (_label, lines) => {
    for (const seed of SEEDS) {
      const { st, circles, pos } = build(lines, seed);
      expect(st.lastError).toBeNull();
      expect(circles).toHaveLength(1);
      const k = circles[0];
      for (const id of ['A', 'B', 'C']) expect(distTo(pos.get(id)!, k.center)).toBeCloseTo(k.radius, 6);
      // and the circle lies in the triangle's OWN plane — every vertex is on the circle's plane
      for (const id of ['A', 'B', 'C']) expect(dot3(k.normal, sub3(pos.get(id)!, k.center))).toBeCloseTo(0, 6);
    }
  });
});

describe('#442 — an INSCRIBED circle is tangent to every side', () => {
  it.each([
    ['circle-in-polygon form', ['משולש ABC', 'מעגל חסום במשולש ABC']],
    ['triangle circumscribes form', ['משולש ABC', 'משולש ABC חוסם מעגל']],
    ['English', ['triangle ABC', 'circle inscribed in triangle ABC']],
  ])('%s', (_label, lines) => {
    for (const seed of SEEDS) {
      const { st, circles, pos } = build(lines, seed);
      expect(st.lastError).toBeNull();
      expect(circles).toHaveLength(1);
      const k = circles[0];
      const [A, B, C] = ['A', 'B', 'C'].map((i) => pos.get(i)!);
      // tangent to all three sides: the ⟂ distance from the centre to each side IS the radius
      for (const [p, q] of [[A, B], [B, C], [C, A]] as [Vec3, Vec3][])
        expect(distToLine(k.center, p, q)).toBeCloseTo(k.radius, 6);
      // strictly inside — an incircle is smaller than the circumcircle it sits in
      for (const v of [A, B, C]) expect(distTo(v, k.center)).toBeGreaterThan(k.radius);
    }
  });
});

describe('#442 — the ring may be a SOLID FACE (the operator context)', () => {
  it('circumscribes a pyramid BASE — the reported sequence', () => {
    const { st, circles, pos } = build(['פירמידה עם בסיס משולש ישר זווית', 'מעגל חוסם את משולש ABC']);
    expect(st.lastError).toBeNull();
    expect(circles).toHaveLength(1);
    const k = circles[0];
    for (const id of ['A', 'B', 'C']) expect(distTo(pos.get(id)!, k.center)).toBeCloseTo(k.radius, 6);
    // the apex D is NOT on the circle — the statement is about the base ring only
    expect(Math.abs(distTo(pos.get('D')!, k.center) - k.radius)).toBeGreaterThan(1e-6);
  });

  it('the pyramid is still there — the circle is added, nothing is re-declared (M1)', () => {
    const { d } = build(['פירמידה עם בסיס משולש ישר זווית', 'מעגל חוסם את משולש ABC']);
    const solids = d.construction.solids.map((s: { kind: string }) => s.kind);
    expect(solids).toEqual(['tetra']);
  });
});

describe('#442 — honesty', () => {
  it('a quadrilateral incircle is REFUSED, never a best-fit circle tangent to nothing', () => {
    const { st, circles } = build(['מרובע ABCD', 'מעגל חסום במרובע ABCD']);
    expect(st.lastError).toEqual({ code: 'incircle-needs-triangle' });
    expect(circles).toHaveLength(0);
  });

  it('a named circle keeps its letter', () => {
    const { circles } = build(['משולש ABC', 'משולש ABC חסום במעגל O']);
    expect(circles[0]?.id).toBe('circle-O');
  });

  it('the circle is a genuine object, not a no-op step (the #440 defect)', () => {
    // pre-fix this committed a step row and changed nothing: no circle, no error
    const before = build(['משולש ABC']);
    const after = build(['משולש ABC', 'משולש ABC חסום במעגל']);
    expect(before.circles).toHaveLength(0);
    expect(after.circles).toHaveLength(1);
    expect(after.st.facts.length).toBeGreaterThan(before.st.facts.length);
  });
});

describe('#442 — the circle is DRAWN', () => {
  it('adds exactly one sampled outline to the scene', () => {
    // the whole point of the feature: a statement that produced no ink at all now produces the circle
    const sceneOf = (lines: string[]) => {
      const { d } = build(lines);
      const sc = buildScene3(d.construction, d.resolved, HOME_CAMERA, { width: 800, height: 600 });
      return (sc.curves ?? []).filter((c) => c.pts.length > 20).length; // a sampled circle, not an edge
    };
    expect(sceneOf(['פירמידה עם בסיס משולש ישר זווית'])).toBe(0);
    expect(sceneOf(['פירמידה עם בסיס משולש ישר זווית', 'מעגל חוסם את משולש ABC'])).toBe(1);
  });
});
