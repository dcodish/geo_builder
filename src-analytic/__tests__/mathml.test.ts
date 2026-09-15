/**
 * THE PANEL'S MATHEMATICS AS MATHML (#1082).
 *
 * Operator, 2026-09-15: *"data panel should be in mathml"*, looking at a panel that printed
 * `B = (x_B, -x_B + 2)` — a subscript rendered as an underscore and a power as a caret.
 *
 * These assert the MARKUP rather than how it looks, because the markup is what a browser renders and
 * what a screen reader reads, and because invalid MathML does not fail — it renders as something
 * else, silently.
 */
import { describe, expect, it } from 'vitest';
import { exprMathML, normalizeMath, parseExpr, type Expr } from '../engine/expr';

const ml = (src: string) => exprMathML(parseExpr(normalizeMath(src))!);

describe('#1082 — the structured forms are structure, not punctuation', () => {
  it('a power is <msup>, not a caret', () => {
    expect(ml('y^2')).toBe('<msup><mrow><mi>y</mi></mrow><mrow><mn>2</mn></mrow></msup>');
  });

  it('a quotient is a real <mfrac>', () => {
    expect(ml('a/b')).toBe('<mfrac><mrow><mi>a</mi></mrow><mrow><mi>b</mi></mrow></mfrac>');
  });

  it('a radical is <msqrt>', () => {
    expect(ml('√5')).toContain('<msqrt>');
  });

  it('a SUBSCRIPT is <msub>, which is the row the operator was looking at', () => {
    // `x_B` is constructed by the panel and `r_O` by the engine (#1060); neither is ever parsed,
    // because the lexer's symbols are single characters.
    expect(exprMathML({ kind: 'sym', name: 'x_B' })).toBe('<msub><mi>x</mi><mi>B</mi></msub>');
    expect(exprMathML({ kind: 'sym', name: 'r_O' })).toBe('<msub><mi>r</mi><mi>O</mi></msub>');
  });

  it('multiplication is the INVISIBLE times, which is what 2a means', () => {
    expect(ml('2a')).toBe('<mn>2</mn><mo>&#x2062;</mo><mi>a</mi>');
  });
});

describe('#1082 — the markup is VALID, which is the part that fails silently', () => {
  /**
   * `<msup>`, `<mfrac>` and `<msqrt>` take a fixed number of children — two, two and one. Handing
   * `(x - a)` to `<msup>` as its six separate tokens is invalid, and a browser renders it as
   * something else rather than refusing it.
   */
  const childrenOf = (markup: string, tag: string): number[] => {
    // Count the top-level children inside each occurrence of `tag`, by depth.
    const counts: number[] = [];
    const tokens = markup.match(/<\/?[a-z]+>/g) ?? [];
    let depth = -1;
    let children = 0;
    let inner = 0;
    for (const tok of tokens) {
      const close = tok.startsWith('</');
      const name = tok.replace(/[</>]/g, '');
      if (!close && name === tag && depth < 0) {
        depth = 0;
        children = 0;
        inner = 0;
        continue;
      }
      if (depth < 0) continue;
      if (!close) {
        if (inner === 0) children += 1;
        inner += 1;
      } else {
        if (name === tag && inner === 0) {
          counts.push(children);
          depth = -1;
          continue;
        }
        inner -= 1;
      }
    }
    return counts;
  };

  it('a parenthesised base is ONE grouped child of <msup>', () => {
    const markup = ml('(x-a)^2');
    expect(markup).toContain('<msup><mrow><mo>(</mo>');
    expect(childrenOf(markup, 'msup')).toEqual([2]);
  });

  it('every <mfrac> and <msqrt> takes its exact arity too', () => {
    expect(childrenOf(ml('x^2/9+y^2/4-1'), 'mfrac')).toEqual([2, 2]);
    expect(childrenOf(ml('4√5'), 'msqrt')).toEqual([1]);
  });

  it('every tag opened is closed', () => {
    for (const src of ['y^2-2px', 'x^2/9+y^2/4-1', '(x-a)^2+(y-4)^2-9', '4√5', 'a/b/c']) {
      const markup = ml(src);
      const opens = (markup.match(/<[a-z]+>/g) ?? []).length;
      const closes = (markup.match(/<\/[a-z]+>/g) ?? []).length;
      expect(opens, src).toBe(closes);
    }
  });

  it('a symbol that could carry markup is escaped', () => {
    const risky: Expr = { kind: 'sym', name: '<b' };
    expect(exprMathML(risky)).toBe('<mi>&lt;b</mi>');
  });
});
