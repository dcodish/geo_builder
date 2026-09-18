/**
 * #1151 — THE OPERANDS DECIDE THE ROLES, NOT THE WORD ORDER.
 *
 * Reported by the operator: «המרחק בין AB ל-C» is unreadable while «המרחק בין C ל-AB» answers, and
 * «המרחק בין A ל-B» — two points a student has pinned — comes back «לא ניתן לחשב».
 *
 * Measured on `main` before the fix, on `A(0,0)` `B(6,0)` `C(3,5)` + «משולש ABC»:
 *
 * ```
 * המרחק בין C ל-AB          -> 5            (point, then line)
 * המרחק בין AB ל-C          -> «לא הבנתי»   the SAME question, other order
 * המרחק בין A ל-B           -> null         two points, read as a line named «B»
 * המרחק בין C ל-QR          -> null         a silent statement about a figure with no QR
 * distance between C and AB -> null         the token missed; LENGTH_TOKEN then ate «AB»
 * ```
 *
 * The last row is the honesty failure and the reason this is not cosmetic: the English sentence was
 * answered about a DIFFERENT measurement than the one asked.
 *
 * The lock is therefore a TABLE, not a set of examples: every spelling of one question must produce
 * the same answer, and it is asserted by calling `ask` — never by re-listing what the token is
 * expected to match (ADR-W-053).
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { ask } from '../app/ask';
import { parseLengthExpr } from '../engine/lengths';
import { fmtNum } from '../../shell/format';

const fmt = (n: number) => fmtNum(n);
const FIG = ['A(0,0)', 'B(6,0)', 'C(3,5)', 'משולש ABC', 'נתון הישר l1: y=0'];
const d = derive(FIG, 0);
const answer = (q: string) => ask(d, q, fmt, () => 'curve');

/** The height from C to AB, which is 5 on this figure, asked every way a student might write it. */
const POINT_LINE_SPELLINGS = [
  'המרחק בין C ל-AB',
  'המרחק בין AB ל-C',
  'המרחק מ-C ל-AB',
  'המרחק מ-C לישר AB',
  'המרחק בין הישר AB ל-C',
  'מרחק של C מ-AB',
  'המרחק מ-C ל-l1',
  'distance between C and AB',
  'distance between AB and C',
  'distance from AB to C',
  'distance from C to AB',
];

describe('#1151 — one question, every spelling, one answer', () => {
  it.each(POINT_LINE_SPELLINGS)('«%s» answers 5', (q) => {
    expect(answer(q).value).toBe('5');
  });

  it('two POINTS are a plain distance — the number, not a refusal', () => {
    // «B» was being read as the name of a line, so this answered null. The value matters: asserting
    // only "not refused" would pass on a figure that answered the wrong measurement.
    expect(answer('המרחק בין A ל-B').value).toBe('6');
    expect(answer('distance between A and B').value).toBe('6');
    // ...and it is the SAME term «AB» produces, so one question cannot have two answers.
    expect(answer('AB').value).toBe('6');
  });

  it('a spelling that names something ABSENT reports it, and never answers null', () => {
    /**
     * #1111's missing-object message exists for exactly this, and the LINE operand walked past it:
     * «לא ניתן לחשב מהנתונים» is a statement ABOUT the figure, and the figure has no QR to make it
     * about.
     */
    expect(answer('המרחק בין C ל-QR').missing).toEqual({ name: 'QR', kind: 'curve' });
    expect(answer('המרחק בין QR ל-C').missing).toEqual({ name: 'QR', kind: 'curve' });
    expect(answer('המרחק בין Q ל-AB').missing).toEqual({ name: 'Q', kind: 'point' });
  });

  it('the fix is not a blanket accept — degenerate and unbuilt questions still refuse', () => {
    // A point to itself is not a distance; it is a degenerate statement, as LENGTH_TOKEN also holds.
    expect(answer('המרחק בין A ל-A').unreadable).toBe(true);
    // TWO LINES is a real question and a CAPABILITY, deliberately not built under this bug's banner.
    // It still says it did not understand, exactly as it does today.
    expect(answer('המרחק בין AB ל-l1').unreadable).toBe(true);
  });

  it('the neighbouring measures are untouched — they never read roles by position', () => {
    /**
     * The class check (standing rule 1). `AREA_TOKEN` reads ONE run of vertices and `LENGTH_TOKEN`
     * reads two interchangeable points, so neither can have the defect; asserted rather than argued,
     * so a future edit that gives one of them an asymmetric operand pair fails here.
     */
    expect(answer('שטח ABC').value).toBe('15');
    expect(answer('AB + 2*BC').value).toBe(fmt(6 + 2 * Math.hypot(3 - 6, 5)));
    expect(parseLengthExpr('שטח ABC')?.terms).toEqual([{ kind: 'area', ids: ['A', 'B', 'C'] }]);
  });

  it('both orders produce the SAME term, so one question is one term', () => {
    const a = parseLengthExpr('המרחק בין C ל-AB')?.terms;
    const b = parseLengthExpr('המרחק בין AB ל-C')?.terms;
    expect(a).toEqual([{ kind: 'point-line', p: 'C', line: 'AB' }]);
    expect(b).toEqual(a);
  });
});
