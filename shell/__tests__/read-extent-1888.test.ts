/**
 * #1888 (ADR-W-120) — `shell/readExtent.ts`, product-free: the substitution probe, the co-reference exemption,
 * and the parts cut, driven by a toy reader so the contract is pinned apart from any builder's grammar.
 */
import { describe, expect, it } from 'vitest';
import { cutAtReading, labelRuns, locate, readLabelRuns, type Reader } from '../readExtent';

/** A toy grammar: it reads the FIRST label run of the text and nothing else («AB on CD» → "AB"). */
const firstRun: Reader<string> = {
  read: (t) => t.match(/(?<![A-Za-z])[A-Z]+(?![A-Za-z])/)?.[0] ?? null,
  same: (a, b) => a === b,
};
/** A toy grammar that reads the first and the LAST run: anything between is a lost operand. */
const ends: Reader<string> = {
  read: (t) => {
    const r = t.match(/(?<![A-Za-z])[A-Z]+(?![A-Za-z])/g);
    return r && r.length ? `${r[0]}|${r[r.length - 1]}` : null;
  },
  same: (a, b) => a === b,
};

describe('readLabelRuns — a run no substitution changes was not read', () => {
  it('locates runs and their labels, digits included', () => {
    expect(labelRuns('AB on C1D').map((o) => [o.text, o.at, o.parts])).toEqual([
      ['AB', 0, ['A', 'B']],
      ['C1D', 6, ['C1', 'D']],
    ]);
  });

  it('flags the run the reading ignores, and only it', () => {
    const r = readLabelRuns('AB on CD', 'AB', { ...firstRun });
    expect(r.read.map((o) => o.text)).toEqual(['AB']);
    expect(r.unread.map((o) => o.text)).toEqual(['CD']);
  });

  it('a co-reference — a single letter the line also reads as a single-letter run — is exempt, not lost', () => {
    const r = readLabelRuns('P is at P', 'P', { ...firstRun });
    expect(r.unread).toEqual([]);
    expect(r.exempt.map((o) => o.at)).toEqual([8]);
  });

  it('a builder exemption is honoured, occurrence by occurrence', () => {
    const r = readLabelRuns('AB in CD', 'AB', { ...firstRun, exempt: (o) => o.text === 'CD' });
    expect(r.unread).toEqual([]);
  });

  it('substitutes a letter of the line, else a fresh one that is on neither the line nor the figure', () => {
    const seen: string[] = [];
    const spy: Reader<string> = { read: (t) => (seen.push(t), firstRun.read(t)), same: firstRun.same };
    readLabelRuns('A on B', 'A', { ...spy, figureLabels: ['K'] });
    expect(seen[0]).toBe('B on B');
    seen.length = 0;
    readLabelRuns('A', 'A', { ...spy, figureLabels: ['Q'] });
    expect(seen).toEqual(['Z']);
  });
});

describe('cutAtReading — the parts in the student’s words, cut where the reading stops', () => {
  it('cuts a clause at the shortest prefix that reads the same and holds every read run', () => {
    const text = 'AB lies on CD';
    const occ = readLabelRuns(text, 'AB', { ...firstRun });
    expect(cutAtReading(text, locate(text, [text]), occ, () => firstRun)).toMatchObject({ parts: ['AB', 'lies on CD'], lost: ['lies on CD'] });
  });

  it('an unread run with read runs after it is a lost operand, not a lost part: no parts', () => {
    const text = 'AB and CD meet EF';
    const occ = readLabelRuns(text, 'AB|EF', { ...ends });
    expect(occ.unread.map((o) => o.text)).toEqual(['CD']);
    expect(cutAtReading(text, locate(text, [text]), occ, () => ends)).toBeNull();
  });

  it('a clause that reads alone and lost everything is listed whole; the clauses that lost nothing stay as they are', () => {
    const text = 'AB here, CD there';
    // the line's reading: only the first run
    const occ = readLabelRuns(text, 'AB', { ...firstRun });
    expect(cutAtReading(text, locate(text, ['AB here', 'CD there']), occ, () => firstRun)).toMatchObject({
      parts: ['AB here', 'CD there'],
      lost: ['CD there'],
    });
  });

  it('a fragment that does not read alone is cut together with the clause before it, as typed', () => {
    const text = 'AB here and on CD';
    const reader: Reader<string> = { read: (t) => (/^[A-Z]/.test(t) ? firstRun.read(t) : null), same: firstRun.same };
    const occ = readLabelRuns(text, 'AB', { ...reader });
    expect(cutAtReading(text, locate(text, ['AB here', 'on CD']), occ, () => reader)).toMatchObject({
      // the toy reads «AB» alone the same, so that is where its reading stops; the tail keeps «and»
      parts: ['AB', 'here and on CD'],
      lost: ['here and on CD'],
    });
  });
});
