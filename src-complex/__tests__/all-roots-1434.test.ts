/**
 * #1434 (ADR-CX-050) — «z²−4z+13=0 shows one of its two roots, z³−1=0 one of three».
 *
 * Root cause, two arms of one class — *an equation about one letter reached the solution-set reading
 * only in the spelling `X^n = expr`*:
 *
 *  1. `z^3 - 1 = 0`, `z^3 + 8 = 0`, `2z^3 = 16` ARE `X^n = expr`, but the parser's roots shape only
 *     matched a power on the left of `=`, so they became one ordinary constraint on one point z.
 *  2. A general polynomial (G1, ADR-CX-007) had no solution-set reading at all.
 *
 * Every case runs the REAL submit path — `submitLine` per line through the acceptance gate, asks routed
 * to the lane — and then the fold at 24 seeds.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { stripFormatControls } from '../../shell/bidi';
import { deriveLines } from '../app/deriveLines';
import { submitLine } from '../app/submit';
import { complexI18n } from '../i18n';
import { asRootsEquation } from '../model/solutionSet';
import { parseExpr } from '../parser/exprParse';
import { whyText } from '../replay/scene2';
import { polySolutions } from '../solve/polySet';
import { useComplexStore } from '../store/useComplexStore';
import { isExact } from '../value/value';

const store = () => useComplexStore.getState();
const SEEDS = Array.from({ length: 24 }, (_, s) => s);

beforeEach(() => store().resetSession());

const feed = (lines: readonly string[], asks: readonly string[] = []) => {
  for (const l of [...lines, ...asks]) expect(submitLine(l), `refused «${l}»`).toBe(true);
};
const at = (seed: number) => deriveLines(store().lines, seed, seed, store().queries);
/** the drawn numbers (the origin left out), as the cartesian reading a student sees */
const drawn = (seed: number) =>
  at(seed)
    .points.filter((p) => p.name !== 'o')
    .map((p) => p.readingCart);
/** the same at every one of the 24 seeds — a named set is ONE drawing */
const drawnEverywhere = () => {
  const first = drawn(0);
  for (const s of SEEDS) expect(drawn(s)).toEqual(first);
  return first;
};
const row = (seed: number, label: string) => at(seed).knowledge.find((k) => k.label === label)!;

describe('#1434 lock — z²−4z+13=0 draws z₁ = 2+3i and z₂ = 2−3i, named and exact', () => {
  beforeEach(() => feed(['z^2-4z+13=0'], ['|z1|', '|z2|', 'z1*z2']));

  it('both roots are drawn, named in argument order, at every seed', () => {
    expect(drawnEverywhere()).toEqual(['z₁ = 2+3i', 'z₂ = 2-3i']);
    expect(at(0).configCount).toBe(1);
    expect(at(0).canCycle).toBe(false);
  });

  it('the roots are EXACT carriers: |z₁| = |z₂| = √13 print exactly, and z₁·z₂ = 13', () => {
    const pts = at(0).points.filter((p) => p.name !== 'o');
    for (const p of pts) expect(p.modulusKnown && p.argumentKnown).toBe(true);
    expect(row(0, '|z1|').value).toBe('√13');
    expect(row(0, '|z2|').value).toBe('√13');
    expect(row(0, 'z1*z2').value).toBe('13');
  });

  it('the letter is reserved: «z = 1» after it is refused, naming the equation', () => {
    expect(submitLine('z = 1')).toBe(false);
    expect(store().lastError).toEqual({
      key: 'refused',
      detail: 'z = 1',
      why: { code: 'reserved-letter', letter: 'z', equation: 'z^2-4z+13=0' },
    });
  });
});

describe('#1434 arm 1 — z^n ± c = 0 and c·z^n = rhs are the X^n = expr family', () => {
  const asPower = (line: string) => {
    feed([line]);
    return drawnEverywhere();
  };

  it('z³−1=0 draws the same three named points as z³=1', () => {
    const spelled = asPower('z^3-1=0');
    store().resetSession();
    expect(asPower('z^3 = 1')).toEqual(spelled);
    expect(spelled.map((r) => r.split(' ')[0])).toEqual(['z₁', 'z₂', 'z₃']);
  });

  it.each([
    ['z^3+8=0', 'z^3 = -8'],
    ['2z^3 = 16', 'z^3 = 8'],
    ['z^4 + 4 = 0', 'z^4 = -4'],
  ])('«%s» reads as «%s»', (spelled, canonical) => {
    const a = asPower(spelled);
    store().resetSession();
    expect(asPower(canonical)).toEqual(a);
  });

  it('the member rule holds in both orders: z₁ = 1 with z³−1=0, before and after', () => {
    feed(['z1 = 1', 'z^3-1=0']);
    const before = drawnEverywhere();
    store().resetSession();
    feed(['z^3-1=0', 'z1 = 1']);
    expect(drawnEverywhere()).toEqual(before);
    expect(before.length).toBe(3);
  });

  it('a coefficient that names an earlier number stays grounded: w = 8 · z³ − w = 0 draws what z³ = w draws', () => {
    feed(['w = 8', 'z^3 - w = 0']);
    const spelled = SEEDS.map(drawn);
    store().resetSession();
    feed(['w = 8', 'z^3 = w']);
    expect(SEEDS.map(drawn)).toEqual(spelled);
    expect(spelled[0].map((r) => r.split(' ')[0])).toEqual(['w', 'z₁', 'z₂', 'z₃']);
  });
});

