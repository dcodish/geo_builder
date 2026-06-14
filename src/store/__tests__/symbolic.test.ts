/**
 * Symbolic measures (ADR-031) — a named unknown shared across statements sets a
 * relation without fixing a number; giving the variable a value resolves it. The
 * symbol table + lowering live in `replay`; these tests drive the full store flow
 * (parse → facts → replay → figure + labels). Phase 1 covers lengths.
 */

import { describe, it, expect } from 'vitest';
import { parse } from '@/parser';
import { dist, angleDeg } from '@/engine';
import { replay, type Fact } from '../geoStore';

let n = 0;
const facts = (...utterances: string[]): Fact[] =>
  utterances.flatMap((u) => {
    const r = parse(u);
    if (!r.ok) throw new Error(`parse failed: ${u}`);
    return r.commands.map((cmd) => ({ id: `f${n++}`, cmd, enabled: true }));
  });

const len = (p: Map<string, { x: number; y: number }>, a: string, b: string) => dist(p.get(a)!, p.get(b)!);

describe('symbolic length relations', () => {
  it('parses "AB = 3x" to a symbolic measure (not a number)', () => {
    const r = parse('AB = 3x');
    expect(r.ok && r.commands[0]).toEqual({ type: 'measure-length', a: 'A', b: 'B', expr: { coef: 3, var: 'x' } });
  });

  it('"AB = x" is coefficient 1', () => {
    const r = parse('AB = x');
    expect(r.ok && r.commands[0]).toEqual({ type: 'measure-length', a: 'A', b: 'B', expr: { coef: 1, var: 'x' } });
  });

  it('a bare "AB = 5" is still a numeric distance (no variable)', () => {
    const r = parse('AB = 5');
    expect(r.ok && r.commands[0]).toEqual({ type: 'set-distance', a: 'A', b: 'B', value: 5 });
  });

  it('two segments sharing a variable form a proportion (|AB| = 3·|AD|)', () => {
    const d = replay(facts('quadrilateral ABCD', 'AB = 3x', 'AD = x'));
    expect(d.lastError).toBeNull();
    expect(len(d.positions, 'A', 'B')).toBeCloseTo(3 * len(d.positions, 'A', 'D'), 4);
  });

  it('a lone symbolic measure constrains nothing — only labels (the figure stays free)', () => {
    const free = replay(facts('quadrilateral ABCD'));
    const labelled = replay(facts('quadrilateral ABCD', 'AB = 3x'));
    // same geometry as the bare quad (no constraint added), but now carries a label
    expect(len(labelled.positions, 'A', 'B')).toBeCloseTo(len(free.positions, 'A', 'B'), 6);
    expect(labelled.labels.lengths).toEqual([{ a: 'A', b: 'B', text: '3x' }]);
  });

  it('giving the variable a value resolves every measure to an absolute size', () => {
    const d = replay(facts('quadrilateral ABCD', 'AB = 3x', 'AD = x', 'x = 4'));
    expect(d.lastError).toBeNull();
    expect(len(d.positions, 'A', 'B')).toBeCloseTo(12, 3);
    expect(len(d.positions, 'A', 'D')).toBeCloseTo(4, 3);
  });

  it('labels show the expression while unresolved, the number once resolved (user choice)', () => {
    const rel = replay(facts('quadrilateral ABCD', 'AB = 3x', 'AD = x'));
    expect(rel.labels.lengths).toEqual([
      { a: 'A', b: 'B', text: '3x' },
      { a: 'A', b: 'D', text: 'x' },
    ]);
    const resolved = replay(facts('quadrilateral ABCD', 'AB = 3x', 'AD = x', 'x = 4'));
    expect(resolved.labels.lengths).toEqual([
      { a: 'A', b: 'B', text: '12' },
      { a: 'A', b: 'D', text: '4' },
    ]);
  });

  it('a numeric measure labels the segment with its value (FR-RN-2)', () => {
    const d = replay(facts('quadrilateral ABCD', 'AB = 5'));
    expect(d.labels.lengths).toEqual([{ a: 'A', b: 'B', text: '5' }]);
    expect(len(d.positions, 'A', 'B')).toBeCloseTo(5, 4);
  });
});

const ang = (p: Map<string, { x: number; y: number }>, v: string, a: string, b: string) => angleDeg(p.get(v)!, p.get(a)!, p.get(b)!);

describe('symbolic angle relations (Greek variables)', () => {
  it('parses "angle ABC = 2α" to a symbolic angle measure', () => {
    const r = parse('angle ABC = 2α');
    expect(r.ok && r.commands[0]).toEqual({ type: 'measure-angle', vertex: 'B', ray1: 'A', ray2: 'C', expr: { coef: 2, var: 'α' } });
  });

  it('a numeric "angle ABC = 50" stays a numeric angle (no variable)', () => {
    const r = parse('angle ABC = 50');
    expect(r.ok && r.commands[0]).toEqual({ type: 'set-angle', vertex: 'B', ray1: 'A', ray2: 'C', value: 50 });
  });

  it('two angles sharing a variable form a proportion (∠ABC = 2·∠ACB)', () => {
    const d = replay(facts('triangle ABC', 'angle ABC = 2α', 'angle ACB = α'));
    expect(d.lastError).toBeNull();
    expect(ang(d.positions, 'B', 'A', 'C')).toBeCloseTo(2 * ang(d.positions, 'C', 'A', 'B'), 2);
  });

  it('giving the variable a value resolves both angles to absolute degrees', () => {
    const d = replay(facts('triangle ABC', 'angle ABC = 2α', 'angle ACB = α', 'α = 30'));
    expect(d.lastError).toBeNull();
    expect(ang(d.positions, 'B', 'A', 'C')).toBeCloseTo(60, 1);
    expect(ang(d.positions, 'C', 'A', 'B')).toBeCloseTo(30, 1);
  });

  it('labels show the Greek expression, then the resolved degrees', () => {
    const rel = replay(facts('triangle ABC', 'angle ABC = 2α', 'angle ACB = α'));
    expect(rel.labels.angles).toEqual([
      { vertex: 'B', ray1: 'A', ray2: 'C', text: '2α' },
      { vertex: 'C', ray1: 'A', ray2: 'B', text: 'α' },
    ]);
    const resolved = replay(facts('triangle ABC', 'angle ABC = 2α', 'angle ACB = α', 'α = 30'));
    expect(resolved.labels.angles).toEqual([
      { vertex: 'B', ray1: 'A', ray2: 'C', text: '60°' },
      { vertex: 'C', ray1: 'A', ray2: 'B', text: '30°' },
    ]);
  });

  it('a numeric angle labels the vertex with its degrees (FR-RN-2)', () => {
    const d = replay(facts('triangle ABC', 'זווית ABC = 50'));
    expect(d.labels.angles).toEqual([{ vertex: 'B', ray1: 'A', ray2: 'C', text: '50°' }]);
  });
});
