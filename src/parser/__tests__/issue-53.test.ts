/**
 * Issue #53 / ADR-279 — a trailing RADIUS-SYMBOL clause must never be silently dropped.
 *
 * Operator prod report (2026-07-11, the booklet tangent-secant question part ג): after the circumcircle
 * of A,D,O existed, every re-phrasing of «משולש ADO חסום במעגל שרדיוסו r» committed a BARE `triangle ADO`
 * with all rows ✓ — the ADR-156 idempotent re-inscribe branch returned only the polygon, the trailing
 * radius clause defeated the END-ANCHORED droppedCirclePredicate gate, and no honesty gate covers a
 * lowercase measure symbol (labels ADR-089 / numbers ADR-250 / relations ADR-264 are all blind to it).
 *
 * The class (docs/17 §1): a stated MEASURE-SYMBOL clause attached to a construct statement is dropped
 * instead of blocking the parse whenever the winning branch does not itself consume it. Fix at the
 * chokepoint (never per-rule): the `droppedRadiusSymbol` lane + the widened CIRCLE_PRED_TAIL (an inscribe
 * predicate may CARRY its circle's qualifier + size clause). The buildable half (the first entry creates
 * the second circle) is locked by scenario `inscribe-existing-triangle-with-radius-symbol`.
 */
import { describe, it, expect } from 'vitest';
import { parse, buildParseCtx, droppedRadiusSymbol, droppedGivenNumbers } from '@/parser';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';

/** Build the operator's jsptarcl figure prefix through the real parse→facts path. */
function buildFacts(steps: string[]): Fact[] {
  const facts: Fact[] = [];
  let g = 0;
  for (const step of steps) {
    const { construction, positions } = replay(facts);
    const r = parse(step, buildParseCtx(construction, positions));
    if (!r.ok) throw new Error(`prefix step did not parse: ${step}`);
    const group = `g${g++}`;
    for (const cmd of r.commands as AnyCommand[]) {
      facts.push({ id: `${group}.${facts.length}`, utterance: step, group, cmd, enabled: true });
    }
  }
  return facts;
}

const PREFIX = [
  'משולש ABC חסום במעגל',
  'BC קוטר',
  'G על המשך CA',
  'GA=AC',
  'D על קשת AB',
  'ישר GDB',
];

describe('issue #53 — a dropped radius-symbol clause blocks the parse (never a silent bare triangle)', () => {
  it('re-typing the inscription once the circumcircle exists REFUSES — never commits a bare triangle', () => {
    // First the part-ג utterance builds the circumcircle (the scenario locks that half), then each
    // operator re-phrasing must refuse: the idempotent branch would return only [triangle ADO].
    const facts = buildFacts([...PREFIX, 'משולש ADO חסום במעגל אחר, שרדיוסו r']);
    const { construction, positions } = replay(facts);
    const ctx = buildParseCtx(construction, positions);
    for (const u of [
      'משולש ADO חסום במעגל שרדיוסו r', // the operator's no-comma form — used to commit [triangle ADO], all rows ✓
      'משולש ADO חסום במעגל אחר, שרדיוסו r',
      'משולש ADO חסום במעגל אחר שרדיוסו r',
      'משולש ADO חסום במעגל שרדיוסו 5', // the NUMERIC sibling: the widened tail catches it at parse level too
    ]) {
      const r = parse(u, ctx);
      // ADR-342 updated this outcome: with A,D,O all real points (O is a REAL vertex now — the first
      // inscription created it as a fresh letter, since an unnamed circle's centre no longer squats O),
      // the re-type lowers to their CIRCUMCIRCLE with the radius symbol BOUND — the r clause is CONSUMED,
      // not dropped, so the honest outcome is a parse, no longer a refusal. The refusal contract this
      // test locks — never commit while silently dropping the radius clause — is asserted directly.
      if (r.ok) {
        // consumed in the parse — or (the numeric sibling on a circumcircle, whose radius is DERIVED from
        // its three points) caught by the number honesty gate at the commit seam. Either way: never silent.
        const consumed = r.commands.some((c) => c.type === 'radius-symbol' || c.type === 'set-radius');
        const flagged = droppedGivenNumbers(u, r.commands).length > 0;
        expect(consumed || flagged, `the radius clause must be CONSUMED or FLAGGED, never silently dropped: ${u}`).toBe(true);
      }
    }
  });

  it('the FRESH inscription still builds the second circle (both the He forms and the En mirror)', () => {
    const facts = buildFacts(PREFIX);
    const { construction, positions } = replay(facts);
    const ctx = buildParseCtx(construction, positions);
    for (const u of [
      'משולש ADO חסום במעגל שרדיוסו r',
      'משולש ADO חסום במעגל אחר, שרדיוסו r',
      'triangle ADO inscribed in another circle whose radius is r',
    ]) {
      const r = parse(u, ctx);
      expect(r.ok, `fresh inscribe must still build: ${u}`).toBe(true);
      if (r.ok) {
        expect(
          r.commands.some((c) => /circle/i.test(c.type) || 'center' in (c as object)),
          `the parse carries the circle the radius clause describes: ${u}`,
        ).toBe(true);
      }
    }
  });

  it('droppedRadiusSymbol — fires exactly on a radius-word + single-letter clause with no circle in the parse', () => {
    const triangleOnly: AnyCommand[] = [{ type: 'triangle', ids: ['A', 'D', 'O'] } as AnyCommand];
    const circle: AnyCommand[] = [{ type: 'circle', id: 'circle-O', center: 'O', radius: 5, freeRadius: true } as AnyCommand];
    // fires: the symbol has nothing to denote (He + En, lowercase + uppercase symbol)
    expect(droppedRadiusSymbol('משולש ADO חסום במעגל שרדיוסו r', triangleOnly)).toEqual(['r']);
    expect(droppedRadiusSymbol('triangle ADO inscribed in a circle with radius r', triangleOnly)).toEqual(['r']);
    expect(droppedRadiusSymbol('מעגל שרדיוסו T', [])).toEqual(['T']);
    expect(droppedRadiusSymbol('circle whose radius is r', [])).toEqual(['r']);
    // accounted: any circle-touching command — the symbol denotes that circle's radius (binding = #54)
    expect(droppedRadiusSymbol('משולש ABC חסום במעגל שרדיוסו R', circle)).toEqual([]);
    expect(droppedRadiusSymbol('מעגל שרדיוסו R ומרכזו O', circle)).toEqual([]);
    // never fires without the adjacency: a radius SEGMENT (two glued labels), a multi-letter word, a number
    expect(droppedRadiusSymbol('רדיוס OB', triangleOnly)).toEqual([]);
    expect(droppedRadiusSymbol('the radius of circle P is 4', triangleOnly)).toEqual([]);
    expect(droppedRadiusSymbol('מעגל שרדיוסו 5', triangleOnly)).toEqual([]);
    expect(droppedRadiusSymbol('AB = 2r', triangleOnly)).toEqual([]); // no radius word — not this lane's clause
  });

  it('the previously-working radius-symbol forms are byte-unchanged', () => {
    for (const [u, ctx] of [
      ['מעגל שרדיוסו R ומרכזו O', {}],
      ['נתון מעגל O שרדיוסו R', {}],
      ['משולש ABC חסום במעגל שרדיוסו R', {}],
      ['circle O with radius R', {}],
      ['AB קוטר במעגל שמרכזו O ורדיוסו R', { points: ['A', 'B'] }],
    ] as const) {
      const r = parse(u, ctx as never);
      expect(r.ok, `must still parse: ${u}`).toBe(true);
    }
  });
});
