/**
 * THE INPUT PANEL IS MATHML TOO (#1097).
 *
 * Operator, 2026-09-16: *"input panel is not mathml"*, with a screenshot of the givens list showing
 * «נתון מעגל O שמשוואתו (x-3)^2+(y-5)^2=25» as raw typed text. The #1082 ruling («data panel should
 * be in mathml») had been applied to one panel and not the other.
 *
 * ## The measurement that changed the fix
 *
 * "Call `MathText`" would have shipped a change that did nothing for the reported line. Measured
 * BEFORE writing anything, `mathHtml` typeset `y^2` and left `(x-3)^2` completely alone, because
 * `SUP` accepted only a single-character base — and a parenthesised base is the commonest form this
 * product sees, since every circle equation is `(x-a)^2+(y-b)^2=r^2`.
 *
 * So the real defect was in the SHARED renderer, and it is fixed there.
 */
import { describe, expect, it } from 'vitest';
import { hasMath, mathHtml } from '../../shell/math';
import { analyticBidi } from '../i18n';

const rendered = (line: string) => mathHtml(analyticBidi.isolateLtrRuns(line));

describe('#1097 — a parenthesised power typesets', () => {
  it('the operator’s own line renders BOTH squares as MathML', () => {
    const html = rendered('נתון מעגל O שמשוואתו (x-3)^2+(y-5)^2=25');
    expect(html).toContain('<msup>');
    // (x-3) and (y-5), each as a row of real maths rather than a quoted blob
    expect(html).toContain('<mrow><mo>(</mo><mi>x</mi><mo>-</mo><mn>3</mn><mo>)</mo></mrow>');
    expect(html).toContain('<mrow><mo>(</mo><mi>y</mi><mo>-</mo><mn>5</mn><mo>)</mo></mrow>');
    // ...and the `^2` the student read back before is gone from the output
    expect(html).not.toContain('^2');
  });

  it('a single-symbol power still works — the case that already did', () => {
    expect(rendered('נתונה פרבולה קנונית שמשוואתה y^2=54x')).toContain('<msup><mi>y</mi><mn>2</mn></msup>');
  });

  it('the pre-composed ² is unchanged', () => {
    expect(mathHtml('x²')).toContain('<msup>');
  });

  it('a nested group is left ALONE rather than half-rendered', () => {
    // `[^()]+` matches one flat group on purpose: inventing a parser to typeset a form the corpus
    // never writes is how a renderer acquires bugs nobody can reproduce.
    const html = mathHtml('((x-1)(x+1))^2');
    expect(html).not.toContain('<mrow><mo>(</mo><mo>(</mo>');
  });
});

describe('#1097 — the Hebrew is not touched, and the bidi survives', () => {
  it('the sentence around the formula stays text', () => {
    const html = rendered('נתון מעגל O שמשוואתו (x-3)^2+(y-5)^2=25');
    expect(html).toContain('נתון מעגל');
    expect(html).toContain('שמשוואתו');
  });

  it('the isolate characters ride through untouched', () => {
    // `mathHtml` escapes everything that is not a maths token, so the runs `shell/bidi` decided
    // are still isolated after typesetting — the two mechanisms compose rather than fight.
    const html = rendered('נתון מעגל O שמשוואתו (x-3)^2+(y-5)^2=25');
    expect(html).toContain('⁦'); // LRI
    expect(html).toContain('⁩'); // PDI
  });

  it('a line with no maths renders no MathML', () => {
    expect(hasMath('משולש ABC')).toBe(false);
    expect(rendered('משולש ABC')).not.toContain('<math>');
    expect(rendered('משולש ABC')).toContain('ABC');
  });

  it('and nothing is dropped — the text round-trips once the markup is stripped', () => {
    const line = 'נתון מעגל O שמשוואתו (x-3)^2+(y-5)^2=25';
    const text = rendered(line)
      .replace(/<[^>]+>/g, '')
      .replace(/[⁦-⁩]/g, '');
    // Every symbol the student typed is still present, in order, once tags and isolates are removed.
    expect(text.replace(/\s+/g, '')).toContain('(x-3)2+(y-5)2=25'.replace(/\s+/g, ''));
  });
});

describe('#1097 — presentation only', () => {
  it('the row renders markup but the SOURCE line is untouched', () => {
    // The rule `QuickChips`' `display` follows and #1088 extended to the strip: what is shown and
    // what is stored can never drift, because only one of them is derived.
    const line = 'נתון מעגל O שמשוואתו (x-3)^2+(y-5)^2=25';
    expect(rendered(line)).not.toBe(line);
    expect(line).toBe('נתון מעגל O שמשוואתו (x-3)^2+(y-5)^2=25');
  });

  it('App.tsx feeds the editor the RAW line, not the rendered one', () => {
    // A source-scan, because this is the property a refactor silently breaks: pressing ✎ must show
    // what the student wrote.
    const src = require('node:fs').readFileSync(
      require('node:path').resolve(__dirname, '..', 'App.tsx'),
      'utf8',
    ) as string;
    expect(src).toContain('editValueOf={(id) => lines[Number(id)] ?? \'\'}');
  });
});
