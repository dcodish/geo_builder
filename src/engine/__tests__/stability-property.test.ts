/**
 * Generated STABILITY property (hardening Pillar 4b / ADR-047 Tier C, decidable slice).
 *
 * The project's defining guarantee: adding information must not make the existing figure JUMP. The full
 * generated form (a CONSTRAINT-adding fact may move only its own driven/recruited DOFs) needs the engine
 * to report `movedAncestors` — a flagged sub-project, and constraint-adding stability is already guarded
 * by the fixed-seed `stability-snapshot.test.ts`. This covers the cleanly-DECIDABLE slice with no risk of
 * false positives: a purely ADDITIVE fact — one that introduces new points/segments but adds NO constraint
 * (a midpoint, a segment, a free point, a foot, an intersection) — must leave EVERY prior point exactly
 * where it was. A matrix of base figures × additive facts; any spurious perturbation (a re-composition
 * flip, a global re-placement) fails the property.
 */
import { describe, it, expect } from 'vitest';
import { parse } from '@/parser';
import { build } from '@/engine';
import type { Command, Vec } from '@/engine';

const cmds = (us: string[]): Command[] =>
  us.flatMap((u) => {
    const r = parse(u);
    if (!r.ok) throw new Error(`did not parse: "${u}"`);
    return r.commands as Command[];
  });

/** Base figures (each builds standalone) paired with ADDITIVE facts valid on them (no constraints). */
const MATRIX: { base: string[]; additive: string[] }[] = [
  { base: ['triangle ABC'], additive: ['M is the midpoint of AB', 'segment AC', 'point P on AB', 'F is the foot of the perpendicular from C to AB', 'median from A in ABC'] },
  { base: ['square ABCD'], additive: ['M is the midpoint of AB', 'segment AC', 'point P on BC'] },
  { base: ['rectangle ABCD'], additive: ['M is the midpoint of CD', 'segment BD'] },
  { base: ['parallelogram ABCD'], additive: ['M is the midpoint of AC', 'segment AC', 'point P on AD'] },
  { base: ['trapezoid ABCD'], additive: ['M is the midpoint of AB', 'segment AC'] },
  { base: ['triangle ABC inscribed in circle O'], additive: ['M is the midpoint of AB', 'segment AC', 'point P on BC'] },
  { base: ['circle centered at O radius 5', 'A is on circle O', 'B is on circle O'], additive: ['segment AB', 'M is the midpoint of AB'] },
];

describe('stability — a purely additive fact never perturbs the existing figure', () => {
  for (const { base, additive } of MATRIX) {
    const baseCmds = cmds(base);
    const before = build(baseCmds).positions;
    const baseIds = [...before.keys()];
    for (const add of additive) {
      it(`[${base.join(' / ')}] + "${add}" leaves all prior points fixed`, () => {
        const after = build([...baseCmds, ...cmds([add])]).positions;
        for (const id of baseIds) {
          const p = before.get(id)!;
          const q = after.get(id) as Vec | undefined;
          expect(q, `prior point ${id} still present after adding "${add}"`).toBeDefined();
          if (q) {
            const moved = Math.hypot(p.x - q.x, p.y - q.y);
            expect(moved, `prior point ${id} must not move (moved ${moved.toFixed(4)}) when adding "${add}"`).toBeLessThan(1e-9);
          }
        }
      });
    }
  }
});
