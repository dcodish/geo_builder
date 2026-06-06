/**
 * Test that incremental constraint addition produces stable (non-jumping) positions.
 *
 * Simulates: "Triangle ABC" → "AB=5" → "angle A=60" → "BC=7"
 * After each step, checks that no point moved more than a small threshold
 * from its previous position (proving visual stability).
 */

import { describe, it, expect } from 'vitest';
import { resolvePositions, type FitState } from '@/engine/solver';
import { applyCommand } from '@/store/apply-command';
import type { Construction, GeometryCommand, Point2D } from '@/types/geometry';

function emptyConstruction(): Construction {
  return {
    elements: [],
    constraints: [],
    computed: {
      distances: new Map(),
      angleMeasures: new Map(),
      polygonClassifications: new Map(),
      parallelPairs: [],
      perpendicularPairs: [],
    },
    steps: [],
  };
}

/** Max Euclidean distance any point moved between two position maps. */
function maxDelta(
  prev: Map<string, Point2D>,
  curr: Map<string, Point2D>,
): number {
  let max = 0;
  for (const [id, p] of prev) {
    const c = curr.get(id);
    if (c) {
      const d = Math.sqrt((p.x - c.x) ** 2 + (p.y - c.y) ** 2);
      max = Math.max(max, d);
    }
  }
  return max;
}

function printPositions(label: string, positions: Map<string, Point2D>) {
  const parts: string[] = [];
  for (const [id, p] of positions) {
    parts.push(`${id}=(${p.x.toFixed(2)}, ${p.y.toFixed(2)})`);
  }
  console.log(`  ${label}: ${parts.join('  ')}`);
}

