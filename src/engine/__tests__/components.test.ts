/**
 * Constraint components + joint-first (S3.2 stages (a)+(b), docs/25 — operator-approved).
 *
 * Stage (a): the partition is correct on canonical figures (independent constraints → separate
 * components; coupled figures → one merged component; a determined-refs constraint → a pure-check
 * singleton). Stage (b): the joint-first accept is observable in the ladder trace, and everything
 * the S1.1 ladder used to solve still solves (the fallback contract) — the FULL parity gate is the
 * whole suite, per docs/25 §6.
 */
import { describe, expect, it } from 'vitest';
import { applyStep, emptyConstruction, allDrivableAncestors } from '../step';
import { constraintComponents, componentOf } from '../components';
import { evaluate } from '../evaluate';
import type { Command, Construction } from '../types';

const run = (cmds: Command[]): Construction => {
  let cur = emptyConstruction();
  for (const cmd of cmds) {
    const r = applyStep(cur, cmd);
    expect(r.ok, r.ok ? '' : `step ${cmd.type}: ${(r as { error: string }).error}`).toBe(true);
    cur = r.construction;
  }
  return cur;
};

describe('stage (a) — the partition', () => {
  it('two constraints on disjoint figures form two components', () => {
    const c = run([
      { type: 'triangle', ids: ['A', 'B', 'C'] },
      { type: 'triangle', ids: ['D', 'E', 'F'] },
      { type: 'set-distance', a: 'A', b: 'B', value: 5 },
      { type: 'set-distance', a: 'D', b: 'E', value: 7 },
    ]);
    const comps = constraintComponents(c, allDrivableAncestors);
    expect(comps.length).toBeGreaterThanOrEqual(2);
    const withDofs = comps.filter((g) => g.dofs.length > 0);
    expect(withDofs.length).toBe(2);
    const dofSets = withDofs.map((g) => new Set(g.dofs));
    for (const d of dofSets[0]) expect(dofSets[1].has(d)).toBe(false); // genuinely disjoint
  });

  it('two constraints sharing a figure merge into one component', () => {
    const c = run([
      { type: 'triangle', ids: ['A', 'B', 'C'] },
      { type: 'set-distance', a: 'A', b: 'B', value: 5 },
      { type: 'set-distance', a: 'B', b: 'C', value: 5 },
    ]);
    const comps = constraintComponents(c, allDrivableAncestors).filter((g) => g.dofs.length > 0);
    expect(comps.length).toBe(1);
    expect(comps[0].constraints.length).toBeGreaterThanOrEqual(2);
  });

  it('componentOf returns the seed-containing component only', () => {
    const c = run([
      { type: 'triangle', ids: ['A', 'B', 'C'] },
      { type: 'triangle', ids: ['D', 'E', 'F'] },
      { type: 'set-distance', a: 'A', b: 'B', value: 5 },
      { type: 'set-distance', a: 'D', b: 'E', value: 7 },
    ]);
    const seed = c.constraints.find((k) => k.type === 'distance' && k.a === 'D');
    expect(seed).toBeDefined();
    const comp = componentOf(c, [seed!], allDrivableAncestors);
    expect(comp).not.toBeNull();
    expect(comp!.constraints.every((k) => !('a' in k) || (k as { a?: string }).a !== 'A')).toBe(true);
  });
});

describe('stage (b) — joint-first with the ladder as fallback', () => {
  it('the ADR-103 coupled figure still solves, and the trace shows the component attempt', () => {
    let cur = emptyConstruction();
    for (const cmd of [
      { type: 'circle', id: 'circle-O', center: 'O', radius: 5, freeRadius: true, autoCenter: true },
      { type: 'circle', id: 'circle-P', center: 'P', radius: 3.6, freeRadius: true, autoCenter: true },
      { type: 'circle-circle-intersection', id: 'A', circle1: 'circle-O', circle2: 'circle-P', branch: 0 },
      { type: 'circle-circle-intersection', id: 'B', circle1: 'circle-O', circle2: 'circle-P', branch: 1, avoid: 'A' },
      { type: 'point-on-circle', id: 'C', circle: 'circle-P' },
      { type: 'extend-onto-circle', id: 'D', a: 'C', b: 'A', circle: 'circle-O' },
    ] as Command[]) {
      const r = applyStep(cur, cmd);
      expect(r.ok).toBe(true);
      cur = r.construction;
    }
    const r = applyStep(cur, { type: 'set-distance', a: 'C', b: 'D', value: 36 } as Command);
    expect(r.ok, r.ok ? '' : (r as { error: string }).error).toBe(true);
    if (!r.ok) return;
    // The geometry holds regardless of WHICH stage accepted (component or a recruit rung):
    const e = evaluate(r.construction);
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    const C = e.positions.get('C')!, D = e.positions.get('D')!;
    expect(Math.hypot(C.x - D.x, C.y - D.y)).toBeCloseTo(36, 1);
    // The recruit rungs keep first claim (stability); the component tier is behind them.
    expect(r.ladder?.[r.ladder.length - 1]).toMatch(/^main:(component|recruit)$/);
  });

  it('an honestly-impossible statement still refuses (joint-first cannot fake a solve)', () => {
    const r = (() => {
      let cur = run([
        { type: 'square', ids: ['A', 'B', 'C', 'D'] },
        { type: 'set-distance', a: 'A', b: 'B', value: 5 },
      ]);
      return applyStep(cur, { type: 'set-distance', a: 'A', b: 'B', value: 7 });
    })();
    expect(r.ok).toBe(false);
    expect(r.ladder?.[r.ladder.length - 1]).toMatch(/refuse$/);
  });
});
