/**
 * #1456 ([ADR-W-101](../../docs/06w-decisions-workspace.md#adr-w-101)) — THE GUIDE SPEAKS STUDENT, NOT DEVELOPER.
 *
 * The meta-lock for the shared rule: each class of jargon is caught, in the exact spellings that shipped
 * to prod (the complex and 2-D guides, found by an external review), and no curriculum term is. The
 * per-product locks (`issue-1456-guide-jargon.test.ts` in each tree) call the same `guideJargonIn` over
 * their own catalogs and locales; this file proves that function can fail.
 */
import { describe, expect, it } from 'vitest';
import { guideJargon, guideJargonIn } from '../frame/ManualScreen';

describe('#1456 — guideJargon catches every class that shipped', () => {
  it.each([
    ['שטח — מכוון את הזווית החופשית (המהלך של §2b)', '§2b'],
    ['an area — it drives the free direction (the §2b move)', '§2b'],
    ['משוואה כללית — נפתרת באלימינציה, לא באיטרציה', 'באלימינציה'],
    ['סדרה חשבונית — חיבורית, ולכן נפתרת בשכבה הנומרית', 'בשכבה'],
    ['an arithmetic sequence — additive, so the numeric tier solves it', 'tier'],
    ['הדקדוק לא מזהה את השורה הזו', 'הדקדוק'],
    ['the grammar does not recognize this line', 'grammar'],
    ['the membership plus the distance, composed (#760).', '#760'],
    ['every pair is a chord (issue #151).', '#151'],
    ['its size is a free DOF', 'DOF'],
    ['decided in ADR-W-074', 'ADR-W-074'],
    ['the solver pins it', 'solver'],
    ['the parser reads it', 'parser'],
    ['the engine builds it', 'engine'],
    ['המנוע בונה אותו', 'המנוע'],
  ])('«%s» → %s', (text, token) => {
    expect(guideJargon(text)).toContain(token);
  });

  it.each([
    'פרבולה קנונית',
    'משוואה כללית — המספרים והצמודים שלהם, בכל אחד מהאגפים',
    'שטח — קובע את הזווית שעוד לא נקבעה',
    'גודלו דרגת חופש',
    'an arithmetic sequence — each term minus the one before it is the same',
    'z1 = 3+4i',
    'the tangents meet at D',
    'מספר מדומה טהור',
    'שכיבה', // a word that merely shares letters with a stem is not the stem
  ])('curriculum and plain prose pass: «%s»', (text) => {
    expect(guideJargon(text)).toEqual([]);
  });

  it('`allow` exempts exactly the named token, nothing else', () => {
    expect(guideJargon('the engine and the parser', ['engine'])).toEqual(['parser']);
  });
});

describe('#1456 — guideJargonIn walks every string leaf and names where it found one', () => {
  it('reports the path, the token and the text — nested objects and arrays included', () => {
    const hits = guideJargonIn({
      catalog: [{ he: 'ריבוע ABCD', descEn: 'a square (#12)' }],
      locale: { help: { points: ['plain', 'the grammar says no'] } },
    });
    expect(hits).toEqual([
      'catalog[0].descEn: «#12» in «a square (#12)»',
      'locale.help.points[1]: «grammar» in «the grammar says no»',
    ]);
  });

  it('is empty on clean content (so a product lock asserting [] is meaningful only with content)', () => {
    expect(guideJargonIn({ a: 'ריבוע', b: [1, null, { c: 'x' }] })).toEqual([]);
  });
});
