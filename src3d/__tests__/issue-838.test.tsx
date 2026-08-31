/**
 * #838 (ADR-3D-190) — A HEBREW ROW IS ORDERED AS HEBREW, even when it contains maths.
 *
 * Operator, playing prod 2026-08-31: *"the inputs are not shown bidi"*. The fact row for
 * «BE מוכל במישור ABCD» displayed with its operands swapped — it read as if ABCD were contained in BE,
 * and the operator reported it as a containment bug because that is what it said.
 *
 * `VecMath`'s `<math>` wrapper was hard-coded `dir="ltr"` and wraps the WHOLE row, prose included, so a
 * Hebrew sentence containing two point-pairs was laid out left-to-right. ADR-3D-184 left this branch
 * alone on the argument that the per-token structure was enough; the tokens were structural, and the
 * wrapper around them was overriding the direction they should have been ordered in.
 */
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { VecMath, tokenizeRow } from '../render/VecMath';
import { textDir3 } from '../i18n/bidi';
import { COMMAND_CATALOG_3D } from '../parser/catalog3';

const VECS = new Set(['u', 'v', 'w']);
const render = (s: string) => renderToStaticMarkup(<VecMath text={s} vecNames={VECS} />);
const mathDir = (s: string) => render(s).match(/<math[^>]*dir="(\w+)"/)?.[1] ?? null;
const structural = (s: string) => tokenizeRow(s, VECS).some((t) => t.k === 'pair' || t.k === 'vec' || t.k === 'frac');

describe('#838 — the operator’s rows', () => {
  it.each([
    'BE מוכל במישור ABCD',
    'E אמצע AC',
    'קטע BE',
  ])('«%s» is a Hebrew sentence and is ordered RTL', (s) => {
    expect(structural(s), 'takes the MathML path, which is where the defect lived').toBe(true);
    expect(mathDir(s)).toBe('rtl');
  });

  it('the reported row keeps its operands in TYPED order', () => {
    const html = render('BE מוכל במישור ABCD');
    // in the markup the tokens stay in source order; the wrapper's `rtl` is what makes the RENDERED
    // reading order match it. Assert both halves: source order, and the direction that preserves it.
    expect(html.indexOf('BE')).toBeLessThan(html.indexOf('ABCD'));
    expect(mathDir('BE מוכל במישור ABCD')).toBe('rtl');
  });
});

describe('#838 — a pure expression is untouched', () => {
  it.each(['|AB| = 4', 'u·v', 'AB = u'])('«%s» stays LTR', (s) => {
    expect(mathDir(s)).toBe('ltr');
  });

  it('the PROSE path is unchanged — ADR-3D-184 still holds where it was true', () => {
    const html = render('מישור ABC');
    expect(html).not.toContain('<math'); // prose rows never enter the math element
  });
});

describe('#838 — the property, so it cannot regress by another route', () => {
  /**
   * The wrapper's direction must AGREE with the row's own content for every utterance the tool
   * advertises — the drift-net shape `bidi3.test.ts` uses for the palette (#482).
   */
  it('every catalog utterance renders in the direction its text calls for', () => {
    for (const c of COMMAND_CATALOG_3D) {
      for (const raw of [c.he, c.en]) {
        if (!raw || !structural(raw)) continue;
        expect(mathDir(raw), raw).toBe(textDir3(raw));
      }
    }
  });
});
