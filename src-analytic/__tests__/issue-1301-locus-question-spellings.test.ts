/**
 * #1301 ([ADR-AG-141](../../docs/06c-decisions-analytic.md#adr-ag-141)) — THE LOCUS QUESTION IS ONE
 * QUESTION HOWEVER IT OPENS.
 *
 * Operator, 2026-09-20: *"when i write משוואת המקום הגיאומטרי של A i get not determined"*. Measured, the
 * exam's own phrasing «משוואת המקום הגיאומטרי של B» was not a locus question to the tool at all:
 * `LOCUS_OF` admitted no lead-in, `EQUATION_OF`'s optional noun group swallowed the phrase as a curve
 * NAME, and the student's whole question came back as «אין בשרטוט ישר או מעגל בשם המקום הגיאומטרי של B».
 *
 * The table is asserted AS a table — every spelling returns the bare spelling's value, and the bare
 * value is asserted literally so the lock cannot go green by all of them being equally broken. The
 * anti-widening rows are the ones that matter: the pattern is greedier now and sits above `EQUATION_OF`.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { ask } from '../app/ask';
import { fmtAnalytic } from '../format';

const HE: Record<string, string> = { line: 'ישר', circle: 'מעגל' };
const kind = ((k: string) => HE[k] ?? k) as never;
/** The operator's own figure: B one segment-length from a pinned A — a circle. */
const FIG = ['A(0,0)', 'נקודה B', 'אורך הקטע AB הוא 10'];
const askOn = (lines: string[], q: string) => ask(derive(lines, 0), q, fmtAnalytic, kind);
const BARE = 'המקום הגיאומטרי של B';

describe('#1301 — every spelling of the locus question is the same question', () => {
  it('the bare spelling answers the circle — asserted literally, so the table below cannot pass vacuously', () => {
    expect(askOn(FIG, BARE).value).toBe('מעגל · x² + y² = 10²');
  });

  it.each([
    'המקום הגיאומטרי של הנקודה B',
    // the exam's own phrasing, in both spellings of the adjective (#1210)
    'משוואת המקום הגיאומטרי של B',
    'משוואת המקום הגאומטרי של B',
    // the openers a student writes
    'מצא את המקום הגיאומטרי של B',
    'מצאי את המקום הגיאומטרי של B',
    'חשב את המקום הגיאומטרי של B',
    'מהו המקום הגיאומטרי של B',
    'מה הוא המקום הגיאומטרי של B',
    'מהי משוואת המקום הגיאומטרי של B',
    'מצא את משוואת המקום הגיאומטרי של B',
    'the equation of the locus of B',
    'equation of the locus of B',
    'find the locus of B',
    'what is the locus of B',
  ])('«%s» answers exactly what the bare spelling answers', (q) => {
    const a = askOn(FIG, q);
    expect(a.unreadable, 'was «לא הבנתי את השאלה»').toBeFalsy();
    expect(a.missing, 'was repeated back as a missing curve').toBeUndefined();
    expect(a.value).toBe(askOn(FIG, BARE).value);
  });

  it('and it did not become a wildcard — the neighbours answer exactly as before', () => {
    // «משוואת הישר l1» is still the EQUATION question about a curve, and that curve is missing here
    const eq = askOn(FIG, 'משוואת הישר l1');
    expect(eq.value).toBeNull();
    expect(eq.missing).toEqual({ name: 'l1', kind: 'curve' });
    // «משוואת AB» and «שיפוע AB» are still their own questions about the segment
    expect(askOn(FIG, 'משוואת AB').value).toBeNull();
    expect(askOn(FIG, 'משוואת AB').missing).toBeUndefined();
    expect(askOn(FIG, 'שיפוע AB').value).toBeNull();
    expect(askOn(FIG, 'שיפוע AB').unreadable).toBeFalsy();
    // a point's name is still a question about its coordinates
    expect(askOn(FIG, 'A').value).toBe('(0, 0)');
    expect(askOn(FIG, 'B').value).toBeNull();
  });

  it('the two halves of the operator’s report meet on his sentence — both spellings of A’s locus agree', () => {
    // #1227 decides WHAT a pinned point's locus says; this decides that both spellings say the same thing.
    const a = askOn(FIG, 'משוואת המקום הגיאומטרי של A');
    const b = askOn(FIG, 'המקום הגיאומטרי של A');
    expect(a.unreadable).toBeFalsy();
    expect(a.missing).toBeUndefined();
    expect(a.value).toBe(b.value);
    expect(a.fact).toBe(b.fact);
  });
});
