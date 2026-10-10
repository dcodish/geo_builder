/**
 * #1971 + #1937 ([ADR-612](../../docs/06-decisions.md#adr-612), ADR-W-124) — AN OFF-INK CONSTRUCTION POINT GETS ITS
 * CARRYING LINE EXTENDED, DASHED, TO MEET IT.
 *
 * Measured at pickup (origin/main e0f4260c, `driveThroughGate` → `replay` → `buildScene`): «טרפז ABCD» · «AE גובה»
 * put E at (0, 4) while DC runs D(1,4) → C(4.6,4), and nothing joined E to the side. The operator, 2026-10-10:
 * *"any construction point that lands off the drawn ink gets the carrying line extended, dashed, to meet it."*
 *
 * Every lock drives the real submit gate and reads the scene the canvas draws.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/parser/llm', () => ({ llmParse: async () => ({ built: [], dropped: [] }) }));

import { replay, useGeoStore } from '@/store/geoStore';
import { carryingLines, type Construction } from '@/engine';
import { buildScene } from '@/render/scene';
import { driveThroughGate } from './submit-gate';

type V = { x: number; y: number };
const d2 = (p: V, q: V) => Math.hypot(p.x - q.x, p.y - q.y);

function play(lines: string[]) {
  const { facts, refused } = driveThroughGate(lines);
  expect(refused, 'every line is accepted').toEqual([]);
  const d = replay(facts, useGeoStore.getState().seed);
  return { d, scene: buildScene(d.construction, d.positions), at: (id: string) => d.positions.get(id)! };
}

beforeEach(() => useGeoStore.getState().clear());

describe('#1971 — a height’s foot beyond its side', () => {
  it('the operator’s trapezoid: DC is extended, dashed, from D out to E', () => {
    const { scene, at } = play(['טרפז ABCD', 'AE גובה']);
    expect(scene.extensions).toHaveLength(1);
    expect(d2(scene.extensions[0].a, at('D'))).toBeLessThan(1e-6);
    expect(d2(scene.extensions[0].b, at('E'))).toBeLessThan(1e-6);
  });

  it('the class: an obtuse triangle’s height lands beyond B, and BC is extended out to it', () => {
    const { scene, at } = play(['משולש ABC', 'זווית B = 120', 'AD גובה']);
    expect(scene.extensions).toHaveLength(1);
    expect(d2(scene.extensions[0].a, at('B'))).toBeLessThan(1e-6);
    expect(d2(scene.extensions[0].b, at('D'))).toBeLessThan(1e-6);
  });

  it('a foot ON its side is unchanged — no extension', () => {
    const { scene } = play(['משולש שווה צלעות ABC', 'AD גובה']);
    expect(scene.extensions).toEqual([]);
  });

  it('a point the drawn ink already reaches gets nothing — «E על המשך AB» draws BE itself', () => {
    const { scene } = play(['קטע AB', 'E על המשך AB']);
    expect(scene.extensions).toEqual([]);
  });

  it('the convex diagonal meet is unchanged — 2-D’s reference figure for #1937', () => {
    const { scene } = play(['מרובע ABCD', 'אלכסוני המרובע נפגשים בנקודה O']);
    expect(scene.extensions).toEqual([]);
  });

  it('the extension follows the configuration: never drawn where the point is on its side', () => {
    // A free trapezoid: whichever seed is shown, a stretch exists exactly when E is beyond DC.
    const { facts } = driveThroughGate(['טרפז ABCD', 'AE גובה']);
    for (let seed = 0; seed < 6; seed++) {
      const d = replay(facts, seed);
      const [D, C, E] = ['D', 'C', 'E'].map((id) => d.positions.get(id)!);
      const t = ((C.x - D.x) * (E.x - D.x) + (C.y - D.y) * (E.y - D.y)) / d2(C, D) ** 2;
      const ext = buildScene(d.construction, d.positions).extensions;
      expect(ext.length, `seed ${seed}`).toBe(t < -1e-6 || t > 1 + 1e-6 ? 1 : 0);
    }
  });
});

describe('carryingLines — which lines a 2-D point is DEFINED to lie on', () => {
  const c = (objects: Construction['objects']): Construction => ({ objects }) as Construction;

  it('a foot, a segment point and a two-line crossing name their lines; a shape vertex names none', () => {
    expect(
      carryingLines(
        c([
          { kind: 'foot', id: 'E', from: 'A', a: 'D', b: 'C' },
          { kind: 'on-segment', id: 'G', a: 'A', b: 'D', t: 0.5 },
          { kind: 'line-line-intersection', id: 'O', a: 'A', b: 'C', c: 'B', d: 'D' },
          { kind: 'free-point', id: 'A', x: 0, y: 0 },
        ] as Construction['objects']),
      ),
    ).toEqual([
      { id: 'E', a: 'D', b: 'C' },
      { id: 'G', a: 'A', b: 'D' },
      { id: 'O', a: 'A', b: 'C' },
      { id: 'O', a: 'B', b: 'D' },
    ]);
  });

  it('a crossing of LINE objects reads a line through two points, and skips a line named otherwise', () => {
    expect(
      carryingLines(
        c([
          { kind: 'line', id: 'l1', spec: { via: 'through', a: 'A', b: 'B' } },
          { kind: 'line', id: 'l2', spec: { via: 'bisector', vertex: 'A', p: 'B', q: 'C' } },
          { kind: 'line-intersection', id: 'P', line1: 'l1', line2: 'l2' },
        ] as Construction['objects']),
      ),
    ).toEqual([{ id: 'P', a: 'A', b: 'B' }]);
  });
});
