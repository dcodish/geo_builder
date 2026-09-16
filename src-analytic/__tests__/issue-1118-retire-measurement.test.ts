/**
 * #1118 — the three gestures of the ask lane: ask, hide the drawing, retire the row.
 *
 * Operator, playing #1048: *"I want to be able to also remove the distance … it's one thing to see it,
 * but then I want to remove it and continue on."* Then, on the first build:
 *
 * > *"once the distance between a point and line (or anything else) is asked for and appears in the
 * > data panel, it should stay there. just remove the dotted line if asked on the canvas."*
 *
 * So the panel is a RECORD and the canvas is a VIEW of one entry in it (ADR-AG-067).
 *
 * ## Rewritten for #1110 — what the record HOLDS changed, and one case inverted
 *
 * These decisions used to fold a list of already-computed `Answer`s. Nothing invalidated them, so a
 * length and an area survived deleting every given and «נקה הכל». Since ADR-AG-070 the stored thing is
 * the QUESTION and the answer is derived from the current figure.
 *
 * Two consequences are asserted below rather than assumed:
 *
 *  - **A value cannot be stale, because there is no stored value.** The old case *"the row keeps its
 *    VALUE across a hide and a show — it was never recomputed"* asserted the opposite and is deliberately
 *    gone: keeping a reading verbatim across a figure change is the defect, not the feature.
 *  - **Hiding evaluates nothing** — ADR-AG-067 had to assert this with a counted thunk; with the record
 *    separated from the reading it is structural, and the thunk is gone. The case now says so directly.
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
import type { AskedQuestion } from '../store/useAnalyticStore';

const MARK = { from: { x: 2, y: 5 }, foot: { x: 3.5, y: 2.9 } };

/** A stored question — what the lane actually holds. */
const q = (sentence: string, shown = true): AskedQuestion => ({ sentence, shown });

/** A DERIVED row, for the cases that are about the canvas rather than the record. */
const A = (question: string, value: string | null = '2.6', shown = true): Answer =>
  ({ question, value, mark: MARK, shown });

const names = (qs: readonly AskedQuestion[]) => qs.map((x) => x.sentence);
const Q = 'המרחק מ-A לישר l1';

describe('#1118 — the menu entry shows and hides the DRAWING', () => {
  it('the first click asks it, and it is drawn', () => {
    const qs = toggleDrawn([], Q);
    expect(names(qs)).toEqual([Q]);
    expect(isDrawn(qs, Q)).toBe(true);
  });

  it('the second click clears the dotted line and KEEPS THE ROW — the operator’s ruling', () => {
    const hidden = toggleDrawn(toggleDrawn([], Q), Q);
    expect(names(hidden)).toEqual([Q]);   // the record survives
    expect(isAsked(hidden, Q)).toBe(true);
    expect(isDrawn(hidden, Q)).toBe(false);
  });

  it('a third click draws it again — the entry is a switch, not a one-way door', () => {
    let qs = toggleDrawn([], Q);
    qs = toggleDrawn(qs, Q);
    qs = toggleDrawn(qs, Q);
    expect(names(qs)).toEqual([Q]);
    expect(isDrawn(qs, Q)).toBe(true);
  });

  it('no gesture carries a VALUE — a stale reading is unrepresentable (#1110)', () => {
    /**
     * The inverted case. What is stored is the question; the answer is derived from the figure in
     * front of the student, so "the row kept its old number" cannot happen by construction.
     */
    const qs = toggleDrawn([], Q);
    expect(Object.keys(qs[0]).sort()).toEqual(['sentence', 'shown']);
  });

  it('toggling one leaves the others drawn', () => {
    let qs = toggleDrawn([], Q);
    qs = toggleDrawn(qs, 'שיפוע הישר l1');
    qs = toggleDrawn(qs, Q);
    expect(isDrawn(qs, 'שיפוע הישר l1')).toBe(true);
    expect(isDrawn(qs, Q)).toBe(false);
  });

  it('only the SHOWN answers reach the canvas', () => {
    expect(drawnMarks([A('a'), A('b', '3', false)])).toHaveLength(1);
    expect(drawnMarks([A('a', '2.6', false)])).toEqual([]);
  });
});

describe('#1118 — TYPING is not the toggle gesture', () => {
  it('asking the same question twice gives ONE row, and does not hide it', () => {
    const twice = askOnceAnswer(askOnceAnswer([], Q), Q);
    expect(names(twice)).toEqual([Q]);
    expect(isDrawn(twice, Q)).toBe(true);
  });

  it('typing a question whose drawing was hidden brings the drawing BACK', () => {
    const hidden = toggleDrawn(toggleDrawn([], Q), Q);
    expect(isDrawn(hidden, Q)).toBe(false);
    expect(isDrawn(askOnceAnswer(hidden, Q), Q)).toBe(true);
  });

  it('a new question goes to the top, above the older ones', () => {
    expect(names(askOnceAnswer([q('AB')], 'שטח ABC'))).toEqual(['שטח ABC', 'AB']);
  });
});

describe('#1118 — the ✕ on a row is the one thing that discards the record', () => {
  it('removes that row, and its drawing with it', () => {
    const left = removeAnswerAt([q('a'), q('b'), q('c')], 1);
    expect(names(left)).toEqual(['a', 'c']);
  });

  it('an out-of-range index is a no-op, never a crash', () => {
    const qs = [q('a')];
    expect(removeAnswerAt(qs, 5)).toEqual(qs);
    expect(removeAnswerAt(qs, -1)).toEqual(qs);
  });
});

describe('#1118 — an answer with no mark is still a row', () => {
  it('a coordinate question has nothing to draw and is listed all the same', () => {
    expect(names(toggleDrawn([], 'A'))).toEqual(['A']);
    expect(drawnMarks([{ question: 'A', value: '(2, 5)' }])).toEqual([]);
  });
});

describe('#1118 — the lane stays bounded', () => {
  it('never grows past the limit, whichever route added the row', () => {
    let qs: AskedQuestion[] = [];
    for (let i = 0; i < ASK_LIMIT + 4; i += 1) qs = toggleDrawn(qs, `q${i}`);
    expect(qs).toHaveLength(ASK_LIMIT);
    for (let i = 0; i < ASK_LIMIT + 4; i += 1) qs = askOnceAnswer(qs, `t${i}`);
    expect(qs).toHaveLength(ASK_LIMIT);
  });
});
