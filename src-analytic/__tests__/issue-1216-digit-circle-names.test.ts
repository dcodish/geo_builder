/**
 * #1216 (ADR-AG-118) — an Arabic digit names a circle, exactly as a Roman numeral does.
 *
 * **Operator ruling, 2026-09-19:** *"I think the rule of I, II, III for circle names AND 1,2,3 are
 * ok. so נתון מעגל 1 should be ok too. any other capital letters would become the name of the
 * center."*
 *
 * This EXTENDS #1059's ruling rather than changing it: the set of tokens that NAME a circle grows
 * from the Roman numerals to the Roman numerals AND the digits. Every other capital letter still
 * means the centre, and half of this lock exists to prove that half did not move.
 *
 * Measured before the change:
 * ```
 * נתון מעגל 1 שמשוואתו (x-3)^2+(y-4)^2=9   ->  not-handled
 * circle 1 is (x-3)^2+(y-4)^2=9            ->  OK, curve-anon…   ← the «1» silently dropped
 * ```
 * The second is the honesty one: a stated name vanished with no refusal.
 *
 * WHY THE NEGATIVE HALF IS THE BIGGER HALF. Widening a token that sits in front of an EQUATION is
 * how a coefficient gets eaten — #1059 records exactly that happening with a permissive `[IVX]{1,3}`
 * and the `x` of «המעגל x²+y²−2ax−2x=0». The digit twin of that trap is «המעגל 4x^2+4y^2=1», and the
 * separator lookahead is the only thing standing between the two readings. It is asserted here.
 */
import { describe, expect, it } from 'vitest';
import { parseLine } from '../parser/parseAnalytic';
import { derive } from '../engine/derive';
import { COMMAND_CATALOG_ANALYTIC } from '../parser/catalogAnalytic';

/** What one line built: the curve ids and names, the point ids, and any refusal. */
const built = (line: string) => {
  const d = derive([line]);
  return {
    faults: d.faults.map((f) => f.code),
    curves: d.figure.curves.map((c) => ({ id: c.id, name: c.label.name })),
    points: d.figure.points.map((p) => p.id),
  };
};

const outcome = (line: string): string => {
  const r = parseLine(line);
  return r.ok ? 'ok' : r.code;
};

describe('ADR-AG-118 — a digit names the circle (#1216)', () => {
  it.each([
    ['he, שמשוואתו', 'נתון מעגל 1 שמשוואתו (x-3)^2+(y-4)^2=9', 'circle-1', 'מעגל 1'],
    ['he, colon', 'נתון מעגל 1: (x-3)^2+(y-4)^2=9', 'circle-1', 'מעגל 1'],
    ['he, a second circle', 'נתון מעגל 2 שמשוואתו x^2+y^2=25', 'circle-2', 'מעגל 2'],
    ['en, is', 'circle 1 is (x-3)^2+(y-4)^2=9', 'circle-1', 'circle 1'],
    ['en, colon', 'circle 1: (x-3)^2+(y-4)^2=9', 'circle-1', 'circle 1'],
  ])('%s', (_what, line, id, name) => {
    const b = built(line);
    expect(b.faults, line).toEqual([]);
    expect(b.curves, line).toEqual([{ id, name }]);
    // The whole point of a NAME rather than a centre: no point is created. «מעגל O» creates O.
    expect(b.points, `${line} must create no point`).toEqual([]);
  });

  /**
   * The digit and the Roman numeral are the SAME rule now, so the strongest statement available is
   * that they are indistinguishable apart from the token itself. A parity assertion cannot go green
   * by re-implementing the grammar it guards ([ADR-W-053](../../docs/06w-decisions-workspace.md)).
   */
  it.each([
    ['he', 'נתון מעגל 1 שמשוואתו (x-3)^2+(y-4)^2=9', 'נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9'],
    ['en', 'circle 1: (x-3)^2+(y-4)^2=9', 'circle I: (x-3)^2+(y-4)^2=9'],
  ])('%s — a digit behaves exactly as a Roman numeral, token aside', (_what, digit, roman) => {
    const d = built(digit);
    const r = built(roman);
    expect(d.faults).toEqual(r.faults);
    expect(d.points).toEqual(r.points);
    expect(d.curves.map((c) => c.id.replace(/1$/, 'N'))).toEqual(r.curves.map((c) => c.id.replace(/I$/, 'N')));
    expect(d.curves.map((c) => c.name.replace(/1$/, 'N'))).toEqual(r.curves.map((c) => c.name.replace(/I$/, 'N')));
  });
});

