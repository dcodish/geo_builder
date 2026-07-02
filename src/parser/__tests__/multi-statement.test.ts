/**
 * Multiple independent GIVENS in one line ([docs/15-hardening-plan.md] C6 / PAR-2).
 *
 * A single relation rule half-parsed a comma/and-joined givens list and silently dropped the earlier
 * given: `distanceConstraint` anchors its value to `$` (kept only the trailing clause) and `angle` grabbed
 * only the first triple. Fix: a `multiStatement` splitter (runs right after `compoundSuchThat`) splits on a
 * top-level separator (`,` `;` `וגם` `and`) and parses each piece ALL-OR-NOTHING — but only when EVERY
 * piece carries a relation operator AND parses on its own, so construction utterances with commas are never
 * mangled.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '../parse';

const ctx = { points: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] } as const;
const cmds = (u: string, c: unknown = ctx) => {
  const r = parse(u, c as never);
  if (!r.ok) throw new Error(`did not parse: ${JSON.stringify(u)} → ${JSON.stringify(r)}`);
  return r.commands;
};
const dists = (c: ReturnType<typeof cmds>) =>
  c.filter((x) => x.type === 'set-distance').map((x) => {
    const d = x as { a: string; b: string; value: number };
    return `${[d.a, d.b].sort().join('')}=${d.value}`;
  }).sort();
const angleVals = (c: ReturnType<typeof cmds>) =>
  c.filter((x) => x.type === 'set-angle').map((x) => {
    const a = x as { vertex: string; value: number };
    return `${a.vertex}=${a.value}`;
  }).sort();

describe('PAR-2 — comma/and-joined givens: BOTH are kept', () => {
  it('"AB = 4, BC = 6" → both distances (the earlier one was dropped)', () => {
    const c = cmds('AB = 4, BC = 6');
    expect(dists(c)).toEqual(['AB=4', 'BC=6']);
  });

  it('English "and": "AB = 4 and BC = 6" → both distances', () => {
    expect(dists(cmds('AB = 4 and BC = 6'))).toEqual(['AB=4', 'BC=6']);
  });

  it('"זווית ABC = 40, זווית DEF = 60" → both angles (the first no longer wins alone)', () => {
    const c = cmds('זווית ABC = 40, זווית DEF = 60');
    expect(angleVals(c)).toEqual(['B=40', 'E=60']);
  });

  it('three givens: "AB = 4, BC = 6, CD = 8" → all three', () => {
    expect(dists(cmds('AB = 4, BC = 6, CD = 8'))).toEqual(['AB=4', 'BC=6', 'CD=8']);
  });

  it('mixed relations: "AB ⟂ CD and EF ∥ GH" → a ⟂ and a ∥', () => {
    const c = cmds('AB ⟂ CD and EF ∥ GH');
    expect(c.some((x) => x.type === 'set-perpendicular')).toBe(true);
    expect(c.some((x) => x.type === 'set-parallel')).toBe(true);
  });
});

describe('PAR-2 — the splitter does NOT mangle single statements that carry commas', () => {
  it('"F, G, H on AB, AC, CB" (N-points-on-N-segments) is NOT split — no relation operators', () => {
    // A construction list (pointsOnSegments owns it, C7). The splitter must decline: pieces lack a relation op.
    const c = cmds('F, G, H on AB, AC, CB');
    // 3 point-on-segment placements, one per segment — not a mangled fragment set.
    expect(c.filter((x) => x.type === 'point-on-segment').length).toBe(3);
  });

  it('a plain single "AB = 4" (no separator) is unaffected', () => {
    expect(dists(cmds('AB = 4'))).toEqual(['AB=4']);
  });

  it('"circle through A, B, C" (circumcircle) is NOT split by the comma', () => {
    const r = parse('circle through A, B, C', { points: ['A', 'B', 'C'] } as never);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.commands.some((x) => x.type === 'circle' || x.type === 'circle-through' || x.type === 'circumcircle')).toBe(true);
  });
});
