/**
 * #1989 ([ADR-AG-262](../../docs/06c-decisions-analytic.md#adr-ag-262)) — A SHAPE NOUN RESTATED OVER A RING THE
 * FIGURE ALREADY DECLARES ADDS NO ROW, IN EVERY READING THE NOUN SAYS THE SAME THING IN.
 *
 * Measured on `main` @ 06fc51dd through `decideSubmit` (what the App calls): after «ריבוע ABCD», «ריבוע BCDA»
 * `record`ed a second row — and so did every other rotation and reversal of the square, and «מעוין BCDA» /
 * «מעוין ADCB»; «מלבן BCDA» and «טרפז שווה שוקיים CDAB» answered «זה כבר נובע» instead of «זה כבר ידוע».
 * #1953 (ADR-AG-259) had fixed the GENERIC word in any reading («מרובע BCDA») by comparing the ring; the noun's
 * OWN defining constraints still carried the typed spelling.
 *
 * Root cause: the row seats «ריבוע»'s right angle at the first vertex and its equal pair on the first two sides,
 * so the second reading stated `⊥ at B` and `|BC| = |CD|` where the first stated `⊥ at A` and `|AB| = |BC|` —
 * not structurally the declared constraints, so nothing was `known`, and the #1063 entailment gate then counted
 * the redundant constraints as independent and saw the freedom drop 4 → 3. Fix: `declaredRingSpelling` in the
 * fold re-spells a ring the fact list already declares, whenever `sameStatementUnder` says the noun says the same
 * thing in that reading.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { SHAPES, isGenericNoun, sameStatementUnder, shapeRow } from '../engine/shapes';
import type { Id } from '../engine/types';

/** Every reading of a ring of `n` letters: the n rotations of it and of its reverse. */
const readings = (ring: string[]): string[][] => {
  const out: string[][] = [];
  for (const base of [ring, [...ring].reverse()]) for (let i = 0; i < base.length; i += 1) out.push([...base.slice(i), ...base.slice(0, i)]);
  return out;
};

const RING4 = ['A', 'B', 'C', 'D'];

describe('#1989 — the operator’s lines: a square restated in a rotated reading adds no row', () => {
  it('«ריבוע ABCD» · «ריבוע BCDA» answers «כבר ידוע» and records nothing', () => {
    expect(decideSubmit('ריבוע BCDA', ['ריבוע ABCD'], 0).kind).toBe('already-known');
  });

  it('the declared spelling answers exactly the same (the unchanged control)', () => {
    expect(decideSubmit('ריבוע ABCD', ['ריבוע ABCD'], 0).kind).toBe('already-known');
  });
});

describe('#1989 — the class: every rotation and reversal of a noun symmetric under them', () => {
  // The issue's lock: «ריבוע / מלבן / מעוין ABCD» in all eight readings of its ring, plus the two other nouns
  // whose row asserts both pairs of opposite sides parallel, and the generic and bare-polygon words.
  it.each(['ריבוע', 'מלבן', 'מעוין', 'מקבילית', 'מרובע'])('«%s ABCD» restated in all eight readings', (noun) => {
    for (const r of readings(RING4)) {
      const line = `${noun} ${r.join('')}`;
      expect(decideSubmit(line, [`${noun} ABCD`], 0).kind, line).toBe('already-known');
    }
  });

  it.each(['משולש'])('«%s ABC» restated in all six readings', (noun) => {
    for (const r of readings(['A', 'B', 'C'])) {
      const line = `${noun} ${r.join('')}`;
      expect(decideSubmit(line, [`${noun} ABC`], 0).kind, line).toBe('already-known');
    }
  });

  it('a bare pentagon read from another vertex is the same pentagon', () => {
    expect(decideSubmit('מחומש CDEAB', ['מחומש ABCDE'], 0).kind).toBe('already-known');
  });

  it('a SPECIFIC noun over a square’s ring takes the verdict its declared spelling takes', () => {
    // «מלבן ABCD» over a square is «כבר ידוע» (a square IS a rectangle); so is every reading of it.
    const declared = decideSubmit('מלבן ABCD', ['ריבוע ABCD'], 0).kind;
    for (const r of readings(RING4)) {
      const line = `מלבן ${r.join('')}`;
      expect(decideSubmit(line, ['ריבוע ABCD'], 0).kind, line).toBe(declared);
    }
  });

  it('a noun the ring can never also carry stays refused in every reading (ADR-AG-260)', () => {
    for (const r of readings(RING4)) {
      const line = `טרפז ${r.join('')}`;
      const v = decideSubmit(line, ['ריבוע ABCD'], 0);
      expect(v.kind, line).toBe('refused');
      expect(v.kind === 'refused' && v.error.key, line).toBe('shape-excluded');
    }
  });
});

