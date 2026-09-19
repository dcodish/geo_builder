/**
 * THE FORMULA BEHIND A MEASUREMENT (#1053).
 *
 * Operator, 2026-09-15: *"when I select to see a distance or an equation of a line, I want the
 * relevant formula to be shown on screen, so we don't just show the result — we show what to use to
 * get to this result."* And his ruling on the level: *"1053 - yes - b is correct"* — **the formula
 * with this figure's values substituted**, not the bare formula and not the arithmetic worked out.
 *
 * Two kinds of test here, and the second matters more than it looks:
 *
 *  - that the right trace appears for the right question, and NOT for questions with no technique
 *    behind them;
 *  - the INTEGRITY of the authored table — that it stays authored, stays at level (2), and cannot
 *    quietly start showing the answer.
 */
import { describe, expect, it } from 'vitest';
import { fmtNum } from '../../shell/format';
import { ask } from '../app/ask';
import { derive } from '../engine/derive';
import { TECHNIQUES, techniqueFor, traceDistance2pt, traceLine2pt } from '../engine/techniques';

const askAt = (lines: string[], q: string) => ask(derive(lines, 0), q, fmtNum);

describe('#1053 — a distance shows the move that produces it', () => {
  it('«AB» carries the distance formula with THIS figure’s numbers', () => {
    const a = askAt(['A(1,1)', 'B(4,5)'], 'AB');
    expect(a.value).toBe('5');
    expect(a.trace).toBe('d = √((4 - 1)² + (5 - 1)²)');
  });

  it('a NEGATIVE coordinate is parenthesised, as a notebook writes it', () => {
    // `5 − −3` is the single commonest way a substituted formula stops looking like the one in the
    // student's notes.
    expect(askAt(['A(1,-3)', 'B(4,5)'], 'AB').trace).toBe('d = √((4 - 1)² + (5 - (-3))²)');
  });

  it('but NOT a compound expression — that is arithmetic the student assembled', () => {
    const a = askAt(['A(1,1)', 'B(4,5)', 'C(-2,3)'], 'AB+CA');
    expect(a.value).not.toBeNull();
    expect(a.trace).toBeUndefined();
  });

  it('and not a point’s coordinates — they are READ, not computed', () => {
    const a = askAt(['A(1,1)'], 'A');
    expect(a.value).toBe('(1, 1)');
    expect(a.trace).toBeUndefined();
  });

  it('and not an area — the table has no entry, so it says nothing', () => {
    // Authoring an entry for a row nobody asked for would be guessing at a teacher's words.
    const a = askAt(['A(0,0)', 'B(6,0)', 'C(0,3)', 'משולש ABC'], 'שטח ABC');
    expect(a.value).not.toBeNull();
    expect(a.trace).toBeUndefined();
  });

  it('nor when the figure does not determine the answer', () => {
    // No value means no row to explain; a formula there would be answering "how COULD you reach it",
    // which docs/19 §9 forbids — that is a planner.
    const a = askAt(['משולש ABC'], 'AB');
    expect(a.value).toBeNull();
    expect(a.trace).toBeUndefined();
  });
});

describe('#1053 — a line’s equation shows the move that produces it', () => {
  it('«משוואת הישר AB» carries the two-point form, substituted AND evaluated', () => {
    /**
     * Updated by #1221, which is a change to this very behaviour rather than a break in it. The form
     * was `m = (5 - 1) / (4 - 1),  y - 1 = m(x - 1)` — two statements on one row, and `m` never given
     * a value on any surface, so the student was left to finish it. Now: one statement per row, and
     * the intermediate the next step consumes is evaluated.
     *
     * `1.33` rather than `4/3` because THIS file injects `fmtNum`; the product injects `fmtAnalytic`
     * and keeps the exact form (#1120), which `issue-1221-trace-complete.test.ts` asserts.
     */
    const a = askAt(['A(1,1)', 'B(4,5)', 'משוואת הישר AB היא y=(4/3)x-1/3'], 'משוואת הישר AB');
    expect(a.trace).toBe('m = (5 - 1) / (4 - 1) = 1.33\ny - 1 = 1.33(x - 1)');
  });

  it('a VERTICAL line says the formula does not apply, rather than dividing by zero', () => {
    expect(traceLine2pt({ id: 'A', x: 2, y: 1 }, { id: 'B', x: 2, y: 7 }, fmtNum)).toBe(
      'x = 2  (הישר אנכי — אין שיפוע)',
    );
  });

  it('a line GIVEN by its equation gets no trace — the student wrote it down', () => {
    // There is no technique behind a given. Printing a derivation for one would be the tool
    // explaining the student to themselves.
    const a = askAt(['נתון הישר l1: y=2x+1'], 'משוואת הישר l1');
    expect(a.value).not.toBeNull();
    expect(a.trace).toBeUndefined();
  });
});

describe('#1053 — the table stays AUTHORED, and stays at level (2)', () => {
  it('every entry carries a hand-written formula and a Hebrew name', () => {
    expect(TECHNIQUES.length).toBeGreaterThan(0);
    for (const t of TECHNIQUES) {
      expect(t.formula.length, t.id).toBeGreaterThan(5);
      expect(/[֐-׿]/.test(t.he), `${t.id} needs a teacher's name`).toBe(true);
      expect(techniqueFor(t.target), t.id).toBeDefined();
    }
  });

  it('ids are unique — the catalog is addressable', () => {
    expect(new Set(TECHNIQUES.map((t) => t.id)).size).toBe(TECHNIQUES.length);
  });

  /**
   * THE LEVEL GUARD, and the reason this file exists as much as the behaviour tests.
   *
   * The operator ruled level (2): the formula with the values IN it. A trace that also printed
   * `= 5` would be level (3) — the tool doing the student's homework — and it is an easy line to
   * cross by "helpfully" appending the result. So: the substituted trace must contain the figure's
   * own numbers and must NOT contain the answer.
   */
  it('a substituted trace shows the student’s numbers and NEVER the result', () => {
    const a = { id: 'A', x: 1, y: 1 };
    const b = { id: 'B', x: 4, y: 5 };
    const trace = traceDistance2pt(a, b, fmtNum);
    for (const n of ['1', '4', '5']) expect(trace).toContain(n);
    // |AB| = 5 exactly here; the trace must not assert it.
    expect(trace).not.toMatch(/=\s*5\s*$/);
    expect(trace).not.toContain('√25');
  });

  it('and the general formula is never rendered with the numbers already collapsed', () => {
    // `(4 - 1)` must survive as a subtraction the student performs, not arrive as `3`.
    const trace = traceDistance2pt({ id: 'A', x: 1, y: 1 }, { id: 'B', x: 4, y: 5 }, fmtNum);
    expect(trace).toContain('(4 - 1)');
    expect(trace).not.toContain('(3)²');
  });
});
