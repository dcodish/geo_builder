/**
 * #1477 — the 2-D half of the About-content lock (docs/28 §5c, ADR-W-091).
 *
 * The shared rows run 2-D's REAL declaration through its REAL i18n, and every try step through the
 * extracted submit gate (`submit-gate.ts` → `gateVerdict`, the deterministic half of `App.submit`),
 * in order, from an empty canvas.
 *
 * The extra row is the migration's promise: 2-D wrote the full About first, and moving it onto the
 * shared declaration must not change one character a student reads. The pinned text is the pre-#1477
 * inline JSX (`src/App.tsx` `aboutBody`) rendered and stripped of markup, per locale.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import i18n from '../i18n';
import { aboutContent } from '../ui/about';
import { AboutBody } from '../../shell/frame/about';
import { aboutContentSuite, type StepVerdict } from '../../shell/__tests__/fixtures/about-content-rows';
import { gateVerdict } from './submit-gate';
import { factsOf } from './scenario-pipeline';

const declare = (lng: string) => aboutContent(i18n.getFixedT(lng));

function run(steps: readonly string[]): StepVerdict[] {
  const done: string[] = [];
  return steps.map((step) => {
    const v = gateVerdict(factsOf(done), step);
    done.push(step);
    return v.kind === 'commit' ? { step, ok: true } : { step, ok: false, why: JSON.stringify(v) };
  });
}

aboutContentSuite('2d', declare, run);

const LRI = '⁦';
const PDI = '⁩';
/** The pre-#1477 About, as the student read it (markup stripped), block by block. */
const BEFORE: Record<string, string[]> = {
  he: [
    'כלי אינטואיטיבי לבניית תרשימים בגיאומטריה — תארו בנייה גיאומטרית בעברית פשוטה, והצורה תיבנה לנגד עיניכם, צעד אחר צעד.',
    'מיועד לתלמידי תיכון הנבחנים בגיאומטריה לבגרות וגם למורים שצריכים לשרטט צורה במהירות ופשטות.',
    'מוסיפים נתון אחד בכל פעם — והצורה מסתגלת ככל שמצטברים נתונים.',
    'הכלי מצייר את האיור לפי מה שתיארתם — הוא אינו פותר שאלות.',
    'הזינו את נתוני השאלה כפי שמופיעים בשאלה:',
    `ריבוע ${LRI}ABCD${PDI}`,
    `נקודה ${LRI}G${PDI} על ${LRI}AD${PDI}`,
    `זווית ${LRI}GBA = 37°${PDI}`,
    'פותח על־ידי ד"ר דוד קודיש · לשאלות: david.codish@gmail.com',
  ],
  en: [
    'An intuitive tool for building geometry diagrams — describe a construction in plain language and watch the figure build, step by step.',
    'For high-school students preparing for the geometry matriculation (bagrut), and for teachers who need to sketch a figure quickly and simply.',
    'Add one fact at a time — the figure adapts as the givens accumulate.',
    'It draws the figure from what you describe — it does not solve problems.',
    'Enter the given data exactly as it appears in the question:',
    'square ABCD',
    'point G on AD',
    'angle GBA = 37°',
    'Developed by Dr. David Codish · Questions: david.codish@gmail.com',
  ],
};

describe('#1477 — 2-D\'s About text is byte-identical after the move onto the declaration', () => {
  for (const lng of ['he', 'en']) {
    it(`${lng}: the rendered text equals the pre-#1477 About`, () => {
      const html = renderToStaticMarkup(createElement(AboutBody, { content: declare(lng) }));
      const text = html.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
      expect(text).toBe(BEFORE[lng].join(''));
    });
  }
});
