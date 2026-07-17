/**
 * Issue #163 — a CHAINED statement's tail VALUE distributes to EVERY member of the chain.
 *
 * Operator ruling (2026-07-17): «AB=BC=8 means AB=8 and BC=8». The pairwise split alone attached
 * the value only to the chain's LAST clause, so every earlier member lost its stated value on the
 * figure (BC marked 8, AB bare — the docs/17 §6 display-honesty class: "everything the student
 * stated is visible on the figure"). The class covers lengths, angles, and symbolic sizes — all
 * chain flavours route through the ONE owner, `chainedEquality`.
 *
 * The pairwise `set-equal` links are KEPT although entailed: ADR-234's `pinsSoftVariant` reads
 * them, and the redundant group measured green through the real replay (the ADR-272 vacuity gate
 * tests point collapse, not informational redundancy).
 */
import { describe, expect, it } from 'vitest';
import { parse } from '@/parser';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import { dist } from '@/engine';

const facts = (...utterances: string[]): Fact[] => {
  const out: Fact[] = [];
  for (const [g, u] of utterances.entries()) {
    const r = parse(u);
    if (!r.ok) throw new Error(`did not parse: ${u}`);
    for (const c of r.commands) out.push({ id: `${g}-${out.length}`, group: `g${g}`, enabled: true, utterance: u, cmd: c });
  }
  return out;
};
const len = (p: Map<string, { x: number; y: number }>, a: string, b: string) => dist(p.get(a)!, p.get(b)!);

describe('#163 — a chained value marks EVERY member', () => {
  it('length chain "AB=BC=8": set-distance lands on BOTH segments', () => {
    const r = parse('AB=BC=8');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const dists = r.commands.filter((c) => c.type === 'set-distance').map((c) => [c.a, c.b, c.value].join(''));
    expect(dists.sort()).toEqual(['AB8', 'BC8']);
    // the equality link is kept (ADR-234 pinsSoftVariant reads it)
    expect(r.commands.some((c) => c.type === 'set-equal')).toBe(true);
  });

  it('3-link chain "AB=BC=CD=8": all three members carry the value; replay green at 8', () => {
    const r = parse('AB=BC=CD=8');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const dists = r.commands.filter((c) => c.type === 'set-distance').map((c) => [c.a, c.b].join(''));
    expect(dists.sort()).toEqual(['AB', 'BC', 'CD']);
    const d = replay(facts('AB=BC=CD=8'));
    expect(d.lastError).toBeNull();
    for (const [a, b] of [['A', 'B'], ['B', 'C'], ['C', 'D']] as const) expect(len(d.positions, a, b)).toBeCloseTo(8, 3);
  });

  it('angle chain (He + En): both vertices get the stated degrees', () => {
    for (const u of ['זווית ABC = זווית BCA = 40', 'angle ABC = angle BCA = 40']) {
      const r = parse(u);
      expect(r.ok, u).toBe(true);
      if (!r.ok) continue;
      const angs = r.commands.filter((c) => c.type === 'set-angle').map((c) => `${c.vertex}:${c.value}`);
      expect(angs.sort(), u).toEqual(['B:40', 'C:40']);
    }
  });

  it('the operator sequence "AB=BC=8": BOTH segments show the 8 label on the figure', () => {
    const d = replay(facts('AB=BC=8'));
    expect(d.lastError).toBeNull();
    expect(len(d.positions, 'A', 'B')).toBeCloseTo(8, 3);
    expect(len(d.positions, 'B', 'C')).toBeCloseTo(8, 3);
    const labelled = d.labels.lengths.map((l) => [l.a, l.b].sort().join('') + '=' + l.text).sort();
    expect(labelled).toEqual(['AB=8', 'BC=8']);
  });

  it('a pure member chain "AB=CD=EF" is unchanged — no value, no distribution', () => {
    const r = parse('AB=CD=EF');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.commands.filter((c) => c.type === 'set-equal')).toHaveLength(2);
    expect(r.commands.some((c) => 'value' in c || 'expr' in c)).toBe(false);
  });

  it('a chained value on a SHAPE with the equality already structural (square) still applies green', () => {
    const d = replay(facts('ריבוע ABCD', 'AB=BC=8'));
    expect(d.lastError).toBeNull();
    expect(len(d.positions, 'A', 'B')).toBeCloseTo(8, 3);
    expect(len(d.positions, 'B', 'C')).toBeCloseTo(8, 3);
  });
});
