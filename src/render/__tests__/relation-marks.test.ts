/**
 * scene.relationMarks — maps a RelationsResult + positions into world-space tick/arc marks (ADR-134).
 * The equality-class INDEX drives the tick/arc count (class 0 → 1, class 1 → 2, …), and a missing/degenerate
 * endpoint is skipped rather than drawn at a bogus position.
 */
import { describe, it, expect } from 'vitest';
import { relationMarks, relationAt, relationsForPick } from '../scene';
import type { RelationsResult } from '@/engine';
import type { Id, Vec } from '@/engine';

const pos = (entries: [Id, [number, number]][]): Map<Id, Vec> =>
  new Map(entries.map(([id, [x, y]]) => [id, { x, y }]));

describe('relationMarks', () => {
  it('first equal-segment class → 1 tick each; second class → 2 ticks each', () => {
    const rel: RelationsResult = {
      equalSegments: [
        [['A', 'B'], ['C', 'D']], // class 0 → count 1
        [['E', 'F']], // class 1 → count 2 (single member is fine here; the engine only emits ≥2, this just tests counts)
      ],
      equalAngles: [],
      definiteAngles: [],
      definiteLengths: [],
      samplesUsed: 4,
    };
    const p = pos([['A', [0, 0]], ['B', [2, 0]], ['C', [0, 1]], ['D', [2, 1]], ['E', [0, 2]], ['F', [2, 2]]]);
    const m = relationMarks(rel, p);
    expect(m.ticks.map((t) => t.count)).toEqual([1, 1, 2]); // AB:1, CD:1, EF:2
    // the AB tick carries AB's endpoints (so the renderer can place the hatch at its midpoint)
    expect(m.ticks[0].a).toEqual({ x: 0, y: 0 });
    expect(m.ticks[0].b).toEqual({ x: 2, y: 0 });
  });

  it('equal-angle class index drives the arc count', () => {
    const rel: RelationsResult = {
      equalSegments: [],
      equalAngles: [[{ vertex: 'B', a: 'A', b: 'C' }, { vertex: 'D', a: 'C', b: 'E' }]],
      definiteAngles: [],
      definiteLengths: [],
      samplesUsed: 4,
    };
    const p = pos([['A', [1, 0]], ['B', [0, 0]], ['C', [0, 1]], ['D', [2, 0]], ['E', [3, 0]]]);
    const m = relationMarks(rel, p);
    expect(m.angles.map((a) => a.count)).toEqual([1, 1]);
    expect(m.angles[0].vertex).toEqual({ x: 0, y: 0 }); // B's position
  });

  it('a definitive angle becomes a value label (formatted with the degree sign)', () => {
    const rel: RelationsResult = {
      equalSegments: [],
      equalAngles: [],
      definiteAngles: [{ vertex: 'B', a: 'A', b: 'C', valueDeg: 60.0000001 }],
      definiteLengths: [],
      samplesUsed: 8,
    };
    const p = pos([['A', [1, 0]], ['B', [0, 0]], ['C', [0, 1]]]);
    const m = relationMarks(rel, p);
    expect(m.values.map((v) => v.text)).toEqual(['60°']); // rounded to the integer
    expect(m.values[0].vertex).toEqual({ x: 0, y: 0 });
  });

  it('a forced 90° becomes a right-angle SQUARE (the "knee"), NOT a "90°" value label (operator request)', () => {
    const rel: RelationsResult = {
      equalSegments: [],
      equalAngles: [],
      definiteAngles: [{ vertex: 'B', a: 'A', b: 'C', valueDeg: 90.00001 }],
      definiteLengths: [],
      samplesUsed: 8,
    };
    const p = pos([['A', [1, 0]], ['B', [0, 0]], ['C', [0, 1]]]);
    const m = relationMarks(rel, p);
    expect(m.values, 'no "90°" text').toEqual([]);
    expect(m.rightAngles, 'a right-angle square instead').toHaveLength(1);
    expect(m.rightAngles[0].right).toBe(true);
    expect(m.rightAngles[0].vertex).toEqual({ x: 0, y: 0 });
  });

  it('drops a COMPOSITE angle value (the sum of finer definite parts at the same vertex)', () => {
    // at B: ∠ABC = 22.5, ∠CBD = 45, and the total ∠ABD = 67.5 — show only the parts, not the total
    const rel: RelationsResult = {
      equalSegments: [],
      equalAngles: [],
      definiteAngles: [
        { vertex: 'B', a: 'A', b: 'C', valueDeg: 22.5 },
        { vertex: 'B', a: 'C', b: 'D', valueDeg: 45 },
        { vertex: 'B', a: 'A', b: 'D', valueDeg: 67.5 }, // = 22.5 + 45 → redundant
      ],
      definiteLengths: [],
      samplesUsed: 8,
    };
    const p = pos([['A', [1, 0]], ['B', [0, 0]], ['C', [1, 1]], ['D', [0, 1]]]);
    const m = relationMarks(rel, p);
    expect(m.values.map((v) => v.text).sort()).toEqual(['22.5°', '45°']); // 67.5° suppressed
  });

  it('draws a corner value ONCE even when named through two collinear points (∠AFD == ∠GFH ⇒ one "60°")', () => {
    // F's two forced 60° angles are the SAME wedge: H lies on ray F→A, G lies on ray F→D (as at a rhombus
    // vertex whose edges run through crossings). Two "60°" labels would read as clutter / a mistake — one wedge,
    // one value (ADR-167 Am.).
    const rel: RelationsResult = {
      equalSegments: [],
      equalAngles: [],
      definiteAngles: [
        { vertex: 'F', a: 'A', b: 'D', valueDeg: 60 }, // rays F→A (0°) and F→D (60°)
        { vertex: 'F', a: 'G', b: 'H', valueDeg: 60 }, // F→G (=60°, G on FD) and F→H (=0°, H on FA) — same wedge
      ],
      definiteLengths: [],
      samplesUsed: 8,
    };
    const p = pos([['F', [0, 0]], ['A', [1, 0]], ['H', [2, 0]], ['D', [0.5, 0.8660254]], ['G', [1, 1.7320508]]]);
    const m = relationMarks(rel, p);
    expect(m.values.map((v) => v.text)).toEqual(['60°']); // ONE label, not "60° 60°"
  });

  it('skips a segment with a missing or coincident endpoint', () => {
    const rel: RelationsResult = {
      equalSegments: [[['A', 'B'], ['C', 'D']]],
      equalAngles: [],
      definiteAngles: [],
      definiteLengths: [],
      samplesUsed: 1,
    };
    const p = pos([['A', [0, 0]], ['B', [0, 0]] /* coincident → degenerate */, ['C', [0, 0]] /* D missing */]);
    const m = relationMarks(rel, p);
    expect(m.ticks).toEqual([]); // AB degenerate, CD missing D → both skipped
  });

  it('a definite VALUE supersedes its equal-angle arc — no double-marking (ADR-134)', () => {
    // Both ∠ABX and ∠CBY are equal AND each a definite 30°. The two "30°" labels already convey equality,
    // so NO equal-arc is drawn (the operator's "DEC and ECB show twice as equal").
    const rel: RelationsResult = {
      equalSegments: [],
      equalAngles: [[{ vertex: 'B', a: 'A', b: 'X' }, { vertex: 'B', a: 'C', b: 'Y' }]],
      definiteAngles: [
        { vertex: 'B', a: 'A', b: 'X', valueDeg: 30 },
        { vertex: 'B', a: 'C', b: 'Y', valueDeg: 30 },
      ],
      definiteLengths: [],
      samplesUsed: 8,
    };
    const p = pos([['A', [1, 0]], ['X', [1, 1]], ['C', [-1, 0]], ['Y', [-1, 1]], ['B', [0, 0]]]);
    const m = relationMarks(rel, p);
    expect(m.values.map((v) => v.text)).toEqual(['30°', '30°']);
    expect(m.angles).toEqual([]); // the equal-arc is suppressed (both shown as values)
  });

  it('collapses two names of the SAME wedge in one class to ONE arc (inscribed shape at a shared vertex)', () => {
    // At B: ∠ABC and ∠DBF are the SAME physical wedge — F lies on BA (both to the left) and D on BC (both up).
    // The class {∠ABC, ∠DBF, ∠DEF} is the rhombus BDEF's ∠B = ∠E; B must draw ONE arc, not two stacked rings.
    const rel: RelationsResult = {
      equalSegments: [],
      equalAngles: [[{ vertex: 'B', a: 'A', b: 'C' }, { vertex: 'B', a: 'D', b: 'F' }, { vertex: 'E', a: 'D', b: 'F' }]],
      definiteAngles: [],
      definiteLengths: [],
      samplesUsed: 8,
    };
    // B at origin; A and F both to the left (same ray B→A ≈ B→F), C and D both up-left (same ray B→C ≈ B→D).
    const p = pos([['B', [0, 0]], ['A', [-6, 0]], ['F', [-3, 0]], ['C', [-4, 4]], ['D', [-2, 2]], ['E', [-3, 3]]]);
    const m = relationMarks(rel, p);
    // Two arcs total (one at B, one at E) — NOT three (the duplicate B-wedge collapsed).
    expect(m.angles).toHaveLength(2);
    const atB = m.angles.filter((a) => a.vertex.x === 0 && a.vertex.y === 0);
    expect(atB, 'exactly one arc at B').toHaveLength(1);
  });

  it('equal angles that are NOT definite still get arcs (the only equality signal)', () => {
    const rel: RelationsResult = {
      equalSegments: [],
      equalAngles: [[{ vertex: 'B', a: 'A', b: 'X' }, { vertex: 'D', a: 'C', b: 'Y' }]],
      definiteAngles: [], // they float (e.g. isosceles base angles) → arcs are the only way to show equality
      definiteLengths: [],
      samplesUsed: 8,
    };
    const p = pos([['A', [1, 0]], ['X', [1, 1]], ['B', [0, 0]], ['C', [3, 0]], ['Y', [3, 1]], ['D', [2, 0]]]);
    const m = relationMarks(rel, p);
    expect(m.angles).toHaveLength(2); // both arcs kept
    expect(m.values).toEqual([]);
  });
});

