/**
 * #1118 — THE ROW IS A RECORD, THE DRAWING IS A VIEW.
 *
 * Operator, 2026-09-16, playing #1048: *"I want to be able to also remove the distance — maybe I click
 * on the dot again and I can remove the line."* Then, on seeing the first build:
 *
 * > *"once the distance between a point and line (or anything else) is asked for and appears in the
 * > data panel, it should stay there. just remove the dotted line if asked on the canvas."*
 *
 * The first build tied them together and he corrected it. Clearing the canvas to see the figure
 * underneath is not withdrawing the question, so hiding a drawing must keep its row.
 *
 * These call the SAME functions `App.tsx` calls — [#1102](https://github.com/dcodish/geo_builder/issues/1102)'s
 * lesson, which cost a whole feature silently: a decision reachable from no test stops happening.
 */
import { describe, expect, it } from 'vitest';
import {
  ASK_LIMIT,
  askOnceAnswer,
  drawnMarks,
  isAsked,
  isDrawn,
  removeAnswerAt,
  toggleDrawn,
} from '../app/answers';
import type { Answer } from '../app/ask';

const MARK = { from: { x: 2, y: 5 }, foot: { x: 3.5, y: 2.9 } };
const A = (question: string, value = '2.6'): Answer => ({ question, value, mark: MARK });
const make = (question: string) => () => A(question);
const qs = (rows: Answer[]) => rows.map((r) => r.question);
const Q = 'המרחק מ-A לישר l1';

describe('#1118 — the menu entry shows and hides the DRAWING', () => {
  it('the first click asks it, and it is drawn', () => {
    const rows = toggleDrawn([], Q, make(Q));
    expect(qs(rows)).toEqual([Q]);
    expect(isDrawn(rows, Q)).toBe(true);
    expect(drawnMarks(rows)).toHaveLength(1);
  });

  it('the second click clears the dotted line and KEEPS THE ROW — the operator’s ruling', () => {
    const once = toggleDrawn([], Q, make(Q));
    const hidden = toggleDrawn(once, Q, make(Q));
    expect(qs(hidden)).toEqual([Q]); // the record survives
    expect(isAsked(hidden, Q)).toBe(true);
    expect(isDrawn(hidden, Q)).toBe(false);
    expect(drawnMarks(hidden)).toEqual([]); // and nothing is on the canvas
  });

  it('a third click draws it again — the entry is a switch, not a one-way door', () => {
    let rows = toggleDrawn([], Q, make(Q));
    rows = toggleDrawn(rows, Q, make(Q));
    rows = toggleDrawn(rows, Q, make(Q));
    expect(qs(rows)).toEqual([Q]);
    expect(isDrawn(rows, Q)).toBe(true);
  });

  it('the row keeps its VALUE across a hide and a show — it was never recomputed', () => {
    let rows = toggleDrawn([], Q, () => ({ question: Q, value: '2.6', mark: MARK }));
    rows = toggleDrawn(rows, Q, () => ({ question: Q, value: 'WRONG', mark: MARK }));
    rows = toggleDrawn(rows, Q, () => ({ question: Q, value: 'WRONG', mark: MARK }));
    expect(rows[0].value).toBe('2.6');
  });

  it('hiding evaluates nothing — a removal must never cost a solve', () => {
    let calls = 0;
    const counted = () => {
      calls += 1;
      return A(Q);
    };
    const once = toggleDrawn([], Q, counted);
    expect(calls).toBe(1);
    toggleDrawn(once, Q, counted);
    expect(calls).toBe(1);
  });

  it('toggling one leaves the others drawn', () => {
    let rows = toggleDrawn([], Q, make(Q));
    rows = toggleDrawn(rows, 'שיפוע הישר l1', make('שיפוע הישר l1'));
    rows = toggleDrawn(rows, Q, make(Q));
    expect(isDrawn(rows, 'שיפוע הישר l1')).toBe(true);
    expect(isDrawn(rows, Q)).toBe(false);
    expect(drawnMarks(rows)).toHaveLength(1);
  });
});

describe('#1118 — TYPING is not the toggle gesture', () => {
  it('asking the same question twice gives ONE row, and does not hide it', () => {
    const once = askOnceAnswer([], Q, make(Q));
    const twice = askOnceAnswer(once, Q, make(Q));
    expect(qs(twice)).toEqual([Q]);
    expect(isDrawn(twice, Q)).toBe(true);
  });

  it('re-asking REFRESHES the value — the figure may have moved since', () => {
    const stale = [{ question: Q, value: '5', mark: MARK } as Answer];
    const fresh = askOnceAnswer(stale, Q, () => ({ question: Q, value: '9', mark: MARK }));
    expect(fresh[0].value).toBe('9');
    expect(fresh).toHaveLength(1);
  });

  it('typing a question whose drawing was hidden brings the drawing BACK', () => {
    const hidden = toggleDrawn(toggleDrawn([], Q, make(Q)), Q, make(Q));
    expect(isDrawn(hidden, Q)).toBe(false);
    expect(isDrawn(askOnceAnswer(hidden, Q, make(Q)), Q)).toBe(true);
  });

  it('a new question goes to the top, above the older rows', () => {
    expect(qs(askOnceAnswer([A('AB')], 'שטח ABC', make('שטח ABC')))).toEqual(['שטח ABC', 'AB']);
  });
});

describe('#1118 — the ✕ on a row is the one thing that discards the record', () => {
  it('removes that row, and its drawing with it', () => {
    const rows = [A('a'), A('b'), A('c')];
    const left = removeAnswerAt(rows, 1);
    expect(qs(left)).toEqual(['a', 'c']);
    expect(drawnMarks(left)).toHaveLength(2);
  });

  it('an out-of-range index is a no-op, never a crash', () => {
    const rows = [A('a')];
    expect(removeAnswerAt(rows, 5)).toEqual(rows);
    expect(removeAnswerAt(rows, -1)).toEqual(rows);
  });
});

describe('#1118 — an answer with no mark is still a row', () => {
  it('a coordinate question has nothing to draw and is listed all the same', () => {
    const rows = toggleDrawn([], 'A', () => ({ question: 'A', value: '(2, 5)' }));
    expect(qs(rows)).toEqual(['A']);
    expect(drawnMarks(rows)).toEqual([]);
  });
});

describe('#1118 — the lane stays bounded', () => {
  it('never grows past the limit, whichever route added the row', () => {
    let rows: Answer[] = [];
    for (let i = 0; i < ASK_LIMIT + 4; i += 1) rows = toggleDrawn(rows, `q${i}`, make(`q${i}`));
    expect(rows).toHaveLength(ASK_LIMIT);
    for (let i = 0; i < ASK_LIMIT + 4; i += 1) rows = askOnceAnswer(rows, `t${i}`, make(`t${i}`));
    expect(rows).toHaveLength(ASK_LIMIT);
  });
});
