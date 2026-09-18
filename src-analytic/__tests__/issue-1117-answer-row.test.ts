/**
 * #1117 + #1112 — the answer row is typeset, and punctuated as a sentence rather than an equation.
 *
 * Two operator reports against one template string, which is why they are fixed together.
 *
 * **#1117**, playing PR #1116 T28: *"we don't have MathML in the input in the data panel"*. The row read
 *
 * ```
 * המרחק מ-A לישר l1 = 2.6                      ← plain text
 * d(A, l1) = |3·2 - 4·5 + 1| / √(3² + (-4)²)   ← typeset, directly beneath it
 * ```
 *
 * so one line contradicted the next. **#1112**, playing T15: *"the last one משוואת AB = -2x + y = 0
 * should be משוואת AB: -2x + y = 0"* — the row is `question SEP value`, and an equation ANSWER makes that
 * two `=` signs in one line.
 *
 * ## The separator is chosen from the VALUE, not from the question kind
 *
 * A value that is already an equation cannot be joined to its question with another `=`. Deciding on the
 * content gives one rule covering every question kind that exists now and every one added later; a list
 * of "the rules that return equations" would need editing each time, and the row would read as broken
 * until someone remembered.
 *
 * ## Ordering
 *
 * This could not have been worth doing before [#1125](https://github.com/dcodish/geo_builder/issues/1125).
 * Routing the row through a renderer whose grammar stopped at literal values would have made it *wrongly*
 * typeset rather than plain — not obviously an improvement on what the operator reported. That dependency
 * was flagged on PR #1116 and is why #1125 is item 1 of this round and this is item 2.
 */
import { describe, expect, it } from 'vitest';
import { ask } from '../app/ask';
import { derive } from '../engine/derive';
import { hasMath, mathHtml } from '../../shell/math';

const fmt = (v: number) => String(Math.round(v * 1000) / 1000);

/**
 * The REAL curve formatter reaches this lock now (#1212): the ask lane imports it rather than taking
 * it as a parameter, so an equation question's answer is an equation by construction. This file used a
 * faithful hand-written stub for exactly that reason — *'a stub returning '' hides the entire defect,
 * because the row then has nothing with an = in it to collide with'* — which is the argument for the
 * import.
 */
const answer = (lines: string[], q: string) => ask(derive(lines, 0), q, fmt);

/** The row the component builds, as one string — the thing under test (see `App.tsx`). */
const rowText = (a: { question: string; value: string | null }) =>
  `${a.question}${a.value && a.value.includes('=') ? ':' : ' ='} ${a.value ?? ''}`;

const FIG = ['נתון הישר l1: 3x-4y+1=0'];

describe('#1112 — an equation answer is introduced with «:», never a second «=»', () => {
  it('the operator’s own row', () => {
    const a = answer(FIG, 'משוואת הישר l1');
    expect(a.value, 'the fixture still answers').toBeTruthy();
    expect(a.value, 'and the answer really is an equation').toContain('=');
    const row = rowText(a as { question: string; value: string | null });

    // The defect, stated directly: one row, one relation sign.
    expect((row.match(/=/g) || []).length, row).toBe(1);
    expect(row).toContain(':');
  });

  it('a NON-equation answer keeps its «=» — the separator is not simply replaced', () => {
    const a = answer(['A(0,0)', 'B(6,0)'], 'AB');
    const row = rowText(a as { question: string; value: string | null });
    expect(row).toBe('AB = 6');
    expect(row).not.toContain(':');
  });

  it('the rule reads the VALUE, so a future equation-returning question needs no edit here', () => {
    /**
     * Asserted as a property rather than by listing today's question kinds. A list would need editing
     * every time a rule learns to answer with an equation, and the row would read as broken until
     * someone remembered to edit it.
     */
    expect(rowText({ question: 'q', value: 'y = 2x + 1' })).toBe('q: y = 2x + 1');
    expect(rowText({ question: 'q', value: '4/3' })).toBe('q = 4/3');
    expect(rowText({ question: 'q', value: null })).toBe('q = ');
  });
});

describe('#1117 — the row carries the same typesetting as the trace beneath it', () => {
  it('a value with a fraction is real MathML in the row', () => {
    /**
     * The row and the trace are now the same kind of thing. Before this, a row stating `4/3` printed a
     * literal slash under a formula that was typeset — the contradiction the operator reported.
     */
    const text = rowText({ question: 'שיפוע הישר AB', value: '4/3' });
    expect(hasMath(text)).toBe(true);
    const html = mathHtml(text);
    expect(html).toContain('<mfrac>');
  });

  it('a value with a radical is typeset in the row', () => {
    const text = rowText({ question: 'AB', value: '√32' });
    expect(mathHtml(text)).toContain('<msqrt>');
  });

  it('a plain decimal row is left alone — a lone number is not wrapped', () => {
    const text = rowText({ question: 'המרחק מ-A לישר l1', value: '2.6' });
    expect(hasMath(text)).toBe(false);
    expect(mathHtml(text)).toBe(text);
  });
});
