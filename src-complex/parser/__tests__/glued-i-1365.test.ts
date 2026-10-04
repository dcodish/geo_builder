/**
 * #1365 (ADR-CX-058) — the lexer's glued-`i` decision: `bi` is `b·i`, `ib` is `i·b`.
 *
 * Every case CALLS the decision (`gluedI`) or the real expression parser (`parseExpr`), never a
 * re-implementation (#1102/#1118). The split is unambiguous only for a PARAMETER letter glued to `i`
 * at the END of a term; a complex letter (`zi`, `wi`, a declared family, a point label), a constant
 * (`ii`, `oi`), a run glued to a following operand (`ib z1`, `in Q2`) and the known words `pi` / `im`
 * stay one name, so ADR-CX-040's floor refuses the line exactly as before.
 */
import { describe, expect, it } from 'vitest';
import { gluedI, gluedISpelledOut, parseExpr } from '../exprParse';
import { paramsOf, refsOf } from '../../model/expr';

describe('#1365 — the textbook symbolic cartesian forms parse as the EXPLICIT product', () => {
  it.each([
    ['a+bi', 'a+b*i'],
    ['a-bi', 'a-b*i'],
    ['a+ib', 'a+i*b'],
    ['x+yi', 'x+y*i'],
    ['c+di', 'c+d*i'],
    ['-a-bi', '-a-b*i'],
    ['bi', 'b*i'],
    ['2+bi', '2+b*i'],
    ['3bi', '3*b*i'],
    ['(a+bi)/2', '(a+b*i)/2'],
    ['|a+bi|', '|a+b*i|'],
    ['a + bi', 'a + b*i'],
  ])('«%s» ≡ «%s»', (glued, explicit) => {
    const e = parseExpr(glued);
    expect(e).not.toBeNull();
    expect(e).toEqual(parseExpr(explicit));
  });

  it('the parameters are REAL parameters, never complex names', () => {
    expect(paramsOf(parseExpr('a+bi')!)).toEqual(['a', 'b']);
    expect(refsOf(parseExpr('a+bi')!)).toEqual([]);
  });

  it('a numeric literal is unchanged: «3+4i» still folds to one exact value', () => {
    expect(parseExpr('3+4i')).toMatchObject({ t: 'val', v: { kind: 'exact' } });
  });
});

describe('#1365 — an ambiguous run is NOT split, so the line refuses (ADR-CX-040 floor)', () => {
  it.each(['pi', 'zi', 'wi', 'iz', 'Ai', 'ii', 'oi', 'io', 'im', '3+pi', 'a+zi'])('«%s» does not parse', (src) => {
    expect(parseExpr(src)).toBeNull();
  });

  it('a run glued to a FOLLOWING operand is not a coefficient: «ib z1», «bi z1»', () => {
    expect(parseExpr('ib z1')).toBeNull();
    expect(parseExpr('bi z1')).toBeNull();
  });

  it('a letter DECLARED complex joins the z/w family: «ui» splits without the declaration, not with it', () => {
    expect(parseExpr('2+ui')).toEqual(parseExpr('2+u*i'));
    expect(parseExpr('2+ui', 0, 4, new Map(), new Set(['u']))).toBeNull();
  });

  it('longer runs keep the parameter floor: «abi», «bii», «bi2» refuse', () => {
    for (const src of ['abi', 'bii', 'bi2']) expect(parseExpr(src), src).toBeNull();
  });
});

describe('#1365 — the decision itself', () => {
  const none = new Set<string>();
  it.each([
    ['bi', true, { kind: 'split', letter: 'b', iFirst: false }],
    ['ib', true, { kind: 'split', letter: 'b', iFirst: true }],
    ['zi', true, { kind: 'ambiguous', letter: 'z', iFirst: false, why: 'complex' }],
    ['wi', true, { kind: 'ambiguous', letter: 'w', iFirst: false, why: 'complex' }],
    ['ii', true, { kind: 'ambiguous', letter: 'i', iFirst: false, why: 'constant' }],
    ['oi', true, { kind: 'ambiguous', letter: 'o', iFirst: false, why: 'constant' }],
    ['in', false, { kind: 'ambiguous', letter: 'n', iFirst: true, why: 'glued' }],
    ['pi', true, null],
    ['im', true, null],
    ['ab', true, null],
  ] as const)('gluedI(%s, endsTerm=%s)', (run, ends, want) => {
    expect(gluedI(run, none, ends)).toEqual(want);
  });

  it('the clarification spells the product only for a COMPLEX letter at the end of a term', () => {
    expect(gluedISpelledOut('z1 = zi')).toBe('z1 = z*i');
    expect(gluedISpelledOut('z1 = 3 + wi')).toBe('z1 = 3 + w*i');
    expect(gluedISpelledOut('z1 = 2 + ui', new Set(['u']))).toBe('z1 = 2 + u*i');
    expect(gluedISpelledOut('z1 = pi')).toBeNull();
    expect(gluedISpelledOut('z1 = a+bi')).toBeNull();
    expect(gluedISpelledOut('z1 is real')).toBeNull();
    expect(gluedISpelledOut('zi ברביע השני')).toBeNull();
  });
});
