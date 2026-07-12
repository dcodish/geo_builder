/**
 * Radical / fraction VALUES as stated givens (#77 / ADR-298).
 *
 * A textbook given like `BC = 35/√32` (or a plain `35/2`) could not be entered — every stated-VALUE
 * position (length / area / perimeter / radius) carried its own partial regex and none represented a
 * QUOTIENT. The shared `NUMEXPR` atom (the ADR-285 coefficient vocabulary one seam over) now lowers a
 * quotient value in each position, keeping the VERBATIM radical-fraction text for the figure label and the
 * `droppedGivenNumbers` honesty gate.
 */
import { describe, it, expect } from 'vitest';
import { parse, droppedGivenNumbers } from '@/parser';
import type { AnyCommand } from '@/engine';

const ok = (u: string): AnyCommand[] => {
  const r = parse(u, {});
  expect(r.ok, `"${u}" should parse`).toBe(true);
  if (!r.ok) throw new Error('unreachable');
  expect(droppedGivenNumbers(u, r.commands), `"${u}" drops no stated number`).toEqual([]);
  return r.commands;
};
const exprOf = (c: AnyCommand) => (c as { expr?: { value?: number; text?: string } }).expr;

describe('#77 — quotient LENGTH values (measure-length with verbatim text)', () => {
  const cases: [string, number, string][] = [
    ['BC = 35/√32', 35 / Math.sqrt(32), '35/√32'],
    ['BC = 35 / √32', 35 / Math.sqrt(32), '35/√32'],
    ['BC = √32/5', Math.sqrt(32) / 5, '√32/5'],
    ['BC = 35/2', 17.5, '35/2'],
    ['BC = 5√2/3', (5 * Math.sqrt(2)) / 3, '5√2/3'],
    ['BC = 3/4', 0.75, '3/4'],
  ];
  for (const [u, val, text] of cases) {
    it(u, () => {
      const cmds = ok(u);
      const ml = cmds.find((c) => c.type === 'measure-length')!;
      expect(ml, 'a measure-length is emitted').toBeTruthy();
      const e = exprOf(ml)!;
      expect(e.value).toBeCloseTo(val, 9);
      expect(e.text, 'the verbatim radical fraction is kept (never a decimal)').toBe(text);
    });
  }
});

describe('#77 — quotient AREA / PERIMETER values', () => {
  it('area = a radical fraction', () => {
    const e = exprOf(ok('S_{ABC} = 35/√32').find((c) => c.type === 'measure-area')!)!;
    expect(e.value).toBeCloseTo(35 / Math.sqrt(32), 9);
    expect(e.text).toBe('35/√32');
  });
  it('area (verbose He) = √3/2', () => {
    const e = exprOf(ok('שטח ABC = √3/2').find((c) => c.type === 'measure-area')!)!;
    expect(e.value).toBeCloseTo(Math.sqrt(3) / 2, 9);
  });
});

describe('#77 — quotient RADIUS values', () => {
  const cases: [string, number][] = [
    ['מעגל O שרדיוסו 35/√32', 35 / Math.sqrt(32)],
    ['circle O radius √32/5', Math.sqrt(32) / 5],
    ['circle O radius 5√2/3', (5 * Math.sqrt(2)) / 3],
  ];
  for (const [u, r] of cases) {
    it(u, () => {
      const circ = ok(u).find((c) => c.type === 'circle') as { radius?: number } | undefined;
      expect(circ, 'a circle is created').toBeTruthy();
      expect(circ!.radius).toBeCloseTo(r, 9);
    });
  }
});

describe('#77 — NO THEFT of adjacent value forms', () => {
  const kinds = (u: string) => parse(u, { points: ['A', 'B', 'C', 'D'] } as never);
  const typeOf = (u: string, want: string) => {
    const r = kinds(u);
    expect(r.ok, u).toBe(true);
    if (!r.ok) return;
    expect(r.commands.some((c) => c.type === want), `"${u}" → ${want} (got ${r.commands.map((c) => c.type).join(',')})`).toBe(true);
  };
  it('bare number stays set-distance', () => typeOf('BC = 6', 'set-distance'));
  it('coef·√ stays measure-length (measureSqrt)', () => typeOf('BC = 12√2', 'measure-length'));
  it('two-label RHS stays a ratio', () => typeOf('AB = CD/2', 'set-ratio'));
  it('two-label equality stays set-equal', () => typeOf('AB = CD', 'set-equal'));
  it('the reserved √2R radius idiom stays measure-length', () => typeOf('AB = √2R', 'measure-length'));
  it('a power stays measure-length', () => typeOf('AB = 3x²', 'measure-length'));
  it('a segment ratio stays set-ratio', () => typeOf('EB/AE = √2/2', 'set-ratio'));
  it('a plain area radical stays measure-area', () => typeOf('S_{ABC} = 25√3', 'measure-area'));
});

describe('#77 — a fractional ANGLE stays out (escalates, not a bagrut form)', () => {
  it('∠ABC = 90/2 does not deterministically parse to a fractional angle', () => {
    const r = parse('זווית ABC = 90/2', {});
    // Either it does not handle it (escalate) OR it lowers to a plain 45 — never a silent drop.
    if (r.ok) expect(droppedGivenNumbers('זווית ABC = 90/2', r.commands)).toEqual([]);
    else expect(r.reason).toBe('not-handled');
  });
});
