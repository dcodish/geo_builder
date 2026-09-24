/**
 * #1404 (ADR-CX-046) — the exact cartesian parts, as a CLASS.
 *
 * Every turn in the three radical families (multiples of 15°, 18° and 22.5°) times a spread of exact
 * moduli (whole, fractional, square-root, and a higher root that stays outside as `⁵√100`) must
 * produce a spelling that EVALUATES to `r·cos θ` and `r·sin θ`. The spelling is re-read by an
 * independent little evaluator below, so a wrong radical cannot hide behind a right `value` field.
 * Everything outside the families must answer null — the display never invents an exact value.
 */
import { describe, expect, it } from 'vitest';

import { type CartPart, composeCartesian, exactCartesianParts, numericPart } from '../cartesian';
import * as A from '../angle';
import * as M from '../modulus';
import { rat } from '../rational';

// --- an independent reader of the spelling: numbers, √, ⁿ√, ·, /, +, -, (), juxtaposition ----------
const SUP: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };
function read(text: string): number {
  let i = 0;
  const peek = () => text[i];
  const expr = (): number => {
    let v = term();
    while (peek() === '+' || peek() === '-') {
      const op = text[i++];
      const r = term();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  };
  const startsFactor = (c: string | undefined) => c !== undefined && (/[0-9(√∛]/.test(c) || c in SUP);
  const term = (): number => {
    let v = factor();
    for (;;) {
      const c = peek();
      if (c === '·') { i++; v *= factor(); }
      else if (c === '/') { i++; v /= factor(); }
      else if (startsFactor(c)) v *= factor();
      else return v;
    }
  };
  const radicand = (): number => {
    if (peek() === '(') { i++; const v = expr(); i++; return v; }
    return number();
  };
  const number = (): number => {
    const m = /^[0-9]+/.exec(text.slice(i));
    if (!m) throw new Error(`number expected at ${i} in «${text}»`);
    i += m[0].length;
    return Number(m[0]);
  };
  const factor = (): number => {
    const c = peek();
    if (c === '(') { i++; const v = expr(); if (text[i++] !== ')') throw new Error('paren'); return v; }
    if (c === '√') { i++; return Math.sqrt(radicand()); }
    if (c === '∛') { i++; return Math.cbrt(radicand()); }
    if (c in SUP) {
      let n = '';
      while (peek() in SUP) n += SUP[text[i++]];
      if (text[i++] !== '√') throw new Error('index without √');
      return Math.pow(radicand(), 1 / Number(n));
    }
    return number();
  };
  const v = expr();
  if (i !== text.length) throw new Error(`trailing «${text.slice(i)}» in «${text}»`);
  return v;
}
const signed = (p: CartPart): number => (p.zero ? 0 : (p.negative ? -1 : 1) * read(p.text));

const MODULI: [string, M.ExpVec][] = [
  ['1', M.one()],
  ['2', M.fromInt(2)],
  ['√2', M.pow(M.fromInt(2), rat(1, 2))],
  ['3√3/2', M.div(M.pow(M.fromInt(3), rat(3, 2)), M.fromInt(2))],
  ['√6', M.pow(M.fromInt(6), rat(1, 2))],
  ['√5', M.pow(M.fromInt(5), rat(1, 2))],
  ['⁵√100', M.pow(M.fromInt(100), rat(1, 5))],
  ['∛2·√3', M.mul(M.pow(M.fromInt(2), rat(1, 3)), M.pow(M.fromInt(3), rat(1, 2)))],
];

const turnsIn = (den: number) => Array.from({ length: den }, (_, k) => rat(k, den));

describe('exact cartesian parts — the three radical families, every turn, every modulus shape', () => {
  for (const den of [24, 20, 16]) {
    it(`every multiple of ${360 / den}° spells a value equal to r·cos θ and r·sin θ`, () => {
      let checked = 0;
      for (const [, mod] of MODULI) {
        const r = M.evaluate(mod)!;
        for (const t of turnsIn(den)) {
          // include a winding, which a direction must ignore
          const parts = exactCartesianParts(mod, A.fromTurns(t))!;
          const wound = exactCartesianParts(mod, A.fromTurns(rat(t.n + 3n * t.d, t.d)))!;
          expect(parts).not.toBeNull();
          expect(wound).toEqual(parts);
          const rad = (Number(t.n) / Number(t.d)) * 2 * Math.PI;
          const re = r * Math.cos(rad);
          const im = r * Math.sin(rad);
          expect(signed(parts.re)).toBeCloseTo(re, 9);
          expect(signed(parts.im)).toBeCloseTo(im, 9);
          expect(parts.re.value).toBeCloseTo(re, 9);
          expect(parts.im.value).toBeCloseTo(im, 9);
          // a zero part is EXACTLY zero, never a tiny float
          expect(parts.re.zero).toBe(Math.abs(re) < 1e-12);
          expect(parts.im.zero).toBe(Math.abs(im) < 1e-12);
          checked++;
        }
      }
      expect(checked).toBe(MODULI.length * den); // the exercised-counter: the loop really ran
    });
  }

  it('outside the families there is no exact part — cos 20°, 40°, a seventh of a turn', () => {
    for (const t of [rat(1, 18), rat(1, 9), rat(1, 7), rat(1, 48)]) {
      expect(exactCartesianParts(M.fromInt(2), A.fromTurns(t))).toBeNull();
    }
  });

  it('an angle ATOM or a PARAMETRIC modulus has no exact part', () => {
    expect(exactCartesianParts(M.fromInt(2), A.fromAtom('θ'))).toBeNull();
    expect(exactCartesianParts(M.fromParam('r'), A.fromTurns(rat(1, 6)))).toBeNull();
  });

  it('the spellings a student reads', () => {
    const show = (mod: M.ExpVec, t: [number, number]) => {
      const p = exactCartesianParts(mod, A.fromTurns(rat(t[0], t[1])))!;
      return composeCartesian(p.re, p.im);
    };
    const two = M.fromInt(2);
    expect(show(two, [1, 3])).toBe('-1+√3i'); // 120°
    expect(show(two, [1, 8])).toBe('√2+√2i'); // 45°
    expect(show(M.one(), [1, 24])).toBe('(√6+√2)/4+((√6-√2)/4)i'); // 15°
    expect(show(two, [1, 16])).toBe('√(2+√2)+√(2-√2)i'); // 22.5° — the nested root, ADR-CX-046
    expect(show(M.pow(two, rat(1, 2)), [1, 16])).toBe('√(4+2√2)/2+(√(4-2√2)/2)i'); // √2 folds INTO the nest
    expect(show(two, [1, 20])).toBe('√(10+2√5)/2+((√5-1)/2)i'); // 18°
    expect(show(M.one(), [1, 6])).toBe('1/2+(√3/2)i'); // 60°: a fraction is parenthesised before i
    expect(show(two, [1, 2])).toBe('-2'); // zero part dropped
    expect(show(two, [3, 4])).toBe('-2i');
    expect(show(M.one(), [1, 4])).toBe('i');
    expect(show(M.pow(M.fromInt(100), rat(1, 5)), [1, 5])).toBe('⁵√100·(√5-1)/4+(⁵√100·√(10+2√5)/4)i'); // 72°
  });
});

describe('the ONE composer drops a zero part on the decimal path too', () => {
  const fmt = (x: number) => `${Math.round(x * 1000) / 1000}`;
  it('float noise is not a coordinate: 2·cis180° is «-2», 2·cis90° is «2i»', () => {
    const rad = Math.PI;
    expect(composeCartesian(numericPart(2 * Math.cos(rad), fmt), numericPart(2 * Math.sin(rad), fmt))).toBe('-2');
    expect(composeCartesian(numericPart(2 * Math.cos(rad / 2), fmt), numericPart(2 * Math.sin(rad / 2), fmt))).toBe('2i');
    expect(composeCartesian(numericPart(-1e-17, fmt), numericPart(-1e-17, fmt))).toBe('0');
    expect(composeCartesian(numericPart(1.879, fmt), numericPart(-0.684, fmt))).toBe('1.879-0.684i');
    expect(composeCartesian(numericPart(0, fmt), numericPart(-1, fmt))).toBe('-i');
  });
});
