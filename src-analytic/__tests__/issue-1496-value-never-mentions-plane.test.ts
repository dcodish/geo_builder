/**
 * A VALUE NEVER MENTIONS THE PLANE, AND A CAPITAL IS NEVER A PARAMETER (#1496, ADR-AG-163).
 *
 * «side AB is y=x-4» was ACCEPTED as the length equation `|AB|·i·s·y = x−4` — the free i, s absorbed it,
 * the stated line was drawn nowhere, faults `[]` (P1: a green figure for a given not honoured). The word
 * test (#1068, #1321) could not see it: the length rule strips the noun «side», and «is» is two letters.
 */
import { describe, expect, it } from 'vitest';
import { parseLine } from '../parser/parseAnalytic';
import { derive } from '../engine/derive';
import { mentionsPlane } from '../engine/carriers';
import { parseLengthExpr, constantLengthExpr } from '../engine/lengths';
import { parseExpr } from '../engine/expr';

describe('#1496 — prose around an equation is never read as a value', () => {
  it.each(['side AB is y=x-4', 'segment AB is y=x-4', 'AB is y=x-4'])('«%s» is not understood — not a length, not a curve', (line) => {
    expect(parseLine(line).ok).toBe(false);
    // …and in a figure it is a refusal, never a silent green line.
    expect(derive(['משולש ABC', line], 0).faults.map((f) => f.code)).toEqual(['not-handled']);
  });

  it.each(['AB = 5', 'AB=k', '2AB = 3CD', 'AB = 4√5', 'x_A = 5', 'y=2abc+1', 'שיפוע AB הוא 2', 'שטח המשולש ABC הוא 20'])(
    '«%s» still parses (the regression guards)',
    (line) => expect(parseLine(line).ok).toBe(true),
  );

  it('the shared predicate, CALLED from the length reader and the constant reader (not re-implemented)', () => {
    expect(mentionsPlane(parseExpr('i*s*y')!)).toBe(true);
    expect(mentionsPlane(parseExpr('2ab')!)).toBe(false);
    expect(parseLengthExpr('AB is y')).toBeNull();
    expect(constantLengthExpr('x-4')).toBeNull();
    expect(parseLengthExpr('2AB')).not.toBeNull();
  });

  it('every value slot refuses a plane variable rather than reading it as a parameter', () => {
    expect(parseLine('שיפוע AB הוא x').ok).toBe(false);
    expect(parseLine('שטח המשולש ABC הוא y').ok).toBe(false);
    expect(parseLine('x_A = y').ok).toBe(false);
    expect(parseLine('זווית ABC היא x').ok).toBe(false);
  });
});