describe('#1434 arm 2 — G1: a polynomial of degree ≤ 4 in a fresh letter enumerates its roots', () => {
  it('a quartic draws 4 named points: z⁴ − 5z² + 4 = 0 → 1, 2, −1, −2', () => {
    feed(['z^4 - 5z^2 + 4 = 0']);
    expect(drawnEverywhere()).toEqual(['z₁ = 1', 'z₂ = 2', 'z₃ = -1', 'z₄ = -2']);
  });

  it('a quartic with two conjugate pairs relates them exactly: z⁴+10z²+169=0 accepts z₁·z₂ = −13', () => {
    feed(['z^4+10z^2+169=0', 'z1*z2 = -13']);
    expect(drawnEverywhere()).toEqual(['z₁ = 2+3i', 'z₂ = -2+3i', 'z₃ = -2-3i', 'z₄ = 2-3i']);
  });

  it('the corpus witness z² − (1+i)z + 2i + 2 = 0 builds: z₁ = 2i, z₂ = 1−i', () => {
    feed(['z^2 - (1+i)z + 2i + 2 = 0']);
    expect(drawnEverywhere()).toEqual(['z₁ = 2i', 'z₂ = 1-i']);
  });

  it('the letter on both sides reads the same: z² = 4z − 13', () => {
    feed(['z^2 = 4z - 13']);
    expect(drawnEverywhere()).toEqual(['z₁ = 2+3i', 'z₂ = 2-3i']);
  });

  it('2±√2i lifts exactly: |z₁| = √6', () => {
    feed(['z^2-4z+6=0'], ['|z1|', 'Re(z)']);
    expect(row(0, '|z1|').value).toBe('√6');
    expect(row(0, 'Re(z)').value).toBe('2');
  });

  it('roots no small power makes exact (1±√2) are still named, and still answered', () => {
    feed(['z^2 - 2z - 1 = 0'], ['Re(z1)', 'Re(z2)']);
    for (const s of SEEDS) {
      expect(at(s).configCompleteness).toBe('complete');
      expect(row(s, 'Re(z1)').value).toBe('2.41');
      expect(row(s, 'Re(z2)').value).toBe('-0.41');
    }
  });

  it('a stated member claims its root by set membership, in both orders (#1396)', () => {
    feed(['z1 = 2-3i', 'z^2-4z+13=0'], ['Im(z1)']);
    expect(drawnEverywhere()).toEqual(['z₁ = 2-3i', 'z₂ = 2+3i']);
    expect(row(0, 'Im(z1)').value).toBe('-3');
    store().resetSession();
    feed(['z^2-4z+13=0', 'z1 = 2-3i']);
    expect(drawnEverywhere()).toEqual(['z₁ = 2-3i', 'z₂ = 2+3i']);
  });

  it('a member that is no root is refused, naming the student’s statement', () => {
    feed(['z1 = 3+4i']);
    expect(submitLine('z^2-4z+13=0')).toBe(false);
    expect(store().lastError).toMatchObject({ key: 'incompatible', detail: 'z1 = 3+4i' });
  });

  it('an EXISTING letter is verified, not enumerated: z = 2+3i holds, z = 1 is refused', () => {
    feed(['z = 2+3i', 'z^2-4z+13=0']);
    expect(drawnEverywhere()).toEqual(['z = 2+3i']);
    store().resetSession();
    feed(['z = 1']);
    expect(submitLine('z^2-4z+13=0')).toBe(false);
  });

  it('an INDEXED letter is one number: z₁² − 4z₁ + 13 = 0 keeps its two configurations (ADR-CX-049)', () => {
    feed(['z1^2-4z1+13=0']);
    expect(at(0).configCount).toBe(2);
    expect(at(0).points.filter((p) => p.name !== 'o').map((p) => p.name)).toEqual(['z1']);
  });

  it('an indexed letter over a power no longer prints a doubled subscript: z₁³ = 8 is one point', () => {
    feed(['z1^3 = 8']);
    expect(at(0).points.filter((p) => p.name !== 'o').map((p) => p.name)).toEqual(['z1']);
    expect(at(0).configCount).toBe(3);
  });

  it('degree 5, not a binomial, keeps the ADR-CX-049 reading: one point z, five configurations', () => {
    feed(['z^5 + z + 1 = 0']);
    const d = at(0);
    expect(d.points.filter((p) => p.name !== 'o').map((p) => p.name)).toEqual(['z']);
    expect(d.configCount).toBe(5);
    expect(d.configCompleteness).toBe('complete');
  });
});

