/**
 * #2398 ([ADR-747](../../../docs/06-decisions.md#adr-747)) — the two-slot reader: a sentence that gives a circle's centre a
 * SECOND letter (the circle's own letter and a different stated centre) is read as the pair, in every spelling, and
 * nothing else is.
 */
import { describe, expect, it } from 'vitest';
import { circleWithOtherCentre } from '@/parser';

export const SECOND_CENTRE_SPELLINGS = [
  'מרכז המעגל O הוא K',
  'מרכז המעגל O הוא הנקודה K',
  'מרכז מעגל O הוא K',
  'מרכזו של המעגל O הוא K',
  'המרכז של מעגל O הוא K',
  'מרכז המעגל O בנקודה K',
  'K הוא מרכז המעגל O',
  'K מרכז המעגל O',
  'K מרכז מעגל O',
  'הנקודה K היא מרכז המעגל O',
  'the centre of circle O is K',
  'K is the centre of circle O',
  'מעגל O שמרכזו K',
  'נתון מעגל O שמרכזו בנקודה K',
  'circle O centred at K',
  'circle O with centre K',
];

describe('circleWithOtherCentre — every spelling reads the pair', () => {
  for (const line of SECOND_CENTRE_SPELLINGS)
    it(`«${line}» → circle O, centre K`, () => expect(circleWithOtherCentre(line)).toEqual({ circle: 'O', centre: 'K' }));
  it('the numeral-letter circle «מרכז המעגל I הוא K» → circle I, centre K', () =>
    expect(circleWithOtherCentre('מרכז המעגל I הוא K')).toEqual({ circle: 'I', centre: 'K' }));
});

describe('circleWithOtherCentre — one letter, the same letter twice, or a richer sentence is not this shape', () => {
  for (const line of [
    'מרכז המעגל הוא K',
    'K מרכז המעגל',
    'מרכז המעגל O הוא O',
    'O מרכז המעגל',
    'מעגל שמרכזו O ורדיוסו K',
    'מעגל שמרכזו O עובר דרך K',
    'O מרכז המעגל החוסם את משולש KLM',
    'מרכז המעגל O הוא אמצע AB',
    'K ו-L מרכזי המעגלים O ו-P בהתאמה',
    'מרכז המעגל II הוא K',
    'centre of segment BC is M',
    'מעגל O',
    'מעגל K',
    'שנה שם O ל-K',
  ])
    it(`«${line}» → null`, () => expect(circleWithOtherCentre(line)).toBeNull());
});
