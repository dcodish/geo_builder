/**
 * #1205 — THE DISTANCE BETWEEN TWO PARALLEL LINES, AND AN HONEST REFUSAL WHEN THEY CROSS.
 *
 * Split from #1151, which added the point-to-line member of the measure union and left this one with a
 * note in the code: *"Neither is a point: two lines. A real question, and a CAPABILITY rather than this
 * bug — left unconsumed, so it still answers «לא הבנתי» exactly as it does today."*
 *
 * Measured before, on both a parallel pair and an intersecting one:
 *
 * ```
 * ask(…, 'המרחק בין AB ל-l1')  ->  { value: null, unreadable: true }   ← «לא הבנתי את השאלה»
 * ```
 *
 * The token reached a line/line pair and simply built no term.
 *
 * ## The ruling, and why the two outcomes differ
 *
 * **Operator, 2026-09-19:** asked whether the intersecting case should answer `0` or refuse, he chose
 * **(b) refuse and explain**, overriding the issue's own recommendation of `0`. His reason: the refusal
 * teaches the concept; `0` lets the misconception stand.
 *
 * So a parallel pair answers the distance, and an intersecting pair is a **`fact`** about the figure —
 * not a gap in the givens. That distinction is #1223's, on a second surface: «לא ניתן לחשב מהנתונים»
 * would tell the student their givens are insufficient when the question has no single answer at all.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { ask } from '../app/ask';
import * as fs from 'node:fs';
import * as path from 'node:path';

const answer = (lines: readonly string[], question: string) =>
  ask(derive([...lines]), question, (v) => String(+v.toFixed(4)), (k) => k);

/** A horizontal segment on y = 0, and a line parallel to it 5 above. */
const PARALLEL = ['A(0,0)', 'B(5,0)', 'נתון הישר l1: y=5'];
/** The same segment, and a line that crosses it. */
const CROSSING = ['A(1,3)', 'B(5,3)', 'נתון הישר l1: y=x'];

describe('#1205 — a parallel pair answers the distance', () => {
  it('«המרחק בין AB ל-l1» is 5', () => {
    expect(answer(PARALLEL, 'המרחק בין AB ל-l1')).toMatchObject({ value: '5' });
  });

  it('and it is symmetric — the operands may be written either way round', () => {
    expect(answer(PARALLEL, 'המרחק בין l1 ל-AB')).toMatchObject({ value: '5' });
  });

  /**
   * The normalisation is what makes it a distance rather than a coefficient difference. `2x` and `x`
   * describe lines with the same direction and different scales, so an un-normalised subtraction would
   * answer a different number for the same pair of lines.
   */
  it('the answer does not depend on how the equations happen to be scaled', () => {
    const scaled = ['A(0,0)', 'B(5,0)', 'נתון הישר l1: 3y=15'];
    expect(answer(scaled, 'המרחק בין AB ל-l1')).toMatchObject({ value: '5' });
  });
});

describe('#1205 — an intersecting pair is refused, as a FACT about the figure', () => {
  it('«המרחק בין AB ל-l1» reports lines-cross, not a value', () => {
    const a = answer(CROSSING, 'המרחק בין AB ל-l1');
    expect(a.value).toBeNull();
    expect(a.fact).toBe('lines-cross');
  });

  /**
   * NOT «לא הבנתי את השאלה» — #1111's distinction, and the half the ruling turns on. The question was
   * understood perfectly; what it asks for does not exist.
   */
  it('it is NOT reported as unintelligible', () => {
    expect(answer(CROSSING, 'המרחק בין AB ל-l1').unreadable).toBeUndefined();
  });

  /** And not as a missing object either — both lines are right there in the figure. */
  it('and not as a missing object', () => {
    expect(answer(CROSSING, 'המרחק בין AB ל-l1').missing).toBeUndefined();
  });
});

/**
 * THE REMEDY IS DRIVEN — the #1156 failure mode, guarded.
 *
 * A refusal that names an alternative must be able to ANSWER that alternative; #1156 shipped a message
 * teaching a spelling that returned the same refusal. So the two things this message offers are pulled
 * out of the locale string and pushed back through the real ask lane and the real parser.
 */
describe('#1205 — everything the refusal suggests actually works', () => {
  /**
   * The locale object is module-private, so the message is read out of its SOURCE rather than
   * restated here — the `shell/__tests__` parity pattern. A test that spelled the message out would
   * pass while the real one drifted, which is the whole thing this block is guarding.
   */
  const messageHe = () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'i18n', 'index.ts'), 'utf8');
    const m = /askLinesCross:\s*\n?\s*((?:'[^']*'\s*\+?\s*)+)/.exec(src);
    expect(m, 'src-analytic/i18n/index.ts no longer defines askLinesCross').not.toBeNull();
    return m![1].replace(/'\s*\+\s*'/g, '').replace(/^'|'\s*,?\s*$/g, '');
  };

  it('the message names the parallel condition and an alternative that can be asked', () => {
    const msg = messageHe();
    expect(msg, 'it says WHY — a distance is defined only between parallels').toContain('מקביל');
    expect(msg, 'and names a question that can be asked instead').toContain('המרחק מ-A לישר l1');
  });

  it('the point-to-line question it offers is answerable on the very figure that was refused', () => {
    const a = answer(CROSSING, 'המרחק מ-A לישר l1');
    expect(a.value, 'the suggested question returned no value').not.toBeNull();
    expect(a.unreadable).toBeUndefined();
  });

  it('and the crossing point it points at can be named on that figure', () => {
    const d = derive([...CROSSING, 'P נקודת החיתוך של הישר AB עם הישר l1']);
    expect(d.faults).toEqual([]);
    expect(d.figure.points.some((p) => p.id === 'P')).toBe(true);
  });
});

/**
 * #1151's OWN TABLE, in both orders, unchanged. This adds a third member to the measure union, and the
 * regression that matters is that the other two still answer what they answered.
 */
describe('#1205 — the point/line and point/point members do not move', () => {
  it.each([
    ['המרחק מ-A לישר l1', PARALLEL],
    ['המרחק בין A ל-B', PARALLEL],
    ['AB', PARALLEL],
  ])('«%s» still answers', (question, lines) => {
    const a = answer(lines, question);
    expect(a.value).not.toBeNull();
    expect(a.unreadable).toBeUndefined();
  });

  it('a line asked against ITSELF is not this question', () => {
    const a = answer(PARALLEL, 'המרחק בין l1 ל-l1');
    expect(a.value).toBeNull();
  });
});
