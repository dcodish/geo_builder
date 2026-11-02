/**
 * #2620 C ([ADR-AG-371](../../docs/06c-decisions-analytic.md#adr-ag-371)) — THE BOOK'S TWO CONSTRUCTION SPELLINGS, on the
 * real path (`decideSubmit` → `derive`, no model). «דרך N מעבירים ישר l1 שמקביל ל-PO» is taught as «דרך N עובר ישר l1
 * מקביל ל-PO», and «A ו-B הן נקודות על … בהתאמה» is «A ו-B נמצאות על … בהתאמה».
 *
 * Measured before (17f35282): both sentences were `not-handled`.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';
import { parseLine } from '../parser/parseAnalytic';
import p97 from './fixtures/ellipse-book-p9-7-2620.analytic.json';

/** The book's p10-9 up to the two lines it draws «דרך … מעבירים ישר … ש…». */
const HEAD = [
  'נתונה אליפסה שמשוואתה b^2x^2+a^2y^2=a^2b^2',
  'P נקודה על האליפסה',
  'האנך מהנקודה P לציר ה-x שחותך אותו בנקודה N',
  'O ראשית הצירים',
];

describe('#2620 C — the book’s construction spellings', () => {
  it.each([
    ['דרך N מעבירים ישר l1 שמקביל ל-PO', 'דרך N עובר ישר l1 מקביל ל-PO'],
    ['דרך P מעבירים ישר l2 שמקביל לציר ה-x', 'דרך P עובר ישר l2 מקביל לציר ה-x'],
    ['דרך הנקודה P מעבירים ישר l3 המאונך לציר ה-x', 'דרך הנקודה P עובר ישר l3 מאונך לציר ה-x'],
    ['דרך N מעבירים ישר שמקביל ל-PO', 'הישר העובר דרך הנקודה N מקביל ל-PO'],
  ])('«%s» is taught as «%s», which records', (line, canonical) => {
    expect(decideSubmit(line, HEAD, 0)).toEqual({ kind: 'teach', verb: 'מעבירים', canonical });
    expect(decideSubmit(canonical, HEAD, 0).kind).toBe('record');
  });
  it('the perpendicular’s own «ש» clause is not touched', () => {
    expect(decideSubmit('מנקודה P מורידים אנך לציר ה-x שחותך אותו בנקודה N', HEAD.slice(0, 2), 0)).toEqual({
      kind: 'teach',
      verb: 'מורידים',
      canonical: 'האנך מהנקודה P לציר ה-x שחותך אותו בנקודה N',
    });
  });
  it.each([
    ['A ו-B הן נקודות על ציר ה-x ועל ציר ה-y בהתאמה', 'A ו-B נמצאות על ציר ה-x ועל ציר ה-y בהתאמה'],
    ['A ו-B נקודות על ציר ה-x ועל ציר ה-y בהתאמה', 'A ו-B נמצאות על ציר ה-x ועל ציר ה-y בהתאמה'],
    ['A and B are points on the x-axis and the y-axis respectively', 'A and B are on the x-axis and the y-axis respectively'],
    ['D ו-E הן נקודות על AB ועל AC בהתאמה', 'D ו-E נמצאות על AB ועל AC בהתאמה'],
  ])('«%s» states what «%s» states', (line, twin) => {
    const a = parseLine(line);
    const b = parseLine(twin);
    expect(a.ok && b.ok).toBe(true);
    // the same facts, each carrying its own sentence as `src`
    const bare = (fs: readonly object[]) => fs.map(({ src: _s, ...f }: { src?: string }) => f);
    if (a.ok && b.ok) expect(bare(a.facts)).toEqual(bare(b.facts));
  });
  it('p9-7’s line records on an empty canvas', () => {
    expect(decideSubmit('A ו-B הן נקודות על ציר ה-x ועל ציר ה-y בהתאמה', [], 0).kind).toBe('record');
  });
  it('p9-7 in the book’s words builds with no fault', () => {
    expect(derive(p97.lines, p97.seed).faults).toEqual([]);
  });
});
