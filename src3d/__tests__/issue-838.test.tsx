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
/** the direction of the row's OUTERMOST element — the container that orders its pieces */
const rowDir = (s: string) => render(s).match(/^<(?:span|math)[^>]*dir="(\w+)"/)?.[1] ?? null;
/** every expression island must stay internally LTR whatever the row does */
const islandDirs = (s: string) => [...render(s).matchAll(/<math[^>]*dir="(\w+)"/g)].map((m) => m[1]);
const structural = (s: string) => tokenizeRow(s, VECS).some((t) => t.k === 'pair' || t.k === 'vec' || t.k === 'frac');

describe('#838 — the operator’s rows', () => {
  it.each([
    'BE מוכל במישור ABCD',
    'E אמצע AC',
    'קטע BE',
  ])('«%s» is a Hebrew sentence and is ordered RTL', (s) => {
    expect(structural(s), 'takes the MathML path, which is where the defect lived').toBe(true);
    expect(rowDir(s)).toBe('rtl');
    // and the maths inside it stays LTR — the islands were never the problem
    expect(islandDirs(s).every((d) => d === 'ltr')).toBe(true);
  });

  it('the reported row keeps its operands in TYPED order', () => {
    const html = render('BE מוכל במישור ABCD');
    expect(html.indexOf('BE')).toBeLessThan(html.indexOf('ABCD')); // source order preserved
    expect(rowDir('BE מוכל במישור ABCD')).toBe('rtl'); // …and ordered by the container that reads RTL
  });

  /**
   * Am. 1 — the fix that actually worked. MathML's own `dir` did not reorder (the operator saw the row
   * still reversed after ADR-3D-190), so prose no longer lives inside the math element at all: the
   * ordering is done by HTML bidi on the container, and a Latin run the tokenizer left as PROSE
   * («ABCD» is four letters — a `text` token, not a pair) is isolated by the #482 chokepoint.
   */
  it('prose is OUTSIDE the math element, and its Latin runs are isolated', () => {
    const html = render('BE מוכל במישור ABCD');
    const prose = html.slice(html.indexOf('</math>'));
    expect(prose).toContain('מוכל במישור');
    expect(prose).toMatch(/⁦ABCD⁩/); // LRI … PDI around the run the tokenizer left as text
  });
});

describe('#838 — a pure expression is untouched', () => {
  it.each(['|AB| = 4', 'u·v', 'AB = u'])('«%s» stays LTR and is a single math element', (s) => {
    expect(rowDir(s)).toBe('ltr');
    expect(islandDirs(s)).toHaveLength(1); // byte-identical to before the fix — one <math>, not islands
    expect(render(s)).toContain('<math'); // and it is still the math element, not a span
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
        expect(rowDir(raw), raw).toBe(textDir3(raw));
      }
    }
  });
});
