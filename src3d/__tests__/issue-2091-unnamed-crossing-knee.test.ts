/**
 * #2091 (ADR-3D-360) — a ⟂ between two segments that cross at a point the student never NAMED is a
 * relation, not a knee at rest (operator ruling 2026-10-14, card d14b-2091-knee A; ADR-W-118 B2; 2-D's
 * `angleMarkFor`). Driven through the store's real `submit` (the `decideSubmit3` gate) → `derive3` →
 * `rightAngles3`, the knee list `scene3` draws.
 *
 * Class reach: every spelling (⟂ ⊥ «מאונך ל-» «ניצב ל-» «הזווית בין … היא 90») and host (square, rhombus,
 * quad, cube, box, pyramid). Kept: a shared endpoint; a crossing the facts DEFINE («O נקודת חיתוך
 * האלכסונים»); every line/segment ⟂ plane; and — pinned until #2093 is ruled — two named vectors «u ⊥ v».
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { Construction3 } from '../engine/types';
import { dist3, type Vec3 } from '../engine/vec3';
import { namedVertexOf, rightAngles3 } from '../render/rightAngles';
import { derive3, useGeo3 } from '../store/store3';

const reset = () => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
};

/** The knees as the point ids they sit on (or `@x,y,z` for an unnamed vertex). */
function knees(steps: string[]): string[] {
  reset();
  for (const s of steps) useGeo3.getState().submit(s);
  const st = useGeo3.getState();
  expect(st.facts).toHaveLength(steps.length);
  const d = derive3(st.facts, st.seed);
  for (const f of st.facts) expect(d.status[f.id], `«${f.utterance}» → ${d.status[f.id]}`).toBe('ok');
  const pts = [...d.resolved.positions.values()];
  const c0 = pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length, z: a.z + p.z / pts.length }), { x: 0, y: 0, z: 0 });
  const radius = Math.max(...pts.map((p) => dist3(p, c0)), 1e-6);
  const at = (v: Vec3) => {
    const hit = [...d.resolved.positions].find(([, p]) => dist3(p, v) < 1e-6);
    return hit ? hit[0] : `@${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)}`;
  };
  return rightAngles3(d.construction, d.resolved, radius).map((m) => at(m.vertex)).sort();
}

describe('#2091 — no knee at rest at an unnamed crossing of two segments', () => {
  beforeEach(reset);

  const WITHDRAWN: { steps: string[]; expected: string[] }[] = [
    { steps: ['ריבוע ABCD', 'AC ⟂ BD'], expected: ['B'] }, // the square's own corner stays
    { steps: ['ריבוע ABCD', 'AC ⊥ BD'], expected: ['B'] },
    { steps: ['ריבוע ABCD', 'AC מאונך ל-BD'], expected: ['B'] },
    { steps: ['ריבוע ABCD', 'הזווית בין AC ל-BD היא 90'], expected: ['B'] },
    { steps: ['מעוין ABCD', 'AC ⟂ BD'], expected: [] },
    { steps: ['מרובע ABCD', 'AC ⟂ BD'], expected: [] },
    { steps: ['מרובע ABCD', 'AC ניצב ל-BD'], expected: [] },
    { steps: ["קובייה ABCDA'B'C'D'", 'AC ⟂ BD'], expected: [] },
    { steps: ["תיבה ABCDA'B'C'D'", 'AC ⟂ BD'], expected: [] },
    { steps: ['פירמידה SABCD', 'AC ⟂ BD'], expected: [] },
    // O is on AC by the facts, on BD only by the drawing — it names no crossing (2-D draws none)
    { steps: ['ריבוע ABCD', 'O אמצע AC', 'AC ⟂ BD'], expected: ['B'] },
  ];
  for (const { steps, expected } of WITHDRAWN) {
    it(`${steps.join(' · ')} → knees ${JSON.stringify(expected)}`, () => {
      expect(knees(steps)).toEqual(expected);
    });
  }

  it('a crossing the facts DEFINE keeps its knee: «O נקודת חיתוך האלכסונים» → a knee at O (#1946 ruling)', () => {
    expect(knees(['ריבוע ABCD', 'O נקודת חיתוך האלכסונים', 'AC ⟂ BD'])).toEqual(['B', 'O']);
  });

  it('a shared endpoint keeps its knee: «משולש ABC» · «AB ⟂ AC» → A', () => {
    expect(knees(['משולש ABC', 'AB ⟂ AC'])).toEqual(['A']);
  });

  it('line ⟂ plane marks are unchanged, including one at an unnamed crossing', () => {
    expect(knees(["קובייה ABCDA'B'C'D'", "AA' ⟂ מישור ABC"])).toEqual(['A']);
    const k = knees(["קובייה ABCDA'B'C'D'", "AC' ⟂ מישור A'BD"]);
    expect(k).toHaveLength(1);
    expect(k[0].startsWith('@')).toBe(true);
  });

  it('a skew ⟂ still draws nothing', () => {
    expect(knees(["קובייה ABCDA'B'C'D'", "A'C ⟂ BD"])).toEqual([]);
  });

  it('two named VECTORS «u ⊥ v» keep the crossing knee — pinned until #2093 is ruled', () => {
    const k = knees(["תיבה ABCDA'B'C'D'", 'נסמן: AC=u, BD=v', 'u ⊥ v']);
    expect(k).toHaveLength(1);
    expect(k[0].startsWith('@')).toBe(true);
  });
});

describe('#2091 — namedVertexOf reads definitions, never positions', () => {
  const withPoints = (pts: [string, unknown][]) => ({ points: new Map(pts) }) as unknown as Construction3;

  it('a shared endpoint is the named vertex, in any order', () => {
    expect(namedVertexOf({ a: 'A', b: 'B', c: 'C', d: 'A' }, withPoints([]))).toBe('A');
  });
  it('the same segment twice names nothing', () => {
    expect(namedVertexOf({ a: 'A', b: 'B', c: 'B', d: 'A' }, withPoints([]))).toBeNull();
  });
  it('a seg-cross point of exactly those two segments is named, either order and orientation', () => {
    const c = withPoints([['O', { kind: 'seg-cross', a1: 'D', b1: 'B', a2: 'A', b2: 'C' }]]);
    expect(namedVertexOf({ a: 'A', b: 'C', c: 'B', d: 'D' }, c)).toBe('O');
  });
  it('a seg-cross of other segments, or a midpoint on one of them, names nothing', () => {
    const c = withPoints([
      ['O', { kind: 'seg-cross', a1: 'A', b1: 'B', a2: 'C', b2: 'D' }],
      ['M', { kind: 'on-segment', a: 'A', b: 'C', t: 0.5 }],
    ]);
    expect(namedVertexOf({ a: 'A', b: 'C', c: 'B', d: 'D' }, c)).toBeNull();
  });
});
