/**
 * #2890 ([ADR-AG-478](../../docs/06c-decisions-analytic.md#adr-ag-478)) — EVERYTHING THE PAGE READS OFF A FIGURE, as text:
 * what `settle-reads.test.ts` compares between the worker's own heap and the page's adopted copy. A module of its own so
 * that the worker's heap (a second module instance) can import it too.
 */
import type { Hosts } from './work-meter/driverAnalytic';
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

export const text = (v: unknown): string =>
  JSON.stringify(v, (_k, x) => (x instanceof Map ? { map: [...x] } : x instanceof Set ? { set: [...x] } : typeof x === 'number' && !Number.isFinite(x) ? String(x) : x));

/** Everything the page reads off a derivation, as text: at stage `held` (the figure first) or `values`. */
export function reading(lines: readonly string[], seed: Seed, hosts: Hosts, stage: 'held' | 'values'): string {
  const d = derive(lines, seed, {}, activePins(hosts, lines.length, []));
  const pool = configurationPool(d.construction);
  if (stage === 'held') pool.hold();
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
    answers: stage === 'held' ? [] : chips.map((c) => askSettled(d, c.sentence, fmtAnalytic, undefined, 'chip')),
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
    narrowing: stage === 'held' ? [] : narrowingNotesOf(lines, d),
    circleNotes: stage === 'held' ? [] : circleNotesOf(lines, d, (ls) => derive(ls, seed, {})),
    pending: pool.pendingShown,
    read: pool.ready(),
  });
}

