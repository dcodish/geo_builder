/**
 * #2079 ([ADR-3D-340](../../../docs/06b-decisions-3d.md#adr-3d-340)) — A REVOLUTION SIZE IS READ WHOLE OR REFUSED,
 * NEVER CUT TO ITS NUMERATOR.
 *
 * «כדור שרדיוסו 1/2» drew a sphere of radius 1, green. Two halves of one defect:
 *  1. `revolutionSolid` read the size slots with the decimal-only `NUM`, unanchored, so «1/2» was captured as
 *     «1» (and «2√2» as «2»). The slot now takes the whole value through the shared `MAG` atom, anchored, and
 *     reads only a plain decimal; a fraction or a root is UNREAD (ADR-3D-337 §4 held these slots) and the line
 *     is refused with the existing «not yet» size message (ADR-3D-291) — the P1 exception: no new sentence.
 *  2. The honesty gate let a fraction's numerator OR denominator alone pay for it. Now a fraction is accounted
 *     by its value, or by both of its parts together (the ratio rule keeps `p/q` as a pair) — never one alone.
 *
 * Every line goes through `decideDeterministic3`, the real pre-model submit decision.
 */
import { describe, expect, it } from 'vitest';
import i18n3d from '../../i18n';
import { errorText3 } from '../../i18n/errorText3';
import { decideDeterministic3 } from '../../app/decideDeterministic3';
import { derive3 } from '../../store/store3';
import { droppedGivenNumbers3 } from '../honesty3';
import type { Command3 } from '../../engine/types';

const decide = (line: string) => decideDeterministic3({ facts: [], seed: 0 }, line);
const he = (k: string, o?: Record<string, unknown>) => (i18n3d.getFixedT('he') as (k: string, o?: Record<string, unknown>) => string)(k, o);

/** The operator-facing lines of the issue, plus the root-valued twins the same slot test covers. */
const REFUSED: [string, 'cone' | 'cylinder' | 'sphere'][] = [
  // the issue's exact lines
  ['כדור שרדיוסו 1/2', 'sphere'],
  ['חרוט שרדיוסו 1/2 וגובהו 3', 'cone'],
  ['גליל שרדיוסו 3/2 וגובהו 5', 'cylinder'],
  ['כדור שמרכזו O ורדיוסו 3/2', 'sphere'],
  ['חרוט שרדיוסו 2 וגובהו 7/2', 'cone'],
  // other spellings of the same class: spaced slash, «הוא», the named cone, English
  ['כדור שרדיוסו 1 / 2', 'sphere'],
  ['כדור שרדיוסו הוא 1/2', 'sphere'],
  ['חרוט שקודקודו S ומרכז בסיסו O, רדיוס הבסיס 1/2 וגובהו 12', 'cone'],
  ['sphere with radius 1/2', 'sphere'],
  ['a cone with radius 1/2 and height 3', 'cone'],
  ['cylinder with radius 3/2 and height 5', 'cylinder'],
  // a root in the same slot: unread by the same test (was «לא הצלחנו לצייר: √2» or the model lane)
  ['חרוט שרדיוסו √2 וגובהו 3', 'cone'],
  ['חרוט שגובהו √3', 'cone'],
  ['כדור שרדיוסו 2√2', 'sphere'],
  ['כדור שרדיוסו sqrt(2)', 'sphere'],
];

/** Integer and decimal sizes keep building, each to exactly its stated value. */
const BUILDS: [string, { kind: string; radius?: number; height?: number }][] = [
  ['חרוט שרדיוסו 2 וגובהו 3', { kind: 'cone', radius: 2, height: 3 }],
  ['חרוט שרדיוסו 2.5 וגובהו 3', { kind: 'cone', radius: 2.5, height: 3 }],
  ['חרוט שרדיוס בסיסו 5 וגובהו 12', { kind: 'cone', radius: 5, height: 12 }],
  ['גליל שרדיוסו 2 וגובהו 5', { kind: 'cylinder', radius: 2, height: 5 }],
  ['כדור שרדיוסו 2', { kind: 'sphere', radius: 2 }],
  ['כדור שרדיוסו 12', { kind: 'sphere', radius: 12 }],
  ['כדור שרדיוסו 0.5', { kind: 'sphere', radius: 0.5 }],
  ['חרוט', { kind: 'cone' }],
];

describe('#2079 — a fraction or root size in a revolution declaration is refused, never cut', () => {
  it.each(REFUSED)('«%s» is refused with the «not yet» size message, naming the %s', (line, solid) => {
    const v = decide(line);
    expect(v.kind).toBe('refused');
    if (v.kind !== 'refused') return;
    expect(v.error).toEqual({ code: 'given-not-drivable', object: { kind: 'size', solid } });
  });

  it('the message is the existing ADR-3D-291 sentence, in the student’s solid noun', () => {
    const v = decide('כדור שרדיוסו 1/2');
    if (v.kind !== 'refused') throw new Error(JSON.stringify(v));
    expect(errorText3(he, v.error)).toBe('הכלי עדיין לא יודע לקבוע את גודל הכדור לפי נתון כזה, ולכן הוא לא נוסף — זו מגבלה של הכלי');
  });

  it.each(BUILDS)('«%s» still builds, with exactly its stated size', (line, rev) => {
    const v = decide(line);
    expect(v.kind).toBe('record');
    if (v.kind !== 'record') return;
    const d = derive3(v.facts, v.seed);
    expect(d.construction.revolutions).toEqual([expect.objectContaining(rev)]);
    expect(d.construction.revolutions[0].radius).toBe(rev.radius);
    expect(d.construction.revolutions[0].height).toBe(rev.height);
  });
});

describe('#2079 — the honesty gate: a fraction is never paid for by one of its parts', () => {
  const sphere = (radius: number): Command3[] => [{ type: 'revolution', kind: 'sphere', radius }];

  it('the numerator alone does not account for «1/2»', () => {
    expect(droppedGivenNumbers3('כדור שרדיוסו 1/2', sphere(1))).toEqual(['1/2']);
  });

  it('the denominator alone does not account for «1/2»', () => {
    expect(droppedGivenNumbers3('כדור שרדיוסו 1/2', sphere(2))).toEqual(['1/2']);
  });

  it('the value accounts for it', () => {
    expect(droppedGivenNumbers3('כדור שרדיוסו 1/2', sphere(0.5))).toEqual([]);
  });

  it('a rule that keeps the pair (the ratio «p/q») still accounts for it — both parts together', () => {
    const cmds: Command3[] = [
      { type: 'segment3', a: 'B', b: 'D' },
      { type: 'segment3', a: 'D', b: 'C' },
      { type: 'claim', claim: { type: 'length-ratio', a1: 'B', b1: 'D', a2: 'D', b2: 'C', p: 2, q: 3 } },
    ];
    expect(droppedGivenNumbers3('BD/DC = 2/3', cmds)).toEqual([]);
  });

  it('a fraction of a radical is not paid for by its denominator alone', () => {
    expect(droppedGivenNumbers3('כדור שרדיוסו √2/2', sphere(2))).toEqual(['√2/2']);
    expect(droppedGivenNumbers3('כדור שרדיוסו √2/2', sphere(Math.SQRT2 / 2))).toEqual([]);
  });

  it('a radical’s coefficient never pays for it (unchanged)', () => {
    expect(droppedGivenNumbers3('כדור שרדיוסו 2√2', sphere(2))).toEqual(['2√2']);
    expect(droppedGivenNumbers3('כדור שרדיוסו 2√2', sphere(2 * Math.SQRT2))).toEqual([]);
  });
});
