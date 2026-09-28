/**
 * #1435 — √ INPUT: a radical in a given parses, and a radical LITERAL is carried exactly.
 *
 * External review of prod: "No √ input" — `z1 = √3 + i`, `sqrt(3)`, `|z1| = √2`, `√2cis45`,
 * `w = (z1/√2)^4` all answered `not-handled`, and the palette offered no √. docs/27 §5.2 names
 * `w = (z₁/√2)^{4n}` (2022 חורף) and `|z|·i + 2z = √3` (2015 חורף / 2013 קיץ) as forms the grammar
 * must read.
 *
 * The mechanism: `√x` / `√(x)` / `sqrt(x)` / `ⁿ√x` lex as a root token; a root of a RATIONAL
 * literal becomes an exact value on the modulus layer's own exponent vector (so `√2cis45` stays a
 * tier-1 literal); any other radicand is `pow(x, 1/n)` — no new AST kind. A radical SUM (`√3+i`)
 * folds through the Gaussian-radical walk and the angle table, symbolically verified, to the exact
 * polar value it is (2·cis30°).
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { deriveLines } from '../app/deriveLines';
import { submitLine } from '../app/submit';
import { useComplexStore } from '../store/useComplexStore';
import { askRowsOf } from '../app/askLane';

const store = () => useComplexStore.getState();
beforeEach(() => store().clearAll());

const reading = (lines: string[], name: string): string => {
  const d = deriveLines(lines, 0, 0, []);
  const p = d.points.find((pt) => pt.name === name);
  if (!p) throw new Error(`${name} not drawn; untranslated=${JSON.stringify(d.untranslated)}`);
  return p.reading;
};

describe('#1435 — every reviewer spelling parses', () => {
  it.each([
    'z1 = √3 + i',
    'z1 = sqrt(3) + i',
    'z1 = √(3) + i',
    'z1 = 1 + √3i',
    'z1 = 1 + i√3',
    'z1 = √2cis45',
    '|z1| = √2',
  ])('«%s» is accepted as a given', (line) => {
    expect(submitLine(line), JSON.stringify(store().lastError)).toBe(true);
    expect(store().lastError).toBeNull();
  });
});

describe('#1435 — radical literals are EXACT', () => {
  it('z1 = √3 + i reads 2·cis30° — the fold is symbolic, not a decimal', () => {
    expect(reading(['z1 = √3 + i'], 'z1')).toBe('z₁ = 2·cis30°');
  });

  it('z1 = √2cis45 keeps its exact polar modulus', () => {
    expect(reading(['z1 = √2cis45'], 'z1')).toBe('z₁ = √2·cis45°');
  });

  it('|z1| = √2 pins the modulus exactly', () => {
    const d = deriveLines(['|z1| = √2'], 0, 0, []);
    const p = d.points.find((pt) => pt.name === 'z1')!;
    expect(p.modulus).toBe('√2');
    expect(p.modulusKnown).toBe(true);
  });

  it('the 2022-חורף form: z1 = 1+i, w = (z1/√2)^4 → w = -1', () => {
    const d = deriveLines(['z1 = 1+i', 'w = (z1/√2)^4'], 0, 0, ['re(w)']);
    const row = askRowsOf(['re(w)'], d.knowledge)[0].row!;
    expect(row.value).toBe('-1');
  });

  it('the 2015-חורף equation builds: |z|·i + 2z = √3', () => {
    const d = deriveLines(['|z|*i + 2z = √3'], 0, 0, []);
    expect(d.contradiction).toBeFalsy();
    expect(d.untranslated).toEqual([]);
  });
});

describe('#1435 — refusals stay honest', () => {
  it('the WORD form «שורש 3» follows the 2-D #246 ruling: taught, not parsed', () => {
    expect(submitLine('z1 = שורש 3')).toBe(false);
  });

  it('√ of a negative literal refuses rather than inventing a value', () => {
    expect(submitLine('z1 = √-3')).toBe(false);
  });
});
