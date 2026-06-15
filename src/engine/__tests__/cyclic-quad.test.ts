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

  // The shape word may be OMITTED ("ABCD חסום במעגל") — infer the polygon from the label
  // count so inscribed-vs-cyclic stays deterministic (drawn vs hidden), not an LLM guess.
  it.each([
    ['ABCD חסום במעגל', false, 1], // inscribed → circle DRAWN
    ['ABCD בר חסימה', true, 0], // cyclic → circle HIDDEN
    ['ABCD inscribed in a circle', false, 1],
    ['ABCD cyclic', true, 0],
  ])('"%s" parses deterministically (hidden=%s, drawn circles=%i) — no LLM', (utterance, hidden, drawn) => {
    const r = parse(utterance);
    expect(r.ok).toBe(true); // handled by the grammar, never falls through to the LLM
    if (!r.ok) return;
    const circle = r.commands.find((c) => c.type === 'circle') as { hidden?: boolean };
    expect(circle.hidden ?? false).toBe(hidden);
    const { construction, positions } = build(r.commands);
    expect(buildScene(construction, positions).circles).toHaveLength(drawn);
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

  it('the bagrut figure (cyclic quad, AD diameter, F on CB-extension ⟂, ∠BDA=24°) stays intact', () => {
    // textbook 4.ד: ABCD cyclic with AD a diameter; F on the continuation of CB with FB⊥FA;
    // then ∠BDA = 24°. The angle must NUDGE B, keeping the diameter, Thales, and F on the extension.
    const r = parse('מרובע ABCD בר חסימה במעגל');
    if (!r.ok) throw new Error('cyclic quad did not parse');
    const cid = (r.commands.find((c) => c.type === 'circle') as { id: string }).id;
    const { positions } = build([
      ...r.commands,
      { type: 'diameter', id1: 'A', id2: 'D', circle: cid },
      { type: 'point-on-segment', id: 'F', a: 'C', b: 'B', t: 1.3 }, // on the EXTENSION of CB (t>1)
      { type: 'segment', a: 'F', b: 'B' },
      { type: 'segment', a: 'F', b: 'A' },
      { type: 'set-perpendicular', a: 'F', b: 'B', c: 'F', d: 'A' },
      { type: 'set-angle', vertex: 'D', ray1: 'B', ray2: 'A', value: 24 },
    ]);
    const [A, B, C, D, F, O] = ['A', 'B', 'C', 'D', 'F', 'O'].map((id) => positions.get(id)!);

    // AD is STILL a diameter after the angle step (A, D antipodal about O).
    expect(O.x).toBeCloseTo((A.x + D.x) / 2, 6);
    expect(O.y).toBeCloseTo((A.y + D.y) / 2, 6);
    // ∠BDA = 24° (the given) and ∠ABD = 90° (Thales — the angle on a diameter).
    expect(angleAt(B, D, A)).toBeCloseTo(24, 2);
    expect(angleAt(A, B, D)).toBeCloseTo(90, 2);
    // F stayed on the CONTINUATION of CB (beyond B), not on segment CB, and ∠AFB = 90°.
    const t = ((F.x - C.x) * (B.x - C.x) + (F.y - C.y) * (B.y - C.y)) / ((B.x - C.x) ** 2 + (B.y - C.y) ** 2);
    expect(t).toBeGreaterThan(1);
    expect(angleAt(A, F, B)).toBeCloseTo(90, 2);
  });
});
