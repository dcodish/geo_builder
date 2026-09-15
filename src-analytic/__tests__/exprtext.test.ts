/**
 * AN EXPRESSION BACK TO TEXT (#1023), and the row that needed it.
 *
 * The primitive was specified in #1023 and deliberately left unbuilt twice — ADR-AG-036 records
 * why: a mechanism with no caller is this tree's most repeated defect (#1020, #1045, #1065). Its
 * caller is the CURVE ROW, where a curve carrying a free parameter printed a dash and threw away the
 * student's own equation.
 */
import { describe, expect, it } from 'vitest';
import { exprText, normalizeMath, parseExpr } from '../engine/expr';
import { derive } from '../engine/derive';

const text = (src: string) => exprText(parseExpr(normalizeMath(src))!);

describe('#1023 — the printer inverts the parser', () => {
  it('prints what the student wrote, readably', () => {
    expect(text('y^2-2px')).toBe('y^2 - 2·p·x');
    expect(text('(x-a)^2+(y-4)^2-9')).toBe('(x - a)^2 + (y - 4)^2 - 9');
    expect(text('x^2/9+y^2/4-1')).toBe('x^2/9 + y^2/4 - 1');
    expect(text('4√5')).toBe('4·√5');
  });

  it('parenthesises only where it changes the reading', () => {
    // A printer that brackets defensively gives `((a)*(b))+((c))` — correct, unreadable, and not
    // what the student has in their notebook.
    expect(text('a*b+c')).toBe('a·b + c');
    expect(text('(a+b)*c')).toBe('(a + b)·c');
    expect(text('a-(b-c)')).toBe('a - (b - c)');
    expect(text('a-b-c')).toBe('a - b - c');
  });

  it('round-trips: printing then re-parsing means the same thing', () => {
    for (const src of ['y^2-2px', '(x-a)^2+(y-4)^2-9', 'a-(b-c)', '(a+b)*c', 'a/b/c', '2a+3']) {
      const once = text(src);
      const twice = exprText(parseExpr(normalizeMath(once))!);
      expect(twice, src).toBe(once);
    }
  });
});

describe('#1023 — an unfixed curve says its equation instead of a dash', () => {
  /**
   * The caller, and the reason the printer exists. It states no VALUE, so ADR-AG-003 §2 is untouched:
   * it names the dependency, which is more than the dash said and less than a number.
   */
  const openRow = (lines: string[], id?: string) => {
    const d = derive(lines, 0);
    const o = d.construction.objects.find((q) => (id ? q.id === id : q.kind === 'curve' || q.kind === 'circle-at'));
    if (o?.kind === 'curve') return `${exprText(o.curve.eq)} = 0`;
    if (o?.kind === 'circle-at') return `O(${o.centre}), r = ${exprText(o.r)}`;
    return '—';
  };

  it('a parabola whose p is free', () => {
    expect(openRow(['נתונה פרבולה שמשוואתה y^2=2px'])).toBe('y^2 - 2·p·x = 0');
  });

  it('a circle whose centre rides a parameter', () => {
    expect(openRow(['(x-a)^2+(y-4)^2=9'])).toBe('(x - a)^2 + (y - 4)^2 - 9 = 0');
  });

  it('and a circle given by its CENTRE says so, because that is how it was stated (#1060)', () => {
    expect(openRow(['נתון מעגל O'])).toBe('O(O), r = r_O');
  });

  it('a curve the givens DO fix is unaffected — it still prints its numbers', () => {
    // The guard: this must not become a symbolic row for a figure that knows the answer.
    const d = derive(['נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9'], 0);
    expect(d.figure.curves).toHaveLength(1);
    expect(d.figure.curves[0].curve.kind).toBe('circle');
  });
});
