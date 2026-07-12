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
    // The length given also draws the named segment (FR-IN-7); the constraint is the set-distance.
    expect(r.ok && r.commands.find((c) => c.type === 'set-distance')).toEqual({ type: 'set-distance', a: 'A', b: 'B', value: 5 });
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

describe('symbolic √ (square-root) lengths', () => {
  it('parses "AD = 12√x" to a sqrt measure (pow ½) — NOT a half-parsed numeric distance', () => {
    const r = parse('AD = 12√x');
    expect(r.ok && r.commands[0]).toEqual({ type: 'measure-length', a: 'A', b: 'D', expr: { coef: 12, var: 'x', pow: 0.5 } });
  });

  it('accepts the √ glyph, LaTeX \\sqrt{…}, and sqrt(…)', () => {
    const forms = ['AD = √x', 'AD = \\sqrt{x}', 'AD = 1*sqrt(x)'];
    for (const u of forms) {
      const r = parse(u);
      expect(r.ok && r.commands[0]).toEqual({ type: 'measure-length', a: 'A', b: 'D', expr: { coef: 1, var: 'x', pow: 0.5 } });
    }
  });

  it('a number under the radical is a concrete length but shows "12√2", not the decimal', () => {
    const r = parse('AD = 12√2');
    expect(r.ok && r.commands[0]).toEqual({ type: 'measure-length', a: 'A', b: 'D', expr: { value: 12 * Math.sqrt(2), text: '12√2' } });
    const d = replay(facts('quadrilateral ABCD', 'AD = 12√2'));
    expect(d.labels.lengths).toEqual([{ a: 'A', b: 'D', text: '12√2' }]);
  });

  it('giving the variable a value resolves 12√x → coef·√value (x=4 ⇒ 24)', () => {
    const d = replay(facts('quadrilateral ABCD', 'AD = 12√x', 'x = 4'));
    expect(d.lastError).toBeNull();
    expect(len(d.positions, 'A', 'D')).toBeCloseTo(24, 3);
  });

  it('labels show "12√x" unresolved, the number once resolved', () => {
    const rel = replay(facts('quadrilateral ABCD', 'AD = 12√x'));
    expect(rel.labels.lengths).toEqual([{ a: 'A', b: 'D', text: '12√x' }]);
    const resolved = replay(facts('quadrilateral ABCD', 'AD = 12√x', 'x = 4'));
    expect(resolved.labels.lengths).toEqual([{ a: 'A', b: 'D', text: '24' }]);
  });

  it('two segments both √x form a proportion — the radical cancels (12√x : 3√x = 4:1)', () => {
    const d = replay(facts('quadrilateral ABCD', 'AD = 12√x', 'BC = 3√x'));
    expect(d.lastError).toBeNull();
    expect(len(d.positions, 'A', 'D')).toBeCloseTo(4 * len(d.positions, 'B', 'C'), 4);
  });

  it('a lone √ measure constrains nothing (the figure stays free, just labelled)', () => {
    const free = replay(facts('quadrilateral ABCD'));
    const labelled = replay(facts('quadrilateral ABCD', 'AD = 12√x'));
    expect(labelled.lastError).toBeNull();
    expect(len(labelled.positions, 'A', 'D')).toBeCloseTo(len(free.positions, 'A', 'D'), 6);
  });
});

