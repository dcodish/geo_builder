/**
 * #1540 (ADR-W-111) — THE BARE SUBSCRIPT TYPESETS, IN EVERY PRODUCT.
 *
 * Operator, 2026-09-29, analytic: *"the x_B>x_D in input is not shown mathml"*. The shared renderer's
 * subscript rule was braces-only (`x_{B}`), while the bare `x_B` is the catalog's canonical spelling.
 * Every product's rows go through `shell/math`, so this is one lock for all four. The four-catalog
 * sweep is `fixtures/issue-1540-subscript-sweep.ts`, run by each product against its own catalog
 * (`shell/` may not import the product trees).
 */
import { describe, expect, it } from 'vitest';
import { hasMath, mathHtml } from '../math';

/** What every product's row does: typeset when `hasMath`, else the verbatim text. */
const display = (t: string) => (hasMath(t) ? mathHtml(t) : t);
/** The text that is NOT inside a MathML island. */
const outsideMath = (html: string) => html.replace(/<math>[\s\S]*?<\/math>/g, '');
/** Rewrite every bare subscript to the braced spelling (same lookbehind as the renderer). */
const braced = (t: string) => t.replace(/(?<![A-Za-z0-9])([A-Za-z])_([A-Za-z0-9]+)/g, '$1_{$2}');

describe('#1540 — the issue’s measurement table, both spellings', () => {
  const rows: Array<[string, string[]]> = [
    ['x_B>x_D', ['<msub><mi>x</mi><mi>B</mi></msub>', '<msub><mi>x</mi><mi>D</mi></msub>']],
    ['x_B = 3', ['<msub><mi>x</mi><mi>B</mi></msub>']],
    ['x_A < 2', ['<msub><mi>x</mi><mi>A</mi></msub>']],
    ['y_M=4', ['<msub><mi>y</mi><mi>M</mi></msub>']],
    ['x_B ≥ x_D', ['<msub><mi>x</mi><mi>B</mi></msub>', '<msub><mi>x</mi><mi>D</mi></msub>']],
    ['S_ABC = 12', ['<msub><mi>S</mi><mi>ABC</mi></msub>']],
    ['d_AB=5', ['<msub><mi>d</mi><mi>AB</mi></msub>']],
  ];
  for (const [bare, subs] of rows) {
    it(`«${bare}» typesets its subscript(s) and leaves no literal underscore`, () => {
      expect(hasMath(bare)).toBe(true);
      const html = mathHtml(bare);
      for (const s of subs) expect(html).toContain(s);
      expect(outsideMath(html)).not.toContain('_');
    });
    it(`«${bare}» renders byte-identically to «${braced(bare)}»`, () => {
      expect(braced(bare)).not.toBe(bare);
      expect(hasMath(braced(bare))).toBe(true);
      expect(mathHtml(bare)).toBe(mathHtml(braced(bare)));
    });
  }

  it('the bare run ends at the first non-alphanumeric: `x_B>x_D` is sub B, then `>`', () => {
    expect(mathHtml('x_B>x_D')).toBe(
      '<math><msub><mi>x</mi><mi>B</mi></msub></math>&gt;<math><msub><mi>x</mi><mi>D</mi></msub></math>',
    );
  });
});

describe('#1540 — inside an expression', () => {
  it('`(x_A+x_B)/2` is ONE fraction carrying two subscripts', () => {
    const html = mathHtml('(x_A+x_B)/2');
    expect(html.match(/<math>/g)).toHaveLength(1);
    expect(html.match(/<mfrac>/g)).toHaveLength(1);
    expect(html.match(/<msub>/g)).toHaveLength(2);
    expect(html).toBe(mathHtml('(x_{A}+x_{B})/2'));
  });
});

describe('#1540 — negative controls: an underscore inside a word stays text', () => {
  for (const t of ['foo_bar', 'seg_AB = 3', 'abc_d', 'max_x/2']) {
    it(`«${t}» keeps its underscore as text`, () => {
      expect(outsideMath(display(t))).toContain('_');
      expect(display(t)).not.toContain('<msub>');
    });
  }
  it('a digit before the underscore is not a subscript base', () => {
    expect(display('1_000')).toBe('1_000');
  });
});
