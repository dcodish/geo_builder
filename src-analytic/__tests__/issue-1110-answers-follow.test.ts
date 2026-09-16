/**
 * #1110 — an ask answer cannot outlive the figure it describes.
 *
 * Operator, playing T15: *"it still carries the PQ from data i deleted"* — a distance between two
 * crossing points he had already removed, still stated in the panel as fact.
 *
 * **Root cause: the answers were component state and nothing invalidated them.** `setAnswers` had
 * exactly one writer and was never called on `clearAll`, `removeLine`, `replaceLine`, a load, or
 * undo/redo. The store is the source of truth for the figure, the answers were not in it, so the thing
 * that invalidates them could not reach them.
 *
 * **The fix is the plan's option 1, not its fallback.** The issue offers a cheaper shape — drop every
 * answer whenever `lines` or `seed` changes — and says explicitly not to ship it as the answer without
 * saying so. It is not shipped: an answer is a reading of a particular `(facts, seed)`, so the QUESTION
 * is stored and the reading is DERIVED by the same fold as everything else. An answer then *follows* the
 * figure instead of being a snapshot of it, which also makes undo correct for free.
 *
 * Driven through the real store, not a reproduction of the decision — see
 * [#1102](https://github.com/dcodish/geo_builder/issues/1102) for why that distinction is load-bearing
 * in this tree.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useAnalyticStore } from '../store/useAnalyticStore';
import { askOnceAnswer } from '../app/answers';
import { ask } from '../app/ask';
import { derive } from '../engine/derive';

const st = () => useAnalyticStore.getState();

/** The component's own derivation, in one line — the thing the panel renders. */
const rowsNow = () => {
  const d = derive(st().lines, st().seed);
  return st().queries.map((q) => ask(d, q.sentence, (n) => String(n), () => ''));
};

const askIt = (sentence: string) => st().setQueries(askOnceAnswer(st().queries, sentence));

const SEQ = ['A(0,0)', 'B(6,0)', 'C(3,5)', 'משולש ABC'];

const build = () => {
  st().clearAll();
  for (const l of SEQ) st().recordLine(l);
};

describe('#1110 — the ask lane follows the figure', () => {
  beforeEach(() => { st().clearAll(); });

  it('answers a question about the figure in front of the student', () => {
    build();
    askIt('AB');
    const [row] = rowsNow();
    expect(row.question).toBe('AB');
    expect(row.value).toBe('6');
  });

  it('«נקה הכל» takes the answers with it — the operator’s own report', () => {
    build();
    askIt('AB');
    askIt('שטח ABC');
    expect(st().queries).toHaveLength(2);

    st().clearAll();

    expect(st().queries).toEqual([]);
    expect(rowsNow()).toEqual([]);
  });

  it('deleting the givens does not leave a length standing', () => {
    /**
     * The sharper half of the report: «נקה הכל» is the obvious case, but deleting the rows one at a
     * time left the same stale number behind, and that is what a student actually does.
     */
    build();
    askIt('AB');
    expect(rowsNow()[0].value).toBe('6');

    while (st().lines.length > 0) st().removeLine(st().lines.length - 1);

    const row = rowsNow()[0];
    expect(row.question).toBe('AB');       // the question is still the student's
    expect(row.value).toBeNull();          // …and the figure no longer answers it
  });

  it('EDITING a given moves the answer with it, rather than freezing the old reading', () => {
    /**
     * The case the fallback shape ("drop every answer when lines change") would have failed differently
     * — it would empty the lane, which is honest but unhelpful. Deriving means the number simply
     * follows, which is what a student expects from a panel that is showing their own figure.
     */
    build();
    askIt('AB');
    expect(rowsNow()[0].value).toBe('6');

    st().replaceLine(1, 'B(10,0)');
    expect(rowsNow()[0].value).toBe('10');
  });

  it('a new configuration re-reads the answer at that seed', () => {
    build();
    askIt('AB');
    const before = rowsNow()[0].value;
    st().goToSeed(st().seed + 1);
    // The question survives the seed change; the reading is taken again at the new one.
    expect(st().queries.map((q) => q.sentence)).toEqual(['AB']);
    expect(rowsNow()[0].value).toBe(before); // AB is determined here, so it is stable — and re-read
  });

  it('UNDO restores what the student was reading, not only the figure', () => {
    /**
     * The queries ride in the temporal partialize for the same reason `seed` does (E5/STO-5): undo must
     * put back what was on screen. This is a property the component-state shape could not have had.
     */
    build();
    askIt('AB');
    expect(st().queries).toHaveLength(1);

    st().clearAll();
    expect(st().queries).toEqual([]);

    st().undo();
    expect(st().queries.map((q) => q.sentence)).toEqual(['AB']);
    expect(st().lines).toEqual(SEQ);
    expect(rowsNow()[0].value).toBe('6');
  });

  it('no reading is ever stored — a stale value is unrepresentable, not merely unlikely', () => {
    build();
    askIt('AB');
    for (const q of st().queries) expect(Object.keys(q).sort()).toEqual(['sentence', 'shown']);
  });
});
