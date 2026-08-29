/**
 * #555 (ADR-3D-173) — the 3-D LLM seam gains the SEQUENCE gate: a statement whose point-letter
 * sequence is its semantics, escalated through the LLM lane, must never be committed with a
 * respelled run. The 2-D twin (#536 / ADR-441) caught Haiku alphabetizing «ADB» into «ישר ABD» —
 * the NEGATION of a stated betweenness, committed with a green ✓. The 3-D gate family (dropped*)
 * checked what a decomposition LOST or ADDED, never whether it REORDERED.
 */
import { describe, expect, it } from 'vitest';
import { restoreStatedSequences3 } from '../honesty3';

describe('#555 — restoreStatedSequences3 (pure, the ADR-441 shape on 3-D tokens)', () => {
  it('a respelled vertex-angle run is restored to the stated sequence', () => {
    const r = restoreStatedSequences3('זווית SAB במשולש', ['∠ABS = 60']);
    expect(r.lines).toEqual(['∠SAB = 60']);
    expect(r.restored).toEqual(['ABS→SAB']);
  });

  it('a reversed run is left alone — it names the same object', () => {
    expect(restoreStatedSequences3('פאה SBC', ['משולש CBS']).restored).toEqual([]);
    expect(restoreStatedSequences3('פאה SBC', ['משולש SBC']).restored).toEqual([]);
  });

  it('PRIMED labels are one token: a respelled top-face run restores with its primes intact', () => {
    const r = restoreStatedSequences3("מרובע A'B'D'C'", ["מרובע A'B'C'D'"]);
    expect(r.lines).toEqual(["מרובע A'B'D'C'"]);
    expect(r.restored).toEqual(["A'B'C'D'→A'B'D'C'"]);
  });

  it('an ambiguous multiset (two stated sequences) restores nothing', () => {
    expect(restoreStatedSequences3('SAB או ABS', ['∠ABS = 60']).restored).toEqual([]);
  });

  it('pairs are exempt — two tokens carry no order', () => {
    expect(restoreStatedSequences3('SAB', ['קטע AB']).restored).toEqual([]);
  });

  it('a superset run is a different statement — untouched', () => {
    expect(restoreStatedSequences3('SAB', ['מרובע SABC']).restored).toEqual([]);
  });

  it('an unrelated line passes through byte-identical', () => {
    const lines = ['קובייה ABCDEFGH', '|AB| = 4'];
    const r = restoreStatedSequences3('שרטט תיבה כלשהי', lines);
    expect(r.lines).toEqual(lines);
    expect(r.restored).toEqual([]);
  });
});
