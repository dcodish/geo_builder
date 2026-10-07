/**
 * #1814 ([ADR-600](../../docs/06-decisions.md#adr-600)) — the shared name glyph: what an indexed name is, and
 * where a number may begin. The builders' own locks (2-D `issue-1814-indexed-name-value.test.ts`, analytic
 * `issue-1785-indexed-name.test.ts`) assert they compose these atoms; this file asserts the atoms themselves.
 */
import { describe, expect, it } from 'vitest';
import { INDEXED_NAME_RE, UNGLUED } from '../indexedName';

/** The probe composes UNGLUED exactly as a reader does: in front of a signed decimal number. */
const NUM_UNGLUED_PROBE = new RegExp(UNGLUED + String.raw`-?\d+(?:\.\d+)?`);

describe('INDEXED_NAME — one letter (Latin or Greek, either case) with an index, standing alone', () => {
  it.each(['S1', 'a2', 'α1', 'Α1', 'Δ1', 'm12', 'S_1', 'S_{1}', 'S₁', 'β₂', 'x = a1 + 2'])('«%s» contains one', (t) => {
    expect(INDEXED_NAME_RE.test(t)).toBe(true);
  });
  it.each(['S', 'α', 'AB', 'ABC', '2α', '25k', 'ΔABC', 'AB1C', 'sin', '12'])('«%s» does not', (t) => {
    expect(INDEXED_NAME_RE.test(t)).toBe(false);
  });
});

describe('UNGLUED — a number never begins inside a name or inside another number', () => {
  it.each([
    ['∠ABC = 40', '40'],
    ['= -5', '-5'],
    ['37.5', '37.5'],
    ['3/2', '3'],
    ['2α', '2'],
    ['α + 40', '40'],
  ])('in «%s» the first number is «%s»', (t, n) => {
    expect(t.match(NUM_UNGLUED_PROBE)?.[0]).toBe(n);
  });
  // («S_{1}» is folded to «S1» at a parser boundary before any number is read — the 2-D subscript fold.)
  it.each(['α1', 'Α1', 'θ2', 'a12', 'α12', 'x_1'])('«%s» holds no number', (t) => {
    expect(NUM_UNGLUED_PROBE.test(t)).toBe(false);
  });
});
