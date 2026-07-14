/**
 * #98 — the on-canvas measure labels render math as pure SVG (radical vinculum, fraction bar) so the
 * PNG/docx export rasterizes them (MathML/foreignObject would export blank). DOM-free static render.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MathSvg } from '../mathSvg';

const svg = (text: string) => renderToStaticMarkup(<MathSvg text={text} cx={100} cy={50} fontSize={16} />);
const lineCount = (s: string) => (s.match(/<line/g) ?? []).length;

describe('MathSvg — measure labels as exportable SVG math (#98)', () => {
  it('a radical draws a √ sign, a vinculum over the radicand, and the radicand', () => {
    const s = svg('√7');
    expect(s).toContain('√');
    expect(s).toContain('7');
    expect(lineCount(s), 'vinculum = one bar (halo + stroke = 2 <line>s)').toBe(2);
  });

  it('the √() display parens are dropped', () => {
    expect(svg('√(7)')).not.toContain('(');
  });

  it('a coefficient radical keeps the coefficient before the √', () => {
    const s = svg('12√2');
    expect(s).toContain('12');
    expect(s).toContain('√');
    expect(s).toContain('2');
  });

  it('a fraction draws a bar with numerator and denominator', () => {
    const s = svg('35/√32');
    expect(lineCount(s), 'fraction bar + the radical vinculum').toBe(4); // 2 for the bar, 2 for √32's vinculum
    expect(s).toContain('35');
    expect(s).toContain('32');
  });

  it('a plain label (no radical/fraction) is a single <text>, no rules', () => {
    for (const t of ['37°', '2α', 'k', '6', '13']) {
      const s = svg(t);
      expect(lineCount(s), `${t} draws no bars`).toBe(0);
      expect((s.match(/<text/g) ?? []).length, `${t} is one text`).toBe(1);
    }
  });

  it('forces LTR so the RTL page cannot reorder the runs', () => {
    expect(svg('12√2')).toMatch(/direction:\s*ltr/i);
  });
});
