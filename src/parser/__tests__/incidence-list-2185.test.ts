/**
 * #2185 ([ADR-735](../../../docs/06-decisions.md#adr-735)) — the units: the incidence-list distributor, the narrowed
 * label-accounting rule 3 (a circle name is context only when the lowering touches THAT circle), and the narrowed
 * clause-coverage trace (2) (the same id is a trace only when its definition names the clause's carrier too).
 */
import { describe, expect, it } from 'vitest';
import { incidenceList, buildParseCtx, distributedClauses } from '@/parser';
import { objectListShape } from '@/parser/incidenceList';
import { unaccountedLabels } from '@/parser/labelAccounting';
import { droppedClause } from '@/app/clauseCoverage';
import { clausesOf } from '@/app/independence';
import { replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';

describe('incidenceList — a subject run on two or more carriers', () => {
  const POSITIVE: [string, string[]][] = [
    ['A על מעגל O ועל מעגל P', ['A על מעגל O', 'A על מעגל P']],
    ['A נקודה על מעגל O ועל מעגל P', ['A על מעגל O', 'A על מעגל P']],
    ['הנקודה A נמצאת על מעגל O ועל מעגל P', ['A על מעגל O', 'A על מעגל P']],
    ['A על מעגל O וגם על מעגל P', ['A על מעגל O', 'A על מעגל P']],
    ['F על המעגל O ועל המעגל P', ['F על המעגל O', 'F על המעגל P']],
    ['A על מעגל O, על מעגל P ועל מעגל Q', ['A על מעגל O', 'A על מעגל P', 'A על מעגל Q']],
    ['A ו-B על מעגל O ועל מעגל P', ['A ו-B על מעגל O', 'A ו-B על מעגל P']],
    ['הנקודות A ו-B נמצאות על מעגל O ועל מעגל P', ['A ו-B על מעגל O', 'A ו-B על מעגל P']],
    ['P על האלכסון AC ועל האלכסון BD', ['P על האלכסון AC', 'P על האלכסון BD']],
    ['C על מעגל O ועל הישר AB', ['C על מעגל O', 'C על הישר AB']],
    ['A on circle O and on circle P', ['A on circle O', 'A on circle P']],
    ['A and B on circle O and on circle P', ['A and B on circle O', 'A and B on circle P']],
    ['A lies on circle O and also on circle P', ['A on circle O', 'A on circle P']],
  ];
  for (const [s, want] of POSITIVE) it(`«${s}»`, () => expect(incidenceList(s)).toEqual(want));

  it('«בהתאמה» / "respectively" pairs subject i with carrier i', () => {
    expect(incidenceList('A ו-B על מעגל O ועל מעגל P בהתאמה')).toEqual(['A על מעגל O', 'B על מעגל P']);
    expect(incidenceList('D ו-E על AB ועל AC בהתאמה')).toEqual(['D על AB', 'E על AC']);
    expect(incidenceList('A and B on circle O and on circle P respectively')).toEqual(['A on circle O', 'B on circle P']);
  });
  it('a count mismatch with «בהתאמה» is not read', () => {
    expect(incidenceList('A ו-B על מעגל O, על מעגל P ועל מעגל Q בהתאמה')).toBeNull();
  });
  it('not a list: the per-point form, one carrier, a predicate that is not an incidence', () => {
    expect(incidenceList('A על מעגל O ו-B על מעגל P')).toBeNull(); // a second subject — per-point, not a list
    expect(incidenceList('A על מעגל O')).toBeNull();
    expect(incidenceList('D על מעגל O כך ש-D על מעגל P')).toBeNull();
    expect(incidenceList('נקודות F, G, H על AB, AC, CB')).toBeNull();
    expect(incidenceList('A נקודת חיתוך של מעגל O ומעגל P')).toBeNull();
    expect(incidenceList('AB מיתר במעגל O ומשיק למעגל P')).toBeNull();
  });
  it('clausesOf distributes through the same helper', () => {
    expect(clausesOf('A ו-B על מעגל O ועל מעגל P')).toEqual(['A ו-B על מעגל O', 'A ו-B על מעגל P']);
    expect(clausesOf('D ו-E על AB ועל AC בהתאמה')).toEqual(['D על AB', 'E על AC']);
    expect(clausesOf('A and B on circle O and on circle P respectively')).toEqual(['A on circle O', 'B on circle P']);
  });
  it('a «בהתאמה»-closed label run is an operand, never a clause of its own (the RESPECTIVELY atom)', () => {
    // The operator's 2026-10-02 line: before ADR-735 it was cut into «… בנקודות A» + the fragment «C בהתאמה».
    expect(clausesOf('AB ו-BC משיקים למעגל בנקודות A ו-C בהתאמה')).toEqual(['AB ו-BC משיקים למעגל בנקודות A ו-C בהתאמה']);
    expect(clausesOf('AB and BC are tangent to the circle at A and C respectively')).toHaveLength(1);
    // a «ו» between two single labels whose right piece says nothing alone is the operand list «O ו-P»
    expect(clausesOf('AB משיק משותף למעגלים O ו-P בנקודה X')).toEqual(['AB משיק משותף למעגלים O ו-P בנקודה X']);
    // …while a right piece that reads alone is its own clause (the per-point form)
    expect(clausesOf('A על מעגל O ו-B על מעגל P')).toEqual(['A על מעגל O', 'B על מעגל P']);
    // the operand-pair rows keep their reading
    expect(clausesOf('O - חיתוך של AC ו-BD')).toEqual(['O - חיתוך של AC ו-BD']);
    expect(clausesOf('D ו-E על BC')).toEqual(['D ו-E על BC']);
  });
});

describe('#2211 / #2219 (ADR-744) — objectListShape: one subject, a predicate, an object list of one kind', () => {
  const texts = (s: string) => objectListShape(s)?.clauses.map((c) => c.text) ?? null;
  const POSITIVE: [string, string[]][] = [
    ['DE מקביל ל-BC ו-AB', ['DE מקביל ל-BC', 'DE מקביל ל-AB']],
    ['DE מקביל ל-BC ול-AB', ['DE מקביל ל-BC', 'DE מקביל ל-AB']],
    ['DE מקביל ל-BC וגם ל-AB', ['DE מקביל ל-BC', 'DE מקביל ל-AB']],
    ['DE מקביל לקטע BC ולקטע AB', ['DE מקביל לקטע BC', 'DE מקביל לקטע AB']],
    ['DE מקביל לקטעים BC ו-AB', ['DE מקביל לקטע BC', 'DE מקביל לקטע AB']],
    ['DE מקביל ל-BC, AB', ['DE מקביל ל-BC', 'DE מקביל ל-AB']],
    ['DE ∥ BC ו-AB', ['DE ∥ BC', 'DE ∥ AB']],
    ['DE is parallel to BC and segment AB', ['DE is parallel to BC', 'DE is parallel to segment AB']],
    ['AF is perpendicular to BC and DE', ['AF is perpendicular to BC', 'AF is perpendicular to DE']],
    ['DE is parallel to both BC and AB', ['DE is parallel to BC', 'DE is parallel to AB']],
    ['DE is parallel to segments BC and AB', ['DE is parallel to segment BC', 'DE is parallel to segment AB']],
    ['מעגל O משיק ל-AB, BC ו-AC', ['מעגל O משיק ל-AB', 'מעגל O משיק ל-BC', 'מעגל O משיק ל-AC']],
    ['מעגל O משיק לצלעות AB ו-AC', ['מעגל O משיק לצלע AB', 'מעגל O משיק לצלע AC']],
    ['M אמצע AC ו-BD', ['M אמצע AC', 'M אמצע BD']],
    ['EF = AD ו-AE', ['EF = AD', 'EF = AE']],
    ['מעגל Q משיק למעגלים O ו-P', ['מעגל Q משיק למעגל O', 'מעגל Q משיק למעגל P']],
    ['מעגל Q משיק לשני המעגלים O ו-P', ['מעגל Q משיק למעגל O', 'מעגל Q משיק למעגל P']],
    ['מעגל Q משיק מבחוץ למעגל O ולמעגל P', ['מעגל Q משיק מבחוץ למעגל O', 'מעגל Q משיק מבחוץ למעגל P']],
    ['מעגל Q מוכל במעגל O ובמעגל P', ['מעגל Q מוכל במעגל O', 'מעגל Q מוכל במעגל P']],
    ['circle Q is tangent to circles O and P', ['circle Q is tangent to circle O', 'circle Q is tangent to circle P']],
    ['circle Q is tangent to circle O and to circle P', ['circle Q is tangent to circle O', 'circle Q is tangent to circle P']],
  ];
  for (const [s, want] of POSITIVE) it(`«${s}»`, () => expect(texts(s)).toEqual(want));
  it('not a list: mixed kinds, a draw list, a subject list, a second clause, a tail, a circle list after a segment or point', () => {
    for (const s of [
      'AB קוטר במעגל O ו-CD', // a circle and a segment
      'ריבוע ABCD ו-AC',
      'מעגל O ומעגל P', // no predicate
      'circle O and circle P',
      'AB ו-AC משיקים למעגל O',
      'DE ו-AF מקבילים ל-BC',
      'DE מקביל ל-BC ו-AF מאונך ל-BC',
      'מעגל Q משיק למעגלים O ו-P בנקודות A ו-B', // a tail: not this shape
      'מעגל Q משיק למעגלים O ו-P מבחוץ',
      'AB משיק משותף למעגלים O ו-P', // a common tangent of the pair
      'A נמצאת על המעגלים O ו-P',
      'A ו-B על AB ו-AC',
    ])
      expect(texts(s), s).toBeNull();
  });
  it('a recognised shape is kept only when its head clauses read alone (the grammar decides)', () => {
    expect(objectListShape('O חיתוך של AC ו-BD')).not.toBeNull();
    expect(distributedClauses('O חיתוך של AC ו-BD')).toBeNull(); // «O חיתוך של AC» says nothing alone: a collective predicate
    expect(distributedClauses('DE מקביל ל-BC ו-AB')).toEqual(['DE מקביל ל-BC', 'DE מקביל ל-AB']);
    expect(distributedClauses('A על מעגל O ועל מעגל P')).toEqual(['A על מעגל O', 'A על מעגל P']); // the incidence list, first
  });
});

describe('label accounting rule 3 — a circle NAME is context only when the lowering touches THAT circle', () => {
  const existingPoints = ['O', 'P', 'A', 'Q'];
  const onO: AnyCommand[] = [{ type: 'point-on-circle', id: 'A', circle: 'circle-O' }];
  it('a named circle the lowering never touches is unaccounted (was excused: "touches a circle at all")', () => {
    expect(unaccountedLabels('A על מעגל O ועל מעגל P', onO, { existingPoints }).labels).toEqual(['P']);
  });
  it('touched via circle-X, a concentric circle-X-2, the anonymous @ctr-X or the centre X → accounted', () => {
    expect(unaccountedLabels('A על מעגל P', [{ type: 'point-on-circle', id: 'A', circle: 'circle-P' }], { existingPoints }).labels).toEqual([]);
    expect(unaccountedLabels('A על מעגל P', [{ type: 'point-on-circle', id: 'A', circle: 'circle-P-2' }], { existingPoints }).labels).toEqual([]);
    expect(unaccountedLabels('A על מעגל P', [{ type: 'point-on-circle', id: 'A', circle: 'circle-x' }, { type: 'circle', id: 'circle-x', center: '@ctr-P', radius: 3 } as AnyCommand], { existingPoints }).labels).toEqual([]);
    expect(unaccountedLabels('קשת AQ במעגל P', [{ type: 'set-angle', vertex: 'P', ray1: 'A', ray2: 'Q', value: 40, arcOf: 'circle-P' } as AnyCommand], { existingPoints }).labels).toEqual([]);
  });
});

describe('clause coverage trace (2) — the same id with ANOTHER carrier is no trace', () => {
  const facts = (lines: AnyCommand[]): Fact[] => lines.map((cmd, i) => ({ id: `f${i}`, cmd, enabled: true }));
  const fig = facts([
    { type: 'circle', id: 'circle-O', center: 'O', radius: 5, freeRadius: true } as AnyCommand,
    { type: 'circle', id: 'circle-P', center: 'P', radius: 3, freeRadius: true, apart: true } as AnyCommand,
  ]);
  const { construction, positions } = replay(fig);
  const ctx = buildParseCtx(construction, positions);
  const never = () => false;
  it('«A על מעגל O, B על מעגל P» lowered with B on circle O → refused (the swap)', () => {
    const whole: AnyCommand[] = [{ type: 'point-on-circle', id: 'B', circle: 'circle-O' }, { type: 'point-on-circle', id: 'A', circle: 'circle-O' }];
    expect(droppedClause('A על מעגל O, B על מעגל P', whole, ctx, never)?.category).toBe('split-statements');
  });
  it('…lowered with each on its own circle → no drop', () => {
    const whole: AnyCommand[] = [{ type: 'point-on-circle', id: 'B', circle: 'circle-P' }, { type: 'point-on-circle', id: 'A', circle: 'circle-O' }];
    expect(droppedClause('A על מעגל O, B על מעגל P', whole, ctx, never)).toBeNull();
  });
  it('the extension head inside extend-onto-circle (it names the head, the segment and the circle) is still a trace', () => {
    const whole: AnyCommand[] = [{ type: 'extend-onto-circle', id: 'A', a: 'O', b: 'P', circle: 'circle-O' }];
    expect(droppedClause('A על מעגל O, A על מעגל O', whole, ctx, never)).toBeNull();
  });
});