describe('symbolic powers (x², xⁿ)', () => {
  it('parses "AB = x²" (superscript) and "AB = 3x^2" (caret) to a power measure', () => {
    expect(parse('AB = x²').ok && (parse('AB = x²') as any).commands[0]).toEqual({ type: 'measure-length', a: 'A', b: 'B', expr: { coef: 1, var: 'x', pow: 2 } });
    expect(parse('AB = 3x^2').ok && (parse('AB = 3x^2') as any).commands[0]).toEqual({ type: 'measure-length', a: 'A', b: 'B', expr: { coef: 3, var: 'x', pow: 2 } });
  });

  it('"AB = x²" does NOT half-parse to a bare "x" (the exponent is never dropped)', () => {
    const r = parse('AB = x²');
    expect(r.ok && (r.commands[0] as any).expr).not.toEqual({ coef: 1, var: 'x' });
  });

  it('a number base is concrete (5² ⇒ 25) and shows "5²"', () => {
    expect(parse('AB = 5²').ok && (parse('AB = 5²') as any).commands[0]).toEqual({ type: 'measure-length', a: 'A', b: 'B', expr: { value: 25, text: '5²' } });
  });

  it('a fractional coefficient ("AC = 7k/5") keeps the /5 and shows "7k/5"', () => {
    const r = parse('AC = 7k/5');
    expect(r.ok && r.commands[0]).toEqual({ type: 'measure-length', a: 'A', b: 'C', expr: { coef: 7 / 5, var: 'k', text: '7k/5' } });
    const d = replay(facts('quadrilateral ABCD', 'AC = 7k/5'));
    expect(d.labels.lengths).toEqual([{ a: 'A', b: 'C', text: '7k/5' }]);
  });

  it('two fractional measures sharing a variable resolve correctly (k=5 ⇒ AC=7, BC=24)', () => {
    const d = replay(facts('triangle ABC', 'AC = 7k/5', 'BC = 24k/5', 'k = 5'));
    expect(d.lastError).toBeNull();
    expect(len(d.positions, 'A', 'C')).toBeCloseTo(7, 3);
    expect(len(d.positions, 'B', 'C')).toBeCloseTo(24, 3);
  });

  it('resolves on value (x=3 ⇒ |AB| = 2·3² = 18) and labels "2x²" then "18"', () => {
    const rel = replay(facts('quadrilateral ABCD', 'AB = 2x²'));
    expect(rel.labels.lengths).toEqual([{ a: 'A', b: 'B', text: '2x²' }]);
    const d = replay(facts('quadrilateral ABCD', 'AB = 2x²', 'x = 3'));
    expect(d.lastError).toBeNull();
    expect(len(d.positions, 'A', 'B')).toBeCloseTo(18, 3);
    expect(d.labels.lengths).toEqual([{ a: 'A', b: 'B', text: '18' }]);
  });

  it('same-exponent segments link as a ratio (4x² : x² = 4:1); mixed exponents do not', () => {
    const same = replay(facts('quadrilateral ABCD', 'AB = 4x²', 'AD = x²'));
    expect(same.lastError).toBeNull();
    expect(len(same.positions, 'A', 'B')).toBeCloseTo(4 * len(same.positions, 'A', 'D'), 4);
    // mixed √x vs x² — nonlinear, so no ratio is imposed (figure stays free)
    const free = replay(facts('quadrilateral ABCD'));
    const mixed = replay(facts('quadrilateral ABCD', 'AB = √x', 'AD = x²'));
    expect(mixed.lastError).toBeNull();
    expect(len(mixed.positions, 'A', 'B')).toBeCloseTo(len(free.positions, 'A', 'B'), 6);
  });
});

