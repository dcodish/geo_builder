/**
 * Phase-4 acceptance gate (docs/09-implementation-plan.md §Phase 4).
 * Parser table tests across the current vocabulary in Hebrew + English, negative
 * cases returning 'not-handled' (the boundary where the Phase-7 fallback
 * escalates), an end-to-end parse→engine check, and a coverage measure.
 */

import { describe, it, expect } from 'vitest';
import type { Command } from '@/engine';
import { build } from '@/engine';
import { parse } from '../parse';
import { COMMAND_CATALOG } from '../catalog';

/** Parse and expect exactly one command equal to `expected`. */
function one(input: string, expected: Command) {
  const r = parse(input);
  expect(r.ok, `"${input}" should parse`).toBe(true);
  if (r.ok) {
    expect(r.commands).toHaveLength(1);
    expect(r.commands[0]).toEqual(expected);
  }
}

describe('parser — square (he/en)', () => {
  const sq: Command = { type: 'square', ids: ['A', 'B', 'C', 'D'] };
  it('english', () => one('square ABCD', sq));
  it('hebrew', () => one('ריבוע ABCD', sq));
  it('spaced labels', () => one('square A B C D', sq));
  it('lowercase normalises to capitals', () => one('square abcd', sq));
  it('hebrew, labels before keyword', () => one('ABCD ריבוע', sq));
  it('english, labels before keyword', () => one('ABCD square', sq));
  it('does not mistake the keyword letters for labels', () => one('square ABCD', sq));
});

describe('parser — point on segment (he/en)', () => {
  it('english, no ratio (default)', () =>
    one('point G on AD', { type: 'point-on-segment', id: 'G', a: 'A', b: 'D' }));
  it('hebrew, no ratio', () => one('נקודה G על AD', { type: 'point-on-segment', id: 'G', a: 'A', b: 'D' }));
  it('english with percent', () =>
    one('point G on AD at 40%', { type: 'point-on-segment', id: 'G', a: 'A', b: 'D', t: 0.4 }));
  it('hebrew with percent', () =>
    one('נקודה G על AD ב-40%', { type: 'point-on-segment', id: 'G', a: 'A', b: 'D', t: 0.4 }));
});

describe('parser — point by distances (he/en)', () => {
  const c: Command = { type: 'point-by-distances', id: 'C', from1: 'A', dist1: 5, from2: 'B', dist2: 5 };
  it('english', () => one('C is 5 from A and 5 from B', c));
  it('english with "point"', () => one('point C is 5 from A and 5 from B', c));
  it('hebrew', () => one('C במרחק 5 מ-A ו-5 מ-B', c));
});

describe('parser — free point (he/en)', () => {
  it('english at (x,y)', () => one('point A at (0,0)', { type: 'free-point', id: 'A', x: 0, y: 0 }));
  it('hebrew', () => one('נקודה B ב-(6,0)', { type: 'free-point', id: 'B', x: 6, y: 0 }));
  it('equals form with negatives', () => one('A = (-3, 4)', { type: 'free-point', id: 'A', x: -3, y: 4 }));
});

describe('parser — angle constraint (he/en)', () => {
  const a: Command = { type: 'set-angle', vertex: 'A', ray1: 'G', ray2: 'B', value: 37 };
  it('english =', () => one('angle GAB = 37', a));
  it('english with degrees', () => one('angle GAB is 37 degrees', a));
  it('hebrew', () => one('זווית GAB = 37', a));
  it('labels before keyword', () => one('GAB = 37 angle', a));
  it('hebrew, labels before keyword', () => one('GAB = 37 זווית', a));
});

describe('parser — Phase-5a constructs (he/en)', () => {
  it('parallelogram', () => one('parallelogram ABCD', { type: 'parallelogram', ids: ['A', 'B', 'C', 'D'] }));
  it('parallelogram (hebrew, reversed)', () => one('ABCD מקבילית', { type: 'parallelogram', ids: ['A', 'B', 'C', 'D'] }));
  it('quadrilateral', () => one('quadrilateral PQRS', { type: 'quadrilateral', ids: ['P', 'Q', 'R', 'S'] }));
  it('segment', () => one('segment AC', { type: 'segment', a: 'A', b: 'C' }));
  it('diagonal synonym', () => one('diagonal BD', { type: 'segment', a: 'B', b: 'D' }));
  it('segment (hebrew)', () => one('קטע AC', { type: 'segment', a: 'A', b: 'C' }));
  it('line∩line intersection (english)', () =>
    one('E is the intersection of AC and BD', { type: 'line-line-intersection', id: 'E', a: 'A', b: 'C', c: 'B', d: 'D' }));
  it('line∩line intersection (hebrew)', () =>
    one('M חיתוך AC ו-BD', { type: 'line-line-intersection', id: 'M', a: 'A', b: 'C', c: 'B', d: 'D' }));
});

