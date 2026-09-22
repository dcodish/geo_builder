/**
 * #1364 — AN UNKNOWN WORD MUST NOT BECOME AN INVENTED COEFFICIENT (ADR-CX-NNN).
 *
 * ADR-CX-004 rules that a name outside the z/w family IS a real parameter, so `|z₁| = 9r` creates `r`
 * without a declaration. Applied to an arbitrary letter RUN that ruling had no floor: «add z1 = 3+4i»
 * parsed as `add · z1 = 3+4i` and reported `ok`, so the student was shown a figure for an equation
 * they never wrote.
 *
 * The floor is `PARAM_NAME` in `exprParse.ts`: a real parameter is a SINGLE letter, optionally
 * indexed. Everything this file asserts goes through the REAL parse path (`parseLineV2` /
 * `deriveLines`) rather than re-implementing the rule — a lock that restates its own decision stays
 * green through the change that removes it (#1102/#1118).
 *
 * This was the THIRD instance of the class and the first fix at the mechanism: `2cis150` (tokenizer
 * read the tail as the name `cis150`) and `im(z1)` (read as `im · z1`) were both closed by teaching
 * the lexer one more keyword. The keyword-list cases are locked here too, so the mechanism is what
 * defends them from now on.
 */
import { describe, expect, it } from 'vitest';

import { parseLineV2 } from '../parser/rules';
import { deriveLines } from '../app/deriveLines';

const accepts = (line: string): boolean => (parseLineV2(line) as { ok?: boolean }).ok === true;

describe('#1364 — the reported case', () => {
  it('«add z1 = 3+4i» is REFUSED, not silently read as add·z1', () => {
    expect(accepts('add z1 = 3+4i')).toBe(false);
  });

  it('nothing is drawn for it — the refusal reaches the figure, not just the parser', () => {
    const d = deriveLines(['add z1 = 3+4i'], 0, 0);
    expect(d.points.find((p) => p.name === 'z1')).toBeUndefined();

    // It is reported back as UNRECOGNISED. Before the fix this line drew a figure instead.
    const row = d.untranslated.find((u) => u.src === 'add z1 = 3+4i');
    expect(row).toBeDefined();
    expect(row!.why.code).toBe('line-unrecognized');
  });
});

describe('#1364 — the CLASS, not the instance', () => {
  /** Any English wrapper verb. None of these may become a coefficient. */
  it.each(['add', 'draw', 'let', 'plot', 'set', 'show', 'make'])(
    '«%s z1 = 3+4i» is refused',
    (verb) => {
      expect(accepts(`${verb} z1 = 3+4i`)).toBe(false);
    },
  );

  /** A TYPO is the same defect wearing different clothes — it must not declare a parameter. */
  it.each(['zz1 = 3+4i', 'ww = 2+i', 'foo = 3+4i'])('the typo «%s» is refused', (line) => {
    expect(accepts(line)).toBe(false);
  });

  /**
   * A KEYWORD TYPO is what no keyword list can anticipate, and the reason this had to be fixed at the
   * mechanism rather than by extending the lexer a third time.
   */
  it.each(['conjj(z1) = 2', 'ciss(z1) = 2', 'rre(z1) = 3'])(
    'the keyword typo «%s» is refused',
    (line) => {
      expect(accepts(line)).toBe(false);
    },
  );

  /** The two earlier instances of this class, now defended by the mechanism instead of a keyword. */
  it('the historical instances still parse correctly', () => {
    expect(accepts('z2 = 2cis150')).toBe(true);
    expect(accepts('im(z1) = 4')).toBe(true);
    expect(accepts('re(z1) = 3')).toBe(true);
  });
});

describe('#1364 — the legitimate register is untouched', () => {
  /** ADR-CX-004: a single letter IS a real parameter, with no declaration. This must not regress. */
  it.each(['|z1| = 9r', '|z1| = 2a', '|z1| = b', '|z1| = 3k'])('«%s» still builds', (line) => {
    expect(accepts(line)).toBe(true);
  });

  it('an indexed parameter is still a parameter', () => {
    expect(accepts('|z1| = 2n1')).toBe(true);
  });

  /**
   * #791: two glued CAPITALS are a distance, resolved before the floor applies.
   *
   * The values are chosen CONSISTENT on purpose — B − A = 3+4i, so |AB| really is 5. An earlier draft
   * used contradictory values and still passed, because `untranslated` reports what failed to PARSE,
   * not what failed to hold. A pair that parses and then contradicts would have proved nothing about
   * the floor, which is the only thing this case is here to guard.
   */
  it('a capital label pair is still a distance, not a refused multi-letter run', () => {
    const d = deriveLines(['A = 1+i', 'B = 4+5i', 'AB = 5'], 0, 0);
    expect(d.untranslated).toEqual([]);
    expect(d.points.map((p) => p.name).sort()).toEqual(['A', 'B']);
  });

  it.each([
    'z1 = 3+4i',
    'z2 = 2cis150',
    'w = z1*z2',
    'z^5 = w^2',
    'conj(z1) = 2',
    'd_{z1z2} = 5',
  ])('the catalog form «%s» still builds', (line) => {
    expect(accepts(line)).toBe(true);
  });
});
