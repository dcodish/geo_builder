/**
 * #1605 ([ADR-582](../../docs/06-decisions.md#adr-582)) — a memo hit is charged the work it saved, so a
 * work-bounded verdict is the same cold and warm.
 *
 * The operator asked «O1D» on the T12 figure and waited ~25 s on a row that said «press חשב ערכים». Two
 * defects, one cause: the knowledge pool's work cap (ADR-558) counted `evaluateCore` calls actually made,
 * and every memo on the counted path answered a hit for free — so the same facts gave a pool cut by the
 * cap cold (21 samples) and complete warm (23 samples). Because a cut pool was never served from the memo,
 * the ask's values op recomputed the whole pool after the detect sweep.
 *
 * Every lock here counts operations or reads verdicts; none times anything.
 */
import { describe, it, expect } from 'vitest';
import { factsOf } from './scenario-pipeline';
import { computeValues, sampleStats, sharedSamples } from '@/replay/core';
import { parseValueQuery } from '@/parser/valueQuery';
import { work, withWorkEpoch, withWorkBudget } from '@/engine/solveBudget';
import { evaluate, emptyConstruction, applyCommand } from '@/engine';
import { QUERY_NOTES, waitingNote } from '@/engine/valuesPanel';

/** The operator's T12 sequence (prod 2026-09-30), verbatim. */
const T12 = [
  'שני מעגלים O1 ו O2 משיקים מבחוץ',
  'A על מעגל O1',
  'C על מעגל O2',
  'AC עובר דרך O1 ו O2',
  'היקף מעגל O1 הוא 6π',
  'שטח מעגל O2 = 81π',
  'מנקודה B יוצאים שני משיקים למעגל O2 בנקודות C ו D',
  'A נמצא על המשך BD',
];
/** Any other figure: computing its pool evicts the single-entry pool memo, so the next T12 call re-samples. */
const evictPoolMemo = () => sharedSamples(factsOf(['משולש ABC', 'AB=3']));

describe('#1605 — the knowledge pool costs the same counted work cold and warm', () => {
  it('T12: cold, then re-sampled over warm caches — same counted work, same `complete`, same samples', () => {
    const run = () => {
      const facts = factsOf(T12);
      const w0 = work.done;
      const pool = sharedSamples(facts);
      return { work: work.done - w0, complete: pool.complete, samples: pool.samples.map((m) => [...m].map(([id, p]) => `${id}:${p.x.toFixed(9)},${p.y.toFixed(9)}`).join(' ')) };
    };
    evictPoolMemo();
    const cold = run();
    evictPoolMemo(); // the folds and replays it filled stay warm; only the pool itself is recomputed
    const warm = run();
    expect(warm.work, 'the counted work is a function of the input alone').toBe(cold.work);
    expect(warm.complete).toBe(cold.complete);
    expect(warm.samples).toEqual(cold.samples);
    expect(cold.samples.length).toBeGreaterThan(0);
  }, 240_000);

  it('T12: the detect sweep then the ask — ONE sweep, and the ask is answered from that pool', () => {
    evictPoolMemo();
    const facts = factsOf(T12);
    const s0 = sampleStats.sweeps;
    const pool = sharedSamples(facts); // the detect lane
    const clone = factsOf(T12); // the values op receives a fresh structured clone of the same facts
    const w1 = work.done;
    const v = computeValues(clone, [{ text: 'O1D', q: parseValueQuery('O1D') }]);
    expect(sampleStats.sweeps - s0, 'one sweep per facts, across detect then values').toBe(1);
    expect(work.done - w1, 'the ask computes nothing new').toBe(0);
    expect(v.complete, 'the values panel and the status line read ONE verdict').toBe(pool.complete);
    expect(v.queryRows?.[0]?.value).toBeCloseTo(9.7673, 3);
  }, 240_000);
});

describe('#1605 — the ledger primitive', () => {
  const figure = () => applyCommand(applyCommand(emptyConstruction(), { type: 'free-point', id: 'A', x: 0, y: 0 }), { type: 'free-point', id: 'B', x: 3, y: 1 });

  it('inside an epoch a hit is charged the work it saved — once', () => {
    const c = figure();
    const w0 = work.done;
    evaluate(c); // computed outside any epoch
    const cost = work.done - w0;
    expect(cost).toBeGreaterThan(0);
    withWorkEpoch(() => {
      const a = work.done;
      evaluate(c); // first touch in this epoch: charged
      expect(work.done - a).toBe(cost);
      const b = work.done;
      evaluate(c); // second touch in the same epoch: free, as on a cold run
      expect(work.done - b).toBe(0);
    });
    const d = work.done;
    evaluate(c); // outside an epoch nothing is charged (no budget reads the counter)
    expect(work.done - d).toBe(0);
  });

  it('a hit an armed budget cannot afford is recomputed — and counts what a cold run would', () => {
    const c = figure();
    const w0 = work.done;
    evaluate(c);
    const cost = work.done - w0;
    withWorkBudget(cost - 1, () => {
      const a = work.done;
      evaluate(c);
      expect(work.done - a, 'recomputed, not served').toBe(cost);
    });
  });
});

describe('#1605 — the ask row says the answer is being computed', () => {
  it('«מחשב…» while the values compute runs; «press חשב ערכים» only when nothing is running', () => {
    expect(QUERY_NOTES).toContain('computing');
    expect(waitingNote(true)).toBe('computing');
    expect(waitingNote(false)).toBe('pending');
  });
});
