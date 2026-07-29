/**
 * #427 ([ADR-420](docs/06-decisions.md#adr-420)): a magnitude is reported in the student's OWN declared
 * unit. `AB = a` states no number — the world scale stays a free DOF — but it names a unit, and on a
 * shape-determined figure every derived magnitude is then a fixed multiple of it. A ratio is invariant
 * under the similarity gauge ([ADR-101](docs/06-decisions.md#adr-101)), so `AC = a√2` is knowledge where
 * the absolute `AC = 5√2` is only the drawing's arbitrary scale (issue #426).
 */
import { describe, expect, it } from 'vitest';
import { computeValues } from '@/replay/core';
import { valueText, declaredLengthUnit, type ValueRow } from '@/engine/valuesPanel';
import { exactFormOf, formatUnitText } from '@/format';
import { parse } from '@/parser/parse';
import { buildParseCtx } from '@/parser/context';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';

/** Build facts through the real parse path (context threaded per step). */
function factsFrom(steps: string[]): Fact[] {
  let facts: Fact[] = [];
  for (const [gi, u] of steps.entries()) {
    const { construction, positions } = replay(facts, 0);
    const r = parse(u, buildParseCtx(construction, positions));
    if (!r.ok) throw new Error(`no parse: ${u}`);
    for (const cmd of r.commands) facts.push({ id: `g${gi}.${facts.length}`, utterance: u, group: `g${gi}`, cmd, enabled: true });
  }
  return facts;
}
const panel = (steps: string[]) => computeValues(factsFrom(steps));
const textOf = (rows: ValueRow[], kind: ValueRow['kind'], label: string): string | undefined => {
  const r = rows.find((x) => x.kind === kind && [...x.label].sort().join('') === [...label].sort().join(''));
  return r && valueText(r);
};

describe('#427 — the declared unit is what gets printed', () => {
  it("the operator's square: a, a√2, a², 4a — never the drawing's 5", () => {
    const { rows } = panel(['ריבוע ABCD', 'AC', 'AB = a']);
    expect(textOf(rows, 'length', 'AB'), 'the student\'s own statement').toBe('a');
    expect(textOf(rows, 'length', 'BC'), 'a derived side').toBe('a');
    expect(textOf(rows, 'length', 'AC'), 'the diagonal').toBe('a√2');
    expect(textOf(rows, 'area', 'ABCD')).toBe('a²');
    expect(textOf(rows, 'perimeter', 'ABCD')).toBe('4a');
    // the whole point: no row reports the arbitrary world scale
    expect(rows.every((r) => r.kind === 'angle' || r.unit), 'every magnitude carries the unit').toBe(true);
  });

  it('a fraction-with-radical survives the round trip (the AG = a√10/3 shape)', () => {
    // G the midpoint of CD puts A at distance √5/2 · a — the operator's figure's own form.
    const { rows } = panel(['ריבוע ABCD', 'G אמצע CD', 'AG', 'AB = a']);
    expect(textOf(rows, 'length', 'AG')).toBe('a√5/2');
  });

  it('the angle rows are untouched — they were always scale-free knowledge', () => {
    const { rows } = panel(['ריבוע ABCD', 'AB = a']);
    const ang = rows.find((r) => r.kind === 'angle');
    expect(ang?.unit, 'an angle carries no unit').toBeUndefined();
    expect(ang && valueText(ang)).toBe('90');
  });

  it('the statement that names the unit reads נתון, not נגזר', () => {
    const { rows } = panel(['ריבוע ABCD', 'AB = a']);
    expect(rows.find((r) => r.kind === 'length' && r.label === 'AB')?.stated).toBe(true);
    expect(rows.find((r) => r.kind === 'length' && r.label === 'BC')?.stated).toBe(false);
  });

  it('a COEFFICIENT is carried through: AB = 3x ⇒ 3x, 3x√2, 9x², 12x', () => {
    const { rows } = panel(['ריבוע ABCD', 'AC', 'AB = 3x']);
    expect(textOf(rows, 'length', 'AB')).toBe('3x');
    expect(textOf(rows, 'length', 'AC')).toBe('3x√2');
    expect(textOf(rows, 'area', 'ABCD')).toBe('9x²');
    expect(textOf(rows, 'perimeter', 'ABCD')).toBe('12x');
  });

  it('a figure with genuine shape freedom reports ONLY what the unit fixes', () => {
    // a free triangle: |AB| = a is exactly what was said; the other sides are not multiples of it
    const { rows } = panel(['משולש ABC', 'AB = a']);
    expect(textOf(rows, 'length', 'AB')).toBe('a');
    expect(rows.filter((r) => r.kind === 'length'), 'no invented siblings').toHaveLength(1);
    expect(rows.some((r) => r.kind === 'area'), 'the area is not a fixed multiple of a²').toBe(false);
  });
});

