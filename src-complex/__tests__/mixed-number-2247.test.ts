/**
 * #2247 (ADR-CX-081, operator rulings 2026-10-16) — two numbers side by side are REFUSED, never multiplied; the
 * fraction glyphs are numbers.
 *
 * Measured at 4b0b4592: juxtaposition read «z = 2 1/2 + i» as 2·1/2 + i = 1 + i, «|z| = 2 1/2» as modulus 1 and
 * «|z| = 2 3» as modulus 6, silently and green; «|z| = 2½» was not understood. The rulings: complex follows
 * analytic's #2222 (ADR-AG-284) — *"yes - on complex too"* — and, on the second decisions pass, *"Any 'number space
 * number' is refused, so «|z| = 2 3» no longer reads 6."* One detector (`parser/exprParse.findJuxtaposedNumbers`):
 * the lexer refuses the shape, and `parseLineV2` answers it before every rule. Everything runs through the real
 * `submitLine` + `deriveLines`.
 */
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';

import { deriveLines } from '../app/deriveLines';
import { errorText } from '../app/errorText';
import { activeLines, submitLine } from '../app/submit';
import { complexI18n } from '../i18n';
import { findJuxtaposedNumbers, parseExpr } from '../parser/exprParse';
import { normalize } from '../parser/normalize';
import { parseLineV2 } from '../parser/rules';
import { type InputError, useComplexStore } from '../store/useComplexStore';

type T = (k: string, o?: Record<string, unknown>) => string;
const plain = (f: T): T => (k, o) => f(k, o).replace(/[⁦-⁩]/g, '');
const he = plain(complexI18n.getFixedT('he') as unknown as T);
const en = plain(complexI18n.getFixedT('en') as unknown as T);

const store = () => useComplexStore.getState();
beforeEach(() => store().resetSession());

const play = (...lines: string[]): boolean[] => lines.map((l) => submitLine(l));
const point = (name: string, seed = 0) => deriveLines(activeLines(), seed, seed).points.find((p) => p.name === name);
const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-9);

/**
 * Every complex slot a number is read in, with the mixed number as typed. Each row's decimal twin is played first and
 * must be ACCEPTED — so the row proves a real slot, not a line that was never readable.
 */
const SLOTS: readonly [string, string, string][] = [
  ['z = 2 1/2 + i', '2 1/2', 'z = 2.5 + i'], // the report: the real part
  ['z = 1 + 2 1/2i', '2 1/2', 'z = 1 + 2.5i'], // the imaginary part
  ['|z| = 2 1/2', '2 1/2', '|z| = 2.5'], // the modulus
  ['z = 2 1/2cis30', '2 1/2', 'z = 2.5cis30'], // the polar modulus
  ['z = 2 1/2 cis(π/3)', '2 1/2', 'z = 2.5 cis(π/3)'],
  ['z = 3 cis 22 1/2', '22 1/2', 'z = 3 cis 22.5'], // the angle
  ['z^2 = 6 1/4', '6 1/4', 'z^2 = 6.25'], // a root equation
  ['z = 2 1⁄2 + i', '2 1⁄2', 'z = 2.5 + i'], // the fraction slash
  ['z = 2 1 / 2 + i', '2 1 / 2', 'z = 2.5 + i'], // a spaced slash
  ['z = -2 1/2 + i', '2 1/2', 'z = -2.5 + i'], // a leading sign
];

describe('#2247 — an ASCII mixed number is refused in every complex slot, with analytic’s sentence', () => {
  it.each(SLOTS)('«%s» → mixed-number, naming «%s»', (line, text, twin) => {
    expect(submitLine(twin)).toBe(true);
    store().resetSession();
    expect(submitLine(line)).toBe(false);
    const e = store().lastError as Extract<InputError, { key: 'mixed-number' }>;
    expect(e.key).toBe('mixed-number');
    expect(e.detail).toBe(text);
    expect(store().lines).toEqual([]);
    const p = parseLineV2(line);
    expect(p.ok === false && p.reason).toBe('juxtaposed-numbers');
  });

  it('the report, worded (he + en): the decimal, the sum and the product', () => {
    submitLine('z = 2 1/2 + i');
    const e = store().lastError!;
    expect(errorText(e, he)).toBe('לא ברור אם «2 1/2» הוא מספר מעורב או מכפלה. כתבו 2.5 (מספר עשרוני) או 2+1/2 למספר המעורב, או 2*1/2 למכפלה.');
    expect(errorText(e, en)).toBe('«2 1/2» could be a mixed number or a product. Write 2.5 (a decimal) or 2+1/2 for the mixed number, or 2*1/2 for the product.');
  });

  it('no decimal is offered when the fraction does not terminate («2 1/3»)', () => {
    submitLine('z = 2 1/3 + i');
    const e = store().lastError!;
    expect(e).toEqual({ key: 'mixed-number', detail: '2 1/3', sum: '2+1/3', product: '2*1/3' });
    expect(errorText(e, he)).toBe('לא ברור אם «2 1/3» הוא מספר מעורב או מכפלה. כתבו 2+1/3 למספר המעורב, או 2*1/3 למכפלה.');
  });

  it('after an operator the sum is parenthesised, so it reads the same in place', () => {
    submitLine('z = 3 - 2 1/2');
    expect(store().lastError).toMatchObject({ key: 'mixed-number', sum: '(2+1/2)' });
    store().resetSession();
    expect(submitLine('z = 3 - (2+1/2)')).toBe(true);
    close(point('z')!.z.re, 0.5);
  });

  it('each taught spelling reads to the value it names', () => {
    for (const [line, re] of [['z = 2.5 + i', 2.5], ['z = 2+1/2 + i', 2.5], ['z = 2*1/2 + i', 1]] as const) {
      store().resetSession();
      expect(submitLine(line)).toBe(true);
      close(point('z')!.z.re, re);
      close(point('z')!.z.im, 1);
    }
  });

  it('also refused on a figure that already holds the number', () => {
    expect(play('z = 1 + i')).toEqual([true]);
    expect(submitLine('|z| = 2 1/2')).toBe(false);
    expect(store().lastError?.key).toBe('mixed-number');
    expect(store().lines).toEqual(['z = 1 + i']);
  });
});

