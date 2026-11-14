/**
 * #2890 ([ADR-3D-492](../../docs/06b-decisions-3d.md#adr-3d-492) part 2; ADR-W-210 invariant 1) — WHAT ONE HEAP SOLVED,
 * THE OTHER DOES NOT SOLVE AGAIN.
 *
 * Every saved figure in `fixtures3/` is walked through the work meter's own walk on TWO heaps in step
 * (`work-meter/twoHeaps3.ts`). W solves and records a journal; the journal is passed through `structuredClone`; P
 * adopts it and runs the SAME step with its own, unchanged store action and readers. The lock, for every step of
 * every figure:
 *  - P solves **0 units**, with **0 derives and 0 resolves** not answered from a memo, and no figure solved again for
 *    a lazy value that did not follow it;
 *  - P ends on the same step, verdict and view as W (the store, the derived figure, the DOF count, the whole panel);
 *  - the journal clones (a function or a class instance in any entry throws here);
 *  - after a load, P's construction is the same content as W's, pin origins included.
 * A step that renders is handed over in two stages, the figure and then the values, cut where the worker would cut.
 *
 * It is the proof phase 3 rests on before a worker exists: when the worker lands, the page adopts exactly this.
 *
 * test-budget: it walks all 176 fixtures through every recorded action, as the work-meter gate does, on two heaps:
 * about 9 min alone. One file, because the two heaps are built once.
 *
 * `WORK_METER_CORPUS=slow` walks the open speed issues' sequences instead (on demand, as the gate's `--slow`).
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import v8 from 'node:v8';
import { heap3, inHeap3, stepBoth3, type BothStep3, type Heap3 } from './work-meter/twoHeaps3';
import { SLOW_CORPUS_3D } from './work-meter/slowCorpus3';
// types only: no module instance comes with them. (Written as imports, never as `Heap3[…][…]`: the #1394 parity lock
// harvests every bracketed list of strings in this folder as a sequence of typed lines.)
import type { JournalRecorder3 } from '../store/journal3';
import type { Construction3 } from '../engine/types';

vi.mock('nanoid', () => ({ nanoid: () => `row${((globalThis as unknown as { __twoHeaps3Ids: { n: number } }).__twoHeaps3Ids.n++).toString(36)}` }));

const DIR = join(__dirname, '..', '..', 'fixtures3');
const SLOW = process.env.WORK_METER_CORPUS === 'slow';
const ONLY = process.env.WORK_METER_ONLY;
const slowLines = new Map(SLOW_CORPUS_3D.map((q) => [q.id, q.lines]));
const corpus = (SLOW ? [...slowLines.keys()] : readdirSync(DIR).filter((f) => f.endsWith('.geo3.json'))).filter((f) => !ONLY || f.includes(ONLY)).sort();
const PLAN = { submits: 'all', presses: 1 } as const;
const sizeOf = (journal: unknown): number => v8.serialize(journal).length;

describe('#2890 — two heaps: the page solves nothing the worker solved', () => {
  let W: Heap3;
  let P: Heap3;
  let rec: JournalRecorder3;
  const totals = { figures: 0, steps: 0, staged: 0, wUnits: 0, pUnits: 0, bytes: 0, maxBytes: 0 };

  beforeAll(async () => {
    W = await heap3();
    P = await heap3();
    expect(W.store).not.toBe(P.store);
    expect(W.meter).not.toBe(P.meter);
    rec = W.journal.recordJournal3();
  });

  for (const figure of corpus) {
    it(figure, () => {
      const text = SLOW ? '' : readFileSync(join(DIR, figure), 'utf8');
      const steps = (h: Heap3) => inHeap3(h, () => (SLOW ? h.walk.stepsOfLines3(slowLines.get(figure)!, PLAN) : h.walk.stepsOfFixture3(text, PLAN)));
      const gw = steps(W);
      const gp = steps(P);
      totals.figures++;
      for (let both: BothStep3 | null; (both = stepBoth3(W, P, rec, gw, gp, sizeOf)); ) {
        const at = `«${figure}» ${both.step.action}`;
        expect(both.p, `${at}: the page still solves after adopting`).toEqual({ units: 0, derives: 0, resolves: 0, solvedAgain: 0 });
        expect(both.sameStep, `${at}: the two heaps took different steps`).toBe(true);
        expect(both.sameView, `${at}: the two heaps show different figures`).toBe(true);
        if (both.step.action === 'load') {
          // the journal's clone adopts to the SAME CONTENT: the construction's graph and its pin origins
          const of = (h: Heap3) => h.store.derive3(h.store.useGeo3.getState().facts, h.store.useGeo3.getState().seed).construction;
          const [cw, cp] = [of(W), of(P)];
          expect(cp, `${at}: one object in two heaps`).not.toBe(cw);
          expect(W.content.sameContent3(cw, cp), `${at}: the adopted construction is another content`).toBe(true);
          expect(P.evaluate.pinOrigins3(cp), `${at}: the pin origins did not cross`).toEqual(W.evaluate.pinOrigins3(cw));
          expect(P.evaluate.figureContent3.of(cp), `${at}: the adopted construction has no content here`).toBe(P.evaluate.figureContent3.of(structuredCloneWithOrigins(P, cp)));
        }
        totals.steps++;
        if (both.staged) totals.staged++;
        totals.wUnits += both.wUnits;
        totals.pUnits += both.p.units;
        totals.bytes += both.bytes[0] + both.bytes[1];
        totals.maxBytes = Math.max(totals.maxBytes, both.bytes[0], both.bytes[1]);
      }
      expect(W.evaluate.figureContent3.changed().length, 'W: a construction was altered after it was taken as its content').toBe(0);
      expect(P.evaluate.figureContent3.changed().length, 'P: a construction was altered after it was taken as its content').toBe(0);
    }, SLOW ? 7_200_000 : 900_000);
  }

  it('the lock is not vacuous: W solved, steps were staged, and P solved nothing', () => {
    expect(totals.figures).toBe(corpus.length);
    expect(totals.wUnits).toBeGreaterThan(0);
    expect(totals.staged).toBeGreaterThan(0);
    expect(totals.pUnits).toBe(0);
    // eslint-disable-next-line no-console
    console.log(`[two heaps] ${totals.figures} figures, ${totals.steps} steps (${totals.staged} in two stages): W ${totals.wUnits} units, P ${totals.pUnits}; journals ${totals.bytes} B in all, the largest ${totals.maxBytes} B`);
  });
});

/** A fresh clone of a construction with its pin origins written back: another object of the same content. */
function structuredCloneWithOrigins(h: Heap3, c: Construction3) {
  const x = structuredClone({ c, origins: h.evaluate.pinOrigins3(c) });
  h.evaluate.writePinOrigins3(x.c, x.origins);
  return x.c;
}