describe('#1989 — what is NOT re-spelled: a reading that says something else', () => {
  it('a trapezoid read so the OTHER pair is named is a different statement and records', () => {
    for (const r of ['BCDA', 'DABC', 'ADCB', 'CBAD']) {
      expect(decideSubmit(`טרפז ${r}`, ['טרפז ABCD'], 0).kind, r).toBe('record');
    }
  });

  it('a trapezoid read so the SAME pair is named is the restatement its declared spelling is', () => {
    for (const r of ['ABCD', 'CDAB', 'DCBA', 'BADC']) {
      expect(decideSubmit(`טרפז ${r}`, ['טרפז ABCD'], 0).kind, r).toBe('already-known');
    }
  });

  it('a crossing order is a different ring and is still refused (#1927)', () => {
    expect(decideSubmit('מרובע ACBD', ['ריבוע ABCD'], 0).kind).toBe('refused');
  });

  it('a noun whose vertex order is SEMANTIC is never re-spelled — the kite’s axis and the isosceles apex', () => {
    // 2-D does not re-spell these either (ADR-618 excludes its `shape-variant` shapes and ADR-223's right
    // triangle): reading the ring elsewhere moves the axis / the apex / the right-angle seat.
    expect(sameStatementUnder('דלתון', RING4, ['C', 'D', 'A', 'B'])).toBe(false);
    expect(sameStatementUnder('משולש שווה שוקיים', ['A', 'B', 'C'], ['B', 'C', 'A'])).toBe(false);
    expect(sameStatementUnder('משולש ישר זווית', ['A', 'B', 'C'], ['B', 'C', 'A'])).toBe(false);
    expect(sameStatementUnder('משולש שווה צלעות', ['A', 'B', 'C'], ['B', 'C', 'A'])).toBe(false);
    // …and the verdicts the operator sees are the ones the restatement already had, unchanged.
    expect(decideSubmit('דלתון BCDA', ['דלתון ABCD'], 0).kind).toBe('record');
    expect(decideSubmit('משולש שווה שוקיים BCA', ['משולש שווה שוקיים ABC'], 0).kind).toBe('record');
  });
});

describe('#1989 — `sameStatementUnder` is read off the registry, not off a list of nouns', () => {
  it('a noun is symmetric under every reading exactly when it is generic, regular, or asserts both parallel pairs', () => {
    for (const noun of Object.keys(SHAPES)) {
      const row = shapeRow(noun)!;
      const ring = [...'ABCDEFGHIJ'].slice(0, row.arity);
      const all = readings(ring).every((r) => sameStatementUnder(noun, ring as Id[], r as Id[]));
      const pairs = row.givens(ring as Id[]).filter((k) => k.t === 'relation' && k.rel === 'parallel' && !k.assumed).length;
      expect(all, noun).toBe(!!row.regular || isGenericNoun(noun) || pairs === 2);
    }
  });

  it('a trapezoid-family noun is symmetric under exactly the four readings that keep its pair opposite', () => {
    for (const noun of ['טרפז', 'טרפז שווה שוקיים', 'טרפז ישר זווית']) {
      const ok = readings(RING4).filter((r) => sameStatementUnder(noun, RING4 as Id[], r as Id[])).map((r) => r.join(''));
      expect(ok.sort(), noun).toEqual(['ABCD', 'BADC', 'CDAB', 'DCBA']);
    }
  });

  it('a ring the figure does not declare, and a non-shape word, are never re-spelled', () => {
    expect(sameStatementUnder(undefined, RING4, ['B', 'C', 'D', 'A'])).toBe(false);
    expect(sameStatementUnder('מעגל', RING4, ['B', 'C', 'D', 'A'])).toBe(false);
    expect(sameStatementUnder('ריבוע', RING4, ['B', 'C', 'D'])).toBe(false); // a different arity is a different ring
  });
});
