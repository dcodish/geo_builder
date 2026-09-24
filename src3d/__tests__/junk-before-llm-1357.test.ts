/**
 * #1357 (defect 1), 3-D — junk never reaches the paid call.
 *
 * 3-D had no `unrelated` category at all: every `not-understood` that no guidance pattern matched went
 * to `escalate3`. `classifyGuidance3` now ends with the shared POSITIVE test
 * (`shell/llm/constructionSignal.ts`), and `App3.submitText` already short-circuits every guidance
 * category before the model. The catalog's NO-THEFT sweep (`scope3.test.ts`) is the net that keeps the
 * new fallback off every supported line; it is re-asserted here for the new category by name.
 */
import { describe, expect, it } from 'vitest';
import { classifyGuidance3 } from '../parser/scope3';
import { COMMAND_CATALOG_3D } from '../parser/catalog3';
import he from '../i18n/locales/he.json';
import en from '../i18n/locales/en.json';

const JUNK = [
  'asdkjh', 'qqqqqqqq', '....', 'aaaa bbbb cccc', 'lorem ipsum dolor sit', 'סתם משהו', 'אבגדהוז', '!!!!',
  'hello there friend', 'שלום מה נשמע', '12345', 'xkcd 42 zz', 'Hello there', 'Lorem Ipsum',
];

describe('#1357 — 3-D junk is answered as unrelated, before the model', () => {
  it.each(JUNK)('«%s» → unrelated', (u) => {
    expect(classifyGuidance3(u)).toEqual({ category: 'unrelated', messageKey: 'scope.unrelated' });
  });

  it('the message exists in both locales', () => {
    expect(he.scope.unrelated).toMatch(/בנייה גאומטרית/);
    expect(en.scope.unrelated).toMatch(/geometric construction/);
  });

  it.each(['הנקודה K היא מפגש האלכסונים של הפאה', 'the sphere through A B C D', 'חתך התיבה עם המישור'])(
    'real space geometry the grammar may lack is never brushed off: «%s»',
    (u) => {
      expect(classifyGuidance3(u)?.category).not.toBe('unrelated');
    },
  );

  it('no supported catalog line, in either language, scores zero', () => {
    const brushed = COMMAND_CATALOG_3D.flatMap((c) => [c.he, c.en]).filter(
      (u) => classifyGuidance3(u)?.category === 'unrelated',
    );
    expect(brushed).toEqual([]);
  });
});
