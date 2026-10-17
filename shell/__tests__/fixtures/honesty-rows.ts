/**
 * Shared honesty rows (#1906, [ADR-W-144](../../../docs/06w-decisions-workspace.md#adr-w-144)) — the property-word
 * reader's contract, as data every tree's thin lock runs through its OWN vocabulary and lexicon
 * (`src/app/__tests__/issue-1906-ai-answer-words.test.ts`, `src3d/__tests__/issue-1906-ai-answer-words3.test.ts`).
 *
 * `near`: the words of `line` the reader must call a NEAR MISS of a property word (a misspelling the answer must
 * still account for). An empty list: the line holds no near miss at all — a word the grammar reads as itself
 * («מקבילים» is «מקביל» + «ים»), a word that is no property word («צלע»), or a word two edits from every property
 * word (measured in the plan: other real words, «מבחוץ», «שווים», «שיפוע», «קובייה», «תיבה»).
 */
export interface WordRow {
  readonly line: string;
  readonly near: readonly string[];
}

export const NEAR_MISS_ROWS: readonly WordRow[] = [
  // positives: the plan's misspellings
  { line: 'משולש שווה צלעת ABC', near: ['שווה צלעת'] },
  { line: 'משולש שווה שוקיימ ABC', near: [] }, // «שוקיימ» folds to «שוקיים» itself: the word, not a near miss
  { line: 'משולש ישר-זויתי ABC', near: [] }, // «זויתי» is «זוית» + «י»: the word, inflected
  { line: 'משולש ישר זוות ABC', near: ['ישר זוות'] },
  { line: 'AD גובח לצלע BC', near: ['גובח'] },
  { line: 'AD תיכנ לצלע BC', near: ['תיכנ'] },
  { line: 'equilaterl triangle ABC', near: ['equilaterl'] },
  { line: 'isoceles triangle ABC', near: ['isoceles'] },
  { line: 'circle inscibed in triangle ABC', near: ['inscibed'] },
  // negatives
  { line: 'AB ו-CD מקבילים', near: [] },
  { line: 'AB צלע במשולש', near: [] },
  { line: 'שני מעגלים משיקים מבחוץ', near: [] },
  { line: 'הצלעות שווים', near: [] },
  { line: 'שיפוע הישר AB', near: [] },
  { line: 'קובייה ABCDA\'B\'C\'D\'', near: [] },
  { line: 'תיבה ABCDA\'B\'C\'D\'', near: [] },
  { line: 'AB = 8, eight', near: [] },
];
