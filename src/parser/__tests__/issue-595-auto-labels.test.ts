/**
 * #595 — `autoVertexLabels` must be TOTAL: exactly `n` fresh ids, always.
 *
 * The defect it closes: the generator walked A–Z once and returned a SHORT array when the alphabet ran
 * out, with no error. Its 13 call sites all assume length `n` and destructure positionally, so with 23
 * points already placed «ריבוע» committed `{type:'square', ids:['X','Y','Z',undefined]}` and reported
 * success — a figure referencing a vertex nothing had created (the silent-wrong-build class).
 *
 * The fix is the CONTRACT, not the call sites: past Z the sequence continues A1…Z1, A2…Z2, … so every
 * caller's existing assumption becomes true and no call site needed to change. The property below is
 * that contract; it is what makes the untouched callers safe, so it is the load-bearing test here.
 *
 * Operator (2026-08-15): *"a very rare case that in reality should not happen but good to guard
 * against. I like the idea of going into the A1, B1, C1 realm when letters are all used."*
 */
import { describe, expect, it } from 'vitest';
import { parse } from '../parse';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

/** Read the minted ids back out through the real parse path (the function itself is module-private). */
const mintedFor = (utterance: string, points: string[]): string[] => {
  const r = parse(utterance, { points });
  if (!r.ok) throw new Error(`expected a parse for «${utterance}» with ${points.length} points`);
  return (r.commands[0] as unknown as { ids: string[] }).ids;
};

describe('#595 — the generator is TOTAL (the property the 13 untouched callers rely on)', () => {
  it.each([
    ['משולש', 3],
    ['ריבוע', 4],
  ])('«%s» mints exactly %i distinct fresh ids at EVERY figure size 0…30', (utterance, n) => {
    for (let k = 0; k <= 30; k++) {
      // beyond 26 the existing points themselves must be indexed, or there is nothing to exhaust
      const points = Array.from({ length: k }, (_, i) =>
        i < 26 ? LETTERS[i] : `${LETTERS[i % 26]}${Math.floor(i / 26)}`,
      );
      const ids = mintedFor(utterance as string, points);
      expect(ids, `k=${k}: length`).toHaveLength(n);
      expect(ids.every((x) => typeof x === 'string' && x.length > 0), `k=${k}: no undefined id`).toBe(true);
      expect(new Set(ids).size, `k=${k}: distinct`).toBe(n);
      for (const id of ids) expect(points, `k=${k}: ${id} collides with an existing point`).not.toContain(id);
    }
  });
});

describe('#595 — the reported case', () => {
  it('«ריבוע» with 23 points no longer commits an undefined vertex', () => {
    // the honest worst case: three real vertices and one that does not exist
    expect(mintedFor('ריבוע', LETTERS.slice(0, 23))).toEqual(['X', 'Y', 'Z', 'A1']);
  });

  it('«ריבוע» with the whole alphabet taken mints the indexed realm', () => {
    expect(mintedFor('ריבוע', LETTERS)).toEqual(['A1', 'B1', 'C1', 'D1']);
  });

  it('the 26-point ceiling is gone — a second exhausted cycle keeps going', () => {
    const taken = [...LETTERS, ...LETTERS.map((c) => `${c}1`)];
    expect(mintedFor('משולש', taken)).toEqual(['A2', 'B2', 'C2']);
  });

  it('the ordinary case is completely unchanged', () => {
    expect(mintedFor('ריבוע', [])).toEqual(['A', 'B', 'C', 'D']);
    expect(mintedFor('ריבוע', ['A', 'B'])).toEqual(['C', 'D', 'E', 'F']);
    expect(mintedFor('משולש', [])).toEqual(['A', 'B', 'C']);
  });
});
