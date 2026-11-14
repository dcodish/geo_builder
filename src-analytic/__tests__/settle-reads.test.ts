/**
 * #2890 ([ADR-AG-477](../../docs/06c-decisions-analytic.md#adr-ag-477)) — AN ADOPTED RESULT READS EXACTLY AS A COMPUTED
 * ONE: what the page shows from a settled result is what it shows today.
 *
 * After every accepted line of a saved sequence the worker's result is handed over (`settle-heaps.ts`), and then
 * EVERYTHING THE PAGE READS off the figure is computed twice and compared as text:
 *   - in the worker's lane, on the worker's own content (one heap, nothing cloned: today's page);
 *   - in the page's lane, on the adopted clone.
 * Each twice: with the pool deferred, as `App.tsx` defers it (what the first paint shows, «בודק…» included), and with the
 * pool complete. A memo that depended on an identity the clone broke, a side table left behind, or a lazy the page turned
 * out to read would show here as a different row.
 *
 * `SETTLE_READS=all` compares every saved sequence (2 238 readings, about five minutes); the suite compares a sample.
 *
 * test-budget: eleven saved sequences, four full readings of the page per accepted line.
 */
import { describe, expect, it } from 'vitest';
import { doSubmit, newSession, settledState, type Hosts, type State } from './work-meter/driverAnalytic';
import { derive } from '../engine/derive';
import { activePins } from '../app/active';
import { configurationPool, drawnSampleOf, knownCurve, settled, type Seed } from '../engine/evaluate';
import { locusChips } from '../app/locusChip';
import { shapeWarningsOf } from '../app/shapeWarnings';
import { coincidencesOf } from '../app/coincidences';
import { circleNotesOf, conicChips, conicMarksOf, isCircleShaped, markAnchors } from '../app/conicMarks';
import { unstatedChoices } from '../engine/unstatedChoices';
import { drawnBox as composeDrawnBox } from '../app/drawnBox';
import { INITIAL_VIEW, viewBox } from '../render/view';
import { buildScene } from '../render/scene';
import { offersOf } from '../engine/crossings';
import { panelKnowledge, segmentKnowledge, paramRows, sideEquationText } from '../app/panelRows';
import { pointText } from '../app/pointText';
import { reportedDof } from '../engine/carriers';
import { narrowingNotesOf } from '../app/narrowing';
import { askSettled } from '../app/ask';
import { fmtAnalytic } from '../format';
import { ALL_SHOWN } from '../render/canvasDisplay';
import { inWorkerLane } from '../../shell/workMeter';
import { handOver, heapSequences } from './settle-heaps';

const text = (v: unknown): string =>
  JSON.stringify(v, (_k, x) => (x instanceof Map ? { map: [...x] } : x instanceof Set ? { set: [...x] } : typeof x === 'number' && !Number.isFinite(x) ? String(x) : x));

/** Everything the page reads off a derivation, as text; `deferred` is the first paint, otherwise the settled figure. */
function reading(lines: readonly string[], seed: Seed, hosts: Hosts, deferred: boolean): string {
  const d = derive(lines, seed, {}, activePins(hosts, lines.length, []));
  const pool = configurationPool(d.construction);
  if (deferred) pool.defer();
  else pool.fill();
  const coincidences = coincidencesOf(d);
  const roleMarks = conicMarksOf(d, {}, () => false);
  const box = composeDrawnBox(d.figure, d.box, [], markAnchors(roleMarks));
  const zoomed = viewBox(box, INITIAL_VIEW, { width: 720, height: 720 });
  const knows = panelKnowledge(d);
  const chips = locusChips(d);
  return text({
    figure: d.figure,
    sample: drawnSampleOf(d.figure),
    box: d.box,
    configuration: d.configuration,
    faults: d.faults,
    outcomes: d.outcomes,
    minted: d.minted,
    created: d.created,
    hosts: d.hosts,
    notices: d.notices,
    stated: d.stated,
    objects: d.construction.objects,
    chips,
    answers: chips.map((c) => askSettled(d, c.sentence, fmtAnalytic, undefined, 'chip')),
    warnings: shapeWarningsOf(lines, d),
    coincidences,
    roleMarks,
    conics: conicChips(d, {}),
    unstated: unstatedChoices(d),
    scene: buildScene(d.figure, zoomed, 720, 720, {
      curveKnown: (id: string) => knownCurve(d.construction, id) !== null,
      sideEquationText: (id: string) => sideEquationText(d, id),
      marks: [],
      loci: [],
      crossings: offersOf(d.figure, d.construction),
      segStyle: {},
      curveStyle: {},
      stated: d.stated,
      roleMarks,
      circleShaped: (id: string) => isCircleShaped(d.construction, id),
      display: ALL_SHOWN,
      coincidences,
    } as never),
    dof: reportedDof(d.construction, d.figure.carrierDof),
    knows,
    segs: segmentKnowledge(d),
    params: paramRows(d, knows, fmtAnalytic, { checking: '…', unused: 'u' }),
    points: knows.points.map((p) => settled(() => pointText(d, p.id, p.x as never, p.y as never, fmtAnalytic))),
    narrowing: narrowingNotesOf(lines, d),
    circleNotes: circleNotesOf(lines, d, (ls) => derive(ls, seed, {})),
    pending: pool.pendingShown,
    read: pool.ready(),
  });
}

describe('#2890 — an adopted result reads exactly as the worker\'s own content does', () => {
  const sequences = heapSequences(process.env.SETTLE_READS === 'all');
  /** Readings compared so far, over the whole run: a sequence whose every line is refused has none of its own. */
  let compared = 0;
  for (const s of sequences) {
    it(s.id, () => {
      inWorkerLane(() => newSession());
      let st: State = inWorkerLane(() => settledState([], 0, {}));
      const differ: string[] = [];
      s.lines.forEach((line, k) => {
        const { value: r, loss } = handOver(() => {
          const out = doSubmit(st, line);
          // what the page's ask lane would read next is settled with the figure
          if (out.next) reading(out.next.lines, out.next.seed, out.next.hosts, false);
          return out;
        });
        expect(loss, `${s.id} submit#${k + 1}`).toEqual([]);
        if (!r.next) return;
        st = r.next;
        for (const deferred of [true, false]) {
          const mine = reading(st.lines, st.seed, st.hosts, deferred);
          const theirs = inWorkerLane(() => reading(st.lines, st.seed, st.hosts, deferred));
          compared += 1;
          if (mine !== theirs) differ.push(`submit#${k + 1} ${deferred ? 'at the first paint' : 'settled'}`);
        }
      });
      expect(differ, `${s.id}: readings that differ between the worker's content and the adopted clone`).toEqual([]);
    }, 900_000);
  }

  it('the comparison is not vacuous: two readings per accepted line were compared', () => {
    console.log(`settle-reads: ${compared} readings compared over ${sequences.length} sequences`);
    expect(compared).toBeGreaterThan(sequences.length);
  });
});