describe('relationAt / relationsForPick — hover-to-focus picking (ADR-167 Am.)', () => {
  const rel: RelationsResult = {
    equalSegments: [
      [['A', 'B'], ['C', 'D']], // class 0
      [['E', 'F']], // class 1
    ],
    equalAngles: [[{ vertex: 'B', a: 'A', b: 'C' }]], // class 0: the +x→+y wedge at B
    definiteAngles: [],
    definiteLengths: [],
    samplesUsed: 8,
  };
  const p = pos([
    ['A', [0, 0]], ['B', [10, 0]], ['C', [0, 5]], ['D', [10, 5]], ['E', [0, 10]], ['F', [10, 10]],
  ]);

  it('picks the equal-length CLASS of the segment under the cursor', () => {
    // near AB (class 0) …
    expect(relationAt(rel, p, { x: 5, y: 0.3 }, 1, 2)).toEqual({ kind: 'segment', classIndex: 0 });
    // near EF (class 1) …
    expect(relationAt(rel, p, { x: 5, y: 10.2 }, 1, 2)).toEqual({ kind: 'segment', classIndex: 1 });
    // far from everything → nothing
    expect(relationAt(rel, p, { x: 5, y: 30 }, 1, 2)).toBeNull();
  });

  it('picks an equal-angle CLASS only when the cursor points INTO the wedge near the vertex', () => {
    const q = pos([['A', [1, 0]], ['B', [0, 0]], ['C', [0, 1]]]); // wedge from +x to +y at B
    const angleOnly: RelationsResult = { ...rel, equalSegments: [] };
    expect(relationAt(angleOnly, q, { x: 0.3, y: 0.3 }, 0.05, 2)).toEqual({ kind: 'angle', classIndex: 0 }); // inside wedge
    expect(relationAt(angleOnly, q, { x: -0.3, y: -0.3 }, 0.05, 2)).toBeNull(); // opposite quadrant → not the wedge
  });

  it('a NARROW wedge whose arms are in a segment class is still pickable on its bisector (issue #18)', () => {
    // ∠AVB = 18° at V, arms V–A and V–B both members of an equal-length class (the radii case).
    const deg = (d: number) => (d * Math.PI) / 180;
    const narrow = pos([
      ['V', [0, 0]],
      ['A', [10 * Math.cos(deg(0)), 10 * Math.sin(deg(0))]],
      ['B', [10 * Math.cos(deg(18)), 10 * Math.sin(deg(18))]],
    ]);
    const relNarrow: RelationsResult = {
      equalSegments: [[['V', 'A'], ['V', 'B']]],
      equalAngles: [[{ vertex: 'V', a: 'A', b: 'B' }]],
      definiteAngles: [],
      definiteLengths: [],
      samplesUsed: 8,
    };
    // Probe on the wedge BISECTOR at 60% of the vertex reach: inside the wedge, so with raw closer-wins
    // the arm (dist = 3·sin9° ≈ 0.47 < segReach 1) always stole the pick — the wedge was unhoverable.
    const probe = { x: 3 * Math.cos(deg(9)), y: 3 * Math.sin(deg(9)) };
    expect(relationAt(relNarrow, narrow, probe, 1, 5)).toEqual({ kind: 'angle', classIndex: 0 });
    // The arm is still pickable ALONG ITS FAR BODY (outside the wedge's vertex reach)…
    expect(relationAt(relNarrow, narrow, { x: 8, y: -0.3 }, 1, 5)).toEqual({ kind: 'segment', classIndex: 0 });
    // …and OUTSIDE the wedge (below the +x arm, near the vertex).
    expect(relationAt(relNarrow, narrow, { x: 3, y: -0.5 }, 1, 5)).toEqual({ kind: 'segment', classIndex: 0 });
    // A genuinely SEPARATE segment (not sharing the wedge's vertex) crossing near the probe still
    // competes closer-wins inside the wedge.
    const withCrosser: RelationsResult = {
      ...relNarrow,
      equalSegments: [...relNarrow.equalSegments, [['P', 'Q']]],
    };
    const crossPos = new Map(narrow);
    crossPos.set('P', { x: 3.05, y: -2 });
    crossPos.set('Q', { x: 3.05, y: 2 }); // a vertical segment through the wedge, right at the probe
    expect(relationAt(withCrosser, crossPos, { x: 3.05, y: 0.55 }, 1, 5)).toEqual({ kind: 'segment', classIndex: 1 });
  });

  it('relationsForPick narrows to just the hovered class (values kept for an angle pick)', () => {
    const seg = relationsForPick(rel, { kind: 'segment', classIndex: 1 });
    expect(seg.equalSegments).toEqual([[['E', 'F']]]);
    expect(seg.equalAngles).toEqual([]);
    const ang = relationsForPick({ ...rel, definiteAngles: [{ vertex: 'B', a: 'A', b: 'C', valueDeg: 60 }] }, { kind: 'angle', classIndex: 0 });
    expect(ang.equalSegments).toEqual([]);
    expect(ang.equalAngles).toHaveLength(1);
    expect(ang.definiteAngles).toHaveLength(1); // an angle pick keeps the definite values so a measure can show
  });
});
