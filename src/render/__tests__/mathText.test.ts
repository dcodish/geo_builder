/**
 * MathML rendering of math-flavoured utterance text (#77 Am. / #40, ADR-298 Am.). Fractions, radicals
 * (incl. the √() grouping), subscripts and superscripts become MathML; everything else stays verbatim.
 */
import { describe, it, expect } from 'vitest';
import { mathHtml, hasMath } from '../mathText';

describe('hasMath', () => {
  it('detects radicals / fractions / subscripts / powers', () => {
    for (const t of ['BC = 35/√32', 'BC = √(2/3)', 'S_{ABC} = 13', 'AB = x²', 'AB = 3/4']) expect(hasMath(t), t).toBe(true);
  });
  it('is false for plain / symbol-only text', () => {
    for (const t of ['משולש ABC', 'AB ⊥ CD', '∠ABC = 37', 'square ABCD']) expect(hasMath(t), t).toBe(false);
  });
});

describe('mathHtml — MathML for the math tokens, verbatim text otherwise', () => {
  it('35/√32 → a fraction with a radical denominator', () => {
    expect(mathHtml('BC = 35/√32')).toBe('BC = <math><mfrac><mn>35</mn><msqrt><mn>32</mn></msqrt></mfrac></math>');
  });
  it('√(2/3) → a radical OVER the fraction (the √() grouping is honoured)', () => {
    expect(mathHtml('BC = √(2/3)')).toBe('BC = <math><msqrt><mfrac><mn>2</mn><mn>3</mn></mfrac></msqrt></math>');
  });
  it('√2/3 → (√2)/3 — DIFFERENT from √(2/3), disambiguated visually', () => {
    expect(mathHtml('BC = √2/3')).toBe('BC = <math><mfrac><msqrt><mn>2</mn></msqrt><mn>3</mn></mfrac></math>');
  });
  it('5√2/3 → (5·√2)/3', () => {
    expect(mathHtml('BC = 5√2/3')).toBe('BC = <math><mfrac><mrow><mn>5</mn><msqrt><mn>2</mn></msqrt></mrow><mn>3</mn></mfrac></math>');
  });
  it('S_{ABC} → a subscript', () => {
    expect(mathHtml('S_{ABC} = 13')).toBe('<math><msub><mi>S</mi><mi>ABC</mi></msub></math> = 13');
  });
  it('x² → a superscript', () => {
    expect(mathHtml('AB = x²')).toBe('AB = <math><msup><mi>x</mi><mn>2</mn></msup></math>');
  });
  it('an arc measure renders as the textbook OVER-ARC — glyph, word, and ⌢{} template forms (#155 / ADR-335)', () => {
    const arc = (pair: string) => `<math><mover accent="true"><mi>${pair}</mi><mo stretchy="true">⏜</mo></mover></math>`;
    expect(mathHtml('⌢AC')).toBe(arc('AC'));
    expect(mathHtml('קשת AC + קשת BE = קשת AD + קשת BC')).toBe(`${arc('AC')} + ${arc('BE')} = ${arc('AD')} + ${arc('BC')}`);
    expect(mathHtml('arc DE = 2 arc CE')).toBe(`${arc('DE')} = 2 ${arc('CE')}`);
    // the ⌢{} toolbar template (the √()/S_{} discipline): braces absorbed into the over-arc
    expect(mathHtml('⌢{AC} + ⌢{BE} = ⌢{AD} + ⌢{BC}')).toBe(`${arc('AC')} + ${arc('BE')} = ${arc('AD')} + ${arc('BC')}`);
    expect(mathHtml('קשת{AC}')).toBe(arc('AC'));
  });
  it('a QUALIFIED arc reference (not a measure) stays plain text', () => {
    expect(mathHtml('D אמצע הקשת הקטנה AB')).toBe('D אמצע הקשת הקטנה AB'); // no pair right after the word
  });
  it('leaves non-math text (Hebrew, labels, symbols) verbatim', () => {
    expect(mathHtml('משולש ABC')).toBe('משולש ABC');
    expect(mathHtml('AB ⊥ CD')).toBe('AB ⊥ CD');
    expect(mathHtml('∠ABC = 37')).toBe('∠ABC = 37'); // a lone number is NOT wrapped
  });
  it('escapes HTML in the verbatim text (no injection)', () => {
    expect(mathHtml('a < b')).toBe('a &lt; b');
  });
});
