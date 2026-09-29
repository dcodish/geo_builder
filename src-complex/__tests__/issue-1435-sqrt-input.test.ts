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
import { errorText } from '../app/errorText';
import { normalize } from '../parser/normalize';
import { complexI18n } from '../i18n';
import { stripFormatControls } from '../../shell/bidi';

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
  it('√ of a negative literal refuses rather than inventing a value', () => {
    expect(submitLine('z1 = √-3')).toBe(false);
  });
});

/**
 * Amendment 1 (2026-09-29 pre-play, ADR-CX-056) — the five classes the pre-played sheet found.
 * Every block drives the REAL submit / derive / ask path and asserts the neighbour spellings too.
 */
const pointOf = (lines: string[], name = 'z1') => {
  const d = deriveLines(lines, 0, 0, []);
  const p = d.points.find((pt) => pt.name === name);
  if (!p) throw new Error(`${name} not drawn; untranslated=${JSON.stringify(d.untranslated)}`);
  return p;
};
const askValue = (lines: string[], ask: string): string | null => {
  const d = deriveLines(lines, 0, 0, [ask]);
  return askRowsOf([ask], d.knowledge)[0].row?.value ?? null;
};

describe('#1435 A1 — a closed radical literal is ALWAYS a known number (T75)', () => {
  it.each([
    // [line, cartesian reading, polar reading, exact modulus]
    ['z1 = 1 + √2i', 'z₁ = 1+√2i', 'z₁ ≈ √3·cis54.74°', '√3'],
    ['z1 = √5 + 2i', 'z₁ = √5+2i', 'z₁ ≈ 3·cis41.81°', '3'],
    ['z1 = (1+√2i)/3', 'z₁ = 1/3+(√2/3)i', 'z₁ ≈ √3/3·cis54.74°', '√3/3'],
    ['z1 = √2 + √3i', 'z₁ = √2+√3i', 'z₁ ≈ √5·cis50.77°', '√5'],
    ['z1 = 2cis60 + 1', 'z₁ = 2+√3i', 'z₁ ≈ √7·cis40.89°', '√7'],
    // the table directions still fold to their exact turn
    ['z1 = √3 + i', 'z₁ = √3+i', 'z₁ = 2·cis30°', '2'],
  ])('«%s» reads %s', (line, cart, polar, mod) => {
    const p = pointOf([line]);
    expect(p.readingCart).toBe(cart);
    expect(p.reading).toBe(polar);
    expect(p.modulus).toBe(mod);
    expect(p.modulusKnown).toBe(true);
    expect(p.argumentKnown).toBe(true);
  });

  it('|z1| answers the exact radical the student can check — √3, not 1.73', () => {
    expect(askValue(['z1 = 1 + √2i'], '|z1|')).toBe('√3');
    expect(askValue(['z1 = √5 + 2i'], '|z1|')).toBe('3');
  });

  it('what is DERIVED from a radical literal keeps the exact pair (conjugate, ·i, a real multiple)', () => {
    const lines = ['z1 = 1+√2i', 'z2 = conj(z1)', 'z3 = z1*i', 'z4 = 2z1'];
    expect(pointOf(lines, 'z2').readingCart).toBe('z₂ = 1-√2i');
    expect(pointOf(lines, 'z3').readingCart).toBe('z₃ = -√2+i');
    expect(pointOf(lines, 'z4').readingCart).toBe('z₄ = 2+2√2i');
  });

  it('a Gaussian-rational literal is unchanged — 3+4i, its conjugate and rotation', () => {
    const lines = ['z1 = 3+4i', 'z2 = conj(z1)', 'z3 = z1*i'];
    expect(pointOf(lines).reading).toBe('z₁ ≈ 5·cis53.13°');
    expect(pointOf(lines).readingCart).toBe('z₁ = 3+4i');
    expect(pointOf(lines, 'z2').readingCart).toBe('z₂ = 3-4i');
    expect(pointOf(lines, 'z3').readingCart).toBe('z₃ = -4+3i');
  });

  it('a fraction literal now prints its exact pair under `=` (was «≈ 1.5+2.5i»)', () => {
    expect(pointOf(['z1 = 1.5 + 2.5i']).readingCart).toBe('z₁ = 3/2+(5/2)i');
  });

  it('a float is never read back as a rational over a root: √2 + √3 is not 10949/3480', () => {
    const p = pointOf(['z1 = √2 + √3']);
    expect(p.reading).not.toMatch(/\d\/\d/);
    expect(p.readingCart).not.toMatch(/\d\/\d/);
    expect(p.z.re).toBeCloseTo(Math.SQRT2 + Math.sqrt(3), 9);
  });
});

describe('#1435 A1 — √ of a negative: ONE rule for every spelling (T74)', () => {
  it.each(['z1 = √-3', 'z1 = √(-3)', 'z1 = √(-4)', 'z1 = √(0-4)', 'z1 = √(1-5)', 'z1 = sqrt(-4)', 'z1 = ∛(-8)', 'z1 = ∛-8', 'z1 = √(i^2)', '|z1| = √(-2)', 'z1 = -√(-3)'])(
    '«%s» refuses',
    (line) => {
      expect(submitLine(line)).toBe(false);
      expect(store().lines).toEqual([]);
    },
  );

  it.each([
    ['z1 = √(4)', 'z₁ = 2'],
    ['z1 = √(1+3)', 'z₁ = 2'],
    ['z1 = √3i', 'z₁ = √3i'],
    ['z1 = i√3', 'z₁ = √3i'],
    ['z1 = -√3', 'z₁ = -√3'],
  ])('the non-negative neighbour «%s» still reads %s', (line, cart) => {
    expect(submitLine(line)).toBe(true);
    expect(pointOf([line]).readingCart).toBe(cart);
  });
});