describe('parser — out-of-grammar returns not-handled (the fallback boundary)', () => {
  for (const bad of [
    '',
    'hello there',
    'draw something nice',
    'draw a circle somewhere', // a circle with no centre named — nothing to build
    'BC parallel to AD', // the parallel *constraint* — still Phase 5d, not handled
    'make it bigger',
  ]) {
    it(`"${bad}"`, () => {
      const r = parse(bad);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('not-handled');
    });
  }
});

describe('parser — lines-first intersection phrasing (he/en)', () => {
  const e: Command = { type: 'line-line-intersection', id: 'E', a: 'A', b: 'C', c: 'B', d: 'D' };
  it('english', () => one('the diagonals AC and BD intersect at point E', e));
  it('hebrew (inflected נחתכים)', () => one('האלכסונים AC ו-BD נחתכים בנקודה E', e));
});

describe('parser — filler words are not labels', () => {
  it('"connect A to B" reads A,B — not T,O', () =>
    one('connect A to B', { type: 'segment', a: 'A', b: 'B' }));
  it('uppercase ON is still a label pair (segment ON)', () =>
    one('segment ON', { type: 'segment', a: 'O', b: 'N' }));
});

/**
 * Misparse defense: the dangerous failure is not the miss (a miss escalates to
 * the Phase-7 fallback) but the silent HALF-parse that draws a wrong figure.
 * Every utterance here mentions an out-of-grammar construct (or an unreadable
 * phrasing of an in-grammar one) and must return not-handled — never a
 * partial command.
 */
describe('parser — misparse defense (out-of-grammar must not half-parse)', () => {
  for (const u of [
    // Still out of grammar — a *single* bisector fact and the parallel/perpendicular
    // constraints are constraint-style (Phase 5d), so they escalate rather than draw.
    'perpendicular from A to BC',
    'אנך מ-A ל-BC',
    'AD bisects angle BAC',
    'AD חוצה את הזווית BAC',
    'BC parallel to AD',
    'BC מקביל ל-AD',
    // A circle through three points (circumscribed) is a different construct (3-point
    // circle / circumcentre) we don't build yet — distinct from "circle centred at O".
    'circle through A B C',
    // recognised intersection keyword but unreadable sentence → stop, not "segment"
    'the diagonals intersect somewhere',
  ]) {
    it(`"${u}"`, () => {
      const r = parse(u);
      expect(r.ok, `"${u}" must not be (mis)parsed`).toBe(false);
      if (!r.ok) expect(r.reason).toBe('not-handled');
    });
  }
});

describe('parser → engine (end to end)', () => {
  it('a typed sequence parses into commands the engine builds', () => {
    const utterances = [
      'point A at (0,0)',
      'point B at (6,0)',
      'C is 5 from A and 5 from B',
    ];
    const commands = utterances.flatMap((u) => {
      const r = parse(u);
      if (!r.ok) throw new Error(`failed to parse "${u}"`);
      return r.commands;
    });
    const { positions } = build(commands);
    expect(positions.get('C')).toBeTruthy();
  });
});

describe('parser — coverage on the in-grammar sample', () => {
  it('handles every intended phrasing (miss-rate 0 on this set)', () => {
    const sample = [
      'square ABCD',
      'ריבוע ABCD',
      'point G on AD',
      'נקודה G על AD',
      'point G on AD at 40%',
      'C is 5 from A and 5 from B',
      'C במרחק 5 מ-A ו-5 מ-B',
      'point A at (0,0)',
      'נקודה B ב-(6,0)',
      'angle GAB = 37',
      'זווית GAB = 37',
    ];
    const handled = sample.filter((u) => parse(u).ok).length;
    expect(handled).toBe(sample.length);
  });

  // The catalog is the user-facing reference *and* the coverage map: an entry
  // marked supported must parse in both locales, or the help panel lies.
  it('every supported catalog example parses (He + En)', () => {
    for (const c of COMMAND_CATALOG.filter((c) => c.supported)) {
      expect(parse(c.en).ok, `EN catalog example should parse: "${c.en}"`).toBe(true);
      expect(parse(c.he).ok, `HE catalog example should parse: "${c.he}"`).toBe(true);
    }
  });
});
