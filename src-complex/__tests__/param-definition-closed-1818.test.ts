/**
 * #1818 ([ADR-CX-082](../../docs/06d-decisions-complex.md#adr-cx-082)) — a definition whose parameters
 * are known is the number they make it. 2022 חורף Q3 א: «z1 = (2a²+5a+4) + (2a²+3a+2)i»,
 * «z2 = (a²+8a+8) + (2−a²+2a)i», «a = −1», «z1 ו-z2 צמודים זה לזה».
 *
 * Root cause: a number DEFINED by an expression in real parameters was carried only as a deferred
 * numeric residual. It was drawn in the right place, but no exact carrier ever learned its value —
 * the parser folds one line before any parameter is known, and tier 1 reads monomial rows only — so
 * the DOF cue counted it free, its reading had no value and the conjugates claim read "can't tell".
 * The fix (stage 1b): after tier 1, a deferred `name = E` whose parameters are all known exact
 * rationals is closed by the parser's own value core (now `model/fold.ts`) and re-solved as the
 * literal it is. The class covers every polynomial spelling (`a^2`, `a*b`, `a^3`), a parameter the
 * givens SOLVED rather than typed, and the affine spelling (whose DOF count was wrong too).
 */
import { describe, expect, it } from 'vitest';
import { deriveLines } from '../app/deriveLines';
import { closedUnder } from '../model/fold';
import { add, I, mul, param, pow, ref } from '../model/expr';
import { rat } from '../value/rational';

const Z1 = 'z1 = (2a^2+5a+4) + (2a^2+3a+2)i';
const Z2 = 'z2 = (a^2+8a+8) + (2-a^2+2a)i';
const CLAIM = 'z1 ו-z2 צמודים זה לזה';

const ask = (lines: string[], q: string, seed = 0) =>
  deriveLines(lines, 0, seed, [q]).knowledge.find((k) => k.label === q)!;
const point = (lines: string[], name: string) => deriveLines(lines).points.find((p) => p.name === name)!;

describe('#1818 — the exam sequence (2022 חורף א): a = −1 makes z1 = 1+i and z2 = 1−i', () => {
  const orders = [
    ['a = -1', Z1, Z2, CLAIM],
    [Z1, Z2, 'a = -1', CLAIM],
    [Z1, Z2, CLAIM, 'a = -1'],
  ];

  it.each(orders)('every seed of 24: exact, fully determined, the claim holds (%s first)', (...lines) => {
    for (let seed = 0; seed < 24; seed++) {
      const d = deriveLines(lines, 0, seed, ['מהו z1?', 'מהו z2?', '|z1|']);
      expect(d.freeDof).toEqual([]);
      expect(d.claims.map((c) => c.verdict.status)).toEqual(['holds']);
      expect(d.knowledge.map((k) => [k.label, k.value])).toEqual([
        ['z1', '1+i'],
        ['z2', '1-i'],
        ['|z1|', '√2'],
      ]);
    }
  });

  it('z1 reads exactly as the literal 1+i reads, in both views', () => {
    const z1 = point(['a = -1', Z1], 'z1');
    const lit = point(['z1 = 1+i'], 'z1');
    expect([z1.reading, z1.readingCart]).toEqual(['z₁ = √2·cis45°', 'z₁ = 1+i']);
    expect([z1.reading, z1.readingCart]).toEqual([lit.reading, lit.readingCart]);
  });

  it('a FALSE answer, a = 4, is refuted: z1 = 56+46i and z2 = 56−6i are not conjugates', () => {
    const lines = [Z1, Z2, 'a = 4', CLAIM];
    const d = deriveLines(lines, 0, 0, ['מהו z1?', 'מהו z2?']);
    expect(d.claims.map((c) => c.verdict.status)).toEqual(['refuted']);
    expect(d.knowledge.map((k) => k.value)).toEqual(['56+46i', '56-6i']);
    expect(d.freeDof).toEqual([]);
  });

  it('with a still free nothing changes: z1 stays free and the claim cannot be told', () => {
    const d = deriveLines([Z1, Z2, CLAIM]);
    expect(d.freeDof).toContain('a');
    expect(d.claims.map((c) => c.verdict.status)).toEqual(['unknown']);
  });
});

describe('#1818 — the class: any polynomial spelling, a typed or a solved parameter', () => {
  it.each([
    [['a = 2', 'z1 = a^2 + i'], '4+i'],
    [['a = 2', 'b = 3', 'z1 = a*b + i'], '6+i'],
    [['a = 1/2', 'z1 = a^3 + ai'], '1/8+(1/2)i'],
    [['a = 3', 'z1 = a+4i'], '3+4i'],
  ])('%s → z1 = %s, exact, and no longer free', (lines, value) => {
    const d = deriveLines(lines, 0, 0, ['מהו z1?']);
    expect(d.freeDof).toEqual([]);
    expect(d.knowledge[0].value).toBe(value);
  });

  it('a SOLVED parameter closes a definition too: |z1| = 10r makes r = 1/2, so z2 = r^2 + i is 1/4+i', () => {
    const lines = ['z1 = 3+4i', '|z1| = 10r', 'z2 = r^2 + i'];
    const d = deriveLines(lines, 0, 0, ['מהו z2?']);
    expect(d.params).toEqual([{ name: 'r', value: '1/2' }]);
    expect(d.freeDof).toEqual([]);
    expect(d.knowledge[0].value).toBe('1/4+i');
  });

  it('a = 3 · z1 = a+4i: |z1| is the exact 5', () => {
    expect(ask(['a = 3', 'z1 = a+4i'], '|z1|').value).toBe('5');
  });

  it('an IRRATIONAL value (a = √2) is never substituted: nothing is claimed exact that is not', () => {
    const d = deriveLines(['a = √2', 'z1 = a^2 + ai']);
    expect(d.freeDof).toContain('|z1|');
    expect(d.points[0].reading.startsWith('z₁ ≈')).toBe(true);
  });
});

describe('#1818 — closedUnder, the shared value core over known parameters', () => {
  const a = param('a');
  it('closes an integer power exactly', () => {
    const lit = closedUnder(add(mul({ t: 'num', v: rat(2) }, pow(a, rat(2))), I), new Map([['a', rat(-1)]]), new Map());
    expect(lit?.t).toBe('val');
  });
  it('leaves an expression with an unknown parameter, a complex name, or a zero value open', () => {
    expect(closedUnder(add(a, param('b')), new Map([['a', rat(1)]]), new Map())).toBeNull();
    expect(closedUnder(add(a, ref('w')), new Map([['a', rat(1)]]), new Map())).toBeNull();
    expect(closedUnder(add(a, { t: 'num', v: rat(1) }), new Map([['a', rat(-1)]]), new Map())).toBeNull();
  });
  it('a fractional power is not read (a root stays the exact tier\'s)', () => {
    expect(closedUnder(pow(a, rat(1, 2)), new Map([['a', rat(4)]]), new Map())).toBeNull();
  });
});
