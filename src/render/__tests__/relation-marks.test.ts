/**
 * scene.relationMarks — maps a RelationsResult + positions into world-space tick/arc marks (ADR-134).
 * The equality-class INDEX drives the tick/arc count (class 0 → 1, class 1 → 2, …), and a missing/degenerate
 * endpoint is skipped rather than drawn at a bogus position.
 */
import { describe, it, expect } from 'vitest';
import { relationMarks } from '../scene';
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
      samplesUsed: 8,
    };
    const p = pos([['A', [1, 0]], ['B', [0, 0]], ['C', [1, 1]], ['D', [0, 1]]]);
    const m = relationMarks(rel, p);
    expect(m.values.map((v) => v.text).sort()).toEqual(['22.5°', '45°']); // 67.5° suppressed
  });

  it('skips a segment with a missing or coincident endpoint', () => {
    const rel: RelationsResult = {
      equalSegments: [[['A', 'B'], ['C', 'D']]],
      equalAngles: [],
      definiteAngles: [],
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
      samplesUsed: 8,
    };
    const p = pos([['A', [1, 0]], ['X', [1, 1]], ['C', [-1, 0]], ['Y', [-1, 1]], ['B', [0, 0]]]);
    const m = relationMarks(rel, p);
    expect(m.values.map((v) => v.text)).toEqual(['30°', '30°']);
    expect(m.angles).toEqual([]); // the equal-arc is suppressed (both shown as values)
  });

  it('equal angles that are NOT definite still get arcs (the only equality signal)', () => {
    const rel: RelationsResult = {
      equalSegments: [],
      equalAngles: [[{ vertex: 'B', a: 'A', b: 'X' }, { vertex: 'D', a: 'C', b: 'Y' }]],
      definiteAngles: [], // they float (e.g. isosceles base angles) → arcs are the only way to show equality
      samplesUsed: 8,
    };
    const p = pos([['A', [1, 0]], ['X', [1, 1]], ['B', [0, 0]], ['C', [3, 0]], ['Y', [3, 1]], ['D', [2, 0]]]);
    const m = relationMarks(rel, p);
    expect(m.angles).toHaveLength(2); // both arcs kept
    expect(m.values).toEqual([]);
  });
});
