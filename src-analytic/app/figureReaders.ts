/**
 * EVERYTHING THE PAGE READS OFF A FIGURE THAT CAN SOLVE, written once (#2890, [ADR-AG-478](../../docs/06c-decisions-analytic.md#adr-ag-478);
 * ADR-W-210 phase 3).
 *
 * The page may not solve. So the heap that solves (the worker, `app/opsAn.ts`) runs these readers on a figure before
 * it hands the figure over, and the page then runs the same readers on the adopted content and finds every answer
 * already there. They have to be the SAME calls with the same arguments, or the page misses a memo and solves: this is
 * the one list, read by the worker's operations and by the work meter's driver. `App.tsx` calls each of them from its
 * own memos and effects, with the arguments listed here.
 *
 * Two stages, because the figure comes first (operator ruling, 2026-11-14, #2890 question 1: *"Figure first"*):
 * - {@link readFigure} with the pool HELD (`configurationPool(c).hold()`): what the figure's paint needs. Every
 *   knowledge gate answers pending without evaluating; what is solved here is the figure's own decoration (the locus
 *   chips' ranks, the trapezoid warning's prefixes).
 * - {@link readFigure} again with the pool complete, then {@link readAfterPaint}: the values, the notes, the answers.
 *
 * No store, no React: a worker imports this (`__tests__/off-page-graph.test.ts`).
 */
import { derive, type Derivation } from '../engine/derive';
import { knownCurve, settled, type Seed } from '../engine/evaluate';
import { locusChips } from './locusChip';
import { shapeWarningsOf } from './shapeWarnings';
import { coincidencesOf } from './coincidences';
import { circleNotesOf, conicChips, conicMarksOf, isCircleShaped } from './conicMarks';
import { unstatedChoices } from '../engine/unstatedChoices';
import { offersOf, pointAt } from '../engine/crossings';
import { panelKnowledge, segmentKnowledge, paramRows, sideEquationText, openCurveText } from './panelRows';
import { pointText } from './pointText';
import { curveParts } from './curveText';
import { reportedDof } from '../engine/carriers';
import { narrowingNotesOf } from './narrowing';
import { askSettled } from './ask';
import { fmtAnalytic } from '../format';
import type { AnnotationMap } from './annotations';
import type { AskedQuestion } from '../store/useAnalyticStore';

/** What the page's readers are asked with besides the figure: the questions asked, the conic chips' state. */
export interface ReaderInputs {
  asks: readonly Pick<AskedQuestion, 'sentence' | 'via'>[];
  annotations: AnnotationMap;
}
export const NO_READER_INPUTS: ReaderInputs = { asks: [], annotations: {} };

/**
 * The render's readers: the locus chips, the trapezoid warning, the coincidences, the conic marks and chips, the
 * unstated-choice notes, every scene reader, the freedom count, the whole data panel and the ask lane.
 */
export function readFigure(d: Derivation, active: readonly string[], inputs: ReaderInputs = NO_READER_INPUTS): void {
  locusChips(d);
  shapeWarningsOf(active, d);
  coincidencesOf(d);
  conicMarksOf(d, inputs.annotations, () => false);
  conicChips(d, inputs.annotations);
  unstatedChoices(d);
  for (const q of inputs.asks) askSettled(d, q.sentence, fmtAnalytic, undefined, q.via);
  // the scene's readers (`render/scene.ts` asks them per curve and per segment of the figure)
  offersOf(d.figure, d.construction);
  for (const c of d.figure.curves) {
    knownCurve(d.construction, c.id);
    isCircleShaped(d.construction, c.id);
  }
  for (const s of d.figure.segments) sideEquationText(d, s.id);
  reportedDof(d.construction, d.figure.carrierDof);
  // the data panel
  const knows = panelKnowledge(d);
  segmentKnowledge(d);
  paramRows(d, knows, fmtAnalytic, { checking: '…', unused: 'u' });
  for (const p of knows.points) settled(() => pointText(d, p.id, p.x as never, p.y as never, fmtAnalytic));
  for (const cu of knows.curves) {
    const nameAt = (x: number, y: number) => pointAt(d.figure, x, y);
    if (cu.known) curveParts(cu.known as never, nameAt, { vertical: 'v' });
    else if (cu.options) for (const o of cu.options) curveParts(o as never, nameAt, { vertical: 'v' });
    else openCurveText(d.construction, cu.id, cu.symbolic);
  }
}

/** The two notes the page computes after its paint: the narrowing note and the ellipse-is-a-circle note. */
export function readAfterPaint(d: Derivation, active: readonly string[], seed: Seed, seedNames: Readonly<Record<string, string>>): void {
  narrowingNotesOf(active, d);
  circleNotesOf(active, d, (ls) => derive(ls, seed, seedNames));
}
