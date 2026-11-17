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
import { constraintComponents, componentOf, partsOf, canonicalSeed, cleanSeed, seedKey, seedNumber, seedOfPart, seedPartsOf, sameSeed, withPartSeed } from '../components';
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

/**
 * #2796 (ADR-853) — THE INDEPENDENT PARTS OF A FIGURE. A part is solved, sampled and judged on its own; a figure of one
 * part is the construction itself, so every connected figure takes the path it always took.
 */
describe('#2796 — the independent parts (partsOf)', () => {
  const quads: Command[] = (['ABCD', 'EFGH', 'IJKL'] as const).map((n) => ({ type: 'square', ids: [...n] as [string, string, string, string] }));

  it('three separate squares are three parts, each holding its own vertices and keyed by its first object', () => {
    const parts = partsOf(run(quads));
    expect(parts.length).toBe(3);
    expect(parts.map((p) => ['A', 'E', 'I'].filter((v) => p.ids.has(v)))).toEqual([['A'], ['E'], ['I']]);
    for (const p of parts) expect(p.key).toBe(p.construction.objects[0].id);
  });

  it('a constraint that names two shapes joins them into one part («AB ∥ EF»: operator 2026-11-09, both may move)', () => {
    const c = run([...quads.slice(0, 2), { type: 'set-parallel', a: 'A', b: 'B', c: 'E', d: 'F' }]);
    expect(partsOf(c).length).toBe(1);
  });

  it('one part is the construction itself (bit-identical path), and a point on a side joins its shape', () => {
    const c = run([quads[0], { type: 'point-on-segment', id: 'P', a: 'A', b: 'B' }]);
    const parts = partsOf(c);
    expect(parts.length).toBe(1);
    expect(parts[0].construction).toBe(c);
  });

  it('a typed line that names two shapes links them, though nothing in the construction records it («שני מעגלים», ADR-815)', () => {
    const c = run(quads.slice(0, 2));
    expect(partsOf(c).length).toBe(2);
    expect(partsOf(c, [['A', 'B', 'C', 'D'], ['E', 'F', 'G', 'H']]).length).toBe(2);
    expect(partsOf(c, [['A', 'E']]).length).toBe(1);
  });

  it('a loose point rides with the first shape (it has nothing the configuration shapes on its own)', () => {
    const c = run([quads[0], { type: 'free-point', id: 'P', x: 9, y: 9 } as Command, quads[1]]);
    const parts = partsOf(c);
    expect(parts.length).toBe(2);
    expect(parts[0].ids.has('P')).toBe(true);
  });

  it('each part is solved on its own: adding a separate shape leaves an earlier part’s solve unchanged', () => {
    const two = run([{ type: 'trapezoid', ids: ['A', 'B', 'C', 'D'] } as Command, { type: 'set-distance', a: 'A', b: 'D', value: 3 }]);
    const e0 = evaluate(two);
    const more = run([{ type: 'trapezoid', ids: ['A', 'B', 'C', 'D'] } as Command, { type: 'set-distance', a: 'A', b: 'D', value: 3 }, { type: 'square', ids: ['E', 'F', 'G', 'H'] }, { type: 'set-distance', a: 'E', b: 'F', value: 2 }]);
    const e1 = evaluate(more);
    expect(e0.ok && e1.ok).toBe(true);
    if (!e0.ok || !e1.ok) return;
    for (const id of ['A', 'B', 'C', 'D']) {
      const p = e0.positions.get(id)!, q = e1.positions.get(id)!;
      expect(Math.hypot(p.x - q.x, p.y - q.y), id).toBeLessThanOrEqual(1e-9);
    }
  });
});

describe('#2796 — the per-part configuration (Seed)', () => {
  it('a plain number is every part at that number; an entry moves one part', () => {
    expect(seedOfPart(5, 'A')).toBe(5);
    const s = withPartSeed(5, 'E', 9);
    expect(s).toEqual({ seed: 5, parts: { E: 9 } });
    expect(seedOfPart(s, 'E')).toBe(9);
    expect(seedOfPart(s, 'A')).toBe(5);
    expect(seedNumber(s)).toBe(5);
  });
  it('canonical: an entry equal to the base is dropped, and none left is the plain number', () => {
    expect(canonicalSeed(5, { E: 5 })).toBe(5);
    expect(withPartSeed({ seed: 5, parts: { E: 9 } }, 'E', 5)).toBe(5);
    expect(seedKey(5)).toBe('5');
    expect(seedKey({ seed: 5, parts: { I: 2, E: 9 } })).toBe('5{E:9,I:2}');
    expect(sameSeed({ seed: 5, parts: { E: 9, I: 5 } }, { seed: 5, parts: { E: 9 } })).toBe(true);
  });
  it('read from outside: a malformed entry is dropped, never refused; seedParts round-trips', () => {
    expect(cleanSeed(3, { E: 'x', I: 2, '': 4, J: -1, K: 1.5 })).toEqual({ seed: 3, parts: { I: 2 } });
    expect(cleanSeed(3, [1, 2])).toBe(3);
    expect(cleanSeed(3, undefined)).toBe(3);
    const s = { seed: 3, parts: { I: 2 } };
    expect(cleanSeed(seedNumber(s), seedPartsOf(s))).toEqual(s);
    expect(seedPartsOf(3)).toBeUndefined();
  });
});