describe('#1435 A1 — an index root ⁿ√ is reachable; a superscript on an operand stays a power (T77)', () => {
  it('the orthography chokepoint keeps an OPENING superscript before √ as the index', () => {
    expect(normalize('z1 = ³√8')).toBe('z1 = ³√8');
    expect(normalize('z1 = 2 ³√(8)')).toBe('z1 = 2 ³√(8)');
    expect(normalize('z1 = x³')).toBe('z1 = x^3');
    expect(normalize('w = z₁³')).toBe('w = z1^3');
    expect(normalize('z1 = 2³√8')).toBe('z1 = 2^3*√8');
    expect(normalize('w = z₂³√8')).toBe('w = z2^3*√8');
  });

  it.each([
    ['z1 = ³√8', 'z₁ = 2'],
    ['z1 = ³√(8)', 'z₁ = 2'],
    ['z1 = ⁴√16', 'z₁ = 2'],
    ['z1 = ⁵√100', 'z₁ = ⁵√100'],
    ['z1 = ∛8', 'z₁ = 2'],
    ['z1 = 2 ³√8', 'z₁ = 4'],
    ['z1 = 1 + ³√8i', 'z₁ = 1+2i'],
    // attached: the power reading, unchanged
    ['z1 = 2³√8', 'z₁ = 16√2'],
  ])('«%s» reads %s', (line, cart) => {
    expect(submitLine(line), JSON.stringify(store().lastError)).toBe(true);
    expect(pointOf([line]).readingCart).toBe(cart);
  });

  it('x³ and z₁³ are still powers', () => {
    expect(pointOf(['z1 = 2', 'w = z₁³'], 'w').readingCart).toBe('w = 8');
    expect(pointOf(['z1 = 2', 'w = z1³'], 'w').readingCart).toBe('w = 8');
  });
});

describe('#1435 A1 — cis attaches after ANY modulus operand (T76)', () => {
  it.each(['z1 = √2cis45', 'z1 = √(2)cis45', 'z1 = (√2)cis45', 'z1 = sqrt(2)cis45', 'z1 = sqrt(2) cis 45', 'z1 = √2 cis(45)'])(
    '«%s» is √2·cis45°',
    (line) => {
      expect(submitLine(line), JSON.stringify(store().lastError)).toBe(true);
      expect(pointOf([line]).reading).toBe('z₁ = √2·cis45°');
    },
  );

  it.each(['z1 = 2cis45', 'z1 = (2)cis45', 'z1 = 2(cis45)', 'z1 = (1+1)cis45', 'z1 = 2·cis45', 'z1 = 2 cis(45)'])(
    'the neighbour «%s» is 2·cis45°',
    (line) => {
      expect(submitLine(line), JSON.stringify(store().lastError)).toBe(true);
      expect(pointOf([line]).reading).toBe('z₁ = 2·cis45°');
    },
  );

  it('a signed angle and a modulus operand: √2cis(-45), |z1|cis30', () => {
    expect(pointOf(['z1 = √2cis(-45)']).reading).toBe('z₁ = √2·cis315°');
    expect(pointOf(['z1 = 1+i', 'z2 = |z1|cis30'], 'z2').reading).toBe('z₂ = √2·cis30°');
  });
});

describe('#1435 A1 — the word «שורש» (2-D #105 reads it; #246 teaches the rest) (T72)', () => {
  it.each([
    ['z1 = שורש 3', 'z₁ = √3'],
    ['z1 = שורש 3 + i', 'z₁ = √3+i'],
    ['z1 = שורש(3) + i', 'z₁ = √3+i'],
    ['z1 = 2שורש3', 'z₁ = 2√3'],
  ])('«%s» reads as the √ spelling: %s', (line, cart) => {
    expect(submitLine(line), JSON.stringify(store().lastError)).toBe(true);
    expect(pointOf([line]).readingCart).toBe(cart);
  });

  it('|z1| = שורש 2 pins the modulus exactly', () => {
    expect(submitLine('|z1| = שורש 2')).toBe(true);
    expect(pointOf(['|z1| = שורש 2']).modulus).toBe('√2');
  });

  it('REFUSAL: «שורש של 3» is taught — the √ spelling of the student’s own line, and the button', () => {
    expect(submitLine('z1 = שורש של 3')).toBe(false);
    const e = store().lastError!;
    expect(e).toEqual({ key: 'word-root', detail: 'z1 = שורש של 3', suggestion: 'z1 = √3' });
    const tHe = complexI18n.getFixedT('he');
    const msg = stripFormatControls(errorText(e, (k, p) => tHe(k, p)));
    expect(msg).toContain('z1 = √3');
    expect(msg).toContain('√');
    expect(msg).toContain('סמלים');
    expect(msg).not.toContain('לא הצלחתי להבין');
  });

  it('the taught spelling DRIVES: the suggestion is accepted', () => {
    submitLine('z1 = שורש של 3 + i');
    const e = store().lastError as { suggestion: string };
    expect(e.suggestion).toBe('z1 = √3 + i');
    store().clearAll();
    expect(submitLine(e.suggestion)).toBe(true);
  });

  it('a line that only mentions roots is not taught the √ sign', () => {
    submitLine('שורשי המשוואה');
    expect(store().lastError?.key).not.toBe('word-root');
  });
});