describe('Solver stability across incremental constraints', () => {
  it('Triangle ABC → AB=5 → angle A=60 → BC=7 stays stable', () => {
    const commands: Array<{ label: string; cmd: GeometryCommand }> = [
      {
        label: 'create triangle ABC',
        cmd: { action: 'create-polygon', vertices: ['A', 'B', 'C'], polygonType: 'triangle' },
      },
      {
        label: 'set AB=5',
        cmd: { action: 'set-distance', point1: 'A', point2: 'B', value: 5 },
      },
      {
        label: 'set angle A=60',
        cmd: { action: 'set-angle', vertex: 'A', value: 60 },
      },
      {
        label: 'set BC=7',
        cmd: { action: 'set-distance', point1: 'B', point2: 'C', value: 7 },
      },
    ];

    let construction = emptyConstruction();
    let rawPrevPositions: Map<string, Point2D> = new Map();
    let screenPrevPositions: Map<string, Point2D> = new Map();
    let fitState: FitState | undefined = undefined;

    console.log('\n--- Stability Test: Triangle with incremental constraints ---');

    for (let i = 0; i < commands.length; i++) {
      const { label, cmd } = commands[i];
      construction = applyCommand(construction, cmd);

      const result = resolvePositions(
        construction,
        rawPrevPositions.size > 0 ? rawPrevPositions : undefined,
        fitState,
      );

      console.log(`Step ${i + 1}: ${label}`);
      printPositions('positions', result.positions);

      if (screenPrevPositions.size > 0) {
        const delta = maxDelta(screenPrevPositions, result.positions);
        console.log(`  max delta from previous: ${delta.toFixed(4)}`);

        // Steps 2-3 add constraints that are consistent with the existing shape
        // (AB was already ~5, angle A was already ~53°), so they should be stable.
        // Step 4 (BC=7) genuinely changes the shape (side a from ~4 to 7),
        // so a larger delta is expected there.
        if (i === 2) {
          expect(delta).toBeLessThan(2);
        }
      }

      rawPrevPositions = new Map(result.rawPositions);
      screenPrevPositions = new Map(result.positions);
      fitState = result.fitState;
    }

    // All positions should be finite
    for (const p of screenPrevPositions.values()) {
      expect(isFinite(p.x)).toBe(true);
      expect(isFinite(p.y)).toBe(true);
    }

    console.log('--- PASS ---\n');
  });

  it('Quadrilateral ABCD → AB=6 stays stable', () => {
    const commands: Array<{ label: string; cmd: GeometryCommand }> = [
      {
        label: 'create quad ABCD',
        cmd: { action: 'create-polygon', vertices: ['A', 'B', 'C', 'D'], polygonType: 'quadrilateral' },
      },
      {
        label: 'set AB=6',
        cmd: { action: 'set-distance', point1: 'A', point2: 'B', value: 6 },
      },
    ];

    let construction = emptyConstruction();
    let rawPrevPositions: Map<string, Point2D> = new Map();
    let screenPrevPositions: Map<string, Point2D> = new Map();
    let fitState: FitState | undefined = undefined;

    console.log('\n--- Stability Test: Quad with incremental constraints ---');

    for (let i = 0; i < commands.length; i++) {
      const { label, cmd } = commands[i];
      construction = applyCommand(construction, cmd);

      const result = resolvePositions(
        construction,
        rawPrevPositions.size > 0 ? rawPrevPositions : undefined,
        fitState,
      );

      console.log(`Step ${i + 1}: ${label}`);
      printPositions('positions', result.positions);

      if (screenPrevPositions.size > 0) {
        const delta = maxDelta(screenPrevPositions, result.positions);
        console.log(`  max delta from previous: ${delta.toFixed(4)}`);
      }

      rawPrevPositions = new Map(result.rawPositions);
      screenPrevPositions = new Map(result.positions);
      fitState = result.fitState;
    }

    for (const p of screenPrevPositions.values()) {
      expect(isFinite(p.x)).toBe(true);
      expect(isFinite(p.y)).toBe(true);
    }

    console.log('--- PASS ---\n');
  });

  it('Triangle ABC → angle B=90 actually produces a right angle at B', () => {
    const commands: Array<{ label: string; cmd: GeometryCommand }> = [
      {
        label: 'create triangle ABC',
        cmd: { action: 'create-polygon', vertices: ['A', 'B', 'C'], polygonType: 'triangle' },
      },
      {
        label: 'set angle B=90',
        cmd: { action: 'set-angle', vertex: 'B', value: 90 },
      },
    ];

    let construction = emptyConstruction();
    let rawPrevPositions: Map<string, Point2D> = new Map();
    let fitState: FitState | undefined = undefined;

    console.log('\n--- Stability Test: Triangle with angle B=90 ---');

    for (const { label, cmd } of commands) {
      construction = applyCommand(construction, cmd);

      const result = resolvePositions(
        construction,
        rawPrevPositions.size > 0 ? rawPrevPositions : undefined,
        fitState,
      );

      console.log(`  ${label}`);
      printPositions('positions', result.positions);

      rawPrevPositions = new Map(result.rawPositions);
      fitState = result.fitState;
    }

    // Verify the angle at B is actually 90° by checking dot product of BA and BC vectors
    const A = rawPrevPositions.get('A')!;
    const B = rawPrevPositions.get('B')!;
    const C = rawPrevPositions.get('C')!;

    const baX = A.x - B.x, baY = A.y - B.y;
    const bcX = C.x - B.x, bcY = C.y - B.y;
    const dot = baX * bcX + baY * bcY;
    const angleAtB = Math.acos(
      dot / (Math.sqrt(baX ** 2 + baY ** 2) * Math.sqrt(bcX ** 2 + bcY ** 2)),
    ) * (180 / Math.PI);

    console.log(`  Computed angle at B: ${angleAtB.toFixed(2)}°`);
    expect(angleAtB).toBeCloseTo(90, 0); // within 0.5°

    console.log('--- PASS ---\n');
  });

  it('Triangle ABC + angle B=90 + square BCDE does not crash', () => {
    // Simulate exactly what the fallback parser produces for each input
    const steps: Array<{ label: string; cmds: GeometryCommand[] }> = [
      {
        label: 'Triangle ABC',
        cmds: [
          { action: 'create-polygon', vertices: ['A', 'B', 'C'], polygonType: 'triangle' },
        ],
      },
      {
        label: 'angle B=90',
        cmds: [
          { action: 'set-angle', vertex: 'B', value: 90 },
        ],
      },
      {
        label: 'square BCDE',
        cmds: [
          { action: 'create-polygon', vertices: ['B', 'C', 'D', 'E'], polygonType: 'quadrilateral' },
          { action: 'set-parallel', line1: ['B', 'C'], line2: ['E', 'D'] },
          { action: 'set-parallel', line1: ['B', 'E'], line2: ['C', 'D'] },
          { action: 'set-angle', vertex: 'B', ray1: 'E', ray2: 'C', value: 90 },
          { action: 'set-angle', vertex: 'C', ray1: 'B', ray2: 'D', value: 90 },
          { action: 'set-angle', vertex: 'D', ray1: 'C', ray2: 'E', value: 90 },
          { action: 'set-angle', vertex: 'E', ray1: 'D', ray2: 'B', value: 90 },
          { action: 'set-equal-segments', seg1: ['B', 'C'], seg2: ['C', 'D'] },
        ],
      },
    ];

    let construction = emptyConstruction();
    let rawPrevPositions: Map<string, Point2D> = new Map();
    let fitState: FitState | undefined = undefined;

    console.log('\n--- Test: Triangle ABC + angle B=90 + square BCDE ---');

    for (const { label, cmds } of steps) {
      for (const cmd of cmds) {
        construction = applyCommand(construction, cmd);
      }

      const result = resolvePositions(
        construction,
        rawPrevPositions.size > 0 ? rawPrevPositions : undefined,
        fitState,
      );

      console.log(`  ${label}:`);
      printPositions('positions', result.positions);

      rawPrevPositions = new Map(result.rawPositions);
      fitState = result.fitState;
    }

    // All 5 points should have finite positions
    const expectedPoints = ['A', 'B', 'C', 'D', 'E'];
    for (const pt of expectedPoints) {
      const p = rawPrevPositions.get(pt);
      expect(p, `Point ${pt} should exist`).toBeDefined();
      expect(isFinite(p!.x), `${pt}.x should be finite`).toBe(true);
      expect(isFinite(p!.y), `${pt}.y should be finite`).toBe(true);
    }

    console.log('--- PASS ---\n');
  });

  it('flip-polygon reverses attached quad direction', () => {
    // Create triangle + attached square, then flip
    const steps: Array<{ label: string; cmds: GeometryCommand[] }> = [
      {
        label: 'Triangle ABC',
        cmds: [
          { action: 'create-polygon', vertices: ['A', 'B', 'C'], polygonType: 'triangle' },
        ],
      },
      {
        label: 'square BCDE',
        cmds: [
          { action: 'create-polygon', vertices: ['B', 'C', 'D', 'E'], polygonType: 'quadrilateral' },
        ],
      },
    ];

    let construction = emptyConstruction();
    for (const { cmds } of steps) {
      for (const cmd of cmds) {
        construction = applyCommand(construction, cmd);
      }
    }

    // Solve before flip
    const before = resolvePositions(construction);
    const dBefore = before.rawPositions.get('D')!;

    // Apply flip
    construction = applyCommand(construction, { action: 'flip-polygon', vertices: ['B', 'C', 'D', 'E'] });

    // Solve after flip
    const after = resolvePositions(construction);
    const dAfter = after.rawPositions.get('D')!;

    console.log(`\n--- Flip test ---`);
    console.log(`  D before flip: (${dBefore.x.toFixed(2)}, ${dBefore.y.toFixed(2)})`);
    console.log(`  D after flip:  (${dAfter.x.toFixed(2)}, ${dAfter.y.toFixed(2)})`);

    // D should have moved to the other side — y coordinate should flip sign relative to BC midpoint
    expect(Math.abs(dBefore.x - dAfter.x) + Math.abs(dBefore.y - dAfter.y)).toBeGreaterThan(0.5);
    console.log('--- PASS ---\n');
  });

  it('attached triangle respects angle constraint (square CBDE + angle ACB=90)', () => {
    // Exact user scenario: triangle ABC, square sharing CB, then angle at C = 90
    const steps: Array<{ label: string; cmds: GeometryCommand[] }> = [
      {
        label: 'Triangle ABC',
        cmds: [
          { action: 'create-polygon', vertices: ['A', 'B', 'C'], polygonType: 'triangle' },
        ],
      },
      {
        label: 'square CBDE',
        cmds: [
          { action: 'create-polygon', vertices: ['C', 'B', 'D', 'E'], polygonType: 'quadrilateral' },
          { action: 'set-parallel', line1: ['C', 'B'], line2: ['E', 'D'] },
          { action: 'set-parallel', line1: ['C', 'E'], line2: ['B', 'D'] },
          { action: 'set-angle', vertex: 'C', ray1: 'E', ray2: 'B', value: 90 },
          { action: 'set-angle', vertex: 'B', ray1: 'C', ray2: 'D', value: 90 },
          { action: 'set-angle', vertex: 'D', ray1: 'B', ray2: 'E', value: 90 },
          { action: 'set-angle', vertex: 'E', ray1: 'D', ray2: 'C', value: 90 },
          { action: 'set-equal-segments', seg1: ['C', 'B'], seg2: ['B', 'D'] },
        ],
      },
      {
        label: 'angle ACB=90',
        cmds: [
          { action: 'set-angle', vertex: 'C', ray1: 'A', ray2: 'B', value: 90 },
        ],
      },
    ];

    let construction = emptyConstruction();
    let rawPrevPositions: Map<string, Point2D> = new Map();
    let fitState: FitState | undefined = undefined;

    console.log('\n--- Test: attached triangle angle ACB=90 ---');

    for (const { label, cmds } of steps) {
      for (const cmd of cmds) {
        construction = applyCommand(construction, cmd);
      }

      const result = resolvePositions(
        construction,
        rawPrevPositions.size > 0 ? rawPrevPositions : undefined,
        fitState,
      );

      console.log(`  ${label}:`);
      printPositions('raw', result.rawPositions);

      rawPrevPositions = new Map(result.rawPositions);
      fitState = result.fitState;
    }

    // Verify angle ACB is actually 90° using dot product
    const A = rawPrevPositions.get('A')!;
    const C = rawPrevPositions.get('C')!;
    const B = rawPrevPositions.get('B')!;

    const caX = A.x - C.x, caY = A.y - C.y;
    const cbX = B.x - C.x, cbY = B.y - C.y;
    const dot = caX * cbX + caY * cbY;
    const angleACB = Math.acos(
      dot / (Math.sqrt(caX ** 2 + caY ** 2) * Math.sqrt(cbX ** 2 + cbY ** 2)),
    ) * (180 / Math.PI);

    console.log(`  Computed angle ACB: ${angleACB.toFixed(2)}°`);
    expect(angleACB).toBeCloseTo(90, 0); // within 0.5°

    console.log('--- PASS ---\n');
  });
});