describe('affine measures "CE = k + 2" (coef·var ± constant)', () => {
  it('parses "CE = k+2" with a constant term (not a half-parse that drops "+2")', () => {
    const r = parse('CE = k+2');
    expect(r.ok && r.commands[0]).toEqual({ type: 'measure-length', a: 'C', b: 'E', expr: { coef: 1, var: 'k', const: 2, text: 'k + 2' } });
  });

  it('parses "DF = k - 5/2" (negative fractional constant)', () => {
    const r = parse('DF = k - 5/2');
    expect(r.ok && r.commands[0]).toEqual({ type: 'measure-length', a: 'D', b: 'F', expr: { coef: 1, var: 'k', const: -2.5, text: 'k − 5/2' } });
  });

  it('shows "k + 2" while unresolved and stays a FREE label (does not ratio-link to AB=k)', () => {
    const d = replay(facts('triangle ABC', 'segment CE', 'AB = k', 'CE = k+2'));
    expect(d.lastError).toBeNull();
    expect(d.labels.lengths).toContainEqual({ a: 'C', b: 'E', text: 'k + 2' });
  });

  it('resolves to coef·value + const once the variable gets a value (k=4 ⇒ CE=6)', () => {
    const d = replay(facts('triangle ABC', 'segment CE', 'AB = k', 'CE = k+2', 'k = 4'));
    expect(d.lastError).toBeNull();
    expect(len(d.positions, 'A', 'B')).toBeCloseTo(4, 3);
    expect(len(d.positions, 'C', 'E')).toBeCloseTo(6, 3);
  });

  it('when the variable is bound to a segment (AD=k), "CE=k+2" CONSTRAINS the figure (|CE| = |AD|+2)', () => {
    // and a different constant gives a different figure — it isn't just a label
    const d2 = replay(facts('rhombus ABCD', 'AD=k', 'point E on AD', 'AE/ED=2/3', 'segment CE', 'CE=k+2'));
    expect(d2.lastError).toBeNull();
    expect(len(d2.positions, 'C', 'E') - len(d2.positions, 'A', 'D')).toBeCloseTo(2, 2);
    const d8 = replay(facts('rhombus ABCD', 'AD=k', 'point E on AD', 'AE/ED=2/3', 'segment CE', 'CE=k+8'));
    expect(len(d8.positions, 'C', 'E') - len(d8.positions, 'A', 'D')).toBeCloseTo(8, 2);
    // the two figures differ in size (not just label) — the constant actually moved the shape
    expect(Math.abs(len(d8.positions, 'A', 'D') - len(d2.positions, 'A', 'D'))).toBeGreaterThan(1);
  });
});

describe('segment-length ratio "AE/ED = 2/3"', () => {
  it('parses to a set-ratio (|AE| = ⅔·|ED|), not a half-parsed "ED=2"', () => {
    const r = parse('AE/ED = 2/3');
    expect(r.ok && r.commands[0]).toEqual({ type: 'set-ratio', a: 'A', b: 'E', c: 'E', d: 'D', k: 2 / 3 });
  });

  it('places a sliding point at the right spot (E on AD, AE/ED = 2/3 ⇒ t = 0.4)', () => {
    const d = replay(facts('rhombus ABCD', 'point E on AD', 'AE/ED = 2/3'));
    expect(d.lastError).toBeNull();
    expect(len(d.positions, 'A', 'E') / len(d.positions, 'E', 'D')).toBeCloseTo(2 / 3, 4);
    expect(len(d.positions, 'A', 'E') / len(d.positions, 'A', 'D')).toBeCloseTo(0.4, 4); // 40% from A
  });
});

describe('π constant', () => {
  it('"AB = 2π" is a concrete length (≈ 6.28), not a free variable', () => {
    const r = parse('AB = 2π');
    expect(r.ok && r.commands[0]).toEqual({ type: 'measure-length', a: 'A', b: 'B', expr: { value: 2 * Math.PI, text: '2π' } });
    const d = replay(facts('quadrilateral ABCD', 'AB = 2π'));
    expect(d.lastError).toBeNull();
    expect(len(d.positions, 'A', 'B')).toBeCloseTo(2 * Math.PI, 4);
  });

  it('an uppercase segment "PI" stays a ratio, not π (AB = 2PI ≠ AB = 2π)', () => {
    const r = parse('AB = 2PI');
    expect(r.ok && r.commands[0]).toEqual({ type: 'set-ratio', a: 'A', b: 'B', c: 'P', d: 'I', k: 2 });
  });
});

