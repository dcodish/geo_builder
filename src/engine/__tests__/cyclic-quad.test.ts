/**
 * Cyclic quadrilateral — "מרובע ABCD בר חסימה (במעגל)" / "cyclic quadrilateral
 * ABCD". A common bagrut given: the quad's vertices are concyclic, so opposite
 * angles sum to 180°, but the circle itself is NOT drawn (a `hidden` circle that
 * only constrains the vertices). Contrast "חסום במעגל" (inscribed), which draws it.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '@/parser';
import { build } from '@/engine';
import { buildScene } from '@/render/scene';

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
/** Interior angle (degrees) at `b` in the corner a–b–c. */
const angleAt = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) => {
  const u = { x: a.x - b.x, y: a.y - b.y };
  const v = { x: c.x - b.x, y: c.y - b.y };
  const cos = (u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y));
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
};

const buildFrom = (u: string) => {
  const r = parse(u);
  if (!r.ok) throw new Error(`not handled: ${u}`);
  return { commands: r.commands, ...build(r.commands) };
};

describe('cyclic quadrilateral (בר חסימה) — concyclic, circle not drawn', () => {
  for (const u of ['מרובע ABCD בר חסימה במעגל', 'cyclic quadrilateral ABCD', 'quadrilateral ABCD inscribable in a circle']) {
    it(`"${u}" builds a concyclic quad with opposite angles summing to 180°`, () => {
      const { commands, construction, positions } = buildFrom(u);

      // The circle is present (it constrains the vertices) but flagged hidden.
      const circle = commands.find((c) => c.type === 'circle') as { hidden?: boolean } | undefined;
      expect(circle?.hidden).toBe(true);

      // The four vertices are concyclic: equidistant from the (hidden) centre.
      const [A, B, C, D] = ['A', 'B', 'C', 'D'].map((id) => positions.get(id)!);
      const O = positions.get('O')!; // auto-named centre
      const radii = [A, B, C, D].map((p) => dist(O, p));
      for (const ri of radii) expect(ri).toBeCloseTo(radii[0], 6);

      // …hence opposite interior angles sum to 180° (the cyclic-quad theorem).
      expect(angleAt(D, A, B) + angleAt(B, C, D)).toBeCloseTo(180, 4);
      expect(angleAt(A, B, C) + angleAt(C, D, A)).toBeCloseTo(180, 4);

      // The circle is NOT rendered; the quadrilateral is.
      const scene = buildScene(construction, positions);
      expect(scene.circles).toHaveLength(0);
      expect(scene.polygons).toHaveLength(1);
    });
  }

  it('"מרובע ABCD חסום במעגל" (inscribed) still DRAWS the circle', () => {
    const { commands, construction, positions } = buildFrom('מרובע ABCD חסום במעגל');
    const circle = commands.find((c) => c.type === 'circle') as { hidden?: boolean };
    expect(circle.hidden).toBeUndefined();
    expect(buildScene(construction, positions).circles).toHaveLength(1);
  });
});

describe('a diameter stated on a cyclic quad reshapes the whole quad (stays convex)', () => {
  it('"AD is a diameter" → A,D antipodal and all four vertices stay spread (no collapsed corner)', () => {
    const r = parse('מרובע ABCD בר חסימה במעגל');
    if (!r.ok) throw new Error('cyclic quad did not parse');
    const circle = r.commands.find((c) => c.type === 'circle') as { id: string };
    // Apply the diameter on two vertices of the cyclic quad (the bug: it shoved A onto B).
    const { construction, positions } = build([...r.commands, { type: 'diameter', id1: 'A', id2: 'D', circle: circle.id }]);
    const O = positions.get('O')!;
    const pts = ['A', 'B', 'C', 'D'].map((id) => positions.get(id)!);
    const ang = (p: { x: number; y: number }) => Math.atan2(p.y - O.y, p.x - O.x);

    // AD is now a diameter: A and D antipodal (∠AOD = 180°).
    const aod = Math.abs(ang(pts[0]) - ang(pts[3]));
    expect(Math.min(aod, 2 * Math.PI - aod)).toBeCloseTo(Math.PI, 4);

    // …and no two vertices collapsed together — every adjacent angular gap is wide
    // (the old behaviour put A ~10° from B). All four remain on the circle.
    const sorted = pts.map(ang).map((a) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)).sort((x, y) => x - y);
    for (let i = 0; i < 4; i++) {
      const gap = (sorted[(i + 1) % 4] - sorted[i] + 2 * Math.PI) % (2 * Math.PI);
      expect(gap).toBeGreaterThan((20 * Math.PI) / 180); // ≥ 20° apart — a real quad, not a sliver
    }
    for (const p of pts) expect(Math.hypot(p.x - O.x, p.y - O.y)).toBeCloseTo(5, 6);

    // The diameter segment AD is present exactly once (no duplicate), circle still hidden.
    const scene = buildScene(construction, positions);
    expect(scene.segments.filter((s) => s.id === 'seg-AD')).toHaveLength(1);
    expect(scene.circles).toHaveLength(0);
  });
});