describe('#1434 — a question about the SET letter is asked of every solution', () => {
  it('z³ = 1: |z| = 1 prints (every root agrees); Re(z) says it differs between the 3 solutions', () => {
    feed(['z^3 = 1'], ['|z|', 'Re(z)']);
    for (const s of SEEDS) {
      expect(row(s, '|z|').value).toBe('1');
      expect(row(s, 'Re(z)').why).toEqual({ code: 'multi-solution', solutions: 3, first: 'z1' });
    }
  });

  it('the sentence, in both languages', () => {
    const fixed = (lng: 'he' | 'en') => {
      const t = complexI18n.getFixedT(lng);
      return (key: string, params?: Record<string, unknown>) => stripFormatControls(t(key, params));
    };
    const why = { code: 'multi-solution', solutions: 2, first: 'z1' } as const;
    expect(whyText(why, fixed('he'))).toBe('הערך שונה בין 2 הפתרונות — שאלו על פתרון אחד, למשל z₁');
    expect(whyText(why, fixed('en'))).toBe('the value differs between the 2 solutions — ask about one of them, e.g. z₁');
  });
});

describe('#1434 — the shapes, read off the syntax tree (model/solutionSet.ts)', () => {
  const shape = (line: string) => {
    const eq = line.indexOf('=');
    const atoms = new Map<string, number>();
    const lhs = parseExpr(line, 0, eq, atoms)!;
    const rhs = parseExpr(line, eq + 1, line.length, atoms)!;
    const s = asRootsEquation(lhs, rhs, line);
    return s && { shape: s.shape, letter: s.varName, n: s.n };
  };

  it.each([
    ['z^3 = 8', { shape: 'power', letter: 'z', n: 3 }],
    ['z^3 - 1 = 0', { shape: 'power', letter: 'z', n: 3 }],
    ['3z^2 + 12 = 0', { shape: 'power', letter: 'z', n: 2 }],
    ['z^2 - 4z + 13 = 0', { shape: 'poly', letter: 'z', n: 2 }],
    ['z^2 = 4z - 13', { shape: 'poly', letter: 'z', n: 2 }],
    ['z^4 + z^3 + 1 = 0', { shape: 'poly', letter: 'z', n: 4 }],
  ])('«%s» → %o', (line, want) => expect(shape(line)).toEqual(want));

  it.each([
    'w = z^2', // the leading power on the right: a definition of w
    'z^2 + w^2 = 0', // two letters of degree 2: a relation
    'z^2 + conj(z) = 0', // not holomorphic
    'z^5 + z + 1 = 0', // above G1's degree bound
    'z + 1 = 3', // degree 1: an ordinary definition
  ])('«%s» is not a solution-set shape', (line) => expect(shape(line)).toBeNull());
});

describe('#1434 — the roots and their exact lift (solve/polySet.ts)', () => {
  const solve = (line: string) => {
    const eq = line.indexOf('=');
    const atoms = new Map<string, number>();
    const s = asRootsEquation(parseExpr(line, 0, eq, atoms)!, parseExpr(line, eq + 1, line.length, atoms)!, line);
    if (s?.shape !== 'poly') throw new Error('not a polynomial');
    return polySolutions(s, atoms)!;
  };

  it('orders by direction, then modulus, and never by seed', () => {
    const r = solve('z^4 - 5z^2 + 4 = 0');
    expect(r.numeric.map((z) => Math.round(z.re))).toEqual([1, 2, -1, -2]);
  });

  it('a conjugate pair shares ONE angle atom, negated', () => {
    const r = solve('z^2 - 4z + 13 = 0');
    expect(r.values.every(isExact)).toBe(true);
    // #1481: 2±3i are Gaussian rationals, so the shared atom is the certified one of 3+2i — the SAME
    // atom a typed «z1 = 2+3i» carries
    expect([...r.atoms.keys()]).toEqual(['∠(3+2i)']);
  });

  it('roots of unity lift to rational turns with no atom at all', () => {
    const r = solve('z^4 + z^3 + z^2 + z + 1 = 0');
    expect(r.values.length).toBe(4);
    expect(r.values.every(isExact)).toBe(true);
    expect(r.atoms.size).toBe(0);
  });

  it('a repeated root is ONE solution: (z−1)²(z+2) = 0 names two', () => {
    expect(solve('z^3 - 3z + 2 = 0').values.length).toBe(2);
  });
});