describe('#427 — the boundaries (what must NOT enter the unit lane)', () => {
  it('a RESOLVED symbol returns to plain numbers', () => {
    const { rows } = panel(['ריבוע ABCD', 'AC', 'AB = a', 'a = 6']);
    expect(textOf(rows, 'length', 'AB')).toBe('6');
    expect(textOf(rows, 'length', 'AC')).toBe('6√2');
    expect(rows.every((r) => !r.unit), 'the scale is pinned — no unit lane').toBe(true);
  });

  it('a PINNED SCALE beats the unit: «AB = a» + «BC = 4» prints real numbers', () => {
    const { rows } = panel(['ריבוע ABCD', 'AC', 'AB = a', 'BC = 4']);
    expect(textOf(rows, 'length', 'AB')).toBe('4');
    expect(textOf(rows, 'length', 'AC')).toBe('4√2');
    expect(rows.every((r) => !r.unit)).toBe(true);
  });

  it('TWO independent symbols withhold rather than guess', () => {
    const cmds = factsFrom(['ריבוע ABCD', 'AC', 'AB = a', 'AC = b']).map((f) => f.cmd);
    expect(declaredLengthUnit(cmds), 'ambiguous — no unit').toBeNull();
  });

  it('a NON-LINEAR or AFFINE binding is not a unit', () => {
    // |AB| = 12√x and |AB| = k+2 are not linear multiples of a unit, so expressing other lengths in
    // them would be arithmetic the student never wrote.
    expect(declaredLengthUnit([{ type: 'measure-length', a: 'A', b: 'B', expr: { var: 'x', coef: 12, pow: 0.5 } } as never])).toBeNull();
    expect(declaredLengthUnit([{ type: 'measure-length', a: 'A', b: 'B', expr: { var: 'k', coef: 1, const: 2 } } as never])).toBeNull();
  });

  it('no declared unit ⇒ no unit lane (issue #426 owns that figure)', () => {
    const { rows } = panel(['ריבוע ABCD', 'AC']);
    expect(rows.every((r) => !r.unit)).toBe(true);
  });
});

describe('#427 — formatUnitText', () => {
  // the panel feeds the recognizer's FULL form (plain rationals included), unlike the absolute lane
  const u = (coef: number, pow: 1 | 2 = 1, sym = 'a') => formatUnitText({ sym, pow, coef, exact: exactFormOf(coef) });
  it('renders the curriculum forms', () => {
    expect(u(1)).toBe('a');
    expect(u(4)).toBe('4a');
    expect(u(Math.SQRT2)).toBe('a√2');
    expect(u(Math.sqrt(10) / 3)).toBe('a√10/3');
    expect(u(0.5)).toBe('a/2');
    expect(u(1, 2)).toBe('a²');
    expect(u(9, 2, 'x')).toBe('9x²');
  });
  it('an unrecognized ratio is still knowledge — a decimal multiple', () => {
    expect(formatUnitText({ sym: 'a', pow: 1, coef: 1.37, exact: null })).toBe('1.37a');
  });
});