describe('#2247 — any other number–space–number is refused (the second-pass ruling)', () => {
  it.each([
    ['|z| = 2 3', '|z| = 2*3', 6], // the ruling's own example
    ['z = 2 3 + i', 'z = 2*3 + i', Math.sqrt(37)],
    ['z = 2 3i', 'z = 2*3i', 6],
    ['|z| = 2.5 4', '|z| = 2.5*4', 10],
    ['|z| = 2 3 4', '|z| = 2*3*4', 24],
  ] as const)('«%s» → refused, the product «%s» offered', (line, suggestion, modulus) => {
    expect(submitLine(line)).toBe(false);
    const e = store().lastError!;
    expect(e).toEqual({ key: 'juxtaposed-numbers', detail: line, suggestion });
    expect(errorText(e, he)).toBe(`לא ברור אם הכוונה לכפל — אם כן, כתבו את הכפל במפורש: «${suggestion}» במקום «${line}».`);
    expect(store().lines).toEqual([]);
    // the taught spelling drives (#1156)
    expect(submitLine(suggestion)).toBe(true);
    const z = point('z')!.z;
    close(Math.hypot(z.re, z.im), modulus);
  });
});

describe('#2247 — the one detector, at the lexer', () => {
  it('the lexer refuses the shape, whatever rule reaches it', () => {
    for (const s of ['2 1/2', '2 3', '1 + 2 1/2i', '2.5 4', '1/2 3']) expect(parseExpr(s)).toBeNull();
  });

  it.each([
    'z = 2+1/2 + i', 'z = 2*1/2 + i', 'z = 2.5 + i', 'z = 5/2 + i', 'z = 2i', 'z = 1/2i', 'z = 2 i', 'z = 2 √3',
    'z = 2 cis 30', 'z = 2 (1+i)', 'z = 3 + 2 i',
  ])('unchanged: «%s» still reads', (line) => {
    expect(findJuxtaposedNumbers(normalize(line))).toBeNull();
    expect(submitLine(line)).toBe(true);
  });

  it('a number after an indexed NAME is a name and a number, not two numbers («z2 = 2 z1»)', () => {
    expect(findJuxtaposedNumbers('z1 2')).toBeNull();
    expect(play('z1 = 1', 'z2 = 2 z1')).toEqual([true, true]);
  });
});

describe('#2247 — the glyphs ½ ¼ ¾ are numbers (analytic’s set)', () => {
  it('«|z| = 2½» is a modulus of exactly 5/2', () => {
    expect(submitLine('|z| = 2½')).toBe(true);
    expect(point('z')!.modulus).toBe('5/2');
  });

  it.each([
    ['z = 2½ + i', 2.5, 1],
    ['z = 2¼ + i', 2.25, 1],
    ['z = 2¾', 2.75, 0],
    ['z = ½ + i', 0.5, 1],
    ['z = 2 ½ + i', 2.5, 1], // analytic reads the spaced glyph as the mixed number too
    ['z = 12½ - ½i', 12.5, -0.5],
  ] as const)('«%s» → %s + %si', (line, re, im) => {
    expect(submitLine(line)).toBe(true);
    close(point('z')!.z.re, re);
    close(point('z')!.z.im, im);
  });

  it('a glyph glued to a NAME is not a decimal («z1½» is never z1.5)', () => {
    expect(normalize('z1½ = 2')).toBe('z1½ = 2');
    expect(submitLine('z1½ = 2')).toBe(false);
  });
});

describe('#2247 — the cross-product text lock: complex says what analytic says', () => {
  const analyticExpr = readFileSync(new URL('../../src-analytic/engine/expr.ts', import.meta.url), 'utf8');
  const complexExpr = readFileSync(new URL('../parser/exprParse.ts', import.meta.url), 'utf8');
  const analyticI18n = readFileSync(new URL('../../src-analytic/i18n/index.ts', import.meta.url), 'utf8');
  const complexI18nText = readFileSync(new URL('../i18n/index.ts', import.meta.url), 'utf8');

  it('the mixed-number detector is analytic’s, character for character', () => {
    const re = (src: string) => src.match(/const MIXED_NUMBER_RE = (.*);/)?.[1];
    expect(re(complexExpr)).toBeDefined();
    expect(re(complexExpr)).toBe(re(analyticExpr));
  });

  it('the four sentences (he + en, with and without a decimal) are analytic’s, byte for byte', () => {
    const rows = (src: string, key: string) => [...src.matchAll(new RegExp(`^\\s*${key}: '(.*)',$`, 'gm'))].map((m) => m[1]);
    for (const key of ['errMixedNumber', 'errMixedNumberNoDecimal']) {
      expect(rows(complexI18nText, key)).toHaveLength(2);
      expect(rows(complexI18nText, key)).toEqual(rows(analyticI18n, key));
    }
  });
});
