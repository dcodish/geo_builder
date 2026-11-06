/**
 * #1454 arm 1 — a bare name in the ask box is a QUESTION about that name.
 *
 * External review, relayed 2026-09-27: *"Asking about a defined object ('w', 'A') should return its value,
 * not «זהו נתון, לא שאלה»."* The GIVENS box still reads «z2» as a declaration; only the lane, where nothing
 * can be declared, reads it as a question. A line that states stays a statement in both.
 */
import { describe, expect, it } from 'vitest';

import { askRowsOf } from '../app/askLane';
import { complexScopeOf, deriveLines } from '../app/deriveLines';
import { readAsk } from '../app/submit';

const rows = (lines: string[], asks: string[]) => {
  const d = deriveLines(lines, 0, 0, asks);
  return askRowsOf(asks, d.knowledge, new Set(complexScopeOf(lines).keys()));
};

describe('#1454 — a bare defined name answers with its value', () => {
  const LINES = ['z1 = 3+4i', 'w = 2z1'];

  it.each([
    ['w', '6+8i'],
    ['z1', '3+4i'],
  ])('«%s» reads its value, in every question frame', (name, value) => {
    for (const ask of [name, `מהו ${name}`, `מה ${name}`, `${name}?`]) {
      const [r] = rows(LINES, [ask]);
      expect(r.note, ask).toBeNull();
      expect(r.row!.value, ask).toBe(value);
    }
  });

  it('a point letter reads its number, and the origin reads 0', () => {
    expect(rows(['A = 1+i'], ['A'])[0].row!.value).toBe('1+i');
    expect(rows(['z1 = 2'], ['O'])[0].row!.value).toBe('0');
  });

  it('a name the givens leave free gets its WHY, never a number and never «זהו נתון»', () => {
    const [r] = rows(['|z| = 5'], ['z']);
    expect(r.note).toBeNull();
    expect(r.row!.value).toBeNull();
    expect(r.row!.why).not.toBeNull();
  });

  it('REFUSAL: a line that STATES in the lane is still a statement', () => {
    expect(rows(['w = 2'], ['w = 3'])[0]).toMatchObject({ note: 'statement', row: null });
  });

  it('a bare name in the GIVENS box is still a declaration', () => {
    expect(readAsk('z2').kind).toBe('statement');
  });

  it('asking never declares: the figure is the same with the question and without it', () => {
    const was = deriveLines(['z1 = 4'], 0, 0, []);
    const now = deriveLines(['z1 = 4'], 0, 0, ['q']);
    expect(now.points.map((p) => p.name)).toEqual(was.points.map((p) => p.name));
  });
});