describe('ADR-AG-118 — what did NOT move (#1059 is extended, not replaced)', () => {
  /**
   * A capital letter is still the CENTRE. If this regressed, the widening would have quietly
   * reversed the ruling it claims to extend — and the circle would go anonymous while the student's
   * point disappeared.
   */
  it.each([
    ['O', 'נתון מעגל O שמשוואתו (x-3)^2+(y-4)^2=9'],
    ['X', 'מעגל X שמשוואתו (x-3)^2+(y-4)^2=9'],
    ['K', 'מעגל K שמשוואתו (x-3)^2+(y-4)^2=9'],
    ['en O', 'circle O is (x-3)^2+(y-4)^2=9'],
  ])('%s still names the CENTRE, and the circle stays anonymous', (_what, line) => {
    const b = built(line);
    expect(b.faults, line).toEqual([]);
    expect(b.points.length, `${line} must create the centre point`).toBe(1);
    expect(b.curves.map((c) => c.name), `${line} — the circle stays anonymous`).toEqual(['']);
  });

  it.each([
    ['I', 'נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9', 'circle-I'],
    ['II', 'נתון מעגל II שמשוואתו (x+5)^2+(y-2)^2=1', 'circle-II'],
  ])('the Roman numeral %s still names the CIRCLE', (_what, line, id) => {
    const b = built(line);
    expect(b.faults).toEqual([]);
    expect(b.curves.map((c) => c.id)).toEqual([id]);
    expect(b.points).toEqual([]);
  });

  /**
   * THE TRAP, and the reason the separator lookahead exists. «המעגל 4x^2+4y^2=1» opens with a digit
   * that is a COEFFICIENT. Reading it as a name would swallow it and draw a different circle while
   * reporting success — the #1059 failure, in digits.
   */
  it.each([
    'המעגל 4x^2+4y^2=1',
    'המעגל 2x^2+2y^2=8',
    'המעגל x^2+y^2-2ax-2x=0',
  ])('a leading coefficient is not a name: %s', (line) => {
    const b = built(line);
    expect(b.faults, line).toEqual([]);
    expect(b.curves.length, line).toBe(1);
    // Anonymous — the digit was NOT taken as the circle's name.
    expect(b.curves[0].name, `${line}: the coefficient must not become a name`).toBe('');
    expect(b.curves[0].id.startsWith('circle-'), `${line}: id must not be a named-circle id`).toBe(false);
  });

  /** The range is closed at 5, mirroring the Roman range — so 6 is outside it and says so. */
  it('the numeral range is closed, exactly as the Roman one is', () => {
    expect(outcome('נתון מעגל 6 שמשוואתו x^2+y^2=25')).not.toBe('ok');
    expect(outcome('נתון מעגל 5 שמשוואתו x^2+y^2=25')).toBe('ok');
  });

  /** A digit is not a point name, so a point sentence is untouched by any of this. */
  it.each(['A(1,1)', 'A1(2,3)'])('point sentences are untouched: %s', (line) => {
    expect(outcome(line)).toBe('ok');
  });
});

/**
 * The reference card has to OFFER the digit form. `catalogAnalytic.ts` is the commands panel, the
 * coverage map and the LLM's allowed vocabulary at once (ADR-AG-005 D8) — a spelling absent from it
 * is one the student cannot discover and the fallback is never taught to emit.
 */
describe('ADR-AG-118 — the catalog offers it (#1216)', () => {
  it('carries a digit-named circle, alongside the Roman ones', () => {
    const he = COMMAND_CATALOG_ANALYTIC.map((e) => e.he);
    expect(he.some((s) => /מעגל\s+[1-5]\b/.test(s))).toBe(true);
    expect(he.some((s) => /מעגל\s+I\b/.test(s))).toBe(true);
  });
});
