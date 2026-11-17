/**
 * #2890 round 2 ([ADR-3D-493](../../docs/06b-decisions-3d.md#adr-3d-493); ADR-W-210 phase 3) — WHAT THE PAGE READS OF A
 * FIGURE, in two parts. One list, read by the worker after an action (so that what the page will read is solved and
 * journaled) and named here for every page-side reader to follow.
 *
 * - **The figure**: what is drawn with it at once. The derive (statuses, notices, positions), the DOF line
 *   (`freeDofCount3`: the pivot's lazy values), and the crossing dots (`openCrossings3`: a coordinate letter's other
 *   configurations). The chips, the scene and the canvas labels solve nothing beyond these.
 * - **The values**: what the data panel shows, and the answer to every saved question. They are read only when the
 *   panel is open, as App3 reads them; they follow the figure (operator, 2026-11-14, #2890).
 *
 * A reader App3 adds that reaches the solver belongs here, or the page solves it: the work-meter gate, which walks
 * the page and the worker as two heaps, fails on the first fixture where it does.
 */
import { useGeo3, derive3 } from '../store/store3';
import { freeDofCount3 } from '../engine/evaluate';
import { openCrossings3 } from '../engine/crossings3';
import { dataView } from '../engine/dataView';
import { answerQuery } from '../engine/queries';

/** The figure's readers, for the store's figure. */
export function readFigure3(): void {
  const { facts, seed } = useGeo3.getState();
  const d = derive3(facts, seed);
  freeDofCount3(d.construction, d.resolved);
  openCrossings3(d.construction, d.resolved);
}

/** The values' readers, for the store's figure: the data panel and every saved question, when the panel is open. */
export function readValues3(panel: boolean): void {
  if (!panel) return;
  const { facts, seed, queries } = useGeo3.getState();
  const d = derive3(facts, seed);
  dataView(d.construction, seed);
  for (const q of queries) answerQuery(d.construction, q, seed);
}