describe('∠ and ° angle glyphs', () => {
  it('"∠ABC = 37°" parses like the word "angle" (∠ trigger, ° ignored)', () => {
    const r = parse('∠ABC = 37°');
    // A numeric angle also draws its two arms (FR-IN-7); the constraint is the set-angle.
    expect(r.ok && r.commands.find((c) => c.type === 'set-angle')).toEqual({ type: 'set-angle', vertex: 'B', ray1: 'A', ray2: 'C', value: 37 });
  });

  it('"∠ABC = 2α" parses as a symbolic angle', () => {
    const r = parse('∠ABC = 2α');
    expect(r.ok && r.commands[0]).toEqual({ type: 'measure-angle', vertex: 'B', ray1: 'A', ray2: 'C', expr: { coef: 2, var: 'α' } });
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
    expect(r.ok && r.commands.find((c) => c.type === 'set-angle')).toEqual({ type: 'set-angle', vertex: 'B', ray1: 'A', ray2: 'C', value: 50 });
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

describe('chained equality "AB = AC = 3x"', () => {
  it('splits a symbolic chain into the equality AND the measure (the dropped-clause bug)', () => {
    const r = parse('AB = AC = 3x');
    // The "AB = AC" clause also draws both equal segments (FR-IN-7) before the set-equal/measure.
    expect(r.ok && r.commands).toEqual([
      { type: 'segment', a: 'A', b: 'B' },
      { type: 'segment', a: 'A', b: 'C' },
      { type: 'set-equal', a: 'A', b: 'B', c: 'A', d: 'C' },
      { type: 'measure-length', a: 'A', b: 'C', expr: { coef: 3, var: 'x' } },
    ]);
  });

  it('both segments become equal, and both carry the symbolic length', () => {
    const d = replay(facts('quadrilateral ABCD', 'AB = AC = 3x'));
    expect(d.lastError).toBeNull();
    expect(len(d.positions, 'A', 'B')).toBeCloseTo(len(d.positions, 'A', 'C'), 4);
  });

  it('a numeric chain "AB = AC = 5" fixes both lengths (the "=5" was being dropped)', () => {
    const d = replay(facts('quadrilateral ABCD', 'AB = AC = 5'));
    expect(d.lastError).toBeNull();
    expect(len(d.positions, 'A', 'B')).toBeCloseTo(5, 3);
    expect(len(d.positions, 'A', 'C')).toBeCloseTo(5, 3);
  });
});

describe('reserved radius symbol R/r (ADR-034)', () => {
  it('"circle O radius R" FREES the radius (R denotes the free DOF; ADR-052/071), no fixed set-var', () => {
    const r = parse('circle O radius R');
    // A symbolic radius is an unknown magnitude → a free DOF that R denotes; R is left UNVALUED (no
    // set-var) so a later "AB = √2R" couples to the free radius rather than freezing it (ADR-071).
    // Since #54 (ADR-304) the letter is also BOUND to the circle via a `radius-symbol` data command
    // (per-circle symbols) — the radius itself stays free.
    expect(r.ok && r.commands).toEqual([
      { type: 'circle', id: 'circle-O', center: 'O', radius: 5, freeRadius: true },
      { type: 'radius-symbol', circle: 'circle-O', name: 'R' },
    ]);
  });

  it('"מעגל סביב O רדיוס R" (Hebrew) does the same (free radius + binding, no set-var)', () => {
    const r = parse('מעגל סביב O רדיוס R');
    expect(r.ok && r.commands.map((c) => c.type)).toEqual(['circle', 'radius-symbol']);
    expect(r.ok && r.commands[0]).toMatchObject({ type: 'circle', freeRadius: true });
  });

  it('"AC = 1.6R" is a size relative to the radius (var R), not "set-distance AC=1"', () => {
    const r = parse('AC = 1.6R');
    expect(r.ok && r.commands[0]).toEqual({ type: 'measure-length', a: 'A', b: 'C', expr: { coef: 1.6, var: 'R' } });
  });

  it('lowercase "AC = 2r" keeps its OWN spelling (r ≠ R since #54); an UNBOUND r still couples to the one circle', () => {
    // R and r are distinct variables (the bagrut names two radii R vs r — ADR-304); the old fold r→R
    // merged them. The reserved-symbol BEHAVIOR is preserved by the symbol table's legacy fallback:
    // an unbound r couples to the single circle exactly as R does (asserted behaviorally below).
    const r = parse('AC = 2r');
    expect(r.ok && r.commands[0]).toEqual({ type: 'measure-length', a: 'A', b: 'C', expr: { coef: 2, var: 'r' } });
    const d = replay(facts('circle O radius 5', 'triangle ABC inscribed in circle O', 'AC = 2r'));
    expect(d.lastError).toBeNull();
    expect(len(d.positions, 'A', 'C')).toBeCloseTo(10, 2); // 2 × the fixed radius — same as "AC = 2R"
  });

  it('R stays a vertex inside a letter-run ("PQRS", "AB = RS", "AB = AR")', () => {
    expect(parse('quadrilateral PQRS')).toEqual({ ok: true, commands: [{ type: 'quadrilateral', ids: ['P', 'Q', 'R', 'S'] }] });
    // R stays a vertex (not the radius var); the equality also draws both segments (FR-IN-7).
    expect(parse('AB = RS')).toEqual({ ok: true, commands: [{ type: 'segment', a: 'A', b: 'B' }, { type: 'segment', a: 'R', b: 'S' }, { type: 'set-equal', a: 'A', b: 'B', c: 'R', d: 'S' }] });
    expect(parse('AB = AR')).toEqual({ ok: true, commands: [{ type: 'segment', a: 'A', b: 'B' }, { type: 'segment', a: 'A', b: 'R' }, { type: 'set-equal', a: 'A', b: 'B', c: 'A', d: 'R' }] });
  });

  it('constrains the figure to 1.6·radius (scale-free) and keeps the label symbolic ("1.6R")', () => {
    const d = replay(facts('circle O radius R', 'triangle ABC inscribed in circle O', 'AC = 1.6R'));
    expect(d.lastError).toBeNull();
    // The radius is now a FREE DOF (ADR-052), so AC=1.6R fixes the RATIO of AC to the radius, not an
    // absolute length: |AC| = 1.6 × radius whatever the radius comes out to (A is on circle O ⇒ |OA| = r).
    const radius = len(d.positions, 'O', 'A');
    expect(len(d.positions, 'A', 'C')).toBeCloseTo(1.6 * radius, 2);
    expect(d.labels.lengths).toContainEqual({ a: 'A', b: 'C', text: '1.6R' }); // symbolic, not a number
  });
});

// ── ADR-039: inequality (order) between two named measures — "α < β" ──────────
describe('symbolic order (inequality) relations', () => {
  const ang = (p: Map<string, { x: number; y: number }>, v: string, a: string, b: string) => angleDeg(p.get(v)!, p.get(a)!, p.get(b)!);

  it('parses "α < β" to a measure-order command', () => {
    const r = parse('α < β');
    expect(r.ok && r.commands[0]).toEqual({ type: 'measure-order', left: 'α', op: '<', right: 'β' });
  });

  it('reads ≤ / ≥ / > and the ascii <= forms', () => {
    expect(parse('α ≤ β')).toEqual({ ok: true, commands: [{ type: 'measure-order', left: 'α', op: '<=', right: 'β' }] });
    expect(parse('x>y')).toEqual({ ok: true, commands: [{ type: 'measure-order', left: 'x', op: '>', right: 'y' }] });
    expect(parse('x >= y')).toEqual({ ok: true, commands: [{ type: 'measure-order', left: 'x', op: '>=', right: 'y' }] });
  });

  it('an undefined-variable ordering is a harmless no-op (lowers to nothing)', () => {
    const d = replay(facts('triangle ABC', 'α < β'));
    expect(d.lastError).toBeNull();
  });

  it('actively reshapes so the angle labelled α comes out smaller than β', () => {
    const d = replay(facts('triangle ABC', '∠ABC = α', '∠BCA = β', 'α < β'));
    expect(d.lastError).toBeNull();
    const a = ang(d.positions, 'B', 'A', 'C'); // α = ∠ABC
    const b = ang(d.positions, 'C', 'B', 'A'); // β = ∠BCA
    expect(a).toBeLessThan(b);
    expect(b - a).toBeGreaterThan(1);
  });

  it('orders lengths too ("x < y" makes |labelled-x| shorter)', () => {
    const d = replay(facts('triangle ABC', 'AB = x', 'BC = y', 'x < y'));
    expect(d.lastError).toBeNull();
    expect(len(d.positions, 'A', 'B')).toBeLessThan(len(d.positions, 'B', 'C'));
  });
});
