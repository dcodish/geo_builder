/**
 * #542 (ADR-3D-185) — an angle between two OBJECTS draws an arc.
 *
 * The renderer knew ONE kind of angle (the #94 vertex triple), so a dihedral, a line↔plane angle and a
 * #523 named relation all measured and printed correctly in the panel while the canvas stayed silent.
 * The fix is one builder over an operand PAIR, not one per record kind (the ADR-3D-140 enumeration
 * mistake), so the unit tests below exercise the GEOMETRY once and the integration tests assert that
 * each record kind reaches it.
 */
import { describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { buildScene3, objectAngleArc } from '../render/scene3';
import { HOME_CAMERA } from '../render/camera';
import { dist3, dot3, norm3, sub3, v3, type Vec3 } from '../engine/vec3';

const VIEW = { width: 640, height: 460 };
const R = 2;
const NO_MATERIAL = { a: null, b: null };
/** the arc runs from focus+r·u1 to focus+r·u2, so the chord recovers the angle it subtends */
const subtended = (pts: Vec3[], r: number): number =>
  (2 * Math.asin(Math.min(1, dist3(pts[0], pts[pts.length - 1]) / (2 * r))) * 180) / Math.PI;

describe('#542 — the ONE arc builder, in world space', () => {
  // two planes through the x-axis: z = 0, and one tilted 60° about it
  const flat = { normal: v3(0, 0, 1), d: 0, point: v3(0, 0, 0) };
  const tilt60 = { normal: v3(0, -Math.sin((60 * Math.PI) / 180), Math.cos((60 * Math.PI) / 180)), d: 0 };

  it('plane × plane draws the DIHEDRAL, centred on the seam, at the stated angle', () => {
    const arc = objectAngleArc(flat, tilt60, { shared: [], toward: NO_MATERIAL, center: v3(0, 0, 0), r: R, deg: 60 })!;
    expect(arc).not.toBeNull();
    expect(subtended(arc.pts, R)).toBeCloseTo(60, 1);
    // every arc point sits at the radius from the seam (here the x-axis through the origin)
    for (const p of arc.pts) expect(norm3(v3(0, p.y, p.z))).toBeCloseTo(R, 6);
  });

  it('the SUPPLEMENT is drawn when that is what the student stated', () => {
    const arc = objectAngleArc(flat, tilt60, { shared: [], toward: NO_MATERIAL, center: v3(0, 0, 0), r: R, deg: 120 })!;
    expect(subtended(arc.pts, R)).toBeCloseTo(120, 1);
  });

  it('PARALLEL planes have no dihedral to draw', () => {
    const above = { normal: v3(0, 0, 1), d: -5 };
    expect(objectAngleArc(flat, above, { shared: [], toward: NO_MATERIAL, center: v3(0, 0, 0), r: R })).toBeNull();
  });

  it('line × plane draws from the line to its PROJECTION, centred at the crossing', () => {
    // a line through the origin rising at 45° above z = 0
    const line = { point: v3(0, 0, 0), dir: v3(1, 0, 1) };
    const arc = objectAngleArc(line, flat, { shared: [], toward: NO_MATERIAL, center: v3(0, 0, 0), r: R })!;
    expect(arc).not.toBeNull();
    expect(subtended(arc.pts, R)).toBeCloseTo(45, 1);
    for (const p of arc.pts) expect(dist3(p, v3(0, 0, 0))).toBeCloseTo(R, 6); // centred at the crossing
  });

  it('the pair may arrive either way round — the builder reads the operands, not the order', () => {
    const line = { point: v3(0, 0, 0), dir: v3(1, 0, 1) };
    const a = objectAngleArc(line, flat, { shared: [], toward: NO_MATERIAL, center: v3(0, 0, 0), r: R })!;
    const b = objectAngleArc(flat, line, { shared: [], toward: NO_MATERIAL, center: v3(0, 0, 0), r: R })!;
    expect(subtended(b.pts, R)).toBeCloseTo(subtended(a.pts, R), 6);
  });

  it('a line ⟂ its plane draws NO arc — #307 gives a right angle a KNEE, never a 90° arc', () => {
    const up = { point: v3(0, 0, 0), dir: v3(0, 0, 1) };
    expect(objectAngleArc(up, flat, { shared: [], toward: NO_MATERIAL, center: v3(0, 0, 0), r: R })).toBeNull();
  });

  it('a line PARALLEL to its plane draws no arc either', () => {
    const along = { point: v3(0, 0, 3), dir: v3(1, 0, 0) };
    expect(objectAngleArc(along, flat, { shared: [], toward: NO_MATERIAL, center: v3(0, 0, 0), r: R })).toBeNull();
  });

  it('`shared` puts the arc on the SHARED EDGE — a face↔base pair draws where a textbook draws it', () => {
    const onEdge = objectAngleArc(flat, tilt60, { shared: [v3(4, 0, 0)], toward: NO_MATERIAL, center: v3(0, 0, 0), r: R, deg: 60 })!;
    // the seam is the x-axis, so the shared point moves the focus along it to x = 4
    for (const p of onEdge.pts) expect(norm3(sub3(v3(p.x, 0, 0), v3(4, 0, 0)))).toBeCloseTo(0, 6);
  });

  it('`toward` puts the arc on the side the student can see', () => {
    const away = objectAngleArc(flat, tilt60, { shared: [], toward: { a: v3(0, -5, 0), b: null }, center: v3(0, 0, 0), r: R })!;
    const near = objectAngleArc(flat, tilt60, { shared: [], toward: { a: v3(0, 5, 0), b: null }, center: v3(0, 0, 0), r: R })!;
    expect(dot3(sub3(away.pts[0], v3(0, 0, 0)), v3(0, 1, 0))).toBeLessThan(0);
    expect(dot3(sub3(near.pts[0], v3(0, 0, 0)), v3(0, 1, 0))).toBeGreaterThan(0);
  });
});

describe('#542 — every angle record kind reaches the builder, and the gate holds', () => {
  const build = (lines: string[]) => {
    useGeo3.setState({ facts: [], seed: 0, lastError: null });
    useGeo3.temporal.getState().clear();
    for (const l of lines) useGeo3.getState().submit(l);
    const st = useGeo3.getState();
    for (const f of st.facts) expect(derive3(st.facts, st.seed).status[f.id], f.utterance).toBe('ok');
    const d = derive3(st.facts, st.seed);
    return {
      off: buildScene3(d.construction, d.resolved, HOME_CAMERA, VIEW, 1),
      on: buildScene3(d.construction, d.resolved, HOME_CAMERA, VIEW, 1, {}, true, true),
    };
  };

  // the operator's own four rows, from the #542 report
  it('a driven DIHEDRAL (plane-rel claim) — «הזווית בין הפאה SBC לבסיס ABCD היא 60»', () => {
    const { off, on } = build(['פירמידה SABCD שבסיסה ריבוע', 'הזווית בין הפאה SBC לבסיס ABCD היא 60']);
    expect(off.angles).toHaveLength(0);
    expect(on.angles.map((a) => a.text)).toEqual(['60°']);
  });

  it('a pinned LINE↔PLANE angle (line-rel claim) — «זווית בין ישר ℓ למישור π=45»', () => {
    const { off, on } = build(['מישור π', 'x=(1,2,3)+t(2,0,2)', 'זווית בין ישר ℓ למישור π=45']);
    expect(off.angles).toHaveLength(0);
    expect(on.angles.map((a) => a.text)).toEqual(['45°']);
  });

  it('a NAMED dihedral (relMark) draws the NAME and no number — the ADR-3D-030 knowledge rule', () => {
    const { off, on } = build(["קובייה ABCDA'B'C'D'", "הזווית בין המישור ABB'A' למישור ABCD היא α"]);
    expect(off.angles).toHaveLength(0);
    expect(on.angles.map((a) => a.text)).toEqual(['α']);
    expect(on.angles[0].text).not.toMatch(/\d/); // never a single-seed number
  });

  it('the VERTEX baseline is NOT gated — it draws with the panel shut, exactly as before', () => {
    const { off, on } = build(['פירמידה SABCD שבסיסה ריבוע', '∠SAB = α']);
    expect(off.angles.map((a) => a.text)).toEqual(['α']);
    expect(on.angles.map((a) => a.text)).toEqual(['α']);
  });

  it('a figure with no stated angle draws none either way', () => {
    const { off, on } = build(['פירמידה SABCD שבסיסה ריבוע']);
    expect(off.angles).toHaveLength(0);
    expect(on.angles).toHaveLength(0);
  });
});
